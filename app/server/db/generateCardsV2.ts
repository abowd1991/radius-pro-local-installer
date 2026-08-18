/**
 * Production-Grade Card Generation System (v4 - Zero Collision Guarantee)
 *
 * Algorithm: Set-Based Unique Generation per Owner
 * ─────────────────────────────────────────────────
 * 1. Fetch existing usernames for this owner from DB (one query)
 * 2. Build a candidate pool using Fisher-Yates partial shuffle
 * 3. Exclude already-used usernames → guaranteed zero collision
 * 4. Bulk insert in batches of 500 (handles 5000 cards in ~10s)
 *
 * Capacity per digit length:
 *   5 digits → 90,000 unique codes (10000–99999)
 *   6 digits → 900,000 unique codes
 *   7 digits → 9,000,000 unique codes
 *   8 digits → 90,000,000 unique codes
 *
 * Smart Namespace Isolation:
 *   - Uniqueness is enforced per owner (createdBy), not globally
 *   - Two clients CAN have the same code (different NAS → different owner)
 *   - DB constraint: UNIQUE KEY uniq_cards_owner_username (createdBy, username)
 */

import { getDb } from '../db';
import { plans, cardBatches, radiusCards, radcheck, radreply, radusergroup, nasDevices, radhuntgroup } from '../../drizzle/schema';
import { eq, and, inArray, like } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { formatFreeRadiusExpiration } from '../core/FreeRadiusTime';
import { buildPlanNetworkReplyAttributes } from '../../shared/planNetworkAttributes';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateCardsInput {
  planId: number;
  quantity: number;
  createdBy: number;
  resellerId?: number;
  batchName?: string;
  purchasePrice?: number;
  salePrice?: number;
  simultaneousUse?: number;
  hotspotPort?: string;
  timeFromActivation?: boolean;
  internetTimeValue?: number;
  internetTimeUnit?: 'hours' | 'days';
  cardTimeValue?: number;
  cardTimeUnit?: 'hours' | 'days';
  macBinding?: boolean;
  prefix?: string;
  usernameLength?: number;
  passwordLength?: number;
  subscriberGroup?: string;
  cardPrice?: number;
  usageBudgetSeconds?: number;
  windowSeconds?: number;
  authType?: 'password' | 'username-only'; // username-only = no password required (Auth-Type := Accept)
}

interface GeneratedCard {
  serialNumber: string;
  username: string;
  password: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// MySQL/TiDB hard limit: 65,535 parameters per INSERT statement
// Each row in radreply/radcheck has 5 columns → max safe rows = floor(65000/5) = 13000
// We cap at 1000 rows per batch for safety and memory efficiency
const MAX_MYSQL_PARAMS = 65000;
const BULK_INSERT_BATCH_SIZE = 500; // default fallback
const MAX_CARDS_PER_BATCH = 5000;

/**
 * Calculate safe batch size to avoid MySQL/TiDB "too many parameters" error.
 * MySQL hard limit is 65,535 params per INSERT. We stay well under it.
 */
function safeBatchSize(columnsPerRow: number, cap = 1000): number {
  return Math.min(cap, Math.floor(MAX_MYSQL_PARAMS / columnsPerRow));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a numeric-only password
 */
function generatePassword(length: number = 4): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

/**
 * Generate a unique serial number
 */
function generateSerialNumber(): string {
  return nanoid(12);
}

/**
 * Generate a pool of unique numeric usernames for a given owner.
 *
 * Strategy:
 * - Build the full range [min, max] for the given digit length
 * - Apply optional prefix filter
 * - Exclude already-used codes (fetched from DB)
 * - Partial Fisher-Yates shuffle to pick `quantity` codes randomly
 *
 * @param quantity     Number of unique codes needed
 * @param length       Total digit length (5–8)
 * @param prefix       Optional leading digit(s) e.g. "5" → codes start with 5
 * @param usedSet      Set of usernames already used by this owner
 */
function generateUniqueUsernames(
  quantity: number,
  length: number,
  prefix: string,
  usedSet: Set<string>
): string[] {
  // Build numeric range based on length
  const min = Math.pow(10, length - 1);  // e.g. 10000 for length=5
  const max = Math.pow(10, length) - 1;  // e.g. 99999 for length=5

  // Filter by prefix if provided
  let candidates: number[] = [];

  if (prefix) {
    // Only include numbers that start with the given prefix
    const prefixNum = parseInt(prefix, 10);
    const prefixLen = prefix.length;
    const remainingLen = length - prefixLen;
    if (remainingLen <= 0) {
      throw new Error(`Prefix "${prefix}" is too long for username length ${length}`);
    }
    const rangeMin = prefixNum * Math.pow(10, remainingLen);
    const rangeMax = (prefixNum + 1) * Math.pow(10, remainingLen) - 1;

    // Build candidates array (only numbers in prefix range, excluding used)
    for (let n = rangeMin; n <= rangeMax; n++) {
      const code = n.toString().padStart(length, '0');
      if (!usedSet.has(code)) {
        candidates.push(n);
      }
    }
  } else {
    // All numbers in range, excluding used
    for (let n = min; n <= max; n++) {
      const code = n.toString();
      if (!usedSet.has(code)) {
        candidates.push(n);
      }
    }
  }

  // Check capacity
  if (candidates.length < quantity) {
    throw new Error(
      `Not enough unique codes available. ` +
      `Requested: ${quantity}, Available: ${candidates.length}. ` +
      `Consider increasing username length or changing prefix.`
    );
  }

  // Partial Fisher-Yates shuffle: pick `quantity` random elements
  // Only shuffle the first `quantity` positions → O(quantity) not O(total)
  for (let i = 0; i < quantity; i++) {
    const j = i + Math.floor(Math.random() * (candidates.length - i));
    // Swap
    const temp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = temp;
  }

  // Return first `quantity` as zero-padded strings
  return candidates.slice(0, quantity).map(n => n.toString().padStart(length, '0'));
}

/**
 * Bulk insert with configurable batch size
 */
async function bulkInsert(tx: any, table: any, values: any[], batchSize: number = BULK_INSERT_BATCH_SIZE) {
  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);
    await tx.insert(table).values(batch);
  }
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Generate cards with Production-Grade Zero-Collision guarantee
 *
 * Flow:
 * 1. Validate inputs
 * 2. Fetch plan details
 * 3. Fetch existing usernames for this owner (one DB query)
 * 4. Generate unique usernames using partial Fisher-Yates
 * 5. Build card rows in memory
 * 6. Bulk insert in transaction (500 rows per batch)
 */
export async function generateCardsV2(data: GenerateCardsInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // ── Validate quantity ──
  if (data.quantity < 1) throw new Error("Quantity must be at least 1");
  if (data.quantity > MAX_CARDS_PER_BATCH) {
    throw new Error(`Maximum ${MAX_CARDS_PER_BATCH} cards per batch`);
  }

  // ── Get plan details ──
  const planResult = await db.select().from(plans).where(eq(plans.id, data.planId)).limit(1);
  const plan = planResult[0];
  if (!plan) throw new Error("Plan not found");

  // ── NAS Restriction: Hunt Group approach for multi-NAS support ──
  // restrictedNasIds (JSON array) takes precedence over restrictedNasId (legacy single)
  // Hunt Group name: HG_plan_{planId} — shared by all cards in the same plan
  let huntGroupName: string | null = null;
  let huntGroupNasIps: string[] = [];

  const nasIdsJson = plan.restrictedNasIds;
  const nasIdsArray: number[] = nasIdsJson ? JSON.parse(nasIdsJson) : [];

  if (nasIdsArray.length > 0) {
    // Multi-NAS: use Hunt Group
    huntGroupName = `HG_plan_${plan.id}`;
    const nasResults = await db.select({ id: nasDevices.id, nasname: nasDevices.nasname })
      .from(nasDevices)
      .where(inArray(nasDevices.id, nasIdsArray));
    huntGroupNasIps = nasResults.map((n: { id: number; nasname: string }) => n.nasname);
  } else if (plan.restrictedNasId) {
    // Legacy single-NAS: still use Hunt Group for consistency
    huntGroupName = `HG_plan_${plan.id}`;
    const nasResult = await db.select({ nasname: nasDevices.nasname })
      .from(nasDevices)
      .where(eq(nasDevices.id, plan.restrictedNasId))
      .limit(1);
    if (nasResult[0]?.nasname) {
      huntGroupNasIps = [nasResult[0].nasname];
    }
  }

  // Sync radhuntgroup entries for this plan (outside transaction — idempotent)
  if (huntGroupName && huntGroupNasIps.length > 0) {
    // Delete old entries for this hunt group and re-insert
    await db.delete(radhuntgroup).where(eq(radhuntgroup.groupname, huntGroupName));
    await db.insert(radhuntgroup).values(
      huntGroupNasIps.map(ip => ({ groupname: huntGroupName!, nasipaddress: ip }))
    );
  }

  // ── Configuration ──
  const batchId = nanoid(10);
  const authType = data.authType || 'password';
  const passwordLength = Math.max(2, Math.min(6, data.passwordLength || 4));
  if (!data.usernameLength || !data.prefix) {
    throw new Error('Username length and starting digit are required');
  }
  const usernameLength = Math.max(6, Math.min(9, data.usernameLength));
  const prefix = (data.prefix || '').trim();
  const simultaneousUse = resolveSimultaneousUse(plan.simultaneousUse, data.simultaneousUse);
  // If autoDisconnect is enabled on the plan, allow 2 concurrent sessions so FreeRADIUS
  // accepts the new login while the old session is still being disconnected by our service.
  // Our autoDisconnect loop (every 5s) will immediately kick the older session.
  const effectiveSimultaneousUse = plan.autoDisconnect ? Math.max(2, simultaneousUse) : simultaneousUse;
  // A restricted plan must own the card's effective RADIUS group from creation.
  // Unrestricted plans keep the owner's default group.
  const subscriberGroup = huntGroupName || `owner_${data.createdBy}`;
  const timeFromActivation = data.timeFromActivation !== false;

  // ── Calculate expiration ──
  // Always set a batch-level expiry so expired cards can be identified and
  // cleaned up later, regardless of timeFromActivation mode.
  // Default: 1 year (365 days) from creation date.
  const ONE_YEAR_MS = 365 * 86400000;
  const now = new Date();
  let expiresAt: Date;
  if (!timeFromActivation) {
    // User explicitly set a duration — honour it
    if (data.cardTimeValue && data.cardTimeValue > 0) {
      const ms = data.cardTimeUnit === 'days'
        ? data.cardTimeValue * 86400000
        : data.cardTimeValue * 3600000;
      expiresAt = new Date(now.getTime() + ms);
    } else if (plan.validityValue) {
      const ms = plan.validityType === 'days'
        ? plan.validityValue * 86400000
        : plan.validityType === 'hours'
          ? plan.validityValue * 3600000
          : plan.validityValue * 60000;
      expiresAt = new Date(now.getTime() + ms);
    } else {
      expiresAt = new Date(now.getTime() + 30 * 86400000);
    }
  } else {
    // timeFromActivation = true → no usage-window, but set batch expiry = 1 year
    // so the card row is never "forever" and can be purged after a year.
    expiresAt = new Date(now.getTime() + ONE_YEAR_MS);
  }

  // ── Step 1: Fetch existing usernames matching this prefix+length only ──
  // Memory-efficient: instead of loading ALL cards globally (OOM risk at 1M+ cards),
  // we only load usernames that match the same prefix AND length.
  // This is safe because:
  //   - Two clients with the same prefix+length WILL collide in FreeRADIUS (username-only lookup)
  //   - Filtering by prefix covers the exact namespace we're generating into
  //   - A 5-digit prefix="5" namespace has at most 10,000 entries → safe for RAM
  //
  // Example: prefix="5", length=5 → only load usernames like "5____" (50000-59999)
  // This reduces memory usage by ~90% compared to loading all cards globally.
  const prefixPattern = prefix
    ? `${prefix}${'_'.repeat(usernameLength - prefix.length)}`  // e.g. "5____" for prefix=5, len=5
    : '_'.repeat(usernameLength);                                // e.g. "_____" for no prefix, len=5

  // Run both queries in parallel:
  //   1. radius_cards  → app source of truth for Hotspot cards
  //   2. radcheck      → catches any username inserted outside radius_cards
  //                      (e.g. vpnUsername stored in nas_devices, or any orphan entry)
  // Both queries use the same LIKE pattern → same index scan cost, no full-table scan.
  const [existingRows, radcheckResult] = await Promise.all([
    db
      .select({ username: radiusCards.username })
      .from(radiusCards)
      .where(like(radiusCards.username, prefixPattern)),
    db.execute(sql`SELECT DISTINCT username FROM radcheck WHERE username LIKE ${prefixPattern}`),
  ]);

  const usedSet = new Set<string>(existingRows.map((r: { username: string }) => r.username));

  // Merge radcheck usernames into usedSet (covers vpnUsername and any orphan radcheck entries)
  const radcheckUsernameRows = (radcheckResult as any)[0] as Array<{ username: string }>;
  for (const row of radcheckUsernameRows) {
    usedSet.add(row.username);
  }

  // ── Namespace Capacity Check (80% Warning) ──
  // Calculate total possible usernames in this namespace
  // prefix="5", length=5 → namespace = 50000-59999 = 10,000 slots
  // prefix="", length=5 → namespace = 10000-99999 = 90,000 slots
  const namespaceSize = prefix
    ? Math.pow(10, usernameLength - prefix.length)           // e.g. 10^4 = 10,000 for prefix="5", len=5
    : 9 * Math.pow(10, usernameLength - 1);                  // e.g. 9*10^4 = 90,000 for len=5
  const usedCount = usedSet.size;
  const usagePercent = (usedCount / namespaceSize) * 100;
  const availableSlots = namespaceSize - usedCount;

  // Warn if namespace is 80%+ full
  if (usagePercent >= 80) {
    console.warn(
      `[CardGen] ⚠️ Namespace WARNING: prefix="${prefix || '(none)'}", len=${usernameLength} ` +
      `is ${usagePercent.toFixed(1)}% full (${usedCount}/${namespaceSize} used, ${availableSlots} remaining)`
    );
  }

  // Block generation if namespace is 95%+ full (safety margin)
  if (usagePercent >= 95) {
    throw new Error(
      `NAMESPACE_FULL:${JSON.stringify({
        prefix: prefix || '',
        length: usernameLength,
        used: usedCount,
        total: namespaceSize,
        available: availableSlots,
        percent: Math.round(usagePercent)
      })}`
    );
  }

  // Block if requested quantity exceeds available slots
  if (data.quantity > availableSlots) {
    throw new Error(
      `NAMESPACE_INSUFFICIENT:${JSON.stringify({
        prefix: prefix || '',
        length: usernameLength,
        requested: data.quantity,
        available: availableSlots,
        percent: Math.round(usagePercent)
      })}`
    );
  }

  // ── Step 2: Generate unique usernames (zero collision) ──
  let usernames: string[];
  try {
    usernames = generateUniqueUsernames(data.quantity, usernameLength, prefix, usedSet);
  } catch (err: any) {
    throw new Error(`Username generation failed: ${err.message}`);
  }

  // ── Step 3: Build card rows in memory ──
  const generatedCards: GeneratedCard[] = [];
  const allCardValues: any[] = [];
  const radcheckValues: any[] = [];

  // ── Pre-compute radreply attributes from plan (shared across all cards) ──
  // Session-Timeout priority: usageBudgetSeconds > cardTimeValue > plan.sessionTimeout
  const usageBudgetSeconds = data.usageBudgetSeconds || 0;
  const cardTimeValueSec = data.cardTimeValue && data.cardTimeValue > 0
    ? (data.cardTimeUnit === 'days' ? data.cardTimeValue * 86400 : data.cardTimeValue * 3600)
    : 0;
  let finalSessionTimeout = 0;
  if (usageBudgetSeconds > 0) {
    finalSessionTimeout = usageBudgetSeconds;
  } else if (cardTimeValueSec > 0) {
    finalSessionTimeout = cardTimeValueSec;
  } else if (plan.sessionTimeout && plan.sessionTimeout > 0) {
    finalSessionTimeout = plan.sessionTimeout;
  }

  // Rate-Limit from plan
  let rateLimitValue: string | null = null;
  if (plan.mikrotikRateLimit) {
    rateLimitValue = plan.mikrotikRateLimit;
  } else if (plan.downloadSpeed || plan.uploadSpeed) {
    const download = plan.downloadSpeed ? `${plan.downloadSpeed}k` : '0';
    const upload = plan.uploadSpeed ? `${plan.uploadSpeed}k` : '0';
    rateLimitValue = `${upload}/${download}`;
  }

  const radreplyValues: any[] = [];
  const planNetworkReplyAttributes = buildPlanNetworkReplyAttributes({
    dataLimitBytes: plan.dataLimit,
    mikrotikAddressPool: plan.mikrotikAddressPool,
  });

  for (const username of usernames) {
    // For username-only auth, use empty string as password (FreeRADIUS will use Auth-Type := Accept)
    const password = authType === 'username-only' ? '' : generatePassword(passwordLength);
    const serialNumber = generateSerialNumber();

    allCardValues.push({
      username,
      lifecycleId: randomUUID(),
      password,
      authType,
      serialNumber,
      batchId,
      planId: data.planId,
      createdBy: data.createdBy,
      resellerId: data.resellerId ?? null,
      status: "unused",
      expiresAt,
      purchasePrice: data.purchasePrice != null ? String(data.purchasePrice) : plan.resellerPrice,
      salePrice: (data.salePrice ?? data.cardPrice) != null
        ? String(data.salePrice ?? data.cardPrice)
        : plan.price,
      usageBudgetSeconds: data.usageBudgetSeconds || 0,
      windowSeconds: data.windowSeconds || 0,
      simultaneousUse: effectiveSimultaneousUse, // effective = same value written to radcheck
    });

    generatedCards.push({ serialNumber, username, password: authType === 'username-only' ? '(no password)' : password });

    // Build radreply entries for FreeRADIUS reply attributes
    // Session-Timeout: controls how long the session lasts (shown in MikroTik Hotspot as Session Time)
    if (finalSessionTimeout > 0) {
      radreplyValues.push({
        username,
        attribute: 'Session-Timeout',
        op: '=',
        value: String(finalSessionTimeout),
      });
    }
    // Mikrotik-Rate-Limit: bandwidth control
    if (rateLimitValue) {
      radreplyValues.push({
        username,
        attribute: 'Mikrotik-Rate-Limit',
        op: '=',
        value: rateLimitValue,
      });
    }
    for (const attribute of planNetworkReplyAttributes) {
      radreplyValues.push({ username, ...attribute });
    }

    // Build radcheck entries for FreeRADIUS authentication
    if (authType === 'username-only') {
      radcheckValues.push({
        username,
        attribute: 'Auth-Type',
        op: ':=',
        value: 'Accept',
      });
    } else {
      radcheckValues.push({
        username,
        attribute: 'Cleartext-Password',
        op: ':=',
        value: password,
      });
    }
    // Simultaneous-Use: limit concurrent sessions per card
    // If autoDisconnect is enabled, set to 2 so new login is accepted while old is being disconnected
    radcheckValues.push({
      username,
      attribute: 'Simultaneous-Use',
      op: ':=',
      value: String(effectiveSimultaneousUse),
    });
    // Expiration: FreeRADIUS will reject the card after this date
    // Format: "Jan 01 2027 00:00:00" (FreeRADIUS standard format)
    const expirationStr = formatFreeRadiusExpiration(expiresAt);
    radcheckValues.push({
      username,
      attribute: 'Expiration',
      op: ':=',
      value: expirationStr,
    });
    // الطريقة الصحيحة من RADIUS: لا نضيف Huntgroup-Name في radcheck
    // بدلاً من ذلك نستخدم radusergroup مع HG_plan_X (يُعالَج في 4e أدناه)
    // Port-Limit: sent in Access-Accept to override MikroTik Hotspot's local "Shared Users" restriction
    // MikroTik respects Port-Limit from RADIUS over its own Shared Users setting
    radreplyValues.push({
      username,
      attribute: 'Port-Limit',
      op: ':=',
      value: String(effectiveSimultaneousUse),
    });
  }

  // ── Step 4: Single Transaction - All-or-Nothing ──
  await db.transaction(async (tx: any) => {
    // 4a. Create batch record
    await tx.insert(cardBatches).values({
      batchId,
      name: data.batchName || `Batch ${batchId}`,
      planId: data.planId,
      createdBy: data.createdBy,
      resellerId: data.resellerId ?? null,
      quantity: data.quantity,
      status: "generating",
      simultaneousUse: effectiveSimultaneousUse, // effective = same value written to radcheck
      hotspotPort: data.hotspotPort || null,
      timeFromActivation,
      internetTimeValue: data.internetTimeValue || 0,
      internetTimeUnit: data.internetTimeUnit || 'hours',
      cardTimeValue: data.cardTimeValue || 0,
      cardTimeUnit: data.cardTimeUnit || 'hours',
      macBinding: data.macBinding || false,
      prefix: prefix || null,
      usernameLength,
      passwordLength,
      subscriberGroup,
      cardPrice: data.cardPrice != null ? String(data.cardPrice) : '0',
      usageBudgetSeconds: data.usageBudgetSeconds || 0,
      windowSeconds: data.windowSeconds || 0,
    } as any);

    // 4b. Bulk insert radius_cards (~20 columns per row → safe batch = 200)
    await bulkInsert(tx, radiusCards, allCardValues, safeBatchSize(20, 200));

    // 4c. Bulk insert radcheck entries for FreeRADIUS authentication
    // radcheck: 5 columns (id, username, attribute, op, value) → safe batch = 1000
    // Use INSERT IGNORE semantics via onDuplicateKeyUpdate to handle retries/duplicates gracefully
    if (radcheckValues.length > 0) {
      const radcheckBatch = safeBatchSize(5, 1000);
      for (let i = 0; i < radcheckValues.length; i += radcheckBatch) {
        const batch = radcheckValues.slice(i, i + radcheckBatch);
        await tx.insert(radcheck).values(batch)
          .onDuplicateKeyUpdate({ set: { value: sql`VALUES(value)` } });
      }
    }

    // 4d. Bulk insert radreply entries (Session-Timeout, Rate-Limit, Framed-Pool)
    // radreply: 5 columns (id, username, attribute, op, value) → safe batch = 1000
    // Example: 5000 cards × 3 attributes = 15000 rows → 15 batches × 5000 params each ✓
    // Use onDuplicateKeyUpdate to handle retries/duplicates gracefully
    if (radreplyValues.length > 0) {
      const radreplyBatch = safeBatchSize(5, 1000);
      for (let i = 0; i < radreplyValues.length; i += radreplyBatch) {
        const batch = radreplyValues.slice(i, i + radreplyBatch);
        await tx.insert(radreply).values(batch)
          .onDuplicateKeyUpdate({ set: { value: sql`VALUES(value)` } });
      }
    }

    // 4e. Bulk insert radusergroup entries
    // الطريقة الصحيحة من RADIUS: مجموعة واحدة لكل كرت
    // - كرت عادي → owner_X
    // - كرت مقيد على NAS محدد → HG_plan_X (وليس owner_X)
    const effectiveGroupName = (huntGroupName && huntGroupNasIps.length > 0)
      ? huntGroupName
      : subscriberGroup;
    const radusergroupValues = usernames.map(username => ({
      username,
      groupname: effectiveGroupName,
      priority: 1,
    }));
    const radusergroupBatch = safeBatchSize(4, 1000);
    for (let i = 0; i < radusergroupValues.length; i += radusergroupBatch) {
      const batch = radusergroupValues.slice(i, i + radusergroupBatch);
      await tx.insert(radusergroup).values(batch)
        .onDuplicateKeyUpdate({ set: { groupname: sql`VALUES(groupname)` } });
    }
    // 4f-extra. مصدر واحد للشرط: INSERT IGNORE لا يمنع التكرار من دون فهرس فريد.
    if (huntGroupName && huntGroupNasIps.length > 0) {
      await tx.execute(sql`DELETE FROM radgroupcheck
        WHERE groupname = ${huntGroupName} AND attribute = 'Huntgroup-Name'`);
      await tx.execute(sql`INSERT INTO radgroupcheck (groupname, attribute, op, value)
        VALUES (${huntGroupName}, 'Huntgroup-Name', '==', ${huntGroupName})`);
    }

    // 4f. Update batch status to completed
    await tx.update(cardBatches)
      .set({ status: "completed" })
      .where(eq(cardBatches.batchId, batchId));
  });

  return {
    success: true,
    batchId,
    cards: generatedCards,
    quantity: data.quantity,
    planName: plan.name,
    usernameLength,
    passwordLength,
  };
}

/** The plan owns concurrency unless a caller explicitly supplies a valid override. */
export function resolveSimultaneousUse(planValue: number | null | undefined, explicitOverride?: number): number {
  return explicitOverride ?? planValue ?? 1;
}
