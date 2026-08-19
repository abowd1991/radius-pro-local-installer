/**
 * Import Cards from CSV File
 *
 * Imports pre-defined username/password pairs from a CSV file into:
 * - radius_cards (card registry)
 * - radcheck (FreeRADIUS authentication)
 * - radreply (FreeRADIUS reply attributes: Session-Timeout, Rate-Limit, etc.)
 *
 * CSV Format (semicolon-separated, with or without header):
 *   id;username;password
 *   "000009975233";"2399004";"5514"
 *
 * Supports bulk insert with safe batch sizes to avoid MySQL 65535 param limit.
 *
 * Duplicate Detection (3 layers):
 *   1. Within CSV itself: deduplicate before processing
 *   2. In radius_cards: skip usernames already owned by this client
 *   3. In radcheck: skip usernames that exist in FreeRADIUS (orphan records)
 */

import { getDb } from '../db';
import { plans, cardBatches, radiusCards, radcheck, radreply, radusergroup, nasDevices } from '../../drizzle/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { formatFreeRadiusExpiration } from '../core/FreeRadiusTime';
import { buildPlanNetworkReplyAttributes } from '../../shared/planNetworkAttributes';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CsvCard {
  id: string;       // serial / ID column (col 1)
  username: string; // username (col 2)
  password: string; // password (col 3)
}

export interface ImportCardsInput {
  cards: CsvCard[];          // parsed from CSV
  planId: number;
  createdBy: number;         // owner (admin user id)
  assignedToUserId?: number; // optional: assign to a specific client
  batchName?: string;
  subscriberGroup?: string;
  usageBudgetSeconds?: number;
  windowSeconds?: number;
  timeFromActivation?: boolean;
  cardTimeValue?: number;
  cardTimeUnit?: 'hours' | 'days';
  authType?: 'password' | 'username-only';
}

export interface ImportCardsResult {
  success: true;
  batchId: string;
  imported: number;
  skipped: number;
  skippedUsernames: string[];
  skippedReasons: Record<string, string>; // username → reason
  planName: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_MYSQL_PARAMS = 65000;

function safeBatchSize(columnsPerRow: number, cap = 1000): number {
  return Math.min(cap, Math.floor(MAX_MYSQL_PARAMS / columnsPerRow));
}

async function bulkInsert(tx: any, table: any, values: any[], batchSize: number) {
  for (let i = 0; i < values.length; i += batchSize) {
    await tx.insert(table).values(values.slice(i, i + batchSize));
  }
}

/**
 * Parse CSV text into CsvCard array.
 * Supports semicolon (;) or comma (,) delimiters.
 * Strips surrounding quotes from values.
 * Skips header row if first column looks non-numeric.
 */
export function parseCsvCards(csvText: string): CsvCard[] {
  const lines = csvText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  // Detect delimiter
  const delimiter = lines[0].includes(';') ? ';' : ',';

  const stripQuotes = (s: string) => s.replace(/^["']|["']$/g, '').trim();

  const cards: CsvCard[] = [];
  for (const line of lines) {
    const parts = line.split(delimiter).map(stripQuotes);
    if (parts.length < 3) continue;

    const [col1, col2, col3] = parts;

    // Skip header row (e.g. "الاى دى", "id", "ID", "serial")
    if (isNaN(Number(col1.replace(/\D/g, ''))) && cards.length === 0) continue;
    if (/^(id|serial|username|user|الاى|رقم)/i.test(col1) && cards.length === 0) continue;

    if (!col2 || !col3) continue;

    cards.push({ id: col1, username: col2, password: col3 });
  }

  return cards;
}

// ─── Main Function ────────────────────────────────────────────────────────────

export async function importCardsFromCsv(data: ImportCardsInput): Promise<ImportCardsResult> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  if (!data.cards || data.cards.length === 0) {
    throw new Error('No cards to import');
  }
  if (data.cards.length > 10000) {
    throw new Error('Maximum 10,000 cards per import');
  }

  // ── Get plan details ──
  const planResult = await db.select().from(plans).where(eq(plans.id, data.planId)).limit(1);
  const plan = planResult[0];
  if (!plan) throw new Error('Plan not found');

  const batchId = nanoid(10);
  const authType = data.authType || 'password';
  // NAS Isolation: تحديد المجموعة الصحيحة لكل كرت
  // - باقة مقيدة على NAS محدد → HG_plan_{planId} (عزل حقيقي)
  // - باقة عادية → owner_{clientId} (عزل على مستوى المالك)
  const ownerIdForGroup = data.assignedToUserId ?? data.createdBy;
  const nasIdsJson = (plan as any).restrictedNasIds;
  const hasNasRestriction = (nasIdsJson && JSON.parse(nasIdsJson).length > 0) || (plan as any).restrictedNasId;
  const huntGroupName = hasNasRestriction ? `HG_plan_${plan.id}` : null;
  const subscriberGroup = huntGroupName
    ? huntGroupName
    : (data.subscriberGroup && data.subscriberGroup !== 'Default group')
      ? data.subscriberGroup
      : `owner_${ownerIdForGroup}`;
  const timeFromActivation = data.timeFromActivation !== false;

  // إذا كانت الباقة مقيدة: تأكد من وجود radgroupcheck و radhuntgroup
  if (huntGroupName) {
    try {
      // مصدر واحد للشرط: INSERT IGNORE لا يمنع التكرار من دون فهرس فريد.
      await db.execute(sql`DELETE FROM radgroupcheck
        WHERE groupname = ${huntGroupName} AND attribute = 'Huntgroup-Name'`);
      await db.execute(sql`INSERT INTO radgroupcheck (groupname, attribute, op, value)
        VALUES (${huntGroupName}, 'Huntgroup-Name', '==', ${huntGroupName})`);
      // radhuntgroup: ربط المجموعة بالـ NAS IPs
      const nasIds: number[] = nasIdsJson
        ? JSON.parse(nasIdsJson)
        : [(plan as any).restrictedNasId].filter(Boolean);
      if (nasIds.length > 0) {
        const nasResults = await db.select({ nasname: nasDevices.nasname })
          .from(nasDevices)
          .where(inArray(nasDevices.id, nasIds));
        for (const nas of nasResults) {
          await db.execute(
            sql`INSERT IGNORE INTO radhuntgroup (nasipaddress, nasportid, groupname)
                VALUES (${nas.nasname}, NULL, ${huntGroupName})`
          );
        }
      }
    } catch (err) {
      console.error('[importCardsFromCsv] Failed to setup huntgroup:', err);
    }
  }

  // ── Calculate expiration ──
  // Keep imports consistent with generated cards: a card that counts usage from
  // activation still receives a hard one-year expiry from creation.
  const ONE_YEAR_MS = 365 * 86400000;
  const now = new Date();
  let expiresAt: Date;
  if (!timeFromActivation) {
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
    expiresAt = new Date(now.getTime() + ONE_YEAR_MS);
  }

  const effectiveCreatedBy = data.assignedToUserId ?? data.createdBy;
  const skippedReasons: Record<string, string> = {};

  // ── Layer 1: Deduplicate within CSV itself ──
  // If the same username appears multiple times in the CSV, keep only the first occurrence
  const seenInCsv = new Set<string>();
  const deduplicatedCards: CsvCard[] = [];
  for (const card of data.cards) {
    if (seenInCsv.has(card.username)) {
      skippedReasons[card.username] = 'مكرر في ملف CSV';
    } else {
      seenInCsv.add(card.username);
      deduplicatedCards.push(card);
    }
  }

  const incomingUsernames = deduplicatedCards.map((c) => c.username);

  // ── Layer 2: Check radius_cards (per owner) ──
  const existingCardsRows = await db
    .select({ username: radiusCards.username })
    .from(radiusCards)
    .where(and(
      inArray(radiusCards.username, incomingUsernames),
      eq(radiusCards.createdBy, effectiveCreatedBy)
    ));
  const existingCardsSet = new Set(existingCardsRows.map((r: { username: string }) => r.username));

  // ── Layer 3: Check radcheck (FreeRADIUS orphan records) ──
  // A username might exist in radcheck but not in radius_cards (orphan)
  // This would cause a UNIQUE constraint violation during insert
  const existingRadcheckRows = await db
    .select({ username: radcheck.username })
    .from(radcheck)
    .where(and(
      inArray(radcheck.username, incomingUsernames),
      eq(radcheck.attribute, 'Cleartext-Password')  // Only check auth attribute to avoid false positives
    ));
  const existingRadcheckSet = new Set(existingRadcheckRows.map((r: { username: string }) => r.username));

  // ── Combine all skip reasons and build final import list ──
  const toImport: CsvCard[] = [];
  for (const card of deduplicatedCards) {
    if (existingCardsSet.has(card.username)) {
      skippedReasons[card.username] = 'موجود مسبقاً في قاعدة البيانات';
    } else if (existingRadcheckSet.has(card.username)) {
      skippedReasons[card.username] = 'موجود في FreeRADIUS (سجل يتيم)';
    } else {
      toImport.push(card);
    }
  }

  const skippedUsernames = Object.keys(skippedReasons);

  if (toImport.length === 0) {
    throw new Error(
      `جميع الـ ${data.cards.length} كرت موجودة مسبقاً ولم يتم استيراد أي كرت جديد.`
    );
  }

  // ── Build rate limit value from plan ──
  let rateLimitValue = '';
  if ((plan as any).rateLimit) {
    rateLimitValue = (plan as any).rateLimit;
  } else if (plan.downloadSpeed || plan.uploadSpeed) {
    const download = plan.downloadSpeed ? `${plan.downloadSpeed}k` : '0';
    const upload = plan.uploadSpeed ? `${plan.uploadSpeed}k` : '0';
    rateLimitValue = `${upload}/${download}`;
  }

  // ── Session timeout priority: usageBudgetSeconds > cardTimeValue > plan.validityValue ──
  let finalSessionTimeout = 0;
  if (data.usageBudgetSeconds && data.usageBudgetSeconds > 0) {
    // Priority 1: explicit usage budget (internet time)
    finalSessionTimeout = data.usageBudgetSeconds;
  } else if (data.cardTimeValue && data.cardTimeValue > 0) {
    // Priority 2: card time value (card validity as session cap)
    finalSessionTimeout = data.cardTimeUnit === 'days'
      ? data.cardTimeValue * 86400
      : data.cardTimeValue * 3600;
  } else if (plan.validityValue) {
    // Priority 3: fallback to plan validity
    const secs = plan.validityType === 'days'
      ? plan.validityValue * 86400
      : plan.validityType === 'hours'
        ? plan.validityValue * 3600
        : plan.validityValue * 60;
    finalSessionTimeout = secs;
  }

  // ── Build insert arrays ──
  const allCardValues: any[] = [];
  const radcheckValues: any[] = [];
  const radreplyValues: any[] = [];

  const serialPrefix = nanoid(4).toUpperCase();

  for (let i = 0; i < toImport.length; i++) {
    const card = toImport[i];
    const serialNumber = `${serialPrefix}${String(i + 1).padStart(6, '0')}`;

    allCardValues.push({
      username: card.username,
      lifecycleId: randomUUID(),
      password: authType === 'username-only' ? null : card.password,
      authType,
      serialNumber,
      batchId,
      planId: data.planId,
      createdBy: effectiveCreatedBy,
      resellerId: null,
      status: 'unused',
      expiresAt,
      purchasePrice: plan.resellerPrice ?? '0',
      salePrice: plan.price ?? '0',
      usageBudgetSeconds: data.usageBudgetSeconds || 0,
      windowSeconds: data.windowSeconds || 0,
      isManual: false,
      simultaneousUse: ((plan as any).autoDisconnect ? Math.max(2, (plan as any).simultaneousUse || 1) : ((plan as any).simultaneousUse || 1)), // effective = same value written to radcheck
    });

    // radcheck: authentication
    if (authType === 'username-only') {
      radcheckValues.push({
        username: card.username,
        attribute: 'Auth-Type',
        op: ':=',
        value: 'Accept',
      });
    } else {
      radcheckValues.push({
        username: card.username,
        attribute: 'Cleartext-Password',
        op: ':=',
        value: card.password,
      });
    }

    // radcheck: Simultaneous-Use (max concurrent sessions)
    // If autoDisconnect is enabled, minimum 2 so FreeRADIUS accepts new login while old is being disconnected
    const baseSimUseCsv = (plan as any).simultaneousUse || 1;
    const effectiveSimUseCsv = (plan as any).autoDisconnect ? Math.max(2, baseSimUseCsv) : baseSimUseCsv;
    radcheckValues.push({
      username: card.username,
      attribute: 'Simultaneous-Use',
      op: ':=',
      value: String(effectiveSimUseCsv),
    });

    // radcheck: Expiration (hard expiry enforced by FreeRADIUS)
    radcheckValues.push({
      username: card.username,
      attribute: 'Expiration',
      op: ':=',
      value: formatFreeRadiusExpiration(expiresAt),
    });

    // radreply: Session-Timeout
    if (finalSessionTimeout > 0) {
      radreplyValues.push({
        username: card.username,
        attribute: 'Session-Timeout',
        op: '=',
        value: String(finalSessionTimeout),
      });
    }

    // radreply: Rate-Limit
    if (rateLimitValue) {
      radreplyValues.push({
        username: card.username,
        attribute: 'Mikrotik-Rate-Limit',
        op: '=',
        value: rateLimitValue,
      });
    }

    for (const attribute of buildPlanNetworkReplyAttributes({
      dataLimitBytes: (plan as any).dataLimit,
      mikrotikAddressPool: (plan as any).mikrotikAddressPool,
    })) {
      radreplyValues.push({ username: card.username, ...attribute });
    }

    // radreply: Port-Limit - overrides MikroTik Hotspot's local "Shared Users" restriction
    radreplyValues.push({
      username: card.username,
      attribute: 'Port-Limit',
      op: ':=',
      value: String(effectiveSimUseCsv),
    });
  }

  // ── Single Transaction (all-or-nothing) ──
  await db.transaction(async (tx: any) => {
    // 1. Create batch record
    await tx.insert(cardBatches).values({
      batchId,
      name: data.batchName || `CSV Import ${new Date().toLocaleDateString('ar')}`,
      planId: data.planId,
      createdBy: effectiveCreatedBy,
      resellerId: null,
      quantity: toImport.length,
      status: 'completed',
      simultaneousUse: ((plan as any).autoDisconnect ? Math.max(2, (plan as any).simultaneousUse || 1) : ((plan as any).simultaneousUse || 1)), // effective
      hotspotPort: null,
      timeFromActivation,
      internetTimeValue: 0,
      internetTimeUnit: 'hours',
      cardTimeValue: data.cardTimeValue || 0,
      cardTimeUnit: data.cardTimeUnit || 'hours',
      macBinding: false,
      prefix: null,
      usernameLength: 0,
      passwordLength: 0,
      subscriberGroup,
      cardPrice: '0',
      usageBudgetSeconds: data.usageBudgetSeconds || 0,
      windowSeconds: data.windowSeconds || 0,
    } as any);

    // 2. Bulk insert radius_cards
    await bulkInsert(tx, radiusCards, allCardValues, safeBatchSize(20, 200));

    // 3. Bulk insert radcheck
    if (radcheckValues.length > 0) {
      const batchSz = safeBatchSize(5, 1000);
      for (let i = 0; i < radcheckValues.length; i += batchSz) {
        await tx.insert(radcheck).values(radcheckValues.slice(i, i + batchSz))
          .onDuplicateKeyUpdate({ set: { value: sql`VALUES(value)` } });
      }
    }

    // 4. Bulk insert radreply
    if (radreplyValues.length > 0) {
      const batchSz = safeBatchSize(5, 1000);
      for (let i = 0; i < radreplyValues.length; i += batchSz) {
        await tx.insert(radreply).values(radreplyValues.slice(i, i + batchSz))
          .onDuplicateKeyUpdate({ set: { value: sql`VALUES(value)` } });
      }
    }

    // 5. Bulk insert radusergroup - ربط كل كرت بمجموعة العميل
    const radusergroupValues = toImport.map(card => ({
      username: card.username,
      groupname: subscriberGroup,
      priority: 1,
    }));
    const groupBatchSz = safeBatchSize(3, 500);
    for (let i = 0; i < radusergroupValues.length; i += groupBatchSz) {
      await tx.insert(radusergroup).values(radusergroupValues.slice(i, i + groupBatchSz))
        .onDuplicateKeyUpdate({ set: { groupname: sql`VALUES(groupname)` } });
    }
  });

  return {
    success: true,
    batchId,
    imported: toImport.length,
    skipped: skippedUsernames.length,
    skippedUsernames,
    skippedReasons,
    planName: plan.name,
  };
}
