import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { parseDbDate } from "@/lib/dateFormat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
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
import { toast } from "@/lib/operationFeedback";
import { Progress } from "@/components/ui/progress";
import { useLocation, Link } from "wouter";
import {
  Plus,
  MoreHorizontal,
  Download,
  CreditCard,
  Search,
  Filter,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Printer,
  Package,
  Eye,
  Ban,
  RefreshCw,
  FileSpreadsheet,
  Wifi,
  User,
  AlertTriangle,
  TrendingUp,
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
  Upload,
  WifiOff,
  Gauge,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { InsufficientBalanceModal, isInsufficientBalanceError } from "@/components/InsufficientBalanceModal";
import { GenerateCardsWizard } from "@/components/GenerateCardsWizard";
import { usePagination } from "@/hooks/usePagination";
import { useSorting } from "@/hooks/useSorting";
import { DataPagination } from "@/components/ui/data-pagination";
import { formatPrice } from "../../../shared/currencies";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate, formatDateCompact, formatDateWithWeekday } from '@/lib/dateFormat';
import { cn } from "@/lib/utils";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { dateTimeLocalToUtcIso, formatDateTimeLocal, nowDateTimeLocal } from "@/lib/timezoneV6";
import * as XLSX from "xlsx";


export default function Vouchers() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { t, language, direction } = useLanguage();
  const { timezone } = useTimezoneV6();
  const [activeTab, setActiveTab] = useState("cards");
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isRedeemDialogOpen, setIsRedeemDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [redeemCode, setRedeemCode] = useState("");
  // Renew card dialog state
  const [isRenewDialogOpen, setIsRenewDialogOpen] = useState(false);
  const [selectedCardForRenew, setSelectedCardForRenew] = useState<any>(null);
  const [renewType, setRenewType] = useState<'custom_duration' | 'custom'>('custom_duration');
  const [renewDurationValue, setRenewDurationValue] = useState('1');
  const [renewDurationUnit, setRenewDurationUnit] = useState<'hours' | 'days' | 'weeks' | 'months'>('months');
  const [renewCustomDate, setRenewCustomDate] = useState('');
  const [renewWindowHours, setRenewWindowHours] = useState('0');
  const [renewWindowMinutes, setRenewWindowMinutes] = useState('0');
  // Suspend card dialog state
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
  const [selectedCardForSuspend, setSelectedCardForSuspend] = useState<any>(null);
  // Kick card (disconnect) dialog state
  const [isKickDialogOpen, setIsKickDialogOpen] = useState(false);
  const [selectedCardForKick, setSelectedCardForKick] = useState<any>(null);
  const [kickActiveSession, setKickActiveSession] = useState<any>(null);
  // Change speed dialog state (for online cards)
  const [isVoucherSpeedDialogOpen, setIsVoucherSpeedDialogOpen] = useState(false);
  const [selectedCardForSpeed, setSelectedCardForSpeed] = useState<any>(null);
  const [voucherSpeedSession, setVoucherSpeedSession] = useState<any>(null);
  const [voucherDownloadSpeed, setVoucherDownloadSpeed] = useState('');
  const [voucherUploadSpeed, setVoucherUploadSpeed] = useState('');
  const [voucherSpeedPreset, setVoucherSpeedPreset] = useState('');
  const VOUCHER_SPEED_PRESETS = [
    { label: '512 Kbps', download: 0.5, upload: 0.5 },
    { label: '1 Mbps', download: 1, upload: 1 },
    { label: '2 Mbps', download: 2, upload: 1 },
    { label: '4 Mbps', download: 4, upload: 2 },
    { label: '8 Mbps', download: 8, upload: 4 },
    { label: '10 Mbps', download: 10, upload: 5 },
    { label: '20 Mbps', download: 20, upload: 10 },
    { label: '50 Mbps', download: 50, upload: 25 },
    { label: '100 Mbps', download: 100, upload: 50 },
  ];
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  
  // Batch search state
  const [batchSearchQuery, setBatchSearchQuery] = useState("");
  const [debouncedBatchSearch, setDebouncedBatchSearch] = useState("");
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('batches_page_size');
    const parsed = saved ? parseInt(saved, 10) : 10;
    return [10, 20, 25, 50].includes(parsed) ? parsed : 10;
  });

  // Batch selection state
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteBatchesDialogOpen, setIsBulkDeleteBatchesDialogOpen] = useState(false);
  const [bulkDeleteWithCards, setBulkDeleteWithCards] = useState(false);
  const [isBulkDisableBatchesDialogOpen, setIsBulkDisableBatchesDialogOpen] = useState(false);
  const [isBulkEnableBatchesDialogOpen, setIsBulkEnableBatchesDialogOpen] = useState(false);
  const [isExportingBatchCards, setIsExportingBatchCards] = useState(false);
  const [exportBatchIdsForQuery, setExportBatchIdsForQuery] = useState<string[]>([]);
  const [batchExportFormat, setBatchExportFormat] = useState<"csv" | "xlsx">("csv");

  // Batch management dialogs
  const [isEditTimeDialogOpen, setIsEditTimeDialogOpen] = useState(false);
  const [isEditPropertiesDialogOpen, setIsEditPropertiesDialogOpen] = useState(false);
  const [isDeleteBatchDialogOpen, setIsDeleteBatchDialogOpen] = useState(false);
  const [deleteWithCards, setDeleteWithCards] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  
  // Edit time form
  const [editTimeForm, setEditTimeForm] = useState({
    cardTimeValue: "0",
    cardTimeUnit: "hours" as "hours" | "days",
    internetTimeValue: "0",
    internetTimeUnit: "hours" as "hours" | "days",
    timeFromActivation: true,
  });
  
  // Edit properties form
  const [editPropertiesForm, setEditPropertiesForm] = useState({
    simultaneousUse: "1",
    planId: "",
    hotspotPort: "",
    macBinding: false,
  });
  
  // Form state for generating cards - managed by GenerateCardsWizard

  // Progress state for bulk generation
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Navigation
  const [, setLocation] = useLocation();

  // Read ?search= URL param on mount to pre-fill search (used by card-lookup edit button)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
      setDebouncedSearch(searchParam);
    }
  }, []);

  // Print settings
  const [printSettings, setPrintSettings] = useState({
    companyName: "RADIUS SaaS",
    hotspotUrl: "",
    cardsPerPage: "8",
  });

  // Debounced search query for server-side search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Debounced batch search
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedBatchSearch(batchSearchQuery); setBatchPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [batchSearchQuery]);

  // Server-side pagination state
  const [serverPage, setServerPage] = useState(1);
  const [pageLimit, setPageLimit] = useState<number>(() => {
    const saved = localStorage.getItem('vouchers_page_limit');
    const parsed = saved ? parseInt(saved, 10) : 50;
    return [10, 50, 100, 250, 500, 1000].includes(parsed) ? parsed : 50;
  });

  // Reset to page 1 when filters change
  useEffect(() => { setServerPage(1); }, [statusFilter, batchFilter, debouncedSearch]);

  // Fetch vouchers - server-side filtered & paginated
  const { data: vouchersResult, isLoading, refetch } = trpc.vouchers.list.useQuery({
    status: statusFilter !== "all" ? statusFilter as "unused" | "active" | "used" | "expired" | "suspended" | "cancelled" : undefined,
    batchId: batchFilter !== "all" ? batchFilter : undefined,
    search: debouncedSearch || undefined,
    isManual: false,
    page: serverPage,
    limit: pageLimit,
  });
  const vouchers = vouchersResult?.data;
  const serverTotal = vouchersResult?.total ?? 0;
  const serverTotalPages = vouchersResult?.totalPages ?? 1;

  // Fetch stats separately (lightweight query)
  const { data: cardStats, refetch: refetchStats } = trpc.vouchers.getStats.useQuery();

  // Card search across all batches (only when batchSearchQuery is a card-like search)
  const [cardSearchPage, setCardSearchPage] = useState(1);
  const [cardSearchPageSize, setCardSearchPageSize] = useState(20);
  const isCardSearch = debouncedBatchSearch.trim().length >= 2;
  const { data: cardSearchResult, isLoading: isCardSearchLoading } = trpc.vouchers.list.useQuery(
    { search: debouncedBatchSearch.trim(), isManual: false, page: cardSearchPage, limit: cardSearchPageSize },
    { enabled: isCardSearch }
  );
  const cardSearchData = cardSearchResult?.data ?? [];
  const cardSearchTotal = cardSearchResult?.total ?? 0;
  const cardSearchTotalPages = cardSearchResult?.totalPages ?? 1;

  // Fetch batches
  const { data: batches, refetch: refetchBatches } = trpc.vouchers.getBatches.useQuery();

  // Export cards from multiple batches (lazy)
  const exportMultipleBatchCardsQuery = trpc.vouchers.exportMultipleBatchCards.useQuery(
    { batchIds: exportBatchIdsForQuery },
    { enabled: exportBatchIdsForQuery.length > 0 }
  );

  // When export data arrives, generate and download CSV
  useEffect(() => {
    if (!exportBatchIdsForQuery.length) return;
    if (exportMultipleBatchCardsQuery.isLoading) return;
    if (!exportMultipleBatchCardsQuery.data) return;
    const cards = exportMultipleBatchCardsQuery.data;
    if (cards.length === 0) {
      toast.validation(language === 'ar' ? 'لا توجد كروت في الدفعات المحددة' : 'No cards in selected batches');
      setExportBatchIdsForQuery([]);
      setIsExportingBatchCards(false);
      return;
    }
    const exportRows = (cards as any[]).map((c: any, i: number) => ({
      'الاى دى': c.serialNumber || String(i + 1).padStart(12, '0'),
      'اسم المستخدم': c.username || '',
      'كلمة المرور': c.password || '',
    }));
    if (batchExportFormat === 'xlsx') {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), 'Cards');
      XLSX.writeFile(workbook, `cards-batches-${Date.now()}.xlsx`);
    } else {
      const rows = ['الاى دى;اسم المستخدم;كلمة المرور', ...exportRows.map(row =>
        `"${row['الاى دى']}";"${row['اسم المستخدم'].replace(/"/g, '""')}";"${row['كلمة المرور'].replace(/"/g, '""')}"`)
      ];
      const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cards-batches-${Date.now()}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    toast.success(language === 'ar' ? `تم تصدير ${cards.length} كرت` : `Exported ${cards.length} cards`);
    setExportBatchIdsForQuery([]);
    setIsExportingBatchCards(false);
  }, [exportMultipleBatchCardsQuery.data, exportMultipleBatchCardsQuery.isLoading, exportBatchIdsForQuery, batchExportFormat, language]);

  // Fetch plans for selection
  const { data: plans } = trpc.plans.list.useQuery();

  // Fetch subscriber groups
  const { data: subscriberGroups } = trpc.vouchers.getSubscriberGroups.useQuery();
  // Fetch NAS devices for display info
  const { data: nasDevices } = trpc.nas.list.useQuery();

  // Mutations
  const generateMutation = trpc.vouchers.generate.useMutation({
    onMutate: () => {
      setIsGenerating(true);
      setGenerationProgress(0);
      // Simulate progress for better UX
      const interval = setInterval(() => {
        setGenerationProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 200);
      return { interval };
    },
    onSuccess: (data, _, context) => {
      if (context?.interval) clearInterval(context.interval);
      setGenerationProgress(100);
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationProgress(0);
        toast.success(language === 'ar' 
          ? `تم إنشاء ${data.quantity} كرت بنجاح` 
          : `Successfully generated ${data.quantity} cards`
        );
        setIsGenerateDialogOpen(false);
        refetch();
        refetchStats();
        refetchBatches();
        resetGenerateForm();
      }, 500);
    },
    onError: (error, _, context) => {
      if (context?.interval) clearInterval(context.interval);
      setIsGenerating(false);
      setGenerationProgress(0);
      if (isInsufficientBalanceError(error)) {
        setShowInsufficientBalance(true);
      } else {
        toast.error(error.message);
      }
    },
  });

  const redeemMutation = trpc.vouchers.redeem.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم تفعيل الكرت بنجاح' : 'Card activated successfully');
      setIsRedeemDialogOpen(false);
      setRedeemCode("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const suspendMutation = trpc.vouchers.suspend.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم تعليق الكرت' : 'Card suspended');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const unsuspendMutation = trpc.vouchers.unsuspend.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم إعادة تفعيل الكرت' : 'Card reactivated');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Delete card dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCardForDelete, setSelectedCardForDelete] = useState<any>(null);

  // Edit notes dialog state
  const [isEditNotesDialogOpen, setIsEditNotesDialogOpen] = useState(false);
  const [selectedCardForNotes, setSelectedCardForNotes] = useState<any>(null);
  const [notesText, setNotesText] = useState('');

  // Edit card dialog state
  const [isEditCardDialogOpen, setIsEditCardDialogOpen] = useState(false);
  const [selectedCardForEdit, setSelectedCardForEdit] = useState<any>(null);
  const [editCardForm, setEditCardForm] = useState({
    username: '',
    password: '',
    planId: '',
    expiryType: 'keep' as 'keep' | '1week' | '2weeks' | '1month' | '3months' | 'custom' | 'from_activation',
    expiryDate: '',
    notes: '',
    simultaneousUse: '1',
  });
  const [showEditPassword, setShowEditPassword] = useState(false);

  // Build the current query input for vouchers.list (matches the useQuery call below)
  // Memoized to avoid unstable reference on every render
  const currentListInput = useMemo(() => ({
    status: statusFilter !== "all" ? statusFilter as "unused" | "active" | "used" | "expired" | "suspended" | "cancelled" : undefined,
    batchId: batchFilter !== "all" ? batchFilter : undefined,
    search: debouncedSearch || undefined,
    isManual: false as const,
    page: serverPage,
    limit: pageLimit,
  }), [statusFilter, batchFilter, debouncedSearch, serverPage, pageLimit]);

  const updateCardMutation = trpc.vouchers.updateCard.useMutation({
    onMutate: async (variables) => {
      // 1. Cancel any outgoing refetches to avoid overwriting the optimistic update
      await utils.vouchers.list.cancel(currentListInput);

      // 2. Snapshot the previous data for rollback
      const previousData = utils.vouchers.list.getData(currentListInput);

      // 3. Optimistically update the cache — update only the matching card
      utils.vouchers.list.setData(currentListInput, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((card: any) =>
            card.id === variables.cardId
              ? {
                  ...card,
                  username: variables.username,
                  planId: variables.planId,
                  notes: variables.notes ?? card.notes,
                  simultaneousUse: variables.simultaneousUse ?? card.simultaneousUse,
                  // Keep password only if explicitly provided
                  ...(variables.password ? { password: variables.password } : {}),
                }
              : card
          ),
        };
      });

      // 4. Return snapshot for rollback in onError
      return { previousData };
    },
    onSuccess: (data) => {
      toast.success(language === 'ar' ? `تم تعديل الكرت بنجاح: ${data.username}` : `Card updated: ${data.username}`);
      setIsEditCardDialogOpen(false);
      setSelectedCardForEdit(null);
    },
    onError: (error, _variables, context) => {
      // Rollback to previous data on error
      if (context?.previousData) {
        utils.vouchers.list.setData(currentListInput, context.previousData);
      }
      if (error.message.includes('موجود مسبقاً') || error.message.includes('CONFLICT')) {
        toast.error(language === 'ar' ? 'اسم المستخدم موجود مسبقاً، جرب اسماً آخر' : 'Username already exists');
      } else {
        toast.error(error.message);
      }
    },
    onSettled: () => {
      // Always sync with server after mutation completes (success or error)
      utils.vouchers.list.invalidate(currentListInput);
    },
  });

  const updateNotesMutation = trpc.vouchers.updateNotes.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم حفظ الملاحظة بنجاح' : 'Note saved successfully');
      setIsEditNotesDialogOpen(false);
      setSelectedCardForNotes(null);
      setNotesText('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const renewCardMutation = trpc.vouchers.renewCard.useMutation({
    onSuccess: (data) => {
      const expiresAt = data.newExpiresAt;
      toast.success(language === 'ar'
        ? (expiresAt ? `تم تجديد الكرت حتى ${formatDate(expiresAt)}` : 'تم تجديد الكرت بنجاح')
        : (expiresAt ? `Card renewed until ${(() => { const d = parseDbDate(expiresAt) ?? new Date(expiresAt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })()}` : 'Card renewed successfully'));
      setIsRenewDialogOpen(false);
      setSelectedCardForRenew(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteCardMutation = trpc.vouchers.deleteCard.useMutation({
    onSuccess: (data) => {
      toast.success(language === 'ar'
        ? `تم حذف الكرت ${data.username} بنجاح`
        : `Card ${data.username} deleted successfully`);
      setIsDeleteDialogOpen(false);
      setSelectedCardForDelete(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Kick (disconnect) mutation
  const kickCardMutation = trpc.sessions.coaDisconnect.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم طرد الكرت بنجاح' : 'Card disconnected successfully');
      setIsKickDialogOpen(false);
      setKickActiveSession(null);
      setSelectedCardForKick(null);
    },
    onError: (err) => toast.error(err.message),
  });
  // Change speed mutation (for online cards)
  const voucherChangeSpeedMutation = trpc.sessions.mikrotikChangeSpeed.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم تغيير السرعة بنجاح' : 'Speed changed successfully');
      setIsVoucherSpeedDialogOpen(false);
      setVoucherSpeedSession(null);
      setSelectedCardForSpeed(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const generatePDFMutation = trpc.vouchers.generateBatchPDF.useMutation({
    onSuccess: (data) => {
      if (data.htmlUrl) {
        window.open(data.htmlUrl, '_blank');
      }
      toast.success(language === 'ar' ? 'تم إنشاء ملف PDF' : 'PDF generated successfully');
      setIsPrintDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Batch management mutations
  const enableBatchMutation = trpc.vouchers.enableBatch.useMutation({
    onSuccess: (data) => {
      toast.success(language === 'ar' 
        ? `تم تمكين الدفعة (${data.affectedCards} كرت)` 
        : `Batch enabled (${data.affectedCards} cards)`);
      refetchBatches();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const disableBatchMutation = trpc.vouchers.disableBatch.useMutation({
    onSuccess: (data) => {
      toast.success(language === 'ar' 
        ? `تم تعطيل الدفعة (${data.affectedCards} كرت)` 
        : `Batch disabled (${data.affectedCards} cards)`);
      refetchBatches();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateBatchTimeMutation = trpc.vouchers.updateBatchTime.useMutation({
    onSuccess: (data) => {
      toast.success(language === 'ar' 
        ? `تم تحديث الوقت (${data.affectedCards} كرت)` 
        : `Time updated (${data.affectedCards} cards)`);
      setIsEditTimeDialogOpen(false);
      refetchBatches();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateBatchPropertiesMutation = trpc.vouchers.updateBatchProperties.useMutation({
    onSuccess: (data) => {
      toast.success(language === 'ar' 
        ? `تم تحديث الخصائص (${data.affectedCards} كرت)` 
        : `Properties updated (${data.affectedCards} cards)`);
      setIsEditPropertiesDialogOpen(false);
      refetchBatches();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteBatchMutation = trpc.vouchers.deleteBatch.useMutation({
    onSuccess: (data) => {
      if (data.deletedCards > 0) {
        toast.success(language === 'ar' 
          ? `تم حذف الدفعة و ${data.deletedCards} كرت` 
          : `Batch and ${data.deletedCards} cards deleted`);
      } else {
        toast.success(language === 'ar' 
          ? `تم حذف الدفعة (الكروت موجودة)` 
          : `Batch deleted (cards preserved)`);
      }
      setIsDeleteBatchDialogOpen(false);
      setDeleteWithCards(false);
      refetchBatches();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const bulkDeleteBatchesMutation = trpc.vouchers.bulkDeleteBatches.useMutation({
    onSuccess: (data) => {
      toast.success(language === 'ar' ? `تم حذف ${data.deleted} دفعة بنجاح` : `${data.deleted} batches deleted`);
      setIsBulkDeleteBatchesDialogOpen(false);
      setBulkDeleteWithCards(false);
      setSelectedBatchIds(new Set());
      refetchBatches();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const bulkDisableBatchesMutation = trpc.vouchers.bulkDisableBatches.useMutation({
    onSuccess: (data) => {
      toast.success(language === 'ar' ? `تم تعطيل الدفعات المحددة (${data.affected} كرت)` : `Batches disabled (${data.affected} cards)`);
      setSelectedBatchIds(new Set());
      refetchBatches();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const bulkEnableBatchesMutation = trpc.vouchers.bulkEnableBatches.useMutation({
    onSuccess: (data) => {
      toast.success(language === 'ar' ? `تم تفعيل الدفعات المحددة (${data.affected} كرت)` : `Batches enabled (${data.affected} cards)`);
      setSelectedBatchIds(new Set());
      setIsBulkEnableBatchesDialogOpen(false);
      refetchBatches();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Batch action handlers
  const handleEnableBatch = (batchId: string) => {
    enableBatchMutation.mutate({ batchId });
  };

  const handleDisableBatch = (batchId: string) => {
    disableBatchMutation.mutate({ batchId });
  };

  const openEditTimeDialog = (batch: any) => {
    setSelectedBatch(batch);
    // Convert usageBudgetSeconds → value+unit for display
    const toValueUnit = (secs: number | null | undefined, legacyVal: number, legacyUnit: string) => {
      if (secs && secs > 0) {
        if (secs % 86400 === 0) return { value: String(secs / 86400), unit: 'days' };
        if (secs % 3600 === 0) return { value: String(secs / 3600), unit: 'hours' };
        return { value: String(Math.floor(secs / 60)), unit: 'hours' };
      }
      // fallback to legacy
      if (legacyVal && legacyVal > 0) return { value: String(legacyVal), unit: legacyUnit || 'hours' };
      return { value: '', unit: 'hours' };
    };
    const cardTime = toValueUnit(batch.windowSeconds, batch.cardTimeValue, batch.cardTimeUnit);
    const internetTime = toValueUnit(batch.usageBudgetSeconds, batch.internetTimeValue, batch.internetTimeUnit);
    setEditTimeForm({
      cardTimeValue: cardTime.value,
      cardTimeUnit: cardTime.unit as 'hours' | 'days',
      internetTimeValue: internetTime.value,
      internetTimeUnit: internetTime.unit as 'hours' | 'days',
      timeFromActivation: batch.timeFromActivation !== false,
    });
    setIsEditTimeDialogOpen(true);
  };

  const openEditPropertiesDialog = (batch: any) => {
    setSelectedBatch(batch);
    setEditPropertiesForm({
      simultaneousUse: String(batch.simultaneousUse || 1),
      planId: String(batch.planId || ''),
      hotspotPort: batch.hotspotPort || '',
      macBinding: batch.macBinding || false,
    });
    setIsEditPropertiesDialogOpen(true);
  };

  const openDeleteBatchDialog = (batch: any) => {
    setSelectedBatch(batch);
    setIsDeleteBatchDialogOpen(true);
  };

  const handleDeleteBatch = () => {
    if (!selectedBatch) return;
    deleteBatchMutation.mutate({
      batchId: selectedBatch.batchId,
      deleteCards: true,
    });
  };

  const handleUpdateBatchTime = () => {
    if (!selectedBatch) return;
    updateBatchTimeMutation.mutate({
      batchId: selectedBatch.batchId,
      cardTimeValue: parseInt(editTimeForm.cardTimeValue) || 0,
      cardTimeUnit: editTimeForm.cardTimeUnit,
      internetTimeValue: parseInt(editTimeForm.internetTimeValue) || 0,
      internetTimeUnit: editTimeForm.internetTimeUnit,
      timeFromActivation: editTimeForm.timeFromActivation,
    });
  };

  const handleUpdateBatchProperties = () => {
    if (!selectedBatch) return;
    updateBatchPropertiesMutation.mutate({
      batchId: selectedBatch.batchId,
      simultaneousUse: parseInt(editPropertiesForm.simultaneousUse) || 1,
      planId: editPropertiesForm.planId ? parseInt(editPropertiesForm.planId) : undefined,
      hotspotPort: editPropertiesForm.hotspotPort || undefined,
      macBinding: editPropertiesForm.macBinding,
    });
  };

  const resetGenerateForm = () => {
    // Reset is handled inside GenerateCardsWizard
  };

  const handleWizardSubmit = (form: {
    quantity: string;
    batchName: string;
    prefix: string;
    usernameLength: string;
    passwordLength: string;
    planId: string;
    subscriberGroup: string;
    usageHours: string;
    usageMinutes: string;
    windowHours: string;
    windowMinutes: string;
    timeFromActivation: boolean;
    macBinding: boolean;
    authType: 'password' | 'username-only';
    salePrice?: number;
    purchasePrice?: number;
  }) => {
    const usageBudgetSeconds =
      (parseInt(form.usageHours) || 0) * 3600 +
      (parseInt(form.usageMinutes) || 0) * 60;
    const windowSeconds =
      (parseInt(form.windowHours) || 0) * 3600 +
      (parseInt(form.windowMinutes) || 0) * 60;
    generateMutation.mutate({
      planId: parseInt(form.planId),
      quantity: parseInt(form.quantity) || 10,
      batchName: form.batchName || undefined,
      prefix: form.prefix,
      usernameLength: parseInt(form.usernameLength),
      passwordLength: parseInt(form.passwordLength) || 4,
      subscriberGroup: form.subscriberGroup || 'Default group',
      hotspotPort: undefined,
      internetTimeValue: 0,
      internetTimeUnit: 'hours',
      cardTimeValue: 0,
      cardTimeUnit: 'hours',
      timeFromActivation: form.timeFromActivation,
      macBinding: form.macBinding,
      usageBudgetSeconds,
      windowSeconds,
      authType: form.authType,
      // سعر البيع والشراء مجمَّد من الباقة وقت الإنشاء
      salePrice: form.salePrice,
      purchasePrice: form.purchasePrice,
    });
  };

  const handleRedeemCard = () => {
    if (!redeemCode.trim()) {
      toast.validation(language === 'ar' ? 'يرجى إدخال رمز الكرت' : 'Please enter card code');
      return;
    }
    redeemMutation.mutate({ code: redeemCode.trim() });
  };

  const handlePrintBatch = () => {
    if (!selectedBatchId) {
      toast.validation(language === 'ar' ? 'يرجى اختيار دفعة' : 'Please select a batch');
      return;
    }
    generatePDFMutation.mutate({
      batchId: selectedBatchId,
      companyName: printSettings.companyName,
      hotspotUrl: printSettings.hotspotUrl,
      cardsPerPage: parseInt(printSettings.cardsPerPage) || 8,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(language === 'ar' ? 'تم النسخ' : 'Copied');
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
        {language === 'ar' ? config.labelAr : config.label}
      </span>
    );
  };

  // Calculate expiry info for progress bar
  const getExpiryInfo = (voucher: any) => {
    if (!voucher.expiresAt) {
      return { label: language === 'ar' ? 'بدون حد' : 'No limit', progress: 100, color: 'bg-slate-400', daysLeft: null };
    }
    const now = new Date();
    const expiresAt = parseDbDate(voucher.expiresAt) ?? new Date(voucher.expiresAt);
    const createdAt = parseDbDate(voucher.createdAt) ?? new Date(voucher.createdAt);
    const totalMs = expiresAt.getTime() - createdAt.getTime();
    const remainingMs = expiresAt.getTime() - now.getTime();
    if (remainingMs <= 0) {
      return { label: language === 'ar' ? 'منتهي' : 'Expired', progress: 0, color: 'bg-red-500', daysLeft: 0 };
    }
    // Use floor for whole days — avoids showing "1 يوم" when only 20 hours remain
    const daysLeft = Math.floor(remainingMs / 86400000);
    const hoursLeft = Math.floor((remainingMs % 86400000) / 3600000);
    const progress = Math.max(5, Math.min(100, (remainingMs / totalMs) * 100));
    let color = 'bg-emerald-500';
    let label = '';
    if (daysLeft === 0) {
      // Less than 1 full day — show hours
      color = 'bg-red-500';
      label = language === 'ar'
        ? (hoursLeft <= 0 ? 'أقل من ساعة' : `يتبقى ${hoursLeft} ساعة`)
        : (hoursLeft <= 0 ? '<1h left' : `${hoursLeft}h left`);
    } else if (daysLeft <= 3) {
      color = 'bg-red-500';
      label = language === 'ar' ? `يتبقى ${daysLeft} يوم` : `${daysLeft}d left`;
    } else if (daysLeft <= 7) {
      color = 'bg-amber-500';
      label = language === 'ar' ? `يتبقى ${daysLeft} أيام` : `${daysLeft}d left`;
    } else {
      label = language === 'ar' ? `يتبقى ${daysLeft} يوم` : `${daysLeft}d left`;
    }
    return { label, progress, color, daysLeft };
  };

   // Server-side: no client-side filtering needed
  const filteredVouchers = vouchers ?? [];
  // Sorting (client-side on current page only)
  const { sortedData: sortedVouchers, sortColumn, sortDirection, handleSort } = useSorting(
    filteredVouchers,
    "createdAt",
    "desc"
  );
  // Use server-side pagination values
  const paginatedVouchers = sortedVouchers;
  const currentPage = serverPage;
  const totalPages = serverTotalPages;
  const totalItems = serverTotal;
  const itemsPerPage = pageLimit;
  const setCurrentPage = setServerPage;

  // Batch search + pagination (client-side on already-fetched batches)
  const filteredBatches = useMemo(() => {
    if (!batches) return [];
    if (!debouncedBatchSearch.trim()) return batches;
    const q = debouncedBatchSearch.trim().toLowerCase();
    return batches.filter((b: any) =>
      (b.name || '').toLowerCase().includes(q) ||
      (b.planName || '').toLowerCase().includes(q) ||
      (b.batchId || '').toLowerCase().includes(q)
    );
  }, [batches, debouncedBatchSearch]);

  const batchTotalPages = Math.max(1, Math.ceil(filteredBatches.length / batchPageSize));
  const paginatedBatches = useMemo(() => {
    const start = (batchPage - 1) * batchPageSize;
    return filteredBatches.slice(start, start + batchPageSize);
  }, [filteredBatches, batchPage, batchPageSize]);

   const isAdmin = user?.role === 'super_admin' || user?.role === 'owner';
  // Allow owner, client, reseller, and admin to create cards
  const canCreateCards = user?.role === 'owner' || user?.role === 'client' || user?.role === 'reseller' || isAdmin;
  const isReseller = canCreateCards; // Keep for backward compatibility
  const isClient = user?.role === 'client';

  // Activity is bound to a card lifecycle so reused usernames never inherit old sessions.
  const paginatedLifecycleIdsForActivity = useMemo(
    () => (paginatedVouchers ?? []).map((v: any) => v.lifecycleId).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify((paginatedVouchers ?? []).map((v: any) => v.lifecycleId))]
  );
  const { data: activityMap } = trpc.vouchers.getActivity.useQuery(
    { lifecycleIds: paginatedLifecycleIdsForActivity },
    { enabled: paginatedLifecycleIdsForActivity.length > 0 }
  );

  // Activity for card search results
  const cardSearchLifecycleIdsForActivity = useMemo(
    () => cardSearchData.map((v: any) => v.lifecycleId).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(cardSearchData.map((v: any) => v.lifecycleId))]
  );
  const { data: cardSearchActivityMap } = trpc.vouchers.getActivity.useQuery(
    { lifecycleIds: cardSearchLifecycleIdsForActivity },
    { enabled: isCardSearch && cardSearchLifecycleIdsForActivity.length > 0 }
  );

  // ── Online status: bound to immutable card lifecycle, not a reusable username ──
  const vouchersAny = (trpc.vouchers as any);
  const paginatedLifecycleIds = useMemo(() => (paginatedVouchers ?? []).map((v: any) => v.lifecycleId).filter(Boolean), [paginatedVouchers]);
  const { data: onlineCardIdsRaw } = vouchersAny.getOnlineCardIds.useQuery(
    { lifecycleIds: paginatedLifecycleIds },
    { enabled: paginatedLifecycleIds.length > 0, refetchInterval: 120_000, refetchIntervalInBackground: false, staleTime: 60_000 }
  );
  const onlineSet = useMemo(() => new Set<number>(onlineCardIdsRaw ?? []), [onlineCardIdsRaw]);

  // Online status for card search results
  const cardSearchLifecycleIds = useMemo(() => cardSearchData.map((v: any) => v.lifecycleId).filter(Boolean), [cardSearchData]);
  const { data: searchOnlineRaw } = vouchersAny.getOnlineCardIds.useQuery(
    { lifecycleIds: cardSearchLifecycleIds },
    { enabled: isCardSearch && cardSearchLifecycleIds.length > 0, refetchInterval: 120_000, refetchIntervalInBackground: false, staleTime: 60_000 }
  );
  const searchOnlineSet = useMemo(() => new Set<number>(searchOnlineRaw ?? []), [searchOnlineRaw]);

  // ── Batch online counts (unused - using stats.currentlyActive instead) ──
  const paginatedBatchIds = useMemo(
    () => (paginatedBatches ?? []).map((b: any) => b.batchId).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify((paginatedBatches ?? []).map((b: any) => b.batchId))]
  );

  return (
    <div className="space-y-6" dir={direction}>
      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        open={showInsufficientBalance}
        onClose={() => setShowInsufficientBalance(false)}
      />
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {language === 'ar' ? 'إدارة الكروت' : 'Card Management'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ar' 
              ? 'إنشاء وإدارة كروت RADIUS للمشتركين'
              : 'Create and manage RADIUS cards for subscribers'
            }
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">

          
          {isReseller && (
            <>
              <Button variant="outline" onClick={() => setLocation('/print-cards')}>
                <Printer className="h-4 w-4 me-2" />
                {language === 'ar' ? 'طباعة PDF' : 'Print PDF'}
              </Button>



              <Link href="/import-cards">
                <Button variant="outline">
                  <Upload className="h-4 w-4 me-2" />
                  {language === 'ar' ? 'استيراد كروت' : 'Import Cards'}
                </Button>
              </Link>
              <Button onClick={() => setIsGenerateDialogOpen(true)}>
                <Plus className="h-4 w-4 me-2" />
                {language === 'ar' ? 'إنشاء كروت' : 'Generate Cards'}
              </Button>
              <GenerateCardsWizard
                open={isGenerateDialogOpen}
                onOpenChange={setIsGenerateDialogOpen}
                plans={(plans || []).map((p: any) => ({
                  id: p.id,
                  name: p.name,
                  nameAr: p.nameAr,
                  price: p.price,
                  resellerPrice: p.resellerPrice,
                  currency: p.currency,
                  downloadSpeed: p.downloadSpeed,
                  uploadSpeed: p.uploadSpeed,
                  validityValue: p.validityValue,
                  validityType: p.validityType,
                }))}
                subscriberGroups={subscriberGroups || []}
                isGenerating={isGenerating}
                generationProgress={generationProgress}
                onSubmit={handleWizardSubmit}
                language={language}
                userCurrency={(plans || []).find((p: any) => true)?.currency || 'USD'}
              />
            </>
          )}
        </div>
      </div>

      {/* Stats Cards — Nano Banana Design */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {/* PRIMARY: Total - Teal Gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-teal-600 p-4 shadow-md col-span-2 md:col-span-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-white/70 mb-1">{language === 'ar' ? 'إجمالي الكروت' : 'Total Cards'}</p>
              <p className="text-4xl font-bold text-white tracking-tight">{cardStats?.total ?? serverTotal}</p>
              <p className="text-xs text-white/60 mt-1">{language === 'ar' ? 'كل الكروت' : 'All cards'}</p>
            </div>
            <div className="rounded-xl bg-white/20 p-2">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">
              {language === 'ar' ? 'نشط' : 'Active'}: {cardStats?.active ?? 0}
            </span>
            <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">
              {language === 'ar' ? 'غير مستخدم' : 'Unused'}: {cardStats?.unused ?? 0}
            </span>
          </div>
        </div>
        {/* Active */}
        <div className="relative overflow-hidden rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 p-4 shadow-sm hover:shadow-md transition-all border-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1 uppercase tracking-wide">{language === 'ar' ? 'نشطة' : 'Active'}</p>
              <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">{cardStats?.active ?? 0}</p>
              <p className="text-xs text-emerald-600/70 mt-1">{language === 'ar' ? 'قيد الاستخدام' : 'In use'}</p>
            </div>
            <div className="rounded-xl bg-emerald-500/20 p-2">
              <Zap className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </div>
        {/* Expired */}
        <div className="relative overflow-hidden rounded-2xl bg-red-50 dark:bg-red-950/30 p-4 shadow-sm hover:shadow-md transition-all border-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1 uppercase tracking-wide">{language === 'ar' ? 'منتهية' : 'Expired'}</p>
              <p className="text-3xl font-bold text-red-700 dark:text-red-400">{cardStats?.expired ?? 0}</p>
              <p className="text-xs text-red-600/70 mt-1">{language === 'ar' ? 'تجاوزت صلاحيتها' : 'Past expiry'}</p>
            </div>
            <div className="rounded-xl bg-red-500/20 p-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
        {/* Manual */}
        <div className="relative overflow-hidden rounded-2xl bg-violet-50 dark:bg-violet-950/30 p-4 shadow-sm hover:shadow-md transition-all border-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-violet-700 dark:text-violet-400 mb-1 uppercase tracking-wide">{language === 'ar' ? 'يدوي' : 'Manual'}</p>
              <p className="text-3xl font-bold text-violet-700 dark:text-violet-400">{cardStats?.manual ?? 0}</p>
              <p className="text-xs text-violet-600/70 mt-1">{language === 'ar' ? 'منشأة يدوياً' : 'Manually created'}</p>
            </div>
            <div className="rounded-xl bg-violet-500/20 p-2">
              <User className="h-5 w-5 text-violet-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Batches Section - Direct (no tabs) */}
      {false && <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={language === 'ar' ? 'بحث بالرقم أو اسم المستخدم أو اسم العميل...' : 'Search by number, username or customer name...'}
                className="ps-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {/* Batch Filter */}
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="w-[180px]">
                <Package className="h-4 w-4 me-2" />
                <SelectValue placeholder={language === 'ar' ? 'الدفعة' : 'Batch'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'ar' ? 'كل الدفعات' : 'All Batches'}</SelectItem>
                {batches?.map((batch: any) => (
                  <SelectItem key={batch.batchId} value={batch.batchId}>
                    {batch.name || `${language === 'ar' ? 'دفعة' : 'Batch'} #${batch.batchId?.slice(0, 6)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 me-2" />
                <SelectValue placeholder={language === 'ar' ? 'الحالة' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'ar' ? 'كل الحالات' : 'All Status'}</SelectItem>
                <SelectItem value="unused">{language === 'ar' ? 'غير مستخدم' : 'Unused'}</SelectItem>
                <SelectItem value="active">{language === 'ar' ? 'نشط' : 'Active'}</SelectItem>
                <SelectItem value="used">{language === 'ar' ? 'مستخدم' : 'Used'}</SelectItem>
                <SelectItem value="expired">{language === 'ar' ? 'منتهي' : 'Expired'}</SelectItem>
                <SelectItem value="suspended">{language === 'ar' ? 'معلق' : 'Suspended'}</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Quick Filter Chips + Results Count */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium me-1">{language === 'ar' ? 'فلتر سريع:' : 'Quick:'}</span>

            <div className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
              <span>{language === 'ar' ? 'عرض' : 'Show'}</span>
              <select
                value={pageLimit}
                onChange={(e) => {
                  const size = Number(e.target.value);
                  setPageLimit(size);
                  setServerPage(1);
                  localStorage.setItem('vouchers_page_limit', String(size));
                }}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {[10, 50, 100, 250, 500, 1000].map(s => (
                  <option key={s} value={s}>{s.toLocaleString()}</option>
                ))}
              </select>
              <span>{language === 'ar' ? `من ${serverTotal.toLocaleString()} كرت` : `of ${serverTotal.toLocaleString()} cards`}</span>
            </div>
          </div>

          {/* Cards Table — Modern Table Pro */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 border-b">
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[50px] ps-4">{language === 'ar' ? 'إجراءات' : 'Actions'}</TableHead>
                  <SortableTableHead column="username" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'رقم الكرت' : 'Card No.'}
                  </SortableTableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'اسم العميل' : 'Customer'}</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'كلمة السر' : 'Password'}</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'الخطة/الباقة' : 'Plan'}</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'وقت الكرت' : 'Time'}</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'صلاحية الاستخدام' : 'Window'}</TableHead>
                  <SortableTableHead column="status" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'الحالة' : 'Status'}
                  </SortableTableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'أول دخول' : 'First Login'}
                  </TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'آخر تواجد' : 'Last Seen'}
                  </TableHead>
                  <SortableTableHead column="expiresAt" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'تاريخ الانتهاء' : 'Expires'}
                  </SortableTableHead>
                  <SortableTableHead column="createdAt" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    {language === 'ar' ? 'تاريخ الإنشاء' : 'Created'}
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={5} columns={6} />
                ) : paginatedVouchers?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <CreditCard className="h-10 w-10 text-muted-foreground/30" />
                        <p className="text-sm">{language === 'ar' ? 'لا توجد كروت' : 'No cards found'}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedVouchers?.map((voucher: any) => {
                    const expiryInfo = getExpiryInfo(voucher);
                    const isExpiringSoon = expiryInfo.daysLeft !== null && expiryInfo.daysLeft <= 3 && expiryInfo.daysLeft > 0;
                    return (
                      <TableRow key={voucher.id} className={`hover:bg-muted/20 transition-colors group border-b last:border-0 ${isExpiringSoon ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}`}>
                        {/* Actions - first column */}
                        <TableCell className="py-3.5 ps-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52">
                              <DropdownMenuItem onClick={() => copyToClipboard(`${voucher.username}:${voucher.password}`)}>
                                <Copy className="h-4 w-4 me-2 text-muted-foreground" />
                                {language === 'ar' ? 'نسخ البيانات' : 'Copy Credentials'}
                              </DropdownMenuItem>
                              {/* Renew card */}
                              <DropdownMenuItem onClick={() => { setSelectedCardForRenew(voucher); setRenewType('custom_duration'); setRenewDurationValue('1'); setRenewDurationUnit('months'); setRenewCustomDate(''); setRenewWindowHours('0'); setRenewWindowMinutes('0'); setIsRenewDialogOpen(true); }}>
                                <RotateCcw className="h-4 w-4 me-2 text-emerald-500" />
                                {language === 'ar' ? 'تجديد الصلاحية' : 'Renew Validity'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {/* Suspend / Unsuspend */}
                              {voucher.status !== 'suspended' ? (
                                <DropdownMenuItem
                                  className="text-orange-600 dark:text-orange-400 focus:text-orange-600"
                                  onClick={() => { setSelectedCardForSuspend(voucher); setIsSuspendDialogOpen(true); }}
                                >
                                  <ShieldOff className="h-4 w-4 me-2" />
                                  {language === 'ar' ? 'إيقاف الكرت' : 'Suspend Card'}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-emerald-600 dark:text-emerald-400 focus:text-emerald-600"
                                  onClick={() => unsuspendMutation.mutate({ cardId: voucher.id })}
                                >
                                  <CheckCircle2 className="h-4 w-4 me-2" />
                                  {language === 'ar' ? 'إعادة تفعيل الكرت' : 'Reactivate Card'}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedCardForEdit(voucher);
                                  const isExpired = voucher.expiresAt && (parseDbDate(voucher.expiresAt) ?? new Date(0)) < new Date();
                                  setEditCardForm({
                                    username: voucher.username || '',
                                    password: voucher.password || '',
                                    planId: String(voucher.planId || ''),
                                    expiryType: isExpired ? '1month' : 'keep',
                                    expiryDate: voucher.expiresAt ? formatDateTimeLocal(voucher.expiresAt, timezone) : '',
                                    notes: voucher.notes || '',
                                    simultaneousUse: String(voucher.simultaneousUse || 1),
                                  });
                                  setShowEditPassword(false);
                                  setIsEditCardDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4 me-2 text-blue-500" />
                                {language === 'ar' ? 'تعديل الكرت' : 'Edit Card'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedCardForNotes(voucher);
                                  setNotesText(voucher.notes || '');
                                  setIsEditNotesDialogOpen(true);
                                }}
                              >
                                <MessageSquare className="h-4 w-4 me-2 text-yellow-500" />
                                {language === 'ar' ? 'تعديل الملاحظة' : 'Edit Note'}
                              </DropdownMenuItem>
                              {/* Kick & Speed — only when card is active */}
                              {voucher.status === 'active' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600 dark:text-red-400 focus:text-red-600"
                                    onClick={() => {
                                      setSelectedCardForKick(voucher);
                                      setKickActiveSession(null);
                                      setIsKickDialogOpen(true);
                                    }}
                                  >
                                    <WifiOff className="h-4 w-4 me-2" />
                                    {language === 'ar' ? 'طرد الكرت' : 'Disconnect Card'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedCardForSpeed(voucher);
                                      setVoucherSpeedSession(null);
                                      setVoucherDownloadSpeed('');
                                      setVoucherUploadSpeed('');
                                      setVoucherSpeedPreset('');
                                      setIsVoucherSpeedDialogOpen(true);
                                    }}
                                  >
                                    <Gauge className="h-4 w-4 me-2 text-sky-500" />
                                    {language === 'ar' ? 'تغيير السرعة' : 'Change Speed'}
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 dark:text-red-400 focus:text-red-600"
                                onClick={() => { setSelectedCardForDelete(voucher); setIsDeleteDialogOpen(true); }}
                              >
                                <Trash2 className="h-4 w-4 me-2" />
                                {language === 'ar' ? 'حذف الكرت' : 'Delete Card'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        {/* Card Number + badges */}
                        <TableCell className="py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                {onlineSet.has(voucher.id) && (
                                  <span className="relative flex h-2 w-2 shrink-0" title={language === 'ar' ? 'متصل الآن' : 'Online now'}>
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                  </span>
                                )}
                                <span className="font-mono font-semibold text-sm">{voucher.username}</span>
                                {voucher.isManual && (
                                  <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
                                    ✍️ {language === 'ar' ? 'يدوي' : 'Manual'}
                                  </span>
                                )}
                                {isExpiringSoon && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    {language === 'ar' ? 'ينتهي قريباً' : 'Expiring'}
                                  </span>
                                )}
                                {voucher.notes && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors cursor-pointer">
                                        <MessageSquare className="h-2.5 w-2.5" />
                                        {language === 'ar' ? 'ملاحظة' : 'Note'}
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 p-3" side="top" align="start">
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                          <MessageSquare className="h-3.5 w-3.5" />
                                          {language === 'ar' ? 'ملاحظات الكرت' : 'Card Notes'}
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
                              {voucher.notes.includes(' - ') ? voucher.notes.split(' - ')[0] : voucher.notes}
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
                        {/* Plan/Package */}
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
                        {/* Card Time (usageBudgetSeconds) */}
                        <TableCell className="py-3.5 text-sm">
                          {voucher.usageBudgetSeconds && voucher.usageBudgetSeconds > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {voucher.usageBudgetSeconds >= 3600
                                ? `${Math.floor(voucher.usageBudgetSeconds / 3600)}${language === 'ar' ? ' س' : 'h'}${voucher.usageBudgetSeconds % 3600 >= 60 ? ` ${Math.floor((voucher.usageBudgetSeconds % 3600) / 60)}${language === 'ar' ? ' د' : 'm'}` : ''}`
                                : `${Math.floor(voucher.usageBudgetSeconds / 60)}${language === 'ar' ? ' د' : 'm'}`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">{language === 'ar' ? 'غير محدد' : '—'}</span>
                          )}
                        </TableCell>
                        {/* Window (windowSeconds) */}
                        <TableCell className="py-3.5 text-sm">
                          {voucher.windowSeconds && voucher.windowSeconds > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              {voucher.windowSeconds >= 86400
                                ? `${Math.floor(voucher.windowSeconds / 86400)}${language === 'ar' ? ' يوم' : 'd'}`
                                : voucher.windowSeconds >= 3600
                                ? `${Math.floor(voucher.windowSeconds / 3600)}${language === 'ar' ? ' س' : 'h'}`
                                : `${Math.floor(voucher.windowSeconds / 60)}${language === 'ar' ? ' د' : 'm'}`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-xs">{language === 'ar' ? 'غير محدد' : '—'}</span>
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
                            : <span className="text-muted-foreground/40">{language === 'ar' ? 'لم يدخل' : 'Never'}</span>}
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
                        {/* Expires At */}
                        <TableCell className="py-3.5 text-sm">
                          {voucher.expiresAt
                            ? <span className={`font-medium ${
                                (parseDbDate(voucher.expiresAt) ?? new Date(0)) < new Date() ? 'text-red-500' :
                                ((parseDbDate(voucher.expiresAt) ?? new Date(0)).getTime() - Date.now()) < 3 * 86400000 ? 'text-amber-500' :
                                'text-muted-foreground'
                              }`}>
                                {formatDate(voucher.expiresAt)}
                              </span>
                            : <span className="text-muted-foreground/40">{language === 'ar' ? 'بدون حد' : 'No limit'}</span>}
                        </TableCell>
                        {/* Created At */}
                        <TableCell className="py-3.5 text-sm text-muted-foreground">
                          {formatDate(voucher.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
              {/* Pagination */}
              <DataPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
              />
          </div>
      </div>}
      {/* Batches Table */}
      <div className="space-y-4">
          {/* Batch search bar */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={language === 'ar' ? 'ابحث عن كرت برقمه أو كلمة سره...' : 'Search card by number or password...'}
                className="ps-10"
                value={batchSearchQuery}
                onChange={(e) => setBatchSearchQuery(e.target.value)}
              />
              {batchSearchQuery && (
                <button
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setBatchSearchQuery(''); setDebouncedBatchSearch(''); }}
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
            {!isCardSearch && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{language === 'ar' ? 'عرض' : 'Show'}</span>
                <select
                  value={batchPageSize}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    setBatchPageSize(size);
                    setBatchPage(1);
                    localStorage.setItem('batches_page_size', String(size));
                  }}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {[10, 20, 25, 50].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <span>{language === 'ar' ? `من ${filteredBatches.length} دفعة` : `of ${filteredBatches.length} batches`}</span>
              </div>
            )}
          </div>

          {/* Card search results */}
          {isCardSearch && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {isCardSearchLoading
                    ? (language === 'ar' ? 'جاري البحث...' : 'Searching...')
                    : (language === 'ar' ? `نتائج البحث عن "${debouncedBatchSearch}" — ${cardSearchTotal} كرت` : `Search results for "${debouncedBatchSearch}" — ${cardSearchTotal} cards`)
                  }
                </span>
                {!isCardSearchLoading && (
                  <div className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{language === 'ar' ? 'عرض' : 'Show'}</span>
                    <select
                      value={cardSearchPageSize}
                      onChange={(e) => { setCardSearchPageSize(Number(e.target.value)); setCardSearchPage(1); }}
                      className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {[10, 20, 25, 50].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 border-b">
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground w-[50px] ps-4">{language === 'ar' ? 'إجراءات' : 'Actions'}</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'رقم الكرت' : 'Card No.'}</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'كلمة السر' : 'Password'}</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'الخطة/الباقة' : 'Plan'}</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'وقت الكرت' : 'Time'}</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'أول دخول' : 'First Login'}</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'آخر تواجد' : 'Last Seen'}</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{language === 'ar' ? 'الدفعة' : 'Batch'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isCardSearchLoading ? (
                        <TableSkeleton rows={5} columns={9} />
                      ) : cardSearchData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <Search className="h-8 w-8 text-muted-foreground/30" />
                              <p className="text-sm">{language === 'ar' ? 'لا توجد نتائج' : 'No results found'}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        cardSearchData.map((voucher: any) => {
                          const activity = (cardSearchActivityMap as any)?.[voucher.lifecycleId];
                          const batchInfo = batches?.find((b: any) => b.batchId === voucher.batchId);
                          const isOnlineSearch = searchOnlineSet.has(voucher.id);
                          return (
                            <TableRow key={voucher.id} className="hover:bg-muted/20 transition-colors border-b last:border-0">
                              {/* Actions - first column */}
                              <TableCell className="py-3 ps-4">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="w-52">
                                    <DropdownMenuItem onClick={() => copyToClipboard(`${voucher.username}:${voucher.password}`)}>
                                      <Copy className="h-4 w-4 me-2 text-muted-foreground" />
                                      {language === 'ar' ? 'نسخ البيانات' : 'Copy Credentials'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setSelectedCardForRenew(voucher); setRenewType('custom_duration'); setRenewDurationValue('1'); setRenewDurationUnit('months'); setRenewCustomDate(''); setRenewWindowHours('0'); setRenewWindowMinutes('0'); setIsRenewDialogOpen(true); }}>
                                      <RotateCcw className="h-4 w-4 me-2 text-emerald-500" />
                                      {language === 'ar' ? 'تجديد الصلاحية' : 'Renew Validity'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {voucher.status !== 'suspended' ? (
                                      <DropdownMenuItem
                                        className="text-orange-600 dark:text-orange-400 focus:text-orange-600"
                                        onClick={() => { setSelectedCardForSuspend(voucher); setIsSuspendDialogOpen(true); }}
                                      >
                                        <ShieldOff className="h-4 w-4 me-2" />
                                        {language === 'ar' ? 'إيقاف الكرت' : 'Suspend Card'}
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        className="text-emerald-600 dark:text-emerald-400 focus:text-emerald-600"
                                        onClick={() => unsuspendMutation.mutate({ cardId: voucher.id })}
                                      >
                                        <CheckCircle2 className="h-4 w-4 me-2" />
                                        {language === 'ar' ? 'إعادة تفعيل الكرت' : 'Reactivate Card'}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedCardForEdit(voucher);
                                        const isExpired2 = voucher.expiresAt && (parseDbDate(voucher.expiresAt) ?? new Date(0)) < new Date();
                                        setEditCardForm({
                                          username: voucher.username || '',
                                          password: voucher.password || '',
                                          planId: String(voucher.planId || ''),
                                          expiryType: isExpired2 ? '1month' : 'keep',
                                          expiryDate: voucher.expiresAt ? formatDateTimeLocal(voucher.expiresAt, timezone) : '',
                                          notes: voucher.notes || '',
                                          simultaneousUse: String(voucher.simultaneousUse || 1),
                                        });
                                        setShowEditPassword(false);
                                        setIsEditCardDialogOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-4 w-4 me-2 text-blue-500" />
                                      {language === 'ar' ? 'تعديل الكرت' : 'Edit Card'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedCardForNotes(voucher);
                                        setNotesText(voucher.notes || '');
                                        setIsEditNotesDialogOpen(true);
                                      }}
                                    >
                                      <MessageSquare className="h-4 w-4 me-2 text-yellow-500" />
                                      {language === 'ar' ? 'تعديل الملاحظة' : 'Edit Note'}
                                    </DropdownMenuItem>
                                    {/* طرد وتغيير سرعة للكروت المتصل */}
                                    {isOnlineSearch && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-red-600 dark:text-red-400 focus:text-red-600"
                                          onClick={() => { setSelectedCardForKick(voucher); setKickActiveSession(null); setIsKickDialogOpen(true); }}
                                        >
                                          <WifiOff className="h-4 w-4 me-2" />
                                          {language === 'ar' ? 'طرد الكرت' : 'Kick Session'}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className="text-blue-600 dark:text-blue-400 focus:text-blue-600"
                                          onClick={() => { setSelectedCardForSpeed(voucher); setVoucherSpeedSession(null); setVoucherDownloadSpeed(''); setVoucherUploadSpeed(''); setVoucherSpeedPreset(''); setIsVoucherSpeedDialogOpen(true); }}
                                        >
                                          <Gauge className="h-4 w-4 me-2" />
                                          {language === 'ar' ? 'تغيير السرعة' : 'Change Speed'}
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600 dark:text-red-400 focus:text-red-600"
                                      onClick={() => { setSelectedCardForDelete(voucher); setIsDeleteDialogOpen(true); }}
                                    >
                                      <Trash2 className="h-4 w-4 me-2" />
                                      {language === 'ar' ? 'حذف الكرت' : 'Delete Card'}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                              <TableCell className="py-3">
                                <div className="flex items-center gap-2">
                                  {isOnlineSearch && (
                                    <span className="relative flex h-2 w-2 shrink-0" title={language === 'ar' ? 'متصل الآن' : 'Online now'}>
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                  )}
                                  <span className="font-mono font-semibold text-sm">{voucher.username}</span>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => copyToClipboard(voucher.username)}>
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="py-3">
                                <span className="font-mono text-sm text-muted-foreground">{voucher.password || '—'}</span>
                              </TableCell>
                              <TableCell className="py-3">
                                <span className="text-sm">{voucher.planName || '—'}</span>
                              </TableCell>
                              <TableCell className="py-3">
                                <span className="text-sm">
                                  {(() => {
                                    const secs = voucher.usageBudgetSeconds;
                                    if (secs && secs > 0) {
                                      if (secs >= 86400) return `${Math.floor(secs / 86400)} ${language === 'ar' ? 'يوم' : 'd'}`;
                                      if (secs >= 3600) return `${Math.floor(secs / 3600)} ${language === 'ar' ? 'ساعة' : 'h'}`;
                                      return `${Math.floor(secs / 60)} ${language === 'ar' ? 'دقيقة' : 'm'}`;
                                    }
                                    return <span className="text-muted-foreground/50">—</span>;
                                  })()}
                                </span>
                              </TableCell>
                              <TableCell className="py-3">{getStatusBadge(voucher.status)}</TableCell>
                              <TableCell className="py-3 text-xs text-muted-foreground">
                                {activity?.firstLogin ? formatDateCompact(activity.firstLogin) : <span className="text-muted-foreground/40">{language === 'ar' ? 'لم يدخل' : 'Never'}</span>}
                              </TableCell>
                              <TableCell className="py-3 text-xs text-muted-foreground">
                                {activity?.lastSeen ? formatDateCompact(activity.lastSeen) : <span className="text-muted-foreground/40">—</span>}
                              </TableCell>
                              <TableCell className="py-3 text-xs text-muted-foreground">{formatDateCompact(voucher.createdAt)}</TableCell>
                              <TableCell className="py-3">
                                {batchInfo ? (
                                  <button
                                    className="text-xs text-primary hover:underline font-medium"
                                    onClick={() => setLocation(`/cards/batch/${voucher.batchId}`)}
                                  >
                                    {batchInfo.name || `#${voucher.batchId?.slice(0, 6)}`}
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground/50">{voucher.batchId?.slice(0, 8) || '—'}</span>
                                )}
                              </TableCell>

                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <DataPagination
                  currentPage={cardSearchPage}
                  totalPages={cardSearchTotalPages}
                  totalItems={cardSearchTotal}
                  itemsPerPage={cardSearchPageSize}
                  onPageChange={setCardSearchPage}
                />
              </div>
            </div>
          )}

          {/* Batch filters bar - always visible */}
          {!isCardSearch && <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">
              {language === 'ar' ? `${filteredBatches.length} دفعة` : `${filteredBatches.length} batches`}
            </span>
            {/* More Options - always visible */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <MoreHorizontal className="h-4 w-4" />
                  {language === 'ar' ? 'المزيد من الخيارات' : 'More Options'}
                  {selectedBatchIds.size > 0 && (
                    <span className="ms-1 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none">
                      {selectedBatchIds.size}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {selectedBatchIds.size === 0 ? (
                  // لا يوجد تحديد - أظهر رسالة توجيهية
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    {language === 'ar' ? 'حدد دفعة أو أكثر أولاً' : 'Select one or more batches first'}
                  </div>
                ) : (
                  <>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      {language === 'ar' ? `${selectedBatchIds.size} دفعة محددة` : `${selectedBatchIds.size} selected`}
                    </div>
                    <DropdownMenuSeparator />
                    {/* تصدير CSV كروت الدفعات المحددة */}
                    <DropdownMenuItem
                      disabled={isExportingBatchCards}
                      onClick={() => {
                        const ids = Array.from(selectedBatchIds);
                        if (!ids.length) return;
                        setIsExportingBatchCards(true);
                        setExportBatchIdsForQuery(ids);
                      }}
                    >
                      <Download className="h-4 w-4 me-2 text-blue-500" />
                      {language === 'ar' ? `تنزيل CSV (${selectedBatchIds.size})` : `Export CSV (${selectedBatchIds.size})`}
                    </DropdownMenuItem>
                    {/* تفعيل */}
                    <DropdownMenuItem
                      onClick={() => setIsBulkEnableBatchesDialogOpen(true)}
                      disabled={bulkEnableBatchesMutation.isPending}
                      className="text-emerald-600 dark:text-emerald-400 focus:text-emerald-600"
                    >
                      <CheckCircle2 className="h-4 w-4 me-2" />
                      {language === 'ar' ? `تفعيل (${selectedBatchIds.size})` : `Enable (${selectedBatchIds.size})`}
                    </DropdownMenuItem>
                    {/* تعطيل */}
                    <DropdownMenuItem
                      onClick={() => setIsBulkDisableBatchesDialogOpen(true)}
                      disabled={bulkDisableBatchesMutation.isPending}
                    >
                      <Ban className="h-4 w-4 me-2 text-orange-500" />
                      {language === 'ar' ? `تعطيل (${selectedBatchIds.size})` : `Disable (${selectedBatchIds.size})`}
                    </DropdownMenuItem>
                    {/* حذف */}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setIsBulkDeleteBatchesDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4 me-2" />
                      {language === 'ar' ? `حذف (${selectedBatchIds.size})` : `Delete (${selectedBatchIds.size})`}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setSelectedBatchIds(new Set())}>
                      {language === 'ar' ? 'إلغاء التحديد' : 'Deselect All'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>}
          {!isCardSearch && <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        checked={paginatedBatches.length > 0 && paginatedBatches.every((b: any) => selectedBatchIds.has(b.batchId))}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedBatchIds(new Set(paginatedBatches.map((b: any) => b.batchId)));
                          } else {
                            setSelectedBatchIds(new Set());
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead className="w-10 text-center"></TableHead>
                    <TableHead className="w-16 text-center">PDF</TableHead>
                    <TableHead className="w-12 text-center">{language === 'ar' ? '#' : '#'}</TableHead>
                    <TableHead>{language === 'ar' ? 'اسم الدفعة' : 'Batch Name'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الخدمة' : 'Plan'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'إجمالي' : 'Total'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'غير مستخدم' : 'Unused'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'وقت الإنترنت' : 'Internet Time'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'صلاحية الكرت' : 'Card Validity'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead>{language === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</TableHead>
                    <TableHead>{language === 'ar' ? 'تاريخ الانتهاء' : 'Expiry'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        {language === 'ar' ? 'لا توجد دفعات' : 'No batches found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedBatches.map((batch: any, index: number) => {const globalIndex = (batchPage - 1) * batchPageSize + index; return (
                      <TableRow key={batch.batchId} className={`${!batch.enabled ? 'opacity-60 bg-muted/30' : ''} ${selectedBatchIds.has(batch.batchId) ? 'bg-primary/5' : ''}`}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedBatchIds.has(batch.batchId)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedBatchIds);
                              if (checked) next.add(batch.batchId);
                              else next.delete(batch.batchId);
                              setSelectedBatchIds(next);
                            }}
                          />
                        </TableCell>
                        {/* عمود ... */}
                        <TableCell className="text-center">
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {batch.enabled ? (
                                  <DropdownMenuItem
                                    onClick={() => handleDisableBatch(batch.batchId)}
                                    className="text-destructive"
                                  >
                                    <XCircle className="h-4 w-4 me-2" />
                                    {language === 'ar' ? 'تعطيل الدفعة' : 'Disable Batch'}
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => handleEnableBatch(batch.batchId)}
                                    className="text-green-600"
                                  >
                                    <CheckCircle2 className="h-4 w-4 me-2" />
                                    {language === 'ar' ? 'تمكين الدفعة' : 'Enable Batch'}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openEditTimeDialog(batch)}
                                >
                                  <Clock className="h-4 w-4 me-2" />
                                  {language === 'ar' ? 'تعديل الوقت' : 'Edit Time'}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openEditPropertiesDialog(batch)}
                                >
                                  <RefreshCw className="h-4 w-4 me-2" />
                                  {language === 'ar' ? 'تعديل الخصائص' : 'Edit Properties'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setBatchExportFormat('csv'); setIsExportingBatchCards(true); setExportBatchIdsForQuery([batch.batchId]); }}>
                                  <Download className="h-4 w-4 me-2 text-emerald-600" />
                                  {language === 'ar' ? 'تصدير CSV' : 'Export CSV'}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setBatchExportFormat('xlsx'); setIsExportingBatchCards(true); setExportBatchIdsForQuery([batch.batchId]); }}>
                                  <FileSpreadsheet className="h-4 w-4 me-2 text-emerald-600" />
                                  {language === 'ar' ? 'تصدير Excel' : 'Export Excel'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openDeleteBatchDialog(batch)}
                                  className="text-destructive"
                                >
                                  <Ban className="h-4 w-4 me-2" />
                                  {language === 'ar' ? 'حذف الدفعة' : 'Delete Batch'}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                        {/* عمود PDF */}
                        <TableCell className="text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setLocation(`/print-cards?batch=${batch.batchId}`);
                            }}
                          >
                            <Printer className="h-4 w-4 me-1" />
                            PDF
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                            {index + 1}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setLocation(`/vouchers/batch/${batch.batchId}`)}
                              className="text-primary hover:underline font-semibold text-start"
                            >
                              {batch.name || `${language === 'ar' ? 'دفعة' : 'Batch'} #${batch.batchId?.slice(0, 6)}`}
                            </button>
                            {!batch.enabled && (
                              <Badge variant="destructive" className="text-xs">
                                {language === 'ar' ? 'معطل' : 'Disabled'}
                              </Badge>
                            )}
                            {/* عداد الكروت المتصلة الآن - يظهر دائماً */}
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500 text-white dark:bg-emerald-600"
                              title={language === 'ar' ? 'متصل الآن' : 'Online now'}
                            >
                              {batch.stats?.currentlyActive ?? 0}
                              <span className="text-[10px] font-normal opacity-90">{language === 'ar' ? 'متصل' : 'online'}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{batch.planName || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {batch.stats?.total || batch.quantity}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            {batch.stats?.unused || 0}
                          </span>
                        </TableCell>
                        {/* وقت الإنترنت - usageBudgetSeconds */}
                        <TableCell className="text-center">
                          <span className="text-sm text-foreground">
                            {(() => {
                              const secs = batch.usageBudgetSeconds;
                              if (secs && secs > 0) {
                                if (secs >= 86400) return `${Math.floor(secs / 86400)} ${language === 'ar' ? 'يوم' : 'd'}`;
                                if (secs >= 3600) return `${Math.floor(secs / 3600)} ${language === 'ar' ? 'ساعة' : 'h'}`;
                                return `${Math.floor(secs / 60)} ${language === 'ar' ? 'دقيقة' : 'm'}`;
                              }
                              // fallback to legacy field
                              if (batch.internetTimeValue && batch.internetTimeValue > 0) {
                                return `${batch.internetTimeValue} ${batch.internetTimeUnit === 'hours' ? (language === 'ar' ? 'ساعة' : 'h') : batch.internetTimeUnit === 'days' ? (language === 'ar' ? 'يوم' : 'd') : (language === 'ar' ? 'دقيقة' : 'm')}`;
                              }
                              return <span className="text-muted-foreground/50">—</span>;
                            })()}
                          </span>
                        </TableCell>
                        {/* صلاحية الكرت - windowSeconds */}
                        <TableCell className="text-center">
                          <span className="text-sm text-foreground">
                            {(() => {
                              const secs = batch.windowSeconds;
                              if (secs && secs > 0) {
                                if (secs >= 86400) return `${Math.floor(secs / 86400)} ${language === 'ar' ? 'يوم' : 'd'}`;
                                if (secs >= 3600) return `${Math.floor(secs / 3600)} ${language === 'ar' ? 'ساعة' : 'h'}`;
                                return `${Math.floor(secs / 60)} ${language === 'ar' ? 'دقيقة' : 'm'}`;
                              }
                              // fallback to legacy field
                              if (batch.cardTimeValue && batch.cardTimeValue > 0) {
                                return `${batch.cardTimeValue} ${batch.cardTimeUnit === 'hours' ? (language === 'ar' ? 'ساعة' : 'h') : batch.cardTimeUnit === 'days' ? (language === 'ar' ? 'يوم' : 'd') : (language === 'ar' ? 'دقيقة' : 'm')}`;
                              }
                              return <span className="text-muted-foreground/50">—</span>;
                            })()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={batch.status === 'completed' ? 'default' : 'secondary'}>
                            {batch.status === 'completed' 
                              ? (language === 'ar' ? 'مكتمل' : 'Completed')
                              : (language === 'ar' ? 'قيد الإنشاء' : 'Generating')
                            }
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(batch.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {batch.stats?.batchExpiresAt
                            ? formatDate(batch.stats.batchExpiresAt)
                            : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                      </TableRow>
                    );})
                  )}
                </TableBody>
              </Table>
              </div>
              <DataPagination
                currentPage={batchPage}
                totalPages={batchTotalPages}
                totalItems={filteredBatches.length}
                itemsPerPage={batchPageSize}
                onPageChange={setBatchPage}
              />
            </CardContent>
          </Card>}
      </div>

      {/* Bulk Delete Batches Dialog */}
      {/* Dialog تأكيد التعطيل الجماعي */}
      <Dialog open={isBulkDisableBatchesDialogOpen} onOpenChange={setIsBulkDisableBatchesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-orange-500" />
              {language === 'ar' ? `تعطيل ${selectedBatchIds.size} دفعة` : `Disable ${selectedBatchIds.size} Batch(es)`}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `سيتم تعطيل ${selectedBatchIds.size} دفعة وجميع كروتها. هل أنت متأكد؟`
                : `This will disable ${selectedBatchIds.size} batch(es) and all their cards. Are you sure?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDisableBatchesDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="default"
              className="bg-orange-500 hover:bg-orange-600"
              onClick={() => {
                bulkDisableBatchesMutation.mutate({ batchIds: Array.from(selectedBatchIds) });
                setIsBulkDisableBatchesDialogOpen(false);
              }}
              disabled={bulkDisableBatchesMutation.isPending}
            >
              {bulkDisableBatchesMutation.isPending
                ? (language === 'ar' ? 'جاري التعطيل...' : 'Disabling...')
                : (language === 'ar' ? 'تعطيل' : 'Disable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog تأكيد التفعيل الجماعي */}
      <Dialog open={isBulkEnableBatchesDialogOpen} onOpenChange={setIsBulkEnableBatchesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              {language === 'ar' ? `تفعيل ${selectedBatchIds.size} دفعة` : `Enable ${selectedBatchIds.size} Batch(es)`}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `سيتم تفعيل ${selectedBatchIds.size} دفعة وجميع كروتها. هل أنت متأكد؟`
                : `This will enable ${selectedBatchIds.size} batch(es) and all their cards. Are you sure?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkEnableBatchesDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => bulkEnableBatchesMutation.mutate({ batchIds: Array.from(selectedBatchIds) })}
              disabled={bulkEnableBatchesMutation.isPending}
            >
              {bulkEnableBatchesMutation.isPending
                ? (language === 'ar' ? 'جاري التفعيل...' : 'Enabling...')
                : (language === 'ar' ? 'تفعيل' : 'Enable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog تأكيد الحذف الجماعي */}
      <Dialog open={isBulkDeleteBatchesDialogOpen} onOpenChange={setIsBulkDeleteBatchesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {language === 'ar' ? `حذف ${selectedBatchIds.size} دفعة` : `Delete ${selectedBatchIds.size} Batch(es)`}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `سيتم حذف ${selectedBatchIds.size} دفعة وجميع كروتها نهائياً. هذا الإجراء لا يمكن التراجع عنه.`
                : `This will permanently delete ${selectedBatchIds.size} batch(es) and all their cards. This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDeleteBatchesDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkDeleteBatchesMutation.mutate({ batchIds: Array.from(selectedBatchIds), deleteCards: true })}
              disabled={bulkDeleteBatchesMutation.isPending}
            >
              {bulkDeleteBatchesMutation.isPending
                ? (language === 'ar' ? 'جاري الحذف...' : 'Deleting...')
                : (language === 'ar' ? 'حذف نهائي' : 'Delete Permanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Time Dialog */}
      <Dialog open={isEditTimeDialogOpen} onOpenChange={setIsEditTimeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {language === 'ar' ? 'تعديل الوقت للدفعة' : 'Edit Batch Time'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar' 
                ? `تعديل إعدادات الوقت لجميع الكروت في الدفعة: ${selectedBatch?.name}` 
                : `Edit time settings for all cards in batch: ${selectedBatch?.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'الوقت المتاح من تفعيل الكرت' : 'Card Activation Time'}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={editTimeForm.cardTimeValue}
                    onChange={(e) => setEditTimeForm(prev => ({ ...prev, cardTimeValue: e.target.value }))}
                    min="0"
                  />
                  <Select
                    value={editTimeForm.cardTimeUnit}
                    onValueChange={(v) => setEditTimeForm(prev => ({ ...prev, cardTimeUnit: v as 'hours' | 'days' }))}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">{language === 'ar' ? 'ساعة' : 'Hours'}</SelectItem>
                      <SelectItem value="days">{language === 'ar' ? 'يوم' : 'Days'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'الوقت على الانترنت' : 'Internet Time'}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={editTimeForm.internetTimeValue}
                    onChange={(e) => setEditTimeForm(prev => ({ ...prev, internetTimeValue: e.target.value }))}
                    min="0"
                  />
                  <Select
                    value={editTimeForm.internetTimeUnit}
                    onValueChange={(v) => setEditTimeForm(prev => ({ ...prev, internetTimeUnit: v as 'hours' | 'days' }))}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">{language === 'ar' ? 'ساعة' : 'Hours'}</SelectItem>
                      <SelectItem value="days">{language === 'ar' ? 'يوم' : 'Days'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>{language === 'ar' ? 'تحسب من تفعيل الكرت' : 'Count from activation'}</Label>
              <Switch
                checked={editTimeForm.timeFromActivation}
                onCheckedChange={(checked) => setEditTimeForm(prev => ({ ...prev, timeFromActivation: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTimeDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button 
              onClick={handleUpdateBatchTime}
              disabled={updateBatchTimeMutation.isPending}
            >
              {updateBatchTimeMutation.isPending 
                ? (language === 'ar' ? 'جاري التحديث...' : 'Updating...')
                : (language === 'ar' ? 'تحديث' : 'Update')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Properties Dialog */}
      <Dialog open={isEditPropertiesDialogOpen} onOpenChange={setIsEditPropertiesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {language === 'ar' ? 'تعديل خصائص الدفعة' : 'Edit Batch Properties'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar' 
                ? `تعديل خصائص جميع الكروت في الدفعة: ${selectedBatch?.name}` 
                : `Edit properties for all cards in batch: ${selectedBatch?.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'عدد الأجهزة المسموح لها بالاتصال' : 'Simultaneous Use'}</Label>
              <Input
                type="number"
                value={editPropertiesForm.simultaneousUse}
                onChange={(e) => setEditPropertiesForm(prev => ({ ...prev, simultaneousUse: e.target.value }))}
                min="1"
                max="100"
              />
            </div>
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'الخدمة المرتبطة' : 'Linked Plan'}</Label>
              <Select
                value={editPropertiesForm.planId}
                onValueChange={(v) => setEditPropertiesForm(prev => ({ ...prev, planId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={language === 'ar' ? 'اختر الخدمة' : 'Select plan'} />
                </SelectTrigger>
                <SelectContent>
                  {plans?.map((plan: any) => (
                    <SelectItem key={plan.id} value={String(plan.id)}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'تحديد منفذ هوتسبوت' : 'Hotspot Port'}</Label>
              <Input
                value={editPropertiesForm.hotspotPort}
                onChange={(e) => setEditPropertiesForm(prev => ({ ...prev, hotspotPort: e.target.value }))}
                placeholder={language === 'ar' ? 'فارغ = السماح للجميع' : 'Empty = Allow all'}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{language === 'ar' ? 'ربط الماك' : 'MAC Binding'}</Label>
              <Switch
                checked={editPropertiesForm.macBinding}
                onCheckedChange={(checked) => setEditPropertiesForm(prev => ({ ...prev, macBinding: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditPropertiesDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button 
              onClick={handleUpdateBatchProperties}
              disabled={updateBatchPropertiesMutation.isPending}
            >
              {updateBatchPropertiesMutation.isPending 
                ? (language === 'ar' ? 'جاري التحديث...' : 'Updating...')
                : (language === 'ar' ? 'تحديث' : 'Update')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog تأكيد حذف الدفعة الفردية */}
      <Dialog open={isDeleteBatchDialogOpen} onOpenChange={setIsDeleteBatchDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {language === 'ar' ? 'حذف الدفعة' : 'Delete Batch'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `سيتم حذف الدفعة "‏${selectedBatch?.name}‏" وجميع كروتها نهائياً. هذا الإجراء لا يمكن التراجع عنه.`
                : `This will permanently delete batch "${selectedBatch?.name}" and all its cards. This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteBatchDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteBatch}
              disabled={deleteBatchMutation.isPending}
            >
              {deleteBatchMutation.isPending
                ? (language === 'ar' ? 'جاري الحذف...' : 'Deleting...')
                : (language === 'ar' ? 'حذف نهائي' : 'Delete Permanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew Card Dialog */}
      <Dialog open={isRenewDialogOpen} onOpenChange={setIsRenewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-emerald-500" />
              {language === 'ar' ? 'تجديد صلاحية الكرت' : 'Renew Card Validity'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `تجديد صلاحية الكرت: ${selectedCardForRenew?.username}`
                : `Renewing validity for card: ${selectedCardForRenew?.username}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Mode Tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRenewType('custom_duration')}
                className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
                  renewType === 'custom_duration'
                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                    : 'bg-background border-border hover:border-emerald-400'
                }`}
              >
                {language === 'ar' ? 'مدة محددة' : 'Duration'}
              </button>
              <button
                type="button"
                onClick={() => setRenewType('custom')}
                className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                  renewType === 'custom'
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background border-border hover:border-primary'
                }`}
              >
                <Calendar className="h-4 w-4" />
                {language === 'ar' ? 'تاريخ محدد' : 'Specific Date'}
              </button>
            </div>

            {/* Duration Input */}
            {renewType === 'custom_duration' && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">{language === 'ar' ? 'مدة التجديد' : 'Renewal Duration'}</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={renewDurationValue}
                    onChange={(e) => setRenewDurationValue(e.target.value)}
                    className="h-11 w-24 font-mono text-center text-lg"
                    placeholder="1"
                  />
                  <Select value={renewDurationUnit} onValueChange={(v: any) => setRenewDurationUnit(v)}>
                    <SelectTrigger className="h-11 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">{language === 'ar' ? 'ساعة' : 'Hours'}</SelectItem>
                      <SelectItem value="days">{language === 'ar' ? 'يوم' : 'Days'}</SelectItem>
                      <SelectItem value="weeks">{language === 'ar' ? 'أسبوع' : 'Weeks'}</SelectItem>
                      <SelectItem value="months">{language === 'ar' ? 'شهر' : 'Months'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Custom Date Picker */}
            {renewType === 'custom' && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">{language === 'ar' ? 'تاريخ الانتهاء' : 'Expiry Date'}</label>
                <Input
                  type="datetime-local"
                  value={renewCustomDate}
                  onChange={(e) => setRenewCustomDate(e.target.value)}
                  min={nowDateTimeLocal(timezone)}
                  className="h-11"
                />
              </div>
            )}

            {/* Session Time Budget */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">
                {language === 'ar' ? 'مدة الجلسة (اختياري)' : 'Session Time Budget (Optional)'}
              </label>
              <p className="text-xs text-muted-foreground">
                {language === 'ar' ? 'حجم الاستخدام المسموح به (0 = بدون حد)' : 'Allowed usage time (0 = unlimited)'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{language === 'ar' ? 'ساعات' : 'Hours'}</label>
                  <Input
                    type="number"
                    min="0"
                    value={renewWindowHours}
                    onChange={(e) => setRenewWindowHours(e.target.value)}
                    className="h-10"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{language === 'ar' ? 'دقائق' : 'Minutes'}</label>
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={renewWindowMinutes}
                    onChange={(e) => setRenewWindowMinutes(e.target.value)}
                    className="h-10"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            {renewType === 'custom_duration' && renewDurationValue && (
              <div className="rounded-lg bg-muted/50 border p-3">
                <p className="text-xs text-muted-foreground mb-1">{language === 'ar' ? 'سينتهي الكرت في:' : 'Card will expire on:'}</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {(() => {
                    const unitMs: Record<string, number> = { hours: 3600000, days: 86400000, weeks: 7 * 86400000, months: 30 * 86400000 };
                    const ms = (parseInt(renewDurationValue) || 0) * (unitMs[renewDurationUnit] || 0);
                    if (!ms) return '—';
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
            <Button variant="outline" onClick={() => setIsRenewDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={renewCardMutation.isPending || (renewType === 'custom' && !renewCustomDate) || (renewType === 'custom_duration' && (!renewDurationValue || parseInt(renewDurationValue) < 1))}
              onClick={() => {
                if (!selectedCardForRenew) return;
                const customDate = renewType === 'custom' ? dateTimeLocalToUtcIso(renewCustomDate, timezone) : undefined;
                if (renewType === 'custom' && !customDate) {
                  toast.error(language === 'ar' ? 'تاريخ الانتهاء غير صالح في المنطقة الزمنية المحددة' : 'Expiry date is invalid in the selected timezone');
                  return;
                }
                const usageBudgetSeconds =
                  (parseInt(renewWindowHours) || 0) * 3600 +
                  (parseInt(renewWindowMinutes) || 0) * 60;
                renewCardMutation.mutate({
                  cardId: selectedCardForRenew.id,
                  renewType,
                  durationValue: renewType === 'custom_duration' ? parseInt(renewDurationValue) : undefined,
                  durationUnit: renewType === 'custom_duration' ? renewDurationUnit : undefined,
                  customDate,
                  usageBudgetSeconds: usageBudgetSeconds >= 0 ? usageBudgetSeconds : undefined,
                });
              }}
            >
              {renewCardMutation.isPending
                ? (language === 'ar' ? 'جاري التجديد...' : 'Renewing...')
                : (language === 'ar' ? 'تجديد الصلاحية' : 'Renew Validity')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Card Confirmation Dialog */}
      <Dialog open={isSuspendDialogOpen} onOpenChange={setIsSuspendDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <ShieldOff className="h-5 w-5" />
              {language === 'ar' ? 'إيقاف الكرت' : 'Suspend Card'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `سيتم إيقاف الكرت فوراً وقطع أي جلسة نشطة. هل تريد المتابعة؟`
                : `The card will be suspended immediately and any active session will be disconnected. Continue?`}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-3 my-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-orange-500" />
              <span className="font-mono font-semibold text-sm">{selectedCardForSuspend?.username}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSuspendDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              className="bg-orange-600 hover:bg-orange-700"
              disabled={suspendMutation.isPending}
              onClick={() => {
                if (!selectedCardForSuspend) return;
                suspendMutation.mutate({ cardId: selectedCardForSuspend.id });
                setIsSuspendDialogOpen(false);
                setSelectedCardForSuspend(null);
              }}
            >
              {suspendMutation.isPending
                ? (language === 'ar' ? 'جاري الإيقاف...' : 'Suspending...')
                : (language === 'ar' ? 'إيقاف الكرت' : 'Suspend Card')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Card Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
              {language === 'ar' ? 'حذف الكرت' : 'Delete Card'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? 'سيتم حذف هذا الكرت نهائياً من قاعدة البيانات ومن RADIUS. لا يمكن التراجع عن هذا الإجراء.'
                : 'This card will be permanently deleted from the database and RADIUS. This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 my-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-red-500" />
              <span className="font-mono font-semibold text-sm">{selectedCardForDelete?.username}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteCardMutation.isPending}
              onClick={() => {
                if (!selectedCardForDelete) return;
                deleteCardMutation.mutate({ cardId: selectedCardForDelete.id });
              }}
            >
              {deleteCardMutation.isPending
                ? (language === 'ar' ? 'جاري الحذف...' : 'Deleting...')
                : (language === 'ar' ? 'حذف نهائي' : 'Delete Permanently')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Notes Dialog */}
      <Dialog open={isEditNotesDialogOpen} onOpenChange={(open) => {
        setIsEditNotesDialogOpen(open);
        if (!open) { setSelectedCardForNotes(null); setNotesText(''); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-yellow-500" />
              {language === 'ar' ? 'تعديل الملاحظة' : 'Edit Note'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `تعديل ملاحظة الكرت: ${selectedCardForNotes?.username || ''}`
                : `Edit note for card: ${selectedCardForNotes?.username || ''}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <textarea
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder={language === 'ar' ? 'اكتب ملاحظة هنا... (اتركها فارغة لحذف الملاحظة)' : 'Write a note here... (leave empty to remove the note)'}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              maxLength={1000}
              dir={direction}
            />
            <p className="text-xs text-muted-foreground mt-1 text-end">{notesText.length}/1000</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditNotesDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              disabled={updateNotesMutation.isPending}
              onClick={() => {
                if (!selectedCardForNotes) return;
                updateNotesMutation.mutate({
                  cardId: selectedCardForNotes.id,
                  notes: notesText.trim() || undefined,
                });
              }}
            >
              {updateNotesMutation.isPending
                ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                : (language === 'ar' ? 'حفظ الملاحظة' : 'Save Note')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Card Dialog */}
      <Dialog open={isEditCardDialogOpen} onOpenChange={(open) => {
        setIsEditCardDialogOpen(open);
        if (!open) { setSelectedCardForEdit(null); }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir={direction}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Pencil className="h-4 w-4 text-white" />
              </div>
              {language === 'ar' ? 'تعديل الكرت' : 'Edit Card'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar'
                ? `تعديل بيانات الكرت: ${selectedCardForEdit?.username || ''}`
                : `Edit card: ${selectedCardForEdit?.username || ''}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Expired card warning */}
            {selectedCardForEdit?.expiresAt && (parseDbDate(selectedCardForEdit.expiresAt) ?? new Date(0)) < new Date() && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3">
                <span className="text-amber-500 text-lg leading-none mt-0.5">⚠</span>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {language === 'ar'
                    ? 'هذا الكرت منتهي الصلاحية. تم ضبط التمديد على شهر واحد من الآن — يمكنك تغيير المدة قبل الحفظ.'
                    : 'This card is expired. Expiry has been set to 1 month from now — you can change it before saving.'}
                </p>
              </div>
            )}
            {/* Credentials */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                {language === 'ar' ? 'بيانات الدخول' : 'Credentials'}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Username */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {language === 'ar' ? 'اسم المستخدم' : 'Username'}
                    <span className="text-destructive ms-1">*</span>
                  </Label>
                  <Input
                    value={editCardForm.username}
                    onChange={(e) => setEditCardForm(prev => ({ ...prev, username: e.target.value }))}
                    className="h-11 font-mono"
                    dir="ltr"
                    placeholder={language === 'ar' ? 'اسم المستخدم' : 'Username'}
                  />
                </div>
                {/* Password */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {language === 'ar' ? 'كلمة المرور' : 'Password'}
                    <span className="text-muted-foreground text-xs ms-1">({language === 'ar' ? 'اختياري' : 'optional'})</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showEditPassword ? 'text' : 'password'}
                      value={editCardForm.password}
                      onChange={(e) => setEditCardForm(prev => ({ ...prev, password: e.target.value }))}
                      className="h-11 font-mono pr-10"
                      dir="ltr"
                      placeholder={language === 'ar' ? 'فارغ = مصادقة بالاسم فقط | أدخل لتغيير كلمة المرور' : 'Empty = username-only | Enter to change password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(v => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {showEditPassword ? <Eye className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {selectedCardForEdit?.authType === 'username-only' && !editCardForm.password && (
                    <p className="text-xs text-amber-500">{language === 'ar' ? 'الكرت حالياً: مصادقة بالاسم فقط' : 'Current: username-only auth'}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Plan & Expiry */}
            <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" />
                {language === 'ar' ? 'الخدمة والصلاحية' : 'Plan & Validity'}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Plan */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {language === 'ar' ? 'الخدمة' : 'Plan'}
                    <span className="text-destructive ms-1">*</span>
                  </Label>
                  <Select
                    value={editCardForm.planId}
                    onValueChange={(v) => setEditCardForm(prev => ({ ...prev, planId: v }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder={language === 'ar' ? 'اختر خدمة' : 'Select plan'} />
                    </SelectTrigger>
                    <SelectContent>
                      {plans?.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Expiry Type */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {language === 'ar' ? 'نوع الصلاحية' : 'Expiry Type'}
                  </Label>
                  <Select
                    value={editCardForm.expiryType}
                    onValueChange={(v: any) => setEditCardForm(prev => ({ ...prev, expiryType: v }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">{language === 'ar' ? 'ابقِ التاريخ الحالي' : 'Keep Current Date'}</SelectItem>
                      <SelectItem value="custom">{language === 'ar' ? 'تاريخ مخصص' : 'Custom Date'}</SelectItem>
                      <SelectItem value="from_activation">{language === 'ar' ? 'من أول استخدام' : 'From first use'}</SelectItem>
                      <SelectItem value="1week">{language === 'ar' ? 'تمديد أسبوع' : 'Extend 1 Week'}</SelectItem>
                      <SelectItem value="2weeks">{language === 'ar' ? 'تمديد أسبوعان' : 'Extend 2 Weeks'}</SelectItem>
                      <SelectItem value="1month">{language === 'ar' ? 'تمديد شهر' : 'Extend 1 Month'}</SelectItem>
                      <SelectItem value="3months">{language === 'ar' ? 'تمديد 3 أشهر' : 'Extend 3 Months'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Simultaneous Use */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {language === 'ar' ? 'عدد الأجهزة المتزامنة' : 'Simultaneous Devices'}
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={editCardForm.simultaneousUse}
                  onChange={(e) => setEditCardForm(prev => ({ ...prev, simultaneousUse: e.target.value }))}
                  className="h-11"
                  dir="ltr"
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">
                  {language === 'ar' ? 'عدد الأجهزة التي يمكن الاتصال بها في نفس الوقت' : 'Number of devices allowed to connect simultaneously'}
                </p>
              </div>

              {/* Custom date */}
              {editCardForm.expiryType === 'custom' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    <Calendar className="h-3.5 w-3.5 inline me-1" />
                    {language === 'ar' ? 'تاريخ الانتهاء' : 'Expiry Date'}
                  </Label>
                  <Input
                    type="datetime-local"
                    value={editCardForm.expiryDate}
                    onChange={(e) => setEditCardForm(prev => ({ ...prev, expiryDate: e.target.value }))}
                    className="h-11"
                    min={nowDateTimeLocal(timezone)}
                  />
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                <MessageSquare className="h-3.5 w-3.5 inline me-1 text-yellow-500" />
                {language === 'ar' ? 'ملاحظات' : 'Notes'}
                <span className="text-muted-foreground text-xs ms-1">({language === 'ar' ? 'اختياري' : 'optional'})</span>
              </Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder={language === 'ar' ? 'أي ملاحظات إضافية...' : 'Any additional notes...'}
                value={editCardForm.notes}
                onChange={(e) => setEditCardForm(prev => ({ ...prev, notes: e.target.value }))}
                maxLength={1000}
                dir={direction}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditCardDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              disabled={updateCardMutation.isPending || !editCardForm.username.trim() || !editCardForm.planId}
              onClick={() => {
                if (!selectedCardForEdit) return;
                if (!editCardForm.username.trim()) {
                  toast.error(language === 'ar' ? 'يرجى إدخال اسم المستخدم' : 'Please enter username');
                  return;
                }
                if (!editCardForm.planId) {
                  toast.error(language === 'ar' ? 'يرجى اختيار الخدمة' : 'Please select a plan');
                  return;
                }
                const expiryDate = editCardForm.expiryType === 'custom' ? dateTimeLocalToUtcIso(editCardForm.expiryDate, timezone) : undefined;
                if (editCardForm.expiryType === 'custom' && !expiryDate) {
                  toast.error(language === 'ar' ? 'تاريخ الانتهاء غير صالح في المنطقة الزمنية المحددة' : 'Expiry date is invalid in the selected timezone');
                  return;
                }
                updateCardMutation.mutate({
                  cardId: selectedCardForEdit.id,
                  username: editCardForm.username.trim(),
                  password: editCardForm.password.trim() || undefined,
                  planId: parseInt(editCardForm.planId),
                  expiryType: editCardForm.expiryType,
                  expiryDate,
                  notes: editCardForm.notes.trim() || undefined,
                  simultaneousUse: parseInt(editCardForm.simultaneousUse) || 1,
                });
              }}
            >
              {updateCardMutation.isPending
                ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                : (language === 'ar' ? 'حفظ التعديلات' : 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Kick Card (Disconnect) Dialog ── */}
      <Dialog open={isKickDialogOpen} onOpenChange={(open) => {
        setIsKickDialogOpen(open);
        if (!open) { setSelectedCardForKick(null); setKickActiveSession(null); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 bg-destructive/10 rounded-xl">
                <WifiOff className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <DialogTitle>{language === 'ar' ? 'طرد الكرت' : 'Disconnect Card'}</DialogTitle>
                <DialogDescription className="mt-0.5">
                  <span className="font-mono font-semibold text-foreground">
                    {selectedCardForKick?.username}
                  </span>
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
            <Button variant="outline" onClick={() => setIsKickDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="destructive"
              disabled={kickCardMutation.isPending}
              onClick={async () => {
                if (!selectedCardForKick) return;
                // Fetch active session first
                try {
                  const sessions = await utils.sessions.getByUsername.fetch({ username: selectedCardForKick.username });
                  const session = sessions?.[0];
                  if (!session) {
                    toast.error(language === 'ar' ? 'لا توجد جلسة نشطة لهذا الكرت' : 'No active session found for this card');
                    setIsKickDialogOpen(false);
                    return;
                  }
                  kickCardMutation.mutate({ sessionId: session.acctSessionId });
                } catch {
                  toast.error(language === 'ar' ? 'فشل في جلب بيانات الجلسة' : 'Failed to fetch session data');
                }
              }}
              className="gap-2"
            >
              {kickCardMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <WifiOff className="h-4 w-4" />
              )}
              {language === 'ar' ? 'طرد الكرت' : 'Disconnect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Speed Dialog (Voucher) ── */}
      <Dialog open={isVoucherSpeedDialogOpen} onOpenChange={(open) => {
        setIsVoucherSpeedDialogOpen(open);
        if (!open) { setSelectedCardForSpeed(null); setVoucherSpeedSession(null); setVoucherDownloadSpeed(''); setVoucherUploadSpeed(''); setVoucherSpeedPreset(''); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 bg-sky-500/10 rounded-xl">
                <Gauge className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <DialogTitle>{language === 'ar' ? 'تغيير السرعة الفوري' : 'Instant Speed Change'}</DialogTitle>
                <DialogDescription className="mt-0.5">
                  <span className="font-mono font-semibold text-foreground">
                    {selectedCardForSpeed?.username}
                  </span>
                  {' — '}
                  {language === 'ar' ? 'بدون فصل الاتصال' : 'without disconnecting'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Info banner */}
            <div className="flex items-center gap-2 p-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
              <Zap className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {language === 'ar'
                  ? 'سيتم تطبيق السرعة فوراً عبر MikroTik API على Queue المستخدم'
                  : 'Speed will be applied instantly via MikroTik API to user Queue'}
              </p>
            </div>
            {/* Speed Presets */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">
                {language === 'ar' ? 'خطط سريعة' : 'Quick Presets'}
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {VOUCHER_SPEED_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setVoucherDownloadSpeed(String(p.download));
                      setVoucherUploadSpeed(String(p.upload));
                      setVoucherSpeedPreset(p.label);
                    }}
                    className={cn(
                      'text-xs py-1.5 px-2 rounded-lg border transition-all',
                      voucherSpeedPreset === p.label
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/40 hover:bg-accent'
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
                  {language === 'ar' ? 'تنزيل (Mbps)' : 'Download (Mbps)'}
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0.1"
                  placeholder="10"
                  value={voucherDownloadSpeed}
                  onChange={(e) => { setVoucherDownloadSpeed(e.target.value); setVoucherSpeedPreset(''); }}
                  className="h-9 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Upload className="h-3 w-3 text-orange-500" />
                  {language === 'ar' ? 'رفع (Mbps)' : 'Upload (Mbps)'}
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0.1"
                  placeholder="5"
                  value={voucherUploadSpeed}
                  onChange={(e) => { setVoucherUploadSpeed(e.target.value); setVoucherSpeedPreset(''); }}
                  className="h-9 rounded-lg"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsVoucherSpeedDialogOpen(false)}
            >
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              onClick={async () => {
                if (!selectedCardForSpeed || !voucherDownloadSpeed || !voucherUploadSpeed) return;
                const dlMbps = parseFloat(voucherDownloadSpeed);
                const ulMbps = parseFloat(voucherUploadSpeed);
                if (isNaN(dlMbps) || isNaN(ulMbps) || dlMbps <= 0 || ulMbps <= 0) {
                  toast.error(language === 'ar' ? 'يرجى إدخال قيم سرعة صحيحة' : 'Please enter valid speed values');
                  return;
                }
                // Fetch active session to get nasIp
                try {
                  const sessions = await utils.sessions.getByUsername.fetch({ username: selectedCardForSpeed.username });
                  const session = sessions?.[0];
                  if (!session) {
                    toast.error(language === 'ar' ? 'لا توجد جلسة نشطة لهذا الكرت' : 'No active session found for this card');
                    setIsVoucherSpeedDialogOpen(false);
                    return;
                  }
                  voucherChangeSpeedMutation.mutate({
                    nasIp: session.nasIp || '',
                    username: selectedCardForSpeed.username,
                    downloadSpeedKbps: Math.round(dlMbps * 1000),
                    uploadSpeedKbps: Math.round(ulMbps * 1000),
                  });
                } catch {
                  toast.error(language === 'ar' ? 'فشل في جلب بيانات الجلسة' : 'Failed to fetch session data');
                }
              }}
              disabled={!voucherDownloadSpeed || !voucherUploadSpeed || voucherChangeSpeedMutation.isPending}
              className="bg-sky-600 hover:bg-sky-700 gap-2"
            >
              {voucherChangeSpeedMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {language === 'ar' ? 'تطبيق فوري' : 'Apply Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
