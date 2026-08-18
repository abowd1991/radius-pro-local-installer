import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { parseDbDate as _parseDb, formatDate as _fmtDateLib } from '@/lib/dateFormat';
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { dateTimeLocalToUtcIso, nowDateTimeLocal } from "@/lib/timezoneV6";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CreateManualCardDialog } from "@/components/CreateManualCardDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Copy,
  RefreshCw,
  UserCheck,
  Eye,
  EyeOff,
  Users,
  Pencil,
  RotateCcw,
  MessageSquare,
  Lock,
  Zap,
  Calendar,
  Phone,
  Clock,
  Timer,
  Send,
  WifiOff,
  Gauge,
  Download,
  Upload,
} from "lucide-react";
import { DataPagination } from "@/components/ui/data-pagination";
import { Progress } from "@/components/ui/progress";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status, language }: { status: string; language: string }) {
  const cfg: Record<string, { className: string; labelAr: string; labelEn: string }> = {
    unused:    { className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",     labelAr: "غير مستخدم", labelEn: "Unused" },
    active:    { className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", labelAr: "نشط",        labelEn: "Active" },
    used:      { className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800",         labelAr: "مستخدم",     labelEn: "Used" },
    expired:   { className: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800",               labelAr: "منتهي",      labelEn: "Expired" },
    suspended: { className: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border-orange-200 dark:border-orange-800", labelAr: "موقوف",   labelEn: "Suspended" },
    cancelled: { className: "bg-gray-50 text-gray-500 dark:bg-gray-900/40 dark:text-gray-500 border-gray-200 dark:border-gray-700",         labelAr: "ملغي",       labelEn: "Cancelled" },
  };
  const c = cfg[status] || cfg.unused;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.className}`}>
      {language === "ar" ? c.labelAr : c.labelEn}
    </span>
  );
}

function formatDate(date: Date | string | null | undefined): string {
  return _fmtDateLib(date);
}

function formatSeconds(seconds: number | null | undefined, language: string): string {
  if (!seconds || seconds === 0) return language === "ar" ? "بدون حد" : "Unlimited";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}${language === "ar" ? "س" : "h"} ${m}${language === "ar" ? "د" : "m"}`;
  if (h > 0) return `${h} ${language === "ar" ? "ساعة" : "h"}`;
  return `${m} ${language === "ar" ? "دقيقة" : "min"}`;
}

function formatWindow(seconds: number | null | undefined, language: string): string {
  if (!seconds || seconds === 0) return language === "ar" ? "بدون نافذة" : "No window";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d} ${language === "ar" ? "يوم" : "d"}`;
  return `${h} ${language === "ar" ? "ساعة" : "h"}`;
}

function getExpiryInfo(card: any, language: string) {
  if (!card.expiresAt) {
    return { label: language === 'ar' ? 'بدون حد' : 'No limit', progress: 100, color: 'bg-slate-400', daysLeft: null };
  }
  const now = new Date();
  const expiresAt = _parseDb(card.expiresAt) ?? new Date(card.expiresAt);
  const createdAt = _parseDb(card.createdAt) ?? new Date(card.createdAt);
  const totalMs = expiresAt.getTime() - createdAt.getTime();
  const remainingMs = expiresAt.getTime() - now.getTime();
  const daysLeft = Math.ceil(remainingMs / 86400000);
  if (remainingMs <= 0) {
    return { label: language === 'ar' ? 'منتهي' : 'Expired', progress: 0, color: 'bg-red-500', daysLeft: 0 };
  }
  const progress = Math.max(5, Math.min(100, (remainingMs / totalMs) * 100));
  let color = 'bg-emerald-500';
  let label = '';
  if (daysLeft <= 3) {
    color = 'bg-red-500';
    label = language === 'ar' ? `يتبقى ${daysLeft} يوم` : `${daysLeft}d left`;
  } else if (daysLeft <= 7) {
    color = 'bg-amber-500';
    label = language === 'ar' ? `يتبقى ${daysLeft} أيام` : `${daysLeft}d left`;
  } else {
    label = language === 'ar' ? `يتبقى ${daysLeft} يوم` : `${daysLeft}d left`;
  }
  return { label, progress, color, daysLeft };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ManualCards() {
  const { user } = useAuth();
  const { language, direction } = useLanguage();
  const { timezone } = useTimezoneV6();
  const isAdmin = user?.role === "owner" || user?.role === "super_admin";

  // ── Filters ──
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // ── UI state ──
  const [createOpen, setCreateOpen] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});

  // ── Delete dialog ──
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<any>(null);

  // ── Edit card dialog ──
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCardForEdit, setSelectedCardForEdit] = useState<any>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editForm, setEditForm] = useState({
    username: "",
    password: "",
    planId: "",
    notes: "",
    fullName: "",
    phone: "",
    simultaneousUse: "1",
    macAddress: "",
  });

  // ── Renew dialog ──
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [selectedCardForRenew, setSelectedCardForRenew] = useState<any>(null);
  const [renewType, setRenewType] = useState<"custom_duration" | "custom">("custom_duration");
  const [renewDurationValue, setRenewDurationValue] = useState("1");
  const [renewDurationUnit, setRenewDurationUnit] = useState<"hours" | "days" | "weeks" | "months">("months");
  const [renewCustomDate, setRenewCustomDate] = useState("");
  const [renewWindowHours, setRenewWindowHours] = useState("0");
  const [renewWindowMinutes, setRenewWindowMinutes] = useState("0");

  // ── Notes dialog ──
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [selectedCardForNotes, setSelectedCardForNotes] = useState<any>(null);
  const [notesValue, setNotesValue] = useState("");

  // ── Kick dialog ──
  const [kickDialogOpen, setKickDialogOpen] = useState(false);
  const [cardToKick, setCardToKick] = useState<any>(null);

  // ── Speed dialog ──
  const [speedDialogOpen, setSpeedDialogOpen] = useState(false);
  const [cardForSpeed, setCardForSpeed] = useState<any>(null);
  const [downloadSpeed, setDownloadSpeed] = useState("");
  const [uploadSpeed, setUploadSpeed] = useState("");
  const [speedPreset, setSpeedPreset] = useState("");
  // ── SMS dialog ──
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [cardForSms, setCardForSms] = useState<any>(null);
  const [smsMessage, setSmsMessage] = useState("");

  const SPEED_PRESETS = [
    { label: '512 Kbps', download: 0.5, upload: 0.5 },
    { label: '1 Mbps', download: 1, upload: 1 },
    { label: '2 Mbps', download: 2, upload: 1 },
    { label: '4 Mbps', download: 4, upload: 2 },
    { label: '8 Mbps', download: 8, upload: 4 },
    { label: '20 Mbps', download: 20, upload: 10 },
  ];

  const utils = trpc.useUtils();

  // ── Data queries ──
  const { data, isLoading, refetch } = trpc.vouchers.getManualCards.useQuery({
    page,
    limit,
    search: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    clientId: clientFilter,
  });

  const { data: clientsData } = trpc.users.getClientsWithSubscription.useQuery(
    { limit: 200 },
    { enabled: isAdmin }
  );

  const { data: plansData } = trpc.plans.list.useQuery();

  // ── Mutations ──
  const sendSmsMutation = trpc.vouchers.sendManualCardSms.useMutation({
    onSuccess: (data) => {
      toast.success(language === "ar" ? `تم إرسال الرسالة بنجاح. الرصيد المتبقي: ${data.remainingBalance} رسالة` : `Message sent. Remaining: ${data.remainingBalance}`);
      setSmsDialogOpen(false);
      setCardForSms(null);
      setSmsMessage("");
    },
    onError: (err) => toast.error(err.message),
  });
  const SMS_TEMPLATES = [
    { labelAr: 'بيانات الكرت (افتراضي)', labelEn: 'Card credentials (default)', value: '' },
    { labelAr: 'تذكير انتهاء الكرت', labelEn: 'Expiry reminder', value: 'مرحباً {name}، كرت الإنترنت سينتهي قريباً. يرجى التجديد لتجنب انقطاع الخدمة.' },
    { labelAr: 'يرجى الدفع', labelEn: 'Payment reminder', value: 'مرحباً {name}، يرجى سداد المستحقات لاستمرار الخدمة. اسم المستخدم: {username}' },
    { labelAr: 'إرسال بيانات الدخول', labelEn: 'Send login details', value: 'مرحباً {name}،\nاسم المستخدم: {username}\nكلمة المرور: {password}' },
  ];

  const deleteMutation = trpc.vouchers.deleteCard.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حذف الكرت بنجاح" : "Card deleted");
      setDeleteDialogOpen(false);
      setCardToDelete(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const suspendMutation = trpc.vouchers.suspend.useMutation({
    onSuccess: () => { toast.success(language === "ar" ? "تم إيقاف الكرت" : "Card suspended"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const unsuspendMutation = trpc.vouchers.unsuspend.useMutation({
    onSuccess: () => { toast.success(language === "ar" ? "تم تفعيل الكرت" : "Card activated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateCardMutation = trpc.vouchers.updateCard.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حفظ التعديلات" : "Changes saved");
      setEditDialogOpen(false);
      setSelectedCardForEdit(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const renewCardMutation = trpc.vouchers.renewCard.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تجديد الصلاحية بنجاح" : "Card renewed successfully");
      setRenewDialogOpen(false);
      setSelectedCardForRenew(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Kick mutation ──
  const kickCardMutation = trpc.sessions.coaDisconnect.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم طرد الكرت بنجاح" : "Card disconnected successfully");
      setKickDialogOpen(false);
      setCardToKick(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Change speed mutation ──
  const changeSpeedMutation = trpc.sessions.mikrotikChangeSpeed.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تغيير السرعة بنجاح" : "Speed changed successfully");
      setSpeedDialogOpen(false);
      setCardForSpeed(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateNotesMutation = trpc.vouchers.updateNotes.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حفظ الملاحظة" : "Notes saved");
      setNotesDialogOpen(false);
      setSelectedCardForNotes(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Handlers ──
  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() =>
      toast.success(language === "ar" ? `تم نسخ ${label}` : `${label} copied`)
    );
  }, [language]);

  const togglePassword = (id: number) =>
    setShowPasswords((p) => ({ ...p, [id]: !p[id] }));

  const openEdit = (card: any) => {
    setSelectedCardForEdit(card);
    setEditForm({
      username: card.username || "",
      password: card.password || "",
      planId: String(card.planId || ""),
      notes: card.notes || "",
      fullName: card.fullName || "",
      phone: card.phone || "",
      simultaneousUse: String(card.simultaneousUse || 1),
      macAddress: card.macAddress || "",
    });
    setShowEditPassword(false);
    setEditDialogOpen(true);
  };

  const openRenew = (card: any) => {
    setSelectedCardForRenew(card);
    setRenewType("custom_duration");
    setRenewDurationValue("1");
    setRenewDurationUnit("months");
    setRenewCustomDate("");
    setRenewWindowHours("0");
    setRenewWindowMinutes("0");
    setRenewDialogOpen(true);
  };

  const openNotes = (card: any) => {
    setSelectedCardForNotes(card);
    setNotesValue(card.notes || "");
    setNotesDialogOpen(true);
  };

  const cards = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  // ── Online status ──
  const cardLifecycleIds = useMemo(() => cards.map((c: any) => c.lifecycleId).filter(Boolean), [cards]);
  const vouchersAny = trpc.vouchers as any;
  const { data: onlineCardIdsRaw } = vouchersAny.getOnlineCardIds.useQuery(
    { lifecycleIds: cardLifecycleIds },
    { enabled: cardLifecycleIds.length > 0, refetchInterval: 30_000 }
  );
  const onlineSet = useMemo(() => new Set<number>(onlineCardIdsRaw ?? []), [onlineCardIdsRaw]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-5" dir={direction}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <UserCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {language === "ar" ? "الكروت اليدوية" : "Manual Cards"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {language === "ar" ? "إدارة الكروت المُنشأة يدوياً مع بيانات العملاء" : "Manage manually created cards with customer data"}
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {language === "ar" ? "إنشاء كرت جديد" : "New Manual Card"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: language === "ar" ? "إجمالي الكروت" : "Total", value: total, color: "text-foreground" },
          { label: language === "ar" ? "نشط" : "Active", value: cards.filter((c: any) => c.status === "active").length, color: "text-emerald-600 dark:text-emerald-400" },
          { label: language === "ar" ? "غير مستخدم" : "Unused", value: cards.filter((c: any) => c.status === "unused").length, color: "text-slate-600 dark:text-slate-400" },
          { label: language === "ar" ? "منتهي" : "Expired", value: cards.filter((c: any) => c.status === "expired").length, color: "text-red-600 dark:text-red-400" },
        ].map((s, i) => (
          <Card key={i} className="border border-border/60">
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border border-border/60">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={language === "ar" ? "بحث باسم المستخدم أو الاسم الكامل أو الهاتف..." : "Search by username, full name or phone..."}
                className="ps-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder={language === "ar" ? "الحالة" : "Status"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === "ar" ? "كل الحالات" : "All Status"}</SelectItem>
                <SelectItem value="unused">{language === "ar" ? "غير مستخدم" : "Unused"}</SelectItem>
                <SelectItem value="active">{language === "ar" ? "نشط" : "Active"}</SelectItem>
                <SelectItem value="used">{language === "ar" ? "مستخدم" : "Used"}</SelectItem>
                <SelectItem value="expired">{language === "ar" ? "منتهي" : "Expired"}</SelectItem>
                <SelectItem value="suspended">{language === "ar" ? "موقوف" : "Suspended"}</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select
                value={clientFilter ? String(clientFilter) : "all"}
                onValueChange={(v) => { setClientFilter(v === "all" ? undefined : Number(v)); setPage(1); }}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder={language === "ar" ? "كل العملاء" : "All Clients"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === "ar" ? "كل العملاء" : "All Clients"}</SelectItem>
                  {clientsData?.clients?.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name || c.username || `#${c.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="icon" onClick={() => refetch()} className="shrink-0">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border border-border/60">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {language === "ar" ? `عرض ${cards.length} من ${total} كرت` : `Showing ${cards.length} of ${total} cards`}
            </CardTitle>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100, 200].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow className="border-b border-border/60 bg-muted/30">
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 text-center w-[52px]">
                    {language === "ar" ? "إجراءات" : "Actions"}
                  </TableHead>
                  {isAdmin && (
                    <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[130px]">
                      {language === "ar" ? "العميل" : "Client"}
                    </TableHead>
                  )}
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[140px]">
                    {language === "ar" ? "الاسم الكامل" : "Full Name"}
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[120px]">
                    {language === "ar" ? "الهاتف" : "Phone"}
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[110px]">
                    {language === "ar" ? "اسم المستخدم" : "Username"}
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[120px]">
                    {language === "ar" ? "كلمة المرور" : "Password"}
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[100px]">
                    {language === "ar" ? "الخدمة" : "Plan"}
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[80px]">
                    {language === "ar" ? "الحالة" : "Status"}
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[160px]">
                    {language === "ar" ? "الصلاحية" : "Validity"}
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[90px]">
                    {language === "ar" ? "وقت الكرت" : "Session"}
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-muted-foreground px-3 w-[120px]">
                    {language === "ar" ? "الملاحظة" : "Notes"}
                  </TableHead>

                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 12 : 11} className="text-center py-12 text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                      {language === "ar" ? "جاري التحميل..." : "Loading..."}
                    </TableCell>
                  </TableRow>
                ) : cards.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 12 : 11} className="text-center py-12 text-muted-foreground">
                      <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{language === "ar" ? "لا توجد كروت يدوية" : "No manual cards found"}</p>
                      <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-3.5 w-3.5" />
                        {language === "ar" ? "إنشاء أول كرت" : "Create first card"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  cards.map((card: any) => {
                    const isOnlineCard = onlineSet.has(card.id);
                    return (
                     <TableRow key={card.id} className={`border-b border-border/40 transition-colors ${isOnlineCard ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20' : 'hover:bg-muted/20'}`}>
                      {/* Actions - first column (rightmost in RTL) */}
                      <TableCell className="px-3 py-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => handleCopy(`${card.username}\n${card.password || ""}`, language === "ar" ? "بيانات الكرت" : "Card credentials")}>
                              <Copy className="h-4 w-4 me-2" />
                              {language === "ar" ? "نسخ البيانات" : "Copy credentials"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEdit(card)}>
                              <Pencil className="h-4 w-4 me-2 text-blue-500" />
                              {language === "ar" ? "تعديل الكرت" : "Edit card"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openRenew(card)}>
                              <RotateCcw className="h-4 w-4 me-2 text-emerald-500" />
                              {language === "ar" ? "تجديد الكرت" : "Renew card"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openNotes(card)}>
                              <MessageSquare className="h-4 w-4 me-2 text-yellow-500" />
                              {language === "ar" ? "تعديل الملاحظة" : "Edit notes"}
                            </DropdownMenuItem>
                            {card.phone && (
                              <DropdownMenuItem
                                onClick={() => { setCardForSms(card); setSmsMessage(""); setSmsDialogOpen(true); }}
                              >
                                <Send className="h-4 w-4 me-2 text-blue-500" />
                                {language === "ar" ? "إرسال عبر SMS" : "Send via SMS"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {card.status === "suspended" ? (
                              <DropdownMenuItem onClick={() => unsuspendMutation.mutate({ cardId: card.id })}>
                                <UserCheck className="h-4 w-4 me-2 text-emerald-500" />
                                {language === "ar" ? "تفعيل الكرت" : "Activate card"}
                              </DropdownMenuItem>
                            ) : card.status !== "expired" && card.status !== "used" ? (
                              <DropdownMenuItem onClick={() => suspendMutation.mutate({ cardId: card.id })}>
                                <UserCheck className="h-4 w-4 me-2 text-orange-500" />
                                {language === "ar" ? "إيقاف الكرت" : "Suspend card"}
                              </DropdownMenuItem>
                            ) : null}
                            {/* طرد وتغيير سرعة للكروت المتصل */}
                            {onlineSet.has(card.id) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 dark:text-red-400 focus:text-red-600"
                                  onClick={() => { setCardToKick(card); setKickDialogOpen(true); }}
                                >
                                  <WifiOff className="h-4 w-4 me-2" />
                                  {language === "ar" ? "طرد الكرت" : "Disconnect Card"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => { setCardForSpeed(card); setDownloadSpeed(''); setUploadSpeed(''); setSpeedPreset(''); setSpeedDialogOpen(true); }}
                                >
                                  <Gauge className="h-4 w-4 me-2 text-sky-500" />
                                  {language === "ar" ? "تغيير السرعة" : "Change Speed"}
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setCardToDelete(card); setDeleteDialogOpen(true); }} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-4 w-4 me-2" />
                              {language === "ar" ? "حذف الكرت" : "Delete card"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      {/* Client (admin only) */}
                      {isAdmin && (
                        <TableCell className="px-3 py-3">
                          <span className="text-sm font-medium text-foreground truncate block">
                            {card.clientName || `#${card.createdBy}`}
                          </span>
                        </TableCell>
                      )}

                      {/* Full name */}
                      <TableCell className="px-3 py-3">
                        {card.fullName
                          ? <span className="text-sm font-medium text-foreground truncate block max-w-[130px]">{card.fullName}</span>
                          : <span className="text-xs text-muted-foreground/50">—</span>}
                      </TableCell>

                      {/* Phone */}
                      <TableCell className="px-3 py-3">
                        {card.phone ? (
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-foreground font-mono truncate">{card.phone}</span>
                            <button onClick={() => handleCopy(card.phone, language === "ar" ? "الهاتف" : "Phone")} className="text-muted-foreground hover:text-foreground shrink-0">
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>

                      {/* Username */}
                      <TableCell className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {onlineSet.has(card.id) && (
                            <span className="relative flex h-2 w-2 shrink-0" title={language === 'ar' ? 'متصل الآن' : 'Online now'}>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                          )}
                          <code className="text-sm font-mono bg-muted/50 px-1.5 py-0.5 rounded text-foreground truncate max-w-[75px] block">{card.username}</code>
                          <button onClick={() => handleCopy(card.username, language === "ar" ? "اسم المستخدم" : "Username")} className="text-muted-foreground hover:text-foreground shrink-0">
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </TableCell>

                      {/* Password */}
                      <TableCell className="px-3 py-3">
                        {card.password ? (
                          <div className="flex items-center gap-1">
                            <code className="text-sm font-mono bg-muted/50 px-1.5 py-0.5 rounded text-foreground min-w-[50px]">
                              {showPasswords[card.id] ? card.password : "••••••"}
                            </code>
                            <button onClick={() => togglePassword(card.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                              {showPasswords[card.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                            <button onClick={() => handleCopy(card.password, language === "ar" ? "كلمة المرور" : "Password")} className="text-muted-foreground hover:text-foreground shrink-0">
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>

                      {/* Plan */}
                      <TableCell className="px-3 py-3">
                        <span className="text-sm text-foreground truncate block max-w-[90px]">{card.planName || `#${card.planId}`}</span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="px-3 py-3">
                        <StatusBadge status={card.status} language={language} />
                      </TableCell>

                      {/* Validity Progress Bar */}
                      {(() => {
                        const expiryInfo = getExpiryInfo(card, language);
                        return (
                          <TableCell className="px-3 py-3">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-xs font-medium ${
                                  expiryInfo.daysLeft !== null && expiryInfo.daysLeft <= 3
                                    ? 'text-red-600 dark:text-red-400'
                                    : expiryInfo.daysLeft !== null && expiryInfo.daysLeft <= 7
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-muted-foreground'
                                }`}>
                                  {expiryInfo.label}
                                </span>
                                {card.expiresAt && (
                                  <span className="text-[10px] text-muted-foreground/60">
                                    {formatDate(card.expiresAt)}
                                  </span>
                                )}
                              </div>
                              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${expiryInfo.color}`}
                                  style={{ width: `${expiryInfo.progress}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                        );
                      })()}

                      {/* Session time */}
                      <TableCell className="px-3 py-3">
                        <span className="text-xs text-muted-foreground">
                          {formatSeconds(card.usageBudgetSeconds, language)}
                        </span>
                      </TableCell>

                      {/* Notes */}
                      <TableCell className="px-3 py-3">
                        {card.notes ? (
                          <span className="text-xs text-muted-foreground truncate block" title={card.notes}>{card.notes}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </TableCell>


                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-border/40">
              <DataPagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                itemsPerPage={limit}
                onPageChange={setPage}
                onItemsPerPageChange={(size) => { setLimit(size); setPage(1); }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create Dialog ── */}
      <CreateManualCardDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={() => refetch()} />

      {/* ── Delete Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent dir={direction}>
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "تأكيد الحذف" : "Confirm Delete"}</DialogTitle>
            <DialogDescription>
              {language === "ar"
                ? `هل أنت متأكد من حذف كرت "${cardToDelete?.username}"؟ لا يمكن التراجع.`
                : `Delete card "${cardToDelete?.username}"? This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{language === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending}
              onClick={() => cardToDelete && deleteMutation.mutate({ cardId: cardToDelete.id })}>
              {deleteMutation.isPending ? (language === "ar" ? "جاري الحذف..." : "Deleting...") : (language === "ar" ? "حذف" : "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Card Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={(o) => { setEditDialogOpen(o); if (!o) setSelectedCardForEdit(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir={direction}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Pencil className="h-4 w-4 text-white" />
              </div>
              {language === "ar" ? "تعديل الكرت" : "Edit Card"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar" ? `تعديل بيانات: ${selectedCardForEdit?.username || ""}` : `Edit card: ${selectedCardForEdit?.username || ""}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Customer info */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                {language === "ar" ? "بيانات العميل" : "Customer Info"}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{language === "ar" ? "الاسم الكامل" : "Full Name"}</Label>
                  <Input value={editForm.fullName} onChange={(e) => setEditForm(p => ({ ...p, fullName: e.target.value }))}
                    placeholder={language === "ar" ? "اسم العميل الكامل" : "Customer full name"} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{language === "ar" ? "رقم الهاتف" : "Phone Number"}</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder={language === "ar" ? "رقم الهاتف" : "Phone number"} className="h-11" dir="ltr" />
                </div>
              </div>
            </div>

            {/* Credentials */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                {language === "ar" ? "بيانات الدخول" : "Credentials"}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{language === "ar" ? "اسم المستخدم" : "Username"} <span className="text-destructive">*</span></Label>
                  <Input value={editForm.username} onChange={(e) => setEditForm(p => ({ ...p, username: e.target.value }))}
                    className="h-11 font-mono" dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {language === "ar" ? "كلمة المرور" : "Password"}
                    <span className="text-muted-foreground text-xs ms-1">({language === "ar" ? "اختياري" : "optional"})</span>
                  </Label>
                  <div className="relative">
                    <Input type={showEditPassword ? "text" : "password"} value={editForm.password}
                      onChange={(e) => setEditForm(p => ({ ...p, password: e.target.value }))}
                      className="h-11 font-mono pe-10" dir="ltr"
                      placeholder={language === "ar" ? "فارغ = مصادقة بالاسم فقط" : "Empty = username-only"} />
                    <button type="button" onClick={() => setShowEditPassword(v => !v)}
                      className="absolute inset-y-0 end-0 px-3 flex items-center text-muted-foreground hover:text-foreground">
                      {showEditPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Settings */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" />
                {language === "ar" ? "إعدادات الاتصال" : "Connection Settings"}
              </h3>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{language === "ar" ? "عدد الأجهزة المتزامنة" : "Simultaneous Devices"}</Label>
                <Input type="number" min={1} max={100} value={editForm.simultaneousUse}
                  onChange={(e) => setEditForm(p => ({ ...p, simultaneousUse: e.target.value }))}
                  className="h-11" dir="ltr" placeholder="1" />
              </div>
            </div>

            {/* Plan */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" />
                {language === "ar" ? "الباقة" : "Plan"}
              </h3>
              <Select
                value={editForm.planId}
                onValueChange={(v) => setEditForm(p => ({ ...p, planId: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={language === "ar" ? "اختر الباقة" : "Select plan"} />
                </SelectTrigger>
                <SelectContent>
                  {(plansData as any[])?.map((plan: any) => (
                    <SelectItem key={plan.id} value={String(plan.id)}>
                      {plan.nameAr && language === "ar" ? plan.nameAr : plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* MAC Address Binding */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {language === "ar" ? "ربط MAC Address" : "MAC Address Binding"}
                <span className="text-muted-foreground text-xs ms-1">({language === "ar" ? "اختياري" : "optional"})</span>
              </Label>
              <Input
                placeholder="AA:BB:CC:DD:EE:FF"
                value={editForm.macAddress}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9A-Fa-f:]/g, "").toUpperCase();
                  setEditForm(p => ({ ...p, macAddress: val }));
                }}
                maxLength={17}
                className="font-mono h-10"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                {language === "ar"
                  ? "إذا حددت MAC Address، سيعمل الكرت فقط من هذا الجهاز المحدد"
                  : "If set, this card will only authenticate from this specific device"}
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                <MessageSquare className="h-3.5 w-3.5 inline me-1 text-yellow-500" />
                {language === "ar" ? "ملاحظات" : "Notes"}
                <span className="text-muted-foreground text-xs ms-1">({language === "ar" ? "اختياري" : "optional"})</span>
              </Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder={language === "ar" ? "أي ملاحظات إضافية..." : "Any additional notes..."}
                value={editForm.notes}
                onChange={(e) => setEditForm(p => ({ ...p, notes: e.target.value }))}
                maxLength={1000} dir={direction}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>{language === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button
              disabled={updateCardMutation.isPending || !editForm.username.trim()}
              onClick={() => {
                if (!selectedCardForEdit) return;
                updateCardMutation.mutate({
                  cardId: selectedCardForEdit.id,
                  username: editForm.username.trim(),
                  password: editForm.password.trim() || undefined,
                  planId: editForm.planId ? parseInt(editForm.planId) : selectedCardForEdit.planId,
                  expiryType: "keep",
                  notes: editForm.notes.trim() || undefined,
                  fullName: editForm.fullName.trim() || undefined,
                  phone: editForm.phone.trim() || undefined,
                  simultaneousUse: parseInt(editForm.simultaneousUse) || 1,
                  macAddress: editForm.macAddress.trim() || null,
                });
              }}
            >
              {updateCardMutation.isPending ? (language === "ar" ? "جاري الحفظ..." : "Saving...") : (language === "ar" ? "حفظ التعديلات" : "Save Changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Renew Dialog ── */}
      <Dialog open={renewDialogOpen} onOpenChange={(o) => { setRenewDialogOpen(o); if (!o) setSelectedCardForRenew(null); }}>
        <DialogContent className="max-w-md" dir={direction}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-emerald-500" />
              {language === "ar" ? "تجديد صلاحية الكرت" : "Renew Card Validity"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar" ? `تجديد صلاحية: ${selectedCardForRenew?.username}` : `Renewing: ${selectedCardForRenew?.username}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Mode tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRenewType("custom_duration")}
                className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${renewType === "custom_duration" ? "bg-emerald-500 text-white border-emerald-500 shadow-sm" : "bg-background border-border hover:border-emerald-400"}`}>
                {language === "ar" ? "مدة محددة" : "Duration"}
              </button>
              <button type="button" onClick={() => setRenewType("custom")}
                className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-2 ${renewType === "custom" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background border-border hover:border-primary"}`}>
                <Calendar className="h-4 w-4" />
                {language === "ar" ? "تاريخ محدد" : "Specific Date"}
              </button>
            </div>

            {renewType === "custom_duration" && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">{language === "ar" ? "مدة التجديد" : "Renewal Duration"}</label>
                <div className="flex gap-2">
                  <Input type="number" min="1" value={renewDurationValue} onChange={(e) => setRenewDurationValue(e.target.value)}
                    className="h-11 w-24 font-mono text-center text-lg" placeholder="1" />
                  <Select value={renewDurationUnit} onValueChange={(v: any) => setRenewDurationUnit(v)}>
                    <SelectTrigger className="h-11 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">{language === "ar" ? "ساعة" : "Hours"}</SelectItem>
                      <SelectItem value="days">{language === "ar" ? "يوم" : "Days"}</SelectItem>
                      <SelectItem value="weeks">{language === "ar" ? "أسبوع" : "Weeks"}</SelectItem>
                      <SelectItem value="months">{language === "ar" ? "شهر" : "Months"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {renewType === "custom" && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">{language === "ar" ? "تاريخ الانتهاء" : "Expiry Date"}</label>
                <Input type="datetime-local" value={renewCustomDate} onChange={(e) => setRenewCustomDate(e.target.value)}
                  min={nowDateTimeLocal(timezone)} className="h-11" />
              </div>
            )}

            {/* Session time budget */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">{language === "ar" ? "مدة الجلسة (اختياري)" : "Session Time Budget (Optional)"}</label>
              <p className="text-xs text-muted-foreground">{language === "ar" ? "حجم الاستخدام المسموح به (0 = بدون حد)" : "Allowed usage time (0 = unlimited)"}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{language === "ar" ? "ساعات" : "Hours"}</label>
                  <Input type="number" min="0" value={renewWindowHours} onChange={(e) => setRenewWindowHours(e.target.value)} className="h-10" placeholder="0" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{language === "ar" ? "دقائق" : "Minutes"}</label>
                  <Input type="number" min="0" max="59" value={renewWindowMinutes} onChange={(e) => setRenewWindowMinutes(e.target.value)} className="h-10" placeholder="0" />
                </div>
              </div>
            </div>

            {/* Preview */}
            {renewType === "custom_duration" && renewDurationValue && (
              <div className="rounded-lg bg-muted/50 border p-3">
                <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "سينتهي الكرت في:" : "Card will expire on:"}</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {(() => {
                    const unitMs: Record<string, number> = { hours: 3600000, days: 86400000, weeks: 7 * 86400000, months: 30 * 86400000 };
                    const ms = (parseInt(renewDurationValue) || 0) * (unitMs[renewDurationUnit] || 0);
                    if (!ms) return "—";
                    const parsedExpiry = selectedCardForRenew?.expiresAt ? _parseDb(selectedCardForRenew.expiresAt) : null;
                    const base = parsedExpiry && parsedExpiry > new Date() ? parsedExpiry : new Date();
                    const nd = new Date(base.getTime() + ms);
                    return _fmtDateLib(nd);
                  })()}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>{language === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={renewCardMutation.isPending || (renewType === "custom" && !renewCustomDate) || (renewType === "custom_duration" && (!renewDurationValue || parseInt(renewDurationValue) < 1))}
              onClick={() => {
                if (!selectedCardForRenew) return;
                const customDate = renewType === "custom" ? dateTimeLocalToUtcIso(renewCustomDate, timezone) : undefined;
                if (renewType === "custom" && !customDate) {
                  toast.error(language === "ar" ? "تاريخ الانتهاء غير صالح في المنطقة الزمنية المحددة" : "Expiry date is invalid in the selected timezone");
                  return;
                }
                const usageBudgetSeconds = (parseInt(renewWindowHours) || 0) * 3600 + (parseInt(renewWindowMinutes) || 0) * 60;
                renewCardMutation.mutate({
                  cardId: selectedCardForRenew.id,
                  renewType,
                  durationValue: renewType === "custom_duration" ? parseInt(renewDurationValue) : undefined,
                  durationUnit: renewType === "custom_duration" ? renewDurationUnit : undefined,
                  customDate,
                  usageBudgetSeconds: usageBudgetSeconds >= 0 ? usageBudgetSeconds : undefined,
                });
              }}>
              {renewCardMutation.isPending ? (language === "ar" ? "جاري التجديد..." : "Renewing...") : (language === "ar" ? "تجديد الصلاحية" : "Renew Validity")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Kick Dialog ── */}
      <Dialog open={kickDialogOpen} onOpenChange={(open) => { setKickDialogOpen(open); if (!open) setCardToKick(null); }}>
        <DialogContent className="max-w-sm" dir={direction}>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 bg-destructive/10 rounded-xl">
                <WifiOff className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{language === 'ar' ? 'طرد الكرت' : 'Disconnect Card'}</DialogTitle>
                <DialogDescription className="mt-0.5">
                  <span className="font-mono font-semibold text-foreground">{cardToKick?.username}</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              {language === 'ar'
                ? 'سيتم إرسال طلب CoA Disconnect إلى جهاز NAS لقطع اتصال هذا الكرت فوراً.'
                : 'A CoA Disconnect request will be sent to the NAS to immediately disconnect this card.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKickDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              disabled={kickCardMutation.isPending}
              onClick={async () => {
                if (!cardToKick) return;
                try {
                  const sessions = await utils.sessions.getByUsername.fetch({ username: cardToKick.username });
                  const session = sessions?.[0];
                  if (!session) {
                    toast.error(language === 'ar' ? 'لا توجد جلسة نشطة لهذا الكرت' : 'No active session found for this card');
                    setKickDialogOpen(false);
                    return;
                  }
                  kickCardMutation.mutate({ sessionId: session.acctSessionId });
                } catch {
                  toast.error(language === 'ar' ? 'فشل في جلب بيانات الجلسة' : 'Failed to fetch session data');
                }
              }}
              className="gap-2"
            >
              {kickCardMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WifiOff className="h-4 w-4" />}
              {language === 'ar' ? 'طرد الكرت' : 'Disconnect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Speed Dialog ── */}
      <Dialog open={speedDialogOpen} onOpenChange={(open) => { setSpeedDialogOpen(open); if (!open) { setCardForSpeed(null); setDownloadSpeed(''); setUploadSpeed(''); setSpeedPreset(''); } }}>
        <DialogContent className="max-w-md" dir={direction}>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 bg-sky-500/10 rounded-xl">
                <Gauge className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <DialogTitle>{language === 'ar' ? 'تغيير السرعة الفوري' : 'Instant Speed Change'}</DialogTitle>
                <DialogDescription className="mt-0.5">
                  <span className="font-mono font-semibold text-foreground">{cardForSpeed?.username}</span>
                  {' — '}{language === 'ar' ? 'بدون فصل الاتصال' : 'without disconnecting'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
              <Zap className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {language === 'ar'
                  ? 'سيتم تطبيق السرعة فوراً عبر MikroTik API على Queue المستخدم'
                  : 'Speed will be applied instantly via MikroTik API to user Queue'}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">
                {language === 'ar' ? 'خطط سريعة' : 'Quick Presets'}
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {SPEED_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => { setDownloadSpeed(String(p.download)); setUploadSpeed(String(p.upload)); setSpeedPreset(p.label); }}
                    className={`text-xs py-1.5 px-2 rounded-lg border transition-all ${
                      speedPreset === p.label
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/40 hover:bg-accent'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Download className="h-3 w-3 text-sky-500" />
                  {language === 'ar' ? 'تنزيل (Mbps)' : 'Download (Mbps)'}
                </Label>
                <Input type="number" step="0.5" min="0.1" placeholder="10"
                  value={downloadSpeed}
                  onChange={(e) => { setDownloadSpeed(e.target.value); setSpeedPreset(''); }}
                  className="h-9 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Upload className="h-3 w-3 text-orange-500" />
                  {language === 'ar' ? 'رفع (Mbps)' : 'Upload (Mbps)'}
                </Label>
                <Input type="number" step="0.5" min="0.1" placeholder="5"
                  value={uploadSpeed}
                  onChange={(e) => { setUploadSpeed(e.target.value); setSpeedPreset(''); }}
                  className="h-9 rounded-lg" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSpeedDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              onClick={async () => {
                if (!cardForSpeed || !downloadSpeed || !uploadSpeed) return;
                const dlMbps = parseFloat(downloadSpeed);
                const ulMbps = parseFloat(uploadSpeed);
                if (isNaN(dlMbps) || isNaN(ulMbps) || dlMbps <= 0 || ulMbps <= 0) {
                  toast.error(language === 'ar' ? 'يرجى إدخال قيم سرعة صحيحة' : 'Please enter valid speed values');
                  return;
                }
                try {
                  const sessions = await utils.sessions.getByUsername.fetch({ username: cardForSpeed.username });
                  const session = sessions?.[0];
                  if (!session) {
                    toast.error(language === 'ar' ? 'لا توجد جلسة نشطة لهذا الكرت' : 'No active session found for this card');
                    setSpeedDialogOpen(false);
                    return;
                  }
                  changeSpeedMutation.mutate({
                    nasIp: session.nasIp || '',
                    username: cardForSpeed.username,
                    downloadSpeedKbps: Math.round(dlMbps * 1000),
                    uploadSpeedKbps: Math.round(ulMbps * 1000),
                  });
                } catch {
                  toast.error(language === 'ar' ? 'فشل في جلب بيانات الجلسة' : 'Failed to fetch session data');
                }
              }}
              disabled={!downloadSpeed || !uploadSpeed || changeSpeedMutation.isPending}
              className="bg-sky-600 hover:bg-sky-700 gap-2"
            >
              {changeSpeedMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {language === 'ar' ? 'تطبيق فوري' : 'Apply Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SMS Dialog ── */}
      <Dialog open={smsDialogOpen} onOpenChange={(open) => { setSmsDialogOpen(open); if (!open) { setCardForSms(null); setSmsMessage(""); } }}>
        <DialogContent className="max-w-md" dir={direction}>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 bg-blue-500/10 rounded-xl">
                <Send className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <DialogTitle>{language === 'ar' ? 'إرسال رسالة SMS' : 'Send SMS'}</DialogTitle>
                <DialogDescription className="mt-0.5">
                  <span className="font-mono font-semibold text-foreground">{cardForSms?.phone}</span>
                  {cardForSms?.fullName && <span className="text-muted-foreground"> — {cardForSms.fullName}</span>}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* قوالب */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">{language === 'ar' ? 'قوالب جاهزة' : 'Quick Templates'}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {SMS_TEMPLATES.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setSmsMessage(t.value)}
                    className={`text-xs py-1.5 px-2 rounded-lg border transition-all text-start ${
                      smsMessage === t.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/40 hover:bg-accent'
                    }`}
                  >
                    {language === 'ar' ? t.labelAr : t.labelEn}
                  </button>
                ))}
              </div>
            </div>
            {/* نص الرسالة */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                {language === 'ar' ? 'نص الرسالة (اتركه فارغاً لإرسال بيانات الكرت تلقائياً)' : 'Message (leave empty for default card credentials)'}
              </Label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={language === 'ar' ? 'اكتب رسالتك هنا... أو اختر قالباً من الأعلى' : 'Type your message... or select a template above'}
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                dir={direction}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {language === 'ar' ? 'متغيرات: {name} {username} {password}' : 'Variables: {name} {username} {password}'}
                <span className="float-end">{smsMessage.length}/500</span>
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSmsDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              onClick={() => cardForSms && sendSmsMutation.mutate({ cardId: cardForSms.id, customMessage: smsMessage || undefined })}
              disabled={sendSmsMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {sendSmsMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {language === 'ar' ? 'إرسال' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Notes Dialog ── */}
      <Dialog open={notesDialogOpen} onOpenChange={(o) => { setNotesDialogOpen(o); if (!o) setSelectedCardForNotes(null); }}>
        <DialogContent className="max-w-md" dir={direction}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-yellow-500" />
              {language === "ar" ? "تعديل الملاحظة" : "Edit Notes"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar" ? `ملاحظة الكرت: ${selectedCardForNotes?.username}` : `Notes for: ${selectedCardForNotes?.username}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <textarea
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder={language === "ar" ? "أدخل الملاحظة هنا..." : "Enter notes here..."}
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              maxLength={1000} dir={direction}
            />
            <p className="text-xs text-muted-foreground mt-1 text-end">{notesValue.length}/1000</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>{language === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button disabled={updateNotesMutation.isPending}
              onClick={() => selectedCardForNotes && updateNotesMutation.mutate({ cardId: selectedCardForNotes.id, notes: notesValue.trim() || undefined })}>
              {updateNotesMutation.isPending ? (language === "ar" ? "جاري الحفظ..." : "Saving...") : (language === "ar" ? "حفظ الملاحظة" : "Save Notes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
