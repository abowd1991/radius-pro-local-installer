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
import { coaEngine } from '../../domains/radius/CoAEngine';
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
import { broadbandIdentityRepository } from '../../domains/broadband/repositories/BroadbandIdentityRepository';

// Local helper (mirrors the one in routers.ts)


export const create = resellerProcedure
    .input(z.object({
      username: z.string().min(1).max(64).transform(v => v.trim()).refine(v => v.length >= 2, 'اسم المستخدم يجب أن يكون حرفين على الأقل').refine(v => !/\s/.test(v), 'اسم المستخدم لا يجب أن يحتوي على مسافات'),
      password: z.string().min(1).max(64).transform(v => v.trim()).refine(v => v.length >= 2, 'كلمة المرور يجب أن تكون حرفين على الأقل'),
      fullName: z.string().min(2).max(255),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      nationalId: z.string().optional(),
      notes: z.string().optional(),
      planId: z.number(),
      nasId: z.number().optional(),
      ipAssignmentType: z.enum(['dynamic', 'static']).optional(),
      staticIp: z.string().optional(),
      simultaneousUse: z.number().min(1).max(10).optional(),
      macAddress: z.string().optional(),
      macBindingEnabled: z.boolean().optional(),
      subscriptionMonths: z.number().min(1).max(24).optional(),
      subscriptionEndDate: z.string().optional(), // ISO string for exact end date
      amount: z.number().min(0).optional(),
      paymentMethod: z.enum(['cash', 'wallet', 'card', 'bank_transfer', 'online']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check if username exists
      const exists = await broadbandIdentityRepository.isUsernameReserved(input.username);
      if (exists) {
        throw new TRPCError({ code: 'CONFLICT', message: 'اسم المستخدم موجود مسبقاً' });
      }

      // Create subscriber
      const subscriberId = await db.createSubscriber({
        ...input,
        ownerId: ctx.user.id,
        createdBy: ctx.user.id,
        subscriptionEndDate: input.subscriptionEndDate ? new Date(input.subscriptionEndDate) : undefined,
      });

      // Get subscriber to get subscription end date
      const subscriber = await db.getSubscriberById(subscriberId);
      if (subscriber && subscriber.subscriber.subscriptionEndDate) {
        // Create RADIUS entries for PPPoE authentication
        await radiusSubscribers.createSubscriberRadiusEntries(
          input.username,
          input.password,
          input.planId,
          new Date(subscriber.subscriber.subscriptionEndDate),
          {
            simultaneousUse: input.simultaneousUse,
            staticIp: input.staticIp,
            createdBy: ctx.user.id,  // NAS isolation: owner_<id> group
          }
        );
      }

      return { id: subscriberId, success: true };
    });

  // Update subscriber


export const update = resellerProcedure
    .input(z.object({
      id: z.number(),
      username: z.string().min(1).max(64).transform(v => v.trim()).refine(v => v.length >= 2, 'اسم المستخدم يجب أن يكون حرفين على الأقل').refine(v => !/\s/.test(v), 'اسم المستخدم لا يجب أن يحتوي على مسافات').optional(),
      fullName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      nationalId: z.string().optional(),
      notes: z.string().optional(),
      planId: z.number().optional(),
      nasId: z.number().optional(),
      ipAssignmentType: z.enum(['dynamic', 'static']).optional(),
      staticIp: z.string().optional(),
      simultaneousUse: z.number().optional(),
      macAddress: z.string().optional(),
      macBindingEnabled: z.boolean().optional(),
      password: z.string().min(1).max(64).transform(v => v.trim()).refine(v => v.length >= 2, 'كلمة المرور يجب أن تكون حرفين على الأقل').optional(),
      subscriptionEndDate: z.string().optional(), // ISO date string
    }))
    .mutation(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      }
      // Check ownership
      if (subscriber.subscriber.ownerId !== ctx.user.id && subscriber.subscriber.createdBy !== ctx.user.id && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }

      const oldUsername = subscriber.subscriber.username;
      const { id, password, subscriptionEndDate, ...data } = input;
      if (input.username && input.username !== oldUsername
        && await broadbandIdentityRepository.isUsernameReserved(input.username, input.id)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'اسم المستخدم مستخدم بالفعل في Broadband أو Voucher أو بيانات RADIUS' });
      }
      await db.updateSubscriber(id, {
        ...data,
        ...(subscriptionEndDate ? { subscriptionEndDate: new Date(subscriptionEndDate) } : {}),
      });

      // If username changed, update all RADIUS tables
      if (input.username && input.username !== oldUsername) {
        // 1. Disconnect active sessions first (old username)
        try {
          await coaEngine.disconnectAllSessions(oldUsername);
        } catch (e) {
          console.error(`[Subscribers] CoA disconnect failed for old username ${oldUsername}:`, e);
        }
        // 2. Update RADIUS tables to new username
        const drizzleDbU = await getDb();
        if (drizzleDbU) {
          await drizzleDbU.execute(sql`UPDATE radcheck SET username = ${input.username} WHERE username = ${oldUsername}`);
          await drizzleDbU.execute(sql`UPDATE radreply SET username = ${input.username} WHERE username = ${oldUsername}`);
          await drizzleDbU.execute(sql`UPDATE radusergroup SET username = ${input.username} WHERE username = ${oldUsername}`);
          // radacct and online_sessions preserve the identity captured at session
          // start. The prior CoA request lets SessionEngine close that V2 session.
          // Broadband must not alter unrelated Voucher rows sharing a username.
        }
      }

      // Update password in radcheck if provided
      const effectiveUsername = input.username || oldUsername;
      if (password) {
        const drizzleDb = await getDb();
        if (drizzleDb) await drizzleDb.execute(
          sql`UPDATE radcheck SET value = ${password} WHERE username = ${effectiveUsername} AND attribute = 'Cleartext-Password'`
        );
        // Disconnect active sessions so new password takes effect immediately
        try {
          await coaEngine.disconnectAllSessions(effectiveUsername);
        } catch (e) {
          console.error(`[Subscribers] CoA disconnect failed after password change for ${effectiveUsername}:`, e);
        }
      }

      // Update Expiration in radcheck if subscriptionEndDate provided
      // MUST use FreeRADIUS format: "Mon DD YYYY HH:MM:SS" (e.g. "Jan 15 2026 23:59:59")
      if (subscriptionEndDate) {
        const expDate = new Date(subscriptionEndDate);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const expStr = `${months[expDate.getMonth()]} ${String(expDate.getDate()).padStart(2,'0')} ${expDate.getFullYear()} 23:59:59`;
        const drizzleDb2 = await getDb();
        if (drizzleDb2) await drizzleDb2.execute(
          sql`INSERT INTO radcheck (username, attribute, op, value) VALUES (${effectiveUsername}, 'Expiration', ':=', ${expStr})
              ON DUPLICATE KEY UPDATE value = ${expStr}`
        );
      }
      // Update Simultaneous-Use in radcheck if provided
      if (input.simultaneousUse !== undefined && input.simultaneousUse >= 1) {
        const drizzleDb3 = await getDb();
        if (drizzleDb3) await drizzleDb3.execute(
          sql`INSERT INTO radcheck (username, attribute, op, value)
              VALUES (${effectiveUsername}, 'Simultaneous-Use', ':=', ${String(input.simultaneousUse)})
              ON DUPLICATE KEY UPDATE value = ${String(input.simultaneousUse)}`
        );
      }

      // ── تحديث السرعة عند تغيير الباقة ──
      if (input.planId && input.planId !== subscriber.subscriber.planId) {
        try {
          const drizzleDb4 = await getDb();
          if (drizzleDb4) {
            const [newPlan] = await drizzleDb4.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
            if (newPlan) {
              // حساب السرعة من mikrotikRateLimit أو downloadSpeed/uploadSpeed
              let uploadMbps: number;
              let downloadMbps: number;
              if (newPlan.mikrotikRateLimit) {
                // تنسيق: "upload/download" مثل "5M/10M" أو "5000k/10000k"
                const parts = newPlan.mikrotikRateLimit.split('/');
                const parseSpeed = (s: string) => {
                  const v = parseFloat(s);
                  if (s.toLowerCase().endsWith('m')) return v;
                  if (s.toLowerCase().endsWith('k')) return v / 1000;
                  return v / 1000; // افتراض kbps
                };
                uploadMbps = parseSpeed(parts[0] || '0');
                downloadMbps = parseSpeed(parts[1] || parts[0] || '0');
              } else {
                // downloadSpeed وuploadSpeed مخزّنان بـ Kbps
                uploadMbps = (newPlan.uploadSpeed || 0) / 1000;
                downloadMbps = (newPlan.downloadSpeed || 0) / 1000;
              }

              if (uploadMbps > 0 || downloadMbps > 0) {
                // تحديث radreply وإرسال CoA لتحديث Queue فوراً
                const coaResult = await coaEngine.changeUserSpeed(
                  effectiveUsername,
                  uploadMbps,
                  downloadMbps
                );
                console.log(`[Subscribers] Plan changed for ${effectiveUsername}: ${newPlan.name} → CoA: ${coaResult.message}`);
              }
            }
          }
        } catch (e) {
          // لا نكسر العملية إذا فشل CoA — التحديث سيُطبَّق عند إعادة الاتصال
          console.error(`[Subscribers] Failed to update speed after plan change for ${effectiveUsername}:`, e);
        }
      }

      return { success: true };
    });
  // Suspend subscriber


export const suspend = resellerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      }
      // Check ownership
      if (subscriber.subscriber.ownerId !== ctx.user.id && subscriber.subscriber.createdBy !== ctx.user.id && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }

      await db.suspendSubscriber(input.id);

      // Suspend in RADIUS (set Auth-Type to Reject)
      await radiusSubscribers.suspendSubscriberRadius(subscriber.subscriber.username);

      // Send CoA Disconnect to kick user off
      try {
        await coaEngine.disconnectAllSessions(subscriber.subscriber.username);
      } catch (e) {
        console.error('[Subscribers] Failed to disconnect user:', e);
      }

      return { success: true };
    });

  // Activate subscriber


export const activate = resellerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      }
      // Check ownership
      if (subscriber.subscriber.ownerId !== ctx.user.id && subscriber.subscriber.createdBy !== ctx.user.id && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }

      await db.activateSubscriber(input.id);

      // Activate in RADIUS (set Auth-Type to Accept)
      await radiusSubscribers.activateSubscriberRadius(subscriber.subscriber.username);

      return { success: true };
    });

  // Renew subscription


export const renew = resellerProcedure
    .input(z.object({
      id: z.number(),
      months: z.number().min(1).max(24),
      amount: z.number().min(0),
      paymentMethod: z.enum(['cash', 'wallet', 'card', 'bank_transfer', 'online']).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      }
      // Check ownership
      if (subscriber.subscriber.ownerId !== ctx.user.id && subscriber.subscriber.createdBy !== ctx.user.id && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }

      const result = await db.renewSubscription(
        input.id,
        input.months,
        input.amount,
        ctx.user.id,
        input.paymentMethod || 'cash',
        input.notes
      );

      // Update RADIUS Expiration date
      if (result.endDate) {
        await radiusSubscribers.updateSubscriberRadiusEntries(
          subscriber.subscriber.username,
          new Date(result.endDate)
        );
      }

      // Activate in RADIUS if was expired
      if (subscriber.subscriber.status === 'expired') {
        await radiusSubscribers.activateSubscriberRadius(subscriber.subscriber.username);
      }

      // إرسال إشعار تجديد الاشتراك (async - لا يكسر الـ procedure)
      const subscriberOwnerId = subscriber.subscriber.ownerId || ctx.user.id;
      const subscriberName = subscriber.subscriber.fullName || subscriber.subscriber.username || 'مشترك';
      notifyOwnerEvent(subscriberOwnerId, 'ownerNewSubscription', {
        title: 'تجديد اشتراك',
        message: `تم تجديد اشتراك المشترك ${subscriberName} لمدة ${input.months} شهر`,
      }).catch(() => {});
      notifySubscriberEvent(input.id, subscriberOwnerId, 'subscriberNewSubscription', {
        title: 'تم تجديد اشتراكك',
        message: `تم تجديد اشتراكك بنجاح لمدة ${input.months} شهر`,
      }).catch(() => {});

      return { success: true, ...result };
    });

  // Get subscription history


export const deleteSubscriber = resellerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      }
      // Check ownership
      if (subscriber.subscriber.ownerId !== ctx.user.id && subscriber.subscriber.createdBy !== ctx.user.id && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }

      // Remove all RADIUS entries (radcheck, radreply, radusergroup)
      await radiusSubscribers.deleteSubscriberRadiusEntries(subscriber.subscriber.username);

      // Disconnect user if online
      try {
        await coaEngine.disconnectAllSessions(subscriber.subscriber.username);
      } catch (e) {
        console.error('[Subscribers] Failed to disconnect user:', e);
      }

      await db.deleteSubscriber(input.id);
      return { success: true };
    });

  // Disconnect user (kick off network)


export const disconnect = resellerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      }
      // Check ownership
      if (subscriber.subscriber.ownerId !== ctx.user.id && subscriber.subscriber.createdBy !== ctx.user.id && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }

      // CoAEngine resolves the current V2 session from online_sessions. A Broadband
      // subscriber may not have nasId persisted even though the live session has a NAS.
      const result = await coaEngine.disconnectAllSessions(subscriber.subscriber.username);
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.message || 'تعذر فصل الجلسة الحالية' });
      }
      return { success: true, message: result.message };
    });

export const sendCustomSms = resellerProcedure
    .input(z.object({ id: z.number(), message: z.string().trim().min(1).max(1000) }))
    .mutation(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      if (subscriber.subscriber.ownerId !== ctx.user.id && subscriber.subscriber.createdBy !== ctx.user.id && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }
      const phone = subscriber.subscriber.phone?.trim();
      if (!phone) throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد رقم هاتف للمشترك' });
      const result = await tweetsmsService.sendSmsTenant(ctx.user.id, phone, input.message, {
        type: 'manual',
        sentBy: ctx.user.id,
      });
      if (!result.success) throw new TRPCError({ code: 'BAD_REQUEST', message: result.errorMessage || 'فشل إرسال الرسالة النصية' });
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'subscriber_sms_sent',
        targetType: 'subscriber',
        targetId: String(input.id),
        targetName: subscriber.subscriber.username,
        details: { phone },
        result: 'success',
      });
      return { success: true };
    });
