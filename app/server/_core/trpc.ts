import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { mergeCurrentStaffTenant } from "../security/currentTenantUser";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * جلسة الموظف قد تكون مخزنة مؤقتاً، بينما يمكن للمدير نقل الموظف أو تغيير
 * الحساب الرسمي. لذلك لا تستخدم tenantId القادم من الجلسة لاتخاذ قرار مالي
 * أو لعزل البيانات؛ اقرأ سجل الموظف الحالي من قاعدة البيانات لكل طلب محمي.
 */
async function resolveCurrentStaffUser<T extends { id: number; role: string }>(user: T): Promise<T> {
  if (user.role !== "client_staff") return user;
  const { getUserById } = await import("../db");
  const currentUser = await getUserById(user.id);
  return mergeCurrentStaffTenant(user, currentUser);
}

const requireUser = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  if (ctx.user.role === "client_staff") {
    const { assertClientStaffProcedureAccess } = await import("../security/staffProcedureAccess");
    await assertClientStaffProcedureAccess(ctx.user.id, path);
  }

  const currentUser = await resolveCurrentStaffUser(ctx.user);

  return next({
    ctx: {
      ...ctx,
      user: currentUser,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

// Super Admin only procedure (includes owner role)
export const superAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'super_admin' && ctx.user.role !== 'owner')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Reseller, Client, or Super Admin procedure (for managing own resources)
export const resellerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    // Allow client_staff only after the same fail-closed procedure guard used by protectedProcedure.
    if (!ctx.user || (ctx.user.role !== 'super_admin' && ctx.user.role !== 'owner' && ctx.user.role !== 'reseller' && ctx.user.role !== 'client' && ctx.user.role !== 'client_staff')) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Access denied. Client, Reseller or Admin access required." });
    }

    if (ctx.user.role === 'client_staff') {
      const { assertClientStaffProcedureAccess } = await import("../security/staffProcedureAccess");
      await assertClientStaffProcedureAccess(ctx.user.id, opts.path);
    }

    const currentUser = await resolveCurrentStaffUser(ctx.user);

    return next({
      ctx: {
        ...ctx,
        user: currentUser,
      },
    });
  }),
);

// Client or higher procedure (any authenticated user)
export const clientProcedure = t.procedure.use(requireUser);

// Legacy admin procedure (maps to super_admin)
export const adminProcedure = superAdminProcedure;

// Support procedure - view only access
export const supportProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    // Support can access, but also allow higher roles
    const allowedRoles = ['super_admin', 'owner', 'support'];
    if (!allowedRoles.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Access denied. Support access required." });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Permission-based procedure factory
export const createPermissionProcedure = (resource: string, action: string) => {
  return t.procedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;

      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      }

      // Import permissions service
      const { hasPermission } = await import('../services/permissionsService');
      const allowed = hasPermission(ctx.user.role as any, resource as any, action as any);

      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `ليس لديك صلاحية ${action} في ${resource}`,
        });
      }

      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
        },
      });
    }),
  );
};

// Active subscription procedure - blocks write operations when balance is 0 or billing is suspended
// Checks wallet balance for clients - super_admin and owner bypass this check
export const activeSubscriptionProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next, path } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    if (ctx.user.role === 'client_staff') {
      const { assertClientStaffProcedureAccess } = await import("../security/staffProcedureAccess");
      await assertClientStaffProcedureAccess(ctx.user.id, path);
    }

    const currentUser = await resolveCurrentStaffUser(ctx.user);

    // Super admin and owner bypass billing check
    if (currentUser.role === 'super_admin' || currentUser.role === 'owner') {
      return next({
        ctx: {
          ...ctx,
          user: currentUser,
        },
      });
    }

    // client_staff is not a billable account. It always inherits the official
    // client account's status and wallet, so suspending that account stops all
    // delegated staff actions as well.
    const { getDb } = await import('../db');
    const { wallets, users } = await import('../../drizzle/schema');
    const { eq } = await import('drizzle-orm');

    const db = await getDb();
    if (db) {
      const effectiveAccountId = currentUser.role === 'client_staff'
        ? currentUser.tenantId
        : currentUser.id;

      if (!effectiveAccountId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "CLIENT_ACCOUNT_UNAVAILABLE: لا يمكن تحديد الحساب الرسمي للموظف.",
        });
      }

      const [account] = await db
        .select({ id: users.id, status: users.status, billingStatus: users.billingStatus })
        .from(users)
        .where(eq(users.id, effectiveAccountId))
        .limit(1);

      // يوقف حساب الموظف فقط عند إيقاف الحساب الرسمي إدارياً. billingStatus
      // مؤشر فوترة، وقد يتأخر تحديثه بعد الشحن؛ لذلك لا يجوز أن يحجب بيانات
      // العميل أو عمليات موظفه ما دام الحساب نشطاً ورصيده موجباً.
      if (!account || account.status !== 'active') {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "CLIENT_ACCOUNT_SUSPENDED: حساب العميل الرسمي موقوف أو معلق.",
        });
      }

      const [wallet] = await db
        .select({ balance: wallets.balance })
        .from(wallets)
        .where(eq(wallets.userId, effectiveAccountId))
        .limit(1);

      const balance = wallet ? parseFloat(wallet.balance) : 0;

      if (balance <= 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: currentUser.role === 'client_staff'
            ? "CLIENT_ACCOUNT_INSUFFICIENT_BALANCE: رصيد حساب العميل الرسمي صفر. لا يمكن تنفيذ عمليات جديدة حتى إعادة الشحن."
            : "INSUFFICIENT_BALANCE: رصيدك صفر. يرجى إعادة الشحن لمتابعة استخدام الخدمة.",
        });
      }
    }

    return next({
      ctx: {
        ...ctx,
        user: currentUser,
      },
    });
  }),
);
