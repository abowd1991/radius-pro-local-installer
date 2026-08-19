import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "@/lib/operationFeedback";
import {
  Plus,
  Edit,
  Trash2,
  Zap,
  HardDrive,
  Clock,
  Copy,
  Power,
  PowerOff,
  ArrowUpDown,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { Progress } from "@/components/ui/progress";
import { InsufficientBalanceModal, isInsufficientBalanceError } from "@/components/InsufficientBalanceModal";
import { SpeedScheduleManager } from "@/components/SpeedScheduleManager";
import { formatPrice, getCurrencySymbol } from "../../../shared/currencies";
import { bytesToGigabytes, gigabytesToBytes } from "../../../shared/planNetworkAttributes";

type SortKey = "name" | "price" | "speed" | "cards";
type SortDir = "asc" | "desc";

export default function Plans() {
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();
  const [, navigate] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<number | null>(null);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [autoDisconnectState, setAutoDisconnectState] = useState<boolean>(false);
  // Multi-NAS selection: array of selected NAS IDs (empty = no restriction)
  const [selectedNasIds, setSelectedNasIds] = useState<number[]>([]);
  // Confirm dialogs for apply/remove NAS restriction
  const [confirmApplyPlanId, setConfirmApplyPlanId] = useState<number | null>(null);
  const [confirmRemovePlanId, setConfirmRemovePlanId] = useState<number | null>(null);
  // Progress simulation for apply/remove
  const [applyProgress, setApplyProgress] = useState(0);
  const [removeProgress, setRemoveProgress] = useState(0);
  const applyProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const removeProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgress = (setter: React.Dispatch<React.SetStateAction<number>>, intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>) => {
    setter(5);
    intervalRef.current = setInterval(() => {
      setter((prev: number) => {
        if (prev >= 90) { if (intervalRef.current) clearInterval(intervalRef.current); return 90; }
        return prev + Math.random() * 8 + 3;
      });
    }, 400);
  };

  const finishProgress = (setter: React.Dispatch<React.SetStateAction<number>>, intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setter(100);
    setTimeout(() => setter(0), 800);
  };

  // applyNasRestriction mutation
  // @ts-ignore - plansNas is registered in appRouter; TypeScript inference depth limit exceeded due to large router
  const applyNasRestriction = (trpc as any).plansNas.applyNasRestriction.useMutation({
    onMutate: () => startProgress(setApplyProgress, applyProgressRef),
    onSuccess: (data: any) => {
      finishProgress(setApplyProgress, applyProgressRef);
      toast.success(language === "ar"
        ? `✅ تم تطبيق العزل على ${data.updated} كرت بنجاح`
        : `✅ Applied restriction to ${data.updated} cards successfully`);
      refetch();
    },
    onError: (err: any) => {
      finishProgress(setApplyProgress, applyProgressRef);
      toast.error(err.message);
    },
  });
  // removeNasRestriction mutation
  // @ts-ignore - plansNas is registered in appRouter; TypeScript inference depth limit exceeded due to large router
  const removeNasRestriction = (trpc as any).plansNas.removeNasRestriction.useMutation({
    onMutate: () => startProgress(setRemoveProgress, removeProgressRef),
    onSuccess: (data: any) => {
      finishProgress(setRemoveProgress, removeProgressRef);
      toast.success(language === "ar"
        ? `✅ تم إزالة العزل وتحرير ${data.updated} كرت بنجاح`
        : `✅ Removed restriction from ${data.updated} cards successfully`);
      refetch();
    },
    onError: (err: any) => {
      finishProgress(setRemoveProgress, removeProgressRef);
      toast.error(err.message);
    },
  });
  const [selectedClientId, setSelectedClientId] = useState<string>("all");

  // Fetch NAS list for NAS restriction dropdown
  const { data: nasList } = trpc.nas.list.useQuery();
  const isAdminUser = user?.role === "owner" || user?.role === "super_admin";

  // For admin: fetch all plans with owner info; for others: fetch own plans
  const { data: allPlansWithOwner, isLoading: isLoadingAll, refetch: refetchAll } =
    trpc.plans.listAllWithOwner.useQuery(
      { clientId: selectedClientId !== "all" ? parseInt(selectedClientId) : undefined },
      { enabled: isAdminUser }
    );
  const { data: ownPlans, isLoading: isLoadingOwn, refetch: refetchOwn } =
    trpc.plans.listWithStats.useQuery(undefined, { enabled: !isAdminUser });
  const plans = isAdminUser ? allPlansWithOwner : ownPlans;
  const isLoading = isAdminUser ? isLoadingAll : isLoadingOwn;
  const refetch = isAdminUser ? refetchAll : refetchOwn;
  // Fetch clients list for admin dropdown
  const { data: clientsList } = trpc.users.getMyClients.useQuery(undefined, { enabled: isAdminUser });

  // Mutations
  const createPlan = trpc.plans.create.useMutation({
    onSuccess: (created: any) => {
      if (selectedNasIds.length > 0 && created?.id) {
        applyNasRestriction.mutate({ planId: created.id, nasIds: selectedNasIds });
      }
      toast.success(language === "ar" ? "تم إنشاء الخطة بنجاح" : "Plan created successfully");
      setIsAddDialogOpen(false);
      refetch();
    },
    onError: (error: any) => {
      if (isInsufficientBalanceError(error)) {
        setShowInsufficientBalance(true);
      } else {
        toast.error(error.message);
      }
    },
  });

  const updatePlan = trpc.plans.update.useMutation({
    onSuccess: () => {
      if (editingPlan?.id && selectedNasIds.length > 0) {
        applyNasRestriction.mutate({ planId: editingPlan.id, nasIds: selectedNasIds });
      }
      toast.success(language === "ar" ? "تم تحديث الخطة بنجاح" : "Plan updated successfully");
      setEditingPlan(null);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deletePlan = trpc.plans.delete.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حذف الخطة بنجاح" : "Plan deleted successfully");
      setDeletingPlanId(null);
      refetch();
    },
    onError: (error) => {
      setDeletingPlanId(null);
      toast.error(error.message, { duration: 6000 });
    },
  });

  const duplicatePlan = trpc.plans.duplicate.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم نسخ الخطة بنجاح" : "Plan duplicated successfully");
      refetch();
    },
    onError: (error: any) => {
      if (isInsufficientBalanceError(error)) {
        setShowInsufficientBalance(true);
      } else {
        toast.error(error.message);
      }
    },
  });

  const toggleStatus = trpc.plans.update.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تغيير حالة الخطة" : "Plan status updated");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const formatSpeed = (kbps: number) => {
    if (kbps >= 1000) return `${kbps / 1000} Mbps`;
    return `${kbps} Kbps`;
  };

  const formatData = (mb: number | null) => {
    if (!mb) return language === "ar" ? "غير محدود" : "Unlimited";
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
  };

  const userCurrency = (user as any)?.preferredCurrency || "USD";

  const formatCurrency = (amount: string | number, planCurrency?: string) =>
    formatPrice(amount, planCurrency || userCurrency);

  // Sort plans
  const sortedPlans = useMemo(() => {
    if (!plans) return [];
    return [...plans].sort((a: any, b: any) => {
      let va: any, vb: any;
      if (sortKey === "name") { va = (a.name || "").toLowerCase(); vb = (b.name || "").toLowerCase(); }
      else if (sortKey === "price") { va = parseFloat(a.price || "0"); vb = parseFloat(b.price || "0"); }
      else if (sortKey === "speed") { va = a.downloadSpeed || 0; vb = b.downloadSpeed || 0; }
      else { va = a.cardCount || 0; vb = b.cardCount || 0; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [plans, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      nameAr: formData.get("nameAr") as string || undefined,
      description: formData.get("description") as string || undefined,
      descriptionAr: formData.get("descriptionAr") as string || undefined,
      downloadSpeed: (() => {
        const val = parseFloat(formData.get("downloadSpeed") as string);
        const unit = formData.get("downloadSpeedUnit") as string || "mbps";
        return unit === "kbps" ? Math.round(val) : Math.round(val * 1000);
      })(),
      uploadSpeed: (() => {
        const val = parseFloat(formData.get("uploadSpeed") as string);
        const unit = formData.get("uploadSpeedUnit") as string || "mbps";
        return unit === "kbps" ? Math.round(val) : Math.round(val * 1000);
      })(),
      dataLimit: formData.get("dataLimit") ? gigabytesToBytes(parseFloat(formData.get("dataLimit") as string)) : null,
      validityValue: parseInt(formData.get("durationDays") as string) || 30,
      validityType: "days" as const,
      price: formData.get("price") as string,
      resellerPrice: formData.get("resellerPrice") as string,
      simultaneousUse: parseInt(formData.get("simultaneousUsers") as string) || 1,
      mikrotikAddressPool: formData.get("mikrotikAddressPool") as string || null,
      autoDisconnect: autoDisconnectState,
      // Multi-NAS: send as JSON string if any selected, else null
      restrictedNasIds: selectedNasIds.length > 0 ? JSON.stringify(selectedNasIds) : null,
      // Legacy single NAS for backward compat
      restrictedNasId: selectedNasIds.length === 1 ? selectedNasIds[0] : undefined,
      // Always send the user's preferred currency so the plan is created in the correct currency
      currency: userCurrency,
    };
    if (editingPlan) {
      updatePlan.mutate({ id: editingPlan.id, ...data });
    } else {
      createPlan.mutate(data);
    }
  };

  const canManagePlans =
    user?.role === "owner" ||
    user?.role === "super_admin" ||
    user?.role === "client" ||
    user?.role === "client_staff" ||
    user?.role === "reseller";

  if (!canManagePlans) return null;

  return (
    <div className="space-y-6">
      <InsufficientBalanceModal
        open={showInsufficientBalance}
        onClose={() => setShowInsufficientBalance(false)}
      />

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-gradient-to-br from-primary to-teal-600 rounded-xl shadow-sm">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight">{t("plans.title")}</h1>
              <p className="text-muted-foreground text-xs sm:text-sm hidden sm:block">
                {language === "ar" ? "إدارة خطط الإنترنت والأسعار" : "Manage internet plans and pricing"}
              </p>
            </div>
          </div>
          {/* Add Plan Button - always visible */}
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9">
                <Plus className={`h-4 w-4 ${direction === "rtl" ? "ml-1" : "mr-1"}`} />
                <span className="hidden sm:inline">{t("plans.add_plan")}</span>
                <span className="sm:hidden">{language === "ar" ? "إضافة" : "Add"}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] w-[95vw] sm:w-auto flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle>{t("plans.add_plan")}</DialogTitle>
                <DialogDescription>
                  {language === "ar" ? "أضف خطة إنترنت جديدة" : "Add a new internet plan"}
                </DialogDescription>
              </DialogHeader>
              <PlanForm
                language={language}
                t={t}
                userCurrency={userCurrency}
                onSubmit={handleSubmit}
                isPending={createPlan.isPending}
                onCancel={() => setIsAddDialogOpen(false)}
              autoDisconnectState={autoDisconnectState}
              setAutoDisconnectState={setAutoDisconnectState}
              nasList={nasList || []}
              selectedNasIds={selectedNasIds}
              setSelectedNasIds={setSelectedNasIds}
            />
          </DialogContent>
          </Dialog>
        </div>
        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Client Filter - Admin only */}
          {isAdminUser && clientsList && clientsList.length > 0 && (
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder={language === "ar" ? "جميع العملاء" : "All Clients"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === "ar" ? "جميع العملاء" : "All Clients"}</SelectItem>
                {(clientsList as any[]).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name || c.username || c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Sort Controls */}
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-36 h-9">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1 opacity-60" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">{language === "ar" ? "الاسم" : "Name"}</SelectItem>
              <SelectItem value="price">{language === "ar" ? "السعر" : "Price"}</SelectItem>
              <SelectItem value="speed">{language === "ar" ? "السرعة" : "Speed"}</SelectItem>
              <SelectItem value="cards">{language === "ar" ? "الكروت" : "Cards"}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3"
            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </Button>

        </div>
      </div>

      {/* Stats Summary */}
      {plans && plans.length > 0 && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {/* Primary - Total Plans */}
          <div className="col-span-2 sm:col-span-1 relative overflow-hidden rounded-2xl p-4 sm:p-5 text-white bg-gradient-to-br from-primary to-teal-600 shadow-md">
            <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10 blur-xl" />
            <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-black/10 blur-2xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">
                  {language === "ar" ? "إجمالي الخطط" : "Total Plans"}
                </p>
                <p className="text-4xl font-bold leading-none">{plans.length}</p>
                <p className="text-white/60 text-xs mt-1">{language === "ar" ? "خطة متاحة" : "available plans"}</p>
              </div>
              <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                <Zap className="h-5 w-5" />
              </div>
            </div>
          </div>
          {/* Active Plans */}
          <div className="relative overflow-hidden rounded-2xl p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">{t("common.active")}</p>
              <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg">
                <Power className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {plans.filter((p: any) => p.status === "active").length}
            </p>
          </div>
          {/* Inactive Plans */}
          <div className="relative overflow-hidden rounded-2xl p-4 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-700/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">{t("common.inactive")}</p>
              <div className="p-1.5 bg-slate-100 dark:bg-slate-800/40 rounded-lg">
                <PowerOff className="h-4 w-4 text-slate-500" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-600 dark:text-slate-400">
              {plans.filter((p: any) => p.status === "inactive").length}
            </p>
          </div>
          {/* Total Cards */}
          <div className="relative overflow-hidden rounded-2xl p-4 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400 uppercase tracking-wider">{language === "ar" ? "إجمالي الكروت" : "Total Cards"}</p>
              <div className="p-1.5 bg-sky-100 dark:bg-sky-900/40 rounded-lg">
                <CreditCard className="h-4 w-4 text-sky-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-sky-600 dark:text-sky-400">
              {plans.reduce((acc: number, p: any) => acc + (p.cardCount || 0), 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

            {/* Plans List - Responsive: Table on desktop, Cards on mobile */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Desktop Table Header - hidden on mobile */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-0 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <div>{language === "ar" ? "الباقة" : "Plan"}</div>
          <div className="text-center">{language === "ar" ? "السرعة" : "Speed"}</div>
          <div className="text-center">{language === "ar" ? "الصلاحية" : "Validity"}</div>
          <div className="text-center">{language === "ar" ? "الكروت" : "Cards"}</div>
          <div className="text-center">{language === "ar" ? "السعر" : "Price"}</div>
          <div className="text-center">{language === "ar" ? "إجراءات" : "Actions"}</div>
        </div>
        {isLoading ? (
          <div className="divide-y divide-border">
            {/* Desktop skeleton */}
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-0 px-4 py-3 animate-pulse">
                <div className="flex items-center gap-3"><div className="h-8 w-8 rounded-lg bg-muted" /><div className="h-4 bg-muted rounded w-32" /></div>
                <div className="flex items-center justify-center"><div className="h-4 bg-muted rounded w-20" /></div>
                <div className="flex items-center justify-center"><div className="h-4 bg-muted rounded w-16" /></div>
                <div className="flex items-center justify-center"><div className="h-4 bg-muted rounded w-12" /></div>
                <div className="flex items-center justify-center"><div className="h-4 bg-muted rounded w-16" /></div>
                <div className="flex items-center justify-center"><div className="h-4 bg-muted rounded w-20" /></div>
              </div>
            ))}
            {/* Mobile skeleton */}
            {[1, 2, 3].map(i => (
              <div key={`m${i}`} className="md:hidden p-4 animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                  <div className="h-6 bg-muted rounded w-16" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-12 bg-muted rounded-lg" />
                  <div className="h-12 bg-muted rounded-lg" />
                  <div className="h-12 bg-muted rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : sortedPlans.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground text-sm">
            {language === "ar" ? "لا توجد خطط بعد. أضف خطتك الأولى!" : "No plans yet. Add your first plan!"}
          </div>
        ) : (
          <div className="divide-y divide-border">
          {sortedPlans.map((plan: any) => {
            // Compute NAS info once per row
            const hasRestriction = !!(plan.restrictedNasIds || plan.restrictedNasId);
            let nasIds: number[] = [];
            if (plan.restrictedNasIds) { try { nasIds = JSON.parse(plan.restrictedNasIds); } catch { nasIds = []; } }
            else if (plan.restrictedNasId) { nasIds = [plan.restrictedNasId]; }
            const nasNames = nasIds.map((id: number) => {
              const nas = nasList?.find((n: any) => n.id === id);
              return nas?.shortname || nas?.name || nas?.nasname || `NAS #${id}`;
            });
            // Color palette per plan id
            const colors = ["from-blue-500 to-indigo-600", "from-emerald-500 to-teal-600", "from-violet-500 to-purple-600", "from-orange-500 to-amber-600", "from-rose-500 to-pink-600", "from-cyan-500 to-sky-600"];
            const color = colors[plan.id % colors.length];
            return (
              <div key={plan.id}>
              {/* ── DESKTOP ROW ── */}
              <div
                className={`hidden md:grid group grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-0 px-4 py-3 items-center transition-colors hover:bg-muted/30 cursor-pointer ${
                  plan.status === "inactive" ? "opacity-60" : ""
                }`}
                onClick={(e) => {
                  const t = e.target as HTMLElement;
                  if (t.closest('button') || t.closest('[role="button"]')) return;
                  navigate(`/plans/${plan.id}`);
                }}
              >
                {/* Plan Name + Icon */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Colored icon */}
                  <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shrink-0 shadow-sm`}>
                    <Zap className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground truncate">
                        {language === "ar" && plan.nameAr ? plan.nameAr : plan.name}
                      </span>
                      {/* Status Toggle inline */}
                      <button
                        onClick={() => toggleStatus.mutate({ id: plan.id, status: plan.status === "active" ? "inactive" : "active" })}
                        disabled={toggleStatus.isPending}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer border ${
                          plan.status === "active"
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                            : "bg-slate-50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                        }`}
                        title={plan.status === "active" ? (language === "ar" ? "اضغط لإيقاف" : "Click to deactivate") : (language === "ar" ? "اضغط لتفعيل" : "Click to activate")}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${plan.status === "active" ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {plan.status === "active" ? t("common.active") : t("common.inactive")}
                      </button>
                      {/* Speed Schedule badge */}
                      {plan.hasActiveSchedule && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          <Clock className="h-3 w-3" />
                          {language === "ar" ? "سرعة تلقائية" : "Auto Speed"}
                        </span>
                      )}
                      {/* Owner badge for admin */}
                      {isAdminUser && plan.ownerName && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 border-blue-300 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
                          {plan.ownerName || plan.ownerUsername || plan.ownerEmail}
                        </Badge>
                      )}
                    </div>
                    {/* NAS restriction chip */}
                    {hasRestriction && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {nasNames.slice(0, 2).map((name: string, i: number) => (
                          <span key={i} className="inline-flex items-center rounded bg-violet-100 dark:bg-violet-900/40 px-1.5 py-0.5 text-xs text-violet-700 dark:text-violet-300 font-medium">
                            {name}
                          </span>
                        ))}
                        {nasNames.length > 2 && (
                          <span className="text-xs text-muted-foreground">+{nasNames.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Speed */}
                <div className="flex flex-col items-center gap-0.5 text-xs">
                  <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                    <span className="text-muted-foreground">↓</span> {formatSpeed(plan.downloadSpeed)}
                  </div>
                  <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium">
                    <span className="text-muted-foreground">↑</span> {formatSpeed(plan.uploadSpeed)}
                  </div>
                </div>

                {/* Validity */}
                <div className="flex flex-col items-center gap-0.5 text-xs text-center">
                  <span className="font-semibold text-foreground">{plan.validityValue}</span>
                  <span className="text-muted-foreground">{plan.validityType === "days" ? t("plans.days") : plan.validityType === "hours" ? t("plans.hours") : t("plans.minutes")}</span>
                  {plan.dataLimit && (
                    <span className="text-orange-500 text-xs">{formatData(plan.dataLimit)}</span>
                  )}
                </div>

                {/* Cards count */}
                <div className="flex flex-col items-center gap-0.5 text-xs">
                  <span className="font-semibold text-foreground text-sm">{(plan.cardCount ?? 0).toLocaleString()}</span>
                  <span className="text-muted-foreground">{language === "ar" ? "كرت" : "cards"}</span>
                </div>

                {/* Price */}
                <div className="flex flex-col items-center gap-0.5 text-xs">
                  <span className="font-bold text-primary text-sm">
                    {user?.role === "reseller"
                      ? formatCurrency(plan.resellerPrice, plan.currency)
                      : formatCurrency(plan.price, plan.currency)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    /{plan.validityValue} {plan.validityType === "days" ? t("plans.days") : plan.validityType === "hours" ? t("plans.hours") : t("plans.minutes")}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 justify-end">
                  {/* Edit */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 opacity-60 group-hover:opacity-100 transition-opacity"
                    onClick={() => {
                      setEditingPlan(plan);
                      setAutoDisconnectState(plan.autoDisconnect || false);
                      if (plan.restrictedNasIds) {
                        try { setSelectedNasIds(JSON.parse(plan.restrictedNasIds)); } catch { setSelectedNasIds([]); }
                      } else if (plan.restrictedNasId) {
                        setSelectedNasIds([plan.restrictedNasId]);
                      } else {
                        setSelectedNasIds([]);
                      }
                    }}
                    title={language === "ar" ? "تعديل" : "Edit"}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  {/* Duplicate */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 opacity-60 group-hover:opacity-100 transition-opacity"
                    disabled={duplicatePlan.isPending}
                    onClick={() => duplicatePlan.mutate({ id: plan.id })}
                    title={language === "ar" ? "نسخ" : "Duplicate"}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 opacity-60 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeletingPlanId(plan.id)}
                    title={language === "ar" ? "حذف" : "Delete"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {/* ── MOBILE CARD ── */}
              <div
                className={`md:hidden p-4 cursor-pointer active:bg-muted/40 transition-colors ${
                  plan.status === "inactive" ? "opacity-60" : ""
                }`}
                onClick={(e) => {
                  const tgt = e.target as HTMLElement;
                  if (tgt.closest('button') || tgt.closest('[role="button"]')) return;
                  navigate(`/plans/${plan.id}`);
                }}
              >
                {/* Card Top: Icon + Name + Status + Actions */}
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shrink-0 shadow-sm mt-0.5`}>
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm leading-tight">
                        {language === "ar" && plan.nameAr ? plan.nameAr : plan.name}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        plan.status === "active"
                          ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}>
                        {plan.status === "active" ? t("common.active") : t("common.inactive")}
                      </span>
                    </div>
                    {user?.role !== "reseller" && plan.ownerName && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{plan.ownerName}</p>
                    )}
                    {hasRestriction && nasNames.length > 0 && (
                      <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5 truncate">
                        {nasNames.slice(0, 2).join(" · ")}{nasNames.length > 2 ? ` +${nasNames.length - 2}` : ""}
                      </p>
                    )}
                    {/* Speed Schedule badge - mobile */}
                    {plan.hasActiveSchedule && (
                      <span className="inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        <Clock className="h-3 w-3" />
                        {language === "ar" ? "سرعة تلقائية" : "Auto Speed"}
                      </span>
                    )}
                  </div>
                  {/* Quick action buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setEditingPlan(plan);
                        setAutoDisconnectState(plan.autoDisconnect || false);
                        if (plan.restrictedNasIds) {
                          try { setSelectedNasIds(JSON.parse(plan.restrictedNasIds)); } catch { setSelectedNasIds([]); }
                        } else if (plan.restrictedNasId) {
                          setSelectedNasIds([plan.restrictedNasId]);
                        } else {
                          setSelectedNasIds([]);
                        }
                      }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeletingPlanId(plan.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {/* Card Bottom: Stats chips */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">{language === "ar" ? "السرعة" : "Speed"}</p>
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">↓ {formatSpeed(plan.downloadSpeed)}</p>
                    <p className="text-xs font-semibold text-purple-600 dark:text-purple-400">↑ {formatSpeed(plan.uploadSpeed)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">{language === "ar" ? "الصلاحية" : "Validity"}</p>
                    <p className="text-sm font-bold">{plan.validityValue}</p>
                    <p className="text-xs text-muted-foreground">{plan.validityType === "days" ? t("plans.days") : plan.validityType === "hours" ? t("plans.hours") : t("plans.minutes")}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">{language === "ar" ? "السعر" : "Price"}</p>
                    <p className="text-sm font-bold text-primary">
                      {user?.role === "reseller"
                        ? formatCurrency(plan.resellerPrice, plan.currency)
                        : formatCurrency(plan.price, plan.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">{(plan.cardCount ?? 0).toLocaleString()} {language === "ar" ? "كرت" : "cards"}</p>
                  </div>
                </div>
              </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deletingPlanId !== null} onOpenChange={(open) => !open && setDeletingPlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "ar" ? "تأكيد الحذف" : "Confirm Delete"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {language === "ar"
                  ? "هل أنت متأكد من حذف هذه الباقة؟ لا يمكن التراجع عن هذا الإجراء."
                  : "Are you sure you want to delete this plan? This action cannot be undone."}
              </span>
              <span className="block text-amber-600 dark:text-amber-400 text-xs font-medium">
                {language === "ar"
                  ? "⚠️ سيتم رفض الحذف إذا كانت هناك كروت مرتبطة بهذه الباقة."
                  : "⚠️ Deletion will be rejected if this plan has linked cards."}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingPlanId && deletePlan.mutate({ id: deletingPlanId })}
              disabled={deletePlan.isPending}
            >
              {deletePlan.isPending
                ? (language === "ar" ? "جاري الحذف..." : "Deleting...")
                : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Apply NAS Restriction Dialog */}
      <AlertDialog open={confirmApplyPlanId !== null} onOpenChange={(open) => !open && setConfirmApplyPlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "ar" ? "تأكيد ربط الكروت بالباقة" : "Confirm Bind Cards to Plan"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "ar"
                ? "سيتم تطبيق عزل الشبكة على جميع الكروت النشطة وغير المستخدمة في هذه الباقة. الكروت ستعمل فقط على الشبكات المحددة في الباقة. هل تريد المتابعة؟"
                : "Network restriction will be applied to all active and unused cards in this plan. Cards will only work on the networks configured in the plan. Do you want to continue?"}
            </AlertDialogDescription>
            {applyNasRestriction.isPending && applyProgress > 0 && (
              <div className="mt-3 space-y-1">
                <Progress value={applyProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {language === "ar" ? `جاري المعالجة... ${Math.round(applyProgress)}%` : `Processing... ${Math.round(applyProgress)}%`}
                </p>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => confirmApplyPlanId && applyNasRestriction.mutate({ planId: confirmApplyPlanId })}
              disabled={applyNasRestriction.isPending}
            >
              {applyNasRestriction.isPending
                ? (language === "ar" ? "جاري الربط..." : "Binding...")
                : (language === "ar" ? "نعم، ربط الكروت" : "Yes, Bind Cards")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Confirm Remove NAS Restriction Dialog */}
      <AlertDialog open={confirmRemovePlanId !== null} onOpenChange={(open) => !open && setConfirmRemovePlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "ar" ? "تأكيد فصل الكروت" : "Confirm Unbind Cards"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "ar"
                ? "سيتم إزالة عزل الشبكة من جميع الكروت في هذه الباقة. الكروت ستعمل على جميع الشبكات بعد الفصل. هل تريد المتابعة؟"
                : "Network restriction will be removed from all cards in this plan. Cards will work on all networks after unbinding. Do you want to continue?"}
            </AlertDialogDescription>
            {removeNasRestriction.isPending && removeProgress > 0 && (
              <div className="mt-3 space-y-1">
                <Progress value={removeProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {language === "ar" ? `جاري المعالجة... ${Math.round(removeProgress)}%` : `Processing... ${Math.round(removeProgress)}%`}
                </p>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmRemovePlanId && removeNasRestriction.mutate({ planId: confirmRemovePlanId })}
              disabled={removeNasRestriction.isPending}
            >
              {removeNasRestriction.isPending
                ? (language === "ar" ? "جاري الفصل..." : "Unbinding...")
                : (language === "ar" ? "نعم، فصل الكروت" : "Yes, Unbind Cards")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Edit Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("plans.edit_plan")}</DialogTitle>
            <DialogDescription>
              {language === "ar" ? "تعديل بيانات الخطة" : "Edit plan details"}
            </DialogDescription>
          </DialogHeader>
          {editingPlan && (
            <PlanForm
              language={language}
              t={t}
              userCurrency={editingPlan.currency || userCurrency}
              defaultValues={editingPlan}
              onSubmit={handleSubmit}
              isPending={updatePlan.isPending}
              onCancel={() => { setEditingPlan(null); setAutoDisconnectState(false); setSelectedNasIds([]); }}
              isEdit
              autoDisconnectState={autoDisconnectState}
              setAutoDisconnectState={setAutoDisconnectState}
              nasList={nasList || []}
              selectedNasIds={selectedNasIds}
              setSelectedNasIds={setSelectedNasIds}
              planId={editingPlan.id}
              onApplyRestriction={(id) => { setEditingPlan(null); setConfirmApplyPlanId(id); }}
              onRemoveRestriction={(id) => { setEditingPlan(null); setConfirmRemovePlanId(id); }}
              hasRestriction={!!(editingPlan.restrictedNasIds || editingPlan.restrictedNasId)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Reusable Plan Form ───────────────────────────────────────────────────────
interface PlanFormProps {
  language: string;
  t: (key: string) => string;
  userCurrency: string;
  defaultValues?: any;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
  onCancel: () => void;
  isEdit?: boolean;
  autoDisconnectState: boolean;
  setAutoDisconnectState: (v: boolean) => void;
  nasList: any[];
  selectedNasIds: number[];
  setSelectedNasIds: (v: number[]) => void;
  planId?: number;
  onApplyRestriction?: (planId: number) => void;
  onRemoveRestriction?: (planId: number) => void;
  hasRestriction?: boolean;
}
function PlanForm({ language, t, userCurrency, defaultValues, onSubmit, isPending, onCancel, isEdit, autoDisconnectState, setAutoDisconnectState, nasList, selectedNasIds, setSelectedNasIds, planId, onApplyRestriction, onRemoveRestriction, hasRestriction }: PlanFormProps) {
  const currencySymbol = getCurrencySymbol(userCurrency);
  const simultaneousRef = useRef<HTMLInputElement>(null);

  // Auto-fill simultaneousUsers = 2 when autoDisconnect is enabled
  const handleAutoDisconnectChange = (val: boolean) => {
    setAutoDisconnectState(val);
    if (val && simultaneousRef.current) {
      const cur = parseInt(simultaneousRef.current.value) || 1;
      if (cur < 2) simultaneousRef.current.value = "2";
    }
  };

  // Speed unit state - detect initial unit from defaultValues
  const initDownUnit = defaultValues && defaultValues.downloadSpeed < 1000 ? "kbps" : "mbps";
  const initUpUnit = defaultValues && defaultValues.uploadSpeed < 1000 ? "kbps" : "mbps";
  const [downUnit, setDownUnit] = useState<"mbps" | "kbps">(initDownUnit);
  const [upUnit, setUpUnit] = useState<"mbps" | "kbps">(initUpUnit);

  // Compute display value from stored kbps
  const downDisplayVal = defaultValues
    ? (downUnit === "kbps" ? defaultValues.downloadSpeed : defaultValues.downloadSpeed / 1000)
    : undefined;
  const upDisplayVal = defaultValues
    ? (upUnit === "kbps" ? defaultValues.uploadSpeed : defaultValues.uploadSpeed / 1000)
    : undefined;

  const downInputRef = useRef<HTMLInputElement>(null);
  const upInputRef = useRef<HTMLInputElement>(null);

  const handleDownUnitChange = (newUnit: "mbps" | "kbps") => {
    if (downInputRef.current) {
      const cur = parseFloat(downInputRef.current.value) || 0;
      if (newUnit === "kbps" && downUnit === "mbps") {
        downInputRef.current.value = String(Math.round(cur * 1000));
      } else if (newUnit === "mbps" && downUnit === "kbps") {
        downInputRef.current.value = String(cur / 1000);
      }
    }
    setDownUnit(newUnit);
  };

  const handleUpUnitChange = (newUnit: "mbps" | "kbps") => {
    if (upInputRef.current) {
      const cur = parseFloat(upInputRef.current.value) || 0;
      if (newUnit === "kbps" && upUnit === "mbps") {
        upInputRef.current.value = String(Math.round(cur * 1000));
      } else if (newUnit === "mbps" && upUnit === "kbps") {
        upInputRef.current.value = String(cur / 1000);
      }
    }
    setUpUnit(newUnit);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col min-h-0 overflow-y-auto flex-1">
      <div className="grid gap-2 flex-1">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">{language === "ar" ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
            <Input id="name" name="name" defaultValue={defaultValues?.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nameAr">{language === "ar" ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
            <Input id="nameAr" name="nameAr" dir="rtl" defaultValue={defaultValues?.nameAr || ""} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="description">{language === "ar" ? "الوصف (إنجليزي)" : "Description (English)"}</Label>
            <Textarea id="description" name="description" defaultValue={defaultValues?.description || ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="descriptionAr">{language === "ar" ? "الوصف (عربي)" : "Description (Arabic)"}</Label>
            <Textarea id="descriptionAr" name="descriptionAr" dir="rtl" defaultValue={defaultValues?.descriptionAr || ""} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="downloadSpeed">{t("plans.download_speed")} ({downUnit === "kbps" ? "Kbps" : "Mbps"})</Label>
            <div className="flex gap-2">
              <Input
                id="downloadSpeed"
                name="downloadSpeed"
                ref={downInputRef}
                type="number"
                min={downUnit === "kbps" ? "1" : "0.001"}
                step={downUnit === "kbps" ? "1" : "0.001"}
                defaultValue={downDisplayVal}
                required
                className="flex-1"
              />
              <input type="hidden" name="downloadSpeedUnit" value={downUnit} />
              <Select value={downUnit} onValueChange={(v) => handleDownUnitChange(v as "mbps" | "kbps")}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mbps">Mbps</SelectItem>
                  <SelectItem value="kbps">Kbps</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="uploadSpeed">{t("plans.upload_speed")} ({upUnit === "kbps" ? "Kbps" : "Mbps"})</Label>
            <div className="flex gap-2">
              <Input
                id="uploadSpeed"
                name="uploadSpeed"
                ref={upInputRef}
                type="number"
                min={upUnit === "kbps" ? "1" : "0.001"}
                step={upUnit === "kbps" ? "1" : "0.001"}
                defaultValue={upDisplayVal}
                required
                className="flex-1"
              />
              <input type="hidden" name="uploadSpeedUnit" value={upUnit} />
              <Select value={upUnit} onValueChange={(v) => handleUpUnitChange(v as "mbps" | "kbps")}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mbps">Mbps</SelectItem>
                  <SelectItem value="kbps">Kbps</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dataLimit">{t("plans.data_limit")} (GB)</Label>
            <Input id="dataLimit" name="dataLimit" type="number" min="0.001" step="0.001"
              placeholder={language === "ar" ? "اتركه فارغاً لغير محدود" : "Leave empty for unlimited"}
              defaultValue={bytesToGigabytes(defaultValues?.dataLimit) ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="durationDays">{t("plans.duration")} ({t("plans.days")})</Label>
            <Input id="durationDays" name="durationDays" type="number" min="1"
              defaultValue={defaultValues?.validityValue ?? 30} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price">{t("common.price")} ({currencySymbol})</Label>
            <Input id="price" name="price" type="number" step="0.01" min="0"
              defaultValue={defaultValues?.price} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resellerPrice">{t("plans.reseller_price")} ({currencySymbol})</Label>
            <Input id="resellerPrice" name="resellerPrice" type="number" step="0.01" min="0"
              defaultValue={defaultValues?.resellerPrice} required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="simultaneousUsers">{language === "ar" ? "المستخدمين المتزامنين" : "Simultaneous Users"}</Label>
            <Input id="simultaneousUsers" name="simultaneousUsers" type="number" min="1"
              ref={simultaneousRef}
              defaultValue={defaultValues?.simultaneousUse ?? 1} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mikrotikAddressPool">{language === "ar" ? "بولة عناوين MikroTik" : "MikroTik Address Pool"}</Label>
            <Input id="mikrotikAddressPool" name="mikrotikAddressPool" placeholder="e.g., hotspot-pool"
              defaultValue={defaultValues?.mikrotikAddressPool || ""} />
          </div>
        </div>

        {/* NAS Restriction - Multi-select with Checkboxes */}
        <div className="space-y-2">
          <Label>{language === "ar" ? "تقييد الشبكة (اختياري)" : "Network Restriction (Optional)"}</Label>
          {nasList.length === 0 ? (
            <p className="text-xs text-muted-foreground">{language === "ar" ? "لا توجد شبكات مضافة" : "No NAS devices added"}</p>
          ) : (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 max-h-48 overflow-y-auto">
              {/* Clear all option */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  id="nas-none"
                  checked={selectedNasIds.length === 0}
                  onCheckedChange={(checked) => { if (checked) setSelectedNasIds([]); }}
                />
                <label htmlFor="nas-none" className="text-sm cursor-pointer font-medium">
                  {language === "ar" ? "بدون تقييد — يعمل على كل الشبكات" : "No restriction — works on all networks"}
                </label>
              </div>
              {nasList.map((nas: any) => (
                <div key={nas.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`nas-${nas.id}`}
                    checked={selectedNasIds.includes(nas.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedNasIds([...selectedNasIds, nas.id]);
                      } else {
                        setSelectedNasIds(selectedNasIds.filter((id) => id !== nas.id));
                      }
                    }}
                  />
                  <label htmlFor={`nas-${nas.id}`} className="text-sm cursor-pointer flex-1">
                    <span className="font-medium">{nas.shortname || nas.name || nas.nasname}</span>
                    {(nas.shortname || nas.name) && (nas.shortname || nas.name) !== nas.nasname && (
                      <span className="text-muted-foreground text-xs mr-1"> ({nas.nasname})</span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          )}
          {selectedNasIds.length > 0 && (
            <p className="text-xs text-amber-600 font-medium">
              {language === "ar"
                ? `⚠️ الكروت ستعمل فقط على ${selectedNasIds.length} شبكة محددة وتُرفض من أي شبكة أخرى.`
                : `⚠️ Cards will only work on ${selectedNasIds.length} selected network(s) and will be rejected by any other.`}
            </p>
          )}
        </div>

        {/* Auto-Disconnect Option */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-500" />
              <Label className="text-sm font-semibold cursor-pointer" htmlFor="autoDisconnect">
                {language === "ar" ? "قطع الجلسة القديمة تلقائياً" : "Auto-Disconnect Old Session"}
              </Label>
            </div>
            <Switch
              id="autoDisconnect"
              checked={autoDisconnectState}
              onCheckedChange={handleAutoDisconnectChange}
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {language === "ar"
              ? "عند تفعيل هذا الخيار، إذا حاول المستخدم تسجيل الدخول وعنده جلسة قديمة لم تُغلق (مثلاً عند سرعة في استخدام الكرت من جهاز لآخر)، يقوم النظام تلقائياً بقطع الجلسة القديمة والسماح بالجلسة الجديدة. مفيد لمنع رسالة \"لا يمكن الدخول - تجاوز الحد المسموح\"."
              : "When enabled, if a user tries to login while having an old unclosed session (e.g., quickly switching between devices), the system automatically disconnects the old session and allows the new one. Prevents the 'no more sessions allowed' error."}
          </p>
          {autoDisconnectState && (
            <div className="space-y-1">
              <p className="text-xs text-amber-600 font-medium">
                {language === "ar"
                  ? "⚡ مفعّل — سيتم قطع الجلسة القديمة خلال 15 ثانية من محاولة الدخول الجديدة"
                  : "⚡ Active — Old session will be disconnected within 15 seconds of new login attempt"}
              </p>

            </div>
          )}
        </div>
      </div>
      {/* جداول السرعة الزمنية */}
      {isEdit && planId && (
        <SpeedScheduleManager planId={planId} language={language as "ar" | "en"} />
      )}

      {/* زر ربط الكروت — يظهر فقط عند التعديل (planId موجود) */}
      {isEdit && planId && (
        <div className="border rounded-lg p-2.5 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800 space-y-1.5">
          <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">
            {language === "ar" ? "إدارة ربط الكروت" : "Card Binding Management"}
          </p>
          <p className="text-xs text-muted-foreground">
            {language === "ar"
              ? "ربط الكروت يطبّق عزل الشبكة على جميع كروت هذه الباقة حسب إعداد تقييد الشبكة أعلاه"
              : "Bind cards applies the network restriction to all cards in this plan based on the NAS restriction settings above"}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-300"
              onClick={() => onApplyRestriction && onApplyRestriction(planId)}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {language === "ar" ? "ربط الكروت بالباقة" : "Bind Cards to Plan"}
            </Button>
            {hasRestriction && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                onClick={() => onRemoveRestriction && onRemoveRestriction(planId)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {language === "ar" ? "فصل الكروت" : "Unbind Cards"}
              </Button>
            )}
          </div>
        </div>
      )}
      <DialogFooter className="shrink-0 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? (language === "ar" ? (isEdit ? "جاري التحديث..." : "جاري الإنشاء...") : (isEdit ? "Updating..." : "Creating..."))
            : t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
