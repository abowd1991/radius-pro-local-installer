/**
 * SessionEngine — State Machine لدورة حياة الجلسة
 * NEW → CONNECTED → ACCOUNTING → STOPPING/LOST_CARRIER → STOPPED → ARCHIVED
 * Radius Pro Local V2
 *
 * هذا Engine لا يعرف FreeRADIUS — يستقبل Events من أي مصدر
 */

import { sessionRepository } from './repositories/SessionRepository';
import { accountingRepository } from './repositories/AccountingRepository';
import { cardLifecycleRepository } from '../vouchers/repositories/CardLifecycleRepository';
import { withTransaction } from '../../core/Transaction';
import { EventBus, Events } from '../../core/EventBus';
import { UserLock } from '../../core/UserLock';
import { Logger } from '../../core/Logger';
import { Metrics } from '../../core/Metrics';
import { AuditLog } from '../../core/AuditLog';
import { Config } from '../../core/ConfigService';
import type { SessionStopParams } from './types/accounting.types';
import type { SessionStartedEvent, SessionClosedEvent } from './events/accounting.events';
import { InsertOnlineSession, OnlineSession } from '../../../drizzle/schema';

export class SessionEngine {
  /**
   * يعيد جلسة V2 قابلة للتحكم. المعرف الوحيد المقبول هنا هو Acct-Session-Id
   * المخزّن في online_sessions.acctSessionId؛ لا يستعمل radacct أو row id.
   */
  async getActiveSessionForControl(acctSessionId: string): Promise<OnlineSession | null> {
    return sessionRepository.findControllableSession(acctSessionId);
  }

  /**
   * معالجة Accounting-Start
   * يُستدعى عند بدء جلسة جديدة
   */
  async handleStart(event: SessionStartedEvent): Promise<void> {
    await UserLock.withLock(event.username, async () => {
      const start = Date.now();
      try {
        // التحقق من عدم وجود جلسة مكررة
        const existing = await sessionRepository.findBySessionId(event.acctSessionId);
        if (existing) {
          Logger.warn(`SessionEngine: duplicate session ${event.acctSessionId}`, {
            context: 'SessionEngine',
            errorCode: 'ACC_005',
          });
          return;
        }

        // إنشاء الجلسة في online_sessions
        const sessionData: InsertOnlineSession = {
          acctSessionId: event.acctSessionId,
          acctUniqueId: event.acctUniqueId,
          username: event.username,
          nasIp: event.nasIpAddress,
          framedIpAddress: event.framedIpAddress,
          sessionTime: 0,
          inputOctets: 0,
          outputOctets: 0,
          startTime: event.startTime,
          lastUpdate: new Date(),
          cardId: event.cardId,
          lifecycleId: event.lifecycleId,
          nasId: event.nasId,
        };

        await withTransaction(async (tx) => {
          await sessionRepository.createInTransaction(tx, sessionData);
          if (event.cardId && event.lifecycleId) {
            await cardLifecycleRepository.bindSessionInTransaction(tx, {
              cardId: event.cardId,
              lifecycleId: event.lifecycleId,
              username: event.username,
            }, event.acctSessionId, event.acctUniqueId);
          }
        }, 'SessionEngine.handleStart');

        await EventBus.publish(Events.SESSION_STARTED, event);

        Metrics.record('session.start_time_ms', Date.now() - start, { context: 'SessionEngine' });
        Logger.info(`SessionEngine: session started for ${event.username}`, {
          context: 'SessionEngine',
          data: { acctSessionId: event.acctSessionId },
        });
      } catch (err) {
        Logger.error(`SessionEngine: handleStart failed`, {
          context: 'SessionEngine',
          error: err,
          data: { username: event.username },
        });
        throw err;
      }
    });
  }

  /**
   * معالجة Accounting-Interim-Update
   */
  async handleUpdate(acctSessionId: string, sessionTimeSeconds: number, inputOctets: number, outputOctets: number): Promise<void> {
    const session = await sessionRepository.findBySessionId(acctSessionId);
    await sessionRepository.update(acctSessionId, {
      sessionTime: sessionTimeSeconds,
      inputOctets,
      outputOctets,
      lastUpdate: new Date(),
    });
    if (session) {
      await EventBus.publish(Events.SESSION_UPDATED, {
        acctSessionId,
        username: session.username,
        cardId: session.cardId,
        lifecycleId: session.lifecycleId,
      });
    }
  }

  /**
   * معالجة Accounting-Stop
   * ACID Transaction: radacct + totalSessionTime + online_sessions معاً
   */
  async handleStop(params: SessionStopParams): Promise<void> {
    await UserLock.withLock(params.username, async () => {
      const start = Date.now();

      // 1. التحقق من وجود الجلسة
      const session = await sessionRepository.findBySessionId(params.acctSessionId);
      if (!session) {
        Logger.warn(`SessionEngine: session not found ${params.acctSessionId}`, {
          context: 'SessionEngine',
          errorCode: 'ACC_001',
        });
        return;
      }

      // 2. حساب الوقت الفعلي
      const effectiveCardId = session.cardId ?? params.cardId;
      const effectiveLifecycleId = session.lifecycleId ?? params.lifecycleId;
      const renewalAnchor = effectiveCardId
        ? await this.getRenewalAnchor(effectiveCardId)
        : 0;
      const effectiveDuration = Math.max(0, params.sessionTimeSeconds - renewalAnchor);

      // 3. ACID Transaction: إغلاق radacct + تحديث الوقت المتراكم + حذف online_sessions
      const closed = await withTransaction(async (tx) => {
        const didClose = await accountingRepository.closeSession(tx, {
          acctUniqueId: params.acctUniqueId,
          acctSessionId: params.acctSessionId,
          sessionTime: params.sessionTimeSeconds,
          terminateCause: params.terminateCause,
          inputOctets: params.inputOctets,
          outputOctets: params.outputOctets,
        });
        // SQL runs before accounting_bridge in FreeRADIUS. Therefore a valid
        // Stop can reach V2 after radacct is already closed; that must still
        // finalize the matching V2 session instead of leaving it Online.
        const alreadyStopped = !didClose && await accountingRepository.isSessionAlreadyStopped(tx, {
          acctUniqueId: params.acctUniqueId,
          acctSessionId: params.acctSessionId,
        });
        if (!didClose && !alreadyStopped) return false;
        // Usage is credited only to the immutable card instance that started this session.
        // A username recreated after deletion must never receive usage from this old session.
        if (effectiveCardId && effectiveLifecycleId && effectiveDuration > 0
          && await cardLifecycleRepository.isCurrentCardInstance(effectiveCardId, effectiveLifecycleId)) {
          await accountingRepository.addToTotalSessionTimeInTransaction(tx, effectiveCardId, effectiveDuration);
        }
        if (effectiveLifecycleId) {
          await cardLifecycleRepository.markSessionClosedInTransaction(tx, params.acctSessionId, params.acctUniqueId);
        }
        await sessionRepository.deleteInTransaction(tx, params.acctSessionId);
        return true;
      }, 'SessionEngine.handleStop');

      // Lost-Carrier may have committed first. Never add card usage a second time.
      if (!closed) {
        Logger.warn(`SessionEngine: session already closed ${params.acctSessionId}`, {
          context: 'SessionEngine',
          errorCode: 'ACC_006',
        });
        return;
      }

      // 4. إطلاق Event
      const closedEvent: SessionClosedEvent = {
        acctSessionId: params.acctSessionId,
        acctUniqueId: params.acctUniqueId,
        username: params.username,
        sessionTimeSeconds: effectiveDuration,
        terminateCause: params.terminateCause,
        cardId: effectiveCardId,
        lifecycleId: effectiveLifecycleId,
        closedAt: new Date(),
      };
      await EventBus.publish(Events.SESSION_CLOSED, closedEvent);

      // 5. Audit
      await AuditLog.record({
        action: 'session.closed',
        entityType: 'session',
        entityId: params.acctSessionId,
        metadata: { effectiveDuration, terminateCause: params.terminateCause },
      });

      Metrics.record('session.stop_time_ms', Date.now() - start, { context: 'SessionEngine' });
      Logger.info(`SessionEngine: session closed for ${params.username} (${effectiveDuration}s)`, {
        context: 'SessionEngine',
      });
    });
  }

  /**
   * الحصول على Renewal Anchor للكرت
   * يمنع احتساب وقت الجلسة القديمة على الكرت الجديد
   */
  private async getRenewalAnchor(cardId: number): Promise<number> {
    try {
      const db = await import('../../db').then(m => m.getDb());
      if (!db) return 0;
      const { radiusCards } = await import('../../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const result = await db.select({ anchor: radiusCards.renewalAnchorSessionTime })
        .from(radiusCards)
        .where(eq(radiusCards.id, cardId))
        .limit(1);
      return result[0]?.anchor ?? 0;
    } catch {
      return 0;
    }
  }
}

export const sessionEngine = new SessionEngine();
