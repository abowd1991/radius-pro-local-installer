/**
 * AI Tools Registry — Read-Only, Tenant-Isolated
 * ================================================
 * الإصلاحات:
 * 1. البحث بـ username أو serialNumber (كلاهما)
 * 2. البحث بدون ownerId أولاً ثم التحقق من الملكية
 * 3. حساب الحالة الحقيقية من قاعدة البيانات مباشرة
 * 4. عرض مختصر وواضح
 */

import { getDb } from "../db";
import { radiusCards, plans } from "../../drizzle/schema";
import { eq, or, and } from "drizzle-orm";

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const AI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "check_voucher",
      description:
        "يفحص حالة كرت إنترنت بناءً على اسم المستخدم (username) أو الرقم التسلسلي (serial number). " +
        "استخدم هذه الأداة فوراً عند أي ذكر لكلمات: كرت، بطاقة، اشتراك، username، رقم الكرت، حالة الاتصال، فحص.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "اسم المستخدم أو الرقم التسلسلي للكرت. مثال: '12345' أو 'user123' أو 'ABC-001'",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoucherCheckResult {
  found: false;
  message: string;
}

export interface VoucherFoundResult {
  found: true;
  username: string;
  serialNumber: string;
  status: string;
  displayStatus: string;
  hasIssue: boolean;
  planName: string | null;
  expiresAt: string | null;
  activatedAt: string | null;
  totalSessionTimeHours: number | null;
  usageBudgetHours: number | null;
  usagePercent: number | null;
  simultaneousUse: number;
  rateLimit: string | null;
}

export type ToolResult = VoucherCheckResult | VoucherFoundResult;

// ─── Helper: Format date ──────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  try {
    const date = typeof d === "string" ? new Date(d) : d;
    if (isNaN(date.getTime())) return null;
    return date.toLocaleString("ar-SA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d);
  }
}

// ─── check_voucher ────────────────────────────────────────────────────────────

async function checkVoucher(
  query: string,
  ownerId: number
): Promise<ToolResult> {
  try {
    const db = await getDb();
    if (!db) {
      return { found: false, message: "خطأ في الاتصال بقاعدة البيانات" };
    }

    const trimmed = query.trim();
    if (!trimmed) {
      return { found: false, message: "لم يتم إدخال رقم الكرت" };
    }

    // ── البحث بـ username أو serialNumber مع Tenant Isolation ──
    const rows = await db
      .select({
        id: radiusCards.id,
        username: radiusCards.username,
        serialNumber: radiusCards.serialNumber,
        status: radiusCards.status,
        expiresAt: radiusCards.expiresAt,
        activatedAt: radiusCards.activatedAt,
        firstUseAt: radiusCards.firstUseAt,
        windowEndTime: radiusCards.windowEndTime,
        totalSessionTime: radiusCards.totalSessionTime,
        usageBudgetSeconds: radiusCards.usageBudgetSeconds,
        windowSeconds: radiusCards.windowSeconds,
        simultaneousUse: radiusCards.simultaneousUse,
        createdBy: radiusCards.createdBy,
        planId: radiusCards.planId,
        planName: plans.name,
        rateLimit: plans.mikrotikRateLimit,
      })
      .from(radiusCards)
      .leftJoin(plans, eq(radiusCards.planId, plans.id))
      .where(
        and(
          or(
            eq(radiusCards.username, trimmed),
            eq(radiusCards.serialNumber, trimmed)
          ),
          eq(radiusCards.createdBy, ownerId)
        )
      )
      .limit(1);

    if (!rows || rows.length === 0) {
      return {
        found: false,
        message: `الكرت "${trimmed}" غير موجود في نظامك`,
      };
    }

    const card = rows[0];
    const now = new Date();

    // ── حساب الحالة الحقيقية ──
    const dbStatus = (card.status as string) || "unknown";
    const expiresAt = card.expiresAt ? new Date(card.expiresAt as unknown as string) : null;
    const windowEndTime = card.windowEndTime ? new Date(card.windowEndTime as unknown as string) : null;

    // تحقق من انتهاء الصلاحية الزمنية
    const isTimeExpired = expiresAt && !isNaN(expiresAt.getTime()) ? expiresAt < now : false;
    const isWindowExpired = windowEndTime && !isNaN(windowEndTime.getTime()) ? windowEndTime < now : false;

    let displayStatus: string;
    let hasIssue = false;

    switch (dbStatus) {
      case "active":
        if (isTimeExpired || isWindowExpired) {
          displayStatus = "منتهي الصلاحية";
          hasIssue = true;
        } else {
          displayStatus = "نشط ✓";
          hasIssue = false;
        }
        break;
      case "unused":
        if (isTimeExpired) {
          displayStatus = "منتهي الصلاحية";
          hasIssue = true;
        } else {
          displayStatus = "غير مستخدم";
          hasIssue = false;
        }
        break;
      case "used":
        displayStatus = "مستهلك";
        hasIssue = true;
        break;
      case "expired":
        displayStatus = "منتهي الصلاحية";
        hasIssue = true;
        break;
      case "suspended":
        displayStatus = "موقوف";
        hasIssue = true;
        break;
      case "cancelled":
        displayStatus = "ملغي";
        hasIssue = true;
        break;
      case "reserved":
        displayStatus = "محجوز";
        hasIssue = false;
        break;
      default:
        displayStatus = dbStatus;
        hasIssue = false;
    }

    // ── حساب الاستهلاك ──
    const rawSessionTime = Number(card.totalSessionTime) || 0;
    const rawBudget = Number(card.usageBudgetSeconds) || 0;

    const totalSessionTimeHours =
      rawSessionTime > 0
        ? Math.round((rawSessionTime / 3600) * 10) / 10
        : null;

    const usageBudgetHours =
      rawBudget > 0
        ? Math.round((rawBudget / 3600) * 10) / 10
        : null;

    const usagePercent =
      usageBudgetHours && usageBudgetHours > 0 && totalSessionTimeHours !== null
        ? Math.min(100, Math.round((totalSessionTimeHours / usageBudgetHours) * 100))
        : totalSessionTimeHours !== null && totalSessionTimeHours > 0
        ? null
        : 0;

    return {
      found: true,
      username: card.username,
      serialNumber: card.serialNumber,
      status: dbStatus,
      displayStatus,
      hasIssue,
      planName: card.planName ?? null,
      expiresAt: fmtDate(card.expiresAt as unknown as Date | null),
      activatedAt: fmtDate(card.activatedAt as unknown as Date | null),
      totalSessionTimeHours,
      usageBudgetHours,
      usagePercent,
      simultaneousUse: Number(card.simultaneousUse) || 1,
      rateLimit: card.rateLimit ?? null,
    };
  } catch (err) {
    console.error("[aiTools] checkVoucher error:", err);
    return { found: false, message: "حدث خطأ أثناء فحص الكرت" };
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ownerId: number
): Promise<string> {
  switch (toolName) {
    case "check_voucher": {
      // دعم كلا الاسمين: query (الجديد) و username (القديم للتوافق)
      const query =
        typeof args.query === "string"
          ? args.query
          : typeof args.username === "string"
          ? args.username
          : "";
      if (!query) {
        return JSON.stringify({ found: false, message: "لم يتم تحديد رقم الكرت" });
      }
      const result = await checkVoucher(query, ownerId);
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ error: `أداة غير معروفة: ${toolName}` });
  }
}
