import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db";
import { vpnIpPool, allocatedVpnIps } from "../../drizzle/schema";

/**
 * Convert IP address to integer for comparison
 */
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  // Use >>> 0 to ensure unsigned 32-bit integer
  return ((parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

/**
 * Convert integer to IP address
 */
function intToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

/**
 * Get the default active IP pool
 */
export async function getActivePool() {
  const db = await getDb();
  if (!db) return null;
  
  const pools = await db.select()
    .from(vpnIpPool)
    .where(eq(vpnIpPool.isActive, true))
    .limit(1);
  
  return pools[0] || null;
}

/**
 * Get all allocated IPs for a pool
 */
export async function getAllocatedIps(poolId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  
  const allocated = await db.select({ ipAddress: allocatedVpnIps.ipAddress })
    .from(allocatedVpnIps)
    .where(eq(allocatedVpnIps.poolId, poolId));
  
  return allocated.map((a: any) => a.ipAddress);
}

/**
 * Find the next available IP in the pool
 */
export async function findNextAvailableIp(poolId: number, startIp: string, endIp: string): Promise<string | null> {
  const allocatedIps = await getAllocatedIps(poolId);
  const allocatedSet = new Set(allocatedIps);
  
  const startInt = ipToInt(startIp);
  const endInt = ipToInt(endIp);
  
  for (let i = startInt; i <= endInt; i++) {
    const ip = intToIp(i);
    if (!allocatedSet.has(ip)) {
      return ip;
    }
  }
  
  return null; // Pool exhausted
}

/**
 * Get the next available IP without allocating it
 * Used for pre-allocation before NAS creation
 */
export async function getNextAvailableIp(): Promise<string | null> {
  const pool = await getActivePool();
  if (!pool) {
    console.error('[VPN IP Pool] No active pool found');
    return null;
  }
  
  return findNextAvailableIp(pool.id, pool.startIp, pool.endIp);
}

/**
 * Allocate an IP for a NAS device
 * @param nasId - The NAS device ID
 * @param specificIp - Optional specific IP to allocate (for pre-allocated IPs)
 * Returns the allocated IP or null if pool is exhausted
 */
export async function allocateIpForNas(nasId: number, specificIp?: string): Promise<{ ip: string; gateway: string } | null> {
  const db = await getDb();
  if (!db) return null;
  
  const pool = await getActivePool();
  if (!pool) {
    console.error('[VPN IP Pool] No active pool found');
    return null;
  }
  
  // Check if NAS already has an allocated IP
  const existing = await db.select()
    .from(allocatedVpnIps)
    .where(eq(allocatedVpnIps.nasId, nasId))
    .limit(1);
  
  if (existing.length > 0) {
    console.log(`[VPN IP Pool] NAS ${nasId} already has IP: ${existing[0].ipAddress}`);
    return { ip: existing[0].ipAddress, gateway: pool.gateway };
  }
  
  // Use specific IP if provided, otherwise find next available
  let ipToAllocate: string | null;
  if (specificIp) {
    // Verify the specific IP is not already allocated
    const allocatedIps = await getAllocatedIps(pool.id);
    if (allocatedIps.includes(specificIp)) {
      console.error(`[VPN IP Pool] Specific IP ${specificIp} is already allocated`);
      return null;
    }
    ipToAllocate = specificIp;
  } else {
    ipToAllocate = await findNextAvailableIp(pool.id, pool.startIp, pool.endIp);
  }
  
  if (!ipToAllocate) {
    console.error('[VPN IP Pool] Pool exhausted - no available IPs');
    return null;
  }
  
  // Allocate the IP
  try {
    await db.insert(allocatedVpnIps).values({
      poolId: pool.id,
      ipAddress: ipToAllocate,
      nasId: nasId,
    });
    
    console.log(`[VPN IP Pool] Allocated IP ${ipToAllocate} for NAS ${nasId}`);
    return { ip: ipToAllocate, gateway: pool.gateway };
  } catch (error: any) {
    // Handle race condition - IP might have been allocated by another request
    if (error.code === 'ER_DUP_ENTRY') {
      console.warn('[VPN IP Pool] Race condition detected, retrying...');
      return allocateIpForNas(nasId); // Retry without specific IP
    }
    throw error;
  }
}

/**
 * Release an IP when NAS is deleted
 */
export async function releaseIpForNas(nasId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const result = await db.delete(allocatedVpnIps)
    .where(eq(allocatedVpnIps.nasId, nasId));
  
  console.log(`[VPN IP Pool] Released IP for NAS ${nasId}`);
  return true;
}

/**
 * Get allocated IP for a NAS
 */
export async function getAllocatedIpForNas(nasId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select({ ipAddress: allocatedVpnIps.ipAddress })
    .from(allocatedVpnIps)
    .where(eq(allocatedVpnIps.nasId, nasId))
    .limit(1);
  
  return result[0]?.ipAddress || null;
}

/**
 * Get pool statistics
 */
export async function getPoolStats(): Promise<{
  totalIps: number;
  allocatedCount: number;
  availableCount: number;
  pool: typeof vpnIpPool.$inferSelect | null;
} | null> {
  const pool = await getActivePool();
  if (!pool) return null;
  
  const startInt = ipToInt(pool.startIp);
  const endInt = ipToInt(pool.endIp);
  const totalIps = endInt - startInt + 1;
  
  const allocatedIps = await getAllocatedIps(pool.id);
  const allocatedCount = allocatedIps.length;
  
  return {
    totalIps,
    allocatedCount,
    availableCount: totalIps - allocatedCount,
    pool,
  };
}

/**
 * Update pool configuration
 */
export async function updatePool(poolId: number, data: {
  name?: string;
  startIp?: string;
  endIp?: string;
  gateway?: string;
  subnet?: string;
  isActive?: boolean;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  await db.update(vpnIpPool)
    .set(data)
    .where(eq(vpnIpPool.id, poolId));
  
  return true;
}
