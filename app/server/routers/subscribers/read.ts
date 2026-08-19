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
import { fixVpsDate } from "@shared/vpsDate";
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

// Local helper (mirrors the one in routers.ts)
function hasEffectiveSubscriberOwnership(user: any, subscriber: { ownerId: number | null; createdBy: number | null }): boolean {
  if (isAdmin(user.role)) return true;
  const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(user));
  return subscriber.ownerId === effectiveOwnerId || subscriber.createdBy === effectiveOwnerId;
}


export const list = resellerProcedure.query(async ({ ctx }) => {
    const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
    const subscribers = await db.getSubscribersByOwner(effectiveOwnerId);
    const stats = await db.getSubscriberStats(effectiveOwnerId);
    return { subscribers, stats };
  });

  // Get single subscriber


export const get = resellerProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      }
      // Check ownership
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (subscriber.subscriber.ownerId !== effectiveOwnerId && subscriber.subscriber.createdBy !== effectiveOwnerId && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }
      return subscriber;
    });

  // Create new subscriber


export const history = resellerProcedure
    .input(z.object({ subscriberId: z.number() }))
    .query(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.subscriberId);
      if (!subscriber) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      }
      // Check ownership
      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      if (subscriber.subscriber.ownerId !== effectiveOwnerId && subscriber.subscriber.createdBy !== effectiveOwnerId && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }

      return db.getSubscriptionHistory(input.subscriberId);
    });

  // Delete subscriber


export const getActiveSession = resellerProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const sessions = await sessionRepository.findByUsername(input.username);
      const active = sessions[0];
      if (!active) return null;
      return {
        acctSessionId: active.acctSessionId,
        framedIpAddress: active.framedIpAddress,
        startTime: active.startTime,
        nasIp: active.nasIp,
        sessionTime: active.sessionTime,
        inputOctets: active.inputOctets,
        outputOctets: active.outputOctets,
        callingStationId: active.callingStationId,
        // Legacy-shaped DTO aliases retained for existing detail and drawer UI.
        // All values still come exclusively from online_sessions.
        framedipaddress: active.framedIpAddress,
        acctstarttime: active.startTime,
        nasipaddress: active.nasIp,
        acctsessiontime: active.sessionTime,
        acctinputoctets: active.inputOctets,
        acctoutputoctets: active.outputOctets,
        callingstationid: active.callingStationId,
        nasporttype: 'PPPoE',
        servicetype: 'Framed-User',
      };
    });

  // Get subscriber credentials (username + password from radcheck)


export const getCredentials = resellerProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      if (!hasEffectiveSubscriberOwnership(ctx.user, subscriber.subscriber)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }
      const username = subscriber.subscriber.username;
      // Fetch password from radcheck
      const drizzleDb = await getDb();
      let password = '';
      if (drizzleDb) {
        const [passwordRow] = await drizzleDb
          .select({ value: radcheck.value })
          .from(radcheck)
          .where(and(eq(radcheck.username, username), eq(radcheck.attribute, 'Cleartext-Password')))
          .limit(1);
        password = passwordRow?.value || '';
      }
      return { username, password };
    });

    // Get session history for a subscriber
export const getSessions = resellerProcedure
    .input(z.object({ username: z.string(), limit: z.number().min(1).max(100).optional() }))
    .query(async ({ input }) => {
      const sessions = await subscriptionDb.getSessionsByUsername(input.username);
      return sessions.slice(0, input.limit || 20).map((s: any) => ({
        ...s,
        acctstarttime: s.acctstarttime ? fixVpsDate(s.acctstarttime) : null,
        acctstoptime: s.acctstoptime ? fixVpsDate(s.acctstoptime) : null,
      }));
    });

  // Get payment/renewal history for a subscriber


export const checkUsername = resellerProcedure
    .input(z.object({ username: z.string().min(1) }))
    .query(async ({ input }) => {
      const exists = await db.subscriberUsernameExists(input.username.trim());
      return { available: !exists };
    });

export const getPaymentHistory = resellerProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.id);
      if (!subscriber) throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      if (!hasEffectiveSubscriberOwnership(ctx.user, subscriber.subscriber)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }
      return db.getSubscriptionHistory(input.id);
    });


// Get activity/audit log for a subscriber
export const getActivityLog = resellerProcedure
    .input(z.object({ subscriberId: z.number(), limit: z.number().min(1).max(200).optional() }))
    .query(async ({ input, ctx }) => {
      const subscriber = await db.getSubscriberById(input.subscriberId);
      if (!subscriber) throw new TRPCError({ code: 'NOT_FOUND', message: 'المشترك غير موجود' });
      if (!hasEffectiveSubscriberOwnership(ctx.user, subscriber.subscriber)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'غير مصرح' });
      }
      const { getAuditLogs } = await import("../../services/auditLogService");
      const logs = await getAuditLogs({
        targetType: 'subscriber',
        limit: input.limit || 50,
      });
      // Filter by subscriber username or id
      const username = subscriber.subscriber.username;
      const subId = String(input.subscriberId);
      return logs.filter((l: any) =>
        l.targetId === username || l.targetId === subId || l.targetName === username
      );
    });
