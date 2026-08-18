/**
 * Network Monitor Router
 * Manages router devices monitoring via MikroTik API Ping
 * Supports adding individual IPs or IP ranges (e.g. 192.168.1.1/24)
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { networkRouters, nasDevices, networkMonitorSettings, networkRouterDownLog } from "../../drizzle/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { notifyNasDisconnected, notifyNasReconnected } from "../services/multiChannelNotificationService";
import { notifyOwnerEvent } from "../services/notificationService";
import { ENV } from "../_core/env";
import * as sshVpn from "../services/sshVpnService";
import { portForwardingEngine } from "../domains/network/PortForwardingEngine";

// Number of consecutive failures before sending a down notification
const DOWN_NOTIFY_THRESHOLD = 3;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Expand CIDR range to list of IPs (max 256) */
function expandCidr(cidr: string): string[] {
  const [base, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 16 || prefix > 32) return [];

  const parts = base.split(".").map(Number);
  if (parts.length !== 4) return [];

  const baseNum =
    (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  const mask = prefix === 32 ? 0xffffffff : ~(0xffffffff >>> prefix);
  const networkNum = baseNum & mask;
  const count = Math.pow(2, 32 - prefix);

  const ips: string[] = [];
  // Skip network address (i=0) and broadcast (i=count-1) for /24 and smaller
  const start = prefix < 32 ? 1 : 0;
  const end = prefix < 32 ? count - 1 : count;
  for (let i = start; i < end && ips.length < 254; i++) {
    const n = networkNum + i;
    ips.push(
      `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`
    );
  }
  return ips;
}

/** Validate single IPv4 */
function isValidIp(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split(".").every((p) => parseInt(p) <= 255);
}

/** NAS info for ping session */
type NasInfo = {
  id: number;
  nasname: string;
  vpnTunnelIp?: string | null;
  mikrotikApiPort?: number | null;
  mikrotikApiUser?: string | null;
  mikrotikApiPassword?: string | null;
  vpnUsername?: string | null;
  apiEnabled?: boolean | null;
};

/** Resolved from the same live VPN session and API settings used by NAS testing. */
type MikroTikProxyTarget = {
  nas: NasInfo;
  host: string;
  port: number;
};

/** Encode MikroTik API word (length-prefixed) */
function encodeWord(word: string): Buffer {
  const wordBuffer = Buffer.from(word, "utf8");
  const length = wordBuffer.length;
  let lengthBuffer: Buffer;
  if (length < 0x80) {
    lengthBuffer = Buffer.from([length]);
  } else if (length < 0x4000) {
    lengthBuffer = Buffer.from([
      ((length >> 8) & 0x3f) | 0x80,
      length & 0xff,
    ]);
  } else {
    lengthBuffer = Buffer.from([length]);
  }
  return Buffer.concat([lengthBuffer, wordBuffer]);
}

/** Execute a MikroTik API command via SSH tunnel stream, returns raw response */
async function execMikroTikCmd(
  stream: any,
  command: string,
  args: Record<string, string> = {}
): Promise<string> {
  return new Promise((resolve) => {
    const parts = [encodeWord(command)];
    for (const [k, v] of Object.entries(args)) {
      parts.push(encodeWord(`=${k}=${v}`));
    }
    parts.push(Buffer.from([0]));
    const cmd = Buffer.concat(parts);
    stream.write(cmd);
    const chunks: Buffer[] = [];
    const onData = (data: Buffer) => {
      chunks.push(data);
      const combined = Buffer.concat(chunks).toString("utf8");
      // MikroTik ends response with !done or !trap
      if (combined.includes("!done") || combined.includes("!trap") || combined.includes("!fatal")) {
        stream.removeListener("data", onData);
        resolve(combined);
      }
    };
    stream.on("data", onData);
    // Safety timeout
    setTimeout(() => {
      stream.removeListener("data", onData);
      resolve(Buffer.concat(chunks).toString("utf8"));
    }, 8000);
  });
}

/** Get NAS info from DB */
async function getNasInfo(nasId: number): Promise<NasInfo | null> {
  const db = await getDb();
  if (!db) return null;
  const [nas] = await db.select({
    id: nasDevices.id,
    nasname: nasDevices.nasname,
    vpnTunnelIp: nasDevices.vpnTunnelIp,
    mikrotikApiPort: nasDevices.mikrotikApiPort,
    mikrotikApiUser: nasDevices.mikrotikApiUser,
    mikrotikApiPassword: nasDevices.mikrotikApiPassword,
    vpnUsername: nasDevices.vpnUsername,
    apiEnabled: nasDevices.apiEnabled,
  }).from(nasDevices).where(eq(nasDevices.id, nasId)).limit(1);
  return nas || null;
}

/** Resolve live VPN address and API settings exactly as the NAS API-test route does. */
async function resolveMikroTikProxyTarget(nasId: number): Promise<MikroTikProxyTarget | null> {
  const nas = await getNasInfo(nasId);
  if (!nas || !nas.apiEnabled || !nas.mikrotikApiUser || !nas.mikrotikApiPassword) return null;

  let connectIp = nas.vpnTunnelIp || nas.nasname;
  if (connectIp.startsWith("192.168.") && nas.vpnTunnelIp) {
    const liveIp = await sshVpn.getVpnUserLocalIp(nas.vpnUsername || "");
    if (!liveIp) return null;
    connectIp = liveIp;
  }
  const apiPort = nas.mikrotikApiPort || 8728;
  return { nas, host: connectIp, port: apiPort };
}

/** Ping through the same VPS MikroTik proxy already used by NAS API testing. */
async function pingViaApi(
  target: MikroTikProxyTarget,
  ip: string
): Promise<number | null> {
  try {
    const response = await fetch(`${ENV.VPS_LEGACY_URL}/api/mikrotik/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ENV.VPS_LEGACY_SECRET },
      body: JSON.stringify({
        host: target.host,
        port: target.port,
        username: target.nas.mikrotikApiUser,
        password: target.nas.mikrotikApiPassword,
        action: "ping",
        target_ip: ip,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json() as { success?: boolean; reachable?: boolean; pingMs?: number };
    return data.success && data.reachable && typeof data.pingMs === "number" ? Math.round(data.pingMs) : null;
  } catch {
    return null;
  }
}

/** Get owner ID from user context */
function getOwnerId(user: any): number {
  return user.role === "client_owner" ? user.id : (user.ownerId || user.id);
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const networkMonitorRouter = router({

  /** List all routers for the current client */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const ownerId = getOwnerId(ctx.user);

    const routers = await db.select({
      id: networkRouters.id,
      nasId: networkRouters.nasId,
      name: networkRouters.name,
      ipAddress: networkRouters.ipAddress,
      description: networkRouters.description,
      isOnline: networkRouters.isOnline,
      lastPingMs: networkRouters.lastPingMs,
      lastCheckedAt: networkRouters.lastCheckedAt,
      lastSeenOnlineAt: networkRouters.lastSeenOnlineAt,
      consecutiveFailures: networkRouters.consecutiveFailures,
      notifyOnDown: networkRouters.notifyOnDown,
      createdAt: networkRouters.createdAt,
    })
      .from(networkRouters)
      .where(eq(networkRouters.ownerId, ownerId));

    // Also get NAS names
    const nasIdsSet = new Set<number>();
    for (const r of routers as any[]) nasIdsSet.add(r.nasId as number);
    const nasIds = Array.from(nasIdsSet);
    let nasMap: Record<number, string> = {};
    if (nasIds.length > 0) {
      const nasList = await db.select({ id: nasDevices.id, shortname: nasDevices.shortname, nasname: nasDevices.nasname })
        .from(nasDevices)
        .where(inArray(nasDevices.id, nasIds));
      nasMap = Object.fromEntries(nasList.map((n: any) => [n.id as number, (n.shortname || n.nasname) as string]));
    }

    return routers.map((r: any) => ({ ...r, nasName: nasMap[r.nasId] || String(r.nasId) }));
  }),

  /** Add a single router by IP */
  add: protectedProcedure
    .input(z.object({
      nasId: z.number().int().positive(),
      name: z.string().min(1).max(100),
      ipAddress: z.string().refine(isValidIp, { message: "Invalid IP address" }),
      webPort: z.number().int().min(1).max(65535).default(80),
      description: z.string().max(500).optional(),
      notifyOnDown: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ownerId = getOwnerId(ctx.user);

      // Verify NAS belongs to owner
      const [nas] = await db.select().from(nasDevices)
        .where(and(eq(nasDevices.id, input.nasId), eq(nasDevices.ownerId, ownerId)))
        .limit(1);
      if (!nas) throw new TRPCError({ code: "FORBIDDEN", message: "NAS not found or not yours" });

      await db.insert(networkRouters).values({
        ownerId,
        nasId: input.nasId,
        name: input.name,
        ipAddress: input.ipAddress,
        webPort: input.webPort,
        description: input.description || null,
        notifyOnDown: input.notifyOnDown,
      });
      return { success: true };
    }),

  /** Add multiple routers from IP range (CIDR) */
  addRange: protectedProcedure
    .input(z.object({
      nasId: z.number().int().positive(),
      cidr: z.string().regex(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, "Invalid CIDR"),
      namePrefix: z.string().min(1).max(50).default("راوتر"),
      description: z.string().max(500).optional(),
      notifyOnDown: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ownerId = getOwnerId(ctx.user);

      // Verify NAS belongs to owner
      const [nas] = await db.select().from(nasDevices)
        .where(and(eq(nasDevices.id, input.nasId), eq(nasDevices.ownerId, ownerId)))
        .limit(1);
      if (!nas) throw new TRPCError({ code: "FORBIDDEN", message: "NAS not found or not yours" });

      const ips = expandCidr(input.cidr);
      if (ips.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid CIDR or too large range" });

      // Get existing IPs for this owner+NAS to avoid duplicates
      const existing = await db.select({ ipAddress: networkRouters.ipAddress })
        .from(networkRouters)
        .where(and(eq(networkRouters.ownerId, ownerId), eq(networkRouters.nasId, input.nasId)));
      const existingSet = new Set(existing.map((r: any) => r.ipAddress as string));

      const toInsert = ips
        .filter((ip: string) => !existingSet.has(ip))
        .map((ip: string, i: number) => ({
          ownerId,
          nasId: input.nasId,
          name: `${input.namePrefix} ${i + 1}`,
          ipAddress: ip,
          description: input.description || null,
          notifyOnDown: input.notifyOnDown,
        }));

      if (toInsert.length === 0) return { added: 0, skipped: ips.length };

      // Insert in batches of 50
      for (let i = 0; i < toInsert.length; i += 50) {
        await db.insert(networkRouters).values(toInsert.slice(i, i + 50));
      }

      return { added: toInsert.length, skipped: ips.length - toInsert.length };
    }),

  /** Delete a router */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ownerId = getOwnerId(ctx.user);

      await portForwardingEngine.cleanupRouter(ownerId, input.id);
      await db.delete(networkRouters)
        .where(and(eq(networkRouters.id, input.id), eq(networkRouters.ownerId, ownerId)));
      return { success: true };
    }),

  /** Bulk delete multiple routers */
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ownerId = getOwnerId(ctx.user);

      const ownedRouters = await db.select({ id: networkRouters.id })
        .from(networkRouters)
        .where(and(inArray(networkRouters.id, input.ids), eq(networkRouters.ownerId, ownerId)));
      for (const routerRow of ownedRouters) await portForwardingEngine.cleanupRouter(ownerId, routerRow.id);
      await db.delete(networkRouters)
        .where(and(inArray(networkRouters.id, input.ids), eq(networkRouters.ownerId, ownerId)));
      return { deleted: ownedRouters.length };
    }),

  /** Delete all routers for a NAS */
  deleteByNas: protectedProcedure
    .input(z.object({ nasId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ownerId = getOwnerId(ctx.user);

      const ownedRouters = await db.select({ id: networkRouters.id })
        .from(networkRouters)
        .where(and(eq(networkRouters.nasId, input.nasId), eq(networkRouters.ownerId, ownerId)));
      for (const routerRow of ownedRouters) await portForwardingEngine.cleanupRouter(ownerId, routerRow.id);
      await db.delete(networkRouters)
        .where(and(eq(networkRouters.nasId, input.nasId), eq(networkRouters.ownerId, ownerId)));
      return { success: true };
    }),

  /** Update router name/description */
  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      notifyOnDown: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ownerId = getOwnerId(ctx.user);

      const { id, ...updates } = input;
      if (Object.keys(updates).length === 0) return { success: true };

      await db.update(networkRouters)
        .set(updates)
        .where(and(eq(networkRouters.id, id), eq(networkRouters.ownerId, ownerId)));
      return { success: true };
    }),

  /** Ping all routers for a NAS now (manual refresh) */
  pingNow: protectedProcedure
    .input(z.object({ nasId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ownerId = getOwnerId(ctx.user);

      // Get routers for this NAS
      const routers = await db.select()
        .from(networkRouters)
        .where(and(eq(networkRouters.nasId, input.nasId), eq(networkRouters.ownerId, ownerId)));

      if (routers.length === 0) return { results: [] };

      const proxyTarget = await resolveMikroTikProxyTarget(input.nasId);
      const now = new Date();
      const results: Array<{ id: number; ip: string; online: boolean; pingMs: number | null }> = [];

      for (const r of routers as any[]) {
        let pingMs: number | null = null;
        let online = false;
        let sessionFailed = false;

        if (proxyTarget) {
          pingMs = await pingViaApi(proxyTarget, r.ipAddress);
          online = pingMs !== null;
        } else {
          // API session unavailable — skip status update to avoid false offline
          sessionFailed = true;
        }

        if (sessionFailed) {
          // Can't determine status — just update lastCheckedAt without changing isOnline
          await db.update(networkRouters)
            .set({ lastCheckedAt: now })
            .where(eq(networkRouters.id, r.id));
          results.push({ id: r.id, ip: r.ipAddress, online: r.isOnline ?? false, pingMs: null });
          continue;
        }

        const newFailures = online ? 0 : (r.consecutiveFailures + 1);

        // Update DB
        await db.update(networkRouters)
          .set({
            isOnline: online,
            lastPingMs: pingMs,
            lastCheckedAt: now,
            lastSeenOnlineAt: online ? now : r.lastSeenOnlineAt,
            consecutiveFailures: newFailures,
          })
          .where(eq(networkRouters.id, r.id));

        // Send down notification when threshold is reached and notifyOnDown is enabled
        if (!online && r.notifyOnDown && newFailures === DOWN_NOTIFY_THRESHOLD) {
          const lastNotified = r.lastDownNotifiedAt ? new Date(r.lastDownNotifiedAt).getTime() : 0;
          const minutesSinceNotified = (now.getTime() - lastNotified) / 60000;
          if (minutesSinceNotified > 30) {
            // إشعار الانقطاع عبر SMS/Push (النظام القديم)
            notifyNasDisconnected(r.ownerId, r.name || r.ipAddress, r.id).catch(console.error);
            // إشعار الانقطاع عبر Telegram/WhatsApp (النظام الجديد)
            notifyOwnerEvent(r.ownerId, 'ownerRouterDown', {
              title: `راوتر منقطع: ${r.name || r.ipAddress}`,
              message: `الراوتر ${r.name || r.ipAddress} (${r.ipAddress}) انقطع عن الاتصال`,
              emoji: '🔴',
            }).catch(() => {});
            await db.update(networkRouters)
              .set({ lastDownNotifiedAt: now })
              .where(eq(networkRouters.id, r.id));
            // Log the down event
            await db.insert(networkRouterDownLog).values({
              routerId: r.id, ownerId: r.ownerId,
              routerName: r.name || r.ipAddress, ipAddress: r.ipAddress,
              eventType: 'down', detectedAt: now, notified: true,
            }).catch(console.error);
          }
        }

        // Send reconnect notification when coming back online after being down
        if (online && r.consecutiveFailures >= DOWN_NOTIFY_THRESHOLD) {
          notifyNasReconnected(r.ownerId, r.name || r.ipAddress, r.id).catch(console.error);
          // إشعار العودة عبر Telegram/WhatsApp
          notifyOwnerEvent(r.ownerId, 'ownerRouterDown', {
            title: `راوتر عاد: ${r.name || r.ipAddress}`,
            message: `الراوتر ${r.name || r.ipAddress} (${r.ipAddress}) عاد للاتصال بنجاح ✅`,
            emoji: '🟢',
          }).catch(() => {});
          // Log the up event and update the last down log with duration
          await db.insert(networkRouterDownLog).values({
            routerId: r.id, ownerId: r.ownerId,
            routerName: r.name || r.ipAddress, ipAddress: r.ipAddress,
            eventType: 'up', detectedAt: now, resolvedAt: now, notified: false,
          }).catch(console.error);
        }

        results.push({ id: r.id, ip: r.ipAddress, online, pingMs });
      }

      return { results, apiAvailable: proxyTarget !== null };
    }),

  /** Get NAS list for current owner (for dropdown) */
  getMyNasList: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const ownerId = getOwnerId(ctx.user);

    const nasList = await db.select({
      id: nasDevices.id,
      name: nasDevices.shortname,
      ip: nasDevices.nasname,
      apiEnabled: nasDevices.apiEnabled,
      mikrotikApiUser: nasDevices.mikrotikApiUser,
      allocatedIp: nasDevices.allocatedIp,
      vpnTunnelIp: nasDevices.vpnTunnelIp,
    })
      .from(nasDevices)
      .where(eq(nasDevices.ownerId, ownerId));

    return nasList;
  }),

  /** Stats summary */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { total: 0, online: 0, offline: 0, unknown: 0 };
    const ownerId = getOwnerId(ctx.user);

    const routers = await db.select({
      isOnline: networkRouters.isOnline,
      lastCheckedAt: networkRouters.lastCheckedAt,
    })
      .from(networkRouters)
      .where(eq(networkRouters.ownerId, ownerId));

    const total = routers.length;
    const online = routers.filter((r: any) => r.isOnline).length;
    const unknown = routers.filter((r: any) => !r.lastCheckedAt).length;
    const offline = total - online - unknown;

    return { total, online, offline, unknown };
  }),

  /** Get auto-ping settings for current owner */
  getAutoPingSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { autoPingEnabled: false, pingIntervalMinutes: 5, lastAutoPingAt: null };
    const ownerId = getOwnerId(ctx.user);

    const [settings] = await db.select()
      .from(networkMonitorSettings)
      .where(eq(networkMonitorSettings.ownerId, ownerId))
      .limit(1);

    if (!settings) return { autoPingEnabled: false, pingIntervalMinutes: 5, lastAutoPingAt: null };
    return {
      autoPingEnabled: settings.autoPingEnabled,
      pingIntervalMinutes: settings.pingIntervalMinutes,
      lastAutoPingAt: settings.lastAutoPingAt,
    };
  }),

  /** Save auto-ping settings */
  saveAutoPingSettings: protectedProcedure
    .input(z.object({
      autoPingEnabled: z.boolean(),
      // Only allow safe intervals: 5, 10, 15, 30 minutes
      pingIntervalMinutes: z.number().refine(
        (v) => [5, 10, 15, 30].includes(v),
        { message: "Interval must be 5, 10, 15, or 30 minutes" }
      ),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const ownerId = getOwnerId(ctx.user);

      // Upsert settings
      await db.execute(
        sql`INSERT INTO network_monitor_settings (ownerId, autoPingEnabled, pingIntervalMinutes)
            VALUES (${ownerId}, ${input.autoPingEnabled}, ${input.pingIntervalMinutes})
            ON DUPLICATE KEY UPDATE
              autoPingEnabled = VALUES(autoPingEnabled),
              pingIntervalMinutes = VALUES(pingIntervalMinutes),
              updatedAt = NOW()`
      );

      return { success: true };
    }),

  /** Internal: run auto-ping for all owners who have it enabled and interval has passed */
  runAutoPing: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Only owner/super_admin can trigger this
      if (!['owner', 'super_admin'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      // Get all enabled settings where interval has passed
      const now = new Date();
      const allSettings = await db.select().from(networkMonitorSettings)
        .where(eq(networkMonitorSettings.autoPingEnabled, true));

      let totalPinged = 0;

      for (const setting of allSettings as any[]) {
        // Check if interval has passed
        if (setting.lastAutoPingAt) {
          const lastPing = new Date(setting.lastAutoPingAt);
          const diffMinutes = (now.getTime() - lastPing.getTime()) / 60000;
          if (diffMinutes < setting.pingIntervalMinutes) continue;
        }

        // Get all NAS for this owner
        const nasList = await db.select({ id: nasDevices.id })
          .from(nasDevices)
          .where(and(eq(nasDevices.ownerId, setting.ownerId), eq(nasDevices.apiEnabled, true)));

        for (const nas of nasList as any[]) {
          const routers = await db.select()
            .from(networkRouters)
            .where(and(eq(networkRouters.nasId, nas.id), eq(networkRouters.ownerId, setting.ownerId)));

          if (routers.length === 0) continue;

          const proxyTarget = await resolveMikroTikProxyTarget(nas.id);
          if (!proxyTarget) continue;

          for (const r of routers as any[]) {
            const pingMs = await pingViaApi(proxyTarget, r.ipAddress);
            const online = pingMs !== null;
            const newFailures = online ? 0 : (r.consecutiveFailures + 1);
            await db.update(networkRouters)
              .set({
                isOnline: online,
                lastPingMs: pingMs,
                lastCheckedAt: now,
                lastSeenOnlineAt: online ? now : r.lastSeenOnlineAt,
                consecutiveFailures: newFailures,
              })
              .where(eq(networkRouters.id, r.id));

            // Send down notification when threshold is reached
            if (!online && r.notifyOnDown && newFailures === DOWN_NOTIFY_THRESHOLD) {
              const lastNotified = r.lastDownNotifiedAt ? new Date(r.lastDownNotifiedAt).getTime() : 0;
              const minutesSinceNotified = (now.getTime() - lastNotified) / 60000;
              if (minutesSinceNotified > 30) {
                notifyNasDisconnected(r.ownerId, r.name || r.ipAddress, r.id).catch(console.error);
                await db.update(networkRouters)
                  .set({ lastDownNotifiedAt: now })
                  .where(eq(networkRouters.id, r.id));
                await db.insert(networkRouterDownLog).values({
                  routerId: r.id, ownerId: r.ownerId,
                  routerName: r.name || r.ipAddress, ipAddress: r.ipAddress,
                  eventType: 'down', detectedAt: now, notified: true,
                }).catch(console.error);
              }
            }

            // Send reconnect notification when coming back online
            if (online && r.consecutiveFailures >= DOWN_NOTIFY_THRESHOLD) {
              notifyNasReconnected(r.ownerId, r.name || r.ipAddress, r.id).catch(console.error);
              await db.insert(networkRouterDownLog).values({
                routerId: r.id, ownerId: r.ownerId,
                routerName: r.name || r.ipAddress, ipAddress: r.ipAddress,
                eventType: 'up', detectedAt: now, resolvedAt: now, notified: false,
              }).catch(console.error);
            }

            totalPinged++;
          }

        }

        // Update lastAutoPingAt
        await db.execute(
          sql`UPDATE network_monitor_settings SET lastAutoPingAt = NOW() WHERE ownerId = ${setting.ownerId}`
        );
      }

      return { success: true, totalPinged };
    }),

  /** Get downtime history for a specific router */
  getDownLog: protectedProcedure
    .input(z.object({
      routerId: z.number().int().positive(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const ownerId = getOwnerId(ctx.user);

      const logs = await db.select()
        .from(networkRouterDownLog)
        .where(and(
          eq(networkRouterDownLog.routerId, input.routerId),
          eq(networkRouterDownLog.ownerId, ownerId)
        ))
        .orderBy(sql`${networkRouterDownLog.detectedAt} DESC`)
        .limit(input.limit);

      return logs;
    }),

  /** Toggle notifyOnDown for a router */
  toggleNotify: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      notifyOnDown: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const ownerId = getOwnerId(ctx.user);

      await db.update(networkRouters)
        .set({ notifyOnDown: input.notifyOnDown })
        .where(and(eq(networkRouters.id, input.id), eq(networkRouters.ownerId, ownerId)));

      return { success: true };
    }),
});
