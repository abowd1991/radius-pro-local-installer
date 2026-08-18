import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { dateTimeLocalToUtcIso, formatDateTimeLocal, nowDateTimeLocal } from "@/lib/timezoneV6";
import {
  RefreshCw,
  Eye,
  EyeOff,
  User,
  Lock,
  Calendar,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface CreateManualCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Generate random alphanumeric password
function generateRandomPassword(length: number = 8): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate random numeric username
function generateRandomUsername(length: number = 6): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

const EXPIRY_OPTIONS = [
  { value: "from_activation", labelAr: "من أول استخدام", labelEn: "From first use" },
  { value: "1week", labelAr: "أسبوع واحد", labelEn: "1 Week" },
  { value: "2weeks", labelAr: "أسبوعان", labelEn: "2 Weeks" },
  { value: "1month", labelAr: "شهر واحد", labelEn: "1 Month" },
  { value: "3months", labelAr: "3 أشهر", labelEn: "3 Months" },
  { value: "custom", labelAr: "تاريخ مخصص", labelEn: "Custom Date" },
];

const WINDOW_OPTIONS = [
  { value: "0", labelAr: "بدون حد", labelEn: "No limit" },
  { value: "86400", labelAr: "يوم واحد", labelEn: "1 Day" },
  { value: "259200", labelAr: "3 أيام", labelEn: "3 Days" },
  { value: "604800", labelAr: "أسبوع", labelEn: "1 Week" },
  { value: "1209600", labelAr: "أسبوعان", labelEn: "2 Weeks" },
  { value: "2592000", labelAr: "شهر", labelEn: "1 Month" },
  { value: "7776000", labelAr: "3 أشهر", labelEn: "3 Months" },
];

export function CreateManualCardDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateManualCardDialogProps) {
  const { language, direction } = useLanguage();
  const { timezone } = useTimezoneV6();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    username: "",
    password: "",
    planId: "",
    expiryType: "1month" as "1week" | "2weeks" | "1month" | "3months" | "custom" | "from_activation",
    expiryDate: "",
    notes: "",
    usageBudgetHours: "0",
    usageBudgetMinutes: "0",
    windowSeconds: "0",
    macAddress: "",
  });

  const [debouncedUsername, setDebouncedUsername] = useState("");

  // Debounce username for availability check
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUsername(form.username.trim());
    }, 500);
    return () => clearTimeout(timer);
  }, [form.username]);

  const { data: usernameCheck, isFetching: checkingUsername } = trpc.subscribers.checkUsername.useQuery(
    { username: debouncedUsername },
    { enabled: debouncedUsername.length >= 2 }
  );

  const { data: plans } = trpc.plans.list.useQuery();

  const createMutation = trpc.vouchers.createManualCard.useMutation({
    onSuccess: (data) => {
      const isUsernameOnly = !data.password;
      toast.success(
        language === "ar"
          ? `تم إنشاء الكرت بنجاح: ${data.username}${isUsernameOnly ? ' (مصادقة بالاسم فقط)' : ''}`
          : `Card created: ${data.username}${isUsernameOnly ? ' (username-only auth)' : ''}`,
        { duration: 5000 }
      );
      onSuccess?.();
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      const msg = error.message || "";
      const code = (error as any)?.data?.code || (error as any)?.data?.httpStatus === 409 ? "CONFLICT" : ((error as any)?.data?.code || "");
      const isConflict = code === "CONFLICT" || msg.includes("موجود مسبقاً") || msg.includes("already taken") || msg.includes("already exists") || msg.includes("مستخدم");

      if (isConflict) {
        toast.error(
          language === "ar"
            ? "⚠️ اسم المستخدم مستخدم في مكان آخر، يرجى اختيار اسم مستخدم مختلف"
            : "⚠️ Username is already taken, please choose a different one",
          { duration: 6000 }
        );
      } else if (msg.includes("insufficient balance") || msg.includes("past_due") || code === "PAYMENT_REQUIRED") {
        toast.error(
          language === "ar"
            ? "💳 رصيدك غير كافٍ لإنشاء كروت، يرجى شحن الرصيد أولاً"
            : "💳 Insufficient balance to create cards, please top up first",
          { duration: 6000 }
        );
      } else if (code === "FORBIDDEN" || msg.includes("غير مصرح") || msg.includes("forbidden")) {
        toast.error(
          language === "ar"
            ? "🚫 ليس لديك صلاحية لإنشاء كروت"
            : "🚫 You don't have permission to create cards",
          { duration: 6000 }
        );
      } else if (code === "NOT_FOUND" || msg.includes("الخطة") || msg.includes("plan")) {
        toast.error(
          language === "ar"
            ? "❌ الخدمة المحددة غير موجودة، يرجى اختيار خدمة أخرى"
            : "❌ Selected plan not found, please choose another",
          { duration: 6000 }
        );
      } else if (code === "BAD_REQUEST" || msg.includes("invalid") || msg.includes("غير صالح")) {
        toast.error(
          language === "ar"
            ? "❌ البيانات المدخلة غير صحيحة، يرجى مراجعة الحقول"
            : "❌ Invalid input, please check the fields",
          { duration: 6000 }
        );
      } else {
        toast.error(
          language === "ar"
            ? "❌ فشل إنشاء الكرت، يرجى المحاولة مرة أخرى"
            : "❌ Failed to create card, please try again",
          { duration: 6000 }
        );
      }
    },
  });

  const resetForm = () => {
    setForm({
      fullName: "",
      phone: "",
      username: "",
      password: "",
      planId: "",
      expiryType: "1month",
      expiryDate: "",
      notes: "",
      usageBudgetHours: "0",
      usageBudgetMinutes: "0",
      windowSeconds: "0",
      macAddress: "",
    });
    setShowPassword(false);
  };

  const handleSubmit = () => {
    if (!form.username.trim()) {
      toast.error(language === "ar" ? "يرجى إدخال اسم المستخدم" : "Please enter username");
      return;
    }
    if (!form.phone.trim()) {
      toast.error(language === "ar" ? "يرجى إدخال رقم الجوال" : "Please enter phone number");
      return;
    }
    if (!form.planId) {
      toast.error(language === "ar" ? "يرجى اختيار الخدمة" : "Please select a plan");
      return;
    }
    if (form.expiryType === "custom" && !form.expiryDate) {
      toast.error(language === "ar" ? "يرجى تحديد تاريخ الانتهاء" : "Please select expiry date");
      return;
    }

    const usageBudgetSeconds =
      (parseInt(form.usageBudgetHours) || 0) * 3600 +
      (parseInt(form.usageBudgetMinutes) || 0) * 60;

    const windowSecs = parseInt(form.windowSeconds) || 0;

    const expiryDate = form.expiryType === "custom" ? dateTimeLocalToUtcIso(form.expiryDate, timezone) : undefined;
    if (form.expiryType === "custom" && !expiryDate) {
      toast.error(language === "ar" ? "تاريخ الانتهاء غير صالح في المنطقة الزمنية المحددة" : "Expiry date is invalid in the selected timezone");
      return;
    }

    createMutation.mutate({
      username: form.username.trim(),
      password: form.password.trim(),
      planId: parseInt(form.planId),
      expiryType: form.expiryType,
      expiryDate,
      fullName: form.fullName.trim() || undefined,
      phone: form.phone.trim(),
      notes: form.notes.trim() || undefined,
      // The plan is the authoritative source for per-card concurrency.
      simultaneousUse: Number(selectedPlan?.simultaneousUse ?? 1),
      usageBudgetSeconds,
      windowSeconds: windowSecs > 0 ? windowSecs : undefined,
      macAddress: form.macAddress.trim() || undefined,
    });
  };

  const selectedPlan = plans?.find((p: any) => String(p.id) === form.planId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        dir={direction}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
            {language === "ar" ? "إنشاء كرت يدوي" : "Create Manual Card"}
          </DialogTitle>
          <DialogDescription>
            {language === "ar"
              ? "إنشاء كرت RADIUS واحد بيانات مخصصة. سيُضاف تلقائياً لدفعة \"يدوي\"."
              : 'Create a single RADIUS card with custom credentials. Will be added to "Manual" batch.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Full Name Section */}
          <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              {language === "ar" ? "معلومات العميل" : "Customer Info"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {language === "ar" ? "الاسم الكامل" : "Full Name"}
                  <span className="text-muted-foreground text-xs ms-1">({language === "ar" ? "اختياري" : "optional"})</span>
                </Label>
                <Input
                  placeholder={language === "ar" ? "مثال: أحمد محمد" : "e.g., John Smith"}
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, fullName: e.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {language === "ar" ? "رقم الجوال" : "Phone Number"}
                  <span className="text-destructive text-xs ms-1">*</span>
                </Label>
                <Input
                  placeholder={language === "ar" ? "مثال: 0501234567" : "e.g., +1234567890"}
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="h-11"
                  type="tel"
                  dir="ltr"
                  required
                />
              </div>
            </div>
          </div>

          {/* Credentials Section */}
          <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" />
              {language === "ar" ? "بيانات الدخول" : "Credentials"}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Username */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {language === "ar" ? "اسم المستخدم" : "Username"}
                  <span className="text-destructive ms-1">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder={language === "ar" ? "مثال: ahmed" : "e.g., ahmed"}
                      value={form.username}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, username: e.target.value }))
                      }
                      className={`h-11 font-mono pr-8 ${
                        form.username.trim().length >= 2 && !checkingUsername
                          ? usernameCheck?.available
                            ? "border-green-500"
                            : "border-red-500"
                          : ""
                      }`}
                      dir="ltr"
                    />
                    {form.username.trim().length >= 2 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2">
                        {checkingUsername
                          ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          : usernameCheck?.available
                            ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                            : <XCircle className="h-4 w-4 text-red-500" />}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        username: generateRandomUsername(6),
                      }))
                    }
                    className="h-11 w-11 shrink-0 flex items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title={language === "ar" ? "توليد تلقائي" : "Auto-generate"}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
                {form.username.trim().length >= 2 && !checkingUsername && usernameCheck && (
                  <p className={`text-xs mt-1 ${usernameCheck.available ? 'text-green-500' : 'text-red-500'}`}>
                    {usernameCheck.available
                      ? (language === "ar" ? '✓ اسم المستخدم متاح' : '✓ Username available')
                      : (language === "ar" ? '✗ اسم المستخدم مستخدم مسبقاً' : '✗ Username already taken')}
                  </p>
                )}
              </div>

              {/* Password (optional) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {language === "ar" ? "كلمة المرور" : "Password"}
                  <span className="text-muted-foreground text-xs ms-1">({language === "ar" ? "اختياري" : "optional"})</span>
                </Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder={language === "ar" ? "اتركه فارغاً = مصادقة بالاسم فقط" : "Leave empty = username-only auth"}
                      value={form.password}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, password: e.target.value }))
                      }
                      className="h-11 font-mono pr-10"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        password: generateRandomPassword(8),
                      }))
                    }
                    className="h-11 w-11 shrink-0 flex items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title={language === "ar" ? "توليد تلقائي" : "Auto-generate"}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Plan & Expiry Section */}
          <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" />
              {language === "ar" ? "الخدمة والصلاحية" : "Plan & Validity"}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Plan */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {language === "ar" ? "الخدمة / الباقة" : "Plan"}
                  <span className="text-destructive ms-1">*</span>
                </Label>
                <Select
                  value={form.planId}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, planId: v }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue
                      placeholder={
                        language === "ar" ? "اختر الخدمة..." : "Select plan..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((plan: any) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        <div className="flex items-center gap-2">
                          <span>{plan.nameAr || plan.name}</span>
                          {plan.price && (
                            <Badge variant="outline" className="text-xs">
                              {plan.price}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPlan && (
                  <p className="text-xs text-muted-foreground">
                    {selectedPlan.downloadSpeed
                      ? `↓ ${Math.round(selectedPlan.downloadSpeed / 1000)} Mbps`
                      : ""}{" "}
                    {selectedPlan.uploadSpeed
                      ? `↑ ${Math.round(selectedPlan.uploadSpeed / 1000)} Mbps`
                      : ""}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {language === "ar" ? "الأجهزة المتزامنة" : "Simultaneous Devices"}
                </Label>
                <div className="h-11 rounded-md border border-input bg-muted/40 px-3 flex items-center text-sm text-muted-foreground">
                  {selectedPlan
                    ? `${selectedPlan.simultaneousUse ?? 1} ${language === "ar" ? "من الباقة المختارة" : "from selected plan"}`
                    : (language === "ar" ? "اختر الباقة أولاً" : "Select a plan first")}
                </div>
              </div>
            </div>

            {/* Expiry */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {language === "ar" ? "مدة الصلاحية" : "Validity Period"}
                <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        expiryType: opt.value as any,
                      }))
                    }
                    className={`relative px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      form.expiryType === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 text-foreground"
                    }`}
                  >
                    {form.expiryType === opt.value && (
                      <CheckCircle2 className="absolute top-1 end-1 h-3 w-3 text-primary" />
                    )}
                    {language === "ar" ? opt.labelAr : opt.labelEn}
                  </button>
                ))}
              </div>
              {form.expiryType === "custom" && (
                <Input
                  type="datetime-local"
                  value={form.expiryDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, expiryDate: e.target.value }))
                  }
                  className="h-11 mt-2"
                  min={nowDateTimeLocal(timezone)}
                  defaultValue={formatDateTimeLocal(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), timezone)}
                />
              )}

              {/* Window: مدة الصلاحية بعد أول استخدام */}
              {form.expiryType === "from_activation" && (
                <div className="mt-3 space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {language === "ar" ? "مدة الصلاحية بعد أول استخدام" : "Validity after first use"}
                  </Label>
                  <div className="grid grid-cols-4 gap-2">
                    {WINDOW_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, windowSeconds: opt.value }))}
                        className={`relative px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                          form.windowSeconds === opt.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 text-foreground"
                        }`}
                      >
                        {form.windowSeconds === opt.value && (
                          <CheckCircle2 className="absolute top-0.5 end-0.5 h-2.5 w-2.5 text-primary" />
                        )}
                        {language === "ar" ? opt.labelAr : opt.labelEn}
                      </button>
                    ))}
                  </div>
                  {form.windowSeconds !== "0" && (
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const opt = WINDOW_OPTIONS.find(o => o.value === form.windowSeconds);
                        const label = language === 'ar' ? opt?.labelAr : opt?.labelEn;
                        return language === "ar"
                          ? `سيُحسب تاريخ الانتهاء تلقائياً عند أول دخول + ${label}`
                          : `Expiry will be calculated automatically at first login + ${label}`;
                      })()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Usage Budget Section */}
          <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {language === "ar"
                ? "ميزانية الاستخدام (اختياري)"
                : "Usage Budget (Optional)"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {language === "ar"
                ? "حدد الحد الأقصى لوقت الاستخدام الفعلي (0 = بدون حد)"
                : "Set maximum actual usage time (0 = unlimited)"}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">
                  {language === "ar" ? "ساعات" : "Hours"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={form.usageBudgetHours}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      usageBudgetHours: e.target.value,
                    }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">
                  {language === "ar" ? "دقائق" : "Minutes"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={form.usageBudgetMinutes}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      usageBudgetMinutes: e.target.value,
                    }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </div>

          {/* MAC Address Binding */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              {language === "ar" ? "ربط MAC Address" : "MAC Address Binding"}
              <span className="text-muted-foreground text-xs">({language === "ar" ? "اختياري" : "optional"})</span>
            </Label>
            <Input
              placeholder="AA:BB:CC:DD:EE:FF"
              value={form.macAddress}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9A-Fa-f:]/g, "").toUpperCase();
                setForm((prev) => ({ ...prev, macAddress: val }));
              }}
              maxLength={17}
              className="font-mono h-11"
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
              {language === "ar" ? "ملاحظات (اختياري)" : "Notes (Optional)"}
            </Label>
            <Textarea
              placeholder={
                language === "ar"
                  ? "أي ملاحظات إضافية عن هذا الكرت..."
                  : "Any additional notes about this card..."
              }
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
          >
            {language === "ar" ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white border-0 min-w-[120px]"
          >
            {createMutation.isPending ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {language === "ar" ? "جاري الإنشاء..." : "Creating..."}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {language === "ar" ? "إنشاء الكرت" : "Create Card"}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
