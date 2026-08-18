/**
 * IP Pool Manager
 * Manages NAS IP allocation from a predefined pool
 */

import { getDb } from "../db";
import { nasDevices, ipPoolConfig } from "../../drizzle/schema";
import { sql, eq } from "drizzle-orm";

/**
 * Convert IP string to number for comparison
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Convert number back to IP string
 */
function numberToIp(num: number): string {
  return [
    (num >>> 24) & 0xFF,
    (num >>> 16) & 0xFF,
    (num >>> 8) & 0xFF,
    num & 0xFF
  ].join('.');
}

/**
 * Get all allocated IPs from database
 */
async function getAllocatedIPs(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  
  const allocatedNas = await db
    .select({ allocatedIp: nasDevices.allocatedIp })
    .from(nasDevices)
    .where(sql`${nasDevices.allocatedIp} IS NOT NULL`);
  
  return allocatedNas.map((n: any) => n.allocatedIp!).filter(Boolean);
}

/**
 * Get all active IP ranges from database
 */
async function getActiveRanges(): Promise<Array<{ startIp: string; endIp: string }>> {
  const db = await getDb();
  if (!db) return [];
  
  const ranges = await db
    .select({ startIp: ipPoolConfig.startIp, endIp: ipPoolConfig.endIp })
    .from(ipPoolConfig)
    .where(eq(ipPoolConfig.isActive, true));
  
  return ranges;
}

/**
 * Get next available IP from pool filtered by subnet prefix
 * @param type 'pptp' for 192.168.32.x, or undefined for all ranges
 * @returns Next available IP address or null if pool is exhausted
 */
export async function getNextAvailableIPForType(type?: 'pptp' | 'l2tp' | 'sstp'): Promise<string | null> {
  const subnetPrefix = type === 'pptp' ? '192.168.32.' : undefined;
  const allocatedIPs = await getAllocatedIPs();
  const allocatedSet = new Set(allocatedIPs);
  const ranges = await getActiveRanges();

  const filteredRanges = subnetPrefix
    ? ranges.filter(r => r.startIp.startsWith(subnetPrefix))
    : ranges;

  if (filteredRanges.length === 0) {
    console.error(`[IP Pool] No active IP ranges for type: ${type || 'any'}`);
    return null;
  }

  for (const range of filteredRanges) {
    const startNum = ipToNumber(range.startIp);
    const endNum = ipToNumber(range.endIp);
    for (let ipNum = startNum; ipNum <= endNum; ipNum++) {
      const ip = numberToIp(ipNum);
      if (!allocatedSet.has(ip)) {
        return ip;
      }
    }
  }

  return null;
}

/**
 * Get next available IP from pool
 * @returns Next available IP address or null if pool is exhausted
 */
export async function getNextAvailableIP(): Promise<string | null> {
  const allocatedIPs = await getAllocatedIPs();
  const allocatedSet = new Set(allocatedIPs);
  const ranges = await getActiveRanges();
  
  if (ranges.length === 0) {
    console.error('[IP Pool] No active IP ranges configured');
    return null;
  }
  
  // Try each range
  for (const range of ranges) {
    const startNum = ipToNumber(range.startIp);
    const endNum = ipToNumber(range.endIp);
    
    for (let ipNum = startNum; ipNum <= endNum; ipNum++) {
      const ip = numberToIp(ipNum);
      if (!allocatedSet.has(ip)) {
        return ip;
      }
    }
  }
  
  return null; // Pool exhausted
}

/**
 * Check if IP is within any active pool range
 */
export async function isIPInPool(ip: string): Promise<boolean> {
  const ranges = await getActiveRanges();
  const ipNum = ipToNumber(ip);
  
  for (const range of ranges) {
    const startNum = ipToNumber(range.startIp);
    const endNum = ipToNumber(range.endIp);
    
    if (ipNum >= startNum && ipNum <= endNum) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get pool statistics
 */
export async function getPoolStats(): Promise<{
  total: number;
  allocated: number;
  available: number;
  utilizationPercent: number;
}> {
  const allocatedIPs = await getAllocatedIPs();
  const ranges = await getActiveRanges();
  
  let total = 0;
  for (const range of ranges) {
    const startNum = ipToNumber(range.startIp);
    const endNum = ipToNumber(range.endIp);
    total += endNum - startNum + 1;
  }
  
  const allocated = allocatedIPs.length;
  const available = total - allocated;
  const utilizationPercent = total > 0 ? Math.round((allocated / total) * 100) : 0;
  
  return {
    total,
    allocated,
    available,
    utilizationPercent
  };
}

/**
 * Release IP back to pool (mark as available)
 * This is called when NAS is disabled or deleted
 */
export async function releaseIP(ip: string): Promise<void> {
  // IP is automatically released when allocatedIp is set to NULL in database
  // This function is here for explicit documentation and future enhancements
  console.log(`[IP Pool] Released IP: ${ip}`);
}

/**
 * Reserve IP for a NAS
 * @param nasId NAS ID to reserve IP for
 * @returns Reserved IP address or null if pool exhausted
 */
export async function reserveIPForNAS(nasId: number): Promise<string | null> {
  const nextIP = await getNextAvailableIP();
  
  if (!nextIP) {
    console.error('[IP Pool] Pool exhausted - no IPs available');
    return null;
  }
  
  console.log(`[IP Pool] Reserved IP ${nextIP} for NAS ${nasId}`);
  return nextIP;
}

/**
 * Expand IP Pool by adding a new range
 * @param startIp Start IP of the new range
 * @param endIp End IP of the new range
 * @param createdBy User ID who created this range
 * @returns Success status
 */
export async function expandIpPool(startIp: string, endIp: string, createdBy: number): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, message: 'Database connection failed' };
  }
  
  // Validate IPs
  const startNum = ipToNumber(startIp);
  const endNum = ipToNumber(endIp);
  
  if (startNum >= endNum) {
    return { success: false, message: 'Start IP must be less than End IP' };
  }
  
  // Extract subnet (first 3 octets)
  const subnet = startIp.split('.').slice(0, 3).join('.');
  const endSubnet = endIp.split('.').slice(0, 3).join('.');
  
  if (subnet !== endSubnet) {
    return { success: false, message: 'Start and End IP must be in the same subnet' };
  }
  
  // Check for overlapping ranges
  const existingRanges = await getActiveRanges();
  for (const range of existingRanges) {
    const existingStartNum = ipToNumber(range.startIp);
    const existingEndNum = ipToNumber(range.endIp);
    
    // Check if new range overlaps with existing range
    if (
      (startNum >= existingStartNum && startNum <= existingEndNum) ||
      (endNum >= existingStartNum && endNum <= existingEndNum) ||
      (startNum <= existingStartNum && endNum >= existingEndNum)
    ) {
      return { success: false, message: `Range overlaps with existing range: ${range.startIp} - ${range.endIp}` };
    }
  }
  
  // Insert new range
  await db.insert(ipPoolConfig).values({
    startIp,
    endIp,
    subnet,
    isActive: true,
    createdBy,
  });
  
  console.log(`[IP Pool] Expanded pool with range: ${startIp} - ${endIp}`);
  return { success: true, message: 'IP Pool expanded successfully' };
}

/**
 * Get all IP Pool ranges (active and inactive)
 * @returns List of IP ranges with metadata
 */
export async function getIpPoolRanges(): Promise<Array<{
  id: number;
  startIp: string;
  endIp: string;
  subnet: string;
  isActive: boolean;
  createdAt: Date;
  createdBy: number;
  totalIps: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  
  const ranges = await db.select().from(ipPoolConfig);
  
  return ranges.map((range: any) => ({
    ...range,
    totalIps: ipToNumber(range.endIp) - ipToNumber(range.startIp) + 1,
  }));
}

/**
 * Re-assign IP for a NAS (when MAC address changes)
 * @param nasId NAS ID to re-assign IP for
 * @returns New IP address or null if pool exhausted
 */
export async function reassignIpForNAS(nasId: number): Promise<{ success: boolean; newIp: string | null; message: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, newIp: null, message: 'Database connection failed' };
  }
  
  // Get current NAS
  const nas = await db.select().from(nasDevices).where(sql`${nasDevices.id} = ${nasId}`).limit(1);
  
  if (!nas || nas.length === 0) {
    return { success: false, newIp: null, message: 'NAS not found' };
  }
  
  const currentNas = nas[0];
  const oldIp = currentNas.allocatedIp;
  
  // Get new IP
  const newIp = await getNextAvailableIP();
  
  if (!newIp) {
    return { success: false, newIp: null, message: 'IP Pool exhausted - no IPs available' };
  }
  
  // Update NAS with new IP
  await db
    .update(nasDevices)
    .set({ allocatedIp: newIp })
    .where(sql`${nasDevices.id} = ${nasId}`);
  
  console.log(`[IP Pool] Re-assigned IP for NAS ${nasId}: ${oldIp} → ${newIp}`);
  
  return { 
    success: true, 
    newIp, 
    message: `IP re-assigned successfully: ${oldIp || 'none'} → ${newIp}` 
  };
}
