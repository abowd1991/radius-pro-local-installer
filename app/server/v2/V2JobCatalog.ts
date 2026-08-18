import { eq } from "drizzle-orm";
import { radiusCards } from "../../drizzle/schema";
import { cleanupEngine } from "../domains/accounting/CleanupEngine";
import { validationEngine } from "../domains/accounting/ValidationEngine";
import { expirationEngine } from "../domains/vouchers/ExpirationEngine";
import { getDb } from "../db";
import { portForwardingEngine } from "../domains/network/PortForwardingEngine";
import { createDatabaseBackup, cleanupOldBackups } from "../services/backupService";
import { triggerBillingCycle } from "../services/billingCronJob";
import { checkAndProvisionPendingNas } from "../services/provisioningService";
import { speedSchedulerService } from "../services/speedSchedulerService";

export type V2JobId =
  | "cleanup_stale_sessions"
  | "voucher_expiration_check"
  | "accounting_validation"
  | "billing_daily_cycle"
  | "backup_daily"
  | "provisioning_check_pending"
  | "network_reconcile_port_forwarding"
  | "speed_scheduler";

export type V2JobDefinition = {
  id: V2JobId;
  nameAr: string;
  descriptionAr: string;
  interval: string;
  intervalMs: number;
  categoryAr: string;
  schedulerManaged: boolean;
  run: () => Promise<string>;
};

async function runValidationSample(): Promise<string> {
  const db = await getDb();
  const cards = await db.select({ id: radiusCards.id, username: radiusCards.username })
    .from(radiusCards)
    .where(eq(radiusCards.status, "active"))
    .limit(10);
  for (const card of cards) await validationEngine.validateUser(card.username, card.id);
  return `تم التحقق من ${cards.length} كرت نشط`;
}

export const V2_JOB_CATALOG: readonly V2JobDefinition[] = [
  {
    id: "cleanup_stale_sessions", nameAr: "تنظيف الجلسات القديمة", categoryAr: "المحاسبة",
    descriptionAr: "يغلق جلسات online_sessions التي تجاوزت مهلة الانقطاع المعتمدة ويثبت استخدامها.",
    interval: "كل 60 ثانية", intervalMs: 60_000, schedulerManaged: true,
    run: async () => `تم تنظيف ${await cleanupEngine.cleanupStaleSessions()} جلسة قديمة`,
  },
  {
    id: "voucher_expiration_check", nameAr: "فحص انتهاء الكروت", categoryAr: "الكروت",
    descriptionAr: "يفحص دورة حياة الكرت وينهي الكروت التي انتهت نافذتها أو صلاحيتها.",
    interval: "كل 5 دقائق", intervalMs: 5 * 60_000, schedulerManaged: true,
    run: async () => `تم إيقاف ${await expirationEngine.checkAndDisableExpiredCards()} كرت منتهٍ`,
  },
  {
    id: "accounting_validation", nameAr: "التحقق المحاسبي", categoryAr: "المحاسبة",
    descriptionAr: "يتحقق بعينة من اتساق استخدام الكروت في V2 دون استخدام radacct كمصدر جلسة حية.",
    interval: "كل ساعة", intervalMs: 60 * 60_000, schedulerManaged: true, run: runValidationSample,
  },
  {
    id: "billing_daily_cycle", nameAr: "دورة الفوترة اليومية", categoryAr: "الفوترة",
    descriptionAr: "يفحص بوابة الفوترة بحسب المنطقة الزمنية لكل مالك ويمنع التكرار.",
    interval: "كل 5 دقائق", intervalMs: 5 * 60_000, schedulerManaged: true,
    run: async () => { const result = await triggerBillingCycle(); return `تمت معالجة ${result.processed} مستخدم في دورة الفوترة`; },
  },
  {
    id: "backup_daily", nameAr: "النسخ الاحتياطي اليومي", categoryAr: "النسخ الاحتياطي",
    descriptionAr: "ينشئ نسخة يومية لقاعدة البيانات وينظف النسخ القديمة وفق سياسة الاحتفاظ.",
    interval: "كل 24 ساعة", intervalMs: 24 * 60 * 60_000, schedulerManaged: true,
    run: async () => { await createDatabaseBackup("daily"); await cleanupOldBackups(); return "تم إنشاء النسخة اليومية وتنظيف النسخ القديمة"; },
  },
  {
    id: "provisioning_check_pending", nameAr: "توفير أجهزة NAS المعلقة", categoryAr: "التوفير",
    descriptionAr: "يفحص أجهزة NAS التي تنتظر التوفير ويكمل المسار المركزي عند توفرها.",
    interval: "كل 30 ثانية", intervalMs: 30_000, schedulerManaged: true,
    run: async () => { await checkAndProvisionPendingNas(); return "اكتمل فحص أجهزة NAS المعلقة"; },
  },
  {
    id: "network_reconcile_port_forwarding", nameAr: "استعادة توجيهات الشبكة", categoryAr: "الشبكة",
    descriptionAr: "يعيد LAN Route وقواعد الوصول لتوجيهات المنافذ النشطة بعد عودة SSTP.",
    interval: "كل 5 دقائق", intervalMs: 5 * 60_000, schedulerManaged: true,
    run: async () => { const result = await portForwardingEngine.reconcileActiveForwards(); return `تمت تسوية ${result.restored} من أصل ${result.active} توجيه نشط`; },
  },
  {
    id: "speed_scheduler", nameAr: "السرعات المجدولة", categoryAr: "السرعة",
    descriptionAr: "يعالج تغييرات السرعة المستحقة من Redis مع أقفال تمنع تكرار التنفيذ.",
    interval: "كل دقيقة", intervalMs: 60_000, schedulerManaged: true,
    run: async () => { await speedSchedulerService.runPendingSchedules(); return "تمت معالجة تغييرات السرعة المستحقة"; },
  },
] as const;

const catalogMap = new Map(V2_JOB_CATALOG.map((job) => [job.id, job]));

export function getV2JobDefinition(jobId: string): V2JobDefinition | undefined {
  return catalogMap.get(jobId as V2JobId);
}
