import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { vpnLiveSessions } from "../../../../drizzle/schema";
import type { VpnProtocol } from "./VpnIdentityRepository";

export class VpnLiveSessionRepository {
  async findByNasId(nasId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select().from(vpnLiveSessions).where(eq(vpnLiveSessions.nasId, nasId)).limit(1);
    return rows[0] ?? null;
  }

  async upsert(input: {
    vpnIdentityId: number;
    nasId: number;
    ownerId: number;
    protocol: VpnProtocol;
    providerSessionId?: string | null;
    assignedIp?: string | null;
    interfaceName?: string | null;
    connectedAt: Date;
    lastSeenAt: Date;
    bytesIn?: number;
    bytesOut?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const existing = await this.findByNasId(input.nasId);
    const values = {
      vpnIdentityId: input.vpnIdentityId,
      ownerId: input.ownerId,
      protocol: input.protocol,
      providerSessionId: input.providerSessionId ?? null,
      assignedIp: input.assignedIp ?? null,
      interfaceName: input.interfaceName ?? null,
      connectedAt: input.connectedAt,
      lastSeenAt: input.lastSeenAt,
      bytesIn: input.bytesIn ?? 0,
      bytesOut: input.bytesOut ?? 0,
    };
    if (existing) {
      await db.update(vpnLiveSessions).set(values).where(eq(vpnLiveSessions.id, existing.id));
      return { ...existing, ...values };
    }
    const [created] = await db.insert(vpnLiveSessions).values({ nasId: input.nasId, ...values }).$returningId();
    return { id: created.id, nasId: input.nasId, ...values };
  }

  async deleteByNasId(nasId: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(vpnLiveSessions).where(eq(vpnLiveSessions.nasId, nasId));
  }
}

export const vpnLiveSessionRepository = new VpnLiveSessionRepository();
