import { useState } from "react";
import { parseDbDate, formatDate as _fmtDateLib } from '@/lib/dateFormat';
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { useSorting } from "@/hooks/useSorting";
import { DataPagination } from "@/components/ui/data-pagination";
import {
  Plus, MoreHorizontal, Edit, Trash2, Search, User, Mail, Phone,
  Wallet, Activity, Ban, CheckCircle, CreditCard, LogIn, Smartphone,
  Users, TrendingUp, ShieldOff, DollarSign, Filter, RefreshCw,
} from "lucide-react";

/* ─── Design Tokens (same as Dashboard) ─────────────────────────────────── */
const C = {
  bg:          "#0B1120",
  card:        "#111827",
  cardHover:   "#151f30",
  border:      "rgba(255,255,255,0.07)",
  borderHover: "rgba(99,102,241,0.4)",
  primary:     "#2563EB",
  secondary:   "#7C3AED",
  accent:      "#9333EA",
  success:     "#10B981",
  warning:     "#F59E0B",
  danger:      "#EF4444",
  cyan:        "#06B6D4",
  textPrimary: "#F8FAFC",
  textSecondary:"#94A3B8",
  textMuted:   "#475569",
};

const glassStyle = {
  background: `${C.card}`,
  border: `1px solid ${C.border}`,
  borderRadius: "16px",
  backdropFilter: "blur(12px)",
};

/* ─── Stat Card ──────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, sub, color, glow }: {
  icon: any; label: string; value: string | number; sub?: string; color: string; glow: string;
}) {
  return (
    <div style={{
      ...glassStyle,
      padding: "20px",
      transition: "all 0.3s ease",
      position: "relative",
      overflow: "hidden",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${glow}40`;
        (e.currentTarget as HTMLDivElement).style.borderColor = `${color}50`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        (e.currentTarget as HTMLDivElement).style.borderColor = C.border;
      }}
    >
      {/* Glow bg */}
      <div style={{
        position: "absolute", top: "-20px", right: "-20px",
        width: "80px", height: "80px", borderRadius: "50%",
        background: `radial-gradient(circle, ${glow}20 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ color: C.textSecondary, fontSize: "12px", fontWeight: 500, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {label}
          </p>
          <p style={{ color: C.textPrimary, fontSize: "28px", fontWeight: 700, lineHeight: 1 }}>
            {value}
          </p>
          {sub && <p style={{ color: C.textMuted, fontSize: "12px", marginTop: "6px" }}>{sub}</p>}
        </div>
        <div style={{
          width: "44px", height: "44px", borderRadius: "12px",
          background: `${glow}20`, display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${glow}30`,
        }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  );
}

/* ─── Status Badge ───────────────────────────────────────────────────────── */
function StatusBadge({ status, lang }: { status: string; lang: string }) {
  const map: Record<string, { label: string; labelAr: string; color: string; bg: string }> = {
    active:    { label: "Active",    labelAr: "نشط",    color: C.success, bg: `${C.success}20` },
    inactive:  { label: "Inactive",  labelAr: "غير نشط", color: C.textMuted, bg: "rgba(71,85,105,0.3)" },
    suspended: { label: "Suspended", labelAr: "موقوف",  color: C.danger,  bg: `${C.danger}20` },
  };
  const s = map[status] || { label: status, labelAr: status, color: C.textMuted, bg: "rgba(71,85,105,0.3)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 10px", borderRadius: "20px",
      background: s.bg, color: s.color,
      fontSize: "12px", fontWeight: 600,
      border: `1px solid ${s.color}30`,
    }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {lang === "ar" ? s.labelAr : s.label}
    </span>
  );
}

/* ─── Online Badge ───────────────────────────────────────────────────────── */
function OnlineBadge({ isOnline, lang }: { isOnline: boolean; lang: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 8px", borderRadius: "12px",
      background: isOnline ? `${C.success}20` : "rgba(71,85,105,0.2)",
      color: isOnline ? C.success : C.textMuted,
      fontSize: "11px", fontWeight: 600,
    }}>
      <span style={{
        width: "5px", height: "5px", borderRadius: "50%",
        background: isOnline ? C.success : C.textMuted,
        display: "inline-block",
        ...(isOnline ? {
          boxShadow: `0 0 6px ${C.success}`,
          animation: "pulse-dot 1.5s ease-in-out infinite",
        } : {}),
      }} />
      {isOnline ? (lang === "ar" ? "متصل الآن" : "Online") : (lang === "ar" ? "غير متصل" : "Offline")}
    </span>
  );
}

/* ─── Avatar ─────────────────────────────────────────────────────────────── */
function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name ? name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() : "?";
  return (
    <div style={{
      width: "36px", height: "36px", borderRadius: "10px",
      background: `linear-gradient(135deg, ${color}30, ${color}10)`,
      border: `1px solid ${color}30`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "13px", fontWeight: 700, color,
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function Clients() {
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();
  const isAr = language === "ar";

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingClient, setEditingClient] = useState<any>(null);
  const [changePlanClient, setChangePlanClient] = useState<any>(null);
  const [deletingClient, setDeletingClient] = useState<any>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  const { data: _clientsListData, isLoading, refetch } = trpc.users.list.useQuery({
    role: "client",
    search: searchQuery || undefined,
    limit: 1000,
    page: 1,
  });
  const clients: any[] | undefined = (_clientsListData as any)?.users ?? (_clientsListData as any);

  // جلب العملاء المتصلين حالياً من جلسات الموقع (تحديث كل 30 ثانية)
  // يعمل لجميع الأدوار - الـ backend يُطبق tenant isolation تلقائياً
  const { data: onlineData } = trpc.users.getOnlineClients.useQuery(
    undefined,
    { refetchInterval: 30_000, enabled: !!user }
  );
  const onlineSet = new Set<number>((onlineData?.onlineUserIds ?? []) as number[]);
  const onlineCount = onlineData?.onlineCount ?? 0;

  const filteredClients = clients
    ?.filter((c: any) => c.role !== 'owner' && c.role !== 'super_admin')
    ?.filter((c: any) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "online") return onlineSet.has(Number(c.id));
      return c.status === statusFilter;
    });

  const { sortedData: sortedClients, sortColumn, sortDirection, handleSort } = useSorting(
    filteredClients, "createdAt", "desc"
  );

  const { paginatedData: paginatedClients, currentPage, totalPages, totalItems, itemsPerPage, setCurrentPage } =
    usePagination(sortedClients, 15);

  /* Mutations */
  const createClient = trpc.users.createClientByAdmin.useMutation({
    onSuccess: () => { toast.success(isAr ? "تم إنشاء العميل بنجاح" : "Client created"); setIsAddDialogOpen(false); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => { toast.success(isAr ? "تم حذف المستخدم" : "User deleted"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const { data: permissionPlans } = trpc.permissionPlans.list.useQuery();
  const changeClientPlan = trpc.users.changeClientPlan.useMutation({
    onSuccess: (data: any) => {
      toast.success(isAr ? `تم تغيير الخطة إلى ${data.planName}` : `Plan changed to ${data.planName}`);
      setChangePlanClient(null); setSelectedPlanId(""); refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const impersonateUser = trpc.auth.impersonateUser.useMutation({
    onSuccess: (data) => {
      toast.success(`تم الدخول كـ ${data.targetUser?.name || data.targetUser?.username}`);
      setTimeout(() => window.location.replace("/dashboard"), 600);
    },
    onError: (e) => toast.error(e.message),
  });
  const { data: allSmsStatus, refetch: refetchSmsStatus } = trpc.notificationChannels.getAllOwnersSmsStatus.useQuery(
    undefined, { enabled: user?.role === 'super_admin' }
  );
  const adminToggleSms = trpc.notificationChannels.adminToggleSms.useMutation({
    onSuccess: () => { refetchSmsStatus(); toast.success(isAr ? "تم تحديث SMS" : "SMS updated"); },
    onError: (e) => toast.error(e.message),
  });
  const getClientSmsEnabled = (id: string) =>
    allSmsStatus?.find((s: any) => s.ownerId === id)?.smsAdminEnabled ?? false;
  const toggleStatus = trpc.users.updateStatus.useMutation({
    onSuccess: () => { toast.success(isAr ? "تم تحديث الحالة" : "Status updated"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat(isAr ? "ar-EG" : "en-US", { style: "currency", currency: "USD" }).format(num);
  };
  const formatDate = (date: any) => _fmtDateLib(date);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get("name") as string,
      email: fd.get("email") as string,
      phone: fd.get("phone") as string || undefined,
      address: fd.get("address") as string || undefined,
      role: "client" as const,
    };
    if (editingClient) {
      toast.info(isAr ? "سيتم إضافة هذه الميزة قريباً" : "Coming soon");
      setEditingClient(null);
    } else {
      createClient.mutate(data);
    }
  };

  /* Stats */
  const totalCount = clients?.filter((c: any) => c.role !== 'owner' && c.role !== 'super_admin').length || 0;
  const activeCount = clients?.filter((c: any) => c.status === 'active' && c.role !== 'owner' && c.role !== 'super_admin').length || 0;
  const suspendedCount = clients?.filter((c: any) => c.status === 'suspended').length || 0;
  const withBalanceCount = clients?.filter((c: any) => (c.walletBalance || 0) > 0 && c.role !== 'owner' && c.role !== 'super_admin').length || 0;

  /* Avatar colors pool */
  const avatarColors = [C.primary, C.secondary, C.cyan, C.success, C.warning, "#F472B6", "#34D399"];
  const getAvatarColor = (id: string | number) => avatarColors[String(id).charCodeAt(0) % avatarColors.length];

  return (
    <div style={{ fontFamily: "'Cairo', system-ui, sans-serif", direction: isAr ? "rtl" : "ltr" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ color: C.textPrimary, fontSize: "24px", fontWeight: 700, margin: 0 }}>
            {isAr ? "إدارة العملاء" : "Client Management"}
          </h1>
          <p style={{ color: C.textSecondary, fontSize: "14px", marginTop: "4px" }}>
            {isAr ? "إدارة العملاء والمشتركين في النظام" : "Manage clients and subscribers"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => refetch()}
            style={{
              background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: "10px", padding: "8px 14px", color: C.textSecondary,
              cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              fontSize: "13px", transition: "all 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.primary; (e.currentTarget as HTMLButtonElement).style.color = C.textPrimary; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.textSecondary; }}
          >
            <RefreshCw size={14} />
            {isAr ? "تحديث" : "Refresh"}
          </button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <button style={{
                background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})`,
                border: "none", borderRadius: "10px", padding: "9px 18px",
                color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: "7px",
                fontSize: "14px", fontWeight: 600, fontFamily: "'Cairo', sans-serif",
                boxShadow: `0 4px 16px ${C.primary}40`, transition: "all 0.2s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 24px ${C.primary}60`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 16px ${C.primary}40`; }}
              >
                <Plus size={16} />
                {isAr ? "إضافة عميل" : "Add Client"}
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isAr ? "إضافة عميل جديد" : "Add New Client"}</DialogTitle>
                <DialogDescription>{isAr ? "أدخل بيانات العميل الجديد" : "Enter the new client's information"}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2"><Label>{t("common.name")}</Label><Input name="name" required /></div>
                  <div className="space-y-2"><Label>{t("common.email")}</Label><Input name="email" type="email" required /></div>
                  <div className="space-y-2"><Label>{t("common.phone")}</Label><Input name="phone" type="tel" /></div>
                  <div className="space-y-2"><Label>{isAr ? "العنوان" : "Address"}</Label><Input name="address" /></div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t("common.cancel")}</Button>
                  <Button type="submit" disabled={createClient.isPending}>
                    {createClient.isPending ? (isAr ? "جاري الإنشاء..." : "Creating...") : t("common.save")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <StatCard icon={Users}      label={isAr ? "إجمالي العملاء" : "Total Clients"} value={totalCount}      sub={isAr ? "جميع العملاء" : "All clients"}        color={C.primary}   glow={C.primary} />
        <StatCard icon={Activity}    label={isAr ? "متصلون الآن" : "Online Now"}        value={onlineCount}     sub={isAr ? "نشطون في الموقع" : "Active on site"}    color={C.success}   glow={C.success} />
        <StatCard icon={ShieldOff}   label={isAr ? "موقوفون" : "Suspended"}           value={suspendedCount}  sub={isAr ? "بحاجة مراجعة" : "Need review"}        color={C.danger}    glow={C.danger} />
        <StatCard icon={DollarSign}  label={isAr ? "لديهم رصيد" : "With Balance"}     value={withBalanceCount} sub={isAr ? "رصيد إيجابي" : "Positive balance"}   color={C.cyan}      glow={C.cyan} />
      </div>

      {/* ── Search + Filter Bar ── */}
      <div style={{ ...glassStyle, padding: "16px 20px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={15} style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [isAr ? "right" : "left"]: "12px", color: C.textMuted, pointerEvents: "none" }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بالاسم أو البريد الإلكتروني..." : "Search by name or email..."}
            style={{
              width: "100%", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
              borderRadius: "10px", padding: isAr ? "9px 38px 9px 14px" : "9px 14px 9px 38px",
              color: C.textPrimary, fontSize: "14px", outline: "none", fontFamily: "'Cairo', sans-serif",
              boxSizing: "border-box",
            }}
            onFocus={e => (e.target.style.borderColor = C.primary)}
            onBlur={e => (e.target.style.borderColor = C.border)}
          />
        </div>
        {/* Status Filter */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { value: "all",       label: isAr ? "الكل" : "All" },
            { value: "online",    label: isAr ? "متصلون الآن" : "Online Now" },
            { value: "active",    label: isAr ? "نشط" : "Active" },
            { value: "suspended", label: isAr ? "موقوف" : "Suspended" },
            { value: "inactive",  label: isAr ? "غير نشط" : "Inactive" },
          ].map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)} style={{
              padding: "7px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 500,
              cursor: "pointer", fontFamily: "'Cairo', sans-serif", transition: "all 0.2s",
              background: statusFilter === f.value ? `${C.primary}20` : "transparent",
              color: statusFilter === f.value ? C.primary : C.textSecondary,
              border: `1px solid ${statusFilter === f.value ? C.primary + "50" : C.border}`,
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ color: C.textMuted, fontSize: "13px", marginRight: "auto" }}>
          {isAr ? `${totalItems} عميل` : `${totalItems} clients`}
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ ...glassStyle, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Cairo', sans-serif" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {[
                  { key: "name",          label: isAr ? "العميل" : "Client" },
                  { key: "email",         label: isAr ? "البريد الإلكتروني" : "Email" },
                  { key: "phone",         label: isAr ? "الهاتف" : "Phone" },
                  { key: "walletBalance", label: isAr ? "الرصيد" : "Balance" },
                  { key: "status",        label: isAr ? "الحالة" : "Status" },
                  { key: "createdAt",     label: isAr ? "تاريخ الإنشاء" : "Created" },
                  { key: "lastSignedIn",  label: isAr ? "آخر دخول" : "Last Login" },
                  { key: "actions",       label: isAr ? "الإجراءات" : "Actions" },
                ].map(col => (
                  <th key={col.key}
                    onClick={() => col.key !== "actions" && handleSort(col.key)}
                    style={{
                      padding: "14px 16px", textAlign: isAr ? "right" : "left",
                      color: C.textSecondary, fontSize: "12px", fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      cursor: col.key !== "actions" ? "pointer" : "default",
                      whiteSpace: "nowrap", background: "rgba(255,255,255,0.02)",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      {col.label}
                      {sortColumn === col.key && (
                        <span style={{ color: C.primary }}>{sortDirection === "asc" ? " ↑" : " ↓"}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} style={{ padding: "16px" }}>
                        <div style={{
                          height: "14px", borderRadius: "6px",
                          background: "rgba(255,255,255,0.05)",
                          width: j === 0 ? "140px" : j === 7 ? "40px" : "80px",
                          animation: "pulse 1.5s ease-in-out infinite",
                        }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginatedClients?.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "60px 20px", textAlign: "center" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `${C.primary}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Users size={24} color={C.primary} />
                      </div>
                      <p style={{ color: C.textSecondary, fontSize: "15px", fontWeight: 500 }}>
                        {isAr ? "لا يوجد عملاء" : "No clients found"}
                      </p>
                      <p style={{ color: C.textMuted, fontSize: "13px" }}>
                        {isAr ? "ابدأ بإضافة عميل جديد" : "Start by adding a new client"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedClients?.map((client: any, idx: number) => (
                  <tr key={client.id}
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.025)"}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
                  >
                    {/* Name + Online */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Avatar name={client.name || client.username || "?"} color={getAvatarColor(client.id)} />
                        <div>
                          <p style={{ color: C.textPrimary, fontSize: "14px", fontWeight: 600, margin: 0 }}>
                            {client.name || client.username}
                          </p>
                          <OnlineBadge isOnline={onlineSet.has(Number(client.id))} lang={language} />
                        </div>
                      </div>
                    </td>
                    {/* Email */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", color: C.textSecondary, fontSize: "13px" }}>
                        <Mail size={13} color={C.textMuted} />
                        {client.email}
                      </div>
                    </td>
                    {/* Phone */}
                    <td style={{ padding: "14px 16px" }}>
                      {client.phone ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: C.textSecondary, fontSize: "13px" }}>
                          <Phone size={13} color={C.textMuted} />
                          {client.phone}
                        </div>
                      ) : <span style={{ color: C.textMuted, fontSize: "13px" }}>—</span>}
                    </td>
                    {/* Balance */}
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Wallet size={13} color={(client.walletBalance || 0) > 0 ? C.success : C.textMuted} />
                        <span style={{
                          color: (client.walletBalance || 0) > 0 ? C.success : C.textSecondary,
                          fontSize: "13px", fontWeight: 600,
                        }}>
                          {formatCurrency(client.walletBalance || "0")}
                        </span>
                      </div>
                    </td>
                    {/* Status */}
                    <td style={{ padding: "14px 16px" }}>
                      <StatusBadge status={client.status} lang={language} />
                    </td>
                    {/* Created */}
                    <td style={{ padding: "14px 16px", color: C.textSecondary, fontSize: "13px" }}>
                      {formatDate(client.createdAt)}
                    </td>
                    {/* Last Login */}
                    <td style={{ padding: "14px 16px", color: C.textSecondary, fontSize: "13px" }}>
                      {client.lastSignedIn ? formatDate(client.lastSignedIn) : (
                        <span style={{ color: C.textMuted }}>{isAr ? "لم يدخل بعد" : "Never"}</span>
                      )}
                    </td>
                    {/* Actions */}
                    <td style={{ padding: "14px 16px" }}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button style={{
                            background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
                            borderRadius: "8px", padding: "6px 8px", cursor: "pointer",
                            color: C.textSecondary, display: "flex", alignItems: "center",
                            transition: "all 0.2s",
                          }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${C.primary}20`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${C.primary}50`; (e.currentTarget as HTMLButtonElement).style.color = C.primary; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.textSecondary; }}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isAr ? "start" : "end"}>
                          <DropdownMenuItem onClick={() => setEditingClient(client)}>
                            <Edit className={`h-4 w-4 ${isAr ? "ml-2" : "mr-2"}`} />
                            {t("common.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.info(isAr ? "قريباً" : "Coming soon")}>
                            <Activity className={`h-4 w-4 ${isAr ? "ml-2" : "mr-2"}`} />
                            {isAr ? "عرض الاشتراكات" : "View Subscriptions"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-orange-500 focus:text-orange-500 font-medium"
                            onClick={async () => {
                              if (await window.confirmOperation(isAr
                                ? `ستدخل كـ "${client.name || client.username}". متأكد؟`
                                : `Login as "${client.name || client.username}"?`
                              , isAr ? "الدخول كعميل" : "Login as client", "primary")) impersonateUser.mutate({ targetUserId: client.id });
                            }}
                            disabled={impersonateUser.isPending}
                          >
                            <LogIn className={`h-4 w-4 ${isAr ? "ml-2" : "mr-2"}`} />
                            {isAr ? "دخول كـ هذا العميل" : "Login as client"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setChangePlanClient(client); setSelectedPlanId(client.permissionPlanId?.toString() || ""); }}>
                            <CreditCard className={`h-4 w-4 ${isAr ? "ml-2" : "mr-2"}`} />
                            {isAr ? "تغيير الخطة" : "Change Plan"}
                          </DropdownMenuItem>
                          {user?.role === 'super_admin' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => adminToggleSms.mutate({ targetOwnerId: client.id, enabled: !getClientSmsEnabled(client.id) })}
                                disabled={adminToggleSms.isPending}
                                className={getClientSmsEnabled(client.id) ? 'text-orange-500' : 'text-green-600'}
                              >
                                <Smartphone className={`h-4 w-4 ${isAr ? "ml-2" : "mr-2"}`} />
                                {getClientSmsEnabled(client.id) ? (isAr ? "تعطيل SMS" : "Disable SMS") : (isAr ? "تفعيل SMS" : "Enable SMS")}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          {client.status === "active" ? (
                            <DropdownMenuItem className="text-destructive" onClick={() => toggleStatus.mutate({ userId: client.id, status: "suspended" })}>
                              <Ban className={`h-4 w-4 ${isAr ? "ml-2" : "mr-2"}`} />
                              {isAr ? "إيقاف" : "Suspend"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => toggleStatus.mutate({ userId: client.id, status: "active" })}>
                              <CheckCircle className={`h-4 w-4 ${isAr ? "ml-2" : "mr-2"}`} />
                              {isAr ? "تفعيل" : "Activate"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeletingClient(client)}>
                            <Trash2 className={`h-4 w-4 ${isAr ? "ml-2" : "mr-2"}`} />
                            {isAr ? "حذف" : "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}` }}>
            <DataPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* ── Change Plan Dialog ── */}
      <Dialog open={!!changePlanClient} onOpenChange={open => { if (!open) { setChangePlanClient(null); setSelectedPlanId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "تغيير خطة العميل" : "Change Client Plan"}</DialogTitle>
            <DialogDescription>
              {isAr ? `تغيير خطة ${changePlanClient?.name || changePlanClient?.username}` : `Change plan for ${changePlanClient?.name || changePlanClient?.username}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{isAr ? "الخطة الحالية" : "Current Plan"}</Label>
              <p className="text-sm text-muted-foreground">{changePlanClient?.planName || (isAr ? "بدون خطة" : "No plan")}</p>
            </div>
            <div className="space-y-2">
              <Label>{isAr ? "الخطة الجديدة" : "New Plan"}</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger><SelectValue placeholder={isAr ? "اختر خطة" : "Select a plan"} /></SelectTrigger>
                <SelectContent>
                  {permissionPlans?.map((plan: any) => (
                    <SelectItem key={plan.id} value={plan.id.toString()}>
                      {isAr ? (plan.nameAr || plan.name) : plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangePlanClient(null); setSelectedPlanId(""); }}>{t("common.cancel")}</Button>
            <Button onClick={() => { if (selectedPlanId && changePlanClient) changeClientPlan.mutate({ userId: changePlanClient.id, planId: parseInt(selectedPlanId) }); }} disabled={!selectedPlanId || changeClientPlan.isPending}>
              {changeClientPlan.isPending ? (isAr ? "جاري التغيير..." : "Changing...") : (isAr ? "تغيير الخطة" : "Change Plan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <AlertDialog open={!!deletingClient} onOpenChange={open => { if (!open) setDeletingClient(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? "تأكيد الحذف" : "Confirm Deletion"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? `هل أنت متأكد من حذف العميل "${deletingClient?.name || deletingClient?.username}"؟ لا يمكن التراجع.`
                : `Delete "${deletingClient?.name || deletingClient?.username}"? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingClient(null)}>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deletingClient) { deleteUser.mutate({ userId: deletingClient.id }); setDeletingClient(null); } }}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? (isAr ? "جاري الحذف..." : "Deleting...") : (isAr ? "نعم، احذف" : "Yes, Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editingClient} onOpenChange={open => !open && setEditingClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "تعديل العميل" : "Edit Client"}</DialogTitle>
          </DialogHeader>
          {editingClient && (
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>{t("common.name")}</Label><Input name="name" defaultValue={editingClient.name} required /></div>
                <div className="space-y-2"><Label>{t("common.email")}</Label><Input name="email" type="email" defaultValue={editingClient.email} required /></div>
                <div className="space-y-2"><Label>{t("common.phone")}</Label><Input name="phone" type="tel" defaultValue={editingClient.phone || ""} /></div>
                <div className="space-y-2"><Label>{isAr ? "العنوان" : "Address"}</Label><Input name="address" defaultValue={editingClient.address || ""} /></div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingClient(null)}>{t("common.cancel")}</Button>
                <Button type="submit">{t("common.save")}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
