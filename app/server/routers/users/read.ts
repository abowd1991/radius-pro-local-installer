import * as saasPlansDb from "../../db/saasPlans";
import { protectedProcedure, publicProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../../db";
import * as walletDb from "../../db/wallet";
import * as planDb from "../../db/plans";
import * as nasDb from "../../db/nas";
import * as cardDb from "../../db/vouchers";
import * as invoiceDb from "../../db/invoices";
import * as subscriptionDb from "../../db/subscriptions";
import * as notificationDb from "../../db/notifications";
import * as templateDb from "../../db/cardTemplates";
import * as radiusSubscribers from "../../db/radiusSubscribers";
import * as vpnApi from "../../services/vpnApiService";
import * as accountingService from "../../services/accountingService";
import * as sessionMonitor from "../../services/sessionMonitor";
import * as coaService from "../../services/coaService";
import * as multiChannelNotification from "../../services/multiChannelNotificationService";
import * as tweetsmsService from "../../services/tweetsmsService";
import * as smsDb from "../../db/sms";
import * as mikrotikApi from "../../services/mikrotikApi";
import * as authService from "../../services/authService";
import { storagePut } from "../../storage";
import { generateCardsPDFHTML, generateCardsCSV, saveBatchPDF, saveBatchPDFWithTemplate, generateCardsPDFHTMLWithTemplate } from "../../services/pdfGenerator";
import { logAudit } from "../../services/auditLogService";
import { notifyOwnerEvent, notifySubscriberEvent } from "../../services/notificationService";
import { getDb } from "../../db";
import { radcheck, radreply, nasDevices, radiusCards, radacct, users, wallets, walletLedger, cardBatches, checkTokens, plans, notificationChannels, siteSettings, systemUpdates, userSessions } from "../../../drizzle/schema";
import { eq, and, isNull, sql, desc, or, count, gte, like, inArray, gt } from "drizzle-orm";
import { getTenantContext, getEffectiveOwnerId, canSeeAllData } from "../../tenant-isolation";
import * as permissionsService from "../../services/permissionsService";
import { ENV } from "../../_core/env";
import * as vpnIpPool from "../../db/vpnIpPool";
import * as freeradiusService from "../../services/freeradiusService";
import * as twoPhaseProvisioning from "../../services/twoPhaseProvisioningService";
import { autoFixMissingHuntgroups } from '../../v2/V2ServiceBridge';
import { generateCardsV2 } from "../../db/generateCardsV2";
import { importCardsFromCsv, parseCsvCards } from "../../db/importCardsFromCsv";
import { parseFileToRows, mapRowsToCards } from "../../db/parseFileCards";
import { isAdmin } from "../../_core/roles";
import { getActivationCodeDisplay } from "../../domains/users/AccountActivationPolicy";


export const list = superAdminProcedure
    .input(z.object({
      role: z.enum(['super_admin', 'reseller', 'client']).optional(),
      status: z.enum(['active', 'suspended', 'inactive']).optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) return { users: [], total: 0 };
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      // Build conditions
      const conditions: any[] = [];
      if (input?.role) conditions.push(eq(users.role, input.role));
      if (input?.status) conditions.push(eq(users.status, input.status));
      if (input?.search) {
        const s = `%${input.search}%`;
        conditions.push(or(like(users.name, s), like(users.email, s), like(users.username, s), like(users.phone, s)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const countResult = await drizzleDb.select({ count: sql<number>`count(*)` }).from(users).where(whereClause);
      const total = Number(countResult[0]?.count || 0);

      // Get users with pagination
      const userRows = await drizzleDb.select().from(users).where(whereClause)
        .orderBy(desc(users.createdAt)).limit(limit).offset(offset);

      // Get wallet balances for all users in one query
      const userIds = userRows.map((u: any) => u.id);
      let balanceMap: Map<number, number> = new Map();
      if (userIds.length > 0) {
        const walletRows = await drizzleDb.select({ userId: wallets.userId, balance: wallets.balance })
          .from(wallets).where(inArray(wallets.userId, userIds));
        for (const w of walletRows) balanceMap.set(w.userId, Number(w.balance || 0));
      }

      const enriched = userRows.map((u: any) => ({
        ...u,
        balance: balanceMap.get(u.id) ?? 0,
        activationCode: getActivationCodeDisplay({
          verified: u.emailVerified,
          code: u.emailVerificationCode,
          expires: u.emailVerificationExpires,
        }),
      }));

      return { users: enriched, total, page, totalPages: Math.ceil(total / limit) };
    });

export const getById = protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const user = await db.getUserById(input.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      
      if (ctx.user.role === 'client' && ctx.user.id !== input.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      if (ctx.user.role === 'reseller' && user.resellerId !== ctx.user.id && ctx.user.id !== input.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      
      return user;
    });

export const getMyClients = resellerProcedure.query(async ({ ctx }) => {
    if (isAdmin(ctx.user.role)) {
      return db.getUsersByRole('client');
    }
    return db.getUsersByResellerId(ctx.user.id);
  });

export const getClientsWithSubscription = superAdminProcedure
    .input(z.object({
      status: z.enum(['trial', 'active', 'expired', 'suspended', 'all']).default('all'),
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input }) => {
      const allUsers = await db.getAllUsers();
      let clients = allUsers.filter((u: any) => u.role !== 'super_admin');
      
      // Balance-based subscription (no more accountStatus filter)
      
      // Search
      if (input?.search) {
        const search = input.search.toLowerCase();
        clients = clients.filter((c: any) => 
          c.name?.toLowerCase().includes(search) ||
          c.email?.toLowerCase().includes(search) ||
          c.username?.toLowerCase().includes(search)
        );
      }
      
      // Get plan names for each client
      const plans = await saasPlansDb.getAllPlans(false);
      const planMap = new Map(plans.map((p: any) => [p.id, p.name]));
      
      // Balance-based subscription (no more planName)
      const clientsWithPlan = clients;
      
      // Pagination
      const page = input?.page || 1;
      const limit = input?.limit || 20;
      const start = (page - 1) * limit;
      const paginated = clientsWithPlan.slice(start, start + limit);
      
      return {
        clients: paginated,
        total: clientsWithPlan.length,
        page,
        totalPages: Math.ceil(clientsWithPlan.length / limit),
      };
    });

  // Activate client account
export const getClientDetails = superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get NAS count
      const nasCount = await drizzleDb.select({ count: sql<number>`count(*)` })
        .from(nasDevices)
        .where(eq(nasDevices.ownerId, input.userId));
      
      // Get cards count - use raw SQL for simplicity
      const cardsResult = await drizzleDb.execute(
        sql`SELECT COUNT(*) as count FROM radius_cards WHERE createdBy = ${input.userId}`
      );
      const cardsCount = (cardsResult as any)[0]?.[0]?.count || 0;
      
      // Get active sessions — Phase 2C: online_sessions is the primary realtime source
      const sessionsResult = await drizzleDb.execute(
        sql`SELECT COUNT(*) as count FROM online_sessions WHERE username IN (SELECT username FROM radius_cards WHERE createdBy = ${input.userId})`
      );
      const sessionsCount = (sessionsResult as any)[0]?.[0]?.count || 0;
      
      // Balance-based subscription (no more plan)
      const plan = null;
      
      return {
        user,
        stats: {
          nasCount: Number(nasCount[0]?.count || 0),
          cardsCount: Number(cardsCount),
          activeSessions: Number(sessionsCount),
        },
        plan,
      };
    });

  // Change user role (Super Admin only)
export const getActivityTimeline = superAdminProcedure
    .input(z.object({
      userId: z.number(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get audit logs for this user
      const logs = await drizzleDb.execute(
        sql`SELECT * FROM audit_logs WHERE userId = ${input.userId} ORDER BY createdAt DESC LIMIT ${input.limit}`
      );
      
      return { activities: logs };
    });

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

// ─── getOnlineClients: العملاء المتصلون حالياً (lastActivity < 5 دقائق) ──────
// يعمل لجميع الأدوار - كل مستخدم يرى فقط عملاءه المتصلين (tenant isolation)
export const getOnlineClients = protectedProcedure.query(async ({ ctx }) => {
  const drizzleDb = await getDb();
  if (!drizzleDb) return { onlineUserIds: [] as number[], onlineCount: 0 };

  const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 دقائق
  const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS);

  // جلب user IDs التي لها جلسة نشطة في آخر 5 دقائق
  const activeSessions = await drizzleDb
    .select({ userId: userSessions.userId })
    .from(userSessions)
    .where(
      and(
        isNull(userSessions.revokedAt),
        gt(userSessions.lastActivityAt, cutoff),
        gt(userSessions.expiresAt, new Date()),
      )
    );

  const seen = new Set<number>();
  const allOnlineIds: number[] = [];
  for (const s of activeSessions) {
    if (!seen.has(s.userId)) {
      seen.add(s.userId);
      allOnlineIds.push(s.userId);
    }
  }

  // Tenant isolation: super_admin/owner يرى الكل، غيره يرى فقط عملاءه
  const tenantCtx = getTenantContext(ctx.user);
  let onlineUserIds = allOnlineIds;

  if (!canSeeAllData(tenantCtx)) {
    // جلب IDs عملاء هذا المستخدم فقط
    const effectiveOwner = getEffectiveOwnerId(tenantCtx);
    const myClients = await drizzleDb
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.ownerId, effectiveOwner),
          inArray(users.role, ['client', 'client_admin', 'client_staff'])
        )
      );
    const myClientIds = new Set(myClients.map((u: { id: number }) => u.id));
    onlineUserIds = allOnlineIds.filter(id => myClientIds.has(id));
  }

  return { onlineUserIds, onlineCount: onlineUserIds.length };
});
