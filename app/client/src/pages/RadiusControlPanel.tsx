import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, FileCheck2, Loader2, Play, RefreshCw, RotateCcw, Server, Square, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type RadiusAction = "reload" | "restart" | "start" | "stop";

const actions: Record<RadiusAction, { label: string; confirmation: string; description: string; icon: typeof RefreshCw; className: string }> = {
  reload: { label: "فحص ثم Reload الإعدادات", confirmation: "RELOAD SETTINGS", description: "يفحص الإعدادات أولاً؛ إن نجح الفحص فقط يعيد تحميلها دون Restart.", icon: RefreshCw, className: "border-sky-500/50 text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950" },
  restart: { label: "إعادة تشغيل الخدمة", confirmation: "RESTART", description: "يعيد تشغيل FreeRADIUS بعد فحص الإعدادات وقد تتأثر المصادقات للحظات.", icon: RotateCcw, className: "border-amber-500/50 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950" },
  start: { label: "تشغيل FreeRADIUS", confirmation: "START RADIUS", description: "يشغل الخدمة المتوقفة بعد فحص الإعدادات.", icon: Play, className: "border-emerald-500/50 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950" },
  stop: { label: "إيقاف FreeRADIUS", confirmation: "STOP RADIUS", description: "يوقف المصادقات الجديدة؛ استخدمه فقط عند الضرورة.", icon: Square, className: "border-red-500/50 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950" },
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

export default function RadiusControlPanel() {
  const [selectedAction, setSelectedAction] = useState<RadiusAction | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const statusQuery = trpc.radius.getStatus.useQuery(undefined, {
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const utils = trpc.useUtils();
  const execute = trpc.radius.execute.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "اكتملت العملية بنجاح");
      setSelectedAction(null); setConfirmation(""); setReason("");
      void utils.radius.getStatus.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const status = statusQuery.data;
  const isActive = status?.activeState === "active";
  const selected = selectedAction ? actions[selectedAction] : null;
  const canExecute = Boolean(selected && confirmation === selected.confirmation && reason.trim().length >= 3);
  const stateBadge = useMemo(() => {
    if (statusQuery.isLoading) return <Badge variant="secondary">جارٍ قراءة الحالة</Badge>;
    if (isActive) return <Badge className="bg-emerald-600"><CheckCircle2 className="ml-1 h-3.5 w-3.5" />نشطة</Badge>;
    if (status?.activeState === "failed") return <Badge variant="destructive">فشلت</Badge>;
    return <Badge variant="secondary">متوقفة</Badge>;
  }, [isActive, status?.activeState, statusQuery.isLoading]);

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2">{stateBadge}<Badge variant="outline">FreeRADIUS Operations V2</Badge></div>
        <h1 className="text-3xl font-bold tracking-tight">تحكم FreeRADIUS</h1>
        <p className="mt-1 text-muted-foreground">تحكم مقيد بالخدمة مع مراقبة حية وسجل تدقيق دائم. الجلسات الحية مصدرها online_sessions فقط.</p>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {statusQuery.isFetching
            ? "جارٍ تحديث الحالة تلقائياً…"
            : `آخر تحديث: ${statusQuery.dataUpdatedAt ? formatDate(new Date(statusQuery.dataUpdatedAt).toISOString()) : "—"} · كل 5 ثوانٍ`}
        </p>
        <Button variant="outline" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching}><RefreshCw className={`ml-2 h-4 w-4 ${statusQuery.isFetching ? "animate-spin" : ""}`} />تحديث الآن</Button>
      </div>
    </section>

    {statusQuery.error && <Card className="border-red-500/50"><CardContent className="flex items-center gap-3 pt-6 text-red-700 dark:text-red-300"><AlertTriangle className="h-5 w-5" />{statusQuery.error.message}</CardContent></Card>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric title="حالة الخدمة" value={status?.activeState || "غير معروفة"} description={status?.subState || "—"} icon={Server} color="text-sky-600" />
      <Metric title="مدة التشغيل" value={status?.uptimeHuman || "—"} description={`بدأت: ${formatDate(status?.activeSince)}`} icon={Clock3} color="text-violet-600" />
      <Metric title="PID والجلسات الحية" value={String(status?.pid ?? "—")} description={`جلسات V2: ${status?.activeSessions ?? "—"}`} icon={Activity} color="text-emerald-600" />
      <Metric title="آخر فحص إعداد" value={status?.lastConfigCheck?.success === true ? "سليم" : status?.lastConfigCheck?.success === false ? "فشل" : "لم يُفحص"} description={status?.lastConfigCheck?.summary || "نفذ فحص ثم Reload."} icon={FileCheck2} color="text-amber-600" />
    </section>

    <Card>
      <CardHeader><CardTitle>إجراءات الخدمة</CardTitle><CardDescription>كل أمر يتطلب سبباً وعبارة تأكيد صريحة. لا توجد أي خانة لتنفيذ أوامر shell عامة.</CardDescription></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(actions) as RadiusAction[]).map((action) => {
          const spec = actions[action]; const Icon = spec.icon;
          const disabled = execute.isPending || (action === "start" ? isActive : action !== "reload" && !isActive);
          return <Button key={action} variant="outline" className={`min-h-20 whitespace-normal py-3 ${spec.className}`} disabled={disabled} onClick={() => setSelectedAction(action)}><Icon className="ml-2 h-4 w-4 shrink-0" />{spec.label}</Button>;
        })}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" />آخر رسائل FreeRADIUS</CardTitle><CardDescription>عرض قرائي لآخر 20 سطراً من السجل.</CardDescription></CardHeader>
      <CardContent><pre className="max-h-80 overflow-auto rounded-lg bg-muted p-4 text-xs leading-6">{status?.recentLogs?.join("\n") || "لا توجد رسائل متاحة."}</pre></CardContent>
    </Card>

    <Dialog open={Boolean(selectedAction)} onOpenChange={(open) => !open && !execute.isPending && setSelectedAction(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{selected?.label}</DialogTitle><DialogDescription>{selected?.description}</DialogDescription></DialogHeader>
        {selectedAction === "stop" && <div className="rounded-md border border-red-500/40 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">تحذير: سيؤثر الإيقاف على المصادقات الجديدة. الجلسات الحية الآن: {status?.activeSessions ?? 0}.</div>}
        <div className="space-y-2"><Label htmlFor="radius-reason">سبب العملية</Label><Textarea id="radius-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="اكتب سبباً تشغيلياً واضحاً..." /></div>
        <div className="space-y-2"><Label htmlFor="radius-confirmation">اكتب: <code className="rounded bg-muted px-1">{selected?.confirmation}</code></Label><Input id="radius-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></div>
        <DialogFooter><Button variant="outline" onClick={() => setSelectedAction(null)} disabled={execute.isPending}>إلغاء</Button><Button disabled={!canExecute || execute.isPending} onClick={() => selectedAction && execute.mutate({ action: selectedAction, confirmation, reason })}>{execute.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تأكيد التنفيذ</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function Metric({ title, value, description, icon: Icon, color }: { title: string; value: string; description: string; icon: typeof Server; color: string }) {
  return <Card><CardHeader className="pb-3"><CardDescription>{title}</CardDescription><CardTitle className="flex items-center gap-2 text-xl"><Icon className={`h-5 w-5 ${color}`} />{value}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{description}</CardContent></Card>;
}
