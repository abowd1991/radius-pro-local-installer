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


export const generateMikroTikScript = superAdminProcedure
    .input(z.object({
      radiusServerIp: z.string(),
      radiusSecret: z.string(),
      pppoePoolName: z.string().optional(),
      pppoePoolRange: z.string().optional(),
      hotspotEnabled: z.boolean().optional(),
      hotspotInterface: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const script = mikrotikApi.generateMikroTikScript(input);
      return { script };
    });

  // Generate FreeRADIUS client config
export const generateFreeRadiusConfig = superAdminProcedure
    .input(z.object({
      nasIp: z.string(),
      nasName: z.string(),
      secret: z.string(),
      nasType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const config = mikrotikApi.generateFreeRadiusClientConfig(input);
      return { config };
    });

  // Disconnect all sessions for a user using CoA
export const triggerMonitorCheck = superAdminProcedure
    .mutation(async () => {
      return sessionMonitor.triggerCheck();
    });

  // Start session monitor (no-op: centralAccountingService is the single monitor)
export const startMonitor = superAdminProcedure
    .input(z.object({ intervalMs: z.number().default(30000) }).optional())
    .mutation(async ({ input }) => {
      sessionMonitor.startMonitor(input?.intervalMs || 30000); // no-op
      return { success: true, message: 'Session monitor is unified into CentralAccounting service' };
    });

  // Stop session monitor (no-op)
export const stopMonitor = superAdminProcedure
    .mutation(async () => {
      sessionMonitor.stopMonitor(); // no-op
      return { success: true, message: 'Use stopCentralAccounting() to stop the unified monitor' };
    });

  // ============================================
  // MikroTik API Direct Control Endpoints
  // ============================================
  
  // Change user speed via MikroTik API (without disconnecting)
