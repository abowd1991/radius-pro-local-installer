import { eq, desc, and, or, sql, inArray, like, count } from "drizzle-orm";
import { getDb } from "../db";
import { radiusCards, cardBatches, radcheck, radreply, radusergroup, radacct, onlineSessions, cardLifecycleSessions, plans, InsertRadiusCard, InsertCardBatch } from "../../drizzle/schema";
import { TenantContext, buildTenantFilter } from "../tenant-isolation";
import { nanoid } from "nanoid";
import { getFeatureFlag_UseOnlineSessionsRead } from '../v2/V2ServiceBridge';
import { buildLifecycleActivityMap } from "../domains/vouchers/CardLifecycleActivityPolicy";
import { formatFreeRadiusExpiration } from "../core/FreeRadiusTime";

// Helper: insert radreply using ON DUPLICATE KEY UPDATE to handle unique constraint on (username, attribute)
async function upsertRadreply(db: any, values: { username: string; attribute: string; op: string; value: string }[]) {
  for (const rv of values) {
    await db.execute(
      sql`INSERT INTO radreply (username, attribute, op, value)
        VALUES (${rv.username}, ${rv.attribute}, ${rv.op}, ${rv.value})
        ON DUPLICATE KEY UPDATE value = ${rv.value}, op = ${rv.op}`
    );
  }
}

// Helper function to check if user is admin (owner or super_admin)
const isAdmin = (role: string) => role === 'owner' || role === 'super_admin';

// Generate random username for RADIUS
function generateUsername(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let username = "user_";
  for (let i = 0; i < 8; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return username;
}

// Generate random password for RADIUS
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Generate serial number for card
function generateSerialNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let serial = "";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) serial += "-";
    serial += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return serial;
}

// Calculate expiration based on plan validity
function calculateExpiration(plan: any, startFrom: "first_login" | "card_creation"): Date | null {
  if (startFrom === "first_login") {
    return null; // Will be set on first login
  }
  
  const now = new Date();
  switch (plan.validityType) {
    case "minutes":
      return new Date(now.getTime() + plan.validityValue * 60 * 1000);
    case "hours":
      return new Date(now.getTime() + plan.validityValue * 60 * 60 * 1000);
    case "days":
    default:
      return new Date(now.getTime() + plan.validityValue * 24 * 60 * 60 * 1000);
  }
}

// Insert RADIUS attributes for a card
async function insertRadiusAttributes(db: any, username: string, password: string, plan: any, expiresAt?: Date | null) {
  // Simultaneous-Use: if autoDisconnect is enabled, minimum 2 so FreeRADIUS accepts
  // the new session while the old one is being disconnected by our service.
  const baseSimUse = plan.simultaneousUse || 1;
  const effectiveSimUse = plan.autoDisconnect ? Math.max(2, baseSimUse) : baseSimUse;

  // Insert into radcheck (authentication + control)
  await db.insert(radcheck).values([
    { username, attribute: "Cleartext-Password", op: ":=", value: password },
    { username, attribute: "Simultaneous-Use", op: ":=", value: String(effectiveSimUse) },
    { username, attribute: "Auth-Type", op: ":=", value: "Accept" },
    {
      username,
      attribute: "Expiration",
      op: ":=",
      value: expiresAt ? formatFreeRadiusExpiration(expiresAt) : 'Jan 01 2099 00:00:00',
    },
  ]);
  
  // Build radreply attributes
  const replyAttributes: { username: string; attribute: string; op: string; value: string }[] = [];
  
  // Speed limit (MikroTik Rate-Limit)
  if (plan.mikrotikRateLimit) {
    replyAttributes.push({
      username,
      attribute: "Mikrotik-Rate-Limit",
      op: "=",
      value: plan.mikrotikRateLimit,
    });
  } else if (plan.downloadSpeed && plan.uploadSpeed) {
    // MikroTik format: rx-rate/tx-rate = upload/download
    const rateLimit = `${plan.uploadSpeed}k/${plan.downloadSpeed}k`;
    replyAttributes.push({
      username,
      attribute: "Mikrotik-Rate-Limit",
      op: "=",
      value: rateLimit,
    });
  }
  
  // Session timeout
  if (plan.sessionTimeout) {
    replyAttributes.push({
      username,
      attribute: "Session-Timeout",
      op: "=",
      value: String(plan.sessionTimeout),
    });
  }
  
  // NOTE: Idle-Timeout is NOT sent from RADIUS
  // It is managed by MikroTik Hotspot per client: /ip hotspot server set idle-timeout=<time>
  
  // Address pool
  if (plan.mikrotikAddressPool) {
    replyAttributes.push({
      username,
      attribute: "Framed-Pool",
      op: "=",
      value: plan.mikrotikAddressPool,
    });
  }
  
  // Data limit (if set) - use Mikrotik-Total-Limit for data cap (bytes)
  // IMPORTANT: Max-All-Session is reserved for TIME limits (seconds) in this system
  // Using dataLimit (bytes) in Max-All-Session would cause sessionMonitor to grant billions of seconds!
  if (plan.dataLimit) {
    replyAttributes.push({
      username,
      attribute: "Mikrotik-Total-Limit",
      op: ":=",
      value: String(plan.dataLimit),
    });
  }

  // Port-Limit: overrides MikroTik Hotspot's local "Shared Users" restriction
  // MikroTik respects Port-Limit from RADIUS over its own Shared Users setting
  replyAttributes.push({
    username,
    attribute: "Port-Limit",
    op: ":=",
    value: String(effectiveSimUse),
  });
  
  // Insert reply attributes using upsert to handle unique constraint
  if (replyAttributes.length > 0) {
    await upsertRadreply(db, replyAttributes);
  }
  
  // NAS Isolation: مجموعة واحدة لكل كرت
  // - كرت عادي → owner_{ownerId} في radusergroup
  // - كرت مقيد على NAS محدد → HG_plan_{planId} في radusergroup
  // ملاحظة: هذه الدالة تُستدعى فقط للكروت العادية (بدون NAS restriction)
  // الكروت المقيدة تُعالَج في generateCardsV2.ts و generate.ts
  if (plan.ownerId) {
    await db.execute(
      sql`INSERT INTO radusergroup (username, groupname, priority)
          VALUES (${username}, ${`owner_${plan.ownerId}`}, 1)
          ON DUPLICATE KEY UPDATE groupname = ${`owner_${plan.ownerId}`}`
    );
  }
}

// Shared card select fields
const cardSelectFields = {
  id: radiusCards.id,
  username: radiusCards.username,
  password: radiusCards.password,
  authType: radiusCards.authType,
  serialNumber: radiusCards.serialNumber,
  batchId: radiusCards.batchId,
  planId: radiusCards.planId,
  planName: plans.name,
  createdBy: radiusCards.createdBy,
  resellerId: radiusCards.resellerId,
  usedBy: radiusCards.usedBy,
  status: radiusCards.status,
  activatedAt: radiusCards.activatedAt,
  firstLoginAt: radiusCards.firstLoginAt,
  expiresAt: radiusCards.expiresAt,
  totalSessionTime: radiusCards.totalSessionTime,
  totalDataUsed: radiusCards.totalDataUsed,
  lastActivity: radiusCards.lastActivity,
  usageBudgetSeconds: radiusCards.usageBudgetSeconds,
  windowSeconds: radiusCards.windowSeconds,
  firstUseAt: radiusCards.firstUseAt,
  windowEndTime: radiusCards.windowEndTime,
  purchasePrice: radiusCards.purchasePrice,
  salePrice: radiusCards.salePrice,
  fullName: radiusCards.fullName,
  phone: radiusCards.phone,
  notes: radiusCards.notes,
  isManual: radiusCards.isManual,
  simultaneousUse: radiusCards.simultaneousUse,
  createdAt: radiusCards.createdAt,
  updatedAt: radiusCards.updatedAt,
};

// Options type for server-side filtering + pagination
export interface CardListOptions {
  status?: string;
  batchId?: string;
  search?: string;   // search in username, serialNumber, password
  isManual?: boolean;
  page?: number;     // 1-based
  limit?: number;    // items per page
}

export interface CardListResult {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getAllCards(options?: CardListOptions): Promise<CardListResult> {
  const db = await getDb();
  if (!db) return { data: [], total: 0, page: 1, limit: 50, totalPages: 0 };
  
  const conditions: any[] = [];
  
  if (options?.status) conditions.push(eq(radiusCards.status, options.status as any));
  if (options?.batchId) conditions.push(eq(radiusCards.batchId, options.batchId));
  if (options?.isManual !== undefined) conditions.push(eq(radiusCards.isManual, options.isManual));
  if (options?.search) {
    const q = `%${options.search}%`;
    conditions.push(or(
      like(radiusCards.username, q),
      like(radiusCards.serialNumber, q),
      like(radiusCards.password, q),
      like(radiusCards.notes, q),
    ));
  }
  
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const offset = (page - 1) * limit;
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [totalResult, data] = await Promise.all([
    db.select({ total: count() }).from(radiusCards).leftJoin(plans, eq(radiusCards.planId, plans.id))
      .where(whereClause as any),
    db.select(cardSelectFields).from(radiusCards).leftJoin(plans, eq(radiusCards.planId, plans.id))
      .where(whereClause as any)
      .orderBy(desc(radiusCards.createdAt))
      .limit(limit)
      .offset(offset),
  ]);
  
  const total = Number(totalResult[0]?.total ?? 0);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// Get cards by reseller/owner - includes cards where user is resellerId OR createdBy
export async function getCardsByReseller(userId: number, options?: CardListOptions): Promise<CardListResult> {
  const db = await getDb();
  if (!db) return { data: [], total: 0, page: 1, limit: 50, totalPages: 0 };

  const ownerFilter = or(
    eq(radiusCards.resellerId, userId),
    eq(radiusCards.createdBy, userId)
  );

  const conditions: any[] = [ownerFilter];

  if (options?.status) conditions.push(eq(radiusCards.status, options.status as any));
  if (options?.batchId) conditions.push(eq(radiusCards.batchId, options.batchId));
  if (options?.isManual !== undefined) conditions.push(eq(radiusCards.isManual, options.isManual));
  if (options?.search) {
    const q = `%${options.search}%`;
    conditions.push(or(
      like(radiusCards.username, q),
      like(radiusCards.serialNumber, q),
      like(radiusCards.password, q),
      like(radiusCards.notes, q),
    ));
  }

  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  const offset = (page - 1) * limit;

  const whereClause = and(...conditions);

  const [totalResult, data] = await Promise.all([
    db.select({ total: count() }).from(radiusCards).leftJoin(plans, eq(radiusCards.planId, plans.id)).where(whereClause),
    db.select(cardSelectFields).from(radiusCards).leftJoin(plans, eq(radiusCards.planId, plans.id))
      .where(whereClause)
      .orderBy(desc(radiusCards.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const total = Number(totalResult[0]?.total ?? 0);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// Get cards with tenant isolation (supports sub-admins)
export async function getCardsByTenant(tenantContext: TenantContext, options?: { status?: string; batchId?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const effectiveOwnerId = tenantContext.role === 'client_admin' || tenantContext.role === 'client_staff' 
    ? tenantContext.tenantId! 
    : tenantContext.userId;
  
  // Filter by resellerId OR createdBy for multi-tenant isolation
  let conditions = [
    or(
      eq(radiusCards.resellerId, effectiveOwnerId),
      eq(radiusCards.createdBy, effectiveOwnerId)
    )
  ];
  
  if (options?.status) {
    conditions.push(eq(radiusCards.status, options.status as any));
  }
  if (options?.batchId) {
    conditions.push(eq(radiusCards.batchId, options.batchId));
  }
  
  // Owner/super_admin see all
  if (isAdmin(tenantContext.role)) {
    conditions = [];
    if (options?.status) {
      conditions.push(eq(radiusCards.status, options.status as any));
    }
    if (options?.batchId) {
      conditions.push(eq(radiusCards.batchId, options.batchId));
    }
  }
  
  const query = db.select().from(radiusCards);
  
  if (conditions.length > 0) {
    return query
      .where(and(...conditions))
      .orderBy(desc(radiusCards.createdAt))
      .limit(options?.limit || 50);
  }
  
  return query
    .orderBy(desc(radiusCards.createdAt))
    .limit(options?.limit || 50);
}

export async function getCardById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(radiusCards).where(eq(radiusCards.id, id)).limit(1);
  return result[0] || null;
}

export async function getCardBySerial(serialNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(radiusCards).where(eq(radiusCards.serialNumber, serialNumber)).limit(1);
  return result[0] || null;
}

export async function getCardByUsername(username: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(radiusCards).where(eq(radiusCards.username, username)).limit(1);
  return result[0] || null;
}

// Generate username with configurable length and prefix
function generateUsernameWithOptions(length: number = 6, prefix: string = ''): string {
  const chars = '0123456789';
  let result = prefix;
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate password with configurable length
function generatePasswordWithLength(length: number = 4): string {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Activate a card (when user first uses it)
export async function activateCard(serialNumber: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const card = await getCardBySerial(serialNumber);
  
  if (!card) {
    throw new Error("Invalid card serial number");
  }
  
  if (card.status !== "unused") {
    throw new Error("Card has already been used or is expired");
  }
  
  // Get plan for expiration calculation
  const planResult = await db.select().from(plans).where(eq(plans.id, card.planId)).limit(1);
  const plan = planResult[0];
  
  // Calculate expiration from first login if not already set
  let expiresAt = card.expiresAt;
  if (!expiresAt && plan) {
    expiresAt = calculateExpiration(plan, "first_login");
    if (!expiresAt) {
      // Default to plan validity from now
      const now = new Date();
      switch (plan.validityType) {
        case "minutes":
          expiresAt = new Date(now.getTime() + plan.validityValue * 60 * 1000);
          break;
        case "hours":
          expiresAt = new Date(now.getTime() + plan.validityValue * 60 * 60 * 1000);
          break;
        case "days":
        default:
          expiresAt = new Date(now.getTime() + plan.validityValue * 24 * 60 * 60 * 1000);
      }
    }
    
    // Update radcheck with Expiration attribute
    await db.insert(radcheck).values({
      username: card.username,
      attribute: "Expiration",
      op: ":=",
      value: formatFreeRadiusExpiration(expiresAt),
    });
  }
  
  // Mark card as active
  await db.update(radiusCards)
    .set({
      status: "active",
      usedBy: userId,
      activatedAt: new Date(),
      firstLoginAt: new Date(),
      expiresAt,
    })
    .where(eq(radiusCards.id, card.id));
  
  return { 
    success: true, 
    planId: card.planId, 
    cardId: card.id,
    username: card.username,
    password: card.password,
    expiresAt,
  };
}

// Suspend a card
export async function suspendCard(cardId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const card = await getCardById(cardId);
  if (!card) throw new Error("Card not found");
  
  // Update radcheck to disable authentication (upsert to handle existing Auth-Type=Accept)
  await db.execute(
    sql`INSERT INTO radcheck (username, attribute, op, value)
        VALUES (${card.username}, 'Auth-Type', ':=', 'Reject')
        ON DUPLICATE KEY UPDATE value = 'Reject', op = ':='`
  );
  
  await db.update(radiusCards)
    .set({ status: "suspended" })
    .where(eq(radiusCards.id, cardId));
  
  return { success: true };
}

// Unsuspend a card
export async function unsuspendCard(cardId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const card = await getCardById(cardId);
  if (!card) throw new Error("Card not found");
  
  // Restore Auth-Type=Accept (upsert to handle existing row)
  await db.execute(
    sql`INSERT INTO radcheck (username, attribute, op, value)
        VALUES (${card.username}, 'Auth-Type', ':=', 'Accept')
        ON DUPLICATE KEY UPDATE value = 'Accept', op = ':='`
  );
  await db.update(radiusCards)
    .set({ status: "active" })
    .where(eq(radiusCards.id, cardId));
  
  return { success: true };
}

// Get all batches
export async function getAllBatches() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: cardBatches.id,
      batchId: cardBatches.batchId,
      name: cardBatches.name,
      planId: cardBatches.planId,
      planName: plans.name,
      createdBy: cardBatches.createdBy,
      resellerId: cardBatches.resellerId,
      quantity: cardBatches.quantity,
      status: cardBatches.status,
      createdAt: cardBatches.createdAt,
      updatedAt: cardBatches.updatedAt,
    })
    .from(cardBatches)
    .leftJoin(plans, eq(cardBatches.planId, plans.id))
    .orderBy(desc(cardBatches.createdAt));
  return rows;
}

export async function getBatchesByCreator(createdBy: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: cardBatches.id,
      batchId: cardBatches.batchId,
      name: cardBatches.name,
      planId: cardBatches.planId,
      planName: plans.name,
      createdBy: cardBatches.createdBy,
      resellerId: cardBatches.resellerId,
      quantity: cardBatches.quantity,
      status: cardBatches.status,
      createdAt: cardBatches.createdAt,
      updatedAt: cardBatches.updatedAt,
    })
    .from(cardBatches)
    .leftJoin(plans, eq(cardBatches.planId, plans.id))
    .where(eq(cardBatches.createdBy, createdBy))
    .orderBy(desc(cardBatches.createdAt));
}

export async function getBatchesByReseller(resellerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: cardBatches.id,
      batchId: cardBatches.batchId,
      name: cardBatches.name,
      planId: cardBatches.planId,
      planName: plans.name,
      createdBy: cardBatches.createdBy,
      resellerId: cardBatches.resellerId,
      quantity: cardBatches.quantity,
      status: cardBatches.status,
      createdAt: cardBatches.createdAt,
      updatedAt: cardBatches.updatedAt,
    })
    .from(cardBatches)
    .leftJoin(plans, eq(cardBatches.planId, plans.id))
    .where(eq(cardBatches.resellerId, resellerId))
    .orderBy(desc(cardBatches.createdAt));
}

export async function getBatchById(batchId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(cardBatches).where(eq(cardBatches.batchId, batchId)).limit(1);
  return result[0] || null;
}

export async function getCardsByBatch(batchId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(radiusCards)
    .where(eq(radiusCards.batchId, batchId))
    .orderBy(desc(radiusCards.createdAt));
}

// Aliases for backward compatibility
export const getAllVouchers = getAllCards;
export const getVouchersByReseller = getCardsByReseller;
export const getVoucherById = getCardById;
export const getVoucherByCode = getCardBySerial;
export const redeemVoucher = activateCard;


// Get subscriber groups for dropdown
export async function getSubscriberGroups() {
  const db = await getDb();
  if (!db) return ['Default group'];

  try {
    const groups = await db.selectDistinct({ groupname: radusergroup.groupname })
      .from(radusergroup);

    const groupNames = groups.map((g: any) => g.groupname).filter(Boolean);
    
    // Always include default group
    if (!groupNames.includes('Default group')) {
      groupNames.unshift('Default group');
    }
    
    return groupNames;
  } catch (error) {
    console.error('Error fetching subscriber groups:', error);
    return ['Default group'];
  }
}


// ============================================================================
// BATCH MANAGEMENT FUNCTIONS
// ============================================================================

// Get batch statistics
export async function getBatchStats(batchId: string) {
  const db = await getDb();
  if (!db) return null;
  
  // OPTIMIZED: Use GROUP BY instead of fetching all cards
  const rows = await db
    .select({ status: radiusCards.status, cnt: count() })
    .from(radiusCards)
    .where(eq(radiusCards.batchId, batchId))
    .groupBy(radiusCards.status);
  
  const stats = { total: 0, unused: 0, active: 0, used: 0, expired: 0, suspended: 0, currentlyActive: 0 };
  for (const row of rows) {
    const n = Number(row.cnt);
    stats.total += n;
    if (row.status === 'unused') stats.unused = n;
    if (row.status === 'active') { stats.active = n; stats.currentlyActive = n; }
    if (row.status === 'used') stats.used = n;
    if (row.status === 'expired') stats.expired = n;
    if (row.status === 'suspended') stats.suspended = n;
  }
  return stats;
}

// OPTIMIZED: Get stats for ALL batches in a single GROUP BY query
// Returns a Map<batchId, stats> to avoid N+1 queries
async function getBatchStatsMap(batchIds: string[]): Promise<Map<string, any>> {
  const db = await getDb();
  const statsMap = new Map<string, any>();
  if (!db || batchIds.length === 0) return statsMap;
  
  // Initialize all batches with zero stats
  for (const batchId of batchIds) {
    statsMap.set(batchId, { total: 0, unused: 0, active: 0, used: 0, expired: 0, suspended: 0, currentlyActive: 0, batchExpiresAt: null });
  }

  // Query 0: batch expiry — MAX(expiresAt) per batch (latest card expiry = batch expiry)
  try {
    const expiryRows = await db.execute(
      sql`
        SELECT batchId, MAX(expiresAt) AS batch_expires
        FROM radius_cards
        WHERE batchId IN (${sql.join(batchIds.map((id) => sql`${id}`), sql`, `)})
          AND expiresAt IS NOT NULL
        GROUP BY batchId
      `
    ) as any;
    const expiryResultRows: any[] = (expiryRows as any)[0] ?? [];
    for (const row of expiryResultRows) {
      const bid = row.batchId ?? row.batchid ?? row.BATCHID;
      if (bid != null) {
        const s = statsMap.get(String(bid));
        if (s) s.batchExpiresAt = row.batch_expires ?? null;
      }
    }
  } catch (err) {
    console.error('[getBatchStatsMap] batchExpiresAt query failed:', err);
  }

  // Query 1: card status counts
  const rows = await db
    .select({ batchId: radiusCards.batchId, status: radiusCards.status, cnt: count() })
    .from(radiusCards)
    .where(inArray(radiusCards.batchId, batchIds))
    .groupBy(radiusCards.batchId, radiusCards.status);
  
  for (const row of rows) {
    if (!row.batchId) continue;
    const s = statsMap.get(row.batchId);
    if (!s) continue;
    const n = Number(row.cnt);
    s.total += n;
    if (row.status === 'unused') s.unused = n;
    if (row.status === 'active') s.active = n;
    if (row.status === 'used') s.used = n;
    if (row.status === 'expired') s.expired = n;
    if (row.status === 'suspended') s.suspended = n;
  }

  // Query 2: real-time online count — Phase 2C: reads from online_sessions (~1K rows)
  try {
    const onlineRows = await db.execute(
      sql`
        SELECT rc.batchId AS batch_id_alias, COUNT(DISTINCT os.username) AS cnt
        FROM radius_cards rc
        INNER JOIN online_sessions os ON os.username = rc.username
        WHERE rc.batchId IN (${sql.join(batchIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY rc.batchId
      `
    ) as any;
    // db.execute() returns [rows, fields] — actual rows are at index [0]
    const onlineResultRows: any[] = (onlineRows as any)[0] ?? [];
    for (const row of onlineResultRows) {
      // Handle case-insensitive column names from different DB drivers
      const bid = row.batch_id_alias ?? row.batchId ?? row.batchid ?? row.BATCHID;
      if (bid != null) {
        const s = statsMap.get(String(bid));
        if (s) s.currentlyActive = Number(row.cnt) || 0;
      }
    }
  } catch (err) {
    console.error('[getBatchStatsMap] online_sessions query failed:', err);
    // online_sessions may not be available; currentlyActive stays 0
  }

  return statsMap;
}

// Enable batch - activate all cards in batch for RADIUS authentication
// OPTIMIZED: Uses bulk operations for better performance
export async function enableBatch(batchId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error("Batch not found");
  
  // Get all cards in batch
  const cards = await getCardsByBatch(batchId);
  if (cards.length === 0) {
    await db.update(cardBatches)
      .set({ enabled: true, updatedAt: new Date() })
      .where(eq(cardBatches.batchId, batchId));
    return { success: true, affectedCards: 0 };
  }
  
  // subquery بدلاً من inArray(usernames) — آمن لأي عدد من الكروت
  const usernamesInBatch = sql`(SELECT username FROM radius_cards WHERE batchId = ${batchId})`;

  // BULK: Remove Auth-Type (Reject) only — no Accept needed, FreeRADIUS authenticates normally without Auth-Type
  await db.execute(
    sql`DELETE FROM radcheck
        WHERE username IN ${usernamesInBatch}
        AND attribute = 'Auth-Type'`
  );

  // BULK: Update suspended cards back to their original status (بدفعات آمنة)
  const CHUNK = 1000;
  const suspendedCards = cards.filter((c: any) => c.status === 'suspended');
  if (suspendedCards.length > 0) {
    const activatedIds = suspendedCards.filter((c: any) => c.activatedAt).map((c: any) => c.id);
    for (let i = 0; i < activatedIds.length; i += CHUNK) {
      await db.update(radiusCards)
        .set({ status: 'active' })
        .where(inArray(radiusCards.id, activatedIds.slice(i, i + CHUNK)));
    }
    const unusedIds = suspendedCards.filter((c: any) => !c.activatedAt).map((c: any) => c.id);
    for (let i = 0; i < unusedIds.length; i += CHUNK) {
      await db.update(radiusCards)
        .set({ status: 'unused' })
        .where(inArray(radiusCards.id, unusedIds.slice(i, i + CHUNK)));
    }
  }

  await db.update(cardBatches)
    .set({ enabled: true, updatedAt: new Date() })
    .where(eq(cardBatches.batchId, batchId));

  return { success: true, affectedCards: cards.length };
}

// Disable batch - disable all cards in batch for RADIUS authentication
// OPTIMIZED: Uses subquery + chunked inserts for large batches (10k+ cards)
export async function disableBatch(batchId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const batch = await getBatchById(batchId);
  if (!batch) throw new Error("Batch not found");

  const cards = await getCardsByBatch(batchId);
  if (cards.length === 0) {
    await db.update(cardBatches)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(cardBatches.batchId, batchId));
    return { success: true, affectedCards: 0 };
  }

  const usernamesInBatch = sql`(SELECT username FROM radius_cards WHERE batchId = ${batchId})`;
  const cardIds = cards.map((c: any) => c.id);
  const INSERT_CHUNK = 500;
  const UPDATE_CHUNK = 1000;

  // BULK: Remove any existing Auth-Type via subquery
  await db.execute(
    sql`DELETE FROM radcheck
        WHERE username IN ${usernamesInBatch}
        AND attribute = 'Auth-Type'`
  );

  // BULK: Insert Auth-Type := Reject — INSERT...SELECT بدون تحميل أي شيء في الذاكرة
  await db.execute(
    sql`INSERT INTO radcheck (username, attribute, op, value)
        SELECT username, 'Auth-Type', ':=', 'Reject'
        FROM radius_cards
        WHERE batchId = ${batchId}`
  );

  // BULK: Update card statuses بدفعات آمنة
  for (let i = 0; i < cardIds.length; i += UPDATE_CHUNK) {
    await db.update(radiusCards)
      .set({ status: 'suspended' })
      .where(inArray(radiusCards.id, cardIds.slice(i, i + UPDATE_CHUNK)));
  }

  await db.update(cardBatches)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(cardBatches.batchId, batchId));

  return { success: true, affectedCards: cards.length };
}

// Update batch time settings
// OPTIMIZED: Uses bulk operations for better performance
export async function updateBatchTime(batchId: string, data: {
  cardTimeValue?: number;
  cardTimeUnit?: 'hours' | 'days';
  internetTimeValue?: number;
  internetTimeUnit?: 'hours' | 'days';
  timeFromActivation?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error("Batch not found");
  
  // Get all cards in batch
  const cards = await getCardsByBatch(batchId);
  if (cards.length === 0) {
    // Just update batch settings
    await db.update(cardBatches)
      .set({
        cardTimeValue: data.cardTimeValue ?? batch.cardTimeValue,
        cardTimeUnit: data.cardTimeUnit ?? batch.cardTimeUnit,
        internetTimeValue: data.internetTimeValue ?? batch.internetTimeValue,
        internetTimeUnit: data.internetTimeUnit ?? batch.internetTimeUnit,
        timeFromActivation: data.timeFromActivation ?? batch.timeFromActivation,
        updatedAt: new Date(),
      })
      .where(eq(cardBatches.batchId, batchId));
    return { success: true, affectedCards: 0 };
  }
  
  const usernames = cards.map((c: any) => c.username);
  const cardIds = cards.map((c: any) => c.id);
  
  // Calculate new session timeout
  let sessionTimeout: number | null = null;
  const cardTimeValue = data.cardTimeValue ?? batch.cardTimeValue ?? 0;
  const cardTimeUnit = data.cardTimeUnit ?? batch.cardTimeUnit ?? 'hours';
  
  if (cardTimeValue > 0) {
    if (cardTimeUnit === 'days') {
      sessionTimeout = cardTimeValue * 24 * 60 * 60;
    } else {
      sessionTimeout = cardTimeValue * 60 * 60;
    }
  }

  // Calculate new window seconds (internet time = validity window)
  let newWindowSeconds: number | null = null;
  const internetTimeValue = data.internetTimeValue ?? batch.internetTimeValue ?? 0;
  const internetTimeUnit = data.internetTimeUnit ?? batch.internetTimeUnit ?? 'hours';

  if (internetTimeValue > 0) {
    if (internetTimeUnit === 'days') {
      newWindowSeconds = internetTimeValue * 24 * 60 * 60;
    } else {
      newWindowSeconds = internetTimeValue * 60 * 60;
    }
  }
  
  // Calculate new expiration
  const timeFromActivation = data.timeFromActivation ?? batch.timeFromActivation ?? true;
  let expiresAt: Date | null = null;
  
  if (!timeFromActivation && cardTimeValue > 0) {
    const now = new Date();
    if (cardTimeUnit === 'days') {
      expiresAt = new Date(now.getTime() + cardTimeValue * 24 * 60 * 60 * 1000);
    } else {
      expiresAt = new Date(now.getTime() + cardTimeValue * 60 * 60 * 1000);
    }
  }
  
  // subquery آمن لأي عدد من الكروت — لا يُحمّل الذاكرة
  const usernamesInBatch = sql`(SELECT username FROM radius_cards WHERE batchId = ${batchId})`;
  const CHUNK = 1000;
  const INSERT_CHUNK = 500;

  // BULK: Update Session-Timeout via subquery + chunked insert
  if (sessionTimeout !== null) {
    // حذف القديم عبر subquery
    await db.execute(
      sql`DELETE FROM radreply
          WHERE username IN ${usernamesInBatch}
          AND attribute = 'Session-Timeout'`
    );
    // إدراج الجديد بدفعات آمنة
    const timeoutEntries = usernames.map((username: any) => ({
      username,
      attribute: "Session-Timeout",
      op: "=",
      value: String(sessionTimeout),
    }));
    for (let i = 0; i < timeoutEntries.length; i += INSERT_CHUNK) {
      await db.insert(radreply).values(timeoutEntries.slice(i, i + INSERT_CHUNK));
    }
  }

  // BULK: Update Expiration if not counting from activation
  if (!timeFromActivation && expiresAt) {
    // حذف القديم عبر subquery
    await db.execute(
      sql`DELETE FROM radcheck
          WHERE username IN ${usernamesInBatch}
          AND attribute = 'Expiration'`
    );
    // إدراج الجديد بدفعات آمنة
    const expirationEntries = usernames.map((username: any) => ({
      username,
      attribute: "Expiration",
      op: ":=",
      value: formatFreeRadiusExpiration(expiresAt!),
    }));
    for (let i = 0; i < expirationEntries.length; i += INSERT_CHUNK) {
      await db.insert(radcheck).values(expirationEntries.slice(i, i + INSERT_CHUNK));
    }
    // تحديث تواريخ انتهاء الكروت بدفعات آمنة
    for (let i = 0; i < cardIds.length; i += CHUNK) {
      await db.update(radiusCards)
        .set({ expiresAt })
        .where(inArray(radiusCards.id, cardIds.slice(i, i + CHUNK)));
    }
  }

  // BULK: Update usageBudgetSeconds and/or windowSeconds بدفعات آمنة
  const cardUpdateFields: any = {};
  if (sessionTimeout !== null) cardUpdateFields.usageBudgetSeconds = sessionTimeout;
  if (newWindowSeconds !== null) cardUpdateFields.windowSeconds = newWindowSeconds;

  if (Object.keys(cardUpdateFields).length > 0 && cardIds.length > 0) {
    cardUpdateFields.updatedAt = new Date();
    for (let i = 0; i < cardIds.length; i += CHUNK) {
      await db.update(radiusCards)
        .set(cardUpdateFields)
        .where(inArray(radiusCards.id, cardIds.slice(i, i + CHUNK)));
    }
  }

  // Update batch settings (including new fields for display)
  const batchUpdateSet: any = {
    cardTimeValue: data.cardTimeValue ?? batch.cardTimeValue,
    cardTimeUnit: data.cardTimeUnit ?? batch.cardTimeUnit,
    internetTimeValue: data.internetTimeValue ?? batch.internetTimeValue,
    internetTimeUnit: data.internetTimeUnit ?? batch.internetTimeUnit,
    timeFromActivation: data.timeFromActivation ?? batch.timeFromActivation,
    updatedAt: new Date(),
  };
  // Also save usageBudgetSeconds and windowSeconds so the table displays correctly
  if (sessionTimeout !== null) batchUpdateSet.usageBudgetSeconds = sessionTimeout;
  if (newWindowSeconds !== null) batchUpdateSet.windowSeconds = newWindowSeconds;
  await db.update(cardBatches)
    .set(batchUpdateSet)
    .where(eq(cardBatches.batchId, batchId));
  
  return { success: true, affectedCards: cards.length };
}

// Update batch properties (simultaneous use, plan, etc.)
// OPTIMIZED: Uses bulk operations for better performance
export async function updateBatchProperties(batchId: string, data: {
  simultaneousUse?: number;
  planId?: number;
  hotspotPort?: string;
  macBinding?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error("Batch not found");
  
  // Get all cards in batch
  const cards = await getCardsByBatch(batchId);
  
  // Update batch settings first
  const updateData: any = { updatedAt: new Date() };
  if (data.simultaneousUse !== undefined) updateData.simultaneousUse = data.simultaneousUse;
  if (data.planId !== undefined) updateData.planId = data.planId;
  if (data.hotspotPort !== undefined) updateData.hotspotPort = data.hotspotPort;
  if (data.macBinding !== undefined) updateData.macBinding = data.macBinding;
  
  await db.update(cardBatches)
    .set(updateData)
    .where(eq(cardBatches.batchId, batchId));
  
  if (cards.length === 0) {
    return { success: true, affectedCards: 0 };
  }

  // INSERT_CHUNK_SIZE: آمن لـ MySQL (max_allowed_packet)
  const INSERT_CHUNK = 500;
  // DELETE_CHUNK_SIZE: يمنع lock طويل على radcheck/radreply
  const DELETE_CHUNK = 1000;

  // subquery helper — يستخدم batchId مباشرة بدلاً من inArray(usernames)
  // هذا يتجنب بناء IN-list ضخمة في الذاكرة ويُفوّض التصفية لـ MySQL
  const usernamesInBatch = sql`(SELECT username FROM radius_cards WHERE batchId = ${batchId})`;

  // Get plan if changing
  let plan = null;
  if (data.planId) {
    const planResult = await db.select().from(plans).where(eq(plans.id, data.planId)).limit(1);
    plan = planResult[0];
    if (!plan) throw new Error("Plan not found");
  }

  // ─── BULK: Update Simultaneous-Use ────────────────────────────────────────────
  if (data.simultaneousUse !== undefined) {
    // DELETE via subquery — لا يحمّل الذاكرة بغض النظر عن عدد الكروت
    await db.execute(
      sql`DELETE FROM radcheck
          WHERE username IN ${usernamesInBatch}
          AND attribute = 'Simultaneous-Use'`
    );

    // INSERT...SELECT — يكتب مباشرة من قاعدة البيانات بدون تحميل أي شيء في الذاكرة
    // يعمل بكفاءة سواء كانت الدفعة 100 أو  100,000 كرت
    await db.execute(
      sql`INSERT INTO radcheck (username, attribute, op, value)
          SELECT username, 'Simultaneous-Use', ':=', ${String(data.simultaneousUse)}
          FROM radius_cards
          WHERE batchId = ${batchId}`
    );
  }

  // ─── BULK: Update rate limit if plan changed ──────────────────────────────
  if (plan) {
    // DELETE via subquery
    await db.execute(
      sql`DELETE FROM radreply
          WHERE username IN ${usernamesInBatch}
          AND attribute = 'Mikrotik-Rate-Limit'`
    );

    let rateLimitValue: string | null = null;
    if (plan.mikrotikRateLimit) {
      rateLimitValue = plan.mikrotikRateLimit;
    } else if (plan.downloadSpeed && plan.uploadSpeed) {
      rateLimitValue = `${plan.uploadSpeed}k/${plan.downloadSpeed}k`;
    }

    if (rateLimitValue) {
      // INSERT...SELECT — يكتب مباشرة من قاعدة البيانات بدون تحميل أي شيء في الذاكرة
      await db.execute(
        sql`INSERT INTO radreply (username, attribute, op, value)
            SELECT username, 'Mikrotik-Rate-Limit', '=', ${rateLimitValue}
            FROM radius_cards
            WHERE batchId = ${batchId}`
      );
    }

    // NAS Isolation: لا نغير radusergroup — العزل يعتمد على owner_X/HG_plan_X

    // Update card plans بدفعات آمنة لتجنب IN-list ضخمة
    const cardIds = cards.map((c: any) => c.id);
    for (let i = 0; i < cardIds.length; i += DELETE_CHUNK) {
      await db.update(radiusCards)
        .set({ planId: plan.id })
        .where(inArray(radiusCards.id, cardIds.slice(i, i + DELETE_CHUNK)));
    }
  }

  return { success: true, affectedCards: cards.length };
}

// Get batch with statistics
export async function getBatchWithStats(batchId: string) {
  const db = await getDb();
  if (!db) return null;
  
  const batch = await getBatchById(batchId);
  if (!batch) return null;
  
  const stats = await getBatchStats(batchId);
  
  // Get plan name
  const planResult = await db.select().from(plans).where(eq(plans.id, batch.planId)).limit(1);
  const plan = planResult[0];
  
  return {
    ...batch,
    stats,
    planName: plan?.name || 'Unknown',
  };
}

// Get all batches with statistics
export async function getAllBatchesWithStats() {
  const db = await getDb();
  if (!db) return [];
  
  const batches = await db.select().from(cardBatches).orderBy(desc(cardBatches.createdAt));
  if (batches.length === 0) return [];

  // OPTIMIZED: Single GROUP BY query for all batch stats + single plans query
  const batchIds = batches.map((b: any) => b.batchId);
  const planIds: number[] = Array.from(new Set(batches.map((b: any) => b.planId).filter(Boolean)));
  const [statsMap, allPlans] = await Promise.all([
    getBatchStatsMap(batchIds),
    planIds.length > 0 ? db.select().from(plans).where(inArray(plans.id, planIds)) : Promise.resolve([]),
  ]);
  const planMap = new Map(allPlans.map((p: any) => [p.id, p]));

  return batches.map((batch: any) => ({
    ...batch,
    stats: statsMap.get(batch.batchId) ?? { total: 0, unused: 0, active: 0, used: 0, expired: 0, suspended: 0, currentlyActive: 0 },
    planName: (planMap.get(batch.planId) as any)?.name || 'Unknown',
  }));
}

// Get batches by reseller/owner with statistics
// Includes batches where user is resellerId OR createdBy (for multi-tenant isolation)
export async function getBatchesByResellerWithStats(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const batches = await db.select()
    .from(cardBatches)
    .where(or(eq(cardBatches.resellerId, userId), eq(cardBatches.createdBy, userId)))
    .orderBy(desc(cardBatches.createdAt));
  if (batches.length === 0) return [];

  // OPTIMIZED: Single GROUP BY query for all batch stats + single plans query
  const batchIds = batches.map((b: any) => b.batchId);
  const planIds: number[] = Array.from(new Set(batches.map((b: any) => b.planId).filter(Boolean)));
  const [statsMap, allPlans] = await Promise.all([
    getBatchStatsMap(batchIds),
    planIds.length > 0 ? db.select().from(plans).where(inArray(plans.id, planIds)) : Promise.resolve([]),
  ]);
  const planMap = new Map(allPlans.map((p: any) => [p.id, p]));

  return batches.map((batch: any) => ({
    ...batch,
    stats: statsMap.get(batch.batchId) ?? { total: 0, unused: 0, active: 0, used: 0, expired: 0, suspended: 0, currentlyActive: 0 },
    planName: (planMap.get(batch.planId) as any)?.name || '-',
  }));
}

// Get batches with tenant isolation (supports sub-admins)
export async function getBatchesByTenantWithStats(tenantContext: TenantContext) {
  const db = await getDb();
  if (!db) return [];
  
  const effectiveOwnerId = tenantContext.role === 'client_admin' || tenantContext.role === 'client_staff' 
    ? tenantContext.tenantId! 
    : tenantContext.userId;
  
  let batches;
  if (isAdmin(tenantContext.role)) {
    batches = await db.select().from(cardBatches).orderBy(desc(cardBatches.createdAt));
  } else {
    batches = await db.select()
      .from(cardBatches)
      .where(or(eq(cardBatches.resellerId, effectiveOwnerId), eq(cardBatches.createdBy, effectiveOwnerId)))
      .orderBy(desc(cardBatches.createdAt));
  }
  if (batches.length === 0) return [];

  // OPTIMIZED: Single GROUP BY query for all batch stats + single plans query
  const batchIds = batches.map((b: any) => b.batchId);
  const planIds: number[] = Array.from(new Set(batches.map((b: any) => b.planId).filter(Boolean)));
  const [statsMap, allPlans] = await Promise.all([
    getBatchStatsMap(batchIds),
    planIds.length > 0 ? db.select().from(plans).where(inArray(plans.id, planIds)) : Promise.resolve([]),
  ]);
  const planMap = new Map(allPlans.map((p: any) => [p.id, p]));

  return batches.map((batch: any) => ({
    ...batch,
    stats: statsMap.get(batch.batchId) ?? { total: 0, unused: 0, active: 0, used: 0, expired: 0, suspended: 0, currentlyActive: 0 },
    planName: (planMap.get(batch.planId) as any)?.name || 'Unknown',
  }));
}

// Delete batch with options
// OPTIMIZED: Uses bulk operations for better performance
export async function deleteBatch(batchId: string, deleteCards: boolean = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const batch = await getBatchById(batchId);
  if (!batch) throw new Error("Batch not found");
  
  // Get all cards in batch
  const cards = await getCardsByBatch(batchId);
  
  if (deleteCards && cards.length > 0) {
    // subquery — آمن لأي عدد من الكروت
    const usernamesInBatch = sql`(SELECT username FROM radius_cards WHERE batchId = ${batchId})`;

    // تنظيف بيانات المصادقة الحية فقط؛ radacct تاريخ تدقيقي ثابت لدورات الكروت المحذوفة.
    await db.execute(sql`DELETE FROM radcheck WHERE username IN ${usernamesInBatch}`);
    await db.execute(sql`DELETE FROM radreply WHERE username IN ${usernamesInBatch}`);
    await db.execute(sql`DELETE FROM radusergroup WHERE username IN ${usernamesInBatch}`);
    await db.execute(sql`DELETE FROM radpostauth WHERE username IN ${usernamesInBatch}`);
    await db.execute(sql`DELETE FROM online_sessions WHERE username IN ${usernamesInBatch}`);

    // DELETE cards بدفعات آمنة
    const cardIds = cards.map((c: any) => c.id);
    const CHUNK = 1000;
    for (let i = 0; i < cardIds.length; i += CHUNK) {
      await db.delete(radiusCards)
        .where(inArray(radiusCards.id, cardIds.slice(i, i + CHUNK)));
    }
  } else if (cards.length > 0) {
    // Just unlink cards from batch (set batchId to null) بدفعات آمنة
    const cardIds = cards.map((c: any) => c.id);
    const CHUNK = 1000;
    for (let i = 0; i < cardIds.length; i += CHUNK) {
      await db.update(radiusCards)
        .set({ batchId: null })
        .where(inArray(radiusCards.id, cardIds.slice(i, i + CHUNK)));
    }
  }
  
  // Delete batch
  await db.delete(cardBatches)
    .where(eq(cardBatches.batchId, batchId));
  
  return { 
    success: true, 
    deletedCards: deleteCards ? cards.length : 0,
    unlinkedCards: deleteCards ? 0 : cards.length
  };
}

// Delete a single card and all its RADIUS data
export async function deleteCard(cardId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get card first to retrieve username
  const [card] = await db.select()
    .from(radiusCards)
    .where(eq(radiusCards.id, cardId))
    .limit(1);

  if (!card) throw new Error("Card not found");

  const { username } = card;

  // حذف بيانات المصادقة والجلسة الحية فقط؛ لا يحذف radacct أو radpostauth التاريخيين.
  await Promise.all([
    db.delete(radcheck).where(eq(radcheck.username, username)),
    db.delete(radreply).where(eq(radreply.username, username)),
    db.delete(radusergroup).where(eq(radusergroup.username, username)),
    db.execute(sql`DELETE FROM radpostauth WHERE username = ${username}`),
    db.execute(sql`DELETE FROM online_sessions WHERE username = ${username}`),
  ]);

  // Delete the card record
  await db.delete(radiusCards).where(eq(radiusCards.id, cardId));

  return { success: true, username };
}

// Get accounting activity by immutable lifecycle, never by a reusable username.
export async function getCardActivity(lifecycleIds: string[]) {
  if (!lifecycleIds.length) return {};
  const db = await getDb();
  if (!db) return {};

  // The binding is created by SessionEngine at Accounting-Start and survives
  // deleting/recreating a card with the same RADIUS username.
  const rows = await db
    .select({
      lifecycleId: cardLifecycleSessions.lifecycleId,
      firstLogin: sql<Date>`MIN(${radacct.acctstarttime})`,
      lastSeen: sql<Date>`MAX(COALESCE(${radacct.acctupdatetime}, ${radacct.acctstarttime}))`,
    })
    .from(cardLifecycleSessions)
    .leftJoin(radacct, sql`(${radacct.acctuniqueid} = ${cardLifecycleSessions.acctUniqueId} OR (${cardLifecycleSessions.acctUniqueId} IS NULL AND ${radacct.acctsessionid} = ${cardLifecycleSessions.acctSessionId}))`)
    .where(inArray(cardLifecycleSessions.lifecycleId, lifecycleIds))
    .groupBy(cardLifecycleSessions.lifecycleId);

  return buildLifecycleActivityMap(rows);
}

// Get card statistics (counts by status) - server-side, no data transfer
export async function getCardStats(userId?: number): Promise<{
  total: number;
  active: number;
  unused: number;
  expired: number;
  used: number;
  suspended: number;
  manual: number;
}> {
  const db = await getDb();
  if (!db) return { total: 0, active: 0, unused: 0, expired: 0, used: 0, suspended: 0, manual: 0 };

  const ownerFilter = userId
    ? or(eq(radiusCards.resellerId, userId), eq(radiusCards.createdBy, userId))
    : undefined;

  const rows = await db
    .select({
      status: radiusCards.status,
      isManual: radiusCards.isManual,
      cnt: count(),
    })
    .from(radiusCards)
    .where(ownerFilter as any)
    .groupBy(radiusCards.status, radiusCards.isManual);

  const stats = { total: 0, active: 0, unused: 0, expired: 0, used: 0, suspended: 0, manual: 0 };
  for (const row of rows) {
    const n = Number(row.cnt);
    stats.total += n;
    if (row.status === 'active') stats.active += n;
    if (row.status === 'unused') stats.unused += n;
    if (row.status === 'expired') stats.expired += n;
    if (row.status === 'used') stats.used += n;
    if (row.status === 'suspended') stats.suspended += n;
    if (row.isManual) stats.manual += n;
  }
  return stats;
}

// ─── Online Status Helpers ────────────────────────────────────────────────────────────────────────────────

/**
 * Returns the subset of usernames that currently have an active session.
 * Phase 2C: online_sessions is the primary realtime source (~1K rows, idx_username).
 */
export async function getOnlineUsernames(usernames: string[]): Promise<string[]> {
  if (!usernames.length) return [];
  const db = await getDb();
  if (!db) return [];

  // online_sessions has idx_username — fast lookup, always clean
  const rows = await db
    .selectDistinct({ username: onlineSessions.username })
    .from(onlineSessions)
    .where(
      sql`${onlineSessions.username} IN (${sql.join(usernames.map((u) => sql`${u}`), sql`, `)})`
    );
  return rows.map((r: { username: string }) => r.username);
}

/**
 * Returns a plain object of batchId -> online count.
 * Phase 2C: online_sessions is the primary realtime source (~1K rows).
 */
export async function getBatchOnlineCounts(batchIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (!batchIds.length) return result;
  const db = await getDb();
  if (!db) return result;

  for (const id of batchIds) result[id] = 0;

  // online_sessions JOIN radius_cards — much faster (1K vs 540K rows)
  const rows = await db.execute(
    sql`
      SELECT rc.batchId AS batch_id_alias, COUNT(DISTINCT os.username) AS cnt
      FROM radius_cards rc
      INNER JOIN online_sessions os ON os.username = rc.username
      WHERE rc.batchId IN (${sql.join(batchIds.map((id) => sql`${id}`), sql`, `)})
      GROUP BY rc.batchId
    `
  ) as any;
  // db.execute() returns [rows, fields] — actual rows are at index [0]
  const resultRows: any[] = (rows as any)[0] ?? [];
  for (const row of resultRows) {
    const bid = row.batch_id_alias ?? row.batchId ?? row.batchid ?? row.BATCHID;
    if (bid != null) result[String(bid)] = Number(row.cnt) || 0;
  }
  return result;
}
