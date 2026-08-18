import { eq, and, desc, asc } from "drizzle-orm";
import { getDb } from "../db";
import { saasPlans, saasSubscriptions, users } from "../../drizzle/schema";

// ============================================================================
// SAAS PLANS CRUD
// ============================================================================

export async function getAllPlans(activeOnly = true) {
  const db = await getDb();
  if (!db) return [];

  const conditions = activeOnly ? eq(saasPlans.isActive, true) : undefined;
  
  return db
    .select()
    .from(saasPlans)
    .where(conditions)
    .orderBy(asc(saasPlans.displayOrder));
}

export async function getPlanById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [plan] = await db
    .select()
    .from(saasPlans)
    .where(eq(saasPlans.id, id))
    .limit(1);

  return plan || null;
}

export async function createPlan(data: {
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  priceMonthly: number;
  priceYearly?: number;
  currency?: string;
  maxNasDevices: number;
  maxCards: number;
  maxSubscribers?: number;
  featureMikrotikApi?: boolean;
  featureCoaDisconnect?: boolean;
  featureStaticVpnIp?: boolean;
  featureAdvancedReports?: boolean;
  featureCustomBranding?: boolean;
  featurePrioritySupport?: boolean;
  displayOrder?: number;
  isPopular?: boolean;
}) {
  const db = await getDb();
  if (!db) return null;

  const [result] = await db
    .insert(saasPlans)
    .values({
      name: data.name,
      nameAr: data.nameAr,
      description: data.description,
      descriptionAr: data.descriptionAr,
      priceMonthly: String(data.priceMonthly),
      priceYearly: data.priceYearly ? String(data.priceYearly) : null,
      currency: data.currency || "USD",
      maxNasDevices: data.maxNasDevices,
      maxCards: data.maxCards,
      maxSubscribers: data.maxSubscribers || 50,
      featureMikrotikApi: data.featureMikrotikApi || false,
      featureCoaDisconnect: data.featureCoaDisconnect ?? true,
      featureStaticVpnIp: data.featureStaticVpnIp || false,
      featureAdvancedReports: data.featureAdvancedReports || false,
      featureCustomBranding: data.featureCustomBranding || false,
      featurePrioritySupport: data.featurePrioritySupport || false,
      displayOrder: data.displayOrder || 0,
      isPopular: data.isPopular || false,
      isActive: true,
    })
    .$returningId();

  return result?.id;
}

export async function updatePlan(id: number, data: Partial<{
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  maxNasDevices: number;
  maxCards: number;
  maxSubscribers: number;
  featureMikrotikApi: boolean;
  featureCoaDisconnect: boolean;
  featureStaticVpnIp: boolean;
  featureAdvancedReports: boolean;
  featureCustomBranding: boolean;
  featurePrioritySupport: boolean;
  displayOrder: number;
  isPopular: boolean;
  isActive: boolean;
}>) {
  const db = await getDb();
  if (!db) return false;

  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.nameAr !== undefined) updateData.nameAr = data.nameAr;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.descriptionAr !== undefined) updateData.descriptionAr = data.descriptionAr;
  if (data.priceMonthly !== undefined) updateData.priceMonthly = String(data.priceMonthly);
  if (data.priceYearly !== undefined) updateData.priceYearly = String(data.priceYearly);
  if (data.currency !== undefined) updateData.currency = data.currency;
  if (data.maxNasDevices !== undefined) updateData.maxNasDevices = data.maxNasDevices;
  if (data.maxCards !== undefined) updateData.maxCards = data.maxCards;
  if (data.maxSubscribers !== undefined) updateData.maxSubscribers = data.maxSubscribers;
  if (data.featureMikrotikApi !== undefined) updateData.featureMikrotikApi = data.featureMikrotikApi;
  if (data.featureCoaDisconnect !== undefined) updateData.featureCoaDisconnect = data.featureCoaDisconnect;
  if (data.featureStaticVpnIp !== undefined) updateData.featureStaticVpnIp = data.featureStaticVpnIp;
  if (data.featureAdvancedReports !== undefined) updateData.featureAdvancedReports = data.featureAdvancedReports;
  if (data.featureCustomBranding !== undefined) updateData.featureCustomBranding = data.featureCustomBranding;
  if (data.featurePrioritySupport !== undefined) updateData.featurePrioritySupport = data.featurePrioritySupport;
  if (data.displayOrder !== undefined) updateData.displayOrder = data.displayOrder;
  if (data.isPopular !== undefined) updateData.isPopular = data.isPopular;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  await db
    .update(saasPlans)
    .set(updateData)
    .where(eq(saasPlans.id, id));

  return true;
}

export async function deletePlan(id: number) {
  const db = await getDb();
  if (!db) return false;

  // Soft delete - just deactivate
  await db
    .update(saasPlans)
    .set({ isActive: false })
    .where(eq(saasPlans.id, id));

  return true;
}

// ============================================================================
// SAAS SUBSCRIPTIONS
// ============================================================================

export async function getUserSubscription(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const [subscription] = await db
    .select()
    .from(saasSubscriptions)
    .where(and(
      eq(saasSubscriptions.userId, userId),
      eq(saasSubscriptions.status, "active")
    ))
    .orderBy(desc(saasSubscriptions.createdAt))
    .limit(1);

  return subscription || null;
}

export async function createSubscription(data: {
  userId: number;
  planId: number;
  planName: string;
  billingCycle: "monthly" | "yearly";
  amount: number;
  currency?: string;
  paymentMethod?: string;
  paymentReference?: string;
  activatedBy?: number;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return null;

  // Calculate dates
  const startDate = new Date();
  const endDate = new Date();
  if (data.billingCycle === "yearly") {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  // Create subscription
  const [result] = await db
    .insert(saasSubscriptions)
    .values({
      userId: data.userId,
      planId: data.planId,
      planName: data.planName,
      startDate,
      endDate,
      billingCycle: data.billingCycle,
      amount: String(data.amount),
      currency: data.currency || "USD",
      status: "active",
      paymentMethod: data.paymentMethod,
      paymentReference: data.paymentReference,
      activatedBy: data.activatedBy,
      notes: data.notes,
    })
    .$returningId();

  // Balance-based subscription (no more subscription fields in users table)
  await db
    .update(users)
    .set({
      status: "active",
    })
    .where(eq(users.id, data.userId));

  return result?.id;
}

export async function getSubscriptionHistory(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(saasSubscriptions)
    .where(eq(saasSubscriptions.userId, userId))
    .orderBy(desc(saasSubscriptions.createdAt));
}

// ============================================================================
// USER ACCOUNT STATUS
// ============================================================================

export async function getUserAccountInfo(userId: number) {
  const db = await getDb();
  if (!db) return null;

  // Balance-based subscription
  const [user] = await db
    .select({
      id: users.id,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  // Get wallet balance
  const { wallets } = await import("../../drizzle/schema");
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);

  const balance = wallet?.balance || '0.00';
  const accountStatus = parseFloat(balance) > 0 ? 'active' : 'expired';

  return {
    id: user.id,
    accountStatus,
    balance,
    plan: null,
    daysRemaining: 0,
    endDate: null,
  };
}

export async function activateUserSubscription(userId: number, planId: number, months: number, activatedBy: number, notes?: string) {
  const db = await getDb();
  if (!db) return false;

  const plan = await getPlanById(planId);
  if (!plan) return false;

  const amount = months >= 12 
    ? Number(plan.priceYearly || plan.priceMonthly) * (months / 12)
    : Number(plan.priceMonthly) * months;

  await createSubscription({
    userId,
    planId,
    planName: plan.name,
    billingCycle: months >= 12 ? "yearly" : "monthly",
    amount,
    activatedBy,
    notes,
  });

  return true;
}

export async function suspendUser(userId: number) {
  const db = await getDb();
  if (!db) return false;

  // Balance-based subscription (no more accountStatus field)
  // Suspend handled by setting wallet balance to 0

  // Also suspend any active subscriptions
  await db
    .update(saasSubscriptions)
    .set({ status: "suspended" })
    .where(and(
      eq(saasSubscriptions.userId, userId),
      eq(saasSubscriptions.status, "active")
    ));

  return true;
}

export async function reactivateUser(userId: number) {
  const db = await getDb();
  if (!db) return false;

  // Check if user has valid subscription
  const subscription = await getUserSubscription(userId);
  
  // Balance-based subscription (no more accountStatus field)
  // Reactivation handled by adding balance to wallet

  return true;
}
