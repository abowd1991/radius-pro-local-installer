/**
 * Accounting Domain Events
 * كل الأحداث التي يُطلقها Accounting Domain
 * Radius Pro Local V2
 */

export interface SessionStartedEvent {
  acctSessionId: string;
  acctUniqueId: string;
  username: string;
  nasIpAddress: string;
  framedIpAddress?: string;
  startTime: Date;
  cardId?: number;
  lifecycleId?: string;
  nasId?: number;
  ownerId?: number;
}

export interface SessionClosedEvent {
  acctSessionId: string;
  acctUniqueId: string;
  username: string;
  sessionTimeSeconds: number;
  terminateCause: string;
  cardId?: number;
  lifecycleId?: string;
  nasId?: number;
  ownerId?: number;
  closedAt: Date;
}

export interface SessionLostCarrierEvent {
  acctSessionId: string;
  username: string;
  lastSeenSeconds: number;
  cardId?: number;
}

export interface UsageUpdatedEvent {
  username: string;
  cardId: number;
  addedSeconds: number;
  newTotalSeconds: number;
}

export interface ValidationMismatchEvent {
  username: string;
  cacheValue: number;
  radacctValue: number;
  driftSeconds: number;
}
