import { getDb } from "../db";
import { users, nasDevices, systemSettings, walletLedger, wallets } from "../../drizzle/schema";
import { eq, and, lte, isNull, or, sql } from "drizzle-orm";
import { logAudit } from "./auditLogService";
import { DEFAULT_SYSTEM_TIMEZONE, getZonedParts } from "../core/TimezoneService";

const localDateKey = (instant: Date, timezone: string) => {
  const { year, month, day } = getZonedParts(instant, timezone || DEFAULT_SYSTEM_TIMEZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export function isDailyBillingDue(lastBilledAt: Date | string | null, timezone: string, now = new Date()): boolean {
  if (!lastBilledAt) return true;
  const last = lastBilledAt instanceof Date ? lastBilledAt : new Date(lastBilledAt);
  return Number.isNaN(last.getTime()) || localDateKey(last, timezone) !== localDateKey(now, timezone);
}

/**
 * SaaS Daily Billing Service
 * 
 * Billing Model:
 * - NAS الأول: 15$ شهرياً، وكل NAS إضافي: 5$ شهرياً، مع احتساب يومي
 * - Billing starts from 1st of month
 * - Daily deduction when NAS is active
 * - Set billing_status = 'past_due' if insufficient balance
 * - Low balance notification when balance ≤ $2
 */

/**
 * Get daily billing rate from system settings (first NAS)
 */
export async function getDailyBillingRate(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [setting] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "nas_daily_rate"));

  return setting ? parseFloat(setting.value) : 0.50; // Default: $0.50/day ($15/month)
}

/**
 * Get additional NAS daily billing rate from system settings (2nd NAS and beyond)
 */
export async function getAdditionalNasDailyRate(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [setting] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "nas_additional_daily_rate"));

  // $5 شهرياً للـ NAS الإضافي. القيمة اليومية التقريبية تحفظ كدقة كافية،
  // بينما تسوية المحفظة تُدوَّر إلى سنتين عند الخصم.
  return setting ? parseFloat(setting.value) : (5 / 30);
}

/** يحسب تكلفة NAS اليومية: الأول 15$/شهر والباقي 5$/شهر. */
export function calculateNasDailyCost(activeNasCount: number, firstNasRate: number, additionalNasRate: number): number {
  if (activeNasCount < 1) return 0;
  return firstNasRate + (activeNasCount - 1) * additionalNasRate;
}

/**
 * Calculate daily cost for a user based on active NAS count
 */
export async function calculateDailyCost(userId: number): Promise<{
  activeNasCount: number;
  dailyCost: number;
  firstNasRate: number;
  additionalNasRate: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Count active NAS devices for this user
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(nasDevices)
    .where(
      and(
        eq(nasDevices.ownerId, userId),
        eq(nasDevices.status, "active")
      )
    );

  const activeNasCount = Number(result[0]?.count || 0);
  const firstNasRate = await getDailyBillingRate();
  const additionalNasRate = await getAdditionalNasDailyRate();

  // First NAS at full rate, additional NAS at reduced rate
  const dailyCost = calculateNasDailyCost(activeNasCount, firstNasRate, additionalNasRate);

  return {
    activeNasCount,
    dailyCost,
    firstNasRate,
    additionalNasRate,
  };
}

/**
 * Process daily billing for a user
 */
export async function processDailyBilling(
  userId: number,
  actorId?: number
): Promise<{
  success: boolean;
  activeNasCount?: number;
  dailyCost?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Check if daily billing is enabled
    if (!user.dailyBillingEnabled) {
      return { success: false, error: "Daily billing not enabled" };
    }

    // Balance-based subscription (no more trial period check)

    // Calculate daily cost
    const { activeNasCount, dailyCost } = await calculateDailyCost(userId);

    // Skip if no active NAS
    if (activeNasCount === 0 || dailyCost === 0) {
      // Update last billing date even if no charge
      await db
        .update(users)
        .set({ 
          lastDailyBillingDate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      return {
        success: true,
        activeNasCount: 0,
        dailyCost: 0,
      };
    }

    // Get wallet balance
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    if (!wallet) {
      return { success: false, error: "Wallet not found" };
    }

    const balanceBefore = parseFloat(wallet.balance);
    const creditBefore = parseFloat((wallet as any).creditBalance || '0');

    // Always deduct — support negative balance (debt system)
    // If balance < dailyCost → balance goes negative, debt is tracked in creditBalance
    const balanceAfter = balanceBefore - dailyCost;
    const newCreditBalance = balanceAfter < 0
      ? creditBefore + Math.abs(balanceAfter)  // accumulate debt
      : creditBefore;                            // no new debt
    const storedBalance = balanceAfter < 0 ? '0.00' : balanceAfter.toFixed(2);

    // Determine billing status
    // past_due = only when NEW debt was added in this cycle (balance couldn't cover today's cost)
    // If the user has existing debt but their balance covered today's cost → keep active
    // If the user's balance couldn't cover today's cost → new debt added → past_due
    const newDebtAdded = newCreditBalance > creditBefore;
    const newBillingStatus = newDebtAdded ? 'past_due' : 'active';

    await db
      .update(wallets)
      .set({
        balance: storedBalance,
        creditBalance: newCreditBalance.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId));

    // Record in wallet_ledger
    const dailyRate = await getDailyBillingRate();
    const additionalDailyRate = await getAdditionalNasDailyRate();
    await db.insert(walletLedger).values({
      userId,
      type: "debit",
      amount: dailyCost.toFixed(2),
      balanceBefore: balanceBefore.toFixed(2),
      balanceAfter: storedBalance,
      reason: `Daily billing: first NAS $${dailyRate.toFixed(4)} + ${Math.max(0, activeNasCount - 1)} additional NAS × $${additionalDailyRate.toFixed(4)}${
        newCreditBalance > 0 ? ` (debt: $${newCreditBalance.toFixed(2)})` : ''
      }`,
      reasonAr: `فوترة يومية: NAS الأول $${dailyRate.toFixed(4)} + ${Math.max(0, activeNasCount - 1)} NAS إضافي × $${additionalDailyRate.toFixed(4)}${
        newCreditBalance > 0 ? ` (مديونية: $${newCreditBalance.toFixed(2)})` : ''
      }`,
      entityType: "billing",
      entityId: userId,
      actorId: actorId || userId,
      actorRole: "system",
      metadata: JSON.stringify({
        activeNasCount,
        dailyRate,
        additionalDailyRate,
        billingPeriod: "daily",
        debtAccumulated: newCreditBalance > creditBefore ? (newCreditBalance - creditBefore).toFixed(2) : '0',
      }),
      createdAt: new Date(),
    });

    // Update last billing date and billing status
    await db
      .update(users)
      .set({
        lastDailyBillingDate: new Date(),
        billingStatus: newBillingStatus,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Send notification if balance is critically low (≤ $1)
    if (balanceAfter <= 1) {
      try {
        const { notifications } = await import('../../drizzle/schema');
        await db.insert(notifications).values({
          userId,
          type: 'balance',
          title: 'Low Balance Warning',
          titleAr: 'تحذير: رصيد منخفض جداً',
          message: `Your balance is critically low: $${balanceAfter.toFixed(2)}. Please add funds immediately to avoid service suspension.`,
          messageAr: `رصيدك منخفض جداً: $${balanceAfter.toFixed(2)}. يرجى إضافة رصيد فوراً لتجنب تعليق الخدمة.`,
          isRead: false,
          createdAt: new Date(),
        });
        console.log(`[Billing] Low balance notification sent to user ${userId}: $${balanceAfter.toFixed(2)}`);
      } catch (error) {
        console.error(`[Billing] Failed to send low balance notification to user ${userId}:`, error);
        // Don't fail the billing process if notification fails
      }
    }

    await logAudit({
      userId: actorId || userId,
      userRole: "system",
      action: "billing_processed",
      targetType: "user",
      targetId: userId.toString(),
      result: "success",
      details: {
        activeNasCount,
        dailyCost,
        balanceBefore,
        balanceAfter,
      },
    });

    return {
      success: true,
      activeNasCount,
      dailyCost,
      balanceBefore,
      balanceAfter,
    };
  } catch (error: any) {
    console.error("[BillingService] Error processing daily billing:", error);
    return {
      success: false,
      error: error.message || "Unknown error",
    };
  }
}

/**
 * Activate daily billing for a user (set billing_start_at to 1st of current month)
 */
export async function activateDailyBilling(
  userId: number,
  actorId: number
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (user.billingStartAt) {
      return { success: false, error: "Billing already activated" };
    }

    // Set billing start to 1st of current month
    const now = new Date();
    const billingStartAt = new Date(now.getFullYear(), now.getMonth(), 1);

    await db
      .update(users)
      .set({
        billingStartAt,
        dailyBillingEnabled: true,
        billingStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await logAudit({
      userId: actorId,
      userRole: "owner",
      action: "billing_activated",
      targetType: "user",
      targetId: userId.toString(),
      result: "success",
      details: {
        billingStartAt,
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("[BillingService] Error activating billing:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get users that need daily billing (haven't been billed today)
 */
export async function getUsersDueForDailyBilling(now = new Date()): Promise<number[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dueUsers = await db
    .select({ id: users.id, timezone: users.timezone, lastDailyBillingDate: users.lastDailyBillingDate })
    .from(users)
    .where(
      and(
        eq(users.role, "client"),
        eq(users.dailyBillingEnabled, true)
      )
    );

  return dueUsers
    .filter((user: { timezone: string; lastDailyBillingDate: Date | string | null }) => isDailyBillingDue(user.lastDailyBillingDate, user.timezone || DEFAULT_SYSTEM_TIMEZONE, now))
    .map((user: { id: number }) => user.id);
}

/**
 * Get user billing summary
 */
export async function getUserBillingSummary(userId: number): Promise<{
  activeNasCount: number;
  dailyCost: number;
  billingStatus: string;
  billingStartAt: Date | null;
  lastDailyBillingDate: Date | null;
  dailyBillingEnabled: boolean;
  currentBalance: number;
} | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;

  const { activeNasCount, dailyCost } = await calculateDailyCost(userId);

  // Get current balance
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const currentBalance = wallet ? parseFloat(wallet.balance) : 0;

  return {
    activeNasCount,
    dailyCost,
    billingStatus: user.billingStatus,
    billingStartAt: user.billingStartAt,
    lastDailyBillingDate: user.lastDailyBillingDate,
    dailyBillingEnabled: user.dailyBillingEnabled,
    currentBalance,
  };
}

/**
 * Check if user has low balance (≤ $1)
 * Sends SMS ONCE when balance drops to $1 or below.
 * Resets when balance is topped up above $1.
 */
export async function checkLowBalance(userId: number): Promise<{
  isLow: boolean;
  balance: number;
  shouldNotify: boolean;
  daysRemaining: number;
  activeNasCount: number;
  phone: string | null;
  name: string | null;
  language: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current balance
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const balance = wallet ? parseFloat(wallet.balance) : 0;

  // Get user info
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return { isLow: false, balance, shouldNotify: false, daysRemaining: 999, activeNasCount: 0, phone: null, name: null, language: 'ar' };
  }

  // Calculate daily cost based on active NAS
  const { activeNasCount, dailyCost } = await calculateDailyCost(userId);
  const dailyRate = dailyCost > 0 ? dailyCost : 0;

  // Calculate days remaining
  const daysRemaining = dailyRate > 0 ? Math.floor(balance / dailyRate) : 999;

  // Low balance threshold = $1
  const LOW_BALANCE_THRESHOLD = 1.0;
  const isLow = balance <= LOW_BALANCE_THRESHOLD && dailyRate > 0;

  if (!isLow) {
    // If balance is above $1 again, reset the SMS flag so it can be sent again next time
    if (user.smsLowBalanceSentAt && balance > LOW_BALANCE_THRESHOLD) {
      await db.update(users)
        .set({ smsLowBalanceSentAt: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
    return { isLow: false, balance, shouldNotify: false, daysRemaining, activeNasCount, phone: user.phone || null, name: user.name || null, language: user.language || 'ar' };
  }

  // shouldNotify = true ONLY if SMS was never sent before (smsLowBalanceSentAt is null)
  // This ensures SMS is sent exactly ONCE per low-balance event
  const shouldNotify = !user.smsLowBalanceSentAt;

  return { isLow, balance, shouldNotify, daysRemaining, activeNasCount, phone: user.phone || null, name: user.name || null, language: user.language || 'ar' };
}

/**
 * Mark user as notified for low balance
 * Sets both lowBalanceNotifiedAt AND smsLowBalanceSentAt to prevent re-sending
 */
export async function markLowBalanceNotified(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({ 
      lowBalanceNotifiedAt: new Date(),
      smsLowBalanceSentAt: new Date(), // Prevent re-sending SMS until balance is topped up above $1
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

// Backward compatibility exports (for old monthly system)
export const getNasBillingRate = getDailyBillingRate;
export const calculateMonthlyCost = calculateDailyCost;
export const processUserBilling = processDailyBilling;
export const activateUserBilling = activateDailyBilling;
export const getUsersDueForBilling = getUsersDueForDailyBilling;
