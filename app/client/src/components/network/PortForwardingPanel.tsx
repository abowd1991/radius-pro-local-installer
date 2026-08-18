import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowUpRight, Copy, Edit3, Globe2, Network, Plus, Power, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type Forwarding = {
  id: number;
  routerId: number;
  label: string;
  targetIp: string;
  targetPort: number;
  externalPort: number;
  accessMode: "restricted" | "public";
  allowedCidrs: string[];
  status: "pending" | "active" | "disabled" | "error";
  lastError: string | null;
  nasName: string | null;
  routerName: string;
};

type Target = { id: number; nasId: number; name: string; ipAddress: string; nasName: string };

const statusStyle: Record<Forwarding["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  disabled: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  error: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabel: Record<Forwarding["status"], string> = {
  active: "مفعّل",
  disabled: "متوقف",
  pending: "قيد التجهيز",
  error: "بحاجة مراجعة",
};

function parseAllowlist(value: string) {
  return value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
}

export function PortForwardingPanel({ targets }: { targets: Target[] }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Forwarding | null>(null);
  const [form, setForm] = useState({ networkRouterId: "", label: "", targetPort: "80", accessMode: "restricted" as "restricted" | "public", allowedCidrs: "" });
  const [publicAcknowledged, setPublicAcknowledged] = useState(false);
  const forwardsQuery = trpc.portForwarding.list.useQuery();
  const quotaQuery = trpc.portForwarding.quota.useQuery();
  const addressQuery = trpc.winbox.getPublicAddress.useQuery();
  const forwards = (forwardsQuery.data || []) as Forwarding[];
  const availableTargets = useMemo(() => targets.filter((target) => Boolean(target.ipAddress)), [targets]);
  const forwardingHost = addressQuery.data?.portForwardingHost || addressQuery.data?.address || "VPS";
  const forwardUrl = (port: number) => `http://${forwardingHost}:${port}`;

  const refresh = () => {
    utils.portForwarding.list.invalidate();
  };
  const createMutation = trpc.portForwarding.create.useMutation({
    onSuccess: () => { toast.success("تم إنشاء التوجيه وتطبيق الحماية بنجاح"); setOpen(false); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.portForwarding.update.useMutation({
    onSuccess: () => { toast.success("تم تحديث التوجيه"); setOpen(false); setEditing(null); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const enableMutation = trpc.portForwarding.enable.useMutation({ onSuccess: () => { toast.success("تم تفعيل التوجيه"); refresh(); }, onError: (error) => toast.error(error.message) });
  const disableMutation = trpc.portForwarding.disable.useMutation({ onSuccess: () => { toast.success("تم إيقاف التوجيه وإغلاق المنفذ الخارجي"); refresh(); }, onError: (error) => toast.error(error.message) });
  const deleteMutation = trpc.portForwarding.delete.useMutation({ onSuccess: () => { toast.success("تم حذف التوجيه وتنظيف قواعده"); refresh(); }, onError: (error) => toast.error(error.message) });

  const openCreate = () => {
    setEditing(null);
    setForm({ networkRouterId: "", label: "", targetPort: "80", accessMode: "restricted", allowedCidrs: "" });
    setPublicAcknowledged(false);
    setOpen(true);
  };
  const openEdit = (forward: Forwarding) => {
    setEditing(forward);
    setForm({ networkRouterId: String(forward.routerId), label: forward.label, targetPort: String(forward.targetPort), accessMode: forward.accessMode, allowedCidrs: forward.allowedCidrs.join("\n") });
    setPublicAcknowledged(false);
    setOpen(true);
  };
  const save = () => {
    const targetPort = Number(form.targetPort);
    const allowedCidrs = form.accessMode === "public" ? [] : parseAllowlist(form.allowedCidrs);
    if (!Number.isInteger(targetPort)) return toast.error("أدخل منفذ جهاز صحيحاً");
    if (form.accessMode === "public" && !publicAcknowledged) return toast.error("أكد إدراكك أن المنفذ سيكون متاحاً من الإنترنت قبل الحفظ");
    if (editing) {
      updateMutation.mutate({ id: editing.id, label: form.label.trim(), targetPort, accessMode: form.accessMode, allowedCidrs });
      return;
    }
    if (!form.networkRouterId) return toast.error("اختر جهازاً مسجلاً في Network Monitor أولاً");
    createMutation.mutate({ networkRouterId: Number(form.networkRouterId), label: form.label.trim(), targetPort, accessMode: form.accessMode, allowedCidrs });
  };
  const busy = createMutation.isPending || updateMutation.isPending;
  const copyForwardUrl = async (port: number) => {
    const url = forwardUrl(port);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ رابط التوجيه الخارجي");
    } catch {
      toast.error("تعذر النسخ تلقائياً؛ انسخ الرابط يدوياً");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Network className="h-5 w-5" /></div>
          <div>
            <h2 className="text-sm font-bold">التوجيه الخارجي الآمن</h2>
            <p className="text-xs text-muted-foreground">Nginx Stream عبر VPN مع وصول مقيد افتراضياً أو وصول عام بتأكيد صريح.</p>
            <p className="mt-1 text-xs text-cyan-500">حصة التوجيه: {quotaQuery.data?.used ?? 0}/{quotaQuery.data?.limit ?? 10} — متاح {quotaQuery.data?.remaining ?? 10}</p>
          </div>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" />إضافة توجيه</Button>
      </div>

      <div className="grid grid-cols-1 gap-2 border-b border-border/60 bg-muted/15 px-4 py-3 text-xs md:grid-cols-3">
        <div className="flex items-start gap-2 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>الوضع الافتراضي محصور بعناوين IP؛ الوصول العام اختيار صريح لكل توجيه.</span></div>
        <div className="flex items-start gap-2 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>الجهاز الهدف يجب أن يكون مسجلاً ومملوكاً لنفس NAS.</span></div>
        <div className="flex items-start gap-2 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>منفذ خارجي فريد ومجال مستقل عن RADIUS وVPN.</span></div>
      </div>

      {forwardsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />جاري تحميل التوجيهات...</div>
      ) : forwards.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Network className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">لا توجد توجيهات خارجية</p>
          <p className="mt-1 text-xs text-muted-foreground/70">أضف جهازاً داخلياً أولاً في قائمة المراقبة، ثم أنشئ له توجيهاً محمياً.</p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {forwards.map((forward) => (
            <div key={forward.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <div className="min-w-[160px] flex-1">
                <div className="flex items-center gap-2"><p className="text-sm font-semibold">{forward.label}</p><Badge variant="outline" className={statusStyle[forward.status]}>{statusLabel[forward.status]}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">{forward.nasName || "NAS"} ← {forward.routerName} · <span dir="ltr" className="font-mono">{forward.targetIp}:{forward.targetPort}</span></p>
                {forward.status === "error" && forward.lastError && <p className="mt-1 text-xs text-destructive">{forward.lastError}</p>}
              </div>
              <div className="min-w-[220px] rounded-lg border border-border bg-muted/25 px-3 py-2 text-left" dir="ltr">
                <p className="text-[10px] text-muted-foreground">عنوان الاتصال الخارجي</p>
                <p className="mt-0.5 truncate font-mono text-xs font-semibold" title={forwardUrl(forward.externalPort)}>{forwardUrl(forward.externalPort)}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Button asChild size="sm" className="h-7 gap-1.5" disabled={forward.status !== "active"}>
                    <a href={forwardUrl(forward.externalPort)} target="_blank" rel="noreferrer"><ArrowUpRight className="h-3.5 w-3.5" />فتح الرابط</a>
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={() => copyForwardUrl(forward.externalPort)} title="نسخ الرابط">
                    <Copy className="h-3.5 w-3.5" />نسخ
                  </Button>
                </div>
              </div>
              <div className="hidden max-w-[180px] flex-1 text-xs text-muted-foreground lg:block">{forward.accessMode === "public" ? <span className="inline-flex items-center gap-1 text-amber-500"><Globe2 className="h-3.5 w-3.5" />عامة</span> : forward.allowedCidrs.join("، ")}</div>
              <div className="mr-auto flex items-center gap-1">
                {forward.status === "active" ? <Button variant="outline" size="icon" title="إيقاف التوجيه" onClick={() => disableMutation.mutate({ id: forward.id })}><Power className="h-4 w-4 text-amber-400" /></Button> : <Button variant="outline" size="icon" title="تفعيل التوجيه" onClick={() => enableMutation.mutate({ id: forward.id })}><Power className="h-4 w-4 text-emerald-400" /></Button>}
                <Button variant="outline" size="icon" title="تعديل التوجيه" onClick={() => openEdit(forward)}><Edit3 className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="outline" size="icon" title="حذف التوجيه" className="hover:border-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                  <AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>حذف التوجيه الخارجي</AlertDialogTitle><AlertDialogDescription>سيتم إغلاق المنفذ الخارجي وحذف قاعدة NAT الخاصة بهذا التوجيه فقط.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteMutation.mutate({ id: forward.id })}>حذف التوجيه</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "تعديل التوجيه الخارجي" : "إضافة توجيه خارجي آمن"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!editing && <div className="space-y-1.5"><Label>الجهاز الداخلي المسجل</Label><Select value={form.networkRouterId} onValueChange={(value) => {
              const selected = availableTargets.find((target) => String(target.id) === value);
              setForm((current) => ({ ...current, networkRouterId: value, label: current.label || selected?.name || "" }));
            }}><SelectTrigger><SelectValue placeholder="اختر جهازاً من Network Monitor..." /></SelectTrigger><SelectContent>{availableTargets.map((target) => <SelectItem key={target.id} value={String(target.id)}><span>{target.name} — </span><span dir="ltr" className="font-mono text-xs">{target.ipAddress}</span></SelectItem>)}</SelectContent></Select></div>}
            <div className="space-y-1.5"><Label>اسم التوجيه</Label><Input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="مثال: كاميرا المدخل" /></div>
            <div className="space-y-1.5"><Label>منفذ الجهاز الداخلي</Label><Input dir="ltr" type="number" min="1" max="65535" value={form.targetPort} onChange={(event) => setForm((current) => ({ ...current, targetPort: event.target.value }))} placeholder="80 أو 8291 أو 554" /><p className="text-xs text-muted-foreground">يُحجز المنفذ الخارجي ومنفذ الدخول تلقائياً ولا يمكن تكرارهما.</p></div>
            <div className="space-y-1.5"><Label>سياسة الوصول الخارجي</Label><Select value={form.accessMode} onValueChange={(value: "restricted" | "public") => { setPublicAcknowledged(false); setForm((current) => ({ ...current, accessMode: value })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="restricted">محصور بعناوين IP محددة — موصى به</SelectItem><SelectItem value="public">مفتوح للعامة — استخدمه فقط عند الحاجة</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">الوصول العام يفتح هذا المنفذ لهذا التوجيه وحده، ولا يفتح نطاق منافذ آخر.</p></div>
            {form.accessMode === "public" && <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-500" checked={publicAcknowledged} onChange={(event) => setPublicAcknowledged(event.target.checked)} /><span>أفهم أن هذا المنفذ سيصبح متاحاً من الإنترنت لأي عنوان، وأن الجهاز الظاهر في الصورة لديه كلمة مرور إدارة قوية.</span></label>}
            {form.accessMode === "restricted" && <div className="space-y-1.5"><Label>مصادر الوصول الموثوقة (CIDR)</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" dir="ltr" value={form.allowedCidrs} onChange={(event) => setForm((current) => ({ ...current, allowedCidrs: event.target.value }))} placeholder={"198.51.100.7/32\n203.0.113.0/24"} /><p className="text-xs text-muted-foreground">عنوان أو نطاق واحد في كل سطر.</p></div>}
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button onClick={save} disabled={busy} className="gap-2">{busy && <RefreshCw className="h-4 w-4 animate-spin" />}{editing ? "حفظ وإعادة تطبيق الحماية" : "إنشاء التوجيه المحمي"}</Button><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
