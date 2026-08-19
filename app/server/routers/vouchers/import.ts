import { protectedProcedure, publicProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../../db";
import * as walletDb from "../../db/wallet";
import * as planDb from "../../db/plans";
import * as nasDb from "../../db/nas";
import * as cardDb from "../../db/vouchers";
import * as invoiceDb from "../../db/invoices";
import * as subscriptionDb from "../../db/subscriptions";
import * as notificationDb from "../../db/notifications";
import * as templateDb from "../../db/cardTemplates";
import * as radiusSubscribers from "../../db/radiusSubscribers";
import * as vpnApi from "../../services/vpnApiService";
import * as accountingService from "../../services/accountingService";
import * as sessionMonitor from "../../services/sessionMonitor";
import * as coaService from "../../services/coaService";
import * as multiChannelNotification from "../../services/multiChannelNotificationService";
import * as tweetsmsService from "../../services/tweetsmsService";
import * as smsDb from "../../db/sms";
import * as mikrotikApi from "../../services/mikrotikApi";
import * as authService from "../../services/authService";
import { storagePut } from "../../storage";
import { generateCardsPDFHTML, generateCardsCSV, saveBatchPDF, saveBatchPDFWithTemplate, generateCardsPDFHTMLWithTemplate } from "../../services/pdfGenerator";
import { logAudit } from "../../services/auditLogService";
import { notifyOwnerEvent, notifySubscriberEvent } from "../../services/notificationService";
import { getDb } from "../../db";
import { radcheck, radreply, nasDevices, radiusCards, radacct, users, wallets, walletLedger, cardBatches, checkTokens, plans, notificationChannels, siteSettings, systemUpdates } from "../../../drizzle/schema";
import { eq, and, isNull, sql, desc, or, count, gte, like, inArray } from "drizzle-orm";
import { getTenantContext, getEffectiveOwnerId, canSeeAllData } from "../../tenant-isolation";
import * as permissionsService from "../../services/permissionsService";
import { ENV } from "../../_core/env";
import * as vpnIpPool from "../../db/vpnIpPool";
import * as freeradiusService from "../../services/freeradiusService";
import * as twoPhaseProvisioning from "../../services/twoPhaseProvisioningService";
import { autoFixMissingHuntgroups } from '../../v2/V2ServiceBridge';
import { generateCardsV2 } from "../../db/generateCardsV2";
import { importCardsFromCsv, parseCsvCards } from "../../db/importCardsFromCsv";
import { parseFileToRows, mapRowsToCards } from "../../db/parseFileCards";
import { isAdmin } from "../../_core/roles";


export const importFromCsv = superAdminProcedure
    .input(z.object({
      csvText: z.string().min(1, 'CSV content is required'),
      planId: z.number(),
      assignedToUserId: z.number().optional(),
      batchName: z.string().optional(),
      subscriberGroup: z.string().default('Default group'),
      usageBudgetSeconds: z.number().min(0).default(0),
      windowSeconds: z.number().min(0).default(0),
      timeFromActivation: z.boolean().default(true),
      cardTimeValue: z.number().min(0).default(0),
      cardTimeUnit: z.enum(['hours', 'days']).default('hours'),
      authType: z.enum(['password', 'username-only']).default('password'),
    }))
    .mutation(async ({ ctx, input }) => {
      const cards = parseCsvCards(input.csvText);
      if (cards.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No valid cards found in CSV file. Check the file format.' });
      }
      if (cards.length > 10000) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Maximum 10,000 cards per import.' });
      }
      return importCardsFromCsv({
        cards,
        planId: input.planId,
        createdBy: getEffectiveOwnerId(getTenantContext(ctx.user)),
        assignedToUserId: input.assignedToUserId,
        batchName: input.batchName,
        subscriberGroup: input.subscriberGroup,
        usageBudgetSeconds: input.usageBudgetSeconds,
        windowSeconds: input.windowSeconds,
        timeFromActivation: input.timeFromActivation,
        cardTimeValue: input.cardTimeValue,
        cardTimeUnit: input.cardTimeUnit,
        authType: input.authType,
      });
    });

  // ── Parse file for column preview (admin + client) ──
export const parseImportFile = protectedProcedure
    .input(z.object({
      fileBase64: z.string().min(1, 'File content is required'),
      mimeType: z.string().min(1, 'MIME type is required'),
      fileName: z.string().min(1, 'File name is required'),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const result = await parseFileToRows(buffer, input.mimeType, input.fileName);
      // Return only first 10 rows for preview (don't expose full data)
      return {
        rows: result.rows.slice(0, 10),
        columnCount: result.columnCount,
        totalRows: result.totalRows,
        fileType: result.fileType,
        suggestedMapping: result.suggestedMapping,
      };
    });

  // ── Import cards from any file (admin + reseller + client) ──
export const importFromFile = protectedProcedure
    .input(z.object({
      fileBase64: z.string().min(1, 'File content is required'),
      mimeType: z.string().min(1, 'MIME type is required'),
      fileName: z.string().min(1, 'File name is required'),
      usernameCol: z.number().min(0),
      passwordCol: z.number().min(0),
      skipHeader: z.boolean().default(true),
      planId: z.number(),
      assignedToUserId: z.number().optional(),
      batchName: z.string().optional(),
      subscriberGroup: z.string().default('Default group'),
      usageBudgetSeconds: z.number().min(0).default(0),
      windowSeconds: z.number().min(0).default(0),
      timeFromActivation: z.boolean().default(true),
      cardTimeValue: z.number().min(0).default(0),
      cardTimeUnit: z.enum(['hours', 'days']).default('hours'),
      authType: z.enum(['password', 'username-only']).default('password'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;

      // ── Tenant isolation: clients can only import to themselves ──
      let assignedToUserId = input.assignedToUserId;
      if (user.role === 'client') {
        // Clients always import to their own account
        assignedToUserId = user.id;
      } else if (user.role === 'reseller') {
        // Resellers can assign to their own clients only
        if (assignedToUserId) {
          const dbConn = await getDb();
          if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
          const [targetUser] = await dbConn.select({ id: users.id, ownerId: users.ownerId })
            .from(users).where(eq(users.id, assignedToUserId)).limit(1);
          if (!targetUser || targetUser.ownerId !== user.id) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot assign to this user' });
          }
        } else {
          assignedToUserId = user.id;
        }
      }
      // Admins can assign to anyone

      // ── Parse file ──
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const parsed = await parseFileToRows(buffer, input.mimeType, input.fileName);

      // ── Map columns to username/password ──
      const mappedCards = mapRowsToCards(
        parsed.rows,
        input.usernameCol,
        input.passwordCol,
        input.skipHeader
      );

      if (mappedCards.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'لم يتم العثور على كروت صالحة في الملف. تحقق من اختيار الأعمدة الصحيحة.' });
      }

      const MAX_CARDS = user.role === 'client' ? 5000 : 10000;
      if (mappedCards.length > MAX_CARDS) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `الحد الأقصى ${MAX_CARDS} كرت لكل استيراد.` });
      }

      // ── Daily import limit for clients ──
      if (user.role === 'client') {
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
        // Get configured daily limit from site settings
        const [settings] = await dbConn.select({ clientDailyImportLimit: siteSettings.clientDailyImportLimit })
          .from(siteSettings).limit(1);
        const dailyLimit = settings?.clientDailyImportLimit ?? 1000;
        if (dailyLimit > 0) {
          // Count cards imported today by this user
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const [countRow] = await dbConn.select({ count: sql<number>`COUNT(*)` })
            .from(radiusCards)
            .where(and(
              eq(radiusCards.createdBy, user.id),
              gte(radiusCards.createdAt, todayStart)
            ));
          const todayCount = Number(countRow?.count ?? 0);
          if (todayCount + mappedCards.length > dailyLimit) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: `تجاوزت الحد اليومي للاستيراد (${dailyLimit} كرت/يوم). استوردت اليوم ${todayCount} كرت، ولا يمكنك إضافة ${mappedCards.length} كرت إضافية.`
            });
          }
        }
      }

      // ── Convert to CsvCard format ──
      const cards = mappedCards.map((c, i) => ({
        id: String(i + 1),
        username: c.username,
        password: c.password,
      }));

      return importCardsFromCsv({
        cards,
        planId: input.planId,
        createdBy: user.id,
        assignedToUserId,
        batchName: input.batchName,
        subscriberGroup: input.subscriberGroup,
        usageBudgetSeconds: input.usageBudgetSeconds,
        windowSeconds: input.windowSeconds,
        timeFromActivation: input.timeFromActivation,
        cardTimeValue: input.cardTimeValue,
        cardTimeUnit: input.cardTimeUnit,
        authType: input.authType,
      });
    });

  // Get namespace capacity for a given prefix+length combination
export const sendManualCardSms = protectedProcedure
    .input(z.object({
      cardId: z.number(),
      customMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // 1. Get the card
      const [card] = await dbConn.select({
        id: radiusCards.id,
        username: radiusCards.username,
        password: radiusCards.password,
        phone: radiusCards.phone,
        fullName: radiusCards.fullName,
        isManual: radiusCards.isManual,
        createdBy: radiusCards.createdBy,
      }).from(radiusCards).where(eq(radiusCards.id, input.cardId)).limit(1);

      if (!card) throw new TRPCError({ code: 'NOT_FOUND', message: 'الكرت غير موجود' });
      if (!card.isManual) throw new TRPCError({ code: 'BAD_REQUEST', message: 'هذا الإجراء مخصص للكروت اليدوية فقط' });

      // 2. Access control: owner or admin
      const ownerId = isAdmin(ctx.user.role) ? (card.createdBy as number) : ctx.user.id;
      if (!isAdmin(ctx.user.role) && card.createdBy !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'ليس لديك صلاحية' });
      }

      // 3. Check phone number
      if (!card.phone) throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد رقم هاتف مسجل لهذا الكرت' });

      // 4. Check SMS enabled for the owner (client)
      const [channel] = await dbConn.select()
        .from(notificationChannels)
        .where(and(eq(notificationChannels.ownerId, ownerId), eq(notificationChannels.channel, 'sms')))
        .limit(1);

      // تحديد نوع المزود: خارجي (Custom API / TweetSMS خاص) أم داخلي (Radius Pro)
      const providerType = channel?.smsProviderType || 'tweetsms';
      const hasCustomApi = providerType === 'custom_api' && channel?.customSmsApiUrl;
      const hasOwnTweetSms = providerType !== 'custom_api' && channel?.smsApiKey;
      const isExternalProvider = !!(hasCustomApi || hasOwnTweetSms);

      if (!channel) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'لم يتم إعداد قناة SMS لهذا الحساب.' });
      }

      // للحسابات الداخلية فقط: فحص التفعيل والرصيد
      if (!isExternalProvider) {
        if (!channel.smsAdminEnabled) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'خدمة SMS غير مفعّلة. تواصل مع المدير لتفعيلها.' });
        }
        // 5. Check SMS balance (smsBalance - fixed, not monthly)
        const currentBalance = channel.smsBalance ?? 0;
        if (currentBalance <= 0) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'رصيد الرسائل منتهٍ. يرجى شحن الرصيد للمتابعة.' });
        }
      }

      // 6. Build message
      const name = card.fullName ? `${card.fullName}\n` : '';
      const defaultMessage = `${name}اسم المستخدم: ${card.username}\nكلمة المرور: ${card.password || '(بدون كلمة مرور)'}`;
      const message = input.customMessage
        ? input.customMessage
            .replace(/\{name\}/g, card.fullName || '')
            .replace(/\{username\}/g, card.username)
            .replace(/\{password\}/g, card.password || '')
        : defaultMessage;

      // 7. Send SMS (باستخدام credentials العميل إذا كان خارجياً)
      const result = isExternalProvider
        ? await tweetsmsService.sendSmsTenant(ownerId, card.phone, message, { type: 'manual', sentBy: ctx.user.id })
        : await tweetsmsService.sendSms(card.phone, message, undefined, { type: 'manual', sentBy: ctx.user.id, userId: ownerId });

      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.errorMessage || 'فشل إرسال الرسالة' });
      }

      // 8. خصم الرصيد فقط للنظام الداخلي (Radius Pro)
      if (!isExternalProvider) {
        const currentBalance = channel.smsBalance ?? 0;
        const newBalance = Math.max(0, currentBalance - 1);
        await dbConn.update(notificationChannels)
          .set({ smsBalance: newBalance })
          .where(eq(notificationChannels.id, channel.id));
        return { success: true, remainingBalance: newBalance };
      }

      return { success: true, remainingBalance: channel.smsBalance ?? 0 };
    });
