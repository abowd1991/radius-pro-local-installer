import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Wifi, Server, Terminal, Zap, CreditCard, CheckCircle2,
  ChevronRight, ChevronLeft, Copy, Check, ArrowRight,
  Star, Rocket, Shield, Users, SkipForward,
} from "lucide-react";

interface NasFormData {
  name: string;
  secret: string;
  connectionType: "public_ip" | "vpn_sstp" | "vpn_l2tp" | "vpn_pptp";
  ipAddress: string;
}
interface SpeedFormData {
  name: string;
  downloadSpeed: number;
  uploadSpeed: number;
  validityValue: number;
  validityType: "hours" | "days";
  price: string;
}
interface CardFormData {
  quantity: number;
  prefix: string;
  passwordLength: number;
}

const STEPS = [
  { id: 1, label: "مرحباً", icon: Rocket },
  { id: 2, label: "إضافة NAS", icon: Server },
  { id: 3, label: "سكربت MikroTik", icon: Terminal },
  { id: 4, label: "بروفايل السرعة", icon: Zap },
  { id: 5, label: "إنشاء كروت", icon: CreditCard },
];

function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      {label && <p className="text-xs text-muted-foreground mb-1">{label}</p>}
      <pre className="bg-zinc-900 text-green-400 text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono border border-zinc-700">
        {code}
      </pre>
      <button onClick={copy} className="absolute top-2 right-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded p-1 transition-colors" title="نسخ">
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

export default function OnboardingWizard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  // toast from sonner (imported at top)
  const utils = trpc.useUtils();
  const { data: publicAddress } = trpc.winbox.getPublicAddress.useQuery();
  const vpsAddress = publicAddress?.address ?? "عنوان-VPS-غير-مهيأ";

  const [step, setStep] = useState(1);
  const [createdPlanId, setCreatedPlanId] = useState<number | null>(null);
  const [createdNasId, setCreatedNasId] = useState<number | null>(null);
  const [cardsGenerated, setCardsGenerated] = useState(false);

  const [nasData, setNasData] = useState<NasFormData>({ name: "", secret: "", connectionType: "vpn_sstp", ipAddress: "pending" });
  const [speedData, setSpeedData] = useState<SpeedFormData>({ name: "باقة 2 ميغا", downloadSpeed: 2048, uploadSpeed: 1024, validityValue: 30, validityType: "days", price: "5" });
  const [cardData, setCardData] = useState<CardFormData>({ quantity: 5, prefix: "", passwordLength: 4 });

  const createNas = trpc.nas.create.useMutation({
    onSuccess: (data: any) => {
      setCreatedNasId(data?.id ?? null);
      toast.success(`✅ تم إنشاء NAS بنجاح - ${nasData.name}`);
      setStep(3);
    },
    onError: (err) => toast.error(err.message),
  });

  // Fetch setup scripts for the created NAS
  const { data: setupData, isLoading: setupLoading } = trpc.nas.getSetupScripts.useQuery(
    { id: createdNasId! },
    { enabled: !!createdNasId && step === 3 }
  );

  const createPlan = trpc.plans.create.useMutation({
    onSuccess: (data: any) => {
      setCreatedPlanId(data?.id ?? null);
      toast.success(`✅ تم إنشاء بروفايل السرعة - ${speedData.name}`);
      setStep(5);
    },
    onError: (err) => toast.error(err.message),
  });

  const generateCards = trpc.vouchers.generate.useMutation({
    onSuccess: () => {
      setCardsGenerated(true);
      toast.success(`🎉 تم إنشاء ${cardData.quantity} كرت بنجاح!`);
    },
    onError: (err) => toast.error(err.message),
  });

  const completeOnboarding = trpc.auth.completeOnboarding.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, (current: any) => current ? { ...current, onboardingCompleted: true } : current);
      utils.auth.me.invalidate();
      window.location.replace('/dashboard');
    },
    onError: (error) => toast.error(error.message || "تعذر حفظ تخطي الإعداد"),
  });

  const handleSkip = () => completeOnboarding.mutate();
  const handleFinish = () => completeOnboarding.mutate();

  const handleNasSubmit = () => {
    if (!nasData.name.trim()) return toast.error("يرجى إدخال اسم الجهاز");
    if (!nasData.secret.trim()) return toast.error("يرجى إدخال السكريت");
    createNas.mutate({
      name: nasData.name, secret: nasData.secret,
      connectionType: nasData.connectionType,
      ipAddress: nasData.connectionType === "public_ip" ? nasData.ipAddress : "pending",
      type: "mikrotik",
    });
  };

  const handleSpeedSubmit = () => {
    if (!speedData.name.trim()) return toast.error("يرجى إدخال اسم البروفايل");
    createPlan.mutate({
      name: speedData.name, downloadSpeed: speedData.downloadSpeed, uploadSpeed: speedData.uploadSpeed,
      validityValue: speedData.validityValue, validityType: speedData.validityType,
      price: speedData.price, resellerPrice: speedData.price,
      simultaneousUse: 1, serviceType: "all", autoDisconnect: false,
    });
  };

  const handleCardsSubmit = () => {
    if (!createdPlanId) return toast.error("يرجى إنشاء بروفايل سرعة أولاً");
    generateCards.mutate({
      planId: createdPlanId, quantity: cardData.quantity,
      prefix: cardData.prefix || undefined, passwordLength: cardData.passwordLength,
      usernameLength: 6, simultaneousUse: 1, subscriberGroup: "Default group",
      timeFromActivation: true, internetTimeValue: 0, internetTimeUnit: "hours",
      cardTimeValue: 0, cardTimeUnit: "hours", macBinding: false, cardPrice: 0,
      usageBudgetSeconds: 0, windowSeconds: 0, authType: "password",
    });
  };

  const mikrotikScript = `# ربط RADIUS بجهاز MikroTik
  /radius add address=${vpsAddress} secret=${nasData.secret || "<YOUR_SECRET>"} service=ppp,hotspot timeout=3s
  /radius add address=${vpsAddress} secret=${nasData.secret || "<YOUR_SECRET>"} service=login timeout=3s

# تفعيل RADIUS للـ Hotspot
/ip hotspot profile set default use-radius=yes

# تفعيل RADIUS للـ PPPoE
/ppp aaa set use-radius=yes accounting=yes`;

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center p-4" dir="rtl">
      {/* Header */}
      <div className="w-full max-w-2xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wifi className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Radius Pro</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground gap-1">
            <SkipForward className="w-4 h-4" />
            تخطي الإعداد
          </Button>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-1 mb-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = s.id === step;
            const isDone = s.id < step;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${isActive ? "bg-primary text-primary-foreground shadow-md" : isDone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-1 rounded ${isDone ? "bg-primary/40" : "bg-muted"}`} />}
              </div>
            );
          })}
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div className="bg-primary h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ── STEP 1: Welcome ── */}
      {step === 1 && (
        <Card className="w-full max-w-2xl border-primary/20 shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Rocket className="w-10 h-10 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">أهلاً وسهلاً{user?.name ? `، ${user.name}` : ""}! 🎉</CardTitle>
            <CardDescription className="text-base mt-2">
              مرحباً بك في منصة <strong>Radius Pro</strong> لإدارة شبكات الإنترنت والكروت
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Server, title: "إدارة NAS", desc: "أجهزة MikroTik وغيرها" },
                { icon: Zap, title: "بروفايلات السرعة", desc: "تحكم كامل بالباقات" },
                { icon: CreditCard, title: "كروت الإنترنت", desc: "توليد وطباعة فورية" },
              ].map((f) => (
                <div key={f.title} className="flex flex-col items-center text-center p-4 rounded-xl bg-muted/50 border border-border/50">
                  <f.icon className="w-8 h-8 text-primary mb-2" />
                  <p className="font-semibold text-sm">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>

            <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
              <p className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" />
                سيأخذك هذا المعالج خلال 4 خطوات سريعة:
              </p>
              <ol className="space-y-2 text-sm text-muted-foreground">
                {["إضافة جهاز NAS (اسم + سكريت)", "نسخ سكربت الإعداد لجهاز MikroTik", "إنشاء بروفايل سرعة (باقة إنترنت)", "توليد أول مجموعة كروت وتجربتها"].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>

            <Button className="w-full gap-2 text-base py-5" onClick={() => setStep(2)}>
              ابدأ الإعداد الآن
              <ArrowRight className="w-5 h-5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Create NAS ── */}
      {step === 2 && (
        <Card className="w-full max-w-2xl border-primary/20 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>إضافة جهاز NAS</CardTitle>
                <CardDescription>أدخل اسم الجهاز والسكريت للاتصال بـ RADIUS</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>نوع الاتصال</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "vpn_sstp", label: "VPN SSTP", desc: "موصى به" },
                  { value: "vpn_l2tp", label: "VPN L2TP", desc: "" },
                  { value: "vpn_pptp", label: "VPN PPTP", desc: "للأجهزة القديمة" },
                  { value: "public_ip", label: "IP عام", desc: "مباشر" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => setNasData((d) => ({ ...d, connectionType: opt.value as any }))}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${nasData.connectionType === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"}`}>
                    <p>{opt.label}</p>
                    {opt.desc && <p className="text-xs mt-0.5 opacity-70">{opt.desc}</p>}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nas-name">اسم الجهاز *</Label>
              <Input id="nas-name" placeholder="مثال: شبكة الحي الغربي" value={nasData.name} onChange={(e) => setNasData((d) => ({ ...d, name: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nas-secret">السكريت (Shared Secret) *</Label>
              <Input id="nas-secret" placeholder="مثال: MySecret123" value={nasData.secret} onChange={(e) => setNasData((d) => ({ ...d, secret: e.target.value }))} dir="ltr" />
              <p className="text-xs text-muted-foreground">كلمة سر مشتركة بين جهازك وخادم RADIUS — ستحتاجها في الخطوة التالية</p>
            </div>

            {nasData.connectionType === "public_ip" && (
              <div className="space-y-2">
                <Label htmlFor="nas-ip">عنوان IP العام للجهاز *</Label>
                <Input id="nas-ip" placeholder="مثال: 203.0.113.10" value={nasData.ipAddress === "pending" ? "" : nasData.ipAddress} onChange={(e) => setNasData((d) => ({ ...d, ipAddress: e.target.value }))} dir="ltr" />
              </div>
            )}

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-sm text-blue-600 dark:text-blue-400">
              <Shield className="w-4 h-4 inline ml-1" />
              {nasData.connectionType !== "public_ip" ? "سيتم إعطاء الجهاز IP ثابت تلقائياً عند الاتصال بـ VPN" : "تأكد أن جهازك يقبل اتصالات RADIUS على المنفذ 1812"}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                <ChevronRight className="w-4 h-4 ml-1" />رجوع
              </Button>
              <Button className="flex-grow gap-2" onClick={handleNasSubmit} disabled={createNas.isPending}>
                {createNas.isPending ? "جاري الإنشاء..." : "إنشاء NAS والمتابعة"}
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 3: MikroTik Script ── */}
      {step === 3 && (
        <Card className="w-full max-w-2xl border-primary/20 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <CardTitle>تركيب السكربت في MikroTik</CardTitle>
                <CardDescription>انسخ الأوامر التالية وشغّلها في Terminal أو Winbox</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-sm text-green-700 dark:text-green-400 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>تم إنشاء جهاز NAS <strong>"{nasData.name}"</strong> بنجاح.{nasData.connectionType !== "public_ip" && " سيحصل الجهاز على IP ثابت عند الاتصال بـ VPN."}</span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">1. افتح Terminal في MikroTik أو استخدم Winbox ← New Terminal</p>
            </div>

            {setupLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-20 bg-zinc-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : setupData?.scripts && setupData.scripts.length > 0 ? (
              <div className="space-y-4">
                {/* Copy All button */}
                {setupData.combinedScript && (
                  <CopyBlock
                    code={setupData.combinedScript}
                    label="نسخ الكل (جميع الأوامر دفعة واحدة):"
                  />
                )}
                {/* Individual scripts */}
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">أو نفذ كل أمر بشكل منفصل:</p>
                  {setupData.scripts.map((script: any) => (
                    <div key={script.id} className="rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800">
                        <span className="text-xs font-medium text-white">{script.titleAr}</span>
                        {script.required && (
                          <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded">مطلوب</span>
                        )}
                      </div>
                      <CopyBlock code={script.command} />
                      <p className="px-3 pb-2 text-xs text-zinc-400">{script.descriptionAr}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Fallback: show basic RADIUS commands if no scripts loaded
              <div className="space-y-3">
                <CopyBlock
                  code={`# ربط RADIUS بجهاز MikroTik\n/radius add address=${vpsAddress} secret=${nasData.secret || "<YOUR_SECRET>"} service=ppp,hotspot,login timeout=3s\n/radius set [find] require-message-auth=no\n/radius incoming set port=3799 accept=yes\n\n# تفعيل RADIUS لـ PPPoE\n/ppp aaa set use-radius=yes accounting=yes interim-update=1m\n\n# تفعيل RADIUS لـ Hotspot\n:foreach profile in=[/ip hotspot profile find] do={\n  /ip hotspot profile set \$profile login-by=cookie,http-pap,mac-cookie use-radius=yes radius-accounting=yes radius-interim-update=2m\n}\n\n# إنشاء بروفايل PPP (لـ VPN SSTP)\n/ppp profile\nadd name="RadiusPro" use-compression=no use-encryption=yes only-one=yes change-tcp-mss=yes`}
                  label="أوامر الإعداد:"
                />
              </div>
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium">2. للتحقق من الاتصال بـ RADIUS:</p>
              <CopyBlock code={`/radius print\n/radius monitor 0`} label="أوامر التحقق:" />
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-700 dark:text-amber-400">
              <strong>ملاحظة:</strong> بعد تشغيل الأوامر، انتظر دقيقة ثم تحقق من حالة الجهاز في لوحة التحكم.
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                <ChevronRight className="w-4 h-4 ml-1" />رجوع
              </Button>
              <Button className="flex-grow gap-2" onClick={() => setStep(4)}>
                تم التركيب، متابعة
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 4: Speed Profile ── */}
      {step === 4 && (
        <Card className="w-full max-w-2xl border-primary/20 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <CardTitle>إنشاء بروفايل سرعة</CardTitle>
                <CardDescription>حدد اسم الباقة وسرعة التنزيل والرفع والمدة</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>اختر باقة جاهزة أو خصص:</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "1 ميغا", dl: 1024, ul: 512, name: "باقة 1 ميغا" },
                  { label: "2 ميغا", dl: 2048, ul: 1024, name: "باقة 2 ميغا" },
                  { label: "4 ميغا", dl: 4096, ul: 2048, name: "باقة 4 ميغا" },
                ].map((p) => (
                  <button key={p.label} onClick={() => setSpeedData((d) => ({ ...d, name: p.name, downloadSpeed: p.dl, uploadSpeed: p.ul }))}
                    className={`p-2.5 rounded-xl border text-sm font-medium transition-all ${speedData.downloadSpeed === p.dl ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="speed-name">اسم البروفايل *</Label>
              <Input id="speed-name" value={speedData.name} onChange={(e) => setSpeedData((d) => ({ ...d, name: e.target.value }))} placeholder="مثال: باقة 2 ميغا شهرية" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>سرعة التنزيل (Kbps)</Label>
                <Input type="number" value={speedData.downloadSpeed} onChange={(e) => setSpeedData((d) => ({ ...d, downloadSpeed: Number(e.target.value) }))} min={128} />
                <p className="text-xs text-muted-foreground">{(speedData.downloadSpeed / 1024).toFixed(1)} Mbps</p>
              </div>
              <div className="space-y-2">
                <Label>سرعة الرفع (Kbps)</Label>
                <Input type="number" value={speedData.uploadSpeed} onChange={(e) => setSpeedData((d) => ({ ...d, uploadSpeed: Number(e.target.value) }))} min={64} />
                <p className="text-xs text-muted-foreground">{(speedData.uploadSpeed / 1024).toFixed(1)} Mbps</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>مدة الصلاحية</Label>
                <div className="flex gap-2">
                  <Input type="number" value={speedData.validityValue} onChange={(e) => setSpeedData((d) => ({ ...d, validityValue: Number(e.target.value) }))} min={1} className="w-20" />
                  <select value={speedData.validityType} onChange={(e) => setSpeedData((d) => ({ ...d, validityType: e.target.value as any }))}
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="hours">ساعات</option>
                    <option value="days">أيام</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>السعر (بعملتك)</Label>
                <Input type="number" value={speedData.price} onChange={(e) => setSpeedData((d) => ({ ...d, price: e.target.value }))} min={0} step={0.5} />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>
                <ChevronRight className="w-4 h-4 ml-1" />رجوع
              </Button>
              <Button className="flex-grow gap-2" onClick={handleSpeedSubmit} disabled={createPlan.isPending}>
                {createPlan.isPending ? "جاري الإنشاء..." : "إنشاء البروفايل والمتابعة"}
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 5: Generate Cards ── */}
      {step === 5 && (
        <Card className="w-full max-w-2xl border-primary/20 shadow-xl">
          <CardHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <CardTitle>إنشاء أول مجموعة كروت</CardTitle>
                <CardDescription>أنشئ كروت تجريبية لاختبار شبكتك</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {!cardsGenerated ? (
              <>
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-sm text-green-700 dark:text-green-400 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>تم إنشاء بروفايل <strong>"{speedData.name}"</strong> بنجاح. سيتم ربط الكروت بهذا البروفايل تلقائياً.</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>عدد الكروت</Label>
                    <Input type="number" value={cardData.quantity} onChange={(e) => setCardData((d) => ({ ...d, quantity: Number(e.target.value) }))} min={1} max={50} />
                  </div>
                  <div className="space-y-2">
                    <Label>بادئة اسم المستخدم (اختياري)</Label>
                    <Input placeholder="مثال: TEST" value={cardData.prefix} onChange={(e) => setCardData((d) => ({ ...d, prefix: e.target.value }))} maxLength={6} dir="ltr" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>طول كلمة المرور</Label>
                  <div className="flex gap-2">
                    {[3, 4, 6].map((len) => (
                      <button key={len} onClick={() => setCardData((d) => ({ ...d, passwordLength: len }))}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${cardData.passwordLength === len ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground"}`}>
                        {len} أرقام
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(4)}>
                    <ChevronRight className="w-4 h-4 ml-1" />رجوع
                  </Button>
                  <Button className="flex-grow gap-2" onClick={handleCardsSubmit} disabled={generateCards.isPending}>
                    {generateCards.isPending ? "جاري الإنشاء..." : `إنشاء ${cardData.quantity} كرت`}
                    <CreditCard className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center space-y-6 py-4">
                <div className="flex justify-center">
                  <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-12 h-12 text-green-500" />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">🎉 مبروك! الإعداد اكتمل</h3>
                  <p className="text-muted-foreground">تم إنشاء <strong>{cardData.quantity} كرت</strong> بنجاح. يمكنك الآن تجربة الاتصال بشبكتك!</p>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { icon: Server, label: "NAS", value: nasData.name, color: "text-blue-500" },
                    { icon: Zap, label: "بروفايل", value: speedData.name, color: "text-yellow-500" },
                    { icon: CreditCard, label: "كروت", value: `${cardData.quantity} كرت`, color: "text-purple-500" },
                  ].map((item) => (
                    <div key={item.label} className="p-3 rounded-xl bg-muted/50 border border-border/50">
                      <item.icon className={`w-6 h-6 mx-auto mb-1 ${item.color}`} />
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-xs font-semibold truncate">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm text-right space-y-2">
                  <p className="font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    كيف تجرب الكروت؟
                  </p>
                  <ol className="space-y-1 text-muted-foreground text-xs">
                    <li>1. اذهب إلى صفحة "الكروت" وانسخ اسم مستخدم وكلمة مرور</li>
                    <li>2. اتصل بشبكة MikroTik (PPPoE أو Hotspot)</li>
                    <li>3. أدخل بيانات الكرت وتحقق من الاتصال</li>
                    <li>4. راقب الجلسة في صفحة "المستخدمون الآن"</li>
                  </ol>
                </div>

                <Button className="w-full gap-2 py-5 text-base" onClick={handleFinish}>
                  <Rocket className="w-5 h-5" />
                  انطلق إلى لوحة التحكم
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground mt-4">يمكنك إعادة تشغيل هذا المعالج في أي وقت من الإعدادات</p>
    </div>
  );
}
