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
import { sessionRepository } from '../../domains/accounting/repositories/SessionRepository';
import { voucherRepository } from '../../domains/vouchers/repositories/VoucherRepository';


export const list = protectedProcedure
    .input(z.object({
      status: z.enum(['unused', 'active', 'used', 'expired', 'suspended', 'cancelled']).optional(),
      batchId: z.string().optional(),
      search: z.string().optional(),
      isManual: z.boolean().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(200).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Super admin sees all cards
      // V2: VoucherRepository.findAll — يستبدل cardDb.getAllCards + cardDb.getCardsByReseller
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      return voucherRepository.findAll(
        isAdmin(ctx.user.role)
          ? input
          : { ...input, ownerId: effectiveOwnerId }
      );
    });

  // Get card by ID - check ownership
export const getById = protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      // V2: VoucherRepository.findByIdWithPlan
      const card = await voucherRepository.findByIdWithPlan(input.id);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      // Check ownership for non-super_admin
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (!isAdmin(ctx.user.role) && card.createdBy !== effectiveOwnerId && card.resellerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return card;
    });

  // Requires active subscription to generate new cards
export const getSubscriberGroups = resellerProcedure.query(async () => {
    return cardDb.getSubscriberGroups();
  });

export const getBatches = resellerProcedure.query(async ({ ctx }) => {
    if (isAdmin(ctx.user.role)) {
      return cardDb.getAllBatchesWithStats();
    }
    return cardDb.getBatchesByTenantWithStats(getTenantContext(ctx.user));
  });

  // Get batch with statistics - check ownership
export const getBatchWithStats = resellerProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ ctx, input }) => {
      const batch = await cardDb.getBatchWithStats(input.batchId);
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      // Check ownership for non-super_admin
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (!isAdmin(ctx.user.role) && batch.createdBy !== effectiveOwnerId && batch.resellerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return batch;
    });

  // Enable batch - activate all cards for RADIUS - check ownership (requires active subscription)
export const getCardsByBatch = resellerProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check ownership for non-super_admin
      const batch = await cardDb.getBatchById(input.batchId);
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (batch && !isAdmin(ctx.user.role) && batch.createdBy !== effectiveOwnerId && batch.resellerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return cardDb.getCardsByBatch(input.batchId);
    });

  // Export all cards in a batch as CSV data (no pagination)
export const getActivity = protectedProcedure
    .input(z.object({ lifecycleIds: z.array(z.string().uuid()).min(1).max(500) }))
    .query(async ({ input }) => {
      return cardDb.getCardActivity(input.lifecycleIds);
    });

export const getStats = protectedProcedure
    .query(async ({ ctx }) => {
      if (isAdmin(ctx.user.role)) {
        return voucherRepository.getEffectiveCardStats();
      }
      return voucherRepository.getEffectiveCardStats(getEffectiveOwnerId(getTenantContext(ctx.user)));
    });

export const getNamespaceCapacity = resellerProcedure
    .input(z.object({
      prefix: z.string().max(4).optional().default(''),
      usernameLength: z.number().min(4).max(10),
    }))
    .query(async ({ input }) => {
      const { prefix, usernameLength } = input;
      const prefixPattern = prefix
        ? `${prefix}${'_'.repeat(usernameLength - prefix.length)}`
        : '_'.repeat(usernameLength);

      const dbConn = await getDb();
      if (!dbConn) return { used: 0, total: 0, available: 0, percent: 0 };

      const [result] = await dbConn
        .select({ count: sql<number>`COUNT(*)` })
        .from(radiusCards)
        .where(like(radiusCards.username, prefixPattern));

      const used = Number(result?.count || 0);
      const total = prefix
        ? Math.pow(10, usernameLength - prefix.length)
        : 9 * Math.pow(10, usernameLength - 1);
      const available = Math.max(0, total - used);
      const percent = total > 0 ? Math.round((used / total) * 100) : 0;

      return { used, total, available, percent };
    });

  // Get manual cards with client info (for dedicated manual cards page)
export const getManualCards = protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(500).default(50),
      clientId: z.number().optional(), // For admin: filter by specific client
      search: z.string().optional(), // Search in username, fullName, notes
      status: z.enum(['unused', 'active', 'used', 'expired', 'suspended', 'cancelled']).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const dbConn = await getDb();
      if (!dbConn) return { data: [], total: 0, page: 1, limit: 50, totalPages: 0 };

      const page = Math.max(1, input?.page ?? 1);
      const limit = Math.min(500, Math.max(1, input?.limit ?? 50));
      const offset = (page - 1) * limit;

      const conditions: any[] = [
        eq(radiusCards.isManual, true),
      ];

      // Access control
      if (!isAdmin(ctx.user.role)) {
        // Client sees only their own manual cards
        conditions.push(eq(radiusCards.createdBy, getEffectiveOwnerId(getTenantContext(ctx.user))));
      } else if (input?.clientId) {
        // Admin with client filter
        conditions.push(eq(radiusCards.createdBy, input.clientId));
      }

      if (input?.status) conditions.push(eq(radiusCards.status, input.status as any));
      if (input?.search) {
        const q = `%${input.search}%`;
        conditions.push(or(
          like(radiusCards.username, q),
          like(radiusCards.fullName, q),
          like(radiusCards.notes, q),
        ));
      }

      const whereClause = and(...conditions);

      // Join with users to get client name
      const [totalResult, data] = await Promise.all([
        dbConn.select({ total: count() })
          .from(radiusCards)
          .where(whereClause as any),
        dbConn.select({
          id: radiusCards.id,
          lifecycleId: radiusCards.lifecycleId,
          username: radiusCards.username,
          password: radiusCards.password,
          fullName: radiusCards.fullName,
          phone: radiusCards.phone,
          notes: radiusCards.notes,
          status: radiusCards.status,
          planId: radiusCards.planId,
          planName: plans.name,
          createdBy: radiusCards.createdBy,
          expiresAt: radiusCards.expiresAt,
          activatedAt: radiusCards.activatedAt,
          firstLoginAt: radiusCards.firstLoginAt,
          createdAt: radiusCards.createdAt,
          simultaneousUse: radiusCards.simultaneousUse,
          serialNumber: radiusCards.serialNumber,
          usageBudgetSeconds: radiusCards.usageBudgetSeconds,
          windowSeconds: radiusCards.windowSeconds,
          // Client name from users table
          clientName: users.name,
        })
          .from(radiusCards)
          .leftJoin(plans, eq(radiusCards.planId, plans.id))
          .leftJoin(users, eq(radiusCards.createdBy, users.id))
          .where(whereClause as any)
          .orderBy(desc(radiusCards.createdAt))
          .limit(limit)
          .offset(offset),
      ]);

      const total = Number(totalResult[0]?.total ?? 0);
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    });

// V2: live status is bound to the immutable card lifecycle, never a reused username.
export const getOnlineCardIds = protectedProcedure
    .input(z.object({ lifecycleIds: z.array(z.string().uuid()).min(1).max(500) }))
    .query(async ({ input }) => sessionRepository.findOnlineCardIdsByLifecycleIds(input.lifecycleIds));

  // ── Online count per batch (JOIN radius_cards + radacct) ──
export const getBatchOnlineCounts = protectedProcedure
    .input(z.object({ batchIds: z.array(z.string()).min(1).max(200) }))
    .query(async ({ input }) => {
      return cardDb.getBatchOnlineCounts(input.batchIds);
    });

  // Send manual card credentials via SMS (uses client's SMS balance)
