import * as vpsManagementService from "../../services/vpsManagementService";
import type { VpnProtocol } from "./repositories/VpnIdentityRepository";

export interface RuntimeVpnSession {
  username: string;
  protocol: VpnProtocol;
  providerSessionId: string | null;
  assignedIp: string | null;
  interfaceName: string | null;
  connectedAt: Date;
  lastSeenAt: Date;
  bytesIn: number;
  bytesOut: number;
}

/**
 * منفذ البنية التحتية فقط: VPS يعيد الحالة وينفذ الأمر، لكنه ليس مصدر حقيقة الواجهة.
 */
export class VpnRuntimeGateway {
  async listLiveSessions(): Promise<{ success: boolean; sessions: RuntimeVpnSession[]; error?: string }> {
    const [pppResult, sstpResult] = await Promise.all([
      vpsManagementService.getVpnSessions(),
      vpsManagementService.getSstpSessions(),
    ]);
    if (!pppResult.success && !sstpResult.success) {
      return { success: false, sessions: [], error: pppResult.error || sstpResult.error || "VPN runtime unavailable" };
    }

    const now = new Date();
    const normalize = (item: any, fallbackProtocol: VpnProtocol): RuntimeVpnSession | null => {
      const username = String(item?.username || item?.user || "").trim();
      if (!username) return null;
      const connectionType = String(item?.connectionType || item?.connection_type || item?.protocol || fallbackProtocol).toLowerCase();
      const protocol: VpnProtocol = connectionType.includes("sstp") ? "sstp"
        : connectionType.includes("pptp") ? "pptp"
        : "l2tp";
      const rawConnectedAt = item?.connectedAt || item?.connected_at || item?.startTime || item?.start_time;
      const connectedAt = rawConnectedAt ? new Date(rawConnectedAt) : now;
      return {
        username,
        protocol,
        providerSessionId: item?.sessionId || item?.session_id || item?.sessionName || item?.ifname || item?.interface || null,
        assignedIp: item?.assignedIp || item?.assigned_ip || item?.localIp || item?.local_ip || item?.ip || null,
        interfaceName: item?.interface || item?.ifname || item?.sessionName || null,
        connectedAt: Number.isNaN(connectedAt.getTime()) ? now : connectedAt,
        lastSeenAt: now,
        bytesIn: Number(item?.bytesIn || item?.bytes_in || 0),
        bytesOut: Number(item?.bytesOut || item?.bytes_out || 0),
      };
    };
    const pppRows = pppResult.success ? ((pppResult.data as any)?.sessions ?? pppResult.data ?? []) : [];
    const sstpRows = sstpResult.success ? ((sstpResult.data as any)?.sessions ?? sstpResult.data ?? []) : [];
    return {
      success: true,
      sessions: [
        ...(Array.isArray(pppRows) ? pppRows.map((row) => normalize(row, "l2tp")) : []),
        ...(Array.isArray(sstpRows) ? sstpRows.map((row) => normalize(row, "sstp")) : []),
      ].filter((session): session is RuntimeVpnSession => Boolean(session)),
    };
  }

  async disconnect(username: string, protocol: VpnProtocol): Promise<{ success: boolean; error?: string }> {
    const result = protocol === "sstp"
      ? await vpsManagementService.disconnectSstpSession(username)
      : await vpsManagementService.disconnectVpnUser(username);
    return { success: result.success, error: result.error };
  }
}

export const vpnRuntimeGateway = new VpnRuntimeGateway();
