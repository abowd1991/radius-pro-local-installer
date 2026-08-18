export type VoucherExpiryReason = 'usage_exhausted' | 'validity_expired' | 'absolute_expired';
export type EffectiveVoucherStatus = 'unused' | 'reserved' | 'active' | 'used' | 'expired' | 'suspended' | 'cancelled';

export interface VoucherStatusInput {
  status: EffectiveVoucherStatus;
  usageBudgetSeconds?: number | null;
  totalSessionTime?: number | null;
  windowEndTime?: Date | null;
  expiresAt?: Date | null;
}

/**
 * المصدر الموحد لحالة الكرت. انتهاء الاستهلاك أو Validity أو التاريخ
 * يتقدّم دائماً على حالة الإيقاف اليدوي، كي لا يظهر كرت منتهٍ على أنه موقوف.
 */
export function getVoucherExpiryReason(
  card: VoucherStatusInput,
  totalUsedSeconds: number = Number(card.totalSessionTime ?? 0),
  now: Date = new Date(),
): VoucherExpiryReason | null {
  const budget = Number(card.usageBudgetSeconds ?? 0);
  if (budget > 0 && totalUsedSeconds >= budget) return 'usage_exhausted';
  if (card.windowEndTime && card.windowEndTime.getTime() <= now.getTime()) return 'validity_expired';
  if (card.expiresAt && card.expiresAt.getTime() <= now.getTime()) return 'absolute_expired';
  return null;
}

export function getEffectiveVoucherStatus(
  card: VoucherStatusInput,
  totalUsedSeconds: number = Number(card.totalSessionTime ?? 0),
  now: Date = new Date(),
): EffectiveVoucherStatus {
  return getVoucherExpiryReason(card, totalUsedSeconds, now) ? 'expired' : card.status;
}

export function expiryReplyMessage(reason: VoucherExpiryReason): string {
  if (reason === 'usage_exhausted') return 'الكرت منتهي الصلاحية: تم استهلاك الوقت المتاح';
  return 'الكرت منتهي الصلاحية';
}
