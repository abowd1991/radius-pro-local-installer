import { remoteManagementVpsService, type RemoteManagementVpsAccess } from "../../services/remoteManagementVpsService";
import { remoteManagementAccessEngine } from "./RemoteManagementAccessEngine";
import { remoteManagementAccessRepository } from "./repositories/RemoteManagementAccessRepository";

function vpsSyncPayload(accesses: Array<{
  id: number;
  externalPort: number;
  vpnTunnelIp: string;
  targetPort: number;
  accessMode: "restricted" | "public";
  allowedCidrs: unknown;
}>): RemoteManagementVpsAccess[] {
  return accesses.map(({ id, externalPort, vpnTunnelIp, targetPort, accessMode, allowedCidrs }) => ({
    id,
    externalPort,
    vpnTunnelIp,
    targetPort,
    accessMode,
    allowedCidrs: allowedCidrs as string[],
  }));
}

export class RemoteManagementActivationEngine {
  async activate(ownerId: number, actorId: number, accessId: number) {
    const access = await this.requireOwned(ownerId, accessId);
    await remoteManagementAccessRepository.recordEvent(ownerId, accessId, actorId, "activation_requested");
    const previousDesired = await remoteManagementAccessRepository.listForVpsSync();
    let externalSyncApplied = false;
    try {
      await remoteManagementVpsService.sync(vpsSyncPayload([...previousDesired, access]));
      externalSyncApplied = true;
      const active = await remoteManagementAccessRepository.markActiveOwned(ownerId, accessId);
      await remoteManagementAccessRepository.recordEvent(ownerId, accessId, actorId, "activated");
      return active;
    } catch (error) {
      const message = error instanceof Error ? error.message : "فشل تفعيل Winbox V2";
      const reconciliationError = externalSyncApplied
        ? await this.restorePreviousVpsState(previousDesired)
        : undefined;
      const failureMessage = reconciliationError ? `${message} — تحذير: تعذرت مصالحة VPS (${reconciliationError})` : message;
      await remoteManagementAccessRepository.markErrorOwned(ownerId, accessId, failureMessage).catch(() => undefined);
      await remoteManagementAccessRepository.recordEvent(ownerId, accessId, actorId, "activation_failed", { message, reconciliationError }).catch(() => undefined);
      throw new Error(failureMessage);
    }
  }

  async rollback(ownerId: number, actorId: number, accessId: number) {
    await this.requireOwned(ownerId, accessId);
    await remoteManagementAccessRepository.recordEvent(ownerId, accessId, actorId, "rollback_requested");
    const previousDesired = await remoteManagementAccessRepository.listForVpsSync();
    let externalSyncApplied = false;
    try {
      const desired = previousDesired.filter((access: { id: number }) => access.id !== accessId);
      await remoteManagementVpsService.sync(vpsSyncPayload(desired));
      externalSyncApplied = true;
      const disabled = await remoteManagementAccessEngine.disable(ownerId, accessId);
      await remoteManagementAccessRepository.recordEvent(ownerId, accessId, actorId, "rollback_completed");
      return disabled;
    } catch (error) {
      const message = error instanceof Error ? error.message : "فشل تراجع Winbox V2";
      const reconciliationError = externalSyncApplied
        ? await this.restorePreviousVpsState(previousDesired)
        : undefined;
      const failureMessage = reconciliationError ? `${message} — تحذير: تعذرت مصالحة VPS (${reconciliationError})` : message;
      await remoteManagementAccessRepository.markErrorOwned(ownerId, accessId, failureMessage).catch(() => undefined);
      await remoteManagementAccessRepository.recordEvent(ownerId, accessId, actorId, "rollback_failed", { message, reconciliationError }).catch(() => undefined);
      throw new Error(failureMessage);
    }
  }

  private async restorePreviousVpsState(previousDesired: Awaited<ReturnType<typeof remoteManagementAccessRepository.listForVpsSync>>) {
    try {
      await remoteManagementVpsService.sync(vpsSyncPayload(previousDesired));
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "تعذر استعادة إعداد VPS السابق";
    }
  }

  private async requireOwned(ownerId: number, accessId: number) {
    const access = await remoteManagementAccessRepository.getOwned(ownerId, accessId);
    if (!access) throw new Error("طلب Winbox غير موجود أو لا يتبع لحسابك");
    return access;
  }
}

export const remoteManagementActivationEngine = new RemoteManagementActivationEngine();
