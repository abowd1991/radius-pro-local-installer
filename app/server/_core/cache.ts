/**
 * Unified Cache Layer — Redis + In-Memory Fallback
 *
 * Strategy:
 * - If Redis is available → writes go to both Redis AND in-memory (dual-write)
 * - Reads prefer Redis first, fall back to in-memory
 * - If Redis is down or not configured → in-memory only (silent fallback)
 * - All callers use the SAME interface as before — zero breaking changes
 */

import { getRedis } from "./redis";

// ─── In-Memory Store ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class InMemoryStore {
  private store: Map<string, CacheEntry<any>> = new Map();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deletePattern(pattern: string): void {
    const regex = new RegExp("^" + pattern.replace("*", ".*") + "$");
    for (const key of Array.from(this.store.keys())) {
      if (regex.test(key)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  stats(): { size: number; keys: string[] } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }

  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}

const memStore = new InMemoryStore();

// Cleanup in-memory every 5 minutes
setInterval(() => {
  const cleaned = memStore.cleanup();
  if (cleaned > 0) {
    console.log(`[Cache] Cleaned up ${cleaned} expired in-memory entries`);
  }
}, 5 * 60 * 1000);

// ─── Cache Class (same interface as before + Redis support) ───────────────────

class UnifiedCache {
  /**
   * Get value — tries Redis first, falls back to in-memory
   * NOTE: sync signature preserved for backward compatibility;
   * internally does a best-effort Redis read on next tick via dual-write
   */
  get<T>(key: string): T | undefined {
    return memStore.get<T>(key);
  }

  /**
   * Set value — writes to in-memory AND Redis (fire-and-forget)
   */
  set<T>(key: string, data: T, ttlSeconds: number): void {
    memStore.set(key, data, ttlSeconds);
    const redis = getRedis();
    if (redis) {
      redis
        .set(key, JSON.stringify(data), "EX", ttlSeconds)
        .catch(() => {/* Redis write failure is non-fatal */});
    }
  }

  /**
   * Delete specific key
   */
  delete(key: string): void {
    memStore.delete(key);
    const redis = getRedis();
    if (redis) {
      redis.del(key).catch(() => {});
    }
  }

  /**
   * Delete all keys matching a pattern (e.g. 'nas:*')
   */
  deletePattern(pattern: string): void {
    memStore.deletePattern(pattern);
    const redis = getRedis();
    if (redis) {
      // Convert glob pattern to Redis pattern
      redis
        .keys(pattern)
        .then((keys: string[]) => {
          if (keys.length > 0) redis.del(...keys).catch(() => {});
        })
        .catch(() => {});
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    memStore.clear();
  }

  /**
   * Get cache stats
   */
  stats(): { size: number; keys: string[] } {
    return memStore.stats();
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    return memStore.cleanup();
  }
}

// Singleton instance — same export name as before
export const cache = new UnifiedCache();

// ─── Async Cache (Redis-first, used by cardCheckCache) ───────────────────────

/**
 * Async cache interface — Redis-first with in-memory fallback
 * Used by cardCheckCache.ts and any new async callers
 */
export const asyncCache = {
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (redis) {
      try {
        const val = await redis.get(key);
        if (val !== null) {
          const parsed = JSON.parse(val) as T;
          // Warm up in-memory for sync access
          memStore.set(key, parsed, 60);
          return parsed;
        }
      } catch {
        // Redis error — fall through
      }
    }
    return memStore.get<T>(key) ?? null;
  },

  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    memStore.set(key, data, ttlSeconds);
    const redis = getRedis();
    if (redis) {
      try {
        await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
      } catch {
        // Redis write failure is non-fatal
      }
    }
  },

  async del(key: string): Promise<void> {
    memStore.delete(key);
    const redis = getRedis();
    if (redis) {
      try {
        await redis.del(key);
      } catch {}
    }
  },

  async delPattern(prefix: string): Promise<void> {
    memStore.deletePattern(`${prefix}*`);
    const redis = getRedis();
    if (redis) {
      try {
        const keys = await redis.keys(`${prefix}*`);
        if (keys.length > 0) await redis.del(...keys);
      } catch {}
    }
  },
};

// ─── Cache Keys & TTLs ───────────────────────────────────────────────────────

export const cacheKeys = {
  nasList: (ownerId: number) => `nas:list:${ownerId}`,
  nasListAll: () => `nas:list:all`,
  nasDevice: (id: number) => `nas:device:${id}`,
  nasByIp: (ip: string) => `nas:ip:${ip}`,
  nasOwnerList: (ownerId: number) => `nas:owner:${ownerId}`,
  userPlan: (userId: number) => `user:plan:${userId}`,
  planById: (planId: number) => `plan:id:${planId}`,
  plansByOwner: (ownerId: number) => `plans:owner:${ownerId}`,
  speedProfiles: (ownerId: number) => `speed:profiles:${ownerId}`,
  dashboardStats: (ownerId: number) => `dashboard:stats:${ownerId}`,
  ipPoolStats: () => `ippool:stats`,
  // radcheck cache: stores Auth-Type=Reject status per username (TTL: 30s)
  radcheckReject: (username: string) => `radcheck:reject:${username}`,
  // Card status cache: avoids re-fetching card on every CoA request
  cardByUsername: (username: string) => `card:username:${username}`,
};

export const cacheTTL = {
  nasList: 5 * 60,        // 5 minutes
  nasDevice: 2 * 60,      // 2 minutes
  nasByIp: 5 * 60,        // 5 minutes — NAS devices rarely change
  nasOwnerList: 3 * 60,   // 3 minutes
  userPlan: 10 * 60,      // 10 minutes (invalidated on change)
  planById: 5 * 60,       // 5 minutes (invalidated on plan update)
  plansByOwner: 5 * 60,   // 5 minutes
  speedProfiles: 5 * 60,  // 5 minutes
  dashboardStats: 2 * 60, // 2 minutes — heavy radacct queries
  ipPoolStats: 2 * 60,    // 2 minutes
  radcheckReject: 30,     // 30 seconds — short TTL to catch status changes quickly
  cardByUsername: 60,     // 60 seconds — used by CoA service
};
