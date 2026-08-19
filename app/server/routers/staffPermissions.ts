import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { userMenuItemOverrides, userPermissionOverrides, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import * as permissionDb from "../db-permission-plans";
import { isMenuPathAllowed } from "../domains/permissions/MenuAccessPolicy";

async function assertOwnStaff(actorId: number, staffId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const [staff] = await db.select({ id: users.id, role: users.role, tenantId: users.tenantId })
    .from(users).where(and(eq(users.id, staffId), eq(users.tenantId, actorId))).limit(1);
  if (!staff || staff.role !== "client_staff") throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found" });
  return staff;
}

async function getClientScope(clientId: number) {
  const scope = await permissionDb.getUserEffectivePermissions(clientId);
  if (!scope) throw new TRPCError({ code: "NOT_FOUND", message: "Client permission scope not found" });
  return scope;
}

export const staffPermissionsRouter = router({
  getClientScope: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "client_owner" && ctx.user.role !== "client") throw new TRPCError({ code: "FORBIDDEN" });
    const scope = await getClientScope(ctx.user.id);
    return { groups: scope.groups, allowedMenuItems: Array.from(new Set([...scope.allowedMenuItems, "/settings"])) };
  }),

  get: protectedProcedure.input(z.object({ staffId: z.number() })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "client_owner" && ctx.user.role !== "client") throw new TRPCError({ code: "FORBIDDEN" });
    await assertOwnStaff(ctx.user.id, input.staffId);
    const permissions = await permissionDb.getUserEffectivePermissions(input.staffId);
    return { groups: permissions?.groups ?? [], allowedMenuItems: permissions?.allowedMenuItems ?? [] };
  }),

  set: protectedProcedure.input(z.object({
    staffId: z.number(),
    groupIds: z.array(z.number()).max(30),
    allowedMenuItems: z.array(z.string().regex(/^\//)).max(80),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "client_owner" && ctx.user.role !== "client") throw new TRPCError({ code: "FORBIDDEN" });
    await assertOwnStaff(ctx.user.id, input.staffId);
    const scope = await getClientScope(ctx.user.id);
    const permittedGroupIds = new Set(scope.groups.map((group: any) => group.id));
    if (input.groupIds.some((id) => !permittedGroupIds.has(id))) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot grant a group outside your own permissions" });
    if (input.allowedMenuItems.some((path) => path !== "/settings" && !isMenuPathAllowed(path, scope.allowedMenuItems))) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot grant a menu item outside your own permissions" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.transaction(async (tx: any) => {
      await tx.delete(userPermissionOverrides).where(and(
        eq(userPermissionOverrides.userId, input.staffId),
        eq(userPermissionOverrides.createdBy, ctx.user.id),
        eq(userPermissionOverrides.reason, "client_staff_delegation"),
      ));
      await tx.delete(userMenuItemOverrides).where(and(
        eq(userMenuItemOverrides.userId, input.staffId),
        eq(userMenuItemOverrides.createdBy, ctx.user.id),
        eq(userMenuItemOverrides.reason, "client_staff_delegation"),
      ));
      if (input.groupIds.length) await tx.insert(userPermissionOverrides).values(input.groupIds.map((groupId) => ({ userId: input.staffId, groupId, isGranted: true, createdBy: ctx.user.id, reason: "client_staff_delegation" })));
      if (input.allowedMenuItems.length) await tx.insert(userMenuItemOverrides).values(input.allowedMenuItems.map((menuPath) => ({ userId: input.staffId, menuPath, isGranted: true, createdBy: ctx.user.id, reason: "client_staff_delegation" })));
    });
    return { success: true };
  }),
});
