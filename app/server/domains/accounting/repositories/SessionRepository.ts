/**
 * SessionRepository — إدارة online_sessions
 * المالك الوحيد لجدول online_sessions
 * Radius Pro Local V2
 */

import { eq, and, lt, sql, inArray } from 'drizzle-orm';
import { getDb } from '../../../db';
import { onlineSessions, InsertOnlineSession, OnlineSession, nasDevices, radiusCards, subscribers } from '../../../../drizzle/schema';
import { Logger } from '../../../core/Logger';

export interface ActiveSessionView {
  id: number;
  sessionId: string;
  acctSessionId: string;
  acctUniqueId: string | null;
  username: string;
  nasIp: string | null;
  nasIpAddress: string | null;
  nasName: string | null;
  framedIp: string | null;
  framedIpAddress: string | null;
  callingStationId: string | null;
  startTime: Date;
  sessionTime: number;
  inputOctets: number;
  outputOctets: number;
  serviceType: 'PPPoE' | 'Hotspot';
}

export class SessionRepository {
  /** إنشاء جلسة جديدة */
  async create(data: InsertOnlineSession): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.insert(onlineSessions).values(data);
    Logger.debug(`SessionRepo: created session for ${data.username}`, { context: 'SessionRepo' });
  }

  /** إنشاء Session داخل معاملة Accounting Start الذرية. */
  async createInTransaction(tx: unknown, data: InsertOnlineSession): Promise<void> {
    const db = tx as any;
    await db.insert(onlineSessions).values(data);
  }

  /** تحديث جلسة موجودة (Interim Update) */
  async update(acctSessionId: string, data: Partial<OnlineSession>): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.update(onlineSessions)
      .set({ ...data, lastUpdate: new Date() })
      .where(eq(onlineSessions.acctSessionId, acctSessionId));
  }

  /** حذف جلسة (عند الإغلاق) */
  async delete(acctSessionId: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.delete(onlineSessions)
      .where(eq(onlineSessions.acctSessionId, acctSessionId));
  }

  /** حذف Session داخل معاملة Accounting Stop الذرية. */
  async deleteInTransaction(tx: unknown, acctSessionId: string): Promise<void> {
    const db = tx as any;
    await db.delete(onlineSessions).where(eq(onlineSessions.acctSessionId, acctSessionId));
  }

  /** يحذف الجلسة فقط إذا بقيت راكدة عند لحظة المعاملة؛ يمنع تنظيفاً مكرراً أو سباق Interim Update. */
  async claimStaleForCleanup(tx: unknown, acctSessionId: string, cutoff: Date): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = tx as any;
    const result = await db.delete(onlineSessions)
      .where(and(
        eq(onlineSessions.acctSessionId, acctSessionId),
        lt(onlineSessions.lastUpdate, cutoff)
      ));
    const affected = Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0);
    return affected === 1;
  }

  /** حذف جلسات متعددة (batch) */
  async deleteBatch(acctSessionIds: string[]): Promise<void> {
    if (acctSessionIds.length === 0) return;
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    for (const id of acctSessionIds) {
      await db.delete(onlineSessions).where(eq(onlineSessions.acctSessionId, id));
    }
  }

  /** البحث عن جلسة بـ acctSessionId */
  async findBySessionId(acctSessionId: string): Promise<OnlineSession | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select().from(onlineSessions)
      .where(eq(onlineSessions.acctSessionId, acctSessionId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * الجلسة التي يمكن التحكم بها عبر CoA. sessionId في واجهة Sessions
   * يساوي دائماً Acct-Session-Id القادم من NAS، وليس row id ولا acctuniqueid.
   */
  async findControllableSession(acctSessionId: string): Promise<OnlineSession | null> {
    return this.findBySessionId(acctSessionId);
  }

  /** البحث عن جلسات مستخدم معين */
  async findByUsername(username: string): Promise<OnlineSession[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    return db.select().from(onlineSessions)
      .where(eq(onlineSessions.username, username));
  }

  /** جلسات Card Lifecycle محددة؛ يحمي username المعاد استخدامه من احتساب جلسة قديمة. */
  async findByLifecycleId(lifecycleId: string): Promise<OnlineSession[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    return db.select().from(onlineSessions)
      .where(eq(onlineSessions.lifecycleId, lifecycleId));
  }

  /** يعيد cardId للجلسات الحية التي تطابق Lifecycles الكروت المعروضة فقط. */
  async findOnlineCardIdsByLifecycleIds(lifecycleIds: string[]): Promise<number[]> {
    if (lifecycleIds.length === 0) return [];
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const rows = await db.select({ cardId: onlineSessions.cardId })
      .from(onlineSessions)
      .where(inArray(onlineSessions.lifecycleId, lifecycleIds));
    return rows.flatMap((row: { cardId: number | null }) => row.cardId === null ? [] : [row.cardId]);
  }

  /** عدد الجلسات النشطة لمستخدم */
  async countByUsername(username: string): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select({ count: sql<number>`COUNT(*)` })
      .from(onlineSessions)
      .where(eq(onlineSessions.username, username));
    return Number(result[0]?.count ?? 0);
  }

  /** جميع الجلسات النشطة */
  async findAll(): Promise<OnlineSession[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    return db.select().from(onlineSessions);
  }

  /** DTO موحّد للواجهة؛ مصدره online_sessions فقط. */
  async findActiveViews(ownerId: number | null): Promise<ActiveSessionView[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');

    const ownerPredicate = ownerId === null
      ? sql`1 = 1`
      : sql`(
          ${radiusCards.createdBy} = ${ownerId}
          OR ${radiusCards.resellerId} = ${ownerId}
          OR ${subscribers.createdBy} = ${ownerId}
        )`;
    const result = await db.select({
      id: onlineSessions.id,
      acctSessionId: onlineSessions.acctSessionId,
      acctUniqueId: onlineSessions.acctUniqueId,
      username: onlineSessions.username,
      nasIp: onlineSessions.nasIp,
      nasName: nasDevices.shortname,
      framedIp: onlineSessions.framedIpAddress,
      callingStationId: onlineSessions.callingStationId,
      startTime: onlineSessions.startTime,
      sessionTime: onlineSessions.sessionTime,
      inputOctets: onlineSessions.inputOctets,
      outputOctets: onlineSessions.outputOctets,
      subscriberId: subscribers.id,
      })
      .from(onlineSessions)
      .leftJoin(nasDevices, eq(nasDevices.nasname, onlineSessions.nasIp))
      .leftJoin(radiusCards, and(
        eq(radiusCards.id, onlineSessions.cardId),
        eq(radiusCards.lifecycleId, onlineSessions.lifecycleId),
      ))
      .leftJoin(subscribers, eq(subscribers.username, onlineSessions.username))
      .where(ownerPredicate)
      .orderBy(sql`${onlineSessions.startTime} DESC`);

    return result.map((row: any) => ({
      id: row.id,
      sessionId: row.acctSessionId,
      acctSessionId: row.acctSessionId,
      acctUniqueId: row.acctUniqueId ?? null,
      username: row.username,
      nasIp: row.nasIp ?? null,
      nasIpAddress: row.nasIp ?? null,
      nasName: row.nasName ?? row.nasIp ?? null,
      framedIp: row.framedIp ?? null,
      framedIpAddress: row.framedIp ?? null,
      callingStationId: row.callingStationId ?? null,
      startTime: row.startTime,
      sessionTime: Number(row.sessionTime ?? 0),
      inputOctets: Number(row.inputOctets ?? 0),
      outputOctets: Number(row.outputOctets ?? 0),
      serviceType: row.subscriberId ? 'PPPoE' : 'Hotspot',
    }));
  }

  async getActiveStats(): Promise<{ activeSessionsCount: number; totalSessionTime: number; totalInputOctets: number; totalOutputOctets: number }> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select({
      activeSessionsCount: sql<number>`COUNT(*)`,
      totalSessionTime: sql<number>`COALESCE(SUM(${onlineSessions.sessionTime}), 0)`,
      totalInputOctets: sql<number>`COALESCE(SUM(${onlineSessions.inputOctets}), 0)`,
      totalOutputOctets: sql<number>`COALESCE(SUM(${onlineSessions.outputOctets}), 0)`,
    }).from(onlineSessions);
    const row = result[0];
    return {
      activeSessionsCount: Number(row?.activeSessionsCount ?? 0),
      totalSessionTime: Number(row?.totalSessionTime ?? 0),
      totalInputOctets: Number(row?.totalInputOctets ?? 0),
      totalOutputOctets: Number(row?.totalOutputOctets ?? 0),
    };
  }

  /** جلسات Stale (لم تُحدَّث منذ مدة) — Lost-Carrier */
  async findStale(timeoutSeconds: number): Promise<OnlineSession[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const cutoff = new Date(Date.now() - timeoutSeconds * 1000);
    return db.select().from(onlineSessions)
      .where(lt(onlineSessions.lastUpdate, cutoff));
  }

  /** عدد الجلسات الكلي */
  async count(): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select({ count: sql<number>`COUNT(*)` })
      .from(onlineSessions);
    return Number(result[0]?.count ?? 0);
  }
}

export const sessionRepository = new SessionRepository();
