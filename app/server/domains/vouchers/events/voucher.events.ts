/**
 * Voucher Domain Events
 * Radius Pro Local V2
 */

export interface CardActivatedEvent {
  cardId: number;
  username: string;
  ownerId: number;
  activatedAt: Date;
}

export interface CardRenewedEvent {
  cardId: number;
  username: string;
  renewalAnchorSeconds: number;
  /** null means the renewed card has no absolute expiry. */
  newExpiresAt?: Date | null;
  renewedAt: Date;
}

export interface CardExpiredEvent {
  cardId: number;
  username: string;
  reason: 'time_limit' | 'expiry_date';
  expiredAt: Date;
  totalUsedSeconds: number;
}

export interface CardDisabledEvent {
  cardId: number;
  username: string;
  disabledBy?: string;
  disabledAt: Date;
}
