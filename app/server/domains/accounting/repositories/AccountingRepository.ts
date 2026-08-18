/**
 * AccountingRepository — إدارة radacct وtotalSessionTime
 * radacct = سجل التدقيق فقط
 * totalSessionTime = Cache للوقت المستهلك
 * Radius Pro Local V2
 */

import { eq, and, isNull, isNotNull, sql, desc } from 'drizzle-orm';
import { getDb } from '../../../db';
import { radacct, radiusCards, onlineSessions, cardLifecycleSessions, nasDevices, Radacct } from '../../../../drizzle/schema';
import { Logger } from '../../../core/Logger';

export class AccountingRepository {
  /**
   * إغلاق جلسة في radacct
   * يُستخدم داخل Transaction فقط
   */
  async closeSession(tx: unknown, params: {
    /** Acct-Unique-Session-Id is the exact radacct key when the NAS supplies it. */
    acctUniqueId?: string | null;
    /** V2 lifecycle key; used only for legacy rows without an Acct-Unique-Session-Id. */
    acctSessionId: string;
    sessionTime: number;
    terminateCause: string;
    outputOctets?: number;
    inputOctets?: number;
  }): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = tx as any;
    const identityPredicate = params.acctUniqueId?.trim()
      ? eq(radacct.acctuniqueid, params.acctUniqueId)
      : eq(radacct.acctsessionid, params.acctSessionId);
    const result = await db.update(radacct)
      .set({
        acctstoptime: new Date(),
        acctsessiontime: params.sessionTime,
        acctterminatecause: params.terminateCause,
        acctoutputoctets: params.outputOctets ?? 0,
        acctinputoctets: params.inputOctets ?? 0,
      })
      .where(and(
        identityPredicate,
        isNull(radacct.acctstoptime)
      ));
    const affected = Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0);
    return affected === 1;
  }

  /**
   * FreeRADIUS SQL may close radacct before AccountingBridge receives Stop.
   * This checks that exact accounting row inside the same V2 transaction so
   * SessionEngine can safely finalize online_sessions idempotently.
   */
  async isSessionAlreadyStopped(tx: unknown, params: {
    acctUniqueId?: string | null;
    acctSessionId: string;
  }): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = tx as any;
    const identityPredicate = params.acctUniqueId?.trim()
      ? eq(radacct.acctuniqueid, params.acctUniqueId)
      : eq(radacct.acctsessionid, params.acctSessionId);
    const rows = await db.select({ id: radacct.radacctid })
      .from(radacct)
      .where(and(identityPredicate, isNotNull(radacct.acctstoptime)))
      .limit(1);
    return rows.length === 1;
  }

  /**
   * تحديث totalSessionTime داخل معاملة Accounting Stop نفسها.
   * يضمن تطابق radacct + online_sessions + totalSessionTime عند Commit واحد.
   */
  async addToTotalSessionTimeInTransaction(tx: unknown, cardId: number, addSeconds: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = tx as any;
    await db.update(radiusCards)
      .set({ totalSessionTime: sql`totalSessionTime + ${addSeconds}` })
      .where(eq(radiusCards.id, cardId));
  }

  async getRenewalAnchorInTransaction(tx: unknown, cardId: number): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = tx as any;
    const rows = await db.select({ anchor: radiusCards.renewalAnchorSessionTime })
      .from(radiusCards)
      .where(eq(radiusCards.id, cardId))
      .limit(1);
    return Number(rows[0]?.anchor ?? 0);
  }

  /**
   * تحديث totalSessionTime خارج Transaction للحالات الإدارية فقط.
   */
  async addToTotalSessionTime(cardId: number, addSeconds: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.update(radiusCards)
      .set({
        totalSessionTime: sql`totalSessionTime + ${addSeconds}`,
      })
      .where(eq(radiusCards.id, cardId));
    Logger.debug(`AccountingRepo: added ${addSeconds}s to card#${cardId}`, {
      context: 'AccountingRepo',
    });
  }

  /**
   * قراءة totalSessionTime للكرت
   */
  async getTotalSessionTime(cardId: number): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select({ totalSessionTime: radiusCards.totalSessionTime })
      .from(radiusCards)
      .where(eq(radiusCards.id, cardId))
      .limit(1);
    return result[0]?.totalSessionTime ?? 0;
  }

  /**
   * قراءة الوقت من radacct للـ Validation
   * يُستخدم فقط للمقارنة مع Cache
   */
  async getRadacctTotalTime(username: string): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select({
      total: sql<number>`COALESCE(SUM(acctsessiontime), 0)`,
    })
      .from(radacct)
      .where(eq(radacct.username, username));
    return Number(result[0]?.total ?? 0);
  }

  /** قراءة تدقيقية فقط لسجل radacct المرتبط بدورة كرت واحدة. */
  async getRadacctTotalTimeForLifecycle(lifecycleId: string): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${radacct.acctstoptime} IS NOT NULL THEN ${radacct.acctsessiontime} ELSE 0 END), 0)`,
    }).from(cardLifecycleSessions)
      .leftJoin(radacct, eq(radacct.acctuniqueid, cardLifecycleSessions.acctUniqueId))
      .where(eq(cardLifecycleSessions.lifecycleId, lifecycleId));
    return Number(result[0]?.total ?? 0);
  }

  /**
   * سجل تدقيقي وعدادات بايتات لدورة الكرت الحالية فقط.
   * لا يجوز أن يختلط تاريخ username مع دورة كرت جديدة تحمل الاسم نفسه.
   */
  async getLifecycleAuditSnapshot(lifecycleId: string): Promise<{
    history: Array<{
      acctSessionId: string | null;
      startTime: Date | null;
      stopTime: Date | null;
      sessionTime: number | null;
      inputOctets: number | null;
      outputOctets: number | null;
      nasIp: string | null;
      framedIp: string | null;
      terminateCause: string | null;
      callingStationId: string | null;
      nasShortname: string | null;
    }>;
    closedInputOctets: number;
    closedOutputOctets: number;
    closedSessionCount: number;
  }> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    // Acct-Unique-Session-Id هو الهوية الأولى، مع Acct-Session-Id كبديل
    // للسجلات القديمة التي لم تستلم unique id من NAS.
    const lifecycleRadacctJoin = sql`(
      ${radacct.acctuniqueid} = ${cardLifecycleSessions.acctUniqueId}
      OR (${cardLifecycleSessions.acctUniqueId} IS NULL AND ${radacct.acctsessionid} = ${cardLifecycleSessions.acctSessionId})
    )`;

    const [totals] = await db.select({
      closedInputOctets: sql<number>`COALESCE(SUM(CASE WHEN ${radacct.acctstoptime} IS NOT NULL THEN ${radacct.acctinputoctets} ELSE 0 END), 0)`,
      closedOutputOctets: sql<number>`COALESCE(SUM(CASE WHEN ${radacct.acctstoptime} IS NOT NULL THEN ${radacct.acctoutputoctets} ELSE 0 END), 0)`,
      closedSessionCount: sql<number>`COALESCE(SUM(CASE WHEN ${radacct.acctstoptime} IS NOT NULL THEN 1 ELSE 0 END), 0)`,
    }).from(cardLifecycleSessions)
      .leftJoin(radacct, lifecycleRadacctJoin)
      .where(eq(cardLifecycleSessions.lifecycleId, lifecycleId));

    const history = await db.select({
      acctSessionId: radacct.acctsessionid,
      startTime: radacct.acctstarttime,
      stopTime: radacct.acctstoptime,
      sessionTime: radacct.acctsessiontime,
      inputOctets: radacct.acctinputoctets,
      outputOctets: radacct.acctoutputoctets,
      nasIp: radacct.nasipaddress,
      framedIp: radacct.framedipaddress,
      terminateCause: radacct.acctterminatecause,
      callingStationId: radacct.callingstationid,
      nasShortname: nasDevices.shortname,
    }).from(cardLifecycleSessions)
      .leftJoin(radacct, lifecycleRadacctJoin)
      .leftJoin(nasDevices, eq(radacct.nasipaddress, nasDevices.nasname))
      .where(eq(cardLifecycleSessions.lifecycleId, lifecycleId))
      .orderBy(desc(radacct.acctstarttime))
      .limit(50);

    return {
      history,
      closedInputOctets: Number(totals?.closedInputOctets ?? 0),
      closedOutputOctets: Number(totals?.closedOutputOctets ?? 0),
      closedSessionCount: Number(totals?.closedSessionCount ?? 0),
    };
  }

  /**
   * البحث عن جلسة مفتوحة في radacct
   */
  async findOpenSession(acctUniqueId: string): Promise<Radacct | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select().from(radacct)
      .where(and(
        eq(radacct.acctuniqueid, acctUniqueId),
        isNull(radacct.acctstoptime)
      ))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * ضبط renewal anchor — يحفظ وقت الجلسة الحالي عند التجديد
   */
  async updateRenewalAnchor(lifecycleId: string, cardId: number): Promise<void> {
    const db = await getDb();
    if (!db) return;
    const sessions = await db.select({ sessionTime: onlineSessions.sessionTime })
      .from(onlineSessions)
      .where(eq(onlineSessions.lifecycleId, lifecycleId))
      .limit(1);
    const anchorValue = sessions[0]?.sessionTime ?? 0;
    await db.update(radiusCards)
      .set({ renewalAnchorSessionTime: anchorValue, updatedAt: new Date() })
      .where(eq(radiusCards.id, cardId));
    Logger.debug(`AccountingRepo: renewal anchor set for lifecycle ${lifecycleId} = ${anchorValue}s`, {
      context: 'AccountingRepo',
    });
  }
}

export const accountingRepository = new AccountingRepository();
