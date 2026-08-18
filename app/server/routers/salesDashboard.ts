import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { cache } from "../_core/cache";
import { cardSalesRepository } from "../domains/vouchers/repositories/CardSalesRepository";
import { timezoneRepository } from "../domains/core/TimezoneRepository";
import { getEffectiveOwnerId, getTenantContext } from "../tenant-isolation";

export function invalidateSalesDashboardCache(): void {
  cache.deletePattern("cardSales:");
}

export const salesDashboardRouter = router({
  getSalesData: protectedProcedure
    .input(z.object({
      preset: z.enum(["hour", "today", "yesterday", "last7", "thisWeek", "last30", "thisMonth", "lastMonth", "custom"]).default("last30"),
      customStart: z.string().optional(),
      customEnd: z.string().optional(),
      planId: z.number().int().positive().optional(),
      currency: z.string().trim().min(3).max(3).optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().min(5).max(50).optional(),
      chartGranularity: z.enum(["hour", "day", "week", "month"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const adminRoles = ["owner", "super_admin", "support"];
      const ownerId = adminRoles.includes(ctx.user.role) ? null : ctx.user.id;
      const reportOwnerId = ownerId ?? getEffectiveOwnerId(getTenantContext(ctx.user));
      const timezone = await timezoneRepository.getOwnerTimezone(reportOwnerId);
      const cacheKey = `cardSales:${ctx.user.id}:${ownerId ?? "all"}:${timezone}:${JSON.stringify(input)}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      const data = await cardSalesRepository.getDashboard({
        ownerId,
        timezone,
        preset: input.preset,
        customStart: input.customStart,
        customEnd: input.customEnd,
        planId: input.planId,
        currency: input.currency,
        page: input.page,
        pageSize: input.pageSize,
        granularity: input.chartGranularity,
      });
      cache.set(cacheKey, data, 60);
      return data;
    }),
});
