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


export const updateProfile = protectedProcedure
    .input(z.object({
      username: z.string().min(3),
      email: z.string().email(),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Check if username is already taken by another user
      const existingUser = await drizzleDb.select().from(users).where(eq(users.username, input.username));
      if (existingUser.length > 0 && existingUser[0].id !== ctx.user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Username already taken' });
      }
      
      // Check if email is already taken by another user
      const existingEmail = await drizzleDb.select().from(users).where(eq(users.email, input.email));
      if (existingEmail.length > 0 && existingEmail[0].id !== ctx.user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Email already taken' });
      }
      
      await drizzleDb.update(users)
        .set({
          username: input.username,
          email: input.email,
        })
        .where(eq(users.id, ctx.user.id));
      
      console.log(`[User Profile] User ${ctx.user.id} updated profile`);
      return { success: true, message: 'Profile updated successfully' };
    });

  // Change password (any authenticated user)
export const changePassword = protectedProcedure
    .input(z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get current user with password
      const [user] = await drizzleDb.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user || !user.password) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      
      // Verify current password
      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(input.currentPassword, user.password);
      if (!isValid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' });
      }
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(input.newPassword, 10);
      
      // Update password
      await drizzleDb.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, ctx.user.id));
      
      console.log(`[User Password] User ${ctx.user.id} changed password`);
      return { success: true, message: 'Password changed successfully' };
    });