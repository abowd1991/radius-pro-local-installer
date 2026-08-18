import { ENV } from "../_core/env";
import * as vpsManagementService from "../services/vpsManagementService";
import { protectedProcedure, publicProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "../_core/trpc";
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
import * as freeradiusService from "../services/freeradiusService";
import * as sshVpn from "../services/sshVpnService";
import * as vpnIpPool from "../db/vpnIpPool";
import * as twoPhaseProvisioning from "../services/twoPhaseProvisioningService";
import { autoFixMissingHuntgroups } from '../v2/V2ServiceBridge';
import { allocateWinboxPort, enableWinboxForward, disableWinboxForward, checkWinboxStatus } from "../services/winboxService";
import * as permissionsService from "../services/permissionsService";
import { isAdmin } from "../_core/roles";


function canViewAllData(role: string): boolean {
  return isAdmin(role);
}

export const vpsManagementRouter = router({
  // Get system status via API (CPU/RAM/Disk/Uptime) - no SSH needed
  getStatus: superAdminProcedure
    .query(async (): Promise<{ cpu_usage: string; memory_usage: string; disk_usage: string; uptime: string }> => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`${ENV.VPS_LEGACY_URL}/api/system/stats`, {
          headers: { 'X-API-Key': ENV.VPS_LEGACY_SECRET },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as {
          cpu_percent?: number;
          ram_used_mb?: number;
          ram_total_mb?: number;
          ram_percent?: number;
          disk_used_gb?: number;
          disk_total_gb?: number;
          disk_percent?: number;
          uptime_human?: string;
          ppp_sessions?: number;
          dhcp_leases?: number;
          service_freeradius?: string;
          service_xl2tpd?: string;
          service_dnsmasq?: string;
        };
        return {
          cpu_usage: data.cpu_percent !== undefined && data.cpu_percent >= 0 ? `${data.cpu_percent}%` : 'N/A',
          memory_usage: data.ram_percent !== undefined ? `${data.ram_percent}% (${data.ram_used_mb}MB / ${data.ram_total_mb}MB)` : 'N/A',
          disk_usage: data.disk_percent !== undefined ? `${data.disk_percent}% (${data.disk_used_gb}GB / ${data.disk_total_gb}GB)` : 'N/A',
          uptime: data.uptime_human || 'N/A',
        };
      } catch {
        return { cpu_usage: 'N/A', memory_usage: 'N/A', disk_usage: 'N/A', uptime: 'N/A' };
      }
    }),



  // Get backups list
  getBackups: superAdminProcedure
    .query(async () => {
      const result = await vpsManagementService.getBackups();
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to get backups' });
      }
      return result.data;
    }),

  // Create new backup
  createBackup: superAdminProcedure
    .input(z.object({ prefix: z.string().default('manual') }))
    .mutation(async ({ ctx, input }) => {
      const result = await vpsManagementService.createBackup(input.prefix);
      
      // Log the action
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'backup_create',
        targetType: 'system',
        targetId: 'vps',
        details: result.success 
          ? { message: `Created backup: ${result.data?.backup_id}` }
          : { message: `Backup failed: ${result.error}` },
        result: result.success ? 'success' : 'failure',
        ipAddress: '',
      });
      
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Backup failed' });
      }
      return result.data;
    }),

  // Restore from backup
  restoreBackup: superAdminProcedure
    .input(z.object({ backupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await vpsManagementService.restoreBackup(input.backupId);
      
      // Log the action
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'backup_restore',
        targetType: 'system',
        targetId: 'vps',
        details: result.success 
          ? { message: `Restored backup: ${input.backupId}` }
          : { message: `Restore failed: ${result.error}` },
        result: result.success ? 'success' : 'failure',
        ipAddress: '',
      });
      
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Restore failed' });
      }
      return result.data;
    }),

  // Get service logs
  getServiceLogs: superAdminProcedure
    .input(z.object({ 
      serviceName: z.enum(['app', 'freeradius', 'vpn', 'dhcp']),
      lines: z.number().default(100)
    }))
    .query(async ({ input }) => {
      const result = await vpsManagementService.getServiceLogs(input.serviceName, input.lines);
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to get logs' });
      }
      return result.data;
    }),

  // Manage service (only app and dhcp allowed)
  manageService: superAdminProcedure
    .input(z.object({
      serviceName: z.enum(['app', 'dhcp']),
      action: z.enum(['start', 'stop', 'restart', 'reload'])
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await vpsManagementService.manageService(input.serviceName, input.action);
      
      // Log the action
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'service_manage',
        targetType: 'system',
        targetId: 'vps',
        details: { message: `${input.action} ${input.serviceName}: ${result.success ? 'success' : result.error}` },
        result: result.success ? 'success' : 'failure',
        ipAddress: '',
      });
      
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Service action failed' });
      }
      return result.data;
    }),

  // Deploy update from Manus (Zero Downtime)
  deployUpdate: superAdminProcedure
    .input(z.object({
      packageData: z.string().describe('Base64 encoded tar.gz package')
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await vpsManagementService.deployUpdate(input.packageData);
      
      // Log the action
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'system_deploy' as any,
        targetType: 'system',
        targetId: 'vps',
        details: result.success 
          ? { message: 'Zero downtime deployment successful' }
          : { message: `Deployment failed: ${result.error}` },
        result: result.success ? 'success' : 'failure',
        ipAddress: '',
      });
      
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Deployment failed' });
      }
      return result.data;
    }),

  // Quick reload app (Zero Downtime)
  reloadApp: superAdminProcedure
    .mutation(async ({ ctx }) => {
      const result = await vpsManagementService.reloadApp();
      
      // Log the action
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'app_reload' as any,
        targetType: 'system',
        targetId: 'vps',
        details: result.success 
          ? { message: 'Application reloaded successfully' }
          : { message: `Reload failed: ${result.error}` },
        result: result.success ? 'success' : 'failure',
        ipAddress: '',
      });
      
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Reload failed' });
      }
      return result.data;
    }),

  // ── New endpoints matching vpn-api.py (Port 8080) ───────────────────────────────

  getVpnUsers: superAdminProcedure.query(async () => {
    const result = await vpsManagementService.getVpnUsers();
    if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
    return result.data;
  }),

  getVpnSessions: superAdminProcedure.query(async () => {
    const result = await vpsManagementService.getVpnSessions();
    if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
    return result.data;
  }),

  disconnectVpnUser: superAdminProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ input }) => {
      const result = await vpsManagementService.disconnectVpnUser(input.username);
      if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
      return result.data;
    }),

  getVpnLogs: superAdminProcedure
    .input(z.object({ lines: z.number().default(100) }))
    .query(async ({ input }) => {
      const result = await vpsManagementService.getVpnLogs(input.lines);
      if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
      return result.data;
    }),

  getActiveSessions: superAdminProcedure.query(async () => {
    const result = await vpsManagementService.getActiveSessions();
    if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
    return result.data;
  }),

  cleanupStaleSessions: superAdminProcedure.mutation(async () => {
    const result = await vpsManagementService.cleanupStaleSessions();
    if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
    return result.data;
  }),

  getSstpSessions: superAdminProcedure.query(async () => {
    const result = await vpsManagementService.getSstpSessions();
    if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
    return result.data;
  }),

  disconnectSstpSession: superAdminProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ input }) => {
      const result = await vpsManagementService.disconnectSstpSession(input.username);
      if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
      return result.data;
    }),

  getSstpStatus: superAdminProcedure.query(async () => {
    const result = await vpsManagementService.getSstpStatus();
    if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
    return result.data;
  }),

  getApiHealth: superAdminProcedure.query(async () => {
    const result = await vpsManagementService.getApiHealth();
    if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
    return result.data;
  }),

  radiusDisconnect: superAdminProcedure
    .input(z.object({ nasIp: z.string(), username: z.string(), sessionId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const result = await vpsManagementService.radiusDisconnect(input.nasIp, input.username, input.sessionId);
      if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed' });
      return result.data;
    }),

  // ── VPN User Management (Create / Delete / Full Status) ────────────────────────

  createVpnUser: superAdminProcedure
    .input(z.object({
      username: z.string().min(2).max(64),
      password: z.string().min(4).max(128),
      connectionType: z.enum(['l2tp', 'sstp', 'pptp']).default('l2tp'),
      staticIp: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await vpsManagementService.createVpnUser(
        input.username,
        input.password,
        input.connectionType,
        input.staticIp,
      );
      if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to create VPN user' });
      return result.data;
    }),

  updateVpnUserIp: superAdminProcedure
    .input(z.object({
      username: z.string().min(2).max(64),
      newIp: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'Invalid IP address'),
    }))
    .mutation(async ({ input }) => {
      const result = await vpsManagementService.updateVpnUserIp(input.username, input.newIp);
      if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to update IP' });
      return { success: true };
    }),

  changeVpnUserType: superAdminProcedure
    .input(z.object({
      username: z.string().min(2).max(64),
      newType: z.enum(['l2tp', 'sstp', 'pptp']),
    }))
    .mutation(async ({ input }) => {
      // To change connection type: delete user then re-create with new type (auto-assigns IP from correct pool)
      // First disconnect any active sessions
      await vpsManagementService.disconnectVpnUser(input.username).catch(() => {});
      await vpsManagementService.disconnectSstpSession(input.username).catch(() => {});
      // Delete existing user
      const delResult = await vpsManagementService.deleteVpnUser(input.username);
      if (!delResult.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: delResult.error || 'Failed to delete user for type change' });
      // Re-create with new connection type (password will be re-set by user separately)
      // We use a placeholder password since the user will change it if needed
      const createResult = await vpsManagementService.createVpnUser(input.username, '__placeholder__', input.newType);
      if (!createResult.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: createResult.error || 'Failed to re-create user with new type' });
      return { success: true, data: createResult.data };
    }),

  changeVpnUserPassword: superAdminProcedure
    .input(z.object({
      username: z.string().min(2).max(64),
      newPassword: z.string().min(6).max(128),
    }))
    .mutation(async ({ input }) => {
      // The API upserts — re-creating with same username updates the password
      const result = await vpsManagementService.createVpnUser(input.username, input.newPassword);
      if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to change password' });
      return { success: true };
    }),

  deleteVpnUser: superAdminProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ input }) => {
      // Disconnect active sessions first (both L2TP and SSTP), ignore errors
      await vpsManagementService.disconnectVpnUser(input.username).catch(() => {});
      await vpsManagementService.disconnectSstpSession(input.username).catch(() => {});
      const result = await vpsManagementService.deleteVpnUser(input.username);
      if (!result.success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to delete VPN user' });
      return result.data;
    }),

  getVpnFullStatus: superAdminProcedure.query(async () => {
    const [usersRes, l2tpRes, sstpRes, sstpStatusRes] = await Promise.allSettled([
      vpsManagementService.getVpnUsers(),
      vpsManagementService.getVpnSessions(),
      vpsManagementService.getSstpSessions(),
      vpsManagementService.getSstpStatus(),
    ]);
    const users = usersRes.status === 'fulfilled' && usersRes.value.success ? (usersRes.value.data as any) : [];
    const l2tpSessions = l2tpRes.status === 'fulfilled' && l2tpRes.value.success ? (l2tpRes.value.data as any) : [];
    const sstpSessions = sstpRes.status === 'fulfilled' && sstpRes.value.success ? (sstpRes.value.data as any) : [];
    const sstpStatus = sstpStatusRes.status === 'fulfilled' && sstpStatusRes.value.success ? (sstpStatusRes.value.data as any) : null;

    // Determine connection type per user from their IP range
    // L2TP: 192.168.30.x  |  SSTP: 192.168.31.x
    const usersArr = Array.isArray(users?.users) ? users.users : Array.isArray(users) ? users : [];
    const l2tpArr = Array.isArray(l2tpSessions?.sessions) ? l2tpSessions.sessions : Array.isArray(l2tpSessions) ? l2tpSessions : [];
    const sstpArr = Array.isArray(sstpSessions?.sessions) ? sstpSessions.sessions : Array.isArray(sstpSessions) ? sstpSessions : [];

    const l2tpConnected = new Set(l2tpArr.map((s: any) => (s.username || '').toLowerCase()));
    const sstpConnected = new Set(sstpArr.map((s: any) => (s.username || '').toLowerCase()));

    const enrichedUsers = usersArr.map((u: any) => ({
      ...u,
      connectionType: u.assignedIp?.startsWith('192.168.31.') ? 'sstp' : 'l2tp',
      isConnected: l2tpConnected.has((u.username || '').toLowerCase()) || sstpConnected.has((u.username || '').toLowerCase()),
    }));

    const stats = {
      total: enrichedUsers.length,
      l2tpConnected: l2tpArr.length,
      sstpConnected: sstpArr.length,
      totalConnected: l2tpArr.length + sstpArr.length,
      sstpServiceActive: sstpStatus?.isActive ?? false,
    };

    return { users: enrichedUsers, l2tpSessions: l2tpArr, sstpSessions: sstpArr, sstpStatus, stats };
  }),
});

