import { useCallback, useMemo, useState } from "react";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  DollarSign,
  Filter,
  Network,
  ReceiptText,
  RefreshCw,
  Tags,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@shared/currencies";

type Preset = "hour" | "today" | "yesterday" | "last7" | "thisWeek" | "last30" | "thisMonth" | "lastMonth" | "custom";

interface SalesData {
  periodStart: string;
  periodEnd: string;
  timezone: string;
  granularity: "hour" | "day" | "week" | "month";
  selectedCurrency: string;
  currencySummaries: { currency: string; cardsSold: number; revenue: number; averagePrice: number; cardsGrowth: number; revenueGrowth: number; bestPlan: string | null }[];
  networkFilter: { available: boolean; reason: string };
  kpis: { cardsSold: number; revenue: number; averagePrice: number; cardsGrowth: number; revenueGrowth: number; bestPlan: string | null; currency: string };
  chart: { period: string; currency: string; cardsSold: number; revenue: number }[];
  byPlan: { planId: number; planName: string; cardsSold: number; unitPrice: number; revenue: number; currency: string }[];
  recentSales: { id: number; cardId: number; username: string; planName: string; salePrice: number; currency: string; soldAt: string; source: string }[];
  pagination: { page: number; pageSize: number; hasMore: boolean };
  planOptions: { id: number; name: string; nameAr: string | null; price: string; currency: string }[];
  dataQuality: { historicalConfirmedSales: number; legacyActivatedCardsExcluded: boolean; message: string };
}

const presets: { value: Preset; label: string }[] = [
  { value: "hour", label: "آخر ساعة" },
  { value: "today", label: "اليوم" },
  { value: "yesterday", label: "أمس" },
  { value: "last7", label: "آخر 7 أيام" },
  { value: "thisWeek", label: "هذا الأسبوع" },
  { value: "last30", label: "آخر 30 يوم" },
  { value: "thisMonth", label: "هذا الشهر" },
  { value: "lastMonth", label: "الشهر الماضي" },
];

function money(value: number, currency = "USD") {
  try { return formatPrice(value, currency); } catch { return `${value.toFixed(2)} ${currency}`; }
}

function arabicDate(value: string, timezone = "Asia/Gaza") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-PS", { timeZone: timezone, calendar: "gregory", dateStyle: "medium", timeStyle: "short" });
}

function sourceLabel(source: string) {
  return source === "expired_card" ? "كرت منتهي" : "—";
}

function MetricCard({ label, value, note, icon, color, loading }: {
  label: string; value: string; note?: string; icon: React.ReactNode; color: string; loading: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {loading ? <><Skeleton className="mb-4 h-9 w-9 rounded-xl" /><Skeleton className="mb-2 h-7 w-24" /><Skeleton className="h-3 w-28" /></> : <>
        <div className="mb-3 flex items-start justify-between">
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${color}`}>{icon}</span>
          {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
        </div>
        <p className="font-mono text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </>}
    </section>
  );
}

export default function CardSales() {
  const [preset, setPreset] = useState<Preset>("last30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [planId, setPlanId] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const queryInput = useMemo(() => ({
    preset,
    customStart: preset === "custom" && customStart ? customStart : undefined,
    customEnd: preset === "custom" && customEnd ? customEnd : undefined,
    planId: planId === "all" ? undefined : Number(planId),
    currency: currencyFilter,
    page,
    pageSize: 15,
  }), [preset, customStart, customEnd, planId, currencyFilter, page]);
  const { data, isLoading, isFetching, error, refetch } = trpc.salesDashboard.getSalesData.useQuery(queryInput, { staleTime: 60_000 });
  const sales = data as SalesData | undefined;
  const currency = currencyFilter ?? sales?.selectedCurrency ?? "USD";
  const activeKpis = sales?.currencySummaries.find(item => item.currency === currency) ?? sales?.kpis;
  const activeChart = (sales?.chart ?? []).filter(point => point.currency === currency);

  const chartOptions = useMemo<ApexOptions>(() => ({
    chart: { type: "area", toolbar: { show: false }, fontFamily: "Cairo, sans-serif", background: "transparent" },
    colors: ["#8b5cf6", "#22c55e"],
    stroke: { curve: "smooth", width: [3, 2] },
    fill: { type: "gradient", gradient: { opacityFrom: 0.32, opacityTo: 0.02, stops: [0, 95] } },
    dataLabels: { enabled: false },
    grid: { borderColor: "rgba(148,163,184,0.18)", strokeDashArray: 4 },
    xaxis: { type: "category", labels: { style: { colors: "#94a3b8", fontSize: "11px" }, rotate: 0 }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: [
      { labels: { formatter: value => money(value, currency), style: { colors: "#94a3b8", fontSize: "11px" } } },
      { opposite: true, labels: { formatter: value => String(Math.round(value)), style: { colors: "#94a3b8", fontSize: "11px" } } },
    ],
    legend: { position: "top", horizontalAlign: "left", labels: { colors: "#94a3b8" } },
    tooltip: { theme: "dark", x: { show: true }, y: { formatter: (value, options) => options?.seriesIndex === 0 ? money(value, currency) : `${value} كرت` } },
  }), [currency]);

  const chartSeries = useMemo(() => [
    { name: `الإيرادات (${currency})`, data: activeChart.map(point => ({ x: point.period, y: point.revenue })) },
    { name: "الكروت المباعة", data: activeChart.map(point => ({ x: point.period, y: point.cardsSold })) },
  ], [activeChart, currency]);

  const exportCsv = useCallback(() => {
    if (!sales) return;
    const rows = [
      ["الخطة", "عدد الكروت", "سعر الكرت", "إجمالي المبيعات", "العملة"],
      ...sales.byPlan.map(item => [item.planName, item.cardsSold, item.unitPrice, item.revenue, item.currency]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `card-sales-${preset}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [sales, preset]);

  const changePreset = (value: Preset) => { setPreset(value); setPage(1); };

  return (
    <main className="min-h-full bg-background text-foreground" dir="rtl" style={{ fontFamily: "Cairo, sans-serif" }}>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><ReceiptText className="h-3.5 w-3.5" /> التقارير / المبيعات</div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BarChart3 className="h-6 w-6 text-violet-400" /> مبيعات الكروت</h1>
            {sales && <p className="mt-1 text-xs text-muted-foreground">من {arabicDate(sales.periodStart, sales.timezone)} إلى {arabicDate(sales.periodEnd, sales.timezone)} · {sales.timezone}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2"><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> تحديث</Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!sales || sales.byPlan.length === 0} className="gap-2"><Download className="h-4 w-4" /> تصدير CSV</Button>
          </div>
        </header>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 flex-1">
              <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> الفترة</label>
              <div className="flex flex-wrap gap-2">
                {presets.map(item => <button key={item.value} onClick={() => changePreset(item.value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${preset === item.value ? "bg-violet-600 text-white shadow-sm" : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{item.label}</button>)}
                <button onClick={() => changePreset("custom")} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${preset === "custom" ? "bg-violet-600 text-white shadow-sm" : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>فترة مخصصة</button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:w-[430px]">
              <label className="text-xs text-muted-foreground">الخطة
                <select value={planId} onChange={event => { setPlanId(event.target.value); setPage(1); }} className="mt-1 block h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-violet-500">
                  <option value="all">كل الخطط</option>
                  {(sales?.planOptions ?? []).map(plan => <option key={plan.id} value={plan.id}>{plan.nameAr || plan.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">الشبكة / NAS
                <div title={sales?.networkFilter.reason ?? "جارٍ التحميل"} className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-dashed border-input bg-muted/35 px-2.5 text-sm text-muted-foreground"><Network className="h-4 w-4" /> لا توجد بيانات موثوقة</div>
              </label>
            </div>
          </div>
          {preset === "custom" && <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
            <label className="text-xs text-muted-foreground">من<input type="date" value={customStart} onChange={event => { setCustomStart(event.target.value); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground" /></label>
            <label className="text-xs text-muted-foreground">إلى<input type="date" value={customEnd} onChange={event => { setCustomEnd(event.target.value); setPage(1); }} className="mt-1 block h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground" /></label>
          </div>}
          <div className="mt-4 border-t border-border pt-4">
            <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><DollarSign className="h-3.5 w-3.5" /> عملة الخطة</span>
            <div className="flex flex-wrap gap-2">
              {(sales?.currencySummaries ?? []).map(item => <button key={item.currency} onClick={() => { setCurrencyFilter(item.currency); setPage(1); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${currency === item.currency ? "bg-emerald-600 text-white shadow-sm" : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{item.currency} · {money(item.revenue, item.currency)}</button>)}
              {!isLoading && (sales?.currencySummaries ?? []).length === 0 && <span className="text-xs text-muted-foreground">لا توجد عملات ضمن الفلاتر الحالية.</span>}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">لا يتم جمع العملات المختلفة؛ كل مؤشر ومخطط يعرض عملة الخطة المختارة فقط.</p>
          </div>
        </section>

        {error && <section className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> تعذر تحميل تقرير المبيعات. {error.message}</section>}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard loading={isLoading} icon={<CreditCard className="h-5 w-5 text-cyan-300" />} color="bg-cyan-500/15" label={`الكروت المباعة (${currency})`} value={String(activeKpis?.cardsSold ?? 0)} note={`${activeKpis?.cardsGrowth ?? 0}% عن الفترة السابقة`} />
          <MetricCard loading={isLoading} icon={<DollarSign className="h-5 w-5 text-emerald-300" />} color="bg-emerald-500/15" label={`إيرادات المبيعات (${currency})`} value={money(activeKpis?.revenue ?? 0, currency)} note={`${activeKpis?.revenueGrowth ?? 0}% عن الفترة السابقة`} />
          <MetricCard loading={isLoading} icon={<Tags className="h-5 w-5 text-amber-300" />} color="bg-amber-500/15" label={`متوسط سعر الكرت (${currency})`} value={money(activeKpis?.averagePrice ?? 0, currency)} />
          <MetricCard loading={isLoading} icon={<BarChart3 className="h-5 w-5 text-violet-300" />} color="bg-violet-500/15" label={`الخطة الأعلى مبيعاً (${currency})`} value={activeKpis?.bestPlan ?? "—"} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">اتجاه المبيعات · {currency}</h2><p className="mt-1 text-xs text-muted-foreground">يتغير التجميع تلقائياً حسب الفترة والعملة المحددتين.</p></div><span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">حسب {sales?.granularity === "hour" ? "الساعة" : sales?.granularity === "week" ? "الأسبوع" : sales?.granularity === "month" ? "الشهر" : "اليوم"}</span></div>
          {isLoading ? <Skeleton className="h-[290px] w-full" /> : activeChart.length ? <ReactApexChart options={chartOptions} series={chartSeries} type="area" height={290} /> : <div className="grid h-[290px] place-items-center rounded-xl border border-dashed border-border bg-muted/20 text-center"><div><BarChart3 className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">لا توجد كروت منتهية بعملة {currency} ضمن هذه الفترة</p><p className="mt-1 max-w-md text-xs text-muted-foreground">يظهر الرسم تلقائياً عندما تصبح حالة الكرت «منتهي».</p></div></div>}
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="border-b border-border p-5"><h2 className="font-semibold">المبيعات حسب الخطة</h2><p className="mt-1 text-xs text-muted-foreground">المبيعات = الكروت المنتهية فقط، والسعر من salePrice المحفوظ على الكرت.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-right text-sm"><thead className="bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">الخطة</th><th className="px-4 py-3 font-medium">العملة</th><th className="px-4 py-3 font-medium">عدد الكروت</th><th className="px-4 py-3 font-medium">سعر الكرت</th><th className="px-5 py-3 font-medium">إجمالي المبيعات</th></tr></thead><tbody>{isLoading ? Array.from({ length: 4 }).map((_, index) => <tr key={index} className="border-t border-border"><td colSpan={5} className="px-5 py-3"><Skeleton className="h-5 w-full" /></td></tr>) : (sales?.byPlan ?? []).map(item => <tr key={item.planId} className="border-t border-border transition-colors hover:bg-muted/25"><td className="px-5 py-3 font-medium">{item.planName}</td><td className="px-4 py-3 text-muted-foreground">{item.currency}</td><td className="px-4 py-3 text-muted-foreground">{item.cardsSold}</td><td className="px-4 py-3 text-muted-foreground">{money(item.unitPrice, item.currency)}</td><td className="px-5 py-3 font-semibold text-emerald-500">{money(item.revenue, item.currency)}</td></tr>)}{!isLoading && sales?.byPlan.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">لا توجد كروت منتهية للفلاتر الحالية.</td></tr>}</tbody></table></div></div>
          <aside className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 shadow-sm"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /><div><h2 className="font-semibold text-foreground">قاعدة احتساب المبيعات</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{sales?.dataQuality.message ?? "يتم احتساب المبيعات من الكروت المنتهية فقط."}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">لا يدخل الكرت غير المنتهي في الإيراد أو عدد الكروت المباعة مهما كانت حالته الأخرى.</p></div></div></aside>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="font-semibold">آخر الكروت المنتهية</h2><p className="mt-1 text-xs text-muted-foreground">آخر 15 كرتاً منتهياً مطابقاً للفلاتر.</p></div><span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">{sales?.recentSales.length ?? 0} كرت</span></div><div className="overflow-x-auto"><table className="w-full min-w-[750px] text-right text-sm"><thead className="bg-muted/35 text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">الكرت</th><th className="px-4 py-3 font-medium">الخطة</th><th className="px-4 py-3 font-medium">السعر</th><th className="px-4 py-3 font-medium">الحالة</th><th className="px-5 py-3 font-medium">وقت انتهاء الكرت</th></tr></thead><tbody>{isLoading ? Array.from({ length: 5 }).map((_, index) => <tr key={index} className="border-t border-border"><td colSpan={5} className="px-5 py-3"><Skeleton className="h-5 w-full" /></td></tr>) : (sales?.recentSales ?? []).map(item => <tr key={item.id} className="border-t border-border transition-colors hover:bg-muted/25"><td className="px-5 py-3 font-mono text-xs">{item.username}</td><td className="px-4 py-3">{item.planName}</td><td className="px-4 py-3 font-medium text-emerald-500">{money(item.salePrice, item.currency)}</td><td className="px-4 py-3"><span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{sourceLabel(item.source)}</span></td><td className="px-5 py-3 text-xs text-muted-foreground">{arabicDate(item.soldAt, sales?.timezone)}</td></tr>)}{!isLoading && sales?.recentSales.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">لا توجد كروت منتهية ضمن الفترة.</td></tr>}</tbody></table></div><div className="flex items-center justify-end gap-2 border-t border-border p-3"><Button variant="outline" size="sm" disabled={page === 1 || isFetching} onClick={() => setPage(value => Math.max(1, value - 1))} className="gap-1"><ChevronRight className="h-4 w-4" /> الأحدث</Button><span className="px-2 text-xs text-muted-foreground">صفحة {page}</span><Button variant="outline" size="sm" disabled={!sales?.pagination.hasMore || isFetching} onClick={() => setPage(value => value + 1)} className="gap-1">الأقدم <ChevronLeft className="h-4 w-4" /></Button></div></section>
      </div>
    </main>
  );
}
