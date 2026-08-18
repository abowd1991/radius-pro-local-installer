import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CreditCard,
  Settings2,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Zap,
  Shield,
  Timer,
  Layers,
  Hash,
  Lock,
  Wifi,
  Users,
  Package,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "../../../shared/currencies";

interface Plan {
  id: number;
  name: string;
  nameAr?: string;
  price: string;
  resellerPrice?: string;
  currency?: string;
  downloadSpeed?: number;
  uploadSpeed?: number;
  validityValue?: number;
  validityType?: string;
}

interface GenerateForm {
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
  authType: "password" | "username-only";
  // سعر البيع والشراء مجمَّد من الباقة وقت الإنشاء
  salePrice?: number;
  purchasePrice?: number;
}

interface GenerateCardsWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: Plan[];
  subscriberGroups: string[];
  isGenerating: boolean;
  generationProgress: number;
  onSubmit: (form: GenerateForm) => void;
  language: string;
  userCurrency?: string;
}

const STEPS = [
  { id: 1, icon: Package, labelAr: "الخدمة والكمية", labelEn: "Service & Quantity" },
  { id: 2, icon: Settings2, labelAr: "إعدادات الكرت", labelEn: "Card Settings" },
  { id: 3, icon: Clock, labelAr: "الوقت والصلاحية", labelEn: "Time & Validity" },
];

export function GenerateCardsWizard({
  open,
  onOpenChange,
  plans,
  subscriberGroups,
  isGenerating,
  generationProgress,
  onSubmit,
  language,
  userCurrency = "USD",
}: GenerateCardsWizardProps) {
  const ar = language === "ar";
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<GenerateForm>({
    quantity: "10",
    batchName: "",
    prefix: "",
    usernameLength: "",
    passwordLength: "4",
    planId: "",
    subscriberGroup: "Default group",
    usageHours: "1",
    usageMinutes: "0",
    windowHours: "24",
    windowMinutes: "0",
    timeFromActivation: true,
    macBinding: false,
    authType: "password",
  });

  const set = (key: keyof GenerateForm, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const selectedPlan = useMemo(
    () => plans?.find((p) => String(p.id) === form.planId),
    [plans, form.planId]
  );

  // Namespace capacity query
  const namespaceLength = parseInt(form.usernameLength) || 0;
  const { data: nsCapacity } = trpc.vouchers.getNamespaceCapacity.useQuery(
    { prefix: form.prefix.trim(), usernameLength: namespaceLength },
    {
      enabled: !!form.prefix.trim() && namespaceLength >= 4,
      refetchOnWindowFocus: false,
    }
  );

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.planId) errs.planId = ar ? "يرجى اختيار الخدمة" : "Please select a plan";
      const qty = parseInt(form.quantity);
      if (!qty || qty < 1 || qty > 5000)
        errs.quantity = ar ? "الكمية بين 1 و 5000" : "Quantity must be 1–5000";
    }
    if (s === 2) {
      if (!form.prefix.trim())
        errs.prefix = ar ? "رقم البداية مطلوب" : "Starting digit is required";
      if (!form.usernameLength)
        errs.usernameLength = ar ? "طول الرقم مطلوب" : "Number length is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, 3));
  };

  const back = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = () => {
    if (!validateStep(step)) return;
    // تحديد salePrice/purchasePrice من الباقة المختارة وقت الإنشاء
    const plan = plans.find((p) => String(p.id) === form.planId);
    const enrichedForm: GenerateForm = {
      ...form,
      salePrice: plan?.price ? parseFloat(plan.price) : undefined,
      purchasePrice: plan?.resellerPrice ? parseFloat(plan.resellerPrice) : undefined,
    };
    onSubmit(enrichedForm);
  };

  const handleClose = () => {
    if (isGenerating) return;
    setStep(1);
    setErrors({});
    setForm({
      quantity: "10",
      batchName: "",
      prefix: "",
      usernameLength: "",
      passwordLength: "4",
      planId: "",
      subscriberGroup: "Default group",
      usageHours: "1",
      usageMinutes: "0",
      windowHours: "24",
      windowMinutes: "0",
      timeFromActivation: true,
      macBinding: false,
      authType: "password",
    });
    onOpenChange(false);
  };

  const totalUsageSecs =
    (parseInt(form.usageHours) || 0) * 3600 +
    (parseInt(form.usageMinutes) || 0) * 60;
  const totalWindowSecs =
    (parseInt(form.windowHours) || 0) * 3600 +
    (parseInt(form.windowMinutes) || 0) * 60;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] p-0 overflow-hidden gap-0 flex flex-col" style={{maxHeight: '90dvh'}}>
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                {ar ? "إنشاء كروت RADIUS" : "Generate RADIUS Cards"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {ar
                  ? "كل كرت = حساب RADIUS حقيقي جاهز للاستخدام"
                  : "Each card = a real RADIUS account ready to use"}
              </p>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-0 mb-0">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isDone = step > s.id;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg transition-all flex-1",
                      isActive && "bg-primary/10",
                      isDone && "opacity-60"
                    )}
                  >
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all",
                        isActive && "bg-primary text-primary-foreground shadow-md shadow-primary/30",
                        isDone && "bg-green-500 text-white",
                        !isActive && !isDone && "bg-muted text-muted-foreground"
                      )}
                    >
                      {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium hidden sm:block",
                        isActive && "text-primary",
                        !isActive && "text-muted-foreground"
                      )}
                    >
                      {ar ? s.labelAr : s.labelEn}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "h-px w-4 shrink-0 transition-all",
                        step > s.id ? "bg-green-500" : "bg-border"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {/* Divider */}
        <div className="h-px bg-border mx-6 mt-4" />

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* ── Step 1: Service & Quantity ── */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Plan selector */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Wifi className="h-3.5 w-3.5 text-primary" />
                  {ar ? "الخدمة" : "Service Plan"}
                  <span className="text-destructive">*</span>
                </Label>
                <Select value={form.planId} onValueChange={(v) => set("planId", v)}>
                  <SelectTrigger
                    className={cn(
                      "h-11",
                      errors.planId && "border-destructive ring-1 ring-destructive"
                    )}
                  >
                    <SelectValue
                      placeholder={ar ? "اختر الخدمة..." : "Select plan..."}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((plan) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{ar && plan.nameAr ? plan.nameAr : plan.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatPrice(plan.price, plan.currency || userCurrency)}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.planId && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {errors.planId}
                  </p>
                )}
              </div>

              {/* Selected plan info card */}
              {selectedPlan && (
                <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">
                      {ar && selectedPlan.nameAr ? selectedPlan.nameAr : selectedPlan.name}
                    </span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {formatPrice(selectedPlan.price, selectedPlan.currency || userCurrency)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {selectedPlan.downloadSpeed && (
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3 text-blue-500" />
                        ↓{selectedPlan.downloadSpeed >= 1000
                          ? `${selectedPlan.downloadSpeed / 1000}M`
                          : `${selectedPlan.downloadSpeed}K`}
                      </span>
                    )}
                    {selectedPlan.uploadSpeed && (
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3 text-green-500" />
                        ↑{selectedPlan.uploadSpeed >= 1000
                          ? `${selectedPlan.uploadSpeed / 1000}M`
                          : `${selectedPlan.uploadSpeed}K`}
                      </span>
                    )}
                    {selectedPlan.validityValue && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-orange-500" />
                        {selectedPlan.validityValue}{" "}
                        {selectedPlan.validityType === "days"
                          ? ar ? "يوم" : "days"
                          : ar ? "ساعة" : "hours"}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Quantity + Batch Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    {ar ? "الكمية" : "Quantity"}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    max="5000"
                    value={form.quantity}
                    onChange={(e) => set("quantity", e.target.value)}
                    className={cn("h-11", errors.quantity && "border-destructive")}
                    placeholder="10"
                  />
                  {errors.quantity && (
                    <p className="text-xs text-destructive">{errors.quantity}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-primary" />
                    {ar ? "اسم الدفعة" : "Batch Name"}
                    <span className="text-xs text-muted-foreground font-normal ms-1">
                      ({ar ? "اختياري" : "optional"})
                    </span>
                  </Label>
                  <Input
                    value={form.batchName}
                    onChange={(e) => set("batchName", e.target.value)}
                    placeholder={ar ? "مثال: يناير 2026" : "e.g., Jan 2026"}
                    className="h-11"
                  />
                </div>
              </div>

              {/* Subscriber Group - hidden: group is auto-assigned from owner (owner_{createdBy}) */}
            </div>
          )}

          {/* ── Step 2: Card Settings ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                {/* Starting Digit */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-primary" />
                    {ar ? "رقم البداية" : "Starting Digit"}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    maxLength={3}
                    placeholder={ar ? "مثال: 6 أو 7" : "e.g., 6 or 7"}
                    value={form.prefix}
                    onChange={(e) => set("prefix", e.target.value)}
                    className={cn("h-11 font-mono", errors.prefix && "border-destructive")}
                  />
                  {errors.prefix && (
                    <p className="text-xs text-destructive">{errors.prefix}</p>
                  )}
                </div>

                {/* Username Length */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-primary" />
                    {ar ? "طول رقم الكرت" : "Card Number Length"}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.usernameLength}
                    onValueChange={(v) => set("usernameLength", v)}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-11",
                        errors.usernameLength && "border-destructive"
                      )}
                    >
                      <SelectValue
                        placeholder={ar ? "اختر الطول" : "Select length"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { n: 6, cap: "900K" },
                        { n: 7, cap: "9M" },
                        { n: 8, cap: "90M" },
                        { n: 9, cap: "900M" },
                      ].map(({ n, cap }) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} {ar ? "أرقام" : "digits"} —{" "}
                          <span className="text-muted-foreground text-xs">
                            {ar ? "حتى" : "up to"} {cap}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.usernameLength && (
                    <p className="text-xs text-destructive">{errors.usernameLength}</p>
                  )}
                </div>
              </div>

              {/* Namespace Capacity Indicator */}
              {nsCapacity && form.prefix.trim() && namespaceLength >= 4 && (
                <div className={`rounded-lg border p-3 space-y-2 ${
                  nsCapacity.percent >= 95
                    ? 'border-destructive/50 bg-destructive/5'
                    : nsCapacity.percent >= 80
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : 'border-border bg-muted/30'
                }`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">
                      {ar ? 'سعة النطاق' : 'Namespace Capacity'}
                    </span>
                    <span className={`font-bold ${
                      nsCapacity.percent >= 95 ? 'text-destructive' :
                      nsCapacity.percent >= 80 ? 'text-amber-500' : 'text-emerald-500'
                    }`}>
                      {nsCapacity.percent}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        nsCapacity.percent >= 95 ? 'bg-destructive' :
                        nsCapacity.percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(nsCapacity.percent, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {ar ? 'المتاح:' : 'Available:'}{' '}
                      <span className="font-semibold text-foreground">
                        {nsCapacity.available.toLocaleString()}
                      </span>
                      {' / '}
                      {nsCapacity.total.toLocaleString()}
                    </span>
                    {nsCapacity.percent >= 80 && (
                      <span className={nsCapacity.percent >= 95 ? 'text-destructive' : 'text-amber-500'}>
                        {nsCapacity.percent >= 95
                          ? (ar ? '⚠ ممتلئ تقريباً' : '⚠ Almost full')
                          : (ar ? '⚠ قارب الامتلاء' : '⚠ Nearly full')}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Auth Type */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  {ar ? "نوع المصادقة" : "Auth Type"}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      {
                        value: "password",
                        labelAr: "رقم + كلمة سر",
                        labelEn: "Username + Password",
                        icon: Lock,
                        desc: ar ? "الأكثر أماناً" : "Most secure",
                      },
                      {
                        value: "username-only",
                        labelAr: "رقم فقط",
                        labelEn: "Username Only",
                        icon: Zap,
                        desc: ar ? "بدون كلمة سر" : "No password",
                      },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = form.authType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set("authType", opt.value)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border-2 text-start transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/40 hover:bg-muted/40"
                        )}
                      >
                        <div
                          className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                            isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {ar ? opt.labelAr : opt.labelEn}
                          </p>
                          <p className="text-xs text-muted-foreground">{opt.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Password Length (only if password auth) */}
              {form.authType === "password" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    {ar ? "طول كلمة السر" : "Password Length"}
                  </Label>
                  <div className="flex gap-2">
                    {[2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => set("passwordLength", String(n))}
                        className={cn(
                          "h-10 w-12 rounded-lg border-2 text-sm font-bold transition-all",
                          form.passwordLength === String(n)
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                    <span className="self-center text-xs text-muted-foreground ms-1">
                      {ar ? "أرقام" : "digits"}
                    </span>
                  </div>
                </div>
              )}

              {/* MAC Binding */}
              <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium cursor-pointer">
                    {ar ? "ربط الماك (MAC Binding)" : "MAC Binding"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {ar
                      ? "ربط الكرت بجهاز واحد فقط"
                      : "Bind card to a single device only"}
                  </p>
                </div>
                <Switch
                  checked={form.macBinding}
                  onCheckedChange={(v) => set("macBinding", v)}
                />
              </div>
            </div>
          )}

          {/* ── Step 3: Time & Validity ── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Time from activation */}
              <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium cursor-pointer">
                    {ar ? "يحسب من تاريخ التفعيل" : "Count from activation date"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {ar
                      ? "الوقت يبدأ من أول استخدام للكرت"
                      : "Time starts from first use of the card"}
                  </p>
                </div>
                <Switch
                  checked={form.timeFromActivation}
                  onCheckedChange={(v) => set("timeFromActivation", v)}
                />
              </div>

              {/* Usage Budget */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5 text-primary" />
                  {ar ? "ميزانية الاستخدام (وقت الجلسة)" : "Usage Budget (Session Time)"}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {ar ? "ساعات" : "Hours"}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.usageHours}
                      onChange={(e) => set("usageHours", e.target.value)}
                      className="h-10 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {ar ? "دقائق" : "Minutes"}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={form.usageMinutes}
                      onChange={(e) => set("usageMinutes", e.target.value)}
                      className="h-10 font-mono"
                    />
                  </div>
                </div>
                {totalUsageSecs > 0 && (
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                    {ar ? "إجمالي:" : "Total:"}{" "}
                    <span className="font-mono font-medium text-foreground">
                      {totalUsageSecs >= 3600
                        ? `${(totalUsageSecs / 3600).toFixed(1)}h`
                        : `${Math.floor(totalUsageSecs / 60)}m`}
                    </span>
                  </p>
                )}
              </div>

              {/* Window */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  {ar ? "نافذة الصلاحية (مدة الكرت)" : "Validity Window (Card Duration)"}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {ar ? "ساعات" : "Hours"}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.windowHours}
                      onChange={(e) => set("windowHours", e.target.value)}
                      className="h-10 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {ar ? "دقائق" : "Minutes"}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={form.windowMinutes}
                      onChange={(e) => set("windowMinutes", e.target.value)}
                      className="h-10 font-mono"
                    />
                  </div>
                </div>
                {totalWindowSecs > 0 && (
                  <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                    {ar ? "إجمالي:" : "Total:"}{" "}
                    <span className="font-mono font-medium text-foreground">
                      {totalWindowSecs >= 86400
                        ? `${(totalWindowSecs / 86400).toFixed(1)}d`
                        : totalWindowSecs >= 3600
                        ? `${(totalWindowSecs / 3600).toFixed(1)}h`
                        : `${Math.floor(totalWindowSecs / 60)}m`}
                    </span>
                  </p>
                )}
              </div>

              {/* Summary Card */}
              <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-4 space-y-3">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                  {ar ? "ملخص الطلب" : "Order Summary"}
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Wifi className="h-3.5 w-3.5" />
                    <span>{ar ? "الخدمة:" : "Plan:"}</span>
                  </div>
                  <span className="font-medium text-end">
                    {selectedPlan
                      ? ar && selectedPlan.nameAr
                        ? selectedPlan.nameAr
                        : selectedPlan.name
                      : "—"}
                  </span>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" />
                    <span>{ar ? "الكمية:" : "Qty:"}</span>
                  </div>
                  <span className="font-medium text-end font-mono">{form.quantity}</span>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Hash className="h-3.5 w-3.5" />
                    <span>{ar ? "تنسيق:" : "Format:"}</span>
                  </div>
                  <span className="font-medium text-end font-mono">
                    {form.prefix || "—"}
                    {"×".repeat(
                      Math.max(0, parseInt(form.usernameLength || "0") - (form.prefix?.length || 0))
                    )}
                    {form.usernameLength ? ` (${form.usernameLength}d)` : ""}
                  </span>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="h-3.5 w-3.5" />
                    <span>{ar ? "المصادقة:" : "Auth:"}</span>
                  </div>
                  <span className="font-medium text-end">
                    {form.authType === "password"
                      ? ar
                        ? "رقم + سر"
                        : "User+Pass"
                      : ar
                      ? "رقم فقط"
                      : "User only"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {isGenerating && (
          <div className="px-6 pb-2 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{ar ? "جاري إنشاء الكروت..." : "Generating cards..."}</span>
              <span className="font-mono">{Math.round(generationProgress)}%</span>
            </div>
            <Progress value={generationProgress} className="h-1.5" />
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-border mx-6" />

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between shrink-0 border-t bg-background">
          <Button
            variant="ghost"
            size="sm"
            onClick={step === 1 ? handleClose : back}
            disabled={isGenerating}
            className="gap-1.5"
          >
            {step > 1 && <ChevronLeft className="h-4 w-4" />}
            {step === 1
              ? ar
                ? "إلغاء"
                : "Cancel"
              : ar
              ? "السابق"
              : "Back"}
          </Button>

          <div className="flex items-center gap-2">
            {/* Step dots */}
            <div className="flex gap-1.5 me-3">
              {STEPS.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    step === s.id
                      ? "w-5 bg-primary"
                      : step > s.id
                      ? "w-1.5 bg-green-500"
                      : "w-1.5 bg-border"
                  )}
                />
              ))}
            </div>

            {step < 3 ? (
              <Button size="sm" onClick={next} className="gap-1.5 px-5">
                {ar ? "التالي" : "Next"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isGenerating}
                className="gap-1.5 px-6 bg-primary hover:bg-primary/90"
              >
                {isGenerating ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />
                    {ar ? "جاري الإنشاء..." : "Generating..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {ar ? "إنشاء الكروت" : "Generate Cards"}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
