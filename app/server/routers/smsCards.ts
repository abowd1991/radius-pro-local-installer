/**
 * SMS Cards Router
 * إنشاء كروت وإرسالها عبر SMS مع دفتر جهات الاتصال
 * نظام الرصيد: smsBalance ثابت يُخصم عند كل إرسال، لا يتجدد تلقائياً
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { smsContacts, smsSendLog, smsBalanceLog, notificationChannels, cardBatches } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateCardsV2 } from "../db/generateCardsV2";
import * as tweetsmsService from "../services/tweetsmsService";
import { isAdmin } from "../_core/roles";
import { SMS_CARD_PREFIX_PATTERN, normalizeSmsCardPrefix } from "../../shared/smsCardPrefix";


// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * تقسيم الكروت على رسائل SMS (كل رسالة 70 حرف)
 * كل كرت: "user/pass" = ~10 أحرف + فاصل
 * مثال: "12345/678\n23456/789\n..." حتى 70 حرف
 */
function splitCardsIntoSmsMessages(cards: { username: string; password: string }[]): string[] {
  const MAX_SMS_LENGTH = 70;
  const messages: string[] = [];
  let current = "";

  for (const card of cards) {
    const entry = `${card.username}/${card.password}`;
    const separator = current ? "\n" : "";
    const candidate = current + separator + entry;

    if (candidate.length <= MAX_SMS_LENGTH) {
      current = candidate;
    } else {
      if (current) messages.push(current);
      current = entry;
    }
  }

  if (current) messages.push(current);
  return messages;
}

/**
 * جلب رصيد SMS الحالي للمستخدم مع حالة التفعيل
 */
async function getSmsChannel(ownerId: number) {
  const db = await getDb();
  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(and(eq(notificationChannels.ownerId, ownerId), eq(notificationChannels.channel, "sms")))
    .limit(1);
  return channel ?? null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const smsCardsRouter = router({
  // ── دفتر جهات الاتصال ──────────────────────────────────────────────────────

  /** جلب جميع جهات الاتصال */
  getContacts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    return db
      .select()
      .from(smsContacts)
      .where(eq(smsContacts.ownerId, ctx.user.id))
      .orderBy(desc(smsContacts.createdAt));
  }),

  /** إضافة جهة اتصال جديدة */
  addContact: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      phone: z.string().min(7).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db.insert(smsContacts).values({
        ownerId: ctx.user.id,
        name: input.name,
        phone: input.phone,
      });
      return { success: true };
    }),

  /** تعديل جهة اتصال */
  updateContact: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100),
      phone: z.string().min(7).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [existing] = await db.select().from(smsContacts)
        .where(and(eq(smsContacts.id, input.id), eq(smsContacts.ownerId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "جهة الاتصال غير موجودة" });
      await db.update(smsContacts)
        .set({ name: input.name, phone: input.phone })
        .where(eq(smsContacts.id, input.id));
      return { success: true };
    }),

  /** حذف جهة اتصال */
  deleteContact: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [existing] = await db.select().from(smsContacts)
        .where(and(eq(smsContacts.id, input.id), eq(smsContacts.ownerId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "جهة الاتصال غير موجودة" });
      await db.delete(smsContacts).where(eq(smsContacts.id, input.id));
      return { success: true };
    }),

  // ── إنشاء الكروت وإرسالها ──────────────────────────────────────────────────

  /**
   * إنشاء كروت جديدة وإرسالها عبر SMS
   * - يتحقق من رصيد SMS (smsBalance) قبل الإرسال
   * - يُخصم عدد الرسائل المُرسلة من الرصيد
   * - يمنع الإرسال إذا كان الرصيد غير كافٍ
   */
  createAndSendCards: protectedProcedure
    .input(z.object({
      planId: z.number(),
      quantity: z.number().min(1).max(500),
      contactId: z.number().optional(),   // من دفتر الجهات
      contactName: z.string().optional(), // اسم جديد (إذا لم يكن من الدفتر)
      contactPhone: z.string().min(7).max(30),
      saveContact: z.boolean().default(false), // حفظ الجهة في الدفتر
      // خيارات الكرت
      usernameLength: z.number().min(4).max(8).default(5),
      passwordLength: z.number().min(2).max(6).default(4),
      prefix: z.string().trim().regex(SMS_CARD_PREFIX_PATTERN, "يجب إدخال بادئة رقمية من 1 إلى 3 خانات").max(3),
      // الوقت والصلاحية
      usageBudgetSeconds: z.number().min(0).default(0),
      windowSeconds: z.number().min(0).default(0),
      timeFromActivation: z.boolean().default(true),
      authType: z.enum(['password', 'username-only']).default('password'),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const isSystemAdmin = isAdmin(ctx.user.role);

      // 1. التحقق من تفعيل SMS للمستخدم
      let channel = await getSmsChannel(ctx.user.id);
      if (!channel && isSystemAdmin) {
        await db.insert(notificationChannels).values({
          ownerId: ctx.user.id,
          channel: 'sms',
          enabled: true,
          smsAdminEnabled: true,
          smsMonthlyLimit: 0,
          smsBalance: 0,
        });
        channel = await getSmsChannel(ctx.user.id);
      }

      // تحديد نوع المزود: خارجي (Custom API / TweetSMS خاص) أم داخلي (Radius Pro)
      const providerType = channel?.smsProviderType || 'tweetsms';
      const hasCustomApi = providerType === 'custom_api' && channel?.customSmsApiUrl;
      const hasOwnTweetSms = providerType !== 'custom_api' && channel?.smsApiKey;
      const isExternalProvider = !!(hasCustomApi || hasOwnTweetSms);

      if (!channel) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "لم يتم إعداد قناة SMS لحسابك. يرجى الإعداد من صفحة الإشعارات.",
        });
      }

      // للحسابات الخارجية (Custom API / TweetSMS خاص): لا نفحص smsAdminEnabled ولا الرصيد الداخلي
      if (!isExternalProvider && !isSystemAdmin) {
        // نظام الرصيد الداخلي (Radius Pro) — يفحص التفعيل والرصيد
        if (!channel.smsAdminEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "خدمة SMS غير مفعّلة لحسابك. تواصل مع المدير لتفعيلها.",
          });
        }

        // 2. حساب عدد الرسائل المطلوبة (حساب دقيق)
        const fakeCards = Array.from({ length: input.quantity }, () => ({
          username: (input.prefix ?? "") + "x".repeat(input.usernameLength),
          password: "x".repeat(input.passwordLength),
        }));
        const estimatedSmsCount = splitCardsIntoSmsMessages(fakeCards).length;

        // 3. التحقق من رصيد SMS (smsBalance)
        const currentBalance = channel.smsBalance ?? 0;
        if (currentBalance <= 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "رصيد الرسائل منتهٍ. يرجى شحن الرصيد للمتابعة.",
          });
        }
        if (currentBalance < estimatedSmsCount) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `رصيد الرسائل غير كافٍ. الرصيد الحالي: ${currentBalance} رسالة، المطلوب: ${estimatedSmsCount} رسالة. يرجى شحن الرصيد.`,
          });
        }
      }

      // 4. تحديد اسم جهة الاتصال
      let resolvedName = input.contactName || input.contactPhone;
      if (input.contactId) {
        const [contact] = await db.select().from(smsContacts)
          .where(and(eq(smsContacts.id, input.contactId), eq(smsContacts.ownerId, ctx.user.id)))
          .limit(1);
        if (contact) resolvedName = contact.name;
      }

      // 5. حفظ جهة الاتصال إذا طُلب ذلك
      if (input.saveContact && !input.contactId && input.contactName) {
        await db.insert(smsContacts).values({
          ownerId: ctx.user.id,
          name: input.contactName,
          phone: input.contactPhone,
        }).catch(() => {}); // تجاهل خطأ التكرار
      }

      // 6. إنشاء الكروت (نفس آلية generateCardsV2)
      const batchName = `SMS - ${resolvedName}`;
      const result = await generateCardsV2({
        planId: input.planId,
        quantity: input.quantity,
        createdBy: ctx.user.id,
        batchName,
        usernameLength: input.usernameLength,
        passwordLength: input.passwordLength,
        prefix: normalizeSmsCardPrefix(input.prefix),
        usageBudgetSeconds: input.usageBudgetSeconds || undefined,
        windowSeconds: input.windowSeconds || undefined,
        timeFromActivation: input.timeFromActivation,
        authType: input.authType,
      });

      if (!result.success || !result.cards || result.cards.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل إنشاء الكروت",
        });
      }

      // 7. تقسيم الكروت على رسائل SMS
      const smsMessages = splitCardsIntoSmsMessages(result.cards);
      const actualSmsCount = smsMessages.length;

      // 8. إرسال الرسائل (باستخدام credentials العميل إذا كان خارجياً)
      let sentCount = 0;
      let lastError = "";
      for (const message of smsMessages) {
        const sendResult = isExternalProvider
          ? await tweetsmsService.sendSmsTenant(ctx.user.id, input.contactPhone, message, { type: "bulk", sentBy: ctx.user.id })
          : await tweetsmsService.sendSms(input.contactPhone, message, undefined, { type: "bulk", sentBy: ctx.user.id, skipLogging: false });
        if (sendResult.success) {
          sentCount++;
        } else {
          lastError = sendResult.errorMessage || "خطأ في الإرسال";
        }
      }

      // 9. خصم الرصيد فقط للنظام الداخلي (Radius Pro) — الخارجي لا يخصم من رصيده
      if (!isExternalProvider) {
        const currentBalance = channel.smsBalance ?? 0;
        const toDeduct = sentCount > 0 ? sentCount : actualSmsCount;
        const newBalance = Math.max(0, currentBalance - toDeduct);
        await db.update(notificationChannels)
          .set({ smsBalance: newBalance })
          .where(eq(notificationChannels.id, channel.id));
      }

      // 10. تسجيل في سجل الإرسال
      await db.insert(smsSendLog).values({
        ownerId: ctx.user.id,
        contactId: input.contactId ?? null,
        contactName: resolvedName,
        contactPhone: input.contactPhone,
        batchId: result.batchId!,
        cardCount: result.cards.length,
        smsCount: actualSmsCount,
        status: sentCount === actualSmsCount ? "sent" : sentCount > 0 ? "partial" : "failed",
        errorMessage: lastError || null,
      });

      // احسب الرصيد المتبقي للعرض (للداخلي فقط)
      const displayBalance = isExternalProvider
        ? null
        : Math.max(0, (channel.smsBalance ?? 0) - (sentCount > 0 ? sentCount : actualSmsCount));

      return {
        success: sentCount > 0,
        batchId: result.batchId,
        cardCount: result.cards.length,
        smsCount: actualSmsCount,
        sentCount,
        failed: actualSmsCount - sentCount,
        remainingBalance: displayBalance,
      };
    }),

  // ── سجل الإرسال ────────────────────────────────────────────────────────────

  /** جلب سجل الإرسال */
  getSendLog: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const logs = await db
        .select()
        .from(smsSendLog)
        .where(eq(smsSendLog.ownerId, ctx.user.id))
        .orderBy(desc(smsSendLog.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db.execute(
        sql`SELECT COUNT(*) as total FROM sms_send_log WHERE ownerId = ${ctx.user.id}`
      ) as any;
      const total = Number(countResult?.[0]?.total ?? 0);

      return { logs, total };
    }),

  // ── إحصائيات SMS ───────────────────────────────────────────────────────────

  /** جلب إحصائيات SMS للمستخدم الحالي (الرصيد الحالي) */
  getSmsStats: protectedProcedure.query(async ({ ctx }) => {
    const channel = await getSmsChannel(ctx.user.id);
    const isSystemAdmin = isAdmin(ctx.user.role);

    return {
      balance: channel?.smsBalance ?? 0,
      adminEnabled: isSystemAdmin || channel?.smsAdminEnabled === true,
      isSystemAdmin,
    };
  }),

  // ── Super Admin: إدارة رصيد SMS ────────────────────────────────────────────

  /**
   * شحن رصيد SMS لعميل معين (Super Admin فقط)
   * يُضيف المبلغ المحدد إلى الرصيد الحالي
   */
  topUpBalance: protectedProcedure
    .input(z.object({
      ownerId: z.number(),
      amount: z.number().min(1).max(100000),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
      }
      const db = await getDb();
      const existing = await getSmsChannel(input.ownerId);
      const balanceBefore = existing?.smsBalance ?? 0;
      let newBalance: number;
      if (existing) {
        newBalance = balanceBefore + input.amount;
        await db.update(notificationChannels)
          .set({ smsBalance: newBalance })
          .where(eq(notificationChannels.id, existing.id));
      } else {
        newBalance = input.amount;
        await db.insert(notificationChannels).values({
          ownerId: input.ownerId,
          channel: "sms",
          enabled: false,
          smsAdminEnabled: false,
          smsMonthlyLimit: 0,
          smsBalance: newBalance,
        });
      }
      // تسجيل عملية الشحن
      await db.insert(smsBalanceLog).values({
        ownerId: input.ownerId,
        adminId: ctx.user.id,
        adminName: ctx.user.name || ctx.user.email || "مدير",
        action: "topup",
        amount: input.amount,
        balanceBefore,
        balanceAfter: newBalance,
        note: input.note || null,
      });
      return { success: true, newBalance };
    }),

  /**
   * تعيين رصيد SMS لعميل معين (Super Admin فقط)
   * يُعيّن الرصيد مباشرةً (بدل الإضافة)
   */
  setBalance: protectedProcedure
    .input(z.object({
      ownerId: z.number(),
      balance: z.number().min(0).max(100000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
      }
      const db = await getDb();
      const existing = await getSmsChannel(input.ownerId);

      if (existing) {
        await db.update(notificationChannels)
          .set({ smsBalance: input.balance })
          .where(eq(notificationChannels.id, existing.id));
      } else {
        await db.insert(notificationChannels).values({
          ownerId: input.ownerId,
          channel: "sms",
          enabled: false,
          smsAdminEnabled: false,
          smsMonthlyLimit: 0,
          smsBalance: input.balance,
        });
      }
      return { success: true, newBalance: input.balance };
    }),

  /**
   * جلب رصيد SMS لعميل معين (Super Admin فقط)
   */
  getClientBalance: protectedProcedure
    .input(z.object({ ownerId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
      }
      const channel = await getSmsChannel(input.ownerId);
      return {
        balance: channel?.smsBalance ?? 0,
        adminEnabled: channel?.smsAdminEnabled ?? false,
      };
    }),

  /**
   * جلب قائمة كل العملاء مع رصيد SMS (Super Admin فقط)
   */
  getAllClientsBalance: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    }
    const db = await getDb();
    const channels = await db
      .select({
        ownerId: notificationChannels.ownerId,
        smsBalance: notificationChannels.smsBalance,
        smsAdminEnabled: notificationChannels.smsAdminEnabled,
      })
      .from(notificationChannels)
      .where(eq(notificationChannels.channel, "sms"));
    return channels;
  }),

  /**
   * جلب سجل شحن الرصيد (Super Admin فقط)
   */
  getBalanceLog: protectedProcedure
    .input(z.object({
      ownerId: z.number().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
      }
      const db = await getDb();
      const conditions = input.ownerId
        ? [eq(smsBalanceLog.ownerId, input.ownerId)]
        : [];
      const logs = await db
        .select()
        .from(smsBalanceLog)
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(desc(smsBalanceLog.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      const [countRow] = await db.execute(
        input.ownerId
          ? sql`SELECT COUNT(*) as total FROM sms_balance_log WHERE ownerId = ${input.ownerId}`
          : sql`SELECT COUNT(*) as total FROM sms_balance_log`
      ) as any;
      const total = Number(countRow?.[0]?.total ?? 0);
      return { logs, total };
    }),

  // ── Backward compat: setMonthlyLimit (deprecated) ──────────────────────────────────────────────
  /** @deprecated استخدم setBalance بدلاً من هذا */
  setMonthlyLimit: protectedProcedure
    .input(z.object({
      ownerId: z.number(),
      limit: z.number().min(0),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
      }
      const db = await getDb();
      const existing = await getSmsChannel(input.ownerId);

      if (existing) {
        await db.update(notificationChannels)
          .set({ smsMonthlyLimit: input.limit, smsBalance: input.limit })
          .where(eq(notificationChannels.id, existing.id));
      } else {
        await db.insert(notificationChannels).values({
          ownerId: input.ownerId,
          channel: "sms",
          enabled: false,
          smsAdminEnabled: false,
          smsMonthlyLimit: input.limit,
          smsBalance: input.limit,
        });
      }
      return { success: true };
    }),
});
