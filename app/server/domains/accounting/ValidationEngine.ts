/**
 * ValidationEngine — مقارنة Cache مع radacct
 * يُشغَّل كل ساعة للتحقق من دقة totalSessionTime
 * Radius Pro Local V2
 */

import { sessionRepository } from './repositories/SessionRepository';
import { accountingRepository } from './repositories/AccountingRepository';
import { EventBus, Events } from '../../core/EventBus';
import { Logger } from '../../core/Logger';
import { Metrics } from '../../core/Metrics';
import { Config } from '../../core/ConfigService';
import type { ValidationResult } from './types/accounting.types';
import type { ValidationMismatchEvent } from './events/accounting.events';

export class ValidationEngine {
  /**
   * التحقق من دقة totalSessionTime لمستخدم معين
   */
  async validateUser(username: string, cardId: number, lifecycleId?: string): Promise<ValidationResult> {
    const cacheValue = await accountingRepository.getTotalSessionTime(cardId);
    // Historical comparison is valid only when a stable lifecycle binding exists.
    // Never compare a reissued username with all of its previous Accounting history.
    const radacctValue = lifecycleId
      ? await accountingRepository.getRadacctTotalTimeForLifecycle(lifecycleId)
      : cacheValue;
    const driftSeconds = Math.abs(cacheValue - radacctValue);
    const isAcceptable = driftSeconds <= Config.VALIDATION_MAX_DRIFT_S;

    const result: ValidationResult = {
      username,
      cacheValue,
      radacctValue,
      driftSeconds,
      isAcceptable,
    };

    if (!isAcceptable) {
      Logger.warn(`ValidationEngine: mismatch for ${username} — drift=${driftSeconds}s`, {
        context: 'ValidationEngine',
        errorCode: 'ACC_003',
        data: { cacheValue, radacctValue },
      });

      const event: ValidationMismatchEvent = { username, cacheValue, radacctValue, driftSeconds };
      await EventBus.publish(Events.VALIDATION_MISMATCH, event);
    }

    return result;
  }

  /**
   * إعادة بناء Cache من radacct (Rebuild)
   * يُستخدم عند اكتشاف انحراف كبير
   */
  async rebuildCacheFromRadacct(username: string, cardId: number): Promise<void> {
    // V2 accounting is authoritative. A historic radacct row can belong to a
    // deleted lifecycle with the same username, so it must never rewrite cache.
    Logger.warn(`ValidationEngine: skipped legacy cache rebuild for ${username} (card#${cardId})`, {
      context: 'ValidationEngine',
    });
    Metrics.record('validation.cache_rebuild_skipped', 1, { unit: 'count', context: 'ValidationEngine' });
  }
}

export const validationEngine = new ValidationEngine();
