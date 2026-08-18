/**
 * VPN Service
 * 
 * This service manages VPN users via HTTP API running on the RADIUS server.
 * The API uses vpncmd to manage SoftEther VPN users.
 */

import { ENV } from '../_core/env';

// VPN API Configuration — loaded from environment
const VPN_API_URL = ENV.VPS_LEGACY_URL;
const API_KEY = ENV.VPS_LEGACY_SECRET;

interface VPNResult {
  success: boolean;
  message?: string;
  error?: string;
  assignedIp?: string;
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
  
  console.log(`[VPN API] ${method} ${url}`);
  
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
    console.log(`[VPN API] Response:`, data);
    return data;
  } catch (error: any) {
    console.error(`[VPN API] Error:`, error.message);
    throw error;
  }
}

/**
 * Create a VPN user in SoftEther with Password authentication
 * @param username - VPN username
 * @param password - VPN password
 * @param staticIp - Optional static IP to assign to this user from the VPN Pool
 */
export async function createVpnUser(username: string, password: string, staticIp?: string, connectionType?: string): Promise<VPNResult> {
  try {
    console.log(`[VPN API] Creating VPN user: ${username}${staticIp ? ` with static IP: ${staticIp}` : ''} (type: ${connectionType || 'l2tp'})`);
    
    const requestBody: { username: string; password: string; staticIp?: string; connectionType?: string } = {
      username,
      password,
      connectionType: connectionType || 'l2tp',
    };
    
    // Add static IP if provided - this will be used to assign a fixed IP
    if (staticIp) {
      requestBody.staticIp = staticIp;
    }
    
    const result = await apiRequest('/api/vpn/users', 'POST', requestBody);
    
    if (result.success) {
      console.log(`[VPN API] User ${username} created successfully${staticIp ? ` with IP ${staticIp}` : ''} assignedIp=${result.assignedIp || ''}`);
      return { success: true, message: result.message, assignedIp: result.assignedIp };
    } else {
      console.error(`[VPN API] Failed to create user:`, result.error);
      return { success: false, error: result.error || 'Failed to create user' };
    }
  } catch (error: any) {
    console.error('[VPN API] Error creating user:', error.message);
    return { success: false, error: error.message || 'Failed to create VPN user' };
  }
}

/**
 * Delete a VPN user from SoftEther
 */
export async function deleteVpnUser(username: string): Promise<VPNResult> {
  try {
    console.log(`[VPN API] Deleting VPN user: ${username}`);
    
    const result = await apiRequest(`/api/vpn/users/${encodeURIComponent(username)}`, 'DELETE');
    
    if (result.success) {
      return { success: true, message: result.message };
    } else {
      return { success: false, error: result.error || 'Failed to delete user' };
    }
  } catch (error: any) {
    console.error('[VPN API] Error deleting user:', error.message);
    return { success: false, error: error.message || 'Failed to delete VPN user' };
  }
}

/**
 * List all VPN users
 */
export async function listVpnUsers(): Promise<VPNResult & { users?: string[] }> {
  try {
    const result = await apiRequest('/api/vpn/users', 'GET');
    
    if (result.success) {
      // Parse user list from output
      const users: string[] = [];
      if (result.output) {
        const lines = result.output.split('\n');
        for (const line of lines) {
          if (line.includes('User Name') && line.includes('|')) {
            const parts = line.split('|');
            if (parts.length >= 2) {
              const userName = parts[1]?.trim();
              if (userName && userName !== 'Value') {
                users.push(userName);
              }
            }
          }
        }
      }
      return { success: true, users };
    }
    return { success: false, error: result.error };
  } catch (error: any) {
    console.error('[VPN API] Error listing users:', error.message);
    return { success: false, error: error.message || 'Failed to list VPN users' };
  }
}

/**
 * Disconnect a VPN session (placeholder - needs implementation on API side)
 */
export async function disconnectVpnSession(username: string): Promise<VPNResult> {
  console.log(`[VPN API] Disconnect session for ${username} - not implemented yet`);
  return { success: true, message: 'Session disconnect not implemented' };
}

/**
 * Get active VPN sessions (placeholder - needs implementation on API side)
 */
export async function getVpnSessions(): Promise<VPNResult & { sessions?: Array<{ session_name: string; username: string; source_ip: string }> }> {
  return { success: true, sessions: [] };
}

/**
 * Check if VPN API is working
 */
export async function checkConnection(): Promise<VPNResult> {
  try {
    const response = await fetch(`${VPN_API_URL}/health`);
    const data = await response.json();
    
    if (data.status === 'ok') {
      return { success: true, message: 'VPN API connection working' };
    }
    return { success: false, error: 'VPN API not responding correctly' };
  } catch (error: any) {
    return { success: false, error: error.message || 'VPN API connection failed' };
  }
}

/**
 * Check if a VPN user exists
 */
export async function userExists(username: string): Promise<boolean> {
  try {
    const result = await listVpnUsers();
    if (result.success && result.users) {
      return result.users.includes(username);
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Get active VPN sessions
 */
export async function getVpnSessionsFromServer(): Promise<VPNResult & { sessions?: any[], count?: number }> {
  try {
    const result = await apiRequest('/api/vpn/sessions', 'GET');
    
    if (result.success) {
      // Filter out local bridge sessions
      const userSessions = (result.sessions || []).filter(
        (s: any) => s.username && s.username !== 'Local Bridge'
      );
      return { success: true, sessions: userSessions, count: userSessions.length };
    }
    return { success: false, error: result.error, sessions: [], count: 0 };
  } catch (error: any) {
    console.error('[VPN API] Error getting sessions:', error.message);
    return { success: false, error: error.message, sessions: [], count: 0 };
  }
}

/**
 * Get VPN connection logs
 */
export async function getVpnLogs(): Promise<VPNResult & { logs?: any[] }> {
  try {
    const result = await apiRequest('/api/vpn/logs', 'GET');
    
    if (result.success) {
      return { success: true, logs: result.logs || [] };
    }
    return { success: false, error: result.error, logs: [] };
  } catch (error: any) {
    console.error('[VPN API] Error getting logs:', error.message);
    return { success: false, error: error.message, logs: [] };
  }
}

/**
 * Get VPN server status
 */
export async function getVpnStatus(): Promise<VPNResult & { status?: any }> {
  try {
    const result = await apiRequest('/api/vpn/status', 'GET');
    
    if (result.success) {
      return { success: true, status: result.status };
    }
    return { success: false, error: result.error };
  } catch (error: any) {
    console.error('[VPN API] Error getting status:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Disconnect a VPN session
 */
export async function disconnectSession(sessionName: string): Promise<VPNResult> {
  try {
    const result = await apiRequest(`/api/vpn/sessions/${encodeURIComponent(sessionName)}`, 'DELETE');
    
    if (result.success) {
      return { success: true, message: result.message };
    }
    return { success: false, error: result.error };
  } catch (error: any) {
    console.error('[VPN API] Error disconnecting session:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Disconnect all sessions for a user
 */
export async function disconnectUserSessions(username: string): Promise<VPNResult> {
  try {
    const result = await apiRequest(`/api/vpn/user/${encodeURIComponent(username)}/disconnect`, 'POST');
    
    if (result.success) {
      return { success: true, message: result.message };
    }
    return { success: false, error: result.error };
  } catch (error: any) {
    console.error('[VPN API] Error disconnecting user sessions:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get sessions for a specific user
 */
export async function getUserSessions(username: string): Promise<VPNResult & { sessions?: any[], connected?: boolean }> {
  try {
    const result = await apiRequest(`/api/vpn/user/${encodeURIComponent(username)}/sessions`, 'GET');
    
    if (result.success) {
      return { success: true, sessions: result.sessions || [], connected: result.connected };
    }
    return { success: false, error: result.error, sessions: [], connected: false };
  } catch (error: any) {
    console.error('[VPN API] Error getting user sessions:', error.message);
    return { success: false, error: error.message, sessions: [], connected: false };
  }
}

/**
 * Get the local IP address for a VPN user (the IP they got from DHCP)
 * This is used to connect to MikroTik API via VPN tunnel
 */
export async function getVpnUserLocalIp(username: string): Promise<string | null> {
  try {
    const result = await getVpnSessionsFromServer();
    
    if (result.success && result.sessions) {
      // Find the session for this username
      const session = result.sessions.find(
        (s: any) => s.username?.toLowerCase() === username.toLowerCase()
      );
      
      if (session && session.localIp) {
        // Filter out IPv6 addresses (fe80::...)
        if (!session.localIp.startsWith('fe80:')) {
          console.log(`[VPN API] Found local IP for ${username}: ${session.localIp}`);
          return session.localIp;
        }
      }
    }
    
    console.log(`[VPN API] No local IP found for ${username}`);
    return null;
  } catch (error: any) {
    console.error('[VPN API] Error getting user local IP:', error.message);
    return null;
  }
}


// ============================================
// Phase 2: DHCP Reservation Auto-Provisioning
// ============================================

interface SessionMacResult {
  success: boolean;
  username?: string;
  sessionName?: string;
  macAddress?: string;
  ipAddress?: string;
  error?: string;
}

interface DhcpReservationResult {
  success: boolean;
  hostname?: string;
  macAddress?: string;
  ipAddress?: string;
  message?: string;
  error?: string;
}

/**
 * Get MAC address from active VPN session by username
 */
export async function getSessionMac(username: string): Promise<SessionMacResult> {
  try {
    const result = await apiRequest(`/api/vpn/session/${encodeURIComponent(username)}/mac`, 'GET');
    return result;
  } catch (error: any) {
    console.error('[VPN API] Error getting session MAC:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Create DHCP reservation for a MAC address
 */
export async function createDhcpReservation(
  macAddress: string,
  ipAddress: string,
  hostname: string
): Promise<DhcpReservationResult> {
  try {
    const result = await apiRequest('/api/vpn/dhcp/reservation', 'POST', {
      macAddress,
      ipAddress,
      hostname,
    });
    return result;
  } catch (error: any) {
    console.error('[VPN API] Error creating DHCP reservation:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * List all DHCP reservations
 */
export async function listDhcpReservations(): Promise<VPNResult & { reservations?: Array<{ hostname: string; macAddress: string; ipAddress: string }> }> {
  try {
    const result = await apiRequest('/api/vpn/dhcp/reservations', 'GET');
    return result;
  } catch (error: any) {
    console.error('[VPN API] Error listing DHCP reservations:', error.message);
    return { success: false, error: error.message, reservations: [] };
  }
}

/**
 * Delete DHCP reservation by hostname
 */
export async function deleteDhcpReservation(hostname: string): Promise<VPNResult> {
  try {
    const result = await apiRequest(`/api/vpn/dhcp/reservation/${encodeURIComponent(hostname)}`, 'DELETE');
    return result;
  } catch (error: any) {
    console.error('[VPN API] Error deleting DHCP reservation:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Auto-provision DHCP reservation for a NAS after VPN connection
 * This function:
 * 1. Waits for VPN session to be established
 * 2. Reads MAC address from the session
 * 3. Creates DHCP reservation for the assigned IP
 * 
 * @param vpnUsername - The VPN username
 * @param staticIp - The static IP assigned to this NAS
 * @param nasId - The NAS ID for hostname
 * @param maxRetries - Maximum number of retries (default: 12)
 * @param retryInterval - Interval between retries in ms (default: 5000)
 */
export async function autoProvisionDhcpReservation(
  vpnUsername: string,
  staticIp: string,
  nasId: number,
  maxRetries: number = 12,
  retryInterval: number = 5000
): Promise<DhcpReservationResult> {
  const hostname = `nas-${nasId}`;
  
  console.log(`[VPN API] Starting DHCP auto-provision for ${vpnUsername} (${hostname}) -> ${staticIp}`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[VPN API] Attempt ${attempt}/${maxRetries} to get MAC for ${vpnUsername}`);
    
    try {
      // Try to get MAC from session
      const macResult = await getSessionMac(vpnUsername);
      
      if (macResult.success && macResult.macAddress) {
        console.log(`[VPN API] Found MAC: ${macResult.macAddress} for ${vpnUsername}`);
        
        // Create DHCP reservation
        const reservationResult = await createDhcpReservation(
          macResult.macAddress,
          staticIp,
          hostname
        );
        
        if (reservationResult.success) {
          console.log(`[VPN API] DHCP reservation created: ${macResult.macAddress} -> ${staticIp}`);
          return reservationResult;
        } else if (reservationResult.error?.includes('already exists')) {
          console.log(`[VPN API] DHCP reservation already exists for ${hostname}`);
          return { success: true, message: 'Reservation already exists', hostname, macAddress: macResult.macAddress, ipAddress: staticIp };
        } else {
          console.error(`[VPN API] Failed to create reservation:`, reservationResult.error);
          return reservationResult;
        }
      }
      
      // Wait before next attempt
      if (attempt < maxRetries) {
        console.log(`[VPN API] Session not found, waiting ${retryInterval}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    } catch (error: any) {
      console.error(`[VPN API] Error in attempt ${attempt}:`, error.message);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
  }
  
  console.error(`[VPN API] Failed to provision DHCP after ${maxRetries} attempts`);
  return { success: false, error: `Failed to find VPN session after ${maxRetries} attempts` };
}
