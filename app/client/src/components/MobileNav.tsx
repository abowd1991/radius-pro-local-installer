/**
 * MobileNav.tsx
 * Bottom Navigation Bar + Slide-in Drawer for mobile devices.
 * Derives menu items from the canonical `menu-config.ts` so it stays
 * in sync with the desktop sidebar automatically.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { ALL_MENU_SECTIONS, filterMenuSections } from "@/config/menu-config";
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Wallet,
  MessageSquare,
  ChevronRight,
  PenLine,
  Search,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

// ─── Color Palette (theme-aware) ───────────────────────────────────────────────
const C = {
  bg: "var(--background)",
  card: "var(--card)",
  border: "var(--border)",
  primary: "#2563EB",
  secondary: "#7C3AED",
  textPrimary: "var(--foreground)",
  textSecondary: "var(--muted-foreground)",
  danger: "#EF4444",
};

// ─── Bottom Nav pinned items per role ─────────────────────────────────────────
interface PinnedItem {
  icon: LucideIcon;
  labelAr: string;
  labelEn: string;
  path: string;
}

function getPinnedItems(role: string): PinnedItem[] {
  if (role === "owner" || role === "super_admin") {
    return [
      { icon: LayoutDashboard, labelAr: "الرئيسية", labelEn: "Home", path: "/dashboard" },
      { icon: CreditCard, labelAr: "الكروت", labelEn: "Cards", path: "/vouchers" },
      { icon: PenLine, labelAr: "كرت يدوي", labelEn: "Manual", path: "/manual-cards" },
      { icon: Search, labelAr: "بحث كرت", labelEn: "Lookup", path: "/card-lookup" },
    ];
  }
  if (role === "reseller" || role === "client_owner") {
    return [
      { icon: LayoutDashboard, labelAr: "الرئيسية", labelEn: "Home", path: "/dashboard" },
      { icon: CreditCard, labelAr: "الكروت", labelEn: "Cards", path: "/vouchers" },
      { icon: PenLine, labelAr: "كرت يدوي", labelEn: "Manual", path: "/manual-cards" },
      { icon: Search, labelAr: "بحث كرت", labelEn: "Lookup", path: "/card-lookup" },
    ];
  }
  // client
  return [
    { icon: LayoutDashboard, labelAr: "الرئيسية", labelEn: "Home", path: "/dashboard" },
    { icon: CreditCard, labelAr: "الكروت", labelEn: "Cards", path: "/vouchers" },
    { icon: PenLine, labelAr: "كرت يدوي", labelEn: "Manual", path: "/manual-cards" },
    { icon: Search, labelAr: "بحث كرت", labelEn: "Lookup", path: "/card-lookup" },
  ];
}

// ─── Bottom Navigation Bar ────────────────────────────────────────────────────
export function MobileBottomNav({
  unreadCount = 0,
  onMenuOpen,
}: {
  unreadCount?: number;
  onMenuOpen: () => void;
}) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const isAr = language === "ar";
  const role = (user as any)?.role || "client";
  const pinnedItems = getPinnedItems(role);

  return (
    <>
      {/* Spacer so content isn't hidden behind the bar */}
      <div style={{ height: 68 }} />

      <nav
        aria-label="Mobile bottom navigation"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: "color-mix(in oklch, var(--background) 97%, transparent)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: `1px solid var(--border)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          padding: "8px 4px 12px",
          direction: isAr ? "rtl" : "ltr",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* Hamburger / All Menu */}
        <button
          onClick={onMenuOpen}
          aria-label={isAr ? "فتح القائمة" : "Open menu"}
          style={btnBase}
        >
          <IconBox active={false}>
            <Menu size={15} color={C.textSecondary} />
          </IconBox>
          <BtnLabel active={false} isAr={isAr}>{isAr ? "القائمة" : "Menu"}</BtnLabel>
        </button>

        {/* Pinned items */}
        {pinnedItems.map((item) => {
          const isActive = location === item.path || (item.path !== "/dashboard" && location.startsWith(item.path));
          const Icon = item.icon;
          const hasBadge = item.path === "/support" && unreadCount > 0;
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              aria-label={isAr ? item.labelAr : item.labelEn}
              style={btnBase}
            >
              {isActive && <ActiveIndicator />}
              <IconBox active={isActive} hasBadge={hasBadge} badgeCount={unreadCount}>
                <Icon size={isActive ? 17 : 15} color={isActive ? "#93c5fd" : C.textSecondary} strokeWidth={isActive ? 2.5 : 1.8} />
              </IconBox>
              <BtnLabel active={isActive} isAr={isAr}>{isAr ? item.labelAr : item.labelEn}</BtnLabel>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// ─── Slide-in Drawer ──────────────────────────────────────────────────────────
export function MobileDrawer({
  isOpen,
  onClose,
  unreadCount = 0,
}: {
  isOpen: boolean;
  onClose: () => void;
  unreadCount?: number;
}) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { permissions, allowedMenuItems } = useFeatureAccess();
  const isAr = language === "ar";
  const role = (user as any)?.role || "client";

  // Build sections from canonical menu-config (same as desktop sidebar)
  const sections = filterMenuSections(ALL_MENU_SECTIONS, role, (permissions ?? {}) as Record<string, boolean>, allowedMenuItems).map((s) => ({
    ...s,
    label: isAr ? s.labelAr : s.label,
    items: s.items.map((item) => ({
      ...item,
      label: isAr ? item.labelAr : item.label,
    })),
  }));

  const navigate = (path: string) => {
    setLocation(path);
    onClose();
  };

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed", inset: 0, zIndex: 998,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Panel */}
      <aside
        aria-label="Mobile navigation drawer"
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          [isAr ? "right" : "left"]: 0,
          zIndex: 999,
          width: "82vw",
          maxWidth: 320,
          background: "var(--background)",
          borderLeft: isAr ? "none" : `1px solid var(--border)`,
          borderRight: isAr ? `1px solid var(--border)` : "none",
          display: "flex",
          flexDirection: "column",
          direction: isAr ? "rtl" : "ltr",
          transform: isOpen ? "translateX(0)" : isAr ? "translateX(100%)" : "translateX(-100%)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
          overflowY: "auto",
          boxShadow: isAr ? "-8px 0 40px rgba(0,0,0,0.6)" : "8px 0 40px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 18px",
          borderBottom: `1px solid var(--border)`,
          background: "var(--card)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, overflow: "hidden",
              boxShadow: "0 0 16px rgba(37,99,235,0.4)", flexShrink: 0,
            }}>
              <img src="/logo-icon.png" alt="Radius Pro" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary, fontFamily: "'Cairo',sans-serif" }}>
                Radius{" "}
                <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Pro</span>
              </div>
              <div style={{ fontSize: 10, color: C.textSecondary, fontFamily: "'Cairo',sans-serif", letterSpacing: 1 }}>
                NETWORK MANAGEMENT
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={16} color={C.textSecondary} />
          </button>
        </div>



        {/* Menu Sections */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {sections.map((section, si) => (
            <div key={si} style={{ marginBottom: 4 }}>
              {/* Section label */}
              <div style={{
                padding: "8px 18px 4px",
                fontSize: 10, fontWeight: 700,
                color: C.textSecondary,
                fontFamily: "'Cairo',sans-serif",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}>
                {section.label}
              </div>
              {section.items.map((item) => {
                const isActive = location === item.path || (item.path !== "/dashboard" && location.startsWith(item.path));
                const Icon = item.icon as LucideIcon;
                const hasBadge = item.path === "/support" && unreadCount > 0;
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    style={{
                      width: "100%",
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 18px",
                      background: isActive ? "linear-gradient(135deg,rgba(37,99,235,0.15),rgba(124,58,237,0.1))" : "none",
                      border: "none",
                      borderLeft: isAr ? "none" : isActive ? `3px solid ${C.primary}` : "3px solid transparent",
                      borderRight: isAr ? isActive ? `3px solid ${C.primary}` : "3px solid transparent" : "none",
                      cursor: "pointer",
                      textAlign: isAr ? "right" : "left",
                      transition: "all 0.15s",
                      direction: isAr ? "rtl" : "ltr",
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 9,
                      background: isActive ? "rgba(37,99,235,0.2)" : "var(--muted)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, position: "relative",
                    }}>
                      <Icon size={15} color={isActive ? "#60a5fa" : C.textSecondary} />
                      {hasBadge && (
                        <div className="badge-pulse" style={{
                          position: "absolute", top: -4, right: -4,
                          width: 14, height: 14, borderRadius: "50%",
                          background: C.danger,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 8, fontWeight: 700, color: "#fff",
                          border: "1.5px solid var(--background)",
                        }}>
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </div>
                      )}
                    </div>
                    <span style={{
                      flex: 1, fontSize: 13,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? "#93c5fd" : C.textPrimary,
                      fontFamily: "'Cairo',sans-serif",
                    }}>
                      {item.label}
                    </span>
                    <ChevronRight
                      size={14}
                      color={isActive ? "#60a5fa" : C.textSecondary}
                      style={{ transform: isAr ? "rotate(180deg)" : "none", flexShrink: 0 }}
                    />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* User Menu Button */}
        <div style={{ padding: "10px 18px 20px", borderTop: `1px solid var(--border)`, flexShrink: 0, position: "relative" }}>
          {/* Dropdown Panel */}
          {userMenuOpen && (
            <div style={{
              position: "absolute",
              bottom: "calc(100% - 8px)",
              left: 18, right: 18,
              background: "var(--card)",
              border: `1px solid var(--border)`,
              borderRadius: 14,
              boxShadow: "0 -8px 32px rgba(0,0,0,0.3)",
              zIndex: 100,
              overflow: "hidden",
              direction: isAr ? "rtl" : "ltr",
            }}>
              {/* User Info Header */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid var(--border)`, background: "color-mix(in oklch, var(--primary) 4%, transparent)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", fontFamily: "'Cairo',sans-serif" }}>{(user as any)?.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "'Cairo',sans-serif", marginTop: 2 }}>{(user as any)?.email}</div>
              </div>
              {/* Profile */}
              <button onClick={() => { setLocation("/profile"); setUserMenuOpen(false); onClose(); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "none", border: "none", cursor: "pointer", direction: isAr ? "rtl" : "ltr", borderBottom: `1px solid var(--border)` }}>
                <UserCircle size={16} color="var(--muted-foreground)" />
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", fontFamily: "'Cairo',sans-serif" }}>{isAr ? "الملف الشخصي" : "Profile"}</span>
              </button>
              {/* Settings is optional for client_staff and only appears after parent delegation. */}
              {((user as any)?.role !== "client_staff" || allowedMenuItems?.includes("/settings")) && (
                <button onClick={() => { setLocation("/settings"); setUserMenuOpen(false); onClose(); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "none", border: "none", cursor: "pointer", direction: isAr ? "rtl" : "ltr", borderBottom: `1px solid var(--border)` }}>
                  <Settings size={16} color="var(--muted-foreground)" />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", fontFamily: "'Cairo',sans-serif" }}>{isAr ? "الإعدادات" : "Settings"}</span>
                </button>
              )}
              {/* Language Toggle */}
              <div style={{ padding: "10px 16px", borderBottom: `1px solid var(--border)`, display: "flex", gap: 6 }}>
                <button onClick={() => setLanguage("ar")} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${language === "ar" ? "var(--primary)" : "var(--border)"}`, background: language === "ar" ? "var(--primary)" : "transparent", color: language === "ar" ? "#fff" : "var(--foreground)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>العربية</button>
                <button onClick={() => setLanguage("en")} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${language === "en" ? "var(--primary)" : "var(--border)"}`, background: language === "en" ? "var(--primary)" : "transparent", color: language === "en" ? "#fff" : "var(--foreground)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>English</button>
              </div>
              {/* Logout */}
              <button onClick={async () => { await logout(); setUserMenuOpen(false); onClose(); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: "none", border: "none", cursor: "pointer", direction: isAr ? "rtl" : "ltr" }}>
                <LogOut size={16} color="#f87171" />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#f87171", fontFamily: "'Cairo',sans-serif" }}>{isAr ? "تسجيل الخروج" : "Logout"}</span>
              </button>
            </div>
          )}
          {/* User Button */}
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px",
              background: userMenuOpen ? "color-mix(in oklch, var(--primary) 8%, transparent)" : "color-mix(in oklch, var(--primary) 4%, transparent)",
              border: `1px solid ${userMenuOpen ? "rgba(37,99,235,0.4)" : "rgba(37,99,235,0.15)"}`,
              borderRadius: 12,
              cursor: "pointer",
              direction: isAr ? "rtl" : "ltr",
              transition: "all 0.15s",
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: "linear-gradient(135deg,#2563EB,#7C3AED)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "#fff",
              fontFamily: "'Cairo',sans-serif", flexShrink: 0,
            }}>
              {(user as any)?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", fontFamily: "'Cairo',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(user as any)?.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "'Cairo',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(user as any)?.email}
              </div>
            </div>
            <ChevronRight size={14} color="var(--muted-foreground)" style={{ transform: userMenuOpen ? "rotate(-90deg)" : isAr ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }} />
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── Small helper sub-components ─────────────────────────────────────────────
const btnBase: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
  background: "none", border: "none", cursor: "pointer",
  padding: "4px 8px", borderRadius: 10, minWidth: 52, position: "relative",
  transition: "all 0.2s",
};

function ActiveIndicator() {
  return (
    <div style={{
      position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
      width: 32, height: 3, borderRadius: "0 0 4px 4px",
      background: "linear-gradient(90deg,#2563EB,#7C3AED)",
    }} />
  );
}

function IconBox({
  active,
  children,
  hasBadge,
  badgeCount,
}: {
  active: boolean;
  children: React.ReactNode;
  hasBadge?: boolean;
  badgeCount?: number;
}) {
  return (
    <div style={{
      width: active ? 34 : 28, height: active ? 34 : 28, borderRadius: active ? 10 : 8,
      background: active
        ? "linear-gradient(135deg,rgba(37,99,235,0.45),rgba(147,51,234,0.35))"
        : "var(--muted)",
      display: "flex", alignItems: "center", justifyContent: "center",
      border: active ? "1px solid rgba(37,99,235,0.6)" : "1px solid transparent",
      boxShadow: active ? "0 0 14px rgba(37,99,235,0.55), 0 0 28px rgba(147,51,234,0.3), inset 0 1px 0 rgba(255,255,255,0.12)" : "none",
      transition: "all 0.25s", position: "relative",
    }}>
      {children}
      {hasBadge && badgeCount && badgeCount > 0 && (
        <div className="badge-pulse" style={{
          position: "absolute", top: -4, right: -4,
          width: 14, height: 14, borderRadius: "50%",
          background: "#EF4444",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: 700, color: "#fff",
          border: "1.5px solid var(--background)",
        }}
      >
        {badgeCount > 9 ? "9+" : badgeCount}
        </div>
      )}
    </div>
  );
}

function BtnLabel({ active, isAr, children }: { active: boolean; isAr: boolean; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10,
      color: active ? "#93c5fd" : C.textSecondary,
      fontFamily: "'Cairo',sans-serif",
      fontWeight: active ? 700 : 500,
      transition: "all 0.2s",
    }}>
      {children}
    </span>
  );
}
