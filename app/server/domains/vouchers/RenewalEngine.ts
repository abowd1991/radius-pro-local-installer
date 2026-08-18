/**
 * RenewalEngine — تجديد الكروت
 * يحفظ renewalAnchorSessionTime لمنع احتساب وقت الكرت القديم
 * Radius Pro Local V2
 */

import { voucherRepository } from './repositories/VoucherRepository';
import { withTransaction } from '../../core/Transaction';
import { EventBus, Events } from '../../core/EventBus';
import { Logger } from '../../core/Logger';
import { Metrics } from '../../core/Metrics';
import { AuditLog } from '../../core/AuditLog';
import type { CardRenewalParams } from './types/voucher.types';
import type { CardRenewedEvent } from './events/voucher.events';
import { usageEngine } from '../accounting/UsageEngine';
import { sessionRepository } from '../accounting/repositories/SessionRepository';

export class RenewalEngine {
  /**
   * تجديد كرت
   * المنطق:
   * - حفظ وقت الجلسة الحالية كـ Anchor
   * - تصفير totalSessionTime
   * - تفعيل الكرت في radcheck
   *
   * مثال:
   * جلسة 30 دقيقة → تجديد → استمر 10 دقائق
   * المضاف للكرت الجديد = 10 دقائق فقط (لأن Anchor = 30)
   */
  async renewCard(params: CardRenewalParams): Promise<void> {
    const start = Date.now();

    const card = await voucherRepository.findById(params.cardId);
    if (!card) {
      throw new Error(`VCH-001: Card#${params.cardId} not found`);
    }

    if (card.lifecycleId !== params.lifecycleId) {
      throw new Error(`VCH-002: Card lifecycle mismatch for card#${params.cardId}`);
    }

    const usage = await usageEngine.calculateUsage(params.username, params.cardId, params.lifecycleId);
    const activeSessions = await sessionRepository.findByLifecycleId(params.lifecycleId);
    const currentSessionTimeSeconds = activeSessions.reduce(
      (maximum, session) => Math.max(maximum, Number(session.sessionTime ?? 0)),
      0,
    );
    const currentBudget = Number(card.usageBudgetSeconds ?? 0);
    const newUsageBudgetSeconds = params.additionalUsageBudgetSeconds === undefined
      ? currentBudget
      : Math.max(0, currentBudget - usage.totalUsedSeconds) + params.additionalUsageBudgetSeconds;
    const newWindowSeconds = params.newWindowSeconds ?? Number(card.windowSeconds ?? 0);

    const oldValues = {
      totalSessionTime: card.totalSessionTime,
      expiresAt: card.expiresAt,
      status: card.status,
      lifecycleId: card.lifecycleId,
    };

    // ACID Transaction: تصفير + حفظ Anchor + تفعيل radcheck
    await withTransaction(async (tx) => {
      // 1. تصفير totalSessionTime وحفظ Anchor
      await voucherRepository.resetForRenewal(tx, {
        cardId: params.cardId,
        renewalAnchorSessionTime: currentSessionTimeSeconds,
        newExpiresAt: params.newExpiresAt,
        newUsageBudgetSeconds,
        newWindowSeconds,
        resetUsage: params.resetUsage,
      });

      // 2. تفعيل في radcheck (حذف Reject)
      await voucherRepository.activateInRadcheck(tx, params.username);
      await voucherRepository.updateExpirationInRadcheckInTransaction(tx, params.username, params.newExpiresAt);
      await voucherRepository.updateSessionTimeoutInRadreplyInTransaction(tx, params.username, newUsageBudgetSeconds);
    }, 'RenewalEngine.renewCard');

    // إطلاق Event
    const event: CardRenewedEvent = {
      cardId: params.cardId,
      username: params.username,
      renewalAnchorSeconds: currentSessionTimeSeconds,
      newExpiresAt: params.newExpiresAt,
      renewedAt: new Date(),
    };
    await EventBus.publish(Events.CARD_RENEWED, event);

    await AuditLog.record({
      action: 'card.renewed',
      entityType: 'card',
      entityId: params.cardId,
      oldValue: oldValues as Record<string, unknown>,
      newValue: {
        totalSessionTime: params.resetUsage ? 0 : card.totalSessionTime,
        renewalAnchorSessionTime: params.resetUsage ? currentSessionTimeSeconds : card.renewalAnchorSessionTime,
        expiresAt: params.newExpiresAt,
        lifecycleId: params.lifecycleId,
      },
    });

    Metrics.record('voucher.renewal_ms', Date.now() - start, { context: 'RenewalEngine' });
    Logger.info(`RenewalEngine: renewed card#${params.cardId} for ${params.username} (anchor=${currentSessionTimeSeconds}s)`, {
      context: 'RenewalEngine',
    });
  }
}

export const renewalEngine = new RenewalEngine();
