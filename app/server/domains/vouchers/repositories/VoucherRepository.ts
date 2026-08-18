/**
 * VoucherRepository — إدارة radius_cards + radcheck + radreply
 * المالك الوحيد لهذه الجداول
 * Radius Pro Local V2
 */

import { eq, and, sql, inArray, or, like, desc, count } from 'drizzle-orm';
import { getDb } from '../../../db';
import {
  radiusCards, radcheck, radreply, radusergroup,
  RadiusCard, InsertRadiusCard, Radcheck
} from '../../../../drizzle/schema';
import { Logger } from '../../../core/Logger';
import { plans, onlineSessions } from '../../../../drizzle/schema';
import { getEffectiveVoucherStatus, type EffectiveVoucherStatus } from '../CardStatusPolicy';
import { DEFAULT_SYSTEM_TIMEZONE, startOfZonedDay } from '../../../core/TimezoneService';
import { formatFreeRadiusExpiration } from '../../../core/FreeRadiusTime';
import { cardLifecycleRepository } from './CardLifecycleRepository';
import { invalidateCardCheckIdentity, invalidateCardCheckLifecycle } from '../../../db/cardCheckCache';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CardListOptions {
  status?: string;
  batchId?: string;
  search?: string;
  isManual?: boolean;
  ownerId?: number;   // filter by createdBy OR resellerId
  page?: number;
  limit?: number;
}

export interface CardListResult {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class VoucherRepository {
  // ─── radius_cards ─────────────────────────────────────────────────────────

  async findById(id: number): Promise<RadiusCard | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select().from(radiusCards).where(eq(radiusCards.id, id)).limit(1);
    return result[0] ?? null;
  }

  async findByUsername(username: string): Promise<RadiusCard | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select().from(radiusCards)
      .where(eq(radiusCards.username, username)).limit(1);
    return result[0] ?? null;
  }

  async findActiveCards(): Promise<RadiusCard[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    // يشمل suspended للتوفيق التاريخي: إذا انتهى لاحقاً بسبب Usage/Validity
    // تصبح حالته expired، أما الموقوف يدوياً وغير المنتهي فيبقى suspended.
    return db.select().from(radiusCards).where(or(
      eq(radiusCards.status, 'active'),
      eq(radiusCards.status, 'suspended'),
    ));
  }

  async getEffectiveCardStats(ownerId?: number): Promise<{
    total: number; active: number; unused: number; expired: number; used: number; suspended: number; manual: number;
  }> {
    const db = await getDb();
    const empty = { total: 0, active: 0, unused: 0, expired: 0, used: 0, suspended: 0, manual: 0 };
    if (!db) return empty;

    const effectiveExpired = sql<boolean>`(
      (COALESCE(${radiusCards.usageBudgetSeconds}, 0) > 0 AND COALESCE(${radiusCards.totalSessionTime}, 0) >= ${radiusCards.usageBudgetSeconds})
      OR (${radiusCards.windowEndTime} IS NOT NULL AND ${radiusCards.windowEndTime} <= NOW())
      OR (${radiusCards.expiresAt} IS NOT NULL AND ${radiusCards.expiresAt} <= NOW())
    )`;
    const ownerFilter = ownerId ? or(eq(radiusCards.resellerId, ownerId), eq(radiusCards.createdBy, ownerId)) : undefined;
    const rows = await db.select({
      total: count(),
      active: sql<number>`COALESCE(SUM(CASE WHEN ${radiusCards.status} = 'active' AND NOT ${effectiveExpired} THEN 1 ELSE 0 END), 0)`,
      unused: sql<number>`COALESCE(SUM(CASE WHEN ${radiusCards.status} = 'unused' AND NOT ${effectiveExpired} THEN 1 ELSE 0 END), 0)`,
      expired: sql<number>`COALESCE(SUM(CASE WHEN ${effectiveExpired} OR ${radiusCards.status} = 'expired' THEN 1 ELSE 0 END), 0)`,
      used: sql<number>`COALESCE(SUM(CASE WHEN ${radiusCards.status} = 'used' AND NOT ${effectiveExpired} THEN 1 ELSE 0 END), 0)`,
      suspended: sql<number>`COALESCE(SUM(CASE WHEN ${radiusCards.status} = 'suspended' AND NOT ${effectiveExpired} THEN 1 ELSE 0 END), 0)`,
      manual: sql<number>`COALESCE(SUM(CASE WHEN ${radiusCards.isManual} THEN 1 ELSE 0 END), 0)`,
    }).from(radiusCards).where(ownerFilter as any);
    const row = rows[0];
    if (!row) return empty;
    return {
      total: Number(row.total ?? 0), active: Number(row.active ?? 0), unused: Number(row.unused ?? 0),
      expired: Number(row.expired ?? 0), used: Number(row.used ?? 0), suspended: Number(row.suspended ?? 0), manual: Number(row.manual ?? 0),
    };
  }

  async getDashboardLifecycleStats(ownerId: number, timezone = DEFAULT_SYSTEM_TIMEZONE): Promise<{ activeCards: number; expiredToday: number; expiringCards: number }> {
    const db = await getDb();
    if (!db) return { activeCards: 0, expiredToday: 0, expiringCards: 0 };
    const cards = await db.select({
      status: radiusCards.status,
      usageBudgetSeconds: radiusCards.usageBudgetSeconds,
      totalSessionTime: radiusCards.totalSessionTime,
      windowEndTime: radiusCards.windowEndTime,
      expiresAt: radiusCards.expiresAt,
      updatedAt: radiusCards.updatedAt,
    }).from(radiusCards).where(or(eq(radiusCards.createdBy, ownerId), eq(radiusCards.resellerId, ownerId)));
    const now = new Date();
    const startToday = startOfZonedDay(now, timezone);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    let activeCards = 0;
    let expiredToday = 0;
    let expiringCards = 0;
    for (const card of cards) {
      const effective = getEffectiveVoucherStatus(card as any, Number(card.totalSessionTime ?? 0), now);
      if (effective === 'active' || effective === 'used') activeCards++;
      if (effective === 'expired') {
        const expiryAt = card.windowEndTime ?? card.expiresAt ?? card.updatedAt;
        if (expiryAt && expiryAt >= startToday) expiredToday++;
      }
      const nextExpiry = card.windowEndTime ?? card.expiresAt;
      if (effective !== 'expired' && nextExpiry && nextExpiry >= now && nextExpiry <= nextWeek) expiringCards++;
    }
    return { activeCards, expiredToday, expiringCards };
  }

  /**
   * قراءة كروت مع pagination + filtering + plan join
   * يستبدل cardDb.getAllCards + cardDb.getCardsByReseller
   */
  async findAll(options?: CardListOptions): Promise<CardListResult> {
    const db = await getDb();
    if (!db) return { data: [], total: 0, page: 1, limit: 50, totalPages: 0 };
    const conditions: any[] = [];
    if (options?.ownerId) {
      conditions.push(or(
        eq(radiusCards.resellerId, options.ownerId),
        eq(radiusCards.createdBy, options.ownerId)
      ));
    }
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
    const cardSelectFields = {
      id: radiusCards.id,
      lifecycleId: radiusCards.lifecycleId,
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
      firstUseAt: radiusCards.firstUseAt,
      lastUsedAt: radiusCards.lastUsedAt,
      expiresAt: radiusCards.expiresAt,
      totalSessionTime: radiusCards.totalSessionTime,
      renewalAnchorSessionTime: radiusCards.renewalAnchorSessionTime,
      totalDataUsed: radiusCards.totalDataUsed,
      lastActivity: radiusCards.lastActivity,
      usageBudgetSeconds: radiusCards.usageBudgetSeconds,
      windowSeconds: radiusCards.windowSeconds,
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
    const [totalResult, data] = await Promise.all([
      db.select({ total: count() }).from(radiusCards)
        .leftJoin(plans, eq(radiusCards.planId, plans.id))
        .where(whereClause as any),
      db.select(cardSelectFields).from(radiusCards)
        .leftJoin(plans, eq(radiusCards.planId, plans.id))
        .where(whereClause as any)
        .orderBy(desc(radiusCards.createdAt))
        .limit(limit)
        .offset(offset),
    ]);
    const total = Number(totalResult[0]?.total ?? 0);
    const now = new Date();
    const effectiveData = data.map((card: any) => ({
      ...card,
      status: getEffectiveVoucherStatus(card, Number(card.totalSessionTime ?? 0), now),
    }));
    return { data: effectiveData, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * قراءة كرت بالـ ID مع plan name
   * يستبدل cardDb.getCardById
   */
  async findByIdWithPlan(id: number): Promise<any | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select({
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
      status: radiusCards.status,
      activatedAt: radiusCards.activatedAt,
      firstLoginAt: radiusCards.firstLoginAt,
      firstUseAt: radiusCards.firstUseAt,
      lastUsedAt: radiusCards.lastUsedAt,
      expiresAt: radiusCards.expiresAt,
      totalSessionTime: radiusCards.totalSessionTime,
      renewalAnchorSessionTime: radiusCards.renewalAnchorSessionTime,
      usageBudgetSeconds: radiusCards.usageBudgetSeconds,
      windowSeconds: radiusCards.windowSeconds,
      windowEndTime: radiusCards.windowEndTime,
      fullName: radiusCards.fullName,
      phone: radiusCards.phone,
      notes: radiusCards.notes,
      isManual: radiusCards.isManual,
      simultaneousUse: radiusCards.simultaneousUse,
      createdAt: radiusCards.createdAt,
      updatedAt: radiusCards.updatedAt,
    }).from(radiusCards)
      .leftJoin(plans, eq(radiusCards.planId, plans.id))
      .where(eq(radiusCards.id, id))
      .limit(1);
    const card = result[0] ?? null;
    return card
      ? { ...card, status: getEffectiveVoucherStatus(card as any, Number(card.totalSessionTime ?? 0)) }
      : null;
  }

  async getStoredStatus(cardId: number): Promise<EffectiveVoucherStatus | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const rows = await db.select({ status: radiusCards.status })
      .from(radiusCards)
      .where(eq(radiusCards.id, cardId))
      .limit(1);
    return (rows[0]?.status as EffectiveVoucherStatus | undefined) ?? null;
  }

  /** القيم الزمنية الحساسة محسوبة داخل MySQL (نفس ساعة وTimezone FreeRADIUS). */
  async getRuntimeStateByUsername(username: string): Promise<{
    id: number; username: string; status: EffectiveVoucherStatus; usageBudgetSeconds: number; totalSessionTime: number;
    windowSeconds: number; isUsageExhausted: boolean; isWindowExpired: boolean; isAbsoluteExpired: boolean;
    remainingValiditySeconds: number | null;
  } | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const rows = await db.select({
      id: radiusCards.id,
      username: radiusCards.username,
      status: radiusCards.status,
      usageBudgetSeconds: radiusCards.usageBudgetSeconds,
      totalSessionTime: radiusCards.totalSessionTime,
      windowSeconds: radiusCards.windowSeconds,
      isUsageExhausted: sql<number>`CASE WHEN COALESCE(${radiusCards.usageBudgetSeconds}, 0) > 0 AND COALESCE(${radiusCards.totalSessionTime}, 0) >= ${radiusCards.usageBudgetSeconds} THEN 1 ELSE 0 END`,
      isWindowExpired: sql<number>`CASE WHEN ${radiusCards.windowEndTime} IS NOT NULL AND ${radiusCards.windowEndTime} <= NOW() THEN 1 ELSE 0 END`,
      isAbsoluteExpired: sql<number>`CASE WHEN ${radiusCards.expiresAt} IS NOT NULL AND ${radiusCards.expiresAt} <= NOW() THEN 1 ELSE 0 END`,
      remainingValiditySeconds: sql<number | null>`CASE WHEN ${radiusCards.windowEndTime} IS NOT NULL THEN GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), ${radiusCards.windowEndTime})) WHEN COALESCE(${radiusCards.windowSeconds}, 0) > 0 THEN ${radiusCards.windowSeconds} ELSE NULL END`,
    }).from(radiusCards).where(eq(radiusCards.username, username)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id, username: row.username, status: row.status as EffectiveVoucherStatus,
      usageBudgetSeconds: Number(row.usageBudgetSeconds ?? 0), totalSessionTime: Number(row.totalSessionTime ?? 0),
      windowSeconds: Number(row.windowSeconds ?? 0), isUsageExhausted: Boolean(Number(row.isUsageExhausted)),
      isWindowExpired: Boolean(Number(row.isWindowExpired)), isAbsoluteExpired: Boolean(Number(row.isAbsoluteExpired)),
      remainingValiditySeconds: row.remainingValiditySeconds === null ? null : Number(row.remainingValiditySeconds),
    };
  }

  /**
   * حذف كرت — Transaction كامل
   * يستبدل cardDb.deleteCard
   * ملاحظة: radacct يُبقى للتدقيق التاريخي
   */
  async deleteCard(cardId: number): Promise<{ success: boolean; username: string }> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const card = await this.findById(cardId);
    if (!card) throw new Error('Card not found');
    const { username } = card;
    // Remove current credentials and close the immutable lifecycle. Historical
    // Accounting and prior live-session evidence stay bound to this old instance.
    await db.transaction(async (tx: any) => {
      await tx.delete(radcheck).where(eq(radcheck.username, username));
      await tx.delete(radreply).where(eq(radreply.username, username));
      await tx.delete(radusergroup).where(eq(radusergroup.username, username));
      await cardLifecycleRepository.closeForCardInTransaction(tx, cardId, 'deleted');
      await tx.delete(radiusCards).where(eq(radiusCards.id, cardId));
    });
    await Promise.all([
      invalidateCardCheckIdentity(card.createdBy, card.username),
      invalidateCardCheckLifecycle(card.lifecycleId),
    ]);
    Logger.info(`VoucherRepository: deleted card#${cardId} (${username})`, { context: 'VoucherRepository' });
    return { success: true, username };
  }

  /**
   * عدد الجلسات النشطة (من online_sessions)
   * يستبدل Direct SQL في dashboard.ts
   */
  async countActiveSessions(ownerId?: number): Promise<number> {
    const db = await getDb();
    if (!db) return 0;
    const result = ownerId
      ? await db.execute(sql`
          SELECT COUNT(*) as cnt FROM online_sessions os
          INNER JOIN radius_cards c ON c.id = os.cardId AND c.lifecycleId = os.lifecycleId
          WHERE c.createdBy = ${ownerId}`)
      : await db.execute(sql`SELECT COUNT(*) as cnt FROM online_sessions`);
    return Number((result as any)[0]?.[0]?.cnt ?? 0);
  }

  /**
   * بيانات استخدام NAS من online_sessions
   */
  async getNasUsageStats(ownerId?: number): Promise<{ nasIp: string; sessions: number; downloadBytes: number; uploadBytes: number }[]> {
    const db = await getDb();
    if (!db) return [];
    const result = ownerId
      ? await db.execute(sql`
          SELECT os.nas_ip as nasIp, COUNT(*) as sessions,
                 COALESCE(SUM(os.inputOctets),0) as dl, COALESCE(SUM(os.outputOctets),0) as ul
          FROM online_sessions os
          INNER JOIN radius_cards c ON c.id = os.cardId AND c.lifecycleId = os.lifecycleId
          WHERE c.createdBy = ${ownerId}
          GROUP BY os.nas_ip`)
      : await db.execute(sql`
          SELECT os.nas_ip as nasIp, COUNT(*) as sessions,
                 COALESCE(SUM(os.inputOctets),0) as dl, COALESCE(SUM(os.outputOctets),0) as ul
          FROM online_sessions os GROUP BY os.nas_ip`);
    const rows = (result as any)[0] as any[];
    return rows.map((r: any) => ({
      nasIp: r.nasIp || '',
      sessions: Number(r.sessions || 0),
      downloadBytes: Number(r.dl || 0),
      uploadBytes: Number(r.ul || 0),
    }));
  }

  async updateCard(id: number, data: Partial<RadiusCard>): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.update(radiusCards).set({ ...data, updatedAt: new Date() }).where(eq(radiusCards.id, id));
  }

  /**
   * تحديث بطاقة يدوية وبيانات المصادقة في معاملة واحدة.
   * لا يغير هذا المسار radacct أو online_sessions؛ فهما دليل دورة Accounting القائمة.
   */
  async updateManualCardProfile(params: {
    card: RadiusCard;
    username: string;
    password: string | null;
    authType: 'username-only' | 'password';
    planId: number;
    simultaneousUse: number;
    fullName: string | null;
    phone: string | null;
    notes: string | null;
    macAddress: string | null;
    keepExpiry: boolean;
    expiresAt: Date | null;
  }): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const oldUsername = params.card.username;
    const usernameChanged = oldUsername !== params.username;
    const isSuspended = params.card.status === 'suspended';
    await db.transaction(async (tx: any) => {
      const cardUpdate: Partial<RadiusCard> = {
        username: params.username,
        password: params.password,
        authType: params.authType,
        planId: params.planId,
        simultaneousUse: params.simultaneousUse,
        fullName: params.fullName,
        phone: params.phone,
        notes: params.notes,
        macAddress: params.macAddress,
        updatedAt: new Date(),
      };
      if (!params.keepExpiry) cardUpdate.expiresAt = params.expiresAt;
      await tx.update(radiusCards).set(cardUpdate).where(eq(radiusCards.id, params.card.id));

      if (usernameChanged) {
        await tx.update(radcheck).set({ username: params.username }).where(eq(radcheck.username, oldUsername));
        await tx.update(radreply).set({ username: params.username }).where(eq(radreply.username, oldUsername));
        await tx.update(radusergroup).set({ username: params.username }).where(eq(radusergroup.username, oldUsername));
      }

      await tx.delete(radcheck).where(and(
        eq(radcheck.username, params.username),
        inArray(radcheck.attribute, ['Cleartext-Password', 'Auth-Type', 'Simultaneous-Use', 'Calling-Station-Id'])
      ));
      if (isSuspended) {
        await tx.insert(radcheck).values({ username: params.username, attribute: 'Auth-Type', op: ':=', value: 'Reject' });
      } else if (params.authType === 'username-only') {
        await tx.insert(radcheck).values({ username: params.username, attribute: 'Auth-Type', op: ':=', value: 'Accept' });
      } else if (params.password) {
        await tx.insert(radcheck).values({ username: params.username, attribute: 'Cleartext-Password', op: ':=', value: params.password });
      }
      await tx.insert(radcheck).values({ username: params.username, attribute: 'Simultaneous-Use', op: ':=', value: String(params.simultaneousUse) });
      if (params.macAddress) {
        await tx.insert(radcheck).values({
          username: params.username,
          attribute: 'Calling-Station-Id',
          op: '==',
          value: params.macAddress.toUpperCase().replace(/-/g, ':'),
        });
      }
      await tx.delete(radreply).where(and(eq(radreply.username, params.username), eq(radreply.attribute, 'Port-Limit')));
      await tx.insert(radreply).values({ username: params.username, attribute: 'Port-Limit', op: ':=', value: String(params.simultaneousUse) });
    });
  }

  async updateCardStatusInTransaction(tx: unknown, cardId: number, status: EffectiveVoucherStatus): Promise<void> {
    const db = tx as any;
    await db.update(radiusCards).set({ status, updatedAt: new Date() }).where(eq(radiusCards.id, cardId));
  }

  /** تصفير totalSessionTime وحفظ Renewal Anchor ضمن دورة الكرت الحالية. */
  async resetForRenewal(tx: unknown, params: {
    cardId: number;
    renewalAnchorSessionTime: number;
    newExpiresAt: Date | null;
    newUsageBudgetSeconds: number;
    newWindowSeconds: number;
    resetUsage: boolean;
  }): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = tx as any;
    const values: any = {
      expiresAt: params.newExpiresAt,
      usageBudgetSeconds: params.newUsageBudgetSeconds,
      windowSeconds: params.newWindowSeconds,
      updatedAt: new Date(),
    };
    if (params.resetUsage) {
      Object.assign(values, {
        totalSessionTime: 0,
        renewalAnchorSessionTime: params.renewalAnchorSessionTime,
        activatedAt: null,
        firstLoginAt: null,
        firstUseAt: null,
        windowEndTime: null,
        lastActivity: null,
        status: 'unused',
      });
    }
    await db.update(radiusCards).set(values)
      .where(eq(radiusCards.id, params.cardId));
  }

  // ─── radcheck ─────────────────────────────────────────────────────────────

  /** تفعيل كرت — حذف Auth-Type Reject إن وجد */
  async activateInRadcheck(tx: unknown, username: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = tx as any;
    await db.delete(radcheck)
      .where(and(
        eq(radcheck.username, username),
        eq(radcheck.attribute, 'Auth-Type'),
        eq(radcheck.value, 'Reject')
      ));
  }

  /** تعطيل كرت — إضافة Auth-Type Reject */
  async disableInRadcheck(tx: unknown, username: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = tx as any;
    await db.insert(radcheck)
      .values({ username, attribute: 'Auth-Type', op: ':=', value: 'Reject' })
      .onDuplicateKeyUpdate({ set: { value: 'Reject' } });
  }

  async setRejectReplyInTransaction(tx: unknown, username: string, message: string): Promise<void> {
    const db = tx as any;
    await db.insert(radreply)
      .values({ username, attribute: 'Reply-Message', op: ':=', value: message })
      .onDuplicateKeyUpdate({ set: { value: message, op: ':=' } });
  }

  async clearRejectReplyInTransaction(tx: unknown, username: string): Promise<void> {
    const db = tx as any;
    await db.delete(radreply).where(and(eq(radreply.username, username), eq(radreply.attribute, 'Reply-Message')));
  }

  /** إضافة Auth-Type Reject مباشرة (بدون tx) — لمنع الدخول عند انتهاء Budget/Window */
  async disableInRadcheckDirect(username: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.insert(radcheck)
      .values({ username, attribute: 'Auth-Type', op: ':=', value: 'Reject' })
      .onDuplicateKeyUpdate({ set: { value: 'Reject' } });
  }

  /** قراءة radcheck لمستخدم */
  async getRadcheck(username: string): Promise<Radcheck[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    return db.select().from(radcheck).where(eq(radcheck.username, username));
  }

  /** كتابة attribute في radcheck */
  async setRadcheckAttribute(username: string, attribute: string, op: string, value: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.insert(radcheck)
      .values({ username, attribute, op, value })
      .onDuplicateKeyUpdate({ set: { value, op } });
  }

  /** حذف attribute من radcheck */
  async deleteRadcheckAttribute(username: string, attribute: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.delete(radcheck)
      .where(and(eq(radcheck.username, username), eq(radcheck.attribute, attribute)));
  }

  /**
   * تحديث Expiration في radcheck لـ FreeRADIUS
   * إذا كانت null → حذف Expiration (no_expiry)
   */
  async updateExpirationInRadcheck(username: string, expiresAt: Date | null): Promise<void> {
    if (expiresAt === null) {
      await this.deleteRadcheckAttribute(username, 'Expiration');
      return;
    }
    const expirationStr = formatFreeRadiusExpiration(expiresAt);
    await this.setRadcheckAttribute(username, 'Expiration', ':=', expirationStr);
  }

  async updateExpirationInRadcheckInTransaction(tx: unknown, username: string, expiresAt: Date | null): Promise<void> {
    const db = tx as any;
    if (expiresAt === null) {
      await db.delete(radcheck).where(and(eq(radcheck.username, username), eq(radcheck.attribute, 'Expiration')));
      return;
    }
    const value = formatFreeRadiusExpiration(expiresAt);
    await db.insert(radcheck)
      .values({ username, attribute: 'Expiration', op: ':=', value })
      .onDuplicateKeyUpdate({ set: { value, op: ':=' } });
  }

  /**
   * تحديث Session-Timeout في radreply لـ FreeRADIUS
   * إذا كان 0 → حذف Session-Timeout (unlimited)
   */
  async updateSessionTimeoutInRadreply(username: string, timeoutSeconds: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    if (timeoutSeconds <= 0) {
      await db.delete(radreply)
        .where(and(eq(radreply.username, username), eq(radreply.attribute, 'Session-Timeout')));
      return;
    }
    await db.insert(radreply)
      .values({ username, attribute: 'Session-Timeout', op: ':=', value: String(timeoutSeconds) })
      .onDuplicateKeyUpdate({ set: { value: String(timeoutSeconds) } });
  }

  async updateSessionTimeoutInRadreplyInTransaction(tx: unknown, username: string, timeoutSeconds: number): Promise<void> {
    const db = tx as any;
    if (timeoutSeconds <= 0) {
      await db.delete(radreply).where(and(eq(radreply.username, username), eq(radreply.attribute, 'Session-Timeout')));
      return;
    }
    await db.insert(radreply)
      .values({ username, attribute: 'Session-Timeout', op: ':=', value: String(timeoutSeconds) })
      .onDuplicateKeyUpdate({ set: { value: String(timeoutSeconds), op: ':=' } });
  }

  /** يحفظ السرعة الجديدة للاتصالات التالية؛ CoA يطبّقها على الجلسة الحالية. */
  async updateMikrotikRateLimitInRadreply(username: string, uploadMbps: number, downloadMbps: number): Promise<string> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const rateLimit = `${Math.round(uploadMbps * 1000)}k/${Math.round(downloadMbps * 1000)}k`;
    await db.insert(radreply)
      .values({ username, attribute: 'Mikrotik-Rate-Limit', op: ':=', value: rateLimit })
      .onDuplicateKeyUpdate({ set: { value: rateLimit, op: ':=' } });
    return rateLimit;
  }
}

export const voucherRepository = new VoucherRepository();
