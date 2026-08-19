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
import { buildMikrotikPptpClientCommand, buildMikrotikPptpProfileCommand } from "../../domains/vpn/MikrotikPptpSetup";


export const list = protectedProcedure.query(async ({ ctx }) => {
    const { cache, cacheKeys, cacheTTL } = await import('../../_core/cache.js');
    const tenantContext = getTenantContext(ctx.user);
    const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
    
    // Try cache first
    const cacheKey = canSeeAllData(tenantContext) 
      ? cacheKeys.nasListAll() 
      : cacheKeys.nasList(effectiveOwnerId);
    
    const cached = cache.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Cache miss - fetch from DB
    const devices = await nasDb.getNasDevicesByTenant(tenantContext);
    cache.set(cacheKey, devices, cacheTTL.nasList);
    return devices;
  });

  // Get NAS by ID - check ownership with tenant isolation
export const getById = protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const nas = await nasDb.getNasById(input.id);
      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS device not found" });
      
      // Check ownership with tenant isolation
      const tenantContext = getTenantContext(ctx.user);
      const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
      
      if (!canSeeAllData(tenantContext) && nas.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return nas;
    });

  // Create NAS - any authenticated user can create, ownerId is set automatically
  // Requires active subscription to create new NAS
  // TWO-PHASE PROVISIONING:
  // - Phase 1 (here): Create NAS with nasname='pending', status='pending'
  // - Phase 2 (background): When VPN connects, read actual IP, create DHCP reservation, update nasname
export const getSetupScripts = protectedProcedure
    .input(z.object({ id: z.number() }))
	    .query(async ({ ctx, input }) => {
	      const nas = await nasDb.getNasById(input.id);
	      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS device not found" });
	      // Check ownership against the official client account for delegated staff.
	      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
	      if (!isAdmin(ctx.user.role) && nas.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // Get system settings for RADIUS server addresses
      const settings = await db.getSystemSettings();
      const radiusPublicIp = settings.radius_server_public_ip || '';
      const radiusVpnIp = settings.radius_server_vpn_ip || '192.168.30.1';
      const vpnServerAddress = settings.vpn_server_address || '';
      const coaPort = '3799';
      
      const scripts: Array<{
        id: string;
        title: string;
        titleAr: string;
        description: string;
        descriptionAr: string;
        command: string;
        category: 'vpn' | 'radius' | 'hotspot' | 'pppoe';
        required: boolean;
      }> = [];
      
      // VPN Setup Scripts (only for VPN connection types)
      if (nas.connectionType === 'vpn_l2tp') {
        if (!vpnServerAddress) {
          // Warning: VPN server address not configured
          scripts.push({
            id: 'vpn-warning',
            title: 'VPN Server Not Configured',
            titleAr: 'خادم VPN غير مهيأ',
            description: 'Please configure VPN server address in System Settings first',
            descriptionAr: 'يرجى إعداد عنوان خادم VPN في إعدادات النظام أولاً',
            command: '# يرجى إعداد عنوان خادم VPN في إعدادات النظام',
            category: 'vpn',
            required: true,
          });
        } else {
          // Step 1: Create PPP Profile named RadiusPro
          scripts.push({
            id: 'ppp-profile',
            title: 'Create PPP Profile (RadiusPro)',
            titleAr: 'إنشاء بروفايل PPP (RadiusPro)',
            description: 'Create a dedicated PPP profile for RadiusPro VPN tunnel',
            descriptionAr: 'إنشاء بروفايل PPP مخصص لنفق VPN الخاص بـ RadiusPro',
            command: `/ppp profile\nadd name="RadiusPro"`,
            category: 'vpn',
            required: true,
          });
          // Step 2: Create L2TP/IPSec client using the RadiusPro profile
          scripts.push({
            id: 'l2tp-client',
            title: 'Create L2TP/IPSec Client',
            titleAr: 'إنشاء اتصال L2TP/IPSec',
            description: `Create L2TP/IPSec VPN tunnel to RADIUS server (${vpnServerAddress})`,
            descriptionAr: `إنشاء نفق VPN L2TP/IPSec للاتصال بخادم RADIUS (${vpnServerAddress})`,
            command: `/interface l2tp-client add name=radius-vpn connect-to=${vpnServerAddress} user=${nas.vpnUsername || '<vpn-username>'}@VPN password=${nas.vpnPassword || '<vpn-password>'} use-ipsec=yes ipsec-secret=softether disabled=no add-default-route=no`,
            category: 'vpn',
            required: true,
          });

        }
      } else if (nas.connectionType === 'vpn_sstp') {
        if (!vpnServerAddress) {
          scripts.push({
            id: 'vpn-warning',
            title: 'VPN Server Not Configured',
            titleAr: 'خادم VPN غير مهيأ',
            description: 'Please configure VPN server address in System Settings first',
            descriptionAr: 'يرجى إعداد عنوان خادم VPN في إعدادات النظام أولاً',
            command: '# يرجى إعداد عنوان خادم VPN في إعدادات النظام',
            category: 'vpn',
            required: true,
          });
        } else {
          // Step 1: Create PPP Profile named RadiusPro
          scripts.push({
            id: 'ppp-profile',
            title: 'Create PPP Profile (RadiusPro)',
            titleAr: 'إنشاء بروفايل PPP (RadiusPro)',
            description: 'Create a dedicated PPP profile for RadiusPro VPN tunnel',
            descriptionAr: 'إنشاء بروفايل PPP مخصص لنفق VPN الخاص بـ RadiusPro',
            command: `/ppp profile\nadd name="RadiusPro" use-compression=no use-encryption=yes only-one=yes change-tcp-mss=yes`,
            category: 'vpn',
            required: true,
          });
          // Step 2: Create SSTP client using the RadiusPro profile
          scripts.push({
            id: 'sstp-client',
            title: 'Create SSTP Client',
            titleAr: 'إنشاء اتصال SSTP',
            description: `Create SSTP VPN tunnel to RADIUS server (${vpnServerAddress}:8443)`,
            descriptionAr: `إنشاء نفق VPN SSTP للاتصال بخادم RADIUS (${vpnServerAddress}:8443)`,
            command: `/interface sstp-client add name=radius-vpn connect-to=${vpnServerAddress} port=8443 user=${nas.vpnUsername || '<vpn-username>'} password=${nas.vpnPassword || '<vpn-password>'} profile=RadiusPro verify-server-certificate=no add-default-route=no disabled=no`,
            category: 'vpn',
            required: true,
          });
        }
      } else if (nas.connectionType === 'vpn_pptp') {
        if (!vpnServerAddress) {
          scripts.push({
            id: 'vpn-warning',
            title: 'VPN Server Not Configured',
            titleAr: 'خادم VPN غير مهيأ',
            description: 'Please configure VPN server address in System Settings first',
            descriptionAr: 'يرجى إعداد عنوان خادم VPN في إعدادات النظام أولاً',
            command: '# يرجى إعداد عنوان خادم VPN في إعدادات النظام',
            category: 'vpn',
            required: true,
          });
        } else {
          // Step 1: Create PPP Profile named RadiusPro
          scripts.push({
            id: 'ppp-profile',
            title: 'Create PPP Profile (RadiusPro)',
            titleAr: 'إنشاء بروفايل PPP (RadiusPro)',
            description: 'Create a dedicated PPP profile for RadiusPro VPN tunnel',
            descriptionAr: 'إنشاء بروفايل PPP مخصص لنفق VPN الخاص بـ RadiusPro',
            command: buildMikrotikPptpProfileCommand(),
            category: 'vpn',
            required: true,
          });
          // Step 2: Create PPTP client
          scripts.push({
            id: 'pptp-client',
            title: 'Create PPTP Client',
            titleAr: 'إنشاء اتصال PPTP',
            description: `Create PPTP VPN tunnel to RADIUS server (${vpnServerAddress})`,
            descriptionAr: `إنشاء نفق VPN PPTP للاتصال بخادم RADIUS (${vpnServerAddress})`,
            command: buildMikrotikPptpClientCommand(vpnServerAddress, nas.vpnUsername || '<vpn-username>', nas.vpnPassword || '<vpn-password>'),
            category: 'vpn',
            required: true,
          });
        }
      }
      
      // RADIUS Server Setup (always required)
      // For public IP: use the configured public RADIUS IP
      // For L2TP VPN: use 192.168.30.1 (L2TP gateway)
      // For SSTP VPN: use 192.168.31.1 (SSTP gateway)
      const radiusAddress = nas.connectionType === 'public_ip' 
        ? radiusPublicIp 
        : nas.connectionType === 'vpn_sstp' 
          ? (settings.radius_server_vpn_sstp_ip || '192.168.31.1')
          : nas.connectionType === 'vpn_pptp'
            ? (settings.radius_server_vpn_pptp_ip || '192.168.32.1')
            : radiusVpnIp;
      scripts.push({
        id: 'radius-server',
        title: 'Add RADIUS Server',
        titleAr: 'إضافة خادم RADIUS',
        description: 'Add RADIUS server for authentication and accounting',
        descriptionAr: 'إضافة خادم RADIUS للمصادقة والمحاسبة',
        command: `/radius add address=${radiusAddress} secret=${nas.secret} timeout=3s service=ppp,hotspot,login`,
        category: 'radius',
        required: true,
      });
      
      // RADIUS Incoming (CoA/Disconnect)
      scripts.push({
        id: 'radius-incoming',
        title: 'Enable RADIUS Incoming',
        titleAr: 'تفعيل RADIUS Incoming',
        description: 'Enable receiving CoA and Disconnect commands',
        descriptionAr: 'تفعيل استقبال أوامر CoA و Disconnect',
        command: `/radius incoming set port=${coaPort} accept=yes`,
        category: 'radius',
        required: true,
      });
      
      // Disable require-message-auth for compatibility
      scripts.push({
        id: 'message-auth',
        title: 'Disable Message Auth',
        titleAr: 'تعطيل Message Auth',
        description: 'Disable require-message-auth for FreeRADIUS compatibility',
        descriptionAr: 'تعطيل require-message-auth للتوافق مع FreeRADIUS',
        command: `/radius set [find] require-message-auth=no`,
        category: 'radius',
        required: true,
      });
      
      // PPP/PPPoE Setup
      scripts.push({
        id: 'ppp-aaa',
        title: 'Enable PPP RADIUS',
        titleAr: 'تفعيل RADIUS لـ PPP',
        description: 'Enable RADIUS authentication for PPP/PPPoE',
        descriptionAr: 'تفعيل مصادقة RADIUS لـ PPP/PPPoE',
        command: `/ppp aaa set use-radius=yes accounting=yes interim-update=1m`,
        category: 'pppoe',
        required: true,
      });
      
      // Hotspot Setup
      scripts.push({
        id: 'hotspot-radius',
        title: 'Enable Hotspot RADIUS',
        titleAr: 'تفعيل RADIUS لـ Hotspot',
        description: 'Enable RADIUS for all Hotspot profiles with 2-minute interim updates',
        descriptionAr: 'تفعيل RADIUS لجميع بروفايلات Hotspot مع تحديث كل دقيقتين',
        command: `:foreach profile in=[/ip hotspot profile find] do={
  /ip hotspot profile set \$profile login-by=cookie,http-pap,mac-cookie use-radius=yes radius-accounting=yes radius-interim-update=2m
}`,
        category: 'hotspot',
        required: true,
      });
      
      // Combined script for one-click setup
      const allRequiredCommands = scripts
        .filter(s => s.required)
        .map(s => s.command)
        .join('\n');
      
      return {
        nas,
        scripts,
        combinedScript: allRequiredCommands,
        vpnTunnelIp: nas.connectionType === 'vpn_sstp' 
          ? (settings.radius_server_vpn_sstp_ip || '192.168.31.1')
          : nas.connectionType === 'vpn_pptp'
            ? (settings.radius_server_vpn_pptp_ip || '192.168.32.1')
            : nas.connectionType !== 'public_ip' ? radiusVpnIp : null,
        radiusAddress,
        vpnServerAddress: nas.connectionType !== 'public_ip' ? vpnServerAddress : null,
      };
    });

  // Update NAS - check ownership (requires active subscription)
export const getProvisioningStatus = protectedProcedure
    .input(z.object({ nasId: z.number() }))
	    .query(async ({ ctx, input }) => {
	      const nas = await nasDb.getNasById(input.nasId);
	      if (!nas) throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
	      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
	      if (!isAdmin(ctx.user.role) && nas.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      return {
        nasId: nas.id,
        status: (nas as any).provisioningStatus || 'pending',
        allocatedIp: (nas as any).allocatedIp,
        lastTempIp: (nas as any).lastTempIp,
        lastMac: (nas as any).lastMac,
        provisionedAt: (nas as any).provisionedAt,
        error: (nas as any).provisioningError,
      };
    });

	  // Retry provisioning for a NAS
	export const listWithProvisioningStatus = protectedProcedure
	    .query(async ({ ctx }) => {
	      const db = await getDb();
	      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
	      const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
	      let devices;
	      if (isAdmin(ctx.user.role)) {
	        devices = await db.select().from(nasDevices);
	      } else {
	        devices = await db.select().from(nasDevices).where(eq(nasDevices.ownerId, effectiveOwnerId));
	      }
      
      return devices.map((nas: any) => ({
        ...nas,
        provisioningStatus: (nas as any).provisioningStatus || 'pending',
        allocatedIp: (nas as any).allocatedIp,
        lastTempIp: (nas as any).lastTempIp,
        lastMac: (nas as any).lastMac,
      }));
    });

  // Get IP Pool Statistics
export const getPoolStats = protectedProcedure
    .query(async () => {
      const ipPoolManager = await import('../../services/ipPoolManager');
      const stats = await ipPoolManager.getPoolStats();
      return stats;
    });

  // List DHCP Static Leases (Admin Only)
export const listDhcpLeases = protectedProcedure
    .query(async ({ ctx }) => {
      // Only allow owner/super_admin
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      const dhcpLeaseManager = await import('../../services/dhcpLeaseManager');
      const leases = await dhcpLeaseManager.listStaticLeases();
      return leases;
    });

  // Get IP Pool Ranges (Admin Only)
export const getIpPoolRanges = protectedProcedure
    .query(async ({ ctx }) => {
      // Only allow owner/super_admin
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      const ipPoolManager = await import('../../services/ipPoolManager');
      const ranges = await ipPoolManager.getIpPoolRanges();
      return ranges;
    });

  // Expand IP Pool (Admin Only)
