/**
 * Permissions Service
 * Defines role-based access control for the application
 */

// Define all possible actions
export type Action = "view" | "create" | "edit" | "delete";

// Define all resources/pages in the system
export type Resource =
  | "dashboard"
  | "users"
  | "resellers"
  | "clients"
  | "plans"
  | "cards"
  | "vouchers"
  | "nas"
  | "sessions"
  | "invoices"
  | "reports"
  | "settings"
  | "backups"
  | "support"
  | "subscriptions"
  | "print_cards"
  | "mikrotik_setup";

// Define user roles
export type Role = "super_admin" | "reseller" | "client" | "support";

// Permission matrix type
type PermissionMatrix = {
  [role in Role]: {
    [resource in Resource]?: Action[];
  };
};

/**
 * Permission Matrix
 * Defines what each role can do on each resource
 */
const permissionMatrix: PermissionMatrix = {
  // Super Admin - Full access to everything
  super_admin: {
    dashboard: ["view"],
    users: ["view", "create", "edit", "delete"],
    resellers: ["view", "create", "edit", "delete"],
    clients: ["view", "create", "edit", "delete"],
    plans: ["view", "create", "edit", "delete"],
    cards: ["view", "create", "edit", "delete"],
    vouchers: ["view", "create", "edit", "delete"],
    nas: ["view", "create", "edit", "delete"],
    sessions: ["view", "delete"],
    invoices: ["view", "create", "edit", "delete"],
    reports: ["view"],
    settings: ["view", "edit"],
    backups: ["view", "create", "delete"],
    support: ["view", "create", "edit", "delete"],
    subscriptions: ["view", "create", "edit", "delete"],
    print_cards: ["view", "create"],
    mikrotik_setup: ["view"],
  },

  // Reseller - Manage their own clients and cards
  reseller: {
    dashboard: ["view"],
    clients: ["view", "create", "edit"],
    plans: ["view"],
    cards: ["view", "create"],
    vouchers: ["view", "create", "edit", "delete"],
    nas: ["view", "create", "edit", "delete"],
    sessions: ["view"],
    invoices: ["view"],
    reports: ["view"],
    settings: ["view", "edit"],
    support: ["view", "create"],
    print_cards: ["view", "create"],
    mikrotik_setup: ["view"],
  },

  // Client - View their own data only
  client: {
    dashboard: ["view"],
    plans: ["view"],
    cards: ["view"],
    vouchers: ["view", "create", "edit", "delete"],
    nas: ["view", "create", "edit", "delete"],
    sessions: ["view"],
    invoices: ["view"],
    reports: ["view"],
    settings: ["view", "edit"],
    support: ["view", "create"],
    print_cards: ["view", "create"],
    mikrotik_setup: ["view"],
  },

  // Support - View only, no financial access
  support: {
    dashboard: ["view"],
    users: ["view"],
    clients: ["view"],
    resellers: ["view"],
    cards: ["view"],
    nas: ["view"],
    sessions: ["view"],
    support: ["view", "create", "edit"],
    // No access to: invoices, reports (financial), settings, backups, subscriptions
  },
};

/**
 * Check if a role has permission to perform an action on a resource
 */
export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action
): boolean {
  const rolePermissions = permissionMatrix[role];
  if (!rolePermissions) return false;

  const resourcePermissions = rolePermissions[resource];
  if (!resourcePermissions) return false;

  return resourcePermissions.includes(action);
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): { [resource in Resource]?: Action[] } {
  return permissionMatrix[role] || {};
}

/**
 * Get all resources a role can access
 */
export function getAccessibleResources(role: Role): Resource[] {
  const permissions = permissionMatrix[role];
  if (!permissions) return [];
  return Object.keys(permissions) as Resource[];
}

/**
 * Check if a role can access a resource (any action)
 */
export function canAccessResource(role: Role, resource: Resource): boolean {
  const permissions = permissionMatrix[role];
  if (!permissions) return false;
  return resource in permissions;
}

/**
 * Get all actions a role can perform on a resource
 */
export function getResourceActions(role: Role, resource: Resource): Action[] {
  const permissions = permissionMatrix[role];
  if (!permissions) return [];
  return permissions[resource] || [];
}

/**
 * Check if role is admin (super_admin)
 */
export function isAdmin(role: Role): boolean {
  return role === "super_admin";
}

/**
 * Check if role can see financial data
 */
export function canSeeFinancials(role: Role): boolean {
  return role === "super_admin" || role === "reseller";
}

/**
 * Check if role can manage users
 */
export function canManageUsers(role: Role): boolean {
  return role === "super_admin";
}

/**
 * Get menu items based on role
 */
export function getMenuItemsForRole(role: Role): Resource[] {
  const allMenuItems: Resource[] = [
    "dashboard",
    "users",
    "resellers",
    "clients",
    "plans",
    "cards",
    "nas",
    "sessions",
    "invoices",
    "reports",
    "settings",
    "backups",
    "support",
    "subscriptions",
    "print_cards",
  ];

  return allMenuItems.filter((item) => canAccessResource(role, item));
}

/**
 * Permission check result with reason
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Detailed permission check with reason
 */
export function checkPermission(
  role: Role,
  resource: Resource,
  action: Action
): PermissionCheckResult {
  if (!role) {
    return { allowed: false, reason: "لم يتم تحديد الدور" };
  }

  const rolePermissions = permissionMatrix[role];
  if (!rolePermissions) {
    return { allowed: false, reason: `الدور "${role}" غير معروف` };
  }

  const resourcePermissions = rolePermissions[resource];
  if (!resourcePermissions) {
    return { allowed: false, reason: `لا يمكنك الوصول إلى "${resource}"` };
  }

  if (!resourcePermissions.includes(action)) {
    return { allowed: false, reason: `لا يمكنك "${action}" في "${resource}"` };
  }

  return { allowed: true };
}

/**
 * Arabic labels for roles
 */
export const roleLabels: { [key in Role]: string } = {
  super_admin: "مدير النظام",
  reseller: "موزع",
  client: "عميل",
  support: "دعم فني",
};

/**
 * Arabic labels for actions
 */
export const actionLabels: { [key in Action]: string } = {
  view: "عرض",
  create: "إنشاء",
  edit: "تعديل",
  delete: "حذف",
};

/**
 * Arabic labels for resources
 */
export const resourceLabels: { [key in Resource]: string } = {
  dashboard: "لوحة التحكم",
  users: "المستخدمين",
  resellers: "الموزعين",
  clients: "العملاء",
  plans: "الخطط",
  cards: "الكروت",
  vouchers: "الكروت والبطاقات",
  nas: "أجهزة NAS",
  sessions: "الجلسات",
  invoices: "الفواتير",
  reports: "التقارير",
  settings: "الإعدادات",
  backups: "النسخ الاحتياطي",
  support: "الدعم الفني",
  subscriptions: "الاشتراكات",
  print_cards: "طباعة البطاقات",
  mikrotik_setup: "إعداد MikroTik",
};
