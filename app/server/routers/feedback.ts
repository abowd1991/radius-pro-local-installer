import { router, protectedProcedure } from "../_core/trpc.js";
import { getDb } from "../db.js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  feedbackCampaigns,
  feedbackCategories,
  feedbackResponses,
  feedbackResponseCategories,
  feedbackAnalytics,
} from "../../drizzle/schema.js";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

// ─── helpers ────────────────────────────────────────────────────────────────

function nowMs() {
  return Date.now();
}

// admin guard — super_admin أو owner
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "super_admin" && ctx.user.role !== "owner") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

// ─── router ─────────────────────────────────────────────────────────────────

export const feedbackRouter = router({

  // ── Public/User: جلب الحملة النشطة ──────────────────────────────────────
  getActiveCampaign: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const now = nowMs();

    const [campaign] = await db
      .select()
      .from(feedbackCampaigns)
      .where(
        and(
          eq(feedbackCampaigns.isActive, true),
          lte(feedbackCampaigns.startAt, now),
          sql`(${feedbackCampaigns.endAt} IS NULL OR ${feedbackCampaigns.endAt} > ${now})`
        )
      )
      .orderBy(desc(feedbackCampaigns.priority), desc(feedbackCampaigns.createdAt))
      .limit(1);

    if (!campaign) return null;

    const [existing] = await db
      .select()
      .from(feedbackResponses)
      .where(
        and(
          eq(feedbackResponses.campaignId, campaign.id),
          eq(feedbackResponses.userId, ctx.user.id)
        )
      )
      .limit(1);

    if (existing && (existing.rating !== null || existing.dismissed)) {
      return null;
    }

    const categories = await db
      .select()
      .from(feedbackCategories)
      .where(eq(feedbackCategories.campaignId, campaign.id))
      .orderBy(feedbackCategories.sortOrder);

    return { campaign, categories, existingResponse: existing ?? null };
  }),

  // ── تسجيل Analytics ──────────────────────────────────────────────────────
  trackEvent: protectedProcedure
    .input(z.object({
      campaignId: z.number(),
      event: z.enum(["viewed", "snoozed", "dismissed", "submitted"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db.insert(feedbackAnalytics).values({
        campaignId: input.campaignId,
        userId:     ctx.user.id,
        event:      input.event,
        createdAt:  nowMs(),
      });
      return { ok: true };
    }),

  // ── إرسال التقييم ────────────────────────────────────────────────────────
  submit: protectedProcedure
    .input(z.object({
      campaignId:  z.number(),
      rating:      z.number().min(1).max(10).optional(),
      categoryIds: z.array(z.number()).optional(),
      comment:     z.string().max(2000).optional(),
      device:      z.string().max(100).optional(),
      browser:     z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const now = nowMs();

      const [existing] = await db
        .select()
        .from(feedbackResponses)
        .where(
          and(
            eq(feedbackResponses.campaignId, input.campaignId),
            eq(feedbackResponses.userId, ctx.user.id)
          )
        )
        .limit(1);

      let responseId: number;

      if (existing) {
        await db
          .update(feedbackResponses)
          .set({
            rating:    input.rating ?? null,
            comment:   input.comment ?? null,
            dismissed: false,
            device:    input.device ?? null,
            browser:   input.browser ?? null,
          })
          .where(eq(feedbackResponses.id, existing.id));
        responseId = existing.id;
        await db
          .delete(feedbackResponseCategories)
          .where(eq(feedbackResponseCategories.responseId, existing.id));
      } else {
        const [inserted] = await db
          .insert(feedbackResponses)
          .values({
            campaignId:  input.campaignId,
            userId:      ctx.user.id,
            ownerId:     ctx.user.id,
            role:        ctx.user.role ?? "client",
            rating:      input.rating ?? null,
            comment:     input.comment ?? null,
            appVersion:  process.env.npm_package_version ?? "unknown",
            device:      input.device ?? null,
            browser:     input.browser ?? null,
            dismissed:   false,
            dismissedAt: null,
            createdAt:   now,
          })
          .$returningId();
        responseId = inserted.id;
      }

      if (input.categoryIds && input.categoryIds.length > 0) {
        for (const cid of input.categoryIds) {
          await db
            .insert(feedbackResponseCategories)
            .values({ responseId, categoryId: cid })
            .onDuplicateKeyUpdate({ set: { responseId, categoryId: cid } });
        }
      }

      await db.insert(feedbackAnalytics).values({
        campaignId: input.campaignId,
        userId:     ctx.user.id,
        event:      "submitted",
        createdAt:  now,
      });

      return { ok: true };
    }),

  // ── إغلاق نهائي ──────────────────────────────────────────────────────────
  dismiss: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const now = nowMs();

      const [existing] = await db
        .select()
        .from(feedbackResponses)
        .where(
          and(
            eq(feedbackResponses.campaignId, input.campaignId),
            eq(feedbackResponses.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(feedbackResponses)
          .set({ dismissed: true, dismissedAt: now })
          .where(eq(feedbackResponses.id, existing.id));
      } else {
        await db.insert(feedbackResponses).values({
          campaignId:  input.campaignId,
          userId:      ctx.user.id,
          ownerId:     ctx.user.id,
          role:        ctx.user.role ?? "client",
          rating:      null,
          comment:     null,
          appVersion:  process.env.npm_package_version ?? "unknown",
          device:      null,
          browser:     null,
          dismissed:   true,
          dismissedAt: now,
          createdAt:   now,
        });
      }

      await db.insert(feedbackAnalytics).values({
        campaignId: input.campaignId,
        userId:     ctx.user.id,
        event:      "dismissed",
        createdAt:  now,
      });

      return { ok: true };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN PROCEDURES
  // ══════════════════════════════════════════════════════════════════════════

  adminListCampaigns: adminProcedure.query(async () => {
    const db = await getDb();
    const campaigns = await db
      .select()
      .from(feedbackCampaigns)
      .orderBy(desc(feedbackCampaigns.createdAt));

    type CRow = typeof campaigns[0];
    const stats = await Promise.all(
      campaigns.map(async (c: CRow) => {
        const [row] = await db
          .select({
            total:     sql<number>`COUNT(*)`,
            avgRating: sql<number>`AVG(${feedbackResponses.rating})`,
          })
          .from(feedbackResponses)
          .where(
            and(
              eq(feedbackResponses.campaignId, c.id),
              sql`${feedbackResponses.rating} IS NOT NULL`
            )
          );

        const [viewRow] = await db
          .select({ views: sql<number>`COUNT(*)` })
          .from(feedbackAnalytics)
          .where(
            and(
              eq(feedbackAnalytics.campaignId, c.id),
              eq(feedbackAnalytics.event, "viewed")
            )
          );

        return {
          campaignId:     c.id,
          totalResponses: Number(row?.total ?? 0),
          avgRating:      row?.avgRating ? Number(row.avgRating).toFixed(1) : null,
          totalViews:     Number(viewRow?.views ?? 0),
        };
      })
    );

    type CampaignRow = (typeof campaigns)[0];
    return campaigns.map((c: CampaignRow, i: number) => ({ ...c, stats: stats[i] }));
  }),

  adminCreate: adminProcedure
    .input(z.object({
      version:     z.string().min(1).max(50),
      title:       z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      type:        z.enum(["rating", "nps", "survey", "vote"]).default("rating"),
      priority:    z.number().default(0),
      startAt:     z.number(),
      endAt:       z.number().optional(),
      isActive:    z.boolean().default(true),
      categories:  z.array(z.object({
        label:     z.string().max(100),
        icon:      z.string().max(50).optional(),
        sortOrder: z.number().default(0),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [inserted] = await db
        .insert(feedbackCampaigns)
        .values({
          version:     input.version,
          title:       input.title,
          description: input.description ?? null,
          type:        input.type,
          isActive:    input.isActive,
          priority:    input.priority,
          startAt:     input.startAt,
          endAt:       input.endAt ?? null,
          createdAt:   Date.now(),
        })
        .$returningId();

      if (input.categories && input.categories.length > 0) {
        await db.insert(feedbackCategories).values(
          input.categories.map((cat) => ({
            campaignId: inserted.id,
            label:      cat.label,
            icon:       cat.icon ?? null,
            sortOrder:  cat.sortOrder,
          }))
        );
      }

      return { id: inserted.id };
    }),

  adminUpdate: adminProcedure
    .input(z.object({
      id:          z.number(),
      title:       z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      isActive:    z.boolean().optional(),
      priority:    z.number().optional(),
      endAt:       z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      await db
        .update(feedbackCampaigns)
        .set(rest as Record<string, unknown>)
        .where(eq(feedbackCampaigns.id, id));
      return { ok: true };
    }),

  adminStats: adminProcedure
    .input(z.object({
      campaignId: z.number(),
      fromDate:   z.number().optional(),
      toDate:     z.number().optional(),
      ownerId:    z.number().optional(),
      rating:     z.number().optional(),
      page:       z.number().default(1),
      pageSize:   z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [eq(feedbackResponses.campaignId, input.campaignId)];
      if (input.fromDate) conditions.push(gte(feedbackResponses.createdAt, input.fromDate));
      if (input.toDate)   conditions.push(lte(feedbackResponses.createdAt, input.toDate));
      if (input.ownerId)  conditions.push(eq(feedbackResponses.ownerId, input.ownerId));
      if (input.rating)   conditions.push(eq(feedbackResponses.rating, input.rating));

      const whereClause = and(...conditions);

      const [kpi] = await db
        .select({
          total:       sql<number>`COUNT(*)`,
          avgRating:   sql<number>`AVG(${feedbackResponses.rating})`,
          withComment: sql<number>`SUM(CASE WHEN ${feedbackResponses.comment} IS NOT NULL AND ${feedbackResponses.comment} != '' THEN 1 ELSE 0 END)`,
        })
        .from(feedbackResponses)
        .where(whereClause);

      const distribution = await db
        .select({
          rating: feedbackResponses.rating,
          count:  sql<number>`COUNT(*)`,
        })
        .from(feedbackResponses)
        .where(and(whereClause, sql`${feedbackResponses.rating} IS NOT NULL`))
        .groupBy(feedbackResponses.rating)
        .orderBy(feedbackResponses.rating);

      const [analytics] = await db
        .select({
          views:     sql<number>`SUM(CASE WHEN ${feedbackAnalytics.event} = 'viewed' THEN 1 ELSE 0 END)`,
          snoozed:   sql<number>`SUM(CASE WHEN ${feedbackAnalytics.event} = 'snoozed' THEN 1 ELSE 0 END)`,
          dismissed: sql<number>`SUM(CASE WHEN ${feedbackAnalytics.event} = 'dismissed' THEN 1 ELSE 0 END)`,
          submitted: sql<number>`SUM(CASE WHEN ${feedbackAnalytics.event} = 'submitted' THEN 1 ELSE 0 END)`,
        })
        .from(feedbackAnalytics)
        .where(eq(feedbackAnalytics.campaignId, input.campaignId));

      const topCategories = await db
        .select({
          label: feedbackCategories.label,
          icon:  feedbackCategories.icon,
          count: sql<number>`COUNT(${feedbackResponseCategories.responseId})`,
        })
        .from(feedbackResponseCategories)
        .innerJoin(feedbackCategories, eq(feedbackResponseCategories.categoryId, feedbackCategories.id))
        .innerJoin(feedbackResponses, eq(feedbackResponseCategories.responseId, feedbackResponses.id))
        .where(eq(feedbackResponses.campaignId, input.campaignId))
        .groupBy(feedbackCategories.id, feedbackCategories.label, feedbackCategories.icon)
        .orderBy(desc(sql`COUNT(${feedbackResponseCategories.responseId})`))
        .limit(10);

      const offset = (input.page - 1) * input.pageSize;
      const comments = await db
        .select()
        .from(feedbackResponses)
        .where(and(whereClause, sql`${feedbackResponses.comment} IS NOT NULL`))
        .orderBy(desc(feedbackResponses.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      const [{ total: totalComments }] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(feedbackResponses)
        .where(and(whereClause, sql`${feedbackResponses.comment} IS NOT NULL`));

      return {
        kpi: {
          total:       Number(kpi?.total ?? 0),
          avgRating:   kpi?.avgRating ? Number(kpi.avgRating) : null,
          withComment: Number(kpi?.withComment ?? 0),
        },
        distribution: distribution.map((d: { rating: number | null; count: number }) => ({
          rating: d.rating,
          count:  Number(d.count),
        })),
        analytics: {
          views:     Number(analytics?.views ?? 0),
          snoozed:   Number(analytics?.snoozed ?? 0),
          dismissed: Number(analytics?.dismissed ?? 0),
          submitted: Number(analytics?.submitted ?? 0),
        },
        topCategories: topCategories.map((c: { label: string; icon: string | null; count: number }) => ({
          label: c.label,
          icon:  c.icon,
          count: Number(c.count),
        })),
        comments,
        totalComments: Number(totalComments ?? 0),
        totalPages:    Math.ceil(Number(totalComments ?? 0) / input.pageSize),
      };
    }),
});
