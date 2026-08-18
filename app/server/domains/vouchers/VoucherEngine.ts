/**
 * VoucherEngine — إدارة دورة حياة الكروت
 * تفعيل / تعطيل / إدارة radcheck
 * Radius Pro Local V2
 *
 * لا يُعدِّل Accounting مباشرة — يُطلق Events فقط
 */

import { voucherRepository } from './repositories/VoucherRepository';
import { nasRepository } from '../radius/repositories/NasRepository';
import { withTransaction } from '../../core/Transaction';
import { EventBus, Events } from '../../core/EventBus';
import { Logger } from '../../core/Logger';
import { Metrics } from '../../core/Metrics';
import { AuditLog } from '../../core/AuditLog';
import type { CardActivationParams } from './types/voucher.types';
import type { CardDisabledEvent, CardActivatedEvent, CardExpiredEvent } from './events/voucher.events';
import { generateCardsV2, type GenerateCardsInput } from '../../db/generateCardsV2';
import { expiryReplyMessage, type VoucherExpiryReason } from './CardStatusPolicy';

export class VoucherEngine {
  /**
   * تفعيل كرت — حذف Auth-Type Reject + تحديث status
   */
  /**
   * إنشاء كروت — يستدعي generateCardsV2 كـ Infrastructure layer
   * يُضيف فوقه: Event Emission + Audit Log + Metrics
   * يحافظ على أداء Bulk Insert الأصلي (safeBatchSize + Transaction)
   */
  async generateCards(data: GenerateCardsInput): Promise<{ success: boolean; quantity: number; batchId: string; cards: any[]; planName: any; usernameLength: number; passwordLength: number }> {
    const start = Date.now();
    const result = await generateCardsV2(data);
    await EventBus.publish(Events.CARD_ACTIVATED, {
      batchId: result.batchId,
      count: result.quantity,
      ownerId: data.createdBy,
      planId: data.planId,
      generatedAt: new Date(),
    });
    await AuditLog.record({
      action: 'cards.generated',
      entityType: 'voucher',
      entityId: 0,
      metadata: { batchId: result.batchId, count: result.quantity, planId: data.planId },
    });
    Metrics.record('voucher.generate_ms', Date.now() - start, { context: 'VoucherEngine' });
    Logger.info(`VoucherEngine: generated ${result.quantity} cards (batch=${result.batchId})`, { context: 'VoucherEngine' });
    return result as any;
  }

  async activateCard(params: CardActivationParams): Promise<void> {
    const start = Date.now();

    await withTransaction(async (tx) => {
      await voucherRepository.activateInRadcheck(tx, params.username);
      await voucherRepository.clearRejectReplyInTransaction(tx, params.username);
      await voucherRepository.updateCardStatusInTransaction(tx, params.cardId, 'active');
    }, 'VoucherEngine.activateCard');

    const event: CardActivatedEvent = {
      cardId: params.cardId,
      username: params.username,
      ownerId: params.ownerId,
      activatedAt: new Date(),
    };
    await EventBus.publish(Events.CARD_ACTIVATED, event);

    await AuditLog.record({
      action: 'card.activated',
      entityType: 'card',
      entityId: params.cardId,
      metadata: { username: params.username },
    });

    Metrics.record('voucher.activate_ms', Date.now() - start, { context: 'VoucherEngine' });
    Logger.info(`VoucherEngine: activated card#${params.cardId} for ${params.username}`, {
      context: 'VoucherEngine',
    });
  }

  /**
   * تعطيل كرت — إضافة Auth-Type Reject + status = suspended
   */
  async disableCard(cardId: number, username: string, disabledBy?: string): Promise<void> {
    return this.suspendCard(cardId, username, disabledBy);
  }

  /**
   * إيقاف يدوي للكرت فقط — لا يُستخدم لانتهاء الوقت أو الصلاحية.
   */
  async suspendCard(cardId: number, username: string, disabledBy?: string): Promise<void> {
    const start = Date.now();

    await withTransaction(async (tx) => {
      await voucherRepository.disableInRadcheck(tx, username);
      await voucherRepository.setRejectReplyInTransaction(tx, username, 'الكرت موقوف');
      await voucherRepository.updateCardStatusInTransaction(tx, cardId, 'suspended');
    }, 'VoucherEngine.suspendCard');

    const event: CardDisabledEvent = {
      cardId,
      username,
      disabledBy,
      disabledAt: new Date(),
    };
    await EventBus.publish(Events.CARD_DISABLED, event);

    await AuditLog.record({
      action: 'card.suspended',
      entityType: 'card',
      entityId: cardId,
      operator: disabledBy,
      metadata: { username },
    });

    Metrics.record('voucher.disable_ms', Date.now() - start, { context: 'VoucherEngine' });
    Logger.info(`VoucherEngine: suspended card#${cardId} for ${username}`, {
      context: 'VoucherEngine',
    });
  }

  /**
   * انتقال انتهاء نهائي: Usage أو Validity أو تاريخ مطلق.
   * الحالة expired مخصصة للانتهاء، بينما suspended يبقى للإيقاف اليدوي فقط.
   */
  async expireCard(params: {
    cardId: number;
    username: string;
    reason: VoucherExpiryReason;
    totalUsedSeconds: number;
  }): Promise<void> {
    const storedStatus = await voucherRepository.getStoredStatus(params.cardId);
    if (storedStatus === 'expired') return;

    const eventReason = params.reason === 'usage_exhausted' ? 'time_limit' : 'expiry_date';
    await withTransaction(async (tx) => {
      await voucherRepository.disableInRadcheck(tx, params.username);
      await voucherRepository.setRejectReplyInTransaction(tx, params.username, expiryReplyMessage(params.reason));
      await voucherRepository.updateCardStatusInTransaction(tx, params.cardId, 'expired');
    }, 'VoucherEngine.expireCard');

    const event: CardExpiredEvent = {
      cardId: params.cardId,
      username: params.username,
      reason: eventReason,
      expiredAt: new Date(),
      totalUsedSeconds: params.totalUsedSeconds,
    };
    await EventBus.publish(Events.CARD_EXPIRED, event);
    await AuditLog.record({
      action: 'card.expired',
      entityType: 'card',
      entityId: params.cardId,
      metadata: { username: params.username, reason: params.reason, totalUsedSeconds: params.totalUsedSeconds },
    });
    Metrics.record('voucher.expire', 1, { context: `VoucherEngine:${params.reason}` });
    Logger.info(`VoucherEngine: expired card#${params.cardId} for ${params.username}`, {
      context: 'VoucherEngine',
      data: { reason: params.reason, totalUsedSeconds: params.totalUsedSeconds },
    });
  }

  /**
   * تعيين Huntgroup للكرت (NAS Isolation)
   */
  async setHuntgroup(username: string, ownerId: number): Promise<void> {
    const groupname = nasRepository.getHuntgroupName(ownerId);
    await voucherRepository.setRadcheckAttribute(
      username,
      'Huntgroup-Name',
      '==',
      groupname
    );
  }
}

export const voucherEngine = new VoucherEngine();
