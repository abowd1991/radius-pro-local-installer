/**
 * MikroTik API Service
 * 
 * This service provides direct API communication with MikroTik routers for:
 * - Instant speed changes without disconnecting users
 * - Real-time user management
 * - Queue manipulation
 * 
 * This is OPTIONAL - if not enabled, the system falls back to RADIUS (CoA + Disconnect)
 */

import { getDb } from "../db";
import { nasDevices } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import net from "net";
import crypto from "crypto";

// MikroTik API Response interface
interface MikrotikApiResponse {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

// MikroTik API connection class
class MikrotikApi {
  private host: string;
  private port: number;
  private username: string;
  private password: string;
  private socket: net.Socket | null = null;
  private connected: boolean = false;

  constructor(host: string, port: number, username: string, password: string) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.password = password;
  }

  // Connect to MikroTik API
  async connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      
      this.socket.setTimeout(10000); // 10 second timeout
      
      this.socket.on('timeout', () => {
        this.socket?.destroy();
        reject(new Error('Connection timeout'));
      });

      this.socket.on('error', (err) => {
        reject(err);
      });

      this.socket.connect(this.port, this.host, async () => {
        try {
          // Login to MikroTik
          const loginResult = await this.login();
          this.connected = loginResult;
          resolve(loginResult);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Login to MikroTik API
  private async login(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      // Send login command
      const loginCmd = this.encodeCommand('/login', {
        name: this.username,
        password: this.password,
      });

      this.socket.write(loginCmd);

      // Wait for response
      this.socket.once('data', (data) => {
        const response = this.decodeResponse(data);
        if (response.includes('!done')) {
          resolve(true);
        } else if (response.includes('!trap')) {
          reject(new Error('Login failed: Invalid credentials'));
        } else {
          // Old-style login with challenge
          const challengeMatch = response.match(/=ret=([a-f0-9]+)/);
          if (challengeMatch) {
            const challenge = challengeMatch[1];
            const hash = this.generateChallengeResponse(challenge);
            
            const loginCmd2 = this.encodeCommand('/login', {
              name: this.username,
              response: hash,
            });
            
            this.socket!.write(loginCmd2);
            
            this.socket!.once('data', (data2) => {
              const response2 = this.decodeResponse(data2);
              if (response2.includes('!done')) {
                resolve(true);
              } else {
                reject(new Error('Login failed'));
              }
            });
          } else {
            resolve(true); // Assume success if no challenge
          }
        }
      });
    });
  }

  // Generate challenge response for old-style login
  private generateChallengeResponse(challenge: string): string {
    const challengeBytes = Buffer.from(challenge, 'hex');
    const hash = crypto.createHash('md5');
    hash.update(Buffer.from([0]));
    hash.update(this.password);
    hash.update(challengeBytes);
    return '00' + hash.digest('hex');
  }

  // Encode command for MikroTik API
  private encodeCommand(command: string, params: Record<string, string> = {}): Buffer {
    const words: string[] = [command];
    
    for (const [key, value] of Object.entries(params)) {
      words.push(`=${key}=${value}`);
    }
    
    const buffers: Buffer[] = [];
    
    for (const word of words) {
      const wordBuffer = Buffer.from(word, 'utf8');
      const length = wordBuffer.length;
      
      if (length < 0x80) {
        buffers.push(Buffer.from([length]));
      } else if (length < 0x4000) {
        buffers.push(Buffer.from([
          ((length >> 8) & 0x3F) | 0x80,
          length & 0xFF
        ]));
      } else if (length < 0x200000) {
        buffers.push(Buffer.from([
          ((length >> 16) & 0x1F) | 0xC0,
          (length >> 8) & 0xFF,
          length & 0xFF
        ]));
      } else {
        buffers.push(Buffer.from([
          ((length >> 24) & 0x0F) | 0xE0,
          (length >> 16) & 0xFF,
          (length >> 8) & 0xFF,
          length & 0xFF
        ]));
      }
      
      buffers.push(wordBuffer);
    }
    
    // End of sentence
    buffers.push(Buffer.from([0]));
    
    return Buffer.concat(buffers);
  }

  // Decode response from MikroTik API
  private decodeResponse(data: Buffer): string {
    return data.toString('utf8');
  }

  // Execute command on MikroTik
  async execute(command: string, params: Record<string, string> = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('Not connected'));
        return;
      }

      const cmd = this.encodeCommand(command, params);
      this.socket.write(cmd);

      let responseData = '';
      
      const dataHandler = (data: Buffer) => {
        responseData += this.decodeResponse(data);
        
        // Check if response is complete
        if (responseData.includes('!done') || responseData.includes('!trap')) {
          this.socket?.removeListener('data', dataHandler);
          resolve(responseData);
        }
      };

      this.socket.on('data', dataHandler);

      // Timeout for command
      setTimeout(() => {
        this.socket?.removeListener('data', dataHandler);
        reject(new Error('Command timeout'));
      }, 15000);
    });
  }

  // Close connection
  close(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }
}

/**
 * Get NAS device with API settings
 */
async function getNasWithApiSettings(nasIp: string) {
  const db = await getDb();
  if (!db) return null;

  const nas = await db.select()
    .from(nasDevices)
    .where(eq(nasDevices.nasname, nasIp))
    .limit(1);

  return nas[0] || null;
}

/**
 * Change user speed via MikroTik API (instant, no disconnect)
 */
export async function changeSpeedViaApi(
  nasIp: string,
  username: string,
  uploadSpeedKbps: number,
  downloadSpeedKbps: number
): Promise<MikrotikApiResponse> {
  try {
    // Get NAS with API settings
    const nas = await getNasWithApiSettings(nasIp);
    
    if (!nas) {
      return {
        success: false,
        message: 'NAS device not found',
        error: 'NAS_NOT_FOUND'
      };
    }

    // Check if API is enabled
    if (!nas.apiEnabled) {
      return {
        success: false,
        message: 'MikroTik API is not enabled for this NAS',
        error: 'API_DISABLED'
      };
    }

    // Check if API credentials are set
    if (!nas.mikrotikApiUser || !nas.mikrotikApiPassword) {
      return {
        success: false,
        message: 'MikroTik API credentials not configured',
        error: 'API_CREDENTIALS_MISSING'
      };
    }

    // Determine the actual IP to connect to
    // For VPN connections, use the tunnel IP if available
    const connectIp = nas.vpnTunnelIp || nas.nasname;
    const apiPort = nas.mikrotikApiPort || 8728;

    console.log(`[MikroTik API] Connecting to ${connectIp}:${apiPort} for user ${username}`);

    // Create API connection
    const api = new MikrotikApi(
      connectIp,
      apiPort,
      nas.mikrotikApiUser,
      nas.mikrotikApiPassword
    );

    try {
      // Connect to MikroTik
      await api.connect();
      console.log(`[MikroTik API] Connected successfully`);

      // Build rate limit string (upload/download in kbps)
      const rateLimit = `${uploadSpeedKbps}k/${downloadSpeedKbps}k`;

      // Method 1: Try to update Hotspot user profile
      try {
        // Find active hotspot user
        const hotspotUsers = await api.execute('/ip/hotspot/active/print', {
          '?user': username
        });

        if (hotspotUsers.includes(username)) {
          // Update rate limit for active hotspot user
          // First, find the user's .id
          const idMatch = hotspotUsers.match(/\.id=\*([A-F0-9]+)/i);
          if (idMatch) {
            const userId = '*' + idMatch[1];
            
            // Set new rate limit
            await api.execute('/ip/hotspot/active/set', {
              '.id': userId,
              'rate-limit': rateLimit
            });
            
            console.log(`[MikroTik API] Updated hotspot rate limit for ${username} to ${rateLimit}`);
            api.close();
            
            return {
              success: true,
              message: `Speed changed instantly for ${username} to ${rateLimit}`,
              data: { method: 'hotspot-active', rateLimit }
            };
          }
        }
      } catch (hotspotError) {
        console.log(`[MikroTik API] Hotspot method failed, trying queue...`);
      }

      // Method 2: Try to update Simple Queue
      try {
        // Find queue for this user
        const queues = await api.execute('/queue/simple/print', {
          '?name': username
        });

        if (queues.includes(username)) {
          // Update queue rate limit
          const idMatch = queues.match(/\.id=\*([A-F0-9]+)/i);
          if (idMatch) {
            const queueId = '*' + idMatch[1];
            
            await api.execute('/queue/simple/set', {
              '.id': queueId,
              'max-limit': rateLimit
            });
            
            console.log(`[MikroTik API] Updated queue rate limit for ${username} to ${rateLimit}`);
            api.close();
            
            return {
              success: true,
              message: `Speed changed instantly for ${username} to ${rateLimit}`,
              data: { method: 'simple-queue', rateLimit }
            };
          }
        }
      } catch (queueError) {
        console.log(`[MikroTik API] Queue method failed...`);
      }

      // Method 3: Try PPP active connections
      try {
        const pppActive = await api.execute('/ppp/active/print', {
          '?name': username
        });

        if (pppActive.includes(username)) {
          // For PPP, we need to update the profile or use rate-limit attribute
          // This is more complex - may need to disconnect
          console.log(`[MikroTik API] PPP user found, but instant rate change not supported`);
        }
      } catch (pppError) {
        console.log(`[MikroTik API] PPP method failed...`);
      }

      api.close();

      // If we get here, no method worked
      return {
        success: false,
        message: 'Could not change speed via API - user session not found or method not supported',
        error: 'SESSION_NOT_FOUND'
      };

    } catch (connectionError: any) {
      console.error(`[MikroTik API] Connection error:`, connectionError);
      api.close();
      
      return {
        success: false,
        message: `Failed to connect to MikroTik API: ${connectionError.message}`,
        error: 'CONNECTION_FAILED'
      };
    }

  } catch (error: any) {
    console.error('[MikroTik API] Error:', error);
    return {
      success: false,
      message: 'MikroTik API error',
      error: error.message
    };
  }
}

/**
 * Test MikroTik API connection
 */
export async function testApiConnection(nasIp: string): Promise<MikrotikApiResponse> {
  try {
    const nas = await getNasWithApiSettings(nasIp);
    
    if (!nas) {
      return { success: false, message: 'NAS device not found', error: 'NAS_NOT_FOUND' };
    }

    if (!nas.apiEnabled) {
      return { success: false, message: 'API is not enabled for this NAS', error: 'API_DISABLED' };
    }

    if (!nas.mikrotikApiUser || !nas.mikrotikApiPassword) {
      return { success: false, message: 'API credentials not configured', error: 'CREDENTIALS_MISSING' };
    }

    const connectIp = nas.vpnTunnelIp || nas.nasname;
    const apiPort = nas.mikrotikApiPort || 8728;

    const api = new MikrotikApi(connectIp, apiPort, nas.mikrotikApiUser, nas.mikrotikApiPassword);

    try {
      await api.connect();
      
      // Get system identity as a test
      const identity = await api.execute('/system/identity/print');
      
      api.close();

      return {
        success: true,
        message: 'API connection successful',
        data: { identity: identity.replace(/[^\w\s-]/g, '').trim() }
      };
    } catch (error: any) {
      api.close();
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
        error: 'CONNECTION_FAILED'
      };
    }

  } catch (error: any) {
    return {
      success: false,
      message: 'API test error',
      error: error.message
    };
  }
}

/**
 * Check if API is enabled for a NAS
 */
export async function isApiEnabled(nasIp: string): Promise<boolean> {
  const nas = await getNasWithApiSettings(nasIp);
  return nas?.apiEnabled === true && !!nas?.mikrotikApiUser && !!nas?.mikrotikApiPassword;
}
