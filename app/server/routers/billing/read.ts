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
import { radcheck, radreply, nasDevices, radiusCards, radacct, users, wallets, walletLedger, cardBatches, checkTokens, plans, notificationChannels, siteSettings, systemUpdates, billingRunLogs } from "../../../drizzle/schema";
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

export const getMySummary = protectedProcedure.query(async ({ ctx }) => {
    const { getUserBillingSummary } = await import("../../services/billingService");
    return getUserBillingSummary(ctx.user.id);
  });

  // Get billing summary for any user (owner only)


export const getUserSummary = superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const { getUserBillingSummary } = await import("../../services/billingService");
      return getUserBillingSummary(input.userId);
    });

  // Activate billing for a user (owner only)


export const getBillingRate = publicProcedure.query(async () => {
    const { getNasBillingRate } = await import("../../services/billingService");
    return { rate: await getNasBillingRate() };
  });

  // Get users due for billing (owner only)


export const getUsersDue = superAdminProcedure.query(async () => {
    const { getUsersDueForBilling } = await import("../../services/billingService");
    return { userIds: await getUsersDueForBilling() };
  });

  // Get dashboard analytics (owner only)


export const getDashboardStats = superAdminProcedure.query(async () => {
    const { getDashboardStats } = await import("../../services/billingAnalyticsService");
    return getDashboardStats();
  });

  // Get revenue history chart data (owner only)


export const getRevenueHistory = superAdminProcedure
    .input(z.object({ days: z.number().optional().default(30) }))
    .query(async ({ input }) => {
      const { getRevenueHistory } = await import("../../services/billingAnalyticsService");
      return getRevenueHistory(input.days);
    });

  // Get low balance clients (owner only)


export const getLowBalanceClients = superAdminProcedure.query(async () => {
    const { getLowBalanceClients } = await import("../../services/billingAnalyticsService");
    return getLowBalanceClients();
  });

  // Get NAS pricing settings (public - shown to clients)


export const getNasPricing = publicProcedure.query(async () => {
    const { getDailyBillingRate, getAdditionalNasDailyRate } = await import("../../services/billingService");
    const firstNasDaily = await getDailyBillingRate();
    const additionalNasDaily = await getAdditionalNasDailyRate();
    return {
      firstNasMonthly: parseFloat((firstNasDaily * 30).toFixed(2)),
      additionalNasMonthly: parseFloat((additionalNasDaily * 30).toFixed(2)),
      firstNasDaily,
      additionalNasDaily,
    };
  });

  // Update NAS pricing settings (owner only)


export const calculateMonthlyCost = publicProcedure
    .input(z.object({ nasCount: z.number().min(0).max(100) }))
    .query(async ({ input }) => {
      const { getDailyBillingRate, getAdditionalNasDailyRate } = await import("../../services/billingService");
      const firstNasDaily = await getDailyBillingRate();
      const additionalNasDaily = await getAdditionalNasDailyRate();

      let dailyCost = 0;
      if (input.nasCount >= 1) {
        dailyCost = firstNasDaily + (input.nasCount - 1) * additionalNasDaily;
      }
      const monthlyCost = parseFloat((dailyCost * 30).toFixed(2));

      const breakdown = [];
      if (input.nasCount >= 1) {
        breakdown.push({ label: 'NAS الأول', monthly: parseFloat((firstNasDaily * 30).toFixed(2)) });
        for (let i = 2; i <= input.nasCount; i++) {
          breakdown.push({ label: `NAS ${i}`, monthly: parseFloat((additionalNasDaily * 30).toFixed(2)) });
        }
      }

      return { nasCount: input.nasCount, dailyCost, monthlyCost, breakdown };
    });

  // ── إحصائيات الإيداعات والخصومات للمالك ──


export const getWalletStats = superAdminProcedure
    .input(z.object({
      from: z.string().optional(), // ISO date string
      to: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { walletLedger: wl, wallets: wt, users: ut } = await import('../../../drizzle/schema');

      const fromDate = input.from ? new Date(input.from) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d; })();
      const toDate = input.to ? (() => { const d = new Date(input.to!); d.setHours(23,59,59,999); return d; })() : new Date();

      // إجمالي الإيداعات في الفترة (type='credit' أو type='deposit')
      const depositsResult = await db.execute(
        sql`SELECT COALESCE(SUM(CAST(amount AS DECIMAL(10,2))), 0) as total
            FROM wallet_ledger
            WHERE type IN ('credit','deposit')
              AND createdAt >= ${fromDate}
              AND createdAt <= ${toDate}`
      );

      // إجمالي الخصومات في الفترة (type='debit')
      const deductionsResult = await db.execute(
        sql`SELECT COALESCE(SUM(CAST(amount AS DECIMAL(10,2))), 0) as total
            FROM wallet_ledger
            WHERE type = 'debit'
              AND createdAt >= ${fromDate}
              AND createdAt <= ${toDate}`
      );

      // إجمالي الرصيد الحالي لجميع العملاء
      const totalBalanceResult = await db.execute(
        sql`SELECT COALESCE(SUM(CAST(w.balance AS DECIMAL(10,2))), 0) as total
            FROM wallets w
            INNER JOIN users u ON u.id = w.userId
            WHERE u.role = 'client'`
      );

      // بيانات المخطط اليومي
      const chartResult = await db.execute(
        sql`SELECT
              DATE_FORMAT(createdAt, '%Y-%m-%d') as date,
              SUM(CASE WHEN type IN ('credit','deposit') THEN CAST(amount AS DECIMAL(10,2)) ELSE 0 END) as deposits,
              SUM(CASE WHEN type = 'debit' THEN CAST(amount AS DECIMAL(10,2)) ELSE 0 END) as deductions
            FROM wallet_ledger
            WHERE createdAt >= ${fromDate}
              AND createdAt <= ${toDate}
            GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')
            ORDER BY DATE_FORMAT(createdAt, '%Y-%m-%d')`
      );

      const depositsRows = Array.isArray((depositsResult as any[])[0]) ? (depositsResult as any[])[0] : depositsResult;
      const deductionsRows = Array.isArray((deductionsResult as any[])[0]) ? (deductionsResult as any[])[0] : deductionsResult;
      const totalBalanceRows = Array.isArray((totalBalanceResult as any[])[0]) ? (totalBalanceResult as any[])[0] : totalBalanceResult;
      const chartRows = Array.isArray((chartResult as any[])[0]) ? (chartResult as any[])[0] : chartResult;

      const totalDeposits = Number((depositsRows as any)[0]?.total || 0);
      const totalDeductions = Number((deductionsRows as any)[0]?.total || 0);
      const totalBalance = Number((totalBalanceRows as any)[0]?.total || 0);

      return {
        totalDeposits,
        totalDeductions,
        netFlow: totalDeposits - totalDeductions,
        totalBalance,
        chart: (chartRows as any[]).map((r: any) => ({
          date: r.date,
          deposits: Number(r.deposits || 0),
          deductions: Number(r.deductions || 0),
        })),
      };
    });

  // ── قائمة جميع العملاء مع أرصدتهم ──


export const getAllClientsBalance = superAdminProcedure
    .input(z.object({
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const searchTerm = input?.search || '';
      const result = await db.execute(
        sql`SELECT
              u.id,
              u.name,
              u.username,
              u.email,
              u.status,
              u.billingStatus,
              COALESCE(CAST(w.balance AS DECIMAL(10,2)), 0) as balance
            FROM users u
            LEFT JOIN wallets w ON w.userId = u.id
            WHERE u.role = 'client'
              AND (${searchTerm} = '' OR u.name LIKE ${`%${searchTerm}%`} OR u.email LIKE ${`%${searchTerm}%`} OR u.username LIKE ${`%${searchTerm}%`})
            ORDER BY CAST(COALESCE(w.balance, '0') AS DECIMAL(10,2)) ASC`
      );

      const rows = Array.isArray((result as any[])[0]) ? (result as any[])[0] : result;
      return (rows as any[]).map((r: any) => ({
        id: Number(r.id),
        name: r.name || r.username || '',
        username: r.username || '',
        email: r.email || '',
        status: r.status || 'active',
        billingStatus: r.billingStatus || 'active',
        balance: Number(r.balance || 0),
      }));
    });


// Get billing run logs (last 20 runs) - owner only
export const getBillingRunLogs = superAdminProcedure.query(async () => {
  const db = await getDb();
  const logs = await db
    .select()
    .from(billingRunLogs)
    .orderBy(desc(billingRunLogs.runAt))
    .limit(20);
  return logs;
});
