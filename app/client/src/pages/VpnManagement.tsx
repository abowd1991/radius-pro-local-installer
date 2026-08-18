import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, Cable, CircleAlert, Clock3, PlugZap, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

type VpnView = {
  nasId: number;
  nasName: string | null;
  nasAddress: string | null;
  nasVpnUsername: string | null;
  nasTunnelIp: string | null;
  identityId: number | null;
  vpnUsername: string | null;
  protocol: "l2tp" | "pptp" | "sstp" | null;
  allocatedIp: string | null;
  provisioningStatus: "pending" | "ready" | "error" | "revoked" | null;
  lastProvisionedAt: Date | string | null;
  lastError: string | null;
  liveSessionId: number | null;
  assignedIp: string | null;
  interfaceName: string | null;
  connectedAt: Date | string | null;
  lastSeenAt: Date | string | null;
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-PS", {
    timeZone: "Asia/Gaza", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function protocolLabel(protocol: VpnView["protocol"]) {
  return protocol === "sstp" ? "SSTP" : protocol === "pptp" ? "PPTP" : protocol === "l2tp" ? "L2TP/IPsec" : "—";
}

export default function VpnManagement() {
  const { language } = useLanguage();
  const dir = language === "ar" ? "rtl" : "ltr";
  const utils = trpc.useUtils();
  const dashboard = trpc.vpnManagementV2.dashboard.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchIntervalInBackground: false,
  });
  const refresh = trpc.vpnManagementV2.refresh.useMutation({
    onSuccess: () => utils.vpnManagementV2.dashboard.invalidate(),
    onError: (error) => toast.error(error.message),
  });
  const provision = trpc.vpnManagementV2.provision.useMutation({
    onSuccess: (result) => {
      toast.success(result.success ? "تمت تهيئة هوية VPN بنجاح" : (result.error || "فشلت التهيئة"));
      utils.vpnManagementV2.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const disconnect = trpc.vpnManagementV2.disconnect.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال أمر الفصل وتحديث حالة V2");
      utils.vpnManagementV2.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const disableVpn = trpc.vpnManagementV2.disable.useMutation({
    onSuccess: () => {
      toast.success("تم تعطيل VPN ومنع إعادة اتصال هذا الـNAS");
      utils.vpnManagementV2.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const enableVpn = trpc.vpnManagementV2.enable.useMutation({
    onSuccess: () => {
      toast.success("تم تفعيل VPN وإعادة السماح بالاتصال");
      utils.vpnManagementV2.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const data = dashboard.data as { runtimeAvailable?: boolean; error?: string; views?: VpnView[] } | undefined;
  const views = data?.views ?? [];
  const stats = useMemo(() => ({
    total: views.length,
    ready: views.filter((view) => view.provisioningStatus === "ready").length,
    online: views.filter((view) => Boolean(view.liveSessionId)).length,
    errors: views.filter((view) => view.provisioningStatus === "error").length,
  }), [views]);
  const statCards = [
    { label: "أجهزة VPN", value: stats.total, Icon: Cable, color: "text-blue-600" },
    { label: "هويات مهيأة", value: stats.ready, Icon: ShieldCheck, color: "text-emerald-600" },
    { label: "متصل الآن", value: stats.online, Icon: Wifi, color: "text-violet-600" },
    { label: "تحتاج معالجة", value: stats.errors, Icon: CircleAlert, color: "text-rose-600" },
  ];

  return (
    <DashboardLayout>
      <main className="space-y-6 p-4 md:p-6" dir={dir}>
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="text-sm font-semibold">VPN Management V2</span></div>
            <h1 className="text-2xl font-bold tracking-tight">إدارة اتصالات NAS عبر VPN</h1>
            <p className="mt-1 text-sm text-muted-foreground">L2TP/IPsec وPPTP وSSTP — مصدر الاتصال الحي هو VPN V2، وليس جلسات الكروت.</p>
          </div>
          <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending || dashboard.isFetching}>
            <RefreshCw className={`ml-2 h-4 w-4 ${refresh.isPending || dashboard.isFetching ? "animate-spin" : ""}`} />
            مزامنة الحالة الآن
          </Button>
        </header>

        {data && !data.runtimeAvailable && (
          <Alert variant="destructive">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>خدمة VPN على الخادم غير متاحة حالياً</AlertTitle>
            <AlertDescription>تم الاحتفاظ بآخر حالة V2 محلية بدون اعتبار أي اتصال Offline تلقائياً. {data.error || ""}</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(({ label, value, Icon, color }) => (
            <Card key={label}><CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-xl bg-muted p-3"><Icon className={`h-5 w-5 ${color}`} /></div>
              <div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>
            </CardContent></Card>
          ))}
        </section>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" />هويات NAS وجلسات VPN الحية</CardTitle>
            <Badge variant="secondary">{views.length}</Badge>
          </CardHeader>
          <CardContent>
            {dashboard.isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">جاري تحميل حالة VPN V2…</p>
            ) : views.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><WifiOff className="h-8 w-8" /><p>لا توجد أجهزة NAS تعمل عبر VPN حالياً.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-sm">
                  <thead className="border-b bg-muted/40 text-right text-xs text-muted-foreground">
                    <tr><th className="p-3">الشبكة / NAS</th><th className="p-3">البروتوكول</th><th className="p-3">هوية VPN</th><th className="p-3">IP الثابت</th><th className="p-3">التهيئة</th><th className="p-3">الحالة الحية</th><th className="p-3">آخر تحديث</th><th className="p-3">الإجراءات</th></tr>
                  </thead>
                  <tbody>
                    {views.map((view) => {
                      const online = Boolean(view.liveSessionId);
                      const isProvisioning = provision.isPending && provision.variables?.nasId === view.nasId;
                      const isDisconnecting = disconnect.isPending && disconnect.variables?.nasId === view.nasId;
                      const isDisabled = view.provisioningStatus === "revoked";
                      const isChangingAccess = (disableVpn.isPending && disableVpn.variables?.nasId === view.nasId) || (enableVpn.isPending && enableVpn.variables?.nasId === view.nasId);
                      return <tr className="border-b last:border-0" key={view.nasId}>
                        <td className="p-3"><p className="font-medium">{view.nasName || view.nasAddress || `NAS #${view.nasId}`}</p><p className="font-mono text-xs text-muted-foreground">{view.nasAddress || "—"}</p></td>
                        <td className="p-3"><Badge variant="outline">{protocolLabel(view.protocol)}</Badge></td>
                        <td className="p-3 font-mono text-xs">{view.vpnUsername || view.nasVpnUsername || "غير معرّفة"}</td>
                        <td className="p-3 font-mono text-xs text-primary">{view.allocatedIp || view.nasTunnelIp || "—"}</td>
                        <td className="p-3"><Badge variant={view.provisioningStatus === "ready" ? "default" : view.provisioningStatus === "error" ? "destructive" : "secondary"}>{view.provisioningStatus === "ready" ? "جاهزة" : view.provisioningStatus === "error" ? "خطأ" : view.provisioningStatus === "revoked" ? "VPN معطّل" : "بانتظار التهيئة"}</Badge>{view.lastError && <p className="mt-1 max-w-44 truncate text-xs text-destructive" title={view.lastError}>{view.lastError}</p>}</td>
                        <td className="p-3"><span className={`inline-flex items-center gap-1.5 font-medium ${online ? "text-emerald-600" : "text-muted-foreground"}`}><span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />{online ? "متصل" : "غير متصل"}</span>{online && <p className="mt-1 font-mono text-xs text-muted-foreground">{view.assignedIp || "—"}</p>}</td>
                        <td className="p-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDate(view.lastSeenAt || view.lastProvisionedAt)}</span></td>
                        <td className="p-3"><div className="flex gap-2"><Button size="sm" variant="outline" disabled={isProvisioning || isDisabled} onClick={() => provision.mutate({ nasId: view.nasId })}><PlugZap className="ml-1 h-3.5 w-3.5" />{isProvisioning ? "جارٍ…" : "تهيئة"}</Button>{isDisabled ? <Button size="sm" disabled={isChangingAccess} onClick={() => enableVpn.mutate({ nasId: view.nasId })}>{isChangingAccess ? "جارٍ…" : "تفعيل VPN"}</Button> : <Button size="sm" variant="destructive" disabled={isChangingAccess} onClick={() => disableVpn.mutate({ nasId: view.nasId })}>{isChangingAccess ? "جارٍ…" : "تعطيل VPN"}</Button>}{online && !isDisabled && <Button size="sm" variant="ghost" disabled={isDisconnecting} onClick={() => disconnect.mutate({ nasId: view.nasId })}>{isDisconnecting ? "جارٍ…" : "فصل مؤقت"}</Button>}</div></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </DashboardLayout>
  );
}
