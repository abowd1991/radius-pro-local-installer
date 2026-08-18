/**
 * EventBus — نظام الأحداث الداخلي
 * لا Domain يستدعي Domain آخر مباشرة — كل شيء عبر Events
 * Radius Pro Local V2
 */

import { Logger } from './Logger';

// ─── تعريف جميع الأحداث ───────────────────────────────────────────────────
export const Events = {
  // Accounting
  SESSION_STARTED:        'session.started',
  SESSION_UPDATED:        'session.updated',
  SESSION_CLOSED:         'session.closed',
  SESSION_LOST_CARRIER:   'session.lost_carrier',
  USAGE_UPDATED:          'accounting.usage_updated',
  VALIDATION_MISMATCH:    'accounting.validation_mismatch',

  // Voucher
  CARD_ACTIVATED:         'card.activated',
  CARD_RENEWED:           'card.renewed',
  CARD_EXPIRED:           'card.expired',
  CARD_SUSPENDED:         'card.suspended',
  CARD_DISABLED:          'card.disabled',

  // Network
  COA_SENT:               'coa.sent',
  COA_FAILED:             'coa.failed',
  NAS_CONNECTED:          'nas.connected',
  NAS_DISCONNECTED:       'nas.disconnected',
  NAS_PROVISIONED:        'nas.provisioned',

  // Notifications
  NOTIFICATION_QUEUED:    'notification.queued',
  NOTIFICATION_SENT:      'notification.sent',
  NOTIFICATION_FAILED:    'notification.failed',

  // System
  HEALTH_CHECK_FAILED:    'system.health_check_failed',
  BACKUP_COMPLETED:       'system.backup_completed',
} as const;

export type EventName = typeof Events[keyof typeof Events];
export type EventHandler<T = unknown> = (data: T) => Promise<void> | void;

// ─── EventBus Implementation ──────────────────────────────────────────────
class EventBusService {
  private handlers = new Map<EventName, EventHandler[]>();

  subscribe<T = unknown>(event: EventName, handler: EventHandler<T>): void {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, [...existing, handler as EventHandler]);
    Logger.debug(`EventBus: subscribed to ${event}`, { context: 'EventBus' });
  }

  unsubscribe(event: EventName, handler: EventHandler): void {
    const existing = this.handlers.get(event) ?? [];
    this.handlers.set(event, existing.filter(h => h !== handler));
  }

  async publish<T = unknown>(event: EventName, data: T): Promise<void> {
    const handlers = this.handlers.get(event) ?? [];
    Logger.debug(`EventBus: publishing ${event} to ${handlers.length} handlers`, {
      context: 'EventBus',
    });

    await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler(data);
        } catch (err) {
          Logger.error(`EventBus: handler failed for ${event}`, {
            context: 'EventBus',
            error: err,
            data: { event, dataPreview: JSON.stringify(data).slice(0, 200) },
          });
        }
      })
    );
  }

  /** عدد المستمعين لحدث معين (للاختبارات) */
  listenerCount(event: EventName): number {
    return this.handlers.get(event)?.length ?? 0;
  }

  /** إزالة جميع المستمعين (للاختبارات) */
  clear(): void {
    this.handlers.clear();
  }
}

export const EventBus = new EventBusService();
