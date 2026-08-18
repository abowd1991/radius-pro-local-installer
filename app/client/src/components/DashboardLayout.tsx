import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
// Using local auth page instead of OAuth
import { useIsMobile } from "@/hooks/useMobile";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Users,
  CreditCard,
  FileText,
  Wallet,
  MessageSquare,
  Settings,
  Bell,
  Server,
  Package,
  Activity,
  Globe,
  UserCircle,
  Building2,
  ChevronDown,
  ChevronRight,
  Link2,
  Printer,
  BarChart3,
  Moon,
  Sun,
  Database,
  UserCheck,
  Wifi,
  History,
  Network,
  Smartphone,
  Monitor,
  Shield,
  Receipt,
  PieChart,
  Cog,
  type LucideIcon,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { NotificationBell } from "./NotificationBell";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { MobileBottomNav, MobileDrawer } from "./MobileNav";
import { FeedbackBanner } from "./FeedbackBanner";

// Theme Toggle Button Component
function ThemeToggleButton() {
  const { theme, toggleTheme, switchable } = useTheme();
  
  if (!switchable || !toggleTheme) return null;
  
  const isDark = theme === "dark";
  
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
      className="relative flex items-center justify-center rounded-xl transition-all duration-300 hover:scale-105 focus:outline-none shrink-0"
      style={{
        width: 34,
        height: 34,
        background: isDark
          ? 'linear-gradient(135deg, rgba(250,204,21,0.15), rgba(251,146,60,0.12))'
          : 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(147,51,234,0.1))',
        border: isDark
          ? '1px solid rgba(250,204,21,0.3)'
          : '1px solid rgba(37,99,235,0.25)',
        boxShadow: isDark
          ? '0 0 12px rgba(250,204,21,0.2), 0 2px 8px rgba(0,0,0,0.2)'
          : '0 0 12px rgba(37,99,235,0.15), 0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      {isDark ? (
        <Sun
          className="transition-all duration-300"
          style={{ width: 16, height: 16, color: '#facc15', filter: 'drop-shadow(0 0 4px rgba(250,204,21,0.6))' }}
        />
      ) : (
        <Moon
          className="transition-all duration-300"
          style={{ width: 16, height: 16, color: '#2563eb', filter: 'drop-shadow(0 0 4px rgba(37,99,235,0.5))' }}
        />
      )}
    </button>
  );
}

// Import menu configuration
import { ALL_MENU_SECTIONS, filterMenuSections, type MenuSection } from "@/config/menu-config";
import { isClientManagedRole, isMenuPathAllowed } from "@/config/menu-access";

// Get filtered menu sections based on role and permissions
const getMenuSections = (role: string, language: string, permissions: any, allowedMenuItems?: string[] | null): MenuSection[] => {
  return filterMenuSections(ALL_MENU_SECTIONS, role, permissions, allowedMenuItems).map(section => ({
    ...section,
    label: language === "ar" ? section.labelAr : section.label,
    items: section.items.map(item => ({
      ...item,
      label: language === "ar" ? item.labelAr : item.label,
    })),
  }));
};

// Flatten sections to get all menu items for finding active item
const flattenSections = (sections: MenuSection[]) => {
  return sections.flatMap(section => section.items);
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

// Key for storing expanded sections in localStorage
const EXPANDED_SECTIONS_KEY = "sidebar-expanded-sections";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const { language, setLanguage, t, direction } = useLanguage();
  // On mobile, sidebar starts closed so content gets full width
  const isMobileInit = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // Redirect to auth page if not logged in
  // Add a small delay to allow auth.me to settle after login navigation
  useEffect(() => {
    if (loading) return; // Wait for auth check to complete
    if (!user) {
      // Small delay to avoid race condition between login mutation and auth.me refetch
      const timer = setTimeout(() => {
        window.location.href = '/';
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [loading, user]);

  // Redirect new users to onboarding wizard (skip if impersonating)
  const { data: impersonationStatus } = trpc.auth.impersonationStatus.useQuery();
  useEffect(() => {
    if (!loading && user && !(user as any).onboardingCompleted && !impersonationStatus?.isImpersonating) {
      window.location.href = '/onboarding';
    }
  }, [loading, user, impersonationStatus]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen" dir={direction}>
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Globe className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              {t("app.name")}
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {t("app.tagline")}
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = "/";
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            {t("auth.login")}
          </Button>
          <div className="flex gap-2">
            <Button
              variant={language === "ar" ? "default" : "outline"}
              size="sm"
              onClick={() => setLanguage("ar")}
            >
              العربية
            </Button>
            <Button
              variant={language === "en" ? "default" : "outline"}
              size="sm"
              onClick={() => setLanguage("en")}
            >
              English
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={!isMobileInit}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const { language, setLanguage, t, direction } = useLanguage();
  const { permissions, allowedMenuItems, isLoading: permissionsLoading } = useFeatureAccess();

  console.log('[DashboardLayout] User role:', user?.role);
  console.log('[DashboardLayout] Permissions:', permissions);
  console.log('[DashboardLayout] Permissions loading:', permissionsLoading);

  const menuSections = getMenuSections(user?.role || "client", language, permissions, allowedMenuItems);

  // Support unread count badge (for all users: admin sees unread client msgs, client sees unread admin replies)
  const isAdminUser = user?.role === 'owner' || user?.role === 'super_admin';
  const { data: supportUnreadData } = trpc.tickets.getUnreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 15000, // Poll every 15 seconds
  });
  const supportUnreadCount = supportUnreadData?.count ?? 0;
  console.log('[DashboardLayout] Menu sections count:', menuSections.length);
  const allMenuItems = flattenSections(menuSections);
  const activeMenuItem = allMenuItems.find((item) => item.path === location);

  // Find which section contains the active item
  const activeSectionId = menuSections.find(section => 
    section.items.some(item => item.path === location)
  )?.id;

  useEffect(() => {
    if (!user || permissionsLoading || !isClientManagedRole(user.role)) return;
    if (!isMenuPathAllowed(location, allowedMenuItems)) {
      setLocation("/dashboard");
    }
  }, [allowedMenuItems, location, permissionsLoading, setLocation, user]);

  // Expanded sections state
  const [expandedSections, setExpandedSections] = useState<string[]>(() => {
    const saved = localStorage.getItem(EXPANDED_SECTIONS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    // Default: expand dashboard and the section containing active item
    const defaults = ["dashboard"];
    if (activeSectionId && !defaults.includes(activeSectionId)) {
      defaults.push(activeSectionId);
    }
    return defaults;
  });

  // Save expanded sections to localStorage
  useEffect(() => {
    localStorage.setItem(EXPANDED_SECTIONS_KEY, JSON.stringify(expandedSections));
  }, [expandedSections]);

  // Auto-expand section when navigating to a new page
  useEffect(() => {
    if (activeSectionId && !expandedSections.includes(activeSectionId)) {
      setExpandedSections(prev => [...prev, activeSectionId]);
    }
  }, [activeSectionId]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "owner":
        return { label: language === "ar" ? "مالك النظام" : "Owner", variant: "destructive" as const };
      case "super_admin":
        return { label: language === "ar" ? "مدير النظام" : "Super Admin", variant: "destructive" as const };
      case "reseller":
        return { label: language === "ar" ? "موزع" : "Reseller", variant: "default" as const };
      case "support":
        return { label: language === "ar" ? "دعم فني" : "Support", variant: "outline" as const };
      case "client":
      default:
        return { label: language === "ar" ? "عميل" : "Client", variant: "secondary" as const };
    }
  };

  const roleBadge = getRoleBadge(user?.role || "client");

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarRect = sidebarRef.current?.getBoundingClientRect();
      if (!sidebarRect) return;

      let newWidth: number;
      if (direction === "rtl") {
        newWidth = sidebarRect.right - e.clientX;
      } else {
        newWidth = e.clientX - sidebarRect.left;
      }

      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth, direction]);

  return (
    <div dir={direction} className="flex min-h-screen w-full">
      {!isMobile && <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          side={direction === "rtl" ? "right" : "left"}
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center" style={{ borderBottom: '1px solid var(--border)', background: 'var(--sidebar)' }}>
            <div className="flex items-center gap-3 px-3 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center rounded-xl transition-all duration-200 focus:outline-none shrink-0 hover:scale-105"
                  style={{ background: 'color-mix(in oklch, var(--primary) 10%, transparent)', border: '1px solid color-mix(in oklch, var(--primary) 20%, transparent)' }}
                aria-label="Toggle navigation"
              >
                <PanelLeft className={`h-3.5 w-3.5 text-blue-400 ${direction === "rtl" ? "rotate-180" : ""}`} />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center justify-between w-full min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-xl overflow-hidden shrink-0" style={{ boxShadow: '0 0 20px color-mix(in oklch, var(--primary) 45%, transparent), 0 4px 12px rgba(0,0,0,0.4)' }}>
                      <img src="/logo-icon.png" alt="Radius Pro" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm tracking-tight truncate" style={{ color: 'var(--foreground)' }}>Radius <span style={{ background: 'linear-gradient(135deg, #60a5fa, #a78bfa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Pro</span></div>
                      <div className="text-[10px] font-semibold truncate tracking-widest uppercase" style={{ color: 'var(--muted-foreground)' }}>Network Management</div>
                    </div>
                  </div>
                  <ThemeToggleButton />
                </div>
              ) : (
                <div className="h-9 w-9 rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(37,99,235,0.45)' }}>
                  <img src="/logo-icon.png" alt="Radius Pro" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto py-2">
            {menuSections.map((section, sectionIndex) => {
              const isExpanded = expandedSections.includes(section.id);
              const isSingleItem = section.items.length === 1;
              const sectionHasActiveItem = section.items.some(item => item.path === location);

              if (isSingleItem) {
                const item = section.items[0];
                const isActive = location === item.path;
                return (
                  <div key={section.id} className="px-2.5 py-0.5">
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={isCollapsed ? item.label : undefined}
                          className={`h-9 rounded-xl transition-all duration-200 ${
                            isActive ? "font-semibold" : "font-medium text-slate-400 hover:text-white hover:bg-white/[0.04]"
                          }`}
                          style={isActive ? {
                            background: 'linear-gradient(135deg, rgba(37,99,235,0.18) 0%, rgba(124,58,237,0.12) 100%)',
                            border: '1px solid rgba(37,99,235,0.35)',
                            color: '#93c5fd',
                            boxShadow: '0 0 16px rgba(37,99,235,0.15), inset 0 1px 0 rgba(255,255,255,0.05)'
                          } : {}}
                        >
                          <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${
                            isActive ? '' : 'group-hover:scale-110'
                          }`} style={isActive ? { background: 'rgba(37,99,235,0.2)' } : { background: 'rgba(255,255,255,0.04)' }}>
                            <item.icon className={`h-3.5 w-3.5 ${
                              isActive ? 'text-blue-400' : 'text-slate-500'
                            }`} />
                          </div>
                          <span className="flex-1 text-sm">{item.label}</span>
                          {item.path === '/support' && supportUnreadCount > 0 && (
                            <span
                              className="badge-pulse flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold shrink-0"
                              style={{ background: '#EF4444', color: 'white' }}
                            >
                              {supportUnreadCount > 99 ? '99+' : supportUnreadCount}
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </div>
                );
              }

              return (
                <div key={section.id} className="px-2.5 py-0.5">
                  <Collapsible
                    open={isExpanded}
                    onOpenChange={() => toggleSection(section.id)}
                    className="group/collapsible"
                  >
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            tooltip={isCollapsed ? section.label : undefined}
                            className={`h-9 rounded-xl transition-all duration-200 ${
                              sectionHasActiveItem
                                ? 'text-white font-semibold'
                                : 'font-medium text-slate-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                            style={sectionHasActiveItem ? {
                              background: 'rgba(37,99,235,0.08)',
                              border: '1px solid rgba(37,99,235,0.18)'
                            } : {}}
                          >
                            <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0`}
                              style={sectionHasActiveItem ? { background: 'rgba(37,99,235,0.18)' } : { background: 'rgba(255,255,255,0.04)' }}>
                              <section.icon className={`h-3.5 w-3.5 ${
                                sectionHasActiveItem ? 'text-blue-400' : 'text-slate-500'
                              }`} />
                            </div>
                            <span className="flex-1 text-sm">{section.label}</span>
                            {/* Support unread badge on section header */}
                            {section.items.some(i => i.path === '/support') && supportUnreadCount > 0 && (
                              <span
                                className="badge-pulse flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold shrink-0"
                                style={{ background: '#EF4444', color: 'white' }}
                              >
                                {supportUnreadCount > 99 ? '99+' : supportUnreadCount}
                              </span>
                            )}
                            <ChevronRight
                              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                                isExpanded ? 'rotate-90 text-blue-400' : 'text-slate-600'
                              }`}
                            />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                          <div className={`mt-1 mb-1 space-y-0.5 ${
                            direction === 'rtl'
                              ? 'pr-3 mr-2 border-r border-white/[0.07]'
                              : 'pl-3 ml-2 border-l border-white/[0.07]'
                          }`}>
                            {section.items.map((item) => {
                              const isActive = location === item.path;
                              return (
                                <SidebarMenu key={item.path}>
                                  <SidebarMenuItem>
                                    <SidebarMenuButton
                                      isActive={isActive}
                                      onClick={() => setLocation(item.path)}
                                      tooltip={isCollapsed ? item.label : undefined}
                                      className={`h-8 rounded-lg transition-all duration-200 text-sm ${
                                        isActive
                                          ? 'font-medium'
                                          : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.03]'
                                      }`}
                                      style={isActive ? {
                                        background: 'rgba(37,99,235,0.12)',
                                        color: '#93c5fd',
                                        [direction === 'rtl' ? 'borderLeft' : 'borderRight']: '2px solid #3b82f6'
                                      } : {}}
                                    >
                                      <item.icon className={`h-3.5 w-3.5 shrink-0 ${
                                        isActive ? 'text-blue-400' : 'text-slate-600'
                                      }`} />
                                      <span>{item.label}</span>
                                      {item.path === '/support' && supportUnreadCount > 0 ? (
                                        <span className={`badge-pulse ${
                                          direction === 'rtl' ? 'mr-auto' : 'ml-auto'
                                        } flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold shrink-0`}
                                          style={{ background: '#EF4444', color: 'white' }}>
                                          {supportUnreadCount > 99 ? '99+' : supportUnreadCount}
                                        </span>
                                      ) : isActive ? (
                                        <span className={`${
                                          direction === 'rtl' ? 'mr-auto' : 'ml-auto'
                                        } h-1.5 w-1.5 rounded-full shrink-0`}
                                          style={{ background: '#3b82f6', boxShadow: '0 0 6px #3b82f6' }} />
                                      ) : null}
                                    </SidebarMenuButton>
                                  </SidebarMenuItem>
                                </SidebarMenu>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </Collapsible>
                </div>
              );
            })}
          </SidebarContent>

          <SidebarFooter className="p-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--sidebar)' }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-all duration-200 w-full text-start group-data-[collapsible=icon]:justify-center focus:outline-none hover:scale-[1.01]" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate leading-none">
                        {user?.name || "-"}
                      </p>
                      <Badge variant={roleBadge.variant} className="text-[10px] px-1.5 py-0">
                        {roleBadge.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={direction === "rtl" ? "start" : "end"} className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setLocation("/profile")} className="cursor-pointer">
                  <UserCircle className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                  <span>{t("auth.profile")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/settings")} className="cursor-pointer">
                  <Settings className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                  <span>{t("auth.settings")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 flex gap-1">
                  <Button
                    variant={language === "ar" ? "default" : "ghost"}
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => setLanguage("ar")}
                  >
                    العربية
                  </Button>
                  <Button
                    variant={language === "en" ? "default" : "ghost"}
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => setLanguage("en")}
                  >
                    English
                  </Button>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                  <span>{t("auth.logout")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 ${direction === "rtl" ? "left-0" : "right-0"} w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>}

      <SidebarInset className="flex-1">
        {/* Fixed Header - Always visible */}
        <header className="flex h-14 items-center justify-between px-4 sticky top-0 z-40" style={{ background: 'color-mix(in oklch, var(--background) 92%, transparent)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid var(--border)', boxShadow: '0 1px 0 var(--border), 0 4px 24px rgba(0,0,0,0.15)' }}>
          <div className="flex items-center gap-3">
            {!isMobile && <SidebarTrigger className="h-8 w-8 rounded-xl" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }} />}
            <div className="flex items-center gap-2.5">
              <div className="w-px h-5 rounded-full" style={{ background: 'linear-gradient(180deg, transparent, rgba(37,99,235,0.8), rgba(147,51,234,0.8), transparent)' }} />
              <div className="flex flex-col">
                <span className="text-sm font-bold leading-none" style={{ color: 'var(--foreground)' }}>
                  {activeMenuItem?.label ?? t("nav.dashboard")}
                </span>
                <span className="text-[10px] font-medium leading-none mt-0.5" style={{ color: 'var(--muted-foreground)' }}>Radius Pro</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggleButton />
            <NotificationBell />
            <div className="h-6 w-px mx-1" style={{ background: 'var(--border)' }} />
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl cursor-pointer transition-all duration-200" style={{ border: '1px solid var(--border)' }}>
              <div className="h-6 w-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #2563EB, #9333EA)' }}>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="text-xs font-medium hidden sm:block" style={{ color: 'var(--foreground)' }}>{user?.name?.split(' ')[0] || 'User'}</span>
            </div>
          </div>
        </header>
        <SubscriptionBanner />
        <main className="flex-1 p-4" style={{ paddingBottom: isMobile ? '80px' : undefined }}>{children}</main>
        {/* Mobile Bottom Navigation */}
        {isMobile && (
          <>
            <MobileBottomNav
              unreadCount={supportUnreadCount}
              onMenuOpen={() => setMobileDrawerOpen(true)}
            />
            <MobileDrawer
              isOpen={mobileDrawerOpen}
              onClose={() => setMobileDrawerOpen(false)}
              unreadCount={supportUnreadCount}
            />
          </>
        )}
        <FeedbackBanner />
        {/* Footer Bar */}
        <footer className="px-4 py-2 flex items-center justify-between text-[10px] shrink-0 select-none" style={{ borderTop: '1px solid var(--border)', background: 'var(--background)', color: 'var(--muted-foreground)', display: isMobile ? 'none' : undefined }}>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
            <span style={{ color: 'var(--muted-foreground)' }}>v{__APP_VERSION__} · Online</span>
          </div>
          <span style={{ color: 'var(--muted-foreground)' }}>© 2026 Radius Pro</span>
        </footer>
      </SidebarInset>
    </div>
  );
}
