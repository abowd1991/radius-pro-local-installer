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

export const exportRevenueExcel = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      groupBy: z.enum(["day", "week", "month"]).default("day"),
    }))
    .mutation(async ({ ctx, input }) => {
      const data = await reportsService.getRevenueReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate),
        input.groupBy
      );
      const buffer = await reportExporter.generateRevenueExcel(data);
      return { data: buffer.toString("base64"), filename: `revenue-report-${input.startDate}-${input.endDate}.xlsx` };
    });

  // Export cards to Excel


export const exportCardsExcel = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data = await reportsService.getCardsReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate)
      );
      const buffer = await reportExporter.generateCardsExcel(data);
      return { data: buffer.toString("base64"), filename: `cards-report-${input.startDate}-${input.endDate}.xlsx` };
    });

  // Export sessions to Excel


export const exportSessionsExcel = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data = await reportsService.getSessionsReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate)
      );
      const buffer = await reportExporter.generateSessionsExcel(data);
      return { data: buffer.toString("base64"), filename: `sessions-report-${input.startDate}-${input.endDate}.xlsx` };
    });

  // Export subscribers to Excel


export const exportSubscribersExcel = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data = await reportsService.getSubscribersReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate)
      );
      const buffer = await reportExporter.generateSubscribersExcel(data);
      return { data: buffer.toString("base64"), filename: `subscribers-report-${input.startDate}-${input.endDate}.xlsx` };
    });

  // Export revenue to PDF (HTML)


export const exportRevenuePDF = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      groupBy: z.enum(["day", "week", "month"]).default("day"),
    }))
    .mutation(async ({ ctx, input }) => {
      const data = await reportsService.getRevenueReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate),
        input.groupBy
      );
      const dateRange = `${input.startDate} - ${input.endDate}`;
      const html = reportExporter.generateRevenuePDFHTML(data, dateRange);
      return { html, filename: `revenue-report-${input.startDate}-${input.endDate}.html` };
    });

  // Export cards to PDF (HTML)


export const exportCardsPDF = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data = await reportsService.getCardsReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate)
      );
      const dateRange = `${input.startDate} - ${input.endDate}`;
      const html = reportExporter.generateCardsPDFHTML(data, dateRange);
      return { html, filename: `cards-report-${input.startDate}-${input.endDate}.html` };
    });

  // Export sessions to PDF (HTML)


export const exportSessionsPDF = protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data = await reportsService.getSessionsReport(
        ctx.user.id,
        new Date(input.startDate),
        new Date(input.endDate)
      );
      const dateRange = `${input.startDate} - ${input.endDate}`;
      const html = reportExporter.generateSessionsPDFHTML(data, dateRange);
      return { html, filename: `sessions-report-${input.startDate}-${input.endDate}.html` };
    });
