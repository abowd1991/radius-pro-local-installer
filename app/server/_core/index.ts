import "dotenv/config";
// ── Storage clock: all application instants are interpreted as UTC. ───────
// Owner/NAS timezones are resolved only by TimezoneService for UI and report boundaries.
process.env.TZ = 'UTC';

import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

import { startV2Scheduler } from "../v2/V2Scheduler";
import { registerV2EventHandlers } from "../v2/V2EventHandlers";
import { registerAccountingBridge } from "../v2/AccountingBridge";
import { registerAuthorizationBridge } from "../v2/AuthorizationBridge";
import { vpnNasProvisioningService } from "../domains/vpn/VpnNasProvisioningService";
import multer from "multer";
import { storagePut } from "../storage";
import path from "path";
import { sdk } from "./sdk";
import { COOKIE_NAME } from "@shared/const";
import cookieParser from "cookie-parser";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { initRedis } from "./redis";
import { ENV } from "./env";
import { isLiveSessionFromV2, isOpenAccountingWithoutLiveSession } from "../domains/accounting/CardCheckLiveSessionPolicy";
import { assertAllowedUpload, createSafeUploadKey, getUploadLimit, isAllowedUploadMime, UnsafeUploadError } from "../security/uploadPolicy";
// fixVpsDate/fixVpsDateObj removed: mysql2 timezone='local' handles Palestine time natively — no manual offset needed.

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());
  
  // Serve uploaded files (bank receipts, etc.)
  const uploadsPath = path.join(process.cwd(), "uploads");
  app.use("/uploads", express.static(uploadsPath));
  // صفحة رفع الإيصال - HTML بسيط يعمل على جميع المتصفحات بما فيها Captive Portal
  app.get("/upload-receipt", (req, res) => {
    res.sendFile(path.join(process.cwd(), "server", "upload-receipt.html"));
  });

  // Health check endpoint (for Management API)
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: Date.now(),
      service: "radius-dashboard",
    });
  });
  
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: Date.now(),
      service: "radius-dashboard",
    });
  });

  // Administrative reprovisioning endpoint. It delegates all business rules to the
  // central provisioning service and is restricted to the private VPS API key.
  app.post("/api/internal/vpn-provisioning/rollout", async (req, res) => {
    if (req.header("X-API-Key") !== ENV.VPS_LEGACY_SECRET) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const nasIds = Array.isArray(req.body?.nasIds)
      ? req.body.nasIds.filter((id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id > 0).slice(0, 25)
      : null;
    try {
      const results = nasIds && nasIds.length > 0
        ? await Promise.all(nasIds.map((nasId: number) => vpnNasProvisioningService.provisionNas(nasId)))
        : await vpnNasProvisioningService.rolloutExistingNas();
      return res.json({ success: true, results });
    } catch (error) {
      console.error("[VPN Provisioning] Central rollout failed", error);
      return res.status(500).json({ success: false, error: "Central VPN provisioning rollout failed" });
    }
  });
  
  // Storage proxy for /manus-storage/* paths
  registerStorageProxy(app);

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Avatar upload endpoint
  const avatarUpload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: getUploadLimit("avatar") },
    fileFilter: (_req, file, callback) => callback(null, isAllowedUploadMime("avatar", file.mimetype)),
  });
  
  app.post("/api/upload/avatar", avatarUpload.single("file"), async (req, res) => {
    try {
      // Verify user is authenticated
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const session = await sdk.verifySession(token);
      if (!session) {
        return res.status(401).json({ error: "Invalid session" });
      }
      
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: "لم يتم رفع صورة مسموح بها" });
      }
      
      assertAllowedUpload("avatar", file);
      const filename = createSafeUploadKey("avatar", file.mimetype, crypto.randomUUID());
      
      // Upload to S3
      const { url } = await storagePut(filename, file.buffer, file.mimetype);
      
      res.json({ url });
    } catch (error) {
      console.error("Avatar upload error:", error);
      if (error instanceof UnsafeUploadError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Upload failed" });
    }
  });
  
  // Support image upload endpoint (no size limit)
  const supportUpload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: getUploadLimit("support") },
    fileFilter: (_req, file, callback) => callback(null, isAllowedUploadMime("support", file.mimetype)),
  });
  
  app.post("/api/upload", supportUpload.single("file"), async (req, res) => {
    try {
      // Verify user is authenticated
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const session = await sdk.verifySession(token);
      if (!session) {
        return res.status(401).json({ error: "Invalid session" });
      }
      
      const file = (req as any).file;
      if (!file) {
        return res.status(400).json({ error: "لم يتم رفع ملف مسموح" });
      }
      
      assertAllowedUpload("support", file);
      const filename = createSafeUploadKey("support", file.mimetype, crypto.randomUUID());
      
      // Upload to S3
      const { url } = await storagePut(filename, file.buffer, file.mimetype);
      
      res.json({ url });
    } catch (error) {
      console.error("Support upload error:", error);
      if (error instanceof UnsafeUploadError) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Upload failed" });
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "حجم الملف تجاوز الحد المسموح" : "تعذر قبول الملف المرفوع";
      return res.status(400).json({ error: message });
    }
    next(error);
  });
  
  // ============================================================
  // HOTSPOT CORS: Allow requests from MikroTik Hotspot pages
  // Handles http://hotspot.radius-pro.com/check (no HTTPS redirect)
  // ============================================================
  app.use((req, res, next) => {
    const host = req.hostname || '';
    if (host === 'hotspot.radius-pro.com' || req.path === '/check' || req.path.startsWith('/check') || req.path === '/api/check-card') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
    }
    next();
  });

  // ============================================================
  // HOTSPOT WIDGET: POST /check  (http://hotspot.radius-pro.com/check)
  // Same logic as /api/check-card but accessible over HTTP for MikroTik Walled Garden
  // Rate limit: 10 requests per 10 seconds per token
  // ============================================================
  app.post("/check", async (req, res) => {
    // Reuse same handler as /api/check-card by forwarding
    req.url = '/api/check-card';
    return app._router.handle(req, res, () => {
      res.status(404).json({ success: false, error: 'Not found' });
    });
  });

  // ============================================================
  // PUBLIC: Card Check Endpoint (no auth required)
  // POST /api/check-card  { token: string, code: string }
  // Rate limit: 10 requests per 10 seconds per token
  // ============================================================
  app.post("/api/check-card", async (req, res) => {
    try {
      // Support both `slug` (new) and `token` (legacy) in request body
      const { token: rawToken, slug: rawSlug, code } = req.body || {};
      const slug = rawSlug && typeof rawSlug === 'string' ? rawSlug.trim().toLowerCase() : null;
      const token = rawToken && typeof rawToken === 'string' ? rawToken.trim() : null;
      if (!slug && (!token || token.length < 8)) {
        return res.status(400).json({ success: false, error: 'رابط الفحص غير صالح' });
      }
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال كود الكارت' });
      }

      // Rate limiting: 10 requests per 10 seconds per slug/token
      const rlKey = slug ? `check:slug:${slug}` : `check:token:${token}`;
      const { checkRateLimit, cache, cardCheckCacheKeys } = await import('../db/cardCheckCache');
      const rl = await checkRateLimit(rlKey, 10, 10_000);
      if (!rl.allowed) {
        return res.status(429).json({
          success: false,
          error: 'تجاوزت الحد المسموح من الطلبات. يرجى الانتظار قليلاً.',
          retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
        });
      }

      // Validate slug/token from DB (with 30s cache)
      const cacheKey = slug ? cardCheckCacheKeys.slug(slug) : cardCheckCacheKeys.token(token!);
      let tokenRecord = await cache.get<{ id: number; ownerId: number; isActive: boolean; networkName: string | null; ownerTimezone: string | null }>(cacheKey);

      if (!tokenRecord || !("ownerTimezone" in tokenRecord)) {
        const { getDb } = await import('../db');
        const { checkTokens, users } = await import('../../drizzle/schema');
        const { eq: eqFn } = await import('drizzle-orm');
        const db2 = await getDb();
        const [row] = await db2!
          .select({
            id: checkTokens.id,
            ownerId: checkTokens.ownerId,
            isActive: checkTokens.isActive,
            networkName: checkTokens.networkName,
            ownerTimezone: users.timezone,
          })
          .from(checkTokens)
          .leftJoin(users, eqFn(checkTokens.ownerId, users.id))
          .where(slug ? eqFn(checkTokens.slug, slug) : eqFn(checkTokens.token, token!))
          .limit(1);
        if (!row) {
          return res.status(200).json({ success: false, error: 'رابط الفحص غير موجود أو منتهي الصلاحية' });
        }
        tokenRecord = row;
        await cache.set(cacheKey, row, 30);
      }

      if (!tokenRecord!.isActive) {
        return res.status(200).json({ success: false, error: 'رابط الفحص معطّل' });
      }

      // Look up the card (with 30s cache)
      // radiusCards uses: status (unused/active/used/expired/suspended), createdBy (ownerId), planId
      const cardIdentityCacheKey = cardCheckCacheKeys.cardIdentity(tokenRecord!.ownerId, code.trim());
      const cachedIdentity = await cache.get<{ lifecycleId: string }>(cardIdentityCacheKey);
      const cardCacheKey = cachedIdentity
        ? cardCheckCacheKeys.cardLifecycle(cachedIdentity.lifecycleId)
        : null;
      let cardData = await cache.get<{
        id: number;
        lifecycleId: string;
        username: string;
        status: string;
        expiresAt: string | null;
        createdAt: string;
        planName: string | null;
        dataLimitBytes: number | null;
        sessionTimeout: number | null;
        createdBy: number;
      }>(cardCacheKey ?? "cardcheck:missing");

      if (!cardData) {
        const { cardCheckRepository } = await import('../domains/cardCheck/CardCheckRepository');
        const card = await cardCheckRepository.findCurrentCard(tokenRecord!.ownerId, code.trim());
        if (!card) {
          return res.status(200).json({ success: false, error: 'الكارت غير موجود' });
        }

        // Security: ensure card belongs to token owner
        if (card.createdBy !== tokenRecord!.ownerId) {
          return res.status(200).json({ success: false, error: 'الكارت غير موجود' });
        }

        // db uses UTC; all API timestamps must be explicit UTC instants.
        const toUtcIso = (d: Date | string | null | undefined): string | null => {
          if (!d) return null;
          if (typeof d === 'string') {
            const s = d.trim();
            if (!s.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(s)) {
              return s.replace(' ', 'T') + 'Z';
            }
            return s;
          }
          return d.toISOString();
        };
        cardData = {
          id: card.id,
          lifecycleId: card.lifecycleId,
          username: card.username,
          status: card.status,
          expiresAt: toUtcIso(card.expiresAt as Date | null),
          activatedAt: toUtcIso(card.activatedAt as Date | null),
          firstLoginAt: toUtcIso(card.firstLoginAt as Date | null),
          firstUseAt: toUtcIso(card.firstUseAt as Date | null),
          windowEndTime: toUtcIso(card.windowEndTime as Date | null),
          createdAt: toUtcIso(card.createdAt as Date | null) ?? new Date().toISOString(),
          planName: card.planName ?? null,
          dataLimitBytes: card.dataLimitBytes ?? null,
          sessionTimeout: card.sessionTimeout ?? null,
          rateLimit: card.rateLimit ?? null,
          usageBudgetSeconds: card.usageBudgetSeconds ?? 0,
          windowSeconds: card.windowSeconds ?? 0,
          totalSessionTime: card.totalSessionTime ?? 0,
          totalDataUsed: card.totalDataUsed ?? 0,
          createdBy: card.createdBy,
        } as any;
        await cache.set(cardCheckCacheKeys.cardIdentity(tokenRecord!.ownerId, card.username), { lifecycleId: card.lifecycleId }, 30);
        await cache.set(cardCheckCacheKeys.cardLifecycle(card.lifecycleId), cardData, 30);
      }

      // Determine card status
      const now = new Date();
      const expiresAt = (cardData as any)?.expiresAt ? new Date((cardData as any).expiresAt) : null;
      const isExpired = expiresAt ? expiresAt < now : false;

      // Map DB status to display status
      const dbStatus = (cardData as any).status;
      let status: 'active' | 'used' | 'expired' | 'inactive';
      if (dbStatus === 'suspended' || dbStatus === 'cancelled') {
        status = 'inactive';
      } else if (dbStatus === 'used') {
        status = 'used';
      } else if (dbStatus === 'expired' || isExpired) {
        status = 'expired';
      } else if (dbStatus === 'active' || dbStatus === 'unused') {
        status = 'active';
      } else {
        status = 'inactive';
      }

      // Convert bytes to MB for display
      const dataLimitMb = (cardData as any).dataLimitBytes ? Math.round((cardData as any).dataLimitBytes / (1024 * 1024)) : null;
      const totalDataUsedMb = (cardData as any).totalDataUsed ? Math.round((cardData as any).totalDataUsed / (1024 * 1024)) : 0;

      // ── جلسات دورة الكرت الحالية فقط (V2) ─────────────────────────────────
      // online_sessions يحدد الاتصال الحي حصراً، وradacct يبقى تاريخاً عبر lifecycleId.
      let sessions: Array<{
        sessionId: string;
        startTime: string | null;
        stopTime: string | null;
        durationSeconds: number | null;
        ipAddress: string | null;
        inputMb: number;
        outputMb: number;
        terminateCause: string | null;
        isActive: boolean;
        isAccountingOpenWithoutLiveSession: boolean;
      }> = [];
      let totalUsedSeconds = (cardData as any).totalSessionTime ?? 0;
      try {
        const { cardCheckRepository } = await import('../domains/cardCheck/CardCheckRepository');
        const { usageEngine } = await import('../domains/accounting/UsageEngine');
        const { audit, activeSessions } = await cardCheckRepository.getLifecycleSnapshot((cardData as any).lifecycleId);
        const liveSessionIds = new Set(activeSessions.map((session) => session.acctSessionId).filter(Boolean));
        const toUtcIso = (value: Date | string | null | undefined): string | null => {
          if (!value) return null;
          return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
        };
        sessions = audit.history.slice(0, 20).map((session) => ({
          sessionId: session.acctSessionId ?? '',
          startTime: toUtcIso(session.startTime),
          stopTime: toUtcIso(session.stopTime),
          durationSeconds: session.sessionTime ?? null,
          ipAddress: session.framedIp ?? null,
          inputMb: session.inputOctets ? Math.round(Number(session.inputOctets) / (1024 * 1024) * 100) / 100 : 0,
          outputMb: session.outputOctets ? Math.round(Number(session.outputOctets) / (1024 * 1024) * 100) / 100 : 0,
          terminateCause: session.terminateCause ?? null,
          isActive: isLiveSessionFromV2(session.acctSessionId, liveSessionIds),
          isAccountingOpenWithoutLiveSession: isOpenAccountingWithoutLiveSession(
            session.stopTime,
            session.acctSessionId,
            liveSessionIds,
          ),
        }));
        const historySessionIds = new Set(audit.history.map((session) => session.acctSessionId));
        for (const live of activeSessions) {
            if (!historySessionIds.has(live.acctSessionId)) {
              sessions.unshift({
                sessionId: live.acctSessionId,
                startTime: toUtcIso(live.startTime),
                stopTime: null,
                durationSeconds: live.sessionTime ?? 0,
                ipAddress: live.framedIpAddress ?? null,
                inputMb: live.inputOctets ? Math.round(Number(live.inputOctets) / (1024 * 1024) * 100) / 100 : 0,
                outputMb: live.outputOctets ? Math.round(Number(live.outputOctets) / (1024 * 1024) * 100) / 100 : 0,
                terminateCause: null,
                isActive: true,
                isAccountingOpenWithoutLiveSession: false,
              });
            }
        }
        const usage = await usageEngine.calculateUsage(
          (cardData as any).username,
          (cardData as any).id,
          (cardData as any).lifecycleId,
        );
        totalUsedSeconds = usage.totalUsedSeconds;
      } catch (sessErr) {
        // Non-fatal: sessions unavailable
        console.error('[check-card] Sessions fetch error:', sessErr);
      }

      // ── Calculate time budget details ──
      const usageBudgetSeconds = (cardData as any).usageBudgetSeconds ?? 0;
      const windowSeconds = (cardData as any).windowSeconds ?? 0;
      // Effective total budget: usageBudgetSeconds (if set) else sessionTimeout (plan)
      const totalBudgetSeconds = usageBudgetSeconds > 0
        ? usageBudgetSeconds
        : ((cardData as any).sessionTimeout ?? 0);
      const budgetRemainingSeconds = totalBudgetSeconds > 0
        ? Math.max(0, totalBudgetSeconds - totalUsedSeconds)
        : null;

      // ── Calculate speed and last session ──
      // Speed from plan (rateLimit field: e.g. '1M' or '1024k')
      let speedMbps: string | null = null;
      const rateLimit = (cardData as any).rateLimit || (cardData as any).rate_limit || null;
      if (rateLimit) {
        const mMatch = String(rateLimit).match(/(\d+(?:\.\d+)?)\s*[Mm]/);
        const kMatch = String(rateLimit).match(/(\d+(?:\.\d+)?)\s*[Kk]/);
        if (mMatch) speedMbps = parseFloat(mMatch[1]).toFixed(0) + ' Mbps';
        else if (kMatch) speedMbps = (parseFloat(kMatch[1]) / 1024).toFixed(1) + ' Mbps';
        else speedMbps = rateLimit;
      }

      // Last session ago
      // stopTime is a raw Palestine-local string "YYYY-MM-DD HH:mm:ss" from MySQL.
      // Append +03:00 to parse it correctly as Palestine time for comparison with now (UTC).
      let lastSessionAgo: string | null = null;
      if (sessions.length > 0) {
        const lastSess = sessions[0];
        if (lastSess.isActive) {
          lastSessionAgo = 'متصل الآن';
        } else if (lastSess.stopTime) {
          // Parse Palestine-local string: append +03:00 so JS treats it as Palestine time
          const stopStr = lastSess.stopTime.trim();
          const stopDate = new Date(
            (!stopStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(stopStr))
              ? stopStr.replace(' ', 'T') + '+03:00'
              : stopStr
          );
          if (!isNaN(stopDate.getTime())) {
            const diffSec = Math.floor((now.getTime() - stopDate.getTime()) / 1000);
            if (diffSec < 60) lastSessionAgo = 'منذ لحظات';
            else if (diffSec < 3600) lastSessionAgo = 'منذ ' + Math.floor(diffSec / 60) + ' دقيقة';
            else if (diffSec < 86400) lastSessionAgo = 'منذ ' + Math.floor(diffSec / 3600) + ' ساعة';
            else lastSessionAgo = 'منذ ' + Math.floor(diffSec / 86400) + ' يوم';
          }
        }
      }

      // ── Security: strip sensitive fields from response ──
      return res.json({
        success: true,
        networkName: tokenRecord!.networkName || null,
        // Read-only display metadata for the public UI. Card instants remain UTC.
        ownerTimezone: tokenRecord!.ownerTimezone || null,
        card: {
          username: (cardData as any).username,
          status,
          expiresAt: (cardData as any).expiresAt,
          activatedAt: (cardData as any).activatedAt,
          firstLoginAt: (cardData as any).firstLoginAt,
          firstUseAt: (cardData as any).firstUseAt,
          windowEndTime: (cardData as any).windowEndTime,
          createdAt: (cardData as any).createdAt,
          planName: (cardData as any).planName,
          dataLimitMb,
          totalDataUsedMb,
          speedMbps,
          lastSessionAgo,
          // Time details
          totalBudgetSeconds: totalBudgetSeconds > 0 ? totalBudgetSeconds : null,
          totalUsedSeconds,
          budgetRemainingSeconds,
          windowSeconds: windowSeconds > 0 ? windowSeconds : null,
          // Expiry countdown
          timeRemainingSeconds: expiresAt && !isExpired
            ? Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
            : null,
        },
        sessions,
      });
    } catch (err) {
      console.error('[check-card] Error:', err);
      return res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
  });

  // ============================================================
  // Telegram Bot Webhook - POST /api/telegram/webhook/:botToken
  // ============================================================
  app.post('/api/telegram/webhook/:botToken', async (req, res) => {
    try {
      const { botToken } = req.params;
      const update = req.body;
      if (!update || !botToken) return res.sendStatus(200);

      const { getDb: getDbTg } = await import('../db');
      const { notificationChannels, radiusCards, plans, radacct, onlineSessions } = await import('../../drizzle/schema');
      const { eq: eqTg, and: andTg, desc: descTg } = await import('drizzle-orm');
      const dbTg = await getDbTg();
      if (!dbTg) return res.sendStatus(200);

      // Find owner with this bot token
      const [channelRow] = await dbTg
        .select({ ownerId: notificationChannels.ownerId })
        .from(notificationChannels)
        .where(andTg(
          eqTg(notificationChannels.channel, 'telegram'),
          eqTg(notificationChannels.telegramBotToken, botToken)
        ))
        .limit(1);

      if (!channelRow) return res.sendStatus(200);

      // ─── معالجة callback_query (زر قبول الطلب) ─────────────────────────────────────────
      if (update.callback_query) {
        const cbQuery = update.callback_query;
        const cbChatId = cbQuery.message?.chat?.id;
        const cbData = cbQuery.data as string;
        const cbMessageId = cbQuery.message?.message_id;
        const answerCallback = async (text: string, showAlert = false) => {
          await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: cbQuery.id, text, show_alert: showAlert }),
          });
        };
        const editMessage = async (newText: string) => {
          if (!cbChatId || !cbMessageId) return;
          await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: cbChatId,
              message_id: cbMessageId,
              text: newText,
              parse_mode: 'HTML',
            }),
          });
        };

        // معالجة accept_order:{orderId}:{storeId}
        const acceptMatch = cbData?.match(/^accept_order:(\d+):(\d+)$/);
        if (acceptMatch) {
          const orderId = parseInt(acceptMatch[1], 10);
          const storeId = parseInt(acceptMatch[2], 10);
          try {
            const { storeOrders, storeProducts, stores, radiusCards: radiusCardsTable, notificationChannels: nc } = await import('../../drizzle/schema');
            const tweetsmsService = await import('../services/tweetsmsService');

            // جلب الطلب
            const [order] = await dbTg.select().from(storeOrders).where(
              andTg(eqTg(storeOrders.id, orderId), eqTg(storeOrders.storeId, storeId))
            ).limit(1);

            if (!order) {
              await answerCallback('❌ الطلب غير موجود', true);
              return res.sendStatus(200);
            }
            if (order.status === 'delivered') {
              await answerCallback('✅ الطلب مُسلَّم مسبقاً', true);
              return res.sendStatus(200);
            }
            if (order.status === 'cancelled') {
              await answerCallback('❌ الطلب مُلغى', true);
              return res.sendStatus(200);
            }

            // جلب المتجر والمنتج
            const [store] = await dbTg.select().from(stores).where(eqTg(stores.id, storeId)).limit(1);
            if (!store) {
              await answerCallback('❌ المتجر غير موجود', true);
              return res.sendStatus(200);
            }
            // تحقق أن المالك هو نفس صاحب البوت
            if (store.ownerId !== channelRow.ownerId) {
              await answerCallback('❌ غير مصرح', true);
              return res.sendStatus(200);
            }

            const [product] = await dbTg.select().from(storeProducts).where(eqTg(storeProducts.id, order.productId)).limit(1);
            if (!product) {
              await answerCallback('❌ المنتج غير موجود', true);
              return res.sendStatus(200);
            }

            // ─── جلب الكروت المحجوزة (دعم الكمية) ──────────────────────────────────
            const qty = order.quantity ?? 1;
            const reservedCardIds: number[] = order.cardIds
              ? JSON.parse(order.cardIds as string)
              : (order.cardId ? [order.cardId] : []);

            // جلب بيانات كل الكروت المحجوزة
            const deliveredCards: { id: number; username: string; password: string | null }[] = [];

            for (const cid of reservedCardIds) {
              const [c] = await dbTg.select().from(radiusCardsTable).where(
                andTg(
                  eqTg(radiusCardsTable.id, cid),
                  eqTg(radiusCardsTable.reservedOrderId, orderId),
                  eqTg(radiusCardsTable.status, 'reserved')
                )
              ).limit(1);
              if (c) deliveredCards.push({ id: c.id, username: c.username, password: c.password ?? null });
            }

            // إذا لم توجد كروت محجوزة — حاول حجز جديد من المخزون
            if (deliveredCards.length === 0 && product.batchId) {
              for (let i = 0; i < qty; i++) {
                const [candidate] = await dbTg.select({ id: radiusCardsTable.id })
                  .from(radiusCardsTable)
                  .where(andTg(
                    eqTg(radiusCardsTable.batchId, product.batchId),
                    eqTg(radiusCardsTable.status, 'unused'),
                    eqTg(radiusCardsTable.createdBy, store.ownerId)
                  ))
                  .limit(1);
                if (!candidate) break;
                const [upd] = await dbTg.update(radiusCardsTable)
                  .set({ status: 'reserved', reservedOrderId: orderId, reservedAt: new Date() })
                  .where(andTg(eqTg(radiusCardsTable.id, candidate.id), eqTg(radiusCardsTable.status, 'unused')));
                if ((upd as any).affectedRows > 0) {
                  const [c] = await dbTg.select().from(radiusCardsTable).where(eqTg(radiusCardsTable.id, candidate.id)).limit(1);
                  if (c) deliveredCards.push({ id: c.id, username: c.username, password: c.password ?? null });
                }
              }
            }

            if (deliveredCards.length === 0) {
              await answerCallback('❌ لا توجد كروت متاحة', true);
              return res.sendStatus(200);
            }

            // بناء cardsData JSON
            const cardsData = deliveredCards.map(c => ({ username: c.username, password: c.password }));
            const firstCard = deliveredCards[0];

            // تحديث الطلب إلى delivered
            await dbTg.update(storeOrders).set({
              status: 'delivered',
              cardId: firstCard.id,
              cardUsername: firstCard.username,
              cardPassword: firstCard.password ?? null,
              cardIds: JSON.stringify(deliveredCards.map(c => c.id)),
              cardsData: JSON.stringify(cardsData),
              updatedAt: new Date(),
            }).where(eqTg(storeOrders.id, orderId));

            // إرسال SMS للزبون إذا كان مفعّلاً
            try {
              const [smsChannel] = await dbTg.select({ smsAdminEnabled: nc.smsAdminEnabled })
                .from(nc)
                .where(eqTg(nc.ownerId, store.ownerId))
                .limit(1);
              if (smsChannel?.smsAdminEnabled && order.customerPhone) {
                const siteBase = process.env.VITE_PUBLIC_DOMAIN
                  ? `https://${process.env.VITE_PUBLIC_DOMAIN}`
                  : 'https://radius-pro.com';
                const trackUrl = order.orderToken
                  ? `${siteBase}/store/${store.slug}/order/${order.orderToken}`
                  : '';
                let cardsText = '';
                if (deliveredCards.length === 1) {
                  cardsText = `اسم المستخدم: ${firstCard.username}\nكلمة المرور: ${firstCard.password ?? '—'}`;
                } else {
                  cardsText = deliveredCards.map((c, i) =>
                    `كرت ${i + 1}: ${c.username} / ${c.password ?? '—'}`
                  ).join('\n');
                }
                const msg = `مرحباً ${order.customerName}،\nبطاقات الإنترنت (${deliveredCards.length} كرت):\n${cardsText}${trackUrl ? `\nرابط طلبك: ${trackUrl}` : ''}\nشكراً لثقتك بنا 🌐`;
                // استخدام sendSmsTenant لضمان إرسال من إعدادات العميل
                await tweetsmsService.sendSmsTenant(store.ownerId, order.customerPhone, msg, { type: 'automatic', triggeredBy: 'telegram_store_deliver' });
                await dbTg.update(storeOrders).set({ smsSent: true }).where(eqTg(storeOrders.id, orderId));
              }
            } catch (_) { /* SMS فشل — لا نوقف */ }

            // الرد على callback
            await answerCallback(`✅ تم تسليم ${deliveredCards.length} كرت بنجاح!`);

            // تحديث الرسالة الأصلية
            const originalText = cbQuery.message?.text ?? '';
            let cardsBlock = '';
            if (deliveredCards.length === 1) {
              cardsBlock = `📱 اسم المستخدم: <code>${firstCard.username}</code>\n🔑 كلمة المرور: <code>${firstCard.password ?? '—'}</code>`;
            } else {
              cardsBlock = deliveredCards.map((c, i) =>
                `📱 كرت ${i + 1}: <code>${c.username}</code> / <code>${c.password ?? '—'}</code>`
              ).join('\n');
            }
            await editMessage(
              originalText + `\n\n✅ <b>تم التسليم (${deliveredCards.length} كرت)</b>\n` + cardsBlock
            );

          } catch (deliverErr) {
            console.error('[Telegram Webhook] deliverOrder error:', deliverErr);
            await answerCallback('❌ حدث خطأ أثناء التسليم', true);
          }
          return res.sendStatus(200);
        }

        // callback غير معروف
        await answerCallback('ℹ️ غير مدعوم');
        return res.sendStatus(200);
      }

      const message = update.message;
      if (!message || !message.text) return res.sendStatus(200);

      const chatId = message.chat.id;
      const text = (message.text as string).trim();

      const sendMsg = async (msg: string) => {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
        });
      };

      if (text === '/start') {
        await sendMsg(
          '\u{1F44B} <b>\u0645\u0631\u062d\u0628\u0627\u064b \u0628\u0643!</b>\n\n'
          + '\u{1F50D} \u0644\u0641\u062d\u0635 \u0643\u0631\u062a \u0627\u0644\u0625\u0646\u062a\u0631\u0646\u062a\u060c \u0623\u0631\u0633\u0644 \u0631\u0642\u0645 \u0627\u0644\u0643\u0631\u062a \u0645\u0628\u0627\u0634\u0631\u0629.\n\n'
          + '\u{1F4CB} <b>\u0627\u0644\u0623\u0648\u0627\u0645\u0631:</b>\n'
          + '/check [\u0631\u0642\u0645 \u0627\u0644\u0643\u0631\u062a] - \u0641\u062d\u0635 \u062d\u0627\u0644\u0629 \u0627\u0644\u0643\u0631\u062a\n'
          + '/help - \u0639\u0631\u0636 \u0627\u0644\u0645\u0633\u0627\u0639\u062f\u0629'
        );
        return res.sendStatus(200);
      }

      if (text === '/help') {
        await sendMsg(
          '\u{1F4D6} <b>\u0643\u064a\u0641\u064a\u0629 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645:</b>\n\n'
          + '\u2022 \u0623\u0631\u0633\u0644 \u0631\u0642\u0645 \u0627\u0644\u0643\u0631\u062a \u0645\u0628\u0627\u0634\u0631\u0629 \u0644\u0644\u0641\u062d\u0635\n'
          + '\u2022 \u0623\u0648 \u0627\u0633\u062a\u062e\u062f\u0645: /check [\u0631\u0642\u0645 \u0627\u0644\u0643\u0631\u062a]\n\n'
          + '\u{1F4CC} <b>\u0645\u062b\u0627\u0644:</b>\n'
          + '/check abc123'
        );
        return res.sendStatus(200);
      }

      // Extract card code
      let cardCode = text;
      if (text.startsWith('/check')) {
        cardCode = text.replace('/check', '').trim();
      }
      if (!cardCode || cardCode.startsWith('/')) {
        await sendMsg('\u2753 \u0623\u0631\u0633\u0644 \u0631\u0642\u0645 \u0627\u0644\u0643\u0631\u062a \u0644\u0644\u0641\u062d\u0635\u060c \u0645\u062b\u0627\u0644:\n<code>abc123</code>');
        return res.sendStatus(200);
      }

      // Look up card
      const rows = await dbTg
        .select({
          username: radiusCards.username,
          status: radiusCards.status,
          expiresAt: radiusCards.expiresAt,
          activatedAt: radiusCards.activatedAt,
          planName: plans.name,
          usageBudgetSeconds: radiusCards.usageBudgetSeconds,
          totalSessionTime: radiusCards.totalSessionTime,
        })
        .from(radiusCards)
        .leftJoin(plans, eqTg(radiusCards.planId, plans.id))
        .where(andTg(
          eqTg(radiusCards.username, cardCode),
          eqTg(radiusCards.createdBy, channelRow.ownerId)
        ))
        .limit(1);

      if (!rows[0]) {
        await sendMsg(`\u274C <b>\u0627\u0644\u0643\u0631\u062a \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f</b>\n\n\u0631\u0642\u0645: <code>${cardCode}</code>\n\u062a\u0623\u0643\u062f \u0645\u0646 \u0635\u062d\u0629 \u0627\u0644\u0631\u0642\u0645 \u0648\u062d\u0627\u0648\u0644 \u0645\u062c\u062f\u062f\u0627\u064b.`);
        return res.sendStatus(200);
      }

      const card = rows[0];
      const now = new Date();
      const expiresAt = card.expiresAt ? new Date(card.expiresAt as Date) : null;
      const isExpired = expiresAt ? expiresAt < now : false;

      // Fetch last 5 sessions from radacct
      const sessions = await dbTg
        .select({
          acctstarttime: radacct.acctstarttime,
          acctstoptime: radacct.acctstoptime,
          acctsessiontime: radacct.acctsessiontime,
          framedipaddress: radacct.framedipaddress,
          callingstationid: radacct.callingstationid,
          nasipaddress: radacct.nasipaddress,
          acctterminatecause: radacct.acctterminatecause,
        })
        .from(radacct)
        .where(eqTg(radacct.username, cardCode))
        .orderBy(descTg(radacct.acctstarttime))
        .limit(5);

      // V2 live state: online_sessions وحده يحدد وجود جلسة نشطة.
      // radacct يبقى أدناه فقط لتاريخ الجلسات والأجهزة المسجلة.
      const liveSessions = await dbTg
        .select({
          startTime: onlineSessions.startTime,
          sessionTime: onlineSessions.sessionTime,
          framedIpAddress: onlineSessions.framedIpAddress,
          callingStationId: onlineSessions.callingStationId,
          nasIp: onlineSessions.nasIp,
        })
        .from(onlineSessions)
        .where(eqTg(onlineSessions.username, cardCode))
        .orderBy(descTg(onlineSessions.startTime))
        .limit(1);
      type SessionRow = typeof sessions[0];
      const activeSession = liveSessions[0] ?? null;

      // Unique MACs with last seen time
      const macMap = new Map<string, Date>();
      for (const s of sessions) {
        if (s.callingstationid) {
          const mac = s.callingstationid.toUpperCase();
          const t = s.acctstarttime ? new Date(s.acctstarttime) : new Date(0);
          if (!macMap.has(mac) || t > macMap.get(mac)!) macMap.set(mac, t);
        }
      }

      const fmtDate = (d: Date | null | undefined) => {
        if (!d) return '-';
        return new Date(d).toLocaleString('ar-PS', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
      };

      let statusEmoji = '\u2753'; let statusText = '\u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641';
      if (card.status === 'unused')   { statusEmoji = '\u{1F7E2}'; statusText = '\u063a\u064a\u0631 \u0645\u0633\u062a\u062e\u062f\u0645'; }
      else if (card.status === 'active')    { statusEmoji = '\u{1F535}'; statusText = '\u0646\u0634\u0637'; }
      else if (card.status === 'used' || isExpired) { statusEmoji = '\u{1F534}'; statusText = '\u0645\u0646\u062a\u0647\u064a'; }
      else if (card.status === 'suspended') { statusEmoji = '\u{1F7E1}'; statusText = '\u0645\u0648\u0642\u0648\u0641'; }
      else if (card.status === 'expired')   { statusEmoji = '\u{1F534}'; statusText = '\u0645\u0646\u062a\u0647\u064a \u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0629'; }

      const fmtSecs = (s: number) => { if (!s) return '-'; const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); return h>0?`${h}\u0633 ${m}\u062f`:`${m}\u062f`; };
      const remaining = card.usageBudgetSeconds && card.totalSessionTime
        ? Math.max(0, (card.usageBudgetSeconds as number) - (card.totalSessionTime as number)) : null;

      let reply = '\u{1F50D} <b>\u0646\u062a\u064a\u062c\u0629 \u0641\u062d\u0635 \u0627\u0644\u0643\u0631\u062a</b>\n\n';
      reply += '\u{1F4CB} <b>\u0631\u0642\u0645 \u0627\u0644\u0643\u0631\u062a:</b> <code>' + card.username + '</code>\n';
      reply += statusEmoji + ' <b>\u0627\u0644\u062d\u0627\u0644\u0629:</b> ' + statusText + '\n';
      if (card.planName) reply += '\u{1F4E6} <b>\u0627\u0644\u0628\u0627\u0642\u0629:</b> ' + card.planName + '\n';
      if (card.activatedAt) reply += '\u{1F4C5} <b>\u062a\u0641\u0639\u064a\u0644:</b> ' + fmtDate(new Date(card.activatedAt as Date)) + '\n';
      if (expiresAt) reply += '\u23F0 <b>\u0627\u0646\u062a\u0647\u0627\u0621:</b> ' + fmtDate(expiresAt) + '\n';
      if (card.usageBudgetSeconds) reply += '\u23F1 <b>\u0627\u0644\u0648\u0642\u062a \u0627\u0644\u0643\u0644\u064a:</b> ' + fmtSecs(card.usageBudgetSeconds as number) + '\n';
      if (card.totalSessionTime) reply += '\u{1F4CA} <b>\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645:</b> ' + fmtSecs(card.totalSessionTime as number) + '\n';
      if (remaining !== null) reply += '\u2705 <b>\u0627\u0644\u0645\u062a\u0628\u0642\u064a:</b> ' + fmtSecs(remaining) + '\n';

      // Active session block
      if (activeSession) {
        const connectedSince = activeSession.startTime ? new Date(activeSession.startTime) : null;
        const connDuration = Number(activeSession.sessionTime ?? 0);
        reply += '\n\u{1F7E2} <b>\u062c\u0644\u0633\u0629 \u0646\u0634\u0637\u0629 \u062d\u0627\u0644\u064a\u0627\u064b:</b>\n';
        reply += '  \u2022 \u062f\u062e\u0644 \u0641\u064a: ' + fmtDate(connectedSince) + '\n';
        reply += '  \u2022 \u0645\u062f\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644: ' + fmtSecs(connDuration) + '\n';
        if (activeSession.framedIpAddress) reply += '  \u2022 IP: <code>' + activeSession.framedIpAddress + '</code>\n';
        if (activeSession.callingStationId) reply += '  \u2022 MAC: <code>' + activeSession.callingStationId.toUpperCase() + '</code>\n';
        if (activeSession.nasIp) reply += '  \u2022 NAS: <code>' + activeSession.nasIp + '</code>\n';
      }

      // Last closed sessions block
      const closedSessions = sessions.filter((s: SessionRow) => s.acctstoptime);
      if (closedSessions.length > 0) {
        reply += '\n\u{1F4C5} <b>\u0622\u062e\u0631 ' + closedSessions.length + ' \u062c\u0644\u0633\u0629:</b>\n';
        for (const s of closedSessions) {
          const mac = s.callingstationid ? s.callingstationid.toUpperCase() : '-';
          const dur = s.acctsessiontime ? fmtSecs(s.acctsessiontime) : '-';
          const start = fmtDate(s.acctstarttime ? new Date(s.acctstarttime) : null);
          const cause = s.acctterminatecause || '';
          reply += '  \u2022 ' + start + ' | \u{1F4F1} <code>' + mac + '</code> | \u23F1 ' + dur;
          if (cause && cause !== 'User-Request') reply += ' | ' + cause;
          reply += '\n';
        }
      }

      // Unique devices block
      if (macMap.size > 0) {
        reply += '\n\u{1F4F1} <b>\u0627\u0644\u0623\u062c\u0647\u0632\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0629 (' + macMap.size + '):</b>\n';
        for (const [mac, lastSeen] of Array.from(macMap.entries())) {
          reply += '  \u2022 <code>' + mac + '</code> \u2014 \u0622\u062e\u0631 \u062f\u062e\u0648\u0644: ' + fmtDate(lastSeen) + '\n';
        }
      }

      // Total sessions count
      reply += '\n\u{1F522} <b>\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u062c\u0644\u0633\u0627\u062a \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629:</b> ' + sessions.length + (sessions.length === 5 ? '+' : '') + '\n';

      await sendMsg(reply);
      return res.sendStatus(200);
    } catch (err) {
      console.error('[Telegram Webhook]', err);
      return res.sendStatus(200);
    }
  });

  // ============================================================
  // Scheduled Task: Daily Database Backup + Email
  // POST /api/scheduled/backup
  // Auth: session cookie (user role allowed for scheduled tasks)
  // ============================================================
  app.post('/api/scheduled/backup', async (req, res) => {
    try {
      // Verify session (scheduled task cookie)
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const session = await sdk.verifySession(token);
      if (!session) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      // Restrict to owner/super_admin only — prevent any logged-in user from triggering backup
      const { getUserByOpenId } = await import('../db');
      const user = await getUserByOpenId(session.openId);
      if (!user || (user.role !== 'owner' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Forbidden: admin access required' });
      }

      console.log('[ScheduledBackup] Starting daily database backup using mysql2...');

      // Use the backup router helpers (mysql2-based, no mysqldump needed)
      const { createBackupSQL, sendBackupEmail } = await import('../routers/backup');

      const backup = await createBackupSQL();
      await sendBackupEmail(backup.filename, backup.content, backup.size);

      // Save to disk too
      try {
        const { mkdir, writeFile } = await import('fs/promises');
        const pathMod = await import('path');
        const BACKUP_DIR = '/home/ubuntu/backups';
        await mkdir(BACKUP_DIR, { recursive: true });
        await writeFile(pathMod.default.join(BACKUP_DIR, backup.filename), backup.content, 'utf-8');
      } catch (e) { /* disk save optional */ }

      const sizeKB = Math.round(backup.size / 1024);
      console.log(`[ScheduledBackup] Done: ${backup.filename} (${sizeKB} KB) - email sent`);

      return res.json({ success: true, filename: backup.filename, sizeKB, emailSent: true });
    } catch (err: any) {
      console.error('[ScheduledBackup] Error:', err);
      return res.status(500).json({ error: err.message || 'Backup failed' });
    }
  });

  // ============================================================
  // Scheduled Task: Daily Database Cleanup
  // POST /api/scheduled/db-cleanup
  // Cleans expired/used cards from radcheck/radreply + old radpostauth
  // ============================================================
  app.post('/api/scheduled/db-cleanup', async (req, res) => {
    try {
      // Auth: Heartbeat cron header (no cookie needed for project-level cron)
      const cronTaskUid = req.headers['x-manus-cron-task-uid'];
      if (!cronTaskUid) {
        return res.status(403).json({ error: 'cron-only endpoint' });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: 'DB unavailable' });

      console.log('[DBCleanup] Starting daily database cleanup...');

      // 1. Delete radcheck for expired/used cards (skip manual cards - they are renewed manually)
      const radcheckResult = await db.execute(
        sql`DELETE rch FROM radcheck rch
            INNER JOIN radius_cards rc ON rch.username = rc.username
            WHERE rc.status IN ('expired', 'used') AND rc.isManual = false`
      ) as any;
      const radcheckDeleted = (radcheckResult[0] as any)?.affectedRows ?? 0;

      // 2. Delete radreply for expired/used cards (skip manual cards - they are renewed manually)
      const radreplyResult = await db.execute(
        sql`DELETE rr FROM radreply rr
            INNER JOIN radius_cards rc ON rr.username = rc.username
            WHERE rc.status IN ('expired', 'used') AND rc.isManual = false`
      ) as any;
      const radreplyDeleted = (radreplyResult[0] as any)?.affectedRows ?? 0;

      // 3. Delete orphan radcheck (no matching card in radius_cards)
      // Note: manual cards always have a matching radius_cards record, so this is safe
      const orphanCheckResult = await db.execute(
        sql`DELETE rch FROM radcheck rch
            LEFT JOIN radius_cards rc ON rch.username = rc.username
            WHERE rc.id IS NULL`
      ) as any;
      const orphanCheckDeleted = (orphanCheckResult[0] as any)?.affectedRows ?? 0;

      // 4. Delete orphan radreply (no matching card in radius_cards)
      const orphanReplyResult = await db.execute(
        sql`DELETE rr FROM radreply rr
            LEFT JOIN radius_cards rc ON rr.username = rc.username
            WHERE rc.id IS NULL`
      ) as any;
      const orphanReplyDeleted = (orphanReplyResult[0] as any)?.affectedRows ?? 0;

      // 5. Delete radpostauth older than 7 days
      const radpostauthResult = await db.execute(
        sql`DELETE FROM radpostauth WHERE authdate < DATE_SUB(NOW(), INTERVAL 7 DAY)`
      ) as any;
      const radpostauthDeleted = (radpostauthResult[0] as any)?.affectedRows ?? 0;

      const summary = {
        radcheck_deleted: radcheckDeleted,
        radreply_deleted: radreplyDeleted,
        orphan_radcheck_deleted: orphanCheckDeleted,
        orphan_radreply_deleted: orphanReplyDeleted,
        radpostauth_deleted: radpostauthDeleted,
        radacct_preserved: true,
        timestamp: new Date().toISOString(),
      };

      console.log('[DBCleanup] Done:', summary);
      return res.json({ success: true, ...summary });
    } catch (err: any) {
      console.error('[DBCleanup] Error:', err);
      return res.status(500).json({ error: err.message || 'Cleanup failed', stack: err.stack, timestamp: new Date().toISOString() });
    }
  });

  // ============================================================
  // Scheduled Task: Speed Schedule Runner
  // POST /api/scheduled/speed-scheduler
  // Runs every minute via Heartbeat — checks Redis for due schedules
  // ============================================================
  app.post('/api/scheduled/speed-scheduler', async (req, res) => {
    try {
      const cronTaskUid = req.headers['x-manus-cron-task-uid'];
      if (!cronTaskUid) {
        return res.status(403).json({ error: 'cron-only endpoint' });
      }
      const { executeV2Job } = await import('../v2/V2JobRuntime');
      const result = await executeV2Job('speed_scheduler', 'auto');
      if (!result.success && !result.skipped) {
        return res.status(500).json({ success: false, error: result.message });
      }
      return res.json({ success: result.success, skipped: result.skipped, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error('[SpeedScheduler] Error:', err);
      return res.status(500).json({ error: err.message || 'Speed scheduler failed' });
    }
  });

  // VPS Firewall: GET /api/vps/nas-ips — returns public IPs of all active NAS devices
  // Protected by VPS_COA_API_KEY (same key used by VPS scripts)
  app.get('/api/vps/nas-ips', async (req, res) => {
    try {
      const apiKey = req.headers['x-api-key'] || req.query.key;
      const expectedKey = process.env.VPS_COA_API_KEY || '';
      if (!apiKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const db = await getDb();
      if (!db) return res.status(500).json({ error: 'DB unavailable' });
      const rows = await db.execute(
        sql`SELECT DISTINCT nasipaddress FROM radhuntgroup WHERE nasipaddress IS NOT NULL AND nasipaddress != '' AND nasipaddress NOT LIKE '192.168.%' AND nasipaddress != '127.0.0.1'`
      ) as any;
      const ips: string[] = ((rows as any)[0] as any[]).map((r: any) => r.nasipaddress).filter(Boolean);
      return res.json({ success: true, ips, count: ips.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // V2 RADIUS Bridges — must be registered before static fallback in production.
  registerAccountingBridge(app);
  registerAuthorizationBridge(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Initialize Redis cache (optional — falls back to in-memory if unavailable)
  initRedis();

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // V2: Register Event Handlers first
    registerV2EventHandlers();
    console.log('[V2EventHandlers] Registered - session.closed, card.expired, card.renewed');

    // V2: New Scheduler — Cleanup + Expiration + Validation + Archive
    console.log('[AccountingBridge] Registered - Accounting + Authorization V2 routes');

    startV2Scheduler();
    console.log('[V2Scheduler] Started - Radius Pro Local V2 Jobs');
  });
}

startServer().catch(console.error);
