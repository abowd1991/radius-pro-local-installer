/**
 * Plans NAS Restriction Router
 * Separated from plansRouter to avoid TypeScript inference depth limit
 */
import { activeSubscriptionProcedure, superAdminProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as planDb from "../db/plans";
import { getDb } from "../db";
import { radcheck, nasDevices, radiusCards, plans, users, radhuntgroup } from "../../drizzle/schema";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { getTenantContext, getEffectiveOwnerId, canSeeAllData } from "../tenant-isolation";

export const plansNasRouter = router({
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
      const BATCH_SIZE = 500;
      for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
        const batch = usernames.slice(i, i + BATCH_SIZE);
        // الطريقة الصحيحة: radusergroup بدلاً من radcheck لـ Huntgroup-Name
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

  getNasReport: superAdminProcedure
    .query(async () => {
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
