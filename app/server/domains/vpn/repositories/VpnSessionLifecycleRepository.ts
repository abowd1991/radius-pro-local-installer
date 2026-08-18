import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../../../db";
import { vpnSessionLifecycles } from "../../../../drizzle/schema";
import type { VpnProtocol } from "./VpnIdentityRepository";

export class VpnSessionLifecycleRepository {
  async openOrRefresh(input: {
    vpnIdentityId: number;
    nasId: number;
    ownerId: number;
    protocol: VpnProtocol;
    providerSessionId?: string | null;
    assignedIp?: string | null;
    connectedAt: Date;
    lastSeenAt: Date;
    bytesIn?: number;
    bytesOut?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const open = await db.select().from(vpnSessionLifecycles)
      .where(and(eq(vpnSessionLifecycles.vpnIdentityId, input.vpnIdentityId), isNull(vpnSessionLifecycles.disconnectedAt)))
      .limit(1);
    const values = {
      providerSessionId: input.providerSessionId ?? null,
      assignedIp: input.assignedIp ?? null,
      lastSeenAt: input.lastSeenAt,
      bytesIn: input.bytesIn ?? 0,
      bytesOut: input.bytesOut ?? 0,
    };
    if (open[0]) {
      await db.update(vpnSessionLifecycles).set(values).where(eq(vpnSessionLifecycles.id, open[0].id));
      return { ...open[0], ...values };
    }
    const lifecycle = {
      id: randomUUID(),
      vpnIdentityId: input.vpnIdentityId,
      nasId: input.nasId,
      ownerId: input.ownerId,
      protocol: input.protocol,
      connectedAt: input.connectedAt,
      ...values,
    };
    await db.insert(vpnSessionLifecycles).values(lifecycle);
    return lifecycle;
  }

  async closeOpenForIdentity(vpnIdentityId: number, reason: "normal" | "manual" | "disabled" | "lost_carrier" | "reprovisioned" | "unknown", endedAt = new Date()): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(vpnSessionLifecycles)
      .set({ disconnectedAt: endedAt, closeReason: reason, lastSeenAt: endedAt })
      .where(and(eq(vpnSessionLifecycles.vpnIdentityId, vpnIdentityId), isNull(vpnSessionLifecycles.disconnectedAt)));
  }

  /** الحذف الصلب لـNAS: لا تترك دورة VPN يمكن أن تختلط بهوية جديدة. */
  async deleteByNasId(nasId: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(vpnSessionLifecycles).where(eq(vpnSessionLifecycles.nasId, nasId));
  }
}

export const vpnSessionLifecycleRepository = new VpnSessionLifecycleRepository();
