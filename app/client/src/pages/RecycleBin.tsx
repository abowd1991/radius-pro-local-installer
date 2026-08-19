import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Settings2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { confirmAction } from "@/lib/confirmAction";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type EntityType = "card" | "batch" | "subscriber";

const entityLabels: Record<EntityType, string> = {
  card: "الكروت",
  batch: "الدفعات",
  subscriber: "المشتركين",
};

function dateText(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function itemSummary(item: any) {
  const data = item.snapshot?.data ?? {};
  if (item.entityType === "card") return data.card?.serialNumber ? `رقم تسلسلي: ${data.card.serialNumber}` : "كرت RADIUS";
  if (item.entityType === "batch") return `${data.cards?.length ?? 0} كرت مؤرشف ضمن الدفعة`;
  return data.subscriber?.username ? `اسم المستخدم: ${data.subscriber.username}` : "مشترك PPPoE";
}

export default function RecycleBin() {
  const [filter, setFilter] = useState<"all" | EntityType>("all");
  const [retention, setRetention] = useState(30);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(true);
  const [cleanupIntervalHours, setCleanupIntervalHours] = useState(24);
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();
  const canConfigure = me?.role === "owner" || me?.role === "super_admin";
  const { data: allItems = [], isLoading } = trpc.recycleBin.list.useQuery();
  const { data: settings } = trpc.recycleBin.settings.useQuery(undefined, { enabled: canConfigure });

  useEffect(() => {
    if (settings?.retentionDays) setRetention(settings.retentionDays);
    if (settings) {
      setAutoCleanupEnabled(settings.autoCleanupEnabled);
      setCleanupIntervalHours(settings.cleanupIntervalHours);
    }
  }, [settings?.retentionDays]);

  const items = filter === "all" ? allItems : allItems.filter((item: any) => item.entityType === filter);

  const restore = trpc.recycleBin.restore.useMutation({ onSuccess: async () => { await utils.recycleBin.list.invalidate(); toast.success("تمت استعادة العنصر بنجاح"); } });
  const purge = trpc.recycleBin.permanentlyDelete.useMutation({ onSuccess: async () => { await utils.recycleBin.list.invalidate(); toast.success("تم الحذف النهائي للعنصر"); } });
  const clearMine = trpc.recycleBin.clearMine.useMutation({ onSuccess: async ({ deleted }) => { await utils.recycleBin.list.invalidate(); toast.success(`تم حذف ${deleted} عنصر نهائياً`); } });
  const updateSettings = trpc.recycleBin.updateSettings.useMutation({ onSuccess: async () => { await utils.recycleBin.settings.invalidate(); toast.success("تم حفظ مدة الاحتفاظ"); } });

  const counts = useMemo(() => ({
    all: allItems.length,
    card: allItems.filter((item: any) => item.entityType === "card").length,
    batch: allItems.filter((item: any) => item.entityType === "batch").length,
    subscriber: allItems.filter((item: any) => item.entityType === "subscriber").length,
  }), [allItems]);

  const restoreItem = async (item: any) => {
    if (await confirmAction({ title: "استعادة العنصر", description: `هل تريد استعادة «${item.displayName}» بكل بياناته المؤرشفة؟`, confirmLabel: "استعادة", tone: "primary" })) restore.mutate({ id: item.id });
  };

  const purgeItem = async (item: any) => {
    if (await confirmAction({ title: "حذف نهائي", description: `سيُحذف «${item.displayName}» نهائياً من سلة المحذوفات ولا يمكن استعادته.`, confirmLabel: "حذف نهائي", tone: "destructive" })) purge.mutate({ id: item.id });
  };

  const clearAll = async () => {
    if (await confirmAction({ title: "إفراغ سلة المحذوفات", description: "سيُحذف كل ما في سلة محذوفاتك نهائياً. لا يمكن التراجع عن هذه العملية.", confirmLabel: "إفراغ السلة", tone: "destructive" })) clearMine.mutate();
  };

  return (
    <main className="space-y-6 p-4 md:p-6" dir="rtl">
      <section className="rounded-3xl border border-amber-200 bg-gradient-to-l from-amber-50 via-white to-rose-50 p-5 shadow-sm dark:border-amber-900/40 dark:from-amber-950/20 dark:via-slate-950 dark:to-rose-950/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300"><Trash2 className="h-6 w-6" /></div>
            <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">سلة المحذوفات</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">العناصر هنا خارج التشغيل ويمكن استعادتها قبل موعد الحذف النهائي.</p></div>
          </div>
          <Button variant="destructive" onClick={clearAll} disabled={!allItems.length || clearMine.isPending}><Trash2 className="ml-2 h-4 w-4" />إفراغ السلة</Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["all", "card", "batch", "subscriber"] as const).map((type) => (
          <button key={type} onClick={() => setFilter(type)} className={`rounded-2xl border p-4 text-right transition ${filter === type ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:border-primary/40"}`}>
            <p className="text-xs text-muted-foreground">{type === "all" ? "كل العناصر" : entityLabels[type]}</p>
            <p className="mt-1 text-2xl font-bold">{counts[type]}</p>
          </button>
        ))}
      </section>

      {canConfigure && <Card className="border-primary/20"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4 text-primary" />إعدادات الاحتفاظ والتنظيف</CardTitle><CardDescription>يمكن لمالك النظام تحديد مدة الاحتفاظ ووتيرة الحذف التلقائي النهائي.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1.5 block text-sm font-medium">عدد أيام الاحتفاظ</label><Input type="number" min={1} max={365} value={retention} onChange={(event) => setRetention(Number(event.target.value))} /></div><div><label className="mb-1.5 block text-sm font-medium">فحص التنظيف كل (ساعة)</label><Input type="number" min={1} max={24} value={cleanupIntervalHours} disabled={!autoCleanupEnabled} onChange={(event) => setCleanupIntervalHours(Number(event.target.value))} /></div></div><label className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm font-medium"><input type="checkbox" checked={autoCleanupEnabled} onChange={(event) => setAutoCleanupEnabled(event.target.checked)} className="h-4 w-4 accent-primary" />تفعيل الحذف التلقائي بعد انتهاء مدة الاحتفاظ</label><Button className="w-fit" onClick={() => updateSettings.mutate({ retentionDays: retention, autoCleanupEnabled, cleanupIntervalHours })} disabled={updateSettings.isPending}>حفظ الإعدادات</Button></CardContent></Card>}

      <Card><CardHeader><CardTitle>العناصر المؤرشفة</CardTitle><CardDescription>الاستعادة تعيد العنصر وبياناته التشغيلية، بينما الحذف النهائي يزيل الأرشيف فقط مع بقاء سجل التدقيق.</CardDescription></CardHeader><CardContent>
        {isLoading ? <div className="py-12 text-center text-muted-foreground">جارٍ تحميل السلة…</div> : !items.length ? <div className="py-12 text-center text-muted-foreground">سلة المحذوفات فارغة.</div> : <div className="space-y-3">
          {items.map((item: any) => <div key={item.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{item.displayName}</h2><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{entityLabels[item.entityType as EntityType]}</span></div><p className="mt-1 text-sm text-muted-foreground">{itemSummary(item)}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>نُقل: {dateText(item.deletedAt)}</span><span className="text-rose-600 dark:text-rose-300">يحذف: {dateText(item.purgeAt)}</span></div></div><div className="flex shrink-0 gap-2"><Button variant="outline" onClick={() => restoreItem(item)} disabled={restore.isPending}><ArchiveRestore className="ml-2 h-4 w-4" />استعادة</Button><Button variant="destructive" size="icon" onClick={() => purgeItem(item)} disabled={purge.isPending} title="حذف نهائي"><Trash2 className="h-4 w-4" /></Button></div></div>)}
        </div>}
      </CardContent></Card>

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><TriangleAlert className="h-4 w-4 text-amber-500" />البيانات المحذوفة لا تظهر في الكروت أو الدفعات أو المشتركين أو البحث أو التقارير أثناء وجودها في السلة.</p>
    </main>
  );
}
