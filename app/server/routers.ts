import { COOKIE_NAME } from "@shared/const";
import { invalidateAuthenticatedUserCache } from "./_core/sdk";
import { createSession, revokeSession, revokeAllUserSessions, getUserActiveSessions, setSessionCookie, clearSessionCookie, IDLE_TIMEOUT_MS, ABSOLUTE_LIFETIME_MS, REMEMBER_ME_LIFETIME_MS } from "./sessionManager";
import { fixVpsDate } from "@shared/vpsDate";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  MAX_STALE_SESSION_TIMEOUT_SECONDS,
  MIN_STALE_SESSION_TIMEOUT_SECONDS,
  staleSessionTimeoutService,
} from './domains/accounting/StaleSessionTimeoutService';
import * as db from "./db";
import * as walletDb from "./db/wallet";
import * as planDb from "./db/plans";
import * as nasDb from "./db/nas";
import * as cardDb from "./db/vouchers";
import { generateCardsV2 } from "./db/generateCardsV2";
import { importCardsFromCsv, parseCsvCards } from "./db/importCardsFromCsv";
import { parseFileToRows, mapRowsToCards } from "./db/parseFileCards";
import * as invoiceDb from "./db/invoices";
import * as subscriptionDb from "./db/subscriptions";
import * as ticketDb from "./db/tickets";
import * as notificationDb from "./db/notifications";
import * as templateDb from "./db/cardTemplates";
import { generateCardsPDFHTML, generateCardsCSV, saveBatchPDF, saveBatchPDFWithTemplate, generateCardsPDFHTMLWithTemplate } from "./services/pdfGenerator";
import { storagePut, storageGet } from "./storage";
import { invokeLLM } from "./_core/llm";
import { AI_TOOLS, executeTool } from "./routers/aiTools";

// Helper: refresh presigned imageUrl for a template
async function refreshTemplateImageUrl<T extends { imageKey?: string | null; imageUrl: string }>(template: T): Promise<T> {
  if (!template.imageKey) return template;
  try {
    const { url } = await storageGet(template.imageKey);
    return { ...template, imageUrl: url };
  } catch {
    return template;
  }
}
import * as mikrotikApi from "./services/mikrotikApi";
import { allocateWinboxPort, enableWinboxForward, disableWinboxForward, checkWinboxStatus } from "./services/winboxService";
import * as coaService from "./services/coaService";
import * as vpnApi from "./services/vpnApiService";
import * as sshVpn from "./services/sshVpnService";
import * as accountingService from "./services/accountingService";
import * as sessionMonitor from "./services/sessionMonitor";
import * as authService from "./services/authService";
import { getDb } from "./db";
import { radcheck, radreply, nasDevices, radiusCards, radacct, onlineSessions, users, wallets, walletLedger, cardBatches, checkTokens, plans, notificationChannels, siteSettings, systemUpdates } from "../drizzle/schema";
import { eq, and, isNull, sql, desc, or, count, gte } from "drizzle-orm";
import { like } from "drizzle-orm/sql/expressions/conditions";
import * as radiusSubscribers from "./db/radiusSubscribers";
import { logAudit } from "./services/auditLogService";
import { subAdminRouter } from "./routers-sub-admin";
import { defaultPlansRouter } from "./routers-default-plans";
import * as vpnIpPool from "./db/vpnIpPool";
import { getTenantContext, getEffectiveOwnerId, canSeeAllData } from "./tenant-isolation";
import * as freeradiusService from "./services/freeradiusService";
import * as multiChannelNotification from "./services/multiChannelNotificationService";
import * as tweetsmsService from "./services/tweetsmsService";
import * as smsDb from "./db/sms";
import * as twoPhaseProvisioning from "./services/twoPhaseProvisioningService";
import { autoFixMissingHuntgroups, getFeatureFlag_UseOnlineSessions, invalidateFeatureFlagCache, getFeatureFlag_UseOnlineSessionsRead, invalidateFeatureFlagReadCache } from "./v2/V2ServiceBridge";
import { featureAccessRouter } from "./routers/featureAccess";
import { notifyOwnerEvent, notifySubscriberEvent } from "./services/notificationService";
import { analyticsRouter } from "./routers/analytics";
import { salesDashboardRouter } from "./routers/salesDashboard";
import { networkMonitorRouter } from "./routers/networkMonitor";
import { portForwardingRouter } from "./routers/portForwarding";
import { notificationsRouter as channelNotificationsRouter } from "./routers/notifications";
import { backupRouter } from "./routers/backup";
import { siteRouter } from "./routers/settings";
import { smsCardsRouter } from "./routers/smsCards";
import { securityRouter } from "./routers/security";
import { radiusOperationsRouter } from "./routers/radiusOperations";
import { plansRouter } from './routers/plans';
import { plansNasRouter } from './routers/plansNas';
import { 
  permissionGroupsRouter, 
  permissionPlansRouter, 
  userPermissionOverridesRouter,
  userMenuItemOverridesRouter,
  userEffectivePermissionsRouter 
} from "./routers-permission-plans";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user is an admin (owner or super_admin)
 * Use this instead of checking role === 'super_admin' directly
 */
function isAdmin(role: string): boolean {
  return role === 'owner' || role === 'super_admin';
}

/**
 * Check if user can see all data (not restricted by ownership)
 */
function canViewAllData(role: string): boolean {
  return isAdmin(role);
}

// stripUsernamePrefix removed - usernames are now stored without prefix

// ============================================================================
// AUTH ROUTER
// ============================================================================
import * as permissionsService from "./services/permissionsService";
import { vouchersRouter } from "./routers/vouchers";
import { nasRouter } from './routers/nas';
import { sessionsRouter } from "./routers/sessions";
import { usersRouter } from "./routers/users";
import { bankTransferRouter } from './routers/bankTransfer';
import { dashboardRouter } from './routers/dashboard';
import { subscribersRouter } from './routers/subscribers';
import { billingRouter } from './routers/billing';
import { reportsRouter } from './routers/reports';
import { vpsManagementRouter } from './routers/vpsManagement';
import { winboxRouter } from './routers/winbox';
import { diagnosticsRouter } from './routers/diagnostics';
import { notificationsRouter } from './routers/notificationsMain';
import { cronJobsRouter } from './routers/cronJobs';
import { storeRouter } from './routers/store';
import { speedSchedulesRouter } from './routers/speedSchedules';
import { feedbackRouter } from './routers/feedback.js';
import { timezoneRouter } from "./routers/timezone";
import { vpnManagementV2Router } from "./routers/vpnManagementV2";

const authRouter = router({
  me: publicProcedure.query(opts => {
    if (!opts.ctx.user) return null;
    const permissions = permissionsService.getRolePermissions(opts.ctx.user.role as any);
    const canSeeFinancials = permissionsService.canSeeFinancials(opts.ctx.user.role as any);
    const isAdmin = permissionsService.isAdmin(opts.ctx.user.role as any);
    // Strip sensitive fields before returning to client
    const { passwordHash: _ph, emailVerificationCode: _evc, passwordResetCode: _prc, ...safeUser } = opts.ctx.user as any;
    return {
      ...safeUser,
      permissions,
      canSeeFinancials,
      isAdmin,
    };
  }),
  
  // Traditional registration
  register: publicProcedure
    .input(z.object({
      username: z.string().min(3, "Username must be at least 3 characters"),
      email: z.string().email("Invalid email address"),
      password: z.string().min(6, "Password must be at least 6 characters"),
      name: z.string().optional(),
      phone: z.string().optional(),
      preferredCurrency: z.enum(["USD", "ILS", "JOD", "SAR", "AED", "EGP", "YER"]).optional().default("USD"),
    }))
    .mutation(async ({ input }) => {
      const result = await authService.registerUser(input);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      // جلب إعداد طريقة التحقق لإرجاعها للـ frontend
      const { getDb } = await import("./db");
      const { systemSettings } = await import("../drizzle/schema");
      const db = await getDb();
      let verificationType: "email" | "sms" | "both" = "email";
      let pendingPhone: string | null = null;
      if (db) {
        const rows = await db.select().from(systemSettings);
        const map: Record<string, string> = {};
        for (const r of rows) map[r.key] = r.value ?? "";
        const method = (map["verification_method"] as "email" | "sms" | "both") || "email";
        const smsEnabled = map["sms_verification_enabled"] === "true";
        if (smsEnabled && (method === "sms" || method === "both")) {
          verificationType = method;
          pendingPhone = input.phone || null;
        } else {
          verificationType = "email";
        }
      }
      return { 
        success: true, 
        message: "Registration successful!",
        verificationType,
        pendingPhone,
        pendingEmail: input.email,
      };
    }),
  
  // Traditional login
  login: publicProcedure
    .input(z.object({
      usernameOrEmail: z.string().min(1, "Username or email is required"),
      password: z.string().min(1, "Password is required"),
      rememberMe: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await authService.loginUser(input);
      if (!result.success || !result.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: result.error || "Login failed" });
      }
      
      // Create session token using SDK and set cookie
      const { sdk } = await import("./_core/sdk");
      // Use a unique identifier for traditional auth users
      const sessionOpenId = `local_${result.user.id}`;
      const lifetimeMs = input.rememberMe ? REMEMBER_ME_LIFETIME_MS : ABSOLUTE_LIFETIME_MS;
      const token = await sdk.createSessionToken(sessionOpenId, { name: result.user.name || result.user.username || "", expiresInMs: lifetimeMs });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: lifetimeMs });
      
      // Also record session in user_sessions table for tracking
      try {
        await createSession(result.user.id, input.rememberMe ?? false, ctx.req);
      } catch (e) {
        // Non-fatal: session tracking failure should not block login
        console.error('[Auth] Session tracking error:', e);
      }
      
      // Strip sensitive fields before returning to client
      const { passwordHash: _ph, emailVerificationCode: _evc, passwordResetCode: _prc, ...safeUser } = result.user as any;
      return { success: true, user: safeUser };
    }),
  
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    // Also revoke from user_sessions if present
    const token = ctx.req.cookies?.[COOKIE_NAME];
    if (token && ctx.user) {
      try { await revokeSession(token, 'logout'); } catch {}
    }
    return { success: true } as const;
  }),

  // Get session info (for idle warning)
  sessionInfo: protectedProcedure.query(async ({ ctx }) => {
    return {
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      warnBeforeMs: 60 * 1000, // warn 1 minute before idle
      absoluteLifetimeMs: ABSOLUTE_LIFETIME_MS,
      rememberMeLifetimeMs: REMEMBER_ME_LIFETIME_MS,
    };
  }),

  // Get active sessions for current user
  activeSessions: protectedProcedure.query(async ({ ctx }) => {
    try {
      const sessions = await getUserActiveSessions(ctx.user.id);
      return sessions.map((s: any) => ({
        id: s.id,
        deviceName: s.deviceName,
        ipAddress: s.ipAddress,
        rememberMe: s.rememberMe,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
        expiresAt: s.expiresAt,
      }));
    } catch { return []; }
  }),

  // Revoke a specific session
  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { userSessions } = await import('../drizzle/schema');
      const [session] = await drizzleDb.select().from(userSessions).where(eq(userSessions.id, input.sessionId)).limit(1) as any[];
      if (!session || session.userId !== ctx.user.id) throw new TRPCError({ code: 'NOT_FOUND' });
      await revokeSession(session.sessionToken, 'admin_revoke');
      return { success: true };
    }),

  // Revoke ALL sessions (logout everywhere)
  revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    const currentToken = ctx.req.cookies?.[COOKIE_NAME];
    const count = await revokeAllUserSessions(ctx.user.id, 'admin_revoke', currentToken);
    return { success: true, revokedCount: count };
  }),

  // Email verification
  verifyEmail: publicProcedure
    .input(z.object({
      email: z.string().email("Invalid email address"),
      code: z.string().length(6, "Verification code must be 6 digits"),
    }))
    .mutation(async ({ input }) => {
      const result = await authService.verifyEmail(input.email, input.code);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      return { success: true, message: "Email verified successfully!" };
    }),

  // Resend verification code
  resendVerificationCode: publicProcedure
    .input(z.object({
      email: z.string().email("Invalid email address"),
    }))
    .mutation(async ({ input }) => {
      const result = await authService.resendVerificationCode(input.email);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      return { success: true, message: "Verification code sent!" };
    }),

  // Request password reset
  forgotPassword: publicProcedure
    .input(z.object({
      email: z.string().email("Invalid email address"),
    }))
    .mutation(async ({ input }) => {
      const result = await authService.requestPasswordReset(input.email);
      if (!result.success) {
        throw new TRPCError({ code: "NOT_FOUND", message: result.error || "هذا البريد الإلكتروني غير مسجل في النظام" });
      }
      return { success: true, message: "تم إرسال رمز الاستعادة إلى بريدك الإلكتروني" };
    }),

  // Verify reset code
  verifyResetCode: publicProcedure
    .input(z.object({
      email: z.string().email("Invalid email address"),
      code: z.string().length(6, "Reset code must be 6 digits"),
    }))
    .mutation(async ({ input }) => {
      const result = await authService.verifyResetCode(input.email, input.code);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      return { success: true };
    }),

  // Reset password with code
  resetPassword: publicProcedure
    .input(z.object({
      email: z.string().email("Invalid email address"),
      code: z.string().length(6, "Reset code must be 6 digits"),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
    }))
    .mutation(async ({ input }) => {
      const result = await authService.resetPassword(input.email, input.code, input.newPassword);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
      }
      return { success: true, message: "Password reset successful! You can now login." };
    }),

  // Update profile
  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().optional(),
      companyName: z.string().trim().max(255).optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.updateUser(ctx.user.id, input);
      return { success: true, user: result };
    }),

  // Update avatar
  updateAvatar: protectedProcedure
    .input(z.object({
      avatarUrl: z.string().url("Invalid URL"),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await db.updateUser(ctx.user.id, { avatarUrl: input.avatarUrl });
      return { success: true, avatarUrl: input.avatarUrl };
    }),

  // Update preferred currency
  updateCurrency: protectedProcedure
    .input(z.object({
      preferredCurrency: z.enum(["USD", "ILS", "JOD", "SAR", "AED", "EGP", "YER"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      await drizzleDb.update(users).set({ preferredCurrency: input.preferredCurrency }).where(eq(users.id, ctx.user.id));
      return { success: true, preferredCurrency: input.preferredCurrency };
    }),

  // Request password change (for logged-in users)
  requestPasswordChange: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No email associated with this account" });
      }
      const result = await authService.requestPasswordReset(ctx.user.email);
      return { success: true, message: "Password reset code sent to your email" };
    }),

  // Onboarding: get status
  getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const drizzleDb = await getDb();
    if (!drizzleDb) return { completed: true };
    const result = await drizzleDb.execute(
      sql`SELECT onboardingCompleted FROM users WHERE id = ${ctx.user.id} LIMIT 1`
    ) as any;
    const row = ((result as any)[0] as any[])[0];
    return { completed: Boolean(row?.onboardingCompleted) };
  }),

  // Onboarding: mark as completed
  completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    const drizzleDb = await getDb();
    if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
    await drizzleDb.execute(
      sql`UPDATE users SET onboardingCompleted = TRUE WHERE id = ${ctx.user.id}`
    );
    await invalidateAuthenticatedUserCache(ctx.req.cookies?.[COOKIE_NAME]);
    return { success: true, onboardingCompleted: true };
  }),

  // ─── Impersonate User (Super Admin / Owner only) ───────────────────────────
  impersonateUser: superAdminProcedure
    .input(z.object({ targetUserId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const adminUser = ctx.user;
      // Cannot impersonate yourself
      if (adminUser.id === input.targetUserId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك التنكر بنفسك' });
      }
      // Fetch target user
      const targetUser = await db.getUserById(input.targetUserId);
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'المستخدم غير موجود' });
      }
      // Cannot impersonate another super_admin or owner
      if (targetUser.role === 'super_admin' || targetUser.role === 'owner') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن التنكر بمستخدم مشرف' });
      }
      // Save original admin session in a separate cookie
      const { sdk } = await import('./_core/sdk');
      const cookieOptions = getSessionCookieOptions(ctx.req);
      // Save current admin session as backup
      const currentCookie = ctx.req.cookies?.[COOKIE_NAME];
      if (currentCookie) {
        ctx.res.cookie('app_session_admin_backup', currentCookie, {
          ...cookieOptions,
          maxAge: 2 * 60 * 60 * 1000, // 2 hours
        });
      }
      // Create impersonation session token (2 hours max)
      const sessionOpenId = `local_${targetUser.id}`;
      const impersonationToken = await sdk.signSession(
        { openId: sessionOpenId, appId: (await import('./_core/env')).ENV.appId, name: targetUser.name || targetUser.username || '' },
        { expiresInMs: 2 * 60 * 60 * 1000 }
      );
      ctx.res.cookie(COOKIE_NAME, impersonationToken, { ...cookieOptions, maxAge: 2 * 60 * 60 * 1000 });
      // Audit log
      try {
        const drizzleDb = await getDb();
        if (drizzleDb) {
          await drizzleDb.execute(
            sql`INSERT INTO audit_logs (userId, action, details, createdAt) VALUES (${adminUser.id}, 'impersonate_start', ${JSON.stringify({ targetUserId: targetUser.id, targetName: targetUser.name || targetUser.username })}, NOW())`
          );
        }
      } catch (_) { /* audit log failure is non-fatal */ }
      return { success: true, targetUser: { id: targetUser.id, name: targetUser.name, username: targetUser.username, role: targetUser.role } };
    }),

  // ─── Stop Impersonation ────────────────────────────────────────────────────
  stopImpersonation: protectedProcedure.mutation(async ({ ctx }) => {
    const backupCookie = ctx.req.cookies?.['app_session_admin_backup'];
    if (!backupCookie) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا توجد جلسة مدير محفوظة' });
    }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    // Restore admin session
    ctx.res.cookie(COOKIE_NAME, backupCookie, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });
    // Clear backup cookie
    ctx.res.clearCookie('app_session_admin_backup', { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),

  // ─── Check if currently impersonating ─────────────────────────────────────
  impersonationStatus: protectedProcedure.query(async ({ ctx }) => {
    const backupCookie = ctx.req.cookies?.['app_session_admin_backup'];
    if (!backupCookie) return { isImpersonating: false, adminUser: null };
    // Verify backup cookie to get admin info
    try {
      const { sdk } = await import('./_core/sdk');
      const session = await sdk.verifySession(backupCookie);
      if (!session) return { isImpersonating: false, adminUser: null };
      const adminId = session.openId.startsWith('local_') ? parseInt(session.openId.replace('local_', ''), 10) : null;
      if (!adminId) return { isImpersonating: false, adminUser: null };
      const adminUser = await db.getUserById(adminId);
      if (!adminUser) return { isImpersonating: false, adminUser: null };
      return {
        isImpersonating: true,
        adminUser: { id: adminUser.id, name: adminUser.name, username: adminUser.username, role: adminUser.role },
      };
    } catch (_) {
      return { isImpersonating: false, adminUser: null };
    }
  }),
});

// ============================================================================
// USERS ROUTER
// ============================================================================

// Helper function to generate random password
function generateRandomPassword(): string {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// ============================================================================
// PLANS ROUTER
// ============================================================================
// ============================================================================
// NAS DEVICES ROUTER
// ============================================================================
const walletRouter = router({
  getMyWallet: protectedProcedure.query(async ({ ctx }) => {
    // Sub-admins see their parent client's wallet
    const tenantContext = getTenantContext(ctx.user);
    const effectiveUserId = getEffectiveOwnerId(tenantContext);
    return walletDb.getWalletByUserId(effectiveUserId);
  }),

  getWalletByUserId: superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      return walletDb.getWalletByUserId(input.userId);
    }),

  getTransactions: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Sub-admins see their parent client's transactions
      const tenantContext = getTenantContext(ctx.user);
      const effectiveUserId = getEffectiveOwnerId(tenantContext);
      return walletDb.getTransactionsByUserId(effectiveUserId, input?.limit || 20, input?.page || 1);
    }),

  getWalletStats: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = getTenantContext(ctx.user);
    const effectiveUserId = getEffectiveOwnerId(tenantContext);
    return walletDb.getWalletStats(effectiveUserId);
  }),

  deposit: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      amount: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return walletDb.deposit(input.userId, input.amount, input.description);
    }),

  // Wallet Ledger endpoints
  addCredit: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      amount: z.number().positive(),
      reason: z.string(),
      reasonAr: z.string().optional(),
      entityType: z.string().optional(),
      entityId: z.number().optional(),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { walletLedgerService } = await import("./services/walletLedgerService");
      return walletLedgerService.addCredit({
        ...input,
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
      });
    }),

  deductBalance: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      amount: z.number().positive(),
      reason: z.string(),
      reasonAr: z.string().optional(),
      entityType: z.string().optional(),
      entityId: z.number().optional(),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { walletLedgerService } = await import("./services/walletLedgerService");
      return walletLedgerService.deductBalance({
        ...input,
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
      });
    }),

  getTransactionHistory: protectedProcedure
    .input(z.object({
      userId: z.number().optional(),
      type: z.enum(["credit", "debit"]).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input, ctx }) => {
      const { walletLedgerService } = await import("./services/walletLedgerService");
      const userId = input?.userId || ctx.user.id;
      
      // Only super_admin can view other users' transactions
      if (userId !== ctx.user.id && ctx.user.role !== "super_admin" && ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      return walletLedgerService.getTransactionHistory({
        userId,
        type: input?.type,
        startDate: input?.startDate,
        endDate: input?.endDate,
        limit: input?.limit || 50,
        offset: input?.offset || 0,
      });
    }),

  getWalletSummary: protectedProcedure
    .input(z.object({
      userId: z.number().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const { walletLedgerService } = await import("./services/walletLedgerService");
      const userId = input?.userId || ctx.user.id;
      
      // Only super_admin can view other users' summary
      if (userId !== ctx.user.id && ctx.user.role !== "super_admin" && ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      return walletLedgerService.getWalletSummary(userId);
    }),

  // ===== Credit System ($2 overdraft) =====
  getCreditStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    const tenantContext = getTenantContext(ctx.user);
    const effectiveUserId = getEffectiveOwnerId(tenantContext);
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, effectiveUserId));
    if (!wallet) throw new TRPCError({ code: 'NOT_FOUND', message: 'Wallet not found' });
    return {
      balance: parseFloat(wallet.balance),
      creditBalance: parseFloat(wallet.creditBalance || '0'),
      maxCreditLimit: parseFloat(wallet.maxCreditLimit || '2'),
      creditActivatedAt: wallet.creditActivatedAt,
      hasCreditAvailable: parseFloat(wallet.creditBalance || '0') < parseFloat(wallet.maxCreditLimit || '2'),
      isInDebt: parseFloat(wallet.creditBalance || '0') > 0,
    };
  }),

  activateCredit: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
    const tenantContext = getTenantContext(ctx.user);
    const effectiveUserId = getEffectiveOwnerId(tenantContext);
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, effectiveUserId));
    if (!wallet) throw new TRPCError({ code: 'NOT_FOUND', message: 'Wallet not found' });
    
    const currentBalance = parseFloat(wallet.balance);
    const currentCredit = parseFloat(wallet.creditBalance || '0');
    const maxCredit = parseFloat(wallet.maxCreditLimit || '2');
    
    // Only allow if balance is 0 and credit not already maxed
    if (currentBalance > 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Credit only available when balance is 0' });
    }
    if (currentCredit >= maxCredit) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Credit limit of $${maxCredit} already reached` });
    }
    
    const creditAmount = maxCredit - currentCredit;
    const newBalance = currentBalance + creditAmount;
    const newCreditBalance = currentCredit + creditAmount;
    
    await db.update(wallets).set({
      balance: newBalance.toFixed(2),
      creditBalance: newCreditBalance.toFixed(2),
      creditActivatedAt: wallet.creditActivatedAt || new Date(),
      updatedAt: new Date(),
    }).where(eq(wallets.userId, effectiveUserId));
    
    // Log in ledger
    await db.insert(walletLedger).values({
      userId: effectiveUserId,
      type: 'credit',
      amount: creditAmount.toFixed(2),
      balanceBefore: currentBalance.toFixed(2),
      balanceAfter: newBalance.toFixed(2),
      reason: `Credit activated: $${creditAmount.toFixed(2)} overdraft`,
      reasonAr: `تفعيل مديونية: $${creditAmount.toFixed(2)}`,
      entityType: 'credit',
      entityId: effectiveUserId,
      actorId: effectiveUserId,
      actorRole: ctx.user.role,
      createdAt: new Date(),
    });
    
    return { success: true, creditAmount, newBalance };
  }),
});


// ============================================================================
// INVOICES ROUTER
// ============================================================================
const invoicesRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['draft', 'pending', 'paid', 'cancelled', 'refunded']).optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const tenantContext = getTenantContext(ctx.user);
      return invoiceDb.getInvoicesByTenant(tenantContext, input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const invoice = await invoiceDb.getInvoiceById(input.id);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      
      if (!isAdmin(ctx.user.role) && invoice.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      return invoice;
    }),

  create: resellerProcedure
    .input(z.object({
      userId: z.number(),
      type: z.enum(['subscription', 'card_purchase', 'deposit', 'other']),
      items: z.array(z.object({
        description: z.string(),
        quantity: z.number(),
        unitPrice: z.string(),
      })),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return invoiceDb.createInvoice({
        ...input,
        resellerId: ctx.user.role === 'reseller' ? ctx.user.id : undefined,
      });
    }),

  updateStatus: superAdminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['draft', 'pending', 'paid', 'cancelled', 'refunded']),
    }))
    .mutation(async ({ input }) => {
      return invoiceDb.updateInvoiceStatus(input.id, input.status);
    }),
});

// ============================================================================
// SUBSCRIPTIONS ROUTER (Active Cards)
// ============================================================================
const subscriptionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['unused', 'active', 'used', 'expired', 'suspended', 'cancelled']).optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const tenantContext = getTenantContext(ctx.user);
      return subscriptionDb.getSubscriptionsByTenant(tenantContext, input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const subscription = await subscriptionDb.getSubscriptionById(input.id);
      if (!subscription) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });
      
      if (!isAdmin(ctx.user.role) && subscription.usedBy !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      return subscription;
    }),

  updateStatus: superAdminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['active', 'suspended', 'expired', 'cancelled']),
    }))
    .mutation(async ({ input }) => {
      return subscriptionDb.updateSubscriptionStatus(input.id, input.status);
    }),

  renew: resellerProcedure
    .input(z.object({
      id: z.number(),
      additionalDays: z.number().min(1),
    }))
    .mutation(async ({ input }) => {
      return subscriptionDb.renewSubscription(input.id, input.additionalDays);
    }),

  getActiveSessions: superAdminProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      return subscriptionDb.getActiveSessions(input);
    }),

  getOnlineSessions: superAdminProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      return subscriptionDb.getOnlineSessions(input);
    }),

  getSessionHistory: superAdminProcedure
    .input(z.object({
      username: z.string().optional(),
      nasIp: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      return subscriptionDb.getSessionHistory(input);
    }),

  disconnectSession: superAdminProcedure
    .input(z.object({ acctSessionId: z.string() }))
    .mutation(async ({ input }) => {
      return subscriptionDb.disconnectSession(input.acctSessionId);
    }),
});

// ============================================================================
// SUPPORT TICKETS ROUTER
// ============================================================================
const ticketsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const tenantContext = getTenantContext(ctx.user);
      return ticketDb.getTicketsByTenant(tenantContext, input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const ticket = await ticketDb.getTicketById(input.id);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      
      if (!isAdmin(ctx.user.role) && ticket.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      return ticket;
    }),

  create: protectedProcedure
    .input(z.object({
      subject: z.string().min(1),
      message: z.string().min(1),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      category: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ticket = await ticketDb.createTicket({
        ...input,
        userId: ctx.user.id,
      });
      
      // Notify all admins (owner + super_admin) about new ticket
      const db = await getDb();
      if (db) {
        const superAdmins = await db.select().from(users).where(sql`role IN ('owner', 'super_admin')`);
        for (const admin of superAdmins) {
          await notificationDb.createNotification({
            userId: admin.id,
            type: 'support',
            title: 'New Support Ticket',
            titleAr: 'تذكرة دعم جديدة',
            message: `New ticket #${ticket.ticketNumber}: ${input.subject}`,
            messageAr: `تذكرة جديدة #${ticket.ticketNumber}: ${input.subject}`,
            data: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
          });
          // Send Telegram notification to owner
          try {
            await notifyOwnerEvent(admin.id, 'ownerSupportTicket', {
              title: 'تذكرة دعم جديدة',
              message: `تذكرة جديدة #${ticket.ticketNumber}: ${input.subject}\nمن: ${ctx.user.name || ctx.user.email}`,
              emoji: '🎫',
            });
          } catch (e) {
            // Telegram notification is non-critical, don't fail the request
          }
        }
      }
      
      return ticket;
    }),

  addMessage: protectedProcedure
    .input(z.object({
      ticketId: z.number(),
      message: z.string().min(1),
      attachmentUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const message = await ticketDb.addMessage({
        ...input,
        senderId: ctx.user.id,
      });
      
      // Get ticket details
      const ticket = await ticketDb.getTicketById(input.ticketId);
      if (!ticket) return message;
      
      const db = await getDb();
      if (!db) return message;
      
      // If sender is super_admin, notify ticket owner
      if (isAdmin(ctx.user.role) && ticket.userId !== ctx.user.id) {
        await notificationDb.createNotification({
          userId: ticket.userId,
          type: 'support',
          title: 'New Reply to Your Ticket',
          titleAr: 'رد جديد على تذكرتك',
          message: `Admin replied to ticket #${ticket.ticketNumber}`,
          messageAr: `المدير رد على التذكرة #${ticket.ticketNumber}`,
          data: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
        });
      }
      // If sender is client, notify all admins + trigger AI Auto-Reply if enabled
      else if (!isAdmin(ctx.user.role)) {
        const superAdmins = await db.select().from(users).where(sql`role IN ('owner', 'super_admin')`);
        for (const admin of superAdmins) {
          await notificationDb.createNotification({
            userId: admin.id,
            type: 'support',
            title: 'New Message in Support Ticket',
            titleAr: 'رسالة جديدة في تذكرة الدعم',
            message: `Client sent a message in ticket #${ticket.ticketNumber}`,
            messageAr: `العميل أرسل رسالة في التذكرة #${ticket.ticketNumber}`,
            data: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
          });
        }
        // === AI AUTO-REPLY: fire-and-forget (non-blocking) ===
        const ticketIdForAI = input.ticketId;
        const ticketForAI = ticket;
        const dbForAI = db;
        setTimeout(async () => { // 2s delay so main response completes first
          try {
            const autoReplyEnabled = await (await import('./db')).getSystemSetting('ai_auto_reply_enabled');
            if (autoReplyEnabled !== 'true') {
              console.log('[AI Auto-Reply] Disabled by setting');
              return;
            }
            // Cooldown: don't reply again within 30 seconds for same ticket
            const freshTicket = await ticketDb.getTicketById(ticketIdForAI);
            if (freshTicket?.lastAiReplyAt) {
              const msSinceLast = Date.now() - new Date((freshTicket as any).lastAiReplyAt).getTime();
              if (msSinceLast < 30 * 1000) {
                console.log('[AI Auto-Reply] Cooldown active, skipping');
                return;
              }
            }
            console.log('[AI Auto-Reply] Generating reply for ticket', ticketIdForAI);
            // Get conversation history
            const allMessages = await ticketDb.getMessagesByTicketId(ticketIdForAI);
            const conversation = allMessages.slice(-8).map((m: any) => {
              const role = m.senderName || 'عميل';
              return `[${role}]: ${m.message}`;
            }).join('\n');
            // Generate AI reply
            const aiResponse = await invokeLLM({
              messages: [
                {
                  role: 'system',
                  content: `أنت مساعد دعم فني احترافي لمنصة Radius Pro لإدارة شبكات الإنترنت والـ RADIUS وMikroTik.\nاكتب رداً تلقائياً فورياً احترافياً ومفيداً على رسالة العميل.\nالرد يجب أن يكون:\n- باللغة العربية\n- مختصراً وواضحاً (لا يتجاوز 3-4 جمل)\n- يبدأ بتحية مختصرة\n- يُشير إلى أن هذا رد تلقائي وسيتابع فريق الدعم قريباً\n- إذا كانت المشكلة تقنية واضحة، قدّم حلاً مبدئياً مفيداً\nأعد JSON فقط: { "reply": "نص الرد" }`,
                },
                {
                  role: 'user',
                  content: `موضوع التذكرة: ${freshTicket?.subject || ticketForAI.subject}\nالمحادثة:\n${conversation}`,
                },
              ],
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: 'ai_auto_reply',
                  strict: true,
                  schema: {
                    type: 'object',
                    properties: { reply: { type: 'string' } },
                    required: ['reply'],
                    additionalProperties: false,
                  },
                },
              },
            });
            const content = aiResponse.choices[0].message.content;
            const parsed = typeof content === 'string' ? JSON.parse(content) : content;
            const replyText = parsed.reply || 'شكراً لتواصلك معنا. سيقوم فريق الدعم بالرد عليك في أقرب وقت ممكن.';
            // Get the owner/admin user to send reply as
            const [adminUser] = await dbForAI.select().from(users).where(sql`role IN ('owner', 'super_admin')`).limit(1);
            if (!adminUser) return;
            // Save AI reply as admin message
            await ticketDb.addMessage({
              ticketId: ticketIdForAI,
              senderId: adminUser.id,
              message: `🤖 ${replyText}`,
            });
            console.log('[AI Auto-Reply] Reply saved for ticket', ticketIdForAI);
            // Update lastAiReplyAt to prevent spam
            const { supportTickets: supportTicketsTable } = await import('../drizzle/schema');
            await dbForAI.update(supportTicketsTable).set({ lastAiReplyAt: new Date() } as any).where(eq(supportTicketsTable.id, ticketIdForAI));
            // Notify client of AI reply
            await notificationDb.createNotification({
              userId: ticketForAI.userId,
              type: 'support',
              title: 'رد تلقائي على تذكرتك',
              titleAr: 'رد تلقائي على تذكرتك',
              message: `تم الرد تلقائياً على التذكرة #${ticketForAI.ticketNumber}`,
              messageAr: `تم الرد تلقائياً على التذكرة #${ticketForAI.ticketNumber}`,
              data: { ticketId: ticketForAI.id, ticketNumber: ticketForAI.ticketNumber },
            });
          } catch (err) {
            // Silent fail — auto-reply is best-effort, never blocks the main response
            console.error('[AI Auto-Reply] Error:', err);
          }
        });
      }
      
      return message;
    }),

  getMessages: protectedProcedure
    .input(z.object({ ticketId: z.number() }))
    .query(async ({ ctx, input }) => {
      const ticket = await ticketDb.getTicketById(input.ticketId);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      
      // Allow owner, super_admin, or ticket owner to see messages
      const userIsAdmin = isAdmin(ctx.user.role);
      const isTicketOwner = ticket.userId === ctx.user.id;
      
      if (!userIsAdmin && !isTicketOwner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      return ticketDb.getMessagesByTicketId(input.ticketId);
    }),

  updateStatus: superAdminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']),
    }))
    .mutation(async ({ input }) => {
      return ticketDb.updateTicketStatus(input.id, input.status);
    }),

  closeTicket: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return ticketDb.updateTicketStatus(input.id, 'closed');
    }),

  // Get count of unread messages for sidebar badge
  // - For clients: count of unread admin/AI replies
  // - For admins: count of unread client messages
  getUnreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      if (isAdmin(ctx.user.role)) {
        // Admin sees how many unread messages from clients
        const count = await ticketDb.getUnreadClientMessagesCount();
        return { count };
      }
      // Client sees how many unread admin replies
      const count = await ticketDb.getUnreadAdminRepliesCount(ctx.user.id);
      return { count };
    }),

  // Mark all messages in a ticket as read by admin (called when admin opens a ticket)
  markAsReadByAdmin: superAdminProcedure
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ input }) => {
      await ticketDb.markTicketMessagesAsReadByAdmin(input.ticketId);
      return { success: true };
    }),

  // Mark all admin messages in a ticket as read by client (called when client opens a ticket)
    markAsReadByClient: protectedProcedure
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (isAdmin(ctx.user.role)) return { success: true };
      await ticketDb.markAdminMessagesAsReadByClient(input.ticketId, ctx.user.id);
      return { success: true };
    }),
  // Mark ALL messages as read when user visits the support page (clears badge immediately)
  markAllAsReadOnPageVisit: protectedProcedure.mutation(async ({ ctx }) => {
    if (isAdmin(ctx.user.role)) {
      await ticketDb.markAllClientMessagesAsReadByAdmin();
    } else {
      await ticketDb.markAllAdminMessagesAsReadByClient(ctx.user.id);
    }
    return { success: true };
  }),
    deleteTicket: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return ticketDb.deleteTicket(input.id);
    }),

  // ============================================================
  // MESSAGE EDIT / DELETE (Admin only)
  // ============================================================
  editMessage: superAdminProcedure
    .input(z.object({
      messageId: z.number(),
      newMessage: z.string().min(1, 'الرسالة لا يمكن أن تكون فارغة'),
    }))
    .mutation(async ({ input }) => {
      const msg = await ticketDb.getMessageById(input.messageId);
      if (!msg) throw new TRPCError({ code: 'NOT_FOUND', message: 'الرسالة غير موجودة' });
      const updated = await ticketDb.editMessage(input.messageId, input.newMessage);
      return { success: true, message: updated };
    }),

  deleteMessage: superAdminProcedure
    .input(z.object({ messageId: z.number() }))
    .mutation(async ({ input }) => {
      const msg = await ticketDb.getMessageById(input.messageId);
      if (!msg) throw new TRPCError({ code: 'NOT_FOUND', message: 'الرسالة غير موجودة' });
      return ticketDb.deleteMessage(input.messageId);
    }),

  // ============================================================
  // AI SUPPORT PROCEDURES
  // ============================================================

  // Get AI suggested replies for a ticket (admin only)
  aiSuggestReplies: superAdminProcedure
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ input }) => {
      const ticket = await ticketDb.getTicketById(input.ticketId);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });

      const messages = await ticketDb.getMessagesByTicketId(input.ticketId);
      const conversation = messages.slice(-10).map((m: any) => {
        const role = m.senderName ? m.senderName : "مجهول";
        return `[${role}]: ${m.message}`;
      }).join("\n");

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `أنت مساعد دعم فني لمنصة Radius Pro لإدارة شبكات الإنترنت والـ RADIUS.
مهمتك: اقتراح 3 ردود مختصرة واحترافية على تذكرة الدعم الفني.
الردود يجب أن تكون:
- باللغة العربية
- مختصرة (جملة أو جملتين كحد أقصى)
- احترافية ومفيدة
- متنوعة (من طلب معلومات، إلى حل مقترح، إلى إحالة)
أعد الرد بصيغة JSON فقط: { "suggestions": ["رد1", "رد2", "رد3"] }`,
          },
          {
            role: "user",
            content: `موضوع التذكرة: ${ticket.subject}\nالفئة: ${ticket.category || "عام"}\nالأولوية: ${ticket.priority}\n\nالمحادثة:\n${conversation}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ai_suggestions",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        },
      });

      try {
        const content = response.choices[0].message.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        return { suggestions: parsed.suggestions || [] };
      } catch {
        return { suggestions: [] };
      }
    }),

  // Auto-classify ticket on creation (called internally after create)
  aiClassifyTicket: superAdminProcedure
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ input }) => {
      const ticket = await ticketDb.getTicketById(input.ticketId);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `أنت مساعد تصنيف لتذاكر الدعم الفني لمنصة Radius Pro.
صنّف التذكرة وحدد الأولوية بناءً على الموضوع والرسالة.
الفئات المتاحة: billing, technical, account, general, network, vpn, radius, cards
الأولويات: low, medium, high, urgent
أعد JSON فقط: { "category": "...", "priority": "...", "summary": "ملخص مختصر بالعربية" }`,
          },
          {
            role: "user",
            content: `الموضوع: ${ticket.subject}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ticket_classification",
            strict: true,
            schema: {
              type: "object",
              properties: {
                category: { type: "string" },
                priority: { type: "string" },
                summary: { type: "string" },
              },
              required: ["category", "priority", "summary"],
              additionalProperties: false,
            },
          },
        },
      });

      try {
        const content = response.choices[0].message.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        return { category: parsed.category, priority: parsed.priority, summary: parsed.summary };
      } catch {
        return { category: "general", priority: "medium", summary: "" };
      }
    }),

  // AI auto-reply: send an AI-generated reply to the ticket as a system message
  aiAutoReply: superAdminProcedure
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const ticket = await ticketDb.getTicketById(input.ticketId);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });

      const messages = await ticketDb.getMessagesByTicketId(input.ticketId);
      const conversation = messages.slice(-10).map((m: any) => {
        const role = m.senderName ? m.senderName : "مجهول";
        return `[${role}]: ${m.message}`;
      }).join("\n");

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `أنت مساعد دعم فني احترافي لمنصة Radius Pro لإدارة شبكات الإنترنت والـ RADIUS.
اكتب رداً احترافياً ومفيداً على التذكرة.
الرد يجب أن يكون:
- باللغة العربية
- واضحاً ومفيداً
- لا يتجاوز 3 جمل
- يبدأ بالتحية
- يُشير إلى أن هذا رد تلقائي وسيتابع فريق الدعم قريباً
أعد JSON فقط: { "reply": "نص الرد" }`,
          },
          {
            role: "user",
            content: `موضوع التذكرة: ${ticket.subject}\nالمحادثة:\n${conversation}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ai_reply",
            strict: true,
            schema: {
              type: "object",
              properties: { reply: { type: "string" } },
              required: ["reply"],
              additionalProperties: false,
            },
          },
        },
      });

      try {
        const content = response.choices[0].message.content;
        const parsed = typeof content === "string" ? JSON.parse(content) : content;
        const replyText = parsed.reply || "شكراً لتواصلك معنا. سيقوم فريق الدعم بالرد عليك في أقرب وقت ممكن.";

        // Save the AI reply as a message from the admin (ctx.user)
        const savedMsg = await ticketDb.addMessage({
          ticketId: input.ticketId,
          senderId: ctx.user.id,
          message: `🤖 ${replyText}`,
        });

        // Notify the ticket owner
        await notificationDb.createNotification({
          userId: ticket.userId,
          type: "support",
          title: "رد جديد على تذكرتك",
          titleAr: "رد جديد على تذكرتك",
          message: `تم الرد على التذكرة #${ticket.ticketNumber} تلقائياً`,
          messageAr: `تم الرد على التذكرة #${ticket.ticketNumber} تلقائياً`,
          data: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
        });

        return { success: true, message: savedMsg, messageId: (savedMsg as any)?.id ?? null };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "فشل توليد الرد التلقائي" });
      }
    }),
});

// ============================================================================
// NOTIFICATIONS ROUTER

// ============================================================================
// DASHBOARD STATS ROUTER

// ============================================================================
// SESSIONS ROUTER (Active RADIUS Sessions)
// ============================================================================

// ============================================================================
// CARD TEMPLATES ROUTER
// ============================================================================
const templatesRouter = router({
  // List all templates
  list: resellerProcedure.query(async ({ ctx }) => {
    const templates = isAdmin(ctx.user.role)
      ? await templateDb.getTemplates()
      : await templateDb.getTemplates(ctx.user.id);
    return Promise.all(templates.map(refreshTemplateImageUrl));
  }),

  // Get single template
    getById: resellerProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const template = await templateDb.getTemplateById(input.id);
      if (!template) return null;
      return refreshTemplateImageUrl(template);
    }),
  // Get default template
  getDefault: resellerProcedure.query(async ({ ctx }) => {
    let template;
    if (isAdmin(ctx.user.role)) {
      template = await templateDb.getDefaultTemplate();
    } else {
      template = await templateDb.getDefaultTemplate(ctx.user.id);
    }
    if (!template) return null;
    return refreshTemplateImageUrl(template);
  }),

  // Create template with image upload
  create: resellerProcedure
    .input(z.object({
      name: z.string().min(1).max(120),
      imageBase64: z.string().max(13_981_016), // Base64 encoded image (max 10 MiB decoded)
      imageType: z.string().refine((value) => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(value), 'نوع صورة القالب غير مسموح').default('image/png'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Decode base64 and upload to S3
      const buffer = Buffer.from(input.imageBase64, 'base64');
      const { assertAllowedUpload, createSafeUploadKey } = await import('./security/uploadPolicy');
      assertAllowedUpload('template', { mimetype: input.imageType, buffer });
      const fileKey = createSafeUploadKey('template', input.imageType, `${ctx.user.id}-${crypto.randomUUID()}`);
      const { url } = await storagePut(fileKey, buffer, input.imageType);

      // Create template in database
      const id = await templateDb.createTemplate({
        name: input.name,
        resellerId: isAdmin(ctx.user.role) ? null : ctx.user.id,
        imageUrl: url,
        imageKey: fileKey,
      });

      return { id, imageUrl: url };
    }),

  // Create multiple templates at once
  createMultiple: resellerProcedure
    .input(z.array(z.object({
      name: z.string().min(1).max(120),
      imageBase64: z.string().max(13_981_016),
      imageType: z.string().refine((value) => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(value), 'نوع صورة القالب غير مسموح').default('image/png'),
    })).max(20))
    .mutation(async ({ ctx, input }) => {
      const results = [];
      for (const template of input) {
        const buffer = Buffer.from(template.imageBase64, 'base64');
        const { assertAllowedUpload, createSafeUploadKey } = await import('./security/uploadPolicy');
        assertAllowedUpload('template', { mimetype: template.imageType, buffer });
        const fileKey = createSafeUploadKey('template', template.imageType, `${ctx.user.id}-${crypto.randomUUID()}`);
        const { url } = await storagePut(fileKey, buffer, template.imageType);

        const id = await templateDb.createTemplate({
          name: template.name,
          resellerId: isAdmin(ctx.user.role) ? null : ctx.user.id,
          imageUrl: url,
          imageKey: fileKey,
        });

        results.push({ id, name: template.name, imageUrl: url });
      }
      return results;
    }),

  // Update template
  update: resellerProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      // Text positions
      usernameX: z.number().optional(),
      usernameY: z.number().optional(),
      passwordX: z.number().optional(),
      passwordY: z.number().optional(),
      // Username font settings
      usernameFontSize: z.number().optional(),
      usernameFontFamily: z.string().optional(),
      usernameFontColor: z.string().optional(),
      usernameAlign: z.enum(['left', 'center', 'right']).optional(),
      // Password font settings
      passwordFontSize: z.number().optional(),
      passwordFontFamily: z.string().optional(),
      passwordFontColor: z.string().optional(),
      passwordAlign: z.enum(['left', 'center', 'right']).optional(),
      // QR Code settings
      qrCodeEnabled: z.boolean().optional(),
      qrCodeX: z.number().optional(),
      qrCodeY: z.number().optional(),
      qrCodeSize: z.number().optional(),
      qrCodeDomain: z.string().optional(),
      // Print settings
      cardsPerPage: z.number().optional(),
      marginTop: z.string().optional(),
      marginHorizontal: z.string().optional(),
      columnsPerPage: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await templateDb.updateTemplate(id, data);
      return { success: true };
    }),

  // Set as default
  setDefault: resellerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const resellerId = isAdmin(ctx.user.role) ? undefined : ctx.user.id;
      await templateDb.setDefaultTemplate(input.id, resellerId);
      return { success: true };
    }),

  // Delete template
  delete: resellerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await templateDb.deleteTemplate(input.id);
      return { success: true };
    }),
});

// ============================================================================
// SETTINGS ROUTER
// ============================================================================
const settingsRouter = router({
  getAll: superAdminProcedure.query(async () => {
    return db.getSystemSettings();
  }),
  
  get: superAdminProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      return db.getSystemSetting(input.key);
    }),
  
  update: superAdminProcedure
    .input(z.object({
      key: z.string(),
      value: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.setSystemSetting(input.key, input.value, input.description);
      return { success: true };
    }),
});

const staleSessionsRouter = router({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
    }
    const timeoutSeconds = await staleSessionTimeoutService.getTimeoutSeconds();
    return {
      timeoutSeconds,
      defaultSeconds: 300,
      minSeconds: MIN_STALE_SESSION_TIMEOUT_SECONDS,
      maxSeconds: MAX_STALE_SESSION_TIMEOUT_SECONDS,
      settingsKey: 'session.stale_timeout_seconds',
      redisCacheKey: 'radius-pro:settings:session.stale_timeout_seconds',
    };
  }),
  updateSettings: protectedProcedure
    .input(z.object({ timeoutSeconds: z.number().int().min(MIN_STALE_SESSION_TIMEOUT_SECONDS).max(MAX_STALE_SESSION_TIMEOUT_SECONDS) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'owner' && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
      }
      const timeoutSeconds = await staleSessionTimeoutService.updateTimeoutSeconds(input.timeoutSeconds);
      return { success: true, timeoutSeconds };
    }),
});

// ============================================================================
// TENANT SUBSCRIPTIONS ROUTER (Admin only)
// ============================================================================
import * as tenantSubDb from "./_core/tenantSubscriptions";
import * as reportsService from "./services/reportsService";
import * as reportExporter from "./services/reportExporter";
import * as backupService from "./services/backupService";
import * as internalNotificationService from "./services/internalNotificationService";

const tenantSubscriptionsRouter = router({
  // Get all tenant subscriptions (Super Admin only)
  list: superAdminProcedure.query(async () => {
    const subscriptions = await tenantSubDb.getAllTenantSubscriptions();
    // Get user info for each subscription
    const enriched = await Promise.all(
      subscriptions.map(async (sub: any) => {
        const user = await db.getUserById(sub.tenantId);
        return {
          ...sub,
          tenantName: user?.name || 'Unknown',
          tenantEmail: user?.email || 'Unknown',
        };
      })
    );
    return enriched;
  }),

  // Get subscription by tenant ID
  getByTenantId: superAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      return tenantSubDb.getSubscriptionByTenantId(input.tenantId);
    }),

  // Get current user's subscription status
  myStatus: protectedProcedure.query(async ({ ctx }) => {
    return tenantSubDb.getSubscriptionStatus(ctx.user.id);
  }),

  // Create subscription for a tenant (Super Admin only)
  create: superAdminProcedure
    .input(z.object({
      tenantId: z.number(),
      months: z.number().min(1).default(1),
      pricePerMonth: z.string().default("10.00"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if subscription already exists
      const existing = await tenantSubDb.getSubscriptionByTenantId(input.tenantId);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Subscription already exists for this tenant. Use extend or activate instead.",
        });
      }
      return tenantSubDb.createTenantSubscription({
        ...input,
        createdBy: ctx.user.id,
      });
    }),

  // Extend subscription (Super Admin only)
  extend: superAdminProcedure
    .input(z.object({
      tenantId: z.number(),
      months: z.number().min(1),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await tenantSubDb.extendTenantSubscription(
        input.tenantId,
        input.months,
        ctx.user.id,
        input.notes
      );
      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Subscription not found for this tenant.",
        });
      }
      return result;
    }),

  // Suspend subscription (Super Admin only)
  suspend: superAdminProcedure
    .input(z.object({
      tenantId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return tenantSubDb.suspendTenantSubscription(input.tenantId, input.notes);
    }),

  // Activate subscription (Super Admin only)
  activate: superAdminProcedure
    .input(z.object({
      tenantId: z.number(),
      months: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await tenantSubDb.activateTenantSubscription(
        input.tenantId,
        input.months,
        ctx.user.id
      );
      if (!result) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Subscription not found for this tenant.",
        });
      }
      return result;
    }),

  // Get expiring subscriptions (Super Admin only)
  getExpiring: superAdminProcedure
    .input(z.object({ withinDays: z.number().default(7) }))
    .query(async ({ input }) => {
      return tenantSubDb.getExpiringSubscriptions(input.withinDays);
    }),

  // Delete subscription (Super Admin only)
  delete: superAdminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input }) => {
      return tenantSubDb.deleteTenantSubscription(input.tenantId);
    }),
});

// ============================================================================
// REPORTS ROUTER

// ============================================================================
// INTERNAL NOTIFICATIONS ROUTER
// ============================================================================
const internalNotificationsRouter = router({
  // Get notifications for current user
  list: protectedProcedure
    .input(z.object({
      limit: z.number().optional(),
      unreadOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return internalNotificationService.getNotifications(ctx.user.id, {
        limit: input?.limit,
        unreadOnly: input?.unreadOnly,
      });
    }),

  // Get unread count
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return internalNotificationService.getUnreadCount(ctx.user.id);
  }),

  // Mark notification as read
  markAsRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const success = await internalNotificationService.markAsRead(input.id, ctx.user.id);
      return { success };
    }),

  // Mark all as read
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const success = await internalNotificationService.markAllAsRead(ctx.user.id);
    return { success };
  }),

  // Delete notification
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const success = await internalNotificationService.deleteNotification(input.id, ctx.user.id);
      return { success };
    }),
});

// ============================================================================
// PPPoE SUBSCRIBERS ROUTER

/// ============================================================================
// BILLING ROUTER (SaaS Billing Standard)

// ============================================================================
// VPS MANAGEMENT ROUTER
// ============================================================================
import * as vpnConnectionService from "./services/vpnConnectionService";

const vpnRouter = router({
  // List all VPN connections with status (from SoftEther)
  list: protectedProcedure.query(async ({ ctx }) => {
    // Only owner/super_admin can see VPN connections
    if (ctx.user.role !== 'owner' && !isAdmin(ctx.user.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only administrators can view VPN connections' });
    }
    
    // Get active sessions from SoftEther
    const sessionsResult = await sshVpn.getVpnSessionsFromServer();
    const sessions = sessionsResult.sessions || [];
    
    // Get all VPN NAS devices
    const allNasDevices = await nasDb.getAllNasDevices();
    const vpnNasDevices = allNasDevices.filter((nas: any) => 
      nas.connectionType && nas.connectionType !== 'public_ip'
    );
    
    // Map sessions to NAS devices
    const connections = vpnNasDevices.map((nas: any) => {
      const session = sessions.find((s: any) => 
        s.username && nas.vpnUsername && 
        s.username.toLowerCase() === nas.vpnUsername.toLowerCase()
      );
      
      return {
        vpn: {
          id: nas.id,
          nasId: nas.id,
          status: session ? 'connected' : 'disconnected',
          sessionName: session?.sessionName || null,
          sourceHost: session?.sourceHost || null,
          transferBytes: session?.transferBytes || null,
          localVpnIp: session?.localIp || null,
          lastConnectedAt: session?.connectedAt || null,
          clientIp: session?.clientIp || null,
          protocol: session?.protocol || null,
          updatedAt: new Date(),
        },
        nas: {
          id: nas.id,
          nasname: nas.nasname,
          shortname: nas.shortname,
          connectionType: nas.connectionType,
          vpnUsername: nas.vpnUsername,
          status: nas.status,
          ownerId: nas.ownerId,
        }
      };
    });
    
    // Calculate stats
    const stats = {
      total: connections.length,
      connected: connections.filter((c: any) => c.vpn.status === 'connected').length,
      disconnected: connections.filter((c: any) => c.vpn.status === 'disconnected').length,
      connecting: 0,
      error: 0,
    };
    
    return { connections, stats };
  }),

  // Get VPN connection by NAS ID
  getByNasId: protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasById(input.nasId);
      if (!nas) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS device not found' });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const connection = await db.getVpnConnectionByNasId(input.nasId);
      return connection;
    }),

  // Get VPN status from MikroTik
  getStatus: protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .query(async ({ input, ctx }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasById(input.nasId);
      if (!nas) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS device not found' });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return vpnConnectionService.getVpnStatus(input.nasId);
    }),

  // Restart VPN connection
  restart: protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasById(input.nasId);
      if (!nas) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS device not found' });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return vpnConnectionService.restartVpnConnection(input.nasId, ctx.user.id);
    }),

  // Disconnect VPN
  disconnect: protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasById(input.nasId);
      if (!nas) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS device not found' });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return vpnConnectionService.disconnectVpn(input.nasId, ctx.user.id);
    }),

  // Connect VPN
  connect: protectedProcedure
    .input(z.object({ nasId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasById(input.nasId);
      if (!nas) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS device not found' });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return vpnConnectionService.connectVpn(input.nasId, ctx.user.id);
    }),

  // Sync all VPN statuses
  syncAll: protectedProcedure.mutation(async ({ ctx }) => {
    const ownerId = isAdmin(ctx.user.role) ? undefined : ctx.user.id;
    return vpnConnectionService.syncAllVpnStatuses(ownerId);
  }),

  // Get VPN logs from SoftEther server
  logs: protectedProcedure
    .input(z.object({
      nasId: z.number().optional(),
      eventType: z.string().optional(),
      limit: z.number().min(1).max(500).optional(),
    }))
    .query(async ({ input, ctx }) => {
      // Only owner/super_admin can see VPN logs
      if (ctx.user.role !== 'owner' && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only administrators can view VPN logs' });
      }
      
      // Get logs from SoftEther API
      const result = await sshVpn.getVpnLogs();
      
      if (!result.success) {
        console.error('[VPN] Failed to get logs:', result.error);
        return { logs: [], total: 0 };
      }
      
      let logs = result.logs || [];
      
      // Filter by event type if specified
      if (input.eventType && input.eventType !== 'all') {
        logs = logs.filter((log: any) => log.eventType === input.eventType);
      }
      
      // Limit results
      const limit = input.limit || 100;
      logs = logs.slice(-limit).reverse();
      
      return { logs, total: logs.length };
    }),

  // Get VPN stats
  stats: protectedProcedure.query(async ({ ctx }) => {
    const ownerId = isAdmin(ctx.user.role) ? undefined : ctx.user.id;
    return db.getVpnConnectionStats(ownerId);
  }),
});

// ============================================================================
// AUDIT LOG ROUTER
// ============================================================================
import * as auditLogService from "./services/auditLogService";

const auditRouter = router({
  // List audit logs with filters
  list: protectedProcedure
    .input(z.object({
      userId: z.number().optional(),
      action: z.string().optional(),
      targetType: z.string().optional(),
      nasId: z.number().optional(),
      result: z.enum(['success', 'failure', 'partial']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Super Admin sees all, others see only their own logs
      const filters: any = {
        limit: input?.limit || 100,
        offset: input?.offset || 0,
      };
      
      if (!isAdmin(ctx.user.role)) {
        filters.userId = ctx.user.id;
      } else if (input?.userId) {
        filters.userId = input.userId;
      }
      
      if (input?.action) filters.action = input.action as any;
      if (input?.targetType) filters.targetType = input.targetType;
      if (input?.nasId) filters.nasId = input.nasId;
      if (input?.startDate) filters.startDate = new Date(input.startDate);
      if (input?.endDate) filters.endDate = new Date(input.endDate);
      
      const logs = await auditLogService.getAuditLogs(filters);
      
      // Parse details JSON
      return logs.map((log: any) => ({
        ...log,
        details: log.details ? JSON.parse(log.details as string) : null,
      }));
    }),

  // Get audit logs for a specific NAS
  byNas: protectedProcedure
    .input(z.object({
      nasId: z.number(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // Check NAS ownership
      const nas = await nasDb.getNasById(input.nasId);
      if (!nas) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'NAS not found' });
      }
      if (!isAdmin(ctx.user.role) && nas.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      
      const logs = await auditLogService.getAuditLogsByNas(input.nasId, input.limit);
      return logs.map((log: any) => ({
        ...log,
        details: log.details ? JSON.parse(log.details as string) : null,
      }));
    }),

  // Get recent actions by current user
  myActions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const logs = await auditLogService.getRecentActionsByUser(ctx.user.id, input?.limit || 20);
      return logs.map((log: any) => ({
        ...log,
        details: log.details ? JSON.parse(log.details as string) : null,
      }));
    }),

  // Get audit statistics (Super Admin only)
  stats: superAdminProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(7) }).optional())
    .query(async ({ input }) => {
      return auditLogService.getAuditStats(input?.days || 7);
    }),

  // Get available action types for filter dropdown
  actionTypes: protectedProcedure.query(() => {
    return [
      { value: 'session_disconnect', label: 'فصل جلسة' },
      { value: 'session_disconnect_coa', label: 'فصل جلسة (CoA)' },
      { value: 'session_disconnect_api', label: 'فصل جلسة (API)' },
      { value: 'speed_change', label: 'تغيير سرعة' },
      { value: 'speed_change_coa', label: 'تغيير سرعة (CoA)' },
      { value: 'speed_change_api', label: 'تغيير سرعة (API)' },
      { value: 'nas_create', label: 'إنشاء NAS' },
      { value: 'nas_update', label: 'تحديث NAS' },
      { value: 'nas_delete', label: 'حذف NAS' },
      { value: 'card_create', label: 'إنشاء كرت' },
      { value: 'card_suspend', label: 'تعطيل كرت' },
      { value: 'card_activate', label: 'تفعيل كرت' },
      { value: 'subscriber_create', label: 'إنشاء مشترك' },
      { value: 'subscriber_suspend', label: 'تعطيل مشترك' },
      { value: 'subscriber_activate', label: 'تفعيل مشترك' },
      { value: 'vpn_connect', label: 'اتصال VPN' },
      { value: 'vpn_disconnect', label: 'قطع VPN' },
      { value: 'login', label: 'تسجيل دخول' },
      { value: 'logout', label: 'تسجيل خروج' },
    ];
  }),

  // Get available target types for filter dropdown
  targetTypes: protectedProcedure.query(() => {
    return [
      { value: 'session', label: 'جلسة' },
      { value: 'nas', label: 'جهاز NAS' },
      { value: 'card', label: 'كرت' },
      { value: 'subscriber', label: 'مشترك' },
      { value: 'user', label: 'مستخدم' },
      { value: 'vpn', label: 'VPN' },
    ];
  }),
});

// ============================================================================
// LOGS ROUTER (RADIUS Logs Viewer)
// ============================================================================
const logsRouter = router({
  // Get authentication logs from radpostauth
  getAuthLogs: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(50),
      search: z.string().optional(),
      status: z.string().optional(),
      nasIp: z.string().optional(),
      dateRange: z.string().default('today'),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { logs: [], total: 0, stats: { accepted: 0, rejected: 0 } };
      
      const { radpostauth } = await import('../drizzle/schema');
      const { sql, and, eq, like, gte, lte, desc, count } = await import('drizzle-orm');
      
      // Build date filter
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      const now = new Date();
      
      switch (input.dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          break;
        case 'yesterday':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
      
      // Build conditions
      const conditions: any[] = [];
      if (input.search) {
        conditions.push(like(radpostauth.username, `%${input.search}%`));
      }
      if (input.status) {
        conditions.push(eq(radpostauth.reply, input.status));
      }
      // Note: radpostauth does not store nasipaddress in this schema
      // nasIp filter is not applicable here
      if (startDate) {
        conditions.push(gte(radpostauth.authdate, startDate));
      }
      if (endDate) {
        conditions.push(lte(radpostauth.authdate, endDate));
      }
      
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      // Get logs
      const logs = await db.select()
        .from(radpostauth)
        .where(whereClause)
        .orderBy(desc(radpostauth.authdate))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit);
      
      // Get total + stats in ONE query using GROUP BY reply
      const statsResult = await db.select({
        reply: radpostauth.reply,
        cnt: count(),
      })
        .from(radpostauth)
        .where(whereClause)
        .groupBy(radpostauth.reply);
      
      let total = 0;
      let accepted = 0;
      let rejected = 0;
      for (const row of statsResult) {
        total += Number(row.cnt);
        if (row.reply === 'Access-Accept') accepted = Number(row.cnt);
        if (row.reply === 'Access-Reject') rejected = Number(row.cnt);
      }
      
      return {
        logs,
        total,
        stats: { accepted, rejected },
      };
    }),

  // Get accounting logs from radacct
  getAccountingLogs: superAdminProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(50),
      search: z.string().optional(),
      nasIp: z.string().optional(),
      dateRange: z.string().default('today'),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { logs: [], total: 0, stats: { activeSessions: 0, totalSessionTime: 0 } };
      
      const { radacct } = await import('../drizzle/schema');
      const { sql, and, eq, like, gte, lte, desc, count, sum, isNull } = await import('drizzle-orm');
      
      // Build date filter
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      const now = new Date();
      
      switch (input.dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          break;
        case 'yesterday':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }
      
      // Build conditions
      const conditions: any[] = [];
      if (input.search) {
        conditions.push(like(radacct.username, `%${input.search}%`));
      }
      if (input.nasIp) {
        conditions.push(eq(radacct.nasipaddress, input.nasIp));
      }
      if (startDate) {
        conditions.push(gte(radacct.acctstarttime, startDate));
      }
      if (endDate) {
        conditions.push(lte(radacct.acctstarttime, endDate));
      }
      
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      // Get logs
      const logs = await db.select()
        .from(radacct)
        .where(whereClause)
        .orderBy(desc(radacct.acctstarttime))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit);
      
      // Get total count
      const totalResult = await db.select({ count: count() })
        .from(radacct)
        .where(whereClause);
      const total = totalResult[0]?.count || 0;
      
      // Get stats - active sessions from online_sessions (Phase 2C: realtime source)
      const activeResult = await db.select({ count: count() })
        .from(onlineSessions);
      
      // Get total session time
      const timeResult = await db.select({ total: sum(radacct.acctsessiontime) })
        .from(radacct)
        .where(whereClause);
      
      return {
        logs: logs.map((log: any) => ({
          ...log,
          acctstarttime: log.acctstarttime ? fixVpsDate(log.acctstarttime) : null,
          acctstoptime: log.acctstoptime ? fixVpsDate(log.acctstoptime) : null,
          acctupdatetime: log.acctupdatetime ? fixVpsDate(log.acctupdatetime) : null,
        })),
        total,
        stats: {
          activeSessions: activeResult[0]?.count || 0,
          totalSessionTime: Number(timeResult[0]?.total) || 0,
        }
      };
    }),
});

// ============================================================================
// DIAGNOSTICS ROUTER (System Health & Troubleshooting)

// ============================================================================
// SAAS PLANS ROUTER (Subscription Plans Management)
// ============================================================================
import * as saasPlansDb from './db/saasPlans';

const saasPlansRouter = router({
  // Get all active plans (public)
  getAll: publicProcedure.query(async () => {
    return saasPlansDb.getAllPlans(true);
  }),

  // Get all plans including inactive (Super Admin)
  getAllAdmin: superAdminProcedure.query(async () => {
    return saasPlansDb.getAllPlans(false);
  }),

  // Get single plan
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return saasPlansDb.getPlanById(input.id);
    }),

  // Create plan (Super Admin)
  create: superAdminProcedure
    .input(z.object({
      name: z.string().min(1),
      nameAr: z.string().optional(),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      priceMonthly: z.number().min(0),
      priceYearly: z.number().optional(),
      currency: z.string().default('USD'),
      maxNasDevices: z.number().min(1),
      maxCards: z.number().min(1),
      maxSubscribers: z.number().optional(),
      featureMikrotikApi: z.boolean().optional(),
      featureCoaDisconnect: z.boolean().optional(),
      featureStaticVpnIp: z.boolean().optional(),
      featureAdvancedReports: z.boolean().optional(),
      featureCustomBranding: z.boolean().optional(),
      featurePrioritySupport: z.boolean().optional(),
      displayOrder: z.number().optional(),
      isPopular: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await saasPlansDb.createPlan(input);
      if (!id) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create plan' });
      return { success: true, id };
    }),

  // Update plan (Super Admin)
  update: superAdminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      nameAr: z.string().optional(),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      priceMonthly: z.number().optional(),
      priceYearly: z.number().optional(),
      currency: z.string().optional(),
      maxNasDevices: z.number().optional(),
      maxCards: z.number().optional(),
      maxSubscribers: z.number().optional(),
      featureMikrotikApi: z.boolean().optional(),
      featureCoaDisconnect: z.boolean().optional(),
      featureStaticVpnIp: z.boolean().optional(),
      featureAdvancedReports: z.boolean().optional(),
      featureCustomBranding: z.boolean().optional(),
      featurePrioritySupport: z.boolean().optional(),
      displayOrder: z.number().optional(),
      isPopular: z.boolean().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await saasPlansDb.updatePlan(id, data);
      return { success: true };
    }),

  // Delete plan (Super Admin)
  delete: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await saasPlansDb.deletePlan(input.id);
      return { success: true };
    }),

  // Get user account info (current user)
  getMyAccountInfo: protectedProcedure.query(async ({ ctx }) => {
    return saasPlansDb.getUserAccountInfo(ctx.user.id);
  }),

  // Get any user's account info (Super Admin)
  getUserAccountInfo: superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      return saasPlansDb.getUserAccountInfo(input.userId);
    }),

  // Activate subscription for user (Super Admin)
  activateSubscription: superAdminProcedure
    .input(z.object({
      userId: z.number(),
      planId: z.number(),
      months: z.number().min(1).max(24),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const success = await saasPlansDb.activateUserSubscription(
        input.userId,
        input.planId,
        input.months,
        ctx.user.id,
        input.notes
      );
      if (!success) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to activate subscription' });
      return { success: true };
    }),

  // Suspend user (Super Admin)
  suspendUser: superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      await saasPlansDb.suspendUser(input.userId);
      return { success: true };
    }),

  // Reactivate user (Super Admin)
  reactivateUser: superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      await saasPlansDb.reactivateUser(input.userId);
      return { success: true };
    }),

  // Get subscription history (Super Admin or own)
  getSubscriptionHistory: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const userId = isAdmin(ctx.user.role) && input.userId ? input.userId : ctx.user.id;
      return saasPlansDb.getSubscriptionHistory(userId);
    }),
});

// ============================================================================
// RADIUS CONTROL PANEL ROUTER
// ============================================================================
import * as centralAccountingService from "./v2/V2ServiceBridge";

const radiusControlRouter = router({
  // Get Central Accounting Status
  getAccountingStatus: superAdminProcedure
    .query(async () => {
      return centralAccountingService.getCentralAccountingStatus();
    }),
  
  // Get Session Monitor Status (now delegates to centralAccountingService)
  getSessionMonitorStatus: superAdminProcedure
    .query(async () => {
      // sessionMonitor is now a wrapper around centralAccountingService
      return centralAccountingService.getCentralAccountingStatus();
    }),
  
  // Trigger Accounting Run
  triggerAccountingRun: superAdminProcedure
    .mutation(async () => {
      return centralAccountingService.triggerAccountingRun();
    }),

  // Fix Session-Timeout for unused cards that may have wrong/missing values
  // This is a one-time repair procedure for existing cards
  fixUnusedCardsSessionTimeout: superAdminProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });

      let fixed = 0;
      let skipped = 0;
      const errors: string[] = [];

      try {
        // Get all active/unused cards with usageBudgetSeconds > 0
        const cards = await db.select({
          username: radiusCards.username,
          usageBudgetSeconds: radiusCards.usageBudgetSeconds,
          status: radiusCards.status,
        })
        .from(radiusCards)
        .where(
          and(
            sql`${radiusCards.usageBudgetSeconds} > 0`,
            or(eq(radiusCards.status, 'active'), eq(radiusCards.status, 'unused'))
          )
        );

        for (const card of cards) {
          try {
            const budget = Number(card.usageBudgetSeconds) || 0;
            if (budget <= 0) { skipped++; continue; }

            // Get total used time from radacct
            const usageResult = await db.execute(sql`
              SELECT COALESCE(SUM(acctsessiontime), 0) as total
              FROM radacct
              WHERE username = ${card.username}
            `);
            const usedSeconds = Number((usageResult as any)[0]?.[0]?.total || 0);
            const remaining = Math.max(0, budget - usedSeconds);

            // Upsert Session-Timeout in radreply
            const existing = await db.select({ id: radreply.id })
              .from(radreply)
              .where(and(
                eq(radreply.username, card.username),
                eq(radreply.attribute, 'Session-Timeout')
              ))
              .limit(1);

            if (existing.length > 0) {
              await db.update(radreply)
                .set({ value: String(remaining), op: '=' })
                .where(and(
                  eq(radreply.username, card.username),
                  eq(radreply.attribute, 'Session-Timeout')
                ));
            } else {
              await db.insert(radreply).values({
                username: card.username,
                attribute: 'Session-Timeout',
                op: '=',
                value: String(remaining),
              });
            }
            fixed++;
          } catch (err: any) {
            errors.push(`${card.username}: ${err.message}`);
          }
        }

        return { fixed, skipped, errors, total: cards.length };
      } catch (err: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
      }
    }),
  
  // Get User Time Details
  getUserTimeDetails: superAdminProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      return centralAccountingService.getUserTimeDetails(input.username);
    }),
  
  // Sync User Usage from radacct
  syncUserUsage: superAdminProcedure
    .input(z.object({ username: z.string() }))
    .mutation(async ({ input }) => {
      await centralAccountingService.forceSyncUserUsage(input.username);
      return { success: true };
    }),
  
  // Get Recent Audit Logs
  getRecentAuditLogs: superAdminProcedure
    .input(z.object({ limit: z.number().default(20) }).optional())
    .query(async ({ input }) => {
      return auditLogService.getAuditLogs({ limit: input?.limit || 20 });
    }),
});

// ============================================================================
// VPS MANAGEMENT ROUTER (System Admin)
// ============================================================================

// ============================================================================
// BANK TRANSFER ROUTER

// ============================================================================
// WINBOX ROUTER

// ============================================================================
// CHECK TOKENS ROUTER (Card Check Links)
// ============================================================================
const checkTokensRouter = router({
  // Get the current user's check token (create one if it doesn't exist)
  getMyToken: protectedProcedure.query(async ({ ctx }) => {
    const db2 = await getDb();
    const [existing] = await db2
      .select()
      .from(checkTokens)
      .where(eq(checkTokens.ownerId, ctx.user.id))
      .limit(1);
    if (existing) return existing;
    // Auto-create a token for this user
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex').slice(0, 32);
    await db2!.insert(checkTokens).values({
      token,
      ownerId: ctx.user.id,
      label: null,
      isActive: true,
    });
    const [created] = await db2
      .select()
      .from(checkTokens)
      .where(eq(checkTokens.ownerId, ctx.user.id))
      .limit(1);
    return created;
  }),

  // Check if a slug is available
  checkSlugAvailability: protectedProcedure
    .input(z.object({ slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/) }))
    .query(async ({ ctx, input }) => {
      const db2 = await getDb();
      const [existing] = await db2
        .select({ id: checkTokens.id, ownerId: checkTokens.ownerId })
        .from(checkTokens)
        .where(eq(checkTokens.slug, input.slug))
        .limit(1);
      if (!existing) return { available: true };
      if (existing.ownerId === ctx.user.id) return { available: true, own: true };
      return { available: false };
    }),

  // Set/update the slug and network name
  setSlug: protectedProcedure
    .input(z.object({
      slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers and hyphens'),
      networkName: z.string().min(1).max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db2 = await getDb();
      const [conflict] = await db2
        .select({ id: checkTokens.id, ownerId: checkTokens.ownerId })
        .from(checkTokens)
        .where(eq(checkTokens.slug, input.slug))
        .limit(1);
      if (conflict && conflict.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This slug is already taken. Please choose another.' });
      }
      const [existing] = await db2
        .select()
        .from(checkTokens)
        .where(eq(checkTokens.ownerId, ctx.user.id))
        .limit(1);
      const updateData: Record<string, unknown> = { slug: input.slug, updatedAt: new Date() };
      if (input.networkName !== undefined) updateData.networkName = input.networkName;
      if (existing) {
        await db2.update(checkTokens).set(updateData as any).where(eq(checkTokens.ownerId, ctx.user.id));
      } else {
        const crypto = await import('crypto');
        const token = crypto.randomBytes(32).toString('hex').slice(0, 32);
        await db2.insert(checkTokens).values({
          token,
          slug: input.slug,
          networkName: input.networkName || null,
          ownerId: ctx.user.id,
          isActive: true,
        });
      }
      const [updated] = await db2
        .select()
        .from(checkTokens)
        .where(eq(checkTokens.ownerId, ctx.user.id))
        .limit(1);
      return updated;
    }),

  // Regenerate the token (invalidates the old link)
  regenerateToken: protectedProcedure.mutation(async ({ ctx }) => {
    const db2 = await getDb();
    const crypto = await import('crypto');
    const newToken = crypto.randomBytes(32).toString('hex').slice(0, 32);
    const [existing] = await db2
      .select()
      .from(checkTokens)
      .where(eq(checkTokens.ownerId, ctx.user.id))
      .limit(1);
    if (existing) {
      await db2
        .update(checkTokens)
        .set({ token: newToken, updatedAt: new Date() })
        .where(eq(checkTokens.ownerId, ctx.user.id));
    } else {
      await db2.insert(checkTokens).values({
        token: newToken,
        ownerId: ctx.user.id,
        label: null,
        isActive: true,
      });
    }
    const [updated] = await db2
      .select()
      .from(checkTokens)
      .where(eq(checkTokens.ownerId, ctx.user.id))
      .limit(1);
    return updated;
  }),

  // Get widget settings for the current user
  getWidgetSettings: protectedProcedure.query(async ({ ctx }) => {
    const db2 = await getDb();
    const [row] = await db2
      .select({
        widgetEnabled: checkTokens.widgetEnabled,
        widgetPrimaryColor: checkTokens.widgetPrimaryColor,
        widgetBgColor: checkTokens.widgetBgColor,
        widgetTextColor: checkTokens.widgetTextColor,
        widgetBorderRadius: checkTokens.widgetBorderRadius,
        widgetShowPlan: checkTokens.widgetShowPlan,
        widgetShowExpiry: checkTokens.widgetShowExpiry,
        widgetShowTimeLeft: checkTokens.widgetShowTimeLeft,
        widgetShowStatus: checkTokens.widgetShowStatus,
        widgetShowSpeed: checkTokens.widgetShowSpeed,
        widgetShowDataLimit: checkTokens.widgetShowDataLimit,
        widgetShowSessions: checkTokens.widgetShowSessions,
        widgetTitle: checkTokens.widgetTitle,
        widgetPlaceholder: checkTokens.widgetPlaceholder,
        token: checkTokens.token,
        slug: checkTokens.slug,
      })
      .from(checkTokens)
      .where(eq(checkTokens.ownerId, ctx.user.id))
      .limit(1);
    return row ?? null;
  }),

  // Save widget settings
  saveWidgetSettings: protectedProcedure
    .input(z.object({
      widgetEnabled: z.boolean(),
      widgetPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      widgetBgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      widgetTextColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      widgetBorderRadius: z.number().min(0).max(32),
      widgetShowPlan: z.boolean(),
      widgetShowExpiry: z.boolean(),
      widgetShowTimeLeft: z.boolean(),
      widgetShowStatus: z.boolean(),
      widgetShowSpeed: z.boolean(),
      widgetShowDataLimit: z.boolean(),
      widgetShowSessions: z.boolean(),
      widgetTitle: z.string().max(128),
      widgetPlaceholder: z.string().max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const db2 = await getDb();
      const [existing] = await db2
        .select({ id: checkTokens.id })
        .from(checkTokens)
        .where(eq(checkTokens.ownerId, ctx.user.id))
        .limit(1);
      if (!existing) {
        // Create a token record first if none exists
        const crypto = await import('crypto');
        const token = crypto.randomBytes(32).toString('hex').slice(0, 32);
        await db2.insert(checkTokens).values({
          token,
          ownerId: ctx.user.id,
          isActive: true,
          ...input,
        });
      } else {
        await db2.update(checkTokens).set({ ...input, updatedAt: new Date() }).where(eq(checkTokens.ownerId, ctx.user.id));
      }
      return { success: true };
    }),
});

// ============================================================================
// BROADCASTS ROUTER (Admin → Clients messaging)
// ============================================================================
const broadcastsRouter = router({
  // Send a broadcast (super_admin only)
  send: superAdminProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      message: z.string().min(1),
      type: z.enum(["info", "warning", "error", "success", "update"]).default("info"),
      targetType: z.enum(["all", "specific"]).default("all"),
      recipientIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await getDb();
      const { broadcasts: bTable, broadcastRecipients: brTable, users: uTable } = await import("../drizzle/schema");

      let recipientIds: number[] = [];
      if (input.targetType === "all") {
        const allClients = await drizzleDb
          .select({ id: uTable.id })
          .from(uTable)
          .where(and(eq(uTable.ownerId, ctx.user.id), eq(uTable.status, "active")));
        recipientIds = allClients.map((c: { id: number }) => c.id);
      } else if (input.targetType === "specific" && input.recipientIds?.length) {
        recipientIds = input.recipientIds;
      }

      if (recipientIds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يوجد مستلمون" });
      }

      const [result] = await drizzleDb.insert(bTable).values({
        senderId: ctx.user.id,
        title: input.title,
        message: input.message,
        type: input.type,
        targetType: input.targetType,
        recipientCount: recipientIds.length,
      });
      const broadcastId = (result as any).insertId as number;

      const batchSize = 100;
      for (let i = 0; i < recipientIds.length; i += batchSize) {
        const batch = recipientIds.slice(i, i + batchSize);
        await drizzleDb.insert(brTable).values(
          batch.map((rid: number) => ({ broadcastId, recipientId: rid, isRead: false }))
        );
      }

      return { success: true, broadcastId, recipientCount: recipientIds.length };
    }),

  // List all broadcasts sent by this admin
  list: superAdminProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const drizzleDb = await getDb();
      const { broadcasts: bTable } = await import("../drizzle/schema");

      const offset = (input.page - 1) * input.limit;
      const rows = await drizzleDb
        .select()
        .from(bTable)
        .where(eq(bTable.senderId, ctx.user.id))
        .orderBy(desc(bTable.createdAt))
        .limit(input.limit)
        .offset(offset);

      return rows;
    }),

  // Get clients list for the admin
  getClients: superAdminProcedure.query(async ({ ctx }) => {
    const drizzleDb = await getDb();
    const { users: uTable } = await import("../drizzle/schema");

    // المدير يرى جميع العملاء (role='client') بغض النظر عن ownerId
    // لأن ownerId للعملاء يكون null في هذا النظام
    const clients = await drizzleDb
      .select({ id: uTable.id, name: uTable.name, email: uTable.email, username: uTable.username, status: uTable.status })
      .from(uTable)
      .where(and(eq(uTable.role, "client"), eq(uTable.status, "active")))
      .orderBy(uTable.name);

    return clients;
  }),

  // Get my notifications (client side)
  getMyNotifications: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const drizzleDb = await getDb();
      const { broadcasts: bTable, broadcastRecipients: brTable } = await import("../drizzle/schema");

      const offset = (input.page - 1) * input.limit;
      const rows = await drizzleDb
        .select({
          id: brTable.id,
          broadcastId: brTable.broadcastId,
          isRead: brTable.isRead,
          readAt: brTable.readAt,
          receivedAt: brTable.createdAt,
          title: bTable.title,
          message: bTable.message,
          type: bTable.type,
          sentAt: bTable.createdAt,
        })
        .from(brTable)
        .innerJoin(bTable, eq(brTable.broadcastId, bTable.id))
        .where(eq(brTable.recipientId, ctx.user.id))
        .orderBy(desc(bTable.createdAt))
        .limit(input.limit)
        .offset(offset);

      return rows;
    }),

  // Get unread count (client side)
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const drizzleDb = await getDb();
    const { broadcastRecipients: brTable } = await import("../drizzle/schema");
    const { count } = await import("drizzle-orm");

    const [row] = await drizzleDb
      .select({ count: count() })
      .from(brTable)
      .where(and(
        eq(brTable.recipientId, ctx.user.id),
        eq(brTable.isRead, false)
      ));

    return { count: row?.count ?? 0 };
  }),

  // Mark as read
  markAsRead: protectedProcedure
    .input(z.object({ broadcastId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await getDb();
      const { broadcastRecipients: brTable } = await import("../drizzle/schema");

      await drizzleDb
        .update(brTable)
        .set({ isRead: true, readAt: new Date() })
        .where(and(
          eq(brTable.broadcastId, input.broadcastId),
          eq(brTable.recipientId, ctx.user.id)
        ));

      return { success: true };
    }),

  // Mark all as read
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const drizzleDb = await getDb();
    const { broadcastRecipients: brTable } = await import("../drizzle/schema");

    await drizzleDb
      .update(brTable)
      .set({ isRead: true, readAt: new Date() })
      .where(and(
        eq(brTable.recipientId, ctx.user.id),
        eq(brTable.isRead, false)
      ));

    return { success: true };
  }),

  // Delete a broadcast (admin only)
  delete: superAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await getDb();
      const { broadcasts: bTable, broadcastRecipients: brTable } = await import("../drizzle/schema");

      await drizzleDb.delete(brTable).where(eq(brTable.broadcastId, input.id));
      await drizzleDb.delete(bTable).where(and(eq(bTable.id, input.id), eq(bTable.senderId, ctx.user.id)));

      return { success: true };
    }),
});

// ============================================================================
// SYSTEM UPDATES ROUTER
// ============================================================================
const systemUpdatesRouter = router({
  // الإصدار الحالي (آخر تحديث ناجح)
  getCurrentVersion: protectedProcedure.query(async () => {
    const drizzleDb = await getDb();
    const latest = await drizzleDb
      .select()
      .from(systemUpdates)
      .where(eq(systemUpdates.status, 'success'))
      .orderBy(desc(systemUpdates.createdAt))
      .limit(1);
    return latest[0] ?? null;
  }),

  // سجل آخر 20 تحديث
  getHistory: protectedProcedure.query(async () => {
    const drizzleDb = await getDb();
    return drizzleDb
      .select()
      .from(systemUpdates)
      .orderBy(desc(systemUpdates.createdAt))
      .limit(20);
  }),

  // حالة تحديث معين
  getStatus: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const drizzleDb = await getDb();
      const result = await drizzleDb
        .select()
        .from(systemUpdates)
        .where(eq(systemUpdates.id, input.id))
        .limit(1);
      return result[0] ?? null;
    }),

  // تشغيل التحديث (owner فقط)
  triggerUpdate: protectedProcedure
    .input(z.object({ version: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المدير يمكنه تشغيل التحديث' });
      }

      const drizzleDb = await getDb();

      // إنشاء سجل التحديث
      const [insertResult] = await drizzleDb.insert(systemUpdates).values({
        version: input.version,
        status: 'running',
        triggeredBy: ctx.user.id,
        triggeredByName: ctx.user.name,
      });

      const updateId = (insertResult as any).insertId;

      // إرسال طلب للـ VPS API بشكل async (لا ننتظر)
      const vpsUrl = ENV.VPS_MANAGEMENT_URL || ENV.VPS_LEGACY_URL;
      const apiKey = ENV.VPS_LEGACY_SECRET;

      // تشغيل التحديث في الخلفية
      (async () => {
        try {
          const response = await fetch(`${vpsUrl}/api/system/update`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
            },
            body: JSON.stringify({
              version: input.version,
              updateId,
            }),
            signal: AbortSignal.timeout(300000), // 5 دقائق
          });

          if (!response.ok) {
            const errText = await response.text();
            await drizzleDb.update(systemUpdates)
              .set({ status: 'failed', errorMessage: `HTTP ${response.status}: ${errText}`, completedAt: new Date() })
              .where(eq(systemUpdates.id, updateId));
          }
          // إذا نجح، VPS API سيحدّث الـ DB مباشرة
        } catch (err: any) {
          await drizzleDb.update(systemUpdates)
            .set({ status: 'failed', errorMessage: err.message, completedAt: new Date() })
            .where(eq(systemUpdates.id, updateId));
        }
      })();

      return { updateId, status: 'running' };
    }),
});

// ============================================================================
// FEATURE FLAGS ROUTER (Phase 2C — online_sessions switch)
// ============================================================================
const featureFlagsRouter = router({
  // Get current value of USE_ONLINE_SESSIONS flag (Phase 2C Part 1: write/simultaneous-use)
  getUseOnlineSessions: protectedProcedure.query(async () => {
    const value = await getFeatureFlag_UseOnlineSessions();
    return { enabled: value };
  }),
  // Set USE_ONLINE_SESSIONS flag (owner/super_admin only)
  setUseOnlineSessions: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المدير يمكنه تغيير هذا الإعداد' });
      }
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { systemSettings } = await import('../drizzle/schema');
      const existing = await drizzleDb.select().from(systemSettings).where(eq(systemSettings.key, 'USE_ONLINE_SESSIONS')).limit(1);
      if (existing.length > 0) {
        await drizzleDb.update(systemSettings)
          .set({ value: input.enabled ? '1' : '0', updatedAt: new Date() })
          .where(eq(systemSettings.key, 'USE_ONLINE_SESSIONS'));
      } else {
        await drizzleDb.insert(systemSettings).values({
          key: 'USE_ONLINE_SESSIONS',
          value: input.enabled ? '1' : '0',
        });
      }
      // Invalidate in-memory cache so next call reads fresh value
      invalidateFeatureFlagCache();
      return { success: true, enabled: input.enabled };
    }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Phase 2C Part 2: USE_ONLINE_SESSIONS_READ — controls all active-session READ queries
  // ─────────────────────────────────────────────────────────────────────────────
  getUseOnlineSessionsRead: protectedProcedure.query(async () => {
    const value = await getFeatureFlag_UseOnlineSessionsRead();
    return { enabled: value };
  }),

  setUseOnlineSessionsRead: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المدير يمكنه تغيير هذا الإعداد' });
      }
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const { systemSettings } = await import('../drizzle/schema');
      const existing = await drizzleDb.select().from(systemSettings).where(eq(systemSettings.key, 'USE_ONLINE_SESSIONS_READ')).limit(1);
      if (existing.length > 0) {
        await drizzleDb.update(systemSettings)
          .set({ value: input.enabled ? 'true' : 'false', updatedAt: new Date() })
          .where(eq(systemSettings.key, 'USE_ONLINE_SESSIONS_READ'));
      } else {
        await drizzleDb.insert(systemSettings).values({
          key: 'USE_ONLINE_SESSIONS_READ',
          value: input.enabled ? 'true' : 'false',
        });
      }
      invalidateFeatureFlagReadCache();
      return { success: true, enabled: input.enabled };
    }),
});

// ─── AI Chat Widget Router ────────────────────────────────────────────────────
const AI_SUPPORT_SYSTEM_PROMPT_WIDGET = `أنت مساعد ذكاء اصطناعي احترافي وخبير متخصص في منصة Radius Pro لإدارة شبكات الإنترنت.لديك خبرة عميقة بكل تفاصيل النظام وتستطيع شرح أي عملية خطوة بخطوة.

== نبذة عن Radius Pro ==
منصة SaaS متكاملة لإدارة شبكات الإنترنت والمشتركين والكروت والتقارير. تدعم MikroTik و FreeRADIUS و PPPoE و Hotspot و VPN (SSTP/PPTP) ونظام فواتير ومحافظ.

== دليل العمليات خطوة بخطوة ==

── إضافة شبكة جديدة (NAS Device) ──
1. اذهب إلى قائمة الجانب → البنية التحتية → أجهزة NAS
2. اضغط على زر “إضافة جهاز”
3. أدخل اسم الجهاز وعنوان IP الخاص به
4. أدخل السر المشترك (Shared Secret) — نفس السر الموجود في إعدادات RADIUS على MikroTik
5. اختر نوع الجهاز (MikroTik)
6. اضغط حفظ — سيظهر الجهاز في القائمة
تحقق من الاتصال: اذهب للجهاز → اضغط زر “فحص الاتصال” — يجب أن يظهر أخضر.
لإعداد MikroTik: اذهب للجهاز → زر “إعداد MikroTik” واتبع التعليمات.

── إنشاء باقة/خطة جديدة (Plan) ──
1. اذهب إلى قائمة الجانب → البطاقات → الخطط
2. اضغط “إضافة خطة”
3. أدخل اسم الخطة (مثل: باقة 10 ميغا)
4. حدد السرعة: Upload / Download (مثل: 10M/10M)
5. حدد مدة الخطة: يومي / أسبوعي / شهري
6. حدد السعر والجهاز المرتبط (NAS)
7. اضغط حفظ — ستظهر الخطة في قائمة الخطط

── إنشاء كروت إنترنت (Vouchers/Cards) ──
1. اذهب إلى قائمة الجانب → البطاقات → إنشاء كروت
2. اختر الخطة المراد توليد كروت لها
3. حدد عدد الكروت (مثل: 10 كروت)
4. حدد طول اسم المستخدم وكلمة المرور
5. اضغط “توليد” — ستظهر الكروت فوراً
6. يمكنك طباعتها من زر “طباعة” أو تصديرها PDF

── إضافة مشترك جديد (Subscriber) ──
1. اذهب إلى قائمة الجانب → المشتركين
2. اضغط “إضافة مشترك”
3. أدخل اسم المشترك ورقم الهاتف والبريد
4. اختر الخطة والجهاز المرتبط
5. اضغط حفظ — سيتم إنشاء حساب PPPoE تلقائياً

── إعداد VPN ──
1. اذهب إلى قائمة الجانب → VPN → إدارة VPN
2. اضغط “إضافة مستخدم VPN”
3. أدخل اسم المستخدم وكلمة المرور
4. اختر البروتوكول (SSTP أو PPTP)
5. اضغط حفظ — سيحصل المستخدم على بيانات الاتصال

── إضافة موزع (Reseller) ──
1. اذهب إلى قائمة الجانب → الموزعين
2. اضغط “إضافة موزع”
3. أدخل البيانات وحدد الصلاحيات
4. اضغط حفظ — سيتلقى الموزع بيانات دخوله عبر البريد

── شحن رصيد المحفظة ──
1. اذهب إلى الفواتير والمحفظة → شحن رصيد
2. أدخل المبلغ وطريقة الدفع
3. أرسل طلب الشحن — سيراجعه المدير ويضيف الرصيد

── تجديد كرت منتهية ──
1. اذهب إلى البطاقات → ابحث عن الكرت
2. اضغط على الكرت → تجديد
3. اختر مدة التجديد
4. اضغط تأكيد — سيتم تجديد الكرت فوراً

── عرض التقارير ──
1. اذهب إلى قائمة الجانب → التقارير
2. اختر نوع التقرير: مبيعات / استخدام / مشتركين
3. حدد الفترة الزمنية
4. اضغط عرض — ستظهر البيانات فوراً

── مشاكل شائعة وحلولها ──
مشكلة انقطاع الإنترنت:
- تحقق من حالة الكرت → تحقق من جهاز NAS → أعد تشغيل الراوتر
مشكلة عدم الاتصال:
- تحقق من إعدادات PPPoE/Hotspot → تحقق من Shared Secret → تحقق من IP جهاز NAS
مشكلة بطء السرعة:
- تحقق من الخطة → تحقق من عدد المتصلين بنفس الكرت
مشكلة انتهاء الباقة:
- اذهب للبطاقات → جدد الكرت أو اشترِ كرتاً جديدة
مشكلة الدفع:
- اذهب للفواتير → طلب تحويل بنكي

== قواعد الرد ==
- ارد دائماً بالعربية
- كن ودياً ومتخصصاً
- قدّم خطوات عملية واضحة ومرقمة
- لا تطلب معلومات حساسة ككلمات المرور
- الرد يجب أن يكون مختصراً ومفيداً (لا يتجاوز 5-6 جمل)
- لا تذكر أبداً عبارات مثل: تواصل مع الإدارة، أبلغ الدعم، راجع الدعم الفني، أو أي عبارة مشابهة

== تعليمات عرض نتائج فحص الكرت ==
عند استخدام check_voucher اعرض النتيجة بشكل مختصر ومحايد:

قاعدة أساسية: لا تستخدم أبداً كلمات خلل أو تنبيه أو مشكلة أو تواصل مع الإدارة.

إذا found: true:
اعرض فقط:
• الحالة: [displayStatus]
• الخطة: [planName أو غير محدد] | السرعة: [rateLimit أو غير محدد]
• تاريخ الانتهاء: [expiresAt أو غير محدد]
• الاستهلاك: [تحويل totalSessionTimeHours: أقل من 1 = اضرب بـ 60 واعرض بالدقائق، أكثر من 1 = اعرض بالساعات، null = لم يُستخدم بعد] من [usageBudgetHours أو غير محدد]

إذا found: false:
أخبر بهدوء أن هذا الكرت غير موجود، واطلب التحقق من صحة الرقم.

ملاحظات:
- null = اكتب غير محدد
- لا تكتب كلمات: خلل أو تنبيه أو تواصل مع الإدارة

أعد JSON فقط: { "reply": "...", "needs_human": false }
needs_human يجب أن يكون دائماً false — لا تضعه true أبداً في ردود فحص الكروت.
`;

const aiChatRouter = router({
  chat: publicProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).max(20),
      // userId اختياري — يُرسل فقط إذا كان المستخدم مسجلاً
      userId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // ── Resolve ownerId for Tenant Isolation ──────────────────────────────
      // الأولوية: ctx.user (session cookie) > input.userId > null
      const sessionUser = (ctx as any).user as { id: number; role: string; ownerId?: number | null } | null | undefined;
      let ownerId: number | null = null;

      if (sessionUser) {
        // المستخدم مسجل — استخدم ownerId الصحيح حسب الدور
        if (sessionUser.role === 'owner' || sessionUser.role === 'super_admin') {
          ownerId = sessionUser.id;
        } else if (sessionUser.ownerId) {
          ownerId = sessionUser.ownerId;
        } else {
          ownerId = sessionUser.id;
        }
      }

      const isAuthenticated = ownerId !== null;

      const conversation = input.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // ── System Prompt ─────────────────────────────────────────────────────
      const systemPrompt = isAuthenticated
        ? AI_SUPPORT_SYSTEM_PROMPT_WIDGET +
          `\n\n== صلاحيات الجلسة الحالية ==\nالمستخدم مسجل الدخول. يمكنك استخدام أداة check_voucher لفحص حالة الكروت.\nعند سؤال المستخدم عن كرت أو اشتراك أو username، استخدم check_voucher مباشرة.`
        : AI_SUPPORT_SYSTEM_PROMPT_WIDGET +
          `\n\n== ملاحظة ==\nالمستخدم غير مسجل الدخول. لا يمكنك فحص الكروت. اطلب منه تسجيل الدخول أولاً إذا أراد فحص كرته.`;

      // ── Tool Calling Loop (فقط للمستخدمين المسجلين) ──────────────────────
      const MAX_TOOL_ROUNDS = 3;
      type LLMMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_call_id?: string; name?: string };
      const llmMessages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversation,
      ];

      let finalReply = '';
      let finalNeedsHuman = false;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const aiResponse = await invokeLLM({
          messages: llmMessages,
          // أدوات متاحة فقط للمستخدمين المسجلين
          ...(isAuthenticated ? { tools: AI_TOOLS, tool_choice: 'auto' } : {}),
          // response_format فقط إذا لا توجد أدوات أو في الجولة الأخيرة
          ...(!isAuthenticated ? {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'ai_chat_reply',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    reply: { type: 'string' },
                    needs_human: { type: 'boolean' },
                  },
                  required: ['reply', 'needs_human'],
                  additionalProperties: false,
                },
              },
            },
          } : {}),
        });

        const choice = aiResponse.choices[0];
        const message = choice.message;

        // ── إذا الـ LLM طلب استخدام أداة ──
        if (message.tool_calls && message.tool_calls.length > 0 && isAuthenticated) {
          // أضف رد الـ LLM للمحادثة
          llmMessages.push({
            role: 'assistant',
            content: typeof message.content === 'string' ? (message.content || '') : '',
            ...(message.tool_calls ? { tool_calls: message.tool_calls } as any : {}),
          } as any);

          // نفّذ كل أداة مطلوبة
          for (const toolCall of message.tool_calls) {
            let toolArgs: Record<string, unknown> = {};
            try {
              toolArgs = JSON.parse(toolCall.function.arguments);
            } catch {
              toolArgs = {};
            }

            const toolResult = await executeTool(
              toolCall.function.name,
              toolArgs,
              ownerId!
            );

            // أضف نتيجة الأداة للمحادثة
            llmMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: toolResult,
            });
          }
          // استمر في الحلقة ليرد الـ LLM بناءً على نتائج الأدوات
          continue;
        }

        // ── الـ LLM أعطى رداً نهائياً ──
        const rawContent = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

        if (isAuthenticated) {
          // للمستخدمين المسجلين: الرد نص عادي (لأن tool_calling لا يدعم response_format معاً)
          // نحاول parse JSON إذا كان الرد JSON
          try {
            const parsed = JSON.parse(rawContent);
            finalReply = parsed.reply || rawContent;
            finalNeedsHuman = parsed.needs_human ?? false;
          } catch {
            finalReply = rawContent;
            finalNeedsHuman = false;
          }
        } else {
          // للزوار: الرد JSON schema
          try {
            const parsed = JSON.parse(rawContent);
            finalReply = parsed.reply || rawContent;
            finalNeedsHuman = parsed.needs_human ?? false;
          } catch {
            finalReply = rawContent;
            finalNeedsHuman = false;
          }
        }
        break;
      }

      return {
        reply: finalReply || 'شكراً لتواصلك. سيتم تحويلك لفريق الدعم.',
        needs_human: finalNeedsHuman,
      };
    }),
});

// ============================================================================
// MAIN ROUTER
// ============================================================================
export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  users: usersRouter,
  subAdmin: subAdminRouter,
  defaultPlans: defaultPlansRouter,
  plans: plansRouter,
  plansNas: plansNasRouter,
  saasPlans: saasPlansRouter,
  nas: nasRouter,
  wallet: walletRouter,
  billing: billingRouter,
  vouchers: vouchersRouter,
  invoices: invoicesRouter,
  subscriptions: subscriptionsRouter,
  tenantSubscriptions: tenantSubscriptionsRouter,
  tickets: ticketsRouter,
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
  sessions: sessionsRouter,
  templates: templatesRouter,
  settings: settingsRouter,
  staleSessions: staleSessionsRouter,
  reports: reportsRouter,
  internalNotifications: internalNotificationsRouter,
  subscribers: subscribersRouter,
  vpn: vpnRouter,
  audit: auditRouter,
  logs: logsRouter,
  diagnostics: diagnosticsRouter,
  radius: radiusOperationsRouter,
  vpsManagement: vpsManagementRouter,
  vpnManagementV2: vpnManagementV2Router,
  featureAccess: featureAccessRouter,
  analytics: analyticsRouter,
  timezone: timezoneRouter,
  salesDashboard: salesDashboardRouter,
  backup: backupRouter,
  site: siteRouter,
  permissionGroups: permissionGroupsRouter,
  permissionPlans: permissionPlansRouter,
  userPermissionOverrides: userPermissionOverridesRouter,
  userMenuItemOverrides: userMenuItemOverridesRouter,
  userEffectivePermissions: userEffectivePermissionsRouter,
  bankTransfer: bankTransferRouter,
  winbox: winboxRouter,
  checkTokens: checkTokensRouter,
  broadcasts: broadcastsRouter,
  networkMonitor: networkMonitorRouter,
  portForwarding: portForwardingRouter,
  notificationChannels: channelNotificationsRouter,
  smsCards: smsCardsRouter,
  security: securityRouter,
  systemUpdates: systemUpdatesRouter,
  cronJobs: cronJobsRouter,
  store: storeRouter,
  featureFlags: featureFlagsRouter,
  speedSchedules: speedSchedulesRouter,
  feedback: feedbackRouter,
  aiChat: aiChatRouter,
});
export type AppRouter = typeof appRouter;
