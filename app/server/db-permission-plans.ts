import { getDb } from "./db";
import { 
  permissionGroups, 
  permissionPlans, 
  permissionPlanGroups,
  userPermissionOverrides,
  userMenuItemOverrides,
  users
} from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { resolveAllowedMenuItems } from "./domains/permissions/MenuAccessPolicy";

// ============================================================================
// PERMISSION GROUPS
// ============================================================================

export async function getAllPermissionGroups() {
  const db = await getDb();
  return await db.select().from(permissionGroups).orderBy(permissionGroups.id);
}

export async function getPermissionGroupById(id: number) {
  const db = await getDb();
  const [group] = await db.select().from(permissionGroups).where(eq(permissionGroups.id, id));
  return group;
}

export async function createPermissionGroup(data: {
  name: string;
  nameAr: string;
  description?: string;
  descriptionAr?: string;
  menuItems: string[];
  applicableRoles: string[];
}) {
  const db = await getDb();
  const [result] = await db.insert(permissionGroups).values(data);
  return result;
}

export async function updatePermissionGroup(id: number, data: Partial<{
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  menuItems: string[];
  applicableRoles: string[];
}>) {
  const db = await getDb();
  await db.update(permissionGroups).set(data).where(eq(permissionGroups.id, id));
}

export async function deletePermissionGroup(id: number) {
  const db = await getDb();
  // Delete all plan associations first
  await db.delete(permissionPlanGroups).where(eq(permissionPlanGroups.groupId, id));
  // Delete all user overrides
  await db.delete(userPermissionOverrides).where(eq(userPermissionOverrides.groupId, id));
  // Delete the group
  await db.delete(permissionGroups).where(eq(permissionGroups.id, id));
}

// ============================================================================
// PERMISSION PLANS
// ============================================================================

export async function getAllPermissionPlans() {
  const db = await getDb();
  return await db.select().from(permissionPlans).orderBy(permissionPlans.id);
}

export async function getPermissionPlanById(id: number) {
  const db = await getDb();
  const [plan] = await db.select().from(permissionPlans).where(eq(permissionPlans.id, id));
  return plan;
}

export async function getPermissionPlanWithGroups(planId: number) {
  const db = await getDb();
  const plan = await getPermissionPlanById(planId);
  if (!plan) return null;

  const planGroupsData = await db
    .select()
    .from(permissionPlanGroups)
    .where(eq(permissionPlanGroups.planId, planId));

  const groupIds = planGroupsData.map((pg: any) => pg.groupId);
  
  let groups: any[] = [];
  if (groupIds.length > 0) {
    groups = await db
      .select()
      .from(permissionGroups)
      .where(inArray(permissionGroups.id, groupIds));
  }

  return {
    ...plan,
    groups
  };
}

export async function createPermissionPlan(data: {
  name: string;
  nameAr: string;
  description?: string;
  descriptionAr?: string;
  role: "reseller" | "client";
  isDefault?: boolean;
  isActive?: boolean;
  groupIds: number[];
  allowedMenuItems?: string[];
}) {
  const db = await getDb();
  const { groupIds, ...planData } = data;

  // If this is set as default, unset other defaults for this role
  if (planData.isDefault) {
    await db
      .update(permissionPlans)
      .set({ isDefault: false })
      .where(eq(permissionPlans.role, planData.role));
  }

  const [result] = await db.insert(permissionPlans).values(planData);
  const planId = result.insertId;

  // Add group associations
  if (groupIds && groupIds.length > 0) {
    await db.insert(permissionPlanGroups).values(
      groupIds.map(groupId => ({ planId: Number(planId), groupId }))
    );
  }

  return { id: planId };
}

export async function updatePermissionPlan(id: number, data: {
  name?: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  role?: "reseller" | "client";
  isDefault?: boolean;
  isActive?: boolean;
  groupIds?: number[];
  allowedMenuItems?: string[];
}) {
  const db = await getDb();
  const { groupIds, ...planData } = data;

  // If this is set as default, unset other defaults for this role
  if (planData.isDefault && planData.role) {
    await db
      .update(permissionPlans)
      .set({ isDefault: false })
      .where(and(
        eq(permissionPlans.role, planData.role),
        eq(permissionPlans.id, id)
      ));
  }

  await db.update(permissionPlans).set(planData).where(eq(permissionPlans.id, id));

  // Update group associations if provided
  if (groupIds !== undefined) {
    // Delete existing associations
    await db.delete(permissionPlanGroups).where(eq(permissionPlanGroups.planId, id));
    
    // Add new associations
    if (groupIds.length > 0) {
      await db.insert(permissionPlanGroups).values(
        groupIds.map(groupId => ({ planId: id, groupId }))
      );
    }
  }
}

export async function deletePermissionPlan(id: number) {
  const db = await getDb();
  // Check if any users are using this plan
  const usersWithPlan = await db
    .select()
    .from(users)
    .where(eq(users.permissionPlanId, id))
    .limit(1);

  if (usersWithPlan.length > 0) {
    throw new Error("Cannot delete plan: users are currently assigned to this plan");
  }

  // Delete plan associations
  await db.delete(permissionPlanGroups).where(eq(permissionPlanGroups.planId, id));
  
  // Delete the plan
  await db.delete(permissionPlans).where(eq(permissionPlans.id, id));
}

export async function getDefaultPlanForRole(role: "reseller" | "client") {
  const db = await getDb();
  const [plan] = await db
    .select()
    .from(permissionPlans)
    .where(and(
      eq(permissionPlans.role, role),
      eq(permissionPlans.isDefault, true),
      eq(permissionPlans.isActive, true)
    ))
    .limit(1);

  return plan;
}

// ============================================================================
// USER PERMISSION OVERRIDES
// ============================================================================

export async function getUserPermissionOverrides(userId: number) {
  const db = await getDb();
  return await db
    .select()
    .from(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, userId));
}

export async function createUserPermissionOverride(data: {
  userId: number;
  groupId: number;
  isGranted: boolean;
  createdBy: number;
  reason?: string;
}) {
  const db = await getDb();
  // Check if override already exists
  const existing = await db
    .select()
    .from(userPermissionOverrides)
    .where(and(
      eq(userPermissionOverrides.userId, data.userId),
      eq(userPermissionOverrides.groupId, data.groupId)
    ))
    .limit(1);

  if (existing.length > 0) {
    // Update existing override
    await db
      .update(userPermissionOverrides)
      .set({
        isGranted: data.isGranted,
        reason: data.reason,
        createdBy: data.createdBy
      })
      .where(eq(userPermissionOverrides.id, existing[0].id));
    return { id: existing[0].id };
  }

  // Create new override
  const [result] = await db.insert(userPermissionOverrides).values(data);
  return { id: result.insertId };
}

export async function deleteUserPermissionOverride(userId: number, groupId: number) {
  const db = await getDb();
  await db
    .delete(userPermissionOverrides)
    .where(and(
      eq(userPermissionOverrides.userId, userId),
      eq(userPermissionOverrides.groupId, groupId)
    ));
}

export async function deleteAllUserPermissionOverrides(userId: number) {
  const db = await getDb();
  await db
    .delete(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, userId));
}

// ============================================================================
// USER MENU ITEM OVERRIDES
// ============================================================================

export async function getUserMenuItemOverrides(userId: number) {
  const db = await getDb();
  return await db.select().from(userMenuItemOverrides).where(eq(userMenuItemOverrides.userId, userId));
}

export async function upsertUserMenuItemOverride(data: {
  userId: number;
  menuPath: string;
  isGranted: boolean;
  createdBy: number;
  reason?: string;
}) {
  const db = await getDb();
  const [existing] = await db.select().from(userMenuItemOverrides).where(and(
    eq(userMenuItemOverrides.userId, data.userId),
    eq(userMenuItemOverrides.menuPath, data.menuPath)
  )).limit(1);

  if (existing) {
    await db.update(userMenuItemOverrides).set({
      isGranted: data.isGranted,
      createdBy: data.createdBy,
      reason: data.reason,
    }).where(eq(userMenuItemOverrides.id, existing.id));
    return { id: existing.id };
  }

  const [result] = await db.insert(userMenuItemOverrides).values(data);
  return { id: result.insertId };
}

export async function deleteUserMenuItemOverride(userId: number, menuPath: string) {
  const db = await getDb();
  await db.delete(userMenuItemOverrides).where(and(
    eq(userMenuItemOverrides.userId, userId),
    eq(userMenuItemOverrides.menuPath, menuPath)
  ));
}

// ============================================================================
// USER EFFECTIVE PERMISSIONS
// ============================================================================

export async function getUserEffectivePermissions(userId: number) {
  console.log('[getUserEffectivePermissions] Called with userId:', userId);
  const db = await getDb();
  // Get user
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  console.log('[getUserEffectivePermissions] User found:', user);
  if (!user) {
    console.log('[getUserEffectivePermissions] User not found, returning null');
    return null;
  }

  // Owner has all permissions
  if (user.role === "owner" || user.role === "super_admin") {
    const allGroups = await getAllPermissionGroups();
    return {
      userId,
      role: user.role,
      planId: null,
      planName: "Full Access",
      groups: allGroups,
      overrides: [],
      menuItemOverrides: [],
      allowedMenuItems: resolveAllowedMenuItems({ planMenuItems: null, planGroups: allGroups, overrides: [] }),
    };
  }

  // Get user's plan
  let planGroups: any[] = [];
  let planName = "No Plan";
  let planMenuItems: unknown = null;
  
  if (user.permissionPlanId) {
    const plan = await getPermissionPlanWithGroups(user.permissionPlanId);
    if (plan) {
      planGroups = plan.groups;
      planName = plan.name;
      planMenuItems = plan.allowedMenuItems;
    }
  }

  // Get user's group and menu-item overrides
  const overrides = await getUserPermissionOverrides(userId);
  const menuItemOverrides = await getUserMenuItemOverrides(userId);

  // Calculate effective permissions
  const groupMap = new Map();
  
  // Add plan groups
  planGroups.forEach(group => {
    groupMap.set(group.id, { ...group, source: "plan" });
  });

  // Apply overrides
  for (const override of overrides) {
    if (override.isGranted) {
      // Grant access (add if not exists)
      if (!groupMap.has(override.groupId)) {
        // Fetch group details
        const db = await getDb();
        const [group] = await db.select()
          .from(permissionGroups)
          .where(eq(permissionGroups.id, override.groupId));
        if (group) {
          groupMap.set(override.groupId, { ...group, source: "override_grant" });
        }
      }
    } else {
      // Revoke access (remove if exists)
      groupMap.delete(override.groupId);
    }
  }

  return {
    userId,
    role: user.role,
    planId: user.permissionPlanId,
    planName,
    groups: Array.from(groupMap.values()),
    overrides,
    menuItemOverrides,
    allowedMenuItems: resolveAllowedMenuItems({
      planMenuItems,
      planGroups: Array.from(groupMap.values()),
      overrides: menuItemOverrides,
    }),
  };
}
