import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { recycleBinItems, systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { recycleBinService, type RecycleActor } from "../domains/recycleBin/RecycleBinService";

const MANAGING_ROLES = new Set(["owner", "super_admin", "reseller", "client", "client_owner", "client_admin"]);
const GLOBAL_ROLES = new Set(["owner", "super_admin"]);

function effectiveOwnerId(user: any) {
  return (user.role === "client_admin" || user.role === "client_staff") && user.tenantId
    ? user.tenantId
    : user.id;
}

function assertBinRole(user: any) {
  if (!MANAGING_ROLES.has(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إدارة سلة المحذوفات" });
  }
}

function actorFor(user: any, ownerId?: number): RecycleActor {
  return {
    userId: user.id,
    role: user.role,
    ownerId: ownerId ?? effectiveOwnerId(user),
    resellerId: user.role === "reseller" ? user.id : user.resellerId ?? null,
  };
}

function canAccessItem(user: any, item: any) {
  if (GLOBAL_ROLES.has(user.role)) return true;
  if (user.role === "reseller") return item.resellerId === user.id || item.ownerId === user.id;
  return item.ownerId === effectiveOwnerId(user);
}

async function getAccessibleItem(user: any, itemId: string) {
  const item = await recycleBinService.getById(itemId);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "العنصر غير موجود في سلة المحذوفات" });
  if (!canAccessItem(user, item)) throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح للوصول إلى هذا العنصر" });
  return item;
}

export const recycleBinRouter = router({
  list: protectedProcedure
    .input(z.object({ entityType: z.enum(["card", "batch", "subscriber"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      assertBinRole(ctx.user);
      const ownerId = effectiveOwnerId(ctx.user);
      const items = await recycleBinService.list(ownerId, input?.entityType);
      if (ctx.user.role !== "reseller") return items;
      return items.filter((item: any) => item.resellerId === ctx.user.id || item.ownerId === ctx.user.id);
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertBinRole(ctx.user);
      const item = await getAccessibleItem(ctx.user, input.id);
      return recycleBinService.restore(input.id, actorFor(ctx.user, item.ownerId));
    }),

  permanentlyDelete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertBinRole(ctx.user);
      const item = await getAccessibleItem(ctx.user, input.id);
      return recycleBinService.permanentlyDelete(input.id, actorFor(ctx.user, item.ownerId));
    }),

  clearMine: protectedProcedure
    .mutation(async ({ ctx }) => {
      assertBinRole(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const ownerId = effectiveOwnerId(ctx.user);
      const rows = await db.select().from(recycleBinItems).where(eq(recycleBinItems.ownerId, ownerId));
      const accessible = rows.filter((item: any) => canAccessItem(ctx.user, item));
      for (const item of accessible) {
        await recycleBinService.permanentlyDelete(item.id, actorFor(ctx.user, item.ownerId));
      }
      return { deleted: accessible.length };
    }),

  settings: protectedProcedure.query(async ({ ctx }) => {
    if (!GLOBAL_ROLES.has(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "إعدادات الاحتفاظ متاحة لمالك النظام فقط" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, "recycle_bin_retention_days")).limit(1);
    const [enabled] = await db.select().from(systemSettings).where(eq(systemSettings.key, "recycle_bin_cleanup_enabled")).limit(1);
    const [interval] = await db.select().from(systemSettings).where(eq(systemSettings.key, "recycle_bin_cleanup_interval_hours")).limit(1);
    return {
      retentionDays: Math.min(365, Math.max(1, Number(rows[0]?.value ?? 30))),
      autoCleanupEnabled: enabled?.value !== "false",
      cleanupIntervalHours: Math.min(24, Math.max(1, Number(interval?.value ?? 24))),
    };
  }),

  updateSettings: protectedProcedure
    .input(z.object({ retentionDays: z.number().int().min(1).max(365), autoCleanupEnabled: z.boolean(), cleanupIntervalHours: z.number().int().min(1).max(24) }))
    .mutation(async ({ ctx, input }) => {
      if (!GLOBAL_ROLES.has(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "إعدادات الاحتفاظ متاحة لمالك النظام فقط" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      await db.insert(systemSettings).values({
        key: "recycle_bin_retention_days",
        value: String(input.retentionDays),
        type: "number",
        description: "عدد أيام الاحتفاظ بعناصر سلة المحذوفات",
      }).onDuplicateKeyUpdate({ set: { value: String(input.retentionDays), type: "number", description: "عدد أيام الاحتفاظ بعناصر سلة المحذوفات" } });
      await db.insert(systemSettings).values({ key: "recycle_bin_cleanup_enabled", value: String(input.autoCleanupEnabled), type: "boolean", description: "تفعيل التنظيف التلقائي لسلة المحذوفات" }).onDuplicateKeyUpdate({ set: { value: String(input.autoCleanupEnabled), type: "boolean", description: "تفعيل التنظيف التلقائي لسلة المحذوفات" } });
      await db.insert(systemSettings).values({ key: "recycle_bin_cleanup_interval_hours", value: String(input.cleanupIntervalHours), type: "number", description: "الفاصل بالساعات بين فحوص التنظيف التلقائي لسلة المحذوفات" }).onDuplicateKeyUpdate({ set: { value: String(input.cleanupIntervalHours), type: "number", description: "الفاصل بالساعات بين فحوص التنظيف التلقائي لسلة المحذوفات" } });
      return { success: true, retentionDays: input.retentionDays, autoCleanupEnabled: input.autoCleanupEnabled, cleanupIntervalHours: input.cleanupIntervalHours };
    }),
});
