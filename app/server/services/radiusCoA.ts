/**
 * RADIUS CoA (Change of Authorization) and Disconnect Service
 * RFC 5765 - RADIUS Extensions for Dynamic Authorization
 * 
 * Uses the 'radius' npm package for proper packet encoding/decoding
 */

import * as dgram from 'dgram';
import radius from 'radius';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Load MikroTik vendor dictionary
const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  radius.add_dictionary(path.join(__dirname, 'dictionary.mikrotik'));
} catch (e) {
  // Dictionary may already be loaded or file not found in production
  console.log('[CoA] Note: MikroTik dictionary not loaded, using standard attributes only');
}

interface CoAResult {
  success: boolean;
  code?: string;
  message?: string;
  errorCause?: string;
}

/**
 * Send a RADIUS packet and wait for response
 */
async function sendRadiusPacket(
  nasIP: string,
  nasPort: number,
  packet: Buffer,
  secret: string,
  timeout: number = 5000
): Promise<{ code: string; attributes: any }> {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('RADIUS request timeout'));
    }, timeout);
    
    client.on('message', (msg) => {
      clearTimeout(timer);
      try {
        const response = radius.decode({ packet: msg, secret });
        client.close();
        resolve({ code: response.code, attributes: response.attributes });
      } catch (err: any) {
        client.close();
        reject(new Error(`Failed to decode response: ${err.message}`));
      }
    });
    
    client.on('error', (err) => {
      clearTimeout(timer);
      client.close();
      reject(err);
    });
    
    client.send(packet, 0, packet.length, nasPort, nasIP, (err) => {
      if (err) {
        clearTimeout(timer);
        client.close();
        reject(err);
      }
    });
  });
}

/**
 * Send Disconnect-Request to terminate a user session
 * 
 * @param nasIP - IP address of the NAS (MikroTik)
 * @param nasPort - CoA port (default 3799)
 * @param secret - RADIUS shared secret
 * @param username - Username to disconnect
 * @param sessionId - Optional Acct-Session-Id
 * @param framedIP - Optional Framed-IP-Address
 */
export async function disconnectUser(
  nasIP: string,
  nasPort: number = 3799,
  secret: string,
  username: string,
  sessionId?: string,
  framedIP?: string
): Promise<CoAResult> {
  const attributes: [string, any][] = [
    ['User-Name', username],
  ];
  
  if (sessionId) {
    attributes.push(['Acct-Session-Id', sessionId]);
  }
  
  if (framedIP) {
    attributes.push(['Framed-IP-Address', framedIP]);
  }
  
  const packet = radius.encode({
    code: 'Disconnect-Request',
    secret,
    attributes,
  });
  
  try {
    console.log(`[CoA] Sending Disconnect-Request to ${nasIP}:${nasPort} for user ${username}`);
    const response = await sendRadiusPacket(nasIP, nasPort, packet, secret);
    
    if (response.code === 'Disconnect-ACK') {
      console.log(`[CoA] Disconnect-ACK received for user ${username}`);
      return { success: true, code: response.code, message: 'User disconnected successfully' };
    } else if (response.code === 'Disconnect-NAK') {
      const errorCause = response.attributes['Error-Cause'] || 'Unknown';
      console.log(`[CoA] Disconnect-NAK received for user ${username}, error: ${errorCause}`);
      return { success: false, code: response.code, message: 'Disconnect rejected', errorCause };
    } else {
      return { success: false, code: response.code, message: `Unexpected response: ${response.code}` };
    }
  } catch (err: any) {
    console.error(`[CoA] Error disconnecting user ${username}:`, err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Send CoA-Request to change user attributes (e.g., speed limit)
 * 
 * @param nasIP - IP address of the NAS (MikroTik)
 * @param nasPort - CoA port (default 3799)
 * @param secret - RADIUS shared secret
 * @param username - Username to modify
 * @param rateLimit - New rate limit (e.g., "10M/10M" for 10Mbps up/down)
 * @param sessionId - Optional Acct-Session-Id
 */
// MikroTik Vendor ID
const MIKROTIK_VENDOR_ID = 14988;
const MIKROTIK_RATE_LIMIT = 8;

/**
 * Create a Vendor-Specific Attribute for MikroTik
 */
function createMikrotikVSA(vendorType: number, value: string): Buffer {
  const valueBuffer = Buffer.from(value, 'utf8');
  // VSA format: Vendor-ID(4) + Vendor-Type(1) + Vendor-Length(1) + Value
  const vsa = Buffer.alloc(4 + 2 + valueBuffer.length);
  vsa.writeUInt32BE(MIKROTIK_VENDOR_ID, 0);
  vsa.writeUInt8(vendorType, 4);
  vsa.writeUInt8(2 + valueBuffer.length, 5);
  valueBuffer.copy(vsa, 6);
  return vsa;
}

export async function changeUserSpeed(
  nasIP: string,
  nasPort: number = 3799,
  secret: string,
  username: string,
  rateLimit: string,
  sessionId?: string
): Promise<CoAResult> {
  // Create MikroTik Rate-Limit VSA
  const rateLimitVSA = createMikrotikVSA(MIKROTIK_RATE_LIMIT, rateLimit);
  
  const attributes: [string, any][] = [
    ['User-Name', username],
    ['Vendor-Specific', rateLimitVSA],
  ];
  
  if (sessionId) {
    attributes.push(['Acct-Session-Id', sessionId]);
  }
  
  const packet = radius.encode({
    code: 'CoA-Request',
    secret,
    attributes,
  });
  
  try {
    console.log(`[CoA] Sending CoA-Request to ${nasIP}:${nasPort} for user ${username}, rate: ${rateLimit}`);
    const response = await sendRadiusPacket(nasIP, nasPort, packet, secret);
    
    if (response.code === 'CoA-ACK') {
      console.log(`[CoA] CoA-ACK received for user ${username}`);
      return { success: true, code: response.code, message: 'Speed changed successfully' };
    } else if (response.code === 'CoA-NAK') {
      const errorCause = response.attributes['Error-Cause'] || 'Unknown';
      console.log(`[CoA] CoA-NAK received for user ${username}, error: ${errorCause}`);
      return { success: false, code: response.code, message: 'CoA rejected', errorCause };
    } else {
      return { success: false, code: response.code, message: `Unexpected response: ${response.code}` };
    }
  } catch (err: any) {
    console.error(`[CoA] Error changing speed for user ${username}:`, err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Error cause descriptions (RFC 5765)
 */
export const ERROR_CAUSES: Record<string, string> = {
  'Residual-Session-Context-Removed': 'Session context was removed',
  'Invalid-EAP-Packet': 'Invalid EAP packet',
  'Unsupported-Attribute': 'Unsupported attribute in request',
  'Missing-Attribute': 'Required attribute missing',
  'NAS-Identification-Mismatch': 'NAS identification does not match',
  'Invalid-Request': 'Request is invalid',
  'Unsupported-Service': 'Service type not supported',
  'Unsupported-Extension': 'Extension not supported',
  'Invalid-Attribute-Value': 'Attribute value is invalid',
  'Administratively-Prohibited': 'Action administratively prohibited',
  'Request-Not-Routable': 'Request cannot be routed',
  'Session-Context-Not-Found': 'Session not found (user not connected)',
  'Session-Context-Not-Removable': 'Session cannot be removed',
  'Other-Proxy-Processing-Error': 'Proxy processing error',
  'Resources-Unavailable': 'Resources unavailable',
  'Request-Initiated': 'Request has been initiated',
  'Multiple-Session-Selection-Unsupported': 'Multiple session selection not supported',
};

export function getErrorMessage(errorCause: string): string {
  return ERROR_CAUSES[errorCause] || `Unknown error: ${errorCause}`;
}

/**
 * Disconnect user by session ID (more reliable than username)
 */
export async function disconnectBySessionId(
  nasIP: string,
  nasPort: number = 3799,
  secret: string,
  sessionId: string,
  username?: string
): Promise<CoAResult> {
  const attributes: [string, any][] = [
    ['Acct-Session-Id', sessionId],
  ];
  
  if (username) {
    attributes.push(['User-Name', username]);
  }
  
  const packet = radius.encode({
    code: 'Disconnect-Request',
    secret,
    attributes,
  });
  
  try {
    console.log(`[CoA] Sending Disconnect-Request to ${nasIP}:${nasPort} for session ${sessionId}`);
    const response = await sendRadiusPacket(nasIP, nasPort, packet, secret);
    
    if (response.code === 'Disconnect-ACK') {
      console.log(`[CoA] Disconnect-ACK received for session ${sessionId}`);
      return { success: true, code: response.code, message: 'Session disconnected successfully' };
    } else if (response.code === 'Disconnect-NAK') {
      const errorCause = response.attributes['Error-Cause'] || 'Unknown';
      console.log(`[CoA] Disconnect-NAK received for session ${sessionId}, error: ${errorCause}`);
      return { success: false, code: response.code, message: 'Disconnect rejected', errorCause };
    } else {
      return { success: false, code: response.code, message: `Unexpected response: ${response.code}` };
    }
  } catch (err: any) {
    console.error(`[CoA] Error disconnecting session ${sessionId}:`, err.message);
    return { success: false, message: err.message };
  }
}
