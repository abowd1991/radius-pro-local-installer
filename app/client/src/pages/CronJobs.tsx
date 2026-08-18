import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Play, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle,
  Loader2, Activity, Database, Bell, Shield, Server, Zap,
  HardDrive, Wrench, Power, PowerOff, History,
} from "lucide-react";
import { parseDbDate } from '@/lib/dateFormat';
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { formatDateTime } from "@/lib/timezoneV6";

// ─── Category Config ────────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "المحاسبة": Database,
  "الكروت": Shield,
  "الإشعارات": Bell,
  "المراقبة": Activity,
  "التوفير": Server,
  "الفوترة": Zap,
  "السرعة": Zap,
  "الشبكة": Server,
  "التشخيص": Wrench,
  "النسخ الاحتياطي": HardDrive,
};
const CATEGORY_COLORS: Record<string, string> = {
  "المحاسبة": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "الكروت": "text-rose-400 bg-rose-500/10 border-rose-500/20",
  "الإشعارات": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "المراقبة": "text-green-400 bg-green-500/10 border-green-500/20",
  "التوفير": "text-purple-400 bg-purple-500/10 border-purple-500/20",
  "الفوترة": "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "السرعة": "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
  "الشبكة": "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  "التشخيص": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  "النسخ الاحتياطي": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────
function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(val: Date | string | number | null, timezone: string): string {
  if (!val) return "لم يُشغَّل بعد";
  const d = parseDbDate(val);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (seconds < 60) return "منذ ثوانِ";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  return formatDateTime(d, timezone);
}
function formatFullDate(ts: number, timezone: string): string {
  return formatDateTime(new Date(ts), timezone);
}

function JobStatusBadge({
  isRunning,
  isDisabled,
  isFailing,
}: {
  isRunning: boolean;
  isDisabled: boolean;
  isFailing: boolean;
}) {
  if (isRunning) {
    return <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/30 gap-1 animate-pulse"><Loader2 className="w-3 h-3 animate-spin" />قيد التشغيل</Badge>;
  }
  if (isDisabled) {
    return <Badge variant="secondary" className="text-xs gap-1"><PowerOff className="w-3 h-3" />موقوفة</Badge>;
  }
  if (isFailing) {
    return <Badge variant="destructive" className="text-xs gap-1"><AlertCircle className="w-3 h-3" />تحتاج مراجعة</Badge>;
  }
  return <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 gap-1"><Activity className="w-3 h-3" />نشطة</Badge>;
}

// ─── Log Panel ──────────────────────────────────────────────────────────────
function LogPanel({ jobId, timezone }: { jobId: string; timezone: string }) {
  const { data: logs, isLoading, refetch } = trpc.cronJobs.getLogs.useQuery({ jobId });

  return (
    <div className="border-t border-border/40 px-4 pb-3 pt-3 bg-muted/20">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <History className="w-3 h-3" />آخر 10 تشغيلات
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => refetch()}>
          <RefreshCw className="w-3 h-3 ml-1" />تحديث
        </Button>
      </div>
      {isLoading ? (
        <div className="text-center py-2"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></div>
      ) : !logs || logs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">لا يوجد سجل بعد</p>
      ) : (
        <div className="space-y-1">
          {(logs as Array<{ success: boolean; message: string; runAt: number; durationMs: number | null; triggeredBy: string }>).map((log, i) => (
            <div key={i} className={`flex items-start gap-2 py-1.5 px-2 rounded text-xs ${log.success ? "bg-emerald-500/5" : "bg-red-500/10"}`}>
              {log.success
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-muted-foreground truncate">{log.message}</p>
                <div className="flex gap-2 mt-0.5 text-muted-foreground/60 flex-wrap">
                  <span>{formatFullDate(log.runAt, timezone)}</span>
                  <span>•</span>
                  <span>{formatDuration(log.durationMs)}</span>
                  <span>•</span>
                  <span>{log.triggeredBy === "manual" ? "يدوي" : "تلقائي"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function CronJobs() {
  const { timezone } = useTimezoneV6();
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [togglingJobs, setTogglingJobs] = useState<Set<string>>(new Set());
  const [openLogs, setOpenLogs] = useState<Set<string>>(new Set());

  const { data: jobs, isLoading, refetch } = trpc.cronJobs.list.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const { data: stats } = trpc.cronJobs.stats.useQuery(undefined, {
    refetchInterval: 15000,
  });

  const runNow = trpc.cronJobs.runNow.useMutation({
    onMutate: ({ id }) => setRunningJobs(prev => new Set(prev).add(id)),
    onSuccess: (result, { id }) => {
      setRunningJobs(prev => { const n = new Set(prev); n.delete(id); return n; });
      if (result.success) {
        toast.success(`✅ تم التشغيل بنجاح`, { description: `${result.message} (${formatDuration(result.durationMs)})` });
      } else {
        toast.error(`❌ فشل التشغيل`, { description: result.message });
      }
      refetch();
    },
    onError: (err, { id }) => {
      setRunningJobs(prev => { const n = new Set(prev); n.delete(id); return n; });
      toast.error(`خطأ: ${err.message}`);
    },
  });

  const toggleJob = trpc.cronJobs.toggle.useMutation({
    onMutate: ({ jobId }) => setTogglingJobs(prev => new Set(prev).add(jobId)),
    onSuccess: (result, { jobId }) => {
      setTogglingJobs(prev => { const n = new Set(prev); n.delete(jobId); return n; });
      const job = jobs?.find(j => j.id === jobId);
      toast.success(result.enabled ? `✅ تم تفعيل: ${job?.nameAr}` : `⏸ تم إيقاف: ${job?.nameAr}`);
      refetch();
    },
    onError: (err, { jobId }) => {
      setTogglingJobs(prev => { const n = new Set(prev); n.delete(jobId); return n; });
      toast.error(`خطأ: ${err.message}`);
    },
  });

  function toggleLogs(id: string) {
    setOpenLogs(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // Group by category
  const grouped = jobs?.reduce((acc, job) => {
    if (!acc[job.categoryAr]) acc[job.categoryAr] = [];
    acc[job.categoryAr].push(job);
    return acc;
  }, {} as Record<string, typeof jobs>) ?? {};

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">إدارة المهام المجدولة</h1>
          <p className="text-muted-foreground text-sm mt-1">مراقبة وتشغيل وإيقاف مهام Radius Pro V2 الفعلية</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />تحديث
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <div className="text-sm text-muted-foreground">إجمالي المهام</div>
          </div>
          <div className="bg-card border border-emerald-500/20 rounded-lg p-4">
            <div className="text-2xl font-bold text-emerald-400">{stats.total - (stats.disabledCount ?? 0)}</div>
            <div className="text-sm text-muted-foreground">مهام نشطة</div>
          </div>
          <div className={`bg-card border rounded-lg p-4 ${(stats.disabledCount ?? 0) > 0 ? "border-yellow-500/30" : "border-border"}`}>
            <div className={`text-2xl font-bold ${(stats.disabledCount ?? 0) > 0 ? "text-yellow-400" : "text-muted-foreground"}`}>
              {stats.disabledCount ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">موقوفة</div>
          </div>
          <div className={`bg-card border rounded-lg p-4 ${(stats.failingCount ?? 0) > 0 ? "border-red-500/30" : "border-border"}`}>
            <div className={`text-2xl font-bold ${(stats.failingCount ?? 0) > 0 ? "text-red-400" : "text-muted-foreground"}`}>
              {stats.failingCount ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">تفشل باستمرار</div>
          </div>
        </div>
      )}

      {/* Jobs */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, categoryJobs]) => {
            const Icon = CATEGORY_ICONS[category] ?? Shield;
            const colorClass = CATEGORY_COLORS[category] ?? "text-gray-400 bg-gray-500/10 border-gray-500/20";
            return (
              <div key={category}>
                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border w-fit ${colorClass}`}>
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-semibold">{category}</span>
                  <Badge variant="secondary" className="text-xs">{categoryJobs?.length}</Badge>
                </div>

                <div className="space-y-2">
                  {categoryJobs?.map(job => {
                    const isRunning = runningJobs.has(job.id) || job.isRunning;
                    const isToggling = togglingJobs.has(job.id);
                    const isDisabled = !job.enabled;
                    const isFailing = (job.consecutiveFailures ?? 0) >= 3;
                    const hasError = job.errorCount > 0;
                    const logsOpen = openLogs.has(job.id);

                    return (
                      <div
                        key={job.id}
                        className={`bg-card border rounded-lg overflow-hidden transition-all ${
                          isDisabled ? "opacity-60 border-border/40" :
                          isFailing ? "border-red-500/40" :
                          hasError ? "border-yellow-500/30" :
                          "border-border"
                        }`}
                      >
                        <div className="p-4 space-y-3">
                          {/* Job Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-foreground">{job.nameAr}</span>
                                <JobStatusBadge isRunning={isRunning} isDisabled={isDisabled} isFailing={isFailing} />
                                {isFailing && !isRunning && <Badge variant="destructive" className="text-xs">فشل {job.consecutiveFailures}×</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{job.descriptionAr}</div>
                            </div>
                            {/* Status Icon */}
                            <div className="shrink-0 mt-0.5">
                              {isRunning ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                                : isFailing ? <AlertCircle className="h-4 w-4 text-red-400" />
                                : hasError ? <AlertCircle className="h-4 w-4 text-yellow-400" />
                                : job.lastRun ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                : <Clock className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-muted/50 rounded px-2 py-1.5">
                              <div className="text-muted-foreground">التكرار</div>
                              <div className="font-medium text-foreground">{job.interval}</div>
                            </div>
                            <div className="bg-muted/50 rounded px-2 py-1.5">
                              <div className="text-muted-foreground">آخر تشغيل</div>
                              <div className="font-medium text-foreground">{formatRelativeTime(job.lastRun, timezone)}</div>
                            </div>
                          </div>

                          {/* Last Result */}
                          {job.lastRunResult && (
                            <div className={`text-xs px-2 py-1.5 rounded flex items-center gap-1.5 ${
                              job.lastRunResult === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                            }`}>
                              {job.lastRunResult === 'error'
                                ? <XCircle className="h-3 w-3 shrink-0" />
                                : <CheckCircle2 className="h-3 w-3 shrink-0" />}
                              <span className="truncate">
                                {job.lastRunResult === 'error' ? job.lastError : job.lastRunResult}
                              </span>
                              {job.lastRunDurationMs !== null && (
                                <span className="shrink-0 text-muted-foreground">({formatDuration(job.lastRunDurationMs)})</span>
                              )}
                            </div>
                          )}

                          {/* Footer Actions */}
                          <div className="flex items-center justify-between pt-1">
                            <div className="text-xs text-muted-foreground">
                              {job.runCount > 0
                                ? <span>{job.runCount} تشغيل {job.errorCount > 0 && <span className="text-red-400">({job.errorCount} خطأ)</span>}</span>
                                : <span>لم يُشغَّل يدوياً</span>}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {/* Logs Toggle */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2 text-xs gap-1 ${logsOpen ? "text-primary" : "text-muted-foreground"}`}
                                onClick={() => toggleLogs(job.id)}
                                title="السجل التاريخي"
                              >
                                <History className="h-3 w-3" />
                                سجل
                              </Button>

                              {/* Toggle Enable/Disable */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2 text-xs gap-1 ${isDisabled ? "text-muted-foreground hover:text-emerald-400" : "text-emerald-400 hover:text-red-400"}`}
                                onClick={() => toggleJob.mutate({ jobId: job.id, enabled: !job.enabled })}
                                disabled={isToggling}
                                title={isDisabled ? "تفعيل المهمة" : "إيقاف المهمة"}
                              >
                                {isToggling
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : isDisabled
                                    ? <PowerOff className="h-3 w-3" />
                                    : <Power className="h-3 w-3" />}
                                {isDisabled ? "تفعيل" : "إيقاف"}
                              </Button>

                              {/* Run Now */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-3 text-xs gap-1.5"
                                disabled={isRunning || isDisabled}
                                onClick={() => runNow.mutate({ id: job.id })}
                              >
                                {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                {isRunning ? "جارٍ..." : "تشغيل"}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Log Panel */}
                        {logsOpen && <LogPanel jobId={job.id} timezone={timezone} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notes */}
      <div className="rounded-lg border border-border/40 bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="font-medium mb-1">ملاحظات:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>زر "إيقاف" يوقف التنفيذ التلقائي والتنفيذ اليدوي للمهمة نفسها، ويُفحص في بداية كل دورة V2.</li>
          <li>عدد التشغيلات والأخطاء والسجل التاريخي محفوظة في قاعدة البيانات ولا تُفقد عند إعادة تشغيل التطبيق.</li>
          <li>كل تشغيل تلقائي أو يدوي ناجح أو فاشل يظهر ضمن سجل المهمة.</li>
          <li>إشعار تلقائي يُرسل للمالك عند فشل أي مهمة 3 مرات متتالية (مرة كل ساعة كحد أقصى)</li>
        </ul>
      </div>
    </div>
  );
}
