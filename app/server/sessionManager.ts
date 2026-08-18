/**
 * sessionManager.ts
 * نظام إدارة الجلسات الاحترافي
 * - Idle Timeout: 30 دقيقة
 * - Absolute Lifetime: 30 يوم (90 يوم مع Remember Me)
 * - تحديث Last Activity مع كل طلب
 * - إلغاء جميع الجلسات عند تغيير كلمة المرور
 */

import { randomBytes } from "crypto";
import { eq, and, lt, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { userSessions } from "../drizzle/schema";
import type { Request, Response } from "express";
import { getSessionCookieOptions } from "./_core/cookies";

// ─── Constants ────────────────────────────────────────────────────────────────
export const IDLE_TIMEOUT_MS     = 30 * 60 * 1000;          // 30 دقيقة
export const ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 يوم
export const REMEMBER_ME_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // 90 يوم
export const WARN_BEFORE_IDLE_MS = 60 * 1000;               // تحذير قبل دقيقة واحدة
export const SESSION_COOKIE = "app_session_id";

// ─── Helper: parse device name from User-Agent ────────────────────────────────
function parseDeviceName(ua: string | undefined): string {
  if (!ua) return "Unknown Device";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS Device";
  if (/Android/.test(ua)) return "Android Device";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux";
  return "Browser";
}

// ─── Create a new session ─────────────────────────────────────────────────────
export async function createSession(
  userId: number,
  rememberMe: boolean,
  req: Request
): Promise<string> {
  const db = await getDb();
  const token = randomBytes(48).toString("hex");
  const lifetimeMs = rememberMe ? REMEMBER_ME_LIFETIME_MS : ABSOLUTE_LIFETIME_MS;
  const expiresAt = new Date(Date.now() + lifetimeMs);
  const ua = req.headers["user-agent"];
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";

  await db.insert(userSessions).values({
    userId,
    sessionToken: token,
    rememberMe,
    expiresAt,
    lastActivityAt: new Date(),
    userAgent: ua,
    ipAddress: ip,
    deviceName: parseDeviceName(ua),
  });

  return token;
}

// ─── Validate session and update last activity ────────────────────────────────
export async function validateAndRefreshSession(
  token: string
): Promise<{ valid: false } | { valid: true; userId: number; idleExpiresAt: Date; absoluteExpiresAt: Date; rememberMe: boolean }> {
  if (!token) return { valid: false };

  const db = await getDb();
  const now = new Date();

  const [session] = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.sessionToken, token),
        isNull(userSessions.revokedAt)
      )
    )
    .limit(1);

  if (!session) return { valid: false };

  // Check absolute expiry
  if (session.expiresAt < now) {
    await revokeSession(token, "expired");
    return { valid: false };
  }

  // Check idle timeout
  const idleDeadline = new Date(session.lastActivityAt.getTime() + IDLE_TIMEOUT_MS);
  if (idleDeadline < now) {
    await revokeSession(token, "expired");
    return { valid: false };
  }

  // Update last activity (throttle: only update if > 30 seconds since last update)
  const secondsSinceUpdate = (now.getTime() - session.lastActivityAt.getTime()) / 1000;
  if (secondsSinceUpdate > 30) {
    await db
      .update(userSessions)
      .set({ lastActivityAt: now })
      .where(eq(userSessions.sessionToken, token));
  }

  return {
    valid: true,
    userId: session.userId,
    idleExpiresAt: new Date(now.getTime() + IDLE_TIMEOUT_MS),
    absoluteExpiresAt: session.expiresAt,
    rememberMe: session.rememberMe,
  };
}

// ─── Revoke a single session ──────────────────────────────────────────────────
export async function revokeSession(
  token: string,
  reason: "logout" | "password_change" | "admin_revoke" | "expired" = "logout"
): Promise<void> {
  const db = await getDb();
  await db
    .update(userSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(eq(userSessions.sessionToken, token));
}

// ─── Revoke ALL sessions for a user (password change, admin action) ───────────
export async function revokeAllUserSessions(
  userId: number,
  reason: "logout" | "password_change" | "admin_revoke" = "password_change",
  exceptToken?: string
): Promise<number> {
  const db = await getDb();
  const sessions = await db
    .select({ sessionToken: userSessions.sessionToken })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt)
      )
    );

  let count = 0;
  for (const s of sessions as Array<{ sessionToken: string }>) {
    if (exceptToken && s.sessionToken === exceptToken) continue;
    await db
      .update(userSessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(eq(userSessions.sessionToken, s.sessionToken));
    count++;
  }
  return count;
}

// ─── Get all active sessions for a user ──────────────────────────────────────
export async function getUserActiveSessions(userId: number) {
  const db = await getDb();
  const now = new Date();
  const sessions = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt)
      )
    );

  return (sessions as Array<{ expiresAt: Date; lastActivityAt: Date; [key: string]: unknown }>).filter((s) => {
    if (s.expiresAt < now) return false;
    const idleDeadline = new Date(s.lastActivityAt.getTime() + IDLE_TIMEOUT_MS);
    return idleDeadline >= now;
  });
}

// ─── Set session cookie ───────────────────────────────────────────────────────
export function setSessionCookie(
  res: Response,
  req: Request,
  token: string,
  rememberMe: boolean
): void {
  const lifetimeMs = rememberMe ? REMEMBER_ME_LIFETIME_MS : ABSOLUTE_LIFETIME_MS;
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: lifetimeMs,
  });
}

// ─── Clear session cookie ─────────────────────────────────────────────────────
export function clearSessionCookie(res: Response, req: Request): void {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

// ─── Cleanup expired sessions (run periodically) ──────────────────────────────
export async function cleanupExpiredSessions(): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const expired = await db
    .select({ sessionToken: userSessions.sessionToken })
    .from(userSessions)
    .where(
      and(
        isNull(userSessions.revokedAt),
        lt(userSessions.expiresAt, now)
      )
    );

  for (const s of expired as Array<{ sessionToken: string }>) {
    await db
      .update(userSessions)
      .set({ revokedAt: now, revokedReason: "expired" })
      .where(eq(userSessions.sessionToken, s.sessionToken));
  }
  return expired.length;
}
