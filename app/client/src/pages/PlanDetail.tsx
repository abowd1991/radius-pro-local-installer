/**
 * PlanDetail.tsx — صفحة تفاصيل الباقة /plans/:id
 * تعرض: header الباقة، إحصائيات الكروت، تفاصيل الباقة، SpeedScheduleManager
 * مع أزرار التعديل/الحذف/النسخ
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Zap,
  Edit,
  Trash2,
  Copy,
  CreditCard,
  Clock,
  HardDrive,
  Users,
  Activity,
  CheckCircle2,
  XCircle,
  BarChart3,
  Power,
  PowerOff,
  Network,
} from "lucide-react";
import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { SpeedScheduleManager } from "@/components/SpeedScheduleManager";
import { InsufficientBalanceModal, isInsufficientBalanceError } from "@/components/InsufficientBalanceModal";
import { formatPrice, getCurrencySymbol } from "../../../shared/currencies";
import { bytesToGigabytes, gigabytesToBytes } from "../../../shared/planNetworkAttributes";

// ─── Color palette (same as Plans.tsx) ───────────────────────────────────────
const PLAN_COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

// ─── Helper functions ─────────────────────────────────────────────────────────
function formatSpeed(kbps: number) {
  if (kbps >= 1000) return `${kbps / 1000} Mbps`;
  return `${kbps} Kbps`;
}

function formatData(mb: number | null) {
  if (!mb) return null;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatValidityType(type: string, language: string) {
  if (type === "days") return language === "ar" ? "يوم" : "Days";
  if (type === "hours") return language === "ar" ? "ساعة" : "Hours";
  return language === "ar" ? "دقيقة" : "Minutes";
}

function formatServiceType(type: string, language: string) {
  const map: Record<string, { ar: string; en: string }> = {
    pppoe: { ar: "PPPoE", en: "PPPoE" },
    hotspot: { ar: "هوت سبوت", en: "Hotspot" },
    vpn: { ar: "VPN", en: "VPN" },
    all: { ar: "الكل", en: "All" },
  };
  return map[type]?.[language as "ar" | "en"] ?? type;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
}
function StatCard({ label, value, icon, colorClass }: StatCardProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorClass}`}>
            {icon}
          </div>
          <div>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── PlanForm (reused from Plans.tsx logic) ───────────────────────────────────
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

function PlanForm({
  language,
  t,
  userCurrency,
  defaultValues,
  onSubmit,
  isPending,
  onCancel,
  isEdit,
  autoDisconnectState,
  setAutoDisconnectState,
  nasList,
  selectedNasIds,
  setSelectedNasIds,
  planId,
  onApplyRestriction,
  onRemoveRestriction,
  hasRestriction,
}: PlanFormProps) {
  const currencySymbol = getCurrencySymbol(userCurrency);
  const simultaneousRef = useRef<HTMLInputElement>(null);

  const handleAutoDisconnectChange = (val: boolean) => {
    setAutoDisconnectState(val);
    if (val && simultaneousRef.current) {
      const cur = parseInt(simultaneousRef.current.value) || 1;
      if (cur < 2) simultaneousRef.current.value = "2";
    }
  };

  const initDownUnit = defaultValues && defaultValues.downloadSpeed < 1000 ? "kbps" : "mbps";
  const initUpUnit = defaultValues && defaultValues.uploadSpeed < 1000 ? "kbps" : "mbps";
  const [downUnit, setDownUnit] = useState<"mbps" | "kbps">(initDownUnit);
  const [upUnit, setUpUnit] = useState<"mbps" | "kbps">(initUpUnit);

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
            <Label htmlFor="durationDays">{t("plans.duration")} ({language === "ar" ? "يوم" : "Days"})</Label>
            <Input id="durationDays" name="durationDays" type="number" min="1" defaultValue={defaultValues?.validityValue || 30} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dataLimit">{t("plans.data_limit")} (GB)</Label>
            <Input
              id="dataLimit"
              name="dataLimit"
              type="number"
              min="0.001"
              defaultValue={bytesToGigabytes(defaultValues?.dataLimit) ?? ""}
              step="0.001"
              placeholder={t("plans.unlimited")}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price">{language === "ar" ? `السعر (${currencySymbol})` : `Price (${currencySymbol})`}</Label>
            <Input id="price" name="price" type="number" step="0.01" min="0" defaultValue={defaultValues?.price || ""} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resellerPrice">{t("plans.reseller_price")} ({currencySymbol})</Label>
            <Input id="resellerPrice" name="resellerPrice" type="number" step="0.01" min="0" defaultValue={defaultValues?.resellerPrice || ""} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="simultaneousUsers">{language === "ar" ? "المستخدمون المتزامنون" : "Simultaneous Users"}</Label>
            <Input
              id="simultaneousUsers"
              name="simultaneousUsers"
              ref={simultaneousRef}
              type="number"
              min="1"
              defaultValue={defaultValues?.simultaneousUse || 1}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mikrotikAddressPool">{language === "ar" ? "بولة عناوين MikroTik" : "MikroTik Address Pool"}</Label>
            <Input id="mikrotikAddressPool" name="mikrotikAddressPool" defaultValue={defaultValues?.mikrotikAddressPool || ""} placeholder={language === "ar" ? "اختياري" : "Optional"} />
          </div>
        </div>
        {/* Auto Disconnect */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">{language === "ar" ? "قطع الاتصال التلقائي" : "Auto Disconnect"}</p>
            <p className="text-xs text-muted-foreground">{language === "ar" ? "قطع الاتصال عند انتهاء الصلاحية" : "Disconnect when validity expires"}</p>
          </div>
          <Switch checked={autoDisconnectState} onCheckedChange={handleAutoDisconnectChange} />
        </div>
        {/* NAS Restriction */}
        <div className="space-y-2">
          <Label>{language === "ar" ? "تقييد NAS" : "NAS Restriction"}</Label>
          <div className="rounded-lg border p-3 space-y-2 max-h-40 overflow-y-auto">
            {nasList.length === 0 ? (
              <p className="text-xs text-muted-foreground">{language === "ar" ? "لا توجد أجهزة NAS" : "No NAS devices"}</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="nas-none"
                    checked={selectedNasIds.length === 0}
                    onCheckedChange={() => setSelectedNasIds([])}
                  />
                  <label htmlFor="nas-none" className="text-sm cursor-pointer font-medium">
                    {language === "ar" ? "بدون تقييد (الكل)" : "No restriction (All)"}
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
              </>
            )}
          </div>
          {/* Apply/Remove restriction buttons (edit mode only) */}
          {isEdit && planId && (
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-violet-600 border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                onClick={() => onApplyRestriction?.(planId)}
              >
                {language === "ar" ? "تطبيق العزل" : "Apply Restriction"}
              </Button>
              {hasRestriction && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => onRemoveRestriction?.(planId)}
                >
                  {language === "ar" ? "إزالة العزل" : "Remove Restriction"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Footer */}
      <div className="flex justify-end gap-2 pt-4 border-t mt-4 shrink-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (language === "ar" ? "جاري الحفظ..." : "Saving...") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();
  const planId = Number(id);

  // ── State ──────────────────────────────────────────────────────────────────
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeletingOpen, setIsDeletingOpen] = useState(false);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [autoDisconnectState, setAutoDisconnectState] = useState(false);
  const [selectedNasIds, setSelectedNasIds] = useState<number[]>([]);
  const [confirmApplyPlanId, setConfirmApplyPlanId] = useState<number | null>(null);
  const [confirmRemovePlanId, setConfirmRemovePlanId] = useState<number | null>(null);
  const [applyProgress, setApplyProgress] = useState(0);
  const [removeProgress, setRemoveProgress] = useState(0);
  const applyProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const removeProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgress = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>
  ) => {
    setter(5);
    intervalRef.current = setInterval(() => {
      setter((prev: number) => {
        if (prev >= 90) { if (intervalRef.current) clearInterval(intervalRef.current); return 90; }
        return prev + Math.random() * 8 + 3;
      });
    }, 400);
  };

  const finishProgress = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>
  ) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setter(100);
    setTimeout(() => setter(0), 800);
  };

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: plan, isLoading, refetch } = trpc.plans.getByIdWithStats.useQuery(
    { id: planId },
    { enabled: !isNaN(planId) }
  );
  const { data: nasList } = trpc.nas.list.useQuery();

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updatePlan = trpc.plans.update.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تحديث الخطة بنجاح" : "Plan updated successfully");
      setIsEditDialogOpen(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const deletePlan = trpc.plans.delete.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حذف الباقة بنجاح" : "Plan deleted successfully");
      navigate("/plans");
    },
    onError: (error) => {
      setIsDeletingOpen(false);
      toast.error(error.message, { duration: 6000 });
    },
  });

  const duplicatePlan = trpc.plans.duplicate.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم نسخ الخطة بنجاح" : "Plan duplicated successfully");
      navigate("/plans");
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

  // @ts-ignore - plansNas is registered in appRouter
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

  // @ts-ignore - plansNas is registered in appRouter
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

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!plan) return;
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
      restrictedNasIds: selectedNasIds.length > 0 ? JSON.stringify(selectedNasIds) : null,
      restrictedNasId: selectedNasIds.length === 1 ? selectedNasIds[0] : undefined,
    };
    updatePlan.mutate({ id: planId, ...data });
  };

  const openEditDialog = () => {
    if (!plan) return;
    setAutoDisconnectState(plan.autoDisconnect || false);
    if (plan.restrictedNasIds) {
      try { setSelectedNasIds(JSON.parse(plan.restrictedNasIds)); } catch { setSelectedNasIds([]); }
    } else if (plan.restrictedNasId) {
      setSelectedNasIds([plan.restrictedNasId]);
    } else {
      setSelectedNasIds([]);
    }
    setIsEditDialogOpen(true);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const userCurrency = (user as any)?.preferredCurrency || "USD";
  const planCurrency = plan?.currency || userCurrency;
  const formatCurrency = (amount: string | number) => formatPrice(amount, planCurrency);

  const planColor = plan ? PLAN_COLORS[plan.id % PLAN_COLORS.length] : PLAN_COLORS[0];

  let nasIds: number[] = [];
  if (plan?.restrictedNasIds) { try { nasIds = JSON.parse(plan.restrictedNasIds); } catch { nasIds = []; } }
  else if (plan?.restrictedNasId) { nasIds = [plan.restrictedNasId]; }
  const nasNames = nasIds.map((nid: number) => {
    const nas = nasList?.find((n: any) => n.id === nid);
    return nas?.shortname || nas?.name || nas?.nasname || `NAS #${nid}`;
  });
  const hasRestriction = nasIds.length > 0;

  const isRtl = direction === "rtl";
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-48" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <XCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium text-muted-foreground">
          {language === "ar" ? "الباقة غير موجودة" : "Plan not found"}
        </p>
        <Button onClick={() => navigate("/plans")} variant="outline">
          <BackIcon className="h-4 w-4 mr-2" />
          {language === "ar" ? "العودة للباقات" : "Back to Plans"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={direction}>
      <InsufficientBalanceModal
        open={showInsufficientBalance}
        onClose={() => setShowInsufficientBalance(false)}
      />

      {/* ── Header ── */}
      <div className="space-y-3">
        {/* Back button */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/plans")}
            className="-ml-2"
          >
            <BackIcon className="h-4 w-4 mr-1" />
            {language === "ar" ? "الباقات" : "Plans"}
          </Button>
        </div>
        {/* Plan identity row */}
        <div className="flex items-start gap-3">
          <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${planColor} flex items-center justify-center shadow-md shrink-0 mt-0.5`}>
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight">
                {language === "ar" && plan.nameAr ? plan.nameAr : plan.name}
              </h1>
              {/* Status badge */}
              <button
                onClick={() => toggleStatus.mutate({ id: planId, status: plan.status === "active" ? "inactive" : "active" })}
                title={plan.status === "active"
                  ? (language === "ar" ? "اضغط لإيقاف" : "Click to deactivate")
                  : (language === "ar" ? "اضغط لتفعيل" : "Click to activate")}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border ${
                  plan.status === "active"
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                    : "bg-slate-50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                {plan.status === "active"
                  ? <><Power className="h-3 w-3" /> {t("common.active")}</>
                  : <><PowerOff className="h-3 w-3" /> {t("common.inactive")}</>
                }
              </button>
            </div>
            {(plan.description || plan.descriptionAr) && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                {language === "ar" && plan.descriptionAr ? plan.descriptionAr : plan.description}
              </p>
            )}
          </div>
          {/* Action buttons - compact on mobile, full on desktop */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={openEditDialog} className="h-8 px-2.5">
              <Edit className="h-3.5 w-3.5" />
              <span className="hidden sm:inline ml-1">{t("common.edit")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => duplicatePlan.mutate({ id: planId })}
              disabled={duplicatePlan.isPending}
              className="h-8 px-2.5 hidden sm:flex"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden md:inline ml-1">{language === "ar" ? "نسخ" : "Dup"}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setIsDeletingOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline ml-1">{t("common.delete")}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={language === "ar" ? "إجمالي الكروت" : "Total Cards"}
          value={plan.totalCards}
          icon={<CreditCard className="h-4 w-4 text-blue-600" />}
          colorClass="bg-blue-50 dark:bg-blue-950/30"
        />
        <StatCard
          label={language === "ar" ? "الكروت النشطة" : "Active Cards"}
          value={plan.activeCards}
          icon={<Activity className="h-4 w-4 text-emerald-600" />}
          colorClass="bg-emerald-50 dark:bg-emerald-950/30"
        />
        <StatCard
          label={language === "ar" ? "الكروت المستخدمة" : "Used Cards"}
          value={plan.usedCards}
          icon={<CheckCircle2 className="h-4 w-4 text-violet-600" />}
          colorClass="bg-violet-50 dark:bg-violet-950/30"
        />
        <StatCard
          label={language === "ar" ? "الكروت المنتهية" : "Expired Cards"}
          value={plan.expiredCards}
          icon={<XCircle className="h-4 w-4 text-rose-600" />}
          colorClass="bg-rose-50 dark:bg-rose-950/30"
        />
      </div>

      {/* ── Plan Details ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Speed & Validity */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {language === "ar" ? "السرعة والصلاحية" : "Speed & Validity"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">{t("plans.download_speed")}</p>
                <p className="font-semibold text-blue-600 dark:text-blue-400">
                  ↓ {formatSpeed(plan.downloadSpeed)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">{t("plans.upload_speed")}</p>
                <p className="font-semibold text-purple-600 dark:text-purple-400">
                  ↑ {formatSpeed(plan.uploadSpeed)}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground mb-1">{t("plans.duration")}</p>
              <p className="font-semibold">
                {plan.validityValue} {formatValidityType(plan.validityType, language)}
              </p>
            </div>
            {plan.dataLimit && (
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">{t("plans.data_limit")}</p>
                <p className="font-semibold text-orange-500">{formatData(plan.dataLimit)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing & Settings */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {language === "ar" ? "السعر والإعدادات" : "Pricing & Settings"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "السعر" : "Price"}</p>
                <p className="font-bold text-primary text-lg">
                  {user?.role === "reseller"
                    ? formatCurrency(plan.resellerPrice)
                    : formatCurrency(plan.price)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">{t("plans.reseller_price")}</p>
                <p className="font-semibold">{formatCurrency(plan.resellerPrice)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "المستخدمون المتزامنون" : "Simultaneous Use"}</p>
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="font-semibold">{plan.simultaneousUse ?? 1}</p>
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "نوع الخدمة" : "Service Type"}</p>
                <Badge variant="outline" className="text-xs">
                  {formatServiceType(plan.serviceType || "all", language)}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "قطع الاتصال التلقائي" : "Auto Disconnect"}</p>
                <Badge variant={plan.autoDisconnect ? "default" : "outline"} className="text-xs">
                  {plan.autoDisconnect ? t("common.active") : t("common.inactive")}
                </Badge>
              </div>
              {(plan.mikrotikAddressPool || plan.poolName) && (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "بولة عناوين MikroTik" : "MikroTik Address Pool"}</p>
                  <p className="font-semibold text-sm">{plan.mikrotikAddressPool || plan.poolName}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── NAS Restriction ── */}
      {hasRestriction && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" />
              {language === "ar" ? "تقييد NAS" : "NAS Restriction"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {nasNames.map((name: string, i: number) => (
                <Badge key={i} variant="outline" className="bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800">
                  {name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Speed Schedule Manager ── */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            {language === "ar" ? "جداول السرعة الزمنية" : "Speed Schedules"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SpeedScheduleManager planId={planId} language={language as "ar" | "en"} />
        </CardContent>
      </Card>

      {/* ── Edit Dialog ── */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => !open && setIsEditDialogOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t("plans.edit_plan")}</DialogTitle>
            <DialogDescription>
              {language === "ar" ? "تعديل بيانات الخطة" : "Edit plan details"}
            </DialogDescription>
          </DialogHeader>
          {plan && (
            <PlanForm
              language={language}
              t={t}
              userCurrency={planCurrency}
              defaultValues={plan}
              onSubmit={handleEditSubmit}
              isPending={updatePlan.isPending}
              onCancel={() => { setIsEditDialogOpen(false); setAutoDisconnectState(false); setSelectedNasIds([]); }}
              isEdit
              autoDisconnectState={autoDisconnectState}
              setAutoDisconnectState={setAutoDisconnectState}
              nasList={nasList || []}
              selectedNasIds={selectedNasIds}
              setSelectedNasIds={setSelectedNasIds}
              planId={planId}
              onApplyRestriction={(pid) => { setIsEditDialogOpen(false); setConfirmApplyPlanId(pid); }}
              onRemoveRestriction={(pid) => { setIsEditDialogOpen(false); setConfirmRemovePlanId(pid); }}
              hasRestriction={hasRestriction}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <AlertDialog open={isDeletingOpen} onOpenChange={setIsDeletingOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "ar" ? "حذف الباقة" : "Delete Plan"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {language === "ar"
                  ? `هل أنت متأكد من حذف الباقة "${plan.name}"؟ لا يمكن التراجع عن هذا الإجراء.`
                  : `Are you sure you want to delete "${plan.name}"? This action cannot be undone.`}
              </span>
              {plan.totalCards > 0 && (
                <span className="block text-destructive text-xs font-semibold">
                  {language === "ar"
                    ? `❌ لا يمكن الحذف: هناك ${plan.totalCards} كرت مرتبطة بهذه الباقة. احذف الكروت أولاً.`
                    : `❌ Cannot delete: ${plan.totalCards} cards are linked to this plan. Delete the cards first.`}
                </span>
              )}
              {plan.totalCards === 0 && (
                <span className="block text-amber-600 dark:text-amber-400 text-xs font-medium">
                  {language === "ar"
                    ? "⚠️ سيتم رفض الحذف إذا كانت هناك كروت مرتبطة بهذه الباقة."
                    : "⚠️ Deletion will be rejected if this plan has linked cards."}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletePlan.mutate({ id: planId })}
              disabled={deletePlan.isPending || plan.totalCards > 0}
            >
              {deletePlan.isPending
                ? (language === "ar" ? "جاري الحذف..." : "Deleting...")
                : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Apply NAS Restriction Confirm ── */}
      <AlertDialog open={!!confirmApplyPlanId} onOpenChange={(open) => !open && setConfirmApplyPlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "ar" ? "تطبيق عزل NAS" : "Apply NAS Restriction"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "ar"
                ? "سيتم تحديث جميع الكروت المرتبطة بهذه الباقة لتقييدها بأجهزة NAS المحددة. هل تريد المتابعة؟"
                : "All cards linked to this plan will be updated to restrict them to the selected NAS devices. Continue?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {applyProgress > 0 && applyProgress < 100 && (
            <div className="w-full bg-muted rounded-full h-2 my-2">
              <div className="bg-violet-500 h-2 rounded-full transition-all" style={{ width: `${applyProgress}%` }} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => confirmApplyPlanId && applyNasRestriction.mutate({ planId: confirmApplyPlanId })}
            >
              {applyNasRestriction.isPending
                ? (language === "ar" ? "جاري التطبيق..." : "Applying...")
                : (language === "ar" ? "نعم، طبّق العزل" : "Yes, Apply Restriction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Remove NAS Restriction Confirm ── */}
      <AlertDialog open={!!confirmRemovePlanId} onOpenChange={(open) => !open && setConfirmRemovePlanId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "ar" ? "إزالة عزل NAS" : "Remove NAS Restriction"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "ar"
                ? "سيتم تحرير جميع الكروت المرتبطة بهذه الباقة من تقييد NAS. هل تريد المتابعة؟"
                : "All cards linked to this plan will be freed from NAS restriction. Continue?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeProgress > 0 && removeProgress < 100 && (
            <div className="w-full bg-muted rounded-full h-2 my-2">
              <div className="bg-destructive h-2 rounded-full transition-all" style={{ width: `${removeProgress}%` }} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmRemovePlanId && removeNasRestriction.mutate({ planId: confirmRemovePlanId })}
            >
              {removeNasRestriction.isPending
                ? (language === "ar" ? "جاري الفصل..." : "Unbinding...")
                : (language === "ar" ? "نعم، فصل الكروت" : "Yes, Unbind Cards")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
