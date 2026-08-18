// NEW MENU STRUCTURE - GLOBAL STANDARD
// This file contains the refactored menu structure with international naming

import { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Monitor,
  Globe,
  Users,
  Shield,
  CreditCard,
  Receipt,
  PieChart,
  Cog,
  Wifi,
  FileText,
  Activity,
  Network,
  Server,
  Link2,
  History,
  UserCheck,
  Building2,
  Package,
  Printer,
  Wallet,
  BarChart3,
  Settings,
  Smartphone,
  MessageSquare,
  Search,
  Send,
} from "lucide-react";

// Menu section type
type MenuSection = {
  id: string;
  icon: LucideIcon;
  label: string;
  labelEn: string; // English label for clarity
  items: {
    icon: LucideIcon;
    label: string;
    labelEn: string;
    path: string;
  }[];
};

// NEW MENU STRUCTURE - OWNER/SUPER ADMIN
export const getOwnerMenuSections = (): MenuSection[] => [
  // 1. Dashboard
  {
    id: "dashboard",
    icon: LayoutDashboard,
    label: "لوحة التحكم",
    labelEn: "Dashboard",
    items: [
      { icon: LayoutDashboard, label: "الرئيسية", labelEn: "Dashboard", path: "/dashboard" },
    ],
  },
  
  // 2. Monitoring
  {
    id: "monitoring",
    icon: Monitor,
    label: "المراقبة",
    labelEn: "Monitoring",
    items: [
      { icon: Wifi, label: "الجلسات النشطة", labelEn: "Active Sessions", path: "/sessions" },
      { icon: FileText, label: "سجلات RADIUS", labelEn: "RADIUS Logs", path: "/radius-logs" },
    ],
  },
  
  // 3. Infrastructure
  {
    id: "infrastructure",
    icon: Globe,
    label: "البنية التحتية",
    labelEn: "Infrastructure",
    items: [
      { icon: Server, label: "أجهزة NAS", labelEn: "NAS Devices", path: "/nas" },
      { icon: Link2, label: "إعداد MikroTik", labelEn: "MikroTik Setup", path: "/mikrotik-setup" },
      { icon: History, label: "سجلات VPN", labelEn: "VPN Logs", path: "/vpn-logs" },
    ],
  },
  
  // 4. Users & Clients
  {
    id: "users",
    icon: Users,
    label: "المستخدمين والعملاء",
    labelEn: "Users & Clients",
    items: [
      { icon: UserCheck, label: "المشتركين", labelEn: "Subscribers", path: "/subscribers" },
      { icon: Users, label: "العملاء", labelEn: "Customers", path: "/users-management" },
      { icon: Building2, label: "الموزعين", labelEn: "Resellers", path: "/resellers" },
    ],
  },
  
  // 5. Access Control
  {
    id: "access",
    icon: Shield,
    label: "التحكم بالوصول",
    labelEn: "Access Control",
    items: [
      { icon: Package, label: "الخطط", labelEn: "Plans", path: "/plans" },
      { icon: Server, label: "لوحة تحكم RADIUS", labelEn: "RADIUS Control", path: "/radius-control" },
    ],
  },
  
  // 6. Cards & Vouchers
  {
    id: "cards",
    icon: CreditCard,
    label: "البطاقات",
    labelEn: "Cards & Vouchers",
    items: [
      { icon: CreditCard, label: "الكروت", labelEn: "Vouchers", path: "/vouchers" },
      { icon: Printer, label: "طباعة الكروت", labelEn: "Print Cards", path: "/print-cards" },
      { icon: Search, label: "بحث عن كرت", labelEn: "Card Lookup", path: "/card-lookup" },
      { icon: Send, label: "إرسال كروت SMS", labelEn: "Send Cards via SMS", path: "/sms-cards" },
    ],
  },
  
  // 7. Billing
  {
    id: "billing",
    icon: Receipt,
    label: "الفوترة",
    labelEn: "Billing",
    items: [
      { icon: LayoutDashboard, label: "لوحة الفوترة", labelEn: "Billing Dashboard", path: "/owner-billing" },
      { icon: FileText, label: "الفواتير", labelEn: "Invoices", path: "/invoices" },
      { icon: Wallet, label: "المحفظة", labelEn: "Wallet", path: "/wallet" },
      { icon: Wallet, label: "سجل المحفظة", labelEn: "Wallet Ledger", path: "/wallet-ledger" },
      { icon: Package, label: "خطط SaaS", labelEn: "SaaS Plans", path: "/saas-plans" },
    ],
  },
  
  // 8. Reports & Analytics
  {
    id: "reports",
    icon: PieChart,
    label: "التقارير والتحليلات",
    labelEn: "Reports & Analytics",
    items: [
      { icon: BarChart3, label: "التقارير", labelEn: "Reports", path: "/reports" },
      { icon: BarChart3, label: "تقارير الباندويث", labelEn: "Bandwidth Reports", path: "/bandwidth" },
    ],
  },
  
  // 9. System
  {
    id: "system",
    icon: Cog,
    label: "النظام",
    labelEn: "System",
    items: [
      { icon: Settings, label: "الإعدادات", labelEn: "Settings", path: "/settings" },
      { icon: History, label: "سجل العمليات", labelEn: "Audit Log", path: "/audit-log" },
      { icon: Smartphone, label: "إدارة SMS", labelEn: "SMS Management", path: "/sms" },
      { icon: MessageSquare, label: "الدعم الفني", labelEn: "Support", path: "/support" },
    ],
  },
];

// NEW MENU STRUCTURE - CLIENT
export const getClientMenuSections = (): MenuSection[] => [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    label: "لوحة التحكم",
    labelEn: "Dashboard",
    items: [
      { icon: LayoutDashboard, label: "الرئيسية", labelEn: "Dashboard", path: "/dashboard" },
    ],
  },
  {
    id: "monitoring",
    icon: Monitor,
    label: "المراقبة",
    labelEn: "Monitoring",
    items: [
      { icon: Wifi, label: "الجلسات النشطة", labelEn: "Active Sessions", path: "/sessions" },
    ],
  },
  {
    id: "network",
    icon: Globe,
    label: "الشبكة",
    labelEn: "Network",
    items: [
      { icon: Server, label: "أجهزة NAS الخاصة بي", labelEn: "My NAS", path: "/nas" },
      { icon: Link2, label: "إعداد MikroTik", labelEn: "MikroTik Setup", path: "/mikrotik-setup" },
    ],
  },
  {
    id: "users",
    icon: Users,
    label: "المشتركين",
    labelEn: "Subscribers",
    items: [
      { icon: UserCheck, label: "مشتركيني", labelEn: "My Subscribers", path: "/subscribers" },
    ],
  },
  {
    id: "cards",
    icon: CreditCard,
    label: "البطاقات",
    labelEn: "Cards",
    items: [
      { icon: CreditCard, label: "كروتي", labelEn: "My Vouchers", path: "/vouchers" },
      { icon: Printer, label: "طباعة الكروت", labelEn: "Print Cards", path: "/print-cards" },
      { icon: Package, label: "الخطط", labelEn: "Plans", path: "/plans" },
      { icon: Send, label: "إرسال كروت SMS", labelEn: "Send Cards via SMS", path: "/sms-cards" },
    ],
  },
  {
    id: "billing",
    icon: Receipt,
    label: "الفوترة",
    labelEn: "Billing",
    items: [
      { icon: FileText, label: "فواتيري", labelEn: "My Invoices", path: "/invoices" },
      { icon: Wallet, label: "محفظتي", labelEn: "My Wallet", path: "/wallet" },
    ],
  },
  {
    id: "reports",
    icon: PieChart,
    label: "التقارير",
    labelEn: "Reports",
    items: [
      { icon: BarChart3, label: "تقاريري", labelEn: "My Reports", path: "/reports" },
    ],
  },
  {
    id: "system",
    icon: Cog,
    label: "الإعدادات",
    labelEn: "Settings",
    items: [
      { icon: History, label: "سجل العمليات", labelEn: "Audit Log", path: "/audit-log" },
      { icon: MessageSquare, label: "الدعم الفني", labelEn: "Support", path: "/support" },
    ],
  },
];

// NEW MENU STRUCTURE - RESELLER
export const getResellerMenuSections = (): MenuSection[] => [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    label: "لوحة التحكم",
    labelEn: "Dashboard",
    items: [
      { icon: LayoutDashboard, label: "الرئيسية", labelEn: "Dashboard", path: "/dashboard" },
    ],
  },
  {
    id: "users",
    icon: Users,
    label: "العملاء",
    labelEn: "Customers",
    items: [
      { icon: Users, label: "عملائي", labelEn: "My Customers", path: "/clients" },
    ],
  },
  {
    id: "cards",
    icon: CreditCard,
    label: "البطاقات",
    labelEn: "Cards",
    items: [
      { icon: CreditCard, label: "الكروت", labelEn: "Vouchers", path: "/vouchers" },
    ],
  },
  {
    id: "billing",
    icon: Receipt,
    label: "الفوترة",
    labelEn: "Billing",
    items: [
      { icon: FileText, label: "الفواتير", labelEn: "Invoices", path: "/invoices" },
      { icon: Wallet, label: "المحفظة", labelEn: "Wallet", path: "/wallet" },
    ],
  },
  {
    id: "support",
    icon: MessageSquare,
    label: "الدعم",
    labelEn: "Support",
    items: [
      { icon: MessageSquare, label: "الدعم الفني", labelEn: "Support", path: "/support" },
    ],
  },
];

// Helper function to get menu sections by role
export const getMenuSectionsByRole = (role: string): MenuSection[] => {
  switch (role) {
    case "owner":
    case "super_admin":
      return getOwnerMenuSections();
    case "reseller":
      return getResellerMenuSections();
    case "client":
    default:
      return getClientMenuSections();
  }
};
