import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { allocatedVpnIps, radcheck, radreply, radusergroup } from "../../../drizzle/schema";
import { Logger } from "../../core/Logger";
import { vpnRuntimeGateway } from "./VpnRuntimeGateway";
import { vpnIdentityRepository, type VpnProtocol } from "./repositories/VpnIdentityRepository";
import { vpnLiveSessionRepository } from "./repositories/VpnLiveSessionRepository";
import { vpnSessionLifecycleRepository } from "./repositories/VpnSessionLifecycleRepository";
import * as sshVpn from "../../services/sshVpnService";

type NasVpnCleanupInput = {
  id: number;
  vpnUsername?: string | null;
  connectionType?: string | null;
  vpnTunnelIp?: string | null;
  allocatedIp?: string | null;
};

/**
 * ينفذ تنظيف هوية VPN قبل حذف NAS. لا يلمس radacct: فهو سجل تدقيق تاريخي فقط.
 * الترتيب متعمد: فصل النفق → حذف هوية المزود → حذف حالة V2 وبيانات الاعتماد.
 */
export class VpnNasDeletionService {
  async cleanupBeforeNasDelete(nas: NasVpnCleanupInput) {
    const identity = await vpnIdentityRepository.findByNasId(nas.id);
    const username = identity?.vpnUsername || nas.vpnUsername || null;
    const protocol: VpnProtocol | null = identity?.protocol
      || (nas.connectionType === "vpn_sstp" ? "sstp" : nas.connectionType === "vpn_pptp" ? "pptp" : nas.connectionType === "vpn_l2tp" ? "l2tp" : null);
    const assignedIp = identity?.allocatedIp || nas.vpnTunnelIp || nas.allocatedIp || null;

    const runtime = await vpnRuntimeGateway.listLiveSessions();
    if (runtime.success) {
      const matched = runtime.sessions.filter((session) =>
        (username && session.username.toLowerCase() === username.toLowerCase())
        || (assignedIp && session.assignedIp === assignedIp),
      );
      for (const session of matched) {
        if (session.providerSessionId) await sshVpn.disconnectSession(session.providerSessionId);
      }
    }

    if (username && protocol) await vpnRuntimeGateway.disconnect(username, protocol);
    if (username) {
      await sshVpn.disconnectUserSessions(username);
      const deletion = await sshVpn.deleteVpnUser(username);
      if (!deletion.success) {
        Logger.warn(`VPN NAS deletion: provider identity may already be absent for ${username}`, {
          context: "VpnNasDeletionService",
          data: { nasId: nas.id, error: deletion.error },
        });
      }
    }

    const db = await getDb();
    if (!db) throw new Error("DB not available");
    await vpnLiveSessionRepository.deleteByNasId(nas.id);
    await vpnSessionLifecycleRepository.deleteByNasId(nas.id);
    await vpnIdentityRepository.deleteByNasId(nas.id);
    await db.delete(allocatedVpnIps).where(eq(allocatedVpnIps.nasId, nas.id));
    if (username) {
      await db.delete(radcheck).where(eq(radcheck.username, username));
      await db.delete(radreply).where(eq(radreply.username, username));
      await db.delete(radusergroup).where(eq(radusergroup.username, username));
    }
    Logger.info(`VPN NAS cleanup complete for NAS ${nas.id}`, {
      context: "VpnNasDeletionService",
      data: { nasId: nas.id, username, assignedIp },
    });
    return { success: true, username, assignedIp };
  }
}

export const vpnNasDeletionService = new VpnNasDeletionService();
