/**
 * Redis Client with Graceful Fallback
 *
 * - If REDIS_URL is set and Redis is reachable → uses Redis
 * - If Redis is unavailable or ioredis is not installed → falls back to in-memory silently
 * - App never crashes due to Redis being down or missing
 */

import { ENV } from "./env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;
let redisAvailable = false;

/**
 * Initialize Redis connection (called once at startup)
 * Uses dynamic import so missing ioredis package doesn't crash the app
 */
export async function initRedis(): Promise<void> {
  const url = ENV.REDIS_URL;
  if (!url) {
    console.log("[Redis] REDIS_URL not set — using in-memory cache fallback");
    return;
  }

  try {
    // Dynamic import — if ioredis is not installed, catches gracefully
    const { default: Redis } = await import("ioredis");

    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redisClient.on("connect", () => {
      redisAvailable = true;
      console.log("[Redis] Connected successfully");
    });

    redisClient.on("error", (err: Error) => {
      if (redisAvailable) {
        console.warn("[Redis] Connection error — falling back to in-memory:", err.message);
      }
      redisAvailable = false;
    });

    redisClient.on("close", () => {
      redisAvailable = false;
    });

    redisClient.on("reconnecting", () => {
      console.log("[Redis] Reconnecting...");
    });

    // Attempt connection
    await redisClient.connect().then(() => {
      redisAvailable = true;
    }).catch((err: Error) => {
      console.warn("[Redis] Initial connection failed — using in-memory fallback:", err.message);
      redisAvailable = false;
    });

  } catch (err) {
    console.warn("[Redis] ioredis not available or failed to initialize — using in-memory fallback");
    redisClient = null;
    redisAvailable = false;
  }
}

/**
 * Returns the Redis client if available, null otherwise
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRedis(): any {
  return redisAvailable ? redisClient : null;
}

/**
 * Check if Redis is currently available
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Graceful shutdown
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(() => {});
    redisClient = null;
    redisAvailable = false;
  }
}
