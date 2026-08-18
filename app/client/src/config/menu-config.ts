import {
  LayoutDashboard,
  Users,
  CreditCard,
  FileText,
  Wallet,
  MessageSquare,
  Settings,
  Server,
  Package,
  Activity,
  Globe,
  Building2,
  Shield,
  Receipt,
  PieChart,
  Cog,
  Monitor,
  Wifi,
  Link2,
  History,
  Network,
  UserCheck,
  Printer,
  BarChart3,
  Database,
  Smartphone,
  Search,
  FileUp,
  Stethoscope,
  Megaphone,
  Bell,
  Router,
  Send,
  MessageCircle,
  Rocket,
  Timer,
  ShoppingBag,
  Star,
  type LucideIcon,
} from "lucide-react";

export type MenuSection = {
  id: string;
  icon: LucideIcon;
  label: string;
  labelAr: string;
  requiredPermissionGroup?: string; // Permission group key (e.g., 'client_management')
  requiredRole?: string[]; // Required roles (e.g., ['super_admin', 'owner'])
  items: {
    icon: LucideIcon;
    label: string;
    labelAr: string;
    path: string;
    requiredPermissionGroup?: string;
    requiredRole?: string[];
  }[];
};

/**
 * All menu sections in the system
 * Each section and item can have:
 * - requiredPermissionGroup: Permission group key required to view
 * - requiredRole: Specific roles required (bypasses permission check)
 */
export const ALL_MENU_SECTIONS: MenuSection[] = [
  // 1. Dashboard (Always visible)
  {
    id: "dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    labelAr: "لوحة التحكم",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", labelAr: "لوحة التحكم", path: "/dashboard" },
    ],
  },

  // 2. Monitoring (Network Management)
  {
    id: "monitoring",
    icon: Monitor,
    label: "Monitoring",
    labelAr: "المراقبة",
    requiredPermissionGroup: "network_management",
    items: [
      { icon: Wifi, label: "Active Sessions", labelAr: "الجلسات النشطة", path: "/sessions" },
      { icon: FileText, label: "RADIUS Logs", labelAr: "سجلات RADIUS", path: "/radius-logs", requiredRole: ["super_admin", "owner"] },
      { icon: Router, label: "Network Monitor", labelAr: "مراقبة الشبكة", path: "/network-monitor" },
      { icon: Shield, label: "Security Monitor", labelAr: "مراقبة الأمان", path: "/security-monitor", requiredRole: ["super_admin", "owner"] },
    ],
  },

  // 3. Infrastructure (NAS Management)
  {
    id: "infrastructure",
    icon: Globe,
    label: "Infrastructure",
    labelAr: "البنية التحتية",
    requiredPermissionGroup: "infrastructure_nas",
    items: [
      { icon: Server, label: "NAS Devices", labelAr: "أجهزة NAS", path: "/nas" },
      { icon: Monitor, label: "Winbox Access", labelAr: "Winbox عن بُعد", path: "/winbox" },
      { icon: Link2, label: "MikroTik Setup", labelAr: "إعداد MikroTik", path: "/mikrotik-setup" },
    ],
  },

  // 4. VPN Management
  {
    id: "vpn",
    icon: Globe,
    label: "VPN",
    labelAr: "VPN",
    requiredPermissionGroup: "vpn_management",
    items: [
      { icon: History, label: "VPN Logs", labelAr: "سجلات VPN", path: "/vpn-logs" },
      { icon: Shield, label: "VPN Management", labelAr: "لوحة تحكم VPN", path: "/vpn-management", requiredRole: ["super_admin", "owner"] },
    ],
  },

  // 5. Subscribers (tenant operations)
  {
    id: "users",
    icon: Users,
    label: "Subscribers",
    labelAr: "المشتركين",
    requiredPermissionGroup: "client_management",
    items: [
      { icon: UserCheck, label: "Subscribers", labelAr: "المشتركين", path: "/subscribers" },
      { icon: Users, label: "Staff Management", labelAr: "إدارة الموظفين", path: "/staff-management", requiredRole: ["client_owner"] },
    ],
  },

  // 6. Plans
  {
    id: "access",
    icon: Shield,
    label: "Plans",
    labelAr: "الخطط",
    requiredPermissionGroup: "cards_vouchers",
    items: [
      { icon: Package, label: "Plans", labelAr: "الخطط", path: "/plans" },
      { icon: Server, label: "RADIUS Control", labelAr: "لوحة تحكم RADIUS", path: "/radius-control", requiredRole: ["super_admin", "owner"] },
    ],
  },

  // 7. Cards & Vouchers
  {
    id: "cards",
    icon: CreditCard,
    label: "Cards & Vouchers",
    labelAr: "البطاقات",
    requiredPermissionGroup: "cards_vouchers",
    items: [
      { icon: CreditCard, label: "Vouchers", labelAr: "الكروت", path: "/vouchers" },
      { icon: UserCheck, label: "Manual Cards", labelAr: "الكروت اليدوية", path: "/manual-cards" },
      { icon: FileUp, label: "Import Cards CSV", labelAr: "استيراد كروت CSV", path: "/import-cards", requiredRole: ["super_admin", "owner"] },
      { icon: Printer, label: "Print Cards", labelAr: "طباعة الكروت", path: "/print-cards" },
      { icon: Search, label: "Card Lookup", labelAr: "بحث عن كرت", path: "/card-lookup" },
      { icon: BarChart3, label: "Card Sales Analytics", labelAr: "تحليلات مبيعات الكروت", path: "/card-sales" },
      { icon: Link2, label: "Card Check Link", labelAr: "رابط فحص الكروت", path: "/card-check-settings" },
      { icon: Send, label: "Send Cards via SMS", labelAr: "إرسال كروت SMS", path: "/sms-cards" },
      { icon: ShoppingBag, label: "Card Store", labelAr: "متجر البطاقات", path: "/store-management" },
    ],
  },

  // 8. Billing & Wallet (Billing & Finance)
  {
    id: "billing",
    icon: Receipt,
    label: "Billing & Wallet",
    labelAr: "الفوترة والمحفظة",
    requiredPermissionGroup: "billing_finance",
    items: [
      { 
        icon: Receipt, 
        label: "Bank Transfer Requests", 
        labelAr: "طلبات التحويل البنكي", 
        path: "/bank-transfer-admin",
        requiredRole: ["super_admin", "owner"]
      },
      { icon: Wallet, label: "Wallet", labelAr: "المحفظة", path: "/wallet" },
      { icon: History, label: "Wallet Ledger", labelAr: "سجل المحفظة", path: "/wallet-ledger", requiredRole: ["super_admin", "owner"] },
      { icon: FileText, label: "Invoices", labelAr: "الفواتير", path: "/invoices" },
      { 
        icon: LayoutDashboard, 
        label: "Billing Dashboard", 
        labelAr: "لوحة الفوترة", 
        path: "/owner-billing",
        requiredRole: ["super_admin", "owner"]
      },
    ],
  },

  // 9. Reports & Analytics
  {
    id: "reports",
    icon: PieChart,
    label: "Reports",
    labelAr: "التقارير",
    requiredPermissionGroup: "reports_analytics",
    items: [
      { icon: BarChart3, label: "Reports", labelAr: "التقارير", path: "/reports" },
    ],
  },

  // 10. Support
  {
    id: "support",
    icon: MessageSquare,
    label: "Support",
    labelAr: "الدعم الفني",
    requiredPermissionGroup: "support_tickets",
    items: [
      { icon: MessageSquare, label: "Support", labelAr: "الدعم الفني", path: "/support" },
    ],
  },

  // Account settings remain available to every role and are intentionally
  // placed near support in the lower part of the sidebar.
  {
    id: "account",
    icon: Settings,
    label: "Settings",
    labelAr: "الإعدادات",
    items: [
      { icon: Settings, label: "Settings", labelAr: "الإعدادات", path: "/settings" },
    ],
  },

  // 11. Client notifications
  {
    id: "notifications",
    icon: Bell,
    label: "Notifications",
    labelAr: "قنوات الإشعارات",
    requiredPermissionGroup: "support_tickets",
    items: [
      { icon: Bell, label: "Notifications", labelAr: "الإشعارات", path: "/my-notifications" },
    ],
  },

  // 12. Broadcast Notifications (Admin only)
  {
    id: "broadcasts",
    icon: Megaphone,
    label: "Broadcasts",
    labelAr: "الإشعارات",
    requiredRole: ["super_admin", "owner"],
    items: [
      { icon: Megaphone, label: "Send Broadcast", labelAr: "إرسال إشعار", path: "/broadcasts", requiredRole: ["super_admin", "owner"] },
    ],
  },

  // 13. System Settings (Owner/Super Admin only)
  {
    id: "system",
    icon: Cog,
    label: "System",
    labelAr: "النظام",
    requiredRole: ["super_admin", "owner"],
    items: [
      { icon: Users, label: "Users & Access", labelAr: "المستخدمون والصلاحيات", path: "/admin", requiredRole: ["super_admin", "owner"] },
      { icon: History, label: "Audit Log", labelAr: "سجل العمليات", path: "/audit-log" },
      { icon: CreditCard, label: "Subscription Plans", labelAr: "خطط الاشتراك", path: "/subscription-plans" },
      { icon: Smartphone, label: "SMS Management", labelAr: "إدارة SMS", path: "/sms" },
      { icon: Timer, label: "Cron Jobs", labelAr: "المهام المجدولة", path: "/cron-jobs", requiredRole: ["super_admin", "owner"] },
      { icon: Star, label: "Feedback Center", labelAr: "مركز التقييمات", path: "/admin/feedback", requiredRole: ["super_admin", "owner"] },
    ],
  },
];

/**
 * Filter menu sections based on user role and permissions
 */
export function filterMenuSections(
  sections: MenuSection[],
  role: string,
  permissions: Record<string, boolean>,
  allowedMenuItems?: string[] | null,
): MenuSection[] {
  const enforceMenuItems = (role === "client" || role === "reseller") && Array.isArray(allowedMenuItems);
  const hasAllowedMenuItem = (path: string) => {
    if (path === "/dashboard" || path === "/settings" || path === "/profile") return true;
    if (!enforceMenuItems) return true;
    return allowedMenuItems!.some((allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`));
  };

  return sections
    .map((section) => {
      // Check section-level permissions
      if (section.requiredRole && !section.requiredRole.includes(role)) {
        return null;
      }
      
      // Check permission group requirement
      if (section.requiredPermissionGroup) {
        // Owner/super_admin bypass permission checks
        const hasPermission = permissions[section.requiredPermissionGroup];
        const isSuperUser = role === "super_admin" || role === "owner";
        
        if (!hasPermission && !isSuperUser) {
          return null;
        }
      }

      // Filter items within the section
      const filteredItems = section.items.filter((item) => {
        if (item.requiredRole && !item.requiredRole.includes(role)) {
          return false;
        }
        
        if (item.requiredPermissionGroup) {
          const hasPermission = permissions[item.requiredPermissionGroup];
          const isSuperUser = role === "super_admin" || role === "owner";
          
          if (!hasPermission && !isSuperUser) {
            return false;
          }
        }

        if (!hasAllowedMenuItem(item.path)) return false;
        
        return true;
      });

      // If no items remain, hide the section
      if (filteredItems.length === 0) {
        return null;
      }

      return {
        ...section,
        items: filteredItems,
      };
    })
    .filter((section): section is MenuSection => section !== null);
}
