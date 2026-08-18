import { useState, useMemo } from "react";
import { parseDbDate } from '@/lib/dateFormat';
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { isValidSmsCardPrefix } from "../../../shared/smsCardPrefix";
import {
  Send, UserPlus, Trash2, Clock, CheckCircle, XCircle, Loader2,
  MessageSquare, CreditCard, ChevronRight, ChevronLeft, Settings,
  Phone, User, AlertCircle, Wifi, Timer, Shield
} from "lucide-react";

// ── Wizard Steps ──────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "الباقة والكمية", icon: CreditCard },
  { id: 2, label: "إعدادات الكرت", icon: Settings },
  { id: 3, label: "الوقت والصلاحية", icon: Timer },
  { id: 4, label: "المستلم والإرسال", icon: Phone },
];

function fmtSecs(s: number): string {
  if (s <= 0) return "—";
  if (s >= 86400) return `${(s / 86400).toFixed(1)} يوم`;
  if (s >= 3600) return `${(s / 3600).toFixed(1)} ساعة`;
  return `${Math.floor(s / 60)} دقيقة`;
}

function formatSpeed(plan: any) {
  if (!plan) return "";
  const dl = plan.downloadSpeed >= 1000 ? `${plan.downloadSpeed / 1000} Mbps` : `${plan.downloadSpeed} Kbps`;
  const ul = plan.uploadSpeed >= 1000 ? `${plan.uploadSpeed / 1000} Mbps` : `${plan.uploadSpeed} Kbps`;
  return `↓${dl} / ↑${ul}`;
}

// حساب دقيق لعدد رسائل SMS بنفس خوارزمية Backend
function splitCardsIntoSmsMessages(cards: { username: string; password: string }[]): string[] {
  const MAX_SMS_LENGTH = 70;
  const messages: string[] = [];
  let current = "";
  for (const card of cards) {
    const entry = `${card.username}/${card.password}`;
    const separator = current ? "\n" : "";
    const candidate = current + separator + entry;
    if (candidate.length <= MAX_SMS_LENGTH) {
      current = candidate;
    } else {
      if (current) messages.push(current);
      current = entry;
    }
  }
  if (current) messages.push(current);
  return messages;
}
function estimateSmsCount(qty: number, usernameLen = 5, passwordLen = 4, prefix = "") {
  const fakeCards = Array.from({ length: qty }, () => ({
    username: prefix + "x".repeat(usernameLen),
    password: "x".repeat(passwordLen),
  }));
  return splitCardsIntoSmsMessages(fakeCards).length;
}

// ── SMS Preview ───────────────────────────────────────────────────────────────
function SmsPreview({ qty, usernameLen, passwordLen, prefix }: {
  qty: number; usernameLen: number; passwordLen: number; prefix: string;
}) {
  const sampleCards = Array.from({ length: Math.min(qty, 3) }, () => {
    const uLen = usernameLen || 5;
    const pLen = passwordLen || 4;
    const pfx = prefix || "";
    const rem = Math.max(1, uLen - pfx.length);
    const uSuffix = String(Math.floor(Math.random() * Math.pow(10, rem))).padStart(rem, "0");
    const pass = String(Math.floor(Math.random() * Math.pow(10, pLen))).padStart(pLen, "0");
    return { u: pfx + uSuffix, p: pass };
  });
  const msgCount = estimateSmsCount(qty, usernameLen || 5, passwordLen || 4, prefix || "");
  const sampleMsg = sampleCards.map(c => `${c.u}/${c.p}`).join(" | ");
  const fullMsg = qty > 3 ? sampleMsg + ` | ... (+${qty - 3} كرت)` : sampleMsg;
  return (
    <div className="rounded-xl border bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 space-y-3">
      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
        <MessageSquare className="h-4 w-4" />
        <span className="text-sm font-semibold">معاينة رسالة SMS</span>
        <Badge variant="outline" className="text-xs mr-auto">{msgCount} رسالة</Badge>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border text-sm font-mono" dir="ltr">
        <p className="text-gray-500 text-xs mb-1 text-right" dir="rtl">نموذج الرسالة:</p>
        <p className="text-gray-800 dark:text-gray-200 break-all leading-relaxed">{fullMsg}</p>
      </div>
      <p className="text-xs text-muted-foreground">الحساب دقيق بناءً على طول username/password الفعلي</p>
    </div>
  );
}

// ── Step Indicator ────────────────────────────────────────────────────────────
function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isCompleted = currentStep > step.id;
        const isCurrent = currentStep === step.id;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${isCompleted ? "bg-green-500 border-green-500 text-white" : isCurrent ? "bg-blue-600 border-blue-600 text-white" : "bg-muted border-border text-muted-foreground"}`}>
                {isCompleted ? <CheckCircle className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap ${isCurrent ? "text-blue-600" : isCompleted ? "text-green-600" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`h-0.5 w-10 mx-1 mb-5 transition-all ${currentStep > step.id ? "bg-green-500" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SmsCards() {
  const [activeTab, setActiveTab] = useState("wizard");
  const [step, setStep] = useState(1);

  // Step 1: Plan & Quantity
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [quantity, setQuantity] = useState("10");

  // Step 2: Card settings
  const [prefix, setPrefix] = useState("");
  const [usernameLength, setUsernameLength] = useState("5");
  const [passwordLength, setPasswordLength] = useState("4");
  const [authType, setAuthType] = useState<"password" | "username-only">("password");

  // Step 3: Time & Validity
  const [usageHours, setUsageHours] = useState("1");
  const [usageMinutes, setUsageMinutes] = useState("0");
  const [windowHours, setWindowHours] = useState("24");
  const [windowMinutes, setWindowMinutes] = useState("0");
  const [timeFromActivation, setTimeFromActivation] = useState(true);

  // Step 4: Recipient
  const [contactId, setContactId] = useState<string>("");
  const [customPhone, setCustomPhone] = useState("");
  const [customName, setCustomName] = useState("");
  const [saveContact, setSaveContact] = useState(false);

  // Contact dialog
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  // ── Queries ───────────────────────────────────────────────────────────────────
  const { data: plans } = trpc.plans.list.useQuery();
  const { data: contacts, refetch: refetchContacts } = trpc.smsCards.getContacts.useQuery();
  const { data: sendLogs, refetch: refetchLogs } = trpc.smsCards.getSendLog.useQuery({ limit: 50, offset: 0 });
  const { data: smsStatus } = trpc.smsCards.getSmsStats.useQuery();

  // ── Derived ───────────────────────────────────────────────────────────────────
  const selectedPlan = useMemo(
    () => (plans as any[] | undefined)?.find((p: any) => String(p.id) === selectedPlanId),
    [plans, selectedPlanId]
  );
  const qty = parseInt(quantity || "0");
  const estimatedSms = estimateSmsCount(qty, parseInt(usernameLength) || 5, parseInt(passwordLength) || 4, prefix || "");
  const selectedContact = useMemo(
    () => (contactId && contactId !== "__manual__")
      ? (contacts as any[] | undefined)?.find((c: any) => String(c.id) === contactId)
      : undefined,
    [contacts, contactId]
  );
  const recipientPhone = selectedContact ? selectedContact.phone : customPhone;
  const recipientName = selectedContact ? selectedContact.name : customName;
  const usageBudgetSeconds = (parseInt(usageHours) || 0) * 3600 + (parseInt(usageMinutes) || 0) * 60;
  const windowSecondsVal = (parseInt(windowHours) || 0) * 3600 + (parseInt(windowMinutes) || 0) * 60;

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const addContactMutation = trpc.smsCards.addContact.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة جهة الاتصال");
      setNewContactName(""); setNewContactPhone(""); setShowAddContact(false);
      refetchContacts();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteContactMutation = trpc.smsCards.deleteContact.useMutation({
    onSuccess: () => { toast.success("تم حذف جهة الاتصال"); refetchContacts(); },
    onError: (e: any) => toast.error(e.message),
  });

  const sendCardsMutation = trpc.smsCards.createAndSendCards.useMutation({
    onSuccess: (data: any) => {
      toast.success(`✅ تم إنشاء ${data.cardCount} كرت وإرسال ${data.sentCount} رسالة SMS بنجاح`);
      setStep(1); setSelectedPlanId(""); setQuantity("10");
      setPrefix(""); setUsernameLength("5"); setPasswordLength("4"); setAuthType("password");
      setUsageHours("1"); setUsageMinutes("0"); setWindowHours("24"); setWindowMinutes("0");
      setTimeFromActivation(true); setContactId(""); setCustomPhone(""); setCustomName(""); setSaveContact(false);
      refetchLogs(); setActiveTab("logs");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Navigation ────────────────────────────────────────────────────────────────
  const canGoNext = () => {
    if (step === 1) return !!selectedPlanId && qty >= 1 && qty <= 500;
    if (step === 2) return isValidSmsCardPrefix(prefix);
    if (step === 3) return usageBudgetSeconds > 0 && windowSecondsVal > 0;
    if (step === 4) return !!recipientPhone;
    return true;
  };
  const goNext = () => { if (canGoNext()) setStep(s => s + 1); };
  const goBack = () => setStep(s => s - 1);

  const handleSend = () => {
    if (!selectedPlanId || !recipientPhone) return;
    sendCardsMutation.mutate({
      planId: parseInt(selectedPlanId),
      quantity: qty,
      contactPhone: recipientPhone,
      contactName: recipientName || recipientPhone,
      saveContact: saveContact && (!contactId || contactId === "__manual__"),
      contactId: (contactId && contactId !== "__manual__") ? parseInt(contactId) : undefined,
      prefix: prefix.trim(),
      usernameLength: parseInt(usernameLength),
      passwordLength: parseInt(passwordLength),
      usageBudgetSeconds,
      windowSeconds: windowSecondsVal,
      timeFromActivation,
      authType,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
          <Send className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">إرسال كروت عبر SMS</h1>
          <p className="text-sm text-muted-foreground">إنشاء كروت RADIUS حقيقية في النظام وإرسالها للزبائن</p>
        </div>
        {smsStatus && (
          <div className="mr-auto flex items-center gap-2 flex-wrap">
            <Badge variant={smsStatus.adminEnabled ? "default" : "destructive"}>
              {smsStatus.adminEnabled ? "SMS مفعّل" : "SMS معطّل"}
            </Badge>
            <Badge variant={smsStatus.isSystemAdmin || smsStatus.balance > 0 ? "outline" : "destructive"}>
              {smsStatus.isSystemAdmin ? 'حساب المدير' : smsStatus.balance > 0 ? `الرصيد: ${smsStatus.balance} رسالة` : 'رصيد منتهٍ'}
            </Badge>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="wizard"><CreditCard className="h-4 w-4 ml-1" />إنشاء وإرسال</TabsTrigger>
          <TabsTrigger value="contacts"><Phone className="h-4 w-4 ml-1" />دفتر الجهات</TabsTrigger>
          <TabsTrigger value="logs"><Clock className="h-4 w-4 ml-1" />سجل الإرسال</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Wizard ─────────────────────────────────────────────────── */}
        <TabsContent value="wizard">
          <Card>
            <CardContent className="pt-6">
              <StepIndicator currentStep={step} />

              {/* Step 1: الباقة والكمية */}
              {step === 1 && (
                <div className="space-y-6 max-w-lg mx-auto">
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold">اختر الباقة والكمية</h2>
                    <p className="text-muted-foreground text-sm">اختر نوع الكرت وعدد الكروت المطلوبة</p>
                  </div>
                  <div className="space-y-2">
                    <Label>الباقة <span className="text-red-500">*</span></Label>
                    <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                      <SelectTrigger className="h-12"><SelectValue placeholder="اختر الباقة..." /></SelectTrigger>
                      <SelectContent>
                        {(plans as any[] | undefined)?.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            <div className="flex items-center gap-2">
                              <Wifi className="h-3.5 w-3.5 text-blue-500" />
                              <span>{p.nameAr || p.name}</span>
                              <span className="text-muted-foreground text-xs">— {formatSpeed(p)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedPlan && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 text-sm">
                      <p className="font-semibold text-blue-700 dark:text-blue-300">{selectedPlan.nameAr || selectedPlan.name}</p>
                      <p className="text-muted-foreground">{formatSpeed(selectedPlan)}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>عدد الكروت <span className="text-red-500">*</span></Label>
                    <Input type="number" min="1" max="500" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-12 text-lg font-mono" dir="ltr" />
                    {qty > 0 && <p className="text-xs text-muted-foreground">~{estimatedSms} رسالة SMS ستُرسَل (حساب دقيق)</p>}
                  </div>
                </div>
              )}

              {/* Step 2: إعدادات الكرت */}
              {step === 2 && (
                <div className="space-y-6 max-w-lg mx-auto">
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold">إعدادات الكرت</h2>
                    <p className="text-muted-foreground text-sm">حدد تنسيق اسم المستخدم وكلمة المرور</p>
                  </div>
                  <div className="space-y-2">
                    <Label>رقم بداية الكرت <span className="text-red-500">*</span></Label>
                    <Input value={prefix} onChange={e => setPrefix(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} placeholder="مثال: 5 أو 12" dir="ltr" inputMode="numeric" maxLength={3} className="h-11 font-mono" aria-invalid={prefix.length > 0 && !isValidSmsCardPrefix(prefix)} />
                    <p className={`text-xs ${isValidSmsCardPrefix(prefix) ? "text-muted-foreground" : "text-red-500"}`}>{isValidSmsCardPrefix(prefix) ? `ستبدأ أسماء المستخدمين بـ ${prefix} (مثال: ${prefix}${"0".repeat(Math.max(1, (parseInt(usernameLength) || 6) - prefix.length))})` : "أدخل بادئة رقمية من 1 إلى 3 خانات للمتابعة"}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>طول اسم المستخدم</Label>
                      <Select value={usernameLength} onValueChange={setUsernameLength}>
                        <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>{[4,5,6,7,8].map(n => <SelectItem key={n} value={String(n)}>{n} أرقام</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>طول كلمة المرور</Label>
                      <Select value={passwordLength} onValueChange={setPasswordLength}>
                        <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>{[2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>{n} أرقام</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>نوع المصادقة</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setAuthType("password")}
                        className={`p-3 rounded-xl border-2 text-sm text-right transition-all ${authType === "password" ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-border hover:border-blue-300"}`}>
                        <Shield className="h-4 w-4 mb-1 text-blue-500" />
                        <p className="font-medium">رقم + سر</p>
                        <p className="text-xs text-muted-foreground">الأكثر أماناً</p>
                      </button>
                      <button type="button" onClick={() => setAuthType("username-only")}
                        className={`p-3 rounded-xl border-2 text-sm text-right transition-all ${authType === "username-only" ? "border-orange-500 bg-orange-50 dark:bg-orange-950" : "border-border hover:border-orange-300"}`}>
                        <User className="h-4 w-4 mb-1 text-orange-500" />
                        <p className="font-medium">رقم فقط</p>
                        <p className="text-xs text-muted-foreground">بدون كلمة سر</p>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: الوقت والصلاحية */}
              {step === 3 && (
                <div className="space-y-6 max-w-lg mx-auto">
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold">الوقت والصلاحية</h2>
                    <p className="text-muted-foreground text-sm">حدد مدة استخدام الكرت ونافذة صلاحيته</p>
                  </div>
                  {/* يحسب من تاريخ التفعيل */}
                  <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/30">
                    <div>
                      <p className="font-medium">يحسب من تاريخ التفعيل</p>
                      <p className="text-xs text-muted-foreground">الوقت يبدأ من أول استخدام للكرت</p>
                    </div>
                    <Switch checked={timeFromActivation} onCheckedChange={setTimeFromActivation} />
                  </div>
                  {/* ميزانية الاستخدام */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4 text-blue-500" />
                      <Label className="font-semibold">ميزانية الاستخدام (وقت الجلسة)</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">ساعات</Label>
                        <Input type="number" min="0" value={usageHours} onChange={e => setUsageHours(e.target.value)} className="h-11 font-mono text-center" dir="ltr" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">دقائق</Label>
                        <Input type="number" min="0" max="59" value={usageMinutes} onChange={e => setUsageMinutes(e.target.value)} className="h-11 font-mono text-center" dir="ltr" />
                      </div>
                    </div>
                    {usageBudgetSeconds > 0
                      ? <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">إجمالي: <span className="font-mono font-medium text-foreground">{fmtSecs(usageBudgetSeconds)}</span></p>
                      : <p className="text-xs text-red-500">يجب تحديد وقت الجلسة</p>}
                  </div>
                  {/* نافذة الصلاحية */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-orange-500" />
                      <Label className="font-semibold">نافذة الصلاحية (مدة الكرت)</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">ساعات</Label>
                        <Input type="number" min="0" value={windowHours} onChange={e => setWindowHours(e.target.value)} className="h-11 font-mono text-center" dir="ltr" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">دقائق</Label>
                        <Input type="number" min="0" max="59" value={windowMinutes} onChange={e => setWindowMinutes(e.target.value)} className="h-11 font-mono text-center" dir="ltr" />
                      </div>
                    </div>
                    {windowSecondsVal > 0
                      ? <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">إجمالي: <span className="font-mono font-medium text-foreground">{fmtSecs(windowSecondsVal)}</span></p>
                      : <p className="text-xs text-red-500">يجب تحديد مدة الصلاحية</p>}
                  </div>
                  {/* اختصارات سريعة */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">اختصارات سريعة</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "1 ساعة", u: "1", um: "0", w: "24", wm: "0" },
                        { label: "2 ساعة", u: "2", um: "0", w: "48", wm: "0" },
                        { label: "5 ساعات", u: "5", um: "0", w: "72", wm: "0" },
                        { label: "10 ساعات", u: "10", um: "0", w: "168", wm: "0" },
                        { label: "24 ساعة", u: "24", um: "0", w: "48", wm: "0" },
                      ].map(preset => (
                        <button key={preset.label} type="button"
                          onClick={() => { setUsageHours(preset.u); setUsageMinutes(preset.um); setWindowHours(preset.w); setWindowMinutes(preset.wm); }}
                          className="px-3 py-1.5 text-xs rounded-full border hover:bg-blue-50 hover:border-blue-400 dark:hover:bg-blue-950 transition-all">
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: المستلم والإرسال */}
              {step === 4 && (
                <div className="space-y-6 max-w-lg mx-auto">
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold">المستلم والإرسال</h2>
                    <p className="text-muted-foreground text-sm">اختر المستلم وراجع الملخص قبل الإرسال</p>
                  </div>
                  {contacts && (contacts as any[]).length > 0 && (
                    <div className="space-y-2">
                      <Label>اختر من دفتر الجهات</Label>
                      <Select value={contactId} onValueChange={v => { setContactId(v); setCustomPhone(""); setCustomName(""); }}>
                        <SelectTrigger className="h-11"><SelectValue placeholder="اختر جهة اتصال..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__manual__">— إدخال يدوي —</SelectItem>
                          {(contacts as any[]).map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name} — {c.phone}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {(!contactId || contactId === "__manual__") && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>رقم الجوال <span className="text-red-500">*</span></Label>
                        <Input value={customPhone} onChange={e => setCustomPhone(e.target.value)} placeholder="مثال: 0599123456" dir="ltr" className="h-11" />
                      </div>
                      <div className="space-y-2">
                        <Label>اسم الزبون (اختياري)</Label>
                        <Input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="مثال: أحمد محمد" className="h-11" />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={saveContact} onChange={e => setSaveContact(e.target.checked)} className="rounded" />
                        <span className="text-sm">حفظ في دفتر الجهات</span>
                      </label>
                    </div>
                  )}
                  {selectedContact && (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold">{selectedContact.name.charAt(0)}</div>
                      <div>
                        <p className="font-medium">{selectedContact.name}</p>
                        <p className="text-sm text-muted-foreground" dir="ltr">{selectedContact.phone}</p>
                      </div>
                    </div>
                  )}
                  {/* ملخص الطلب */}
                  <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-4 space-y-3">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">ملخص الطلب</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1"><Wifi className="h-3 w-3" /> الباقة:</span>
                      <span className="font-medium text-end">{selectedPlan?.nameAr || selectedPlan?.name || "—"}</span>
                      <span className="text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" /> الكمية:</span>
                      <span className="font-mono font-medium text-end">{qty}</span>
                      <span className="text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" /> وقت الجلسة:</span>
                      <span className="font-mono font-medium text-end">{fmtSecs(usageBudgetSeconds)}</span>
                      <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> الصلاحية:</span>
                      <span className="font-mono font-medium text-end">{fmtSecs(windowSecondsVal)}</span>
                      <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> المستلم:</span>
                      <span className="font-medium text-end" dir="ltr">{recipientPhone || "—"}</span>
                    </div>
                  </div>
                  {/* معاينة SMS */}
                  {qty > 0 && <SmsPreview qty={qty} usernameLen={parseInt(usernameLength)} passwordLen={parseInt(passwordLength)} prefix={prefix} />}
                  {/* تحذير الرصيد */}
                  {smsStatus && smsStatus.balance <= 0 && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 text-red-700 text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>رصيد الرسائل منتهٍ. يرجى شحن الرصيد للمتابعة.</span>
                    </div>
                  )}
                  {smsStatus && smsStatus.balance > 0 && estimatedSms > smsStatus.balance && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 text-red-700 text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>رصيدك الحالي ({smsStatus.balance} رسالة) أقل من العدد المطلوب ({estimatedSms} رسالة). يرجى شحن الرصيد.</span>
                    </div>
                  )}
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base" onClick={handleSend} disabled={sendCardsMutation.isPending || !recipientPhone}>
                    {sendCardsMutation.isPending
                      ? <><Loader2 className="h-5 w-5 animate-spin ml-2" /> جاري إنشاء الكروت وإرسالها...</>
                      : <><Send className="h-5 w-5 ml-2" /> إنشاء الكروت وإرسالها الآن</>}
                  </Button>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between mt-8 pt-4 border-t">
                <Button variant="outline" onClick={goBack} disabled={step === 1} className="gap-2">
                  <ChevronRight className="h-4 w-4" />السابق
                </Button>
                {step < 4 && (
                  <Button onClick={goNext} disabled={!canGoNext()} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                    التالي<ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: دفتر الجهات ────────────────────────────────────────────── */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" />دفتر جهات الاتصال</CardTitle>
              <Button size="sm" onClick={() => setShowAddContact(true)} className="gap-1"><UserPlus className="h-4 w-4" />إضافة جهة</Button>
            </CardHeader>
            <CardContent>
              {!contacts || (contacts as any[]).length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">لا توجد جهات اتصال</p>
                  <p className="text-sm">أضف جهات اتصال لتسريع الإرسال</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(contacts as any[]).map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">{c.name.charAt(0)}</div>
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-sm text-muted-foreground" dir="ltr">{c.phone}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => deleteContactMutation.mutate({ id: c.id })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: سجل الإرسال ────────────────────────────────────────────── */}
        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />سجل الإرسال</CardTitle></CardHeader>
            <CardContent>
              {!sendLogs || !(sendLogs as any).logs || (sendLogs as any).logs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">لا يوجد سجل إرسال بعد</p>
                  <p className="text-sm">ستظهر هنا سجلات الإرسال بعد أول عملية</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {((sendLogs as any).logs as any[]).map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {log.status === "sent" ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0" /> : <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
                        <div>
                          <p className="font-medium">{log.contactName}</p>
                          <p className="text-sm text-muted-foreground" dir="ltr">{log.contactPhone}</p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-mono">{log.cardCount} كرت / {log.smsCount} SMS</p>
                        <p className="text-xs text-muted-foreground">{(parseDbDate(log.createdAt) ?? new Date(log.createdAt)).toLocaleString("ar-PS")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Contact Dialog */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة جهة اتصال جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>الاسم <span className="text-red-500">*</span></Label>
              <Input value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="مثال: أحمد محمد" />
            </div>
            <div className="space-y-2">
              <Label>رقم الجوال <span className="text-red-500">*</span></Label>
              <Input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="مثال: 0599123456" dir="ltr" />
            </div>
            <Button className="w-full"
              onClick={() => { if (!newContactName || !newContactPhone) return; addContactMutation.mutate({ name: newContactName, phone: newContactPhone }); }}
              disabled={addContactMutation.isPending || !newContactName || !newContactPhone}>
              {addContactMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}إضافة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
