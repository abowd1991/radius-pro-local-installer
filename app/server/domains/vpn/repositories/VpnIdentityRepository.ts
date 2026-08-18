import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { nasDevices, vpnIdentities, vpnLiveSessions } from "../../../../drizzle/schema";

export type VpnProtocol = "l2tp" | "pptp" | "sstp";
export type VpnProvisioningStatus = "pending" | "ready" | "error" | "revoked";

export function protocolFromNasConnectionType(connectionType: string | null): VpnProtocol | null {
  if (connectionType === "vpn_l2tp") return "l2tp";
  if (connectionType === "vpn_pptp") return "pptp";
  if (connectionType === "vpn_sstp") return "sstp";
  return null;
}

export class VpnIdentityRepository {
  /** مصدر قائمة VPN V2: NAS + الهوية الثابتة + vpn_live_sessions فقط. */
  async listViews(ownerId: number | null) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const vpnNasTypes = ["vpn_l2tp", "vpn_pptp", "vpn_sstp"] as const;
    const filters = [inArray(nasDevices.connectionType, vpnNasTypes as any)];
    if (ownerId !== null) filters.push(eq(nasDevices.ownerId, ownerId));

    return db.select({
      nasId: nasDevices.id,
      nasName: nasDevices.shortname,
      nasAddress: nasDevices.nasname,
      ownerId: nasDevices.ownerId,
      nasConnectionType: nasDevices.connectionType,
      nasVpnUsername: nasDevices.vpnUsername,
      nasTunnelIp: nasDevices.vpnTunnelIp,
      identityId: vpnIdentities.id,
      vpnUsername: vpnIdentities.vpnUsername,
      protocol: vpnIdentities.protocol,
      allocatedIp: vpnIdentities.allocatedIp,
      provisioningStatus: vpnIdentities.provisioningStatus,
      lastProvisionedAt: vpnIdentities.lastProvisionedAt,
      lastError: vpnIdentities.lastError,
      liveSessionId: vpnLiveSessions.id,
      providerSessionId: vpnLiveSessions.providerSessionId,
      assignedIp: vpnLiveSessions.assignedIp,
      interfaceName: vpnLiveSessions.interfaceName,
      connectedAt: vpnLiveSessions.connectedAt,
      lastSeenAt: vpnLiveSessions.lastSeenAt,
      bytesIn: vpnLiveSessions.bytesIn,
      bytesOut: vpnLiveSessions.bytesOut,
    })
      .from(nasDevices)
      .leftJoin(vpnIdentities, eq(vpnIdentities.nasId, nasDevices.id))
      .leftJoin(vpnLiveSessions, eq(vpnLiveSessions.nasId, nasDevices.id))
      .where(and(...filters));
  }

  async findByNasId(nasId: number) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select().from(vpnIdentities).where(eq(vpnIdentities.nasId, nasId)).limit(1);
    return rows[0] ?? null;
  }

  async upsertFromNas(input: {
    nasId: number;
    ownerId: number;
    vpnUsername: string;
    protocol: VpnProtocol;
    allocatedIp?: string | null;
    provisioningStatus: VpnProvisioningStatus;
    providerReference?: string | null;
    lastError?: string | null;
  }) {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const existing = await this.findByNasId(input.nasId);
    const values = {
      ownerId: input.ownerId,
      vpnUsername: input.vpnUsername,
      protocol: input.protocol,
      allocatedIp: input.allocatedIp ?? null,
      provisioningStatus: input.provisioningStatus,
      providerReference: input.providerReference ?? null,
      lastProvisionedAt: input.provisioningStatus === "ready" ? new Date() : null,
      lastError: input.lastError ?? null,
    };
    if (existing) {
      await db.update(vpnIdentities).set(values).where(eq(vpnIdentities.id, existing.id));
      return { ...existing, ...values };
    }
    const [created] = await db.insert(vpnIdentities).values({ nasId: input.nasId, ...values }).$returningId();
    return { id: created.id, nasId: input.nasId, ...values };
  }

  async markRevoked(nasId: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.update(vpnIdentities)
      .set({ provisioningStatus: "revoked", lastError: null })
      .where(eq(vpnIdentities.nasId, nasId));
  }

  async deleteByNasId(nasId: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await db.delete(vpnIdentities).where(eq(vpnIdentities.nasId, nasId));
  }
}

export const vpnIdentityRepository = new VpnIdentityRepository();
