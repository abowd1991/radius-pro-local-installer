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
import { radcheck, radreply, nasDevices, radiusCards, radacct, users, wallets, walletLedger, cardBatches, checkTokens, plans, notificationChannels, siteSettings, systemUpdates } from "../../../drizzle/schema";
import { eq, and, isNull, sql, desc, or, count, gte, like, inArray } from "drizzle-orm";
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
import { validateActivationDelivery } from "../../domains/users/AccountActivationPolicy";


function generateRandomPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export const updateStatus = superAdminProcedure
    .input(z.object({
      userId: z.number(),
      status: z.enum(['active', 'suspended', 'inactive']),
    }))
    .mutation(async ({ input }) => {
      return { success: true };
    });

  // Get all clients with subscription details (Super Admin)
export const activateClient = superAdminProcedure
    .input(z.object({
      userId: z.number(),
      planId: z.number().optional(),
      durationDays: z.number().default(30),
    }))
    .mutation(async ({ input }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const now = new Date();
      const endDate = new Date(now.getTime() + input.durationDays * 24 * 60 * 60 * 1000);
      
      // Update user status (balance-based subscription)
      await drizzleDb.update(users)
        .set({
          status: 'active',
        })
        .where(eq(users.id, input.userId));
      
      // Enable all NAS devices
      await drizzleDb.execute(
        sql`UPDATE nas SET is_active = 1 WHERE ownerId = ${input.userId}`
      );
      
      // Activate daily billing
      const { activateDailyBilling } = await import("../../services/billingService");
      await activateDailyBilling(input.userId, input.userId);
      
      console.log(`[Client Control] Activated user ${input.userId} for ${input.durationDays} days with daily billing`);
      return { success: true, message: 'Client activated successfully with billing enabled' };
    });

  // Suspend client account
export const suspendClient = superAdminProcedure
    .input(z.object({
      userId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      // Balance-based subscription (no more accountStatus field)
      // Suspend handled by setting wallet balance to 0
      
      // Disable all NAS devices
      await drizzleDb.execute(
        sql`UPDATE nas SET is_active = 0 WHERE ownerId = ${input.userId}`
      );
      
      // Block all cards (add Auth-Type := Reject)
      // Get user's cards and block them
      const userCardsResult = await drizzleDb.execute(
        sql`SELECT username FROM radius_cards WHERE createdBy = ${input.userId}`
      );
      const userCards = (userCardsResult as any)[0] || [];
      for (const card of userCards) {
        await drizzleDb.execute(
          sql`INSERT INTO radcheck (username, attribute, op, value) VALUES (${card.username}, 'Auth-Type', ':=', 'Reject') ON DUPLICATE KEY UPDATE value = 'Reject'`
        );
      }
      
      console.log(`[Client Control] Suspended user ${input.userId}`);
      return { success: true, message: 'Client suspended successfully' };
    });

  // Extend subscription
export const extendSubscription = superAdminProcedure
    .input(z.object({
      userId: z.number(),
      days: z.number().min(1),
    }))
    .mutation(async ({ input }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      
      // Balance-based subscription: no more subscription extension by days
      // Use wallet balance instead
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Subscription extension is no longer supported. Please add balance to wallet instead.' });
    });

  // Change client plan
export const changeClientPlan = superAdminProcedure
    .input(z.object({
      userId: z.number(),
      planId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get permission plan details
      const { getAllPermissionPlans } = await import('../../db-permission-plans');
      const plans = await getAllPermissionPlans();
      const plan = plans.find((p: any) => p.id === input.planId);
      if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Permission plan not found' });
      
      await drizzleDb.update(users)
        .set({ permissionPlanId: input.planId })
        .where(eq(users.id, input.userId));
      
      console.log(`[Client Control] Changed user ${input.userId} permission plan to ${plan.name}`);
      return { success: true, planName: plan.name };
    });

  // Get client details with stats
export const changeRole = superAdminProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(['super_admin', 'reseller', 'client']),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      
      // Prevent changing own role
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot change your own role' });
      }
      
      // Only allow promoting to super_admin if current user is super_admin
      if (input.role === 'super_admin' && !isAdmin(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only super admin can promote to super admin' });
      }
      
      await db.updateUserRole(input.userId, input.role);
      console.log(`[User Role] Super admin ${ctx.user.id} changed user ${input.userId} role to ${input.role}`);
      return { success: true, message: `Role changed to ${input.role}` };
    });

  // Delete user and ALL related data (comprehensive cascade delete)
export const deleteUser = superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      // Prevent deleting owner or super_admin
      if ((user as any).role === 'owner' || (user as any).role === 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete admin users' });
      }

      // Prevent self-deletion
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete yourself' });
      }

      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const uid = input.userId;
      console.log(`[User Delete] Starting comprehensive delete for user ${uid} by admin ${ctx.user.id}`);

      // ── STEP 1: Get card usernames (needed for RADIUS tables) ──────────────
      const userCardsResult = await drizzleDb.execute(
        sql`SELECT username FROM radius_cards WHERE createdBy = ${uid}`
      );
      const usernames = ((userCardsResult as any)[0] as any[])
        .map((c: any) => c.username)
        .filter((u: string) => u && u.trim() !== '');

      // ── STEP 2: Get NAS IDs (needed for allocated_vpn_ips) ────────────────
      const nasResult = await drizzleDb.execute(
        sql`SELECT id FROM nas WHERE ownerId = ${uid}`
      );
      const nasIds = ((nasResult as any)[0] as any[]).map((n: any) => n.id);

      // ── STEP 3: Get store IDs (needed for store sub-tables) ───────────────
      const storesResult = await drizzleDb.execute(
        sql`SELECT id FROM stores WHERE ownerId = ${uid}`
      );
      const storeIds = ((storesResult as any)[0] as any[]).map((s: any) => s.id);

      // ── STEP 4: Get network router IDs (needed for router_down_log) ───────
      const routersResult = await drizzleDb.execute(
        sql`SELECT id FROM network_routers WHERE ownerId = ${uid}`
      );
      const routerIds = ((routersResult as any)[0] as any[]).map((r: any) => r.id);

      // ── STEP 5: Delete RADIUS tables for user's cards ─────────────────────
      if (usernames.length > 0) {
        const usernameList = sql.join(usernames.map(u => sql`${u}`), sql`, `);
        await drizzleDb.execute(sql`DELETE FROM radcheck WHERE username IN (${usernameList})`);
        await drizzleDb.execute(sql`DELETE FROM radreply WHERE username IN (${usernameList})`);
        await drizzleDb.execute(sql`DELETE FROM radusergroup WHERE username IN (${usernameList})`);
        // radacct: keep for billing history but remove if needed
        // await drizzleDb.execute(sql`DELETE FROM radacct WHERE username IN (${usernameList})`);
      }

      // ── STEP 6: Delete card batches ───────────────────────────────────────
      await drizzleDb.execute(sql`DELETE FROM card_batches WHERE createdBy = ${uid}`);

      // ── STEP 7: Delete cards ──────────────────────────────────────────────
      await drizzleDb.execute(sql`DELETE FROM radius_cards WHERE createdBy = ${uid}`);

      // ── STEP 8: Delete card templates ────────────────────────────────────
      await drizzleDb.execute(sql`DELETE FROM card_templates WHERE resellerId = ${uid}`);

      // ── STEP 9: Delete subscribers and their subscriptions ───────────────
      const subscribersResult = await drizzleDb.execute(
        sql`SELECT id FROM subscribers WHERE ownerId = ${uid}`
      );
      const subscriberIds = ((subscribersResult as any)[0] as any[]).map((s: any) => s.id);
      if (subscriberIds.length > 0) {
        const subIdList = sql.join(subscriberIds.map(id => sql`${id}`), sql`, `);
        await drizzleDb.execute(sql`DELETE FROM subscriber_subscriptions WHERE subscriberId IN (${subIdList})`);
        // subscriber_notification_links uses userId (not subscriberId)
        // Covered by STEP 15 below via userId = uid
      }
      await drizzleDb.execute(sql`DELETE FROM subscribers WHERE ownerId = ${uid}`);

      // ── STEP 10: Delete NAS-related data ─────────────────────────────────
      if (nasIds.length > 0) {
        const nasIdList = sql.join(nasIds.map(id => sql`${id}`), sql`, `);
        await drizzleDb.execute(sql`DELETE FROM allocated_vpn_ips WHERE nasId IN (${nasIdList})`);
      }
      // nas_alerts uses ownerId (not nasId)
      await drizzleDb.execute(sql`DELETE FROM nas_alerts WHERE ownerId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM nas WHERE ownerId = ${uid}`);
      // Delete NAS huntgroup entries from radgroupcheck
      await drizzleDb.execute(sql`DELETE FROM radgroupcheck WHERE groupname = ${'owner_' + uid}`);
      await drizzleDb.execute(sql`DELETE FROM radhuntgroup WHERE groupname = ${'owner_' + uid}`);

      // ── STEP 11: Delete plans ─────────────────────────────────────────────
      await drizzleDb.execute(sql`DELETE FROM plans WHERE ownerId = ${uid}`);

      // ── STEP 12: Delete VPN connections and logs ──────────────────────────
      // vpn_connections and vpn_logs are linked to nasId (not userId directly)
      if (nasIds.length > 0) {
        const nasIdList2 = sql.join(nasIds.map(id => sql`${id}`), sql`, `);
        // Delete vpn_logs first (references vpn_connections)
        await drizzleDb.execute(sql`DELETE FROM vpn_logs WHERE nasId IN (${nasIdList2})`);
        await drizzleDb.execute(sql`DELETE FROM vpn_connections WHERE nasId IN (${nasIdList2})`);
      }

      // ── STEP 13: Delete store and all store sub-tables ────────────────────
      if (storeIds.length > 0) {
        const storeIdList = sql.join(storeIds.map(id => sql`${id}`), sql`, `);
        await drizzleDb.execute(sql`DELETE FROM store_phone_pins WHERE storeId IN (${storeIdList})`);
        await drizzleDb.execute(sql`DELETE FROM store_orders WHERE storeId IN (${storeIdList})`);
        await drizzleDb.execute(sql`DELETE FROM store_products WHERE storeId IN (${storeIdList})`);
      }
      await drizzleDb.execute(sql`DELETE FROM stores WHERE ownerId = ${uid}`);

      // ── STEP 14: Delete network routers and monitoring ────────────────────
      if (routerIds.length > 0) {
        const routerIdList = sql.join(routerIds.map(id => sql`${id}`), sql`, `);
        await drizzleDb.execute(sql`DELETE FROM network_router_down_log WHERE routerId IN (${routerIdList})`);
      }
      await drizzleDb.execute(sql`DELETE FROM network_routers WHERE ownerId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM network_monitor_settings WHERE ownerId = ${uid}`);

      // ── STEP 15: Delete notification channels and preferences ─────────────
      await drizzleDb.execute(sql`DELETE FROM notification_channels WHERE ownerId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM notification_preferences WHERE ownerId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM subscriber_notification_links WHERE userId = ${uid}`);

      // ── STEP 16: Delete SMS data ──────────────────────────────────────────
      await drizzleDb.execute(sql`DELETE FROM sms_contacts WHERE ownerId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM sms_send_log WHERE ownerId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM sms_balance_log WHERE ownerId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM sms_logs WHERE userId = ${uid}`);
      // sms_templates is a shared system table with no userId column — skip per-user deletion
      await drizzleDb.execute(sql`DELETE FROM sms_notification_tracking WHERE userId = ${uid}`);

      // ── STEP 17: Delete wallet and financial data ─────────────────────────
      await drizzleDb.execute(sql`DELETE FROM wallet_ledger WHERE userId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM transactions WHERE userId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM invoices WHERE userId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM bank_transfer_requests WHERE userId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM payments WHERE userId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM wallets WHERE userId = ${uid}`);

      // ── STEP 18: Delete support tickets and chat messages ─────────────────
      const ticketsResult = await drizzleDb.execute(
        sql`SELECT id FROM support_tickets WHERE userId = ${uid}`
      );
      const ticketIds = ((ticketsResult as any)[0] as any[]).map((t: any) => t.id);
      if (ticketIds.length > 0) {
        const ticketIdList = sql.join(ticketIds.map((id: any) => sql`${id}`), sql`, `);
        await drizzleDb.execute(sql`DELETE FROM chat_messages WHERE ticketId IN (${ticketIdList})`);
      }
      await drizzleDb.execute(sql`DELETE FROM support_tickets WHERE userId = ${uid}`);

      // ── STEP 19: Delete notifications ────────────────────────────────────
      await drizzleDb.execute(sql`DELETE FROM notifications WHERE userId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM internal_notifications WHERE userId = ${uid}`);

      // ── STEP 20: Delete permissions and access control ───────────────────
      await drizzleDb.execute(sql`DELETE FROM user_permission_overrides WHERE userId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM feature_access_control WHERE userId = ${uid}`);

      // ── STEP 21: Delete SaaS subscription ────────────────────────────────
      await drizzleDb.execute(sql`DELETE FROM saas_subscriptions WHERE userId = ${uid}`);

      // ── STEP 22: Delete check tokens (password reset, etc.) ───────────────
      await drizzleDb.execute(sql`DELETE FROM check_tokens WHERE ownerId = ${uid}`);

      // ── STEP 23: Delete reseller profile (if reseller) ───────────────────
      await drizzleDb.execute(sql`DELETE FROM reseller_profiles WHERE userId = ${uid}`);

      // ── STEP 24: Delete tenant subscriptions ─────────────────────────────
      await drizzleDb.execute(sql`DELETE FROM tenant_subscriptions WHERE tenantId = ${uid}`);

      // ── STEP 25: Delete activity and audit logs ───────────────────────────
      await drizzleDb.execute(sql`DELETE FROM activity_logs WHERE userId = ${uid}`);
      await drizzleDb.execute(sql`DELETE FROM audit_logs WHERE userId = ${uid}`);

      // ── STEP 26: Delete ip_pool_config created by user ───────────────────
      await drizzleDb.execute(sql`DELETE FROM ip_pool_config WHERE created_by = ${uid}`);

      // ── STEP 27: Finally delete the user ─────────────────────────────────
      await drizzleDb.delete(users).where(eq(users.id, uid));

      console.log(`[User Delete] ✅ Comprehensive delete completed for user ${uid} by admin ${ctx.user.id}`);
      return { success: true, message: 'تم حذف العميل وجميع بياناته بنجاح' };
    });

  // Create client by admin (Super Admin only)
export const createClientByAdmin = superAdminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8).optional(), // Optional - will generate if not provided
      role: z.enum(['client', 'reseller']).default('client'),
      phone: z.string().trim().min(7).optional(),
      activationDelivery: z.enum(['none', 'email', 'sms', 'both']).default('none'),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Check if email already exists
      const existingUser = await drizzleDb.select().from(users).where(eq(users.email, input.email));
      if (existingUser.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already exists' });
      }
      
      // Generate password if not provided
      const bcrypt = await import('bcryptjs');
      const plainPassword = input.password || generateRandomPassword();
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      
      // Generate username from email
      const username = input.email.split('@')[0] + '_' + Math.random().toString(36).substring(2, 6);
      
      // Get default permission plan for role
      const permissionDb = await import('../../db-permission-plans');
      const defaultPlan = await permissionDb.getDefaultPlanForRole(input.role);
      
      // Create user (balance-based subscription)
      const result = await drizzleDb.insert(users).values({
        name: input.name,
        email: input.email,
        username,
        password: hashedPassword,
        role: input.role,
        permissionPlanId: defaultPlan?.id || null,
        phone: input.phone || null,
        emailVerified: input.activationDelivery === 'none',
        onboardingCompleted: true, // Admin-created users skip onboarding
      });
      
      const userId = result.insertId ? parseInt(String(result.insertId), 10) : 0;
      
      // NAS Isolation: create radgroupcheck for new user automatically
      if (userId) {
        try {
          const groupname = `owner_${userId}`;
          await drizzleDb.execute(
            sql`INSERT IGNORE INTO radgroupcheck (groupname, attribute, op, value)
                VALUES (${groupname}, 'Huntgroup-Name', '==', ${groupname})`
          );
          console.log(`[User Create] ✅ radgroupcheck created for user ${userId} → group ${groupname}`);
        } catch (err) {
          console.error(`[User Create] ❌ Failed to create radgroupcheck for user ${userId}:`, err);
        }
      }

      let activation: { success: boolean; delivered: string[]; error?: string } | null = null;
      if (input.activationDelivery !== 'none' && userId) {
        const validationError = validateActivationDelivery(input.activationDelivery, { email: input.email, phone: input.phone });
        activation = validationError
          ? { success: false, delivered: [], error: validationError }
          : await authService.sendAccountActivation(userId, input.activationDelivery);
      }
      
      console.log(`[User Create] Admin ${ctx.user.id} created ${input.role} user ${userId} (${input.email})`);
      
      return { 
        success: true, 
        userId: userId || 0,
        username,
        email: input.email,
        password: plainPassword, // Return plain password to show to admin
        activation,
        message: 'Client created successfully' 
      };
    });

export const sendClientActivation = superAdminProcedure
  .input(z.object({
    userId: z.number().int().positive(),
    delivery: z.enum(['email', 'sms', 'both']),
  }))
  .mutation(async ({ input, ctx }) => {
    const target = await db.getUserById(input.userId);
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    if (target.role === 'owner' || target.role === 'super_admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot send activation for an admin account' });
    }
    const result = await authService.sendAccountActivation(input.userId, input.delivery);
    if (!result.success) throw new TRPCError({ code: 'BAD_REQUEST', message: result.error || 'Activation delivery failed' });
    await logAudit({
      userId: ctx.user.id,
      userRole: ctx.user.role,
      action: 'account_activation_sent',
      targetType: 'user',
      targetId: String(input.userId),
      details: { delivery: input.delivery, delivered: result.delivered },
      result: 'success',
    });
    return result;
  });

  // Change client password by admin (Super Admin only)
export const changeClientPassword = superAdminProcedure
    .input(z.object({
      userId: z.number(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      
      // Prevent changing owner/super_admin password
      if ((user as any).role === 'owner' || (user as any).role === 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot change admin password' });
      }
      
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Hash new password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(input.newPassword, 10);
      
      // Update password
      await drizzleDb.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, input.userId));
      
      // Log audit
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'user_password_change',
        targetType: 'user',
        targetId: input.userId.toString(),
        details: { message: `Admin changed password for user ${input.userId}` },
        result: 'success',
      });
      
      console.log(`[User Password] Admin ${ctx.user.id} changed password for user ${input.userId}`);
      return { success: true, message: 'Password changed successfully' };
    });

  // Bulk delete users (Super Admin only)
export const bulkDelete = superAdminProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get users to verify they're not admins
      const usersToDelete = await drizzleDb.select().from(users).where(sql`id IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`);
      
      // Check if any are admins or self
      const forbidden = usersToDelete.some((u: any) => 
        u.role === 'owner' || u.role === 'super_admin' || u.id === ctx.user.id
      );
      
      if (forbidden) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete admin users or yourself' });
      }
      
      // Delete users and their data
      for (const userId of input.ids) {
        // Get usernames first
        const userCards = await drizzleDb.execute(
          sql`SELECT username FROM radius_cards WHERE createdBy = ${userId}`
        );
        const usernames = (userCards as any[]).map((card: any) => card.username).filter((u: string) => u && u.trim() !== '');
        
        // Delete radcheck/radreply/radusergroup entries
        if (usernames.length > 0) {
          await drizzleDb.execute(
            sql`DELETE FROM radcheck WHERE username IN (${sql.join(usernames.map(u => sql`${u}`), sql`, `)})`
          );
          await drizzleDb.execute(
            sql`DELETE FROM radreply WHERE username IN (${sql.join(usernames.map(u => sql`${u}`), sql`, `)})`
          );
          await drizzleDb.execute(
            sql`DELETE FROM radusergroup WHERE username IN (${sql.join(usernames.map(u => sql`${u}`), sql`, `)})`
          );
        }
        
        // Delete card_batches before radius_cards (FK constraint)
        await drizzleDb.execute(sql`DELETE FROM card_batches WHERE createdBy = ${userId}`);
        // Delete user's data
        await drizzleDb.execute(sql`DELETE FROM radius_cards WHERE createdBy = ${userId}`);
        // Delete RADIUS group entries for this owner
        await drizzleDb.execute(sql`DELETE FROM radgroupcheck WHERE groupname = ${'owner_' + userId}`);
        await drizzleDb.execute(sql`DELETE FROM radhuntgroup WHERE groupname = ${'owner_' + userId}`);
        await drizzleDb.execute(sql`DELETE FROM nas WHERE ownerId = ${userId}`);
        await drizzleDb.execute(sql`DELETE FROM plans WHERE ownerId = ${userId}`);
        await drizzleDb.execute(sql`DELETE FROM audit_logs WHERE userId = ${userId}`);
        
        // Delete user
        await drizzleDb.delete(users).where(eq(users.id, userId));
      }
      
      console.log(`[Bulk Delete] Admin ${ctx.user.id} deleted ${input.ids.length} users`);
      return { success: true, count: input.ids.length };
    });

  // Bulk suspend users (Super Admin only)
export const bulkSuspend = superAdminProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Update status to suspended
      await drizzleDb.update(users)
        .set({ status: 'suspended' })
        .where(sql`id IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`);
      
      console.log(`[Bulk Suspend] Admin ${ctx.user.id} suspended ${input.ids.length} users`);
      return { success: true, count: input.ids.length };
    });

  // Bulk activate users (Super Admin only)
export const bulkActivate = superAdminProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Update status to active
      await drizzleDb.update(users)
        .set({ status: 'active' })
        .where(sql`id IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`);
      
      console.log(`[Bulk Activate] Admin ${ctx.user.id} activated ${input.ids.length} users`);
      return { success: true, count: input.ids.length };
    });

  // Update client by admin (Super Admin only)
export const updateClientByAdmin = superAdminProcedure
    .input(z.object({
      userId: z.number(),
      name: z.string().optional(),
      username: z.string().min(3).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      status: z.enum(['active', 'suspended', 'inactive']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { userId, ...updateData } = input;
      
      // Check if user exists
      const user = await db.getUserById(userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      
      // Prevent updating owner/super_admin
      if ((user as any).role === 'owner' || (user as any).role === 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot update admin users' });
      }
      
      // Check if email is already taken by another user
      if (updateData.email) {
        const existingEmail = await drizzleDb.select().from(users).where(eq(users.email, updateData.email));
        if (existingEmail.length > 0 && existingEmail[0].id !== userId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Email already taken' });
        }
      }
      // Check if username is already taken by another user
      if (updateData.username) {
        const existingUsername = await drizzleDb.select().from(users).where(eq(users.username, updateData.username));
        if (existingUsername.length > 0 && existingUsername[0].id !== userId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Username already taken' });
        }
      }
      
      // Update user
      await drizzleDb.update(users)
        .set(updateData)
        .where(eq(users.id, userId));
      
      console.log(`[User Update] Admin ${ctx.user.id} updated user ${userId}`);
      return { success: true, message: 'Client updated successfully' };
    });

// Force activate a client account (Super Admin only)
export const forceActivateClient = superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      await drizzleDb.update(users)
        .set({ emailVerified: true, emailVerificationCode: null, emailVerificationExpires: null })
        .where(eq(users.id, input.userId));
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'user_force_activate',
        targetType: 'user',
        targetId: input.userId.toString(),
        details: { message: `Admin force-activated account for user ${input.userId}` },
        result: 'success',
      });
      return { success: true, message: 'Account activated successfully' };
    });

// Get verification code for a client (Super Admin only)
export const getClientVerificationCode = superAdminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const result = await drizzleDb
        .select({ emailVerificationCode: users.emailVerificationCode, emailVerified: users.emailVerified, emailVerificationExpires: users.emailVerificationExpires })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!result[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return {
        code: result[0].emailVerificationCode || null,
        verified: result[0].emailVerified,
        expires: result[0].emailVerificationExpires,
      };
    });
