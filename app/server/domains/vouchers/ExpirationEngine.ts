/**
 * ExpirationEngine — فحص انتهاء الكروت
 * يُشغَّل كل 5 دقائق عبر Scheduler
 * يعتمد على totalSessionTime + online_sessions (لا يقرأ radacct)
 * Radius Pro Local V2
 */

import { voucherRepository } from './repositories/VoucherRepository';
import { usageEngine } from '../accounting/UsageEngine';
import { voucherEngine } from './VoucherEngine';
import { EventBus, Events } from '../../core/EventBus';
import { Logger } from '../../core/Logger';
import { Metrics } from '../../core/Metrics';
import type { CardExpiryCheck } from './types/voucher.types';
import type { CardExpiredEvent } from './events/voucher.events';

export class ExpirationEngine {
  /**
   * فحص جميع الكروت النشطة وتعطيل المنتهية
   * يُشغَّل دورياً عبر Scheduler
   */
  async checkAndDisableExpiredCards(): Promise<number> {
    const start = Date.now();
    const activeCards = await voucherRepository.findActiveCards();

    if (activeCards.length === 0) return 0;

    // حساب الاستخدام لجميع الكروت دفعة واحدة
    const usageMap = await usageEngine.calculateBatchUsage(
      activeCards.map(c => ({
        username: c.username,
        cardId: c.id,
        renewalAnchor: c.renewalAnchorSessionTime ?? 0,
      }))
    );

    let disabled = 0;
    const now = new Date();

    for (const card of activeCards) {
      const totalUsed = usageMap.get(card.username) ?? 0;
      const check = this.checkExpiry(card, totalUsed, now);

      if (check.isExpired) {
        try {
          await voucherEngine.expireCard({
            cardId: card.id,
            username: card.username,
            reason: check.reason === 'time_limit' ? 'usage_exhausted' : 'validity_expired',
            totalUsedSeconds: totalUsed,
          });
          disabled++;
        } catch (err) {
          Logger.error(`ExpirationEngine: failed to disable card#${card.id}`, {
            context: 'ExpirationEngine',
            error: err,
          });
        }
      }
    }

    Metrics.record('expiration.cards_checked', activeCards.length, { unit: 'count', context: 'ExpirationEngine' });
    Metrics.record('expiration.cards_disabled', disabled, { unit: 'count', context: 'ExpirationEngine' });
    Metrics.record('expiration.check_ms', Date.now() - start, { context: 'ExpirationEngine' });

    if (disabled > 0) {
      Logger.info(`ExpirationEngine: disabled ${disabled}/${activeCards.length} expired cards`, {
        context: 'ExpirationEngine',
      });
    }

    return disabled;
  }

  private checkExpiry(
    card: { id: number; username: string; timeLimit?: number | null; expiresAt?: Date | null; windowEndTime?: Date | null; usageBudgetSeconds?: number | null },
    totalUsedSeconds: number,
    now: Date
  ): CardExpiryCheck {
    // فحص Time Limit
    if (card.timeLimit && card.timeLimit > 0) {
      if (totalUsedSeconds >= card.timeLimit) {
        return {
          cardId: card.id,
          username: card.username,
          timeLimitSeconds: card.timeLimit,
          totalUsedSeconds,
          isExpired: true,
          reason: 'time_limit',
        };
      }
    }

    // فحص usageBudgetSeconds (Time Budget) — الكرت استهلك كامل الوقت المسموح
    if (card.usageBudgetSeconds && card.usageBudgetSeconds > 0) {
      if (totalUsedSeconds >= card.usageBudgetSeconds) {
        return {
          cardId: card.id,
          username: card.username,
          timeLimitSeconds: card.usageBudgetSeconds,
          totalUsedSeconds,
          isExpired: true,
          reason: 'time_limit',
        };
      }
    }

    // فحص windowEndTime (Validity Window) — انتهت صلاحية الكرت الزمنية من بداية الاستخدام
    if (card.windowEndTime && card.windowEndTime <= now) {
      return {
        cardId: card.id,
        username: card.username,
        expiresAt: card.windowEndTime,
        totalUsedSeconds,
        isExpired: true,
        reason: 'expiry_date',
      };
    }

    // فحص Expiry Date
    if (card.expiresAt && card.expiresAt <= now) {
      return {
        cardId: card.id,
        username: card.username,
        expiresAt: card.expiresAt,
        totalUsedSeconds,
        isExpired: true,
        reason: 'expiry_date',
      };
    }

    return {
      cardId: card.id,
      username: card.username,
      totalUsedSeconds,
      isExpired: false,
    };
  }
}

export const expirationEngine = new ExpirationEngine();
