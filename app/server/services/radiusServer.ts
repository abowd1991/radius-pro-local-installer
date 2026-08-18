/**
 * Embedded RADIUS Server for Authentication and Accounting
 * Uses the 'radius' npm package to handle RADIUS protocol
 */

import * as dgram from 'dgram';
import * as radius from 'radius';
import { getDb } from '../db.js';
import { radcheck, radreply, radacct } from '../../drizzle/schema.js';
import { eq, and, isNull, count } from 'drizzle-orm';

const RADIUS_SECRET = 'testing123';
const AUTH_PORT = 1812;
const ACCT_PORT = 1813;

// Load MikroTik dictionary
try {
  const dictionaryPath = new URL('./dictionary.mikrotik', import.meta.url).pathname;
  radius.add_dictionary(dictionaryPath);
} catch (e) {
  console.log('[RADIUS] MikroTik dictionary not found, using defaults');
}

interface RadiusPacket {
  code: string;
  identifier: number;
  authenticator: Buffer;
  attributes: Record<string, any>;
}

/**
 * Handle Access-Request (Authentication)
 */
async function handleAccessRequest(packet: RadiusPacket, rinfo: dgram.RemoteInfo): Promise<Buffer> {
  const username = packet.attributes['User-Name'];
  const password = packet.attributes['User-Password'];
  
  console.log(`[RADIUS] Access-Request from ${rinfo.address}:${rinfo.port}`);
  console.log(`[RADIUS] Username: ${username}`);
  
  try {
    const db = await getDb();
    if (!db) {
      console.log('[RADIUS] Database not available');
      return createResponse('Access-Reject', packet, {});
    }
    
    // Check user credentials in radcheck table
    const checks = await db.select().from(radcheck).where(eq(radcheck.username, username));
    
    if (!checks || checks.length === 0) {
      console.log(`[RADIUS] User ${username} not found`);
      return createResponse('Access-Reject', packet, {});
    }
    
    // Find password
    const passwordCheck = checks.find((c: { attribute: string; value: string }) => 
      c.attribute === 'Cleartext-Password' || 
      c.attribute === 'User-Password'
    );
    
    if (!passwordCheck || passwordCheck.value !== password) {
      console.log(`[RADIUS] Invalid password for ${username}`);
      return createResponse('Access-Reject', packet, {});
    }
    
    console.log(`[RADIUS] User ${username} authenticated successfully`);

    // فحص Simultaneous-Use — رفض الجلسة إذا تجاوز الحد المسموح
    const simulCheck = checks.find((c: { attribute: string; value: string }) =>
      c.attribute === 'Simultaneous-Use'
    );
    if (simulCheck) {
      const maxSessions = parseInt(simulCheck.value, 10);
      if (!isNaN(maxSessions) && maxSessions > 0) {
        const openSessionsResult = await db
          .select({ total: count() })
          .from(radacct)
          .where(and(eq(radacct.username, username), isNull(radacct.acctstoptime)));
        const currentCount = Number(openSessionsResult[0]?.total ?? 0);
        if (currentCount >= maxSessions) {
          console.log(
            `[RADIUS] Simultaneous-Use limit (${maxSessions}) reached for ${username} — currentSessions=${currentCount} — Access-Reject`
          );
          return createResponse('Access-Reject', packet, {});
        }
      }
    }

    // Get reply attributes
    const replyAttrs: Record<string, any> = {};
    
    // Add Session-Timeout if exists
    const sessionTimeout = checks.find((c: { attribute: string }) => c.attribute === 'Session-Timeout');
    if (sessionTimeout) {
      replyAttrs['Session-Timeout'] = parseInt(sessionTimeout.value);
    }
    
    // Get radreply attributes
    const replies = await db.select().from(radreply).where(eq(radreply.username, username));
    for (const reply of replies) {
      replyAttrs[reply.attribute] = reply.value;
    }
    
    return createResponse('Access-Accept', packet, replyAttrs);
    
  } catch (error) {
    console.error('[RADIUS] Database error:', error);
    return createResponse('Access-Reject', packet, {});
  }
}

/**
 * Handle Accounting-Request
 */
async function handleAccountingRequest(packet: RadiusPacket, rinfo: dgram.RemoteInfo): Promise<Buffer> {
  const statusType = packet.attributes['Acct-Status-Type'];
  // M-16 fix: trim trailing/leading spaces from username to prevent mismatch
  // Root cause: Hotspot users copy-paste codes with trailing spaces from SMS/WhatsApp
  // MikroTik sends the username as-is to FreeRADIUS → written to radacct with spaces
  // This causes cardMap.get(username) to return undefined in centralAccountingService
  const username = typeof packet.attributes['User-Name'] === 'string'
    ? packet.attributes['User-Name'].trim()
    : packet.attributes['User-Name'];
  const sessionId = packet.attributes['Acct-Session-Id'];
  const nasIp = packet.attributes['NAS-IP-Address'] || rinfo.address;
  const framedIp = packet.attributes['Framed-IP-Address'];
  const sessionTime = packet.attributes['Acct-Session-Time'] || 0;
  const inputOctets = packet.attributes['Acct-Input-Octets'] || 0;
  const outputOctets = packet.attributes['Acct-Output-Octets'] || 0;
  
  console.log(`[RADIUS] Accounting-Request: ${statusType} for ${username}`);
  
  try {
    const db = await getDb();
    if (!db) {
      console.log('[RADIUS] Database not available');
      return createResponse('Accounting-Response', packet, {});
    }
    
    const now = new Date();
    
    if (statusType === 'Start') {
      // Insert new session
      await db.insert(radacct).values({
        username,
        nasipaddress: nasIp,
        acctsessionid: sessionId,
        acctuniqueid: `${sessionId}-${Date.now()}`,
        framedipaddress: framedIp,
        acctstarttime: now,
        acctsessiontime: 0,
        acctinputoctets: 0,
        acctoutputoctets: 0,
      });
      console.log(`[RADIUS] Session started for ${username}`);
      
    } else if (statusType === 'Stop') {
      // Update session with stop time
      await db.update(radacct)
        .set({
          acctstoptime: now,
          acctsessiontime: sessionTime,
          acctinputoctets: inputOctets,
          acctoutputoctets: outputOctets,
          acctterminatecause: packet.attributes['Acct-Terminate-Cause'] || 'User-Request',
        })
        .where(and(
          eq(radacct.acctsessionid, sessionId),
          isNull(radacct.acctstoptime)
        ));
      console.log(`[RADIUS] Session stopped for ${username}`);
      
    } else if (statusType === 'Interim-Update') {
      // Update session with current stats
      await db.update(radacct)
        .set({
          acctsessiontime: sessionTime,
          acctinputoctets: inputOctets,
          acctoutputoctets: outputOctets,
        })
        .where(and(
          eq(radacct.acctsessionid, sessionId),
          isNull(radacct.acctstoptime)
        ));
      console.log(`[RADIUS] Session updated for ${username}`);
    }
    
  } catch (error) {
    console.error('[RADIUS] Accounting error:', error);
  }
  
  // Always respond with Accounting-Response
  return createResponse('Accounting-Response', packet, {});
}

/**
 * Create RADIUS response packet
 */
function createResponse(code: string, request: RadiusPacket, attributes: Record<string, any>): Buffer {
  const response = radius.encode_response({
    packet: request,
    code,
    secret: RADIUS_SECRET,
    attributes: Object.entries(attributes).map(([key, value]) => [key, value]),
  });
  return response;
}

/**
 * Start RADIUS Authentication Server
 */
export function startAuthServer(): dgram.Socket {
  const server = dgram.createSocket('udp4');
  
  server.on('message', async (msg, rinfo) => {
    try {
      const packet = radius.decode({ packet: msg, secret: RADIUS_SECRET }) as RadiusPacket;
      
      let response: Buffer;
      
      if (packet.code === 'Access-Request') {
        response = await handleAccessRequest(packet, rinfo);
      } else {
        console.log(`[RADIUS] Unknown packet type: ${packet.code}`);
        return;
      }
      
      server.send(response, rinfo.port, rinfo.address);
      
    } catch (error) {
      console.error('[RADIUS] Error processing packet:', error);
    }
  });
  
  server.on('error', (err) => {
    console.error('[RADIUS] Auth server error:', err);
  });
  
  server.bind(AUTH_PORT, '0.0.0.0', () => {
    console.log(`[RADIUS] Authentication server listening on port ${AUTH_PORT}`);
  });
  
  return server;
}

/**
 * Start RADIUS Accounting Server
 */
export function startAcctServer(): dgram.Socket {
  const server = dgram.createSocket('udp4');
  
  server.on('message', async (msg, rinfo) => {
    try {
      const packet = radius.decode({ packet: msg, secret: RADIUS_SECRET }) as RadiusPacket;
      
      let response: Buffer;
      
      if (packet.code === 'Accounting-Request') {
        response = await handleAccountingRequest(packet, rinfo);
      } else {
        console.log(`[RADIUS] Unknown packet type: ${packet.code}`);
        return;
      }
      
      server.send(response, rinfo.port, rinfo.address);
      
    } catch (error) {
      console.error('[RADIUS] Error processing packet:', error);
    }
  });
  
  server.on('error', (err) => {
    console.error('[RADIUS] Acct server error:', err);
  });
  
  server.bind(ACCT_PORT, '0.0.0.0', () => {
    console.log(`[RADIUS] Accounting server listening on port ${ACCT_PORT}`);
  });
  
  return server;
}

/**
 * Start both RADIUS servers
 */
export function startRadiusServers() {
  const authServer = startAuthServer();
  const acctServer = startAcctServer();
  
  return { authServer, acctServer };
}
