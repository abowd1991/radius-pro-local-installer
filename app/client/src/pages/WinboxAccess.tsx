import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Monitor,
  Wifi,
  WifiOff,
  Copy,
  Check,
  Power,
  PowerOff,
  RefreshCw,
  Globe,
  Network,
  ExternalLink,
  Shield,
  Info,
  Loader2,
  Save,
} from "lucide-react";

export default function WinboxAccess() {
  const { language, direction } = useLanguage();
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [savingPortId, setSavingPortId] = useState<number | null>(null);
  // Local port values per device: { [nasId]: portNumber }
  const [localPorts, setLocalPorts] = useState<Record<number, number>>({});
  const { data: publicAddress } = trpc.winbox.getPublicAddress.useQuery();
  const domain = publicAddress?.address ?? "عنوان VPS غير مهيأ";

  const { data: devices, isLoading, refetch } = trpc.winbox.getMyNasDevices.useQuery(undefined, {
    onSuccess: (data: any[]) => {
      // Initialize local ports from server data (only if not already set by user)
      setLocalPorts(prev => {
        const next = { ...prev };
        for (const d of data) {
          if (!(d.id in next)) {
            next[d.id] = d.mikrotikWinboxPort ?? 8291;
          }
        }
        return next;
      });
    }
  } as any);

  const updatePortMutation = trpc.winbox.updateMikrotikWinboxPort.useMutation({
    onSuccess: (data) => {
      toast.success(language === "ar" ? `✅ تم حفظ البورت ${data.mikrotikPort}` : `✅ Port ${data.mikrotikPort} saved`);
      setSavingPortId(null);
      refetch();
    },
    onError: (err) => {
      toast.error(language === "ar" ? `❌ فشل حفظ البورت: ${err.message}` : `❌ Failed to save port: ${err.message}`);
      setSavingPortId(null);
    },
  });

  const enableMutation = trpc.winbox.enableForward.useMutation({
    onSuccess: (data) => {
      toast.success(language === "ar" ? `✅ تم تفعيل Winbox — اتصل عبر ${domain}:${data.port}` : `✅ Winbox Enabled — Connect via ${domain}:${data.port}`);
      refetch();
      setLoadingId(null);
    },
    onError: (err) => {
      toast.error(language === "ar" ? `❌ فشل التفعيل: ${err.message}` : `❌ Enable Failed: ${err.message}`);
      setLoadingId(null);
    },
  });

  const disableMutation = trpc.winbox.disableForward.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "✅ تم إيقاف Winbox بنجاح" : "✅ Winbox Disabled");
      refetch();
      setLoadingId(null);
    },
    onError: (err) => {
      toast.error(language === "ar" ? `❌ فشل الإيقاف: ${err.message}` : `❌ Disable Failed: ${err.message}`);
      setLoadingId(null);
    },
  });

  const handleCopy = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast(language === "ar" ? `تم النسخ: ${text}` : `Copied: ${text}`);
  };

  const handleToggle = (device: any) => {
    setLoadingId(device.id);
    if (device.winboxEnabled) {
      disableMutation.mutate({ nasId: device.id });
    } else {
      // Save port first if changed, then enable
      const currentPort = localPorts[device.id] ?? 8291;
      const serverPort = device.mikrotikWinboxPort ?? 8291;
      if (currentPort !== serverPort) {
        // Port changed - save it then enable
        updatePortMutation.mutate(
          { nasId: device.id, mikrotikPort: currentPort },
          { onSuccess: () => enableMutation.mutate({ nasId: device.id }) }
        );
      } else {
        enableMutation.mutate({ nasId: device.id });
      }
    }
  };

  const handleSavePort = (device: any) => {
    const newPort = localPorts[device.id] ?? 8291;
    setSavingPortId(device.id);
    updatePortMutation.mutate({ nasId: device.id, mikrotikPort: newPort });
  };

  const ar = language === "ar";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Monitor className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {ar ? "Winbox عن بُعد" : "Winbox Remote Access"}
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {ar
              ? "الوصول إلى أجهزة MikroTik الخاصة بك من أي مكان في العالم عبر Winbox"
              : "Access your MikroTik devices from anywhere in the world via Winbox"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""} ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
          {ar ? "تحديث" : "Refresh"}
        </Button>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-semibold mb-1">
              {ar ? "كيف يعمل؟" : "How does it work?"}
            </p>
            <p>
              {ar
                ? `عند تفعيل Winbox لجهاز ما، يقوم السيرفر بإنشاء توجيه TCP تلقائي من ${domain}:PORT إلى عنوان الجهاز داخل شبكة VPN. افتح Winbox وأدخل ${domain}:PORT للاتصال.`
                : `When you enable Winbox for a device, the server creates an automatic TCP forward from ${domain}:PORT to the device's VPN address. Open Winbox and enter ${domain}:PORT to connect.`}
            </p>
          </div>
        </div>
      </div>

      {/* Devices Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !devices || devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <Network className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">
            {ar ? "لا توجد أجهزة NAS" : "No NAS Devices"}
          </h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            {ar
              ? "أضف جهاز NAS أولاً من صفحة الأجهزة حتى تتمكن من تفعيل Winbox عن بُعد"
              : "Add a NAS device first from the Devices page to enable remote Winbox access"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(devices as any[]).map((device) => {
            const isEnabled = device.winboxEnabled;
            const hasPort = !!device.winboxPort;
            const hasVpnIp = !!device.vpnIp;
            const isLoading2 = loadingId === device.id;
            const isSavingPort = savingPortId === device.id;
            const connectionString = hasPort ? `${domain}:${device.winboxPort}` : null;
            const localPort = localPorts[device.id] ?? device.mikrotikWinboxPort ?? 8291;
            const serverPort = device.mikrotikWinboxPort ?? 8291;
            const portChanged = localPort !== serverPort;

            return (
              <Card
                key={device.id}
                className={`relative overflow-hidden transition-all duration-200 ${
                  isEnabled
                    ? "border-green-500/30 shadow-green-500/5 shadow-lg"
                    : "border-border"
                }`}
              >
                {/* Status indicator strip */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${
                    isEnabled ? "bg-green-500" : "bg-muted"
                  }`}
                />

                <CardHeader className="pb-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isEnabled
                            ? "bg-green-500/10 text-green-500"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Monitor className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{device.name}</CardTitle>
                        <CardDescription className="text-xs truncate">{device.nasname}</CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant={isEnabled ? "default" : "secondary"}
                      className={`shrink-0 text-xs ${
                        isEnabled
                          ? "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20"
                          : ""
                      }`}
                    >
                      {isEnabled ? (
                        <><Wifi className="h-3 w-3 mr-1" />{ar ? "نشط" : "Active"}</>
                      ) : (
                        <><WifiOff className="h-3 w-3 mr-1" />{ar ? "معطّل" : "Inactive"}</>
                      )}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* VPN IP */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      {ar ? "IP الـ VPN" : "VPN IP"}
                    </span>
                    <span className={`font-mono text-xs px-2 py-0.5 rounded ${hasVpnIp ? "bg-muted" : "text-muted-foreground"}`}>
                      {device.vpnIp || (ar ? "غير متصل" : "Not connected")}
                    </span>
                  </div>

                  {/* MikroTik Winbox Port Field */}
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      {ar ? "بورت Winbox على الجهاز" : "Winbox Port on Device"}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={localPort}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1 && val <= 65535) {
                            setLocalPorts(prev => ({ ...prev, [device.id]: val }));
                          }
                        }}
                        className="h-8 text-sm font-mono"
                        placeholder="8291"
                      />
                      {/* Show save button only if port changed and Winbox is already enabled */}
                      {isEnabled && portChanged && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 shrink-0 text-xs"
                          disabled={isSavingPort}
                          onClick={() => handleSavePort(device)}
                        >
                          {isSavingPort ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <><Save className="h-3.5 w-3.5 mr-1" />{ar ? "تحديث" : "Update"}</>
                          )}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ar
                        ? "الافتراضي 8291 — غيّره إذا عدّلت بورت Winbox في MikroTik"
                        : "Default 8291 — change if you modified Winbox port in MikroTik"}
                    </p>
                  </div>

                  {/* Winbox Connection String */}
                  {connectionString && (
                    <div className="rounded-lg border bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {ar ? "عنوان الاتصال (Winbox)" : "Connection Address (Winbox)"}
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm font-mono font-bold text-foreground truncate">
                          {connectionString}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => handleCopy(connectionString, device.id)}
                        >
                          {copiedId === device.id ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Port info when not enabled */}
                  {!connectionString && isEnabled && (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30 p-3 text-xs text-yellow-700 dark:text-yellow-300">
                      {ar ? "جاري تخصيص المنفذ..." : "Allocating port..."}
                    </div>
                  )}

                  {/* No VPN warning */}
                  {!hasVpnIp && !isEnabled && (
                    <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-3 text-xs text-orange-700 dark:text-orange-300">
                      {ar
                        ? "⚠️ الجهاز غير متصل بـ VPN. يجب الاتصال أولاً لتفعيل Winbox."
                        : "⚠️ Device not connected to VPN. Connect first to enable Winbox."}
                    </div>
                  )}

                  {/* Toggle Button */}
                  <Button
                    className={`w-full ${
                      isEnabled
                        ? "bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/20"
                        : "bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-500/20"
                    }`}
                    variant="ghost"
                    disabled={isLoading2 || (!hasVpnIp && !isEnabled)}
                    onClick={() => handleToggle(device)}
                  >
                    {isLoading2 ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : isEnabled ? (
                      <PowerOff className="h-4 w-4 mr-2" />
                    ) : (
                      <Power className="h-4 w-4 mr-2" />
                    )}
                    {isLoading2
                      ? (ar ? "جاري المعالجة..." : "Processing...")
                      : isEnabled
                      ? (ar ? "إيقاف Winbox" : "Disable Winbox")
                      : (ar ? "تفعيل Winbox" : "Enable Winbox")}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Download Winbox */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
              <ExternalLink className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">
                {ar ? "تحميل Winbox" : "Download Winbox"}
              </p>
              <p className="text-xs text-muted-foreground">
                {ar ? "برنامج إدارة MikroTik الرسمي" : "Official MikroTik management tool"}
              </p>
            </div>
          </div>
          <a
            href="https://mt.lv/winbox64"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              {ar ? "تحميل Winbox 64-bit" : "Download Winbox 64-bit"}
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
