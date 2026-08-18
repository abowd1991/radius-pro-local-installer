/**
 * CleanupEngine — تنظيف الجلسات المفقودة (Lost-Carrier)
 * يُشغَّل كل 60 ثانية عبر Scheduler
 * Radius Pro Local V2
 */

import { sessionRepository } from './repositories/SessionRepository';
import { accountingRepository } from './repositories/AccountingRepository';
import { withTransaction } from '../../core/Transaction';
import { EventBus, Events } from '../../core/EventBus';
import { Logger } from '../../core/Logger';
import { Metrics } from '../../core/Metrics';
import { Config } from '../../core/ConfigService';
import { staleSessionTimeoutService } from './StaleSessionTimeoutService';
import type { SessionClosedEvent } from './events/accounting.events';

/**
 * يوقف المعاملة عمداً عند وجود سباق أو سجل radacct لا يطابق الجلسة الحية.
 * رمي الخطأ ضروري حتى لا يُعمل commit لحذف online_sessions بلا إغلاق تدقيقي مقابل.
 */
class StaleCleanupAbort extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleCleanupAbort';
  }
}

export class CleanupEngine {
  /**
   * تنظيف الجلسات الـ Stale (Lost-Carrier)
   * يُشغَّل دورياً عبر Scheduler
   */
  async cleanupStaleSessions(): Promise<number> {
    const start = Date.now();
    const timeoutSeconds = await staleSessionTimeoutService.getTimeoutSeconds();
    const cutoff = new Date(Date.now() - timeoutSeconds * 1000);
    const staleSessions = await sessionRepository.findStale(timeoutSeconds);

    if (staleSessions.length === 0) {
      return 0;
    }

    Logger.info(`CleanupEngine: found ${staleSessions.length} stale sessions`, {
      context: 'CleanupEngine',
    });

    let cleaned = 0;
    for (const session of staleSessions) {
      try {
        // ACID وidempotent: claim stale + radacct + totalSessionTime في Commit واحد.
        const result = await withTransaction(async (tx) => {
          const claimed = await sessionRepository.claimStaleForCleanup(tx, session.acctSessionId, cutoff);
          if (!claimed) {
            throw new StaleCleanupAbort(`Stale session claim lost for ${session.acctSessionId}`);
          }

          const closed = await accountingRepository.closeSession(tx, {
            acctUniqueId: session.acctUniqueId,
            acctSessionId: session.acctSessionId,
            sessionTime: session.sessionTime ?? 0,
            terminateCause: 'Lost-Carrier',
          });
          if (!closed) {
            throw new StaleCleanupAbort(`Open radacct row not found for ${session.acctSessionId}`);
          }

          const renewalAnchor = session.cardId
            ? await accountingRepository.getRenewalAnchorInTransaction(tx, session.cardId)
            : 0;
          const effectiveDuration = Math.max(0, (session.sessionTime ?? 0) - renewalAnchor);
          if (session.cardId && effectiveDuration > 0) {
            await accountingRepository.addToTotalSessionTimeInTransaction(tx, session.cardId, effectiveDuration);
          }
          return { closed: true, effectiveDuration };
        }, 'CleanupEngine.cleanupStaleSessions');
        if (!result.closed) continue;

        // إطلاق Event
        const event: SessionClosedEvent = {
          acctSessionId: session.acctSessionId,
          acctUniqueId: session.acctUniqueId ?? session.acctSessionId,
          username: session.username,
          sessionTimeSeconds: result.effectiveDuration,
          terminateCause: 'Lost-Carrier',
          cardId: session.cardId ?? undefined,
          lifecycleId: session.lifecycleId ?? undefined,
          closedAt: new Date(),
        };
        await EventBus.publish(Events.SESSION_LOST_CARRIER, event);
        await EventBus.publish(Events.SESSION_CLOSED, event);

        cleaned++;
      } catch (err) {
        if (err instanceof StaleCleanupAbort) {
          Logger.warn(`CleanupEngine: stale cleanup rolled back for ${session.acctSessionId}`, {
            context: 'CleanupEngine',
            errorCode: 'ACC_004',
          });
          continue;
        }
        Logger.error(`CleanupEngine: failed to cleanup session ${session.acctSessionId}`, {
          context: 'CleanupEngine',
          error: err,
          errorCode: 'ACC_004',
        });
      }
    }

    Metrics.record('cleanup.stale_sessions_cleaned', cleaned, { unit: 'count', context: 'CleanupEngine' });
    Metrics.record('cleanup.duration_ms', Date.now() - start, { context: 'CleanupEngine' });

    Logger.info(`CleanupEngine: cleaned ${cleaned}/${staleSessions.length} stale sessions`, {
      context: 'CleanupEngine',
    });

    return cleaned;
  }

}

export const cleanupEngine = new CleanupEngine();
