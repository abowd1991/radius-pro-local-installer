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
import { timezoneRepository } from "../../domains/core/TimezoneRepository";
import { parseZonedDateTimeInput } from '../../core/TimezoneService';
import { formatFreeRadiusExpiration } from '../../core/FreeRadiusTime';
import { buildPlanNetworkReplyAttributes } from '../../../shared/planNetworkAttributes';
import * as permissionsService from "../../services/permissionsService";
import { ENV } from "../../_core/env";
import * as vpnIpPool from "../../db/vpnIpPool";
import * as freeradiusService from "../../services/freeradiusService";
import * as twoPhaseProvisioning from "../../services/twoPhaseProvisioningService";
import { autoFixMissingHuntgroups } from '../../v2/V2ServiceBridge';
import { voucherEngine } from '../../domains/vouchers/VoucherEngine';
import { voucherRepository } from '../../domains/vouchers/repositories/VoucherRepository';
import { cardLifecycleRepository } from '../../domains/vouchers/repositories/CardLifecycleRepository';
import { renewalEngine } from '../../domains/vouchers/RenewalEngine';
import { importCardsFromCsv, parseCsvCards } from "../../db/importCardsFromCsv";
import { parseFileToRows, mapRowsToCards } from "../../db/parseFileCards";
import { isAdmin } from "../../_core/roles";
import { randomUUID } from 'node:crypto';


export const generate = activeSubscriptionProcedure
    .input(z.object({
      planId: z.number(),
      quantity: z.number().min(1).max(5000),
      batchName: z.string().optional(),
      purchasePrice: z.number().optional(),
      salePrice: z.number().optional(),
      // New fields for RADIUS card creation
      simultaneousUse: z.number().min(1).max(100).optional(),
      hotspotPort: z.string().optional(),
      timeFromActivation: z.boolean().default(true),
      internetTimeValue: z.number().min(0).default(0),
      internetTimeUnit: z.enum(['hours', 'days']).default('hours'),
      cardTimeValue: z.number().min(0).default(0),
      cardTimeUnit: z.enum(['hours', 'days']).default('hours'),
      macBinding: z.boolean().default(false),
      prefix: z.string().max(10).optional(),
      usernameLength: z.number().min(1).max(20).default(6),
      passwordLength: z.number().min(1).max(20).default(4),
      subscriberGroup: z.string().default('Default group'),
      cardPrice: z.number().default(0),
      // New Time Budget System
      usageBudgetSeconds: z.number().min(0).default(0),
      windowSeconds: z.number().min(0).default(0),
      // Auth type: 'password' (default) or 'username-only' (no password required)
      authType: z.enum(['password', 'username-only']).default('password'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check billing status - block if past_due
      if (ctx.user.billingStatus === 'past_due') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot generate cards: Your account has insufficient balance. Please add credit to your wallet.',
        });
      }
      
      try {
        // V2: VoucherEngine.generateCards (Infrastructure: generateCardsV2 + Events + AuditLog + Metrics)
        const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
        return await voucherEngine.generateCards({
          ...input,
          createdBy: effectiveOwnerId,
          resellerId: ctx.user.role === 'reseller' ? effectiveOwnerId : undefined,
        });
      } catch (err: any) {
        // Parse namespace capacity errors for user-friendly messages
        if (err.message?.startsWith('NAMESPACE_FULL:')) {
          const info = JSON.parse(err.message.replace('NAMESPACE_FULL:', ''));
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `نفدت سعة النطاق (${info.percent}% ممتلئ). البادئة: "${info.prefix || 'بدون'}", الطول: ${info.length}. المتاح: ${info.available} فقط. استخدم بادئة مختلفة أو طولاً أكبر.`,
          });
        }
        if (err.message?.startsWith('NAMESPACE_INSUFFICIENT:')) {
          const info = JSON.parse(err.message.replace('NAMESPACE_INSUFFICIENT:', ''));
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `لا توجد مساحة كافية في هذا النطاق. طلبت: ${info.requested} كرت, المتاح: ${info.available} فقط (${info.percent}% ممتلئ). قلل الكمية أو استخدم بادئة مختلفة.`,
          });
        }
        throw err;
      }
    });

  // Get subscriber groups for dropdown
export const activate = clientProcedure
    .input(z.object({ serialNumber: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await cardDb.activateCard(input.serialNumber, ctx.user.id);
      // إرسال إشعار تفعيل الكرت (async - لا يكسر الـ procedure)
      if (result.success) {
        const tenantCtx = getTenantContext(ctx.user);
        const ownerId = getEffectiveOwnerId(tenantCtx);
        const plansList = await planDb.getAllPlans();
        const plan = plansList.find((p: any) => p.id === result.planId);
        const planName = plan?.name || 'غير معروف';
        notifyOwnerEvent(ownerId, 'ownerCardActivated', {
          title: 'تم تفعيل كرت',
          message: `تم تفعيل كرت ${input.serialNumber} - الخطة: ${planName}`,
        }).catch(() => {});
        notifySubscriberEvent(ctx.user.id, ownerId, 'subscriberCardActivated', {
          title: 'تم تفعيل اشتراكك',
          message: `تم تفعيل كرتك بنجاح. الخطة: ${planName}`,
        }).catch(() => {});
      }
      return result;
    });

  // Suspend card - check ownership (requires active subscription)
export const suspend = activeSubscriptionProcedure
    .input(z.object({ cardId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardDb.getCardById(input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (!isAdmin(ctx.user.role) && card.createdBy !== effectiveOwnerId && card.resellerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      // V2: VoucherEngine.suspendCard (Auth-Type Reject + Transaction + EventBus)
      await voucherEngine.suspendCard(card.id, card.username, ctx.user.username ?? String(ctx.user.id));
      return { success: true };
    });

  // Unsuspend card - check ownership (requires active subscription)
export const unsuspend = activeSubscriptionProcedure
    .input(z.object({ cardId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardDb.getCardById(input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (!isAdmin(ctx.user.role) && card.createdBy !== effectiveOwnerId && card.resellerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      // V2: VoucherEngine.activateCard (حذف Auth-Type Reject + Transaction + EventBus)
      await voucherEngine.activateCard({
        cardId: card.id,
        username: card.username,
        ownerId: card.createdBy,
        huntgroupName: `owner_${card.createdBy}`,
      });
      return { success: true };
    });

  // Bulk suspend cards
export const bulkSuspendCards = activeSubscriptionProcedure
    .input(z.object({ cardIds: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      let count = 0;
      for (const cardId of input.cardIds) {
        try {
          const card = await cardDb.getCardById(cardId);
          if (!card) continue;
          if (!isAdmin(ctx.user.role) && card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id) continue;
          // V2: VoucherEngine.suspendCard
          await voucherEngine.suspendCard(card.id, card.username, ctx.user.username ?? String(ctx.user.id));
          count++;
        } catch { /* skip */ }
      }
      return { count };
    });

  // Bulk unsuspend cards
export const bulkUnsuspendCards = activeSubscriptionProcedure
    .input(z.object({ cardIds: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      let count = 0;
      for (const cardId of input.cardIds) {
        try {
          const card = await cardDb.getCardById(cardId);
          if (!card) continue;
          if (!isAdmin(ctx.user.role) && card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id) continue;
          // V2: VoucherEngine.activateCard
          await voucherEngine.activateCard({
            cardId: card.id,
            username: card.username,
            ownerId: card.createdBy,
            huntgroupName: `owner_${card.createdBy}`,
          });
          count++;
        } catch { /* skip */ }
      }
      return { count };
    });

  // Update card notes - check ownership
export const redeem = clientProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await cardDb.activateCard(input.code, ctx.user.id);
      // إرسال إشعار تفعيل الكرت (async - لا يكسر الـ procedure)
      if (result.success) {
        const tenantCtx = getTenantContext(ctx.user);
        const ownerId = getEffectiveOwnerId(tenantCtx);
        const plansList = await planDb.getAllPlans();
        const plan = plansList.find((p: any) => p.id === result.planId);
        const planName = plan?.name || 'غير معروف';
        notifyOwnerEvent(ownerId, 'ownerCardActivated', {
          title: 'تم تفعيل كرت',
          message: `تم تفعيل كرت ${input.code} - الخطة: ${planName}`,
        }).catch(() => {});
        notifySubscriberEvent(ctx.user.id, ownerId, 'subscriberCardActivated', {
          title: 'تم تفعيل اشتراكك',
          message: `تم تفعيل كرتك بنجاح. الخطة: ${planName}`,
        }).catch(() => {});
      }
      return result;
    });

  // Generate PDF for batch
export const bulkActivate = protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      
      // Get cards to verify ownership
      const cards = await db.select().from(radiusCards).where(sql`id IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`).execute();
      
      // Verify ownership
      if (!isAdmin(ctx.user.role)) {
        const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
        const unauthorized = cards.some((card: any) => card.createdBy !== effectiveOwnerId);
        if (unauthorized) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      // V2: VoucherEngine.activateCard لكل كرت
      for (const card of cards as any[]) {
        await voucherEngine.activateCard({
          cardId: card.id,
          username: card.username,
          ownerId: card.createdBy,
          huntgroupName: `owner_${card.createdBy}`,
        });
      }
      return { success: true, count: input.ids.length };
    });

export const bulkDeactivate = protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      
      // Get cards to verify ownership
      const cards = await db.select().from(radiusCards).where(sql`id IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`).execute();
      
      // Verify ownership
      if (!isAdmin(ctx.user.role)) {
        const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
        const unauthorized = cards.some((card: any) => card.createdBy !== effectiveOwnerId);
        if (unauthorized) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      // V2: VoucherEngine.suspendCard لكل كرت
      for (const card of cards as any[]) {
        await voucherEngine.suspendCard(card.id, card.username, ctx.user.username ?? String(ctx.user.id));
      }
      return { success: true, count: input.ids.length };
    });

  // Create a single manual card with custom username/password
export const createManualCard = activeSubscriptionProcedure
    .input(z.object({
      username: z.string().min(1).max(64),
      password: z.string().max(64).optional(), // Optional - auto-generated if empty
      planId: z.number(),
      // Expiry: either duration or custom date
      expiryType: z.enum(['1week', '2weeks', '1month', '3months', 'custom', 'from_activation']),
      expiryDate: z.string().optional(), // ISO date string for custom
      // Optional
      fullName: z.string().max(255).optional(), // Customer full name for manual cards
      phone: z.string().min(7, "رقم الجوال مطلوب").max(30), // Customer phone number for manual cards (required)
      batchId: z.string().optional(), // If provided, add to existing batch; otherwise create new "يدوي" batch
      notes: z.string().optional(),
      simultaneousUse: z.number().min(1).max(100).optional(),
      usageBudgetSeconds: z.number().min(0).default(0),
      windowSeconds: z.number().min(0).optional(),
      macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:\-]){5}([0-9A-Fa-f]{2})$/).optional().nullable(), // MAC binding
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.billingStatus === 'past_due') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot create card: Your account has insufficient balance.',
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));

      // Check username uniqueness GLOBALLY (across all owners in radius_cards AND radcheck)
      const [existingCard, existingRadcheck] = await Promise.all([
        db.select({ id: radiusCards.id })
          .from(radiusCards)
          .where(eq(radiusCards.username, input.username))
          .limit(1),
        db.execute(sql`SELECT id FROM radcheck WHERE username = ${input.username} LIMIT 1`),
      ]);
      const radcheckRows = (existingRadcheck as any)[0] as any[];
      if (existingCard.length > 0 || radcheckRows.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'اسم المستخدم موجود مسبقاً في النظام. الرجاء اختيار اسم مستخدم آخر.' });
      }

      // Get plan details
      const planResult = await planDb.getPlanById(input.planId);
      if (!planResult) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      const plan = planResult as any;
      if (!isAdmin(ctx.user.role) && plan.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      // Calculate expiry date
      let expiresAt: Date | null = null;
      if (input.expiryType === 'from_activation') {
        expiresAt = null; // Will be set on first login
      } else if (input.expiryType === 'custom' && input.expiryDate) {
        const ownerTimezone = await timezoneRepository.getOwnerTimezone(getEffectiveOwnerId(getTenantContext(ctx.user)));
        expiresAt = parseZonedDateTimeInput(input.expiryDate, ownerTimezone);
      } else {
        const now = new Date();
        const durations: Record<string, number> = {
          '1week': 7 * 86400000,
          '2weeks': 14 * 86400000,
          '1month': 30 * 86400000,
          '3months': 90 * 86400000,
        };
        const ms = durations[input.expiryType];
        if (ms) expiresAt = new Date(now.getTime() + ms);
      }

      // Find or create the manual batch
      let batchId = input.batchId;
      if (!batchId) {
        // Look for existing manual batch for this user
        const existingBatch = await db.select({ batchId: cardBatches.batchId })
          .from(cardBatches)
          .where(and(
            eq(cardBatches.createdBy, effectiveOwnerId),
            eq(cardBatches.name, 'يدوي')
          ))
          .limit(1);
        if (existingBatch.length > 0) {
          batchId = existingBatch[0].batchId;
          // Update quantity
          await db.execute(sql`UPDATE card_batches SET quantity = quantity + 1 WHERE batchId = ${batchId}`);
        } else {
          // Create new manual batch
          const { nanoid } = await import('nanoid');
          batchId = nanoid(10);
          await db.insert(cardBatches).values({
            batchId,
            name: 'يدوي',
            planId: input.planId,
            createdBy: effectiveOwnerId,
            resellerId: ctx.user.role === 'reseller' ? effectiveOwnerId : null,
            quantity: 1,
            status: 'completed',
          } as any);
        }
      }

      // Determine auth mode: if password is empty → username-only (Auth-Type := Accept)
      const trimmedPassword = input.password?.trim() || '';
      const isUsernameOnly = trimmedPassword === '';
      const finalPassword = isUsernameOnly ? null : trimmedPassword;

      // Generate serial number
      const { nanoid: nanoidFn } = await import('nanoid');
      const serialNumber = nanoidFn(12);
      const lifecycleId = randomUUID();

      // Build radreply attributes from plan
      const radreplyValues: any[] = [];
      const usageBudgetSeconds = input.usageBudgetSeconds || 0;
      let finalSessionTimeout = 0;
      if (usageBudgetSeconds > 0) {
        finalSessionTimeout = usageBudgetSeconds;
      } else if (plan.sessionTimeout && plan.sessionTimeout > 0) {
        finalSessionTimeout = plan.sessionTimeout;
      }
      if (finalSessionTimeout > 0) {
        radreplyValues.push({ username: input.username, attribute: 'Session-Timeout', op: '=', value: String(finalSessionTimeout) });
      }
      let rateLimitValue: string | null = null;
      if (plan.mikrotikRateLimit) {
        rateLimitValue = plan.mikrotikRateLimit;
      } else if (plan.downloadSpeed || plan.uploadSpeed) {
        const dl = plan.downloadSpeed ? `${plan.downloadSpeed}k` : '0';
        const ul = plan.uploadSpeed ? `${plan.uploadSpeed}k` : '0';
        rateLimitValue = `${ul}/${dl}`;
      }
      if (rateLimitValue) {
        radreplyValues.push({ username: input.username, attribute: 'Mikrotik-Rate-Limit', op: '=', value: rateLimitValue });
      }
      for (const attribute of buildPlanNetworkReplyAttributes({
        dataLimitBytes: plan.dataLimit,
        mikrotikAddressPool: plan.mikrotikAddressPool,
      })) {
        radreplyValues.push({ username: input.username, ...attribute });
      }
      // Port-Limit: overrides MikroTik Hotspot's local "Shared Users" restriction
      // Will be finalized after effectiveSimUse is computed below, added before insert

      // Insert in transaction
      await db.transaction(async (tx: any) => {
        // Insert card
        const inserted = await tx.insert(radiusCards).values({
          username: input.username,
          lifecycleId,
          password: finalPassword,
          authType: isUsernameOnly ? 'username-only' : 'password',
          serialNumber,
          batchId,
          planId: input.planId,
          createdBy: effectiveOwnerId,
          resellerId: ctx.user.role === 'reseller' ? effectiveOwnerId : null,
          status: 'unused',
          expiresAt,
          fullName: input.fullName || null,
          phone: input.phone || null,
          notes: input.notes || null,
          macAddress: input.macAddress || null,
          isManual: true,
          usageBudgetSeconds: input.usageBudgetSeconds || 0,
          windowSeconds: input.windowSeconds || 0,
          purchasePrice: plan.resellerPrice || '0',
          salePrice: plan.price || '0',
          simultaneousUse: plan.autoDisconnect ? Math.max(2, input.simultaneousUse || 1) : (input.simultaneousUse || 1),
        } as any);
        const cardId = Number((inserted as any)[0]?.insertId ?? (inserted as any).insertId);
        if (!cardId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل إنشاء هوية دورة الكرت' });
        await cardLifecycleRepository.openInTransaction(tx, {
          lifecycleId,
          cardId,
          username: input.username,
          ownerId: effectiveOwnerId,
        });

        // Insert radcheck: authentication + control attributes (unified)
        const radcheckEntries: any[] = [];
        if (isUsernameOnly) {
          // No password: accept by username only
          radcheckEntries.push({ username: input.username, attribute: 'Auth-Type', op: ':=', value: 'Accept' });
        } else {
          // Has password: FreeRADIUS checks Cleartext-Password — do NOT add Auth-Type := Accept
          radcheckEntries.push({ username: input.username, attribute: 'Cleartext-Password', op: ':=', value: finalPassword! });
        }
        // Simultaneous-Use: if autoDisconnect is enabled on the plan, minimum 2 so FreeRADIUS accepts the second session
        const effectiveSimUse = plan.autoDisconnect
          ? Math.max(2, input.simultaneousUse || 1)
          : (input.simultaneousUse || 1);
        radcheckEntries.push({
          username: input.username,
          attribute: 'Simultaneous-Use',
          op: ':=',
          value: String(effectiveSimUse),
        });
        // Port-Limit: overrides MikroTik Hotspot's local "Shared Users" restriction
        radreplyValues.push({ username: input.username, attribute: 'Port-Limit', op: ':=', value: String(effectiveSimUse) });
        // Expiration: hard expiry enforced by FreeRADIUS
        const expirationStr = expiresAt
          ? formatFreeRadiusExpiration(expiresAt)
          : 'Jan 01 2099 00:00:00';
        radcheckEntries.push({ username: input.username, attribute: 'Expiration', op: ':=', value: expirationStr });
        // MAC Address binding: lock card to specific device via Calling-Station-Id
        if (input.macAddress) {
          const normalizedMac = input.macAddress.toUpperCase().replace(/-/g, ':');
          radcheckEntries.push({ username: input.username, attribute: 'Calling-Station-Id', op: '==', value: normalizedMac });
        }
        await tx.insert(radcheck).values(radcheckEntries);

        // Insert radreply using ON DUPLICATE KEY UPDATE to handle unique constraint
        for (const rv of radreplyValues) {
          await tx.execute(
            sql`INSERT INTO radreply (username, attribute, op, value)
              VALUES (${rv.username}, ${rv.attribute}, ${rv.op}, ${rv.value})
              ON DUPLICATE KEY UPDATE value = ${rv.value}, op = ${rv.op}`
          );
        }
        // الطريقة الصحيحة من RADIUS: مجموعة واحدة لكل كرت
        // - كرت عادي (بدون تقييد NAS) → owner_X في radusergroup
        // - كرت مقيد على NAS محدد → HG_plan_X في radusergroup (وليس owner_X)
        let planNasIds: number[] = [];
        if (plan.restrictedNasIds) {
          try { planNasIds = JSON.parse(plan.restrictedNasIds as string); } catch { planNasIds = []; }
        } else if (plan.restrictedNasId) {
          planNasIds = [plan.restrictedNasId];
        }
        if (planNasIds.length > 0) {
          // كرت مقيد: استخدم HG_plan_X كمجموعة وحيدة في radusergroup
          const huntGroupName = `HG_plan_${input.planId}`;
          // 1. أضف الكرت إلى HG_plan_X في radusergroup (مجموعة واحدة فقط)
          await tx.execute(
            sql`INSERT INTO radusergroup (username, groupname, priority)
                VALUES (${input.username}, ${huntGroupName}, 1)
                ON DUPLICATE KEY UPDATE groupname = ${huntGroupName}`
          );
          // 2. تأكد من وجود radgroupcheck لـ HG_plan_X (Huntgroup-Name == HG_plan_X)
          await tx.execute(
            sql`INSERT IGNORE INTO radgroupcheck (groupname, attribute, op, value)
                VALUES (${huntGroupName}, 'Huntgroup-Name', '==', ${huntGroupName})`
          );
          // 3. احذف أي Huntgroup-Name قديم من radcheck (legacy)
          await tx.execute(
            sql`DELETE FROM radcheck WHERE username = ${input.username} AND attribute = 'Huntgroup-Name'`
          );
          // 4. احذف أي NAS-IP-Address قديم من radcheck (legacy)
          await tx.execute(
            sql`DELETE FROM radcheck WHERE username = ${input.username} AND attribute = 'NAS-IP-Address'`
          );
        } else {
          // كرت عادي: استخدم owner_X كمجموعة في radusergroup
          const ownerGroupName = `owner_${effectiveOwnerId}`;
          await tx.execute(
            sql`INSERT INTO radusergroup (username, groupname, priority)
                VALUES (${input.username}, ${ownerGroupName}, 1)
                ON DUPLICATE KEY UPDATE groupname = ${ownerGroupName}`
          );
        }
      });

      return {
        success: true,
        username: input.username,
        password: finalPassword,
        serialNumber,
        batchId,
        expiresAt,
      };
    });

  // Renew a card - update expiresAt (and optionally windowSeconds)
export const renewCard = activeSubscriptionProcedure
    .input(z.object({
      cardId: z.number(),
      renewType: z.enum(['custom_duration', 'custom', 'no_expiry']),
      durationValue: z.number().min(1).optional(), // e.g. 2
      durationUnit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']).optional(), // e.g. 'weeks'
      customDate: z.string().optional(), // ISO date string for custom
      usageBudgetSeconds: z.number().min(0).optional(), // Session-Timeout in seconds (0 = unlimited)
      windowSeconds: z.number().min(0).optional(), // Window validity in seconds (0 = no window)
    }))
    .mutation(async ({ ctx, input }) => {
      // Get card and verify ownership
      // V2: VoucherRepository.findById
      const card = await voucherRepository.findById(input.cardId);
      if (!card) throw new TRPCError({ code: 'NOT_FOUND', message: 'Card not found' });
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (!isAdmin(ctx.user.role) && card.createdBy !== effectiveOwnerId && card.resellerId !== effectiveOwnerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      // Calculate new expiry date (optional — no_expiry means no date)
      let newExpiresAt: Date | null = null;
      if (input.renewType === 'custom' && input.customDate) {
        const ownerTimezone = await timezoneRepository.getOwnerTimezone(getEffectiveOwnerId(getTenantContext(ctx.user)));
        newExpiresAt = parseZonedDateTimeInput(input.customDate, ownerTimezone);
      } else if (input.renewType === 'custom_duration' && input.durationValue && input.durationUnit) {
        const unitMs: Record<string, number> = {
          minutes: 60000,
          hours: 3600000,
          days: 86400000,
          weeks: 7 * 86400000,
          months: 30 * 86400000,
        };
        const addedMs = input.durationValue * unitMs[input.durationUnit];
        // Always add to current expiry if still valid, otherwise from now
        const base = card.expiresAt && card.expiresAt > new Date() ? card.expiresAt : new Date();
        newExpiresAt = new Date(base.getTime() + addedMs);
      } else if (input.renewType === 'no_expiry') {
        // No expiry date — rely on usageBudgetSeconds and windowSeconds only
        newExpiresAt = null;
      } else {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid renewal parameters' });
      }
      const resetUsage = input.usageBudgetSeconds !== undefined
        || input.windowSeconds !== undefined
        || card.status === 'expired'
        || card.status === 'used';
      await renewalEngine.renewCard({
        cardId: card.id,
        username: card.username,
        lifecycleId: card.lifecycleId,
        newExpiresAt,
        additionalUsageBudgetSeconds: input.usageBudgetSeconds,
        newWindowSeconds: input.windowSeconds,
        resetUsage,
      });

      return {
        success: true,
        cardId: input.cardId,
        newExpiresAt: newExpiresAt ?? undefined,
        username: card.username,
      };
    });

// Update card plan and/or speed (mikrotikRateLimit) without touching other fields
export const updateCardPlanSpeed = activeSubscriptionProcedure
    .input(z.object({
      cardId: z.number(),
      planId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      // V2: VoucherRepository.findById
      const card = await voucherRepository.findById(input.cardId);
      if (!card) throw new TRPCError({ code: 'NOT_FOUND', message: 'Card not found' });
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (!isAdmin(ctx.user.role) && card.createdBy !== effectiveOwnerId && card.resellerId !== effectiveOwnerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      // Get new plan info
      const planRow = await planDb.getPlanById(input.planId);
      if (!planRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      // Update planId in radius_cards
      await dbConn.update(radiusCards)
        .set({ planId: input.planId })
        .where(eq(radiusCards.id, input.cardId));
      // Update MikroTik-Rate-Limit in radreply if plan has a rate limit
      if ((planRow as any).mikrotikRateLimit) {
        const rateAttr = 'Mikrotik-Rate-Limit';
        const existing = await dbConn.select()
          .from(radreply)
          .where(and(eq(radreply.username, card.username), eq(radreply.attribute, rateAttr)))
          .limit(1);
        if (existing.length > 0) {
          await dbConn.update(radreply)
            .set({ value: (planRow as any).mikrotikRateLimit })
            .where(and(eq(radreply.username, card.username), eq(radreply.attribute, rateAttr)));
        } else {
          await dbConn.insert(radreply).values({
            username: card.username,
            attribute: rateAttr,
            op: ':=',
            value: (planRow as any).mikrotikRateLimit,
          });
        }
      } else {
        // No rate limit in new plan — remove existing rate limit from radreply
        await dbConn.execute(
          sql`DELETE FROM radreply WHERE username = ${card.username} AND attribute = 'Mikrotik-Rate-Limit'`
        );
      }
      return {
        success: true,
        cardId: input.cardId,
        planId: input.planId,
        planName: (planRow as any).name,
        mikrotikRateLimit: (planRow as any).mikrotikRateLimit ?? null,
      };
    });

  // Delete a single card with ownership check
