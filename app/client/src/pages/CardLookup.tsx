import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from '@/lib/dateFormat';
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { dateTimeLocalToUtcIso } from "@/lib/timezoneV6";
import { toast } from "sonner";
import {
  Search,
  Wifi,
  WifiOff,
  Clock,
  Download,
  Upload,
  Activity,
  Calendar,
  LogIn,
  LogOut,
  RefreshCw,
  AlertCircle,
  Smartphone,
  Pencil,
  Copy,
  Check,
  Ban,
  RotateCcw,
  Network,
  Zap,
  Tag,
  Lock,
  User,
  Settings2,
  CalendarClock,
  Gauge,
} from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────
function formatHoursMinutes(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return { h, m };
}

export default function CardLookup() {
  const { timezone } = useTimezoneV6();
  const [searchInput, setSearchInput] = useState("");
  const [searchUsername, setSearchUsername] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Dialogs
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [showSpeedDialog, setShowSpeedDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showRenewDialog, setShowRenewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Renew form — budget (session time) hours + minutes
  const [renewHours, setRenewHours] = useState("1");
  const [renewMinutes, setRenewMinutes] = useState("0");
  // Renew form — window (validity from first use) hours + minutes
  const [renewWindowHours, setRenewWindowHours] = useState("24");
  const [renewWindowMinutes, setRenewWindowMinutes] = useState("0");
  const [downloadSpeed, setDownloadSpeed] = useState("10");
  const [uploadSpeed, setUploadSpeed] = useState("5");

  // Edit form state
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPlanId, setEditPlanId] = useState<number | null>(null);
  const [editExpiryType, setEditExpiryType] = useState<string>("keep");
  const [editExpiryDate, setEditExpiryDate] = useState("");
  const [editSimUse, setEditSimUse] = useState("1");
  const [editNotes, setEditNotes] = useState("");

  const { data, isLoading, error, refetch } = trpc.sessions.getCardLookup.useQuery(
    { username: searchUsername },
    { enabled: !!searchUsername, retry: false }
  );

  // Plans for edit dialog
  const { data: plansList } = trpc.plans.list.useQuery(undefined, {
    enabled: showEditDialog,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const disconnectMutation = trpc.sessions.coaDisconnect.useMutation({
    onSuccess: (result) => {
      if (result.success) toast.success("أكد NAS طلب الفصل؛ ستختفي الجلسة عند وصول Accounting Stop");
      else toast.warning(result.message || "لم يؤكد NAS الفصل؛ ما زالت الجلسة نشطة");
      setShowDisconnectDialog(false);
      setTimeout(() => refetch(), 5000);
    },
    onError: (err) => { toast.error(err.message || "فشل قطع الاتصال"); setShowDisconnectDialog(false); },
  });

  const speedMutation = trpc.sessions.coaUpdateSession.useMutation({
    onSuccess: (result) => {
      if (result.success) toast.success("تم حفظ السرعة وإرسال CoA؛ يثبت التطبيق عند تأكيد NAS");
      else toast.warning(result.error || "لم يؤكد NAS تغيير السرعة");
      setShowSpeedDialog(false);
      setTimeout(() => refetch(), 5000);
    },
    onError: (err) => { toast.error(err.message || "فشل تغيير السرعة"); setShowSpeedDialog(false); },
  });

  const suspendMutation = trpc.vouchers.suspend.useMutation({
    onSuccess: () => { toast.success("تم تعطيل الكرت بنجاح"); setShowDisableDialog(false); refetch(); },
    onError: (err) => { toast.error(err.message || "فشل تعطيل الكرت"); setShowDisableDialog(false); },
  });

  const unsuspendMutation = trpc.vouchers.unsuspend.useMutation({
    onSuccess: () => { toast.success("تم إعادة تفعيل الكرت بنجاح"); refetch(); },
    onError: (err) => { toast.error(err.message || "فشل تفعيل الكرت"); },
  });

  const renewMutation = trpc.vouchers.renewCard.useMutation({
    onSuccess: () => {
      const h = parseInt(renewHours) || 0;
      const m = parseInt(renewMinutes) || 0;
      toast.success(`تم تجديد الكرت بنجاح: ${h > 0 ? h + " ساعة " : ""}${m > 0 ? m + " دقيقة" : ""}`);
      setShowRenewDialog(false);
      refetch();
    },
    onError: (err) => { toast.error(err.message || "فشل تجديد الكرت"); setShowRenewDialog(false); },
  });

  const updateCardMutation = trpc.vouchers.updateCard.useMutation({
    onSuccess: () => { toast.success("تم حفظ التعديلات بنجاح"); setShowEditDialog(false); refetch(); },
    onError: (err) => { toast.error(err.message || "فشل حفظ التعديلات"); },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed) setSearchUsername(trimmed);
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(`تم نسخ ${field === "username" ? "رقم الكرت" : "كلمة المرور"}`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { toast.error("فشل النسخ"); }
  };

  const handleDisconnect = () => {
    const sessionId = data?.activeSessions?.[0]?.sessionId;
    if (!sessionId) { toast.error("لا توجد جلسة نشطة قابلة للتحكم"); return; }
    disconnectMutation.mutate({ sessionId });
  };

  const handleSpeedChange = () => {
    const sessionId = data?.activeSessions?.[0]?.sessionId;
    const dl = Number(downloadSpeed);
    const ul = Number(uploadSpeed);
    if (!sessionId) { toast.error("لا توجد جلسة نشطة قابلة للتحكم"); return; }
    if (!Number.isFinite(dl) || !Number.isFinite(ul) || dl <= 0 || ul <= 0) {
      toast.error("أدخل سرعة تنزيل ورفع صحيحة");
      return;
    }
    speedMutation.mutate({ sessionId, downloadSpeed: dl, uploadSpeed: ul });
  };

  const handleDisable = () => {
    if (!data?.card.id) return;
    suspendMutation.mutate({ cardId: data.card.id });
  };

  const handleEnable = () => {
    if (!data?.card.id) return;
    unsuspendMutation.mutate({ cardId: data.card.id });
  };

  const handleRenew = () => {
    if (!data?.card.id) return;
    const h = parseInt(renewHours) || 0;
    const m = parseInt(renewMinutes) || 0;
    const totalSeconds = h * 3600 + m * 60;
    if (totalSeconds < 60) { toast.error("أدخل مدة صحيحة (دقيقة واحدة على الأقل)"); return; }
    const wh = parseInt(renewWindowHours) || 0;
    const wm = parseInt(renewWindowMinutes) || 0;
    const windowSec = wh * 3600 + wm * 60;
    renewMutation.mutate({
      cardId: data.card.id,
      renewType: "no_expiry",
      usageBudgetSeconds: totalSeconds,
      windowSeconds: windowSec > 0 ? windowSec : undefined,
    });
  };

  const openEditDialog = () => {
    if (!data?.card) return;
    setEditUsername(data.card.username);
    setEditPassword(data.card.password || "");
    setEditPlanId((data.card as any).planId ?? null);
    setEditExpiryType("keep");
    setEditExpiryDate("");
    setEditSimUse(String((data.card as any).simultaneousUse ?? 1));
    setEditNotes("");
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!data?.card.id || !editPlanId) { toast.error("يجب اختيار الخدمة"); return; }
    const expiryDate = editExpiryDate ? dateTimeLocalToUtcIso(editExpiryDate, timezone) : undefined;
    if (editExpiryDate && !expiryDate) { toast.error("تاريخ الانتهاء غير صالح في المنطقة الزمنية المحددة"); return; }
    updateCardMutation.mutate({
      cardId: data.card.id,
      username: editUsername,
      password: editPassword || undefined,
      planId: editPlanId,
      expiryType: editExpiryType as any,
      expiryDate,
      simultaneousUse: parseInt(editSimUse) || 1,
      notes: editNotes || undefined,
    });
  };

  // ── UI Helpers ─────────────────────────────────────────────────────────────
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "—";
    return formatDateTime(date);
  };

  const getStatusColor = (status: string | null | undefined) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-600 border-green-200";
      case "used": return "bg-blue-500/10 text-blue-600 border-blue-200";
      case "expired": return "bg-red-500/10 text-red-600 border-red-200";
      case "disabled": return "bg-gray-500/10 text-gray-600 border-gray-200";
      case "suspended": return "bg-orange-500/10 text-orange-600 border-orange-200";
      case "unused": return "bg-purple-500/10 text-purple-600 border-purple-200";
      default: return "bg-gray-500/10 text-gray-600 border-gray-200";
    }
  };

  const getStatusLabel = (status: string | null | undefined) => {
    switch (status) {
      case "active": return "نشط";
      case "used": return "مستخدم";
      case "expired": return "منتهي";
      case "disabled": return "معطل";
      case "suspended": return "موقوف";
      case "unused": return "غير مستخدم";
      default: return status || "غير معروف";
    }
  };

  const isSuspended = data?.card.status === "suspended";
  const isConnected = (data?.activeSessions?.length ?? 0) > 0;
  const activeSession = data?.activeSessions?.[0] ?? null;

  // Renew summary
  const renewH = parseInt(renewHours) || 0;
  const renewM = parseInt(renewMinutes) || 0;
  const renewTotalSec = renewH * 3600 + renewM * 60;
  const renewSummary = renewH > 0 && renewM > 0
    ? `${renewH} ساعة و${renewM} دقيقة`
    : renewH > 0 ? `${renewH} ساعة`
    : renewM > 0 ? `${renewM} دقيقة`
    : "—";

  // Current remaining
  const currentRemaining = data?.balance?.remainingUsageTime ?? 0;
  const { h: remH, m: remM } = formatHoursMinutes(currentRemaining);
  const remainingLabel = remH > 0 && remM > 0
    ? `${remH} ساعة و${remM} دقيقة`
    : remH > 0 ? `${remH} ساعة`
    : remM > 0 ? `${remM} دقيقة`
    : "—";

  // Window summary
  const renewWindowH = parseInt(renewWindowHours) || 0;
  const renewWindowM = parseInt(renewWindowMinutes) || 0;
  const renewWindowTotalSec = renewWindowH * 3600 + renewWindowM * 60;
  const renewWindowSummary = renewWindowH > 0 && renewWindowM > 0
    ? `${renewWindowH} ساعة و${renewWindowM} دقيقة`
    : renewWindowH > 0 ? `${renewWindowH} ساعة`
    : renewWindowM > 0 ? `${renewWindowM} دقيقة`
    : "—";

  // Current window remaining
  const currentWindowRemaining = data?.balance?.windowRemainingSeconds ?? 0;
  const { h: winRemH, m: winRemM } = formatHoursMinutes(currentWindowRemaining);
  const windowRemainingLabel = winRemH > 0 && winRemM > 0
    ? `${winRemH} ساعة و${winRemM} دقيقة`
    : winRemH > 0 ? `${winRemH} ساعة`
    : winRemM > 0 ? `${winRemM} دقيقة`
    : "—";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">بحث عن كرت</h1>
        <p className="text-muted-foreground mt-1">
          ابحث عن أي كرت لعرض تفاصيله الكاملة، الاستخدام، والجلسات
        </p>
      </div>

      {/* Search Form */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="أدخل رقم الكرت (مثال: 6812345)"
                className="pr-10 text-right"
                dir="ltr"
              />
            </div>
            <Button type="submit" disabled={isLoading || !searchInput.trim()}>
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Search className="h-4 w-4 ml-2" />
              )}
              بحث
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
            <div>
              <p className="font-medium text-destructive">لم يتم العثور على الكرت</p>
              <p className="text-sm text-muted-foreground mt-1">تأكد من رقم الكرت وحاول مجدداً</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Result */}
      {searchUsername && !isLoading && !error && !data && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <p className="text-yellow-700 dark:text-yellow-400">لا يوجد كرت بهذا الرقم في النظام</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-4">
          {/* Card Info + Online Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card Status + Actions */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">معلومات الكرت</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Status Badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={getStatusColor(data.card.status)}>
                    {getStatusLabel(data.card.status)}
                  </Badge>
                  {data.balance?.isExpired && (
                    <Badge variant="destructive" className="text-xs">منتهي الصلاحية</Badge>
                  )}
                  {isConnected && (
                    <Badge className="bg-green-500/10 text-green-600 border-green-200 text-xs">
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse ml-1" />
                      متصل الآن
                    </Badge>
                  )}
                </div>

                {/* Username + Copy */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">رقم الكرت:</span>
                  <span className="font-mono font-bold text-foreground text-sm">{data.card.username}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(data.card.username, "username")} title="نسخ رقم الكرت">
                    {copiedField === "username" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                </div>

                {/* Password + Copy */}
                {data.card.password && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">كلمة المرور:</span>
                    <span className="font-mono font-bold text-foreground text-sm">{data.card.password}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(data.card.password!, "password")} title="نسخ كلمة المرور">
                      {copiedField === "password" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                  </div>
                )}

                {/* Plan + Speed */}
                <div className="flex flex-wrap gap-4 pt-1">
                  {(data.card as any).planName && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Tag className="h-3.5 w-3.5" />
                      <span>الخطة:</span>
                      <span className="font-semibold text-foreground">{(data.card as any).planName}</span>
                    </div>
                  )}
                  {(data.card as any).mikrotikRateLimit && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Zap className="h-3.5 w-3.5 text-yellow-500" />
                      <span>السرعة:</span>
                      <span className="font-semibold text-foreground font-mono">{(data.card as any).mikrotikRateLimit}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {/* Edit — full edit dialog */}
                  <Button variant="outline" size="sm" className="text-xs gap-1.5"
                    onClick={openEditDialog}>
                    <Pencil className="h-3.5 w-3.5" />
                    تعديل
                  </Button>

                  {/* Disconnect — only if connected */}
                  {isConnected && (
                    <Button variant="outline" size="sm"
                      className="text-xs gap-1.5 border-sky-300 text-sky-700 hover:bg-sky-50"
                      onClick={() => setShowSpeedDialog(true)}>
                      <Gauge className="h-3.5 w-3.5" />
                      تغيير السرعة
                    </Button>
                  )}

                  {isConnected && (
                    <Button variant="outline" size="sm"
                      className="text-xs gap-1.5 border-orange-300 text-orange-600 hover:bg-orange-50"
                      onClick={() => setShowDisconnectDialog(true)}>
                      <WifiOff className="h-3.5 w-3.5" />
                      قطع الاتصال
                    </Button>
                  )}

                  {/* Disable / Enable */}
                  {isSuspended ? (
                    <Button variant="outline" size="sm"
                      className="text-xs gap-1.5 border-green-300 text-green-600 hover:bg-green-50"
                      onClick={handleEnable} disabled={unsuspendMutation.isPending}>
                      {unsuspendMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      تفعيل الكرت
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm"
                      className="text-xs gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => setShowDisableDialog(true)}>
                      <Ban className="h-3.5 w-3.5" />
                      تعطيل الكرت
                    </Button>
                  )}

                  {/* Renew */}
                  <Button variant="outline" size="sm"
                    className="text-xs gap-1.5 border-blue-300 text-blue-600 hover:bg-blue-50"
                    onClick={() => setShowRenewDialog(true)}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    تجديد الكرت
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Online Status + Remaining Time */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">حالة الاتصال</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <>
                        <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                        <Wifi className="h-5 w-5 text-green-500" />
                        <span className="font-semibold text-green-600">متصل الآن</span>
                      </>
                    ) : (
                      <>
                        <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
                        <WifiOff className="h-5 w-5 text-muted-foreground" />
                        <span className="font-semibold text-muted-foreground">غير متصل</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    عدد الجلسات الحية: <span className="font-bold text-foreground">{data.activeSessions?.length ?? 0}</span>
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">الوقت المتبقي</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.balance ? (
                    <>
                      <p className="text-lg font-bold text-foreground">
                        {data.balance.remainingUsageTimeFormatted || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        من أصل {data.balance.usageBudgetFormatted || "—"}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">لا توجد بيانات</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Usage Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                إحصائيات الاستخدام
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Clock className="h-3.5 w-3.5" />الوقت المستهلك
                  </div>
                  <p className="font-semibold text-foreground">{data.usage?.totalUsedTimeFormatted || "0 ثانية"}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Download className="h-3.5 w-3.5 text-blue-500" />تنزيل
                  </div>
                  <p className="font-semibold text-foreground">{data.usage?.totalOutputFormatted || "0 B"}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Upload className="h-3.5 w-3.5 text-orange-500" />رفع
                  </div>
                  <p className="font-semibold text-foreground">{data.usage?.totalInputFormatted || "0 B"}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Calendar className="h-3.5 w-3.5" />انتهاء الصلاحية
                  </div>
                  <p className="font-semibold text-foreground text-xs">
                    {data.balance?.windowEndTime
                      ? formatDate(data.balance.windowEndTime)
                      : data.card.firstUseAt ? "لم يُستخدم بعد" : "—"}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              {data.balance && data.balance.usageBudgetSeconds > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>نسبة الاستهلاك</span>
                    <span>{Math.min(100, Math.round((data.balance.usedTime / data.balance.usageBudgetSeconds) * 100))}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${data.balance.isExpired ? "bg-destructive" : data.balance.usedTime / data.balance.usageBudgetSeconds > 0.8 ? "bg-orange-500" : "bg-primary"}`}
                      style={{ width: `${Math.min(100, (data.balance.usedTime / data.balance.usageBudgetSeconds) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />التواريخ
              </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">تاريخ الإنشاء</p>
                  <p className="font-medium">{formatDate(data.card.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">أول استخدام</p>
                  <p className="font-medium">{formatDate(data.card.firstUseAt)}</p>
                </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">انتهاء النافذة</p>
                    <p className="font-medium">{formatDate(data.balance?.windowEndTime)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1 flex items-center gap-1">
                      نهاية صلاحية الكرت
                      {data.card.isManual && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">كرت يدوي</span>}
                    </p>
                    <p className="font-medium">{data.card.expiresAt ? formatDate(data.card.expiresAt) : "غير محددة"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">المتبقي من الصلاحية</p>
                    <p className="font-medium">{data.balance?.windowRemainingFormatted || "—"}</p>
                  </div>
              </div>
            </CardContent>
          </Card>

          {/* Session History */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                سجل الجلسات
                <Badge variant="secondary" className="text-xs">{data.sessions.length} جلسة</Badge>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs">
                <RefreshCw className="h-3.5 w-3.5 ml-1" />تحديث
              </Button>
            </CardHeader>
            <CardContent>
              {data.sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>لا توجد جلسات مسجلة</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">الشبكة</TableHead>
                        <TableHead className="text-right">وقت الدخول</TableHead>
                        <TableHead className="text-right">وقت الخروج</TableHead>
                        <TableHead className="text-right">المدة</TableHead>
                        <TableHead className="text-right">تنزيل</TableHead>
                        <TableHead className="text-right">رفع</TableHead>
                        <TableHead className="text-right">IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.sessions.map((session: typeof data.sessions[0], idx: number) => (
                        <TableRow key={session.acctSessionId || idx}>
                          <TableCell>
                            {session.isLiveSession ? (
                              <div className="flex items-center gap-1.5">
                                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-xs text-green-600 font-medium">متصل</span>
                              </div>
                            ) : session.isAccountingOpenWithoutLiveSession ? (
                              <div className="flex items-center gap-1.5">
                                <div className="h-2 w-2 rounded-full bg-amber-400" />
                                <span className="text-xs text-amber-700 font-medium">سجل محاسبة غير متزامن</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <div className="h-2 w-2 rounded-full bg-gray-400" />
                                <span className="text-xs text-muted-foreground">منتهي</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1">
                              <Network className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">
                                {(session as any).nasShortname
                                  ? <>{(session as any).nasShortname} <span className="text-muted-foreground font-normal">({session.nasIp})</span></>
                                  : session.nasIp || "—"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1">
                              <LogIn className="h-3 w-3 text-green-500" />
                              {formatDate(session.startTime)}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {session.isLiveSession ? (
                              <span className="text-green-600 text-xs">جارٍ الآن</span>
                            ) : session.stopTime ? (
                              <div className="flex items-center gap-1">
                                <LogOut className="h-3 w-3 text-red-400" />
                                {formatDate(session.stopTime)}
                              </div>
                            ) : (
                              <span className="text-amber-700 text-xs">غير متزامن</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{session.sessionTimeFormatted}</TableCell>
                          <TableCell className="text-xs text-blue-600">
                            <div className="flex items-center gap-1">
                              <Download className="h-3 w-3" />{session.downloadFormatted}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-orange-600">
                            <div className="flex items-center gap-1">
                              <Upload className="h-3 w-3" />{session.uploadFormatted}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {session.framedIp || session.nasIp || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* MAC Address Summary */}
          {data.macAddresses && data.macAddresses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  الأجهزة المستخدمة
                  <Badge variant="secondary" className="text-xs">{data.macAddresses.length} جهاز</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">#</TableHead>
                        <TableHead className="text-right">MAC Address</TableHead>
                        <TableHead className="text-right">عدد الجلسات</TableHead>
                        <TableHead className="text-right">آخر دخول</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.macAddresses.map((device: typeof data.macAddresses[0], idx: number) => (
                        <TableRow key={device.mac}>
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-mono text-xs font-medium">{device.mac}</TableCell>
                          <TableCell>
                            <Badge variant={device.sessionCount > 1 ? 'default' : 'secondary'} className="text-xs">
                              {device.sessionCount} جلسة
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {device.lastSeen ? formatDateTime(device.lastSeen) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ══ Change Speed Dialog — Sessions V2 ══ */}
      <Dialog open={showSpeedDialog} onOpenChange={setShowSpeedDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-sky-600" />تغيير سرعة الجلسة النشطة</DialogTitle>
            <DialogDescription>
              {activeSession ? `الجلسة ${activeSession.sessionId} — لا تعتبر العملية ناجحة إلا عند تأكيد NAS.` : "لا توجد جلسة نشطة"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5"><label className="text-sm">التنزيل (Mbps)</label><Input type="number" min="0.1" step="0.1" value={downloadSpeed} onChange={(e) => setDownloadSpeed(e.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-sm">الرفع (Mbps)</label><Input type="number" min="0.1" step="0.1" value={uploadSpeed} onChange={(e) => setUploadSpeed(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSpeedDialog(false)}>إلغاء</Button>
            <Button onClick={handleSpeedChange} disabled={!activeSession || speedMutation.isPending}>
              {speedMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Gauge className="h-4 w-4 ml-2" />}تطبيق السرعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Disconnect Dialog ══ */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WifiOff className="h-5 w-5 text-orange-500" />قطع الاتصال
            </DialogTitle>
            <DialogDescription>
              هل تريد قطع اتصال الكرت <span className="font-mono font-bold">{data?.card.username}</span> الآن؟
              <br />سيتم إرسال طلب CoA Disconnect للـ NAS.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-start">
            <Button variant="destructive" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
              {disconnectMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <WifiOff className="h-4 w-4 ml-2" />}
              قطع الاتصال
            </Button>
            <Button variant="outline" onClick={() => setShowDisconnectDialog(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Disable Dialog ══ */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" />تعطيل الكرت
            </DialogTitle>
            <DialogDescription>
              هل تريد تعطيل الكرت <span className="font-mono font-bold">{data?.card.username}</span>؟
              <br />سيُضاف <span className="font-mono">Auth-Type=Reject</span> في FreeRADIUS ولن يتمكن المستخدم من الاتصال.
              <br />يمكنك إعادة تفعيله لاحقاً.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-start">
            <Button variant="destructive" onClick={handleDisable} disabled={suspendMutation.isPending}>
              {suspendMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Ban className="h-4 w-4 ml-2" />}
              تعطيل الكرت
            </Button>
            <Button variant="outline" onClick={() => setShowDisableDialog(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Renew Dialog — hours + minutes ══ */}
      <Dialog open={showRenewDialog} onOpenChange={setShowRenewDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-500" />تجديد الكرت
            </DialogTitle>
            <DialogDescription>
              تجديد مدة الكرت <span className="font-mono font-bold">{data?.card.username}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* ميزانية الاستخدام (وقت الجلسة) */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-primary" />
                ميزانية الاستخدام (وقت الجلسة)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">ساعات</label>
                  <Input
                    type="number" min="0" max="9999"
                    value={renewHours}
                    onChange={(e) => setRenewHours(e.target.value)}
                    className="text-center" dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">دقائق</label>
                  <Input
                    type="number" min="0" max="59"
                    value={renewMinutes}
                    onChange={(e) => setRenewMinutes(e.target.value)}
                    className="text-center" dir="ltr"
                  />
                </div>
              </div>
              {renewTotalSec > 0 && (
                <p className="text-xs text-muted-foreground">
                  إجمالي: <strong>{renewSummary}</strong>
                </p>
              )}
              {data?.balance && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  المتبقي حالياً: <strong>{remainingLabel}</strong> — سيُضاف له تلقائياً
                </p>
              )}
            </div>

            {/* نافذة الصلاحية (من أول استخدام) */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4 text-orange-500" />
                نافذة الصلاحية (من أول استخدام)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">ساعات</label>
                  <Input
                    type="number" min="0" max="9999"
                    value={renewWindowHours}
                    onChange={(e) => setRenewWindowHours(e.target.value)}
                    className="text-center" dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">دقائق</label>
                  <Input
                    type="number" min="0" max="59"
                    value={renewWindowMinutes}
                    onChange={(e) => setRenewWindowMinutes(e.target.value)}
                    className="text-center" dir="ltr"
                  />
                </div>
              </div>
              {renewWindowTotalSec > 0 && (
                <p className="text-xs text-muted-foreground">
                  إجمالي: <strong>{renewWindowSummary}</strong>
                </p>
              )}
              {currentWindowRemaining > 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  المتبقي حالياً: <strong>{windowRemainingLabel}</strong>
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-start">
            <Button onClick={handleRenew} disabled={renewMutation.isPending || renewTotalSec < 60}
              className="bg-blue-600 hover:bg-blue-700">
              {renewMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <RotateCcw className="h-4 w-4 ml-2" />}
              تجديد
            </Button>
            <Button variant="outline" onClick={() => setShowRenewDialog(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Edit Card Dialog (full) ══ */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />تعديل الكرت
            </DialogTitle>
            <DialogDescription>
              تعديل بيانات الكرت: <span className="font-mono font-bold">{data?.card.username}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* بيانات الدخول */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Lock className="h-4 w-4 text-primary" />بيانات الدخول
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    اسم المستخدم <span className="text-destructive">*</span>
                  </label>
                  <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} dir="ltr" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    كلمة المرور <span className="text-muted-foreground">(اختياري)</span>
                  </label>
                  <Input
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="اتركه فارغاً للإبقاء"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* الخدمة والصلاحية */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-primary" />الخدمة والصلاحية
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    الخدمة <span className="text-destructive">*</span>
                  </label>
                  <Select
                    value={editPlanId ? String(editPlanId) : ""}
                    onValueChange={(v) => setEditPlanId(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الخدمة" />
                    </SelectTrigger>
                    <SelectContent>
                      {(plansList as any[] | undefined)?.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">نوع الصلاحية</label>
                  <Select value={editExpiryType} onValueChange={setEditExpiryType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">ابق التاريخ الحالي</SelectItem>
                      <SelectItem value="1week">أسبوع</SelectItem>
                      <SelectItem value="2weeks">أسبوعان</SelectItem>
                      <SelectItem value="1month">شهر</SelectItem>
                      <SelectItem value="3months">3 أشهر</SelectItem>
                      <SelectItem value="custom">تاريخ مخصص</SelectItem>
                      <SelectItem value="from_activation">من وقت التفعيل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editExpiryType === "custom" && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">تاريخ الانتهاء</label>
                  <Input type="datetime-local" value={editExpiryDate} onChange={(e) => setEditExpiryDate(e.target.value)} dir="ltr" />
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground block mb-1">عدد الأجهزة المتزامنة</label>
                <Input
                  type="number" min="1" max="100"
                  value={editSimUse}
                  onChange={(e) => setEditSimUse(e.target.value)}
                  className="w-24"
                  dir="ltr"
                />
              </div>
            </div>

            {/* ملاحظات */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-primary" />ملاحظات <span className="text-muted-foreground font-normal text-xs">(اختياري)</span>
              </div>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="أي ملاحظات إضافية..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-start">
            <Button onClick={handleSaveEdit} disabled={updateCardMutation.isPending || !editUsername || !editPlanId}>
              {updateCardMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <Check className="h-4 w-4 ml-2" />}
              حفظ التعديلات
            </Button>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
