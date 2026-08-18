import { protectedProcedure, publicProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "../_core/trpc";
import { voucherRepository } from '../domains/vouchers/repositories/VoucherRepository';
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import * as walletDb from "../db/wallet";
import * as planDb from "../db/plans";
import * as nasDb from "../db/nas";
import * as cardDb from "../db/vouchers";
import * as invoiceDb from "../db/invoices";
import * as subscriptionDb from "../db/subscriptions";
import * as notificationDb from "../db/notifications";
import * as templateDb from "../db/cardTemplates";
import * as radiusSubscribers from "../db/radiusSubscribers";
import * as vpnApi from "../services/vpnApiService";
import * as accountingService from "../services/accountingService";
import * as sessionMonitor from "../services/sessionMonitor";
import * as coaService from "../services/coaService";
import * as multiChannelNotification from "../services/multiChannelNotificationService";
import * as tweetsmsService from "../services/tweetsmsService";
import * as smsDb from "../db/sms";
import * as mikrotikApi from "../services/mikrotikApi";
import * as authService from "../services/authService";
import { storagePut } from "../storage";
import { generateCardsPDFHTML, generateCardsCSV, saveBatchPDF, saveBatchPDFWithTemplate, generateCardsPDFHTMLWithTemplate } from "../services/pdfGenerator";
import { logAudit } from "../services/auditLogService";
import { notifyOwnerEvent, notifySubscriberEvent } from "../services/notificationService";
import { getDb } from "../db";
import { radcheck, radreply, nasDevices, radiusCards, radacct, users, wallets, walletLedger, cardBatches, checkTokens, plans, notificationChannels, siteSettings, systemUpdates } from "../../drizzle/schema";
import { eq, and, isNull, sql, desc, or, count, gte, like, inArray } from "drizzle-orm";
import { getTenantContext, getEffectiveOwnerId, canSeeAllData } from "../tenant-isolation";
import { cache, cacheKeys, cacheTTL } from "../_core/cache";
import * as permissionsService from "../services/permissionsService";
import { ENV } from "../_core/env";
import * as vpnIpPool from "../db/vpnIpPool";
import * as freeradiusService from "../services/freeradiusService";
import * as twoPhaseProvisioning from "../services/twoPhaseProvisioningService";
import { autoFixMissingHuntgroups, getFeatureFlag_UseOnlineSessionsRead } from '../v2/V2ServiceBridge';
import { generateCardsV2 } from "../db/generateCardsV2";
import { importCardsFromCsv, parseCsvCards } from "../db/importCardsFromCsv";
import { parseFileToRows, mapRowsToCards } from "../db/parseFileCards";
import { timezoneRepository } from "../domains/core/TimezoneRepository";
import { DEFAULT_SYSTEM_TIMEZONE, formatDateTimeInTimezone, resolveZonedRange } from "../core/TimezoneService";

export const getAdminStats = superAdminProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    
    // OPTIMIZED: All 7 queries run in parallel with Promise.all
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthISO = startOfMonth.toISOString();

    const [
      totalRevenueResult,
      pendingTransfersResult,
      totalBalanceResult,
      monthlyRevenueResult,
      activeUsersResult,
      newUsersResult,
      lowBalanceResult,
    ] = await Promise.all([
      // Total Revenue
      database
        .select({ total: sql<string>`COALESCE(SUM(CAST(${walletLedger.amount} AS DECIMAL(10,2))), 0)` })
        .from(walletLedger)
        .where(sql`${walletLedger.type} = 'credit'`),
      // Pending Bank Transfer Requests
      database
        .select({ count: sql<number>`COUNT(*)` })
        .from(sql`bank_transfer_requests`)
        .where(sql`status = 'pending'`),
      // Total System Balance
      database
        .select({ total: sql<string>`COALESCE(SUM(CAST(${wallets.balance} AS DECIMAL(10,2))), 0)` })
        .from(wallets),
      // Monthly Revenue
      database
        .select({ total: sql<string>`COALESCE(SUM(CAST(${walletLedger.amount} AS DECIMAL(10,2))), 0)` })
        .from(walletLedger)
        .where(and(
          sql`${walletLedger.type} = 'credit'`,
          sql`${walletLedger.createdAt} >= ${startOfMonthISO}`
        )),
      // Active Users (balance > 0)
      database
        .select({ count: sql<number>`COUNT(DISTINCT ${wallets.userId})` })
        .from(wallets)
        .where(sql`${wallets.balance} > 0`),
      // New Users This Month
      database
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(sql`${users.createdAt} >= ${startOfMonthISO}`),
      // Low Balance Accounts (< $5)
      database
        .select({ count: sql<number>`COUNT(*)` })
        .from(wallets)
        .where(sql`CAST(${wallets.balance} AS DECIMAL(10,2)) < 5.00`),
    ]);

    return {
      totalRevenue: totalRevenueResult[0]?.total || '0.00',
      pendingBankTransfers: pendingTransfersResult[0]?.count || 0,
      totalSystemBalance: totalBalanceResult[0]?.total || '0.00',
      monthlyRevenue: monthlyRevenueResult[0]?.total || '0.00',
      activeUsers: activeUsersResult[0]?.count || 0,
      expiringSoon: 0,
      newUsersThisMonth: newUsersResult[0]?.count || 0,
      lowBalanceAccounts: lowBalanceResult[0]?.count || 0,
    };
  });
  
  // Client Stats - للعميل فقط


export const getClientStats = protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    const userId = ctx.user.id;
    
    // Get tenant context and effective owner ID (handles client_admin/client_staff)
    const tenantContext = getTenantContext(ctx.user);
    const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
    const ownerTimezone = await timezoneRepository.getOwnerTimezone(effectiveOwnerId);
    const todayRange = resolveZonedRange('today', ownerTimezone);
    const lastSevenDaysRange = resolveZonedRange('last7', ownerTimezone);
    const accountingTodayStart = formatDateTimeInTimezone(todayRange.start, DEFAULT_SYSTEM_TIMEZONE);
    const accountingTodayEnd = formatDateTimeInTimezone(new Date(todayRange.end.getTime() + 1), DEFAULT_SYSTEM_TIMEZONE);
    const accountingSevenDaysStart = formatDateTimeInTimezone(lastSevenDaysRange.start, DEFAULT_SYSTEM_TIMEZONE);
    const accountingNow = formatDateTimeInTimezone(new Date(), DEFAULT_SYSTEM_TIMEZONE);
    
    // ── Phase 1: Run all independent queries in parallel ──────────────────
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysLaterStr = sevenDaysLater.toISOString().slice(0, 10);
    const now = new Date();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const firstDayLastMonthStr = firstDayLastMonth.toISOString().slice(0, 10);
    const lastDayLastMonthStr = lastDayLastMonth.toISOString().slice(0, 10);

    const [
      walletResult,
      nasDevices,
      lastDepositResult,
      bankTransferStats,
      unreadNotifications,
      lastBillingResult,
    ] = await Promise.all([
      // wallet
      database.select().from(wallets).where(eq(wallets.userId, effectiveOwnerId)).limit(1),
      // NAS devices
      nasDb.getNasDevicesByTenant(tenantContext),
      // last deposit
      database.select().from(walletLedger)
        .where(and(eq(walletLedger.userId, userId), sql`${walletLedger.type} = 'credit'`))
        .orderBy(desc(walletLedger.createdAt)).limit(1),
      // bank transfer stats
      database.select({ status: sql<string>`status`, count: sql<number>`COUNT(*)` })
        .from(sql`bank_transfer_requests`)
        .where(sql`userId = ${effectiveOwnerId}`)
        .groupBy(sql`status`),
      // unread notifications
      notificationDb.getUnreadCount(userId),
      // last billing
      database.select().from(walletLedger)
        .where(and(eq(walletLedger.userId, effectiveOwnerId), sql`${walletLedger.type} = 'billing'`))
        .orderBy(desc(walletLedger.createdAt)).limit(1),
    ]);

    const wallet = walletResult[0];
    const currentBalance = wallet?.balance || '0.00';
    const activeNasCount = nasDevices.length;
    const estimatedMonthlyCost = (activeNasCount * 15).toFixed(2);
    const dailyCost = activeNasCount * 0.50;
    const balanceNum = parseFloat(currentBalance);
    const balanceDuration = dailyCost > 0 ? Math.floor(balanceNum / dailyCost) : 999;
    const lastDeposit = lastDepositResult[0] || null;
    const bankTransferRequests = {
      pending: bankTransferStats.find((s: { status: string; count: number }) => s.status === 'pending')?.count || 0,
      approved: bankTransferStats.find((s: { status: string; count: number }) => s.status === 'approved')?.count || 0,
      rejected: bankTransferStats.find((s: { status: string; count: number }) => s.status === 'rejected')?.count || 0,
    };
    const lastBilling = lastBillingResult[0] || null;
    
    // ── Phase 2: Run remaining independent queries in parallel ──────────────────
    const [totalSpentResult, userCurrencyResult, sessionsResult, chartResult, todayDataResult, cardStatsResult, cardRevenueResult] = await Promise.all([
      // Total spent
      database.select({ total: sql<string>`COALESCE(SUM(ABS(CAST(${walletLedger.amount} AS DECIMAL(10,2)))), 0)` })
        .from(walletLedger)
        .where(and(eq(walletLedger.userId, effectiveOwnerId), sql`${walletLedger.type} = 'billing'`)),
      // User currency
      database.select({ preferredCurrency: users.preferredCurrency }).from(users)
        .where(eq(users.id, effectiveOwnerId)).limit(1),
      // Active sessions
      mikrotikApi.getActiveSessionsByOwner(effectiveOwnerId).catch(() => []),
      // Weekly chart
      database.execute(
        sql`SELECT DATE(r.acctstarttime) as day, COUNT(*) as cnt
            FROM radacct r INNER JOIN radius_cards c ON r.username = c.username
            WHERE c.createdBy = ${effectiveOwnerId}
              AND r.acctstarttime >= ${accountingSevenDaysStart}
              AND r.acctstarttime < ${accountingNow}
            GROUP BY DATE(r.acctstarttime)`
      ).catch(() => [[]] as any),
      // Today data usage
      database.execute(
        sql`SELECT COALESCE(SUM(r.acctinputoctets),0) as dl, COALESCE(SUM(r.acctoutputoctets),0) as ul
             FROM radacct r INNER JOIN radius_cards c ON r.username = c.username
             WHERE c.createdBy = ${effectiveOwnerId}
               AND r.acctstarttime >= ${accountingTodayStart}
               AND r.acctstarttime < ${accountingTodayEnd}`
      ).catch(() => [[]] as any),
      // V2: مصدر الحالة الموحد (Usage + Validity + stored status)
      voucherRepository.getDashboardLifecycleStats(effectiveOwnerId, ownerTimezone),
      database.execute(
        sql`SELECT
              COALESCE(SUM(CASE WHEN rc.status IN ('used','active','expired') THEN CAST(COALESCE(p.price,'0') AS DECIMAL(10,2)) ELSE 0 END), 0) as totalRev,
              COALESCE(SUM(CASE WHEN rc.status IN ('used','active','expired') AND DATE(rc.updatedAt) >= ${firstDayLastMonthStr} AND DATE(rc.updatedAt) <= ${lastDayLastMonthStr} THEN CAST(COALESCE(p.price,'0') AS DECIMAL(10,2)) ELSE 0 END), 0) as lastMonthRev
            FROM radius_cards rc
            LEFT JOIN plans p ON rc.planId = p.id
            WHERE rc.createdBy = ${effectiveOwnerId}`
      ).catch(() => [[]] as any),
    ]);

    const totalSpent = totalSpentResult[0]?.total || '0.00';
    const preferredCurrency = userCurrencyResult[0]?.preferredCurrency || 'USD';

    // Active Sessions
    let activeSessionsNow = 0;
    let nasStatusList: { nasName: string; nasIp: string; sessionCount: number; isOnline: boolean }[] = [];
    const sessions = sessionsResult as any[];
    activeSessionsNow = sessions.length;
    const sessionsByNas: Record<string, number> = {};
    for (const s of sessions) {
      const ip = s.nasIpAddress || (s as any).nasipaddress || 'unknown';
      sessionsByNas[ip] = (sessionsByNas[ip] || 0) + 1;
    }
    const nowMs = Date.now();
    nasStatusList = nasDevices.map((nas: any) => {
      const sessionCount = sessionsByNas[nas.nasname] || 0;
      const lastSeenMs = nas.lastSeen ? new Date(nas.lastSeen).getTime() : 0;
      const recentlySeen = lastSeenMs > 0 && (nowMs - lastSeenMs) < 10 * 60 * 1000;
      return {
        nasName: nas.shortname || nas.nasname || String(nas.id),
        nasIp: nas.nasname || String(nas.id),
        sessionCount,
        isOnline: sessionCount > 0 || recentlySeen || nas.status === 'active',
      };
    });

    // Weekly Chart
    const weeklyChart: { day: string; sessions: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weeklyChart.push({ day: d.toISOString().slice(0, 10), sessions: 0 });
    }
    const chartRows = ((chartResult as any)[0] || []) as any[];
    for (const row of chartRows) {
      try {
        let dayStr: string;
        if (row.day instanceof Date) dayStr = row.day.toISOString().slice(0, 10);
        else if (typeof row.day === 'string' && row.day.length >= 10) dayStr = row.day.slice(0, 10);
        else { const d = new Date(row.day); if (isNaN(d.getTime())) continue; dayStr = d.toISOString().slice(0, 10); }
        const idx = weeklyChart.findIndex(w => w.day === dayStr);
        if (idx !== -1) weeklyChart[idx].sessions = Number(row.cnt || 0);
      } catch (_) { /* skip */ }
    }

    // Today data
    const todayRows = ((todayDataResult as any)[0] || []) as any[];
    const todayDownloadBytes = Number(todayRows[0]?.dl || 0);
    const todayUploadBytes = Number(todayRows[0]?.ul || 0);

    // Card stats from single query
    const cs = cardStatsResult || {};
    const activeCardsCount = Number(cs.activeCards || 0);
    const cardsExpiredToday = Number(cs.expiredToday || 0);
    const expiringCardsCount = Number(cs.expiringCards || 0);
    const revenueRows = ((cardRevenueResult as any)[0] || []) as any[];
    const revenue = revenueRows[0] || {};
    const totalCardRevenue = String(revenue.totalRev || '0.00');
    const lastMonthCardRevenue = String(revenue.lastMonthRev || '0.00');

    // Cards logged in today (needs separate query - uses radacct JOIN)
    let cardsLoggedInToday = 0;
    try {
      const logResult = await database.execute(
        sql`SELECT COUNT(DISTINCT r.username) as cnt
             FROM radacct r INNER JOIN radius_cards c ON r.username = c.username
             WHERE c.createdBy = ${effectiveOwnerId}
               AND r.acctstarttime >= ${accountingTodayStart}
               AND r.acctstarttime < ${accountingTodayEnd}`
      );
      cardsLoggedInToday = Number(((logResult as any)[0] as any[])[0]?.cnt || 0);
    } catch (_) { /* ignore */ }
    
    return {
      currentBalance,
      activeNasCount,
      estimatedMonthlyCost,
      balanceDuration,
      lastDeposit,
      bankTransferRequests,
      unreadNotifications,
      lastBilling,
      totalSpent,
      activeSessionsNow,
      nasStatusList,
      weeklyChart,
      todayDownloadBytes,
      todayUploadBytes,
      totalCardRevenue,
      lastMonthCardRevenue,
      cardRevenueCurrency: preferredCurrency,
      cardsExpiredToday,
      cardsLoggedInToday,
      activeCardsCount,
      expiringCardsCount,
    };
  });
  
  // Enhanced Stats - للوحة الإحصائيات الجديدة


export const getEnhancedStats = protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    const tenantContext = getTenantContext(ctx.user);
    const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
    const ownerTimezone = await timezoneRepository.getOwnerTimezone(effectiveOwnerId);

    // Cache: 60s TTL for enhanced stats (heavy radacct queries)
    const enhancedCacheKey = cacheKeys.dashboardStats(effectiveOwnerId) + `:enhanced:${ownerTimezone}`;
    const cachedEnhanced = cache.get<any>(enhancedCacheKey);
    if (cachedEnhanced) return cachedEnhanced;

    // 1. Active sessions now — Phase 2C: online_sessions is the primary realtime source
    let activeSessionsNow = 0;
    let nasDataUsage: { nasName: string; nasIp: string; downloadBytes: number; uploadBytes: number; sessions: number }[] = [];
    let recentSessions: { username: string; nasName: string; duration: number; uploadBytes: number; downloadBytes: number; ip: string }[] = [];
    try {
      const isAdminUser2 = ctx.user.role === 'owner' || isAdmin(ctx.user.role);
      // V2: VoucherRepository.countActiveSessions + getNasUsageStats
      // online_sessions is always clean (stale cleanup every 30s)
      activeSessionsNow = await voucherRepository.countActiveSessions(
        isAdminUser2 ? undefined : effectiveOwnerId
      );
      const nasRows = await voucherRepository.getNasUsageStats(
        isAdminUser2 ? undefined : effectiveOwnerId
      );
      // NAS name lookup
      const nasDevicesResult = await database.execute(sql`SELECT nasname, shortname FROM nas`).catch(() => [[]]);
      const nasDevRows = (nasDevicesResult as any)[0] as any[];
      const nasNameMap: Record<string, string> = {};
      for (const nd of nasDevRows) nasNameMap[nd.nasname] = nd.shortname || nd.nasname;
      nasDataUsage = nasRows.map((r) => ({
        nasIp: r.nasIp,
        nasName: nasNameMap[r.nasIp] || r.nasIp || 'Unknown',
        sessions: r.sessions,
        downloadBytes: r.downloadBytes,
        uploadBytes: r.uploadBytes,
      }));
    } catch (e) { console.error('[getEnhancedStats] sessions error:', e); }

    // 2. Today's total data (from radacct)
    let todayDownloadBytes = 0;
    let todayUploadBytes = 0;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const isAdminUser = ctx.user.role === 'owner' || isAdmin(ctx.user.role);
      const todayDataResult = await database.execute(
        // Q2 optimized: use range (>= / <) instead of open-ended >= to enable index range scan
        isAdminUser
          ? sql`SELECT COALESCE(SUM(acctinputoctets),0) as dl, COALESCE(SUM(acctoutputoctets),0) as ul
               FROM radacct WHERE acctstarttime >= ${todayStart.toISOString().slice(0,10)} AND acctstarttime < ${new Date(todayStart.getTime() + 86400000).toISOString().slice(0,10)}`
          : sql`SELECT COALESCE(SUM(r.acctinputoctets),0) as dl, COALESCE(SUM(r.acctoutputoctets),0) as ul
               FROM radacct r
               INNER JOIN radius_cards c ON r.username = c.username
               WHERE c.createdBy = ${effectiveOwnerId}
                 AND r.acctstarttime >= ${todayStart.toISOString().slice(0,10)} AND r.acctstarttime < ${new Date(todayStart.getTime() + 86400000).toISOString().slice(0,10)}`
      );
      const todayRows = (todayDataResult as any)[0] as any[];
      if (todayRows[0]) {
        todayDownloadBytes = Number(todayRows[0].dl || 0);
        todayUploadBytes = Number(todayRows[0].ul || 0);
      }
    } catch (e) { console.error('[getEnhancedStats] todayData error:', e); }

    // 3. Active subscribers (PPPoE - from subscribers table)
    let activeSubscribersCount = 0;
    try {
      const isAdminUser = ctx.user.role === 'owner' || isAdmin(ctx.user.role);
      const subResult = await database.execute(
        isAdminUser
          ? sql`SELECT COUNT(*) as cnt FROM subscribers WHERE status = 'active'`
          : sql`SELECT COUNT(*) as cnt FROM subscribers WHERE status = 'active' AND createdBy = ${effectiveOwnerId}`
      );
      const subRows = (subResult as any)[0] as any[];
      activeSubscribersCount = Number(subRows[0]?.cnt || 0);
    } catch (e) { console.error('[getEnhancedStats] subscribers error:', e); }

    // 4. Monthly revenue
    const monthRange = resolveZonedRange('thisMonth', ownerTimezone);
    let monthlyRevenue = '0.00';
    try {
      const isAdminUser = ctx.user.role === 'owner' || isAdmin(ctx.user.role);
      const revResult = await database
        .select({ total: sql<string>`COALESCE(SUM(CAST(${walletLedger.amount} AS DECIMAL(10,2))), 0)` })
        .from(walletLedger)
        .where(
          isAdminUser
            ? and(sql`${walletLedger.type} = 'credit'`, sql`${walletLedger.createdAt} >= ${monthRange.start.toISOString()}`)
            : and(sql`${walletLedger.type} = 'credit'`, sql`${walletLedger.createdAt} >= ${monthRange.start.toISOString()}`, eq(walletLedger.userId, effectiveOwnerId))
        );
      monthlyRevenue = revResult[0]?.total || '0.00';
    } catch (e) { console.error('[getEnhancedStats] monthlyRevenue error:', e); }

    // 5. Weekly sessions chart (last 7 days) - cards + subscribers
    const weeklyChart: { day: string; sessions: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weeklyChart.push({ day: d.toISOString().slice(0, 10), sessions: 0 });
    }
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      const isAdminUser = ctx.user.role === 'owner' || isAdmin(ctx.user.role);
      const chartResult = await database.execute(
        // Q-weekly optimized: add upper bound for range scan
        isAdminUser
          ? sql`SELECT DATE(acctstarttime) as day, COUNT(*) as cnt FROM radacct
               WHERE acctstarttime >= ${sevenDaysAgo.toISOString().slice(0,10)} AND acctstarttime < ${new Date(new Date().setHours(23,59,59,999)).toISOString().slice(0,10)}
               GROUP BY DATE(acctstarttime)`
          : sql`SELECT DATE(r.acctstarttime) as day, COUNT(*) as cnt
               FROM radacct r
               INNER JOIN radius_cards c ON r.username = c.username
               WHERE c.createdBy = ${effectiveOwnerId}
                 AND r.acctstarttime >= ${sevenDaysAgo.toISOString().slice(0,10)} AND r.acctstarttime < ${new Date(new Date().setHours(23,59,59,999)).toISOString().slice(0,10)}
               GROUP BY DATE(r.acctstarttime)`
      );
      const chartRows = (chartResult as any)[0] as any[];
      for (const row of chartRows) {
        try {
          let dayStr: string;
          if (row.day instanceof Date) {
            dayStr = row.day.toISOString().slice(0, 10);
          } else if (typeof row.day === 'string' && row.day.length >= 10) {
            dayStr = row.day.slice(0, 10);
          } else {
            const d = new Date(row.day);
            if (isNaN(d.getTime())) continue;
            dayStr = d.toISOString().slice(0, 10);
          }
          const idx = weeklyChart.findIndex(w => w.day === dayStr);
          if (idx !== -1) weeklyChart[idx].sessions = Number(row.cnt || 0);
        } catch (_) { /* skip invalid date rows */ }
      }
    } catch (e) { console.error('[getEnhancedStats] weeklyChart error:', e); }

    const enhancedResult = {
      activeSessionsNow,
      todayDownloadBytes,
      todayUploadBytes,
      activeSubscribersCount,
      monthlyRevenue,
      weeklyChart,
      nasDataUsage,
      recentSessions,
    };
    // Store in cache for 60s to avoid repeated heavy radacct queries
    cache.set(enhancedCacheKey, enhancedResult, cacheTTL.dashboardStats);
    return enhancedResult;
  });

  // Keep existing getStats for backward compatibility


export const getStats = protectedProcedure.query(async ({ ctx }) => {
    // Owner/Super Admin Dashboard
    if (ctx.user.role === 'owner' || isAdmin(ctx.user.role)) {
      // Super admin sees all stats
      const activeSessionsCount = await subscriptionDb.getActiveSessionsCount();
      const allNasDevices = await nasDb.getAllNasDevices();
      const allBatches = await cardDb.getAllBatchesWithStats();
      const totalCards = allBatches.reduce((sum: number, b: any) => sum + (b.stats?.total || 0), 0);
      const usedCards = allBatches.reduce((sum: number, b: any) => sum + (b.stats?.used || 0), 0);
      
      return {
        totalUsers: 0,
        totalResellers: 0,
        totalClients: 0,
        activeSubscriptions: 0,
        totalRevenue: "0.00",
        pendingInvoices: 0,
        activeSessions: activeSessionsCount,
        openTickets: 0,
        totalNasDevices: allNasDevices.length,
        totalCards,
        usedCards,
      };
    }
    
    // Client Owner Dashboard (with sub-admins)
    else if (ctx.user.role === 'client_owner') {
      const tenantContext = getTenantContext(ctx.user);
      const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
      const database = await getDb();
      const ownerTimezone = await timezoneRepository.getOwnerTimezone(effectiveOwnerId);
      const todayRange = resolveZonedRange('today', ownerTimezone);
      const weekRange = resolveZonedRange('last7', ownerTimezone);

      // OPTIMIZED: Run all queries in parallel
      const [staffMembers, nasDevices, batches, cardsUsedToday, cardsUsedThisWeek, walletRows] = await Promise.all([
        // Staff count
        database.select({ count: sql<number>`count(*)` }).from(users).where(
          and(eq(users.tenantId, effectiveOwnerId), sql`${users.role} IN ('client_admin', 'client_staff')`)
        ),
        // NAS devices
        nasDb.getNasDevicesByTenant(tenantContext),
        // Batches with stats
        cardDb.getBatchesByTenantWithStats(tenantContext),
        // Cards used today
        database.select({ count: sql<number>`count(*)` }).from(radiusCards).where(
          and(eq(radiusCards.createdBy, effectiveOwnerId),
            sql`${radiusCards.firstUseAt} IS NOT NULL AND ${radiusCards.firstUseAt} >= ${todayRange.start.toISOString()}`)
        ),
        // Cards used this week
        database.select({ count: sql<number>`count(*)` }).from(radiusCards).where(
          and(eq(radiusCards.createdBy, effectiveOwnerId),
            sql`${radiusCards.firstUseAt} IS NOT NULL AND ${radiusCards.firstUseAt} >= ${weekRange.start.toISOString()}`)
        ),
        // Wallet balance
        database.select().from(wallets).where(eq(wallets.userId, ctx.user.id)),
      ]);

      const totalCards = batches.reduce((sum: number, b: any) => sum + (b.stats?.total || 0), 0);
      const usedCards = batches.reduce((sum: number, b: any) => sum + (b.stats?.used || 0), 0);

      return {
        totalStaff: staffMembers[0]?.count || 0,
        activeNasCount: nasDevices.length,
        totalCards,
        usedCards,
        cardsUsedToday: cardsUsedToday[0]?.count || 0,
        cardsUsedThisWeek: cardsUsedThisWeek[0]?.count || 0,
        walletBalance: walletRows[0]?.balance || "0.00",
        creditBalance: walletRows[0]?.creditBalance || "0.00",
        pendingInvoices: 0,
      };
    }
    
    // Client/Reseller/Staff sees only their own stats
    else {
      const tenantContext = getTenantContext(ctx.user);
      const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
      const database = await getDb();

      // M-14 fix: Cache dashboard stats for 60s to avoid repeated heavy queries
      const statsCacheKey = cacheKeys.dashboardStats(effectiveOwnerId);
      const cachedStats = cache.get<any>(statsCacheKey);
      if (cachedStats) return cachedStats;

      // M-16/M-10 fix: use getActiveSessionsByOwner — queries only sessions for this owner
      // instead of fetching ALL sessions globally and filtering in JS (O(n) memory leak).
      const [ownerNasDevices, ownerBatches, walletRows, ownerSessions] = await Promise.all([
        nasDb.getNasDevicesByTenant(tenantContext),
        cardDb.getBatchesByTenantWithStats(tenantContext),
        database.select().from(wallets).where(eq(wallets.userId, ctx.user.id)),
        mikrotikApi.getActiveSessionsByOwner(effectiveOwnerId).catch(() => [] as any[]),
      ]);

      const totalCards = ownerBatches.reduce((sum: number, b: any) => sum + (b.stats?.total || 0), 0);
      const usedCards = ownerBatches.reduce((sum: number, b: any) => sum + (b.stats?.used || 0), 0);

      const statsResult = {
        totalNasDevices: ownerNasDevices.length,
        activeSessions: ownerSessions.length,
        totalCards,
        usedCards,
        walletBalance: walletRows[0]?.balance || "0.00",
        creditBalance: walletRows[0]?.creditBalance || "0.00",
        pendingInvoices: 0,
      };
      // M-14 fix: store in cache for 60s
      cache.set(statsCacheKey, statsResult, cacheTTL.dashboardStats);
      return statsResult;
    }
  });


import { router as _router } from "../_core/trpc";
import { isAdmin } from "../_core/roles";

// Local helper (mirrors the one in routers.ts)

export const dashboardRouter = _router({
  getAdminStats,
  getClientStats,
  getEnhancedStats,
  getStats,
});
