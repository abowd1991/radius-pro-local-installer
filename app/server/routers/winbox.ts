import { ENV } from "../_core/env";
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
import { normalizePortForwardingPublicHost } from "../domains/network/PortForwardingPublicHostPolicy";


function canViewAllData(role: string): boolean {
  return isAdmin(role);
}

function hasEffectiveNasOwnership(user: any, nas: { ownerId: number }): boolean {
  return canViewAllData(user.role) || nas.ownerId === getEffectiveOwnerId(getTenantContext(user));
}

export const winboxRouter = router({
  // Shared public address for UI setup instructions. The system setting wins so
  // an installed server can be migrated without rebuilding any frontend page.
  getPublicAddress: protectedProcedure.query(async () => {
    const settings = await db.getSystemSettings();
    const address = settings.radius_server_public_ip || ENV.VPS_PUBLIC_IP;
    if (!address) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'عنوان VPS العام غير مهيأ في إعدادات النظام' });
    }
    const portForwardingHost = normalizePortForwardingPublicHost(settings.port_forwarding_public_host)
      || normalizePortForwardingPublicHost(address)
      || normalizePortForwardingPublicHost(ENV.VPS_PUBLIC_IP);
    return { address, portForwardingHost };
  }),

  // Get all NAS devices with winbox info for current user
	  getMyNasDevices: protectedProcedure.query(async ({ ctx }) => {
	    const db2 = await db.getDb();
	    if (!db2) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
	    const { nasDevices, vpnConnections } = await import('../../drizzle/schema');
	    const { eq } = await import('drizzle-orm');
	    const effectiveOwnerId = getEffectiveOwnerId(getTenantContext(ctx.user));
	    let nasQuery;
	    if (canViewAllData(ctx.user.role)) {
	      nasQuery = db2.select().from(nasDevices);
	    } else {
	      nasQuery = db2.select().from(nasDevices).where(eq(nasDevices.ownerId, effectiveOwnerId));
    }
    const devices = await nasQuery;
    // Get all VPN connections for these devices to get actual IP
    const nasIds = devices.map((d: any) => d.id);
    let vpnMap: Record<number, string> = {};
    if (nasIds.length > 0) {
      const vpnConns = await db2.select().from(vpnConnections);
      for (const vc of vpnConns as any[]) {
        if (vc.status === 'connected' && vc.localVpnIp) {
          vpnMap[vc.nasId] = vc.localVpnIp;
        }
      }
    }
    return devices.map((d: any) => ({
      id: d.id,
      name: d.shortname || d.nasname,
      nasname: d.nasname,
      // Priority: active vpn_connections.localVpnIp > allocatedIp (the actual VPN IP) > vpnTunnelIp
      vpnIp: vpnMap[d.id] || d.allocatedIp || d.vpnTunnelIp || null,
      winboxPort: d.winboxPort,
      winboxEnabled: d.winboxEnabled,
      mikrotikWinboxPort: d.mikrotikWinboxPort ?? 8291,
      status: d.status,
      lastSeen: d.lastSeen,
    }));
  }),

  // Update MikroTik Winbox port for a NAS device
  updateMikrotikWinboxPort: protectedProcedure
    .input(z.object({ nasId: z.number(), mikrotikPort: z.number().min(1).max(65535) }))
    .mutation(async ({ ctx, input }) => {
      const db2 = await db.getDb();
      if (!db2) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { nasDevices } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const [nas] = await db2.select().from(nasDevices).where(eq(nasDevices.id, input.nasId)).limit(1);
      if (!nas) throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
      if (!hasEffectiveNasOwnership(ctx.user, nas)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      // Save the new MikroTik port
      await db2.update(nasDevices)
        .set({ mikrotikWinboxPort: input.mikrotikPort } as any)
        .where(eq(nasDevices.id, input.nasId));

      // If Winbox is currently enabled, restart the forward with the new port
      if (nas.winboxEnabled && nas.winboxPort) {
        const { vpnConnections } = await import('../../drizzle/schema');
        const [vpnConn] = await db2.select().from(vpnConnections)
          .where(eq(vpnConnections.nasId, input.nasId)).limit(1);
        const vpnIp = (vpnConn?.status === 'connected' && vpnConn?.localVpnIp)
          ? vpnConn.localVpnIp
          : (nas.allocatedIp || nas.vpnTunnelIp);

        if (vpnIp) {
          const { enableWinboxForward } = await import('../services/winboxService');
          await enableWinboxForward(input.nasId, vpnIp, nas.winboxPort, input.mikrotikPort);
        }
      }

      return { success: true, mikrotikPort: input.mikrotikPort };
    }),

  // Enable Winbox forwarding for a NAS
  enableForward: protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db2 = await db.getDb();
      if (!db2) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { nasDevices } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      // Get NAS and verify ownership
      const { vpnConnections } = await import('../../drizzle/schema');
      const [nas] = await db2.select().from(nasDevices).where(eq(nasDevices.id, input.nasId)).limit(1);
      if (!nas) throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
      if (!hasEffectiveNasOwnership(ctx.user, nas)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      // Get actual VPN IP from vpn_connections (active session) or fallback to vpnTunnelIp
      const [vpnConn] = await db2.select().from(vpnConnections)
        .where(eq(vpnConnections.nasId, input.nasId)).limit(1);
      // Priority: active vpn_connections.localVpnIp > allocatedIp > vpnTunnelIp
      const vpnIp = (vpnConn?.status === 'connected' && vpnConn?.localVpnIp)
        ? vpnConn.localVpnIp
        : (nas.allocatedIp || nas.vpnTunnelIp);

      if (!vpnIp) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'NAS has no VPN IP assigned. Connect via VPN first.' });
      }

      // Allocate port if not already assigned
      let port = nas.winboxPort;
      if (!port) {
        port = await allocateWinboxPort();
      }

      const mikrotikPort = (nas as any).mikrotikWinboxPort || 8291;
      const result = await enableWinboxForward(input.nasId, vpnIp, port, mikrotikPort);
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to enable Winbox forward' });
      }
      return { success: true, port };
    }),

  // Disable Winbox forwarding for a NAS
  disableForward: protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db2 = await db.getDb();
      if (!db2) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { nasDevices } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const [nas] = await db2.select().from(nasDevices).where(eq(nasDevices.id, input.nasId)).limit(1);
      if (!nas) throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
      if (!hasEffectiveNasOwnership(ctx.user, nas)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const result = await disableWinboxForward(input.nasId);
      if (!result.success) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to disable Winbox forward' });
      }
      return { success: true };
    }),

  // Check live status of socat service
  checkStatus: protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db2 = await db.getDb();
      if (!db2) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { nasDevices } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const [nas] = await db2.select().from(nasDevices).where(eq(nasDevices.id, input.nasId)).limit(1);
      if (!nas) throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
      if (!hasEffectiveNasOwnership(ctx.user, nas)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const status = await checkWinboxStatus(input.nasId);
      return { status, port: nas.winboxPort };
    }),

});;
