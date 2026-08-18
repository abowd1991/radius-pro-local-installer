import { useState, useEffect } from "react";
import {
  Wifi, Users, CreditCard, Activity, AlertTriangle, TrendingUp,
  TrendingDown, Server, Zap, Bell, Settings, BarChart3, Home,
  Clock, Shield, Database, RefreshCw, Eye, EyeOff, Moon, Sun,
  Layers, ChevronRight, ArrowUpRight, ArrowDownRight, CheckCircle2,
  XCircle, Info, Bug, Menu, X, Gauge, DollarSign,
} from "lucide-react";

// ─── Tokens ──────────────────────────────────────────────────────────────────
const T = {
  teal:       "#14B8A6",
  tealLight:  "#F0FDFA",
  tealMid:    "#99F6E4",
  tealDark:   "#0F766E",
  success:    "#22C55E",
  successBg:  "#F0FDF4",
  danger:     "#EF4444",
  dangerBg:   "#FEF2F2",
  warning:    "#F59E0B",
  warningBg:  "#FFFBEB",
  info:       "#3B82F6",
  infoBg:     "#EFF6FF",
  purple:     "#8B5CF6",
  purpleBg:   "#F5F3FF",
  // Light
  bgBase:     "#F1F5F9",
  bgSurface:  "#FFFFFF",
  border:     "#E2E8F0",
  textH:      "#0F172A",
  textB:      "#334155",
  textM:      "#64748B",
  textS:      "#94A3B8",
  // Dark
  dkBase:     "#0B1120",
  dkSurface:  "#131E30",
  dkCard:     "#1A2740",
  dkBorder:   "#243347",
  dkTextH:    "#F1F5F9",
  dkTextB:    "#CBD5E1",
  dkTextM:    "#94A3B8",
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const PRIMARY_KPIS = [
  {
    label: "إيرادات اليوم", value: "₪ 3,410", sub: "+₪ 620 عن أمس",
    change: +22.1, icon: DollarSign, color: T.teal, bg: T.tealLight,
    big: true,
  },
  {
    label: "مستخدمون نشطون", value: "1,247", sub: "من إجمالي 1,890",
    change: +12.5, icon: Users, color: T.info, bg: T.infoBg,
    big: true,
  },
];
const SECONDARY_KPIS = [
  { label: "كروت مُصدرة", value: "5,832", change: +8.3, icon: CreditCard, color: T.purple, bg: T.purpleBg },
  { label: "جلسات نشطة",  value: "893",   change: -3.2, icon: Activity,   color: T.warning, bg: T.warningBg },
  { label: "NAS متصل",    value: "7",     change: 0,    icon: Server,     color: T.success, bg: T.successBg },
  { label: "تنبيهات",     value: "3",     change: +1,   icon: Bell,       color: T.danger,  bg: T.dangerBg },
];

const HEALTH = [
  { label: "Uptime",          value: "99.9%", color: T.success, icon: CheckCircle2 },
  { label: "API Latency",     value: "42ms",  color: T.info,    icon: Zap },
  { label: "DB Queries",      value: "~5/s",  color: T.purple,  icon: Database },
  { label: "RADIUS Response", value: "18ms",  color: T.teal,    icon: Shield },
];

const ALERTS = [
  {
    type: "danger", icon: AlertTriangle,
    title: "Zombie Sessions (12)",
    desc: "جلسات لم تُغلق منذ أكثر من 24 ساعة",
    time: "5 دقائق",
  },
  {
    type: "warning", icon: Clock,
    title: "Missing Interim Update",
    desc: "NAS 192.168.31.11 لم يُرسل تحديثاً منذ 45 دقيقة",
    time: "45 دقيقة",
  },
  {
    type: "info", icon: Info,
    title: "NAS جديد اكتُشف",
    desc: "192.168.50.5 — في انتظار الموافقة",
    time: "ساعة",
  },
];

const ACTIVITY = [
  { user: "Ahmad_K",  action: "تسجيل دخول",  nas: "AbowdNett", status: "success", time: "الآن" },
  { user: "Sara_M",   action: "انتهت الصلاحية", nas: "TwixNet",  status: "warning", time: "2 د" },
  { user: "Omar_H",   action: "تجاوز الحد",   nas: "AbowdNett", status: "danger",  time: "5 د" },
  { user: "Lina_T",   action: "تسجيل دخول",  nas: "CityNet",   status: "success", time: "8 د" },
  { user: "Khalid_R", action: "رُفض الدخول",  nas: "TwixNet",   status: "danger",  time: "12 د" },
];

const NAV = [
  { icon: Home,      label: "الرئيسية",    path: "dashboard" },
  { icon: Users,     label: "المشتركون",   path: "subscribers" },
  { icon: CreditCard,label: "الكروت",      path: "vouchers" },
  { icon: BarChart3, label: "التقارير",    path: "reports" },
  { icon: Settings,  label: "الإعدادات",   path: "settings" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const alertStyle = (type: string, dark: boolean) => {
  const map: Record<string, { border: string; bg: string; icon: string }> = {
    danger:  { border: T.danger,  bg: dark ? "#2D1515" : T.dangerBg,  icon: T.danger },
    warning: { border: T.warning, bg: dark ? "#2D2010" : T.warningBg, icon: T.warning },
    info:    { border: T.info,    bg: dark ? "#0F1E35" : T.infoBg,    icon: T.info },
  };
  return map[type] || map.info;
};

const statusColor = (s: string) => ({
  success: { bg: "#DCFCE7", text: "#16A34A", label: "نجاح" },
  warning: { bg: "#FEF9C3", text: "#CA8A04", label: "تحذير" },
  danger:  { bg: "#FEE2E2", text: "#DC2626", label: "خطر" },
}[s] || { bg: "#DBEAFE", text: "#2563EB", label: "معلومة" });

// ─── Sub-components ───────────────────────────────────────────────────────────

function PrimaryCard({ kpi, dark }: { kpi: typeof PRIMARY_KPIS[0]; dark: boolean }) {
  const Icon = kpi.icon;
  const isUp = kpi.change > 0;
  const surface = dark ? T.dkCard : T.bgSurface;
  const border  = dark ? T.dkBorder : T.border;
  return (
    <div style={{
      background: surface,
      borderRadius: 20,
      border: `1px solid ${border}`,
      boxShadow: dark
        ? "0 4px 24px rgba(0,0,0,0.35)"
        : "0 2px 16px rgba(20,184,166,0.08), 0 1px 4px rgba(0,0,0,0.05)",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Accent glow */}
      <div style={{
        position: "absolute", top: -30, right: -30,
        width: 120, height: 120, borderRadius: "50%",
        background: kpi.color + "18",
        filter: "blur(20px)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{
          background: kpi.bg,
          borderRadius: 14,
          padding: "10px",
          border: `1px solid ${kpi.color}25`,
        }}>
          <Icon size={22} style={{ color: kpi.color }} />
        </div>
        <span style={{
          display: "flex", alignItems: "center", gap: 4,
          background: isUp ? T.successBg : T.dangerBg,
          color: isUp ? T.success : T.danger,
          fontSize: 12, fontWeight: 700,
          padding: "4px 10px", borderRadius: 20,
        }}>
          {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(kpi.change)}%
        </span>
      </div>

      <div style={{
        color: dark ? T.dkTextH : T.textH,
        fontSize: 32, fontWeight: 800,
        fontFamily: "'Inter', monospace",
        letterSpacing: "-0.5px",
        lineHeight: 1,
        marginBottom: 6,
      }}>
        {kpi.value}
      </div>
      <div style={{ color: dark ? T.dkTextM : T.textM, fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
        {kpi.label}
      </div>
      <div style={{ color: kpi.color, fontSize: 12, fontWeight: 600 }}>
        {kpi.sub}
      </div>
    </div>
  );
}

function SecondaryCard({ kpi, dark }: { kpi: typeof SECONDARY_KPIS[0]; dark: boolean }) {
  const Icon = kpi.icon;
  const isUp = kpi.change > 0;
  const isZero = kpi.change === 0;
  const surface = dark ? T.dkCard : T.bgSurface;
  const border  = dark ? T.dkBorder : T.border;
  return (
    <div style={{
      background: surface,
      borderRadius: 16,
      border: `1px solid ${border}`,
      boxShadow: dark
        ? "0 2px 12px rgba(0,0,0,0.3)"
        : "0 1px 8px rgba(0,0,0,0.05)",
      padding: "18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ background: kpi.bg, borderRadius: 10, padding: 8 }}>
          <Icon size={17} style={{ color: kpi.color }} />
        </div>
        {!isZero && (
          <span style={{
            color: isUp ? T.success : T.danger,
            fontSize: 11, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 2,
          }}>
            {isUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(kpi.change)}%
          </span>
        )}
      </div>
      <div style={{ color: dark ? T.dkTextH : T.textH, fontSize: 24, fontWeight: 800, fontFamily: "monospace", letterSpacing: "-0.5px" }}>
        {kpi.value}
      </div>
      <div style={{ color: dark ? T.dkTextM : T.textM, fontSize: 12, marginTop: 3 }}>
        {kpi.label}
      </div>
    </div>
  );
}

function HealthBadge({ h, dark }: { h: typeof HEALTH[0]; dark: boolean }) {
  const Icon = h.icon;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: dark ? T.dkCard : T.bgSurface,
      border: `1px solid ${h.color}30`,
      borderRadius: 12,
      padding: "8px 14px",
      boxShadow: `0 0 0 1px ${h.color}15`,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: h.color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={14} style={{ color: h.color }} />
      </div>
      <div>
        <div style={{ color: dark ? T.dkTextM : T.textM, fontSize: 10, fontWeight: 500 }}>{h.label}</div>
        <div style={{ color: h.color, fontSize: 14, fontWeight: 800, fontFamily: "monospace" }}>{h.value}</div>
      </div>
    </div>
  );
}

function AlertRow({ a, dark }: { a: typeof ALERTS[0]; dark: boolean }) {
  const Icon = a.icon;
  const s = alertStyle(a.type, dark);
  return (
    <div style={{
      background: s.bg,
      border: `1px solid ${s.border}40`,
      borderLeft: `3px solid ${s.border}`,
      borderRadius: 12,
      padding: "12px 14px",
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: s.border + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={15} style={{ color: s.icon }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: dark ? T.dkTextH : T.textH, fontWeight: 700, fontSize: 13 }}>{a.title}</div>
        <div style={{ color: dark ? T.dkTextM : T.textM, fontSize: 11, marginTop: 2 }}>{a.desc}</div>
      </div>
      <span style={{ color: dark ? T.dkTextM : T.textS, fontSize: 10, flexShrink: 0, marginTop: 2 }}>منذ {a.time}</span>
    </div>
  );
}

function ActivityRow({ row, dark, last }: { row: typeof ACTIVITY[0]; dark: boolean; last: boolean }) {
  const sc = statusColor(row.status);
  const border = dark ? T.dkBorder : T.border;
  return (
    <div style={{
      display: "flex", alignItems: "center", padding: "11px 16px",
      borderBottom: last ? "none" : `1px solid ${border}`,
      gap: 12,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: T.teal + "18",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: T.teal, fontWeight: 800, fontSize: 13, flexShrink: 0,
      }}>
        {row.user[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: dark ? T.dkTextH : T.textH, fontWeight: 600, fontSize: 13 }}>{row.user}</div>
        <div style={{ color: dark ? T.dkTextM : T.textM, fontSize: 11 }}>{row.action} · {row.nas}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <span style={{ background: sc.bg, color: sc.text, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
          {sc.label}
        </span>
        <span style={{ color: dark ? T.dkTextM : T.textS, fontSize: 10 }}>{row.time}</span>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardPreview() {
  const [dark, setDark]         = useState(false);
  const [debug, setDebug]       = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [debugClicks, setDebugClicks] = useState(0);

  // Secret debug toggle: click logo 5 times
  useEffect(() => {
    if (debugClicks >= 5) { setDebug(d => !d); setDebugClicks(0); }
  }, [debugClicks]);

  const bg      = dark ? T.dkBase    : T.bgBase;
  const surface = dark ? T.dkSurface : T.bgSurface;
  const card    = dark ? T.dkCard    : T.bgSurface;
  const border  = dark ? T.dkBorder  : T.border;
  const textH   = dark ? T.dkTextH   : T.textH;
  const textM   = dark ? T.dkTextM   : T.textM;
  const textS   = dark ? T.dkTextM   : T.textS;

  const sideW = collapsed ? 68 : 232;

  return (
    <div style={{ background: bg, minHeight: "100vh", fontFamily: "'Inter','Segoe UI',sans-serif", direction: "rtl" }}>

      {/* ═══════════════ DESKTOP SIDEBAR ═══════════════ */}
      <aside className="hidden md:flex" style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: sideW,
        background: surface,
        borderLeft: `1px solid ${border}`,
        flexDirection: "column",
        zIndex: 40,
        transition: "width 0.22s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
        boxShadow: dark ? "none" : "-2px 0 20px rgba(0,0,0,0.04)",
      }}>
        {/* Logo */}
        <button
          onClick={() => setDebugClicks(c => c + 1)}
          style={{
            padding: collapsed ? "18px 0" : "18px 16px",
            borderBottom: `1px solid ${border}`,
            display: "flex", alignItems: "center", gap: 10,
            background: "none", border: "none", cursor: "pointer",
            width: "100%", justifyContent: collapsed ? "center" : "flex-start",
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${T.teal}, ${T.tealDark})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, boxShadow: `0 4px 12px ${T.teal}40`,
          }}>
            <Wifi size={17} color="#fff" />
          </div>
          {!collapsed && (
            <div style={{ textAlign: "right" }}>
              <div style={{ color: textH, fontWeight: 800, fontSize: 14, letterSpacing: "-0.3px" }}>Radius Pro</div>
              <div style={{ color: T.teal, fontSize: 10, fontWeight: 600 }}>لوحة التحكم</div>
            </div>
          )}
        </button>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {NAV.map((item, i) => {
            const Icon = item.icon;
            const active = i === activeNav;
            return (
              <button key={i} onClick={() => setActiveNav(i)} style={{
                width: "100%",
                display: "flex", alignItems: "center",
                gap: 10,
                padding: collapsed ? "12px 0" : "11px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 10, border: "none", cursor: "pointer",
                background: active ? T.teal + "15" : "transparent",
                color: active ? T.teal : textM,
                fontWeight: active ? 700 : 400,
                fontSize: 13, marginBottom: 2,
                transition: "all 0.15s",
                minHeight: 44,
                position: "relative",
              }}>
                {active && (
                  <div style={{
                    position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
                    width: 3, height: 20, borderRadius: "3px 0 0 3px",
                    background: T.teal,
                  }} />
                )}
                <Icon size={17} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ flex: 1, textAlign: "right" }}>{item.label}</span>}
                {!collapsed && active && <ChevronRight size={13} style={{ opacity: 0.5 }} />}
              </button>
            );
          })}
        </nav>

        {/* Collapse */}
        <div style={{ padding: "10px 8px", borderTop: `1px solid ${border}` }}>
          <button onClick={() => setCollapsed(c => !c)} style={{
            width: "100%", display: "flex", alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 8, padding: "10px 12px",
            borderRadius: 10, border: "none", cursor: "pointer",
            background: "transparent", color: textM, fontSize: 12, minHeight: 44,
          }}>
            <Layers size={15} />
            {!collapsed && <span>طي القائمة</span>}
          </button>
        </div>
      </aside>

      {/* ═══════════════ DESKTOP MAIN ═══════════════ */}
      <div className="hidden md:block" style={{
        marginRight: sideW,
        transition: "margin 0.22s cubic-bezier(.4,0,.2,1)",
        minHeight: "100vh",
      }}>

        {/* Header */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          background: dark ? T.dkSurface + "EE" : "#FFFFFFEE",
          backdropFilter: "blur(16px)",
          borderBottom: `1px solid ${border}`,
          padding: "0 24px",
          height: 58,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: textH, fontWeight: 700, fontSize: 15 }}>لوحة التحكم</span>
            <ChevronRight size={13} style={{ color: textS, transform: "rotate(180deg)" }} />
            <span style={{ color: textM, fontSize: 13 }}>الرئيسية</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Debug (visible only when active) */}
            {debug && (
              <span style={{
                background: T.teal + "18", color: T.teal,
                fontSize: 11, fontWeight: 700,
                padding: "3px 10px", borderRadius: 20,
                border: `1px solid ${T.teal}30`,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <Bug size={11} /> Debug ON
              </span>
            )}
            <button onClick={() => setDark(d => !d)} style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1px solid ${border}`,
              background: dark ? T.dkCard : "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: textM, transition: "all 0.15s",
            }}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1px solid ${border}`,
              background: dark ? T.dkCard : "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: textM, position: "relative",
            }}>
              <Bell size={15} />
              <span style={{
                position: "absolute", top: 7, right: 7,
                width: 7, height: 7, borderRadius: "50%",
                background: T.danger,
                boxShadow: `0 0 0 2px ${dark ? T.dkSurface : "#fff"}`,
              }} />
            </button>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: `linear-gradient(135deg, ${T.teal}, ${T.tealDark})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 800, fontSize: 13,
              boxShadow: `0 2px 8px ${T.teal}40`,
              cursor: "pointer",
            }}>A</div>
          </div>
        </header>

        <main style={{ padding: "20px 24px 32px" }}>

          {/* ── Status Bar ── */}
          <div style={{
            background: dark
              ? `linear-gradient(135deg, ${T.dkCard}, ${T.dkSurface})`
              : `linear-gradient(135deg, ${T.tealLight}, #EFF6FF)`,
            borderRadius: 16,
            border: `1px solid ${dark ? T.dkBorder : T.teal + "25"}`,
            padding: "14px 20px",
            marginBottom: 20,
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap", gap: 12,
            boxShadow: dark ? "none" : `0 2px 12px ${T.teal}10`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: T.success,
                boxShadow: `0 0 0 3px ${T.success}30, 0 0 0 6px ${T.success}10`,
              }} />
              <span style={{ color: textH, fontWeight: 700, fontSize: 14 }}>جميع الأنظمة تعمل بشكل طبيعي</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {HEALTH.map((h, i) => <HealthBadge key={i} h={h} dark={dark} />)}
            </div>
            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 9,
              border: `1px solid ${border}`,
              background: dark ? T.dkCard : T.bgSurface,
              color: textM, cursor: "pointer", fontSize: 12, fontWeight: 500,
            }}>
              <RefreshCw size={13} /> تحديث
            </button>
          </div>

          {/* ── Debug Panel ── */}
          {debug && (
            <div style={{
              background: dark ? "#0A1628" : "#F0FDF4",
              border: `1px dashed ${T.teal}60`,
              borderRadius: 14,
              padding: "16px 20px",
              marginBottom: 20,
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16,
            }}>
              {[
                { label: "TotalUsed (Today)", value: "847 GB",  color: T.teal },
                { label: "Remaining Quota",   value: "153 GB",  color: T.warning },
                { label: "WindowRemaining",   value: "2h 14m",  color: T.info },
              ].map((d, i) => (
                <div key={i}>
                  <div style={{ color: textM, fontSize: 10, marginBottom: 4, fontFamily: "monospace" }}>{d.label}</div>
                  <div style={{ color: d.color, fontWeight: 800, fontSize: 22, fontFamily: "monospace" }}>{d.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Primary KPIs ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {PRIMARY_KPIS.map((k, i) => <PrimaryCard key={i} kpi={k} dark={dark} />)}
          </div>

          {/* ── Secondary KPIs ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {SECONDARY_KPIS.map((k, i) => <SecondaryCard key={i} kpi={k} dark={dark} />)}
          </div>

          {/* ── Alerts + Activity ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 20 }}>

            {/* Alerts */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ color: textH, fontWeight: 700, fontSize: 14 }}>التنبيهات</span>
                <span style={{
                  background: T.dangerBg, color: T.danger,
                  fontSize: 11, fontWeight: 700,
                  padding: "2px 9px", borderRadius: 20,
                }}>
                  {ALERTS.length} نشط
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ALERTS.map((a, i) => <AlertRow key={i} a={a} dark={dark} />)}
              </div>
            </div>

            {/* Activity */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ color: textH, fontWeight: 700, fontSize: 14 }}>النشاط الأخير</span>
                <button style={{
                  color: T.teal, fontSize: 12, fontWeight: 600,
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  عرض الكل <ArrowUpRight size={12} />
                </button>
              </div>
              <div style={{
                background: card,
                borderRadius: 16,
                border: `1px solid ${border}`,
                overflow: "hidden",
                boxShadow: dark ? "0 2px 12px rgba(0,0,0,0.3)" : "0 1px 8px rgba(0,0,0,0.04)",
              }}>
                {ACTIVITY.map((row, i) => (
                  <ActivityRow key={i} row={row} dark={dark} last={i === ACTIVITY.length - 1} />
                ))}
              </div>
            </div>
          </div>

        </main>
      </div>

      {/* ═══════════════ MOBILE ═══════════════ */}
      <div className="md:hidden">
        {/* Mobile Header */}
        <header style={{
          position: "sticky", top: 0, zIndex: 30,
          background: dark ? T.dkSurface + "F2" : "#FFFFFFF2",
          backdropFilter: "blur(16px)",
          borderBottom: `1px solid ${border}`,
          padding: "0 16px",
          height: 56,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: `linear-gradient(135deg, ${T.teal}, ${T.tealDark})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 2px 8px ${T.teal}40`,
            }}>
              <Wifi size={14} color="#fff" />
            </div>
            <span style={{ color: textH, fontWeight: 800, fontSize: 15 }}>Radius Pro</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setDark(d => !d)} style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1px solid ${border}`,
              background: dark ? T.dkCard : "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: textM,
            }}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1px solid ${border}`,
              background: dark ? T.dkCard : "transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: textM, position: "relative",
            }}>
              <Bell size={15} />
              <span style={{
                position: "absolute", top: 7, right: 7,
                width: 7, height: 7, borderRadius: "50%",
                background: T.danger,
                boxShadow: `0 0 0 2px ${dark ? T.dkSurface : "#fff"}`,
              }} />
            </button>
          </div>
        </header>

        <main style={{ padding: "14px 14px 80px" }}>

          {/* Status pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: dark ? T.dkCard : T.tealLight,
            border: `1px solid ${T.teal}25`,
            borderRadius: 12, padding: "10px 14px",
            marginBottom: 14,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.success, boxShadow: `0 0 0 3px ${T.success}30` }} />
            <span style={{ color: textH, fontWeight: 600, fontSize: 13 }}>جميع الأنظمة تعمل</span>
            <span style={{ color: T.teal, fontSize: 12, marginRight: "auto" }}>API: 42ms</span>
          </div>

          {/* Primary KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {PRIMARY_KPIS.map((k, i) => <PrimaryCard key={i} kpi={k} dark={dark} />)}
          </div>

          {/* Secondary KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {SECONDARY_KPIS.map((k, i) => <SecondaryCard key={i} kpi={k} dark={dark} />)}
          </div>

          {/* Alerts */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: textH, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>التنبيهات</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ALERTS.map((a, i) => <AlertRow key={i} a={a} dark={dark} />)}
            </div>
          </div>

          {/* Activity */}
          <div>
            <div style={{ color: textH, fontWeight: 700, fontSize: 13, marginBottom: 10 }}>النشاط الأخير</div>
            <div style={{
              background: card, borderRadius: 16,
              border: `1px solid ${border}`, overflow: "hidden",
              boxShadow: dark ? "0 2px 12px rgba(0,0,0,0.3)" : "0 1px 8px rgba(0,0,0,0.04)",
            }}>
              {ACTIVITY.map((row, i) => (
                <ActivityRow key={i} row={row} dark={dark} last={i === ACTIVITY.length - 1} />
              ))}
            </div>
          </div>
        </main>

        {/* Bottom Nav */}
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: dark ? T.dkSurface + "F5" : "#FFFFFFF5",
          backdropFilter: "blur(20px)",
          borderTop: `1px solid ${border}`,
          display: "flex", height: 62, zIndex: 50,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}>
          {NAV.slice(0, 4).map((item, i) => {
            const Icon = item.icon;
            const active = i === activeNav;
            return (
              <button key={i} onClick={() => setActiveNav(i)} style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 3, border: "none", background: "transparent",
                cursor: "pointer", color: active ? T.teal : textM,
                minHeight: 44, position: "relative",
              }}>
                {active && (
                  <div style={{
                    position: "absolute", top: 0, left: "50%",
                    transform: "translateX(-50%)",
                    width: 24, height: 2, borderRadius: 2,
                    background: T.teal,
                  }} />
                )}
                <Icon size={20} />
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Preview Badge */}
      <div style={{
        position: "fixed", top: 10, left: 10,
        background: `linear-gradient(135deg, ${T.teal}, ${T.tealDark})`,
        color: "#fff", fontSize: 10, fontWeight: 800,
        padding: "4px 10px", borderRadius: 20, zIndex: 9999,
        letterSpacing: 1, boxShadow: `0 2px 8px ${T.teal}50`,
      }}>
        PREVIEW v2
      </div>
    </div>
  );
}
