import { eq, and, gt, lte } from "drizzle-orm";
import { getDb } from "../db";
import { tenantSubscriptions } from "../../drizzle/schema";

// Subscription status type
export type SubscriptionStatus = "active" | "expired" | "suspended" | "cancelled";

// Get subscription by tenant ID
export async function getSubscriptionByTenantId(tenantId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId))
    .limit(1);
  
  return result[0] || null;
}

// Check if subscription is active (status = active AND not expired)
export async function isSubscriptionActive(tenantId: number): Promise<boolean> {
  const subscription = await getSubscriptionByTenantId(tenantId);
  
  if (!subscription) {
    return false;
  }
  
  // Check if status is active
  if (subscription.status !== "active") {
    return false;
  }
  
  // Check if not expired
  const now = new Date();
  if (subscription.expiresAt < now) {
    // Auto-update status to expired
    await updateTenantSubscriptionStatus(tenantId, "expired");
    return false;
  }
  
  return true;
}

// Get subscription status with details
export async function getSubscriptionStatus(tenantId: number): Promise<{
  hasSubscription: boolean;
  isActive: boolean;
  status: SubscriptionStatus | null;
  expiresAt: Date | null;
  daysRemaining: number;
  message: string;
}> {
  const subscription = await getSubscriptionByTenantId(tenantId);
  
  if (!subscription) {
    return {
      hasSubscription: false,
      isActive: false,
      status: null,
      expiresAt: null,
      daysRemaining: 0,
      message: "No subscription found. Please contact support to activate your account.",
    };
  }
  
  const now = new Date();
  const isExpired = subscription.expiresAt < now;
  const isActive = subscription.status === "active" && !isExpired;
  
  // Calculate days remaining
  const daysRemaining = isExpired 
    ? 0 
    : Math.ceil((subscription.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  // Auto-update status if expired
  if (subscription.status === "active" && isExpired) {
    await updateTenantSubscriptionStatus(tenantId, "expired");
  }
  
  let message = "";
  if (isActive) {
    if (daysRemaining <= 7) {
      message = `Your subscription expires in ${daysRemaining} days. Please renew soon.`;
    } else {
      message = `Subscription active. ${daysRemaining} days remaining.`;
    }
  } else if (subscription.status === "suspended") {
    message = "Your subscription has been suspended. Please contact support.";
  } else if (subscription.status === "cancelled") {
    message = "Your subscription has been cancelled. Please contact support to reactivate.";
  } else {
    message = "Your subscription has expired. Please contact support to renew.";
  }
  
  return {
    hasSubscription: true,
    isActive,
    status: isExpired && subscription.status === "active" ? "expired" : subscription.status,
    expiresAt: subscription.expiresAt,
    daysRemaining,
    message,
  };
}

// Create subscription for a tenant
export async function createTenantSubscription(data: {
  tenantId: number;
  months?: number;
  pricePerMonth?: string;
  notes?: string;
  createdBy?: number;
}): Promise<typeof tenantSubscriptions.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;
  
  const months = data.months || 1;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);
  
  await db.insert(tenantSubscriptions).values({
    tenantId: data.tenantId,
    status: "active",
    pricePerMonth: data.pricePerMonth || "10.00",
    startDate: now,
    expiresAt,
    notes: data.notes,
  });
  
  return getSubscriptionByTenantId(data.tenantId);
}

// Update subscription status
export async function updateTenantSubscriptionStatus(
  tenantId: number, 
  status: SubscriptionStatus
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db
    .update(tenantSubscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenantSubscriptions.tenantId, tenantId));
  
  return true;
}

// Extend subscription by months
export async function extendTenantSubscription(
  tenantId: number,
  months: number,
  renewedBy?: number,
  notes?: string
): Promise<typeof tenantSubscriptions.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;
  
  const subscription = await getSubscriptionByTenantId(tenantId);
  if (!subscription) return null;
  
  const now = new Date();
  // If expired, start from now; otherwise extend from current expiry
  const baseDate = subscription.expiresAt > now ? subscription.expiresAt : now;
  const newExpiresAt = new Date(baseDate.getTime() + months * 30 * 24 * 60 * 60 * 1000);
  
  await db
    .update(tenantSubscriptions)
    .set({
      status: "active",
      expiresAt: newExpiresAt,
      lastRenewalDate: now,
      renewedBy,
      notes: notes || subscription.notes,
      updatedAt: now,
    })
    .where(eq(tenantSubscriptions.tenantId, tenantId));
  
  return getSubscriptionByTenantId(tenantId);
}

// Suspend subscription
export async function suspendTenantSubscription(
  tenantId: number,
  notes?: string
): Promise<typeof tenantSubscriptions.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;
  
  await db
    .update(tenantSubscriptions)
    .set({ 
      status: "suspended", 
      notes,
      updatedAt: new Date() 
    })
    .where(eq(tenantSubscriptions.tenantId, tenantId));
  
  return getSubscriptionByTenantId(tenantId);
}

// Activate subscription (reactivate suspended/cancelled)
export async function activateTenantSubscription(
  tenantId: number,
  months?: number,
  renewedBy?: number
): Promise<typeof tenantSubscriptions.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;
  
  const subscription = await getSubscriptionByTenantId(tenantId);
  if (!subscription) return null;
  
  const now = new Date();
  const newExpiresAt = months 
    ? new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000)
    : subscription.expiresAt > now 
      ? subscription.expiresAt 
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 1 month
  
  await db
    .update(tenantSubscriptions)
    .set({
      status: "active",
      expiresAt: newExpiresAt,
      lastRenewalDate: now,
      renewedBy,
      updatedAt: now,
    })
    .where(eq(tenantSubscriptions.tenantId, tenantId));
  
  return getSubscriptionByTenantId(tenantId);
}

// Get all subscriptions (for admin)
export async function getAllTenantSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(tenantSubscriptions);
}

// Get expiring subscriptions (within X days)
export async function getExpiringSubscriptions(withinDays: number = 7) {
  const db = await getDb();
  if (!db) return [];
  
  const now = new Date();
  const futureDate = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
  
  return db
    .select()
    .from(tenantSubscriptions)
    .where(
      and(
        eq(tenantSubscriptions.status, "active"),
        gt(tenantSubscriptions.expiresAt, now),
        lte(tenantSubscriptions.expiresAt, futureDate)
      )
    );
}

// Delete subscription (admin only)
export async function deleteTenantSubscription(tenantId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db
    .delete(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, tenantId));
  
  return true;
}
