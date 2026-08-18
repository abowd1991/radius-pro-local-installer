/**
 * V2EventHandlers — ربط EventBus بجميع الـ Handlers
 * كل Domain يستمع للأحداث التي تخصه فقط
 * Radius Pro Local V2
 *
 * الترتيب:
 * SessionEngine → session.closed → [UsageEngine, CoAEngine, NotificationEngine]
 * VoucherEngine → card.expired  → [CoAEngine, NotificationEngine]
 * VoucherEngine → card.renewed  → [FreeRadiusEngine]
 */

import { EventBus, Events } from '../core/EventBus';
import { Logger } from '../core/Logger';
import { coaEngine } from '../domains/radius/CoAEngine';
import { invalidateCardCheckLifecycle } from '../db/cardCheckCache';
import { cardCheckRepository } from '../domains/cardCheck/CardCheckRepository';
import type { SessionClosedEvent } from '../domains/accounting/events/accounting.events';
import type { CardExpiredEvent, CardRenewedEvent } from '../domains/vouchers/events/voucher.events';

let registered = false;

export function registerV2EventHandlers(): void {
  if (registered) return;
  registered = true;

  // CardCheck يخزن بيانات دورة كرت محددة فقط. أي حدث V2 مؤثر يبطلها فوراً.
  const invalidateCardCheck = async (data: unknown) => {
    const event = data as { lifecycleId?: string | null; cardId?: number | null };
    const lifecycleId = event.lifecycleId ?? (event.cardId
      ? await cardCheckRepository.findLifecycleIdByCardId(event.cardId)
      : null);
    await invalidateCardCheckLifecycle(lifecycleId);
  };
  EventBus.subscribe(Events.SESSION_STARTED, invalidateCardCheck);
  EventBus.subscribe(Events.SESSION_UPDATED, invalidateCardCheck);
  EventBus.subscribe(Events.SESSION_CLOSED, invalidateCardCheck);
  EventBus.subscribe(Events.SESSION_LOST_CARRIER, invalidateCardCheck);
  EventBus.subscribe(Events.CARD_ACTIVATED, invalidateCardCheck);
  EventBus.subscribe(Events.CARD_RENEWED, invalidateCardCheck);
  EventBus.subscribe(Events.CARD_EXPIRED, invalidateCardCheck);
  EventBus.subscribe(Events.CARD_SUSPENDED, invalidateCardCheck);
  EventBus.subscribe(Events.CARD_DISABLED, invalidateCardCheck);

  // ── session.closed → CoA Disconnect ──────────────────────────────────────
  // عند إغلاق جلسة بسبب انتهاء الوقت أو Lost-Carrier → قطع الاتصال من NAS
  EventBus.subscribe(Events.SESSION_CLOSED, async (data: unknown) => {
    const event = data as SessionClosedEvent;
    if (event.terminateCause === 'Session-Timeout' || event.terminateCause === 'User-Request') {
      // لا نرسل CoA لأن FreeRADIUS أرسله بالفعل
      return;
    }
    if (event.nasId) {
      await coaEngine.queueDisconnect(event.username, event.nasId).catch(err => {
        Logger.error('V2EventHandlers: CoA disconnect failed after session.closed', {
          context: 'V2EventHandlers',
          error: err,
          data: { username: event.username },
        });
      });
    }
  });

  // ── card.expired → CoA Disconnect ────────────────────────────────────────
  // عند انتهاء صلاحية الكرت → قطع الاتصال فوراً
  EventBus.subscribe(Events.CARD_EXPIRED, async (data: unknown) => {
    const event = data as CardExpiredEvent;
    Logger.info(`V2EventHandlers: card#${event.cardId} expired (${event.reason}) — queuing CoA disconnect`, {
      context: 'V2EventHandlers',
    });
    // نبحث عن الجلسات النشطة لهذا المستخدم ونقطعها
    // CoAEngine سيجد الـ NAS من online_sessions
    await disconnectAllUserSessions(event.username);
  });

  // ── card.renewed → تحديث Session-Timeout في FreeRADIUS ──────────────────
  EventBus.subscribe(Events.CARD_RENEWED, async (data: unknown) => {
    const event = data as CardRenewedEvent;
    Logger.info(`V2EventHandlers: card#${event.cardId} renewed — anchor=${event.renewalAnchorSeconds}s`, {
      context: 'V2EventHandlers',
    });
    // FreeRADIUS سيقرأ القيم الجديدة من radcheck/radreply تلقائياً
    // لا حاجة لإعادة تشغيل FreeRADIUS
  });

  // ── session.lost_carrier → Log ───────────────────────────────────────────
  EventBus.subscribe(Events.SESSION_LOST_CARRIER, async (data: unknown) => {
    const event = data as SessionClosedEvent;
    Logger.info(`V2EventHandlers: Lost-Carrier for ${event.username} (${event.sessionTimeSeconds}s)`, {
      context: 'V2EventHandlers',
    });
  });

  Logger.info('V2EventHandlers: registered (session.closed, card.expired, card.renewed, session.lost_carrier)', {
    context: 'V2EventHandlers',
  });
}

/**
 * قطع جميع جلسات مستخدم
 * يُستخدم عند انتهاء صلاحية الكرت
 */
async function disconnectAllUserSessions(username: string): Promise<void> {
  try {
    const { sessionRepository } = await import('../domains/accounting/repositories/SessionRepository');
    const sessions = await sessionRepository.findByUsername(username);
    for (const session of sessions) {
      if (session.nasId) {
        await coaEngine.queueDisconnect(username, session.nasId);
      }
    }
  } catch (err) {
    Logger.error('V2EventHandlers: disconnectAllUserSessions failed', {
      context: 'V2EventHandlers',
      error: err,
      data: { username },
    });
  }
}
