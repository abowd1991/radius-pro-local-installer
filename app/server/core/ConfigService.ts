/**
 * ConfigService — مركز كل إعدادات النظام
 * لا process.env منتشرة في الكود، لا Magic Numbers
 * Radius Pro Local V2
 */

export const Config = {
  // ─── Accounting ───────────────────────────────────────────────────────────
  /** دورة Accounting الرئيسية بالمللي ثانية */
  ACCOUNTING_INTERVAL_MS:        60_000,
  /** وقت انتهاء الجلسة بدون تحديث (Lost-Carrier) بالثواني */
  SESSION_TIMEOUT_SECONDS:       300,
  /** دورة Validation (مقارنة Cache مع radacct) */
  VALIDATION_INTERVAL_MS:        3_600_000,
  /** الحد الأقصى للفرق المسموح به بين Cache وradacct بالثواني */
  VALIDATION_MAX_DRIFT_S:        60,

  // ─── CoA ──────────────────────────────────────────────────────────────────
  /** عدد محاولات إعادة إرسال CoA */
  COA_RETRY_COUNT:               1,
  /** تأخير إعادة المحاولة بالمللي ثانية */
  COA_RETRY_DELAY_MS:            5_000,
  /** منفذ CoA على NAS */
  COA_PORT:                      3799,
  /** منع إرسال نفس CoA مرتين خلال هذه المدة (بالدقائق) */
  COA_LOOP_PREVENTION_MINUTES:   5,

  // ─── Cards ────────────────────────────────────────────────────────────────
  /** الحد الأقصى للجلسات المتزامنة لكل مستخدم */
  MAX_SESSIONS_PER_USER:         1,
  /** دورة فحص انتهاء الكروت بالمللي ثانية */
  CARD_CHECK_INTERVAL_MS:        300_000,

  // ─── Quota ────────────────────────────────────────────────────────────────
  /** دورة فحص الحصة اليومية (خارج auth path) بالدقائق */
  QUOTA_CHECK_INTERVAL_MINUTES:  5,

  // ─── Billing ──────────────────────────────────────────────────────────────
  /** فحص بوابة الفوترة اليومية بالدقائق؛ تُحسم الاستحقاقات وفق Timezone المالك */
  DAILY_BILLING_CHECK_INTERVAL_MINUTES: 5,
  /** Timezone عملية التخزين؛ العرض وحدود التقارير تأتي من Timezone المالك/الشبكة */
  TIMEZONE:                      'UTC',

  // ─── Database ─────────────────────────────────────────────────────────────
  /** عدد أيام الاحتفاظ بسجلات radacct قبل الأرشفة */
  RADACCT_ARCHIVE_DAYS:          90,
  /** الحد الأدنى لـ Connection Pool */
  DB_POOL_MIN:                   4,
  /** الحد الأقصى لـ Connection Pool */
  DB_POOL_MAX:                   10,

  // ─── Audit ────────────────────────────────────────────────────────────────
  /** عدد أيام الاحتفاظ بسجلات Audit Log */
  AUDIT_LOG_RETENTION_DAYS:      365,

  // ─── Queue ────────────────────────────────────────────────────────────────
  /** الحد الأقصى لعدد المهام المتزامنة في Queue */
  QUEUE_CONCURRENCY:             5,
  /** عدد محاولات إعادة تشغيل المهمة الفاشلة */
  QUEUE_MAX_RETRIES:             3,
  /** تأخير إعادة المحاولة بالمللي ثانية */
  QUEUE_RETRY_DELAY_MS:          10_000,

  // ─── Health Check ─────────────────────────────────────────────────────────
  /** دورة Health Check بالمللي ثانية */
  HEALTH_CHECK_INTERVAL_MS:      30_000,
  /** حد تحذير استخدام الذاكرة (%) */
  MEMORY_WARNING_THRESHOLD:      80,
  /** حد تحذير استخدام القرص (%) */
  DISK_WARNING_THRESHOLD:        85,

  // ─── FreeRADIUS ───────────────────────────────────────────────────────────
  /** مسار ملف FreeRADIUS clients.conf */
  FREERADIUS_CLIENTS_CONF:       '/etc/freeradius/3.0/clients.conf',
  /** مسار ملف FreeRADIUS raddb */
  FREERADIUS_RADDB:              '/etc/freeradius/3.0',

} as const;

export type ConfigKey = keyof typeof Config;
