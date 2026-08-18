/**
 * FreeRadiusEngine — إدارة إعدادات FreeRADIUS
 * يكتب في: radcheck, radreply, radhuntgroup
 * لا يُعدِّل ملفات /etc/freeradius مباشرة
 * Radius Pro Local V2
 */

import { nasRepository } from './repositories/NasRepository';
import { voucherRepository } from '../vouchers/repositories/VoucherRepository';
import { Logger } from '../../core/Logger';
import { EventBus, Events } from '../../core/EventBus';
import type { NasDevice } from '../../../drizzle/schema';

export class FreeRadiusEngine {
  /**
   * تسجيل NAS جديد في FreeRADIUS
   * يُضيف NAS لـ Huntgroup الخاص بـ Owner (NAS Isolation)
   */
  async onNasAdded(nas: NasDevice): Promise<void> {
    if (!nas.nasname || !nas.ownerId) return;

    await nasRepository.addToHuntgroup(nas.nasname, nas.ownerId);

    await EventBus.publish(Events.NAS_PROVISIONED, {
      nasId: nas.id,
      nasIp: nas.nasname,
      ownerId: nas.ownerId,
    });

    Logger.info(`FreeRadiusEngine: NAS ${nas.nasname} registered for owner#${nas.ownerId}`, {
      context: 'FreeRadiusEngine',
    });
  }

  /**
   * إزالة NAS من FreeRADIUS
   */
  async onNasRemoved(nas: NasDevice): Promise<void> {
    if (!nas.nasname) return;
    await nasRepository.removeFromHuntgroup(nas.nasname);
    Logger.info(`FreeRadiusEngine: NAS ${nas.nasname} removed`, { context: 'FreeRadiusEngine' });
  }

  /**
   * تعيين Rate-Limit لمستخدم في radreply
   */
  async setRateLimit(username: string, downloadKbps: number, uploadKbps: number): Promise<void> {
    const rateLimit = `${uploadKbps}k/${downloadKbps}k`;
    await voucherRepository.setRadcheckAttribute(
      username,
      'Mikrotik-Rate-Limit',
      ':=',
      rateLimit
    );
    Logger.info(`FreeRadiusEngine: set rate limit for ${username}: ${rateLimit}`, {
      context: 'FreeRadiusEngine',
    });
  }

  /**
   * تعيين Max-All-Session لمستخدم
   */
  async setMaxSession(username: string, maxSeconds: number): Promise<void> {
    await voucherRepository.setRadcheckAttribute(
      username,
      'Max-All-Session',
      ':=',
      String(maxSeconds)
    );
  }
}

export const freeRadiusEngine = new FreeRadiusEngine();

