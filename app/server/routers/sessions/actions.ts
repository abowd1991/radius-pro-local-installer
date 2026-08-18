import { protectedProcedure, publicProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../../db";
import * as walletDb from "../../db/wallet";
import * as planDb from "../../db/plans";
import * as nasDb from "../../db/nas";
import * as cardDb from "../../db/vouchers";
import { voucherRepository } from '../../domains/vouchers/repositories/VoucherRepository';
import * as invoiceDb from "../../db/invoices";
import * as subscriptionDb from "../../db/subscriptions";
import * as notificationDb from "../../db/notifications";
import * as templateDb from "../../db/cardTemplates";
import * as radiusSubscribers from "../../db/radiusSubscribers";
import * as vpnApi from "../../services/vpnApiService";
import * as accountingService from "../../services/accountingService";
import * as sessionMonitor from "../../services/sessionMonitor";
import * as coaService from "../../services/coaService";
import { coaEngine } from '../../domains/radius/CoAEngine';
import { sessionEngine } from '../../domains/accounting/SessionEngine';
import { nasRepository } from '../../domains/radius/repositories/NasRepository';
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


export const coaDisconnect = protectedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await sessionEngine.getActiveSessionForControl(input.sessionId);
      if (!session) {
        return { success: true, idempotent: true, message: 'Session already closed' };
      }
      if (!session.nasIp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Session NAS not found' });
      const nas = await nasRepository.findByIp(session.nasIp);
      if (!nas) throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const result = await coaEngine.disconnectSession(session.username, session.nasIp, session.acctSessionId, session.framedIpAddress ?? undefined);
      if ((result as any).error === 'COA_003') {
        return { success: true, idempotent: true, message: 'Disconnect already requested' };
      }
      return result;
    });

  // Disconnect session - check NAS ownership
export const disconnect = protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      nasIp: z.string(),
      username: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasByIp(input.nasIp);
      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS not found" });
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      // Use CoA service for disconnect
      return coaEngine.disconnectSession(input.username, input.nasIp, input.sessionId);
    });

  // Disconnect user - check card ownership
export const disconnectUser = protectedProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if user owns the card — reject if card not found or belongs to another tenant
      if (!isAdmin(ctx.user.role)) {
        const card = await voucherRepository.findByUsername(input.username);
        if (!card) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        if (card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }
      // Disconnect from RADIUS (MikroTik sessions) using CoA
      const radiusResult = await coaEngine.disconnectAllSessions(input.username);
      
      // Also disconnect from VPN (SoftEther sessions)
      try {
        await vpnApi.disconnectVpnSession(input.username);
      } catch (error) {
        console.error('Failed to disconnect VPN session:', error);
      }
      
      return radiusResult;
    });

  // Get VPN sessions
export const disconnectVpnSession = superAdminProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ input }) => {
      return vpnApi.disconnectVpnSession(input.username);
    });

export const coaDisconnectUser = protectedProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check card ownership
      const card = await voucherRepository.findByUsername(input.username);
      if (!card) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      if (!isAdmin(ctx.user.role) && card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this user" });
      }
      
      const result = await coaEngine.disconnectAllSessions(input.username);
      
      // Log audit
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'session_disconnect_coa',
        targetType: 'session',
        targetId: input.username,
        targetName: input.username,
        details: { allSessions: true },
        result: result.success ? 'success' : 'failure',
        errorMessage: result.success ? undefined : result.error,
      });
      
      return result;
    });

  // Update session attributes (speed, timeout) using CoA
export const coaUpdateSession = protectedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      downloadSpeed: z.number().optional(),
      uploadSpeed: z.number().optional(),
      sessionTimeout: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await sessionEngine.getActiveSessionForControl(input.sessionId);
      if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Active session not found' });
      if (!session.nasIp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Session NAS not found' });
      const nas = await nasRepository.findByIp(session.nasIp);
      if (!nas) {
        throw new TRPCError({ code: "NOT_FOUND", message: "NAS not found" });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this NAS" });
      }
      
      let rateLimit: string | undefined;
      if (input.downloadSpeed && input.uploadSpeed) {
        rateLimit = await voucherRepository.updateMikrotikRateLimitInRadreply(session.username, input.uploadSpeed, input.downloadSpeed);
      }
      const result = await coaEngine.updateSessionAttributes(
        session.username,
        session.nasIp,
        session.acctSessionId,
        session.framedIpAddress ?? undefined,
        {
          downloadSpeed: input.downloadSpeed,
          uploadSpeed: input.uploadSpeed,
          sessionTimeout: input.sessionTimeout,
        }
      );
      
      // Log audit
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'speed_change_coa',
        targetType: 'session',
        targetId: session.acctSessionId,
        targetName: session.username,
        nasId: nas.id,
        nasIp: session.nasIp,
        details: { downloadSpeed: input.downloadSpeed, uploadSpeed: input.uploadSpeed, sessionTimeout: input.sessionTimeout, rateLimit },
        result: result.success ? 'success' : 'failure',
        errorMessage: result.success ? undefined : result.error,
      });
      
      return result;
    });

  // Change user speed with fallback to disconnect
export const changeUserSpeed = protectedProcedure
    .input(z.object({
      username: z.string(),
      uploadSpeedMbps: z.number(),
      downloadSpeedMbps: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check card ownership
      const card = await voucherRepository.findByUsername(input.username);
      if (!card) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      if (!isAdmin(ctx.user.role) && card.createdBy !== ctx.user.id && card.resellerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this user" });
      }
      
      const result = await coaEngine.changeUserSpeed(
        input.username,
        input.uploadSpeedMbps,
        input.downloadSpeedMbps
      );
      
      // Log audit
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'speed_change',
        targetType: 'session',
        targetId: input.username,
        targetName: input.username,
        details: { uploadSpeedMbps: input.uploadSpeedMbps, downloadSpeedMbps: input.downloadSpeedMbps },
        result: result.success ? 'success' : 'failure',
        errorMessage: result.success ? undefined : result.error,
      });
      
      return result;
    });



  // ============================================
  // Accounting Endpoints
  // ============================================
  
  // Get usage statistics for a user
export const updateUserTimeout = superAdminProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ input }) => {
      const success = await accountingService.updateSessionTimeout(input.username);
      return { success };
    });

  // ============================================
  // Session Monitor Endpoints
  // ============================================
  
  // Get session monitor status (delegates to centralAccountingService)
export const bulkDisconnect = protectedProcedure
    .input(z.object({
      sessions: z.array(z.object({
        username: z.string(),
        nasIp: z.string(),
        sessionId: z.string(),
        framedIp: z.string().optional(),
      }))
    }))
    .mutation(async ({ ctx, input }) => {
      const results: { username: string; success: boolean; error?: string }[] = [];
      
      for (const session of input.sessions) {
        try {
          // Check NAS ownership
          const nas = await nasDb.getNasByIp(session.nasIp);
          if (!nas) {
            results.push({ username: session.username, success: false, error: 'NAS not found' });
            continue;
          }
          if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
            results.push({ username: session.username, success: false, error: 'Access denied' });
            continue;
          }
          
          const result = await coaEngine.disconnectSession(
            session.username,
            session.nasIp,
            session.sessionId,
            session.framedIp
          );
          results.push({ username: session.username, success: result.success, error: result.error });
        } catch (err: any) {
          results.push({ username: session.username, success: false, error: err.message });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      return { results, successCount, totalCount: input.sessions.length };
    });

  // Check user time status (Max-All-Session + Expiration)
export const mikrotikChangeSpeed = protectedProcedure
    .input(z.object({
      nasIp: z.string(),
      username: z.string(),
      uploadSpeedKbps: z.number(),
      downloadSpeedKbps: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasByIp(input.nasIp);
      if (!nas) {
        throw new TRPCError({ code: "NOT_FOUND", message: "NAS not found" });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this NAS" });
      }
      
      // Try MikroTik API first (only if API credentials are configured)
      let method = 'coa';
      let result: any = { success: false, error: 'Not attempted' };
      
      if (nas.apiEnabled && nas.mikrotikApiUser && nas.mikrotikApiPassword) {
        result = await mikrotikApi.changeUserSpeedViaMikroTikApi(
          input.nasIp,
          input.username,
          input.uploadSpeedKbps,
          input.downloadSpeedKbps
        );
        method = 'api';
      }
      
      // Fallback to CoA if API not configured or failed
      if (!result.success) {
        console.log(`[Speed Change] Using CoA for ${input.username} (API ${nas.apiEnabled ? 'failed' : 'not configured'})`);
        const coaResult = await coaEngine.changeUserSpeed(
          input.username,
          input.uploadSpeedKbps / 1000, // Convert Kbps to Mbps
          input.downloadSpeedKbps / 1000
        );
        // Extract the actual method from coaResult.data (radreply_only, coa, etc.)
        const coaMethod = (coaResult as any).data?.method || 'coa_fallback';
        result = { success: coaResult.success, error: coaResult.error, method: coaMethod, message: coaResult.message };
        method = coaMethod;
      }
      
      // Log audit
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'speed_change_api',
        targetType: 'session',
        targetId: input.username,
        targetName: input.username,
        nasId: nas.id,
        nasIp: input.nasIp,
        details: { uploadSpeedKbps: input.uploadSpeedKbps, downloadSpeedKbps: input.downloadSpeedKbps, method },
        result: result.success ? 'success' : 'failure',
        errorMessage: result.success ? undefined : result.error,
      });
      
      // Always include method in the return value for frontend to display correct message
      return { ...result, method };
    });

  // Disconnect user via MikroTik API
export const mikrotikDisconnect = protectedProcedure
    .input(z.object({
      nasIp: z.string(),
      username: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasByIp(input.nasIp);
      if (!nas) {
        throw new TRPCError({ code: "NOT_FOUND", message: "NAS not found" });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied to this NAS" });
      }
      
      // Try MikroTik API first (only if API credentials are configured)
      let method = 'coa';
      let result: any = { success: false, error: 'Not attempted' };
      
      if (nas.apiEnabled && nas.mikrotikApiUser && nas.mikrotikApiPassword) {
        result = await mikrotikApi.disconnectUserViaMikroTikApi(
          input.nasIp,
          input.username
        );
        method = 'api';
      }
      
      // Fallback to CoA if API not configured or failed
      if (!result.success) {
        console.log(`[Disconnect] Using CoA for ${input.username} (API ${nas.apiEnabled ? 'failed' : 'not configured'})`);
        const coaResult = await coaEngine.disconnectAllSessions(input.username);
        result = { ...coaResult, method: 'coa_fallback' };
        method = 'coa_fallback';
      }
      
      // Log audit
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'session_disconnect_api',
        targetType: 'session',
        targetId: input.username,
        targetName: input.username,
        nasId: nas.id,
        nasIp: input.nasIp,
        details: { method },
        result: result.success ? 'success' : 'failure',
        errorMessage: result.success ? undefined : result.error,
      });
      
      return result;
    });
