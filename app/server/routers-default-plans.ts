import { router, superAdminProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { permissionPlans } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Default Permission Plans Router
 * 
 * Manages default permission plans for each role.
 * When a new user registers, they are automatically assigned the default plan for their role.
 */

export const defaultPlansRouter = router({
  /**
   * Get default plan for a specific role
   */
  getDefaultPlan: superAdminProcedure
    .input(z.object({
      role: z.enum(["reseller", "client"]),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const [defaultPlan] = await db
        .select()
        .from(permissionPlans)
        .where(
          and(
            eq(permissionPlans.role, input.role),
            eq(permissionPlans.isDefault, true)
          )
        )
        .limit(1);

      return defaultPlan || null;
    }),

  /**
   * Set default plan for a role
   * - Unsets all other plans for this role
   * - Sets the specified plan as default
   */
  setDefaultPlan: superAdminProcedure
    .input(z.object({
      planId: z.number(),
      role: z.enum(["reseller", "client"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      // Verify plan exists and matches role
      const [plan] = await db
        .select()
        .from(permissionPlans)
        .where(eq(permissionPlans.id, input.planId))
        .limit(1);

      if (!plan) {
        throw new Error("Plan not found");
      }

      if (plan.role !== input.role) {
        throw new Error(`Plan role (${plan.role}) does not match requested role (${input.role})`);
      }

      // Unset all defaults for this role
      await db
        .update(permissionPlans)
        .set({ isDefault: false })
        .where(eq(permissionPlans.role, input.role));

      // Set new default
      await db
        .update(permissionPlans)
        .set({ isDefault: true })
        .where(eq(permissionPlans.id, input.planId));

      return { success: true, message: `Default plan set for ${input.role}` };
    }),

  /**
   * List all default plans
   */
  listDefaults: superAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    const defaults = await db
      .select()
      .from(permissionPlans)
      .where(eq(permissionPlans.isDefault, true));

    return defaults;
  }),
});
