import { nasRepository } from "../radius/repositories/NasRepository";
import { vpnNasProvisioningService } from "./VpnNasProvisioningService";
import { vpnRuntimeGateway } from "./VpnRuntimeGateway";
import {
  protocolFromNasConnectionType,
  vpnIdentityRepository,
  type VpnProtocol,
} from "./repositories/VpnIdentityRepository";
import { vpnLiveSessionRepository } from "./repositories/VpnLiveSessionRepository";
import { vpnSessionLifecycleRepository } from "./repositories/VpnSessionLifecycleRepository";
import { Logger } from "../../core/Logger";
import * as sshVpn from "../../services/sshVpnService";

export class VpnSessionSyncService {
  private async ensureIdentity(nasId: number, allowRevokedOverwrite = false) {
    const nas = await nasRepository.findById(nasId);
    if (!nas) throw new Error("NAS غير موجود");
    const protocol = protocolFromNasConnectionType(nas.connectionType);
    if (!protocol || !nas.vpnUsername || !nas.ownerId) throw new Error("هذا الجهاز لا يملك هوية VPN V2 صالحة");
    const existing = await vpnIdentityRepository.findByNasId(nasId);
    if (existing?.provisioningStatus === "revoked" && !allowRevokedOverwrite) return existing;
    return vpnIdentityRepository.upsertFromNas({
      nasId: nas.id,
      ownerId: nas.ownerId,
      vpnUsername: nas.vpnUsername,
      protocol,
      allocatedIp: nas.vpnTunnelIp,
      provisioningStatus: nas.provisioningStatus === "ready" ? "ready" : nas.provisioningStatus === "error" ? "error" : "pending",
      lastError: nas.provisioningError,
    });
  }

  /** مزامنة حالة VPS في المصدر V2. لا يحذف جلسات محلية عندما يكون VPS غير متاح. */
  async synchronize(ownerId: number | null = null) {
    let views = await vpnIdentityRepository.listViews(ownerId);
    for (const view of views) {
      if (!view.identityId && view.nasVpnUsername && view.ownerId) await this.ensureIdentity(view.nasId);
    }
    views = await vpnIdentityRepository.listViews(ownerId);
    const runtime = await vpnRuntimeGateway.listLiveSessions();
    if (!runtime.success) return { runtimeAvailable: false, error: runtime.error, views };

    const runtimeByUsername = new Map(runtime.sessions.map((session) => [session.username.toLowerCase(), session]));
    for (const view of views) {
      if (!view.identityId || !view.vpnUsername || !view.protocol) continue;
      const session = runtimeByUsername.get(view.vpnUsername.toLowerCase());
      if (session) {
        await vpnLiveSessionRepository.upsert({
          vpnIdentityId: view.identityId,
          nasId: view.nasId,
          ownerId: view.ownerId!,
          protocol: view.protocol as VpnProtocol,
          providerSessionId: session.providerSessionId,
          assignedIp: session.assignedIp,
          interfaceName: session.interfaceName,
          connectedAt: session.connectedAt,
          lastSeenAt: session.lastSeenAt,
          bytesIn: session.bytesIn,
          bytesOut: session.bytesOut,
        });
        await vpnSessionLifecycleRepository.openOrRefresh({
          vpnIdentityId: view.identityId,
          nasId: view.nasId,
          ownerId: view.ownerId!,
          protocol: view.protocol as VpnProtocol,
          providerSessionId: session.providerSessionId,
          assignedIp: session.assignedIp,
          connectedAt: session.connectedAt,
          lastSeenAt: session.lastSeenAt,
          bytesIn: session.bytesIn,
          bytesOut: session.bytesOut,
        });
      } else if (view.liveSessionId) {
        await vpnSessionLifecycleRepository.closeOpenForIdentity(view.identityId, "unknown");
        await vpnLiveSessionRepository.deleteByNasId(view.nasId);
      }
    }
    return { runtimeAvailable: true, views: await vpnIdentityRepository.listViews(ownerId) };
  }

  async provision(nasId: number) {
    const identity = await this.ensureIdentity(nasId, true);
    const result = await vpnNasProvisioningService.provisionNas(nasId);
    await vpnIdentityRepository.upsertFromNas({
      nasId,
      ownerId: identity.ownerId,
      vpnUsername: identity.vpnUsername,
      protocol: identity.protocol,
      allocatedIp: result.allocatedIp ?? identity.allocatedIp,
      provisioningStatus: result.success ? "ready" : "error",
      lastError: result.error ?? null,
    });
    return result;
  }

  /** يعطّل الهوية فعلياً عند مزود VPN ثم يغلق أي جلسة حية محلياً. */
  async disable(nasId: number) {
    const identity = await this.ensureIdentity(nasId);
    if (identity.provisioningStatus === "revoked") return { success: true, alreadyDisabled: true };

    const disconnectResult = await vpnRuntimeGateway.disconnect(identity.vpnUsername, identity.protocol);
    const providerResult = await sshVpn.deleteVpnUser(identity.vpnUsername);
    if (!providerResult.success) throw new Error(providerResult.error || "فشل تعطيل هوية VPN عند المزود");

    await vpnSessionLifecycleRepository.closeOpenForIdentity(identity.id, "disabled");
    await vpnLiveSessionRepository.deleteByNasId(nasId);
    await vpnIdentityRepository.markRevoked(nasId);
    Logger.info(`VPN V2: disabled identity for NAS ${nasId}`, {
      context: "VpnSessionSyncService",
      data: { nasId, username: identity.vpnUsername, disconnectSucceeded: disconnectResult.success },
    });
    return { success: true, disconnected: disconnectResult.success };
  }

  /** يعيد إنشاء هوية المزود من بيانات NAS المحفوظة ويعيد السماح بالاتصال. */
  async enable(nasId: number) {
    const identity = await this.ensureIdentity(nasId);
    if (identity.provisioningStatus !== "revoked") return { success: true, alreadyEnabled: true };
    const result = await this.provision(nasId);
    if (!result.success) throw new Error(result.error || "فشل تفعيل هوية VPN");
    Logger.info(`VPN V2: enabled identity for NAS ${nasId}`, { context: "VpnSessionSyncService" });
    return { success: true };
  }

  async disconnect(nasId: number) {
    const identity = await this.ensureIdentity(nasId);
    const result = await vpnRuntimeGateway.disconnect(identity.vpnUsername, identity.protocol);
    if (!result.success) throw new Error(result.error || "فشل فصل جلسة VPN");
    await vpnSessionLifecycleRepository.closeOpenForIdentity(identity.id, "manual");
    await vpnLiveSessionRepository.deleteByNasId(nasId);
    Logger.info(`VPN V2: manually disconnected NAS ${nasId}`, { context: "VpnSessionSyncService" });
    return { success: true };
  }
}

export const vpnSessionSyncService = new VpnSessionSyncService();
