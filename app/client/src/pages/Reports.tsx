/**
 * Reports.tsx — Radius Pro SaaS
 * تصميم حديث ومتطور: KPI Cards + Charts + Tabs + Export
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import {
  CalendarIcon, Download, TrendingUp, TrendingDown, Users,
  CreditCard, Activity, DollarSign, Clock, Wifi, FileText,
  FileSpreadsheet, RefreshCw, Loader2, BarChart3, ChevronUp, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  format, subDays, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
} from "date-fns";
import { formatPrice } from "../../../shared/currencies";
import { ar } from "date-fns/locale";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { formatDate, resolveOwnerRange, todayLocalDate } from "@/lib/timezoneV6";
import { BandwidthReports } from "./BandwidthReports";

// ─── Colors ──────────────────────────────────────────────────────────────────
const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const KPI_GRADIENTS = {
  revenue:     "linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%)",
  subscribers: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #3b82f6 100%)",
  cards:       "linear-gradient(135deg, #78350f 0%, #b45309 50%, #d97706 100%)",
  sessions:    "linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #7c3aed 100%)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDur(seconds: number): string {
  if (!seconds || seconds <= 0) return "0د";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}س ${m}د` : `${m}د`;
}

function fmtCurrency(amount: number, currency = "USD"): string {
  return formatPrice(amount, currency);
}

type DatePreset = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last30Days" | "last90Days";

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  title, value, subtitle, icon: Icon, gradient, trend, loading,
}: {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; gradient: string;
  trend?: { value: number; positive: boolean };
  loading?: boolean;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 group cursor-default"
      style={{ background: gradient, boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 12px 36px rgba(0,0,0,0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.3)";
      }}
    >
      {/* Shine */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)" }} />
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "rgba(255,255,255,0.2)" }} />

      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-1">{title}</p>
          {loading
            ? <div className="h-9 w-24 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.15)" }} />
            : <div className="text-3xl font-black text-white leading-none">{value}</div>
          }
        </div>
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.18)" }}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-white/60">{subtitle}</p>
          {trend && !loading && (
            <div className="flex items-center gap-1 mt-1">
              {trend.positive
                ? <ChevronUp className="h-3 w-3 text-white/80" />
                : <ChevronDown className="h-3 w-3 text-white/60" />}
              <span className="text-xs font-semibold text-white/80">{Math.abs(trend.value).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Chart Card ───────────────────────────────────────────────────────────────
function ChartCard({
  title, subtitle, children, fullWidth = false, loading = false,
}: {
  title: string; subtitle?: string; children: React.ReactNode;
  fullWidth?: boolean; loading?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${fullWidth ? "col-span-full" : ""}`}
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
      }}
    >
      <div className="mb-4">
        <h4 className="text-sm font-bold text-foreground">{title}</h4>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {loading
        ? <Skeleton className="w-full" style={{ height: 260 }} />
        : children
      }
    </div>
  );
}

// ─── Stat Row ─────────────────────────────────────────────────────────────────
function StatRow({ label, value, badge }: { label: string; value: string | number; badge?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {badge
        ? <span className="px-2.5 py-0.5 rounded-full text-xs font-bold"
            style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>{value}</span>
        : <span className="text-sm font-bold text-foreground">{value}</span>
      }
    </div>
  );
}

// ─── Export Dropdown ──────────────────────────────────────────────────────────
function ExportDropdown({
  dateRange, groupBy, activeTab, timezone,
}: {
  dateRange: { start: Date; end: Date };
  groupBy: "day" | "week" | "month";
  activeTab: string;
  timezone: string;
}) {
  const [isExporting, setIsExporting] = useState(false);

  const exportRevenueExcel = trpc.reports.exportRevenueExcel.useMutation();
  const exportCardsExcel = trpc.reports.exportCardsExcel.useMutation();
  const exportSessionsExcel = trpc.reports.exportSessionsExcel.useMutation();
  const exportSubscribersExcel = trpc.reports.exportSubscribersExcel.useMutation();
  const exportRevenuePDF = trpc.reports.exportRevenuePDF.useMutation();
  const exportCardsPDF = trpc.reports.exportCardsPDF.useMutation();
  const exportSessionsPDF = trpc.reports.exportSessionsPDF.useMutation();

  const downloadFile = (data: string, filename: string) => {
    const binaryString = atob(data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const params = {
        startDate: todayLocalDate(timezone, dateRange.start),
        endDate: todayLocalDate(timezone, dateRange.end),
      };
      let result: any;
      switch (activeTab) {
        case "revenue": result = await exportRevenueExcel.mutateAsync({ ...params, groupBy }); break;
        case "cards": result = await exportCardsExcel.mutateAsync(params); break;
        case "sessions": result = await exportSessionsExcel.mutateAsync(params); break;
        case "subscribers": result = await exportSubscribersExcel.mutateAsync(params); break;
        default: result = await exportRevenueExcel.mutateAsync({ ...params, groupBy });
      }
      downloadFile(result.data, result.filename);
      toast.success("تم تصدير التقرير بنجاح");
    } catch { toast.error("فشل في تصدير التقرير"); }
    finally { setIsExporting(false); }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const params = {
        startDate: todayLocalDate(timezone, dateRange.start),
        endDate: todayLocalDate(timezone, dateRange.end),
      };
      let result: any;
      switch (activeTab) {
        case "revenue": result = await exportRevenuePDF.mutateAsync({ ...params, groupBy }); break;
        case "cards": result = await exportCardsPDF.mutateAsync(params); break;
        case "sessions": result = await exportSessionsPDF.mutateAsync(params); break;
        default: result = await exportRevenuePDF.mutateAsync({ ...params, groupBy });
      }
      const pw = window.open("", "_blank");
      if (pw) { pw.document.write(result.html); pw.document.close(); setTimeout(() => pw.print(), 500); }
      toast.success("تم فتح التقرير للطباعة");
    } catch { toast.error("فشل في تصدير التقرير"); }
    finally { setIsExporting(false); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline" size="sm"
          className="gap-2 rounded-xl border-border/60"
          disabled={isExporting}
        >
          {isExporting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Download className="h-4 w-4" />}
          تصدير
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl">
        <DropdownMenuItem onClick={handleExportExcel} className="gap-2 cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 text-green-500" />
          تصدير Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
          <FileText className="h-4 w-4 text-red-500" />
          طباعة PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
function TabBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap"
      style={active
        ? { background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", color: "#fff", boxShadow: "0 4px 14px rgba(99,102,241,0.4)" }
        : { background: "transparent", color: "var(--muted-foreground)" }
      }
    >
      {children}
    </button>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-xs"
      style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
      <p className="font-bold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {formatter ? formatter(p.value, p.name) : p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reports() {
  const { user } = useAuth();
  const { timezone } = useTimezoneV6();
  const fmt = (v: number) => fmtCurrency(v, "USD");
  const isManager = user?.role === "owner" || user?.role === "super_admin";

  const [activeTab, setActiveTab] = useState("overview");
  const [datePreset, setDatePreset] = useState<DatePreset>("last30Days");
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");

  const dateRange = useMemo(() => resolveOwnerRange(datePreset, timezone), [datePreset, timezone]);

  // ── Queries ──
  const { data: revenueData, isLoading: revL, refetch: refRev } = trpc.reports.revenue.useQuery({
    startDate: dateRange.start.toISOString(),
    endDate: dateRange.end.toISOString(),
    groupBy,
  }, { enabled: isManager });
  const { data: subsData, isLoading: subL, refetch: refSub } = trpc.reports.subscribers.useQuery({
    startDate: dateRange.start.toISOString(),
    endDate: dateRange.end.toISOString(),
  }, { enabled: isManager });
  const { data: cardsData, isLoading: cardL, refetch: refCard } = trpc.reports.cards.useQuery({
    startDate: dateRange.start.toISOString(),
    endDate: dateRange.end.toISOString(),
  });
  const { data: sessData, isLoading: sessL, refetch: refSess } = trpc.reports.sessions.useQuery({
    startDate: dateRange.start.toISOString(),
    endDate: dateRange.end.toISOString(),
  });
  const { data: usageData, isLoading: usageL, refetch: refUsage } = trpc.reports.usage.useQuery({
    startDate: dateRange.start.toISOString(),
    endDate: dateRange.end.toISOString(),
  });

  const refetchAll = () => {
    if (isManager) { refRev(); refSub(); }
    refCard(); refSess(); refUsage();
  };

  // ── Card status pie data ──
  const cardStatusData = useMemo(() => {
    if (!cardsData) return [];
    const labels: Record<string, string> = {
      unused: "غير مستخدم", active: "نشط", used: "مستخدم",
      expired: "منتهي", suspended: "موقوف",
    };
    return cardsData.cardsByStatus.map((s: any) => ({
      name: labels[s.status] || s.status,
      value: s.count,
    }));
  }, [cardsData]);

  const managerTabs = [
    { id: "overview", label: "نظرة عامة" },
    { id: "revenue", label: "الإيرادات" },
    { id: "subscribers", label: "المشتركين" },
    { id: "cards", label: "الكروت" },
    { id: "sessions", label: "الجلسات" },
    { id: "usage", label: "الاستخدام" },
    { id: "bandwidth", label: "الباندويث" },
  ];
  const clientTabs = managerTabs.filter((tab) => !["revenue", "subscribers"].includes(tab.id));
  const TABS = isManager ? managerTabs : clientTabs;

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-black text-foreground">التقارير والإحصائيات</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            الفترة: {formatDate(dateRange.start, timezone)} — {formatDate(dateRange.end, timezone)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="w-[150px] rounded-xl border-border/60 text-sm">
              <SelectValue placeholder="الفترة الزمنية" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="yesterday">أمس</SelectItem>
              <SelectItem value="thisWeek">هذا الأسبوع</SelectItem>
              <SelectItem value="lastWeek">الأسبوع الماضي</SelectItem>
              <SelectItem value="thisMonth">هذا الشهر</SelectItem>
              <SelectItem value="lastMonth">الشهر الماضي</SelectItem>
              <SelectItem value="last30Days">آخر 30 يوم</SelectItem>
              <SelectItem value="last90Days">آخر 90 يوم</SelectItem>
            </SelectContent>
          </Select>

          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "day" | "week" | "month")}>
            <SelectTrigger className="w-[110px] rounded-xl border-border/60 text-sm">
              <SelectValue placeholder="تجميع" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="day">يومي</SelectItem>
              <SelectItem value="week">أسبوعي</SelectItem>
              <SelectItem value="month">شهري</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="rounded-xl border-border/60 gap-2" onClick={refetchAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>

          {isManager && <ExportDropdown dateRange={dateRange} groupBy={groupBy} activeTab={activeTab} timezone={timezone} />}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${isManager ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4`}>
        {isManager && <KpiCard
          title="إجمالي الإيرادات"
          value={fmt(revenueData?.totalRevenue || 0)}
          subtitle={`${revenueData?.totalTransactions || 0} معاملة`}
          icon={DollarSign}
          gradient={KPI_GRADIENTS.revenue}
          loading={revL}
        />}
        {isManager && <KpiCard
          title="المشتركين النشطين"
          value={subsData?.activeSubscribers || 0}
          subtitle={`من ${subsData?.totalSubscribers || 0} إجمالي`}
          icon={Users}
          gradient={KPI_GRADIENTS.subscribers}
          loading={subL}
        />}
        <KpiCard
          title="الكروت النشطة"
          value={cardsData?.activeCards || 0}
          subtitle={`${cardsData?.unusedCards || 0} غير مستخدم`}
          icon={CreditCard}
          gradient={KPI_GRADIENTS.cards}
          loading={cardL}
        />
        <KpiCard
          title="الجلسات النشطة"
          value={sessData?.activeSessions || 0}
          subtitle={`متوسط: ${fmtDur(sessData?.averageSessionDuration || 0)}`}
          icon={Activity}
          gradient={KPI_GRADIENTS.sessions}
          loading={sessL}
        />
      </div>

      {/* ── Tabs ── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 2px 12px rgba(0,0,0,0.15)" }}>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 p-2 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
          {TABS.map(t => (
            <TabBtn key={t.id} active={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </TabBtn>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-5">

          {/* ── Overview Tab ── */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Revenue Trend */}
              <ChartCard title="الإيرادات عبر الزمن" subtitle="تطور الإيرادات خلال الفترة" fullWidth loading={revL}>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={revenueData?.revenueByPeriod || []}>
                    <defs>
                      <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip formatter={(v: number) => fmt(v)} />} />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5}
                      fillOpacity={1} fill="url(#gRev)" name="الإيرادات" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Sessions Trend */}
              <ChartCard title="الجلسات عبر الزمن" subtitle="عدد الجلسات اليومية" loading={sessL}>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={sessData?.sessionsByDay || []}>
                    <defs>
                      <linearGradient id="gSess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5}
                      fillOpacity={1} fill="url(#gSess)" name="الجلسات" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Card Status */}
              <ChartCard title="توزيع حالة الكروت" loading={cardL}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={cardStatusData} cx="50%" cy="50%"
                      outerRadius={90} innerRadius={45}
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      dataKey="value">
                      {cardStatusData.map((_: any, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Quick Stats */}
              <ChartCard title="ملخص سريع">
                <div className="space-y-1">
                  {isManager && <>
                    <StatRow label="إجمالي الإيرادات" value={fmt(revenueData?.totalRevenue || 0)} />
                    <StatRow label="عدد المعاملات" value={revenueData?.totalTransactions || 0} />
                    <StatRow label="متوسط المعاملة" value={fmt(revenueData?.averageTransaction || 0)} />
                    <StatRow label="إجمالي المشتركين" value={subsData?.totalSubscribers || 0} />
                    <StatRow label="مشتركون جدد" value={subsData?.newSubscribersThisPeriod || 0} badge />
                  </>}
                  {!isManager && <>
                    <StatRow label="إجمالي الكروت" value={cardsData?.totalCards || 0} />
                    <StatRow label="كروت نشطة" value={cardsData?.activeCards || 0} badge />
                    <StatRow label="أجهزة NAS" value={sessData?.sessionsByNas?.length || 0} />
                  </>}
                  <StatRow label="إجمالي الجلسات" value={sessData?.totalSessions || 0} />
                  <StatRow label="متوسط مدة الجلسة" value={fmtDur(sessData?.averageSessionDuration || 0)} />
                  <StatRow label="إجمالي وقت الجلسات" value={fmtDur(sessData?.totalSessionTime || 0)} />
                </div>
              </ChartCard>
            </div>
          )}

          {/* ── Revenue Tab ── */}
          {activeTab === "revenue" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="الإيرادات عبر الزمن" subtitle="تطور الإيرادات خلال الفترة المحددة" fullWidth loading={revL}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={revenueData?.revenueByPeriod || []}>
                    <defs>
                      <linearGradient id="gRev2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip formatter={(v: number) => fmt(v)} />} />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5}
                      fillOpacity={1} fill="url(#gRev2)" name="الإيرادات" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="الإيرادات حسب العميل" subtitle="أعلى 10 عملاء" loading={revL}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={revenueData?.revenueByClient || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis dataKey="clientName" type="category" width={90}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip formatter={(v: number) => fmt(v)} />} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} name="الإيرادات" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="إحصائيات الإيرادات" loading={revL}>
                <div className="space-y-1">
                  <StatRow label="إجمالي الإيرادات" value={fmt(revenueData?.totalRevenue || 0)} />
                  <StatRow label="عدد المعاملات" value={revenueData?.totalTransactions || 0} />
                  <StatRow label="متوسط المعاملة" value={fmt(revenueData?.averageTransaction || 0)} />
                </div>
              </ChartCard>
            </div>
          )}

          {/* ── Subscribers Tab ── */}
          {activeTab === "subscribers" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="نمو المشتركين" subtitle="عدد المشتركين الجدد عبر الزمن" fullWidth loading={subL}>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={subsData?.subscriberGrowth || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2.5}
                      dot={{ fill: "#8b5cf6", r: 3 }} name="مشتركون جدد" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="توزيع المشتركين" loading={subL}>
                <div className="space-y-3">
                  {[
                    { label: "نشط", count: subsData?.activeSubscribers || 0, color: "#10b981" },
                    { label: "منتهي", count: subsData?.expiredSubscribers || 0, color: "#ef4444" },
                    { label: "موقوف", count: subsData?.suspendedSubscribers || 0, color: "#f59e0b" },
                  ].map(({ label, count, color }) => {
                    const total = subsData?.totalSubscribers || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-bold" style={{ color }}>{count}</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: "var(--muted)" }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-border/50 text-center">
                  <div className="text-4xl font-black text-foreground">{subsData?.totalSubscribers || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">إجمالي المشتركين</p>
                  <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold"
                    style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
                    +{subsData?.newSubscribersThisPeriod || 0} جديد هذه الفترة
                  </div>
                </div>
              </ChartCard>
            </div>
          )}

          {/* ── Cards Tab ── */}
          {activeTab === "cards" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="توزيع حالة الكروت" loading={cardL}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={cardStatusData} cx="50%" cy="50%"
                      outerRadius={90} innerRadius={45}
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      dataKey="value">
                      {cardStatusData.map((_: any, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="أكثر الباقات مبيعاً" loading={cardL}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={cardsData?.bestSellingPlans || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="planName" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="عدد الكروت" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="استهلاك الوقت لكل كرت" subtitle="أعلى 10 كروت من حيث الاستهلاك" fullWidth loading={cardL}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th className="text-right py-2.5 px-4 text-muted-foreground font-semibold text-xs uppercase tracking-wide">#</th>
                        <th className="text-right py-2.5 px-4 text-muted-foreground font-semibold text-xs uppercase tracking-wide">اسم المستخدم</th>
                        <th className="text-right py-2.5 px-4 text-muted-foreground font-semibold text-xs uppercase tracking-wide">الباقة</th>
                        <th className="text-right py-2.5 px-4 text-muted-foreground font-semibold text-xs uppercase tracking-wide">الوقت المستهلك</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardsData?.timeConsumptionByCard.slice(0, 10).map((card: any, idx: number) => (
                        <tr key={card.cardId} style={{ borderBottom: "1px solid var(--border)" }}
                          className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-4 text-muted-foreground text-xs">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-mono text-xs">{card.username}</td>
                          <td className="py-2.5 px-4 text-xs">{card.planName}</td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
                              {fmtDur(card.totalTime)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(!cardsData?.timeConsumptionByCard || cardsData.timeConsumptionByCard.length === 0) && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
                            لا توجد بيانات للفترة المحددة
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </div>
          )}

          {/* ── Sessions Tab ── */}
          {activeTab === "sessions" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="الجلسات عبر الزمن" subtitle="عدد الجلسات اليومية" fullWidth loading={sessL}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={sessData?.sessionsByDay || []}>
                    <defs>
                      <linearGradient id="gSess2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5}
                      fillOpacity={1} fill="url(#gSess2)" name="عدد الجلسات" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="الجلسات حسب جهاز NAS" loading={sessL}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={sessData?.sessionsByNas || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis dataKey="nasName" type="category" width={90}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="عدد الجلسات" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="إحصائيات الجلسات" loading={sessL}>
                <div className="space-y-1">
                  <StatRow label="إجمالي الجلسات" value={sessData?.totalSessions || 0} />
                  <StatRow label="جلسات نشطة" value={sessData?.activeSessions || 0} badge />
                  <StatRow label="جلسات منتهية" value={sessData?.completedSessions || 0} />
                  <StatRow label="متوسط مدة الجلسة" value={fmtDur(sessData?.averageSessionDuration || 0)} />
                  <StatRow label="إجمالي وقت الجلسات" value={fmtDur(sessData?.totalSessionTime || 0)} />
                </div>
              </ChartCard>
            </div>
          )}

          {/* ── Usage Tab ── */}
          {activeTab === "usage" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ChartCard title="أوقات الذروة" subtitle="توزيع الجلسات حسب ساعات اليوم" fullWidth loading={usageL}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={usageData?.hourlyUsage || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip
                      content={<CustomTooltip
                        formatter={(v: number, n: string) => n === "sessions" ? v : fmtDur(v)}
                      />}
                      labelFormatter={(h) => `الساعة ${h}:00`}
                    />
                    <Legend />
                    <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} name="عدد الجلسات" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="الاستخدام اليومي" subtitle="عدد الجلسات لكل يوم" loading={usageL}>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={usageData?.dailyUsage || []}>
                    <defs>
                      <linearGradient id="gDaily" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="sessions" stroke="#10b981" strokeWidth={2.5}
                      fillOpacity={1} fill="url(#gDaily)" name="الجلسات" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="الملخص الأسبوعي" subtitle="إحصائيات كل أسبوع" loading={usageL}>
                <div className="space-y-3 max-h-[260px] overflow-y-auto">
                  {usageData?.weeklySummary?.map((week: any, idx: number) => (
                    <div key={idx} className="rounded-xl p-3 transition-colors hover:bg-muted/30"
                      style={{ border: "1px solid var(--border)" }}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold">الأسبوع {week.weekNumber}</span>
                        <span className="text-xs text-muted-foreground">
                          {week.startDate} — {week.endDate}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="text-center">
                          <div className="font-black text-foreground">{week.sessions}</div>
                          <div className="text-muted-foreground">جلسات</div>
                        </div>
                        <div className="text-center">
                          <div className="font-black text-foreground">{week.uniqueUsers}</div>
                          <div className="text-muted-foreground">مستخدمين</div>
                        </div>
                        <div className="text-center">
                          <div className="font-black text-foreground">{fmtDur(week.totalTime)}</div>
                          <div className="text-muted-foreground">وقت</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!usageData?.weeklySummary || usageData.weeklySummary.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      لا توجد بيانات للفترة المحددة
                    </div>
                  )}
                </div>
              </ChartCard>

              <ChartCard title="أعلى المستخدمين وقتاً" subtitle="حسب إجمالي وقت الجلسات" loading={usageL}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={usageData?.topUsersByTime || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tickFormatter={(v) => fmtDur(v)}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                    <YAxis dataKey="username" type="category" width={80}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                    <Tooltip content={<CustomTooltip formatter={(v: number) => fmtDur(v)} />} />
                    <Bar dataKey="totalTime" fill="#ec4899" radius={[0, 4, 4, 0]} name="إجمالي الوقت" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Usage Summary */}
              <ChartCard title="ملخص الاستخدام" fullWidth loading={usageL}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "إجمالي الجلسات", value: usageData?.summary?.totalSessions || 0, color: "#3b82f6" },
                    { label: "إجمالي الوقت", value: fmtDur(usageData?.summary?.totalTime || 0), color: "#10b981" },
                    { label: "مستخدمون فريدون", value: usageData?.summary?.uniqueUsers || 0, color: "#8b5cf6" },
                    { label: "متوسط مدة الجلسة", value: fmtDur(usageData?.summary?.avgSessionDuration || 0), color: "#f59e0b" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl p-4 text-center"
                      style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                      <div className="text-2xl font-black mb-1" style={{ color }}>{value}</div>
                      <div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </div>
          )}

          {/* ── Bandwidth V2 Tab ── */}
          {activeTab === "bandwidth" && <BandwidthReports embedded />}

        </div>
      </div>
    </div>
  );
}
