/**
 * cronJobGuard.ts
 * Helper مشترك للتحقق من حالة الـ Cron Job قبل التنفيذ التلقائي.
 * كل service تستدعي isJobEnabled(jobId) في بداية الـ setInterval callback.
 *
 * Safe Optimization (2026-07-26):
 * Added in-memory cache with 30s TTL to reduce DB queries.
 * isJobEnabled is called 6+ times per minute — without cache this is 6+ DB
 * round-trips per minute for a rarely-changing setting.
 * Cache TTL = 30s means a toggle from the dashboard takes effect within 30s.
 * No behavior change: defaults remain the same (true if missing, true on error).
 */
import { getDb } from "../db";
import { cronJobSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── In-memory cache ──────────────────────────────────────────────────────────
const CACHE_TTL_MS = 30_000; // 30 seconds — matches UI toggle responsiveness
const _cache = new Map<string, { enabled: boolean; fetchedAt: number }>();

/** Invalidate cache for a specific job (call after toggling from UI) */
export function invalidateJobEnabledCache(jobId?: string): void {
  if (jobId) {
    _cache.delete(jobId);
  } else {
    _cache.clear();
  }
}

/**
 * يُعيد true إذا كان الـ job مُفعَّلاً أو غير موجود في DB (الافتراضي: مُفعَّل).
 * يُعيد false إذا كان الـ job موقوفاً يدوياً من لوحة التحكم.
 * النتيجة مُخزَّنة في الذاكرة لمدة 30 ثانية لتقليل استعلامات DB.
 */
export async function isJobEnabled(jobId: string): Promise<boolean> {
  // Check cache first
  const cached = _cache.get(jobId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.enabled;
  }

  try {
    const db = await getDb();
    const rows = await db
      .select({ enabled: cronJobSettings.enabled })
      .from(cronJobSettings)
      .where(eq(cronJobSettings.jobId, jobId))
      .limit(1);
    const enabled = rows.length === 0 ? true : rows[0].enabled; // غير موجود = مُفعَّل افتراضياً
    _cache.set(jobId, { enabled, fetchedAt: Date.now() });
    return enabled;
  } catch {
    return true; // عند خطأ في DB نسمح بالتشغيل لتجنب توقف الخدمة
  }
}
