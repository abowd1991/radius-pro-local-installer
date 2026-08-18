import { superAdminProcedure, router } from "../_core/trpc";
import { isRedisAvailable, getRedis } from "../_core/redis";
import { cache } from "../_core/cache";

/**
 * Deliberately minimal administrative diagnostics.
 * All legacy RADIUS-group repairs and accounting diagnostics were removed
 * with the Radius Diagnostics UI. System Admin still consumes cache status.
 */
export const diagnosticsRouter = router({
  getCacheStatus: superAdminProcedure.query(async () => {
    const redisConnected = isRedisAvailable();
    const redisClient = getRedis();
    const memStats = cache.stats();
    let redisPing: number | null = null;
    let redisMemory: string | null = null;
    let redisVersion: string | null = null;
    let redisKeys: number | null = null;

    if (redisConnected && redisClient) {
      try {
        const startedAt = Date.now();
        await redisClient.ping();
        redisPing = Date.now() - startedAt;
        const serverInfo = await redisClient.info("server");
        redisVersion = serverInfo.match(/redis_version:([\d.]+)/)?.[1] ?? null;
        const memoryInfo = await redisClient.info("memory");
        redisMemory = memoryInfo.match(/used_memory_human:([^\r\n]+)/)?.[1]?.trim() ?? null;
        redisKeys = await redisClient.dbsize();
      } catch {
        // The status response intentionally reports unavailable Redis without failing System Admin.
      }
    }

    return {
      redis: {
        connected: redisConnected,
        ping: redisPing,
        version: redisVersion,
        usedMemory: redisMemory,
        keyCount: redisKeys,
        mode: redisConnected ? "redis" : "in-memory",
      },
      inMemory: {
        size: memStats.size,
        keyCount: memStats.keys.length,
        keys: memStats.keys.slice(0, 20),
      },
    };
  }),
});
