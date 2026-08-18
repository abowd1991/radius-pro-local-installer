/**
 * Speed Scheduler Service
 * ========================
 * يدير جداول تغيير السرعة الزمنية باستخدام Redis Sorted Set.
 *
 * المعمارية:
 * - Redis Sorted Set (speed:scheduler) يخزن مواعيد التنفيذ القادمة
 * - Heartbeat كل دقيقة يفحص Redis فقط (لا DB)
 * - Redis SETNX Lock يمنع التنفيذ المزدوج عند وجود أكثر من Instance
 * - عند حلول الموعد: Batch UPDATE على radreply + CoA Queue
 * - يدعم الدقائق بشكل كامل (HH:MM) في حساب الوقت التالي والمقارنة
 */

import { getRedis } from '../_core/redis.js';
import { getDb } from '../db.js';
import { plans } from '../../drizzle/schema.js';
import { speedSchedules, radiusCards, radreply } from '../../drizzle/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { speedQueueService } from './speedQueueService.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const SCHEDULER_KEY  = 'speed:scheduler';      // Redis Sorted Set
const LOCK_PREFIX    = 'speed:lock:sch:';      // Redis Lock prefix
const CACHE_PREFIX   = 'speed:cache:plan:';    // Cache سياسات السرعة
const LOCK_TTL_SEC   = 90;                     // Lock TTL بالثواني
const CACHE_TTL_SEC  = 300;                    // Cache TTL = 5 دقائق
const BATCH_SIZE     = 500;                    // حجم Batch لتحديث radreply (500 = optimal for MySQL IN clause)
const BATCH_DELAY_MS = 30;                     // Delay بين Batches بالمللي ثانية
const STREAM_PAGE    = 2000;                   // حجم صفحة Streaming لجلب usernames من DB

// ─── Types ────────────────────────────────────────────────────────────────────
interface ScheduleEvent {
  scheduleId: number;
  planId: number;
  ownerId: number;
  downloadKbps: number;
  uploadKbps: number;
  nextRunAt: number; // Unix timestamp بالثواني
}

interface SpeedPolicy {
  scheduleId: number;
  downloadKbps: number;
  uploadKbps: number;
  startHour: number;
  startMinute: number;   // ✅ دعم الدقائق
  endHour: number;
  endMinute: number;     // ✅ دعم الدقائق
  daysOfWeek: number[];
  priority: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * تحويل Kbps إلى صيغة MikroTik Rate-Limit
 * MikroTik format: upload/download
 * مثال: download=10240, upload=5120 → "5120k/10240k"
 */
function kbpsToRateLimit(downloadKbps: number, uploadKbps: number): string {
  return `${uploadKbps}k/${downloadKbps}k`;
}

/**
 * تحويل ساعة + دقيقة إلى دقائق منذ منتصف الليل
 */
function toMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/**
 * حساب الوقت التالي لتشغيل الجدول — يستخدم التوقيت المحلي للـ VPS (UTC+3)
 * يعيد Unix timestamp بالثواني لأقرب وقت بداية أو نهاية
 */
function calcNextRunTime(schedule: {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  daysOfWeek: number[];
}): number {
  // استخدام التوقيت المحلي للـ VPS (IDT = UTC+3)
  const now = new Date();
  const localHour   = now.getHours();
  const localMinute = now.getMinutes();
  const localDay    = now.getDay();
  const nowMinutes  = toMinutes(localHour, localMinute);

  // نقاط التشغيل: بداية الجدول ونهايته
  const timePoints = [
    { hour: schedule.startHour, minute: schedule.startMinute },
    { hour: schedule.endHour,   minute: schedule.endMinute   },
  ];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDay = (localDay + dayOffset) % 7;
    if (!(schedule.daysOfWeek as number[]).includes(checkDay)) continue;

    for (const tp of timePoints) {
      const tpMinutes = toMinutes(tp.hour, tp.minute);
      // في نفس اليوم: تخطى الأوقات الماضية
      if (dayOffset === 0 && tpMinutes <= nowMinutes) continue;

      // بناء التاريخ بالتوقيت المحلي
      const next = new Date(now);
      next.setDate(now.getDate() + dayOffset);
      next.setHours(tp.hour, tp.minute, 0, 0);
      return Math.floor(next.getTime() / 1000);
    }
  }

  // fallback: 24 ساعة من الآن
  return Math.floor(Date.now() / 1000) + 86400;
}

/**
 * فحص هل الوقت الحالي يقع ضمن نطاق جدول السرعة — يدعم الدقائق
 */
function isTimeInRange(
  currentHour: number,
  currentMinute: number,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): boolean {
  const current = toMinutes(currentHour, currentMinute);
  const start   = toMinutes(startHour, startMinute);
  const end     = toMinutes(endHour, endMinute);

  if (start <= end) {
    // نطاق عادي (مثل 01:15 → 08:30)
    return current >= start && current < end;
  } else {
    // يتجاوز منتصف الليل (مثل 22:00 → 06:00)
    return current >= start || current < end;
  }
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export const speedSchedulerService = {

  /**
   * تحميل جميع الجداول النشطة من DB وتسجيلها في Redis Sorted Set
   * يُستدعى عند: إنشاء/تعديل/حذف جدول
   */
  async syncSchedulesToRedis(): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const db = await getDb();
    if (!db) return;

    const schedules = await db
      .select()
      .from(speedSchedules)
      .where(eq(speedSchedules.isActive, true));

    if (schedules.length === 0) {
      await redis.del(SCHEDULER_KEY);
      console.log('[SpeedScheduler] No active schedules, cleared Redis');
      return;
    }

    const pipeline = redis.pipeline();
    pipeline.del(SCHEDULER_KEY);

    for (const sch of schedules) {
      const nextRun = calcNextRunTime({
        startHour:   sch.startHour,
        startMinute: sch.startMinute ?? 0,
        endHour:     sch.endHour,
        endMinute:   sch.endMinute ?? 0,
        daysOfWeek:  (sch.daysOfWeek as number[]) || [],
      });

      const event: ScheduleEvent = {
        scheduleId:   sch.id,
        planId:       sch.planId,
        ownerId:      sch.ownerId,
        downloadKbps: sch.downloadKbps,
        uploadKbps:   sch.uploadKbps,
        nextRunAt:    nextRun,
      };

      pipeline.zadd(SCHEDULER_KEY, nextRun, JSON.stringify(event));
    }

    await pipeline.exec();
    console.log(`[SpeedScheduler] Synced ${schedules.length} schedules to Redis`);
  },

  /**
   * الدالة الرئيسية — تُستدعى من Heartbeat كل دقيقة
   * تفحص Redis، وإذا كان فارغاً (بعد restart) يُعيد التزامن من DB تلقائياً
   */
  async runPendingSchedules(): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    // Auto-sync: إذا كان Redis فارغاً (بعد restart أو أول تشغيل) أعد التزامن من DB
    const redisCount = await redis.zcard(SCHEDULER_KEY);
    if (redisCount === 0) {
      console.log('[SpeedScheduler] Redis empty — auto-syncing schedules from DB...');
      await this.syncSchedulesToRedis();
    }

    const now = Math.floor(Date.now() / 1000);

    // جلب الجداول التي حان وقتها (score <= now)
    const dueItems = await redis.zrangebyscore(
      SCHEDULER_KEY, '-inf', now, 'WITHSCORES', 'LIMIT', 0, 50
    ) as string[];

    if (!dueItems || dueItems.length === 0) return;

    // dueItems = [member, score, member, score, ...]
    for (let i = 0; i < dueItems.length; i += 2) {
      const eventJson = dueItems[i];
      const score = parseInt(dueItems[i + 1]);

      let event: ScheduleEvent;
      try {
        event = JSON.parse(eventJson);
      } catch {
        await redis.zrem(SCHEDULER_KEY, eventJson);
        continue;
      }

      // Redis Lock — منع التنفيذ المزدوج
      const lockKey = `${LOCK_PREFIX}${event.scheduleId}:${score}`;
      const instanceId = `${process.pid}-${Date.now()}`;
      const locked = await redis.set(lockKey, instanceId, 'NX', 'EX', LOCK_TTL_SEC);
      if (!locked) {
        console.log(`[SpeedScheduler] Schedule ${event.scheduleId} already locked, skipping`);
        continue;
      }

      try {
        await this._executeSchedule(event);

        // حذف من Sorted Set
        await redis.zrem(SCHEDULER_KEY, eventJson);

        // جلب الجدول من DB لحساب الموعد التالي
        const db = await getDb();
        if (db) {
          const [sch] = await db
            .select()
            .from(speedSchedules)
            .where(and(eq(speedSchedules.id, event.scheduleId), eq(speedSchedules.isActive, true)));

          if (sch) {
            const nextRun = calcNextRunTime({
              startHour:   sch.startHour,
              startMinute: sch.startMinute ?? 0,
              endHour:     sch.endHour,
              endMinute:   sch.endMinute ?? 0,
              daysOfWeek:  (sch.daysOfWeek as number[]) || [],
            });
            const nextEvent: ScheduleEvent = { ...event, nextRunAt: nextRun };
            await redis.zadd(SCHEDULER_KEY, nextRun, JSON.stringify(nextEvent));
            console.log(`[SpeedScheduler] Next run for schedule ${event.scheduleId}: ${new Date(nextRun * 1000).toISOString()}`);
          }
        }

      } catch (err: any) {
        console.error(`[SpeedScheduler] Error executing schedule ${event.scheduleId}:`, err.message);
      } finally {
        // حذف Lock بشكل Atomic (Lua script)
        await redis.eval(
          `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`,
          1, lockKey, instanceId
        );
      }
    }
  },

  /**
   * تنفيذ جدول سرعة واحد:
   * 1. Batch UPDATE على radreply (جميع كروت الباقة في radius_cards بغض النظر عن الحالة)
   * 2. إضافة المتصلين لـ CoA Queue
   */
  async _executeSchedule(event: ScheduleEvent): Promise<void> {
    const rateLimit = kbpsToRateLimit(event.downloadKbps, event.uploadKbps);
    console.log(`[SpeedScheduler] Executing schedule ${event.scheduleId} → plan ${event.planId} → ${rateLimit}`);

    await this._updateRadreplyForPlan(event.planId, rateLimit);

    // 3. إضافة المتصلين لـ CoA Queue (Per-NAS)
    await speedQueueService.enqueueCoAForPlan(event.planId, event.downloadKbps, event.uploadKbps);
  },

  /**
   * تحديث radreply لجميع كروت الباقة بـ Streaming Pages
   * يدعم 50,000+ كرت بدون ضغط على الذاكرة أو قاعدة البيانات
   * - يجلب usernames على دفعات صغيرة (STREAM_PAGE) بدلاً من كل شيء دفعة واحدة
   * - يُحدّث radreply بـ BATCH_SIZE مع delay بين كل دفعة
   */
  async _updateRadreplyForPlan(planId: number, rateLimit: string): Promise<void> {
    const db = await getDb();
    if (!db) return;

    let offset = 0;
    let totalUpdated = 0;

    while (true) {
      // جلب صفحة من usernames (Streaming — لا نحمّل كل شيء دفعة واحدة)
      const page = await db
        .select({ username: radiusCards.username })
        .from(radiusCards)
        .where(eq(radiusCards.planId, planId))
        .limit(STREAM_PAGE)
        .offset(offset);

      if (page.length === 0) break;

      const usernames = page.map((c: { username: string }) => c.username);

      // تحديث radreply بـ Batches داخل الصفحة
      for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
        const batch = usernames.slice(i, i + BATCH_SIZE);
        await db
          .update(radreply)
          .set({ value: rateLimit })
          .where(
            and(
              inArray(radreply.username, batch),
              eq(radreply.attribute, 'Mikrotik-Rate-Limit')
            )
          );

        totalUpdated += batch.length;

        // Delay بين Batches لتخفيف الضغط على MySQL
        if (i + BATCH_SIZE < usernames.length) {
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      // إذا كانت الصفحة أقل من STREAM_PAGE فهذه آخر صفحة
      if (page.length < STREAM_PAGE) break;

      offset += STREAM_PAGE;

      // Delay بين الصفحات لإعطاء MySQL فرصة للتعافي
      await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[SpeedScheduler] radreply updated: ${totalUpdated} cards processed for plan ${planId}`);
  },

  /**
   * تطبيق سرعة الباقة الحالية الآن (يدوي من الواجهة)
   * يحدد السرعة المناسبة (جدول نشط أو سرعة أصلية) ويطبقها فوراً
   */
  async applyNow(planId: number): Promise<{ applied: string; cardCount: number }> {
    const db = await getDb();
    if (!db) return { applied: 'none', cardCount: 0 };

    // فحص هل يوجد جدول نشط الآن
    const currentSpeed = await this.getCurrentSpeedForPlan(planId);

    let downloadKbps: number;
    let uploadKbps: number;
    let applied: string;

    if (currentSpeed) {
      // يوجد جدول نشط — طبّق سرعة الجدول
      downloadKbps = currentSpeed.downloadKbps;
      uploadKbps   = currentSpeed.uploadKbps;
      applied      = 'schedule';
    } else {
      // لا يوجد جدول نشط — أرجع السرعة الأصلية من الباقة
      const [plan] = await db
        .select({ downloadSpeed: plans.downloadSpeed, uploadSpeed: plans.uploadSpeed })
        .from(plans)
        .where(eq(plans.id, planId));

      if (!plan) return { applied: 'none', cardCount: 0 };

      downloadKbps = plan.downloadSpeed;
      uploadKbps   = plan.uploadSpeed;
      applied      = 'original';
    }

    const rateLimit = kbpsToRateLimit(downloadKbps, uploadKbps);
    console.log(`[SpeedScheduler] applyNow: plan ${planId} → ${rateLimit} (${applied})`);

    // حساب عدد الكروت
    const [{ count }] = await db
      .select({ count: db.$count(radiusCards, eq(radiusCards.planId, planId)) })
      .from(radiusCards);

    // تحديث radreply بـ Streaming
    await this._updateRadreplyForPlan(planId, rateLimit);

    // إرسال CoA للمتصلين
    await speedQueueService.enqueueCoAForPlan(planId, downloadKbps, uploadKbps);

    return { applied, cardCount: Number(count) };
  },

  /**
   * مسح Cache باقة معينة (عند تعديل جدول السرعة)
   */
  async invalidatePlanCache(planId: number): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(`${CACHE_PREFIX}${planId}`);
  },

  /**
   * إرجاع سرعة الباقة الأصلية (من plans.downloadSpeed/uploadSpeed) وتطبيقها على radreply + CoA
   * يُستدعى عند حذف جدول أو تعطيله لإرجاع الكروت لسرعتها الطبيعية
   */
  async restorePlanSpeed(planId: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // جلب السرعة الأصلية من الباقة
    const [plan] = await db
      .select({ downloadSpeed: plans.downloadSpeed, uploadSpeed: plans.uploadSpeed })
      .from(plans)
      .where(eq(plans.id, planId));

    if (!plan) {
      console.log(`[SpeedScheduler] restorePlanSpeed: plan ${planId} not found`);
      return;
    }

    const downloadKbps = plan.downloadSpeed;
    const uploadKbps   = plan.uploadSpeed;
    const rateLimit    = kbpsToRateLimit(downloadKbps, uploadKbps);

    console.log(`[SpeedScheduler] Restoring plan ${planId} to original speed: ${rateLimit}`);

    // Streaming UPDATE على radreply (يدعم 50,000+ كرت)
    await this._updateRadreplyForPlan(planId, rateLimit);

    // إرسال CoA للمتصلين الحاليين
    await speedQueueService.enqueueCoAForPlan(planId, downloadKbps, uploadKbps);
  },

  /**
   * تطبيق جدول فوري إذا كان الوقت الحالي ضمن نطاقه
   * يُستدعى عند إنشاء جدول جديد أو تعديله
   */
  async applyIfActive(schedule: {
    id: number;
    planId: number;
    ownerId?: number;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    daysOfWeek: number[];
    downloadKbps: number;
    uploadKbps: number;
    isActive: boolean;
  }): Promise<void> {
    if (!schedule.isActive) return;

    const now = new Date();
    const currentHour   = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay    = now.getDay();

    if (!schedule.daysOfWeek.includes(currentDay)) return;

    const inRange = isTimeInRange(
      currentHour, currentMinute,
      schedule.startHour, schedule.startMinute,
      schedule.endHour,   schedule.endMinute
    );

    if (!inRange) {
      console.log(`[SpeedScheduler] applyIfActive: schedule ${schedule.id} not active now (${currentHour}:${String(currentMinute).padStart(2,'0')})`);
      return;
    }

    console.log(`[SpeedScheduler] applyIfActive: schedule ${schedule.id} IS active now — applying immediately`);
    await this._executeSchedule({
      scheduleId:   schedule.id,
      planId:       schedule.planId,
      ownerId:      schedule.ownerId ?? 0,
      downloadKbps: schedule.downloadKbps,
      uploadKbps:   schedule.uploadKbps,
      nextRunAt:    Math.floor(Date.now() / 1000),
    });
  },

  async getCurrentSpeedForPlan(planId: number): Promise<{ downloadKbps: number; uploadKbps: number } | null> {
    const redis = getRedis();

    let policies: SpeedPolicy[] | null = null;

    if (redis) {
      const cached = await redis.get(`${CACHE_PREFIX}${planId}`);
      if (cached) {
        try { policies = JSON.parse(cached); } catch { /* ignore */ }
      }
    }

    if (!policies) {
      const db = await getDb();
      if (!db) return null;

      const schedules = await db
        .select()
        .from(speedSchedules)
        .where(and(eq(speedSchedules.planId, planId), eq(speedSchedules.isActive, true)));

      policies = schedules.map((s: typeof schedules[0]) => ({
        scheduleId:  s.id,
        downloadKbps: s.downloadKbps,
        uploadKbps:   s.uploadKbps,
        startHour:    s.startHour,
        startMinute:  s.startMinute ?? 0,   // ✅ دعم الدقائق
        endHour:      s.endHour,
        endMinute:    s.endMinute ?? 0,     // ✅ دعم الدقائق
        daysOfWeek:   (s.daysOfWeek as number[]) || [],
        priority:     s.priority,
      }));

      if (redis) {
        await redis.setex(`${CACHE_PREFIX}${planId}`, CACHE_TTL_SEC, JSON.stringify(policies));
      }
    }

    // استخدام التوقيت المحلي للـ VPS (IDT = UTC+3)
    const now = new Date();
    const currentHour   = now.getHours();
    const currentMinute = now.getMinutes();   // ✅ دعم الدقائق بالتوقيت المحلي
    const currentDay    = now.getDay();

    const active = (policies as SpeedPolicy[])
      .filter((p: SpeedPolicy) => {
        if (!p.daysOfWeek.includes(currentDay)) return false;
        return isTimeInRange(
          currentHour, currentMinute,
          p.startHour, p.startMinute,
          p.endHour,   p.endMinute
        );
      })
      .sort((a, b) => b.priority - a.priority);

    return active.length > 0
      ? { downloadKbps: active[0].downloadKbps, uploadKbps: active[0].uploadKbps }
      : null;
  },
};
