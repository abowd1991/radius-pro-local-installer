import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, and, ne, or, sql } from "drizzle-orm";
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
        username: z.string().min(3, "Username must be at least 3 characters").max(64),
        email: z.string().email("Invalid email"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        role: z.literal("client_staff"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      // Only client_owner can create sub-admins
      if (ctx.user.role !== "client_owner" && ctx.user.role !== "client") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only client owners can create sub-admins",
        });
      }

      // A staff account is always a local username/password account.
      // Both identifiers must remain globally unique because either can be used at login.
      const [existingUser] = await db
        .select()
        .from(users)
        .where(or(eq(users.email, input.email), eq(users.username, input.username)));

      if (existingUser) {
        if (existingUser.username === input.username) {
          throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم مستخدم بالفعل" });
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already exists",
        });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(input.password, 10);

      // Create sub-admin with tenantId = client_owner's id
      const [newSubAdmin] = await db.insert(users).values({
        name: input.name,
        username: input.username,
        email: input.email,
        passwordHash,
        loginMethod: "traditional",
        emailVerified: true,
        onboardingCompleted: true,
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
          username: input.username,
          role: input.role,
        },
      });

      return {
        id: newSubAdmin.insertId,
        name: input.name,
        username: input.username,
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
    if (ctx.user.role !== "client_owner" && ctx.user.role !== "client" && ctx.user.role !== "owner" && ctx.user.role !== "super_admin") {
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
        username: users.username,
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
        username: z.string().min(3).max(64).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        role: z.literal("client_staff").optional(),
        status: z.enum(["active", "suspended", "trial"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      // Only client_owner can update sub-admins
      if (ctx.user.role !== "client_owner" && ctx.user.role !== "client") {
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
      if (input.username || input.email) {
        const [conflictingUser] = await db.select().from(users).where(and(
          ne(users.id, input.id),
          or(
            input.username ? eq(users.username, input.username) : sql`false`,
            input.email ? eq(users.email, input.email) : sql`false`,
          ),
        )).limit(1);
        if (conflictingUser) {
          throw new TRPCError({ code: "CONFLICT", message: "اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل" });
        }
      }
      if (input.username) updateData.username = input.username;
      if (input.email) updateData.email = input.email;
      if (input.role) updateData.role = input.role;
      if (input.status) updateData.status = input.status;
      if (input.password) {
        updateData.passwordHash = await bcrypt.hash(input.password, 10);
        updateData.loginMethod = "traditional";
        updateData.emailVerified = true;
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
      if (ctx.user.role !== "client_owner" && ctx.user.role !== "client") {
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
