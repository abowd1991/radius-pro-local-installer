import * as vpnApi from "../../services/vpnApiService";

type RawVpnSession = { username?: string; localIp?: string; local_ip?: string; source_ip?: string; assignedIp?: string };

function validIpv4(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

/** The VPN API session list is the live authority; vpn_connections is only a cache. */
export async function resolveLiveVpnIp(vpnUsername: string | null | undefined): Promise<string | null> {
  if (!vpnUsername) return null;
  const result = await vpnApi.getVpnSessions() as unknown as { success?: boolean; sessions?: RawVpnSession[] };
  if (!result.success || !Array.isArray(result.sessions)) return null;
  const session = result.sessions.find((item) => item.username?.toLowerCase() === vpnUsername.toLowerCase());
  if (!session) return null;
  const ip = session.localIp || session.local_ip || session.source_ip || session.assignedIp;
  return validIpv4(ip) ? ip : null;
}
