import { protectedProcedure, publicProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../../db";
import * as walletDb from "../../db/wallet";
import * as planDb from "../../db/plans";
import * as nasDb from "../../db/nas";
import * as cardDb from "../../db/vouchers";
import { recycleBinService } from "../../domains/recycleBin/RecycleBinService";
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
import { parseZonedDateTimeInput } from "../../core/TimezoneService";
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
import { voucherRepository } from '../../domains/vouchers/repositories/VoucherRepository';


export const updateNotes = protectedProcedure
    .input(z.object({
      cardId: z.number(),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const card = await voucherRepository.findById(input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      if (!isAdmin(ctx.user.role) && card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await voucherRepository.updateCard(input.cardId, { notes: input.notes ?? null });
      return { success: true };
    });

  // Update card - full edit (username, password, plan, expiry, notes)
export const updateCard = protectedProcedure
    .input(z.object({
      cardId: z.number(),
      username: z.string().min(1).max(64),
      password: z.string().max(64).optional(), // empty = username-only
      planId: z.number(),
      expiryType: z.enum(['1week', '2weeks', '1month', '3months', 'custom', 'from_activation', 'keep']),
      expiryDate: z.string().optional(),
      notes: z.string().max(1000).optional(),
      simultaneousUse: z.number().int().min(1).max(100).optional(),
      fullName: z.string().max(255).optional(),
      phone: z.string().max(30).optional(),
      macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:\-]){5}([0-9A-Fa-f]{2})$/).optional().nullable(), // MAC binding
    }))
    .mutation(async ({ ctx, input }) => {
      const card = await voucherRepository.findById(input.cardId);
      if (!card) throw new TRPCError({ code: 'NOT_FOUND', message: 'Card not found' });
      if (!isAdmin(ctx.user.role) && (card as any).createdBy !== ctx.user.id && (card as any).resellerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Check username uniqueness if changed
      if (input.username !== (card as any).username) {
        const existing = await db.execute(
          sql`SELECT id FROM radius_cards WHERE username = ${input.username} AND createdBy = ${(card as any).createdBy} AND id != ${input.cardId} LIMIT 1`
        );
        const rows = (existing as any)[0] as any[];
        if (rows && rows.length > 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'اسم المستخدم موجود مسبقاً. الرجاء اختيار اسم مستخدم آخر.' });
        }
      }

      // Calculate new expiry
      // 'keep' = don't change expiresAt at all
      const keepExpiry = input.expiryType === 'keep';
      let expiresAt: Date | null = null;
      if (!keepExpiry) {
        if (input.expiryType === 'from_activation') {
          expiresAt = null;
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
          if (ms) {
            // If card still has remaining time, add duration on top of current expiry.
            // If card is expired (or has no expiry), start from now.
            const currentExpiry = (card as any).expiresAt ? new Date((card as any).expiresAt) : null;
            const baseDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
            expiresAt = new Date(baseDate.getTime() + ms);
          }
        }
      }

      // Determine auth mode
      const trimmedPassword = (input.password || '').trim();
      const isUsernameOnly = trimmedPassword === '';
      const finalPassword = isUsernameOnly ? null : trimmedPassword;

      // Fetch plan to check autoDisconnect
      const planForCard = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
      const cardPlan = planForCard[0];
      const baseSimUse = input.simultaneousUse ?? (cardPlan?.simultaneousUse ?? 1);
      // If autoDisconnect is enabled, minimum 2 so FreeRADIUS accepts new login while old is being disconnected.
      // We respect the user's input even if it's 1 — autoDisconnect works with Simultaneous-Use=1 too.
      // Only enforce minimum 2 if the plan itself has simultaneousUse >= 2 (shared plan).
      const simultaneousUse = baseSimUse;

      await voucherRepository.updateManualCardProfile({
        card: card as any,
        username: input.username,
        password: finalPassword,
        authType: isUsernameOnly ? 'username-only' : 'password',
        planId: input.planId,
        simultaneousUse,
        fullName: input.fullName ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        macAddress: input.macAddress ?? null,
        keepExpiry,
        expiresAt,
      });

      return { success: true, username: input.username };
    });

export const enableBatch = activeSubscriptionProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const batch = await cardDb.getBatchWithStats(input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      if (!isAdmin(ctx.user.role) && batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return cardDb.enableBatch(input.batchId);
    });

  // Disable batch - deactivate all cards for RADIUS and disconnect active sessions - check ownership (requires active subscription)
export const disableBatch = activeSubscriptionProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership first
      const batch = await cardDb.getBatchWithStats(input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      if (!isAdmin(ctx.user.role) && batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      // First, get all cards in the batch to disconnect their sessions
      const cards = await cardDb.getCardsByBatch(input.batchId);
      
      // Disconnect all active sessions for these cards
      const disconnectPromises = cards.map(async (card: { username: string }) => {
        try {
          // Disconnect from RADIUS (MikroTik sessions)
          await coaService.disconnectUserAllSessions(card.username);
          // Disconnect from VPN (SoftEther sessions)
          await vpnApi.disconnectVpnSession(card.username);
        } catch (error) {
          console.error(`Failed to disconnect session for ${card.username}:`, error);
        }
      });
      
      await Promise.allSettled(disconnectPromises);
      
      // Then disable the batch in database
      return cardDb.disableBatch(input.batchId);
    });

  // Update batch time settings - check ownership (requires active subscription)
export const updateBatchTime = activeSubscriptionProcedure
    .input(z.object({
      batchId: z.string(),
      cardTimeValue: z.number().optional(),
      cardTimeUnit: z.enum(['hours', 'days']).optional(),
      internetTimeValue: z.number().optional(),
      internetTimeUnit: z.enum(['hours', 'days']).optional(),
      timeFromActivation: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership first
      const batch = await cardDb.getBatchWithStats(input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      if (!isAdmin(ctx.user.role) && batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const { batchId, ...data } = input;
      return cardDb.updateBatchTime(batchId, data);
    });

  // Update batch properties
export const updateBatchProperties = activeSubscriptionProcedure
    .input(z.object({
      batchId: z.string(),
      simultaneousUse: z.number().optional(),
      planId: z.number().optional(),
      hotspotPort: z.string().optional(),
      macBinding: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { batchId, ...data } = input;
      // Check ownership for non-super_admin
      if (!isAdmin(ctx.user.role)) {
        const batch = await cardDb.getBatchWithStats(batchId);
        if (!batch) throw new TRPCError({ code: 'NOT_FOUND', message: 'Batch not found' });
        if (batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have permission to edit this batch' });
        }
      }
      return cardDb.updateBatchProperties(batchId, data);
    });

  // Delete batch - check ownership
export const deleteBatch = protectedProcedure
    .input(z.object({
      batchId: z.string(),
      deleteCards: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const batch = await cardDb.getBatchById(input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "الدفعة غير موجودة" });
      // Check ownership for non-super_admin
      if (!isAdmin(ctx.user.role)) {
        if (batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }
      if (input.deleteCards) {
        const cards = await cardDb.getCardsByBatch(input.batchId);
        await Promise.allSettled(cards.map(async (card: { username: string }) => {
          await coaService.disconnectUserAllSessions(card.username);
          await vpnApi.disconnectVpnSession(card.username);
        }));
      }
      return recycleBinService.archiveBatch(input.batchId, input.deleteCards, {
        userId: ctx.user.id,
        role: ctx.user.role,
        ownerId: batch.createdBy,
        resellerId: batch.resellerId,
      });
    });

export const bulkDeleteBatches = protectedProcedure
    .input(z.object({
      batchIds: z.array(z.string()).min(1),
      deleteCards: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership for non-super_admin
      if (!isAdmin(ctx.user.role)) {
        const batchChecks = await Promise.all(input.batchIds.map((batchId: string) => cardDb.getBatchById(batchId)));
        const unauthorized = batchChecks.some((batch: any, i: number) => {
          return !batch || (batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id);
        });
        if (unauthorized) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      let deleted = 0;
      for (const batchId of input.batchIds) {
        const batch = await cardDb.getBatchById(batchId);
        if (!batch) continue;
        if (input.deleteCards) {
          const cards = await cardDb.getCardsByBatch(batchId);
          await Promise.allSettled(cards.map(async (card: { username: string }) => {
            await coaService.disconnectUserAllSessions(card.username);
            await vpnApi.disconnectVpnSession(card.username);
          }));
        }
        await recycleBinService.archiveBatch(batchId, input.deleteCards, {
          userId: ctx.user.id,
          role: ctx.user.role,
          ownerId: batch.createdBy,
          resellerId: batch.resellerId,
        });
        deleted++;
      }
      return { deleted };
    });

export const bulkDisableBatches = protectedProcedure
    .input(z.object({
      batchIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      let affected = 0;
      for (const batchId of input.batchIds) {
        const result = await cardDb.disableBatch(batchId);
        affected += result?.affectedCards ?? 0;
      }
      return { affected };
    });

export const bulkEnableBatches = protectedProcedure
    .input(z.object({
      batchIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      let affected = 0;
      for (const batchId of input.batchIds) {
        const result = await cardDb.enableBatch(batchId);
        affected += result?.affectedCards ?? 0;
      }
      return { affected };
    });

export const exportBatchCards = resellerProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check ownership for non-super_admin
      const batch = await cardDb.getBatchById(input.batchId);
      if (batch && !isAdmin(ctx.user.role) && batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const cards = await cardDb.getCardsByBatch(input.batchId);
      // Attach plan name to each card
      const plans = await planDb.getAllPlans();
      const planMap = new Map(plans.map((p: any) => [p.id, p.name]));
      return cards.map((c: any) => ({
        ...c,
        planName: planMap.get(c.planId) || '-',
      }));
    });

  // Export cards from multiple batches as CSV data
export const exportMultipleBatchCards = resellerProcedure
    .input(z.object({ batchIds: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      if (!input.batchIds.length) return [];
      const allCards: any[] = [];
      for (const batchId of input.batchIds) {
        const batch = await cardDb.getBatchById(batchId);
        if (batch && !isAdmin(ctx.user.role) && batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
          continue; // skip unauthorized batches
        }
        const cards = await cardDb.getCardsByBatch(batchId);
        allCards.push(...cards);
      }
      return allCards;
    });

  // Legacy alias for redeem
export const generateBatchPDF = resellerProcedure
    .input(z.object({
      batchId: z.string(),
      companyName: z.string().optional(),
      hotspotUrl: z.string().optional(),
      cardsPerPage: z.number().default(8),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get batch and cards
      const batch = await cardDb.getBatchById(input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      // Check ownership for non-super_admin
      if (!isAdmin(ctx.user.role) && batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const cards = await cardDb.getCardsByBatch(input.batchId);
      if (!cards || cards.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No cards found in batch" });
      }

      // Get plan details for each card
      const plans = await planDb.getAllPlans();
      const planMap = new Map(plans.map((p: any) => [p.id, p]));

      const cardData = cards.map((card: any) => {
        const plan: any = planMap.get(card.planId);
        return {
          serialNumber: card.serialNumber,
          username: card.username,
          password: card.password,
          planName: plan?.name || 'Unknown',
          planNameAr: plan?.nameAr || undefined,
          validityDays: plan?.validityValue || 30,
          downloadSpeed: Math.round((plan?.downloadSpeed || 0) / 1000),
          uploadSpeed: Math.round((plan?.uploadSpeed || 0) / 1000),
          price: plan?.price || '0',
        };
      });

      // Generate and save PDF
      const result = await saveBatchPDF({
        batchId: input.batchId,
        batchName: batch.name,
        cards: cardData,
        companyName: input.companyName,
        hotspotUrl: input.hotspotUrl,
        cardsPerPage: input.cardsPerPage,
      });

      return {
        success: true,
        fileUrl: result.pdfUrl,
        htmlUrl: result.pdfUrl, // backward compat
        cardsCount: cards.length,
      };
    });

  // Get batch PDF HTML (for preview)
export const getBatchPDFPreview = resellerProcedure
    .input(z.object({
      batchId: z.string(),
      companyName: z.string().optional(),
      hotspotUrl: z.string().optional(),
      cardsPerPage: z.number().default(8),
    }))
    .query(async ({ ctx, input }) => {
      const batch = await cardDb.getBatchById(input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      // Check ownership for non-super_admin
      if (!isAdmin(ctx.user.role) && batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const cards = await cardDb.getCardsByBatch(input.batchId);
      if (!cards || cards.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No cards found in batch" });
      }

      const plans = await planDb.getAllPlans();
      const planMap = new Map(plans.map((p: any) => [p.id, p]));

      const cardData = cards.map((card: any) => {
        const plan: any = planMap.get(card.planId);
        return {
          serialNumber: card.serialNumber,
          username: card.username,
          password: card.password,
          planName: plan?.name || 'Unknown',
          planNameAr: plan?.nameAr || undefined,
          validityDays: plan?.validityValue || 30,
          downloadSpeed: Math.round((plan?.downloadSpeed || 0) / 1000),
          uploadSpeed: Math.round((plan?.uploadSpeed || 0) / 1000),
          price: plan?.price || '0',
        };
      });

      const html = generateCardsPDFHTML({
        batchId: input.batchId,
        batchName: batch.name,
        cards: cardData,
        companyName: input.companyName,
        hotspotUrl: input.hotspotUrl,
        cardsPerPage: input.cardsPerPage,
      });

      return { html };
    });

  // Generate PDF with template
export const generateBatchPDFWithTemplate = resellerProcedure
    .input(z.object({
      batchId: z.string(),
      templateId: z.number().optional(),
      printSettings: z.object({
        columns: z.number().default(5),
        cardsPerPage: z.number().default(50),
        marginTop: z.number().default(5),
        marginBottom: z.number().default(5),
        marginLeft: z.number().default(5),
        marginRight: z.number().default(5),
        spacingH: z.number().default(2),
        spacingV: z.number().default(2),
      }).optional(),
      qrEnabled: z.boolean().optional(),
      qrDomain: z.string().optional(),
      qrSettings: z.object({
        x: z.number(),
        y: z.number(),
        size: z.number(),
      }).optional(),
      textSettings: z.object({
        username: z.object({
          x: z.number(),
          y: z.number(),
          fontSize: z.number(),
          fontFamily: z.string(),
          color: z.string(),
          align: z.enum(["left", "center", "right"]),
        }),
        password: z.object({
          x: z.number(),
          y: z.number(),
          fontSize: z.number(),
          fontFamily: z.string(),
          color: z.string(),
          align: z.enum(["left", "center", "right"]),
        }),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }): Promise<{ success: boolean; fileUrl: string; htmlUrl: string; cardsCount: number }> => {
      // Get batch and cards
      const batch = await cardDb.getBatchById(input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      // Check ownership for non-super_admin
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (!isAdmin(ctx.user.role) && batch.createdBy !== effectiveOwnerId && batch.resellerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const cards = await cardDb.getCardsByBatch(input.batchId);
      if (!cards || cards.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No cards found in batch" });
      }

      // Get template if provided
      let template = null;
      if (input.templateId) {
        template = await templateDb.getTemplateById(input.templateId);
      }

      // Get plan details for each card
      const plans = await planDb.getAllPlans();
      const planMap = new Map(plans.map((p: any) => [p.id, p]));

      const cardData = cards.map((card: any) => {
        const plan: any = planMap.get(card.planId);
        return {
          serialNumber: card.serialNumber,
          username: card.username,
          password: card.password,
          planName: plan?.name || 'Unknown',
          planNameAr: plan?.nameAr || undefined,
          validityDays: plan?.validityValue || 30,
          downloadSpeed: Math.round((plan?.downloadSpeed || 0) / 1000),
          uploadSpeed: Math.round((plan?.uploadSpeed || 0) / 1000),
          price: plan?.price || '0',
        };
      });

      // Default print settings
      const printSettings = input.printSettings || {
        columns: 5,
        cardsPerPage: 50,
        marginTop: 5,
        marginBottom: 5,
        marginLeft: 5,
        marginRight: 5,
        spacingH: 2,
        spacingV: 2,
      };

      // Use textSettings from preview if provided, otherwise fall back to template settings
      const textSettings = input.textSettings;
      const qrSettings = {
        enabled: input.qrEnabled ?? template?.qrCodeEnabled ?? false,
        domain: input.qrDomain ?? template?.qrCodeDomain ?? null,
        x: input.qrSettings?.x ?? template?.qrCodeX ?? 10,
        y: input.qrSettings?.y ?? template?.qrCodeY ?? 10,
        size: input.qrSettings?.size ?? template?.qrCodeSize ?? 80,
      };

      // Generate and save PDF with template - using preview settings (WYSIWYG)
      const result = await saveBatchPDFWithTemplate({
        batchId: input.batchId,
        batchName: batch.name,
        cards: cardData,
        printSettings,
        template: template ? {
          imageUrl: template.imageUrl,
          cardWidth: template.cardWidth || 400,
          cardHeight: template.cardHeight || 250,
          // Use textSettings from preview if provided (WYSIWYG)
          usernameX: textSettings?.username.x ?? template.usernameX ?? 50,
          usernameY: textSettings?.username.y ?? template.usernameY ?? 40,
          usernameFontSize: textSettings?.username.fontSize ?? template.usernameFontSize ?? 14,
          usernameFontFamily: textSettings?.username.fontFamily ?? template.usernameFontFamily ?? "Arial",
          usernameFontColor: textSettings?.username.color ?? template.usernameFontColor ?? "#0066cc",
          usernameAlign: (textSettings?.username.align ?? template.usernameAlign ?? "center") as "left" | "center" | "right",
          passwordX: textSettings?.password.x ?? template.passwordX ?? 50,
          passwordY: textSettings?.password.y ?? template.passwordY ?? 60,
          passwordFontSize: textSettings?.password.fontSize ?? template.passwordFontSize ?? 14,
          passwordFontFamily: textSettings?.password.fontFamily ?? template.passwordFontFamily ?? "Arial",
          passwordFontColor: textSettings?.password.color ?? template.passwordFontColor ?? "#cc0000",
          passwordAlign: (textSettings?.password.align ?? template.passwordAlign ?? "center") as "left" | "center" | "right",
          // Use QR settings from preview (WYSIWYG)
          qrCodeEnabled: qrSettings.enabled,
          qrCodeX: qrSettings.x,
          qrCodeY: qrSettings.y,
          qrCodeSize: qrSettings.size,
          qrCodeDomain: qrSettings.domain,
          cardsPerPage: template.cardsPerPage || 8,
          marginTop: template.marginTop || "1.8",
          marginHorizontal: template.marginHorizontal || "1.8",
          columnsPerPage: template.columnsPerPage || 5,
        } : undefined,
      });

      return {
        success: true,
        fileUrl: result.pdfUrl,
        htmlUrl: result.pdfUrl, // backward compat
        cardsCount: cards.length,
      };
    });

  // Export batch as CSV
export const exportBatchCSV = resellerProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check ownership for non-super_admin
      const batch = await cardDb.getBatchById(input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      if (!isAdmin(ctx.user.role) && batch.createdBy !== ctx.user.id && batch.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      const cards = await cardDb.getCardsByBatch(input.batchId);
      if (!cards || cards.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No cards found in batch" });
      }

      const plans = await planDb.getAllPlans();
      const planMap = new Map(plans.map((p: any) => [p.id, p]));

      const cardData = cards.map((card: any) => {
        const plan: any = planMap.get(card.planId);
        return {
          serialNumber: card.serialNumber,
          username: card.username,
          password: card.password,
          planName: plan?.name || 'Unknown',
          validityDays: plan?.validityValue || 30,
          downloadSpeed: Math.round((plan?.downloadSpeed || 0) / 1000),
          uploadSpeed: Math.round((plan?.uploadSpeed || 0) / 1000),
          price: plan?.price || '0',
        };
      });

      const csv = generateCardsCSV(cardData);
      return { csv };
    });

  // Bulk operations
export const deleteCard = protectedProcedure
    .input(z.object({ cardId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [card] = await db.select().from(radiusCards).where(eq(radiusCards.id, input.cardId)).limit(1);
      if (!card) throw new TRPCError({ code: 'NOT_FOUND', message: 'Card not found' });
      if (!isAdmin(ctx.user.role) && card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      await coaService.disconnectUserAllSessions(card.username).catch(() => undefined);
      await vpnApi.disconnectVpnSession(card.username).catch(() => undefined);
      return recycleBinService.archiveCard(input.cardId, {
        userId: ctx.user.id,
        role: ctx.user.role,
        ownerId: card.createdBy,
        resellerId: card.resellerId,
      });
    });

  // Get radacct activity (first login + last seen) for a batch of usernames
export const bulkDelete = protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      
      if (input.ids.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No IDs provided' });
      }
      
      // Get cards to verify ownership
      const cards = await db.select().from(radiusCards).where(sql`id IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`).execute();
      
      // Verify ownership
      if (!isAdmin(ctx.user.role)) {
        const unauthorized = cards.some((card: any) => card.createdBy !== ctx.user.id);
        if (unauthorized) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      for (const card of cards as Array<{ id: number; createdBy: number; resellerId: number | null }>) {
        const cardWithUsername = await db.select({ username: radiusCards.username }).from(radiusCards).where(eq(radiusCards.id, card.id)).limit(1);
        if (cardWithUsername[0]?.username) {
          await coaService.disconnectUserAllSessions(cardWithUsername[0].username).catch(() => undefined);
          await vpnApi.disconnectVpnSession(cardWithUsername[0].username).catch(() => undefined);
        }
        await recycleBinService.archiveCard(card.id, {
          userId: ctx.user.id,
          role: ctx.user.role,
          ownerId: card.createdBy,
          resellerId: card.resellerId,
        });
      }
      
      return { success: true, count: cards.length };
    });

  // ── Import cards from CSV (super admin only) ──
