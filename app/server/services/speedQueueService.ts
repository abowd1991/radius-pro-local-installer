/**
 * Speed Queue Service
 * ====================
 * يدير Queue إرسال CoA لتغيير السرعة للمستخدمين المتصلين.
 *
 * المعمارية:
 * - Queue مستقلة لكل NAS: speed:coa:queue:{nasIp}
 * - كل Queue تحتوي على JSON items: { username, downloadMbps, uploadMbps, sessionId }
 * - Worker يعالج 30 مستخدم/batch مع 200ms delay بين Batches
 * - يستخدم coaService.updateSessionAttributes الموجود
 */

import { getRedis } from '../_core/redis.js';
import { getDb } from '../db.js';
import { radiusCards, onlineSessions } from '../../drizzle/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { updateSessionAttributes } from './coaService.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const COA_QUEUE_PREFIX = 'speed:coa:queue:';  // Redis List prefix لكل NAS
const COA_BATCH_SIZE   = 30;                  // عدد المستخدمين لكل Batch
const COA_BATCH_DELAY  = 200;                 // Delay بين Batches بالمللي ثانية
const COA_WORKER_LOCK  = 'speed:coa:worker:'; // Lock لكل NAS Worker

// ─── Types ────────────────────────────────────────────────────────────────────
interface CoAQueueItem {
  username: string;
  downloadMbps: number;
  uploadMbps: number;
  nasIp: string;
  sessionId: string;
  framedIp?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const speedQueueService = {

  /**
   * إضافة CoA لكل المتصلين في باقة معينة إلى Queue مجزأة بـ NAS
   */
  async enqueueCoAForPlan(planId: number, downloadKbps: number, uploadKbps: number): Promise<void> {
    const redis = getRedis();
    if (!redis) {
      console.warn('[SpeedQueue] Redis not available, skipping CoA queue');
      return;
    }

    const db = await getDb();
    if (!db) return;

    // تحويل Kbps إلى Mbps لـ coaService
    const downloadMbps = downloadKbps / 1000;
    const uploadMbps = uploadKbps / 1000;

    // الخطوة 1: جلب usernames من radius_cards (نفس قاعدة بيانات التطبيق)
    const cards = await db.select({ username: radiusCards.username })
      .from(radiusCards)
      .where(eq(radiusCards.planId, planId));

    if (!cards || cards.length === 0) {
      console.log(`[SpeedQueue] No cards found for plan ${planId}`);
      return;
    }

    const usernames = cards.map((c: any) => c.username as string).filter(Boolean);
    if (usernames.length === 0) return;

    // الخطوة 2: online_sessions هي مصدر الحقيقة الوحيد للجلسات الحية في V2.
    // نعالج على دفعات لتجنب IN clause كبيرة جداً.
    const CHUNK = 500;
    const allSessions: any[] = [];
    for (let i = 0; i < usernames.length; i += CHUNK) {
      const chunk = usernames.slice(i, i + CHUNK);
      const rows = await db.select({
        username: onlineSessions.username,
        nasIp: onlineSessions.nasIp,
        acctSessionId: onlineSessions.acctSessionId,
        framedIpAddress: onlineSessions.framedIpAddress,
      })
        .from(onlineSessions)
        .where(inArray(onlineSessions.username, chunk));
      allSessions.push(...rows.filter((row: { nasIp: string | null }) => Boolean(row.nasIp)));
    }

    if (allSessions.length === 0) {
      console.log(`[SpeedQueue] No active sessions for plan ${planId}`);
      return;
    }

    const sessions = allSessions;
    const nasIpSet = new Set<string>(sessions.map((s: any) => s.nasIp as string));
    const nasIps = Array.from(nasIpSet);

    // إضافة لـ Queue بـ Redis
    const pipeline = redis.pipeline();
    let totalQueued = 0;

    for (const session of sessions) {
      const item: CoAQueueItem = {
        username: session.username,
        downloadMbps,
        uploadMbps,
        nasIp: session.nasIp,
        sessionId: session.acctSessionId,
        framedIp: session.framedIpAddress || undefined,
      };

      const queueKey = `${COA_QUEUE_PREFIX}${session.nasIp}`;
      pipeline.rpush(queueKey, JSON.stringify(item));
      pipeline.expire(queueKey, 3600); // TTL ساعة واحدة
      totalQueued++;
    }

    await pipeline.exec();
    console.log(`[SpeedQueue] Queued ${totalQueued} CoA requests across ${nasIps.length} NAS devices`);

    // تشغيل Worker لكل NAS بشكل مستقل
    for (const nasIp of nasIps) {
      this.processNasQueue(nasIp).catch(err =>
        console.error(`[SpeedQueue] Worker error for NAS ${nasIp}:`, err.message)
      );
    }
  },

  /**
   * معالجة Queue لـ NAS معين — Batch بـ 30 مستخدم مع 200ms delay
   */
  async processNasQueue(nasIp: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const queueKey = `${COA_QUEUE_PREFIX}${nasIp}`;
    const lockKey = `${COA_WORKER_LOCK}${nasIp}`;
    const instanceId = `${process.pid}-${Date.now()}`;

    // Lock لمنع تشغيل Worker مزدوج لنفس NAS
    const locked = await redis.set(lockKey, instanceId, 'NX', 'EX', 300);
    if (!locked) {
      console.log(`[SpeedQueue] Worker for NAS ${nasIp} already running, skipping`);
      return;
    }

    try {
      let processed = 0;
      let batchCount = 0;

      while (true) {
        // جلب batch من Queue
        const batch: CoAQueueItem[] = [];
        for (let i = 0; i < COA_BATCH_SIZE; i++) {
          const item = await redis.lpop(queueKey);
          if (!item) break;
          try {
            batch.push(JSON.parse(item));
          } catch { /* skip malformed */ }
        }

        if (batch.length === 0) break;

        // إرسال CoA بالتوازي لكل الـ batch
        const results = await Promise.allSettled(
          batch.map(item =>
            updateSessionAttributes(
              item.username,
              item.nasIp,
              item.sessionId,
              item.framedIp,
              {
                downloadSpeed: item.downloadMbps,
                uploadSpeed: item.uploadMbps,
              }
            )
          )
        );

        const success = results.filter(
          r => r.status === 'fulfilled' && (r.value as any).success
        ).length;

        processed += batch.length;
        batchCount++;

        console.log(`[SpeedQueue] NAS ${nasIp} batch ${batchCount}: ${success}/${batch.length} CoA sent`);

        // Delay بين Batches
        if (batch.length === COA_BATCH_SIZE) {
          await new Promise(r => setTimeout(r, COA_BATCH_DELAY));
        }
      }

      console.log(`[SpeedQueue] NAS ${nasIp} completed: ${processed} total CoA processed`);

    } finally {
      // حذف Lock بشكل Atomic
      await redis.eval(
        `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`,
        1, lockKey, instanceId
      );
    }
  },

  /**
   * إحصائيات Queue الحالية
   */
  async getQueueStats(): Promise<{ nasIp: string; pending: number }[]> {
    const redis = getRedis();
    if (!redis) return [];

    const keys = await redis.keys(`${COA_QUEUE_PREFIX}*`);
    const stats: { nasIp: string; pending: number }[] = [];

    for (const key of keys) {
      const len = await redis.llen(key);
      const nasIp = key.replace(COA_QUEUE_PREFIX, '');
      stats.push({ nasIp, pending: len });
    }

    return stats;
  },
};
