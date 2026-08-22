import { ENV } from "../_core/env";
import { REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE } from "../domains/network/RemoteManagementAccessPolicy";

export type RemoteManagementVpsAccess = {
  id: number;
  externalPort: number;
  vpnTunnelIp: string;
  targetPort: number;
  accessMode: "restricted" | "public";
  allowedCidrs: string[];
};

function isIpv4(value: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

function assertSafeAccess(access: RemoteManagementVpsAccess) {
  if (!Number.isInteger(access.id) || !Number.isInteger(access.targetPort) || access.targetPort < 1 || access.targetPort > 65535) {
    throw new Error("بيانات وصول الإدارة البعيدة غير صالحة");
  }
  if (!Number.isInteger(access.externalPort) || access.externalPort < REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.start || access.externalPort > REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.end) {
    throw new Error("منفذ الإدارة البعيدة خارج نطاق V2 المخصص");
  }
  if (!isIpv4(access.vpnTunnelIp)) throw new Error("عنوان VPN الخاص بـNAS غير صالح");
  if (access.accessMode !== "restricted") throw new Error("Winbox V2 يدعم الوصول المقيّد فقط");
  if (!access.allowedCidrs.length || access.allowedCidrs.some((cidr) => !/^\d{1,3}(\.\d{1,3}){3}\/(\d|[12]\d|3[0-2])$/.test(cidr) || cidr === "0.0.0.0/0")) {
    throw new Error("قائمة سماح الإدارة البعيدة غير صالحة");
  }
}

export class RemoteManagementVpsService {
  async sync(accesses: RemoteManagementVpsAccess[]): Promise<void> {
    accesses.forEach(assertSafeAccess);
    const response = await fetch(`${ENV.VPS_LEGACY_URL}/api/remote-management/v2/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ENV.VPS_LEGACY_SECRET },
      body: JSON.stringify({ accesses: accesses.map((access) => ({
        id: access.id,
        external_port: access.externalPort,
        vpn_tunnel_ip: access.vpnTunnelIp,
        target_port: access.targetPort,
        access_mode: access.accessMode,
        allowed_cidrs: access.allowedCidrs,
      })) }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
    if (!response.ok || !data.success) throw new Error(data.error || "فشل مزامنة Winbox V2 على VPS");
  }
}

export const remoteManagementVpsService = new RemoteManagementVpsService();
