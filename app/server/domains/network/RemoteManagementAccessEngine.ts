import { resolveLiveVpnIp } from "./LiveVpnSessionResolver";
import { assertRemoteManagementTarget, normalizeRemoteManagementAccess, type RemoteManagementAccessMode, type RemoteManagementService } from "./RemoteManagementAccessPolicy";
import { remoteManagementAccessRepository, type OwnedRemoteManagementNas, type ReserveRemoteManagementInput } from "./repositories/RemoteManagementAccessRepository";

export type RequestRemoteManagementAccessInput = {
  nasId: number;
  service: RemoteManagementService;
  targetPort: number;
  accessMode: RemoteManagementAccessMode;
  allowedCidrs: string[];
  publicAcknowledged: boolean;
};

type RepositoryContract = {
  findOwnedNas(ownerId: number, nasId: number): Promise<OwnedRemoteManagementNas | null>;
  reservePending(input: ReserveRemoteManagementInput): Promise<unknown>;
  disableOwned(ownerId: number, accessId: number): Promise<unknown>;
  reenableOwned(ownerId: number, accessId: number): Promise<unknown>;
};

type LiveVpnResolver = (vpnUsername: string | null | undefined) => Promise<string | null>;

/**
 * V2 aggregate for direct management of a NAS VPN endpoint. Phase 1 persists
 * only the approved intent; it deliberately performs no VPS/network action.
 */
export class RemoteManagementAccessEngine {
  constructor(
    private readonly repository: RepositoryContract = remoteManagementAccessRepository,
    private readonly liveVpnResolver: LiveVpnResolver = resolveLiveVpnIp,
  ) {}

  async request(ownerId: number, createdBy: number, input: RequestRemoteManagementAccessInput) {
    const nas = await this.repository.findOwnedNas(ownerId, input.nasId);
    if (!nas) throw new Error("جهاز NAS غير موجود أو لا يتبع لحسابك");
    const vpnTunnelIp = await this.liveVpnResolver(nas.vpnUsername);
    if (!vpnTunnelIp) throw new Error("لا يمكن طلب وصول الإدارة قبل اتصال NAS عبر VPN");
    assertRemoteManagementTarget({ vpnTunnelIp, targetPort: input.targetPort });
    const allowedCidrs = normalizeRemoteManagementAccess(input);
    return this.repository.reservePending({
      ownerId,
      nasId: nas.id,
      createdBy,
      service: input.service,
      targetPort: input.targetPort,
      vpnTunnelIp,
      accessMode: input.accessMode,
      allowedCidrs,
    });
  }

  async disable(ownerId: number, accessId: number) {
    return this.repository.disableOwned(ownerId, accessId);
  }

  async reenable(ownerId: number, accessId: number) {
    return this.repository.reenableOwned(ownerId, accessId);
  }
}

export const remoteManagementAccessEngine = new RemoteManagementAccessEngine();
