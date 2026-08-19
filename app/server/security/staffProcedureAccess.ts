import { TRPCError } from "@trpc/server";
import { getUserEffectivePermissions } from "../db-permission-plans";
import { isMenuPathAllowed } from "../domains/permissions/MenuAccessPolicy";

type StaffProcedureScope = { group?: string; menuPaths: string[] };

const ESSENTIAL_PROCEDURES = [
  "auth.me",
  "auth.logout",
  "auth.requestPasswordChange",
  "auth.resetPassword",
  "auth.verifyResetCode",
  "dashboard.",
  // مطلوب عالمياً لعرض حالة العميل الأصل بدقة في SubscriptionBanner، ولا يمنح
  // الموظف محفظة مستقلة أو صلاحية شحن/خصم.
  "wallet.getMyWallet",
  "userEffectivePermissions.",
  "notifications.getMyNotifications",
  "notifications.getUnreadCount",
  "notifications.markAsRead",
  "notifications.markAllAsRead",
  "feedback.",
];

const PROCEDURE_SCOPES: Record<string, StaffProcedureScope> = {
  "auth.getSettingsProfile": { menuPaths: ["/settings"] },
  "auth.updateProfile": { menuPaths: ["/settings"] },
  "auth.updateAvatar": { menuPaths: ["/settings"] },
  "auth.updateCurrency": { menuPaths: ["/settings"] },
  "vouchers.": { group: "cards_vouchers", menuPaths: ["/vouchers", "/batch-cards", "/manual-cards", "/import-cards", "/print-cards", "/sms-cards"] },
  "plans.": { group: "cards_vouchers", menuPaths: ["/plans", "/vouchers", "/batch-cards", "/manual-cards", "/sms-cards"] },
  "templates.": { group: "cards_vouchers", menuPaths: ["/print-cards", "/batch-cards"] },
  "store.": { group: "cards_vouchers", menuPaths: ["/store-management"] },
  "salesDashboard.": { group: "cards_vouchers", menuPaths: ["/card-sales", "/vouchers", "/batch-cards"] },
  "reports.": { group: "reports_analytics", menuPaths: ["/reports"] },
  "analytics.": { group: "reports_analytics", menuPaths: ["/reports"] },
  "sessions.": { group: "network_management", menuPaths: ["/sessions"] },
  "nas.": { group: "network_management", menuPaths: ["/nas"] },
  "subscribers.": { group: "client_management", menuPaths: ["/subscribers"] },
  "tickets.": { group: "support_tickets", menuPaths: ["/support"] },
  "settings.": { menuPaths: ["/settings"] },
  "timezone.": { menuPaths: ["/settings"] },
  "notificationChannels.": { menuPaths: ["/settings"] },
};

function findScope(path: string): StaffProcedureScope | null {
  const key = Object.keys(PROCEDURE_SCOPES).find((prefix) => path.startsWith(prefix));
  return key ? PROCEDURE_SCOPES[key] : null;
}

/**
 * حماية مركزية لمسارات tRPC الخاصة بـ client_staff.
 * أي مسار غير مصنف ليس مسموحاً تلقائياً؛ فلا تكفي إخفاء عناصر القائمة وحدها.
 */
export async function assertClientStaffProcedureAccess(userId: number, path: string | undefined) {
  const procedurePath = path ?? "";
  if (ESSENTIAL_PROCEDURES.some((prefix) => procedurePath.startsWith(prefix))) return;

  const scope = findScope(procedurePath);
  if (!scope) {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية غير متاحة لحساب الموظف" });
  }

  const permissions = await getUserEffectivePermissions(userId);
  const hasGroup = !scope.group || (permissions?.groups?.some((group: { name: string }) => group.name === scope.group) ?? false);
  const hasMenuItem = scope.menuPaths.some((menuPath) => isMenuPathAllowed(menuPath, permissions?.allowedMenuItems ?? []));
  if (!hasGroup || !hasMenuItem) {
    throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية لهذه العملية" });
  }
}
