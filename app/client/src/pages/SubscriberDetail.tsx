import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowRight,
  User,
  Phone,
  Mail,
  Wifi,
  WifiOff,
  Clock,
  Calendar,
  Activity,
  Download,
  Upload,
  Server,
  Shield,
  RefreshCw,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  MessageSquare,
  Key,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Network,
  Cpu,
  Globe,
  Zap,
  BarChart2,
  AlertCircle,
  CheckCircle,
  Info,
  Hash,
  Timer,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EditSubscriberDialog } from "@/components/EditSubscriberDialog";
import { formatDate, parseDbDate } from "@/lib/dateFormat";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";

// ── Design tokens (accent colors only — bg/card/text use Tailwind CSS vars) ──
const C = {
  primary: "#14B8A6",
  success: "#10B981",
  warning: "#F59E0B",
  danger:  "#EF4444",
  info:    "#2563EB",
  purple:  "#7C3AED",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}
function fmtDuration(seconds: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}س ${m}د`;
  return `${m}د`;
}
function formatRadacctTime(value: unknown): string {
  if (!value) return "—";
  const text = String(value).replace("T", " ");
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}، ${match[4]}` : text;
}
function getDaysRemaining(endDate: any): number | null {
  if (!endDate) return null;
  const end = parseDbDate(endDate) ?? new Date(endDate);
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function BigAvatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const colors = [C.primary, C.info, C.purple, C.success, C.warning];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  return (
    <div
      className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
      style={{ background: `${color}22`, color, border: `2px solid ${color}44` }}
    >
      {initials || "?"}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="rounded-xl p-4 flex items-start gap-3 bg-card border border-border">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xs mb-0.5 text-muted-foreground">{label}</div>
        <div className="text-base font-bold truncate text-foreground">{value}</div>
        {sub && <div className="text-xs mt-0.5 text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${mono ? "font-mono" : ""}`} style={{ color: "hsl(var(--foreground))" }} dir={mono ? "ltr" : undefined}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ── Copy Button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded transition-colors" style={{ color: copied ? C.success : "hsl(var(--muted-foreground))" }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// ── Timeline Item ─────────────────────────────────────────────────────────────
function TimelineItem({ log, isLast }: { log: any; isLast: boolean }) {
  const actionColors: Record<string, string> = {
    create: C.success, renew: C.primary, suspend: C.warning, activate: C.success,
    delete: C.danger, update: C.info, disconnect: C.warning, login: C.success, logout: "hsl(var(--muted-foreground))",
  };
  const actionIcons: Record<string, React.ElementType> = {
    create: CheckCircle, renew: RefreshCw, suspend: PowerOff, activate: Power,
    delete: Trash2, update: Pencil, disconnect: WifiOff, login: Wifi, logout: WifiOff,
  };
  const action = log.action?.toLowerCase() || "update";
  const color = actionColors[action] || "hsl(var(--muted-foreground))";
  const Icon = actionIcons[action] || Info;
  const actionLabels: Record<string, string> = {
    create: "إنشاء المشترك", renew: "تجديد الاشتراك", suspend: "إيقاف الاشتراك",
    activate: "تفعيل الاشتراك", delete: "حذف المشترك", update: "تعديل البيانات",
    disconnect: "فصل الاتصال", login: "تسجيل دخول", logout: "تسجيل خروج",
  };
  return (
    <div className="flex gap-3 relative">
      {/* Line */}
      {!isLast && (
        <div className="absolute right-[14px] top-7 bottom-0 w-px" style={{ background: `${"hsl(var(--border))"}` }} />
      )}
      {/* Icon */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 mt-0.5" style={{ background: `${color}22`, border: `1.5px solid ${color}44` }}>
        <Icon size={12} style={{ color }} />
      </div>
      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{actionLabels[action] || log.action}</span>
          <span className="text-xs flex-shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>{formatRadacctTime(log.createdAt)}</span>
        </div>
        {log.details && (
          <div className="text-xs mt-1 rounded px-2 py-1" style={{ background: "hsl(var(--background))", color: "hsl(var(--muted-foreground))" }}>
            {typeof log.details === "string" ? log.details : JSON.stringify(log.details).slice(0, 120)}
          </div>
        )}
        {log.errorMessage && (
          <div className="text-xs mt-1" style={{ color: C.danger }}>{log.errorMessage}</div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SubscriberDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const subscriberId = Number(id);

  const [sessionPage, setSessionPage] = useState(0);
  const SESSION_PAGE_SIZE = 10;
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [renewData, setRenewData] = useState({ months: 1, amount: 0, paymentMethod: "cash" as any, notes: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [isSmsOpen, setIsSmsOpen] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const { timezone: _timezone } = useTimezoneV6();

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: subData, isLoading, refetch } = trpc.subscribers.get.useQuery(
    { id: subscriberId },
    { enabled: !!subscriberId && !isNaN(subscriberId) }
  );
  const { data: sessions = [], isLoading: sessionsLoading } = trpc.subscribers.getSessions.useQuery(
    { username: subData?.subscriber?.username ?? "", limit: 100 },
    { enabled: !!subData?.subscriber?.username }
  );
  const { data: activeSession, refetch: refetchActiveSession } = trpc.subscribers.getActiveSession.useQuery(
    { username: subData?.subscriber?.username ?? "" },
    { enabled: !!subData?.subscriber?.username, refetchInterval: 15_000 }
  );
  const { data: payHistory = [] } = trpc.subscribers.getPaymentHistory.useQuery(
    { id: subscriberId },
    { enabled: !!subscriberId }
  );
  const { data: credentials } = trpc.subscribers.getCredentials.useQuery(
    { id: subscriberId },
    { enabled: showPassword && !!subscriberId }
  );
  const { data: activityLogs = [] } = trpc.subscribers.getActivityLog.useQuery(
    { subscriberId },
    { enabled: !!subscriberId }
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const suspendMutation = trpc.subscribers.suspend.useMutation({
    onSuccess: () => { toast.success("تم إيقاف المشترك"); refetch(); refetchActiveSession(); },
    onError: (e) => toast.error(e.message),
  });
  const activateMutation = trpc.subscribers.activate.useMutation({
    onSuccess: () => { toast.success("تم تفعيل المشترك"); refetch(); refetchActiveSession(); },
    onError: (e) => toast.error(e.message),
  });
  const disconnectMutation = trpc.subscribers.disconnect.useMutation({
    onSuccess: () => { toast.success("تم فصل الاتصال"); refetch(); refetchActiveSession(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.subscribers.delete.useMutation({
    onSuccess: () => { toast.success("تم حذف المشترك"); navigate("/subscribers"); },
    onError: (e) => toast.error(e.message),
  });
  const renewMutation = trpc.subscribers.renew.useMutation({
    onSuccess: () => { toast.success("تم تجديد الاشتراك"); setIsRenewOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const sendSmsMutation = trpc.subscribers.sendCustomSms.useMutation({
    onSuccess: () => { toast.success("تم إرسال الرسالة النصية"); setIsSmsOpen(false); setSmsMessage(""); },
    onError: (e) => toast.error(e.message),
  });

  // ── Derived ────────────────────────────────────────────────────────────────
  const sub = subData?.subscriber;
  const plan = subData?.plan;
  const nas = subData?.nas;

  const daysRemaining = getDaysRemaining(sub?.subscriptionEndDate);

  const totalDownload = useMemo(() => sessions.reduce((a: number, s: any) => a + (s.acctinputoctets || 0), 0), [sessions]);
  const totalUpload = useMemo(() => sessions.reduce((a: number, s: any) => a + (s.acctoutputoctets || 0), 0), [sessions]);
  const totalDuration = useMemo(() => sessions.reduce((a: number, s: any) => a + (s.acctsessiontime || 0), 0), [sessions]);

  const pagedSessions = sessions.slice(sessionPage * SESSION_PAGE_SIZE, (sessionPage + 1) * SESSION_PAGE_SIZE);
  const totalSessionPages = Math.ceil(sessions.length / SESSION_PAGE_SIZE);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      active:    { label: "نشط",    color: C.success },
      suspended: { label: "موقوف",  color: C.warning },
      expired:   { label: "منتهي",  color: C.danger  },
      pending:   { label: "معلق",   color: C.info    },
    };
    const s = map[status] || { label: status, color: "hsl(var(--muted-foreground))" };
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold"
        style={{ background: `${s.color}18`, color: s.color }}>
        {s.label}
      </span>
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(var(--background))" }}>
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: C.primary, borderTopColor: "transparent" }} />
          <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>جاري تحميل بيانات المشترك...</p>
        </div>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(var(--background))" }}>
        <div className="text-center space-y-4">
          <AlertCircle size={48} style={{ color: C.danger }} className="mx-auto" />
          <p className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>المشترك غير موجود</p>
          <Button onClick={() => navigate("/subscribers")} style={{ background: C.primary, color: "#fff" }}>
            العودة للقائمة
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-5 pb-10" style={{ background: "hsl(var(--background))", minHeight: "100%" }}>

        {/* ── Back + Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            style={{ color: "hsl(var(--muted-foreground))" }}
            onClick={() => navigate("/subscribers")}
          >
            <ArrowRight size={14} />
            المشتركون
          </Button>
          <span style={{ color: "hsl(var(--border))" }}>/</span>
          <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{sub.fullName}</span>
        </div>

        {/* ── Section 1: Profile Card ────────────────────────────────────────── */}
        <div className="rounded-xl p-5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            {/* Avatar + Name */}
            <div className="flex items-start gap-4">
              <BigAvatar name={sub.fullName} />
              <div className="min-w-0">
                <h1 className="text-xl font-bold" style={{ color: "hsl(var(--foreground))" }}>{sub.fullName}</h1>
                {/* Username + Password — prominent side by side */}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {/* Username box */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: `${C.primary}18`, border: `1px solid ${C.primary}35` }}>
                    <User size={13} style={{ color: C.primary }} />
                    <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>يوزر</span>
                    <span className="text-sm font-mono font-bold" style={{ color: "hsl(var(--foreground))" }} dir="ltr">{sub.username}</span>
                    <CopyBtn text={sub.username} />
                  </div>
                  {/* Password box */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: `${C.warning}18`, border: `1px solid ${C.warning}35` }}>
                    <Lock size={13} style={{ color: C.warning }} />
                    <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>باس</span>
                    {showPassword && credentials?.password ? (
                      <>
                        <span className="text-sm font-mono font-bold" style={{ color: "hsl(var(--foreground))" }} dir="ltr">{credentials.password}</span>
                        <CopyBtn text={credentials.password} />
                      </>
                    ) : (
                      <span className="text-sm font-mono tracking-widest" style={{ color: "hsl(var(--muted-foreground))" }}>••••••••</span>
                    )}
                    <button
                      className="flex items-center justify-center w-6 h-6 rounded transition-colors"
                      style={{ color: C.primary, background: `${C.primary}15` }}
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "إخفاء" : "إظهار"}
                    >
                      {showPassword ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {getStatusBadge(sub.status)}
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                    style={{ background: activeSession ? `${C.success}18` : `${"hsl(var(--muted-foreground))"}18`, color: activeSession ? C.success : "hsl(var(--muted-foreground))" }}
                  >
                    {activeSession ? <><Wifi size={10} /> متصل</> : <><WifiOff size={10} /> غير متصل</>}
                  </span>
                  {plan && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                      style={{ background: `${C.primary}18`, color: C.primary }}>
                      {plan.name}
                    </span>
                  )}
                </div>
                {/* Contact */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {sub.phone && (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      <Phone size={12} />{sub.phone}
                    </div>
                  )}
                  {sub.email && (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      <Mail size={12} />{sub.email}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    <Calendar size={12} />أُنشئ {formatDate(sub.createdAt)}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 sm:mr-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" className="gap-1.5 text-xs" style={{ background: C.primary, color: "#fff" }}
                    onClick={() => setIsRenewOpen(true)}>
                    <RefreshCw size={13} />تجديد
                  </Button>
                </TooltipTrigger>
                <TooltipContent>تجديد الاشتراك</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                    onClick={() => disconnectMutation.mutate({ id: sub.id })}
                    disabled={!activeSession}>
                    <WifiOff size={13} />فصل
                  </Button>
                </TooltipTrigger>
                <TooltipContent>فصل الاتصال الحالي</TooltipContent>
              </Tooltip>
              {sub.status === "active" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" style={{ borderColor: `${C.warning}44`, color: C.warning }}
                      onClick={() => suspendMutation.mutate({ id: sub.id })}>
                      <PowerOff size={13} />إيقاف
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>إيقاف الاشتراك</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs" style={{ borderColor: `${C.success}44`, color: C.success }}
                      onClick={() => activateMutation.mutate({ id: sub.id })}>
                      <Power size={13} />تفعيل
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>تفعيل الاشتراك</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" style={{ borderColor: `${C.danger}44`, color: C.danger }}
                    onClick={async () => { if (await window.confirmOperation("هل أنت متأكد من حذف هذا المشترك؟", "حذف المشترك")) deleteMutation.mutate({ id: sub.id }); }}>
                    <Trash2 size={13} />حذف
                  </Button>
                </TooltipTrigger>
                <TooltipContent>حذف المشترك نهائياً</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <EditSubscriberDialog
          key={editorKey}
          open
          inline
          subscriber={sub}
          onClose={() => setEditorKey((current) => current + 1)}
          onSuccess={() => refetch()}
        />

        {/* ── Section 2: Stats ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <StatCard
            label="الأيام المتبقية"
            value={daysRemaining === null ? "—" : daysRemaining <= 0 ? "منتهي" : `${daysRemaining} يوم`}
            icon={Clock}
            color={daysRemaining === null ? "hsl(var(--muted-foreground))" : daysRemaining <= 0 ? C.danger : daysRemaining <= 7 ? C.warning : C.success}
          />
          <StatCard label="عدد الجلسات" value={sessions.length} icon={Activity} color={C.info} />
          <StatCard
            label="آخر دخول"
            value={activeSession ? "الآن" : (sessions[0]?.acctstarttime ? formatDate(sessions[0].acctstarttime) : "—")}
            icon={Timer}
            color={C.primary}
          />
          <StatCard label="إجمالي التنزيل" value={fmtBytes(totalDownload)} icon={Download} color={C.success} />
          <StatCard label="إجمالي الرفع" value={fmtBytes(totalUpload)} icon={Upload} color={C.warning} />
          <StatCard label="إجمالي وقت الاستخدام" value={fmtDuration(totalDuration)} icon={Timer} color={C.purple} />
          <StatCard
            label="تاريخ الانتهاء"
            value={formatDate(sub.subscriptionEndDate) || "—"}
            icon={Calendar}
            color={C.info}
          />
        </div>

        {/* ── Sections 3+4 Grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Section 3: Network Info */}
          <div className="rounded-xl p-5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <div className="flex items-center gap-2 mb-4">
              <Network size={16} style={{ color: C.primary }} />
              <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>بيانات الشبكة</h2>
            </div>
            <div className="space-y-0">
              <InfoRow label="IP الحالي" value={activeSession?.framedipaddress || "—"} mono />
              <InfoRow label="آخر IP" value={sessions[0]?.framedipaddress || "—"} mono />
              <InfoRow label="MAC Address" value={sub.macAddress || "—"} mono />
              <InfoRow label="سرعة التنزيل" value={plan ? `${Math.round(plan.downloadSpeed / 1000)} Mbps` : "—"} />
              <InfoRow label="سرعة الرفع" value={plan ? `${Math.round(plan.uploadSpeed / 1000)} Mbps` : "—"} />
              <InfoRow label="NAS / Router" value={nas?.shortname || nas?.nasname || "—"} />
              <InfoRow label="نوع الاتصال" value={activeSession?.nasporttype || "PPPoE"} />
              <InfoRow label="نوع IP" value={sub.ipAssignmentType === "static" ? "ثابت" : "ديناميكي"} />
              {sub.ipAssignmentType === "static" && sub.staticIp && (
                <InfoRow label="IP الثابت" value={sub.staticIp} mono />
              )}
              <InfoRow label="جلسات متزامنة" value={`${sub.simultaneousUse || 1} جلسة`} />
            </div>
            {/* Password reveal */}
            <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${"hsl(var(--border))"}` }}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>كلمة المرور</span>
                <div className="flex items-center gap-2">
                  {showPassword && credentials?.password ? (
                    <>
                      <span className="text-sm font-mono" style={{ color: "hsl(var(--foreground))" }} dir="ltr">{credentials.password}</span>
                      <CopyBtn text={credentials.password} />
                    </>
                  ) : (
                    <span className="text-sm font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>••••••••</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    style={{ color: C.primary }}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <Key size={11} className="ml-1" />
                    {showPassword ? "إخفاء" : "إظهار"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3b: Subscription Info */}
          <div className="rounded-xl p-5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <div className="flex items-center gap-2 mb-4">
              <Shield size={16} style={{ color: C.info }} />
              <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>تفاصيل الاشتراك</h2>
            </div>
            <div className="space-y-0">
              <InfoRow label="الباقة" value={plan?.name || "—"} />
              <InfoRow label="الحالة" value={getStatusBadge(sub.status)} />
              <InfoRow label="تاريخ البداية" value={formatDate(sub.subscriptionStartDate) || "—"} />
              <InfoRow label="تاريخ الانتهاء" value={formatDate(sub.subscriptionEndDate) || "—"} />
              <InfoRow label="الأيام المتبقية" value={
                daysRemaining === null ? "—" :
                <span style={{ color: daysRemaining <= 0 ? C.danger : daysRemaining <= 7 ? C.warning : C.success }}>
                  {daysRemaining <= 0 ? "منتهي" : `${daysRemaining} يوم`}
                </span>
              } />
              <InfoRow label="تاريخ الإنشاء" value={formatDate(sub.createdAt)} />
              <InfoRow label="آخر تحديث" value={formatDate(sub.updatedAt)} />
              <InfoRow label="آخر دخول" value={formatDate(sub.lastLoginAt) || "—"} />
              <InfoRow label="الملاحظات" value={sub.notes || "—"} />
            </div>
            {/* Days progress bar */}
            {sub.subscriptionStartDate && sub.subscriptionEndDate && (
              <div className="mt-4">
                {(() => {
                  const start = (parseDbDate(sub.subscriptionStartDate) ?? new Date(sub.subscriptionStartDate)).getTime();
                  const end = (parseDbDate(sub.subscriptionEndDate) ?? new Date(sub.subscriptionEndDate)).getTime();
                  const now = Date.now();
                  const pct = Math.min(Math.max(Math.round(((now - start) / (end - start)) * 100), 0), 100);
                  return (
                    <>
                      <div className="flex justify-between text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                        <span>استهلاك الاشتراك</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
                        <div className="h-full rounded-full" style={{
                          width: `${pct}%`,
                          background: pct >= 90 ? C.danger : pct >= 70 ? C.warning : C.primary
                        }} />
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* ── Section 4: Sessions Table ──────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${"hsl(var(--border))"}` }}>
            <div className="flex items-center gap-2">
              <Activity size={16} style={{ color: C.primary }} />
              <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>آخر الجلسات</h2>
              <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: "hsl(var(--background))", color: "hsl(var(--muted-foreground))" }}>
                {sessions.length} جلسة
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: `${"hsl(var(--background))"}88` }}>
                  {["وقت البداية", "وقت النهاية", "المدة", "التنزيل", "الرفع", "IP", "NAS", "سبب الإنهاء"].map((h, i) => (
                    <th key={i} className="text-right px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessionsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderTop: "1px solid hsl(var(--border) / 0.13)" }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded animate-pulse" style={{ background: "hsl(var(--border))", width: "80px" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : pagedSessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>لا توجد جلسات مسجلة</td>
                  </tr>
                ) : (
                  pagedSessions.map((s: any, i: number) => {
                    const isAccountingOpen = !s.acctstoptime;
                    return (
                      <tr key={i} style={{ borderTop: "1px solid hsl(var(--border) / 0.13)" }}>
                        <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--foreground))" }}>{formatRadacctTime(s.acctstarttime)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {isAccountingOpen ? (
                            <span className="inline-flex items-center gap-1" style={{ color: C.warning }}>
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.warning }} />
                              سجل محاسبة مفتوح
                            </span>
                          ) : formatRadacctTime(s.acctstoptime)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>{fmtDuration(s.acctsessiontime)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.success }}>{fmtBytes(s.acctinputoctets)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.warning }}>{fmtBytes(s.acctoutputoctets)}</td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }} dir="ltr">{s.framedipaddress || "—"}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{s.nasipaddress || "—"}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{s.acctterminatecause || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalSessionPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: `1px solid ${"hsl(var(--border))"}` }}>
              <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                صفحة {sessionPage + 1} من {totalSessionPages}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "hsl(var(--muted-foreground))" }}
                  disabled={sessionPage === 0} onClick={() => setSessionPage(p => p - 1)}>
                  <ChevronRight size={14} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "hsl(var(--muted-foreground))" }}
                  disabled={sessionPage >= totalSessionPages - 1} onClick={() => setSessionPage(p => p + 1)}>
                  <ChevronLeft size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Section 5: Activity Timeline ──────────────────────────────────── */}
        <div className="rounded-xl p-5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 size={16} style={{ color: C.purple }} />
            <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>سجل النشاط</h2>
          </div>
          {activityLogs.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "hsl(var(--muted-foreground))" }}>لا يوجد سجل نشاط لهذا المشترك</p>
          ) : (
            <div className="space-y-0">
              {activityLogs.map((log: any, i: number) => (
                <TimelineItem key={log.id} log={log} isLast={i === activityLogs.length - 1} />
              ))}
            </div>
          )}
        </div>

        {/* ── Section 6: Quick Actions ───────────────────────────────────────── */}
        <div className="rounded-xl p-5" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} style={{ color: C.warning }} />
            <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>الإجراءات السريعة</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: "تجديد الاشتراك", icon: RefreshCw, color: C.primary, action: () => setIsRenewOpen(true) },
              { label: "إعادة تعيين كلمة المرور", icon: Key, color: C.warning, action: () => toast.info("ميزة قادمة قريباً") },
              { label: "إرسال SMS", icon: MessageSquare, color: C.success, action: () => { setSmsMessage(`مرحباً ${sub.fullName}، يرجى تجديد اشتراكك للحفاظ على استمرار الخدمة.`); setIsSmsOpen(true); } },
              {
                label: sub.status === "active" ? "تعليق الاشتراك" : "تفعيل الاشتراك",
                icon: sub.status === "active" ? PowerOff : Power,
                color: sub.status === "active" ? C.warning : C.success,
                action: () => sub.status === "active"
                  ? suspendMutation.mutate({ id: sub.id })
                  : activateMutation.mutate({ id: sub.id })
              },
              {
                label: "حذف المشترك",
                icon: Trash2,
                color: C.danger,
                action: async () => { if (await window.confirmOperation("هل أنت متأكد من حذف هذا المشترك نهائياً؟", "حذف المشترك")) deleteMutation.mutate({ id: sub.id }); }
              },
            ].map(({ label, icon: Icon, color, action }, i) => (
              <button
                key={i}
                onClick={action}
                disabled={false}
                className="flex items-center gap-3 p-3.5 rounded-xl text-right transition-all disabled:opacity-40"
                style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}44`)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "hsl(var(--border))")}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
                  <Icon size={15} style={{ color }} />
                </div>
                <span className="text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Renew Dialog ───────────────────────────────────────────────────── */}
        <Dialog open={isRenewOpen} onOpenChange={setIsRenewOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تجديد الاشتراك</DialogTitle>
              <DialogDescription>{sub.fullName} — {plan?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>مدة التجديد</Label>
                <Select value={String(renewData.months)} onValueChange={(v) => {
                  const months = Number(v);
                  setRenewData({ ...renewData, months, amount: Number(plan?.price || 0) * months });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 6, 12].map(n => (
                      <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "شهر" : "أشهر"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المبلغ</Label>
                <Input type="number" value={renewData.amount} dir="ltr"
                  onChange={e => setRenewData({ ...renewData, amount: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select value={renewData.paymentMethod} onValueChange={(v: any) => setRenewData({ ...renewData, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="wallet">محفظة</SelectItem>
                    <SelectItem value="card">بطاقة</SelectItem>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="online">أونلاين</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea value={renewData.notes} rows={2} placeholder="ملاحظات..."
                  onChange={e => setRenewData({ ...renewData, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRenewOpen(false)}>إلغاء</Button>
              <Button onClick={() => renewMutation.mutate({ id: sub.id, ...renewData })} disabled={renewMutation.isPending}>
                {renewMutation.isPending ? "جاري التجديد..." : "تجديد الاشتراك"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isSmsOpen} onOpenChange={setIsSmsOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إرسال SMS للمشترك</DialogTitle>
              <DialogDescription>{sub.fullName} — {sub.phone || "لا يوجد رقم هاتف"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSmsMessage(`مرحباً ${sub.fullName}، يرجى تجديد اشتراكك للحفاظ على استمرار الخدمة.`)}>طلب تجديد</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSmsMessage(`مرحباً ${sub.fullName}، نود تذكيرك بأن اشتراكك ينتهي بتاريخ ${formatDate(sub.subscriptionEndDate)}.`)}>تذكير بالانتهاء</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setSmsMessage(`مرحباً ${sub.fullName}، تم استلام دفعتك وتجديد اشتراكك بنجاح.`)}>تأكيد تجديد</Button>
              </div>
              <Textarea value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} rows={5} placeholder="اكتب رسالة مخصصة..." />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSmsOpen(false)}>إلغاء</Button>
              <Button disabled={!sub.phone || !smsMessage.trim() || sendSmsMutation.isPending} onClick={() => sendSmsMutation.mutate({ id: sub.id, message: smsMessage })}>
                {sendSmsMutation.isPending ? "جاري الإرسال..." : "إرسال الرسالة"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
