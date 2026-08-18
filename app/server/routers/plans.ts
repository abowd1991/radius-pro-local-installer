import { protectedProcedure, publicProcedure, superAdminProcedure, resellerProcedure, clientProcedure, activeSubscriptionProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import * as walletDb from "../db/wallet";
import * as planDb from "../db/plans";
import * as nasDb from "../db/nas";
import * as cardDb from "../db/vouchers";
import * as invoiceDb from "../db/invoices";
import * as subscriptionDb from "../db/subscriptions";
import * as notificationDb from "../db/notifications";
import * as templateDb from "../db/cardTemplates";
import * as radiusSubscribers from "../db/radiusSubscribers";
import * as vpnApi from "../services/vpnApiService";
import * as accountingService from "../services/accountingService";
import * as sessionMonitor from "../services/sessionMonitor";
import * as coaService from "../services/coaService";
import * as multiChannelNotification from "../services/multiChannelNotificationService";
import * as tweetsmsService from "../services/tweetsmsService";
import * as smsDb from "../db/sms";
import * as mikrotikApi from "../services/mikrotikApi";
import * as authService from "../services/authService";
import { storagePut } from "../storage";
import { generateCardsPDFHTML, generateCardsCSV, saveBatchPDF, saveBatchPDFWithTemplate, generateCardsPDFHTMLWithTemplate } from "../services/pdfGenerator";
import { logAudit } from "../services/auditLogService";
import { notifyOwnerEvent, notifySubscriberEvent } from "../services/notificationService";
import { getDb } from "../db";
import { radcheck, radreply, nasDevices, radiusCards, radacct, users, wallets, walletLedger, cardBatches, checkTokens, plans, notificationChannels, siteSettings, systemUpdates, radhuntgroup, speedSchedules } from "../../drizzle/schema";
import { eq, and, isNull, sql, desc, or, count, gte, like, inArray } from "drizzle-orm";
import { getTenantContext, getEffectiveOwnerId, canSeeAllData } from "../tenant-isolation";
import * as permissionsService from "../services/permissionsService";
import { ENV } from "../_core/env";
import * as vpnIpPool from "../db/vpnIpPool";
import * as freeradiusService from "../services/freeradiusService";
import * as twoPhaseProvisioning from "../services/twoPhaseProvisioningService";
import { autoFixMissingHuntgroups } from '../v2/V2ServiceBridge';
import { generateCardsV2 } from "../db/generateCardsV2";
import { importCardsFromCsv, parseCsvCards } from "../db/importCardsFromCsv";
import { parseFileToRows, mapRowsToCards } from "../db/parseFileCards";
import { isAdmin } from "../_core/roles";



export const plansRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = getTenantContext(ctx.user);
    return planDb.getPlansByTenant(tenantContext);
  }),
  listWithStats: protectedProcedure.query(async ({ ctx }) => {
    const tenantContext = getTenantContext(ctx.user);
    const plansList = await planDb.getPlansByTenant(tenantContext);
    const drizzleDb = await getDb();
    if (!drizzleDb || plansList.length === 0) return plansList.map((p: any) => ({ ...p, cardCount: 0, hasActiveSchedule: false }));
    const planIds = plansList.map((p: any) => p.id);
    // Card counts
    const counts = await drizzleDb
      .select({ planId: radiusCards.planId, count: sql<number>`COUNT(*)` })
      .from(radiusCards)
      .where(sql`planId IN (${sql.join(planIds.map((id: number) => sql`${id}`), sql`, `)})`)
      .groupBy(radiusCards.planId);
    const countMap = new Map(counts.map((c: any) => [c.planId, Number(c.count)]));
    // Active speed schedules
    const activeSchedules = await drizzleDb
      .select({ planId: speedSchedules.planId })
      .from(speedSchedules)
      .where(and(sql`planId IN (${sql.join(planIds.map((id: number) => sql`${id}`), sql`, `)})`, eq(speedSchedules.isActive, true)))
      .groupBy(speedSchedules.planId);
    const scheduleSet = new Set(activeSchedules.map((s: any) => s.planId));
    return plansList.map((p: any) => ({
      ...p,
      cardCount: countMap.get(p.id) ?? 0,
      hasActiveSchedule: scheduleSet.has(p.id),
    }));
  }),
  duplicate: activeSubscriptionProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await planDb.getPlanById(input.id);
      if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      const tenantContext = getTenantContext(ctx.user);
      const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
      if (!canSeeAllData(tenantContext) && plan.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = plan as any;
      return planDb.createPlan({
        ...rest,
        name: `${plan.name} (نسخة)`,
        nameAr: plan.nameAr ? `${plan.nameAr} (نسخة)` : undefined,
        status: 'inactive',
        ownerId: ctx.user.id,
      });
    }),
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const plan = await planDb.getPlanById(input.id);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      const tenantContext = getTenantContext(ctx.user);
      const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
      if (!canSeeAllData(tenantContext) && plan.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return plan;
    }),
  getByIdWithStats: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const plan = await planDb.getPlanById(input.id);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      const tenantContext = getTenantContext(ctx.user);
      const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
      if (!canSeeAllData(tenantContext) && plan.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const drizzleDb = await getDb();
      if (!drizzleDb) return { ...plan, totalCards: 0, activeCards: 0, usedCards: 0, expiredCards: 0, unusedCards: 0 };
      const statsRows = await drizzleDb.execute(
        sql`SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
          SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used_count,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_count,
          SUM(CASE WHEN status = 'unused' THEN 1 ELSE 0 END) as unused_count
        FROM radius_cards WHERE planId = ${input.id}`
      );
      const rows = ((statsRows as any)[0] as any[]) || (statsRows as any[]);
      const s = rows[0] || {};
      return {
        ...plan,
        totalCards: Number(s.total ?? 0),
        activeCards: Number(s.active_count ?? 0),
        usedCards: Number(s.used_count ?? 0),
        expiredCards: Number(s.expired_count ?? 0),
        unusedCards: Number(s.unused_count ?? 0),
      };
    }),
  create: activeSubscriptionProcedure
    .input(z.object({
      name: z.string().min(1),
      nameAr: z.string().optional(),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      downloadSpeed: z.number().min(1),
      uploadSpeed: z.number().min(1),
      dataLimit: z.number().int().positive().nullable().optional(),
      validityType: z.enum(['minutes', 'hours', 'days']).default('days'),
      validityValue: z.number().default(30),
      validityStartFrom: z.enum(['first_login', 'card_creation']).default('first_login'),
      price: z.string(),
      resellerPrice: z.string(),
      currency: z.string().optional(),
      simultaneousUse: z.number().default(1),
      sessionTimeout: z.number().optional(),
      idleTimeout: z.number().optional(),
      poolName: z.string().optional(),
      mikrotikRateLimit: z.string().optional(),
      mikrotikAddressPool: z.string().trim().min(1).max(50).nullable().optional(),
      serviceType: z.enum(['pppoe', 'hotspot', 'vpn', 'all']).default('all'),
      autoDisconnect: z.boolean().default(false),
      restrictedNasId: z.number().optional(),
      restrictedNasIds: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await getDb();
      let currency = input.currency;
      if (!currency && drizzleDb) {
        const [owner] = await drizzleDb.select({ preferredCurrency: users.preferredCurrency }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
        currency = owner?.preferredCurrency || 'USD';
      }
      return planDb.createPlan({ ...input, currency: currency || 'USD', ownerId: ctx.user.id });
    }),
  update: activeSubscriptionProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      nameAr: z.string().optional(),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      downloadSpeed: z.number().optional(),
      uploadSpeed: z.number().optional(),
      dataLimit: z.number().int().positive().nullable().optional(),
      validityType: z.enum(['minutes', 'hours', 'days']).optional(),
      validityValue: z.number().optional(),
      price: z.string().optional(),
      resellerPrice: z.string().optional(),
      status: z.enum(['active', 'inactive']).optional(),
      simultaneousUse: z.number().optional(),
      poolName: z.string().optional(),
      mikrotikAddressPool: z.string().trim().min(1).max(50).nullable().optional(),
      autoDisconnect: z.boolean().optional(),
      restrictedNasId: z.number().nullable().optional(),
      restrictedNasIds: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const plan = await planDb.getPlanById(input.id);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      const tenantContext = getTenantContext(ctx.user);
      const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
      if (!canSeeAllData(tenantContext) && plan.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const shouldSyncNetworkAttributes = input.dataLimit !== undefined || input.mikrotikAddressPool !== undefined;
      const updatedPlan = shouldSyncNetworkAttributes
        ? await planDb.updatePlanAndSyncNetworkAttributes(input.id, input)
        : await planDb.updatePlan(input.id, input);
      console.log(`[Plans] update called: id=${input.id}, downloadSpeed=${input.downloadSpeed}, uploadSpeed=${input.uploadSpeed}, sim=${input.simultaneousUse}`);
      const needsSync =
        input.autoDisconnect !== undefined ||
        input.simultaneousUse !== undefined ||
        input.downloadSpeed !== undefined ||
        input.uploadSpeed !== undefined ||
        (input as any).mikrotikRateLimit !== undefined;
      console.log(`[Plans] needsSync=${needsSync}`);
      if (needsSync) {
        const drizzleDb = await getDb();
        console.log(`[Plans] drizzleDb=${!!drizzleDb}`);
        if (drizzleDb) {
          const finalPlan = await planDb.getPlanById(input.id);
          console.log(`[Plans] finalPlan=${!!finalPlan}`);
          if (finalPlan) {
            const baseSimUse = finalPlan.simultaneousUse ?? 1;
            const effectiveSim = finalPlan.autoDisconnect ? Math.max(2, baseSimUse) : baseSimUse;

            // Build rate limit value from plan
            let rateLimitValue: string | null = null;
            if (finalPlan.mikrotikRateLimit) {
              rateLimitValue = finalPlan.mikrotikRateLimit;
            } else if (finalPlan.downloadSpeed || finalPlan.uploadSpeed) {
              const dl = finalPlan.downloadSpeed ? `${finalPlan.downloadSpeed}k` : '0';
              const ul = finalPlan.uploadSpeed ? `${finalPlan.uploadSpeed}k` : '0';
              rateLimitValue = `${ul}/${dl}`;
            }

            // Count cards for logging
            const countResult = await drizzleDb.execute(
              sql`SELECT COUNT(*) as cnt FROM radius_cards WHERE planId = ${input.id} AND status != 'expired'`
            );
            const countRows = ((countResult as any)[0] as any[]) || (countResult as any[]);
            const cardCount = Number((countRows[0] as any)?.cnt ?? 0);
            console.log(`[Plans] cardCount=${cardCount}, rateLimitValue=${rateLimitValue}, effectiveSim=${effectiveSim}`);
            if (cardCount > 0) {
              try {
              // Bulk UPDATE Simultaneous-Use in radcheck (single query)
              await drizzleDb.execute(
                sql`INSERT INTO radcheck (username, attribute, op, value)
                  SELECT rc.username, 'Simultaneous-Use', ':=', ${String(effectiveSim)}
                  FROM radius_cards rc
                  WHERE rc.planId = ${input.id} AND rc.status != 'expired'
                  ON DUPLICATE KEY UPDATE value = ${String(effectiveSim)}`
              );

              // Bulk UPDATE Port-Limit in radreply (single query)
              await drizzleDb.execute(
                sql`INSERT INTO radreply (username, attribute, op, value)
                  SELECT rc.username, 'Port-Limit', ':=', ${String(effectiveSim)}
                  FROM radius_cards rc
                  WHERE rc.planId = ${input.id} AND rc.status != 'expired'
                  ON DUPLICATE KEY UPDATE value = ${String(effectiveSim)}`
              );

              // Bulk UPDATE Mikrotik-Rate-Limit in radreply (single query)
              if (rateLimitValue) {
                await drizzleDb.execute(
                  sql`INSERT INTO radreply (username, attribute, op, value)
                    SELECT rc.username, 'Mikrotik-Rate-Limit', ':=', ${rateLimitValue}
                    FROM radius_cards rc
                    WHERE rc.planId = ${input.id} AND rc.status != 'expired'
                    ON DUPLICATE KEY UPDATE value = ${rateLimitValue}`
                );
              }

              console.log(`[Plans] Bulk synced plan ${input.id}: Simultaneous-Use=${effectiveSim}, Rate-Limit=${rateLimitValue ?? 'unchanged'} for ${cardCount} cards (3 bulk queries)`);
              } catch (syncErr: any) {
                console.error(`[Plans] Bulk sync ERROR: ${syncErr?.message}`, syncErr);
              }
            }

            // ============================================================
            // Bulk UPDATE subscribers (PPPoE / بروندباند) for this plan
            // ============================================================
            try {
              const subCountResult = await drizzleDb.execute(
                sql`SELECT COUNT(*) as cnt FROM subscribers WHERE planId = ${input.id} AND status = 'active'`
              );
              const subRows = ((subCountResult as any)[0] as any[]) || (subCountResult as any[]);
              const subCount = Number((subRows[0] as any)?.cnt ?? 0);
              console.log(`[Plans] subscribers to sync: ${subCount}`);

              if (subCount > 0) {
                // Bulk UPDATE Simultaneous-Use in radcheck for subscribers
                await drizzleDb.execute(
                  sql`INSERT INTO radcheck (username, attribute, op, value)
                    SELECT s.username, 'Simultaneous-Use', ':=', ${String(effectiveSim)}
                    FROM subscribers s
                    WHERE s.planId = ${input.id} AND s.status = 'active'
                    ON DUPLICATE KEY UPDATE value = ${String(effectiveSim)}`
                );

                // Bulk UPDATE Port-Limit in radreply for subscribers
                await drizzleDb.execute(
                  sql`INSERT INTO radreply (username, attribute, op, value)
                    SELECT s.username, 'Port-Limit', ':=', ${String(effectiveSim)}
                    FROM subscribers s
                    WHERE s.planId = ${input.id} AND s.status = 'active'
                    ON DUPLICATE KEY UPDATE value = ${String(effectiveSim)}`
                );

                // Bulk UPDATE Mikrotik-Rate-Limit in radreply for subscribers
                if (rateLimitValue) {
                  await drizzleDb.execute(
                    sql`INSERT INTO radreply (username, attribute, op, value)
                      SELECT s.username, 'Mikrotik-Rate-Limit', ':=', ${rateLimitValue}
                      FROM subscribers s
                      WHERE s.planId = ${input.id} AND s.status = 'active'
                      ON DUPLICATE KEY UPDATE value = ${rateLimitValue}`
                  );
                }

                console.log(`[Plans] Bulk synced plan ${input.id} for ${subCount} subscribers (PPPoE): Simultaneous-Use=${effectiveSim}, Rate-Limit=${rateLimitValue ?? 'unchanged'}`);
              }
            } catch (subSyncErr: any) {
              console.error(`[Plans] Subscribers bulk sync ERROR: ${subSyncErr?.message}`, subSyncErr);
            }
          }
        }
      }
      return updatedPlan;
    }),
  applyNasRestriction: activeSubscriptionProcedure
    .input(z.object({
      planId: z.number(),
      nasIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
      const plan = await planDb.getPlanById(input.planId);
      if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      const tenantContext = getTenantContext(ctx.user);
      const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
      if (!canSeeAllData(tenantContext) && plan.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      let resolvedNasIds: number[] = input.nasIds || [];
      if (resolvedNasIds.length === 0) {
        if (plan.restrictedNasIds) {
          try { resolvedNasIds = JSON.parse(plan.restrictedNasIds as string); } catch { resolvedNasIds = []; }
        } else if (plan.restrictedNasId) {
          resolvedNasIds = [plan.restrictedNasId];
        }
      }
      if (resolvedNasIds.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No NAS restriction configured for this plan' });
      // radhuntgroup and inArray already imported at top of file
      const nasResults = await drizzleDb.select({ id: nasDevices.id, nasname: nasDevices.nasname })
        .from(nasDevices)
        .where(and(inArray(nasDevices.id, resolvedNasIds), eq(nasDevices.ownerId, plan.ownerId), eq(nasDevices.status, 'active')));
      if (nasResults.length !== resolvedNasIds.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'All NAS devices must be active and belong to the plan owner' });
      const huntGroupName = `HG_plan_${input.planId}`;
      const nasIps = nasResults.map((n: { id: number; nasname: string }) => n.nasname);
      await drizzleDb.delete(radhuntgroup).where(eq(radhuntgroup.groupname, huntGroupName));
      await drizzleDb.insert(radhuntgroup).values(
        nasIps.map((ip: string) => ({ groupname: huntGroupName, nasipaddress: ip }))
      );
      const cards = await drizzleDb
        .select({ username: radiusCards.username })
        .from(radiusCards)
        .where(and(
          eq(radiusCards.planId, input.planId),
          sql`${radiusCards.status} IN ('active', 'unused')`
        ));
      // مصدر واحد للشرط، يمنع التكرارات القديمة.
      await drizzleDb.execute(sql`DELETE FROM radgroupcheck WHERE groupname = ${huntGroupName} AND attribute = 'Huntgroup-Name'`);
      await drizzleDb.execute(sql`INSERT INTO radgroupcheck (groupname, attribute, op, value)
        VALUES (${huntGroupName}, 'Huntgroup-Name', '==', ${huntGroupName})`);
      if (cards.length === 0) return { success: true, updated: 0, huntGroupName, nasCount: nasIps.length };
      const usernames = cards.map((c: { username: string }) => c.username);
      // Batch Processing: 500 cards per batch — handles 9000+ cards in ~2-5 seconds instead of minutes
      const BATCH_SIZE = 500;
      for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
        const batch = usernames.slice(i, i + BATCH_SIZE);
        // الطريقة الصحيحة: استخدم radusergroup بدلاً من radcheck لـ Huntgroup-Name
        // 1. احذف أي Huntgroup-Name قديم من radcheck (legacy)
        await drizzleDb.delete(radcheck)
          .where(and(
            inArray(radcheck.username, batch),
            eq(radcheck.attribute, 'Huntgroup-Name')
          ));
        // 2. احذف أي NAS-IP-Address قديم من radcheck (legacy)
        await drizzleDb.delete(radcheck)
          .where(and(
            inArray(radcheck.username, batch),
            eq(radcheck.attribute, 'NAS-IP-Address')
          ));
        // 3. احذف أي مجموعة قديمة من radusergroup (owner_X أو plan_X)
        await drizzleDb.execute(
          sql`DELETE FROM radusergroup WHERE username IN (${sql.join(batch.map((u: string) => sql`${u}`), sql`, `)}) AND groupname != ${huntGroupName}`
        );
        // 4. أضف HG_plan_X في radusergroup كمجموعة وحيدة
        await drizzleDb.execute(
          sql`INSERT INTO radusergroup (username, groupname, priority)
              VALUES ${sql.join(batch.map((u: string) => sql`(${u}, ${huntGroupName}, 1)`), sql`, `)}
              ON DUPLICATE KEY UPDATE groupname = ${huntGroupName}`
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await planDb.updatePlan(input.planId, {
        restrictedNasIds: JSON.stringify(resolvedNasIds),
        restrictedNasId: resolvedNasIds.length === 1 ? resolvedNasIds[0] : null,
      } as any);
      console.log(`[Plans] Applied NAS restriction HG=${huntGroupName} to ${usernames.length} cards in plan ${input.planId}`);
      return { success: true, updated: usernames.length, huntGroupName, nasCount: nasIps.length };
    }),
  removeNasRestriction: activeSubscriptionProcedure
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB not available' });
      const plan = await planDb.getPlanById(input.planId);
      if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      const tenantContext = getTenantContext(ctx.user);
      const effectiveOwnerId = getEffectiveOwnerId(tenantContext);
      if (!canSeeAllData(tenantContext) && plan.ownerId !== effectiveOwnerId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      const huntGroupName = `HG_plan_${input.planId}`;
      // احذف radhuntgroup لـ HG_plan_X
      await drizzleDb.delete(radhuntgroup).where(eq(radhuntgroup.groupname, huntGroupName));
      // احذف radgroupcheck لـ HG_plan_X
      await drizzleDb.execute(
        sql`DELETE FROM radgroupcheck WHERE groupname = ${huntGroupName}`
      );
      // جلب الكروت مع معرفة owner_id لكل كرت
      const cards = await drizzleDb
        .select({ username: radiusCards.username, createdBy: radiusCards.createdBy })
        .from(radiusCards)
        .where(and(
          eq(radiusCards.planId, input.planId),
          sql`${radiusCards.status} IN ('active', 'unused')`
        ));
      let updated = 0;
      if (cards.length > 0) {
        // Batch Processing: 500 cards per batch — handles 9000+ cards in ~2-5 seconds instead of minutes
        const BATCH_SIZE = 500;
        for (let i = 0; i < cards.length; i += BATCH_SIZE) {
          const batch = cards.slice(i, i + BATCH_SIZE);
          const batchUsernames = batch.map((c: { username: string }) => c.username);
          // 1. احذف أي Huntgroup-Name قديم من radcheck (legacy)
          await drizzleDb.delete(radcheck)
            .where(and(
              inArray(radcheck.username, batchUsernames),
              eq(radcheck.attribute, 'Huntgroup-Name')
            ));
          // 2. احذف أي NAS-IP-Address قديم من radcheck (legacy)
          await drizzleDb.delete(radcheck)
            .where(and(
              inArray(radcheck.username, batchUsernames),
              eq(radcheck.attribute, 'NAS-IP-Address')
            ));
          // 3. نقل كل كرت من HG_plan_X إلى owner_X في radusergroup
          for (const card of batch) {
            const ownerGroupName = `owner_${card.createdBy}`;
            await drizzleDb.execute(
              sql`INSERT INTO radusergroup (username, groupname, priority)
                  VALUES (${card.username}, ${ownerGroupName}, 1)
                  ON DUPLICATE KEY UPDATE groupname = ${ownerGroupName}`
            );
          }
          updated += batch.length;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await planDb.updatePlan(input.planId, {
        restrictedNasIds: null,
        restrictedNasId: null,
      } as any);
      console.log(`[Plans] Removed NAS restriction from plan ${input.planId}, cleared ${updated} cards`);
      return { success: true, updated, huntGroupName };
    }),
  delete: activeSubscriptionProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await planDb.getPlanById(input.id);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      if (!isAdmin(ctx.user.role) && plan.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      // ── Guard: prevent deletion if plan has linked cards ──
      const drizzleDb = await getDb();
      if (drizzleDb) {
        const countRows = await drizzleDb
          .select({ cnt: sql<number>`COUNT(*)` })
          .from(radiusCards)
          .where(eq(radiusCards.planId, input.id));
        const cardCount = Number((countRows[0] as any)?.cnt ?? 0);
        if (cardCount > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `لا يمكن حذف الباقة لأن هناك ${cardCount} كرت مرتبطة بها. احذف الكروت أولاً ثم احذف الباقة.`,
          });
        }
      }
      return planDb.deletePlan(input.id);
    }),
  listAllWithOwner: superAdminProcedure
    .input(z.object({ clientId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) return [];
      const uTable = users;
      const rows = await drizzleDb
        .select({
          id: plans.id,
          name: plans.name,
          nameAr: plans.nameAr,
          downloadSpeed: plans.downloadSpeed,
          uploadSpeed: plans.uploadSpeed,
          price: plans.price,
          resellerPrice: plans.resellerPrice,
          currency: plans.currency,
          validityValue: plans.validityValue,
          validityType: plans.validityType,
          dataLimit: plans.dataLimit,
          status: plans.status,
          simultaneousUse: plans.simultaneousUse,
          autoDisconnect: plans.autoDisconnect,
          poolName: plans.poolName,
          ownerId: plans.ownerId,
          createdAt: plans.createdAt,
          ownerName: uTable.name,
          ownerEmail: uTable.email,
          ownerUsername: uTable.username,
        })
        .from(plans)
        .leftJoin(uTable, eq(uTable.id, plans.ownerId))
        .where(input.clientId ? sql`${plans.ownerId} = ${input.clientId}` : sql`1=1`)
        .orderBy(uTable.name, desc(plans.createdAt));
      if (rows.length === 0) return rows.map((r: any) => ({ ...r, cardCount: 0 }));
      const counts = await drizzleDb
        .select({ planId: radiusCards.planId, count: sql<number>`COUNT(*)` })
        .from(radiusCards)
        .where(sql`planId IN (${sql.join(rows.map((r: any) => sql`${r.id}`), sql`, `)})`)
        .groupBy(radiusCards.planId);
      const countMap = new Map(counts.map((c: any) => [c.planId, Number(c.count)]));
      return rows.map((r: any) => ({ ...r, cardCount: countMap.get(r.id) ?? 0 }));
    }),
  getNasReport: superAdminProcedure
    .query(async ({ ctx }) => {
      const drizzleDb = await getDb();
      if (!drizzleDb) return [];
      const uTable = users;
      const restrictedPlans = await drizzleDb
        .select({
          id: plans.id,
          name: plans.name,
          nameAr: plans.nameAr,
          restrictedNasId: plans.restrictedNasId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          restrictedNasIds: (plans as any).restrictedNasIds,
          ownerId: plans.ownerId,
          ownerName: uTable.name,
          ownerEmail: uTable.email,
          status: plans.status,
        })
        .from(plans)
        .leftJoin(uTable, eq(uTable.id, plans.ownerId))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where(sql`(${ (plans as any).restrictedNasIds } IS NOT NULL OR ${plans.restrictedNasId} IS NOT NULL)`)
        .orderBy(uTable.name, plans.name);
      if (restrictedPlans.length === 0) return [];
      const planIds = restrictedPlans.map((p: any) => p.id);
      const counts = await drizzleDb
        .select({ planId: radiusCards.planId, count: sql<number>`COUNT(*)` })
        .from(radiusCards)
        .where(sql`planId IN (${sql.join(planIds.map((id: number) => sql`${id}`), sql`, `)})`)
        .groupBy(radiusCards.planId);
      const countMap = new Map(counts.map((c: any) => [c.planId, Number(c.count)]));
      const nasList = await drizzleDb.select().from(nasDevices);
      const nasMap = new Map(nasList.map((n: any) => [n.id, n]));
      return restrictedPlans.map((p: any) => {
        let nasIds: number[] = [];
        if (p.restrictedNasIds) {
          try { nasIds = JSON.parse(p.restrictedNasIds); } catch { nasIds = []; }
        } else if (p.restrictedNasId) {
          nasIds = [p.restrictedNasId];
        }
        const nasNames = nasIds.map((id: number) => {
          const nas = nasMap.get(id);
          const nasAny = nas as any;
          return nasAny ? (nasAny.shortname || nasAny.nasname || `NAS #${id}`) : `NAS #${id}`;
        });
        return {
          ...p,
          nasIds,
          nasNames,
          cardCount: countMap.get(p.id) ?? 0,
          huntGroupName: `HG_plan_${p.id}`,
        };
      });
    }),
});
