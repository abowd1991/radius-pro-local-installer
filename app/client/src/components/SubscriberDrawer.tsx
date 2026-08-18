import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from '@/lib/dateFormat';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  Shield,
  Network,
  Calendar,
  ArrowDownUp,
  History,
  Loader2,
  Hash,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";

interface SubscriberDrawerProps {
  open: boolean;
  onClose: () => void;
  subscriber: {
    id: number;
    username: string;
    fullName: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    nationalId?: string | null;
    notes?: string | null;
    status: string;
    planId: number;
    nasId?: number | null;
    ipAssignmentType: string;
    staticIp?: string | null;
    simultaneousUse?: number | null;
    macAddress?: string | null;
    macBindingEnabled?: boolean | null;
    subscriptionStartDate?: string | Date | null;
    subscriptionEndDate?: string | Date | null;
    createdAt?: string | Date | null;
  } | null;
  planName?: string;
  nasName?: string;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}س ${m}د`;
  return `${m}د`;
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return formatDateTime(date);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "نشط", className: "bg-emerald-500/15 text-emerald-600 border-emerald-200" },
    suspended: { label: "موقوف", className: "bg-amber-500/15 text-amber-600 border-amber-200" },
    expired: { label: "منتهي", className: "bg-red-500/15 text-red-600 border-red-200" },
    pending: { label: "معلق", className: "bg-slate-500/15 text-slate-600 border-slate-200" },
  };
  const s = map[status] || { label: status, className: "bg-slate-100 text-slate-600" };
  return <Badge variant="outline" className={`text-xs font-medium ${s.className}`}>{s.label}</Badge>;
}

export function SubscriberDrawer({ open, onClose, subscriber, planName, nasName }: SubscriberDrawerProps) {
  const [activeTab, setActiveTab] = useState("info");
  const [showPassword, setShowPassword] = useState(false);

  const { data: credentials } = trpc.subscribers.getCredentials.useQuery(
    { id: subscriber?.id ?? 0 },
    { enabled: open && !!subscriber?.id }
  );

  const { data: activeSession, isLoading: sessionLoading } = trpc.subscribers.getActiveSession.useQuery(
    { username: subscriber?.username ?? "" },
    { enabled: open && !!subscriber?.username, refetchInterval: 120000, refetchIntervalInBackground: false, staleTime: 60000 }
  );

  const { data: sessions, isLoading: sessionsLoading } = trpc.subscribers.getSessions.useQuery(
    { username: subscriber?.username ?? "", limit: 20 },
    { enabled: open && !!subscriber?.username && activeTab === "sessions" }
  );

  const { data: payments, isLoading: paymentsLoading } = trpc.subscribers.getPaymentHistory.useQuery(
    { id: subscriber?.id ?? 0 },
    { enabled: open && !!subscriber?.id && activeTab === "payments" }
  );

  if (!subscriber) return null;

  const isOnline = !!activeSession;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-xl p-0 flex flex-col overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-l from-primary/5 to-transparent shrink-0">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-xl font-bold truncate">{subscriber.fullName}</SheetTitle>
              <p className="text-sm text-muted-foreground font-mono mt-0.5">{subscriber.username}</p>
              <div className="flex items-center gap-2 mt-2">
                <StatusBadge status={subscriber.status} />
                {isOnline ? (
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-200 text-xs gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    متصل الآن
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-slate-100 text-slate-500 text-xs gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                    غير متصل
                  </Badge>
                )}
              </div>
            </div>
          </div>

            {/* Credentials Box */}
          {credentials && (
            <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                بيانات الاتصال
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">اسم المستخدم</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono font-semibold flex-1 truncate" dir="ltr">{credentials.username}</span>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => { navigator.clipboard.writeText(credentials.username); toast.success('تم نسخ اسم المستخدم'); }}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">كلمة المرور</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono font-semibold flex-1 truncate" dir="ltr">
                      {showPassword ? credentials.password : '••••••••'}
                    </span>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => { navigator.clipboard.writeText(credentials.password); toast.success('تم نسخ كلمة المرور'); }}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

            {/* Active session quick info */}
          {isOnline && activeSession && (
            <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">IP الحالي</p>
                <p className="text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-400">{activeSession.framedipaddress || "—"}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">نوع الاتصال</p>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {activeSession.nasporttype === 'PPPoE' || activeSession.nasporttype === 'Virtual' || activeSession.servicetype === 'Framed-User' ? 'PPPoE' : (activeSession.nasporttype || 'PPPoE')}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">مدة الجلسة</p>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{formatDuration(activeSession.acctsessiontime)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">الاستهلاك</p>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatBytes((activeSession.acctinputoctets ?? 0) + (activeSession.acctoutputoctets ?? 0))}
                </p>
              </div>
            </div>
          )}
        </SheetHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 shrink-0 grid grid-cols-3 h-10">
            <TabsTrigger value="info" className="text-xs gap-1.5">
              <User className="w-3.5 h-3.5" />
              المعلومات
            </TabsTrigger>
            <TabsTrigger value="sessions" className="text-xs gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              الجلسات
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs gap-1.5">
              <History className="w-3.5 h-3.5" />
              الدفعات
            </TabsTrigger>
          </TabsList>

          {/* INFO TAB */}
          <TabsContent value="info" className="flex-1 overflow-y-auto px-6 pb-6 mt-4 space-y-4">
            {/* Personal Info */}
            <Card className="border-0 shadow-sm bg-card/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4" />
                  البيانات الشخصية
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {[
                  { icon: User, label: "الاسم الكامل", value: subscriber.fullName },
                  { icon: Phone, label: "الهاتف", value: subscriber.phone },
                  { icon: MapPin, label: "العنوان", value: subscriber.address },
                ].map(({ icon: Icon, label, value }) => (
                  value ? (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium">{value}</p>
                      </div>
                    </div>
                  ) : null
                ))}
                {subscriber.notes && (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    {subscriber.notes}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Service Info */}
            <Card className="border-0 shadow-sm bg-card/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <Wifi className="w-4 h-4" />
                  معلومات الخدمة
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {[
                  { icon: CreditCard, label: "الباقة", value: planName },
                  { icon: Network, label: "NAS", value: nasName },
                  { icon: Shield, label: "تعيين IP", value: subscriber.ipAssignmentType === "static" ? `ثابت: ${subscriber.staticIp}` : "ديناميكي" },
                  { icon: Activity, label: "الجلسات المتزامنة", value: subscriber.simultaneousUse?.toString() },
                  { icon: Network, label: "MAC Binding", value: subscriber.macBindingEnabled ? `مفعّل: ${subscriber.macAddress}` : "غير مفعّل" },
                ].map(({ icon: Icon, label, value }) => (
                  value ? (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium">{value}</p>
                      </div>
                    </div>
                  ) : null
                ))}
              </CardContent>
            </Card>

            {/* Subscription Dates */}
            <Card className="border-0 shadow-sm bg-card/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  الاشتراك
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {[
                  { label: "بداية الاشتراك", value: formatDate(subscriber.subscriptionStartDate) },
                  { label: "نهاية الاشتراك", value: formatDate(subscriber.subscriptionEndDate) },
                  { label: "تاريخ الإنشاء", value: formatDate(subscriber.createdAt) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="text-sm font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SESSIONS TAB */}
          <TabsContent value="sessions" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            {sessionsLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !sessions || sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                <WifiOff className="w-8 h-8 opacity-40" />
                <p className="text-sm">لا توجد جلسات مسجلة</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session: any, i: number) => {
                  const isAccountingOpen = !session.acctstoptime;
                  return (
                    <div key={i} className={`rounded-xl border p-4 space-y-3 ${isAccountingOpen ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20" : "border-border bg-card/50"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isAccountingOpen ? (
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-400" />
                          )}
                          <span className="text-sm font-mono font-semibold">{session.framedipaddress || "—"}</span>
                        </div>
                        <Badge variant="outline" className={`text-xs ${isAccountingOpen ? "border-amber-300 text-amber-600" : "text-muted-foreground"}`}>
                          {isAccountingOpen ? "سجل محاسبة مفتوح" : "منتهية"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">بداية الجلسة</p>
                          <p className="font-medium">{formatDate(session.acctstarttime)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">المدة</p>
                          <p className="font-medium">{formatDuration(session.acctsessiontime)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground flex items-center gap-1"><ArrowDownUp className="w-3 h-3" />تحميل</p>
                          <p className="font-medium">{formatBytes(session.acctoutputoctets)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground flex items-center gap-1"><ArrowDownUp className="w-3 h-3" />رفع</p>
                          <p className="font-medium">{formatBytes(session.acctinputoctets)}</p>
                        </div>
                        {session.nasipaddress && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground">NAS IP</p>
                            <p className="font-mono font-medium">{session.nasipaddress}</p>
                          </div>
                        )}
                        {session.acctterminatecause && (
                          <div className="col-span-2">
                            <p className="text-muted-foreground">سبب الإنهاء</p>
                            <p className="font-medium">{session.acctterminatecause}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* PAYMENTS TAB */}
          <TabsContent value="payments" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            {paymentsLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !payments || payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                <History className="w-8 h-8 opacity-40" />
                <p className="text-sm">لا توجد دفعات مسجلة</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((p: any) => (
                  <div key={p.id} className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{p.planName}</span>
                      <span className="text-sm font-bold text-primary">{p.amount} {p.currency}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">من</p>
                        <p className="font-medium">{formatDate(p.startDate)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">إلى</p>
                        <p className="font-medium">{formatDate(p.endDate)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">طريقة الدفع</p>
                        <p className="font-medium capitalize">{p.paymentMethod}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">الحالة</p>
                        <Badge variant="outline" className={`text-xs ${p.status === "active" ? "border-emerald-300 text-emerald-600" : "text-muted-foreground"}`}>
                          {p.status === "active" ? "نشط" : p.status === "expired" ? "منتهي" : p.status}
                        </Badge>
                      </div>
                    </div>
                    {p.notes && (
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">{p.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
