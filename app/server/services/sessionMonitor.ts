/**
 * Session Monitor — V2 Compatibility Wrapper
 * يُوفّر واجهة متوافقة مع الكود القديم
 * جميع الاستدعاءات تذهب لـ V2ServiceBridge
 *
 * Radius Pro Local V2
 */

import {
  getCentralAccountingStatus,
  triggerAccountingRun,
  getUserTimeDetails,
} from '../v2/V2ServiceBridge';

export function startMonitor(_intervalMs: number = 30000): void {
  // V2: Scheduler يتولى هذا — no-op
}

export function stopMonitor(): void {
  // V2: no-op
}

export function getMonitorStatus(): {
  isRunning: boolean;
  lastCheckTime: Date | null;
  totalChecks: number;
  totalDisconnects: number;
  lastRunDurationMs: number;
  lastBatchQueryDurationMs: number;
  lastActiveUsers: number;
  lastActiveSessions: number;
  totalSlowRuns: number;
  avgRunDurationMs: number;
  maxRunDurationMs: number;
} {
  const status = getCentralAccountingStatus();
  return {
    isRunning: status.isRunning,
    lastCheckTime: status.lastRunAt,
    totalChecks: 0,
    totalDisconnects: 0,
    lastRunDurationMs: status.lastRunDurationMs,
    lastBatchQueryDurationMs: 0,
    lastActiveUsers: 0,
    lastActiveSessions: 0,
    totalSlowRuns: 0,
    avgRunDurationMs: 0,
    maxRunDurationMs: 0,
  };
}

export async function triggerCheck(): Promise<{
  checked: number;
  disconnected: number;
  timeExhausted: number;
  cardExpired: number;
  errors: string[];
}> {
  const result = await triggerAccountingRun();
  return {
    checked: result.processed,
    disconnected: result.disconnected,
    timeExhausted: result.disconnected,
    cardExpired: 0,
    errors: result.errors,
  };
}

export async function checkUserTimeStatus(username: string): Promise<{
  maxAllSession: number;
  totalUsedTime: number;
  remainingInternetTime: number;
  expirationDate: Date | null;
  isExpired: boolean;
  canConnect: boolean;
} | null> {
  const details = await getUserTimeDetails(username);
  if (!details) return null;

  const maxAllSession = 0; // V2: usageBudgetSeconds in radiusCards
  const totalUsedTime = details.totalUsedSeconds;
  const remainingInternetTime = -1; // V2: calculated by ExpirationEngine

  return {
    maxAllSession,
    totalUsedTime,
    remainingInternetTime,
    expirationDate: null,
    isExpired: false,
    canConnect: true,
  };
}
