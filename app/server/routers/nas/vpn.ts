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
import { radcheck, radreply, nasDevices, radiusCards, radacct, onlineSessions, users, wallets, walletLedger, cardBatches, checkTokens, plans, notificationChannels, siteSettings, systemUpdates } from "../../../drizzle/schema";
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
import * as sshVpn from "../../services/sshVpnService";
import { isAdmin } from "../../_core/roles";

const hasEffectiveNasOwnership = (user: any, nas: { ownerId: number }) =>
  isAdmin(user.role) || nas.ownerId === getEffectiveOwnerId(getTenantContext(user));

export const syncVpnIp = protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Get NAS device
      const nas = await nasDb.getNasById(input.id);
      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS device not found" });
      if (!hasEffectiveNasOwnership(ctx.user, nas)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // Only for VPN connection types
      if (nas.connectionType === 'public_ip') {
        return { success: false, message: 'هذا الجهاز يستخدم IP عام، لا يحتاج مزامنة VPN' };
      }
      
      // Get VPN username
      if (!nas.vpnUsername) {
        return { success: false, message: 'لم يتم العثور على اسم مستخدم VPN' };
      }
      
      // Get local IP from SoftEther
      const vpnLocalIp = await sshVpn.getVpnUserLocalIp(nas.vpnUsername);
      
      if (!vpnLocalIp) {
        return { 
          success: false, 
          message: 'الجهاز غير متصل عبر VPN. تأكد من اتصال VPN أولاً ثم أعد المحاولة.',
          currentNasname: nas.nasname
        };
      }
      
      // Update nasname with actual VPN IP
      await nasDb.updateNas(input.id, { ipAddress: vpnLocalIp });
      
      // Also update vpnTunnelIp field
      const database = await getDb();
      if (database) {
        await database.update(nasDevices)
          .set({ vpnTunnelIp: vpnLocalIp })
          .where(eq(nasDevices.id, input.id));
      }
      
      console.log(`[NAS Sync] Updated nasname for NAS ${input.id}: ${nas.nasname} -> ${vpnLocalIp}`);
      
      return { 
        success: true, 
        message: `تم تحديث عنوان IP بنجاح: ${vpnLocalIp}`,
        previousNasname: nas.nasname,
        newNasname: vpnLocalIp,
        vpnUsername: nas.vpnUsername
      };
    });

  // Manual update of VPN IP - allows user to set IP manually if auto-sync fails
export const updateVpnIp = protectedProcedure
    .input(z.object({ 
      id: z.number(),
      vpnLocalIp: z.string().regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IPv4 address')
    }))
    .mutation(async ({ ctx, input }) => {
      // Get NAS device
      const nas = await nasDb.getNasById(input.id);
      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS device not found" });
      if (!hasEffectiveNasOwnership(ctx.user, nas)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // Update nasname with provided IP
      await nasDb.updateNas(input.id, { ipAddress: input.vpnLocalIp });
      
      // Also update vpnTunnelIp field
      const database = await getDb();
      if (database) {
        await database.update(nasDevices)
          .set({ vpnTunnelIp: input.vpnLocalIp })
          .where(eq(nasDevices.id, input.id));
      }
      
      console.log(`[NAS Update] Manual IP update for NAS ${input.id}: ${nas.nasname} -> ${input.vpnLocalIp}`);
      
      return { 
        success: true, 
        message: `تم تحديث عنوان IP بنجاح: ${input.vpnLocalIp}`,
        previousNasname: nas.nasname,
        newNasname: input.vpnLocalIp
      };
    });

  // Test MikroTik API connection - any authenticated user can test
export const testApiConnection = protectedProcedure
    .input(z.object({
      nasIp: z.string(),
      apiPort: z.number().default(8728),
      apiUser: z.string(),
      apiPassword: z.string(),
      nasId: z.number().optional(), // Optional NAS ID to get VPN local IP
    }))
    .mutation(async ({ input }) => {
      const mikrotikApi = await import('../../services/mikrotikApiService');
      
      // Helper: auto-enable apiEnabled after successful connection
      const autoEnableApi = async () => {
        if (input.nasId) {
          try {
            await nasDb.updateNas(input.nasId, { apiEnabled: true });
            console.log(`[MikroTik API] Auto-enabled apiEnabled for NAS ${input.nasId}`);
          } catch (e) {
            console.error('[MikroTik API] Failed to auto-enable apiEnabled:', e);
          }
        }
      };
      
      // Determine the actual IP to connect to
      let connectIp = input.nasIp;
      
      // If nasId is provided, check if this NAS is connected via VPN
      if (input.nasId) {
        const nas = await nasDb.getNasById(input.nasId);
        if (nas && (nas.connectionType === 'vpn_l2tp' || nas.connectionType === 'vpn_sstp' || nas.connectionType === 'vpn_pptp') && nas.vpnUsername) {
          // Try to get the local IP from VPN session
          const vpnLocalIp = await sshVpn.getVpnUserLocalIp(nas.vpnUsername);
          if (vpnLocalIp) {
            console.log(`[MikroTik API Test] Using VPN local IP: ${vpnLocalIp} instead of ${input.nasIp}`);
            connectIp = vpnLocalIp;
          } else {
            return {
              success: false,
              message: 'الجهاز غير متصل عبر VPN. تأكد من اتصال VPN أولاً.',
              error: 'VPN_NOT_CONNECTED'
            };
          }
        }
      }
      
      console.log(`[MikroTik API Test] Connecting to ${connectIp}:${input.apiPort}`);
      
      // Determine if we need VPS proxy (VPN IP) or direct connection (public IP)
      // L2TP uses 192.168.30.x, SSTP uses 192.168.31.x
      const isVpnIp = connectIp.startsWith('192.168.30.') || connectIp.startsWith('192.168.31.');
      
      if (isVpnIp) {
        // Use VPS HTTP proxy for VPN IPs (faster than SSH tunnel)
        console.log(`[MikroTik API Test] Using VPS proxy for VPN IP: ${connectIp}:${input.apiPort}`);
        try {
          const proxyRes = await fetch(`${ENV.VPS_LEGACY_URL}/api/mikrotik/proxy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': ENV.VPS_LEGACY_SECRET,
            },
            body: JSON.stringify({
              host: connectIp,
              port: input.apiPort,
              username: input.apiUser,
              password: input.apiPassword,
              action: 'test_connection',
              src_ip: connectIp,
            }),
            signal: AbortSignal.timeout(15000),
          });
          const proxyData = await proxyRes.json() as any;
          if (proxyData.success) {
            autoEnableApi();
            return { success: true, message: 'API connection successful! Credentials are valid.', data: { connected: true, viaProxy: true } };
          } else {
            return { success: false, message: proxyData.error || 'Connection failed', error: 'PROXY_ERROR' };
          }
        } catch (proxyErr: any) {
          return { success: false, message: `VPS proxy error: ${proxyErr.message}`, error: 'PROXY_ERROR' };
        }
      } else {
        // Direct connection for public IPs
        console.log(`[MikroTik API Test] Using direct connection for public IP: ${connectIp}:${input.apiPort}`);
        
        const net = await import('net');
        const crypto = await import('crypto');
        
        return new Promise((resolve) => {
          const socket = new net.Socket();
          let resolved = false;
          
          socket.setTimeout(10000);
          
          socket.on('timeout', () => {
            if (!resolved) {
              resolved = true;
              socket.destroy();
              resolve({
                success: false,
                message: 'Connection timeout - check IP and port',
                error: 'TIMEOUT'
              });
            }
          });
          
          socket.on('error', (err: any) => {
            if (!resolved) {
              resolved = true;
              socket.destroy();
              resolve({
                success: false,
                message: `Connection failed: ${err.message}`,
                error: 'CONNECTION_ERROR'
              });
            }
          });
          
          socket.connect(input.apiPort, connectIp, async () => {
          try {
            // Try to login
            const encodeWord = (word: string): Buffer => {
              const wordBuffer = Buffer.from(word, 'utf8');
              const length = wordBuffer.length;
              let lengthBuffer: Buffer;
              
              if (length < 0x80) {
                lengthBuffer = Buffer.from([length]);
              } else if (length < 0x4000) {
                lengthBuffer = Buffer.from([
                  ((length >> 8) & 0x3F) | 0x80,
                  length & 0xFF
                ]);
              } else {
                lengthBuffer = Buffer.from([length]);
              }
              
              return Buffer.concat([lengthBuffer, wordBuffer]);
            };
            
            const loginCmd = Buffer.concat([
              encodeWord('/login'),
              encodeWord(`=name=${input.apiUser}`),
              encodeWord(`=password=${input.apiPassword}`),
              Buffer.from([0]) // End of sentence
            ]);
            
            socket.write(loginCmd);
            
              socket.once('data', (data: Buffer) => {
                const response = data.toString('utf8');
                socket.destroy();
                
                if (!resolved) {
                  resolved = true;
                  
                  if (response.includes('!done')) {
                    // Auto-enable apiEnabled in DB
                    autoEnableApi();
                    resolve({
                      success: true,
                      message: 'API connection successful! Credentials are valid.',
                      data: { connected: true, viaDirect: true }
                    });
                  } else if (response.includes('!trap')) {
                    resolve({
                      success: false,
                      message: 'Login failed - invalid username or password',
                      error: 'AUTH_FAILED'
                    });
                  } else {
                    // Auto-enable apiEnabled in DB (legacy auth)
                    autoEnableApi();
                    resolve({
                      success: true,
                      message: 'API connection established (legacy auth mode)',
                      data: { connected: true, legacyAuth: true, viaDirect: true }
                    });
                  }
                }
              });
            
            } catch (error: any) {
              if (!resolved) {
                resolved = true;
                socket.destroy();
                resolve({
                  success: false,
                  message: `Login error: ${error.message}`,
                  error: 'LOGIN_ERROR'
                });
              }
            }
          });
          
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              socket.destroy();
              resolve({
                success: false,
                message: 'Connection timeout',
                error: 'TIMEOUT'
              });
            }
          }, 15000);
        });
      }
    });

  // Get VPN status for a NAS device
export const getVpnStatus = protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      // Get NAS device
      const nas = await nasDb.getNasById(input.id);
      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS device not found" });
      if (!hasEffectiveNasOwnership(ctx.user, nas)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // Only for VPN connection types
      if (nas.connectionType === 'public_ip') {
        return {
          isVpn: false,
          connected: null,
          vpnLocalIp: null,
          nasname: nas.nasname,
          vpnUsername: null,
          needsSync: false,
          message: 'هذا الجهاز يستخدم IP عام'
        };
      }
      
      // Get VPN session info
      let vpnLocalIp: string | null = null;
      let connected = false;
      
      if (nas.vpnUsername) {
        vpnLocalIp = await sshVpn.getVpnUserLocalIp(nas.vpnUsername);
        connected = !!vpnLocalIp;
      }
      
      // Check if nasname needs sync (is placeholder or doesn't match VPN IP)
      const isPlaceholder = nas.nasname ? (nas.nasname.startsWith('pending-vpn-') || nas.nasname.startsWith('vpn-')) : false;
      const needsSync = connected && vpnLocalIp && (isPlaceholder || nas.nasname !== vpnLocalIp);
      
      return {
        isVpn: true,
        connected,
        vpnLocalIp,
        nasname: nas.nasname,
        vpnUsername: nas.vpnUsername,
        vpnTunnelIp: nas.vpnTunnelIp,
        needsSync,
        isPlaceholder,
        message: connected 
          ? (needsSync ? 'متصل - يحتاج مزامنة IP' : 'متصل - IP متزامن')
          : 'غير متصل'
      };
    });

  // Auto-sync VPN IP with retry logic
export const autoSyncVpnIp = protectedProcedure
    .input(z.object({ 
      id: z.number(),
      maxRetries: z.number().default(3),
      retryDelayMs: z.number().default(5000)
    }))
    .mutation(async ({ ctx, input }) => {
      // Get NAS device
      const nas = await nasDb.getNasById(input.id);
      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS device not found" });
      if (!hasEffectiveNasOwnership(ctx.user, nas)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // Only for VPN connection types
      if (nas.connectionType === 'public_ip') {
        return { success: false, message: 'هذا الجهاز يستخدم IP عام' };
      }
      
      if (!nas.vpnUsername) {
        return { success: false, message: 'لم يتم العثور على اسم مستخدم VPN' };
      }
      
      // Retry logic
      let vpnLocalIp: string | null = null;
      let attempts = 0;
      
      while (attempts < input.maxRetries && !vpnLocalIp) {
        attempts++;
        console.log(`[Auto-Sync] Attempt ${attempts}/${input.maxRetries} for NAS ${input.id}`);
        
        vpnLocalIp = await sshVpn.getVpnUserLocalIp(nas.vpnUsername);
        
        if (!vpnLocalIp && attempts < input.maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, input.retryDelayMs));
        }
      }
      
      if (!vpnLocalIp) {
        return { 
          success: false, 
          message: `فشل المزامنة بعد ${attempts} محاولات. تأكد من اتصال VPN.`,
          attempts
        };
      }
      
      // Update nasname with actual VPN IP
      await nasDb.updateNas(input.id, { ipAddress: vpnLocalIp });
      
      // Also update vpnTunnelIp field
      const database = await getDb();
      if (database) {
        await database.update(nasDevices)
          .set({ vpnTunnelIp: vpnLocalIp })
          .where(eq(nasDevices.id, input.id));
      }
      
      console.log(`[Auto-Sync] Success for NAS ${input.id}: ${nas.nasname} -> ${vpnLocalIp} (${attempts} attempts)`);
      
      return { 
        success: true, 
        message: `تم المزامنة بنجاح: ${vpnLocalIp}`,
        previousNasname: nas.nasname,
        newNasname: vpnLocalIp,
        attempts
      };
    });

  // Get health status for all NAS devices
export const getHealthStatus = superAdminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { devices: [], lastChecked: new Date() };
      
      // Get all NAS devices
      const devices = await db.select().from(nasDevices);
      
      // Get active sessions count per NAS — Phase 2C: online_sessions is the primary realtime source
      const sessionCounts = await db.select({
        nasipaddress: onlineSessions.nasIp,
        count: count(),
      })
        .from(onlineSessions)
        .groupBy(onlineSessions.nasIp);
      
      const sessionMap = new Map<string, number>(sessionCounts.map((s: any) => [String(s.nasipaddress), Number(s.count)]));

      // Build health status for each device
      const healthDevices = devices.map((device: any) => {
        // Determine status based on last activity
        let status: 'online' | 'offline' | 'warning' | 'unknown' = 'unknown';
        // Use resolveNasSessionCount: tries nasname, allocatedIp, vpnTunnelIp, publicIp
        const activeSessions = mikrotikApi.resolveNasSessionCount(device, sessionMap);
        
        // If device has active sessions, it's online
        if (activeSessions > 0) {
          status = 'online';
        } else if (device.connectionType !== 'public_ip') {
          // VPN devices - check if VPN tunnel IP is set
          if (device.vpnTunnelIp) {
            status = 'online';
          } else {
            status = 'offline';
          }
        } else {
          // Public IP devices - assume online if configured
          status = device.nasname ? 'online' : 'offline';
        }
        
        return {
          id: device.id,
          shortname: device.shortname || device.nasname,
          nasname: device.nasname,
          description: device.description,
          connectionType: device.connectionType,
          status,
          lastSeen: device.updatedAt,
          responseTime: null, // Would need actual ping
          activeSessions,
          uptime: null,
          cpuUsage: null,
          memoryUsage: null,
          lastChecked: new Date(),
        };
      });
      
      return {
        devices: healthDevices,
        lastChecked: new Date(),
      };
    });

  // Get VPN IP Pool statistics
export const getVpnIpPoolStats = superAdminProcedure
    .query(async () => {
      const stats = await vpnIpPool.getPoolStats();
      if (!stats) {
        return {
          hasPool: false,
          message: 'لا يوجد IP Pool نشط'
        };
      }
      return {
        hasPool: true,
        totalIps: stats.totalIps,
        allocatedCount: stats.allocatedCount,
        availableCount: stats.availableCount,
        pool: stats.pool
      };
    });

  // Get allocated IP for a specific NAS
export const getAllocatedVpnIp = protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .query(async ({ ctx, input }) => {
      const nas = await nasDb.getNasById(input.nasId);
      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS device not found" });
      if (!hasEffectiveNasOwnership(ctx.user, nas)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      const allocatedIp = await vpnIpPool.getAllocatedIpForNas(input.nasId);
      return {
        nasId: input.nasId,
        allocatedIp,
        nasname: nas.nasname,
        isVpn: nas.connectionType !== 'public_ip'
      };
    });

  // Get all allocated VPN IPs with NAS details
export const getAllAllocatedVpnIps = superAdminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { allocations: [], pool: null };
      
      const { allocatedVpnIps, vpnIpPool: vpnIpPoolTable } = await import('../../../drizzle/schema');
      
      // Get pool info
      const pools = await db.select()
        .from(vpnIpPoolTable)
        .where(eq(vpnIpPoolTable.isActive, true))
        .limit(1);
      const pool = pools[0] || null;
      
      // Get all allocations with NAS details
      const allocations = await db.select({
        id: allocatedVpnIps.id,
        ipAddress: allocatedVpnIps.ipAddress,
        nasId: allocatedVpnIps.nasId,
        allocatedAt: allocatedVpnIps.allocatedAt,
        nasShortname: nasDevices.shortname,
        nasDescription: nasDevices.description,
        connectionType: nasDevices.connectionType,
        vpnUsername: nasDevices.vpnUsername,
        ownerId: nasDevices.ownerId,
      })
        .from(allocatedVpnIps)
        .leftJoin(nasDevices, eq(allocatedVpnIps.nasId, nasDevices.id))
        .orderBy(allocatedVpnIps.ipAddress);
      
      return { allocations, pool };
    });

  // Get available IPs in the pool
export const getAvailableVpnIps = superAdminProcedure
    .query(async () => {
      const stats = await vpnIpPool.getPoolStats();
      if (!stats || !stats.pool) {
        return { availableIps: [], pool: null };
      }
      
      const db = await getDb();
      if (!db) return { availableIps: [], pool: stats.pool };
      
      const { allocatedVpnIps } = await import('../../../drizzle/schema');
      
      // Get all allocated IPs
      const allocated = await db.select({ ipAddress: allocatedVpnIps.ipAddress })
        .from(allocatedVpnIps)
        .where(eq(allocatedVpnIps.poolId, stats.pool.id));
      const allocatedSet = new Set(allocated.map((a: any) => a.ipAddress));
      
      // Generate list of available IPs
      const ipToInt = (ip: string): number => {
        const parts = ip.split('.').map(Number);
        return ((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
      };
      const intToIp = (num: number): string => [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255,
      ].join('.');
      
      const startInt = ipToInt(stats.pool.startIp);
      const endInt = ipToInt(stats.pool.endIp);
      const availableIps: string[] = [];
      
      for (let i = startInt; i <= endInt; i++) {
        const ip = intToIp(i);
        if (!allocatedSet.has(ip)) {
          availableIps.push(ip);
        }
      }
      
      return { availableIps, pool: stats.pool };
    });

  // Manually release an IP
export const releaseVpnIp = superAdminProcedure
    .input(z.object({ nasId: z.number() }))
    .mutation(async ({ input }) => {
      const released = await vpnIpPool.releaseIpForNas(input.nasId);
      return { success: released, message: released ? 'تم تحرير الـ IP بنجاح' : 'فشل تحرير الـ IP' };
    });

  // Update pool configuration
export const updateVpnIpPool = superAdminProcedure
    .input(z.object({
      poolId: z.number(),
      name: z.string().optional(),
      startIp: z.string().optional(),
      endIp: z.string().optional(),
      gateway: z.string().optional(),
      subnet: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { poolId, ...data } = input;
      const updated = await vpnIpPool.updatePool(poolId, data);
      return { success: updated, message: updated ? 'تم تحديث إعدادات الـ Pool' : 'فشل التحديث' };
    });

  // Create a new IP pool
export const createVpnIpPool = superAdminProcedure
    .input(z.object({
      name: z.string().default('Default VPN Pool'),
      startIp: z.string(),
      endIp: z.string(),
      gateway: z.string().default('192.168.30.1'),
      subnet: z.string().default('255.255.255.0'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { vpnIpPool: vpnIpPoolTable } = await import('../../../drizzle/schema');
      
      // Deactivate any existing pools
      await db.update(vpnIpPoolTable)
        .set({ isActive: false });
      
      // Create new pool
      const result = await db.insert(vpnIpPoolTable).values({
        name: input.name,
        startIp: input.startIp,
        endIp: input.endIp,
        gateway: input.gateway,
        subnet: input.subnet,
        isActive: true,
      });
      
      return { success: true, poolId: Number((result as any)[0]?.insertId || 0), message: 'تم إنشاء الـ Pool بنجاح' };
    });

  // ============================================================================
  // TWO-PHASE AUTO PROVISIONING ENDPOINTS
  // ============================================================================

  // Get provisioning status for a NAS
