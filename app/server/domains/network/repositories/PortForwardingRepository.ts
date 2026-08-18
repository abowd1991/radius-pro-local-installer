import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { nasDevices, networkRouters, portForwardingQuotas, portForwardings, vpnConnections } from "../../../../drizzle/schema";
import { EXTERNAL_PORT_RANGE, INGRESS_PORT_RANGE } from "../PortForwardingPolicy";
import { DEFAULT_PORT_FORWARDING_QUOTA, assertPortForwardingQuotaAvailable, assertQuotaCanBeReduced, remainingPortForwardingQuota } from "../PortForwardingQuotaPolicy";

export type OwnedForwardTarget = {
  routerId: number;
  routerName: string;
  targetIp: string;
  nasId: number;
  nasName: string;
  nasConnectionType: string | null;
  lanCidr: string | null;
  vpnUsername: string | null;
  vpnIp: string | null;
  vpnStatus: string | null;
};

export class PortForwardingRepository {
  async findOwnedTarget(ownerId: number, networkRouterId: number): Promise<OwnedForwardTarget | null> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select({
      routerId: networkRouters.id,
      routerName: networkRouters.name,
      targetIp: networkRouters.ipAddress,
      nasId: nasDevices.id,
      nasName: nasDevices.shortname,
      nasConnectionType: nasDevices.connectionType,
      lanCidr: nasDevices.lanCidr,
      vpnUsername: nasDevices.vpnUsername,
      allocatedIp: nasDevices.allocatedIp,
      tunnelIp: nasDevices.vpnTunnelIp,
      vpnIp: vpnConnections.localVpnIp,
      vpnStatus: vpnConnections.status,
    })
      .from(networkRouters)
      .innerJoin(nasDevices, eq(networkRouters.nasId, nasDevices.id))
      .leftJoin(vpnConnections, eq(vpnConnections.nasId, nasDevices.id))
      .where(and(eq(networkRouters.id, networkRouterId), eq(networkRouters.ownerId, ownerId), eq(nasDevices.ownerId, ownerId)))
      .limit(1);
    const target = rows[0];
    if (!target) return null;
    return {
      routerId: target.routerId,
      routerName: target.routerName,
      targetIp: target.targetIp,
      nasId: target.nasId,
      nasName: target.nasName,
      nasConnectionType: target.nasConnectionType,
      lanCidr: target.lanCidr,
      vpnUsername: target.vpnUsername,
      vpnIp: target.vpnStatus === "connected" ? (target.vpnIp || target.allocatedIp || target.tunnelIp) : null,
      vpnStatus: target.vpnStatus,
    };
  }

  async createPending(input: { ownerId: number; target: OwnedForwardTarget; label: string; targetPort: number; accessMode: "restricted" | "public"; allowedCidrs: string[]; vpnTunnelIp: string }) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.transaction(async (tx: any) => {
      await tx.insert(portForwardingQuotas).values({
        ownerId: input.ownerId,
        maxForwards: DEFAULT_PORT_FORWARDING_QUOTA,
        usedForwards: 0,
      }).onDuplicateKeyUpdate({ set: { ownerId: sql`${portForwardingQuotas.ownerId}` } });
      const quotaReservation = await tx.update(portForwardingQuotas)
        .set({ usedForwards: sql`${portForwardingQuotas.usedForwards} + 1` })
        .where(and(
          eq(portForwardingQuotas.ownerId, input.ownerId),
          sql`${portForwardingQuotas.usedForwards} < ${portForwardingQuotas.maxForwards}`,
        ));
      if (Number(quotaReservation[0]?.affectedRows ?? 0) !== 1) {
        const quota = await tx.select({ maxForwards: portForwardingQuotas.maxForwards, usedForwards: portForwardingQuotas.usedForwards })
          .from(portForwardingQuotas)
          .where(eq(portForwardingQuotas.ownerId, input.ownerId))
          .limit(1);
        assertPortForwardingQuotaAvailable(Number(quota[0]?.usedForwards ?? 0), Number(quota[0]?.maxForwards ?? DEFAULT_PORT_FORWARDING_QUOTA));
        throw new Error("تعذر حجز حصة التوجيه؛ أعد المحاولة");
      }
      const used = await tx.select({ externalPort: portForwardings.externalPort, ingressPort: portForwardings.ingressPort, nasId: portForwardings.nasId })
        .from(portForwardings)
        .where(inArray(portForwardings.status, ["pending", "active", "disabled", "error"]));
      const externalUsed = new Set<number>(used.map((row: any) => Number(row.externalPort)));
      const ingressUsed = new Set<number>(used.filter((row: any) => row.nasId === input.target.nasId).map((row: any) => Number(row.ingressPort)));
      const externalPort = this.nextAvailable(externalUsed, EXTERNAL_PORT_RANGE.start, EXTERNAL_PORT_RANGE.end);
      const ingressPort = this.nextAvailable(ingressUsed, INGRESS_PORT_RANGE.start, INGRESS_PORT_RANGE.end);
      const result = await tx.insert(portForwardings).values({
        ownerId: input.ownerId,
        nasId: input.target.nasId,
        networkRouterId: input.target.routerId,
        label: input.label,
        targetIp: input.target.targetIp,
        targetPort: input.targetPort,
        vpnTunnelIp: input.vpnTunnelIp,
        externalPort,
        ingressPort,
        accessMode: input.accessMode,
        allowedCidrs: input.allowedCidrs,
        status: "pending",
      });
      const id = Number(result[0].insertId);
      const rows = await tx.select().from(portForwardings).where(eq(portForwardings.id, id)).limit(1);
      return rows[0];
    });
  }

  async listForOwner(ownerId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.select({
      id: portForwardings.id,
      ownerId: portForwardings.ownerId,
      nasId: portForwardings.nasId,
      routerId: portForwardings.networkRouterId,
      label: portForwardings.label,
      targetIp: portForwardings.targetIp,
      targetPort: portForwardings.targetPort,
      vpnTunnelIp: portForwardings.vpnTunnelIp,
      externalPort: portForwardings.externalPort,
      ingressPort: portForwardings.ingressPort,
      protocol: portForwardings.protocol,
      accessMode: portForwardings.accessMode,
      allowedCidrs: portForwardings.allowedCidrs,
      status: portForwardings.status,
      lastError: portForwardings.lastError,
      enabledAt: portForwardings.enabledAt,
      disabledAt: portForwardings.disabledAt,
      createdAt: portForwardings.createdAt,
      nasName: nasDevices.shortname,
      routerName: networkRouters.name,
    }).from(portForwardings)
      .innerJoin(nasDevices, eq(portForwardings.nasId, nasDevices.id))
      .innerJoin(networkRouters, eq(portForwardings.networkRouterId, networkRouters.id))
      .where(eq(portForwardings.ownerId, ownerId));
  }

  async listActiveForStream(excludeId?: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select({
      id: portForwardings.id,
      externalPort: portForwardings.externalPort,
      ingressPort: portForwardings.ingressPort,
      vpnTunnelIp: portForwardings.vpnTunnelIp,
      targetIp: portForwardings.targetIp,
      targetPort: portForwardings.targetPort,
      accessMode: portForwardings.accessMode,
      allowedCidrs: portForwardings.allowedCidrs,
    }).from(portForwardings).where(eq(portForwardings.status, "active"));
    return rows
      .filter((row: any) => row.id !== excludeId)
      .map((row: any) => ({ ...row, allowedCidrs: row.allowedCidrs as string[] }));
  }

  async listActiveForReconciliation() {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select({
      id: portForwardings.id,
      nasId: portForwardings.nasId,
      externalPort: portForwardings.externalPort,
      ingressPort: portForwardings.ingressPort,
      vpnTunnelIp: portForwardings.vpnTunnelIp,
      targetIp: portForwardings.targetIp,
      targetPort: portForwardings.targetPort,
      accessMode: portForwardings.accessMode,
      allowedCidrs: portForwardings.allowedCidrs,
      lanCidr: nasDevices.lanCidr,
    }).from(portForwardings)
      .innerJoin(nasDevices, eq(portForwardings.nasId, nasDevices.id))
      .where(eq(portForwardings.status, "active"));
    return rows.map((row: any) => ({ ...row, allowedCidrs: row.allowedCidrs as string[] }));
  }

  async getOwned(ownerId: number, id: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select().from(portForwardings).where(and(eq(portForwardings.id, id), eq(portForwardings.ownerId, ownerId))).limit(1);
    return rows[0] ?? null;
  }

  async listForNas(nasId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.select().from(portForwardings).where(eq(portForwardings.nasId, nasId));
  }

  async listForRouter(ownerId: number, networkRouterId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.select().from(portForwardings)
      .where(and(eq(portForwardings.ownerId, ownerId), eq(portForwardings.networkRouterId, networkRouterId)));
  }

  async getQuota(ownerId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const quota = await db.select({ maxForwards: portForwardingQuotas.maxForwards, usedForwards: portForwardingQuotas.usedForwards })
      .from(portForwardingQuotas)
      .where(eq(portForwardingQuotas.ownerId, ownerId))
      .limit(1);
    const used = Number(quota[0]?.usedForwards ?? 0);
    const limit = Number(quota[0]?.maxForwards ?? DEFAULT_PORT_FORWARDING_QUOTA);
    return { ownerId, limit, used, remaining: remainingPortForwardingQuota(used, limit) };
  }

  async setQuota(ownerId: number, maxForwards: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    return db.transaction(async (tx: any) => {
      const usage = await tx.select({ count: sql<number>`count(*)` }).from(portForwardings).where(eq(portForwardings.ownerId, ownerId));
      const used = Number(usage[0]?.count ?? 0);
      assertQuotaCanBeReduced(used, maxForwards);
      await tx.insert(portForwardingQuotas).values({ ownerId, maxForwards, usedForwards: used })
        .onDuplicateKeyUpdate({ set: { maxForwards, usedForwards: used } });
      return { ownerId, limit: maxForwards, used, remaining: remainingPortForwardingQuota(used, maxForwards) };
    });
  }

  async getLanRouteForNas(nasId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select({ lanCidr: nasDevices.lanCidr })
      .from(nasDevices)
      .where(eq(nasDevices.id, nasId))
      .limit(1);
    return rows[0]?.lanCidr ?? null;
  }

  async hasOtherActiveForwardForNas(nasId: number, excludeId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select({ id: portForwardings.id })
      .from(portForwardings)
      .where(and(eq(portForwardings.nasId, nasId), eq(portForwardings.status, "active")));
    return rows.some((row: { id: number }) => row.id !== excludeId);
  }

  async listLanRoutesExceptNas(nasId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select({ id: nasDevices.id, lanCidr: nasDevices.lanCidr }).from(nasDevices);
    return rows.filter((row: { id: number; lanCidr: string | null }) => row.id !== nasId && Boolean(row.lanCidr));
  }

  async markActive(id: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(portForwardings).set({ status: "active", lastError: null, enabledAt: new Date(), disabledAt: null }).where(eq(portForwardings.id, id));
  }

  async markDisabled(id: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(portForwardings).set({ status: "disabled", disabledAt: new Date() }).where(eq(portForwardings.id, id));
  }

  async markError(id: number, error: string) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(portForwardings).set({ status: "error", lastError: error.slice(0, 1000) }).where(eq(portForwardings.id, id));
  }

  async updateEditable(id: number, input: { label: string; targetPort: number; accessMode: "restricted" | "public"; allowedCidrs: string[] }) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(portForwardings).set(input).where(eq(portForwardings.id, id));
  }

  async deleteOwned(ownerId: number, id: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.transaction(async (tx: any) => {
      const deleted = await tx.delete(portForwardings).where(and(eq(portForwardings.id, id), eq(portForwardings.ownerId, ownerId)));
      if (Number(deleted[0]?.affectedRows ?? 0) === 1) {
        await tx.update(portForwardingQuotas)
          .set({ usedForwards: sql`GREATEST(0, ${portForwardingQuotas.usedForwards} - 1)` })
          .where(eq(portForwardingQuotas.ownerId, ownerId));
      }
    });
  }

  async deleteForNas(nasId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.transaction(async (tx: any) => {
      const rows = await tx.select({ ownerId: portForwardings.ownerId, count: sql<number>`count(*)` })
        .from(portForwardings)
        .where(eq(portForwardings.nasId, nasId))
        .groupBy(portForwardings.ownerId);
      await tx.delete(portForwardings).where(eq(portForwardings.nasId, nasId));
      for (const row of rows) {
        await tx.update(portForwardingQuotas)
          .set({ usedForwards: sql`GREATEST(0, ${portForwardingQuotas.usedForwards} - ${Number(row.count)})` })
          .where(eq(portForwardingQuotas.ownerId, Number(row.ownerId)));
      }
    });
  }

  private nextAvailable(used: Set<number>, start: number, end: number): number {
    for (let port = start; port <= end; port += 1) if (!used.has(port)) return port;
    throw new Error(`No ports available in ${start}-${end}`);
  }
}

export const portForwardingRepository = new PortForwardingRepository();
