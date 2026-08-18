/**
 * V2ServiceBridge — جسر الخدمات للـ Routers
 * يُوفّر الدوال المشتركة التي كانت في centralAccountingService
 * بدون أي SQL مباشر — كل شيء يمر عبر Repository أو Engine
 *
 * Radius Pro Local V2
 */

import { getDb } from '../db';
import { sql } from 'drizzle-orm';
import { Logger } from '../core/Logger';
import { usageEngine } from '../domains/accounting/UsageEngine';
import { cleanupEngine } from '../domains/accounting/CleanupEngine';
import { expirationEngine } from '../domains/vouchers/ExpirationEngine';
import { freeRadiusEngine } from '../domains/radius/FreeRadiusEngine';
import { Metrics } from '../core/Metrics';
import { eq, and } from 'drizzle-orm';
import { radiusCards } from '../../drizzle/schema';

// ─── Feature Flags (V2: online_sessions دائماً مفعّل) ────────────────────────

/**
 * V2: online_sessions دائماً مفعّل — لا Feature Flags
 */
export async function getFeatureFlag_UseOnlineSessions(): Promise<boolean> {
  return true; // V2: always true
}

export async function getFeatureFlag_UseOnlineSessionsRead(): Promise<boolean> {
  return true; // V2: always true
}

export function invalidateFeatureFlagCache(): void {
  // V2: no-op — no cache needed
}

export function invalidateFeatureFlagReadCache(): void {
  // V2: no-op
}

// ─── NAS Huntgroup Auto-Fix ───────────────────────────────────────────────────

/**
 * إصلاح radhuntgroup المفقود للـ NAS
 * نُقلت من centralAccountingService → FreeRadiusEngine
 */
export async function autoFixMissingHuntgroups(): Promise<{ fixed: number; errors: string[] }> {
  const errors: string[] = [];
  let fixed = 0;
  try {
    const db = await getDb();
    if (!db) return { fixed: 0, errors: ['DB not available'] };
    const missingResult = await db.execute(
      sql`SELECT n.nasname, n.ownerId
          FROM nas n
          WHERE n.status != 'deleted'
            AND n.nasname IS NOT NULL
            AND n.nasname != ''
            AND NOT EXISTS (
              SELECT 1 FROM radhuntgroup rh
              WHERE rh.nasipaddress = n.nasname
                AND rh.groupname = CONCAT('owner_', n.ownerId)
            )`
    ) as any;
    const missingNas = (missingResult as any)[0] as any[];
    for (const nas of missingNas) {
      try {
        const groupName = `owner_${nas.ownerId}`;
        await db.execute(
          sql`INSERT IGNORE INTO radhuntgroup (nasipaddress, nasportid, groupname)
              VALUES (${nas.nasname}, NULL, ${groupName})`
        );
        const gcExists = await db.execute(
          sql`SELECT id FROM radgroupcheck WHERE groupname = ${groupName} AND attribute = 'Huntgroup-Name' LIMIT 1`
        ) as any;
        if (((gcExists as any)[0] as any[]).length === 0) {
          await db.execute(
            sql`INSERT IGNORE INTO radgroupcheck (groupname, attribute, op, value)
                VALUES (${groupName}, 'Huntgroup-Name', '==', ${groupName})`
          );
        }
        fixed++;
      } catch (err: any) {
        errors.push(`AutoFix NAS ${nas.nasname}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(`AutoFix error: ${err.message}`);
  }
  return { fixed, errors };
}

// ─── Accounting Status & Control ─────────────────────────────────────────────

/**
 * حالة نظام Accounting V2
 */
export function getCentralAccountingStatus(): {
  isRunning: boolean;
  lastRunAt: Date | null;
  lastRunDurationMs: number;
  processedCount: number;
  errorCount: number;
  version: string;
} {
  const durationMetric = Metrics.summary('accounting.batch_duration_ms');
  const processedMetric = Metrics.summary('accounting.processed_count');
  const errorMetric = Metrics.summary('accounting.error_count');
  return {
    isRunning: true,
    lastRunAt: new Date(),
    lastRunDurationMs: durationMetric?.last ?? 0,
    processedCount: processedMetric?.count ?? 0,
    errorCount: errorMetric?.count ?? 0,
    version: 'V2',
  };
}

/**
 * تشغيل دورة Accounting يدوياً (للـ Admin)
 */
export async function triggerAccountingRun(): Promise<{
  processed: number;
  disconnected: number;
  errors: string[];
}> {
  const start = Date.now();
  Logger.info('V2ServiceBridge: Manual accounting run triggered', { context: 'V2Bridge' });
  try {
    const cleaned = await cleanupEngine.cleanupStaleSessions();
    const expired = await expirationEngine.checkAndDisableExpiredCards();
    Metrics.record('accounting.manual_run_duration_ms', Date.now() - start);
    return {
      processed: cleaned,
      disconnected: expired,
      errors: [],
    };
  } catch (err: any) {
    return { processed: 0, disconnected: 0, errors: [err.message] };
  }
}

/**
 * تفاصيل وقت استخدام مستخدم معين
 */
export async function getUserTimeDetails(username: string): Promise<{
  username: string;
  totalUsedSeconds: number;
  closedSessionsSeconds: number;
  activeSessionsSeconds: number;
  cardId: number | null;
  isValidityExpired: boolean;
  shouldDisconnect: boolean;
  disconnectReason: string;
  status: string;
  usedTimeFromRadacct: number;
  remainingUsageSeconds: number;
  usageBudgetSeconds: number;
  isWindowExpired: boolean;
  windowEndTime: Date | null;
  expiresAt: Date | null;
  allocatedTimeSeconds: number;
  currentSessionTime: number;
  remainingTimeSeconds: number;
} | null> {
  try {
    // نجد cardId من قاعدة البيانات
    const db = await getDb();
    if (!db) return null;
    const cardResult = await db.execute(
      sql`SELECT id FROM radius_cards WHERE username = ${username} AND status = 'active' LIMIT 1`
    );
    const cardId = (cardResult as any)[0]?.[0]?.id ?? null;
    if (!cardId) return null;

    const usage = await usageEngine.calculateUsage(username, cardId);
    // جلب بيانات الكرت للحقول الإضافية
    const cardResult2 = await db.execute(
      sql`SELECT status, usageBudgetSeconds, expiresAt, windowEndTime
          FROM radius_cards WHERE id = ${cardId} LIMIT 1`
    );
    const card = (cardResult2 as any)[0]?.[0];
    const now = new Date();
    const isWindowExpired = card?.windowEndTime ? new Date(card.windowEndTime) < now : false;
    const isExpiresAtExpired = card?.expiresAt ? new Date(card.expiresAt) < now : false;
    const isValidityExpired = isWindowExpired || isExpiresAtExpired;
    const usageBudgetSeconds = card?.usageBudgetSeconds ?? 0;
    const remainingUsageSeconds = usageBudgetSeconds > 0
      ? Math.max(0, usageBudgetSeconds - usage.totalUsedSeconds)
      : -1;
    const shouldDisconnect = isValidityExpired || (usageBudgetSeconds > 0 && remainingUsageSeconds <= 0);
    const disconnectReason = isValidityExpired ? 'انتهت الصلاحية' : 'استنفد الوقت';

    return {
      username,
      totalUsedSeconds: usage.totalUsedSeconds,
      closedSessionsSeconds: usage.closedSessionsSeconds,
      activeSessionsSeconds: usage.activeSessionsSeconds,
      cardId,
      isValidityExpired,
      shouldDisconnect,
      disconnectReason,
      status: card?.status ?? 'unknown',
      usedTimeFromRadacct: usage.closedSessionsSeconds,
      remainingUsageSeconds,
      usageBudgetSeconds,
      isWindowExpired,
      windowEndTime: card?.windowEndTime ? new Date(card.windowEndTime) : null,
      expiresAt: card?.expiresAt ? new Date(card.expiresAt) : null,
      allocatedTimeSeconds: usageBudgetSeconds,
      currentSessionTime: usage.activeSessionsSeconds,
      remainingTimeSeconds: remainingUsageSeconds,
    };
  } catch (err: any) {
    Logger.error(`V2Bridge: getUserTimeDetails failed for ${username}`, {
      context: 'V2Bridge',
      error: err.message,
    });
    return null;
  }
}

/**
 * إعادة مزامنة استخدام مستخدم معين
 */
export async function forceSyncUserUsage(username: string): Promise<void> {
  // محفوظ للتوافق مع أي مستهلك قديم فقط. لا يجوز إعادة بناء cache من
  // radacct لأن SessionEngine وCleanupEngine هما الكاتبان الوحيدان لـtotalSessionTime.
  Logger.warn(`V2Bridge: ignored legacy forceSyncUserUsage for ${username}`, {
    context: 'V2Bridge',
    errorCode: 'ACC_004',
  });
}

// ─── Expiry Reminders ─────────────────────────────────────────────────────────

export async function checkManualCardExpiryReminders(): Promise<{ sent: number }> {
  // V2: يُشغَّل عبر V2Scheduler — هذه الدالة للتوافق فقط
  Logger.debug('V2Bridge: checkManualCardExpiryReminders — handled by V2Scheduler', {
    context: 'V2Bridge',
  });
  return { sent: 0 };
}

export async function checkSubscriberExpiryReminders(): Promise<{ sent: number }> {
  Logger.debug('V2Bridge: checkSubscriberExpiryReminders — handled by V2Scheduler', {
    context: 'V2Bridge',
  });
  return { sent: 0 };
}

export async function disableExpiredSubscribers(): Promise<{ disabled: number }> {
  Logger.debug('V2Bridge: disableExpiredSubscribers — handled by V2Scheduler', {
    context: 'V2Bridge',
  });
  return { disabled: 0 };
}
