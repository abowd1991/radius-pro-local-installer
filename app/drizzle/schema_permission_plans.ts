import { mysqlTable, int, varchar, text, boolean, timestamp, mysqlEnum, json } from "drizzle-orm/mysql-core";

// ============================================================================
// PERMISSION PLANS SYSTEM (Global Plans like SaaS Platforms)
// ============================================================================

/**
 * Permission Groups - Define logical groups of menu items
 * Each group represents a section in the sidebar (e.g., "إدارة العملاء", "البطاقات")
 */
export const permissionGroups = mysqlTable("permission_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(), // e.g., "client_management"
  nameAr: varchar("nameAr", { length: 100 }).notNull(), // e.g., "إدارة العملاء"
  description: text("description"),
  descriptionAr: text("descriptionAr"),
  // Menu items that belong to this group (JSON array of paths)
  menuItems: json("menuItems").notNull(), // e.g., ["/clients", "/users-management"]
  // Applicable roles
  applicableRoles: json("applicableRoles").notNull(), // e.g., ["owner", "reseller", "client"]
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PermissionGroup = typeof permissionGroups.$inferSelect;
export type InsertPermissionGroup = typeof permissionGroups.$inferInsert;

/**
 * Permission Plans - Predefined plans with sets of permission groups
 * Examples: "Basic Client", "Pro Client", "Reseller Basic", "Reseller Pro"
 */
export const permissionPlans = mysqlTable("permission_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // e.g., "Basic Client"
  nameAr: varchar("nameAr", { length: 100 }).notNull(), // e.g., "عميل أساسي"
  description: text("description"),
  descriptionAr: text("descriptionAr"),
  // Target role for this plan
  role: mysqlEnum("role", ["reseller", "client"]).notNull(),
  // Is this the default plan for new users of this role?
  isDefault: boolean("isDefault").default(false).notNull(),
  // Status
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PermissionPlan = typeof permissionPlans.$inferSelect;
export type InsertPermissionPlan = typeof permissionPlans.$inferInsert;

/**
 * Permission Plan Groups - Many-to-many relationship
 * Links permission plans to their included permission groups
 */
export const permissionPlanGroups = mysqlTable("permission_plan_groups", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull(),
  groupId: int("groupId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PermissionPlanGroup = typeof permissionPlanGroups.$inferSelect;
export type InsertPermissionPlanGroup = typeof permissionPlanGroups.$inferInsert;

/**
 * User Permission Overrides - Exceptions for specific users
 * Allows granting or revoking specific permission groups without changing the plan
 */
export const userPermissionOverrides = mysqlTable("user_permission_overrides", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId").notNull(),
  // true = grant access, false = revoke access
  isGranted: boolean("isGranted").notNull(),
  // Who made this override
  createdBy: int("createdBy").notNull(), // Owner user ID
  reason: text("reason"), // Optional reason for the override
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPermissionOverride = typeof userPermissionOverrides.$inferSelect;
export type InsertUserPermissionOverride = typeof userPermissionOverrides.$inferInsert;
