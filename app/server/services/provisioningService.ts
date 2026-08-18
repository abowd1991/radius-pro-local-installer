/**
 * Two-Phase Auto Provisioning Service
 * 
 * This service handles automatic IP provisioning for NAS devices connected via VPN.
 * 
 * Flow:
 * 1. Create NAS → allocate IP from Pool → status = 'pending'
 * 2. First VPN connection → MikroTik gets temp IP from DHCP
 * 3. System reads MAC from DHCP leases (via vpnUsername)
 * 4. System creates DHCP reservation (MAC → allocatedIp)
 * 5. System disconnects VPN session → reconnect
 * 6. Verify: MikroTik now has allocatedIp → status = 'ready'
 */

import { getDb } from '../db';
import { nasDevices } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { ENV } from '../_core/env';
import { isJobEnabled } from './cronJobGuard';

// VPN API Configuration — loaded from environment
const VPN_API_URL = ENV.VPS_LEGACY_URL;
const API_KEY = ENV.VPS_LEGACY_SECRET;

interface ProvisioningResult {
  success: boolean;
  message: string;
  nasId?: number;
  allocatedIp?: string;
  mac?: string;
  error?: string;
}

interface DhcpLease {
  ip: string;
  mac: string;
  state: string;
  hostname?: string;
  leaseStart?: string;
  leaseEnd?: string;
}

interface VpnSession {
  sessionName: string;
  username: string;
  localIp: string;
  clientIp?: string;
  connectedAt?: string;
}

/**
 * Make HTTP request to VPN API
 */
async function apiRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: object
): Promise<any> {
  const url = `${VPN_API_URL}${endpoint}`;
  
  console.log(`[Provisioning API] ${method} ${url}`);
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error(`[Provisioning API] Error:`, error.message);
    throw error;
  }
}

/**
 * Get DHCP lease info by IP address
 */
export async function getDhcpLease(ip: string): Promise<DhcpLease | null> {
  try {
    const result = await apiRequest(`/api/dhcp/lease?ip=${encodeURIComponent(ip)}`);
    
    if (result.success) {
      return {
        ip: result.ip,
        mac: result.mac,
        state: result.state,
        hostname: result.hostname,
        leaseStart: result.leaseStart,
        leaseEnd: result.leaseEnd,
      };
    }
    
    console.log(`[Provisioning] No DHCP lease found for IP ${ip}: ${result.error}`);
    return null;
  } catch (error: any) {
    console.error(`[Provisioning] Error getting DHCP lease:`, error.message);
    return null;
  }
}

/**
 * Get all DHCP leases
 */
export async function getAllDhcpLeases(): Promise<DhcpLease[]> {
  try {
    const result = await apiRequest('/api/dhcp/leases');
    
    if (result.success) {
      return result.leases || [];
    }
    
    return [];
  } catch (error: any) {
    console.error(`[Provisioning] Error getting DHCP leases:`, error.message);
    return [];
  }
}

/**
 * Create DHCP reservation
 */
export async function createDhcpReservation(
  mac: string,
  ip: string,
  hostname: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await apiRequest('/api/vpn/dhcp/reservation', 'POST', {
      macAddress: mac,
      ipAddress: ip,
      hostname,
    });
    
    if (result.success) {
      console.log(`[Provisioning] DHCP reservation created: ${mac} -> ${ip}`);
      return { success: true, message: result.message };
    }
    
    console.error(`[Provisioning] Failed to create DHCP reservation: ${result.error}`);
    return { success: false, message: result.error || 'Failed to create reservation' };
  } catch (error: any) {
    console.error(`[Provisioning] Error creating DHCP reservation:`, error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Get VPN sessions
 */
export async function getVpnSessions(): Promise<VpnSession[]> {
  try {
    const result = await apiRequest('/api/vpn/sessions');
    
    if (result.success) {
      // Filter out local bridge sessions
      return (result.sessions || []).filter(
        (s: any) => s.username && s.username !== 'Local Bridge'
      );
    }
    
    return [];
  } catch (error: any) {
    console.error(`[Provisioning] Error getting VPN sessions:`, error.message);
    return [];
  }
}

/**
 * Find VPN session by username
 */
export async function findVpnSession(vpnUsername: string): Promise<VpnSession | null> {
  const sessions = await getVpnSessions();
  
  const session = sessions.find(
    (s) => s.username?.toLowerCase() === vpnUsername.toLowerCase()
  );
  
  return session || null;
}

/**
 * Disconnect VPN session
 */
export async function disconnectVpnSession(sessionName: string): Promise<boolean> {
  try {
    const result = await apiRequest(`/api/vpn/sessions/${encodeURIComponent(sessionName)}`, 'DELETE');
    
    if (result.success) {
      console.log(`[Provisioning] VPN session disconnected: ${sessionName}`);
      return true;
    }
    
    console.error(`[Provisioning] Failed to disconnect VPN session: ${result.error}`);
    return false;
  } catch (error: any) {
    console.error(`[Provisioning] Error disconnecting VPN session:`, error.message);
    return false;
  }
}

/**
 * Main provisioning function for a NAS device
 */
export async function provisionNas(nasId: number): Promise<ProvisioningResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, message: 'Database not available' };
  }
  
  // Get NAS device
  const [nasDevice] = await db.select().from(nasDevices).where(eq(nasDevices.id, nasId));
  
  if (!nasDevice) {
    return { success: false, message: 'NAS device not found' };
  }
  
  // Check if already provisioned
  if (nasDevice.provisioningStatus === 'ready') {
    return { success: true, message: 'NAS already provisioned', nasId, allocatedIp: nasDevice.allocatedIp || undefined };
  }
  
  // Check if VPN type
  if (nasDevice.connectionType === 'public_ip') {
    // Public IP doesn't need provisioning
    await db.update(nasDevices)
      .set({ provisioningStatus: 'ready', provisionedAt: new Date() } as any)
      .where(eq(nasDevices.id, nasId));
    return { success: true, message: 'Public IP NAS marked as ready', nasId };
  }
  
  // Update status to provisioning
  await db.update(nasDevices)
    .set({ provisioningStatus: 'provisioning' } as any)
    .where(eq(nasDevices.id, nasId));
  
  try {
    // Step 1: Find VPN session by username
    if (!nasDevice.vpnUsername) {
      throw new Error('VPN username not set for this NAS');
    }
    
    const session = await findVpnSession(nasDevice.vpnUsername);
    
    if (!session) {
      // VPN not connected yet - stay in pending
      await db.update(nasDevices)
        .set({ provisioningStatus: 'pending' } as any)
        .where(eq(nasDevices.id, nasId));
      return { success: false, message: 'VPN not connected yet. Waiting for connection...', nasId };
    }
    
    console.log(`[Provisioning] Found VPN session for ${nasDevice.vpnUsername}: IP=${session.localIp}`);
    
    // Step 2: Get MAC from DHCP lease
    const lease = await getDhcpLease(session.localIp);
    
    if (!lease) {
      throw new Error(`No DHCP lease found for IP ${session.localIp}`);
    }
    
    console.log(`[Provisioning] Found MAC: ${lease.mac} for IP ${session.localIp}`);
    
    // Update last temp IP and MAC
    await db.update(nasDevices)
      .set({ lastTempIp: session.localIp, lastMac: lease.mac } as any)
      .where(eq(nasDevices.id, nasId));
    
    // Step 3: Use the current IP as the final IP (no need to change it)
    // The MikroTik already has an IP from DHCP, we just need to make it permanent
    const finalIp = session.localIp;
    
    // Step 4: Create DHCP reservation for current IP
    const hostname = `nas-${nasDevice.nasname?.replace(/\./g, '')}`;
    const reservationResult = await createDhcpReservation(
      lease.mac,
      finalIp,
      hostname
    );
    
    // If reservation already exists, that's OK
    if (!reservationResult.success && !reservationResult.message.includes('already exists')) {
      throw new Error(`Failed to create DHCP reservation: ${reservationResult.message}`);
    }
    
    // Step 5: Update NAS with the actual IP
    await db.update(nasDevices)
      .set({ 
        provisioningStatus: 'ready',
        status: 'active',  // Mark NAS as active after successful provisioning
        provisionedAt: new Date(),
        nasname: finalIp,
        allocatedIp: finalIp,
        lastTempIp: finalIp,
        lastMac: lease.mac,
      } as any)
      .where(eq(nasDevices.id, nasId));
    
    console.log(`[Provisioning] ✅ NAS ${nasId} provisioned successfully with IP ${finalIp}`);
    
    return { 
      success: true, 
      message: 'NAS provisioned successfully', 
      nasId, 
      allocatedIp: finalIp,
      mac: lease.mac 
    };
    
  } catch (error: any) {
    console.error(`[Provisioning] Error provisioning NAS ${nasId}:`, error.message);
    
    await db.update(nasDevices)
      .set({ 
        provisioningStatus: 'error',
        provisioningError: error.message,
      } as any)
      .where(eq(nasDevices.id, nasId));
    
    return { success: false, message: error.message, nasId, error: error.message };
  }
}

/**
 * Check and provision all pending NAS devices
 */
export async function checkAndProvisionPendingNas(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  // Get all pending/provisioning/error VPN NAS devices
  const pendingNas = await db.select()
    .from(nasDevices)
    .where(eq(nasDevices.provisioningStatus, 'pending'));
  
  const provisioningNas = await db.select()
    .from(nasDevices)
    .where(eq(nasDevices.provisioningStatus, 'provisioning'));
  
  const errorNas = await db.select()
    .from(nasDevices)
    .where(eq(nasDevices.provisioningStatus, 'error'));
  
  const allPending = [...pendingNas, ...provisioningNas, ...errorNas].filter(
    nas => nas.connectionType !== 'public_ip'
  );
  
  console.log(`[Provisioning] Checking ${allPending.length} pending NAS devices...`);
  
  for (const nas of allPending) {
    await provisionNas(nas.id);
  }
}

/**
 * Start provisioning monitor (runs every 30 seconds)
 */
let monitorInterval: NodeJS.Timeout | null = null;

export function startProvisioningMonitor(): void {
  if (monitorInterval) {
    console.log('[Provisioning] Monitor already running');
    return;
  }
  
  console.log('[Provisioning] Starting provisioning monitor...');
  
  // Run immediately
  checkAndProvisionPendingNas();
  
  // Then run every 30 seconds
  monitorInterval = setInterval(async () => {
    if (!(await isJobEnabled("provisioning_monitor"))) return;
    checkAndProvisionPendingNas();
  }, 30000);
}

export function stopProvisioningMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[Provisioning] Monitor stopped');
  }
}
