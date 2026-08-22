import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Copy, History, Info, Loader2, Monitor, Power, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react";

const statusLabel = (ar: boolean, status?: string) => {
  const labels: Record<string, string> = ar
    ? { pending: "بانتظار التفعيل", active: "نشط", disabled: "معطّل", error: "يتطلب مراجعة" }
    : { pending: "Awaiting activation", active: "Active", disabled: "Disabled", error: "Needs review" };
  return status ? labels[status] ?? status : ar ? "جاهز للطلب" : "Ready";
};

export default function WinboxAccess() {
  const { language, direction } = useLanguage();
  const ar = language === "ar";
  const utils = trpc.useUtils();
  const [cidrs, setCidrs] = useState<Record<number, string>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);

  const devices = trpc.remoteManagement.devices.useQuery();
  const accesses = trpc.remoteManagement.list.useQuery();
  const quota = trpc.remoteManagement.quota.useQuery();
  const address = trpc.remoteManagement.publicHost.useQuery();
  const history = trpc.remoteManagement.history.useQuery({ id: historyId ?? 1 }, { enabled: historyId !== null });
  const refresh = async () => Promise.all([
    utils.remoteManagement.devices.invalidate(),
    utils.remoteManagement.list.invalidate(),
    utils.remoteManagement.quota.invalidate(),
    historyId ? utils.remoteManagement.history.invalidate({ id: historyId }) : Promise.resolve(),
  ]);

  const request = trpc.remoteManagement.request.useMutation({
    onSuccess: async () => { toast.success(ar ? "تم حجز الوصول. فعّله عند الجاهزية." : "Access reserved. Activate when ready."); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const activate = trpc.remoteManagement.activate.useMutation({
    onSuccess: async () => { toast.success(ar ? "تم تفعيل Winbox V2 بقائمة السماح المحددة." : "Winbox V2 activated with the configured allowlist."); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const rollback = trpc.remoteManagement.rollback.useMutation({
    onSuccess: async () => { toast.success(ar ? "تم إغلاق الوصول الخارجي وتعطيل الطلب." : "External access was closed and the request disabled."); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const reenable = trpc.remoteManagement.reenable.useMutation({
    onSuccess: async () => { toast.success(ar ? "أعيد الطلب إلى انتظار التفعيل." : "Request moved back to pending activation."); await refresh(); },
    onError: (error) => toast.error(error.message),
  });

  const accessByNas = useMemo(() => new Map((accesses.data ?? []).map((item: any) => [item.nasId, item])), [accesses.data]);
  const host = address.data?.host || (ar ? "عنوان VPS غير مهيأ" : "VPS host not configured");
  const busy = request.isPending || activate.isPending || rollback.isPending || reenable.isPending;
  const copy = async (value: string, id: number) => { await navigator.clipboard.writeText(value); setCopied(id); window.setTimeout(() => setCopied(null), 1500); };

  const reserve = (device: any) => {
    const allowedCidrs = (cidrs[device.id] ?? "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
    if (!allowedCidrs.length) {
      toast.error(ar ? "أدخل عنوان IP أو CIDR موثوقاً." : "Enter at least one trusted IP or CIDR.");
      return;
    }
    request.mutate({ nasId: device.id, targetPort: device.mikrotikWinboxPort ?? 8291, accessMode: "restricted", allowedCidrs, publicAcknowledged: false });
  };

  return <div className="space-y-6" dir={direction}>
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div><div className="mb-1 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500"><Monitor className="h-5 w-5" /></div><h1 className="text-2xl font-bold">{ar ? "إدارة Winbox V2" : "Winbox Management V2"}</h1></div><p className="text-sm text-muted-foreground">{ar ? "وصول معزول عبر VPN، نطاق V2 مستقل، وقائمة سماح إلزامية." : "Isolated VPN access, a dedicated V2 range, and a mandatory source allowlist."}</p></div>
      <Button variant="outline" onClick={refresh} disabled={devices.isLoading || busy}><RefreshCw className={`h-4 w-4 ${devices.isLoading ? "animate-spin" : ""} ${direction === "rtl" ? "ml-2" : "mr-2"}`} />{ar ? "تحديث" : "Refresh"}</Button>
    </header>

    <Card className="border-sky-500/20 bg-sky-500/[0.03]"><CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" /><div><p className="font-semibold">{ar ? "وصول Winbox V2 مقيّد" : "Restricted Winbox V2 access"}</p><p className="mt-1 text-sm text-muted-foreground">{ar ? "لا يُفتح أي منفذ إلا بعد التفعيل، ولا يُسمح بالوصول العام." : "No port opens until activation, and public ingress is not permitted."}</p></div></div><Badge variant="outline" className="w-fit border-sky-500/25 text-sky-600">{ar ? `الحصة: ${quota.data?.usedAccesses ?? 0}/${quota.data?.maxAccesses ?? 0}` : `Quota: ${quota.data?.usedAccesses ?? 0}/${quota.data?.maxAccesses ?? 0}`}</Badge></CardContent></Card>

    {devices.isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div> : (devices.data ?? []).length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">{ar ? "لا توجد أجهزة NAS مملوكة للحساب." : "No NAS devices belong to this account."}</CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{(devices.data ?? []).map((device: any) => {
      const access: any = accessByNas.get(device.id);
      const connected = Boolean(device.allocatedIp || device.vpnTunnelIp);
      const endpoint = access?.status === "active" && access?.externalPort ? `${host}:${access.externalPort}` : null;
      const showingHistory = historyId === access?.id;
      return <Card key={device.id} className="overflow-hidden"><div className={`h-1 ${access?.status === "active" ? "bg-emerald-500" : access?.status === "pending" ? "bg-amber-500" : access?.status === "error" ? "bg-destructive" : "bg-muted"}`} /><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted"><Monitor className="h-5 w-5" /></div><div className="min-w-0"><CardTitle className="truncate text-base">{device.name || device.nasname || `NAS #${device.id}`}</CardTitle><CardDescription className="truncate">{device.nasname || (ar ? "بانتظار NAS" : "Awaiting NAS")}</CardDescription></div></div><Badge variant="outline">{access ? statusLabel(ar, access.status) : connected ? statusLabel(ar) : ar ? "VPN غير متصل" : "VPN offline"}</Badge></div></CardHeader><CardContent className="space-y-4">
        {endpoint && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3"><p className="mb-1 text-xs text-muted-foreground">{ar ? "نقطة اتصال Winbox النشطة" : "Active Winbox endpoint"}</p><div className="flex items-center justify-between gap-2"><code className="truncate text-sm font-semibold">{endpoint}</code><Button variant="ghost" size="icon" onClick={() => copy(endpoint, device.id)}>{copied === device.id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}</Button></div></div>}
        {!access && <><div><Label className="text-xs">{ar ? "عناوين IP/CIDR المسموح بها" : "Allowed IPs/CIDRs"}</Label><Input className="mt-1" placeholder="203.0.113.9/32" value={cidrs[device.id] ?? ""} onChange={(event) => setCidrs((old) => ({ ...old, [device.id]: event.target.value }))} /></div><Button className="w-full" disabled={!connected || busy} onClick={() => reserve(device)}><Wifi className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />{ar ? "حجز وصول V2" : "Reserve V2 access"}</Button></>}
        {access?.status === "disabled" && <Button className="w-full" disabled={busy} onClick={() => reenable.mutate({ id: access.id })}><Power className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />{ar ? "إعادة طلب التفعيل" : "Request reactivation"}</Button>}
        {access && access.status !== "disabled" && <div className="grid gap-2 sm:grid-cols-2"><Button disabled={busy || access.status === "active"} onClick={() => activate.mutate({ id: access.id })}><Wifi className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />{ar ? "تفعيل على VPS" : "Activate on VPS"}</Button><Button variant="outline" disabled={busy} onClick={() => rollback.mutate({ id: access.id })}><WifiOff className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />{ar ? "تراجع وإغلاق" : "Rollback & close"}</Button></div>}
        {access && <Button variant="ghost" size="sm" className="w-full" disabled={busy} onClick={() => setHistoryId(showingHistory ? null : access.id)}><History className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />{ar ? "سجل الأحداث" : "Event history"}</Button>}
        {showingHistory && <div className="rounded-lg border bg-muted/20 p-3 text-xs">{history.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (history.data ?? []).length === 0 ? <span className="text-muted-foreground">{ar ? "لا توجد أحداث مسجلة." : "No events recorded."}</span> : <div className="space-y-2">{(history.data ?? []).slice(0, 5).map((event: any) => <div key={event.id} className="flex justify-between gap-3"><span className="font-medium">{event.action}</span><span className="text-muted-foreground">{event.createdAt ? new Date(event.createdAt).toLocaleString() : ""}</span></div>)}</div>}</div>}
        {access?.lastError && <p className="text-xs text-destructive">{access.lastError}</p>}
      </CardContent></Card>;
    })}</div>}
    <p className="flex gap-2 text-xs text-muted-foreground"><Info className="h-4 w-4 shrink-0" />{ar ? "النطاق 40000–44999 مخصص للإدارة البعيدة ولا يتداخل مع Legacy أو توجيه LAN." : "The 40000–44999 range is dedicated to remote management and does not overlap legacy or LAN forwarding."}</p>
  </div>;
}
