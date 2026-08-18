/**
 * Daily Billing Cron Job
 * 
 * Runs daily to check for users due for billing
 * and processes their daily payments
 */

import { getUsersDueForDailyBilling, processDailyBilling, checkLowBalance, markLowBalanceNotified } from "./billingService";
import { notifyOwner } from "../_core/notification";
import { sendSmsTenant } from "./tweetsmsService";
import { isJobEnabled } from "./cronJobGuard";
import { getDb } from "../db";
import { billingRunLogs } from "../../drizzle/schema";

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Build low balance SMS message for the client
 */
function buildLowBalanceMessage(
  name: string | null,
  balance: number,
  daysRemaining: number,
  activeNasCount: number,
  language: string
): string {
  const clientName = name || "العميل";
  if (language === "ar") {
    return `مرحباً ${clientName}،\nتنبيه: رصيدك في RadiusPro وصل إلى $${balance.toFixed(2)} فقط.\nيرجى شحن رصيدك فوراً لتجنب انقطاع الخدمة.\nradius-pro.com`;
  }
  return `Hello ${clientName},\nAlert: Your RadiusPro balance has reached $${balance.toFixed(2)}.\nPlease top up immediately to avoid service interruption.\nradius-pro.com`;
}

/**
 * Process daily billing for all due users
 */
async function processDailyBillingCycle(): Promise<{
  checked: number;
  processed: number;
  failed: number;
  skipped: number;
  lowBalanceNotifications: number;
}> {
  if (isRunning) {
    console.log("[DailyBillingCron] Already running, skipping this cycle");
    return { checked: 0, processed: 0, failed: 0, skipped: 0, lowBalanceNotifications: 0 };
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log("[DailyBillingCron] Starting daily billing cycle...");

    // Get all users due for daily billing
    const dueUserIds = await getUsersDueForDailyBilling();
    console.log(`[DailyBillingCron] Found ${dueUserIds.length} users due for daily billing`);

    if (dueUserIds.length === 0) {
      return { checked: 0, processed: 0, failed: 0, skipped: 0, lowBalanceNotifications: 0 };
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;
    let lowBalanceNotifications = 0;

    // Process each user
    for (const userId of dueUserIds) {
      try {
        const result = await processDailyBilling(userId);
        
        if (result.success) {
          if (result.activeNasCount === 0) {
            skipped++;
            console.log(`[DailyBillingCron] Skipped user ${userId} (no active NAS)`);
          } else {
            processed++;
            const dailyRate = result.dailyCost! / (result.activeNasCount || 1);
            console.log(
              `[DailyBillingCron] Processed user ${userId}: ${result.activeNasCount} NAS × $${dailyRate.toFixed(2)} = $${result.dailyCost!.toFixed(2)}`
            );
          }
        } else {
          failed++;
          console.error(`[DailyBillingCron] Failed to process user ${userId}: ${result.error}`);
        }

        // Check for low balance (≤ 3 days remaining) and send notification
        const lowBalanceCheck = await checkLowBalance(userId);
        if (lowBalanceCheck.isLow && lowBalanceCheck.shouldNotify) {
          try {
            const message = buildLowBalanceMessage(
              lowBalanceCheck.name,
              lowBalanceCheck.balance,
              lowBalanceCheck.daysRemaining,
              lowBalanceCheck.activeNasCount,
              lowBalanceCheck.language
            );

            // 1. Send SMS to client's phone number directly (using tenant credentials)
            if (lowBalanceCheck.phone) {
              const smsResult = await sendSmsTenant(userId, lowBalanceCheck.phone, message, { type: 'automatic', triggeredBy: 'low_balance_reminder' });
              if (smsResult.success) {
                console.log(`[DailyBillingCron] SMS sent to user ${userId} (${lowBalanceCheck.phone}): ${lowBalanceCheck.daysRemaining} days remaining`);
              } else {
                console.warn(`[DailyBillingCron] SMS failed for user ${userId}: ${smsResult.errorMessage}`);
              }
            } else {
              console.warn(`[DailyBillingCron] User ${userId} has no phone number, skipping SMS`);
            }

            // 2. Notify owner/admin about the low balance
            await notifyOwner({
              title: "⚠️ تحذير رصيد منخفض",
              content: `المستخدم "${lowBalanceCheck.name || `ID:${userId}`}" لديه رصيد منخفض: $${lowBalanceCheck.balance.toFixed(2)} (${lowBalanceCheck.daysRemaining} يوم متبقي). تم إرسال SMS للعميل.`,
            });

            await markLowBalanceNotified(userId);
            lowBalanceNotifications++;
            console.log(`[DailyBillingCron] Low balance notification sent for user ${userId}: ${lowBalanceCheck.daysRemaining} days remaining`);
          } catch (notifyError: any) {
            console.error(`[DailyBillingCron] Failed to send low balance notification for user ${userId}:`, notifyError.message);
          }
        }
      } catch (error: any) {
        failed++;
        console.error(`[DailyBillingCron] Error processing user ${userId}:`, error.message);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[DailyBillingCron] Cycle complete in ${duration}ms: ${dueUserIds.length} checked, ${processed} processed, ${failed} failed, ${skipped} skipped, ${lowBalanceNotifications} low balance notifications`
    );

    // حساب إجمالي المبلغ المخصوم من wallet_ledger (تقريبي: processed × متوسط التكلفة)
    // سنحفظ السجل في billing_run_logs
    try {
      const db = await getDb();
      await db.insert(billingRunLogs).values({
        triggeredBy: "cron",
        usersChecked: dueUserIds.length,
        usersProcessed: processed,
        usersSkipped: skipped,
        usersFailed: failed,
        totalDeducted: "0.00", // سيتم حسابه لاحقاً من wallet_ledger
        lowBalanceNotifications,
        durationMs: duration,
        status: failed > 0 && processed === 0 ? "failed" : failed > 0 ? "partial" : "success",
      });
    } catch (logError: any) {
      console.error("[DailyBillingCron] Failed to save run log:", logError.message);
    }

    return {
      checked: dueUserIds.length,
      processed,
      failed,
      skipped,
      lowBalanceNotifications,
    };
  } catch (error: any) {
    console.error("[DailyBillingCron] Error in billing cycle:", error);
    // حفظ سجل الفشل
    try {
      const db = await getDb();
      await db.insert(billingRunLogs).values({
        triggeredBy: "cron",
        usersChecked: 0,
        usersProcessed: 0,
        usersSkipped: 0,
        usersFailed: 0,
        totalDeducted: "0.00",
        lowBalanceNotifications: 0,
        durationMs: Date.now() - startTime,
        status: "failed",
        errorMessage: error.message,
      });
    } catch (_) {}
    return { checked: 0, processed: 0, failed: 0, skipped: 0, lowBalanceNotifications: 0 };
  } finally {
    isRunning = false;
  }
}

/**
 * Calculate milliseconds until next midnight (UTC+3 / Asia/Jerusalem)
 */
function msUntilMidnight(): number {
  const now = new Date();
  // UTC+3 offset
  const utcOffset = 3 * 60 * 60 * 1000;
  const localNow = new Date(now.getTime() + utcOffset);
  const localMidnight = new Date(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate() + 1, // next day
    0, 5, 0, 0 // 00:05 AM to avoid exact midnight edge cases
  );
  // Convert back to UTC timestamp
  const midnightUtc = localMidnight.getTime() - utcOffset;
  return Math.max(midnightUtc - now.getTime(), 60 * 1000); // minimum 1 minute
}

/**
 * Start the daily billing cron job
 * Runs once per day at midnight (UTC+3) — NOT on startup to prevent double billing after restarts.
 * 
 * IMPORTANT: Do NOT add processDailyBillingCycle() call on startup.
 * getUsersDueForDailyBilling() already prevents double billing via lastDailyBillingDate check,
 * but a race condition during restart can cause double deduction if startup execution is enabled.
 */
export function startBillingCron(): void {
  if (intervalId) {
    console.log("[DailyBillingCron] Already started");
    return;
  }

  const msToMidnight = msUntilMidnight();
  const hoursToMidnight = (msToMidnight / 1000 / 60 / 60).toFixed(1);
  console.log(`[DailyBillingCron] Starting - first run in ${hoursToMidnight}h (at midnight UTC+3)`);

  // Schedule first run at midnight, then every 24 hours
  setTimeout(async () => {
    if (await isJobEnabled("billing_cron")) {
      processDailyBillingCycle().catch(console.error);
    }
    // After first midnight run, repeat every 24 hours
    intervalId = setInterval(async () => {
      if (!(await isJobEnabled("billing_cron"))) return;
      processDailyBillingCycle().catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }, msToMidnight);

  // Set a non-null placeholder so the "Already started" guard works
  intervalId = setTimeout(() => {}, 0) as unknown as NodeJS.Timeout;

  console.log("[DailyBillingCron] Started - will run daily at midnight UTC+3 (no startup execution)");
}

/**
 * Stop the billing cron job
 */
export function stopBillingCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[DailyBillingCron] Stopped");
  }
}

/**
 * Manually trigger billing cycle (for testing)
 */
export async function triggerBillingCycle(): Promise<{
  checked: number;
  processed: number;
  failed: number;
  skipped: number;
  lowBalanceNotifications: number;
}> {
  console.log("[DailyBillingCron] Manual trigger requested");
  const result = await processDailyBillingCycle();
  // تحديث آخر سجل ليكون triggeredBy = manual
  try {
    const db = await getDb();
    await db.execute(
      require("drizzle-orm").sql`UPDATE billing_run_logs SET triggeredBy = 'manual' ORDER BY id DESC LIMIT 1`
    );
  } catch (_) {}
  return result;
}
