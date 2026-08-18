import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { featureAccessControl, users } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { assertCanManageClientPermissions } from "../security/tenantAccess";

async function getManagedClientOrThrow(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, actor: { id: number; role: string }, userId: number) {
  const [client] = await db
    .select({ id: users.id, role: users.role, ownerId: users.ownerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
  assertCanManageClientPermissions(actor, client);
  return client;
}

export const featureAccessRouter = router({
  // Get user permissions
  getUserPermissions: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Only owner can view permissions
      if (ctx.user.role !== "owner" && ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owner can view permissions",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await getManagedClientOrThrow(db, ctx.user, input.userId);

      const permissions = await db
        .select()
        .from(featureAccessControl)
        .where(eq(featureAccessControl.userId, input.userId))
        .limit(1);

      if (permissions.length === 0) {
        // Return default permissions
        return {
          canViewDashboard: true,
          canViewActiveSessions: true,
          canViewRadiusLogs: false,
          canViewNasHealth: true,
          canManageNas: true,
          canViewVpn: false,
          canManageMikrotik: true,
          canManageSubscribers: true,
          canViewClients: false,
          canManagePlans: true,
          canAccessRadiusControl: false,
          canManageCards: true,
          canPrintCards: true,
          canViewWallet: true,
          canViewInvoices: true,
          canViewSubscriptions: true,
          canViewBillingDashboard: false,
          canViewSaasPlans: false,
          canViewReports: true,
          canViewBandwidthAnalytics: true,
          canViewSettings: true,
          canViewAuditLog: false,
          canAccessSupport: true,
          canManageSms: false,
        };
      }

      return permissions[0];
    }),

  // Update user permissions
  updatePermissions: protectedProcedure
    .input(
      z.object({
        userId: z.number(),
        permissions: z.object({
          canViewDashboard: z.boolean().optional(),
          canViewActiveSessions: z.boolean().optional(),
          canViewRadiusLogs: z.boolean().optional(),
          canViewNasHealth: z.boolean().optional(),
          canManageNas: z.boolean().optional(),
          canViewVpn: z.boolean().optional(),
          canManageMikrotik: z.boolean().optional(),
          canManageSubscribers: z.boolean().optional(),
          canViewClients: z.boolean().optional(),
          canManagePlans: z.boolean().optional(),
          canAccessRadiusControl: z.boolean().optional(),
          canManageCards: z.boolean().optional(),
          canPrintCards: z.boolean().optional(),
          canViewWallet: z.boolean().optional(),
          canViewInvoices: z.boolean().optional(),
          canViewSubscriptions: z.boolean().optional(),
          canViewBillingDashboard: z.boolean().optional(),
          canViewSaasPlans: z.boolean().optional(),
          canViewReports: z.boolean().optional(),
          canViewBandwidthAnalytics: z.boolean().optional(),
          canViewSettings: z.boolean().optional(),
          canViewAuditLog: z.boolean().optional(),
          canAccessSupport: z.boolean().optional(),
          canManageSms: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only owner can update permissions
      if (ctx.user.role !== "owner" && ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owner can update permissions",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await getManagedClientOrThrow(db, ctx.user, input.userId);

      // Check if permissions exist
      const existing = await db
        .select()
        .from(featureAccessControl)
        .where(eq(featureAccessControl.userId, input.userId))
        .limit(1);

      if (existing.length === 0) {
        // Insert new permissions
        await db.insert(featureAccessControl).values({
          userId: input.userId,
          ...input.permissions,
        });
      } else {
        // Update existing permissions
        await db
          .update(featureAccessControl)
          .set(input.permissions)
          .where(eq(featureAccessControl.userId, input.userId));
      }

      return { success: true };
    }),

  // Get all clients with their permission status
  listClientsWithPermissions: protectedProcedure.query(async ({ ctx }) => {
    // Only owner can list clients
    if (ctx.user.role !== "owner" && ctx.user.role !== "super_admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only owner can list clients",
      });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const clientsList = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        username: users.username,
        status: users.status,
        role: users.role,
      })
      .from(users)
      .where(ctx.user.role === "super_admin"
        ? eq(users.role, "client")
        : and(eq(users.role, "client"), eq(users.ownerId, ctx.user.id)));

    // Check which clients have custom permissions
    const clientsWithPermissionStatus = await Promise.all(
      clientsList.map(async (client: any) => {
        const permissions = await db
          .select()
          .from(featureAccessControl)
          .where(eq(featureAccessControl.userId, client.id))
          .limit(1);

        return {
          ...client,
          hasCustomPermissions: permissions.length > 0,
        };
      })
    );

    return clientsWithPermissionStatus;
  }),
});
