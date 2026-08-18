import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { cache } from "../_core/cache";
import { isAdmin as isAdminRole } from "../_core/roles";

const analyticsRouter = router({
  // Revenue trend - last N days
  revenueTrend: protectedProcedure
    .input(z.object({
      days: z.number().min(7).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { days } = input;
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = startDate.toISOString().slice(0,19).replace('T',' ');
      const endStr = endDate.toISOString().slice(0,19).replace('T',' ');
      const isAdmin = isAdminRole(ctx.user.role);

      if (isAdmin) {
        const result = await db.execute(sql`
          SELECT 
            DATE(createdAt) as date,
            SUM(total) as revenue,
            COUNT(*) as transaction_count
          FROM invoices
          WHERE createdAt >= ${startStr}
            AND createdAt <= ${endStr}
            AND status = 'paid'
          GROUP BY DATE(createdAt)
          ORDER BY date ASC
        `);
        return result;
      } else {
        const result = await db.execute(sql`
          SELECT 
            DATE(createdAt) as date,
            SUM(total) as revenue,
            COUNT(*) as transaction_count
          FROM invoices
          WHERE createdAt >= ${startStr}
            AND createdAt <= ${endStr}
            AND status = 'paid'
            AND userId = ${ctx.user.id}
          GROUP BY DATE(createdAt)
          ORDER BY date ASC
        `);
        return result;
      }
    }),

  // Active sessions trend
  sessionsTrend: protectedProcedure
    .input(z.object({
      days: z.number().min(7).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { days } = input;

      const cacheKey = `analytics:sessionsTrend:${ctx.user.id}:${days}`;
      const cached = cache.get<any>(cacheKey);
      if (cached) return cached;
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const startDateDay = new Date(startDate);
      startDateDay.setHours(0, 0, 0, 0);
      const endDateNext = new Date(endDate);
      endDateNext.setDate(endDateNext.getDate() + 1);
      endDateNext.setHours(0, 0, 0, 0);

      const startStr = startDateDay.toISOString().slice(0, 19).replace('T', ' ');
      const endStr = endDateNext.toISOString().slice(0, 19).replace('T', ' ');
      const isAdmin = isAdminRole(ctx.user.role);

      let result;
      if (isAdmin) {
        result = await db.execute(sql`
          SELECT 
            DATE(acctstarttime) as date,
            COUNT(DISTINCT username) as unique_users,
            COUNT(*) as total_sessions,
            SUM(TIMESTAMPDIFF(SECOND, acctstarttime, COALESCE(acctstoptime, NOW()))) / 3600 as total_hours
          FROM radacct
          WHERE acctstarttime >= ${startStr}
            AND acctstarttime < ${endStr}
          GROUP BY DATE(acctstarttime)
          ORDER BY date ASC
        `);
      } else {
        result = await db.execute(sql`
          SELECT 
            DATE(acctstarttime) as date,
            COUNT(DISTINCT username) as unique_users,
            COUNT(*) as total_sessions,
            SUM(TIMESTAMPDIFF(SECOND, acctstarttime, COALESCE(acctstoptime, NOW()))) / 3600 as total_hours
          FROM radacct
          WHERE acctstarttime >= ${startStr}
            AND acctstarttime < ${endStr}
            AND username IN (SELECT username FROM radius_cards WHERE createdBy = ${ctx.user.id})
          GROUP BY DATE(acctstarttime)
          ORDER BY date ASC
        `);
      }

      cache.set(cacheKey, result, 5 * 60);
      return result;
    }),

  // NAS health status
  nasHealth: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const cacheKey = `analytics:nasHealth:${ctx.user.id}`;
    const cached = cache.get<any>(cacheKey);
    if (cached) return cached;
      const isAdmin = isAdminRole(ctx.user.role);

    let result;
    if (isAdmin) {
      result = await db.execute(sql`
        SELECT 
          status,
          COUNT(*) as count
        FROM nas
        GROUP BY status
      `);
    } else {
      result = await db.execute(sql`
        SELECT 
          status,
          COUNT(*) as count
        FROM nas
        WHERE ownerId = ${ctx.user.id}
        GROUP BY status
      `);
    }

    cache.set(cacheKey, result, 5 * 60);
    return result;
  }),

  // Dashboard stats summary
  dashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startStr = startDate.toISOString().slice(0,19).replace('T',' ');
      const isAdmin = isAdminRole(ctx.user.role);

    let totalRevenue, monthlyRevenue;
    if (isAdmin) {
      [totalRevenue, monthlyRevenue] = await Promise.all([
        db.execute(sql`
          SELECT COALESCE(SUM(total), 0) as total_revenue
          FROM invoices
          WHERE status = 'paid'
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(total), 0) as monthly_revenue
          FROM invoices
          WHERE status = 'paid'
            AND createdAt >= ${startStr}
        `),
      ]);
    } else {
      [totalRevenue, monthlyRevenue] = await Promise.all([
        db.execute(sql`
          SELECT COALESCE(SUM(total), 0) as total_revenue
          FROM invoices
          WHERE status = 'paid'
            AND userId = ${ctx.user.id}
        `),
        db.execute(sql`
          SELECT COALESCE(SUM(total), 0) as monthly_revenue
          FROM invoices
          WHERE status = 'paid'
            AND createdAt >= ${startStr}
            AND userId = ${ctx.user.id}
        `),
      ]);
    }

    const totalArr = (Array.isArray((totalRevenue as any)[0]) ? (totalRevenue as any)[0] : totalRevenue) as any[];
    const monthlyArr = (Array.isArray((monthlyRevenue as any)[0]) ? (monthlyRevenue as any)[0] : monthlyRevenue) as any[];

    return {
      totalRevenue: String(totalArr[0]?.total_revenue ?? '0'),
      monthlyRevenue: String(monthlyArr[0]?.monthly_revenue ?? '0'),
    };
  }),

  // User growth trend (new registrations per day)
  userGrowth: protectedProcedure
    .input(z.object({
      days: z.number().min(7).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { days } = input;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startStr = startDate.toISOString().slice(0,19).replace('T',' ');
      const endStr = endDate.toISOString().slice(0,19).replace('T',' ');

      if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'owner') {
        throw new Error('Unauthorized: Only admins can view user growth');
      }
      const result = await db.execute(sql`
        SELECT 
          DATE(createdAt) as date,
          COUNT(*) as new_users,
          SUM(CASE WHEN role = 'client' THEN 1 ELSE 0 END) as new_clients,
          SUM(CASE WHEN role = 'reseller' THEN 1 ELSE 0 END) as new_resellers
        FROM users
        WHERE createdAt >= ${startStr}
          AND createdAt <= ${endStr}
        GROUP BY DATE(createdAt)
        ORDER BY date ASC
      `);
      return result;
    }),

  // Sessions timeline (last 24 hours - hourly)
  sessionsTimeline: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'owner') {
      throw new Error('Unauthorized: Only admins can view sessions timeline');
    }
    const cacheKey = 'analytics:sessionsTimeline';
    const cached = cache.get<any>(cacheKey);
    if (cached) return cached;

    const now24 = new Date();
    const since24h = new Date(now24.getTime() - 24 * 60 * 60 * 1000);
    const sinceStr = since24h.toISOString().slice(0, 19).replace('T', ' ');
    const nowStr = now24.toISOString().slice(0, 19).replace('T', ' ');

    const result = await db.execute(sql`
      SELECT 
        DATE_FORMAT(acctstarttime, '%Y-%m-%d %H:00:00') as hour,
        COUNT(*) as session_count,
        COUNT(DISTINCT username) as unique_users
      FROM radacct
      WHERE acctstarttime >= ${sinceStr}
        AND acctstarttime < ${nowStr}
      GROUP BY DATE_FORMAT(acctstarttime, '%Y-%m-%d %H:00:00')
      ORDER BY hour ASC
    `);
    cache.set(cacheKey, result, 5 * 60);
    return result;
  }),

  // Total cards created in system (Admin only)
  totalCardsCreated: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'owner') {
      throw new Error('Unauthorized: Only admins can view total cards');
    }
    const result = await db.execute(sql`
      SELECT 
        COUNT(*) as total_cards,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_cards,
        SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used_cards,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_cards
      FROM radius_cards
    `);
    return (result as any)[0];
  }),

  // Admin card sales analytics
  adminCardSales: protectedProcedure
    .input(z.object({
      days: z.number().min(7).max(365).default(30),
      hours: z.number().min(0).max(8760).optional(),
      clientId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { days, hours, clientId } = input;

      if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'owner') {
        throw new Error('Unauthorized');
      }

      const endDate = new Date();
      const startDate = new Date();
      if (hours && hours > 0) {
        startDate.setTime(endDate.getTime() - hours * 3600 * 1000);
      } else {
        startDate.setDate(startDate.getDate() - days);
      }
      const startStr = startDate.toISOString().slice(0,19).replace('T',' ');
      const endStr = endDate.toISOString().slice(0,19).replace('T',' ');

      // Build queries based on clientId filter
      let summaryRows, revenueRows, allTimeRows, clientRows, trendRows, topPlanRows;

      if (clientId) {
        [summaryRows, revenueRows, allTimeRows, clientRows, trendRows, topPlanRows] = await Promise.all([
          db.execute(sql`
            SELECT CAST(COUNT(*) AS UNSIGNED) as sold_in_period
            FROM radius_cards rc
            LEFT JOIN plans p ON rc.planId = p.id
            WHERE rc.status != 'unused'
              AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
              AND rc.createdBy = ${clientId}
          `),
          db.execute(sql`
            SELECT COALESCE(p.currency, 'USD') as currency,
              CAST(COALESCE(SUM(CAST(COALESCE(rc.salePrice, p.price, '0') AS DECIMAL(10,2))), 0) AS DECIMAL(10,2)) as total_revenue
            FROM radius_cards rc
            LEFT JOIN plans p ON rc.planId = p.id
            WHERE rc.status != 'unused'
              AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
              AND rc.createdBy = ${clientId}
            GROUP BY COALESCE(p.currency, 'USD')
          `),
          db.execute(sql`
            SELECT CAST(COUNT(*) AS UNSIGNED) as total_cards,
              CAST(SUM(CASE WHEN rc.status = 'unused' THEN 1 ELSE 0 END) AS UNSIGNED) as available_cards
            FROM radius_cards rc
            WHERE rc.createdBy = ${clientId}
          `),
          db.execute(sql`
            SELECT u.id as client_id,
              COALESCE(u.name, u.email, CONCAT('User #', u.id)) as client_name,
              u.email as client_email, u.role as client_role,
              CAST(COUNT(rc.id) AS UNSIGNED) as sold_cards,
              CAST(COALESCE(SUM(CAST(COALESCE(rc.salePrice, p.price, '0') AS DECIMAL(10,2))), 0) AS DECIMAL(10,2)) as revenue,
              COALESCE(MAX(p.currency), 'USD') as revenue_currency
            FROM users u
            LEFT JOIN radius_cards rc ON rc.createdBy = u.id AND rc.status != 'unused'
              AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
            LEFT JOIN plans p ON rc.planId = p.id
            WHERE u.role IN ('client', 'reseller')
            GROUP BY u.id, u.name, u.email, u.role
            ORDER BY sold_cards DESC
          `),
          db.execute(sql`
            SELECT DATE_FORMAT(updatedAt, '%Y-%m-%d') as date,
              CAST(COUNT(*) AS UNSIGNED) as cards_sold
            FROM radius_cards
            WHERE status != 'unused'
              AND updatedAt >= ${startStr} AND updatedAt <= ${endStr}
              AND createdBy = ${clientId}
            GROUP BY DATE_FORMAT(updatedAt, '%Y-%m-%d')
            ORDER BY date ASC
          `),
          db.execute(sql`
            SELECT COALESCE(p.name, 'بدون خطة') as plan_name,
              CAST(COUNT(rc.id) AS UNSIGNED) as cards_sold,
              CAST(COALESCE(SUM(CAST(COALESCE(rc.salePrice, p.price, '0') AS DECIMAL(10,2))), 0) AS DECIMAL(10,2)) as revenue,
              COALESCE(p.currency, 'USD') as revenue_currency
            FROM radius_cards rc
            LEFT JOIN plans p ON rc.planId = p.id
            WHERE rc.status != 'unused'
              AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
              AND rc.createdBy = ${clientId}
            GROUP BY p.id, p.name, p.currency
            ORDER BY cards_sold DESC
            LIMIT 8
          `),
        ]);
      } else {
        [summaryRows, revenueRows, allTimeRows, clientRows, trendRows, topPlanRows] = await Promise.all([
          db.execute(sql`
            SELECT CAST(COUNT(*) AS UNSIGNED) as sold_in_period
            FROM radius_cards rc
            LEFT JOIN plans p ON rc.planId = p.id
            WHERE rc.status != 'unused'
              AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
          `),
          db.execute(sql`
            SELECT COALESCE(p.currency, 'USD') as currency,
              CAST(COALESCE(SUM(CAST(COALESCE(rc.salePrice, p.price, '0') AS DECIMAL(10,2))), 0) AS DECIMAL(10,2)) as total_revenue
            FROM radius_cards rc
            LEFT JOIN plans p ON rc.planId = p.id
            WHERE rc.status != 'unused'
              AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
            GROUP BY COALESCE(p.currency, 'USD')
          `),
          db.execute(sql`
            SELECT CAST(COUNT(*) AS UNSIGNED) as total_cards,
              CAST(SUM(CASE WHEN rc.status = 'unused' THEN 1 ELSE 0 END) AS UNSIGNED) as available_cards
            FROM radius_cards rc
          `),
          db.execute(sql`
            SELECT u.id as client_id,
              COALESCE(u.name, u.email, CONCAT('User #', u.id)) as client_name,
              u.email as client_email, u.role as client_role,
              CAST(COUNT(rc.id) AS UNSIGNED) as sold_cards,
              CAST(COALESCE(SUM(CAST(COALESCE(rc.salePrice, p.price, '0') AS DECIMAL(10,2))), 0) AS DECIMAL(10,2)) as revenue,
              COALESCE(MAX(p.currency), 'USD') as revenue_currency
            FROM users u
            LEFT JOIN radius_cards rc ON rc.createdBy = u.id AND rc.status != 'unused'
              AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
            LEFT JOIN plans p ON rc.planId = p.id
            WHERE u.role IN ('client', 'reseller')
            GROUP BY u.id, u.name, u.email, u.role
            ORDER BY sold_cards DESC
          `),
          db.execute(sql`
            SELECT DATE_FORMAT(updatedAt, '%Y-%m-%d') as date,
              CAST(COUNT(*) AS UNSIGNED) as cards_sold
            FROM radius_cards
            WHERE status != 'unused'
              AND updatedAt >= ${startStr} AND updatedAt <= ${endStr}
            GROUP BY DATE_FORMAT(updatedAt, '%Y-%m-%d')
            ORDER BY date ASC
          `),
          db.execute(sql`
            SELECT COALESCE(p.name, 'بدون خطة') as plan_name,
              CAST(COUNT(rc.id) AS UNSIGNED) as cards_sold,
              CAST(COALESCE(SUM(CAST(COALESCE(rc.salePrice, p.price, '0') AS DECIMAL(10,2))), 0) AS DECIMAL(10,2)) as revenue,
              COALESCE(p.currency, 'USD') as revenue_currency
            FROM radius_cards rc
            LEFT JOIN plans p ON rc.planId = p.id
            WHERE rc.status != 'unused'
              AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
            GROUP BY p.id, p.name, p.currency
            ORDER BY cards_sold DESC
            LIMIT 8
          `),
        ]);
      }

      const summaryArr = (Array.isArray((summaryRows as any)[0]) ? (summaryRows as any)[0] : summaryRows) as any[];
      const summary = summaryArr[0] as any;
      const revenueArr = (Array.isArray((revenueRows as any)[0]) ? (revenueRows as any)[0] : revenueRows) as any[];
      const allTimeArr = (Array.isArray((allTimeRows as any)[0]) ? (allTimeRows as any)[0] : allTimeRows) as any[];
      const allTime = allTimeArr[0] as any;
      const clientArr = (Array.isArray((clientRows as any)[0]) ? (clientRows as any)[0] : clientRows) as any[];
      const trendArr = (Array.isArray((trendRows as any)[0]) ? (trendRows as any)[0] : trendRows) as any[];
      const topPlanArr = (Array.isArray((topPlanRows as any)[0]) ? (topPlanRows as any)[0] : topPlanRows) as any[];

      const revenueByCurrency: Record<string, number> = {};
      for (const r of revenueArr) {
        const cur = String(r.currency ?? 'USD');
        const val = Number(r.total_revenue ?? 0);
        if (val > 0) revenueByCurrency[cur] = (revenueByCurrency[cur] || 0) + val;
      }

      return {
        systemTotals: {
          sold_in_period: Number(summary?.sold_in_period ?? 0),
          total_cards: Number(allTime?.total_cards ?? 0),
          available_cards: Number(allTime?.available_cards ?? 0),
        },
        systemRevenue: revenueByCurrency,
        clientBreakdown: clientArr.map((r: any) => ({
          client_id: r.client_id,
          client_name: String(r.client_name ?? ''),
          client_email: String(r.client_email ?? ''),
          client_role: String(r.client_role ?? ''),
          sold_cards: Number(r.sold_cards ?? 0),
          revenue: Number(r.revenue ?? 0),
          revenue_currency: String(r.revenue_currency ?? 'USD'),
        })),
        salesTrend: trendArr.map((r: any) => ({
          date: String(r.date ?? ''),
          cards_sold: Number(r.cards_sold ?? 0),
        })),
        topPlans: topPlanArr.map((r: any) => ({
          plan_name: String(r.plan_name ?? ''),
          cards_sold: Number(r.cards_sold ?? 0),
          revenue: Number(r.revenue ?? 0),
          revenue_currency: String(r.revenue_currency ?? 'USD'),
        })),
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
      };
    }),

  // Client card sales analytics
  clientCardSales: protectedProcedure
    .input(z.object({
      days: z.number().min(7).max(90).default(30),
      hours: z.number().min(0).max(8760).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const { days, hours } = input;
      const userId = ctx.user.id;

      const endDate = new Date();
      const startDate = new Date();
      if (hours && hours > 0) {
        startDate.setTime(endDate.getTime() - hours * 3600 * 1000);
      } else {
        startDate.setDate(startDate.getDate() - days);
      }
      const startStr = startDate.toISOString().slice(0,19).replace('T',' ');
      const endStr = endDate.toISOString().slice(0,19).replace('T',' ');

      const [summaryRows, revenueRows, allTimeRows2, trendRows, topPlanRows] = await Promise.all([
        db.execute(sql`
          SELECT CAST(COUNT(*) AS UNSIGNED) as sold_in_period
          FROM radius_cards rc
          LEFT JOIN plans p ON rc.planId = p.id
          WHERE rc.createdBy = ${userId}
            AND rc.status != 'unused'
            AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
        `),
        db.execute(sql`
          SELECT COALESCE(p.currency, 'USD') as currency,
            CAST(COALESCE(SUM(CAST(COALESCE(rc.salePrice, p.price, '0') AS DECIMAL(10,2))), 0) AS DECIMAL(10,2)) as total_revenue
          FROM radius_cards rc
          LEFT JOIN plans p ON rc.planId = p.id
          WHERE rc.createdBy = ${userId}
            AND rc.status != 'unused'
            AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
          GROUP BY COALESCE(p.currency, 'USD')
        `),
        db.execute(sql`
          SELECT CAST(COUNT(*) AS UNSIGNED) as total_cards,
            CAST(SUM(CASE WHEN rc.status = 'unused' THEN 1 ELSE 0 END) AS UNSIGNED) as available_cards
          FROM radius_cards rc
          WHERE rc.createdBy = ${userId}
        `),
        db.execute(sql`
          SELECT DATE_FORMAT(updatedAt, '%Y-%m-%d') as date,
            CAST(COUNT(*) AS UNSIGNED) as cards_sold
          FROM radius_cards
          WHERE createdBy = ${userId}
            AND status != 'unused'
            AND updatedAt >= ${startStr} AND updatedAt <= ${endStr}
          GROUP BY DATE_FORMAT(updatedAt, '%Y-%m-%d')
          ORDER BY date ASC
        `),
        db.execute(sql`
          SELECT COALESCE(p.name, 'بدون خطة') as plan_name,
            CAST(COUNT(rc.id) AS UNSIGNED) as cards_sold,
            CAST(COALESCE(SUM(CAST(COALESCE(rc.salePrice, p.price, '0') AS DECIMAL(10,2))), 0) AS DECIMAL(10,2)) as revenue,
            COALESCE(p.currency, 'USD') as revenue_currency
          FROM radius_cards rc
          LEFT JOIN plans p ON rc.planId = p.id
          WHERE rc.createdBy = ${userId}
            AND rc.status != 'unused'
            AND rc.updatedAt >= ${startStr} AND rc.updatedAt <= ${endStr}
          GROUP BY p.id, p.name, p.currency
          ORDER BY cards_sold DESC
          LIMIT 5
        `),
      ]);

      const summaryArr2 = (Array.isArray((summaryRows as any)[0]) ? (summaryRows as any)[0] : summaryRows) as any[];
      const summary = summaryArr2[0] as any;
      const revenueArr2 = (Array.isArray((revenueRows as any)[0]) ? (revenueRows as any)[0] : revenueRows) as any[];
      const allTimeArr2 = (Array.isArray((allTimeRows2 as any)[0]) ? (allTimeRows2 as any)[0] : allTimeRows2) as any[];
      const allTime2 = allTimeArr2[0] as any;
      const trendArr2 = (Array.isArray((trendRows as any)[0]) ? (trendRows as any)[0] : trendRows) as any[];
      const topPlanArr2 = (Array.isArray((topPlanRows as any)[0]) ? (topPlanRows as any)[0] : topPlanRows) as any[];

      const revenueByCurrency2: Record<string, number> = {};
      for (const r of revenueArr2) {
        const cur = String(r.currency ?? 'USD');
        const val = Number(r.total_revenue ?? 0);
        if (val > 0) revenueByCurrency2[cur] = (revenueByCurrency2[cur] || 0) + val;
      }

      return {
        totalSales: {
          sold_in_period: Number(summary?.sold_in_period ?? 0),
          total_cards: Number(allTime2?.total_cards ?? 0),
          available_cards: Number(allTime2?.available_cards ?? 0),
        },
        revenue: revenueByCurrency2,
        salesTrend: trendArr2.map((r: any) => ({
          date: String(r.date ?? ''),
          cards_sold: Number(r.cards_sold ?? 0),
        })),
        topPlans: topPlanArr2.map((r: any) => ({
          plan_name: String(r.plan_name ?? ''),
          cards_sold: Number(r.cards_sold ?? 0),
          revenue: Number(r.revenue ?? 0),
          revenue_currency: String(r.revenue_currency ?? 'USD'),
        })),
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
      };
    }),
});


export { analyticsRouter };
