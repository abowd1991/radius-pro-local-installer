import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logAudit } from "./services/auditLogService";

/**
 * Sub-Admin Router
 * 
 * Allows client_owner to create and manage sub-admins (client_admin, client_staff)
 * Sub-admins inherit the tenant context from their parent client
 */

export const subAdminRouter = router({
  /**
   * Create a new sub-admin for the current client
   * Only client_owner can create sub-admins
   */
  createSubAdmin: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        role: z.enum(["client_admin", "client_staff"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      // Only client_owner can create sub-admins
      if (ctx.user.role !== "client_owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only client owners can create sub-admins",
        });
      }

      // Check if email already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email));

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already exists",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Create sub-admin with tenantId = client_owner's id
      const [newSubAdmin] = await db.insert(users).values({
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: input.role,
        tenantId: ctx.user.id, // Link to parent client
        status: "active",
      });

      // Log audit
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: "sub_admin_create",
        targetType: "user",
        targetId: newSubAdmin.insertId.toString(),
        targetName: input.name,
        method: "api",
        result: "success",
        details: {
          email: input.email,
          role: input.role,
        },
      });

      return {
        id: newSubAdmin.insertId,
        name: input.name,
        email: input.email,
        role: input.role,
      };
    }),

  /**
   * List all sub-admins for the current client
   */
  listMySubAdmins: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();

    // Owner/super_admin can see all sub-admins, client_owner can see only their own
    if (ctx.user.role !== "client_owner" && ctx.user.role !== "owner" && ctx.user.role !== "super_admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only owners and client owners can list sub-admins",
      });
    }

    // Get all users where tenantId = current user's id (or all if owner/super_admin)
    const subAdmins = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        ctx.user.role === "owner" || ctx.user.role === "super_admin"
          ? sql`${users.role} IN ('client_admin', 'client_staff')` // Owner sees all sub-admins
          : eq(users.tenantId, ctx.user.id) // Client owner sees only their own
      );

    return subAdmins;
  }),

  /**
   * Update a sub-admin
   */
  updateSubAdmin: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        role: z.enum(["client_admin", "client_staff"]).optional(),
        status: z.enum(["active", "suspended", "trial"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      // Only client_owner can update sub-admins
      if (ctx.user.role !== "client_owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only client owners can update sub-admins",
        });
      }

      // Verify the sub-admin belongs to this client
      const [subAdmin] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, input.id), eq(users.tenantId, ctx.user.id)));

      if (!subAdmin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sub-admin not found or does not belong to you",
        });
      }

      // Prepare update data
      const updateData: any = {};
      if (input.name) updateData.name = input.name;
      if (input.email) updateData.email = input.email;
      if (input.role) updateData.role = input.role;
      if (input.status) updateData.status = input.status;
      if (input.password) {
        updateData.password = await bcrypt.hash(input.password, 10);
      }

      // Update sub-admin
      await db.update(users).set(updateData).where(eq(users.id, input.id));

      // Log audit
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: "sub_admin_update",
        targetType: "user",
        targetId: input.id.toString(),
        targetName: subAdmin.name || "",
        method: "api",
        result: "success",
        details: updateData,
      });

      return { success: true };
    }),

  /**
   * Delete a sub-admin
   */
  deleteSubAdmin: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      // Only client_owner can delete sub-admins
      if (ctx.user.role !== "client_owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only client owners can delete sub-admins",
        });
      }

      // Verify the sub-admin belongs to this client
      const [subAdmin] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, input.id), eq(users.tenantId, ctx.user.id)));

      if (!subAdmin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sub-admin not found or does not belong to you",
        });
      }

      // Delete sub-admin
      await db.delete(users).where(eq(users.id, input.id));

      // Log audit
      await logAudit({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: "sub_admin_delete",
        targetType: "user",
        targetId: input.id.toString(),
        targetName: subAdmin.name || "",
        method: "api",
        result: "success",
        details: {
          email: subAdmin.email,
          role: subAdmin.role,
        },
      });

      return { success: true };
    }),
});
