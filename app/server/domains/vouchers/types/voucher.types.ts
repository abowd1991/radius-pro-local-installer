/**
 * Voucher Domain Types
 * Radius Pro Local V2
 */

export type CardStatus = 'active' | 'inactive' | 'disabled' | 'expired' | 'pending';

export interface CardActivationParams {
  cardId: number;
  username: string;
  ownerId: number;
  huntgroupName: string;
}

export interface CardRenewalParams {
  cardId: number;
  username: string;
  lifecycleId: string;
  /** null تعني no_expiry؛ القيمة تحفظ UTC دائماً. */
  newExpiresAt: Date | null;
  /** مقدار ميزانية الاستخدام الجديد المراد إضافته فوق المتبقي. */
  additionalUsageBudgetSeconds?: number;
  newWindowSeconds?: number;
  /** يفتح دورة استخدام جديدة داخل نفس Card Lifecycle عند نفاد/تجديد الميزانية. */
  resetUsage: boolean;
}

export interface CardExpiryCheck {
  cardId: number;
  username: string;
  timeLimitSeconds?: number;
  expiresAt?: Date;
  totalUsedSeconds: number;
  isExpired: boolean;
  reason?: 'time_limit' | 'expiry_date';
}
