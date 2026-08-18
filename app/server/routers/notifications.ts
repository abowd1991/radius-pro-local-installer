/**
 * Notifications Router
 * Manage Telegram / WhatsApp / SMS channel settings and preferences
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { notificationChannels, notificationPreferences, subscriberNotificationLinks, users } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { testChannelConnection } from "../services/notificationService";
import { TRPCError } from "@trpc/server";
import { isAdmin } from "../_core/roles";
import { UnsafeExternalUrlError, assertSafeExternalHttpsUrl } from "../security/externalUrlPolicy";

const channelSchema = z.enum(['telegram', 'whatsapp', 'sms']);

// ============================================================================
// Get channel settings for current owner
// ============================================================================
const getChannelSettings = protectedProcedure
  .input(z.object({ channel: channelSchema }))
  .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

    const ownerId = ctx.user.ownerId ?? ctx.user.id;

    const [settings] = await db
      .select()
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, ownerId),
        eq(notificationChannels.channel, input.channel)
      ));

    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.ownerId, ownerId),
        eq(notificationPreferences.channel, input.channel)
      ));

    return { settings: settings ?? null, preferences: prefs ?? null };
  });

// ============================================================================
// Save channel settings
// ============================================================================
const saveChannelSettings = protectedProcedure
  .input(z.object({
    channel: channelSchema,
    enabled: z.boolean(),
    // Telegram
    telegramBotToken: z.string().optional(),
    telegramChatId: z.string().optional(),
    // WhatsApp
    whatsappApiUrl: z.string().optional(),
    whatsappApiToken: z.string().optional(),
    whatsappInstanceId: z.string().optional(),
    whatsappPhone: z.string().optional(),
    // SMS
    smsApiKey: z.string().optional(),
    smsSender: z.string().optional(),
    // Custom API SMS
    smsProviderType: z.string().optional(),
    customSmsApiUrl: z.string().optional(),
    customSmsBalanceUrl: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

    if (input.channel === 'whatsapp' && input.whatsappApiUrl) {
      try {
        await assertSafeExternalHttpsUrl(input.whatsappApiUrl);
      } catch (error) {
        const message = error instanceof UnsafeExternalUrlError ? error.message : 'رابط WhatsApp غير صالح';
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }
    }

    const ownerId = ctx.user.ownerId ?? ctx.user.id;

    const [existing] = await db
      .select({ id: notificationChannels.id })
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, ownerId),
        eq(notificationChannels.channel, input.channel)
      ));

    const data = {
      ownerId,
      channel: input.channel,
      enabled: input.enabled,
      telegramBotToken: input.telegramBotToken ?? null,
      telegramChatId: input.telegramChatId ?? null,
      whatsappApiUrl: input.whatsappApiUrl ?? null,
      whatsappApiToken: input.whatsappApiToken ?? null,
      whatsappInstanceId: input.whatsappInstanceId ?? null,
      whatsappPhone: input.whatsappPhone ?? null,
      smsApiKey: input.smsApiKey ?? null,
      smsSender: input.smsSender ?? null,
      smsProviderType: input.smsProviderType ?? 'tweetsms',
      customSmsApiUrl: input.customSmsApiUrl ?? null,
      customSmsBalanceUrl: input.customSmsBalanceUrl ?? null,
    };

    // تفعيل SMS تلقائياً عند حفظ Custom API أو TweetSMS خاص
    // إذا كان القناة SMS وفيها credentials خارجية → تفعيل smsAdminEnabled تلقائياً
    if (input.channel === 'sms') {
      const hasCustomApi = input.smsProviderType === 'custom_api' && input.customSmsApiUrl;
      const hasTweetSms = input.smsProviderType !== 'custom_api' && input.smsApiKey && input.smsApiKey.includes(':');
      if (hasCustomApi || hasTweetSms) {
        (data as any).smsAdminEnabled = true;
      }
    }

    if (existing) {
      await db.update(notificationChannels).set(data).where(eq(notificationChannels.id, existing.id));
    } else {
      await db.insert(notificationChannels).values(data);
    }

    // Auto-create notification_preferences with all events enabled if not exists
    const [existingPrefs] = await db
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.ownerId, ownerId),
        eq(notificationPreferences.channel, input.channel)
      ));

    if (!existingPrefs) {
      await db.insert(notificationPreferences).values({
        ownerId,
        channel: input.channel,
        ownerRouterDown: false,
        ownerNewSubscription: true,
        ownerCardActivated: true,
        ownerSubscriptionExpiring: true,
        ownerNewPayment: true,
        ownerSupportTicket: true,
        ownerManualCardExpiring: true,
        subscriberNewSubscription: true,
        subscriberCardActivated: true,
        subscriberSubscriptionExpiring: true,
        subscriberNewPayment: true,
        subscriberSupportTicket: true,
        storeOrderSms: false,
      });
    }

    return { success: true };
  });

// ============================================================================
// Save notification preferences (toggles)
// ============================================================================
const savePreferences = protectedProcedure
  .input(z.object({
    channel: channelSchema,
    ownerRouterDown: z.boolean(),
    ownerNewSubscription: z.boolean(),
    ownerCardActivated: z.boolean(),
    ownerSubscriptionExpiring: z.boolean(),
    ownerNewPayment: z.boolean(),
    ownerSupportTicket: z.boolean(),
    ownerManualCardExpiring: z.boolean(),
    subscriberNewSubscription: z.boolean(),
    subscriberCardActivated: z.boolean(),
    subscriberSubscriptionExpiring: z.boolean(),
    subscriberNewPayment: z.boolean(),
    subscriberSupportTicket: z.boolean(),
    storeOrderSms: z.boolean().optional().default(false),
    storeOrderSmsTemplate: z.string().nullable().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

    const ownerId = ctx.user.ownerId ?? ctx.user.id;

    const [existing] = await db
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.ownerId, ownerId),
        eq(notificationPreferences.channel, input.channel)
      ));

    const data = { ownerId, ...input };

    if (existing) {
      await db.update(notificationPreferences).set(data).where(eq(notificationPreferences.id, existing.id));
    } else {
      await db.insert(notificationPreferences).values(data);
    }

    return { success: true };
  });

// ============================================================================
// Test channel connection
// ============================================================================
const testConnection = protectedProcedure
  .input(z.object({
    channel: channelSchema,
    telegramBotToken: z.string().optional(),
    telegramChatId: z.string().optional(),
    whatsappApiUrl: z.string().optional(),
    whatsappInstanceId: z.string().optional(),
    whatsappApiToken: z.string().optional(),
    whatsappPhone: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const result = await testChannelConnection(input.channel, input);
    return result;
  });

// ============================================================================
// Super Admin: toggle SMS admin lock for an owner
// ============================================================================
const adminToggleSms = protectedProcedure
  .input(z.object({ targetOwnerId: z.number(), enabled: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== 'super_admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Super Admin only' });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

    const [existing] = await db
      .select({ id: notificationChannels.id })
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, input.targetOwnerId),
        eq(notificationChannels.channel, 'sms')
      ));

    if (existing) {
      await db.update(notificationChannels)
        .set({ smsAdminEnabled: input.enabled })
        .where(eq(notificationChannels.id, existing.id));
    } else {
      await db.insert(notificationChannels).values({
        ownerId: input.targetOwnerId,
        channel: 'sms',
        enabled: false,
        smsAdminEnabled: input.enabled,
      });
    }

    return { success: true };
  });

// ============================================================================
// Get SMS admin status for current owner (to show lock state)
// ============================================================================
const getSmsAdminStatus = protectedProcedure
  .query(async ({ ctx }) => {
    // المدير/المالك هو مصدر إدارة SMS؛ لا يجوز أن يحجبه إعداد مخصص للحسابات التابعة.
    if (isAdmin(ctx.user.role)) return { adminEnabled: true, isSystemAdmin: true };
    const db = await getDb();
    if (!db) return { adminEnabled: false };

    const ownerId = ctx.user.ownerId ?? ctx.user.id;

    const [settings] = await db
      .select({ smsAdminEnabled: notificationChannels.smsAdminEnabled })
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, ownerId),
        eq(notificationChannels.channel, 'sms')
      ));

    return { adminEnabled: settings?.smsAdminEnabled ?? false, isSystemAdmin: false };
  });

// ============================================================================
// Get all owners SMS status (for super admin panel)
// ============================================================================
const getAllOwnersSmsStatus = protectedProcedure
  .query(async ({ ctx }) => {
    if (ctx.user.role !== 'super_admin') {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    const db = await getDb();
    if (!db) return [];

    // Get all owners (role=owner)
    const owners = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, 'client'));

    // Get SMS settings for all owners
    const smsSettings = await db
      .select({
        ownerId: notificationChannels.ownerId,
        smsAdminEnabled: notificationChannels.smsAdminEnabled,
        enabled: notificationChannels.enabled,
        smsMonthlyLimit: notificationChannels.smsMonthlyLimit,
        smsBalance: notificationChannels.smsBalance,
      })
      .from(notificationChannels)
      .where(eq(notificationChannels.channel, 'sms'));

    const smsMap = new Map<number, { ownerId: number; smsAdminEnabled: boolean | null; enabled: boolean; smsMonthlyLimit: number; smsBalance: number }>();
    for (const s of smsSettings) {
      smsMap.set(s.ownerId, s);
    }

    return owners.map((owner: typeof owners[0]) => ({
      ownerId: owner.id,
      name: owner.name,
      email: owner.email,
      createdAt: owner.createdAt,
      smsAdminEnabled: smsMap.get(owner.id)?.smsAdminEnabled ?? false,
      enabled: smsMap.get(owner.id)?.enabled ?? false,
      smsMonthlyLimit: smsMap.get(owner.id)?.smsMonthlyLimit ?? 0,
      smsBalance: smsMap.get(owner.id)?.smsBalance ?? 0,
    }));
  });

// ============================================================================
// Get custom messages for a channel
// ============================================================================
const getCustomMessages = protectedProcedure
  .input(z.object({ channel: channelSchema }))
  .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const ownerId = ctx.user.ownerId ?? ctx.user.id;
    const [row] = await db
      .select({ customMessages: notificationChannels.customMessages })
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, ownerId),
        eq(notificationChannels.channel, input.channel)
      ));
    if (!row?.customMessages) return { messages: null };
    try {
      return { messages: JSON.parse(row.customMessages) as Record<string, string> };
    } catch {
      return { messages: null };
    }
  });

// ============================================================================
// Save custom messages for a channel
// ============================================================================
const saveCustomMessages = protectedProcedure
  .input(z.object({
    channel: channelSchema,
    messages: z.record(z.string(), z.string()),
  }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const ownerId = ctx.user.ownerId ?? ctx.user.id;
    const [existing] = await db
      .select({ id: notificationChannels.id })
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, ownerId),
        eq(notificationChannels.channel, input.channel)
      ));
    const customMessages = JSON.stringify(input.messages);
    if (existing) {
      await db.update(notificationChannels)
        .set({ customMessages })
        .where(eq(notificationChannels.id, existing.id));
    } else {
      await db.insert(notificationChannels).values({
        ownerId,
        channel: input.channel,
        enabled: false,
        customMessages,
      });
    }
    return { success: true };
  });

// ============================================================================
// Get & Save reminder hours for manual card expiry
// ============================================================================
const getReminderHours = protectedProcedure
  .query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const ownerId = ctx.user.ownerId ?? ctx.user.id;
    // Get from telegram channel (shared setting)
    const [row] = await db
      .select({ reminderHoursManualCard: notificationChannels.reminderHoursManualCard })
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, ownerId),
        eq(notificationChannels.channel, 'telegram')
      ));
    return { hours: row?.reminderHoursManualCard ?? 24 };
  });

const saveReminderHours = protectedProcedure
  .input(z.object({ hours: z.number().int().min(1).max(168) }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const ownerId = ctx.user.ownerId ?? ctx.user.id;
    // Update all channels for this owner (telegram + sms)
    for (const channel of ['telegram', 'sms'] as const) {
      const [existing] = await db
        .select({ id: notificationChannels.id })
        .from(notificationChannels)
        .where(and(
          eq(notificationChannels.ownerId, ownerId),
          eq(notificationChannels.channel, channel)
        ));
      if (existing) {
        await db.update(notificationChannels)
          .set({ reminderHoursManualCard: input.hours })
          .where(eq(notificationChannels.id, existing.id));
      } else {
        await db.insert(notificationChannels).values({
          ownerId,
          channel,
          enabled: false,
          reminderHoursManualCard: input.hours,
        });
      }
    }
    return { success: true };
  });

// ============================================================================
// Get & Save custom SMS messages
// ============================================================================
const getSmsCustomMessages = protectedProcedure
  .query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const ownerId = ctx.user.ownerId ?? ctx.user.id;
    const [row] = await db
      .select({ customSmsMessages: notificationChannels.customSmsMessages })
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, ownerId),
        eq(notificationChannels.channel, 'sms')
      ));
    if (!row?.customSmsMessages) return { messages: null };
    try {
      return { messages: JSON.parse(row.customSmsMessages) as Record<string, string> };
    } catch {
      return { messages: null };
    }
  });

const saveSmsCustomMessages = protectedProcedure
  .input(z.object({ messages: z.record(z.string(), z.string()) }))
  .mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    const ownerId = ctx.user.ownerId ?? ctx.user.id;
    const [existing] = await db
      .select({ id: notificationChannels.id })
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, ownerId),
        eq(notificationChannels.channel, 'sms')
      ));
    const customSmsMessages = JSON.stringify(input.messages);
    if (existing) {
      await db.update(notificationChannels)
        .set({ customSmsMessages })
        .where(eq(notificationChannels.id, existing.id));
    } else {
      await db.insert(notificationChannels).values({
        ownerId,
        channel: 'sms',
        enabled: false,
        customSmsMessages,
      });
    }
    return { success: true };
  });

// ============================================================================
// Check SMS balance for current user's own credentials
// ============================================================================
const checkSmsBalance = protectedProcedure
  .query(async ({ ctx }) => {
    const ownerId = ctx.user.ownerId ?? ctx.user.id;
    const { getOwnerSmsCredentials, checkBalance, checkBalanceCustomApi } = await import('../services/tweetsmsService');

    // جلب credentials الخاصة بالعميل
    const ownerCreds = await getOwnerSmsCredentials(ownerId);

    if (!ownerCreds) {
      // لا يوجد credentials خاصة — فحص رصيد النظام
      const result = await checkBalance();
      return { ...result, source: 'system' as const };
    }

    // Custom API — فحص عبر Balance URL إذا متوفر
    if (ownerCreds.smsProviderType === 'custom_api') {
      if (ownerCreds.customSmsBalanceUrl) {
        const result = await checkBalanceCustomApi(ownerCreds.customSmsBalanceUrl);
        return { ...result, source: 'own' as const };
      }
      return { success: false, errorMessage: 'لم يتم تحديد رابط فحص الرصيد', source: 'own' as const };
    }

    // TweetSMS — فحص رصيد حساب العميل الخاص
    const result = await checkBalance(ownerCreds);
    return { ...result, source: 'own' as const };
  });

// ============================================================================
// Send a test SMS to verify credentials
// ============================================================================
const sendTestSms = protectedProcedure
  .input(z.object({ phone: z.string().min(7, 'رقم الهاتف غير صحيح') }))
  .mutation(async ({ ctx, input }) => {
    const ownerId = ctx.user.ownerId ?? ctx.user.id;
    const { getOwnerSmsCredentials, sendSms } = await import('../services/tweetsmsService');

    const ownerCreds = await getOwnerSmsCredentials(ownerId);
    const testMessage = '✅ Radius Pro: تم الاتصال بنجاح. إعدادات SMS تعمل بشكل صحيح.';

    const result = await sendSms(
      input.phone,
      testMessage,
      undefined,
      ownerCreds ? { ownerCredentials: ownerCreds } : {}
    );

    if (!result.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: result.errorMessage ?? 'فشل إرسال الرسالة التجريبية',
      });
    }

    return { success: true, source: ownerCreds ? 'own' : 'system' };
  });

// ============================================================================
// Export router
// ============================================================================
export const notificationsRouter = router({
  getChannelSettings,
  saveChannelSettings,
  savePreferences,
  testConnection,
  adminToggleSms,
  getSmsAdminStatus,
  getAllOwnersSmsStatus,
  getCustomMessages,
  saveCustomMessages,
  getReminderHours,
  saveReminderHours,
  getSmsCustomMessages,
  saveSmsCustomMessages,
  checkSmsBalance,
  sendTestSms,
});
