import { protectedProcedure, publicProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../../db";
import * as walletDb from "../../db/wallet";
import * as planDb from "../../db/plans";
import * as nasDb from "../../db/nas";
import * as cardDb from "../../db/vouchers";
import { voucherRepository } from '../../domains/vouchers/repositories/VoucherRepository';
import { sessionRepository } from '../../domains/accounting/repositories/SessionRepository';
import { accountingRepository } from '../../domains/accounting/repositories/AccountingRepository';
import * as invoiceDb from "../../db/invoices";
import * as subscriptionDb from "../../db/subscriptions";
import * as notificationDb from "../../db/notifications";
import * as templateDb from "../../db/cardTemplates";
import * as radiusSubscribers from "../../db/radiusSubscribers";
import * as vpnApi from "../../services/vpnApiService";
import * as accountingService from "../../services/accountingService";
import { isLiveSessionFromV2, isOpenAccountingWithoutLiveSession } from "../../domains/accounting/CardCheckLiveSessionPolicy";
import * as sessionMonitor from "../../services/sessionMonitor";
import * as coaService from "../../services/coaService";
import * as multiChannelNotification from "../../services/multiChannelNotificationService";
import * as tweetsmsService from "../../services/tweetsmsService";
import * as smsDb from "../../db/sms";
import { fixVpsDate, fixVpsDateObj } from "@shared/vpsDate";
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


export const list = protectedProcedure.query(async ({ ctx }) => {
    const ownerId = isAdmin(ctx.user.role) ? null : ctx.user.id;
    return sessionRepository.findActiveViews(ownerId);
  });

  // List sessions filtered by a specific client (super_admin only)
export const listByClient = superAdminProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      return sessionRepository.findActiveViews(input.clientId);
    });

  // Get sessions by username - filter by owner's NAS
export const getByUsername = protectedProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const sessions = await sessionRepository.findByUsername(input.username);
      if (isAdmin(ctx.user.role)) return sessions;
      const ownerNasDevices = await nasDb.getNasDevicesByOwner(ctx.user.id);
      const ownerNasIps = ownerNasDevices.map((n: any) => n.nasname);
      return sessions.filter((s: any) => ownerNasIps.includes(s.nasIp));
    });

  // Get sessions by NAS - check ownership
export const getByNas = protectedProcedure
    .input(z.object({ nasIp: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasByIp(input.nasIp);
      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS not found" });
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return (await sessionRepository.findAll()).filter((session) => session.nasIp === input.nasIp);
    });

  // CoA Disconnect session (direct CoA call)
export const getVpnSessions = superAdminProcedure.query(async () => {
    return vpnApi.getVpnSessions();
  });

  // Disconnect VPN session
export const getStats = superAdminProcedure.query(async () => {
    return sessionRepository.getActiveStats();
  });

  // Generate MikroTik configuration script
export const getUserUsage = protectedProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check card ownership for non-admins
      if (!isAdmin(ctx.user.role)) {
        const card = await voucherRepository.findByUsername(input.username);
        if (!card || (card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }
      return accountingService.getUserUsageStats(input.username);
    });

  // Get time balance for a user/card
export const getTimeBalance = protectedProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check card ownership for non-admins
      if (!isAdmin(ctx.user.role)) {
        const card = await voucherRepository.findByUsername(input.username);
        if (!card || (card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }
      const balance = await accountingService.getTimeBalance(input.username);
      if (!balance) return null;
      
      return {
        ...balance,
        allocatedTimeFormatted: accountingService.formatTime((balance as any).allocatedTime || 0),
        usedTimeFormatted: accountingService.formatTime((balance as any).usedTime || 0),
        remainingTimeFormatted: accountingService.formatTime((balance as any).remainingTime || 0),
      };
    });

  // Full card lookup - all info in one query
// Converts a Drizzle Date object to ISO UTC string.
// MySQL stores Palestine local time. With dateStrings:true + timezone:'local', mysql2 returns
// strings like "2026-06-04 12:59:22". But Drizzle ORM converts them to Date objects using
// new Date("...Z") — treating Palestine local as UTC. So d.getUTCHours()=12 (actually Palestine).
// We must send the string WITHOUT 'Z' so frontend parseDbDate treats it as Palestine local
// and correctly appends +03:00 before display.
function drizzleDateToStr(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d;
  // Strip T and Z: "2026-06-04T12:59:22.000Z" → "2026-06-04 12:59:22" (Palestine local)
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

export const getCardLookup = protectedProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

      // Find card
      const card = await voucherRepository.findByUsername(input.username);
      if (!card) return null;

      // Check ownership for non-admins
      if (!isAdmin(ctx.user.role)) {
        if (card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }

      // Online sessions are the V2 source of truth for live control actions.
      const activeSessions = card.lifecycleId
        ? await sessionRepository.findByLifecycleId(card.lifecycleId)
        : await sessionRepository.findByUsername(input.username);
      const liveSessionIds = new Set(activeSessions.map((session) => session.acctSessionId));

      const lifecycleAudit = card.lifecycleId
        ? await accountingRepository.getLifecycleAuditSnapshot(card.lifecycleId)
        : { history: [], closedInputOctets: 0, closedOutputOctets: 0, closedSessionCount: 0 };
      const sessions = lifecycleAudit.history;

      const activeSessionTime = activeSessions.reduce((total, session) => total + Math.max(0, Number(session.sessionTime ?? 0)), 0);
      const activeInputOctets = activeSessions.reduce((total, session) => total + (Number(session.inputOctets ?? 0) || 0), 0);
      const activeOutputOctets = activeSessions.reduce((total, session) => total + (Number(session.outputOctets ?? 0) || 0), 0);
      const usageBudgetSeconds = Number(card.usageBudgetSeconds ?? 0);
      const usedTime = Math.min(Math.max(0, Number(card.totalSessionTime ?? 0) + activeSessionTime), usageBudgetSeconds || Number.MAX_SAFE_INTEGER);
      const remainingUsageTime = usageBudgetSeconds > 0 ? Math.max(0, usageBudgetSeconds - usedTime) : 0;
      const now = Date.now();
      const windowEndTime = card.windowEndTime;
      const windowRemainingSeconds = windowEndTime ? Math.max(0, Math.floor((new Date(windowEndTime).getTime() - now) / 1000)) : Number(card.windowSeconds ?? 0);
      const balance = {
        usageBudgetSeconds,
        usageBudgetFormatted: accountingService.formatTime(usageBudgetSeconds),
        usedTime,
        usedTimeFormatted: accountingService.formatTime(usedTime),
        remainingUsageTime,
        remainingUsageTimeFormatted: accountingService.formatTime(remainingUsageTime),
        windowRemainingSeconds,
        windowRemainingFormatted: accountingService.formatTime(windowRemainingSeconds),
        isExpired: card.status === 'expired' || (windowEndTime ? new Date(windowEndTime).getTime() <= now : false),
        expirationReason: card.status === 'expired' ? 'card_status' : null,
        windowEndTime,
      };

      // Build MAC address summary
      const macSummaryMap = new Map<string, { count: number; lastSeen: Date | null }>();
      for (const s of sessions) {
        if (s.callingStationId) {
          const mac = s.callingStationId.toUpperCase();
          const existing = macSummaryMap.get(mac);
          const t = s.startTime ? new Date(s.startTime) : null;
          if (!existing) {
            macSummaryMap.set(mac, { count: 1, lastSeen: t });
          } else {
            existing.count++;
            if (t && (!existing.lastSeen || t > existing.lastSeen)) existing.lastSeen = t;
          }
        }
      }
      const macAddresses = Array.from(macSummaryMap.entries()).map(([mac, info]) => ({
        mac,
        sessionCount: info.count,
        lastSeen: drizzleDateToStr(info.lastSeen as any),
      })).sort((a, b) => b.sessionCount - a.sessionCount);

      // Fetch plan info for this card
      let planInfo: { id: number; name: string; mikrotikRateLimit: string | null } | null = null;
      if (card.planId) {
        const planRow = await db.select({
          id: plans.id,
          name: plans.name,
          mikrotikRateLimit: plans.mikrotikRateLimit,
        }).from(plans).where(eq(plans.id, card.planId)).limit(1);
        if (planRow[0]) planInfo = planRow[0];
      }

      const apiOut = {
        card: {
          id: card.id,
          username: card.username,
          password: card.password,
          serialNumber: card.serialNumber,
          status: card.status,
          planId: card.planId,
          planName: planInfo?.name ?? null,
          mikrotikRateLimit: planInfo?.mikrotikRateLimit ?? null,
          createdAt: drizzleDateToStr(card.createdAt as any),
          firstUseAt: drizzleDateToStr(card.firstUseAt as any),
          windowEndTime: drizzleDateToStr(card.windowEndTime as any),
          windowSeconds: card.windowSeconds ?? 0,
          usageBudgetSeconds: card.usageBudgetSeconds ?? 0,
          expiresAt: drizzleDateToStr(card.expiresAt as any),
          isManual: Boolean(card.isManual),
          batchId: card.batchId,
        },
        usage: {
          totalUsedTime: usedTime,
          totalUsedTimeFormatted: accountingService.formatTime(usedTime),
          totalInputOctets: lifecycleAudit.closedInputOctets + activeInputOctets,
          totalOutputOctets: lifecycleAudit.closedOutputOctets + activeOutputOctets,
          totalInputFormatted: accountingService.formatBytes(lifecycleAudit.closedInputOctets + activeInputOctets),
          totalOutputFormatted: accountingService.formatBytes(lifecycleAudit.closedOutputOctets + activeOutputOctets),
          sessionCount: lifecycleAudit.closedSessionCount,
          hasActiveSession: activeSessions.length > 0,
        },
        balance: {
          usageBudgetSeconds: balance.usageBudgetSeconds,
          usageBudgetFormatted: accountingService.formatTime(balance.usageBudgetSeconds),
          usedTime: balance.usedTime,
          usedTimeFormatted: accountingService.formatTime(balance.usedTime),
          remainingUsageTime: balance.remainingUsageTime,
          remainingUsageTimeFormatted: accountingService.formatTime(balance.remainingUsageTime),
          windowRemainingSeconds: balance.windowRemainingSeconds,
          windowRemainingFormatted: accountingService.formatTime(balance.windowRemainingSeconds),
          isExpired: balance.isExpired,
          expirationReason: balance.expirationReason,
          windowEndTime: drizzleDateToStr(balance.windowEndTime as any),
        },
        activeSessions: activeSessions.map((session) => ({
          sessionId: session.acctSessionId,
          acctUniqueId: session.acctUniqueId ?? null,
          nasIp: session.nasIp ?? null,
          framedIpAddress: session.framedIpAddress ?? null,
          startTime: drizzleDateToStr(session.startTime as any),
          sessionTime: Number(session.sessionTime ?? 0),
        })),
        sessions: sessions.map((s: typeof sessions[0]) => ({
          ...s,
          isLiveSession: isLiveSessionFromV2(s.acctSessionId, liveSessionIds),
          isAccountingOpenWithoutLiveSession: isOpenAccountingWithoutLiveSession(
            s.stopTime,
            s.acctSessionId,
            liveSessionIds,
          ),
          // drizzleDateToStr: converts Drizzle Date (Palestine time as UTC) to +03:00 string
          startTime: drizzleDateToStr(s.startTime as any),
          stopTime: drizzleDateToStr(s.stopTime as any),
          sessionTimeFormatted: accountingService.formatTime(Number(s.sessionTime) || 0),
          downloadFormatted: accountingService.formatBytes(Number(s.outputOctets) || 0),
          uploadFormatted: accountingService.formatBytes(Number(s.inputOctets) || 0),
        })),
        macAddresses,
      };

      return apiOut;
    });

  // Get users with low remaining time
export const getLowTimeUsers = superAdminProcedure
    .input(z.object({ thresholdMinutes: z.number().default(30) }).optional())
    .query(async ({ input }) => {
      const threshold = input?.thresholdMinutes || 30;
      const users = await accountingService.getUsersWithLowTime(threshold);
      return users.map((u: any) => ({
        ...u,
        remainingTimeFormatted: accountingService.formatTime(u.remainingTime || 0),
      }));
    });

  // Check and disconnect expired users
export const checkExpiredUsers = superAdminProcedure
    .mutation(async () => {
      return accountingService.checkAndDisconnectExpiredUsers();
    });

  // Update session timeout for a user based on remaining time
export const monitorStatus = superAdminProcedure
    .query(async () => {
      return sessionMonitor.getMonitorStatus();
    });

  // Manually trigger a session check (delegates to centralAccountingService)
export const mikrotikGetActiveUsers = protectedProcedure
    .input(z.object({ nasIp: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasByIp(input.nasIp);
      if (!nas) {
        throw new TRPCError({ code: "NOT_FOUND", message: "NAS not found" });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this NAS" });
      }
      
      return mikrotikApi.getActiveUsersViaMikroTikApi(input.nasIp);
    });

  // Bulk disconnect multiple sessions at once
export const checkUserTimeStatus = protectedProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check card ownership
      if (!isAdmin(ctx.user.role)) {
        const card = await voucherRepository.findByUsername(input.username);
        if (card && card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }
      
      const status = await sessionMonitor.checkUserTimeStatus(input.username);
      if (!status) {
        return null;
      }
      
      return {
        ...status,
        maxAllSessionFormatted: status.maxAllSession > 0 
          ? accountingService.formatTime(status.maxAllSession) 
          : 'غير محدود',
        totalUsedTimeFormatted: accountingService.formatTime(status.totalUsedTime),
        remainingInternetTimeFormatted: status.remainingInternetTime >= 0 
          ? accountingService.formatTime(status.remainingInternetTime) 
          : 'غير محدود',
        expirationDateFormatted: status.expirationDate 
          ? new Intl.DateTimeFormat('ar-PS', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(status.expirationDate))
          : 'غير محدد',
      };
    });

// ============================================================================
// CARD TEMPLATES ROUTER
// ============================================================================
