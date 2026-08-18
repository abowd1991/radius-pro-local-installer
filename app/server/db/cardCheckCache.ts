/**
 * Card Check Cache Layer
 *
 * Uses asyncCache (Redis-first with in-memory fallback).
 * Interface mirrors Redis GET/SET/DEL semantics.
 * Callers don't need to know whether Redis or in-memory is active.
 */

import { asyncCache } from "../_core/cache";
import { getRedis } from "../_core/redis";

/**
 * Cache interface — backed by Redis (with in-memory fallback)
 * Same API as before: async get/set/del/delPattern
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    return asyncCache.get<T>(key);
  },

  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    return asyncCache.set(key, data, ttlSeconds);
  },

  async del(key: string): Promise<void> {
    return asyncCache.del(key);
  },

  async delPattern(prefix: string): Promise<void> {
    return asyncCache.delPattern(prefix);
  },
};

/** مفاتيح CardCheck المعزولة عن كاش بقية المنصة. */
export const cardCheckCacheKeys = {
  token: (token: string) => `cardcheck:token:${token}`,
  slug: (slug: string) => `cardcheck:slug:${slug}`,
  /** مرجع username الحالي إلى دورة كرت بعينها؛ لا يخزن بيانات عرض قابلة للتقادم. */
  cardIdentity: (ownerId: number, username: string) => `cardcheck:identity:${ownerId}:${username}`,
  /** بيانات العرض تخص دورة كرت ثابتة ولا يجوز مشاركتها مع username مُعاد استخدامه. */
  cardLifecycle: (lifecycleId: string) => `cardcheck:lifecycle:${lifecycleId}`,
  rateLimit: (key: string) => `cardcheck:ratelimit:${key}`,
};

/** إبطال بيانات العرض لدورة الكرت بعد Start/Stop/انتهاء/تجديد الكرت. */
export async function invalidateCardCheckLifecycle(lifecycleId: string | null | undefined): Promise<void> {
  if (!lifecycleId) return;
  await cache.del(cardCheckCacheKeys.cardLifecycle(lifecycleId));
}

/** إبطال مرجع username عند حذف الكرت أو إعادة إنشائه بالاسم نفسه. */
export async function invalidateCardCheckIdentity(
  ownerId: number | null | undefined,
  username: string | null | undefined,
): Promise<void> {
  if (!ownerId || !username) return;
  await cache.del(cardCheckCacheKeys.cardIdentity(ownerId, username));
}

/**
 * Rate limiter: max `limit` requests per `windowMs` milliseconds per key
 * Redis هو المصدر المركزي عند توفره؛ fallback الذاكرة محلي وآمن عند تعطل Redis.
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkInMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  for (const [storedKey, stored] of Array.from(rateLimitStore.entries())) {
    if (stored.resetAt <= now) rateLimitStore.delete(storedKey);
  }
  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Atomic fixed-window limit. Lua يمنع سباق INCR/PEXPIRE بين الطلبات المتزامنة.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();
  if (!redis) return checkInMemoryRateLimit(key, limit, windowMs);

  try {
    const [countRaw, ttlRaw] = await redis.eval(
      "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return {count, redis.call('PTTL', KEYS[1])};",
      1,
      cardCheckCacheKeys.rateLimit(key),
      String(windowMs),
    ) as [number | string, number | string];
    const count = Number(countRaw);
    const ttl = Math.max(0, Number(ttlRaw));
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: Date.now() + ttl,
    };
  } catch {
    return checkInMemoryRateLimit(key, limit, windowMs);
  }
}
