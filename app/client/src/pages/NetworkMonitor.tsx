/**
 * Network Monitor Page - Professional redesign v2
 * Monitor router devices via MikroTik API Ping
 */
import { useState, useEffect, useRef } from "react";
import { parseDbDate, formatDate as _fmtDateLib } from '@/lib/dateFormat';
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Plus, Search, RefreshCw, Wifi, WifiOff, Clock,
  AlertTriangle, Trash2, Settings, Activity, Router,
  Timer, CheckCircle2, XCircle, HelpCircle, Zap,
  AlertCircle, Network, Bell, BellOff, History, ChevronDown, ChevronUp,
  CheckSquare, Square, Minus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PortForwardingPanel } from "@/components/network/PortForwardingPanel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";

// ─── Types ───────────────────────────────────────────────────────────────────
type RouterDevice = {
  id: number;
  nasId: number;
  nasName: string;
  name: string;
  ipAddress: string;
  description: string | null;
  isOnline: boolean | null;
  lastPingMs: number | null;
  lastCheckedAt: Date | null;
  lastSeenOnlineAt: Date | null;
  consecutiveFailures: number;
  notifyOnDown: boolean;
  createdAt: Date;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = (parseDbDate(date as string) ?? new Date(date as string));
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "الآن";
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  return _fmtDateLib(d);
}

function getPingColor(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  if (ms < 10) return "text-emerald-400";
  if (ms < 50) return "text-green-400";
  if (ms < 100) return "text-yellow-400";
  if (ms < 200) return "text-orange-400";
  return "text-red-400";
}

function getStatusInfo(router: RouterDevice) {
  if (!router.lastCheckedAt) return { label: "غير معروف", color: "text-gray-400", bg: "bg-gray-500/15", border: "border-gray-500/20", dot: "bg-gray-400", pulse: false };
  if (router.isOnline) return { label: "متصل", color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/20", dot: "bg-emerald-400", pulse: true };
  if (router.consecutiveFailures >= 3) return { label: "منقطع", color: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/20", dot: "bg-red-400", pulse: false };
  return { label: "تحذير", color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/20", dot: "bg-amber-400", pulse: false };
}

// ─── Router Row Component ─────────────────────────────────────────────────────
function RouterRow({ router, index, onDelete, onToggleNotify, selected, onSelect }: {
  router: RouterDevice;
  index: number;
  onDelete: (id: number) => void;
  onToggleNotify: (id: number, val: boolean) => void;
  selected: boolean;
  onSelect: (id: number, checked: boolean) => void;
}) {
  const status = getStatusInfo(router);
  const [showLog, setShowLog] = useState(false);
  const downLogQuery = trpc.networkMonitor.getDownLog.useQuery(
    { routerId: router.id, limit: 20 },
    { enabled: showLog }
  );

  return (
    <div className="border-b border-border/40 last:border-0">
      <div className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors ${selected ? 'bg-primary/5' : ''}`}>
        {/* Checkbox */}
        <button
          onClick={() => onSelect(router.id, !selected)}
          className="w-5 h-5 shrink-0 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
        >
          {selected
            ? <CheckSquare className="w-4 h-4 text-primary" />
            : <Square className="w-4 h-4" />}
        </button>
        {/* Index */}
        <span className="w-5 text-center text-xs text-muted-foreground shrink-0">{index}</span>

        {/* Status dot */}
        <div className="shrink-0">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${status.dot} ${status.pulse ? "animate-pulse" : ""}`} />
        </div>

        {/* Name + IP */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{router.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{router.ipAddress}</p>
        </div>

        {/* Status badge */}
        <span className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${status.bg} ${status.color} ${status.border} shrink-0`}>
          {status.label}
        </span>

        {/* Ping */}
        <span className={`hidden md:block text-sm font-mono font-bold w-16 text-right shrink-0 ${getPingColor(router.lastPingMs)}`}>
          {router.isOnline && router.lastPingMs ? `${router.lastPingMs}ms` : "—"}
        </span>

        {/* Last check */}
        <span className="hidden lg:block text-xs text-muted-foreground w-20 text-right shrink-0">
          {formatTime(router.lastCheckedAt)}
        </span>

        {/* NAS */}
        <span className="hidden xl:block text-xs text-muted-foreground truncate w-24 text-right shrink-0">
          {router.nasName}
        </span>

        {/* Notify Toggle */}
        <button
          onClick={() => onToggleNotify(router.id, !router.notifyOnDown)}
          title={router.notifyOnDown ? "تنبيه مفعّل - اضغط لتعطيله" : "تنبيه معطّل - اضغط لتفعيله"}
          className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg transition-colors ${
            router.notifyOnDown
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground/40 hover:bg-muted/40"
          }`}
        >
          {router.notifyOnDown ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
        </button>

        {/* History Toggle */}
        <button
          onClick={() => setShowLog(v => !v)}
          title="سجل الانقطاعات"
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
        </button>

        {/* Delete */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف الراوتر</AlertDialogTitle>
              <AlertDialogDescription>هل تريد حذف "{router.name}" ({router.ipAddress})؟</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(router.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Down Log Panel */}
      {showLog && (
        <div className="px-4 pb-3 bg-muted/10 border-t border-border/30">
          <div className="flex items-center gap-2 py-2 mb-2">
            <History className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">سجل الانقطاعات</span>
          </div>
          {downLogQuery.isLoading && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-2">
              <RefreshCw className="w-3 h-3 animate-spin" /> جاري التحميل...
            </div>
          )}
          {!downLogQuery.isLoading && (!downLogQuery.data || downLogQuery.data.length === 0) && (
            <p className="text-xs text-muted-foreground/60 py-2">لا توجد سجلات انقطاع بعد</p>
          )}
          {downLogQuery.data && downLogQuery.data.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {(downLogQuery.data as any[]).map((log: any) => (
                <div key={log.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${
                  log.eventType === 'down' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    log.eventType === 'down' ? 'bg-red-400' : 'bg-emerald-400'
                  }`} />
                  <span className="font-medium">{log.eventType === 'down' ? 'انقطع' : 'عاد'}</span>
                  <span className="text-muted-foreground">{formatTime(log.detectedAt)}</span>
                  {log.notified && log.eventType === 'down' && (
                    <span className="mr-auto text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">تم التنبيه</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NetworkMonitor() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterNas, setFilterNas] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [addTab, setAddTab] = useState<"single" | "cidr">("single");
  const [pingingNasId, setPingingNasId] = useState<number | null>(null);
  const autoPingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [addForm, setAddForm] = useState({
    nasId: "", name: "", ipAddress: "192.168.1.1", webPort: "80",
    description: "", cidr: "192.168.1.0/24", namePrefix: "راوتر",
  });

  const [autoPingEnabled, setAutoPingEnabled] = useState(false);
  const [pingInterval, setPingInterval] = useState(5);

  // tRPC
  const utils = trpc.useUtils();
  const routersQuery = trpc.networkMonitor.list.useQuery();
  const nasListQuery = trpc.networkMonitor.getMyNasList.useQuery();
  const statsQuery = trpc.networkMonitor.stats.useQuery();
  const autoPingSettingsQuery = trpc.networkMonitor.getAutoPingSettings.useQuery();

  const addMutation = trpc.networkMonitor.add.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الراوتر بنجاح");
      setShowAddDialog(false);
      setAddForm({ nasId: "", name: "", ipAddress: "192.168.1.1", webPort: "80", description: "", cidr: "192.168.1.0/24", namePrefix: "راوتر" });
      utils.networkMonitor.list.invalidate();
      utils.networkMonitor.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const addRangeMutation = trpc.networkMonitor.addRange.useMutation({
    onSuccess: (data) => {
      toast.success(`تم إضافة ${data.added} راوتر (تم تخطي ${data.skipped} موجود)`);
      setShowAddDialog(false);
      utils.networkMonitor.list.invalidate();
      utils.networkMonitor.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.networkMonitor.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الراوتر");
      utils.networkMonitor.list.invalidate();
      utils.networkMonitor.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const pingMutation = trpc.networkMonitor.pingNow.useMutation({
    onSuccess: (data) => {
      if (!data.apiAvailable) {
        toast.error("لم يتم الاتصال بـ MikroTik API. تأكد من تفعيل API على جهاز NAS.");
      } else {
        const online = data.results.filter((r: any) => r.online).length;
        toast.success(`تم الفحص: ${online} متصل من ${data.results.length}`);
      }
      utils.networkMonitor.list.invalidate();
      utils.networkMonitor.stats.invalidate();
      setPingingNasId(null);
    },
    onError: (e) => { toast.error(e.message); setPingingNasId(null); },
  });

  const toggleNotifyMutation = trpc.networkMonitor.toggleNotify.useMutation({
    onSuccess: () => utils.networkMonitor.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const bulkDeleteMutation = trpc.networkMonitor.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`تم حذف ${data.deleted} راوتر بنجاح`);
      setSelectedIds(new Set());
      setBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
      utils.networkMonitor.list.invalidate();
      utils.networkMonitor.stats.invalidate();
    },
    onError: (e) => { toast.error(e.message); setBulkDeleting(false); },
  });

  function handleSelectRouter(id: number, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r.id)));
    }
  }

  function handleBulkPing() {
    const apiNas = nasList.filter((n: any) => n.apiEnabled);
    if (apiNas.length === 0) return toast.error('لا يوجد NAS مع API مفعّل');
    for (const nas of apiNas) { setPingingNasId(nas.id); pingMutation.mutate({ nasId: nas.id }); }
    toast.info('جاري فحص جميع الراوترات...');
  }

  const saveSettingsMutation = trpc.networkMonitor.saveAutoPingSettings.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الفحص التلقائي");
      setShowSettingsDialog(false);
      utils.networkMonitor.getAutoPingSettings.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Load saved settings
  useEffect(() => {
    if (autoPingSettingsQuery.data) {
      setAutoPingEnabled(autoPingSettingsQuery.data.autoPingEnabled);
      setPingInterval(autoPingSettingsQuery.data.pingIntervalMinutes);
    }
  }, [autoPingSettingsQuery.data]);

  // Auto-ping timer
  useEffect(() => {
    if (autoPingTimerRef.current) clearInterval(autoPingTimerRef.current);
    if (!autoPingEnabled) return;
    const nasList = (nasListQuery.data || []) as any[];
    const apiNas = nasList.filter((n: any) => n.apiEnabled);
    if (apiNas.length === 0) return;
    const intervalMs = pingInterval * 60 * 1000;
    autoPingTimerRef.current = setInterval(() => {
      for (const nas of apiNas) pingMutation.mutate({ nasId: nas.id });
    }, intervalMs);
    return () => { if (autoPingTimerRef.current) clearInterval(autoPingTimerRef.current); };
  }, [autoPingEnabled, pingInterval, nasListQuery.data]);

  // Data
  const routers = (routersQuery.data || []) as RouterDevice[];
  const nasList = (nasListQuery.data || []) as any[];
  const stats = statsQuery.data || { total: 0, online: 0, offline: 0, unknown: 0 };

  const filtered = routers.filter((r) => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.ipAddress.includes(search);
    const matchNas = filterNas === "all" || String(r.nasId) === filterNas;
    const matchStatus = filterStatus === "all" ||
      (filterStatus === "online" && r.isOnline) ||
      (filterStatus === "offline" && !r.isOnline && r.lastCheckedAt) ||
      (filterStatus === "unknown" && !r.lastCheckedAt);
    return matchSearch && matchNas && matchStatus;
  });

  const avgPing = routers.filter(r => r.isOnline && r.lastPingMs).length > 0
    ? Math.round(routers.filter(r => r.isOnline && r.lastPingMs).reduce((a, r) => a + (r.lastPingMs || 0), 0) / routers.filter(r => r.isOnline && r.lastPingMs).length)
    : null;

  const selectedNas = addForm.nasId ? nasList.find((n: any) => String(n.id) === addForm.nasId) : null;
  const nasHasNoApi = selectedNas && !selectedNas.apiEnabled;

  function handleAdd() {
    if (!addForm.nasId) return toast.error("اختر جهاز NAS أولاً");
    if (addTab === "single") {
      if (!addForm.name.trim()) return toast.error("أدخل اسم الراوتر");
      addMutation.mutate({
        nasId: parseInt(addForm.nasId),
        name: addForm.name.trim(),
        ipAddress: addForm.ipAddress.trim(),
        webPort: addForm.webPort ? parseInt(addForm.webPort) : 80,
        description: addForm.description || undefined,
      });
    } else {
      addRangeMutation.mutate({
        nasId: parseInt(addForm.nasId),
        cidr: addForm.cidr.trim(),
        namePrefix: addForm.namePrefix.trim() || "راوتر",
        description: addForm.description || undefined,
      });
    }
  }

  return (
      <div className="flex flex-col gap-4" dir="rtl">

        {/* ── Actions Bar ── */}
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2">
            {autoPingEnabled && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                فحص كل {pingInterval} دقيقة
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSettingsDialog(true)} className="gap-2 h-9">
              <Timer className="w-4 h-4" />
              <span className="hidden sm:inline">الفحص التلقائي</span>
            </Button>
            <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-2 h-9 bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4" />
              إضافة راوتر
            </Button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { label: "إجمالي الراوترات", value: stats.total, icon: Router, color: "text-primary", bg: "bg-primary/10" },
            { label: "متصل الآن", value: stats.online, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", sub: stats.total > 0 ? `${Math.round((stats.online / stats.total) * 100)}%` : null },
            { label: "منقطع", value: stats.offline, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
            { label: "غير معروف", value: stats.unknown, icon: HelpCircle, color: "text-gray-400", bg: "bg-gray-500/10" },
            { label: "متوسط الاستجابة", value: avgPing !== null ? `${avgPing}ms` : "—", icon: Activity, color: "text-blue-400", bg: "bg-blue-500/10" },
          ].map((s, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-3 flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                {(s as any).sub && <p className="text-xs text-muted-foreground">{(s as any).sub}</p>}
              </div>
            </div>
          ))}
        </div>

        <PortForwardingPanel targets={routers.map((router) => ({
          id: router.id,
          nasId: router.nasId,
          name: router.name,
          ipAddress: router.ipAddress,
          nasName: router.nasName,
        }))} />

        {/* ── Filters + Ping Buttons ── */}
        <div className="flex flex-wrap gap-2 items-center overflow-x-auto">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="بحث بالاسم أو IP..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 h-9 text-sm" />
          </div>
          <Select value={filterNas} onValueChange={setFilterNas}>
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="كل الأجهزة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأجهزة</SelectItem>
              {nasList.map((n: any) => (
                <SelectItem key={n.id} value={String(n.id)}>{n.name || n.ip}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[120px] h-9 text-sm">
              <SelectValue placeholder="كل الحالات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="online">متصل</SelectItem>
              <SelectItem value="offline">منقطع</SelectItem>
              <SelectItem value="unknown">غير معروف</SelectItem>
            </SelectContent>
          </Select>
          {nasList.filter((n: any) => n.apiEnabled).map((n: any) => (
            <Button key={n.id} variant="outline" size="sm" className="gap-1.5 h-9 text-sm" disabled={pingingNasId === n.id} onClick={() => { setPingingNasId(n.id); pingMutation.mutate({ nasId: n.id }); }}>
              {pingingNasId === n.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-yellow-400" />}
              فحص {n.name || n.ip}
            </Button>
          ))}
        </div>

        {/* ── No API Warning ── */}
        {nasList.length > 0 && nasList.every((n: any) => !n.apiEnabled) && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-amber-300">
              <span className="font-semibold">MikroTik API غير مفعّل</span>
              <p className="text-xs mt-0.5 text-amber-400/80">
                يجب تفعيل MikroTik API على الأقل لجهاز NAS واحد.{" "}
                <button onClick={() => navigate("/nas")} className="underline font-medium">اذهب لإعدادات NAS</button>
              </p>
            </div>
          </div>
        )}

        {/* ── Routers List ── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-b border-primary/20 text-sm">
              <span className="text-primary font-semibold">{selectedIds.size} محدد</span>
              <div className="flex items-center gap-2 mr-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  onClick={handleBulkPing}
                  disabled={pingMutation.isPending}
                >
                  {pingMutation.isPending
                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                    : <Zap className="w-3 h-3 text-yellow-400" />}
                  فحص الكل
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs border-destructive text-destructive hover:bg-destructive/10"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                >
                  <Trash2 className="w-3 h-3" />
                  حذف المحدد ({selectedIds.size})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => setSelectedIds(new Set())}
                >
                  إلغاء التحديد
                </Button>
              </div>
            </div>
          )}

          {/* Table Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 text-xs text-muted-foreground font-medium">
            {/* Select All */}
            <button
              onClick={handleSelectAll}
              className="w-5 h-5 shrink-0 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
              title="تحديد الكل"
            >
              {filtered.length > 0 && selectedIds.size === filtered.length
                ? <CheckSquare className="w-4 h-4 text-primary" />
                : selectedIds.size > 0
                  ? <Minus className="w-4 h-4 text-primary" />
                  : <Square className="w-4 h-4" />}
            </button>
            <span className="w-5 text-center">#</span>
            <span className="w-2.5 shrink-0" />
            <span className="flex-1">الراوتر</span>
            <span className="hidden sm:block w-20 text-center">الحالة</span>
            <span className="hidden md:block w-16 text-right">Ping</span>
            <span className="hidden lg:block w-20 text-right">آخر فحص</span>
            <span className="hidden xl:block w-24 text-right">الجهاز</span>
            <span className="w-8" />
          </div>

          {routersQuery.isLoading && (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              جاري التحميل...
            </div>
          )}

          {!routersQuery.isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Router className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">لا توجد راوترات</p>
              <p className="text-xs text-muted-foreground/60">أضف راوتراً واحداً أو نطاق CIDR كاملاً لبدء المراقبة</p>
              <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-1.5 mt-1">
                <Plus className="w-4 h-4" />
                إضافة أول راوتر
              </Button>
            </div>
          )}

          {!routersQuery.isLoading && filtered.map((r, idx) => (
            <RouterRow
              key={r.id}
              router={r}
              index={idx + 1}
              onDelete={(id) => deleteMutation.mutate({ id })}
              onToggleNotify={(id, val) => toggleNotifyMutation.mutate({ id, notifyOnDown: val })}
              selected={selectedIds.has(r.id)}
              onSelect={handleSelectRouter}
            />
          ))}

          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border/40 bg-muted/20 text-xs text-muted-foreground">
              عرض {filtered.length} من {routers.length} راوتر
            </div>
          )}
        </div>

        {/* ── Add Router Dialog ── */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                إضافة راوتر جديد
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Tabs value={addTab} onValueChange={(v) => setAddTab(v as "single" | "cidr")}>
                <TabsList className="w-full">
                  <TabsTrigger value="single" className="flex-1">IP واحد</TabsTrigger>
                  <TabsTrigger value="cidr" className="flex-1">نطاق CIDR</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-1.5">
                <Label>جهاز NAS (MikroTik)</Label>
                <Select value={addForm.nasId} onValueChange={(v) => setAddForm(f => ({ ...f, nasId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر جهاز NAS..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nasList.map((n: any) => (
                      <SelectItem key={n.id} value={String(n.id)}>
                        <div className="flex items-center gap-2">
                          {n.name || n.ip}
                          {!n.apiEnabled && <Badge variant="destructive" className="text-xs px-1.5 py-0">API معطل</Badge>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {nasHasNoApi && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>هذا الجهاز لا يدعم المراقبة حالياً.{" "}
                      <button onClick={() => navigate("/nas")} className="underline font-medium">فعّل API من إعدادات NAS</button>
                    </span>
                  </div>
                )}
              </div>

              {addTab === "single" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>اسم الراوتر</Label>
                    <Input placeholder="مثال: راوتر الطابق الأول" value={addForm.name} onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>عنوان IP</Label>
                    <Input placeholder="192.168.1.1" value={addForm.ipAddress} onChange={(e) => setAddForm(f => ({ ...f, ipAddress: e.target.value }))} className="font-mono" dir="ltr" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>منفذ صفحة الويب <span className="text-xs text-muted-foreground">(افتراضي 80 — غيّره لـ 8080 إذا كان MikroTik يستخدم port 80)</span></Label>
                    <Input placeholder="80" value={addForm.webPort} onChange={(e) => setAddForm(f => ({ ...f, webPort: e.target.value }))} className="font-mono w-28" dir="ltr" type="number" min="1" max="65535" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>نطاق CIDR</Label>
                    <Input placeholder="192.168.1.0/24" value={addForm.cidr} onChange={(e) => setAddForm(f => ({ ...f, cidr: e.target.value }))} className="font-mono" dir="ltr" />
                    <p className="text-xs text-muted-foreground">سيتم إضافة جميع IPs في النطاق (الحد الأقصى /16)</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>بادئة الاسم</Label>
                    <Input placeholder="راوتر" value={addForm.namePrefix} onChange={(e) => setAddForm(f => ({ ...f, namePrefix: e.target.value }))} />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>وصف (اختياري)</Label>
                <Input placeholder="وصف مختصر..." value={addForm.description} onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <DialogFooter className="gap-2 flex-row-reverse">
              <Button onClick={handleAdd} disabled={addMutation.isPending || addRangeMutation.isPending} className="gap-1.5">
                {(addMutation.isPending || addRangeMutation.isPending) ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إضافة
              </Button>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Auto-Ping Settings Dialog ── */}
        <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-primary" />
                إعدادات الفحص التلقائي
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border">
                <div>
                  <p className="font-semibold text-sm">تفعيل الفحص التلقائي</p>
                  <p className="text-xs text-muted-foreground mt-0.5">يفحص الراوترات تلقائياً بشكل دوري</p>
                </div>
                <Switch checked={autoPingEnabled} onCheckedChange={setAutoPingEnabled} />
              </div>

              {autoPingEnabled && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">فترة الفحص</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {[5, 10, 15, 30].map((min) => (
                      <button key={min} onClick={() => setPingInterval(min)}
                        className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                          pingInterval === min
                            ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                            : "bg-muted/40 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                        }`}>
                        {min}د
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">كل {pingInterval} دقيقة</p>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>الفحص التلقائي يعمل فقط عند فتح هذه الصفحة في المتصفح.</span>
              </div>
            </div>
            <DialogFooter className="gap-2 flex-row-reverse">
              <Button onClick={() => saveSettingsMutation.mutate({ autoPingEnabled, pingIntervalMinutes: pingInterval })} disabled={saveSettingsMutation.isPending} className="gap-1.5">
                {saveSettingsMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                حفظ الإعدادات
              </Button>
              <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Bulk Delete Confirm Dialog ── */}
        <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف جماعي</AlertDialogTitle>
              <AlertDialogDescription>
                هل تريد حذف <strong>{selectedIds.size} راوتر</strong> نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkDeleting}>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                disabled={bulkDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
                onClick={() => {
                  setBulkDeleting(true);
                  bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
                }}
              >
                {bulkDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {bulkDeleting ? 'جاري الحذف...' : `حذف ${selectedIds.size} راوتر`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
  );
}
