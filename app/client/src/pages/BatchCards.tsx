import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import {
  MoreHorizontal,
  CreditCard,
  Copy,
  CheckCircle2,
  Package,
  AlertTriangle,
  Calendar,
  ShieldOff,
  RotateCcw,
  Zap,
  Trash2,
  LogIn,
  Activity,
  MessageSquare,
  Pencil,
  Lock,
  ArrowRight,
  RefreshCw,
  Filter,
  Search,
  Ban,
  Download,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useSorting } from "@/hooks/useSorting";
import { DataPagination } from "@/components/ui/data-pagination";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { formatDate, formatDateCompact, formatDateWithWeekday, parseDbDate } from "@/lib/dateFormat";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { dateTimeLocalToUtcIso, formatDateTimeLocal, nowDateTimeLocal } from "@/lib/timezoneV6";

export default function BatchCards() {
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();
  const { timezone } = useTimezoneV6();
  const [, setLocation] = useLocation();
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;

  // Pagination
  const [serverPage, setServerPage] = useState(1);
  const [pageLimit, setPageLimit] = useState(50);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog states
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false);
  const [selectedCardForRenew, setSelectedCardForRenew] = useState<any>(null);
  const [renewType, setRenewType] = useState<"custom_duration" | "custom">("custom_duration");
  const [renewDurationValue, setRenewDurationValue] = useState("1");
  const [renewDurationUnit, setRenewDurationUnit] = useState<"hours" | "days" | "weeks" | "months">("months");
  const [renewCustomDate, setRenewCustomDate] = useState("");
  const [renewWindowHours, setRenewWindowHours] = useState("0");
  const [renewWindowMinutes, setRenewWindowMinutes] = useState("0");

  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
  const [selectedCardForSuspend, setSelectedCardForSuspend] = useState<any>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCardForDelete, setSelectedCardForDelete] = useState<any>(null);

  const [isEditNotesDialogOpen, setIsEditNotesDialogOpen] = useState(false);
  const [selectedCardForNotes, setSelectedCardForNotes] = useState<any>(null);
  const [notesText, setNotesText] = useState("");

  const [isEditCardDialogOpen, setIsEditCardDialogOpen] = useState(false);
  const [selectedCardForEdit, setSelectedCardForEdit] = useState<any>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [editCardForm, setEditCardForm] = useState({
    username: "",
    password: "",
    planId: "",
    expiryType: "keep" as 'keep' | 'custom' | 'from_activation' | '1week' | '2weeks' | '1month' | '3months',
    expiryDate: "",
    notes: "",
    simultaneousUse: "1",
  });

  // Queries
  const { data: vouchersResult, isLoading, refetch } = trpc.vouchers.list.useQuery({
    page: serverPage,
    limit: pageLimit,
    search: searchQuery || undefined,
    status: statusFilter !== "all" ? (statusFilter as 'unused' | 'active' | 'used' | 'expired' | 'suspended' | 'cancelled') : undefined,
    batchId: batchId || undefined,
  });

  const vouchers = vouchersResult?.data ?? [];
  const serverTotal = vouchersResult?.total ?? 0;
  const serverTotalPages = vouchersResult?.totalPages ?? 1;

  const { data: plans } = trpc.plans.list.useQuery();

  // Get batch info
  const { data: batches } = trpc.vouchers.getBatches.useQuery();
  const currentBatch = batches?.find((b: any) => b.batchId === batchId);

  // Export all cards query (lazy - only triggered manually)
  const exportAllQuery = trpc.vouchers.exportBatchCards.useQuery(
    { batchId: batchId || '' },
    { enabled: false }
  );

  // Mutations
  const suspendMutation = trpc.vouchers.suspend.useMutation({
    onSuccess: () => { toast.success(language === "ar" ? "تم إيقاف الكرت" : "Card suspended"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const unsuspendMutation = trpc.vouchers.unsuspend.useMutation({
    onSuccess: () => { toast.success(language === "ar" ? "تم تفعيل الكرت" : "Card reactivated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateCardMutation = trpc.vouchers.updateCard.useMutation({
    onSuccess: () => { toast.success(language === "ar" ? "تم تحديث الكرت" : "Card updated"); setIsEditCardDialogOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateNotesMutation = trpc.vouchers.updateNotes.useMutation({
    onSuccess: () => { toast.success(language === "ar" ? "تم حفظ الملاحظة" : "Note saved"); setIsEditNotesDialogOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const renewCardMutation = trpc.vouchers.renewCard.useMutation({
    onSuccess: () => { toast.success(language === "ar" ? "تم تجديد الصلاحية" : "Validity renewed"); setIsRenewDialogOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteCardMutation = trpc.vouchers.deleteCard.useMutation({
    onSuccess: () => { toast.success(language === "ar" ? "تم حذف الكرت" : "Card deleted"); setIsDeleteDialogOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Bulk selection state
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set());
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isBulkSuspendDialogOpen, setIsBulkSuspendDialogOpen] = useState(false);
  const [isBulkUnsuspendDialogOpen, setIsBulkUnsuspendDialogOpen] = useState(false);

  const bulkDeleteMutation = trpc.vouchers.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(language === 'ar' ? `تم حذف ${data.count} كرت بنجاح` : `${data.count} cards deleted`);
      setIsBulkDeleteDialogOpen(false);
      setSelectedCardIds(new Set());
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkSuspendMutation = trpc.vouchers.bulkSuspendCards.useMutation({
    onSuccess: (data: { count: number }) => {
      toast.success(language === 'ar' ? `تم تعطيل ${data.count} كرت` : `${data.count} cards suspended`);
      setSelectedCardIds(new Set());
      refetch();
    },
  });

  const bulkUnsuspendMutation = trpc.vouchers.bulkUnsuspendCards.useMutation({
    onSuccess: (data: { count: number }) => {
      toast.success(language === 'ar' ? `تم تفعيل ${data.count} كرت` : `${data.count} cards reactivated`);
      setSelectedCardIds(new Set());
      setIsBulkUnsuspendDialogOpen(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Sorting
  const { sortedData: sortedVouchers, sortColumn, sortDirection, handleSort } = useSorting(
    vouchers,
    "createdAt",
    "desc"
  );

  const paginatedVouchers = sortedVouchers;
  const currentPage = serverPage;
  const totalPages = serverTotalPages;
  const totalItems = serverTotal;
  const itemsPerPage = pageLimit;
  const setCurrentPage = setServerPage;

  // Activity belongs to a lifecycle so a reused username cannot inherit history.
  const paginatedLifecycleIdsForActivity = useMemo(
    () => (paginatedVouchers ?? []).map((v: any) => v.lifecycleId).filter(Boolean),
    [JSON.stringify((paginatedVouchers ?? []).map((v: any) => v.lifecycleId))]
  );
  const { data: activityMap } = trpc.vouchers.getActivity.useQuery(
    { lifecycleIds: paginatedLifecycleIdsForActivity },
    { enabled: paginatedLifecycleIdsForActivity.length > 0 }
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(language === "ar" ? "تم النسخ" : "Copied");
  };

  const exportAllCards = async () => {
    setIsExportingAll(true);
    try {
      const result = await exportAllQuery.refetch();
      const cards = result.data;
      if (!cards || cards.length === 0) {
        toast.error(language === 'ar' ? 'لا توجد كروت للتصدير' : 'No cards to export');
        return;
      }
      // شكل CSV: الاى دى;الرقم;كلمة السر - فاصل ;
      const header = 'الاى دى;الرقم;كلمة السر';
      const rows = [
        header,
        ...cards.map((c: any, i: number) => {
          const id = c.serialNumber || String(i + 1).padStart(12, '0');
          const username = `"${(c.username || '').replace(/"/g, '""')}"`;
          const password = `"${(c.password || '').replace(/"/g, '""')}"`;
          return `"${id}";${username};${password}`;
        })
      ];
      const csv = rows.join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const batchName = currentBatch?.name || batchId?.slice(0, 8) || 'batch';
      a.download = `cards-${batchName}-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(language === 'ar' ? `تم تصدير ${cards.length} كرت` : `Exported ${cards.length} cards`);
    } catch (err: any) {
      toast.error(err?.message || (language === 'ar' ? 'فشل التصدير' : 'Export failed'));
    } finally {
      setIsExportingAll(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { className: string; label: string; labelAr: string }> = {
      unused: { className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700", label: "Unused", labelAr: "غير مستخدم" },
      active: { className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800", label: "Active", labelAr: "نشط" },
      used: { className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800", label: "Used", labelAr: "مستخدم" },
      expired: { className: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800", label: "Expired", labelAr: "منتهي" },
      suspended: { className: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border-orange-200 dark:border-orange-800", label: "Suspended", labelAr: "موقوف" },
      cancelled: { className: "bg-gray-50 text-gray-500 dark:bg-gray-900/40 dark:text-gray-500 border-gray-200 dark:border-gray-700", label: "Cancelled", labelAr: "ملغي" },
    };
    const config = statusConfig[status] || statusConfig.unused;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
        {language === "ar" ? config.labelAr : config.label}
      </span>
    );
  };

  const getExpiryInfo = (voucher: any) => {
    if (!voucher.expiresAt) {
      return { label: language === "ar" ? "بدون حد" : "No limit", progress: 100, color: "bg-slate-400", daysLeft: null };
    }
    const now = new Date();
    const expiresAt = parseDbDate(voucher.expiresAt) ?? new Date(voucher.expiresAt);
    const createdAt = parseDbDate(voucher.createdAt) ?? new Date(voucher.createdAt);
    const totalMs = expiresAt.getTime() - createdAt.getTime();
    const remainingMs = expiresAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(remainingMs / 86400000);
    if (remainingMs <= 0) {
      return { label: language === "ar" ? "منتهي" : "Expired", progress: 0, color: "bg-red-500", daysLeft: 0 };
    }
    const progress = Math.max(5, Math.min(100, (remainingMs / totalMs) * 100));
    let color = "bg-emerald-500";
    let label = "";
    if (daysLeft <= 3) {
      color = "bg-red-500";
      label = language === "ar" ? `يتبقى ${daysLeft} يوم` : `${daysLeft}d left`;
    } else if (daysLeft <= 7) {
      color = "bg-amber-500";
      label = language === "ar" ? `يتبقى ${daysLeft} أيام` : `${daysLeft}d left`;
    } else {
      label = language === "ar" ? `يتبقى ${daysLeft} يوم` : `${daysLeft}d left`;
    }
    return { label, progress, color, daysLeft };
  };

  return (
    <div className="space-y-6" dir={direction}>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/vouchers")}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4" />
            {language === "ar" ? "الدفعات" : "Batches"}
          </Button>
          <div className="h-4 w-px bg-border" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {currentBatch?.name || `${language === "ar" ? "دفعة" : "Batch"} #${batchId?.slice(0, 8)}`}
            </h1>
            <p className="text-muted-foreground text-sm">
              {language === "ar"
                ? `${serverTotal} كرت في هذه الدفعة`
                : `${serverTotal} cards in this batch`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-2" />
          {language === "ar" ? "تحديث" : "Refresh"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={language === "ar" ? "بحث بالرقم أو اسم العميل..." : "Search by number or customer..."}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setServerPage(1); }}
            className="ps-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setServerPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-4 w-4 me-2 text-muted-foreground" />
            <SelectValue />
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
        <Select value={String(pageLimit)} onValueChange={(v) => { setPageLimit(Number(v)); setServerPage(1); }}>
          <SelectTrigger className="w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {language === "ar" ? `عرض ${serverTotal} كرت` : `Showing ${serverTotal} cards`}
        </span>
        {/* More Options - always visible */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <MoreHorizontal className="h-4 w-4" />
              {language === 'ar' ? 'المزيد من الخيارات' : 'More Options'}
              {selectedCardIds.size > 0 && (
                <span className="ms-1 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {selectedCardIds.size}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {selectedCardIds.size === 0 ? (
              // لا يوجد تحديد - أظهر رسالة توجيهية
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                {language === 'ar' ? 'حدد كرت أو أكثر أولاً' : 'Select one or more cards first'}
              </div>
            ) : (
              <>
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {language === 'ar' ? `${selectedCardIds.size} كرت محدد` : `${selectedCardIds.size} selected`}
                </div>
                <DropdownMenuSeparator />
                {/* تصدير CSV المحدد */}
                <DropdownMenuItem
                  onClick={() => {
                    const selectedCards = paginatedVouchers?.filter((v: any) => selectedCardIds.has(v.id)) ?? [];
                    const rows = [
                      ['رقم الكرت', 'كلمة السر', 'الحالة', 'الخطة', 'تاريخ الإنشاء'].join(','),
                      ...selectedCards.map((v: any) => [
                        `"${v.username || ''}"`,
                        `"${v.password || ''}"`,
                        v.status || '',
                        `"${v.planName || '-'}"`,
                        v.createdAt ? formatDate(v.createdAt) : ''
                      ].join(','))
                    ];
                    const csv = rows.join('\n');
                    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `cards-selected-${Date.now()}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success(language === 'ar' ? `تم تصدير ${selectedCards.length} كرت` : `Exported ${selectedCards.length} cards`);
                  }}
                >
                  <Download className="h-4 w-4 me-2 text-blue-500" />
                  {language === 'ar' ? `تنزيل CSV (${selectedCardIds.size})` : `Export CSV (${selectedCardIds.size})`}
                </DropdownMenuItem>
                {/* تفعيل */}
                <DropdownMenuItem
                  onClick={() => setIsBulkUnsuspendDialogOpen(true)}
                  disabled={bulkUnsuspendMutation.isPending}
                  className="text-emerald-600 dark:text-emerald-400 focus:text-emerald-600"
                >
                  <CheckCircle2 className="h-4 w-4 me-2" />
                  {language === 'ar' ? `تفعيل (${selectedCardIds.size})` : `Reactivate (${selectedCardIds.size})`}
                </DropdownMenuItem>
                {/* تعطيل */}
                <DropdownMenuItem
                  onClick={() => setIsBulkSuspendDialogOpen(true)}
                  disabled={bulkSuspendMutation.isPending}
                >
                  <Ban className="h-4 w-4 me-2 text-orange-500" />
                  {language === 'ar' ? `تعطيل (${selectedCardIds.size})` : `Suspend (${selectedCardIds.size})`}
                </DropdownMenuItem>
                {/* حذف */}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setIsBulkDeleteDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  {language === 'ar' ? `حذف (${selectedCardIds.size})` : `Delete (${selectedCardIds.size})`}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSelectedCardIds(new Set())}>
                  {language === 'ar' ? 'إلغاء التحديد' : 'Deselect All'}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 border-b">
                <TableHead className="w-10 text-center">
                  <Checkbox
                    checked={paginatedVouchers && paginatedVouchers.length > 0 && selectedCardIds.size === paginatedVouchers.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedCardIds(new Set(paginatedVouchers?.map((v: any) => v.id) ?? []));
                      } else {
                        setSelectedCardIds(new Set());
                      }
                    }}
                  />
                </TableHead>
                <TableHead className="text-end font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[60px] pe-4">{language === "ar" ? "إجراءات" : "Actions"}</TableHead>
                <TableHead className="w-12 text-center font-semibold text-xs uppercase tracking-wider text-muted-foreground">#</TableHead>
                <SortableTableHead column="username" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground ps-4">
                  {language === "ar" ? "رقم الكرت" : "Card No."}
                </SortableTableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === "ar" ? "اسم العميل" : "Customer"}</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === "ar" ? "كلمة السر" : "Password"}</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === "ar" ? "الخطة/الباقة" : "Plan"}</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === "ar" ? "وقت الكرت" : "Time"}</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === "ar" ? "صلاحية الاستخدام" : "Window"}</TableHead>
                <SortableTableHead column="status" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  {language === "ar" ? "الحالة" : "Status"}
                </SortableTableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  {language === "ar" ? "أول دخول" : "First Login"}
                </TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  {language === "ar" ? "آخر تواجد" : "Last Seen"}
                </TableHead>
                <SortableTableHead column="createdAt" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  {language === "ar" ? "تاريخ الإنشاء" : "Created"}
                </SortableTableHead>
                <SortableTableHead column="expiresAt" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  {language === "ar" ? "تاريخ الانتهاء" : "Expiry"}
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} columns={12} />
              ) : paginatedVouchers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-16 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <CreditCard className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm">{language === "ar" ? "لا توجد كروت" : "No cards found"}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedVouchers?.map((voucher: any, index: number) => {
                  const expiryInfo = getExpiryInfo(voucher);
                  const isExpiringSoon = expiryInfo.daysLeft !== null && expiryInfo.daysLeft <= 3 && expiryInfo.daysLeft > 0;
                  return (
                    <TableRow key={voucher.id} className={`hover:bg-muted/20 transition-colors group border-b last:border-0 ${isExpiringSoon ? "bg-amber-50/30 dark:bg-amber-950/10" : ""} ${selectedCardIds.has(voucher.id) ? 'bg-primary/5' : ''}`}>
                      {/* Checkbox */}
                      <TableCell className="text-center py-3.5">
                        <Checkbox
                          checked={selectedCardIds.has(voucher.id)}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedCardIds);
                            if (checked) next.add(voucher.id);
                            else next.delete(voucher.id);
                            setSelectedCardIds(next);
                          }}
                        />
                      </TableCell>
                      {/* Actions */}
                      <TableCell className="text-end pe-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => copyToClipboard(`${voucher.username}:${voucher.password}`)}>
                              <Copy className="h-4 w-4 me-2 text-muted-foreground" />
                              {language === "ar" ? "نسخ البيانات" : "Copy Credentials"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedCardForRenew(voucher);
                              setRenewType("custom_duration");
                              setRenewDurationValue("1");
                              setRenewDurationUnit("months");
                              setRenewCustomDate("");
                              setRenewWindowHours("0");
                              setRenewWindowMinutes("0");
                              setIsRenewDialogOpen(true);
                            }}>
                              <RotateCcw className="h-4 w-4 me-2 text-emerald-500" />
                              {language === "ar" ? "تجديد الصلاحية" : "Renew Validity"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {voucher.status !== "suspended" ? (
                              <DropdownMenuItem
                                className="text-orange-600 dark:text-orange-400 focus:text-orange-600"
                                onClick={() => { setSelectedCardForSuspend(voucher); setIsSuspendDialogOpen(true); }}
                              >
                                <ShieldOff className="h-4 w-4 me-2" />
                                {language === "ar" ? "إيقاف الكرت" : "Suspend Card"}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-emerald-600 dark:text-emerald-400 focus:text-emerald-600"
                                onClick={() => unsuspendMutation.mutate({ cardId: voucher.id })}
                              >
                                <CheckCircle2 className="h-4 w-4 me-2" />
                                {language === "ar" ? "إعادة تفعيل الكرت" : "Reactivate Card"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedCardForEdit(voucher);
                                setEditCardForm({
                                  username: voucher.username || "",
                                  password: voucher.password || "",
                                  planId: String(voucher.planId || ""),
                                  expiryType: "keep",
                                  expiryDate: voucher.expiresAt ? formatDateTimeLocal(voucher.expiresAt, timezone) : "",
                                  notes: voucher.notes || "",
                                  simultaneousUse: String(voucher.simultaneousUse || 1),
                                });
                                setShowEditPassword(false);
                                setIsEditCardDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4 me-2 text-blue-500" />
                              {language === "ar" ? "تعديل الكرت" : "Edit Card"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedCardForNotes(voucher);
                                setNotesText(voucher.notes || "");
                                setIsEditNotesDialogOpen(true);
                              }}
                            >
                              <MessageSquare className="h-4 w-4 me-2 text-yellow-500" />
                              {language === "ar" ? "تعديل الملاحظة" : "Edit Note"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 dark:text-red-400 focus:text-red-600"
                              onClick={() => { setSelectedCardForDelete(voucher); setIsDeleteDialogOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4 me-2" />
                              {language === "ar" ? "حذف الكرت" : "Delete Card"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      {/* Row Number */}
                      <TableCell className="text-center py-3.5">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                          {((currentPage - 1) * itemsPerPage) + index + 1}
                        </span>
                      </TableCell>
                      {/* Card Number */}
                      <TableCell className="py-3.5 ps-4">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-sm">{voucher.username}</span>
                              {isExpiringSoon && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  {language === "ar" ? "ينتهي قريباً" : "Expiring"}
                                </span>
                              )}
                              {voucher.notes && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors cursor-pointer">
                                      <MessageSquare className="h-2.5 w-2.5" />
                                      {language === "ar" ? "ملاحظة" : "Note"}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-3" side="top" align="start">
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        {language === "ar" ? "ملاحظات الكرت" : "Card Notes"}
                                      </div>
                                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{voucher.notes}</p>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground/60 font-mono">{voucher.serialNumber?.slice(0, 8)}...</span>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ms-1" onClick={() => copyToClipboard(voucher.username)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      {/* Customer Name */}
                      <TableCell className="py-3.5">
                        {voucher.notes ? (
                          <span className="text-sm text-foreground font-medium">
                            {voucher.notes.includes(" - ") ? voucher.notes.split(" - ")[0] : voucher.notes}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      {/* Password */}
                      <TableCell className="py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm bg-muted/50 px-2 py-0.5 rounded text-muted-foreground">{voucher.password}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copyToClipboard(voucher.password)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      {/* Plan */}
                      <TableCell className="py-3.5">
                        {voucher.planName ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                            <Package className="h-3 w-3" />
                            {voucher.planName}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      {/* Card Time */}
                      <TableCell className="py-3.5 text-sm">
                        {voucher.usageBudgetSeconds && voucher.usageBudgetSeconds > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {voucher.usageBudgetSeconds >= 3600
                              ? `${Math.floor(voucher.usageBudgetSeconds / 3600)}${language === "ar" ? " س" : "h"}${voucher.usageBudgetSeconds % 3600 >= 60 ? ` ${Math.floor((voucher.usageBudgetSeconds % 3600) / 60)}${language === "ar" ? " د" : "m"}` : ""}`
                              : `${Math.floor(voucher.usageBudgetSeconds / 60)}${language === "ar" ? " د" : "m"}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">{language === "ar" ? "غير محدد" : "—"}</span>
                        )}
                      </TableCell>
                      {/* Window */}
                      <TableCell className="py-3.5 text-sm">
                        {voucher.windowSeconds && voucher.windowSeconds > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            {voucher.windowSeconds >= 86400
                              ? `${Math.floor(voucher.windowSeconds / 86400)}${language === "ar" ? " يوم" : "d"}`
                              : voucher.windowSeconds >= 3600
                              ? `${Math.floor(voucher.windowSeconds / 3600)}${language === "ar" ? " س" : "h"}`
                              : `${Math.floor(voucher.windowSeconds / 60)}${language === "ar" ? " د" : "m"}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">{language === "ar" ? "غير محدد" : "—"}</span>
                        )}
                      </TableCell>
                      {/* Status */}
                      <TableCell className="py-3.5">{getStatusBadge(voucher.status)}</TableCell>
                      {/* First Login */}
                      <TableCell className="py-3.5 text-sm text-muted-foreground">
                        {activityMap?.[voucher.lifecycleId]?.firstLogin
                          ? <div className="flex items-center gap-1.5">
                              <LogIn className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              <span>{formatDate(activityMap[voucher.lifecycleId].firstLogin!)}</span>
                            </div>
                          : <span className="text-muted-foreground/40">{language === "ar" ? "لم يدخل" : "Never"}</span>}
                      </TableCell>
                      {/* Last Seen */}
                      <TableCell className="py-3.5 text-sm text-muted-foreground">
                        {activityMap?.[voucher.lifecycleId]?.lastSeen
                          ? <div className="flex items-center gap-1.5">
                              <Activity className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span>{formatDate(activityMap[voucher.lifecycleId].lastSeen!)}</span>
                            </div>
                          : <span className="text-muted-foreground/40">-</span>}
                      </TableCell>
                      {/* Created At */}
                      <TableCell className="py-3.5 text-sm text-muted-foreground">
                        {formatDate(voucher.createdAt)}
                      </TableCell>
                      {/* Expiry Date */}
                      <TableCell className="py-3.5 text-sm">
                        {voucher.expiresAt
                          ? <span className={`font-medium ${
                              (new Date(voucher.expiresAt)) < new Date() ? 'text-red-500' :
                              (new Date(voucher.expiresAt).getTime() - Date.now()) < 3 * 86400000 ? 'text-amber-500' :
                              'text-muted-foreground'
                            }`}>
                              {formatDate(voucher.expiresAt)}
                            </span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {/* Pagination */}
        <div className="p-4 border-t">
          <DataPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      {/* Renew Card Dialog */}
      <Dialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-emerald-500" />
              {language === "ar" ? "تجديد صلاحية الكرت" : "Renew Card Validity"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar"
                ? `تجديد صلاحية الكرت: ${selectedCardForRenew?.username}`
                : `Renewing validity for card: ${selectedCardForRenew?.username}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
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
                  <Input type="number" min="1" value={renewDurationValue} onChange={(e) => setRenewDurationValue(e.target.value)} className="h-11 w-24 font-mono text-center text-lg" placeholder="1" />
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
                <Input type="datetime-local" value={renewCustomDate} onChange={(e) => setRenewCustomDate(e.target.value)} min={nowDateTimeLocal(timezone)} className="h-11" />
              </div>
            )}
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
            {renewType === "custom_duration" && renewDurationValue && (
              <div className="rounded-lg bg-muted/50 border p-3">
                <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "سينتهي الكرت في:" : "Card will expire on:"}</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {(() => {
                    const unitMs: Record<string, number> = { hours: 3600000, days: 86400000, weeks: 7 * 86400000, months: 30 * 86400000 };
                    const ms = (parseInt(renewDurationValue) || 0) * (unitMs[renewDurationUnit] || 0);
                    if (!ms) return "—";
                    const parsedExpiry = selectedCardForRenew?.expiresAt ? parseDbDate(selectedCardForRenew.expiresAt) : null;
                    const base = parsedExpiry && parsedExpiry > new Date() ? parsedExpiry : new Date();
                    const d = new Date(base.getTime() + ms);
                    return formatDateWithWeekday(d, language);
                  })()}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenewDialogOpen(false)}>{language === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
              }}
            >
              {renewCardMutation.isPending ? (language === "ar" ? "جاري التجديد..." : "Renewing...") : (language === "ar" ? "تجديد الصلاحية" : "Renew Validity")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Dialog */}
      <Dialog open={isSuspendDialogOpen} onOpenChange={setIsSuspendDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <ShieldOff className="h-5 w-5" />
              {language === "ar" ? "إيقاف الكرت" : "Suspend Card"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar" ? "سيتم إيقاف الكرت فوراً وقطع أي جلسة نشطة. هل تريد المتابعة؟" : "The card will be suspended immediately and any active session will be disconnected. Continue?"}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-3 my-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-orange-500" />
              <span className="font-mono font-semibold text-sm">{selectedCardForSuspend?.username}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSuspendDialogOpen(false)}>{language === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button variant="destructive" className="bg-orange-600 hover:bg-orange-700" disabled={suspendMutation.isPending}
              onClick={() => { if (!selectedCardForSuspend) return; suspendMutation.mutate({ cardId: selectedCardForSuspend.id }); setIsSuspendDialogOpen(false); setSelectedCardForSuspend(null); }}>
              {suspendMutation.isPending ? (language === "ar" ? "جاري الإيقاف..." : "Suspending...") : (language === "ar" ? "إيقاف الكرت" : "Suspend Card")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
              {language === "ar" ? "حذف الكرت" : "Delete Card"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar" ? "سيتم حذف هذا الكرت نهائياً من قاعدة البيانات ومن RADIUS. لا يمكن التراجع عن هذا الإجراء." : "This card will be permanently deleted from the database and RADIUS. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 my-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-red-500" />
              <span className="font-mono font-semibold text-sm">{selectedCardForDelete?.username}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>{language === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button variant="destructive" disabled={deleteCardMutation.isPending}
              onClick={() => { if (!selectedCardForDelete) return; deleteCardMutation.mutate({ cardId: selectedCardForDelete.id }); }}>
              {deleteCardMutation.isPending ? (language === "ar" ? "جاري الحذف..." : "Deleting...") : (language === "ar" ? "حذف نهائي" : "Delete Permanently")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      {/* Dialog تأكيد التعطيل الجماعي */}
      <Dialog open={isBulkSuspendDialogOpen} onOpenChange={setIsBulkSuspendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-orange-500" />
              {language === 'ar' ? `تعطيل ${selectedCardIds.size} كرت` : `Suspend ${selectedCardIds.size} Card(s)`}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `سيتم تعطيل ${selectedCardIds.size} كرت ومنعها من الاتصال. هل أنت متأكد؟`
                : `This will suspend ${selectedCardIds.size} card(s) and block their access. Are you sure?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkSuspendDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="default"
              className="bg-orange-500 hover:bg-orange-600"
              disabled={bulkSuspendMutation.isPending}
              onClick={() => {
                bulkSuspendMutation.mutate({ cardIds: Array.from(selectedCardIds) });
                setIsBulkSuspendDialogOpen(false);
              }}
            >
              {bulkSuspendMutation.isPending
                ? (language === 'ar' ? 'جاري التعطيل...' : 'Suspending...')
                : (language === 'ar' ? 'تعطيل' : 'Suspend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog تأكيد التفعيل الجماعي */}
      <Dialog open={isBulkUnsuspendDialogOpen} onOpenChange={setIsBulkUnsuspendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              {language === 'ar' ? `تفعيل ${selectedCardIds.size} كرت` : `Reactivate ${selectedCardIds.size} Card(s)`}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `سيتم إعادة تفعيل ${selectedCardIds.size} كرت والسماح لها بالاتصال. هل أنت متأكد؟`
                : `This will reactivate ${selectedCardIds.size} card(s) and allow them to connect. Are you sure?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkUnsuspendDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={bulkUnsuspendMutation.isPending}
              onClick={() => bulkUnsuspendMutation.mutate({ cardIds: Array.from(selectedCardIds) })}
            >
              {bulkUnsuspendMutation.isPending
                ? (language === 'ar' ? 'جاري التفعيل...' : 'Reactivating...')
                : (language === 'ar' ? 'تفعيل' : 'Reactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog تأكيد الحذف الجماعي */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
              {language === 'ar' ? `حذف ${selectedCardIds.size} كرت` : `Delete ${selectedCardIds.size} Card(s)`}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `سيتم حذف ${selectedCardIds.size} كرت نهائياً من قاعدة البيانات ومن RADIUS. لا يمكن التراجع عن هذا الإجراء.`
                : `${selectedCardIds.size} card(s) will be permanently deleted from the database and RADIUS. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDeleteDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate({ ids: Array.from(selectedCardIds) })}
            >
              {bulkDeleteMutation.isPending
                ? (language === 'ar' ? 'جاري الحذف...' : 'Deleting...')
                : (language === 'ar' ? 'حذف نهائي' : 'Delete Permanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Notes Dialog */}
      <Dialog open={isEditNotesDialogOpen} onOpenChange={(open) => { setIsEditNotesDialogOpen(open); if (!open) { setSelectedCardForNotes(null); setNotesText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-yellow-500" />
              {language === "ar" ? "تعديل الملاحظة" : "Edit Note"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar" ? `تعديل ملاحظة الكرت: ${selectedCardForNotes?.username || ""}` : `Edit note for card: ${selectedCardForNotes?.username || ""}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <textarea
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder={language === "ar" ? "اكتب ملاحظة هنا... (اتركها فارغة لحذف الملاحظة)" : "Write a note here... (leave empty to remove the note)"}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              maxLength={1000}
              dir={direction}
            />
            <p className="text-xs text-muted-foreground mt-1 text-end">{notesText.length}/1000</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditNotesDialogOpen(false)}>{language === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button disabled={updateNotesMutation.isPending}
              onClick={() => { if (!selectedCardForNotes) return; updateNotesMutation.mutate({ cardId: selectedCardForNotes.id, notes: notesText.trim() || undefined }); }}>
              {updateNotesMutation.isPending ? (language === "ar" ? "جاري الحفظ..." : "Saving...") : (language === "ar" ? "حفظ الملاحظة" : "Save Note")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Card Dialog */}
      <Dialog open={isEditCardDialogOpen} onOpenChange={(open) => { setIsEditCardDialogOpen(open); if (!open) { setSelectedCardForEdit(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir={direction}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Pencil className="h-4 w-4 text-white" />
              </div>
              {language === "ar" ? "تعديل الكرت" : "Edit Card"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar" ? `تعديل بيانات الكرت: ${selectedCardForEdit?.username || ""}` : `Edit card: ${selectedCardForEdit?.username || ""}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                {language === "ar" ? "بيانات الدخول" : "Credentials"}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{language === "ar" ? "اسم المستخدم" : "Username"}<span className="text-destructive ms-1">*</span></Label>
                  <Input value={editCardForm.username} onChange={(e) => setEditCardForm(prev => ({ ...prev, username: e.target.value }))} className="h-11 font-mono" dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{language === "ar" ? "كلمة المرور" : "Password"}<span className="text-muted-foreground text-xs ms-1">({language === "ar" ? "اختياري" : "optional"})</span></Label>
                  <div className="relative">
                    <Input type={showEditPassword ? "text" : "password"} value={editCardForm.password} onChange={(e) => setEditCardForm(prev => ({ ...prev, password: e.target.value }))} className="h-11 font-mono pr-10" dir="ltr" />
                    <button type="button" onClick={() => setShowEditPassword(v => !v)} className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground">
                      <Zap className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" />
                {language === "ar" ? "الخدمة والصلاحية" : "Plan & Validity"}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{language === "ar" ? "الخدمة" : "Plan"}<span className="text-destructive ms-1">*</span></Label>
                  <Select value={editCardForm.planId} onValueChange={(v) => setEditCardForm(prev => ({ ...prev, planId: v }))}>
                    <SelectTrigger className="h-11"><SelectValue placeholder={language === "ar" ? "اختر خدمة" : "Select plan"} /></SelectTrigger>
                    <SelectContent>
                      {plans?.map((p: any) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{language === "ar" ? "نوع الصلاحية" : "Expiry Type"}</Label>
                  <Select value={editCardForm.expiryType} onValueChange={(v: any) => setEditCardForm(prev => ({ ...prev, expiryType: v }))}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">{language === "ar" ? "ابقِ التاريخ الحالي" : "Keep Current Date"}</SelectItem>
                      <SelectItem value="custom">{language === "ar" ? "تاريخ مخصص" : "Custom Date"}</SelectItem>
                      <SelectItem value="from_activation">{language === "ar" ? "من أول استخدام" : "From first use"}</SelectItem>
                      <SelectItem value="1week">{language === "ar" ? "تمديد أسبوع" : "Extend 1 Week"}</SelectItem>
                      <SelectItem value="2weeks">{language === "ar" ? "تمديد أسبوعان" : "Extend 2 Weeks"}</SelectItem>
                      <SelectItem value="1month">{language === "ar" ? "تمديد شهر" : "Extend 1 Month"}</SelectItem>
                      <SelectItem value="3months">{language === "ar" ? "تمديد 3 أشهر" : "Extend 3 Months"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{language === "ar" ? "عدد الأجهزة المتزامنة" : "Simultaneous Devices"}</Label>
                <Input type="number" min={1} max={100} value={editCardForm.simultaneousUse} onChange={(e) => setEditCardForm(prev => ({ ...prev, simultaneousUse: e.target.value }))} className="h-11" dir="ltr" placeholder="1" />
              </div>
              {editCardForm.expiryType === "custom" && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium"><Calendar className="h-3.5 w-3.5 inline me-1" />{language === "ar" ? "تاريخ الانتهاء" : "Expiry Date"}</Label>
                  <Input type="datetime-local" value={editCardForm.expiryDate} onChange={(e) => setEditCardForm(prev => ({ ...prev, expiryDate: e.target.value }))} className="h-11" min={nowDateTimeLocal(timezone)} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium"><MessageSquare className="h-3.5 w-3.5 inline me-1 text-yellow-500" />{language === "ar" ? "ملاحظات" : "Notes"}<span className="text-muted-foreground text-xs ms-1">({language === "ar" ? "اختياري" : "optional"})</span></Label>
              <textarea className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder={language === "ar" ? "أي ملاحظات إضافية..." : "Any additional notes..."} value={editCardForm.notes} onChange={(e) => setEditCardForm(prev => ({ ...prev, notes: e.target.value }))} maxLength={1000} dir={direction} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditCardDialogOpen(false)}>{language === "ar" ? "إلغاء" : "Cancel"}</Button>
            <Button disabled={updateCardMutation.isPending || !editCardForm.username.trim() || !editCardForm.planId}
              onClick={() => {
                if (!selectedCardForEdit) return;
                if (!editCardForm.username.trim()) { toast.error(language === "ar" ? "يرجى إدخال اسم المستخدم" : "Please enter username"); return; }
                if (!editCardForm.planId) { toast.error(language === "ar" ? "يرجى اختيار الخدمة" : "Please select a plan"); return; }
                updateCardMutation.mutate({
                  cardId: selectedCardForEdit.id,
                  username: editCardForm.username.trim(),
                  password: editCardForm.password.trim() || undefined,
                  planId: parseInt(editCardForm.planId),
                  expiryType: editCardForm.expiryType,
                  expiryDate: editCardForm.expiryType === "custom" ? dateTimeLocalToUtcIso(editCardForm.expiryDate, timezone) : undefined,
                  notes: editCardForm.notes.trim() || undefined,
                  simultaneousUse: parseInt(editCardForm.simultaneousUse) || 1,
                });
              }}>
              {updateCardMutation.isPending ? (language === "ar" ? "جاري الحفظ..." : "Saving...") : (language === "ar" ? "حفظ التعديلات" : "Save Changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
