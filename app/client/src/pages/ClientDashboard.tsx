import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { formatDate, formatTime, parseDateTimeLocal, todayLocalDate } from "@/lib/timezoneV6";
import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { formatPrice } from "../../../shared/currencies";
import {
  Wallet,
  Activity,
  CreditCard,
  Users,
  Download,
  DollarSign,
  CalendarX2,
  LogIn,
  CheckSquare,
  AlarmClock,
  Server,
  RefreshCw,
  ArrowUpRight,
  Clock,
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
  Zap,
  Shield,
  BarChart3,
  MessageSquare,
  Bell,
  ChevronRight,
} from "lucide-react";

// ─── Design Tokens (theme-aware via CSS variables) ────────────────────────────
const C = {
  bg:          "var(--background)",
  card:        "var(--card)",
  cardHover:   "var(--accent)",
  border:      "var(--border)",
  borderHover: "rgba(99,102,241,0.4)",
  primary:     "#2563EB",
  secondary:   "#7C3AED",
  accent:      "#9333EA",
  cyan:        "#06B6D4",
  success:     "#10B981",
  warning:     "#F59E0B",
  danger:      "#EF4444",
  textPrimary: "var(--foreground)",
  textSecondary: "var(--muted-foreground)",
  glow:        "rgba(37,99,235,0.15)",
};

function ownerClock(d: Date, timezone: string) {
  return { time: formatTime(d, timezone, true), date: formatDate(d, timezone) };
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
  glow: string;
  onClick?: () => void;
  badge?: string;
  trend?: { value: string; up: boolean };
}

function StatCard({ label, value, sub, icon, gradient, glow, onClick, badge, trend }: StatCardProps) {
  const [hovered, setHovered] = useState(false);
  const isMobile = useIsMobile();
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: gradient,
        borderRadius: isMobile ? 12 : 16,
        padding: isMobile ? "12px 12px" : "20px 22px",
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${hovered ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}`,
        boxShadow: hovered ? `0 8px 32px ${glow}` : `0 4px 16px ${glow}`,
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition: "all 0.25s ease",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Cairo', sans-serif",
      }}
    >
      {/* Shimmer */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ fontSize: isMobile ? 10 : 12, color: "rgba(255,255,255,0.7)", fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
        <div style={{
          width: isMobile ? 28 : 38, height: isMobile ? 28 : 38, borderRadius: isMobile ? 8 : 10,
          background: "rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: isMobile ? 20 : 28, fontWeight: 800, color: "#fff", lineHeight: 1, marginBottom: isMobile ? 3 : 6 }}>{value}</div>
      {sub && !isMobile && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>{sub}</div>}
      {trend && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
          {trend.up ? <TrendingUp size={12} color="#6ee7b7" /> : <TrendingDown size={12} color="#fca5a5" />}
          <span style={{ fontSize: 11, color: trend.up ? "#6ee7b7" : "#fca5a5", fontWeight: 600 }}>{trend.value}</span>
        </div>
      )}
      {badge && (
        <div style={{
          marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4,
          background: "rgba(255,255,255,0.15)", borderRadius: 20,
          padding: "3px 10px", fontSize: 11, color: "#fff", fontWeight: 600,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
          {badge}
        </div>
      )}
    </div>
  );
}

// ─── Glass Card ───────────────────────────────────────────────────────────────
function GlassCard({ children, style = {}, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.card,
        borderRadius: 16,
        border: `1px solid ${hovered && onClick ? C.borderHover : C.border}`,
        boxShadow: hovered && onClick ? `0 8px 32px rgba(37,99,235,0.12)` : "0 2px 12px rgba(0,0,0,0.3)",
        transform: hovered && onClick ? "translateY(-1px)" : "translateY(0)",
        transition: "all 0.25s ease",
        cursor: onClick ? "pointer" : "default",
        fontFamily: "'Cairo', sans-serif",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Quick Action Button ──────────────────────────────────────────────────────
function QuickAction({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? `${color}22` : `${color}11`,
        border: `1px solid ${hovered ? color : `${color}44`}`,
        borderRadius: 12,
        padding: "14px 12px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        cursor: "pointer",
        transition: "all 0.2s ease",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        fontFamily: "'Cairo', sans-serif",
        width: "100%",
      }}
    >
      <div style={{ color }}>{icon}</div>
      <span style={{ fontSize: 12, fontWeight: 700, color: hovered ? color : C.textSecondary }}>{label}</span>
    </button>
  );
}

// ─── NAS Status Item ──────────────────────────────────────────────────────────
function NasItem({ nas, language }: { nas: { nasName: string; isOnline: boolean; sessionCount: number }; language: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 14px",
      background: nas.isOnline ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)",
      borderRadius: 12,
      border: `1px solid ${nas.isOnline ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)"}`,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: nas.isOnline ? "rgba(16,185,129,0.2)" : "rgba(148,163,184,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {nas.isOnline
          ? <Wifi size={18} color={C.success} />
          : <WifiOff size={18} color={C.textSecondary} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {nas.nasName}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: nas.isOnline ? C.success : C.textSecondary,
            display: "inline-block",
            ...(nas.isOnline ? { animation: "pulse 2s infinite" } : {}),
          }} />
          <span style={{ fontSize: 11, color: nas.isOnline ? C.success : C.textSecondary, fontWeight: 600 }}>
            {nas.isOnline ? (language === "ar" ? "متصل" : "Online") : (language === "ar" ? "غير متصل" : "Offline")}
          </span>
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.textPrimary }}>{nas.sessionCount}</div>
        <div style={{ fontSize: 10, color: C.textSecondary }}>{language === "ar" ? "جلسة" : "sessions"}</div>
      </div>
    </div>
  );
}

// ─── Weekly Chart ─────────────────────────────────────────────────────────────
function WeeklyChart({ data, language, timezone }: { data: { day: string; sessions: number }[]; language: string; timezone: string }) {
  const max = Math.max(...data.map(d => d.sessions), 1);
  const W = 500, H = 100, PAD = 8;
  const pts = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: PAD + ((max - d.sessions) / max) * (H - PAD * 2),
    ...d,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;
  const _days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const _daysAr = ["أحد", "اثن", "ثلا", "أرب", "خمس", "جمع", "سبت"];
  return (
    <div style={{ position: "relative", width: "100%", height: 140 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="clientChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.03" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={areaPath} fill="url(#clientChartGrad)" />
        <path d={linePath} fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#7C3AED" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        ))}
      </svg>
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        display: "flex", justifyContent: "space-between", padding: "0 4px",
      }}>
        {data.map((d, i) => {
          const isToday = d.day === todayLocalDate(timezone);
          const ownerDate = parseDateTimeLocal(`${d.day}T12:00`, timezone);
          const dayIndex = ownerDate ? new Date(ownerDate.getTime()).getUTCDay() : 0;
          const label = language === "ar" ? _daysAr[dayIndex] : _days[dayIndex];
          return (
            <span key={i} style={{
              fontSize: 10, fontWeight: isToday ? 800 : 500,
              color: isToday ? "#a78bfa" : C.textSecondary,
            }}>{label}</span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Responsive Hook ─────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClientDashboard() {
  const { timezone } = useTimezoneV6();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const isAr = language === "ar";
  const isMobile = useIsMobile();

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Data fetching
  const { data: clientStats, isLoading, refetch } = trpc.dashboard.getClientStats.useQuery(
    undefined,
    { refetchInterval: 120000, refetchIntervalInBackground: false, staleTime: 60000 }
  );

  const formatCurrency = (amount: string | number) => formatPrice(amount, "USD");
  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  // Balance color
  const balanceVal = parseFloat(clientStats?.currentBalance || "0");
  const balanceGradient = balanceVal > 10
    ? "linear-gradient(135deg, #059669 0%, #10B981 100%)"
    : balanceVal >= 1
    ? "linear-gradient(135deg, #D97706 0%, #F59E0B 100%)"
    : "linear-gradient(135deg, #DC2626 0%, #EF4444 100%)";
  const balanceGlow = balanceVal > 10 ? "rgba(16,185,129,0.3)" : balanceVal >= 1 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--background)",
      fontFamily: "'Cairo', sans-serif",
      color: "var(--foreground)",
      padding: isMobile ? "14px 12px" : "24px 28px",
      direction: isAr ? "rtl" : "ltr",
    }}>

      {/* ── Low Balance Warning ── */}
      {clientStats && balanceVal <= 5 && balanceVal > 0 && (
        <div style={{
          background: balanceVal <= 2
            ? "linear-gradient(135deg, #7f1d1d, #991b1b)"
            : "linear-gradient(135deg, #78350f, #92400e)",
          borderRadius: 14,
          padding: "14px 20px",
          marginBottom: 24,
          border: `1px solid ${balanceVal <= 2 ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          boxShadow: `0 4px 20px ${balanceVal <= 2 ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>{balanceVal <= 2 ? "🚨" : "⚠️"}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                {isAr
                  ? balanceVal <= 2 ? "تحذير: رصيدك منخفض جداً!" : "تنبيه: رصيدك يقترب من الصفر"
                  : balanceVal <= 2 ? "Warning: Balance critically low!" : "Notice: Balance running low"}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                {isAr
                  ? `رصيدك الحالي ${formatCurrency(clientStats.currentBalance)} — أضف رصيداً لتجنب انقطاع الخدمة`
                  : `Current balance ${formatCurrency(clientStats.currentBalance)} — Add funds to avoid interruption`}
              </div>
            </div>
          </div>
          <button
            onClick={() => setLocation("/wallet")}
            style={{
              background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 10, padding: "8px 16px", color: "#fff", fontSize: 13,
              fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo', sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            {isAr ? "شحن الآن" : "Top Up Now"}
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        display: "flex",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "space-between",
        marginBottom: isMobile ? 16 : 28,
        flexDirection: isMobile ? "column" : "row",
        gap: 10,
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 17 : 24, fontWeight: 800, color: C.textPrimary, margin: 0, lineHeight: 1.2 }}>
            {isAr ? `مرحباً، ${user?.name} 👋` : `Welcome, ${user?.name} 👋`}
          </h1>
          <p style={{ fontSize: 12, color: C.textSecondary, margin: "4px 0 0" }}>
            {isAr ? "لوحة التحكم — إدارة شبكتك" : "Dashboard — Manage your network"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Live Clock - hidden on mobile */}
          {!isMobile && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
            }}>
              <Clock size={15} color={C.primary} />
              <div style={{ textAlign: isAr ? "right" : "left" }}>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: C.textPrimary, letterSpacing: 2, lineHeight: 1 }}>
                  {ownerClock(currentTime, timezone).time}
                </div>
                <div style={{ fontSize: 10, color: C.textSecondary, marginTop: 2 }}>
                  {ownerClock(currentTime, timezone).date}
                </div>
              </div>
            </div>
          )}
          {/* Refresh */}
          <button
            onClick={() => refetch()}
            style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              color: C.textSecondary, fontSize: 13, fontWeight: 600, fontFamily: "'Cairo', sans-serif",
              transition: "all 0.2s",
            }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? "spin 1s linear infinite" : "none" }} />
            {isAr ? "تحديث" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <RefreshCw size={32} color={C.primary} style={{ animation: "spin 1s linear infinite", margin: "0 auto" }} />
          <p style={{ color: C.textSecondary, marginTop: 12, fontSize: 14 }}>
            {isAr ? "جاري تحميل البيانات..." : "Loading data..."}
          </p>
        </div>
      )}

      {clientStats && !isLoading && (
        <>
          {/* ── Row 1: Primary Stats ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
            gap: isMobile ? 8 : 16, marginBottom: isMobile ? 8 : 16,
          }}>
            <StatCard
              label={isAr ? "رصيدي الحالي" : "My Balance"}
              value={formatCurrency(clientStats.currentBalance)}
              sub={isAr ? "اضغط لإضافة رصيد" : "Tap to add funds"}
              icon={<Wallet size={18} color="#fff" />}
              gradient={balanceGradient}
              glow={balanceGlow}
              onClick={() => setLocation("/wallet")}
            />
            <StatCard
              label={isAr ? "أجهزة NAS النشطة" : "Active NAS"}
              value={clientStats.activeNasCount}
              sub={isAr ? "جهاز متصل" : "Connected devices"}
              icon={<Activity size={18} color="#fff" />}
              gradient="linear-gradient(135deg, #1d4ed8 0%, #4f46e5 100%)"
              glow="rgba(79,70,229,0.3)"
              onClick={() => setLocation("/nas")}
              badge={isAr ? "نشط" : "Active"}
            />
            <StatCard
              label={isAr ? "الكروت النشطة" : "Active Cards"}
              value={clientStats.activeCardsCount || 0}
              sub={isAr ? "كرت نشط أو قيد الاستخدام" : "Active or in use"}
              icon={<CheckSquare size={18} color="#fff" />}
              gradient="linear-gradient(135deg, #0d9488 0%, #059669 100%)"
              glow="rgba(13,148,136,0.3)"
              onClick={() => setLocation("/vouchers")}
            />
            <StatCard
              label={isAr ? "تنتهي خلال 7 أيام" : "Expiring in 7 Days"}
              value={clientStats.expiringCardsCount || 0}
              sub={isAr ? "كرت ينتهي قريباً" : "Cards expiring soon"}
              icon={<AlarmClock size={18} color="#fff" />}
              gradient="linear-gradient(135deg, #be123c 0%, #e11d48 100%)"
              glow="rgba(225,29,72,0.3)"
              onClick={() => setLocation("/vouchers")}
            />
          </div>

          {/* ── Row 2: Secondary Stats ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
            gap: isMobile ? 8 : 16, marginBottom: isMobile ? 8 : 16,
          }}>
            <StatCard
              label={isAr ? "بيانات اليوم" : "Today's Data"}
              value={formatBytes((clientStats.todayDownloadBytes || 0) + (clientStats.todayUploadBytes || 0))}
              sub={`↓ ${((clientStats.todayDownloadBytes || 0) / 1073741824).toFixed(2)} GB  ↑ ${((clientStats.todayUploadBytes || 0) / 1073741824).toFixed(2)} GB`}
              icon={<Download size={18} color="#fff" />}
              gradient="linear-gradient(135deg, #0369a1 0%, #0891b2 100%)"
              glow="rgba(8,145,178,0.3)"
            />
            <StatCard
              label={isAr ? "إيرادات بيع الكروت" : "Card Sales Revenue"}
              value={formatPrice(clientStats.totalCardRevenue || "0.00", (clientStats.cardRevenueCurrency || "USD") as any)}
              sub={isAr ? "إجمالي مبيعات الكروت" : "Total card sales"}
              icon={<DollarSign size={18} color="#fff" />}
              gradient="linear-gradient(135deg, #065f46 0%, #10b981 100%)"
              glow="rgba(16,185,129,0.3)"
              onClick={() => setLocation("/card-sales")}
              trend={
                clientStats.lastMonthCardRevenue && parseFloat(clientStats.lastMonthCardRevenue) > 0
                  ? {
                      value: `${Math.abs(((parseFloat(clientStats.totalCardRevenue || "0") - parseFloat(clientStats.lastMonthCardRevenue)) / parseFloat(clientStats.lastMonthCardRevenue)) * 100).toFixed(1)}%`,
                      up: parseFloat(clientStats.totalCardRevenue || "0") >= parseFloat(clientStats.lastMonthCardRevenue),
                    }
                  : undefined
              }
            />
            <StatCard
              label={isAr ? "كروت انتهت اليوم" : "Expired Today"}
              value={clientStats.cardsExpiredToday || 0}
              sub={isAr ? "كرت منتهي الصلاحية" : "Cards expired"}
              icon={<CalendarX2 size={18} color="#fff" />}
              gradient="linear-gradient(135deg, #c2410c 0%, #ea580c 100%)"
              glow="rgba(234,88,12,0.3)"
            />
            <StatCard
              label={isAr ? "تسجيل دخول اليوم" : "Logged In Today"}
              value={clientStats.cardsLoggedInToday || 0}
              sub={isAr ? "كرت تم استخدامه" : "Cards used"}
              icon={<LogIn size={18} color="#fff" />}
              gradient="linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)"
              glow="rgba(139,92,246,0.3)"
            />
          </div>

          {/* ── Row 3: Online Now + Bank Transfer + Quick Actions ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
            gap: isMobile ? 8 : 16, marginBottom: isMobile ? 8 : 16,
          }}>
            {/* Online Now */}
            <GlassCard style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(6,182,212,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Users size={18} color={C.cyan} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.textSecondary, fontWeight: 600 }}>
                    {isAr ? "المتصلون الآن" : "Online Now"}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: C.cyan, lineHeight: 1 }}>
                {clientStats.activeSessionsNow ?? 0}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.success, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: C.textSecondary }}>
                  {isAr ? "مستخدم متصل حالياً" : "Currently connected"}
                </span>
              </div>
            </GlassCard>

            {/* Bank Transfer */}
            <GlassCard style={{ padding: "20px 22px" }} onClick={() => setLocation("/wallet")}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(245,158,11,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <ArrowUpRight size={18} color={C.warning} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.textSecondary, fontWeight: 600 }}>
                    {isAr ? "طلبات التحويل البنكي" : "Bank Transfers"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{
                  background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: 8, padding: "6px 12px", fontSize: 12, color: C.warning, fontWeight: 700,
                }}>
                  {clientStats.bankTransferRequests.pending} {isAr ? "قيد المراجعة" : "Pending"}
                </div>
                <div style={{
                  background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
                  borderRadius: 8, padding: "6px 12px", fontSize: 12, color: C.success, fontWeight: 700,
                }}>
                  {clientStats.bankTransferRequests.approved} {isAr ? "موافق" : "Approved"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10, color: C.textSecondary, fontSize: 12 }}>
                <ChevronRight size={14} />
                {isAr ? "عرض التفاصيل" : "View details"}
              </div>
            </GlassCard>

            {/* Quick Actions */}
            <GlassCard style={{ padding: "20px 22px" }}>
              <div style={{ fontSize: 12, color: C.textSecondary, fontWeight: 700, marginBottom: 14, letterSpacing: 0.5 }}>
                {isAr ? "إجراءات سريعة" : "Quick Actions"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                <QuickAction icon={<CreditCard size={18} />} label={isAr ? "الكروت" : "Cards"} color={C.primary} onClick={() => setLocation("/vouchers")} />
                <QuickAction icon={<Wallet size={18} />} label={isAr ? "الرصيد" : "Wallet"} color={C.success} onClick={() => setLocation("/wallet")} />
                <QuickAction icon={<MessageSquare size={18} />} label={isAr ? "الدعم" : "Support"} color={C.accent} onClick={() => setLocation("/support")} />
              </div>
            </GlassCard>
          </div>

          {/* ── Row 4: Weekly Chart + NAS Status ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 8 : 16, marginBottom: isMobile ? 8 : 16,
          }}>
            {/* Weekly Chart */}
            {clientStats.weeklyChart && clientStats.weeklyChart.length > 0 && (
              <GlassCard style={{ padding: "20px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.textSecondary, fontWeight: 600, letterSpacing: 0.5 }}>
                      {isAr ? "الاستخدام الأسبوعي" : "WEEKLY USAGE"}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, marginTop: 2 }}>
                      {isAr ? "الجلسات — آخر 7 أيام" : "Sessions — Last 7 Days"}
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)",
                    borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#a78bfa", fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
                    {clientStats.weeklyChart.reduce((s, d) => s + d.sessions, 0)} {isAr ? "جلسة" : "sessions"}
                  </div>
                </div>
                <WeeklyChart data={clientStats.weeklyChart} language={language} timezone={timezone} />
              </GlassCard>
            )}

            {/* NAS Status */}
            {clientStats.nasStatusList && clientStats.nasStatusList.length > 0 && (
              <GlassCard style={{ padding: "20px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: C.textSecondary, fontWeight: 600, letterSpacing: 0.5 }}>
                      {isAr ? "حالة الأجهزة" : "DEVICE STATUS"}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, marginTop: 2 }}>
                      {isAr ? "أجهزة NAS" : "NAS Devices"}
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)",
                    borderRadius: 20, padding: "4px 12px", fontSize: 12, color: C.success, fontWeight: 700,
                  }}>
                    {clientStats.nasStatusList.filter(n => n.isOnline).length}/{clientStats.nasStatusList.length} {isAr ? "نشط" : "online"}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {clientStats.nasStatusList.slice(0, 4).map((nas, i) => (
                    <NasItem key={i} nas={nas} language={language} />
                  ))}
                  {clientStats.nasStatusList.length > 4 && (
                    <button
                      onClick={() => setLocation("/nas")}
                      style={{
                        background: "transparent", border: `1px solid ${C.border}`,
                        borderRadius: 10, padding: "8px 14px", color: C.textSecondary,
                        fontSize: 12, cursor: "pointer", fontFamily: "'Cairo', sans-serif",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}
                    >
                      {isAr ? `عرض ${clientStats.nasStatusList.length - 4} جهاز آخر` : `View ${clientStats.nasStatusList.length - 4} more devices`}
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </GlassCard>
            )}

            {/* If no weekly chart, show full-width NAS */}
            {(!clientStats.weeklyChart || clientStats.weeklyChart.length === 0) && clientStats.nasStatusList && clientStats.nasStatusList.length > 0 && (
              <GlassCard style={{ padding: "20px 22px", gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, marginBottom: 14 }}>
                  {isAr ? "حالة أجهزة NAS" : "NAS Devices Status"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                  {clientStats.nasStatusList.map((nas, i) => (
                    <NasItem key={i} nas={nas} language={language} />
                  ))}
                </div>
              </GlassCard>
            )}
          </div>

          {/* ── Row 5: More Quick Actions ── */}
          <GlassCard style={{ padding: "20px 22px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 16 }}>
              {isAr ? "روابط سريعة" : "Quick Links"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(auto-fill, minmax(120px, 1fr))", gap: isMobile ? 8 : 10 }}>
              <QuickAction icon={<Server size={20} />} label={isAr ? "أجهزة NAS" : "NAS Devices"} color={C.primary} onClick={() => setLocation("/nas")} />
              <QuickAction icon={<BarChart3 size={20} />} label={isAr ? "التقارير" : "Reports"} color={C.cyan} onClick={() => setLocation("/reports")} />
              <QuickAction icon={<Shield size={20} />} label={isAr ? "الجلسات" : "Sessions"} color={C.success} onClick={() => setLocation("/sessions")} />
              <QuickAction icon={<Zap size={20} />} label={isAr ? "المشتركون" : "Subscribers"} color={C.warning} onClick={() => setLocation("/subscribers")} />
              <QuickAction icon={<Bell size={20} />} label={isAr ? "الإشعارات" : "Notifications"} color={C.accent} onClick={() => setLocation("/notifications")} />
              <QuickAction icon={<TrendingUp size={20} />} label={isAr ? "مبيعات الكروت" : "Card Sales"} color="#f472b6" onClick={() => setLocation("/card-sales")} />
            </div>
          </GlassCard>
        </>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
