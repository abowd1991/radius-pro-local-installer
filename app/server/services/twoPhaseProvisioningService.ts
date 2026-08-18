/**
 * Two-Phase NAS Provisioning Service
 * 
 * This service handles the enterprise-standard two-phase provisioning for VPN-connected NAS devices:
 * 
 * Phase 1 (Create NAS):
 * - nasname = 'pending'
 * - status = 'pending' (FreeRADIUS won't load it)
 * - provisioningStatus = 'pending'
 * - VPN user created in SoftEther
 * 
 * Phase 2 (First VPN Connect):
 * - Read actual IP from VPN session
 * - Read MAC from DHCP leases
 * - Create DHCP reservation (MAC → actual IP)
 * - Update nasname = actual IP
 * - Update status = 'active', provisioningStatus = 'ready'
 * - Reload FreeRADIUS
 * 
 * Security:
 * - FreeRADIUS only accepts NAS with status='active' AND provisioningStatus='ready'
 * - Pending NAS cannot authenticate
 * 
 * Idempotency:
 * - Check if reservation already exists before creating
 * - Rate-limit reload calls (30 seconds minimum)
 * - Don't update nasname if already 'ready' unless IP actually changed
 */

import * as nasDb from '../db/nas';
import * as sshVpn from './sshVpnService';
import * as freeradiusService from './freeradiusService';
import * as ipPoolManager from './ipPoolManager';
import * as dhcpLeaseManager from './dhcpLeaseManager';
import { enableWinboxForward, disableWinboxForward } from './winboxService';
import { getDb } from '../db';
import { nasDevices, allocatedVpnIps } from '../../drizzle/schema';
import { eq, and, ne } from 'drizzle-orm';

// Rate limiting for FreeRADIUS reload
let lastReloadTime = 0;
const RELOAD_RATE_LIMIT_MS = 30000; // 30 seconds

/**
 * Rate-limited FreeRADIUS reload
 * Prevents excessive reloads that could disrupt service
 */
export async function rateLimitedReload(): Promise<{ success: boolean; message: string; skipped?: boolean }> {
  const now = Date.now();
  const timeSinceLastReload = now - lastReloadTime;
  
  if (timeSinceLastReload < RELOAD_RATE_LIMIT_MS) {
    const waitTime = Math.ceil((RELOAD_RATE_LIMIT_MS - timeSinceLastReload) / 1000);
    console.log(`[Provisioning] Skipping reload - rate limited (${waitTime}s remaining)`);
    return { success: true, message: `Rate limited, next reload in ${waitTime}s`, skipped: true };
  }
  
  const result = await freeradiusService.reloadFreeRADIUS();
  if (result.success) {
    lastReloadTime = now;
  }
  
  return result;
}

/**
 * Check if DHCP reservation already exists for this NAS
 * @deprecated Use dhcpLeaseManager.listStaticLeases() directly instead
 */
export async function checkExistingReservation(nasId: number): Promise<{
  exists: boolean;
  hostname?: string;
  macAddress?: string;
  ipAddress?: string;
}> {
  try {
    const leases = await dhcpLeaseManager.listStaticLeases();
    const hostname = `nas-${nasId}`;
    const existing = leases.find(l => l.hostname === hostname);
    
    if (existing) {
      return {
        exists: true,
        hostname: existing.hostname,
        macAddress: existing.mac,
        ipAddress: existing.ip,
      };
    }
    
    return { exists: false };
  } catch (error) {
    console.error('[Provisioning] Error checking existing reservation:', error);
    return { exists: false };
  }
}

/**
 * Complete Phase 2 provisioning for a NAS device
 * Called when VPN connection is detected
 */
export async function completeProvisioning(
  nasId: number,
  vpnUsername: string
): Promise<{
  success: boolean;
  message: string;
  actualIp?: string;
  macAddress?: string;
}> {
  console.log(`[Provisioning] Starting Phase 2 for NAS ${nasId} (VPN user: ${vpnUsername})`);
  
  // 1. Get NAS from database
  const nas = await nasDb.getNasById(nasId);
  if (!nas) {
    return { success: false, message: 'NAS not found' };
  }
  
  // 2. Get session info (MAC and IP) from VPN first to check if IP matches
  const sessionInfo = await sshVpn.getSessionMac(vpnUsername);
  if (!sessionInfo.success || !sessionInfo.macAddress || !sessionInfo.ipAddress) {
    console.log(`[Provisioning] VPN session not found for ${vpnUsername}`);
    return { success: false, message: 'VPN session not found or no MAC/IP available' };
  }
  
  const actualIp = sessionInfo.ipAddress;
  const macAddress = sessionInfo.macAddress;
  
  console.log(`[Provisioning] Found session: IP=${actualIp}, MAC=${macAddress}`);
  
  // 3. Check if already provisioned WITH CORRECT IP (idempotency)
  if (nas.provisioningStatus === 'ready' && nas.status === 'active' && nas.nasname === actualIp) {
    console.log(`[Provisioning] NAS ${nasId} already provisioned with correct IP ${nas.nasname}`);
    return { success: true, message: 'Already provisioned', actualIp: nas.nasname, macAddress: nas.lastMac || undefined };
  }
  
  // If IP mismatch, we need to re-provision
  if (nas.nasname !== 'pending' && nas.nasname !== actualIp) {
    console.log(`[Provisioning] IP MISMATCH for NAS ${nasId}: DB has ${nas.nasname}, VPN has ${actualIp}. Re-provisioning...`);
  }
  
  // 4. Check if DHCP reservation already exists (idempotency)
  const hostname = `nas-${nasId}`;
  const existingLeases = await dhcpLeaseManager.listStaticLeases();
  const existingReservation = existingLeases.find(l => l.hostname === hostname);
  
  if (existingReservation) {
    console.log(`[Provisioning] DHCP reservation already exists for NAS ${nasId}`);
    
    // If reservation exists but with different IP, we need to handle this
    if (existingReservation.ip !== actualIp) {
      console.log(`[Provisioning] WARNING: Existing reservation IP (${existingReservation.ip}) differs from current IP (${actualIp})`);
      // Delete old reservation and create new one
      await dhcpLeaseManager.removeStaticLease(existingReservation.mac);
    } else {
      // Reservation exists with correct IP, just update database
      await nasDb.finalizeNasProvisioning(nasId, actualIp, macAddress);
      await rateLimitedReload();
      return { success: true, message: 'Provisioning completed (reservation existed)', actualIp, macAddress };
    }
  }
  
  // 5. Create DHCP reservation using dhcpLeaseManager
  try {
    await dhcpLeaseManager.addStaticLease(macAddress, actualIp, hostname);
    console.log(`[Provisioning] DHCP reservation created: ${macAddress} -> ${actualIp}`);
  } catch (error: any) {
    console.error(`[Provisioning] Failed to create DHCP reservation:`, error.message);
    await nasDb.markNasProvisioningError(nasId, `DHCP reservation failed: ${error.message}`);
    return { success: false, message: `DHCP reservation failed: ${error.message}` };
  }
  
  // 6. Update NAS in database (nasname = actual IP, status = active)
  const finalizeResult = await nasDb.finalizeNasProvisioning(nasId, actualIp, macAddress);
  if (!finalizeResult.success) {
    return { success: false, message: finalizeResult.message };
  }
  
  // 7. Update allocated_vpn_ips table if needed
  const db = await getDb();
  if (db) {
    try {
      // Check if there's an existing allocation
      const existingAllocation = await db.select()
        .from(allocatedVpnIps)
        .where(eq(allocatedVpnIps.nasId, nasId))
        .limit(1);
      
      if (existingAllocation.length > 0 && existingAllocation[0].ipAddress !== actualIp) {
        // Update to actual IP
        await db.update(allocatedVpnIps)
          .set({ ipAddress: actualIp })
          .where(eq(allocatedVpnIps.nasId, nasId));
        console.log(`[Provisioning] Updated IP allocation: ${existingAllocation[0].ipAddress} -> ${actualIp}`);
      }
    } catch (error) {
      console.error('[Provisioning] Error updating IP allocation:', error);
    }
  }
  
  // 8. Reload FreeRADIUS (rate-limited)
  const reloadResult = await rateLimitedReload();
  console.log(`[Provisioning] FreeRADIUS reload:`, reloadResult.message);

  // 9. Restart Winbox socat if it was enabled (IP may have changed)
  // This prevents port conflicts when same IP is reused by a new NAS
  try {
    const nasAfterProvision = await nasDb.getNasById(nasId);
    if (nasAfterProvision?.winboxEnabled && nasAfterProvision?.winboxPort) {
      console.log(`[Provisioning] Restarting Winbox socat for NAS ${nasId} with new IP ${actualIp}`);
      // Stop old socat first (was pointing to old IP)
      await disableWinboxForward(nasId);
      // Start new socat with updated IP
      const mikrotikPort = nasAfterProvision.mikrotikApiPort || 8291;
      const winboxResult = await enableWinboxForward(nasId, actualIp, nasAfterProvision.winboxPort, mikrotikPort);
      if (winboxResult.success) {
        console.log(`[Provisioning] ✅ Winbox socat restarted: port ${nasAfterProvision.winboxPort} → ${actualIp}:${mikrotikPort}`);
      } else {
        console.error(`[Provisioning] ⚠️ Winbox socat restart failed:`, winboxResult.error);
      }
    }
  } catch (error: any) {
    console.error('[Provisioning] Failed to restart Winbox socat (non-critical):', error.message);
  }
  
  console.log(`[Provisioning] Phase 2 complete for NAS ${nasId}: IP=${actualIp}, MAC=${macAddress}`);
  return { success: true, message: 'Provisioning completed successfully', actualIp, macAddress };
}

/**
 * Background worker to check pending NAS devices
 * This runs periodically to catch any NAS that connected while we weren't watching
 * Also checks active NAS devices that might need DHCP reservation fix
 */
export async function checkPendingNasDevices(): Promise<void> {
  // 1. Check pending NAS devices
  const pendingDevices = await nasDb.getPendingNasDevices();
  console.log(`[Provisioning] Checking ${pendingDevices.length} pending NAS devices...`);
  
  for (const nas of pendingDevices) {
    if (!nas.vpnUsername) continue;
    
    console.log(`[Provisioning] Checking pending NAS ${nas.id} (${nas.vpnUsername})`);
    
    // Try to complete provisioning
    const result = await completeProvisioning(nas.id, nas.vpnUsername);
    
    if (result.success) {
      console.log(`[Provisioning] Successfully provisioned NAS ${nas.id}`);
    } else {
      console.log(`[Provisioning] NAS ${nas.id} not ready: ${result.message}`);
    }
  }
  
  // 2. Check active NAS devices that might need DHCP reservation fix
  await checkActiveNasForDhcpFix();
}

/**
 * Check active NAS devices that are connected but might not have DHCP reservation
 * This fixes the case where NAS was provisioned but DHCP reservation is missing
 */
export async function checkActiveNasForDhcpFix(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Get all active VPN NAS devices
  const activeVpnNas = await db.select().from(nasDevices)
    .where(
      and(
        eq(nasDevices.status, 'active'),
        eq(nasDevices.provisioningStatus, 'ready'),
        ne(nasDevices.connectionType, 'public_ip')
      )
    );
  
  if (activeVpnNas.length === 0) return;
  
  // Get current DHCP reservations
  const reservations = await dhcpLeaseManager.listStaticLeases();
  const existingReservationHostnames = new Set(
    reservations.map(r => r.hostname)
  );
  
  for (const nas of activeVpnNas) {
    if (!nas.vpnUsername) continue;
    
    const hostname = `nas-${nas.id}`;
    
    // Check if DHCP reservation exists
    if (!existingReservationHostnames.has(hostname)) {
      console.log(`[Provisioning] Active NAS ${nas.id} (${nas.shortname}) missing DHCP reservation, checking VPN session...`);
      
      // Try to get MAC from VPN session
      const sessionInfo = await sshVpn.getSessionMac(nas.vpnUsername);
      
      if (sessionInfo.success && sessionInfo.macAddress && sessionInfo.ipAddress) {
        console.log(`[Provisioning] Found VPN session for ${nas.vpnUsername}: IP=${sessionInfo.ipAddress}, MAC=${sessionInfo.macAddress}`);
        
        // Create DHCP reservation using dhcpLeaseManager
        try {
          await dhcpLeaseManager.addStaticLease(
            sessionInfo.macAddress,
            nas.nasname, // Use the IP from database (the one we want to keep)
            hostname
          );
          console.log(`[Provisioning] Created DHCP reservation for NAS ${nas.id}: ${sessionInfo.macAddress} -> ${nas.nasname}`);
          
          // Update lastMac in database
          await db.update(nasDevices)
            .set({ lastMac: sessionInfo.macAddress })
            .where(eq(nasDevices.id, nas.id));
          
          // If current IP doesn't match nasname, disconnect to force reconnect with correct IP
          if (sessionInfo.ipAddress !== nas.nasname) {
            console.log(`[Provisioning] IP mismatch (session: ${sessionInfo.ipAddress}, DB: ${nas.nasname}), disconnecting to force reconnect...`);
            await sshVpn.disconnectVpnSession(nas.vpnUsername);
          }
        } catch (error: any) {
          console.error(`[Provisioning] Failed to create DHCP reservation for NAS ${nas.id}:`, error.message);
        }
      }
    }
  }
}

/**
 * Auto-provision a newly created NAS
 * This is called after NAS creation to wait for VPN connection
 */
export async function autoProvisionNewNas(
  nasId: number,
  vpnUsername: string,
  maxRetries: number = 24,
  retryInterval: number = 5000
): Promise<{
  success: boolean;
  message: string;
  actualIp?: string;
  macAddress?: string;
}> {
  console.log(`[Provisioning] Starting auto-provision for NAS ${nasId} (${vpnUsername})`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[Provisioning] Attempt ${attempt}/${maxRetries} for NAS ${nasId}`);
    
    const result = await completeProvisioning(nasId, vpnUsername);
    
    if (result.success) {
      return result;
    }
    
    // If not found, wait and retry
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
  
  // Mark as error after all retries
  await nasDb.markNasProvisioningError(nasId, `Failed to provision after ${maxRetries} attempts`);
  return { success: false, message: `Failed to provision after ${maxRetries} attempts` };
}

/**
 * Manual trigger for provisioning (for admin use)
 */
export async function manualProvision(nasId: number): Promise<{
  success: boolean;
  message: string;
  actualIp?: string;
  macAddress?: string;
}> {
  const nas = await nasDb.getNasById(nasId);
  if (!nas) {
    return { success: false, message: 'NAS not found' };
  }
  
  if (!nas.vpnUsername) {
    return { success: false, message: 'NAS has no VPN username' };
  }
  
  return completeProvisioning(nasId, nas.vpnUsername);
}
