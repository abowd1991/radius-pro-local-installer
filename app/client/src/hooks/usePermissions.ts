import { useAuth } from "@/_core/hooks/useAuth";

// Define types matching backend
export type Action = "view" | "create" | "edit" | "delete";

export type Resource =
  | "dashboard"
  | "users"
  | "resellers"
  | "clients"
  | "plans"
  | "cards"
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

export type Role = "super_admin" | "reseller" | "client" | "support";

/**
 * Hook to check user permissions
 */
export function usePermissions() {
  const { user } = useAuth();

  const hasPermission = (resource: Resource, action: Action): boolean => {
    if (!user) return false;
    
    const permissions = (user as any).permissions;
    if (!permissions) return false;

    const resourcePermissions = permissions[resource];
    if (!resourcePermissions) return false;

    return resourcePermissions.includes(action);
  };

  const canAccess = (resource: Resource): boolean => {
    if (!user) return false;
    
    const permissions = (user as any).permissions;
    if (!permissions) return false;

    return resource in permissions;
  };

  const canSeeFinancials = (): boolean => {
    if (!user) return false;
    return (user as any).canSeeFinancials === true;
  };

  const isAdmin = (): boolean => {
    if (!user) return false;
    return (user as any).isAdmin === true;
  };

  const isSupport = (): boolean => {
    if (!user) return false;
    return user.role === "support";
  };

  const getRole = (): Role | null => {
    if (!user) return null;
    return user.role as Role;
  };

  return {
    hasPermission,
    canAccess,
    canSeeFinancials,
    isAdmin,
    isSupport,
    getRole,
    user,
  };
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
