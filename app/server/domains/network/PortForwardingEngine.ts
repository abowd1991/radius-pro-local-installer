import { portForwardingRepository } from "./repositories/PortForwardingRepository";
import { mikrotikPortForwardingService } from "../../services/mikrotikPortForwardingService";
import { portForwardingVpsService, type StreamForward } from "../../services/portForwardingVpsService";
import { resolveLiveVpnIp } from "./LiveVpnSessionResolver";
import { assertForwardTarget, cidrsOverlap, isCanonicalIpv4Cidr, isIpWithinCidr, normalizeTrustedCidrs, type PortForwardingAccessMode } from "./PortForwardingPolicy";

type CreateForwardInput = {
  networkRouterId: number;
  label: string;
  targetPort: number;
  accessMode: PortForwardingAccessMode;
  allowedCidrs: string[];
};

type UpdateForwardInput = {
  label: string;
  targetPort: number;
  accessMode: PortForwardingAccessMode;
  allowedCidrs: string[];
};

function asStreamForward(forward: { id: number; externalPort: number; vpnTunnelIp: string; ingressPort: number; targetIp: string; targetPort: number; accessMode: PortForwardingAccessMode; allowedCidrs: unknown }): StreamForward {
  return { id: forward.id, externalPort: forward.externalPort, vpnTunnelIp: forward.vpnTunnelIp, ingressPort: forward.ingressPort, targetIp: forward.targetIp, targetPort: forward.targetPort, accessMode: forward.accessMode, allowedCidrs: forward.allowedCidrs as string[] };
}

export class PortForwardingEngine {
  async list(ownerId: number) {
    return portForwardingRepository.listForOwner(ownerId);
  }

  async getQuota(ownerId: number) {
    return portForwardingRepository.getQuota(ownerId);
  }

  async setQuota(ownerId: number, maxForwards: number) {
    return portForwardingRepository.setQuota(ownerId, maxForwards);
  }

  async create(ownerId: number, input: CreateForwardInput) {
    const target = await portForwardingRepository.findOwnedTarget(ownerId, input.networkRouterId);
    if (!target) throw new Error("الجهاز غير موجود أو لا يتبع لحسابك");
    const liveVpnIp = await resolveLiveVpnIp(target.vpnUsername);
    if (!liveVpnIp) throw new Error("لا يمكن إنشاء توجيه لجهاز NAS غير متصل عبر VPN");
    const label = input.label.trim();
    if (!label || label.length > 100) throw new Error("اسم التوجيه مطلوب ويجب ألا يتجاوز 100 حرف");
    const allowedCidrs = normalizeTrustedCidrs(input.allowedCidrs, input.accessMode);
    assertForwardTarget({ targetIp: target.targetIp, targetPort: input.targetPort });
    if (!target.lanCidr || !isCanonicalIpv4Cidr(target.lanCidr) || !isIpWithinCidr(target.targetIp, target.lanCidr)) {
      throw new Error("لا يمكن إنشاء التوجيه قبل ضبط شبكة LAN موثقة للـNAS تضم عنوان الجهاز الداخلي");
    }

    const forward = await portForwardingRepository.createPending({ ...input, ownerId, target, label, allowedCidrs, vpnTunnelIp: liveVpnIp });
    try {
      await this.activateExisting(forward);
      return forward;
    } catch (error) {
      await portForwardingRepository.markError(forward.id, error instanceof Error ? error.message : "Activation failed");
      throw error;
    }
  }

  async update(ownerId: number, id: number, input: UpdateForwardInput) {
    const forward = await this.requireOwned(ownerId, id);
    const label = input.label.trim();
    if (!label || label.length > 100) throw new Error("اسم التوجيه مطلوب ويجب ألا يتجاوز 100 حرف");
    const allowedCidrs = normalizeTrustedCidrs(input.allowedCidrs, input.accessMode);
    assertForwardTarget({ targetIp: forward.targetIp, targetPort: input.targetPort, externalPort: forward.externalPort, ingressPort: forward.ingressPort });
    await this.deactivateExisting(forward, false);
    await portForwardingRepository.updateEditable(id, { label, targetPort: input.targetPort, accessMode: input.accessMode, allowedCidrs });
    const updated = await this.requireOwned(ownerId, id);
    try {
      await this.activateExisting(updated);
      return updated;
    } catch (error) {
      await portForwardingRepository.markError(id, error instanceof Error ? error.message : "Update failed");
      throw error;
    }
  }

  async disable(ownerId: number, id: number) {
    const forward = await this.requireOwned(ownerId, id);
    await this.deactivateExisting(forward, true);
    return { success: true };
  }

  async enable(ownerId: number, id: number) {
    const forward = await this.requireOwned(ownerId, id);
    const target = await portForwardingRepository.findOwnedTarget(ownerId, forward.networkRouterId);
    const liveVpnIp = await resolveLiveVpnIp(target?.vpnUsername);
    if (!liveVpnIp) throw new Error("لا يمكن التفعيل قبل اتصال NAS عبر VPN");
    if (forward.vpnTunnelIp !== liveVpnIp) {
      throw new Error("تغير عنوان VPN الخاص بـNAS؛ أنشئ توجيهاً جديداً بعد مراجعة الاتصال");
    }
    await this.activateExisting(forward);
    return { success: true };
  }

  async delete(ownerId: number, id: number) {
    const forward = await this.requireOwned(ownerId, id);
    await this.deactivateExisting(forward, false);
    await portForwardingRepository.deleteOwned(ownerId, id);
    return { success: true };
  }

  /** Router removal must use the same fail-closed path as direct forward deletion. */
  async cleanupRouter(ownerId: number, networkRouterId: number) {
    const forwards = await portForwardingRepository.listForRouter(ownerId, networkRouterId);
    for (const forward of forwards) {
      await this.deactivateExisting(forward, false);
      await portForwardingRepository.deleteOwned(ownerId, forward.id);
    }
    return { removedForwards: forwards.length };
  }

  /**
   * SSTP reconnection can remove a kernel route while the persisted forwarding
   * remains active. Reapply only the already-approved route, Nginx/UFW rule,
   * and MikroTik rule; this never creates a new forwarding record.
   */
  async reconcileActiveForwards() {
    const forwards = await portForwardingRepository.listActiveForReconciliation();
    const routedNas = new Set<number>();
    let restored = 0;
    for (const forward of forwards) {
      if (!forward.lanCidr || !isCanonicalIpv4Cidr(forward.lanCidr) || !isIpWithinCidr(forward.targetIp, forward.lanCidr)) {
        console.warn(`[PortForwarding] Skipping invalid active LAN route for forward ${forward.id}`);
        continue;
      }
      try {
        if (!routedNas.has(forward.nasId)) {
          await portForwardingVpsService.addLanRoute(forward.lanCidr, forward.vpnTunnelIp);
          routedNas.add(forward.nasId);
        }
        const vpsRouteSource = await portForwardingVpsService.getRouteSource(forward.vpnTunnelIp);
        await mikrotikPortForwardingService.applyLanFilter({
          id: forward.id,
          nasId: forward.nasId,
          vpnTunnelIp: forward.vpnTunnelIp,
          ingressPort: forward.ingressPort,
          targetIp: forward.targetIp,
          targetPort: forward.targetPort,
          vpsRouteSource,
        });
        await portForwardingVpsService.allow(asStreamForward(forward));
        restored += 1;
      } catch (error) {
        console.warn(`[PortForwarding] Reconciliation deferred for forward ${forward.id}:`, error);
      }
    }
    if (forwards.length > 0) await portForwardingVpsService.apply(forwards.map(asStreamForward));
    return { active: forwards.length, restored };
  }

  /** Fail closed before deleting a NAS: revoke ingress, direct LAN rules, and its route before removing records. */
  async cleanupNas(nasId: number) {
    const forwards = await portForwardingRepository.listForNas(nasId);
    const lanCidr = await portForwardingRepository.getLanRouteForNas(nasId);
    const tunnelIps = new Set<string>();
    for (const forward of forwards as Array<{ vpnTunnelIp: string | null }>) {
      if (forward.vpnTunnelIp) tunnelIps.add(forward.vpnTunnelIp);
    }
    for (const forward of forwards) {
      const streamForward = asStreamForward(forward);
      await portForwardingVpsService.revoke(streamForward);
      try {
        await mikrotikPortForwardingService.removeLanFilter(forward.nasId, forward.id, forward.vpnTunnelIp);
        // Clean legacy Radius Pro DNAT/filter rules carrying the same unique
        // comment as well. Manual MikroTik rules use other comments and remain untouched.
        await mikrotikPortForwardingService.remove(forward.nasId, forward.id, forward.vpnTunnelIp);
      } catch (error) {
        // A disconnected NAS is already unreachable after UFW/Nginx closure.
        // Continue deletion while retaining a clear audit trail for any remote
        // MikroTik rule that could not be reached for cleanup.
        console.warn(`[PortForwarding] LAN rule cleanup deferred for NAS ${nasId}, forward ${forward.id}:`, error);
      }
    }
    await portForwardingRepository.deleteForNas(nasId);
    await portForwardingVpsService.apply(await portForwardingRepository.listActiveForStream());
    if (lanCidr) {
      for (const vpnTunnelIp of Array.from(tunnelIps)) {
        try {
          await portForwardingVpsService.removeLanRoute(lanCidr, vpnTunnelIp);
        } catch (error) {
          console.warn(`[PortForwarding] LAN route cleanup deferred for NAS ${nasId}, tunnel ${vpnTunnelIp}:`, error);
        }
      }
    }
  }

  private async requireOwned(ownerId: number, id: number) {
    const forward = await portForwardingRepository.getOwned(ownerId, id);
    if (!forward) throw new Error("التوجيه غير موجود أو لا يتبع لحسابك");
    return forward;
  }

  private async activateExisting(forward: any) {
    const lanCidr = await portForwardingRepository.getLanRouteForNas(forward.nasId);
    if (!lanCidr || !isCanonicalIpv4Cidr(lanCidr) || !isIpWithinCidr(forward.targetIp, lanCidr)) {
      throw new Error("شبكة LAN للـNAS غير صالحة أو لا تضم الجهاز الداخلي");
    }
    const otherLanRoutes = await portForwardingRepository.listLanRoutesExceptNas(forward.nasId);
    if (otherLanRoutes.some((route: { lanCidr: string | null }) => route.lanCidr && cidrsOverlap(lanCidr, route.lanCidr))) {
      throw new Error("شبكة LAN هذه مستخدمة لدى NAS آخر؛ لا يمكن إنشاء route مباشر متعارض");
    }
    const streamForward = asStreamForward(forward);
    const vpsRouteSource = await portForwardingVpsService.getRouteSource(forward.vpnTunnelIp);
    let lanRouteApplied = false;
    let filterApplied = false;
    let configApplied = false;
    try {
      await portForwardingVpsService.addLanRoute(lanCidr, forward.vpnTunnelIp);
      lanRouteApplied = true;
      await mikrotikPortForwardingService.applyLanFilter({
        id: forward.id,
        nasId: forward.nasId,
        vpnTunnelIp: forward.vpnTunnelIp,
        ingressPort: forward.ingressPort,
        targetIp: forward.targetIp,
        targetPort: forward.targetPort,
        vpsRouteSource,
      });
      filterApplied = true;
      // The forward may already be marked active after an interrupted retry.
      // Exclude it before re-rendering so Nginx never receives duplicate
      // `listen` blocks for the same external port.
      const active = await portForwardingRepository.listActiveForStream(forward.id);
      await portForwardingVpsService.apply([...active, streamForward]);
      configApplied = true;
      await portForwardingVpsService.allow(streamForward);
      await portForwardingRepository.markActive(forward.id);
    } catch (error) {
      // A failed activation must never leave external ingress open.
      try { if (configApplied) await portForwardingVpsService.apply(await portForwardingRepository.listActiveForStream(forward.id)); } catch {}
      try { await portForwardingVpsService.revoke(streamForward); } catch {}
      try { if (filterApplied) await mikrotikPortForwardingService.removeLanFilter(forward.nasId, forward.id, forward.vpnTunnelIp); } catch {}
      try { if (lanRouteApplied && !await portForwardingRepository.hasOtherActiveForwardForNas(forward.nasId, forward.id)) await portForwardingVpsService.removeLanRoute(lanCidr, forward.vpnTunnelIp); } catch {}
      throw error;
    }
  }

  private async deactivateExisting(forward: any, markDisabled: boolean) {
    const streamForward = asStreamForward(forward);
    // Close the public ingress before touching either downstream hop.
    await portForwardingVpsService.revoke(streamForward);
    await portForwardingVpsService.apply(await portForwardingRepository.listActiveForStream(forward.id));
    // A pending/error forward never completed NAT creation. Do not block its
    // deletion on an offline NAS; public ingress is already closed above.
    if (forward.status === "active" || forward.status === "disabling") {
      await mikrotikPortForwardingService.removeLanFilter(forward.nasId, forward.id, forward.vpnTunnelIp);
      await mikrotikPortForwardingService.remove(forward.nasId, forward.id, forward.vpnTunnelIp);
    }
    if (markDisabled) await portForwardingRepository.markDisabled(forward.id);
    const lanCidr = await portForwardingRepository.getLanRouteForNas(forward.nasId);
    if (lanCidr && !await portForwardingRepository.hasOtherActiveForwardForNas(forward.nasId, forward.id)) {
      await portForwardingVpsService.removeLanRoute(lanCidr, forward.vpnTunnelIp);
    }
  }
}

export const portForwardingEngine = new PortForwardingEngine();
