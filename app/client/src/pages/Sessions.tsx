import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatVpsTimeOnly as _fmtTimeOnly } from '@/lib/dateFormat';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  Download,
  Upload,
  Server,
  User,
  Globe,
  Activity,
  Zap,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  Network,
  Gauge,
  ChevronDown,
  Users,
  TrendingUp,
  Signal,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
  const b = Number(bytes) || 0;
  if (b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDuration(seconds: number | null | undefined): string {
  const s = Math.floor(Number(seconds) || 0);
  if (s <= 0) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatDurationAr(seconds: number | null | undefined): string {
  const s = Math.floor(Number(seconds) || 0);
  if (s <= 0) return "0 ث";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}س ${m}د`;
  if (m > 0) return `${m}د ${sec}ث`;
  return `${sec}ث`;
}

// Speed presets
const SPEED_PRESETS = [
  { label: "512 Kbps", download: 0.5, upload: 0.5 },
  { label: "1 Mbps", download: 1, upload: 1 },
  { label: "2 Mbps", download: 2, upload: 1 },
  { label: "4 Mbps", download: 4, upload: 2 },
  { label: "8 Mbps", download: 8, upload: 4 },
  { label: "10 Mbps", download: 10, upload: 5 },
  { label: "20 Mbps", download: 20, upload: 10 },
  { label: "50 Mbps", download: 50, upload: 25 },
  { label: "100 Mbps", download: 100, upload: 50 },
];

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  gradient,
  sub,
}: {
  icon: any;
  label: string;
  value: string | number;
  gradient: string;
  sub?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-5 text-white", gradient)}>
      {/* bg glow */}
      <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10 blur-xl" />
      <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-black/10 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-bold leading-none">{value}</p>
          {sub && <p className="text-white/60 text-xs mt-1">{sub}</p>}
        </div>
        <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({
  session,
  selected,
  onSelect,
  onDisconnect,
  onChangeSpeed,
  language,
}: {
  session: any;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onDisconnect: (s: any) => void;
  onChangeSpeed: (s: any) => void;
  language: string;
}) {
  const isAr = language === "ar";
  const sessionSecs = Number(session.sessionTime) || 0;
  const inputBytes = Number(session.inputOctets) || 0;
  const outputBytes = Number(session.outputOctets) || 0;
  const rawType = (session.serviceType || session.accttype || "").toLowerCase();
  const serviceType = rawType.includes("hotspot") ? "HOTSPOT" : "PPPoE";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200",
        selected
          ? "bg-primary/5 border-primary/30"
          : "bg-card border-border hover:border-primary/20 hover:bg-accent/30"
      )}
    >
      {/* Selection */}
      <Checkbox
        checked={selected}
        onCheckedChange={(c) => onSelect(session.id || session.sessionId, !!c)}
        className="shrink-0"
      />

      {/* Status dot */}
      <div className="relative shrink-0">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
        <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-40" />
      </div>

      {/* Username */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-mono text-sm font-semibold truncate">{session.username}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Globe className="h-3 w-3 text-muted-foreground/60" />
          <span className="font-mono text-xs text-muted-foreground">{session.framedIpAddress || "—"}</span>
        </div>
      </div>

      {/* NAS */}
      <div className="hidden md:flex flex-col items-start min-w-[100px]">
        <div className="flex items-center gap-1">
          <Server className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium truncate max-w-[90px]">
            {session.nasName || session.nasIpAddress}
          </span>
        </div>
        <Badge
          variant="outline"
          className={`mt-0.5 text-[10px] h-4 px-1.5 font-semibold ${
            serviceType === "HOTSPOT"
              ? "bg-orange-500/10 text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700"
              : "bg-blue-500/10 text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700"
          }`}
        >
          {serviceType}
        </Badge>
      </div>

      {/* Duration */}
      <div className="hidden sm:flex flex-col items-center min-w-[70px]">
        <div className="flex items-center gap-1 text-amber-500">
          <Timer className="h-3.5 w-3.5" />
          <span className="text-sm font-bold tabular-nums">
            {isAr ? formatDurationAr(sessionSecs) : formatDuration(sessionSecs)}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">{isAr ? "المدة" : "Duration"}</span>
      </div>

      {/* Download */}
      <div className="hidden lg:flex flex-col items-center min-w-[80px]">
        <div className="flex items-center gap-1 text-sky-500">
          <Download className="h-3.5 w-3.5" />
          <span className="text-sm font-semibold tabular-nums">{formatBytes(outputBytes)}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{isAr ? "تنزيل" : "Down"}</span>
      </div>

      {/* Upload */}
      <div className="hidden lg:flex flex-col items-center min-w-[80px]">
        <div className="flex items-center gap-1 text-orange-500">
          <Upload className="h-3.5 w-3.5" />
          <span className="text-sm font-semibold tabular-nums">{formatBytes(inputBytes)}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{isAr ? "رفع" : "Up"}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs gap-1.5 border-sky-500/30 text-sky-500 hover:bg-sky-500/10 hover:border-sky-500/60"
          onClick={() => onChangeSpeed(session)}
        >
          <Gauge className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{isAr ? "السرعة" : "Speed"}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/60"
          onClick={() => onDisconnect(session)}
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{isAr ? "فصل" : "Cut"}</span>
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Sessions() {
  const { user } = useAuth();
  const { language, direction } = useLanguage();
  const isAr = language === "ar";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false);
  const [isBulkDisconnectOpen, setIsBulkDisconnectOpen] = useState(false);
  const [isSpeedDialogOpen, setIsSpeedDialogOpen] = useState(false);
  const [newDownloadSpeed, setNewDownloadSpeed] = useState("");
  const [newUploadSpeed, setNewUploadSpeed] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [filterType, setFilterType] = useState<"all" | "ppp" | "hotspot">("all");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  const isSuperAdmin = user?.role === 'owner' || user?.role === 'super_admin';

  // ── Queries ──
  // For super admin: if a client is selected, fetch only their sessions
  const { data: allSessions, isLoading: allLoading, refetch: refetchAll } = trpc.sessions.list.useQuery(undefined, {
    // online_sessions صغيرة ومفهرسة؛ تحديث كل 5 ثوانٍ يعكس Start/Stop سريعاً
    // دون العودة إلى radacct أو إنشاء ضغط مرتفع على قاعدة البيانات.
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    staleTime: 30000,
    enabled: !selectedClientId,
  });

  const { data: clientSessions, isLoading: clientLoading, refetch: refetchClient } = trpc.sessions.listByClient.useQuery(
    { clientId: selectedClientId! },
    {
      refetchInterval: 5000,
      refetchIntervalInBackground: false,
      staleTime: 30000,
      enabled: !!selectedClientId,
    }
  );

  const sessions = selectedClientId ? clientSessions : allSessions;
  const isLoading = selectedClientId ? clientLoading : allLoading;
  const refetch = useCallback(() => {
    if (selectedClientId) refetchClient();
    else refetchAll();
  }, [selectedClientId, refetchClient, refetchAll]);

  // Fetch clients list for super admin
  const { data: clientsList } = trpc.users.getMyClients.useQuery(undefined, {
    enabled: isSuperAdmin,
  });

  const { data: stats, refetch: refetchStats } = trpc.sessions.getStats.useQuery(undefined, {
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
    staleTime: 60000,
  });

  // ── Mutations ──
  const coaDisconnect = trpc.sessions.coaDisconnect.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(isAr ? "✅ أكّد NAS طلب الفصل؛ ستختفي الجلسة عند وصول Accounting Stop" : "✅ NAS acknowledged disconnect; the session closes on Accounting Stop");
      } else {
        toast.warning(result.message || (isAr ? "لم يؤكد NAS الفصل؛ ما زالت الجلسة نشطة" : "NAS did not confirm disconnect; session remains active"));
      }
      setIsDisconnectDialogOpen(false);
      setSelectedSession(null);
      handleRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkDisconnect = trpc.sessions.bulkDisconnect.useMutation({
    onSuccess: (result) => {
      toast.success(
        isAr
          ? `✅ تم فصل ${result.successCount} من ${result.totalCount} مستخدم`
          : `✅ Disconnected ${result.successCount}/${result.totalCount} sessions`
      );
      setIsBulkDisconnectOpen(false);
      setSelectedIds(new Set());
      handleRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const coaUpdateSession = trpc.sessions.coaUpdateSession.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        const method = (result as any).method || '';
        if (method === 'api') {
          toast.success(isAr ? "⚡ تم تغيير السرعة فوراً عبر MikroTik API" : "⚡ Speed changed instantly via MikroTik API");
        } else if (method === 'coa_fallback' || method === 'coa') {
          toast.success(isAr ? "⚡ تم تغيير السرعة فوراً عبر CoA" : "⚡ Speed changed instantly via CoA");
        } else if (method === 'radreply_only') {
          toast.success(isAr ? "✅ تم حفظ السرعة - ستُطبق عند إعادة الاتصال" : "✅ Speed saved - will apply on next login");
        } else {
          toast.success(isAr ? "✅ تم تغيير السرعة بنجاح" : "✅ Speed changed successfully");
        }
      } else {
        toast.error(result.error || (isAr ? "فشل تغيير السرعة" : "Speed change failed"));
      }
      setIsSpeedDialogOpen(false);
      setSelectedSession(null);
      setNewDownloadSpeed("");
      setNewUploadSpeed("");
      setSelectedPreset("");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Handlers ──
  const handleRefresh = useCallback(() => {
    refetch();
    refetchStats();
    setLastRefresh(new Date());
  }, [refetch, refetchStats]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const ids = new Set(
        (filteredSessions || []).map((s: any) => s.id || s.sessionId)
      );
      setSelectedIds(ids);
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleDisconnect = (session: any) => {
    setSelectedSession(session);
    setIsDisconnectDialogOpen(true);
  };

  const handleChangeSpeed = (session: any) => {
    setSelectedSession(session);
    setIsSpeedDialogOpen(true);
  };

  const confirmDisconnect = () => {
    if (!selectedSession) return;
    const sessionId = selectedSession.sessionId || selectedSession.acctSessionId;
    if (!sessionId) {
      toast.error(isAr ? "معرّف الجلسة غير متاح" : "Active session identifier is unavailable");
      return;
    }
    coaDisconnect.mutate({
      sessionId,
    });
  };

  const confirmBulkDisconnect = () => {
    const toDisconnect = (filteredSessions || [])
      .filter((s: any) => selectedIds.has(s.id || s.sessionId))
      .map((s: any) => ({
        username: s.username,
        nasIp: s.nasIpAddress,
        sessionId: s.sessionId,
        framedIp: s.framedIpAddress,
      }));
    bulkDisconnect.mutate({ sessions: toDisconnect });
  };

  const applyPreset = (presetLabel: string) => {
    const preset = SPEED_PRESETS.find((p) => p.label === presetLabel);
    if (preset) {
      setNewDownloadSpeed(String(preset.download));
      setNewUploadSpeed(String(preset.upload));
      setSelectedPreset(presetLabel);
    }
  };

  const confirmSpeedChange = () => {
    if (!selectedSession || !newDownloadSpeed || !newUploadSpeed) return;
    const sessionId = selectedSession.sessionId || selectedSession.acctSessionId;
    if (!sessionId) {
      toast.error(isAr ? "معرّف الجلسة غير متاح" : "Active session identifier is unavailable");
      return;
    }
    const dlMbps = parseFloat(newDownloadSpeed);
    const ulMbps = parseFloat(newUploadSpeed);
    coaUpdateSession.mutate({
      sessionId,
      downloadSpeed: dlMbps,
      uploadSpeed: ulMbps,
    });
  };

  // ── Filtering ──
  const filteredSessions = (sessions || []).filter((s: any) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      s.username?.toLowerCase().includes(q) ||
      s.nasIpAddress?.includes(q) ||
      s.framedIpAddress?.includes(q) ||
      s.nasName?.toLowerCase().includes(q);
    const rawT = (s.serviceType || s.accttype || "").toLowerCase();
    const isHotspot = rawT.includes("hotspot");
    const matchType =
      filterType === "all" ||
      (filterType === "ppp" && !isHotspot) ||
      (filterType === "hotspot" && isHotspot);
    return matchSearch && matchType;
  });

  const allSelected =
    filteredSessions.length > 0 &&
    filteredSessions.every((s: any) => selectedIds.has(s.id || s.sessionId));

  // PPPoE vs HOTSPOT counts from ALL sessions (not filtered)
  const pppoeCount = (sessions as any[] || []).filter((s: any) => !((s.serviceType || s.accttype || "").toLowerCase().includes("hotspot"))).length;
  const hotspotCount = (sessions as any[] || []).filter((s: any) => (s.serviceType || s.accttype || "").toLowerCase().includes("hotspot")).length;

  const totalDownload = filteredSessions.reduce(
    (acc: number, s: any) => acc + (Number(s.outputOctets) || 0),
    0
  );
  const totalUpload = filteredSessions.reduce(
    (acc: number, s: any) => acc + (Number(s.inputOctets) || 0),
    0
  );
  const totalDuration = filteredSessions.reduce(
    (acc: number, s: any) => acc + (Number(s.sessionTime) || 0),
    0
  );

  return (
    <div className="space-y-5 pb-8" dir={direction}>
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-gradient-to-br from-primary to-teal-600 rounded-xl shadow-sm">
              <Signal className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold">
              {isAr ? "الجلسات النشطة" : "Active Sessions"}
            </h1>
            {/* Live indicator */}
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {isAr ? "مباشر" : "Live"}
            </span>
            {/* Selected client badge */}
            {selectedClientId && clientsList && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1 rounded-full border border-blue-200 dark:border-blue-800">
                <Users className="w-3 h-3" />
                {(clientsList as any[]).find((c: any) => c.id === selectedClientId)?.name ||
                 (clientsList as any[]).find((c: any) => c.id === selectedClientId)?.email ||
                 `Client #${selectedClientId}`}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {isAr
              ? "مراقبة وإدارة جلسات RADIUS النشطة مع دعم CoA وMikroTik API"
              : "Monitor and manage active RADIUS sessions with CoA & MikroTik API"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block bg-muted/50 px-3 py-1.5 rounded-lg">
            {isAr ? "آخر تحديث:" : "Last update:"}{" "}
            {_fmtTimeOnly(lastRefresh)}
          </span>
          <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2 rounded-xl border-primary/30 hover:border-primary hover:bg-primary/5">
            <RefreshCw className="h-4 w-4" />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Wifi}
          label={isAr ? "الجلسات النشطة" : "Active Sessions"}
          value={stats?.activeSessionsCount ?? filteredSessions.length}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
          sub={isAr ? "متصل الآن" : "Connected now"}
        />
        <StatCard
          icon={Timer}
          label={isAr ? "إجمالي الوقت" : "Total Time"}
          value={isAr ? formatDurationAr(stats?.totalSessionTime ?? totalDuration) : formatDuration(stats?.totalSessionTime ?? totalDuration)}
          gradient="bg-gradient-to-br from-violet-500 to-purple-600"
          sub={isAr ? "مجموع الجلسات" : "Combined sessions"}
        />
        <StatCard
          icon={Download}
          label={isAr ? "إجمالي التنزيل" : "Total Download"}
          value={formatBytes(stats?.totalOutputOctets ?? totalDownload)}
          gradient="bg-gradient-to-br from-sky-500 to-blue-600"
          sub={isAr ? "بيانات واردة" : "Inbound data"}
        />
        <StatCard
          icon={Upload}
          label={isAr ? "إجمالي الرفع" : "Total Upload"}
          value={formatBytes(stats?.totalInputOctets ?? totalUpload)}
          gradient="bg-gradient-to-br from-orange-500 to-amber-600"
          sub={isAr ? "بيانات صادرة" : "Outbound data"}
        />
      </div>

      {/* ── PPPoE vs HOTSPOT breakdown ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-500/5 px-5 py-4">
          <div className="p-2.5 rounded-xl bg-blue-500/15">
            <Network className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">PPPoE</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 leading-none">{pppoeCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{isAr ? "مشترك برودباند" : "Broadband subscribers"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-orange-200 dark:border-orange-800 bg-orange-500/5 px-5 py-4">
          <div className="p-2.5 rounded-xl bg-orange-500/15">
            <Wifi className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">HOTSPOT</p>
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 leading-none">{hotspotCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{isAr ? "مستخدم هوت سبوت" : "Hotspot users"}</p>
          </div>
        </div>
      </div>

      {/* ── MikroTik API Banner ── */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-sky-500/5 p-4">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent" />
        <div className="relative flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/15 rounded-xl">
            <Zap className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">
              {isAr ? "تغيير السرعة الفوري عبر MikroTik API" : "Instant Speed Change via MikroTik API"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "تغيير سرعة المستخدم فوراً بدون فصل الاتصال — يُطبَّق مباشرة على Queue في MikroTik"
                : "Change user speed instantly without disconnecting — applied directly to MikroTik Queue"}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-600 font-medium">{isAr ? "نشط" : "Active"}</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isAr ? "بحث باسم المستخدم أو عنوان IP أو NAS..." : "Search by username, IP or NAS..."}
            className="ps-10 h-10 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Client filter - super admin only */}
        {isSuperAdmin && clientsList && clientsList.length > 0 && (
          <Select
            value={selectedClientId ? String(selectedClientId) : "all"}
            onValueChange={(v) => {
              setSelectedClientId(v === "all" ? null : Number(v));
              setSelectedIds(new Set());
            }}
          >
            <SelectTrigger className="h-10 rounded-xl w-[180px]">
              <SelectValue placeholder={isAr ? "تصفية حسب العميل" : "Filter by client"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "جميع العملاء" : "All Clients"}</SelectItem>
              {clientsList.map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name || c.email || `Client #${c.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Filter */}
        <div className="flex gap-2">
          {(["all", "ppp", "hotspot"] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={filterType === t ? "default" : "outline"}
              className="h-10 rounded-xl capitalize"
              onClick={() => setFilterType(t)}
            >
              {t === "all" ? (isAr ? "الكل" : "All") : t === "ppp" ? "PPPoE" : "HOTSPOT"}
            </Button>
          ))}
        </div>

        {/* Bulk disconnect */}
        {selectedIds.size > 0 && (
          <Button
            size="sm"
            variant="destructive"
            className="h-10 rounded-xl gap-2 animate-in slide-in-from-right-2"
            onClick={() => setIsBulkDisconnectOpen(true)}
          >
            <WifiOff className="h-4 w-4" />
            {isAr ? `فصل ${selectedIds.size}` : `Disconnect ${selectedIds.size}`}
          </Button>
        )}
      </div>

      {/* ── Sessions List ── */}
      <div className="space-y-2">
        {/* List header */}
        {filteredSessions.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-muted/40 text-xs text-muted-foreground font-medium">
            <Checkbox
              checked={allSelected}
              onCheckedChange={handleSelectAll}
              className="shrink-0"
            />
            <span className="flex-1">{isAr ? "المستخدم / IP" : "User / IP"}</span>
            <span className="hidden md:block w-[100px]">{isAr ? "جهاز NAS" : "NAS Device"}</span>
            <span className="hidden sm:block w-[70px] text-center">{isAr ? "المدة" : "Duration"}</span>
            <span className="hidden lg:block w-[80px] text-center">{isAr ? "تنزيل" : "Download"}</span>
            <span className="hidden lg:block w-[80px] text-center">{isAr ? "رفع" : "Upload"}</span>
            <span className="w-[130px] text-center">{isAr ? "إجراءات" : "Actions"}</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 bg-muted/30 rounded-2xl mb-4">
              <WifiOff className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground font-medium">
              {isAr ? "لا توجد جلسات نشطة" : "No active sessions"}
            </p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              {isAr ? "سيظهر المستخدمون المتصلون هنا" : "Connected users will appear here"}
            </p>
          </div>
        ) : (
          filteredSessions.map((session: any) => (
            <SessionRow
              key={session.id || session.sessionId}
              session={session}
              selected={selectedIds.has(session.id || session.sessionId)}
              onSelect={handleSelectOne}
              onDisconnect={handleDisconnect}
              onChangeSpeed={handleChangeSpeed}
              language={language}
            />
          ))
        )}
      </div>

      {/* ── Summary Footer ── */}
      {filteredSessions.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl bg-muted/30 text-xs text-muted-foreground border border-border/50">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <strong className="text-foreground">{filteredSessions.length}</strong>
            {isAr ? " جلسة نشطة" : " active sessions"}
          </span>
          <span className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5 text-sky-500" />
            <strong className="text-foreground">{formatBytes(totalDownload)}</strong>
            {isAr ? " تنزيل" : " downloaded"}
          </span>
          <span className="flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5 text-orange-500" />
            <strong className="text-foreground">{formatBytes(totalUpload)}</strong>
            {isAr ? " رفع" : " uploaded"}
          </span>
          <span className="flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5 text-violet-500" />
            <strong className="text-foreground">{isAr ? formatDurationAr(totalDuration) : formatDuration(totalDuration)}</strong>
            {isAr ? " إجمالي" : " total time"}
          </span>
        </div>
      )}

      {/* ── Disconnect Dialog ── */}
      <AlertDialog open={isDisconnectDialogOpen} onOpenChange={setIsDisconnectDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-destructive/10 rounded-xl">
                <WifiOff className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle className="text-base">
                {isAr ? "قطع الاتصال" : "Disconnect Session"}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {isAr
                ? `هل تريد قطع اتصال المستخدم `
                : `Disconnect user `}
              <strong className="text-foreground font-mono">
                {selectedSession?.username}
              </strong>
              {isAr
                ? `؟ سيُرسل طلب CoA Disconnect إلى جهاز NAS.`
                : `? A CoA Disconnect request will be sent to the NAS.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
              disabled={coaDisconnect.isPending}
            >
              {coaDisconnect.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <WifiOff className="h-4 w-4" />
              )}
              {isAr ? "قطع الاتصال" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Disconnect Dialog ── */}
      <AlertDialog open={isBulkDisconnectOpen} onOpenChange={setIsBulkDisconnectOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-destructive/10 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <AlertDialogTitle className="text-base">
                {isAr ? "فصل جماعي" : "Bulk Disconnect"}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {isAr
                ? `سيتم قطع اتصال ${selectedIds.size} مستخدم. هذا الإجراء لا يمكن التراجع عنه.`
                : `You are about to disconnect ${selectedIds.size} sessions. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
              disabled={bulkDisconnect.isPending}
            >
              {bulkDisconnect.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <WifiOff className="h-4 w-4" />
              )}
              {isAr ? `فصل ${selectedIds.size} مستخدم` : `Disconnect ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Change Speed Dialog ── */}
      <Dialog open={isSpeedDialogOpen} onOpenChange={setIsSpeedDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 bg-sky-500/10 rounded-xl">
                <Gauge className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <DialogTitle>{isAr ? "تغيير السرعة الفوري" : "Instant Speed Change"}</DialogTitle>
                <DialogDescription className="mt-0.5">
                  <span className="font-mono font-semibold text-foreground">
                    {selectedSession?.username}
                  </span>
                  {" — "}
                  {isAr ? "بدون فصل الاتصال" : "without disconnecting"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Info banner */}
            <div className="flex items-center gap-2 p-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
              <Zap className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {isAr
                  ? "سيتم تطبيق السرعة فوراً عبر MikroTik API على Queue المستخدم"
                  : "Speed will be applied instantly via MikroTik API to user Queue"}
              </p>
            </div>

            {/* Speed Presets */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">
                {isAr ? "خطط سريعة" : "Quick Presets"}
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {SPEED_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.label)}
                    className={cn(
                      "text-xs py-1.5 px-2 rounded-lg border transition-all",
                      selectedPreset === p.label
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/40 hover:bg-accent"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Manual input */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Download className="h-3 w-3 text-sky-500" />
                  {isAr ? "تنزيل (Mbps)" : "Download (Mbps)"}
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0.1"
                  placeholder="10"
                  value={newDownloadSpeed}
                  onChange={(e) => {
                    setNewDownloadSpeed(e.target.value);
                    setSelectedPreset("");
                  }}
                  className="h-9 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Upload className="h-3 w-3 text-orange-500" />
                  {isAr ? "رفع (Mbps)" : "Upload (Mbps)"}
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0.1"
                  placeholder="5"
                  value={newUploadSpeed}
                  onChange={(e) => {
                    setNewUploadSpeed(e.target.value);
                    setSelectedPreset("");
                  }}
                  className="h-9 rounded-lg"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsSpeedDialogOpen(false);
                setNewDownloadSpeed("");
                setNewUploadSpeed("");
                setSelectedPreset("");
              }}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={confirmSpeedChange}
              disabled={!newDownloadSpeed || !newUploadSpeed || coaUpdateSession.isPending}
              className="bg-sky-600 hover:bg-sky-700 gap-2"
            >
              {coaUpdateSession.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {isAr ? "تطبيق فوري" : "Apply Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
