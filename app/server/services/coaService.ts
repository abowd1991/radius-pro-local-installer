/**
 * CoA (Change of Authorization) Service
 * 
 * This service provides RADIUS CoA/Disconnect functionality for:
 * - Disconnecting active sessions
 * - Updating session attributes (speed, limits)
 * - Real-time user management
 * 
 * CoA requests are sent via HTTP to CoA API service running on VPS (port 8082).
 * The VPS API executes radclient locally and returns results.
 * This approach is stable, independent of SSH, and works across sandbox restarts.
 */

import { getDb } from "../db";
import { nasDevices, systemSettings, radreply, radiusCards, onlineSessions } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { ENV } from "../_core/env";

// CoA Response interface
interface CoAResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

// CoA API configuration - loaded from environment
const COA_API_URL = ENV.VPS_COA_API_URL;
const COA_API_KEY = ENV.VPS_COA_API_KEY;

/**
 * Sanitize error messages to remove sensitive data before returning to users.
 */
function sanitizeError(msg: string): string {
  return msg
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[server]')
    .replace(/:[0-9]{2,5}/g, '')
    .replace(/Error: Command failed[\s\S]*/g, 'Connection error')
    .replace(/fetch failed/gi, 'لا يمكن الاتصال بخدمة CoA')
    .replace(/ECONNREFUSED/g, 'الخدمة غير متاحة');
}

// Get NAS device by IP (cached 5 minutes — NAS devices rarely change)
async function getNasByIp(nasIp: string) {
  const { cache, cacheKeys, cacheTTL } = await import('../_core/cache.js');
  const cacheKey = cacheKeys.nasByIp(nasIp);
  const cached = cache.get<any>(cacheKey);
  if (cached !== undefined) return cached;

  const db = await getDb();
  if (!db) return null;
  const [nas] = await db.select()
    .from(nasDevices)
    .where(eq(nasDevices.nasname, nasIp))
    .limit(1);
  const result = nas ?? null;
  cache.set(cacheKey, result, cacheTTL.nasByIp);
  return result;
}

// Get RADIUS VPN IP from settings
async function getRadiusVpnIp(): Promise<string> {
  const db = await getDb();
  if (!db) return '192.168.30.1';
  
  const settings = await db.select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'radius_server_vpn_ip'));
  
  return settings[0]?.value || '192.168.30.1';
}

/**
 * Execute radclient via CoA API HTTP service running on VPS.
 * This is the stable, production-ready approach:
 * - No SSH dependency
 * - Works across sandbox restarts
 * - API key protected
 * - Credentials never exposed in error messages
 */
async function executeRadclient(
  nasIp: string,
  port: number,
  secret: string,
  packetType: 'disconnect' | 'coa',
  attributes: string
): Promise<{ success: boolean; output: string }> {
  try {
    // The local CoA service exposes its authenticated endpoints directly at
    // /disconnect and /change-speed. Keep this adapter as the only place
    // that knows the HTTP transport shape; V2 engines remain transport-agnostic.
    const endpoint = packetType === 'disconnect'
      ? `${COA_API_URL}/disconnect`
      : `${COA_API_URL}/change-speed`;

    console.log(`[CoA] HTTP API request: ${packetType} to ${nasIp}:${port}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': COA_API_KEY,
      },
      body: JSON.stringify({
        nasIp,
        nasPort: port,
        secret,
        attributes,
      }),
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[CoA] API error ${response.status}:`, errText);
      if (response.status === 401) {
        return { success: false, output: 'خطأ في مصادقة خدمة CoA' };
      }
      return { success: false, output: `خطأ في خدمة CoA: ${response.status}` };
    }

    const result = await response.json() as { success: boolean; output?: string; message?: string; error?: string; acknowledged?: boolean };
    console.log(`[CoA] API result: success=${result.success}, output=${result.output?.substring(0, 100)}`);

    return {
      success: result.success,
      output: result.success
        ? (result.output || result.message || '')
        : (result.error || result.output || result.message || 'لم يؤكد جهاز NAS تنفيذ طلب CoA'),
    };
  } catch (error: any) {
    // Never expose raw error details to user
    console.error('[CoA] HTTP API error (internal):', error.message);
    const userMsg = sanitizeError(error.message);
    return { success: false, output: userMsg || 'لا يمكن الاتصال بخدمة CoA' };
  }
}

/**
 * Send CoA Disconnect-Request via SSH tunnel + radclient
 */
export async function disconnectSession(
  username: string,
  nasIp: string,
  sessionId?: string,
  framedIp?: string
): Promise<CoAResponse> {
  try {
    const nas = await getNasByIp(nasIp);
    if (!nas) {
      return {
        success: false,
        message: `NAS device not found for IP: ${nasIp}`,
        error: 'NAS_NOT_FOUND'
      };
    }
    const secret = nas.secret;
    
    console.log(`Sending CoA Disconnect to ${nasIp}:3799 for user ${username}`);
    
    // Build RADIUS attributes
    // MikroTik Hotspot: User-Name + Acct-Session-Id + Framed-IP-Address
    // Including Framed-IP-Address removes the "no ip provided" warning on MikroTik
    let attributes = `User-Name=${username}`;
    if (sessionId) {
      attributes += `,Acct-Session-Id=${sessionId}`;
    }
    if (framedIp) {
      attributes += `,Framed-IP-Address=${framedIp}`;
    }
    
    // Send CoA via SSH tunnel + radclient
    const result = await executeRadclient(nasIp, 3799, secret, 'disconnect', attributes);
    
    if (result.success) {
      return {
        success: true,
        message: `Session disconnected successfully for user ${username}`,
        data: { username, nasIp, sessionId, output: result.output }
      };
    } else {
      return {
        success: false,
        message: `لم يؤكد جهاز NAS فصل المستخدم؛ ما زالت الجلسة ظاهرة حتى يصل Accounting Stop. ${result.output || ''}`.trim(),
        error: result.output
      };
    }
  } catch (error: any) {
    console.error('CoA Disconnect error:', error);
    
    return {
      success: false,
      message: 'CoA Disconnect failed',
      error: error.message
    };
  }
}

/**
 * Disconnect all sessions for a specific username
 */
export async function disconnectUserAllSessions(username: string): Promise<CoAResponse> {
  const db = await getDb();
  if (!db) {
    return { success: false, message: 'Database not available', error: 'DB_ERROR' };
  }
  
  try {
    // V2 source of truth: radacct is audit-only and must not authorize CoA control.
    const sessions = await db.select()
      .from(onlineSessions)
      .where(eq(onlineSessions.username, username));
    
    if (sessions.length === 0) {
      // Try to disconnect using only NAS devices belonging to this card's owner
      // First, find the card's owner (createdBy)
      const [card] = await db.select({ createdBy: radiusCards.createdBy })
        .from(radiusCards)
        .where(eq(radiusCards.username, username))
        .limit(1);
      
      if (card?.createdBy) {
        // Get only NAS devices belonging to this card's owner
        const ownerNas = await db.select()
          .from(nasDevices)
          .where(eq(nasDevices.ownerId, card.createdBy));
        
        if (ownerNas.length > 0) {
          const results = await Promise.all(
            ownerNas.map((nas: any) => 
              disconnectSession(username, nas.nasname, undefined, undefined)
            )
          );
          
          return {
            success: true,
            message: `Disconnect requests sent to ${ownerNas.length} owner NAS device(s)`,
            data: { results }
          };
        }
      }
      
      return {
        success: true,
        message: 'No active sessions found for this user',
        data: { disconnected: 0 }
      };
    }
    
    // Disconnect each session
    const results = await Promise.all(
      sessions.map((session: any) => 
        disconnectSession(
          username,
          session.nasIp,
          session.acctSessionId || undefined,
          session.framedIpAddress || undefined
        )
      )
    );
    
    const successCount = results.filter(r => r.success).length;
    
    return {
      success: true,
      message: `Disconnected ${successCount} of ${sessions.length} sessions`,
      data: {
        disconnected: successCount,
        total: sessions.length,
        results
      }
    };
  } catch (error: any) {
    return {
      success: false,
      message: 'Failed to disconnect sessions',
      error: error.message
    };
  }
}

/**
 * Send CoA request to update session attributes (e.g., change speed)
 */
export async function updateSessionAttributes(
  username: string,
  nasIp: string,
  sessionId: string,
  framedIp?: string,
  attributes?: {
    downloadSpeed?: number;
    uploadSpeed?: number;
    sessionTimeout?: number;
  }
): Promise<CoAResponse> {
  try {
    const nas = await getNasByIp(nasIp);
    if (!nas) {
      return {
        success: false,
        message: `NAS device not found for IP: ${nasIp}`,
        error: 'NAS_NOT_FOUND'
      };
    }
    const secret = nas.secret;
    
    console.log(`Sending CoA Update to ${nasIp}:3799 for user ${username}`);
    
    // Build RADIUS attributes
    let radiusAttrs = `User-Name=${username},Acct-Session-Id=${sessionId}`;
    
    if (framedIp) {
      radiusAttrs += `,Framed-IP-Address=${framedIp}`;
    }
    
    // Add Mikrotik-Rate-Limit if speed is specified
    if (attributes?.downloadSpeed && attributes?.uploadSpeed) {
      const uploadKbps = attributes.uploadSpeed * 1000;
      const downloadKbps = attributes.downloadSpeed * 1000;
      const rateLimit = `${uploadKbps}k/${downloadKbps}k`;
      radiusAttrs += `,Mikrotik-Rate-Limit=${rateLimit}`;
    }
    
    // Add Session-Timeout if specified
    if (attributes?.sessionTimeout) {
      radiusAttrs += `,Session-Timeout=${attributes.sessionTimeout}`;
    }
    
    // Send CoA via SSH tunnel + radclient
    const result = await executeRadclient(nasIp, 3799, secret, 'coa', radiusAttrs);
    
    if (result.success) {
      return {
        success: true,
        message: `Session attributes updated for user ${username}`,
        data: { username, nasIp, sessionId, attributes, output: result.output }
      };
    } else {
      return {
        success: false,
        message: 'CoA update failed',
        error: result.output
      };
    }
  } catch (error: any) {
    console.error('CoA Update error:', error);
    return {
      success: false,
      message: 'Failed to update session attributes',
      error: error.message
    };
  }
}

/**
 * Change user speed with fallback chain:
 * 1. Try RADIUS CoA (update active session speed)
 * 2. Fallback to Disconnect (force reconnect with new speed)
 */
export async function changeUserSpeed(
  username: string,
  uploadSpeedMbps: number,
  downloadSpeedMbps: number
): Promise<CoAResponse> {
  const db = await getDb();
  if (!db) {
    return { success: false, message: 'Database not available', error: 'DB_ERROR' };
  }
  
  // Build rate limit string (Mikrotik format: upload/download in kbps)
  const uploadSpeedKbps = uploadSpeedMbps * 1000;
  const downloadSpeedKbps = downloadSpeedMbps * 1000;
  const rateLimit = `${uploadSpeedKbps}k/${downloadSpeedKbps}k`;
  
  try {
    // First, update radreply with new speed (so future connections use it)
    
    // Check if Mikrotik-Rate-Limit exists for this user
    const existingRate = await db.select()
      .from(radreply)
      .where(and(
        eq(radreply.username, username),
        eq(radreply.attribute, 'Mikrotik-Rate-Limit')
      ))
      .limit(1);
    
    if (existingRate.length > 0) {
      // Update existing
      await db.update(radreply)
        .set({ value: rateLimit })
        .where(and(
          eq(radreply.username, username),
          eq(radreply.attribute, 'Mikrotik-Rate-Limit')
        ));
    } else {
      // Insert new
      await db.insert(radreply).values({
        username,
        attribute: 'Mikrotik-Rate-Limit',
        op: ':=',
        value: rateLimit,
      });
    }
    
    console.log(`[Speed Change] Updated radreply for ${username} with rate limit: ${rateLimit}`);
    
    // V2 source of truth: only rows in online_sessions may receive a live CoA update.
    const sessions = await db.select()
      .from(onlineSessions)
      .where(eq(onlineSessions.username, username));
    
    if (sessions.length === 0) {
      return {
        success: true,
        message: `Speed updated for ${username}. No active session - new speed will apply on next login.`,
        data: { rateLimit, activeSession: false }
      };
    }
    
    // Try CoA for each active session
    const coaResults = await Promise.all(
      sessions.map((session: any) => 
        updateSessionAttributes(
          username,
          session.nasIp,
          session.acctSessionId,
          session.framedIpAddress,
          {
            downloadSpeed: downloadSpeedMbps,
            uploadSpeed: uploadSpeedMbps
          }
        )
      )
    );
    
    const coaSuccess = coaResults.some(r => r.success);
    
    if (coaSuccess) {
      return {
        success: true,
        message: `Speed changed to ${downloadSpeedMbps}/${uploadSpeedMbps} Mbps for ${username} (CoA)`,
        data: { rateLimit, method: 'coa', results: coaResults }
      };
    }
    
    // CoA failed but radreply was updated - new speed will apply on next login
    // DO NOT disconnect the user - that would be disruptive
    console.log(`[Speed Change] CoA failed for ${username} - speed saved to radreply, will apply on next login`);
    
    return {
      success: true,
      message: `Speed updated for ${username}. Will apply on next login (CoA not supported by NAS).`,
      data: { 
        rateLimit, 
        method: 'radreply_only',
        coaAttempted: true,
        coaFailed: true,
      }
    };
    
  } catch (error: any) {
    console.error('[Speed Change] Error:', error);
    return {
      success: false,
      message: 'Failed to change user speed',
      error: error.message
    };
  }
}
