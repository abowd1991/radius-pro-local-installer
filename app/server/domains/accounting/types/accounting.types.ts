/**
 * Accounting Domain Types
 * Domain Models نقية — لا SQL هنا
 * Radius Pro Local V2
 */

export type SessionState =
  | 'NEW'
  | 'CONNECTED'
  | 'ACCOUNTING'
  | 'STOPPING'
  | 'LOST_CARRIER'
  | 'STOPPED'
  | 'ARCHIVED';

export interface SessionData {
  acctSessionId: string;
  acctUniqueId: string;
  username: string;
  nasIpAddress: string;
  framedIpAddress?: string;
  sessionTimeSeconds: number;
  inputOctets: number;
  outputOctets: number;
  startTime: Date;
  lastUpdate: Date;
  state: SessionState;
  cardId?: number;
  lifecycleId?: string;
  nasId?: number;
  ownerId?: number;
}

export interface SessionStopParams {
  acctSessionId: string;
  acctUniqueId: string;
  username: string;
  sessionTimeSeconds: number;
  terminateCause: string;
  inputOctets?: number;
  outputOctets?: number;
  cardId?: number;
  lifecycleId?: string;
}

export interface UsageResult {
  username: string;
  totalUsedSeconds: number;
  /** من totalSessionTime (Cache) */
  closedSessionsSeconds: number;
  /** من online_sessions (النشطة) */
  activeSessionsSeconds: number;
  /** وقت التجديد الأخير (لتجنب احتساب وقت الكرت القديم) */
  renewalAnchorSeconds: number;
  calculatedAt: Date;
}

export interface ValidationResult {
  username: string;
  cacheValue: number;
  radacctValue: number;
  driftSeconds: number;
  isAcceptable: boolean;
}
