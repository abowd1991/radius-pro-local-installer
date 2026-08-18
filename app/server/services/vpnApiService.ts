/**
 * VPN API Service
 * 
 * This service communicates with the RADIUS server's VPN API
 * to manage VPN users and sessions automatically.
 */

import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "../_core/env";

// API Configuration — loaded from environment
const DEFAULT_API_URL = ENV.VPS_LEGACY_URL;
const DEFAULT_API_KEY = ENV.VPS_LEGACY_SECRET;

interface VPNApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  users?: string[];
  sessions?: Array<{
    session_name: string;
    username: string;
    source_ip: string;
  }>;
}

// Get API configuration from system settings
async function getApiConfig(): Promise<{ url: string; apiKey: string }> {
  const db = await getDb();
  if (!db) {
    return { url: DEFAULT_API_URL, apiKey: DEFAULT_API_KEY };
  }
  
  const settings = await db.select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'vpn_api_url'));
  
  const apiKeySettings = await db.select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'vpn_api_key'));
  
  return {
    url: settings[0]?.value || DEFAULT_API_URL,
    apiKey: apiKeySettings[0]?.value || DEFAULT_API_KEY,
  };
}

/**
 * Create a VPN user in SoftEther with RADIUS authentication
 */
export async function createVpnUser(
  username: string,
  realname?: string,
  note?: string
): Promise<VPNApiResponse> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/vpn/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
      body: JSON.stringify({
        username,
        realname: realname || 'RADIUS User',
        note: note || 'Auto-created by RADIUS SaaS',
      }),
    });
    
    const data = await response.json();
    console.log(`VPN User Create: ${username}`, data);
    return data;
  } catch (error: any) {
    console.error('VPN API Error (createVpnUser):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * Delete a VPN user from SoftEther
 */
export async function deleteVpnUser(username: string): Promise<VPNApiResponse> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/vpn/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    const data = await response.json();
    console.log(`VPN User Delete: ${username}`, data);
    return data;
  } catch (error: any) {
    console.error('VPN API Error (deleteVpnUser):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * List all VPN users
 */
export async function listVpnUsers(): Promise<VPNApiResponse> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/vpn/users`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('VPN API Error (listVpnUsers):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * Get all active VPN sessions
 */
export async function getVpnSessions(): Promise<VPNApiResponse> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/vpn/sessions`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('VPN API Error (getVpnSessions):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * Disconnect a VPN user session
 */
export async function disconnectVpnSession(username: string): Promise<VPNApiResponse> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/vpn/sessions/${encodeURIComponent(username)}/disconnect`, {
      method: 'POST',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    const data = await response.json();
    console.log(`VPN Session Disconnect: ${username}`, data);
    return data;
  } catch (error: any) {
    console.error('VPN API Error (disconnectVpnSession):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * Send RADIUS CoA Disconnect via API
 */
export async function sendRadiusDisconnect(
  username: string,
  nasIp?: string,
  secret?: string
): Promise<VPNApiResponse> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/radius/disconnect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
      body: JSON.stringify({
        username,
        nas_ip: nasIp || '127.0.0.1',
        secret: secret || 'radius_secret_2024',
      }),
    });
    
    const data = await response.json();
    console.log(`RADIUS Disconnect: ${username}`, data);
    return data;
  } catch (error: any) {
    console.error('VPN API Error (sendRadiusDisconnect):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * Add a RADIUS client (NAS) via API
 */
export async function addRadiusClient(
  name: string,
  ipaddr: string,
  secret: string,
  shortname?: string
): Promise<VPNApiResponse> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/radius/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
      body: JSON.stringify({
        name,
        ipaddr,
        secret,
        shortname: shortname || name,
      }),
    });
    
    const data = await response.json();
    console.log(`RADIUS Client Add: ${name}`, data);
    return data;
  } catch (error: any) {
    console.error('VPN API Error (addRadiusClient):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * Check VPN API health
 */
export async function checkApiHealth(): Promise<VPNApiResponse & { services?: { vpn: string; radius: string } }> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/health`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('VPN API Error (checkApiHealth):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}


/**
 * Get DHCP lease by IP address
 */
export async function getDhcpLease(ip: string): Promise<{
  ip: string;
  mac: string;
  state: string;
  hostname?: string;
  leaseStart?: string;
  leaseEnd?: string;
} | null> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/dhcp/lease?ip=${encodeURIComponent(ip)}`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.log(`DHCP Lease not found for IP: ${ip}`);
      return null;
    }
    
    return data;
  } catch (error: any) {
    console.error('VPN API Error (getDhcpLease):', error);
    return null;
  }
}

/**
 * Get all DHCP leases
 */
export async function getDhcpLeases(): Promise<Array<{
  ip: string;
  mac: string;
  state: string;
  hostname?: string;
}>> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/dhcp/leases`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    const data = await response.json();
    return data.leases || [];
  } catch (error: any) {
    console.error('VPN API Error (getDhcpLeases):', error);
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
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/vpn/dhcp/reservation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
      body: JSON.stringify({
        mac,
        ip,
        hostname,
      }),
    });
    
    const data = await response.json();
    console.log(`DHCP Reservation Create: ${mac} -> ${ip}`, data);
    return data;
  } catch (error: any) {
    console.error('VPN API Error (createDhcpReservation):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * Delete DHCP reservation
 */
export async function deleteDhcpReservation(hostname: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/vpn/dhcp/reservation/${encodeURIComponent(hostname)}`, {
      method: 'DELETE',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    const data = await response.json();
    console.log(`DHCP Reservation Delete: ${hostname}`, data);
    return data;
  } catch (error: any) {
    console.error('VPN API Error (deleteDhcpReservation):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * Reload FreeRADIUS to pick up new NAS clients from database
 * This should be called after adding/updating NAS devices
 */
export async function reloadFreeRadius(): Promise<{ 
  success: boolean; 
  message?: string; 
  error?: string;
  timestamp?: string;
  cooldown?: number;
}> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/radius/reload`, {
      method: 'POST',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    const data = await response.json();
    console.log('FreeRADIUS Reload:', data);
    return data;
  } catch (error: any) {
    console.error('VPN API Error (reloadFreeRadius):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}

/**
 * Get FreeRADIUS service status
 */
export async function getFreeRadiusStatus(): Promise<{ 
  success: boolean; 
  status?: string;
  isActive?: boolean;
  error?: string;
}> {
  try {
    const config = await getApiConfig();
    
    const response = await fetch(`${config.url}/api/radius/status`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
    
    return await response.json();
  } catch (error: any) {
    console.error('VPN API Error (getFreeRadiusStatus):', error);
    return {
      success: false,
      error: error.message || 'Failed to connect to VPN API',
    };
  }
}
