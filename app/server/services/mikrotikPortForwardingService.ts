import { ENV } from "../_core/env";
import { getNasInfo } from "../routers/networkMonitorHelpers";

export type MikroTikForwardRule = {
  id: number;
  nasId: number;
  vpnTunnelIp: string;
  ingressPort: number;
  targetIp: string;
  targetPort: number;
  vpsRouteSource: string;
};

type ProxyResponse = { success?: boolean; error?: string };

function commentFor(id: number) {
  return `radius-pro-pf-${id}`;
}

/** Uses the same VPS MikroTik Proxy as NAS API testing and Network Monitor. */
async function runProxyAction(
  nasId: number,
  vpnTunnelIp: string,
  action: "port_forward_nat_apply" | "port_forward_nat_remove" | "port_forward_filter_apply" | "port_forward_filter_remove" | "port_forward_lan_filter_apply" | "port_forward_lan_filter_remove",
  payload: Record<string, string | number>,
) {
  const nas = await getNasInfo(nasId);
  if (!nas?.apiEnabled || !nas.mikrotikApiUser || !nas.mikrotikApiPassword) {
    throw new Error("MikroTik API غير مفعّل لهذا NAS");
  }

  const response = await fetch(`${ENV.VPS_LEGACY_URL}/api/mikrotik/proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": ENV.VPS_LEGACY_SECRET,
    },
    body: JSON.stringify({
      host: vpnTunnelIp,
      port: nas.mikrotikApiPort || 8728,
      username: nas.mikrotikApiUser,
      password: nas.mikrotikApiPassword,
      action,
      ...payload,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await response.json() as ProxyResponse;
  if (!response.ok || !data.success) {
    throw new Error(data.error || "فشل تطبيق قاعدة NAT على MikroTik");
  }
}

export class MikroTikPortForwardingService {
  async applyLanFilter(rule: MikroTikForwardRule): Promise<void> {
    await runProxyAction(rule.nasId, rule.vpnTunnelIp, "port_forward_lan_filter_apply", {
      comment: commentFor(rule.id),
      target_ip: rule.targetIp,
      target_port: rule.targetPort,
      vps_route_source: rule.vpsRouteSource,
    });
  }

  async removeLanFilter(nasId: number, id: number, vpnTunnelIp?: string): Promise<void> {
    if (!vpnTunnelIp) return;
    await runProxyAction(nasId, vpnTunnelIp, "port_forward_lan_filter_remove", {
      comment: commentFor(id),
    });
  }

  async apply(rule: MikroTikForwardRule): Promise<void> {
    await runProxyAction(rule.nasId, rule.vpnTunnelIp, "port_forward_nat_apply", {
      comment: commentFor(rule.id),
      vpn_tunnel_ip: rule.vpnTunnelIp,
      ingress_port: rule.ingressPort,
      target_ip: rule.targetIp,
      target_port: rule.targetPort,
      vps_route_source: rule.vpsRouteSource,
    });
    try {
      await runProxyAction(rule.nasId, rule.vpnTunnelIp, "port_forward_filter_apply", {
        comment: commentFor(rule.id),
        target_ip: rule.targetIp,
        target_port: rule.targetPort,
        vps_route_source: rule.vpsRouteSource,
      });
    } catch (error) {
      await this.remove(rule.nasId, rule.id, rule.vpnTunnelIp).catch(() => undefined);
      throw error;
    }
  }

  async remove(nasId: number, id: number, vpnTunnelIp?: string): Promise<void> {
    if (!vpnTunnelIp) return;
    await runProxyAction(nasId, vpnTunnelIp, "port_forward_filter_remove", {
      comment: commentFor(id),
    });
    await runProxyAction(nasId, vpnTunnelIp, "port_forward_nat_remove", {
      comment: commentFor(id),
    });
  }
}

export const mikrotikPortForwardingService = new MikroTikPortForwardingService();
