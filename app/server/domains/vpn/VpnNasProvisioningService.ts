import { inArray } from 'drizzle-orm';
import { nasRepository } from '../radius/repositories/NasRepository';
import * as sshVpn from '../../services/sshVpnService';
import { Logger } from '../../core/Logger';
import { isManagedVpnProtocol, ManagedVpnProtocol } from './VpnNasProvisioningPolicy';
import { ownerHuntgroupRepository } from '../radius/repositories/OwnerHuntgroupRepository';

export interface StaticVpnProvisioningResult {
  success: boolean;
  nasId: number;
  protocol: ManagedVpnProtocol;
  allocatedIp?: string;
  error?: string;
}

function apiConnectionType(protocol: ManagedVpnProtocol): 'l2tp' | 'pptp' | 'sstp' {
  if (protocol === 'vpn_l2tp') return 'l2tp';
  if (protocol === 'vpn_pptp') return 'pptp';
  return 'sstp';
}

/**
 * طبقة التهيئة الوحيدة لـ NASات L2TP/PPTP/SSTP.
 * الـIP المخصص هو مصدر الحقيقة؛ الاتصال الحي للتحقق والعرض فقط.
 */
export class VpnNasProvisioningService {
  async provisionNas(nasId: number): Promise<StaticVpnProvisioningResult> {
    const nas = await nasRepository.findById(nasId);
    if (!nas) throw new Error(`NAS ${nasId} was not found`);
    if (!isManagedVpnProtocol(nas.connectionType)) {
      throw new Error(`NAS ${nasId} is not an L2TP/PPTP/SSTP NAS`);
    }
    if (!nas.vpnUsername || !nas.vpnPassword) {
      await nasRepository.markStaticProvisioningError(nasId, 'VPN username/password are required');
      return { success: false, nasId, protocol: nas.connectionType, error: 'VPN credentials are required' };
    }

    const reservation = await nasRepository.reserveProtocolStaticIp(nasId, nas.connectionType);
    try {
      const vpnResult = await sshVpn.createVpnUser(
        nas.vpnUsername,
        nas.vpnPassword,
        reservation.ip,
        apiConnectionType(nas.connectionType),
      );
      if (!vpnResult.success) {
        throw new Error(vpnResult.error || 'The VPN API rejected the static user provisioning request');
      }

      await nasRepository.activateStaticProvisioning(nasId, reservation.ip);
      await ownerHuntgroupRepository.syncOwner(nas.ownerId);
      Logger.info(`Central VPN provisioning completed for NAS ${nasId}`, {
        context: 'VpnNasProvisioningService',
        data: { nasId, protocol: nas.connectionType, allocatedIp: reservation.ip },
      });
      return { success: true, nasId, protocol: nas.connectionType, allocatedIp: reservation.ip };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown VPN provisioning failure';
      await nasRepository.markStaticProvisioningError(nasId, message);
      Logger.error(`Central VPN provisioning failed for NAS ${nasId}`, {
        context: 'VpnNasProvisioningService',
        error,
      });
      return { success: false, nasId, protocol: nas.connectionType, allocatedIp: reservation.ip, error: message };
    }
  }

  async rolloutExistingNas(): Promise<StaticVpnProvisioningResult[]> {
    const candidates = await nasRepository.findByConnectionTypes(['vpn_l2tp', 'vpn_pptp', 'vpn_sstp']);
    const results: StaticVpnProvisioningResult[] = [];
    for (const nas of candidates) {
      results.push(await this.provisionNas(nas.id));
    }
    return results;
  }
}

export const vpnNasProvisioningService = new VpnNasProvisioningService();
