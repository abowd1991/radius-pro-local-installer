/**
 * PortForwardingVpsService — requests tightly scoped configuration changes
 * from the local VPS API. Browser data never becomes a shell command and the
 * dashboard has no SSH dependency at runtime.
 */
import { ENV } from "../_core/env";

export type StreamForward = {
  id: number;
  externalPort: number;
  vpnTunnelIp: string;
  ingressPort: number;
  targetIp: string;
  targetPort: number;
  accessMode: "restricted" | "public";
  allowedCidrs: string[];
};

type VpsActionResult = { success?: boolean; error?: string };

function assertSafeStreamForward(forward: StreamForward) {
  if (!Number.isInteger(forward.id) || !Number.isInteger(forward.externalPort) || !Number.isInteger(forward.ingressPort)) {
    throw new Error("Invalid forwarding identifiers");
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(forward.vpnTunnelIp)) throw new Error("Invalid VPN target IP");
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(forward.targetIp) || !Number.isInteger(forward.targetPort) || forward.targetPort < 1 || forward.targetPort > 65535) {
    throw new Error("Invalid direct LAN target");
  }
  if (forward.accessMode === "public") {
    if (forward.allowedCidrs.length > 0) throw new Error("Public forwarding must not keep a hidden allowlist");
    return;
  }
  for (const cidr of forward.allowedCidrs) {
    if (!/^\d{1,3}(\.\d{1,3}){3}\/(\d|[12]\d|3[0-2])$/.test(cidr) || cidr === "0.0.0.0/0") {
      throw new Error("Invalid source CIDR");
    }
  }
}

function apiForward(forward: StreamForward) {
  return {
    id: forward.id,
    external_port: forward.externalPort,
    vpn_tunnel_ip: forward.vpnTunnelIp,
    ingress_port: forward.ingressPort,
    target_ip: forward.targetIp,
    target_port: forward.targetPort,
    access_mode: forward.accessMode,
    allowed_cidrs: forward.allowedCidrs,
  };
}

async function vpsAction(action: string, payload: Record<string, unknown>) {
  const response = await fetch(`${ENV.VPS_LEGACY_URL}/api/port-forwarding/vps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": ENV.VPS_LEGACY_SECRET },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json() as VpsActionResult;
  if (!response.ok || !data.success) throw new Error(data.error || "فشل تطبيق إعداد Port Forwarding على VPS");
}

export class PortForwardingVpsService {
  async apply(forwards: StreamForward[]): Promise<void> {
    forwards.forEach(assertSafeStreamForward);
    await vpsAction("stream_sync", { forwards: forwards.map(apiForward) });
  }

  async allow(forward: StreamForward): Promise<void> {
    assertSafeStreamForward(forward);
    await vpsAction("ufw_allow", { forward: apiForward(forward) });
  }

  async revoke(forward: StreamForward): Promise<void> {
    assertSafeStreamForward(forward);
    await vpsAction("ufw_revoke", { forward: apiForward(forward) });
  }

  async addLanRoute(lanCidr: string, vpnTunnelIp: string): Promise<void> {
    if (!/^\d{1,3}(\.\d{1,3}){3}\/(?:[89]|[12]\d|30)$/.test(lanCidr) || !/^\d{1,3}(\.\d{1,3}){3}$/.test(vpnTunnelIp)) {
      throw new Error("Invalid LAN route request");
    }
    await vpsAction("lan_route_add", { lan_cidr: lanCidr, vpn_tunnel_ip: vpnTunnelIp });
  }

  async removeLanRoute(lanCidr: string, vpnTunnelIp: string): Promise<void> {
    if (!/^\d{1,3}(\.\d{1,3}){3}\/(?:[89]|[12]\d|30)$/.test(lanCidr) || !/^\d{1,3}(\.\d{1,3}){3}$/.test(vpnTunnelIp)) {
      throw new Error("Invalid LAN route request");
    }
    await vpsAction("lan_route_remove", { lan_cidr: lanCidr, vpn_tunnel_ip: vpnTunnelIp });
  }

  async getRouteSource(vpnTunnelIp: string): Promise<string> {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(vpnTunnelIp)) throw new Error("Invalid VPN target IP");
    const response = await fetch(`${ENV.VPS_LEGACY_URL}/api/vpn/route-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ENV.VPS_LEGACY_SECRET },
      body: JSON.stringify({ target_ip: vpnTunnelIp }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json() as { success?: boolean; source?: string; error?: string };
    if (!response.ok || !data.success || !data.source || !/^\d{1,3}(\.\d{1,3}){3}$/.test(data.source)) {
      throw new Error(data.error || "Cannot resolve VPS route source for the NAS tunnel");
    }
    return data.source;
  }

  async probeTunnel(vpnTunnelIp: string, ingressPort: number): Promise<void> {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(vpnTunnelIp) || !Number.isInteger(ingressPort)) {
      throw new Error("Invalid tunnel probe target");
    }
    await vpsAction("tunnel_probe", { vpn_tunnel_ip: vpnTunnelIp, ingress_port: ingressPort });
  }
}

export const portForwardingVpsService = new PortForwardingVpsService();
