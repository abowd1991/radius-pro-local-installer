import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as permissionDb from "./db-permission-plans";

// ============================================================================
// PERMISSION GROUPS ROUTER
// ============================================================================

export const permissionGroupsRouter = router({
  // List all permission groups
  list: protectedProcedure
    .query(async ({ ctx }) => {
      // Only owner can manage permission groups
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owner can view permission groups" });
      }

      return await permissionDb.getAllPermissionGroups();
    }),

  // Get single permission group
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const group = await permissionDb.getPermissionGroupById(input.id);
      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Permission group not found" });
      }

      return group;
    }),

  // Create permission group
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      nameAr: z.string().min(1),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      menuItems: z.array(z.string()),
      applicableRoles: z.array(z.string())
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return await permissionDb.createPermissionGroup(input);
    }),

  // Update permission group
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      nameAr: z.string().min(1).optional(),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      menuItems: z.array(z.string()).optional(),
      applicableRoles: z.array(z.string()).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { id, ...data } = input;
      await permissionDb.updatePermissionGroup(id, data);
      return { success: true };
    }),

  // Delete permission group
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await permissionDb.deletePermissionGroup(input.id);
      return { success: true };
    }),
});

// ============================================================================
// PERMISSION PLANS ROUTER
// ============================================================================

export const permissionPlansRouter = router({
  // List all permission plans
  list: protectedProcedure
    .query(async ({ ctx }) => {
      // Only owner can manage permission plans
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only owner can view permission plans" });
      }

      return await permissionDb.getAllPermissionPlans();
    }),

  // Get single permission plan with groups
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const plan = await permissionDb.getPermissionPlanWithGroups(input.id);
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Permission plan not found" });
      }

      return plan;
    }),

  // Create permission plan
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      nameAr: z.string().min(1),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      role: z.enum(["reseller", "client"]),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
      groupIds: z.array(z.number()),
      allowedMenuItems: z.array(z.string().regex(/^\//)).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return await permissionDb.createPermissionPlan(input);
    }),

  // Update permission plan
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      nameAr: z.string().min(1).optional(),
      description: z.string().optional(),
      descriptionAr: z.string().optional(),
      role: z.enum(["reseller", "client"]).optional(),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
      groupIds: z.array(z.number()).optional(),
      allowedMenuItems: z.array(z.string().regex(/^\//)).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { id, ...data } = input;
      await permissionDb.updatePermissionPlan(id, data);
      return { success: true };
    }),

  // Delete permission plan
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      try {
        await permissionDb.deletePermissionPlan(input.id);
        return { success: true };
      } catch (error: any) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: error.message || "Failed to delete permission plan" 
        });
      }
    }),

  // Get default plan for role
  getDefaultForRole: protectedProcedure
    .input(z.object({ role: z.enum(["reseller", "client"]) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return await permissionDb.getDefaultPlanForRole(input.role);
    }),
});

// ============================================================================
// USER PERMISSION OVERRIDES ROUTER
// ============================================================================

export const userPermissionOverridesRouter = router({
  // Get user's permission overrides
  getUserOverrides: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return await permissionDb.getUserPermissionOverrides(input.userId);
    }),

  // Create or update user permission override
  upsert: protectedProcedure
    .input(z.object({
      userId: z.number(),
      groupId: z.number(),
      isGranted: z.boolean(),
      reason: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return await permissionDb.createUserPermissionOverride({
        ...input,
        createdBy: ctx.user.id
      });
    }),

  // Delete user permission override
  delete: protectedProcedure
    .input(z.object({
      userId: z.number(),
      groupId: z.number()
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await permissionDb.deleteUserPermissionOverride(input.userId, input.groupId);
      return { success: true };
    }),

  // Delete all user permission overrides
  deleteAll: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await permissionDb.deleteAllUserPermissionOverrides(input.userId);
      return { success: true };
  }),
});

// ============================================================================
// USER MENU ITEM OVERRIDES ROUTER
// ============================================================================

export const userMenuItemOverridesRouter = router({
  getUserOverrides: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") throw new TRPCError({ code: "FORBIDDEN" });
      return permissionDb.getUserMenuItemOverrides(input.userId);
    }),

  upsert: protectedProcedure
    .input(z.object({
      userId: z.number(),
      menuPath: z.string().regex(/^\//),
      isGranted: z.boolean(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") throw new TRPCError({ code: "FORBIDDEN" });
      return permissionDb.upsertUserMenuItemOverride({ ...input, createdBy: ctx.user.id });
    }),

  delete: protectedProcedure
    .input(z.object({ userId: z.number(), menuPath: z.string().regex(/^\//) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "owner") throw new TRPCError({ code: "FORBIDDEN" });
      await permissionDb.deleteUserMenuItemOverride(input.userId, input.menuPath);
      return { success: true };
    }),
});

// ============================================================================
// USER EFFECTIVE PERMISSIONS ROUTER
// ============================================================================

export const userEffectivePermissionsRouter = router({
  // Get user's effective permissions (plan + overrides)
  get: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      console.log('[userEffectivePermissions.get] Called with:', { userId: input.userId, ctxUserId: ctx.user.id, role: ctx.user.role });
      
      // Users can get their own permissions, owner can get anyone's
      const targetUserId = input.userId || ctx.user.id;
      
      if (ctx.user.role !== "owner" && targetUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const result = await permissionDb.getUserEffectivePermissions(targetUserId);
      console.log('[userEffectivePermissions.get] Result:', JSON.stringify(result, null, 2));
      return result;
    }),
});
