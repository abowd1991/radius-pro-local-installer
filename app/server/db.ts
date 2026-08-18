import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { InsertUser, users } from "../drizzle/schema";
import * as permissionDb from "./db-permission-plans";
import { ENV } from './_core/env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Parse DATABASE_URL - support both TiDB Cloud (SSL) and local MySQL (no SSL)
      const rawUrl = process.env.DATABASE_URL;
      const dbUrl = rawUrl.split('?')[0]; // Remove query params
      const isLocalMySQL = rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1');
      const pool = createPool({
        uri: dbUrl,
        ...(isLocalMySQL ? {} : { ssl: { rejectUnauthorized: true } }),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        // The MySQL session and Node process both use UTC. Timestamp columns are therefore
        // read and written as instants; owner/NAS timezone is only applied at the boundary/UI layer.
        timezone: 'Z',
        dateStrings: true,
      });
      // mysql2's `timezone` controls client conversion only. Set the MySQL session as
      // well so DATE strings, NOW(), and TIMESTAMP comparisons all share UTC semantics.
      pool.on("connection", (connection) => {
        connection.query("SET time_zone = '+00:00'");
      });
      _db = drizzle({ client: pool });
      console.log("[Database] Connected successfully");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "phone", "address"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      // Owner gets super_admin role
      values.role = 'super_admin';
      updateSet.role = 'super_admin';
    } else {
      // All other OAuth users get client role by default
      // Admin/Super Admin can only be created manually by Owner
      values.role = 'client';
      // Don't update role on duplicate - preserve existing role
    }

    // Auto-assign default permission plan for new users
    if (values.role === 'client' || values.role === 'reseller') {
      try {
        const defaultPlan = await permissionDb.getDefaultPlanForRole(values.role as 'client' | 'reseller');
        if (defaultPlan) {
          values.permissionPlanId = defaultPlan.id;
          // Only set on insert, not on update
        }
      } catch (error) {
        console.warn(`[Database] Failed to get default plan for role ${values.role}:`, error);
      }
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// USER QUERIES
// ============================================================================

export async function getAllUsers(limit?: number) {
  const db = await getDb();
  if (!db) return [];
  // Default limit 2000 to prevent full table scan on large datasets
  const safeLimit = limit ?? 2000;
  return db.select().from(users).limit(safeLimit);
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getUsersByRole(role: 'super_admin' | 'reseller' | 'client') {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.role, role));
}

export async function getUsersByResellerId(resellerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).where(eq(users.resellerId, resellerId));
}

export async function updateUserStatus(userId: number, status: 'active' | 'suspended' | 'inactive') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ status }).where(eq(users.id, userId));
  return { success: true };
}

export async function updateUserLastSignedIn(userId: number, lastSignedIn: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ lastSignedIn }).where(eq(users.id, userId));
  return { success: true };
}

export async function updateUserRole(userId: number, role: 'super_admin' | 'reseller' | 'client') {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ role }).where(eq(users.id, userId));
  return { success: true };
}

export async function assignReseller(userId: number, resellerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ resellerId }).where(eq(users.id, userId));
  return { success: true };
}

export async function updateUser(userId: number, data: { name?: string; companyName?: string; phone?: string; address?: string; avatarUrl?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set(data).where(eq(users.id, userId));
  const updated = await db.select().from(users).where(eq(users.id, userId));
  return updated[0];
}


// ============================================================================
// SYSTEM SETTINGS
// ============================================================================

import { systemSettings } from "../drizzle/schema";

export async function getSystemSettings(): Promise<Record<string, string>> {
  const { cache } = await import('./_core/cache.js');
  const CACHE_KEY = 'db:systemSettings';
  const CACHE_TTL = 5 * 60; // 5 minutes

  const cached = cache.get<Record<string, string>>(CACHE_KEY);
  if (cached) return cached;

  const db = await getDb();
  if (!db) return {};
  
  const settings = await db.select().from(systemSettings);
  const result: Record<string, string> = {};
  
  for (const setting of settings) {
    result[setting.key] = setting.value || '';
  }
  
  cache.set(CACHE_KEY, result, CACHE_TTL);
  return result;
}

export async function getSystemSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  const value = result[0]?.value;
  
  // إذا لم يكن محدداً بعد: الرد التلقائي مفعّل افتراضياً
  if (value === undefined || value === null) {
    if (key === 'ai_auto_reply_enabled') return 'true';
  }
  return value || null;
}

export async function setSystemSetting(key: string, value: string, description?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(systemSettings)
    .values({ key, value, description })
    .onDuplicateKeyUpdate({ set: { value, description } });
  
  // Invalidate cache so next read gets fresh data
  const { cache } = await import('./_core/cache.js');
  cache.delete('db:systemSettings');
}


// ============================================================================
// PPPoE SUBSCRIBERS QUERIES
// ============================================================================

import { subscribers, subscriberSubscriptions, plans, nasDevices } from "../drizzle/schema";
import { or, desc, and, lte, gte, sql } from "drizzle-orm";

export type SubscriberStatus = 'active' | 'suspended' | 'expired' | 'pending';
export type SubscriberPaymentMethod = 'cash' | 'wallet' | 'card' | 'bank_transfer' | 'online';

export interface CreateSubscriberInput {
  username: string;
  password: string;
  ownerId: number;
  createdBy: number;
  fullName: string;
  phone?: string;
  email?: string;
  address?: string;
  nationalId?: string;
  notes?: string;
  planId: number;
  nasId?: number;
  ipAssignmentType?: 'dynamic' | 'static';
  staticIp?: string;
  simultaneousUse?: number;
  macAddress?: string;
  macBindingEnabled?: boolean;
  subscriptionMonths?: number;
  subscriptionEndDate?: Date;
  amount?: number;
  paymentMethod?: SubscriberPaymentMethod;
}

// Get all subscribers for an owner (multi-tenant)
export async function getSubscribersByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const rows = await db.select({
    subscriber: subscribers,
    plan: {
      id: plans.id,
      name: plans.name,
      downloadSpeed: plans.downloadSpeed,
      uploadSpeed: plans.uploadSpeed,
      price: plans.price,
    },
    nas: {
      id: nasDevices.id,
      nasname: nasDevices.nasname,
      shortname: nasDevices.shortname,
    }
  })
  .from(subscribers)
  .leftJoin(plans, eq(subscribers.planId, plans.id))
  .leftJoin(nasDevices, eq(subscribers.nasId, nasDevices.id))
  .where(or(eq(subscribers.ownerId, ownerId), eq(subscribers.createdBy, ownerId)))
  .orderBy(desc(subscribers.createdAt));

  if (rows.length === 0) return [];

  // Phase 2C: Fetch active sessions from online_sessions (realtime source)
  const { onlineSessions } = await import('../drizzle/schema');
  const { inArray } = await import('drizzle-orm');
  const usernames = rows.map((r: any) => r.subscriber.username);
  const activeSessions = await db.select({
    username: onlineSessions.username,
    framedipaddress: onlineSessions.framedIpAddress,
    acctstarttime: onlineSessions.startTime,
    acctsessiontime: onlineSessions.sessionTime,
    acctinputoctets: onlineSessions.inputOctets,
    acctoutputoctets: onlineSessions.outputOctets,
  })
  .from(onlineSessions)
  .where(inArray(onlineSessions.username, usernames));

  const sessionMap = new Map(activeSessions.map((s: any) => [s.username, s]));

  return rows.map((r: any) => ({
    ...r,
    activeSession: sessionMap.get(r.subscriber.username) || null,
  }));
}

// Get subscriber by ID
export async function getSubscriberById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select({
    subscriber: subscribers,
    plan: {
      id: plans.id,
      name: plans.name,
      downloadSpeed: plans.downloadSpeed,
      uploadSpeed: plans.uploadSpeed,
      price: plans.price,

    },
    nas: {
      id: nasDevices.id,
      nasname: nasDevices.nasname,
      shortname: nasDevices.shortname,
    }
  })
  .from(subscribers)
  .leftJoin(plans, eq(subscribers.planId, plans.id))
  .leftJoin(nasDevices, eq(subscribers.nasId, nasDevices.id))
  .where(eq(subscribers.id, id))
  .limit(1);
  
  return result[0];
}

// Check if username exists
export async function subscriberUsernameExists(username: string) {
  const db = await getDb();
  if (!db) return false;
  
  // Check globally: subscribers table + radius_cards table + radcheck (FreeRADIUS)
  const [subResult, cardResult, radcheckResult] = await Promise.all([
    db.select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.username, username))
      .limit(1),
    db.execute(sql`SELECT id FROM radius_cards WHERE username = ${username} LIMIT 1`),
    db.execute(sql`SELECT id FROM radcheck WHERE username = ${username} LIMIT 1`),
  ]);
  
  const cardRows = (cardResult as any)[0] as any[];
  const radcheckRows = (radcheckResult as any)[0] as any[];
  
  return subResult.length > 0 || cardRows.length > 0 || radcheckRows.length > 0;
}

// Create new subscriber
export async function createSubscriber(input: CreateSubscriberInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Calculate subscription dates
  const now = new Date();
  let endDate: Date;
  if (input.subscriptionEndDate) {
    // Use exact end date if provided
    endDate = new Date(input.subscriptionEndDate);
  } else {
    const months = input.subscriptionMonths || 1;
    endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + months);
  }
  
  // Insert subscriber
  const [result] = await db.insert(subscribers).values({
    username: input.username,
    password: input.password,
    ownerId: input.ownerId,
    createdBy: input.createdBy,
    fullName: input.fullName,
    phone: input.phone || null,
    email: input.email || null,
    address: input.address || null,
    nationalId: input.nationalId || null,
    notes: input.notes || null,
    planId: input.planId,
    nasId: input.nasId || null,
    ipAssignmentType: input.ipAssignmentType || 'dynamic',
    staticIp: input.staticIp || null,
    simultaneousUse: input.simultaneousUse || 1,
    macAddress: input.macAddress || null,
    macBindingEnabled: input.macBindingEnabled || false,
    status: 'active',
    subscriptionStartDate: now,
    subscriptionEndDate: endDate,
  });
  
  const subscriberId = result.insertId;
  
  // Create subscription record
  if (input.amount && input.amount > 0) {
    await db.insert(subscriberSubscriptions).values({
      subscriberId: subscriberId,
      startDate: now,
      endDate: endDate,
      planId: input.planId,
      planName: '', // Will be filled by the caller
      amount: input.amount.toString(),
      currency: 'USD',
      paymentMethod: input.paymentMethod || 'cash',
      status: 'active',
      processedBy: input.createdBy,
      notes: input.notes || null,
    });
  }
  
  return subscriberId;
}

// Update subscriber
export async function updateSubscriber(id: number, data: Partial<{
  username: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  nationalId: string;
  notes: string;
  planId: number;
  nasId: number;
  ipAssignmentType: 'dynamic' | 'static';
  staticIp: string;
  simultaneousUse: number;
  macAddress: string;
  macBindingEnabled: boolean;
  status: SubscriberStatus;
  subscriptionEndDate: Date;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(subscribers)
    .set(data)
    .where(eq(subscribers.id, id));
}

// Suspend subscriber
export async function suspendSubscriber(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(subscribers)
    .set({ status: 'suspended' })
    .where(eq(subscribers.id, id));
}

// Activate subscriber
export async function activateSubscriber(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(subscribers)
    .set({ status: 'active' })
    .where(eq(subscribers.id, id));
}

// Renew subscription
export async function renewSubscription(
  subscriberId: number, 
  months: number, 
  amount: number, 
  processedBy: number,
  paymentMethod: SubscriberPaymentMethod = 'cash',
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get current subscriber
  const [subscriber] = await db.select()
    .from(subscribers)
    .where(eq(subscribers.id, subscriberId))
    .limit(1);
  
  if (!subscriber) throw new Error("Subscriber not found");
  
  // Calculate new end date
  const now = new Date();
  const currentEnd = subscriber.subscriptionEndDate || now;
  const startDate = currentEnd > now ? currentEnd : now;
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + months);
  
  // Get plan name
  const [plan] = await db.select({ name: plans.name })
    .from(plans)
    .where(eq(plans.id, subscriber.planId))
    .limit(1);
  
  // Update subscriber
  await db.update(subscribers)
    .set({ 
      status: 'active',
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      expiryReminderSentAt: null, // Reset so reminder fires again for new expiry
    })
    .where(eq(subscribers.id, subscriberId));
  
  // Create subscription record
  await db.insert(subscriberSubscriptions).values({
    subscriberId: subscriberId,
    startDate: startDate,
    endDate: endDate,
    planId: subscriber.planId,
    planName: plan?.name || 'Unknown',
    amount: amount.toString(),
    currency: 'USD',
    paymentMethod: paymentMethod,
    status: 'active',
    processedBy: processedBy,
    notes: notes || null,
  });
  
  return { startDate, endDate };
}

// Get subscription history
export async function getSubscriptionHistory(subscriberId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(subscriberSubscriptions)
    .where(eq(subscriberSubscriptions.subscriberId, subscriberId))
    .orderBy(desc(subscriberSubscriptions.createdAt));
}

// Get expired subscribers (for cron job)
export async function getExpiredSubscribers() {
  const db = await getDb();
  if (!db) return [];
  
  const now = new Date();
  
  return db.select()
    .from(subscribers)
    .where(and(
      eq(subscribers.status, 'active'),
      lte(subscribers.subscriptionEndDate, now)
    ));
}

// Mark subscriber as expired
export async function markSubscriberExpired(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(subscribers)
    .set({ status: 'expired' })
    .where(eq(subscribers.id, id));
}

// Get subscriber stats for owner
export async function getSubscriberStats(ownerId: number) {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, suspended: 0, expired: 0, pending: 0 };
  
  const result = await db.select({
    status: subscribers.status,
    count: sql<number>`COUNT(*)`,
  })
  .from(subscribers)
  .where(or(eq(subscribers.ownerId, ownerId), eq(subscribers.createdBy, ownerId)))
  .groupBy(subscribers.status);
  
  const stats = { total: 0, active: 0, suspended: 0, expired: 0, pending: 0 };
  
  for (const row of result) {
    const count = Number(row.count);
    stats.total += count;
    if (row.status === 'active') stats.active = count;
    else if (row.status === 'suspended') stats.suspended = count;
    else if (row.status === 'expired') stats.expired = count;
    else if (row.status === 'pending') stats.pending = count;
  }
  
  return stats;
}

// Delete subscriber
export async function deleteSubscriber(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete subscription history first
  await db.delete(subscriberSubscriptions)
    .where(eq(subscriberSubscriptions.subscriberId, id));
  
  // Delete subscriber
  await db.delete(subscribers)
    .where(eq(subscribers.id, id));
}

// Update last login
export async function updateSubscriberLastLogin(id: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(subscribers)
    .set({ lastLoginAt: new Date() })
    .where(eq(subscribers.id, id));
}

// ============================================================================
// VPN CONNECTIONS QUERIES
// ============================================================================

import { vpnConnections, vpnLogs, VpnConnection, InsertVpnConnection, VpnLog, InsertVpnLog } from "../drizzle/schema";

// Get VPN connection by NAS ID
export async function getVpnConnectionByNasId(nasId: number): Promise<VpnConnection | null> {
  const db = await getDb();
  if (!db) return null;
  
  const [result] = await db.select()
    .from(vpnConnections)
    .where(eq(vpnConnections.nasId, nasId))
    .limit(1);
  
  return result || null;
}

// Get all VPN connections with NAS info
export async function getAllVpnConnections(ownerId?: number) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select({
    vpn: vpnConnections,
    nas: {
      id: nasDevices.id,
      nasname: nasDevices.nasname,
      shortname: nasDevices.shortname,
      connectionType: nasDevices.connectionType,
      vpnUsername: nasDevices.vpnUsername,
      status: nasDevices.status,
      ownerId: nasDevices.ownerId,
    }
  })
  .from(vpnConnections)
  .leftJoin(nasDevices, eq(vpnConnections.nasId, nasDevices.id));
  
  if (ownerId) {
    query = query.where(eq(nasDevices.ownerId, ownerId)) as typeof query;
  }
  
  return query.orderBy(desc(vpnConnections.updatedAt));
}

// Create or update VPN connection
export async function upsertVpnConnection(data: InsertVpnConnection): Promise<VpnConnection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if exists
  const existing = await getVpnConnectionByNasId(data.nasId);
  
  if (existing) {
    // Update
    await db.update(vpnConnections)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(vpnConnections.nasId, data.nasId));
    
    return { ...existing, ...data } as VpnConnection;
  } else {
    // Insert
    const [result] = await db.insert(vpnConnections)
      .values(data)
      .$returningId();
    
    return { id: result.id, ...data } as VpnConnection;
  }
}

// Update VPN connection status
export async function updateVpnConnectionStatus(
  nasId: number, 
  status: 'connected' | 'disconnected' | 'connecting' | 'error',
  additionalData?: Partial<InsertVpnConnection>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: Partial<InsertVpnConnection> = {
    status,
    ...additionalData,
  };
  
  if (status === 'connected') {
    updateData.lastConnectedAt = new Date();
  } else if (status === 'disconnected') {
    updateData.lastDisconnectedAt = new Date();
  }
  
  await db.update(vpnConnections)
    .set(updateData)
    .where(eq(vpnConnections.nasId, nasId));
}

// Increment disconnect count
export async function incrementVpnDisconnectCount(nasId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(vpnConnections)
    .set({
      disconnectCount: sql`${vpnConnections.disconnectCount} + 1`,
      lastDisconnectedAt: new Date(),
    })
    .where(eq(vpnConnections.nasId, nasId));
}

// ============================================================================
// VPN LOGS QUERIES
// ============================================================================

// Add VPN log entry
export async function addVpnLog(data: InsertVpnLog): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(vpnLogs)
    .values(data)
    .$returningId();
  
  return result.id;
}

// Get VPN logs for a NAS
export async function getVpnLogsByNasId(nasId: number, limit: number = 100): Promise<VpnLog[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select()
    .from(vpnLogs)
    .where(eq(vpnLogs.nasId, nasId))
    .orderBy(desc(vpnLogs.createdAt))
    .limit(limit);
}

// Get all VPN logs with filtering
export async function getVpnLogs(options: {
  nasId?: number;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  ownerId?: number;
}) {
  const db = await getDb();
  if (!db) return { logs: [], total: 0 };
  
  const conditions = [];
  
  if (options.nasId) {
    conditions.push(eq(vpnLogs.nasId, options.nasId));
  }
  
  if (options.eventType) {
    conditions.push(eq(vpnLogs.eventType, options.eventType as any));
  }
  
  if (options.startDate) {
    conditions.push(gte(vpnLogs.createdAt, options.startDate));
  }
  
  if (options.endDate) {
    conditions.push(lte(vpnLogs.createdAt, options.endDate));
  }
  
  // Build query with NAS join for owner filtering
  let baseQuery = db.select({
    log: vpnLogs,
    nas: {
      id: nasDevices.id,
      shortname: nasDevices.shortname,
      ownerId: nasDevices.ownerId,
    }
  })
  .from(vpnLogs)
  .leftJoin(nasDevices, eq(vpnLogs.nasId, nasDevices.id));
  
  if (options.ownerId) {
    conditions.push(eq(nasDevices.ownerId, options.ownerId));
  }
  
  if (conditions.length > 0) {
    baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
  }
  
  // Get total count
  const countResult = await db.select({ count: sql<number>`COUNT(*)` })
    .from(vpnLogs)
    .leftJoin(nasDevices, eq(vpnLogs.nasId, nasDevices.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  
  const total = Number(countResult[0]?.count || 0);
  
  // Get logs with pagination
  const logs = await baseQuery
    .orderBy(desc(vpnLogs.createdAt))
    .limit(options.limit || 100)
    .offset(options.offset || 0);
  
  return { logs, total };
}

// Get VPN connection stats
export async function getVpnConnectionStats(ownerId?: number) {
  const db = await getDb();
  if (!db) return { total: 0, connected: 0, disconnected: 0, connecting: 0, error: 0 };
  
  let query = db.select({
    status: vpnConnections.status,
    count: sql<number>`COUNT(*)`,
  })
  .from(vpnConnections)
  .leftJoin(nasDevices, eq(vpnConnections.nasId, nasDevices.id));
  
  if (ownerId) {
    query = query.where(eq(nasDevices.ownerId, ownerId)) as typeof query;
  }
  
  const result = await query.groupBy(vpnConnections.status);
  
  const stats = { total: 0, connected: 0, disconnected: 0, connecting: 0, error: 0 };
  
  for (const row of result) {
    const count = Number(row.count);
    stats.total += count;
    if (row.status === 'connected') stats.connected = count;
    else if (row.status === 'disconnected') stats.disconnected = count;
    else if (row.status === 'connecting') stats.connecting = count;
    else if (row.status === 'error') stats.error = count;
  }
  
  return stats;
}

// Delete VPN connection and logs
export async function deleteVpnConnectionByNasId(nasId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete logs first
  await db.delete(vpnLogs)
    .where(eq(vpnLogs.nasId, nasId));
  
  // Delete connection
  await db.delete(vpnConnections)
    .where(eq(vpnConnections.nasId, nasId));
}
