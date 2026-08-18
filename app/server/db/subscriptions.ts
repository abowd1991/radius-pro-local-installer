import { eq, desc, and, isNull, or, sql, count } from "drizzle-orm";
import { getDb } from "../db";
import { radiusCards, radacct, onlineSessions, plans } from "../../drizzle/schema";
import { TenantContext, canSeeAllData, getEffectiveOwnerId } from "../tenant-isolation";
import { getFeatureFlag_UseOnlineSessionsRead } from '../v2/V2ServiceBridge';

// Get all active cards (subscriptions)
export async function getAllSubscriptions(options?: { status?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  if (options?.status) {
    return db.select()
      .from(radiusCards)
      .where(eq(radiusCards.status, options.status as any))
      .orderBy(desc(radiusCards.createdAt))
      .limit(options?.limit || 50);
  }
  
  return db.select()
    .from(radiusCards)
    .orderBy(desc(radiusCards.createdAt))
    .limit(options?.limit || 50);
}

export async function getSubscriptionsByUserId(userId: number, options?: { status?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(radiusCards.usedBy, userId)];
  
  if (options?.status) {
    conditions.push(eq(radiusCards.status, options.status as any));
  }
  
  return db.select()
    .from(radiusCards)
    .where(and(...conditions))
    .orderBy(desc(radiusCards.createdAt))
    .limit(options?.limit || 50);
}

// Get subscriptions with tenant isolation (supports sub-admins)
export async function getSubscriptionsByTenant(tenantContext: TenantContext, options?: { status?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  // Owner/super_admin see all
  if (canSeeAllData(tenantContext)) {
    return getAllSubscriptions(options);
  }
  
  // Others see only cards they own or created
  const effectiveUserId = getEffectiveOwnerId(tenantContext);
  
  let conditions = [
    or(
      eq(radiusCards.createdBy, effectiveUserId),
      eq(radiusCards.resellerId, effectiveUserId),
      eq(radiusCards.usedBy, effectiveUserId)
    )
  ];
  
  if (options?.status) {
    conditions.push(eq(radiusCards.status, options.status as any));
  }
  
  return db.select()
    .from(radiusCards)
    .where(and(...conditions))
    .orderBy(desc(radiusCards.createdAt))
    .limit(options?.limit || 50);
}

export async function getSubscriptionById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(radiusCards).where(eq(radiusCards.id, id)).limit(1);
  return result[0] || null;
}

export async function getSubscriptionByUsername(username: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(radiusCards).where(eq(radiusCards.username, username)).limit(1);
  return result[0] || null;
}

export async function updateSubscriptionStatus(id: number, status: "active" | "suspended" | "expired" | "cancelled") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(radiusCards).set({ status }).where(eq(radiusCards.id, id));
  return { success: true };
}

export async function renewSubscription(id: number, additionalDays: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const card = await getSubscriptionById(id);
  if (!card) throw new Error("Subscription not found");
  
  const currentExpiry = card.expiresAt ? new Date(card.expiresAt) : new Date();
  const now = new Date();
  const baseDate = currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(baseDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);
  
  await db.update(radiusCards)
    .set({
      expiresAt: newExpiry,
      status: "active",
    })
    .where(eq(radiusCards.id, id));
  
  return { success: true, newExpiresAt: newExpiry };
}

// Get active sessions from radacct (real RADIUS accounting)
export async function getActiveSessions(options?: { page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  // Phase 2C: online_sessions is the primary realtime source
  return db.select({
    username: onlineSessions.username,
    nasipaddress: onlineSessions.nasIp,
    acctstarttime: onlineSessions.startTime,
    acctsessiontime: onlineSessions.sessionTime,
    acctinputoctets: onlineSessions.inputOctets,
    acctoutputoctets: onlineSessions.outputOctets,
    framedipaddress: onlineSessions.framedIpAddress,
    acctuniqueid: onlineSessions.acctSessionId,
  })
    .from(onlineSessions)
    .orderBy(desc(onlineSessions.startTime))
    .limit(options?.limit || 50);
}

// Get online sessions — Phase 2C: primary source is online_sessions
export async function getOnlineSessions(options?: { page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  // online_sessions is always clean (stale cleanup every 30s)
  return db.select({
    username: onlineSessions.username,
    nasipaddress: onlineSessions.nasIp,
    acctstarttime: onlineSessions.startTime,
    acctsessiontime: onlineSessions.sessionTime,
    acctinputoctets: onlineSessions.inputOctets,
    acctoutputoctets: onlineSessions.outputOctets,
    framedipaddress: onlineSessions.framedIpAddress,
    acctuniqueid: onlineSessions.acctSessionId,
  })
    .from(onlineSessions)
    .orderBy(desc(onlineSessions.startTime))
    .limit(options?.limit || 50);
}

export async function getSessionsByUsername(username: string) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(radacct)
    .where(eq(radacct.username, username))
    .orderBy(desc(radacct.acctstarttime))
    .limit(100);
}

// Get session history from radacct
export async function getSessionHistory(options?: { 
  username?: string;
  nasIp?: string;
  page?: number; 
  limit?: number 
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (options?.username) {
    conditions.push(eq(radacct.username, options.username));
  }
  if (options?.nasIp) {
    conditions.push(eq(radacct.nasipaddress, options.nasIp));
  }
  
  if (conditions.length > 0) {
    return db.select()
      .from(radacct)
      .where(and(...conditions))
      .orderBy(desc(radacct.acctstarttime))
      .limit(options?.limit || 50);
  }
  
  return db.select()
    .from(radacct)
    .orderBy(desc(radacct.acctstarttime))
    .limit(options?.limit || 50);
}

export async function getActiveSubscriptionsCount(userId?: number) {
  const db = await getDb();
  if (!db) return 0;
  
  let query;
  if (userId) {
    query = db.select()
      .from(radiusCards)
      .where(and(eq(radiusCards.status, "active"), eq(radiusCards.usedBy, userId)));
  } else {
    query = db.select()
      .from(radiusCards)
      .where(eq(radiusCards.status, "active"));
  }
  
  const result = await query;
  return result.length;
}

// Get active sessions count — Phase 2C: online_sessions is the primary realtime source
export async function getActiveSessionsCount() {
  const db = await getDb();
  if (!db) return 0;
  // online_sessions is always clean — stale cleanup runs every 30s
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(onlineSessions);
  return Number(result[0]?.count || 0);
}

// Disconnect a session (requires MikroTik API integration)
export async function disconnectSession(acctSessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // This would typically call MikroTik API to disconnect the user
  // For now, we just mark it in the database
  await db.update(radacct)
    .set({
      acctstoptime: new Date(),
      acctterminatecause: "Admin-Reset",
    })
    .where(eq(radacct.acctsessionid, acctSessionId));
  
  return { success: true };
}
