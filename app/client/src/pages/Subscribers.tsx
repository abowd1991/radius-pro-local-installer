import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Plus,
  Users,
  Wifi,
  Clock,
  PauseCircle,
  Calendar,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  WifiOff,
  Phone,
  Eye,
  Filter,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
import { EditSubscriberDialog } from "@/components/EditSubscriberDialog";
import { AddSubscriberWizard } from "@/components/AddSubscriberWizard";
import { formatDate, parseDbDate } from "@/lib/dateFormat";

// ── Accent colors (semantic, work in both themes) ─────────────────────────────
const A = {
  success: "#10B981",
  warning: "#F59E0B",
  danger:  "#EF4444",
  info:    "#4F7396",
  primary: "#14B8A6",
  purple:  "#8B5CF6",
};

// ── Avatar helper ─────────────────────────────────────────────────────────────
function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const colors = [A.primary, A.info, A.purple, A.success, A.warning];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{ background: `${color}22`, color, border: `1.5px solid ${color}44` }}
    >
      {initials || "?"}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, isLoading }: {
  label: string; value: number; icon: React.ElementType; color: string; isLoading: boolean;
}) {
  return (
    <div className="rounded-xl p-4 flex items-center gap-3 bg-card border border-border">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}18` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-foreground">
          {isLoading ? <div className="h-6 w-14 rounded animate-pulse bg-muted" /> : value.toLocaleString("ar-SA")}
        </div>
        <div className="text-xs mt-0.5 text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function Subscribers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [connectionFilter, setConnectionFilter] = useState<string>("all");
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false);
  const [selectedSubscriber, setSelectedSubscriber] = useState<any>(null);
  const [, navigate] = useLocation();
  const [editSubscriber, setEditSubscriber] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [renewData, setRenewData] = useState({
    months: 1, amount: 0,
    paymentMethod: "cash" as "cash" | "wallet" | "card" | "bank_transfer" | "online",
    notes: "",
  });

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = trpc.subscribers.list.useQuery();
  const { data: plansRaw } = trpc.plans.list.useQuery();
  const plansData: any[] = Array.isArray(plansRaw) ? plansRaw : ((plansRaw as any)?.plans ?? []);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const suspendMutation = trpc.subscribers.suspend.useMutation({
    onSuccess: () => { toast.success("تم إيقاف المشترك"); refetch(); },
    onError: (e) => toast.error(e.message || "حدث خطأ"),
  });
  const activateMutation = trpc.subscribers.activate.useMutation({
    onSuccess: () => { toast.success("تم تفعيل المشترك"); refetch(); },
    onError: (e) => toast.error(e.message || "حدث خطأ"),
  });
  const renewMutation = trpc.subscribers.renew.useMutation({
    onSuccess: () => { toast.success("تم تجديد الاشتراك"); setIsRenewDialogOpen(false); setSelectedSubscriber(null); refetch(); },
    onError: (e) => toast.error(e.message || "حدث خطأ"),
  });
  const disconnectMutation = trpc.subscribers.disconnect.useMutation({
    onSuccess: () => { toast.success("تم فصل المشترك"); refetch(); },
    onError: (e) => toast.error(e.message || "حدث خطأ"),
  });
  const deleteMutation = trpc.subscribers.delete.useMutation({
    onSuccess: () => { toast.success("تم حذف المشترك"); refetch(); },
    onError: (e) => toast.error(e.message || "حدث خطأ"),
  });

  const handleRenew = () => {
    if (!selectedSubscriber || renewData.months < 1) { toast.error("يرجى تحديد عدد الأشهر"); return; }
    renewMutation.mutate({ id: selectedSubscriber.subscriber.id, months: renewData.months, amount: renewData.amount, paymentMethod: renewData.paymentMethod, notes: renewData.notes || undefined });
  };
  const openRenewDialog = (sub: any) => {
    setSelectedSubscriber(sub);
    setRenewData({ months: 1, amount: Number(sub.plan?.price || 0), paymentMethod: "cash", notes: "" });
    setIsRenewDialogOpen(true);
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const uniquePlans = useMemo(() => {
    const plans = new Map<number, string>();
    data?.subscribers?.forEach((sub: any) => { if (sub.plan) plans.set(sub.plan.id, sub.plan.name); });
    return Array.from(plans.entries());
  }, [data]);

  const filteredSubscribers = useMemo(() => {
    return (data?.subscribers ?? []).filter((sub: any) => {
      const isOnline = !!sub.activeSession;
      const q = searchQuery.toLowerCase();
      const matchesSearch = sub.subscriber.username.toLowerCase().includes(q) || sub.subscriber.fullName.toLowerCase().includes(q) || (sub.subscriber.phone && sub.subscriber.phone.includes(q));
      const matchesStatus = statusFilter === "all" || sub.subscriber.status === statusFilter;
      const matchesPlan = planFilter === "all" || String(sub.plan?.id) === planFilter;
      const matchesConn = connectionFilter === "all" || (connectionFilter === "online" && isOnline) || (connectionFilter === "offline" && !isOnline);
      return matchesSearch && matchesStatus && matchesPlan && matchesConn;
    });
  }, [data, searchQuery, statusFilter, planFilter, connectionFilter]);

  const stats = data?.stats || { total: 0, active: 0, suspended: 0, expired: 0, pending: 0 };

  const avgDaysRemaining = useMemo(() => {
    const subs = data?.subscribers ?? [];
    if (!subs.length) return 0;
    let total = 0, count = 0;
    subs.forEach((sub: any) => {
      const end = sub.subscriber.subscriptionEndDate;
      if (!end) return;
      const d = Math.ceil(((parseDbDate(end) ?? new Date(end)).getTime() - Date.now()) / 86400000);
      if (d > 0) { total += d; count++; }
    });
    return count > 0 ? Math.round(total / count) : 0;
  }, [data]);

  const getDaysRemaining = (endDate: any) => {
    if (!endDate) return null;
    const end = parseDbDate(endDate) ?? new Date(endDate);
    return Math.ceil((end.getTime() - Date.now()) / 86400000);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      active:    { label: "نشط",    color: A.success },
      suspended: { label: "موقوف",  color: A.warning },
      expired:   { label: "منتهي",  color: A.danger  },
      pending:   { label: "معلق",   color: A.info    },
    };
    const s = map[status];
    if (!s) return <Badge variant="outline">{status}</Badge>;
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: `${s.color}18`, color: s.color }}>
        {s.label}
      </span>
    );
  };

  const getDataUsage = (sub: any) => {
    const used = sub.activeSession?.acctinputoctets ?? 0;
    const total = sub.plan?.dataLimit ?? 0;
    if (!total) return null;
    const pct = Math.min(Math.round((used / total) * 100), 100);
    const usedGB = (used / 1073741824).toFixed(2);
    return { pct, usedGB };
  };

  // ── Row actions ───────────────────────────────────────────────────────────────
  const RowActions = ({ sub }: { sub: any }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
          <MoreHorizontal size={15} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => navigate(`/subscribers/${sub.subscriber.id}`)}>
          <Eye className="h-4 w-4 ml-2" />عرض التفاصيل
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { setEditSubscriber(sub); setIsEditDialogOpen(true); }}>
          <Pencil className="h-4 w-4 ml-2" />تعديل الاشتراك
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openRenewDialog(sub)}>
          <RefreshCw className="h-4 w-4 ml-2" />تجديد الاشتراك
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => disconnectMutation.mutate({ id: sub.subscriber.id })}>
          <WifiOff className="h-4 w-4 ml-2" />فصل الاتصال
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {sub.subscriber.status === "active" ? (
          <DropdownMenuItem onClick={() => suspendMutation.mutate({ id: sub.subscriber.id })} className="text-yellow-500">
            <PowerOff className="h-4 w-4 ml-2" />إيقاف
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => activateMutation.mutate({ id: sub.subscriber.id })} className="text-green-500">
            <Power className="h-4 w-4 ml-2" />تفعيل
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-500" onClick={async () => { if (await window.confirmOperation("هل أنت متأكد من حذف هذا المشترك؟", "حذف المشترك")) deleteMutation.mutate({ id: sub.subscriber.id }); }}>
          <Trash2 className="h-4 w-4 ml-2" />حذف
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">المشتركون</h1>
            <p className="text-sm mt-0.5 text-muted-foreground">إدارة ومراقبة جميع مشتركي PPPoE</p>
          </div>
          <Button size="sm" className="gap-1.5 text-xs font-semibold self-start" style={{ background: A.primary, color: "#fff" }} onClick={() => setIsWizardOpen(true)}>
            <Plus size={14} />إضافة مشترك
          </Button>
        </div>

        {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="إجمالي المشتركين"      value={stats.total}        icon={Users}       color={A.info}    isLoading={isLoading} />
          <StatCard label="المشتركون النشطون"     value={stats.active}       icon={Wifi}        color={A.success} isLoading={isLoading} />
          <StatCard label="المشتركون المنتهون"    value={stats.expired}      icon={Clock}       color={A.danger}  isLoading={isLoading} />
          <StatCard label="المشتركون الموقوفون"   value={stats.suspended}    icon={PauseCircle} color={A.warning} isLoading={isLoading} />
          <StatCard label="متوسط الأيام المتبقية" value={avgDaysRemaining}   icon={Calendar}    color={A.purple}  isLoading={isLoading} />
        </div>

        {/* ── Toolbar ────────────────────────────────────────────────────────── */}
        <div className="rounded-xl p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap bg-card border border-border">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="بحث بالاسم، اليوزر، أو الهاتف..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 h-8 text-xs" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-[130px]"><Filter size={12} className="ml-1" /><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="suspended">موقوف</SelectItem>
                <SelectItem value="expired">منتهي</SelectItem>
                <SelectItem value="pending">معلق</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="الباقة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الباقات</SelectItem>
                {uniquePlans.map(([id, name]) => <SelectItem key={id} value={String(id)}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={connectionFilter} onValueChange={setConnectionFilter}>
              <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="الاتصال" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الاتصالات</SelectItem>
                <SelectItem value="online">متصل</SelectItem>
                <SelectItem value="offline">غير متصل</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => refetch()}>
                  <RefreshCw size={13} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>تحديث البيانات</TooltipContent>
            </Tooltip>
            <span className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border">
              {filteredSubscribers.length} نتيجة
            </span>
          </div>
        </div>

        {/* ── Desktop Table (hidden on mobile) ───────────────────────────────── */}
        <div className="hidden md:block rounded-xl overflow-hidden border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["المشترك", "رقم الهاتف", "الباقة", "الاتصال", "الحالة", "تاريخ الانتهاء", "الأيام المتبقية", "آخر اتصال", "استهلاك", ""].map((h, i) => (
                    <th key={i} className="text-right px-4 py-3 text-xs font-semibold whitespace-nowrap text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded animate-pulse bg-muted" style={{ width: j === 0 ? "120px" : "70px" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredSubscribers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-sm text-muted-foreground">لا يوجد مشتركين مطابقين للبحث</td>
                  </tr>
                ) : (
                  filteredSubscribers.map((sub: any) => {
                    const isOnline = !!sub.activeSession;
                    const days = getDaysRemaining(sub.subscriber.subscriptionEndDate);
                    const usage = getDataUsage(sub);
                    const lastSeen = sub.activeSession?.acctstoptime || sub.subscriber.updatedAt;
                    return (
                      <tr key={sub.subscriber.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer">
                        <td className="px-4 py-3" onClick={() => navigate(`/subscribers/${sub.subscriber.id}`)}>
                          <div className="flex items-center gap-3">
                            <Avatar name={sub.subscriber.fullName} />
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate max-w-[140px] text-foreground">{sub.subscriber.fullName}</div>
                              <div className="text-xs font-mono mt-0.5 text-muted-foreground" dir="ltr">{sub.subscriber.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {sub.subscriber.phone ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone size={11} />{sub.subscriber.phone}</div>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {sub.plan ? (
                            <div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: `${A.primary}18`, color: A.primary }}>{sub.plan.name}</span>
                              <div className="text-xs mt-0.5 text-muted-foreground">{Math.round(sub.plan.downloadSpeed / 1000)}/{Math.round(sub.plan.uploadSpeed / 1000)} Mbps</div>
                            </div>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isOnline ? A.success : "#94A3B8", boxShadow: isOnline ? `0 0 4px ${A.success}` : "none" }} />
                            <span className="text-xs font-medium" style={{ color: isOnline ? A.success : "#94A3B8" }}>{isOnline ? "متصل" : "غير متصل"}</span>
                          </div>
                          {isOnline && sub.activeSession?.framedipaddress && (
                            <div className="text-xs font-mono mt-0.5 text-muted-foreground/60" dir="ltr">{sub.activeSession.framedipaddress}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(sub.subscriber.status)}</td>
                        <td className="px-4 py-3"><span className="text-xs text-muted-foreground">{formatDate(sub.subscriber.subscriptionEndDate) || "—"}</span></td>
                        <td className="px-4 py-3">
                          {days !== null ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: days <= 0 ? `${A.danger}18` : days <= 7 ? `${A.warning}18` : `${A.success}18`, color: days <= 0 ? A.danger : days <= 7 ? A.warning : A.success }}>
                              {days <= 0 ? "منتهي" : `${days} يوم`}
                            </span>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3"><span className="text-xs text-muted-foreground">{lastSeen ? formatDate(lastSeen) : "—"}</span></td>
                        <td className="px-4 py-3" style={{ minWidth: "90px" }}>
                          {usage ? (
                            <div>
                              <div className="flex justify-between text-xs mb-1 text-muted-foreground"><span>{usage.usedGB} GB</span><span>{usage.pct}%</span></div>
                              <div className="h-1.5 rounded-full overflow-hidden bg-border">
                                <div className="h-full rounded-full" style={{ width: `${usage.pct}%`, background: usage.pct > 80 ? A.danger : usage.pct > 50 ? A.warning : A.primary }} />
                              </div>
                            </div>
                          ) : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3"><RowActions sub={sub} /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Mobile Cards (visible on mobile only) ──────────────────────────── */}
        <div className="md:hidden space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl p-4 border border-border bg-card space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full animate-pulse bg-muted" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-32 rounded animate-pulse bg-muted" />
                    <div className="h-3 w-20 rounded animate-pulse bg-muted" />
                  </div>
                </div>
              </div>
            ))
          ) : filteredSubscribers.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">لا يوجد مشتركين مطابقين للبحث</div>
          ) : (
            filteredSubscribers.map((sub: any) => {
              const isOnline = !!sub.activeSession;
              const days = getDaysRemaining(sub.subscriber.subscriptionEndDate);
              return (
                <div
                  key={sub.subscriber.id}
                  className="rounded-xl p-4 border border-border bg-card active:opacity-80 transition-opacity"
                >
                  {/* Top row: avatar + name + actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => navigate(`/subscribers/${sub.subscriber.id}`)}>
                      <Avatar name={sub.subscriber.fullName} />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-foreground">{sub.subscriber.fullName}</div>
                        <div className="text-xs font-mono text-muted-foreground" dir="ltr">{sub.subscriber.username}</div>
                      </div>
                    </div>
                    <RowActions sub={sub} />
                  </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {getStatusBadge(sub.subscriber.status)}
                    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: isOnline ? A.success : "#94A3B8" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: isOnline ? A.success : "#94A3B8", boxShadow: isOnline ? `0 0 4px ${A.success}` : "none" }} />
                      {isOnline ? "متصل" : "غير متصل"}
                    </span>
                    {sub.plan && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: `${A.primary}18`, color: A.primary }}>
                        {sub.plan.name}
                      </span>
                    )}
                    {days !== null && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: days <= 0 ? `${A.danger}18` : days <= 7 ? `${A.warning}18` : `${A.success}18`, color: days <= 0 ? A.danger : days <= 7 ? A.warning : A.success }}>
                        {days <= 0 ? "منتهي" : `${days} يوم`}
                      </span>
                    )}
                  </div>

                  {/* Info row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {sub.subscriber.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone size={10} />{sub.subscriber.phone}</div>
                    )}
                    {sub.subscriber.subscriptionEndDate && (
                      <div className="text-xs text-muted-foreground">ينتهي: {formatDate(sub.subscriber.subscriptionEndDate)}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Wizard ─────────────────────────────────────────────────────────── */}
        <AddSubscriberWizard open={isWizardOpen} onOpenChange={setIsWizardOpen} onSuccess={() => refetch()} />

        {/* ── Renew Dialog ───────────────────────────────────────────────────── */}
        <Dialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تجديد الاشتراك</DialogTitle>
              <DialogDescription>تجديد اشتراك: {selectedSubscriber?.subscriber?.fullName}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>مدة التجديد</Label>
                <Select value={String(renewData.months)} onValueChange={(v) => { const months = Number(v); const price = Number(selectedSubscriber?.plan?.price || 0); setRenewData({ ...renewData, months, amount: price * months }); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 6, 12].map((n) => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "شهر" : "أشهر"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المبلغ</Label>
                <Input type="number" value={renewData.amount} onChange={(e) => setRenewData({ ...renewData, amount: Number(e.target.value) })} dir="ltr" />
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
                <Textarea value={renewData.notes} onChange={(e) => setRenewData({ ...renewData, notes: e.target.value })} placeholder="ملاحظات إضافية..." rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRenewDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleRenew} disabled={renewMutation.isPending}>{renewMutation.isPending ? "جاري التجديد..." : "تجديد الاشتراك"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Edit Dialog ────────────────────────────────────────────────────── */}
        <EditSubscriberDialog open={isEditDialogOpen} onClose={() => setIsEditDialogOpen(false)} subscriber={editSubscriber?.subscriber ?? null} onSuccess={() => { setIsEditDialogOpen(false); refetch(); }} />
      </div>
    </TooltipProvider>
  );
}
