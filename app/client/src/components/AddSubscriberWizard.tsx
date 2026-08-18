/**
 * AddSubscriberWizard
 * Wizard ثلاثي الخطوات لإضافة مشترك PPPoE جديد
 * الخطوة 1: البيانات الشخصية (يوزر، باسورد، اسم، هاتف، عنوان، ملاحظات)
 * الخطوة 2: إعدادات الخدمة (باقة، نوع IP، متزامن، مدة الاشتراك)
 * الخطوة 3: الدفع + ملخص + نسخ بيانات الاتصال
 */

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { formatDateTime, parseDateTimeLocal, todayLocalDate } from "@/lib/timezoneV6";
import {
  User, Lock, Phone, MapPin, FileText, Wifi, Network,
  Users, Calendar, CreditCard, CheckCircle2, XCircle, Copy, ChevronRight,
  ChevronLeft, Loader2, Eye, EyeOff,
} from "lucide-react";

interface AddSubscriberWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const STEPS = [
  { id: 1, label: "البيانات الشخصية", icon: User },
  { id: 2, label: "إعدادات الخدمة", icon: Wifi },
  { id: 3, label: "الدفع والتأكيد", icon: CreditCard },
];

const defaultForm = {
  // Step 1
  username: "",
  password: "",
  fullName: "",
  phone: "",
  address: "",
  notes: "",
  // Step 2
  planId: 0,
  ipAssignmentType: "dynamic" as "dynamic" | "static",
  staticIp: "",
  simultaneousUse: 1,
  subscriptionMonths: 1,
  useCustomDate: false,
  customEndDate: "",
  customEndTime: "23:59",
  // Step 3
  amount: 0,
  paymentMethod: "cash" as "cash" | "wallet" | "card" | "bank_transfer" | "online",
};

export function AddSubscriberWizard({ open, onOpenChange, onSuccess }: AddSubscriberWizardProps) {
  const { timezone } = useTimezoneV6();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(defaultForm);
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState<{ username: string; password: string; expiresAt?: string } | null>(null);
  const [debouncedUsername, setDebouncedUsername] = useState("");

  // Debounce username input for availability check
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUsername(form.username);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.username]);

  const { data: usernameCheck, isFetching: checkingUsername } = trpc.subscribers.checkUsername.useQuery(
    { username: debouncedUsername },
    { enabled: debouncedUsername.length >= 2 }
  );

  const { data: plansRaw } = trpc.plans.list.useQuery();
  const plansData: any[] = Array.isArray(plansRaw) ? plansRaw : ((plansRaw as any)?.plans ?? []);

  const selectedPlan = plansData.find((p: any) => p.id === form.planId);

  // حساب عدد الأشهر من التاريخ المحدد
  const getCustomEndDateTime = (): Date | null => {
    if (!form.customEndDate) return null;
    return parseDateTimeLocal(`${form.customEndDate}T${form.customEndTime || "23:59"}`, timezone);
  };

  const computedMonths = (): number => {
    if (!form.useCustomDate || !form.customEndDate) return form.subscriptionMonths;
    const end = getCustomEndDateTime()!;
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    const diffMonths = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30)));
    return diffMonths;
  };

  const createMutation = trpc.subscribers.create.useMutation({
    onSuccess: (data: any) => {
      // حساب تاريخ الانتهاء
      let expiresAtStr = "";
      if (form.useCustomDate && form.customEndDate) {
        const d = getCustomEndDateTime()!;
        expiresAtStr = formatDateTime(d, timezone);
      } else {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + form.subscriptionMonths);
        expiresAtStr = `${endDate.getDate()}/${endDate.getMonth() + 1}/${endDate.getFullYear()}`;
      }
      setResult({
        username: form.username,
        password: form.password,
        expiresAt: expiresAtStr,
      });
      setStep(4); // خطوة النجاح
      onSuccess();
    },
    onError: (error) => {
      const msg = error.message || "";
      const code = (error as any)?.data?.code || "";
      if (code === "CONFLICT" || msg.includes("موجود مسبقاً") || msg.includes("already")) {
        toast.error("⚠️ اسم المستخدم مستخدم في مكان آخر، يرجى اختيار اسم مختلف", { duration: 6000 });
      } else if (msg.includes("balance") || msg.includes("past_due")) {
        toast.error("💳 رصيدك غير كافٍ، يرجى شحن الرصيد أولاً", { duration: 6000 });
      } else {
        toast.error("❌ حدث خطأ أثناء إنشاء المشترك، يرجى المحاولة مرة أخرى", { duration: 6000 });
      }
    },
  });

  const reset = () => {
    setStep(1);
    setForm(defaultForm);
    setResult(null);
    setShowPassword(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // التحقق من صحة كل خطوة
  const validateStep1 = () => {
    if (!form.username.trim()) { toast.error("اسم المستخدم مطلوب"); return false; }
    if (form.username.length < 2) { toast.error("اسم المستخدم يجب أن يكون حرفين على الأقل"); return false; }
    if (!form.password.trim()) { toast.error("كلمة المرور مطلوبة"); return false; }
    if (form.password.length < 2) { toast.error("كلمة المرور يجب أن تكون حرفين على الأقل"); return false; }
    if (!form.fullName.trim()) { toast.error("الاسم الكامل مطلوب"); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!form.planId) { toast.error("يرجى اختيار الباقة"); return false; }
    if (form.ipAssignmentType === "static" && !form.staticIp.trim()) {
      toast.error("يرجى إدخال IP الثابت"); return false;
    }
    if (form.useCustomDate && !form.customEndDate) {
      toast.error("يرجى اختيار تاريخ الانتهاء"); return false;
    }
    if (form.useCustomDate && form.customEndDate) {
      const endDt = getCustomEndDateTime();
      if (endDt && endDt <= new Date()) {
        toast.error("تاريخ ووقت الانتهاء يجب أن يكون في المستقبل"); return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3) {
      // إرسال
      createMutation.mutate({
        username: form.username,
        password: form.password,
        fullName: form.fullName,
        phone: form.phone || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
        planId: form.planId,
        ipAssignmentType: form.ipAssignmentType,
        staticIp: form.staticIp || undefined,
        simultaneousUse: form.simultaneousUse,
        subscriptionMonths: computedMonths(),
        subscriptionEndDate: (form.useCustomDate && form.customEndDate)
          ? (() => { const d = getCustomEndDateTime(); return d ? d.toISOString() : undefined; })()
          : undefined,
        amount: form.amount,
        paymentMethod: form.paymentMethod,
      });
      return;
    }
    setStep(s => s + 1);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`تم نسخ ${label}`));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">
            {step === 4 ? "تم إنشاء المشترك بنجاح" : "إضافة مشترك PPPoE جديد"}
          </DialogTitle>
        </DialogHeader>

        {/* شريط التقدم */}
        {step < 4 && (
          <div className="flex items-center gap-1 mb-2">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const isActive = s.id === step;
              const isDone = s.id < step;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors flex-1 justify-center
                    ${isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{s.label}</span>
                    <span className="sm:hidden">{s.id}</span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`h-px w-3 mx-0.5 ${isDone ? "bg-green-500" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── الخطوة 1: البيانات الشخصية ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  اسم المستخدم *
                </Label>
                <div className="relative">
                  <Input
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                    placeholder="user001"
                    dir="ltr"
                    autoFocus
                    className={form.username.length >= 2 && !checkingUsername
                      ? usernameCheck?.available
                        ? "border-green-500 pr-8"
                        : "border-red-500 pr-8"
                      : ""}
                  />
                  {form.username.length >= 2 && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      {checkingUsername
                        ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        : usernameCheck?.available
                          ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                          : <XCircle className="h-4 w-4 text-red-500" />}
                    </span>
                  )}
                </div>
                {form.username.length >= 2 && !checkingUsername && usernameCheck && (
                  <p className={`text-xs mt-0.5 ${usernameCheck.available ? 'text-green-500' : 'text-red-500'}`}>
                    {usernameCheck.available ? '✓ اسم المستخدم متاح' : '✗ اسم المستخدم مستخدم مسبقاً'}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  كلمة المرور *
                </Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••"
                    dir="ltr"
                    className="pl-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                الاسم الكامل *
              </Label>
              <Input
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
                placeholder="محمد أحمد"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                رقم الهاتف
              </Label>
              <Input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="05xxxxxxxx"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                العنوان
              </Label>
              <Input
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="المنطقة، الشارع..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                ملاحظات
              </Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="أي ملاحظات إضافية..."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
        )}

        {/* ── الخطوة 2: إعدادات الخدمة ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                الباقة *
              </Label>
              <Select
                value={form.planId ? String(form.planId) : ""}
                onValueChange={v => {
                  const plan = plansData.find((p: any) => p.id === Number(v));
                  setForm({
                    ...form,
                    planId: Number(v),
                    amount: plan ? Number(plan.price) : form.amount,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الباقة" />
                </SelectTrigger>
                <SelectContent>
                  {plansData.map((plan: any) => (
                    <SelectItem key={plan.id} value={String(plan.id)}>
                      <div className="flex items-center gap-2">
                        <span>{plan.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {plan.downloadSpeed >= 1000
                            ? `${Math.round(plan.downloadSpeed / 1000)}/${Math.round(plan.uploadSpeed / 1000)} Mbps`
                            : `${plan.downloadSpeed}/${plan.uploadSpeed} Kbps`}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPlan && (
                <div className="flex gap-2 flex-wrap mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {selectedPlan.downloadSpeed >= 1000
                      ? `↓ ${Math.round(selectedPlan.downloadSpeed / 1000)} Mbps`
                      : `↓ ${selectedPlan.downloadSpeed} Kbps`}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {selectedPlan.uploadSpeed >= 1000
                      ? `↑ ${Math.round(selectedPlan.uploadSpeed / 1000)} Mbps`
                      : `↑ ${selectedPlan.uploadSpeed} Kbps`}
                  </Badge>
                  {selectedPlan.price && (
                    <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">
                      {selectedPlan.price} ₪/شهر
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Network className="h-3.5 w-3.5 text-muted-foreground" />
                نوع الـ IP
              </Label>
              <Select
                value={form.ipAssignmentType}
                onValueChange={(v: any) => setForm({ ...form, ipAssignmentType: v, staticIp: "" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dynamic">ديناميكي (من Pool)</SelectItem>
                  <SelectItem value="static">ثابت (Static IP)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.ipAssignmentType === "static" && (
              <div className="space-y-1.5">
                <Label className="text-sm">IP الثابت</Label>
                <Input
                  value={form.staticIp}
                  onChange={e => setForm({ ...form, staticIp: e.target.value })}
                  placeholder="192.168.1.100"
                  dir="ltr"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                عدد الاتصالات المتزامنة
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0"
                  onClick={() => setForm({ ...form, simultaneousUse: Math.max(1, form.simultaneousUse - 1) })}
                >-</Button>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.simultaneousUse}
                  onChange={e => setForm({ ...form, simultaneousUse: Math.max(1, Math.min(10, Number(e.target.value))) })}
                  className="text-center w-16"
                  dir="ltr"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0"
                  onClick={() => setForm({ ...form, simultaneousUse: Math.min(10, form.simultaneousUse + 1) })}
                >+</Button>
                <span className="text-sm text-muted-foreground">جهاز في نفس الوقت</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                مدة الاشتراك
              </Label>
              <Select
                value={form.useCustomDate ? "custom" : String(form.subscriptionMonths)}
                onValueChange={v => {
                  if (v === "custom") {
                    setForm({ ...form, useCustomDate: true, customEndDate: "" });
                  } else {
                    setForm({ ...form, useCustomDate: false, subscriptionMonths: Number(v) });
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">شهر واحد</SelectItem>
                  <SelectItem value="2">شهران</SelectItem>
                  <SelectItem value="3">3 أشهر</SelectItem>
                  <SelectItem value="6">6 أشهر</SelectItem>
                  <SelectItem value="12">سنة كاملة</SelectItem>
                  <SelectItem value="custom">📅 تاريخ محدد</SelectItem>
                </SelectContent>
              </Select>
              {form.useCustomDate && (
                <div className="mt-2 space-y-2">
                  <Label className="text-xs text-muted-foreground mb-1 block">اختر تاريخ ووقت الانتهاء</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={form.customEndDate}
                      min={todayLocalDate(timezone, new Date(Date.now() + 86400000))}
                      onChange={e => setForm({ ...form, customEndDate: e.target.value })}
                      dir="ltr"
                      className="text-sm flex-1"
                    />
                    <Input
                      type="time"
                      value={form.customEndTime}
                      onChange={e => setForm({ ...form, customEndTime: e.target.value })}
                      dir="ltr"
                      className="text-sm w-28"
                    />
                  </div>
                  {form.customEndDate && (
                    <p className="text-xs text-green-400">
                      ✓ ينتهي في: {getCustomEndDateTime()?.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })}
                      {' '}الساعة {form.customEndTime}
                      {' '}({computedMonths()} شهر تقريباً)
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── الخطوة 3: الدفع والتأكيد ── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* ملخص */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
              <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide mb-2">ملخص الاشتراك</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المستخدم</span>
                <span className="font-mono font-medium" dir="ltr">{form.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الاسم</span>
                <span>{form.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الباقة</span>
                <span>{selectedPlan?.name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المدة</span>
                <span>
                  {form.useCustomDate && form.customEndDate
                    ? `حتى ${getCustomEndDateTime()?.toLocaleDateString('ar-SA')} ${form.customEndTime}`
                    : `${form.subscriptionMonths} ${form.subscriptionMonths === 1 ? 'شهر' : 'أشهر'}`
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الاتصالات المتزامنة</span>
                <span>{form.simultaneousUse} جهاز</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">نوع IP</span>
                <span>{form.ipAssignmentType === "dynamic" ? "ديناميكي" : `ثابت: ${form.staticIp}`}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                المبلغ المدفوع
              </Label>
              <Input
                type="number"
                min={0}
                value={form.amount}
                onChange={e => setForm({ ...form, amount: Number(e.target.value) })}
                dir="ltr"
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">طريقة الدفع</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v: any) => setForm({ ...form, paymentMethod: v })}
              >
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
          </div>
        )}

        {/* ── خطوة النجاح ── */}
        {step === 4 && result && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="h-14 w-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <p className="text-center text-muted-foreground text-sm">
                تم إنشاء حساب PPPoE بنجاح وتفعيله في RADIUS
              </p>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">بيانات الاتصال</p>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">اسم المستخدم</p>
                  <p className="font-mono font-semibold text-sm" dir="ltr">{result.username}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => copyToClipboard(result.username, "اسم المستخدم")}
                >
                  <Copy className="h-3.5 w-3.5" />
                  نسخ
                </Button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">كلمة المرور</p>
                  <p className="font-mono font-semibold text-sm" dir="ltr">{result.password}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => copyToClipboard(result.password, "كلمة المرور")}
                >
                  <Copy className="h-3.5 w-3.5" />
                  نسخ
                </Button>
              </div>

              {result.expiresAt && (
                <div className="pt-1 border-t">
                  <p className="text-xs text-muted-foreground">تاريخ انتهاء الاشتراك</p>
                  <p className="font-semibold text-sm text-orange-400">{result.expiresAt}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* أزرار التنقل */}
        <div className="flex justify-between gap-2 pt-2 border-t">
          {step === 4 ? (
            <Button onClick={handleClose} className="w-full">
              إغلاق
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => step === 1 ? handleClose() : setStep(s => s - 1)}
                disabled={createMutation.isPending}
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                {step === 1 ? "إلغاء" : "السابق"}
              </Button>
              <Button
                onClick={handleNext}
                disabled={createMutation.isPending}
                className="gap-1.5"
              >
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> جاري الإنشاء...</>
                ) : step === 3 ? (
                  <><CheckCircle2 className="h-4 w-4" /> إنشاء المشترك</>
                ) : (
                  <>التالي <ChevronLeft className="h-4 w-4" /></>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
