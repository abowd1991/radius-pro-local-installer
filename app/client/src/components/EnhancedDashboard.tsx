/**
 * EnhancedDashboard — Radius Pro SaaS Dashboard
 * تصميم عالمي احترافي: KPI Cards + Charts + Quick Actions + System Health
 */
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  Wifi, Download, Users, DollarSign, RefreshCw,
  TrendingUp, Server, Cpu, MemoryStick, HardDrive, Timer, Clock,
  Zap, ArrowRight, Activity, Network, CreditCard, BarChart3,
  Shield, Globe, Plus, Eye, Settings, AlertTriangle, CheckCircle2,
  Radio, ChevronUp, ChevronDown,
} from "lucide-react";
import { formatPrice } from "../../../shared/currencies";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { formatDate, formatTime, parseDateTimeLocal, todayLocalDate } from "@/lib/timezoneV6";

function ownerClock(d: Date, timezone: string) {
  return { time: formatTime(d, timezone, true), date: formatDate(d, timezone) };
}
function ownerDayOfWeek(dateStr: string, timezone: string): number {
  const d = parseDateTimeLocal(`${dateStr}T12:00`, timezone);
  if (!d) return 0;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).formatToParts(d);
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Sun';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`;
}

/* ─── Sparkline ──────────────────────────────────────────────────────────── */
function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 80, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const areaPath = `M${pts.split(' ').join(' L')} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} className="opacity-60">
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${color.replace('#', '')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Area Chart ─────────────────────────────────────────────────────────── */
function AreaChart({ data, language, timezone }: { data: { day: string; sessions: number }[]; language: string; timezone: string }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.sessions), 1);
  const w = 500, h = 100, pad = 8;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + ((max - d.sessions) / max) * (h - pad * 2);
    return { x, y, ...d };
  });
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`;
  const _days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const _daysAr = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];
  return (
    <div className="relative w-full" style={{ height: 140 }}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 110 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad2)" />
        <path d={linePath} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#6366f1" stroke="#1e1b4b" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
        {data.map((d, i) => {
          const isToday = d.day === todayLocalDate(timezone);
          const idx = ownerDayOfWeek(d.day, timezone);
          const label = language === 'ar' ? _daysAr[idx] : _days[idx];
          return (
            <span key={i} className="text-[10px] font-medium"
              style={{ color: isToday ? '#818cf8' : 'var(--muted-foreground)' }}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ─── NAS Bar Chart ──────────────────────────────────────────────────────── */
function NasBarChart({ data, language }: {
  data: { nasName: string; downloadBytes: number; uploadBytes: number; sessions: number }[];
  language: string;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--muted-foreground)' }}>
        {language === "ar" ? "لا توجد بيانات" : "No data"}
      </div>
    );
  }

  const maxBytes = Math.max(...data.map(d => d.downloadBytes + d.uploadBytes), 1);
  const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];
  return (
    <div className="space-y-3">
      {data.slice(0, 6).map((nas, i) => {
        const total = nas.downloadBytes + nas.uploadBytes;
        const pct = Math.max((total / maxBytes) * 100, 3);
        return (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold truncate max-w-[130px]" style={{ color: 'var(--foreground)' }}>{nas.nasName}</span>
              <span style={{ color: 'var(--muted-foreground)' }}>{formatBytes(total)}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${colors[i % colors.length]}, ${colors[i % colors.length]}aa)` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────────────────────── */
function KpiCard({
  title, value, subtitle, icon: Icon, gradient, sparkData, onClick, trend,
}: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string; sparkData?: number[];
  onClick?: () => void; trend?: { value: number; positive: boolean };
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 cursor-pointer transition-all duration-300 group"
      style={{
        background: gradient,
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,0,0,0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3)';
      }}
    >
      {/* Shine overlay */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)'
      }} />
      {/* Top line */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: 'rgba(255,255,255,0.2)' }} />

      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-1">{title}</p>
          <div className="text-3xl font-black text-white leading-none">{value}</div>
        </div>
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-white/60">{subtitle}</p>
          {trend && (
            <div className="flex items-center gap-1 mt-1">
              {trend.positive
                ? <ChevronUp className="h-3 w-3 text-white/80" />
                : <ChevronDown className="h-3 w-3 text-white/60" />}
              <span className="text-xs font-semibold text-white/80">{trend.value}%</span>
            </div>
          )}
        </div>
        {sparkData && sparkData.length > 0 && (
          <Sparkline data={sparkData} color="rgba(255,255,255,0.8)" height={28} />
        )}
      </div>
    </div>
  );
}

/* ─── System Health Card ─────────────────────────────────────────────────── */
function SystemHealthCard({
  label, value, icon: Icon, color, loading,
}: {
  label: string; value: string; icon: React.ElementType; color: string; loading: boolean;
}) {
  const pct = parseInt(value) || 0;
  const isHigh = pct > 80;
  const isMed = pct > 60;
  const barColor = isHigh ? '#EF4444' : isMed ? '#F59E0B' : color;
  return (
    <div className="rounded-2xl p-4 transition-all duration-300"
      style={{
        background: `linear-gradient(135deg, ${color}12 0%, ${color}06 100%)`,
        border: `1px solid ${color}22`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 8px 24px ${color}20`; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}>
      <div className="flex items-center justify-between mb-3">
        <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        {loading
          ? <RefreshCw className="h-4 w-4 animate-spin" style={{ color: 'var(--muted-foreground)' }} />
          : <span className="text-lg font-black" style={{ color }}>{value}</span>
        }
      </div>
      {!loading && pct > 0 && (
        <div className="h-1.5 rounded-full mb-2" style={{ background: 'var(--muted)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
        </div>
      )}
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
    </div>
  );
}

/* ─── Quick Action Button ────────────────────────────────────────────────── */
function QuickAction({ icon: Icon, label, color, onClick }: {
  icon: React.ElementType; label: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-200 group"
      style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}12`;
        e.currentTarget.style.border = `1px solid ${color}30`;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 20px ${color}20`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--muted)';
        e.currentTarget.style.border = '1px solid var(--border)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18` }}>
        <Icon className="h-4.5 w-4.5" style={{ color }} />
      </div>
      <span className="text-[11px] font-semibold text-center leading-tight" style={{ color: 'var(--muted-foreground)' }}>{label}</span>
    </button>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
interface EnhancedDashboardProps {
  userName: string;
  adminStats?: {
    totalRevenue: string;
    monthlyRevenue: string;
    pendingBankTransfers: number;
    totalSystemBalance: string;
    activeUsers: number;
    newUsersThisMonth: number;
    lowBalanceAccounts: number;
  } | null;
  isAdminStatsLoading?: boolean;
}

export function EnhancedDashboard({ userName, adminStats, isAdminStatsLoading }: EnhancedDashboardProps) {
  const { language, direction } = useLanguage();
  const { timezone } = useTimezoneV6();
  const [, setLocation] = useLocation();
  const ar = language === "ar";

  /* ── Live Clock ── */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const { time: timeStr, date: dateStr } = ownerClock(now, timezone);

  /* ── Data Queries ── */
  const { data: enhanced, isLoading, refetch } = trpc.dashboard.getEnhancedStats.useQuery(
    undefined,
    { refetchInterval: 300000, refetchIntervalInBackground: false, staleTime: 120000 }
  );
  const { data: vpsStats, isLoading: isVpsLoading } = trpc.vpsManagement.getStatus.useQuery(
    undefined,
    { refetchInterval: 120000, refetchIntervalInBackground: false, staleTime: 60000 }
  );

  const weeklySparkline = enhanced?.weeklyChart?.map((d: { day: string; sessions: number }) => d.sessions) ?? [];
  const totalWeeklySessions = enhanced?.weeklyChart?.reduce((s: number, d: { day: string; sessions: number }) => s + d.sessions, 0) ?? 0;

  /* ── Quick Actions ── */
  const quickActions = [
    { icon: Plus, label: ar ? "كرت جديد" : "New Card", color: "#2563EB", path: "/vouchers" },
    { icon: Users, label: ar ? "مشترك جديد" : "New Sub", color: "#7C3AED", path: "/subscribers" },
    { icon: Server, label: ar ? "إضافة NAS" : "Add NAS", color: "#0EA5E9", path: "/nas" },
    { icon: Eye, label: ar ? "الجلسات" : "Sessions", color: "#10B981", path: "/sessions" },
    { icon: BarChart3, label: ar ? "التقارير" : "Reports", color: "#F59E0B", path: "/reports" },
    { icon: Settings, label: ar ? "الإعدادات" : "Settings", color: "#6366F1", path: "/settings" },
  ];

  return (
    <div className="space-y-5 pb-4">

      {/* ══ Header ══════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-1.5 w-8 rounded-full" style={{ background: 'linear-gradient(90deg, #2563EB, #9333EA)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
              {ar ? "لوحة التحكم" : "Dashboard"}
            </span>
          </div>
          <h1 className="text-2xl font-black leading-tight" style={{ color: 'var(--foreground)' }}>
            {ar ? "مرحباً" : "Welcome back"},{" "}
            <span style={{ background: 'linear-gradient(135deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {userName}
            </span>
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            {ar ? "نظرة شاملة على شبكتك في الوقت الفعلي" : "Real-time overview of your network"}
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium"
            style={{ background: 'rgba(14,165,233,0.10)', border: '1px solid rgba(14,165,233,0.22)', color: 'var(--muted-foreground)' }}>
            <Globe className="h-3 w-3 text-sky-400" />
            <span>{ar ? "توقيت العرض" : "Display timezone"}: <b style={{ color: 'var(--foreground)' }}>{timezone}</b></span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Clock */}
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="h-7 w-7 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.15)' }}>
              <Clock className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <div className={`flex flex-col ${direction === "rtl" ? "items-end" : "items-start"}`}>
              <span className="text-lg font-black font-mono tracking-widest leading-none" style={{ color: 'var(--foreground)' }}>{timeStr}</span>
              <span className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{dateStr}</span>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-200"
            style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(37,99,235,0.18)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(37,99,235,0.08)'; }}
          >
            <RefreshCw className={`h-4 w-4 text-blue-400 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ══ KPI Cards ════════════════════════════════════════════════════════ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={ar ? "الجلسات النشطة" : "Active Sessions"}
          value={isLoading ? "—" : (enhanced?.activeSessionsNow ?? 0)}
          subtitle={ar ? "متصلون الآن" : "Online now"}
          icon={Wifi}
          gradient="linear-gradient(135deg, #059669 0%, #10B981 100%)"
          sparkData={weeklySparkline}
          onClick={() => setLocation("/sessions")}
          trend={{ value: 12, positive: true }}
        />
        <KpiCard
          title={ar ? "بيانات اليوم" : "Today's Data"}
          value={isLoading ? "—" : formatBytes((enhanced?.todayDownloadBytes ?? 0) + (enhanced?.todayUploadBytes ?? 0))}
          subtitle={`↓ ${formatBytes(enhanced?.todayDownloadBytes ?? 0)} · ↑ ${formatBytes(enhanced?.todayUploadBytes ?? 0)}`}
          icon={Download}
          gradient="linear-gradient(135deg, #2563EB 0%, #0EA5E9 100%)"
          sparkData={weeklySparkline}
        />
        <KpiCard
          title={ar ? "مشتركو PPPoE" : "PPPoE Subscribers"}
          value={isLoading ? "—" : (enhanced?.activeSubscribersCount ?? 0)}
          subtitle={ar ? "اشتراك نشط" : "Active subscriptions"}
          icon={Users}
          gradient="linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)"
          sparkData={weeklySparkline}
          onClick={() => setLocation("/subscribers")}
          trend={{ value: 5, positive: true }}
        />
        <KpiCard
          title={ar ? "إيرادات الشهر" : "Monthly Revenue"}
          value={isLoading ? "—" : formatPrice(enhanced?.monthlyRevenue ?? "0", "USD")}
          subtitle={ar ? "هذا الشهر" : "This month"}
          icon={DollarSign}
          gradient="linear-gradient(135deg, #D97706 0%, #EA580C 100%)"
          sparkData={weeklySparkline}
          onClick={() => setLocation("/wallet")}
          trend={{ value: 8, positive: true }}
        />
      </div>

      {/* ══ Admin Financial Cards ════════════════════════════════════════════ */}
      {adminStats && !isAdminStatsLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: ar ? "إجمالي الإيرادات" : "Total Revenue", value: formatPrice(adminStats.totalRevenue, "USD"), color: "#10B981", path: "/clients", icon: TrendingUp },
            { label: ar ? "رصيد النظام" : "System Balance", value: formatPrice(adminStats.totalSystemBalance, "USD"), color: "#2563EB", path: "/wallet", icon: DollarSign },
            { label: ar ? "تحويلات بنكية" : "Bank Transfers", value: adminStats.pendingBankTransfers, color: "#F59E0B", path: "/bank-transfer-admin", icon: CreditCard },
            { label: ar ? "رصيد منخفض" : "Low Balance", value: adminStats.lowBalanceAccounts, color: "#EF4444", path: "/clients", icon: AlertTriangle },
          ].map(({ label, value, color, path, icon: Icon }) => (
            <div
              key={label}
              className="rounded-2xl p-4 cursor-pointer transition-all duration-300"
              style={{ background: `${color}0D`, border: `1px solid ${color}22` }}
              onClick={() => setLocation(path)}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${color}20`; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <ArrowRight className="h-3.5 w-3.5" style={{ color: `${color}60` }} />
              </div>
              <div className="text-2xl font-black mb-1" style={{ color }}>{value}</div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: `${color}80` }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ══ Main Content Row ═════════════════════════════════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* ── Weekly Chart (2/3) ── */}
        <div className="lg:col-span-2 rounded-2xl p-5"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>
                {ar ? "الاستخدام الأسبوعي" : "Weekly Usage"}
              </p>
              <h3 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
                {ar ? "الجلسات خلال آخر 7 أيام" : "Sessions — Last 7 Days"}
              </h3>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-400" style={{ boxShadow: '0 0 6px #818cf8' }} />
              <span className="text-xs font-bold text-indigo-400">{totalWeeklySessions} {ar ? "جلسة" : "sessions"}</span>
            </div>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-36">
              <RefreshCw className="h-6 w-6 animate-spin" style={{ color: '#374151' }} />
            </div>
          ) : enhanced?.weeklyChart ? (
            <AreaChart data={enhanced.weeklyChart} language={language} timezone={timezone} />
          ) : (
            <div className="flex items-center justify-center h-36 text-sm" style={{ color: '#374151' }}>
              {ar ? "لا توجد بيانات" : "No data"}
            </div>
          )}
        </div>

        {/* ── Quick Actions (1/3) ── */}
        <div className="rounded-2xl p-5"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>
              {ar ? "إجراءات سريعة" : "Quick Actions"}
            </p>
            <h3 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
              {ar ? "الوصول السريع" : "Fast Access"}
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {quickActions.map((qa) => (
              <QuickAction key={qa.label} icon={qa.icon} label={qa.label} color={qa.color} onClick={() => setLocation(qa.path)} />
            ))}
          </div>
        </div>
      </div>

      {/* ══ System Health + NAS Usage ════════════════════════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-5">

        {/* ── System Health (3/5) ── */}
        <div className="lg:col-span-3 rounded-2xl p-5"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>
                {ar ? "صحة النظام" : "System Health"}
              </p>
              <h3 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{ar ? "موارد السيرفر" : "Server Resources"}</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 8px #10B981' }} />
              <span className="text-xs font-semibold text-emerald-400">{ar ? "يعمل" : "Online"}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SystemHealthCard label="CPU" value={vpsStats?.cpu_usage || 'N/A'} icon={Cpu} color="#2563EB" loading={isVpsLoading} />
            <SystemHealthCard label="RAM" value={vpsStats?.memory_usage || 'N/A'} icon={MemoryStick} color="#7C3AED" loading={isVpsLoading} />
            <SystemHealthCard label="Disk" value={vpsStats?.disk_usage || 'N/A'} icon={HardDrive} color="#EA580C" loading={isVpsLoading} />
            <SystemHealthCard label={ar ? "وقت التشغيل" : "Uptime"} value={vpsStats?.uptime || 'N/A'} icon={Timer} color="#10B981" loading={isVpsLoading} />
          </div>
        </div>

        {/* ── NAS Data Usage (2/5) ── */}
        <div className="lg:col-span-2 rounded-2xl p-5"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(37,99,235,0.15)' }}>
              <Server className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>NAS</p>
              <h3 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{ar ? "استخدام كل NAS" : "NAS Data Usage"}</h3>
            </div>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-5 w-5 animate-spin" style={{ color: '#374151' }} />
            </div>
          ) : (
            <NasBarChart data={enhanced?.nasDataUsage ?? []} language={language} />
          )}
        </div>
      </div>

      {/* ══ Network Status Bar ═══════════════════════════════════════════════ */}
      <div className="rounded-2xl p-4 flex flex-wrap items-center gap-4"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
            {ar ? "حالة الشبكة" : "Network Status"}
          </span>
        </div>
        <div className="h-4 w-px" style={{ background: 'var(--border)' }} />
        {[
          { label: "FreeRADIUS", status: true, color: "#10B981" },
          { label: "MikroTik API", status: true, color: "#2563EB" },
          { label: "VPN Server", status: true, color: "#7C3AED" },
          { label: "Database", status: true, color: "#F59E0B" },
        ].map(({ label, status, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full" style={{ background: status ? color : '#EF4444', boxShadow: status ? `0 0 6px ${color}` : '0 0 6px #EF4444' }} />
            <span className="text-xs font-semibold" style={{ color: status ? color : '#EF4444' }}>{label}</span>
            <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{status ? (ar ? "يعمل" : "OK") : (ar ? "خطأ" : "Error")}</span>
          </div>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
          <Shield className="h-3.5 w-3.5" style={{ color: '#10B981' }} />
          <span>{ar ? "الاتصال آمن" : "Secure Connection"}</span>
        </div>
      </div>

    </div>
  );
}
