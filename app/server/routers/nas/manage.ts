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
import { isManagedVpnProtocol } from "../../domains/vpn/VpnNasProvisioningPolicy";
import * as sshVpn from "../../services/sshVpnService";
import { disableWinboxForward } from "../../services/winboxService";
import { isAdmin } from "../../_core/roles";
import { vpnNasProvisioningService } from '../../domains/vpn/VpnNasProvisioningService';
import { vpnNasDeletionService } from '../../domains/vpn/VpnNasDeletionService';
import { invalidateNasListCache } from '../../domains/vpn/NasListCache';
import { portForwardingEngine } from '../../domains/network/PortForwardingEngine';

export const create = activeSubscriptionProcedure
    .input(z.object({
      name: z.string().min(1),
      ipAddress: z.string().min(1),
      secret: z.string().min(1),
      type: z.enum(['mikrotik', 'cisco', 'other']).default('mikrotik'),
      connectionType: z.enum(['public_ip', 'vpn_l2tp', 'vpn_sstp', 'vpn_pptp']).default('public_ip'),
      description: z.string().optional(),
      location: z.string().optional(),
      ports: z.number().optional(),
      // MikroTik API settings (optional - for instant speed changes)
      apiEnabled: z.boolean().optional().default(false),
      mikrotikApiPort: z.number().optional().default(8728),
      mikrotikApiUser: z.string().optional(),
      mikrotikApiPassword: z.string().optional(),
      vpnUsername: z.string().optional(),
      vpnPassword: z.string().optional(),
      lanCidr: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Set ownerId to current user
      const ownerId = ctx.user.id;
      const usesCentralVpnProvisioning = isManagedVpnProtocol(input.connectionType);
      
      // Check billing status - block if past_due
      if (ctx.user.billingStatus === 'past_due') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot create NAS: Your account has insufficient balance. Please add credit to your wallet.',
        });
      }
      
      // For VPN connections, generate unique credentials if not provided
      if (input.connectionType !== 'public_ip') {
        // Generate VPN username if not provided
        if (!input.vpnUsername || input.vpnUsername.trim() === '') {
          const cleanName = input.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
          input.vpnUsername = `${cleanName}-${Date.now().toString(36)}`;
        }
        // Generate VPN password if not provided
        if (!input.vpnPassword || input.vpnPassword.trim() === '') {
          input.vpnPassword = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }

        if (usesCentralVpnProvisioning) {
          // Static-IP-first: final allocation is handled atomically after the NAS record exists.
          input.ipAddress = 'pending'; // Will be updated in Phase 2
        } else {
          // SSTP remains on its already-established provisioning path.
          input.ipAddress = 'pending';
        }

        // Create VPN user in SoftEther (L2TP/SSTP only — PPTP uses pptpd, not SoftEther)
        if (input.connectionType === 'vpn_sstp' && !usesCentralVpnProvisioning) {
        try {
          const vpnConnType = input.connectionType === 'vpn_sstp' ? 'sstp' : 'l2tp';
          console.log(`[Phase 1] Creating VPN user: ${input.vpnUsername} (type: ${vpnConnType})`);
          const vpnResult = await sshVpn.createVpnUser(input.vpnUsername, input.vpnPassword!, undefined, vpnConnType);
          console.log('[Phase 1] VPN User creation result:', vpnResult);
          
          if (!vpnResult.success) {
            console.error('[Phase 1] VPN User creation failed:', vpnResult.error);
          }
        } catch (error) {
          console.error('[Phase 1] Failed to create VPN user:', error);
        }
        
        // Create RADIUS entry for VPN user authentication
        try {
          console.log(`[Phase 1] Creating RADIUS entry for VPN user: ${input.vpnUsername}`);
          const database = await getDb();
          if (database) {
            const existingUser = await database.select()
              .from(radcheck)
              .where(eq(radcheck.username, input.vpnUsername))
              .limit(1);
            
            if (existingUser.length === 0) {
              await database.insert(radcheck).values({
                username: input.vpnUsername,
                attribute: 'Cleartext-Password',
                op: ':=',
                value: input.vpnPassword,
              });
              console.log(`[Phase 1] RADIUS user created: ${input.vpnUsername}`);
            }
          }
        } catch (error) {
          console.error('[Phase 1] Failed to create RADIUS entry:', error);
        }
        } // end if (connectionType !== 'vpn_pptp')

        // For PPTP: create RADIUS entry directly (no SoftEther needed)
        if (input.connectionType === 'vpn_sstp' && !usesCentralVpnProvisioning) {
          try {
            const database = await getDb();
            if (database) {
              const existingUser = await database.select()
                .from(radcheck)
                .where(eq(radcheck.username, input.vpnUsername!))
                .limit(1);
              if (existingUser.length === 0) {
                await database.insert(radcheck).values({
                  username: input.vpnUsername!,
                  attribute: 'Cleartext-Password',
                  op: ':=',
                  value: input.vpnPassword!,
                });
                console.log(`[PPTP Phase 1] RADIUS user created: ${input.vpnUsername}`);
              }
            }
          } catch (error) {
            console.error('[PPTP Phase 1] Failed to create RADIUS entry:', error);
          }
        }
      }
      
      // Create NAS in database
      // For VPN: nasname='pending', status='pending', provisioningStatus='pending'
      // For public_ip: nasname=actual IP, status='active', provisioningStatus='ready'
      const nasInput = { ...input, ownerId };
      const newNas = await nasDb.createNas(nasInput);

      if (usesCentralVpnProvisioning) {
        const provisioning = await vpnNasProvisioningService.provisionNas(newNas.id);
        if (!provisioning.success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: provisioning.error || 'Central VPN provisioning failed',
          });
        }
        await invalidateNasListCache();
        return {
          ...newNas,
          nasname: provisioning.allocatedIp,
          allocatedIp: provisioning.allocatedIp,
          vpnTunnelIp: provisioning.allocatedIp,
          status: 'active',
          provisioningStatus: 'ready',
          message: 'NAS provisioned with a protocol-specific static VPN IP.',
        };
      }
      
      // Auto-activate daily billing for the NAS owner if not already active
      try {
        const { activateDailyBilling } = await import('../../services/billingService.js');
        const dbConn = await getDb();
        if (dbConn) {
          const ownerUser = await dbConn.select().from(users).where(eq(users.id, ownerId)).limit(1);
          if (ownerUser.length > 0 && (!ownerUser[0].dailyBillingEnabled || !ownerUser[0].billingStartAt)) {
            await activateDailyBilling(ownerId, ctx.user.id);
            console.log(`[NAS Create] Auto-activated daily billing for user ${ownerId}`);
          }
        }
      } catch (billingError: any) {
        console.error('[NAS Create] Failed to auto-activate billing:', billingError.message);
      }
      
      await invalidateNasListCache();
      
      console.log(`[Phase 1] NAS created: ID=${newNas.id}, status=${newNas.status}, provisioningStatus=${newNas.provisioningStatus}`);
      
      // For VPN connections, start Phase 2 auto-provisioning in background
      if (input.connectionType === 'vpn_sstp' && !usesCentralVpnProvisioning) {
        if (input.vpnUsername) {
          // Run Phase 2 in background - don't await
          // This will wait for VPN connection, read actual IP, create DHCP reservation, update nasname
          twoPhaseProvisioning.autoProvisionNewNas(
            newNas.id,
            input.vpnUsername,
            60, // 60 retries (5 minutes total)
            5000 // 5 seconds interval
          ).then(result => {
            if (result.success) {
              console.log(`[Phase 2] NAS ${newNas.id} provisioned: IP=${result.actualIp}, MAC=${result.macAddress}`);
            } else {
              console.error(`[Phase 2] NAS ${newNas.id} provisioning failed:`, result.message);
            }
          }).catch(error => {
            console.error(`[Phase 2] Error provisioning NAS ${newNas.id}:`, error);
          });
        }
        
        // Return NAS with inactive status (will be updated when VPN connects)
        return {
          ...newNas,
          nasname: 'pending',
          status: 'inactive',
          provisioningStatus: 'pending',
          message: 'NAS created. Connect VPN to complete provisioning.',
        };
      }

      // PPTP: IP already allocated — finalize provisioning immediately
      if (input.connectionType === 'vpn_pptp' && input.ipAddress && input.ipAddress !== 'pending') {
        const groupname = `owner_${ownerId}`;
        try {
          const database = await getDb();
          if (database) {
            // Update NAS to ready
            await database.execute(
              sql`UPDATE nas SET nasname = ${input.ipAddress}, allocatedIp = ${input.ipAddress}, vpnTunnelIp = ${input.ipAddress}, provisioningStatus = 'ready', status = 'active' WHERE id = ${newNas.id}`
            );
            // Register in radhuntgroup
            await database.execute(
              sql`INSERT INTO radhuntgroup (groupname, nasipaddress) VALUES (${groupname}, ${input.ipAddress}) ON DUPLICATE KEY UPDATE groupname = VALUES(groupname)`
            );
            // Register in radgroupcheck (idempotent)
            await database.execute(
              sql`INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES (${groupname}, 'Huntgroup-Name', '==', ${groupname}) ON DUPLICATE KEY UPDATE value = VALUES(value)`
            );
            console.log(`[PPTP] NAS ${newNas.id} provisioned immediately: IP=${input.ipAddress}`);
          }
        } catch (err) {
          console.error('[PPTP] Failed to finalize provisioning:', err);
        }
        // Reload FreeRADIUS
        twoPhaseProvisioning.rateLimitedReload().catch(() => {});
        return {
          ...newNas,
          nasname: input.ipAddress,
          status: 'active',
          provisioningStatus: 'ready',
          message: 'PPTP NAS created and provisioned successfully.',
        };
      }
      
      // For public_ip connections, reload FreeRADIUS immediately
      twoPhaseProvisioning.rateLimitedReload().then(result => {
        console.log(`[NAS Create] FreeRADIUS reload:`, result.message);
      }).catch(error => {
        console.error(`[NAS Create] Error reloading FreeRADIUS:`, error);
      });

      // Fire-and-forget: fix any missing huntgroup/radgroupcheck entries for this NAS
      autoFixMissingHuntgroups().then(result => {
        if (result.fixed > 0) {
          console.log(`[NAS Create] AutoFix: fixed ${result.fixed} missing huntgroup(s)`);
        }
        if (result.errors.length > 0) {
          console.error(`[NAS Create] AutoFix errors:`, result.errors);
        }
      }).catch(err => {
        console.error('[NAS Create] AutoFix error:', err.message);
      });
      
      return newNas;
    });

  // Get setup scripts for a NAS device - check ownership
export const update = activeSubscriptionProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      ipAddress: z.string().optional(),
      secret: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      status: z.enum(['active', 'inactive']).optional(),
      connectionType: z.enum(['public_ip', 'vpn_l2tp', 'vpn_sstp', 'vpn_pptp']).optional(),
      // MikroTik API settings (optional - for instant speed changes)
      apiEnabled: z.boolean().optional(),
      mikrotikApiPort: z.number().optional(),
      mikrotikApiUser: z.string().optional(),
      mikrotikApiPassword: z.string().optional(),
      lanCidr: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership for non-super_admin
      const nas = await nasDb.getNasById(input.id);
      if (!nas) throw new TRPCError({ code: "NOT_FOUND", message: "NAS device not found" });
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      // If disabling NAS (status changing from active to inactive), cleanup DHCP lease
      if (input.status === 'inactive' && nas.status === 'active') {
        console.log(`[NAS Update] Disabling NAS ${input.id}, cleaning up DHCP lease...`);
        try {
          const lastMac = nas.lastMac;
          if (lastMac) {
            const dhcpLeaseManager = await import('../../services/dhcpLeaseManager');
            await dhcpLeaseManager.removeStaticLease(lastMac);
            console.log(`[NAS Update] DHCP lease removed for MAC: ${lastMac}`);
          }
          
          // Note: We keep allocatedIp in database for re-enabling later
          // IP is only released on full delete, not on disable
        } catch (error) {
          console.error('[NAS Update] Failed to cleanup DHCP lease:', error);
        }
      }
      
      const updatedNas = await nasDb.updateNas(input.id, input);
      
      // Invalidate cache
      const { cache } = await import('../../_core/cache.js');
      cache.deletePattern('nas:*');
      
      // Reload FreeRADIUS to pick up NAS changes
      freeradiusService.reloadFreeRADIUS().then(result => {
        if (result.success) {
          console.log(`[NAS Update] FreeRADIUS reloaded successfully for NAS ${input.id}`);
        } else {
          console.error(`[NAS Update] Failed to reload FreeRADIUS:`, result.message);
        }
      }).catch(error => {
        console.error(`[NAS Update] Error reloading FreeRADIUS:`, error);
      });
      
      return updatedNas;
    });

  // Delete NAS - check ownership (requires active subscription)
export const deleteNas = activeSubscriptionProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership for non-super_admin
      const nasCheck = await nasDb.getNasById(input.id);
      if (!nasCheck) throw new TRPCError({ code: "NOT_FOUND", message: "NAS device not found" });
      if (!isAdmin(ctx.user.role) && nasCheck.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      // Fail closed: close external ingress before deleting the NAS identity.
      await portForwardingEngine.cleanupNas(input.id);
      await vpnNasDeletionService.cleanupBeforeNasDelete(nasCheck);
      // Delete NAS and get VPN username for cleanup
      const result = await nasDb.deleteNas(input.id);
      
      // If NAS had a VPN user, clean up VPN and RADIUS entries
      if (result.vpnUsername) {
        const vpnUsername = result.vpnUsername;
        console.log(`[NAS Delete] Cleaning up VPN user: ${vpnUsername}`);
        
        // VPN V2 identity/session cleanup completed before NAS deletion.
        // Delete DHCP reservation from VPS (Hard Delete - Single Source of Truth)
        try {
          const lastMac = nasCheck.lastMac;
          if (lastMac) {
            console.log(`[NAS Delete] Deleting DHCP reservation for MAC: ${lastMac}`);
            const dhcpLeaseManager = await import('../../services/dhcpLeaseManager');
            await dhcpLeaseManager.removeStaticLease(lastMac);
            console.log(`[NAS Delete] DHCP reservation deleted for MAC: ${lastMac}`);
          } else {
            console.log(`[NAS Delete] No MAC address found, skipping DHCP cleanup`);
          }
        } catch (error) {
          console.error('[NAS Delete] Failed to delete DHCP reservation:', error);
        }
        
        // 5. Release allocated IP back to pool
        try {
          const allocatedIp = nasCheck.allocatedIp;
          if (allocatedIp) {
            console.log(`[NAS Delete] Releasing IP ${allocatedIp} back to pool`);
            const ipPoolManager = await import('../../services/ipPoolManager');
            await ipPoolManager.releaseIP(allocatedIp);
            console.log(`[NAS Delete] IP ${allocatedIp} released successfully`);
          }
        } catch (error) {
          console.error('[NAS Delete] Failed to release IP:', error);
        }
        
        // 6. Release allocated VPN IP from pool (Hard Delete - Single Source of Truth)
        try {
          console.log(`[NAS Delete] Releasing allocated VPN IP for NAS ${input.id}`);
          const database = await getDb();
          if (database) {
            const { allocatedVpnIps } = await import('../../../drizzle/schema');
            await database.delete(allocatedVpnIps).where(eq(allocatedVpnIps.nasId, input.id));
            console.log(`[NAS Delete] Released allocated VPN IP for NAS ${input.id}`);
          }
        } catch (error) {
          console.error('[NAS Delete] Failed to release allocated VPN IP:', error);
        }
      }
      
      // 7. Remove public IP from VPS ipset firewall (for public_ip NAS only)
      try {
        if (nasCheck.connectionType === 'public_ip' && nasCheck.nasname) {
          const publicIp = nasCheck.nasname;
          console.log(`[NAS Delete] Removing public IP ${publicIp} from VPS ipset`);
          const vpsManagementUrl = ENV.VPS_MANAGEMENT_URL;
          const vpsManagementKey = ENV.VPS_MANAGEMENT_API_KEY || ENV.VPS_LEGACY_SECRET;
          await fetch(`${vpsManagementUrl}/api/ipset/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vpsManagementKey}` },
            body: JSON.stringify({ ip: publicIp }),
            signal: AbortSignal.timeout(5000),
          }).then(r => r.json()).then(data => {
            console.log(`[NAS Delete] ipset remove result for ${publicIp}:`, data);
          });
        }
      } catch (error) {
        console.error('[NAS Delete] Failed to remove IP from ipset (non-critical):', error);
      }

      // 8. Disable Winbox socat port forwarding if enabled (Hard Delete - Single Source of Truth)
      // CRITICAL: Must be done before creating new NAS with same IP to avoid port conflicts
      try {
        if (nasCheck.winboxEnabled || nasCheck.winboxPort) {
          console.log(`[NAS Delete] Disabling Winbox socat service for NAS ${input.id} (port: ${nasCheck.winboxPort})`);
          const winboxResult = await disableWinboxForward(input.id);
          if (winboxResult.success) {
            console.log(`[NAS Delete] ✅ Winbox socat service stopped and removed for NAS ${input.id}`);
          } else {
            console.error(`[NAS Delete] ⚠️ Failed to stop Winbox socat for NAS ${input.id}:`, winboxResult.error);
          }
        } else {
          console.log(`[NAS Delete] Winbox not enabled for NAS ${input.id}, skipping socat cleanup`);
        }
      } catch (error) {
        console.error('[NAS Delete] Failed to disable Winbox socat (non-critical):', error);
      }

       // Invalidate cache
      const { cache } = await import('../../_core/cache.js');
      cache.deletePattern('nas:*');
      
      // Reload FreeRADIUS to remove deleted NAS client
      freeradiusService.reloadFreeRADIUS().then(reloadResult => {
        if (reloadResult.success) {
          console.log(`[NAS Delete] FreeRADIUS reloaded successfully after deleting NAS ${input.id}`);
        } else {
          console.error(`[NAS Delete] Failed to reload FreeRADIUS:`, reloadResult.message);
        }
      }).catch(error => {
        console.error(`[NAS Delete] Error reloading FreeRADIUS:`, error);
      });
      
      return { success: true };
    });

  // Bulk Delete NAS devices
export const bulkDeleteNas = protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const results: { id: number; success: boolean; error?: string }[] = [];
      for (const id of input.ids) {
        try {
          const nasCheck = await nasDb.getNasById(id);
          if (!nasCheck) { results.push({ id, success: false, error: 'Not found' }); continue; }
          if (!isAdmin(ctx.user.role) && nasCheck.ownerId !== ctx.user.id) {
            results.push({ id, success: false, error: 'Access denied' }); continue;
          }
          await portForwardingEngine.cleanupNas(id);
          await vpnNasDeletionService.cleanupBeforeNasDelete(nasCheck);
          const result = await nasDb.deleteNas(id);
          if (result.vpnUsername) {
            const vpnUsername = result.vpnUsername;
            try {
              if (nasCheck.lastMac) {
                const dhcpLeaseManager = await import('../../services/dhcpLeaseManager');
                await dhcpLeaseManager.removeStaticLease(nasCheck.lastMac);
              }
            } catch {}
            try {
              if (nasCheck.allocatedIp) {
                const ipPoolManager = await import('../../services/ipPoolManager');
                await ipPoolManager.releaseIP(nasCheck.allocatedIp);
              }
            } catch {}
            try {
              const database = await getDb();
              if (database) {
                const { allocatedVpnIps } = await import('../../../drizzle/schema');
                await database.delete(allocatedVpnIps).where(eq(allocatedVpnIps.nasId, id));
              }
            } catch {}
          }
          // Remove public IP from VPS ipset (for public_ip NAS)
          try {
            if (nasCheck.connectionType === 'public_ip' && nasCheck.nasname) {
              const vpsManagementUrl = ENV.VPS_MANAGEMENT_URL;
              const vpsManagementKey = ENV.VPS_MANAGEMENT_API_KEY || ENV.VPS_LEGACY_SECRET;
              await fetch(`${vpsManagementUrl}/api/ipset/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vpsManagementKey}` },
                body: JSON.stringify({ ip: nasCheck.nasname }),
                signal: AbortSignal.timeout(5000),
              });
            }
          } catch {}
          // Disable Winbox socat port forwarding if enabled (Hard Delete)
          try {
            if (nasCheck.winboxEnabled || nasCheck.winboxPort) {
              await disableWinboxForward(id);
              console.log(`[NAS BulkDelete] ✅ Winbox socat stopped for NAS ${id}`);
            }
          } catch (error) {
            console.error(`[NAS BulkDelete] Failed to disable Winbox socat for NAS ${id}:`, error);
          }
          results.push({ id, success: true });
        } catch (err: any) {
          results.push({ id, success: false, error: err.message });
        }
      }
      try { const { cache } = await import('../../_core/cache.js'); cache.deletePattern('nas:*'); } catch {}
      freeradiusService.reloadFreeRADIUS().catch(() => {});
      const deleted = results.filter(r => r.success).length;
      return { deleted, total: input.ids.length, results };
    });

  // Sync VPN IP - Updates nasname with actual VPN local IP from SoftEther
  // This MUST be called after VPN connects to make RADIUS work
export const retryProvisioning = protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const nas = await nasDb.getNasById(input.nasId);
      if (!nas) throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
      
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      // Only for VPN connections
      if (nas.connectionType === 'public_ip') {
        return { success: false, message: 'Public IP NAS does not need provisioning' };
      }
      
      // All L2TP/PPTP/SSTP NAS types use the same static-IP-first provisioning engine.
      const { vpnNasProvisioningService } = await import('../../domains/vpn/VpnNasProvisioningService');
      const result = await vpnNasProvisioningService.provisionNas(input.nasId);
      
      return result;
    });

  // Trigger provisioning manually (admin only)
export const triggerProvisioning = superAdminProcedure
    .input(z.object({ nasId: z.number() }))
    .mutation(async ({ input }) => {
      const { vpnNasProvisioningService } = await import('../../domains/vpn/VpnNasProvisioningService');
      const result = await vpnNasProvisioningService.provisionNas(input.nasId);
      return result;
    });

  // List all NAS with provisioning status
export const expandIpPool = protectedProcedure
    .input(z.object({
      startIp: z.string().min(7).max(15),
      endIp: z.string().min(7).max(15),
    }))
    .mutation(async ({ ctx, input }) => {
      // Only allow owner/super_admin
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      const ipPoolManager = await import('../../services/ipPoolManager');
      const result = await ipPoolManager.expandIpPool(input.startIp, input.endIp, ctx.user.id);
      
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      }
      
      return result;
    });

  // Re-assign IP for NAS (Admin Only)
export const reassignIp = protectedProcedure
    .input(z.object({
      nasId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Only allow owner/super_admin
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      const ipPoolManager = await import('../../services/ipPoolManager');
      const dhcpLeaseManager = await import('../../services/dhcpLeaseManager');
      
      // Get NAS details
      const db = await getDb();
      const nas = await db.select().from(nasDevices).where(sql`${nasDevices.id} = ${input.nasId}`).limit(1);
      
      if (!nas || nas.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
      }
      
      const currentNas = nas[0];
      const oldIp = currentNas.allocatedIp;
      
      // Remove old DHCP lease if exists
      if (oldIp && currentNas.lastMac) {
        try {
          await dhcpLeaseManager.removeStaticLease(currentNas.lastMac);
        } catch (error) {
          console.error('[NAS] Failed to remove old DHCP lease:', error);
        }
      }
      
      // Re-assign IP
      const result = await ipPoolManager.reassignIpForNAS(input.nasId);
      
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      }
      
      // Create new DHCP lease if MAC exists
      if (result.newIp && currentNas.lastMac) {
        try {
          await dhcpLeaseManager.addStaticLease(
            currentNas.lastMac,
            result.newIp,
            currentNas.shortname || `nas-${input.nasId}`
          );
        } catch (error) {
          console.error('[NAS] Failed to create new DHCP lease:', error);
        }
      }
      
      return result;
    });

  // Toggle NAS Status (Enable/Disable) - Admin Only
  // When disabled: immediately disconnects VPN session
export const toggleNasStatus = protectedProcedure
    .input(z.object({
      nasId: z.number(),
      status: z.enum(['active', 'inactive']),
    }))
    .mutation(async ({ ctx, input }) => {
      // Only allow owner/super_admin
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied - Admin only' });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Get NAS details
      const nasRows = await db.select().from(nasDevices).where(eq(nasDevices.id, input.nasId)).limit(1);
      if (!nasRows || nasRows.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
      }
      const nas = nasRows[0];

      // Update status in database
      await db.update(nasDevices)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(nasDevices.id, input.nasId));

      // If disabling: immediately disconnect VPN session
      if (input.status === 'inactive' && nas.vpnUsername) {
        try {
          await sshVpn.disconnectVpnSession(nas.vpnUsername);
          console.log(`[NAS Toggle] Disconnected VPN session for NAS ${input.nasId} (${nas.vpnUsername})`);
        } catch (error) {
          console.error(`[NAS Toggle] Failed to disconnect VPN session:`, error);
          // Non-critical - status is already updated in DB
        }
      }

      // Invalidate cache
      try {
        const { cache } = await import('../../_core/cache.js');
        cache.deletePattern('nas:*');
      } catch {}

      return {
        success: true,
        nasId: input.nasId,
        status: input.status,
        vpnDisconnected: input.status === 'inactive' && !!nas.vpnUsername,
      };
    });
