import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { nasDevices, portForwardings, remoteManagementAccesses, remoteManagementAccessEvents, remoteManagementQuotas } from "../../../../drizzle/schema";
import { DEFAULT_REMOTE_MANAGEMENT_ACCESS_QUOTA, collectOccupiedRemoteManagementPorts, nextAvailableRemoteManagementPort, remoteManagementQuotaDelta, shouldReserveRemoteManagementQuota, type RemoteManagementAccessMode, type RemoteManagementService } from "../RemoteManagementAccessPolicy";

export type OwnedRemoteManagementNas = {
  id: number;
  ownerId: number;
  vpnUsername: string | null;
  allocatedIp: string | null;
  vpnTunnelIp: string | null;
};

export type ReserveRemoteManagementInput = {
  ownerId: number;
  nasId: number;
  createdBy: number;
  service: RemoteManagementService;
  targetPort: number;
  vpnTunnelIp: string;
  accessMode: RemoteManagementAccessMode;
  allowedCidrs: string[];
};

export type RemoteManagementAuditAction = "requested" | "activation_requested" | "activated" | "activation_failed" | "disable_requested" | "disabled" | "reenable_requested" | "rollback_requested" | "rollback_completed" | "rollback_failed";

export class RemoteManagementAccessRepository {
  async listOwnedNas(ownerId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.select({
      id: nasDevices.id,
      name: nasDevices.shortname,
      nasname: nasDevices.nasname,
      status: nasDevices.status,
      allocatedIp: nasDevices.allocatedIp,
      vpnTunnelIp: nasDevices.vpnTunnelIp,
      mikrotikWinboxPort: nasDevices.mikrotikWinboxPort,
    }).from(nasDevices).where(eq(nasDevices.ownerId, ownerId));
  }

  async getQuota(ownerId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.insert(remoteManagementQuotas).values({
      ownerId,
      maxAccesses: DEFAULT_REMOTE_MANAGEMENT_ACCESS_QUOTA,
      usedAccesses: 0,
    }).onDuplicateKeyUpdate({ set: { ownerId: sql`${remoteManagementQuotas.ownerId}` } });
    const [quota] = await db.select().from(remoteManagementQuotas)
      .where(eq(remoteManagementQuotas.ownerId, ownerId)).limit(1);
    return quota;
  }

  async findOwnedNas(ownerId: number, nasId: number): Promise<OwnedRemoteManagementNas | null> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select({
      id: nasDevices.id,
      ownerId: nasDevices.ownerId,
      vpnUsername: nasDevices.vpnUsername,
      allocatedIp: nasDevices.allocatedIp,
      vpnTunnelIp: nasDevices.vpnTunnelIp,
    }).from(nasDevices).where(and(eq(nasDevices.id, nasId), eq(nasDevices.ownerId, ownerId))).limit(1);
    return rows[0] ?? null;
  }

  async reservePending(input: ReserveRemoteManagementInput) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.transaction((tx: any) => this.reservePendingInTransaction(tx, input));
  }

  async reservePendingInTransaction(tx: any, input: ReserveRemoteManagementInput) {
      await tx.insert(remoteManagementQuotas).values({
        ownerId: input.ownerId,
        maxAccesses: DEFAULT_REMOTE_MANAGEMENT_ACCESS_QUOTA,
        usedAccesses: 0,
      }).onDuplicateKeyUpdate({ set: { ownerId: sql`${remoteManagementQuotas.ownerId}` } });

      const [existing] = await tx.select().from(remoteManagementAccesses)
        .where(and(eq(remoteManagementAccesses.ownerId, input.ownerId), eq(remoteManagementAccesses.nasId, input.nasId), eq(remoteManagementAccesses.service, input.service)))
        .limit(1);

      if (existing && (existing.status === "pending" || existing.status === "active")) return existing;

      if (shouldReserveRemoteManagementQuota(existing?.status)) {
        const quotaReservation = await tx.update(remoteManagementQuotas)
          .set({ usedAccesses: sql`${remoteManagementQuotas.usedAccesses} + 1` })
          .where(and(eq(remoteManagementQuotas.ownerId, input.ownerId), sql`${remoteManagementQuotas.usedAccesses} < ${remoteManagementQuotas.maxAccesses}`));
        if (Number(quotaReservation[0]?.affectedRows ?? 0) !== 1) {
          throw new Error("تم بلوغ حصة الوصول البعيد المسموح بها");
        }
      }

      if (existing) {
        await tx.update(remoteManagementAccesses).set({
          targetPort: input.targetPort,
          vpnTunnelIp: input.vpnTunnelIp,
          accessMode: input.accessMode,
          allowedCidrs: input.allowedCidrs,
          status: "pending",
          lastError: null,
          disabledAt: null,
        }).where(eq(remoteManagementAccesses.id, existing.id));
        const [updated] = await tx.select().from(remoteManagementAccesses).where(eq(remoteManagementAccesses.id, existing.id)).limit(1);
        return updated;
      }

      const [remotePorts, forwardPorts, legacyPorts] = await Promise.all([
        tx.select({ port: remoteManagementAccesses.externalPort }).from(remoteManagementAccesses).where(inArray(remoteManagementAccesses.status, ["pending", "active", "disabled", "error"])),
        tx.select({ port: portForwardings.externalPort }).from(portForwardings).where(inArray(portForwardings.status, ["pending", "active", "disabled", "error"])),
        tx.select({ port: nasDevices.winboxPort }).from(nasDevices).where(isNotNull(nasDevices.winboxPort)),
      ]);
      const usedPorts = collectOccupiedRemoteManagementPorts(remotePorts, forwardPorts, legacyPorts);
      const externalPort = nextAvailableRemoteManagementPort(usedPorts);
      const result = await tx.insert(remoteManagementAccesses).values({ ...input, externalPort, status: "pending" });
      const [created] = await tx.select().from(remoteManagementAccesses).where(eq(remoteManagementAccesses.id, Number(result[0].insertId))).limit(1);
      return created;
  }

  async listForOwner(ownerId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.select().from(remoteManagementAccesses).where(eq(remoteManagementAccesses.ownerId, ownerId));
  }

  async listForVpsSync() {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.select().from(remoteManagementAccesses)
      .where(eq(remoteManagementAccesses.status, "active"));
  }

  async getOwned(ownerId: number, accessId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const [access] = await db.select().from(remoteManagementAccesses)
      .where(and(eq(remoteManagementAccesses.id, accessId), eq(remoteManagementAccesses.ownerId, ownerId))).limit(1);
    if (!access) throw new Error("وصول الإدارة البعيدة غير موجود أو لا يتبع لحسابك");
    return access;
  }

  async recordEvent(ownerId: number, accessId: number, actorId: number, action: RemoteManagementAuditAction, details?: Record<string, unknown>) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await this.getOwned(ownerId, accessId);
    await db.insert(remoteManagementAccessEvents).values({ ownerId, accessId, actorId, action, details: details ?? null });
  }

  async listEventsForOwned(ownerId: number, accessId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await this.getOwned(ownerId, accessId);
    return db.select().from(remoteManagementAccessEvents)
      .where(and(eq(remoteManagementAccessEvents.ownerId, ownerId), eq(remoteManagementAccessEvents.accessId, accessId)))
      .orderBy(desc(remoteManagementAccessEvents.createdAt));
  }

  async markActiveOwned(ownerId: number, accessId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await this.getOwned(ownerId, accessId);
    await db.update(remoteManagementAccesses).set({ status: "active", activatedAt: new Date(), lastError: null })
      .where(and(eq(remoteManagementAccesses.id, accessId), eq(remoteManagementAccesses.ownerId, ownerId)));
    return this.getOwned(ownerId, accessId);
  }

  async markErrorOwned(ownerId: number, accessId: number, message: string) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await this.getOwned(ownerId, accessId);
    await db.update(remoteManagementAccesses).set({ status: "error", lastError: message.slice(0, 1000) })
      .where(and(eq(remoteManagementAccesses.id, accessId), eq(remoteManagementAccesses.ownerId, ownerId)));
    return this.getOwned(ownerId, accessId);
  }

  async disableOwned(ownerId: number, accessId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.transaction((tx: any) => this.disableOwnedInTransaction(tx, ownerId, accessId));
  }

  async disableOwnedInTransaction(tx: any, ownerId: number, accessId: number) {
      const [existing] = await tx.select().from(remoteManagementAccesses)
        .where(and(eq(remoteManagementAccesses.id, accessId), eq(remoteManagementAccesses.ownerId, ownerId))).limit(1);
      if (!existing) throw new Error("وصول الإدارة البعيدة غير موجود أو لا يتبع لحسابك");
      if (existing.status === "disabled") return existing;

      await tx.update(remoteManagementAccesses).set({ status: "disabled", disabledAt: new Date() })
        .where(eq(remoteManagementAccesses.id, existing.id));
      if (remoteManagementQuotaDelta(existing.status, "disabled") < 0) {
        await tx.update(remoteManagementQuotas)
          .set({ usedAccesses: sql`GREATEST(${remoteManagementQuotas.usedAccesses} - 1, 0)` })
          .where(eq(remoteManagementQuotas.ownerId, ownerId));
      }
      const [updated] = await tx.select().from(remoteManagementAccesses).where(eq(remoteManagementAccesses.id, existing.id)).limit(1);
      return updated;
  }

  async reenableOwned(ownerId: number, accessId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.transaction((tx: any) => this.reenableOwnedInTransaction(tx, ownerId, accessId));
  }

  async reenableOwnedInTransaction(tx: any, ownerId: number, accessId: number) {
      const [existing] = await tx.select().from(remoteManagementAccesses)
        .where(and(eq(remoteManagementAccesses.id, accessId), eq(remoteManagementAccesses.ownerId, ownerId))).limit(1);
      if (!existing) throw new Error("وصول الإدارة البعيدة غير موجود أو لا يتبع لحسابك");
      if (existing.status !== "disabled") return existing;

      const quotaReservation = await tx.update(remoteManagementQuotas)
        .set({ usedAccesses: sql`${remoteManagementQuotas.usedAccesses} + 1` })
        .where(and(eq(remoteManagementQuotas.ownerId, ownerId), sql`${remoteManagementQuotas.usedAccesses} < ${remoteManagementQuotas.maxAccesses}`));
      if (Number(quotaReservation[0]?.affectedRows ?? 0) !== 1) {
        throw new Error("تم بلوغ حصة الوصول البعيد المسموح بها");
      }

      await tx.update(remoteManagementAccesses).set({
        status: "pending",
        disabledAt: null,
        lastError: null,
      }).where(eq(remoteManagementAccesses.id, existing.id));
      const [updated] = await tx.select().from(remoteManagementAccesses).where(eq(remoteManagementAccesses.id, existing.id)).limit(1);
      return updated;
  }
}

export const remoteManagementAccessRepository = new RemoteManagementAccessRepository();
