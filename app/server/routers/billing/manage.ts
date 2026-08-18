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

export const activateUser = superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { activateUserBilling } = await import("../../services/billingService");
      const result = await activateUserBilling(input.userId, ctx.user.id);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Failed to activate billing" });
      }
      return result;
    });

  // Process billing manually for a user (owner only)


export const processUserBilling = superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { processUserBilling } = await import("../../services/billingService");
      const result = await processUserBilling(input.userId, ctx.user.id);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Billing failed" });
      }
      return result;
    });

  // Get NAS billing rate


export const setNasPricing = superAdminProcedure
    .input(z.object({
      firstNasMonthly: z.number().min(1).max(1000),
      additionalNasMonthly: z.number().min(0).max(1000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { systemSettings } = await import('../../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const firstNasDaily = parseFloat((input.firstNasMonthly / 30).toFixed(4));
      const additionalNasDaily = parseFloat((input.additionalNasMonthly / 30).toFixed(4));

      // Upsert first NAS rate
      const [existingFirst] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'nas_daily_rate'));
      if (existingFirst) {
        await db.update(systemSettings).set({ value: firstNasDaily.toString(), updatedAt: new Date() }).where(eq(systemSettings.key, 'nas_daily_rate'));
      } else {
        await db.insert(systemSettings).values({ key: 'nas_daily_rate', value: firstNasDaily.toString(), description: 'Daily rate for first NAS ($15/month default)' });
      }

      // Upsert additional NAS rate
      const [existingAdditional] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'nas_additional_daily_rate'));
      if (existingAdditional) {
        await db.update(systemSettings).set({ value: additionalNasDaily.toString(), updatedAt: new Date() }).where(eq(systemSettings.key, 'nas_additional_daily_rate'));
      } else {
        await db.insert(systemSettings).values({ key: 'nas_additional_daily_rate', value: additionalNasDaily.toString(), description: 'Daily rate for additional NAS devices ($6/month default)' });
      }

      return { success: true, firstNasMonthly: input.firstNasMonthly, additionalNasMonthly: input.additionalNasMonthly };
    });

