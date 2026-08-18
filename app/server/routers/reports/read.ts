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
import * as reportsService from "../../services/reportsService";
import * as reportExporter from "../../services/reportExporter";
import { getBandwidthReport, type BandwidthSortBy } from "../../domains/reports/BandwidthReportRepository";
import { timezoneRepository } from "../../domains/core/TimezoneRepository";

export const dashboardSummary = protectedProcedure.query(async ({ ctx }) => {
    return reportsService.getDashboardSummary(ctx.user.id);
  });

  // Get revenue report


export const revenue = superAdminProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      groupBy: z.enum(["day", "week", "month"]).default("day"),
    }))
    .query(async ({ ctx, input }) => {
      return reportsService.getRevenueReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate),
        input.groupBy
      );
    });

  // Get subscribers report


export const subscribers = superAdminProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return reportsService.getSubscribersReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    });

  // Get cards report


export const cards = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return reportsService.getCardsReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    });

  // Get sessions report


export const sessions = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return reportsService.getSessionsReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    });

  // Export revenue to Excel


export const usage = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return reportsService.getUsageReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    });

export const getBandwidthUsage = protectedProcedure
  .input(z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    sortBy: z.enum(["totalData", "totalDownload", "totalUpload", "sessionCount", "totalTime"]).default("totalData"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }))
  .query(async ({ ctx, input }) => {
    const timezone = await timezoneRepository.getOwnerTimezone(ctx.user.id);
    return getBandwidthReport({
      ownerId: ctx.user.id,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      timezone,
      sortBy: input.sortBy as BandwidthSortBy,
      sortOrder: input.sortOrder,
    });
  });
