/**
 * StorePage — صفحة المتجر العامة
 * - تبويب المنتجات: تصفح وشراء
 * - تبويب طلباتي: البحث بالجوال وعرض الطلبات
 * - صفحة تتبع الطلب: /store/:slug/order/:token
 */
import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Wifi, ShoppingCart, Phone, CheckCircle, Upload, Loader2, X, Package,
  Star, Shield, Zap, Clock, Search, Copy, RefreshCw, ArrowRight, Eye, EyeOff, Lock, KeyRound
} from "lucide-react";

// ─── CDN Assets ──────────────────────────────────────────────────────────────
const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030608704/JYruXSQahvP3cr6rPdjNhA/hero_bg-LtUEhk3hSz8YcMKEimKCkW.webp";
const CARD_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030608704/JYruXSQahvP3cr6rPdjNhA/card_product_bg-jr7AWjcfgBPhUmWTTXFVXa.webp";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrderStep = "browse" | "form" | "pin" | "payment" | "success";
type PageTab = "shop" | "myorders";
type PinMode = "verify" | "create" | "forgot" | "otp";

// ─── PIN Input Component ─────────────────────────────────────────────────────
function PinInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-3 justify-center" dir="ltr">
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            const arr = value.split("");
            arr[i] = v;
            const next = arr.join("").slice(0, 4);
            onChange(next);
            if (v && i < 3) {
              const nextEl = e.target.parentElement?.children[i + 1] as HTMLInputElement;
              nextEl?.focus();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              const prev = e.currentTarget.parentElement?.children[i - 1] as HTMLInputElement;
              prev?.focus();
              const arr = value.split("");
              arr[i - 1] = "";
              onChange(arr.join(""));
            }
          }}
          className="w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 border-slate-600 bg-slate-800/60 text-white focus:border-cyan-400 focus:outline-none transition-colors disabled:opacity-50"
        />
      ))}
    </div>
  );
}

// ─── Status Labels ────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "قيد المراجعة", color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/30" },
  confirmed: { label: "مؤكد",         color: "text-blue-400",   bg: "bg-blue-500/20 border-blue-500/30" },
  delivered: { label: "تم التسليم",   color: "text-green-400",  bg: "bg-green-500/20 border-green-500/30" },
  cancelled: { label: "ملغى",         color: "text-red-400",    bg: "bg-red-500/20 border-red-500/30" },
};

// ─── Copy Button ─────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      className="ml-2 p-1 rounded-md hover:bg-white/10 transition-colors"
      title="نسخ"
    >
      {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
    </button>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({
  product, primary, secondary, onSelect,
}: {
  product: { id: number; name: string; description?: string | null; price: string; availableStock: number };
  primary: string; secondary: string;
  onSelect: () => void;
}) {
  const outOfStock = product.availableStock === 0;
  return (
    <div
      className={`relative rounded-2xl overflow-hidden border transition-all duration-300 cursor-pointer group ${outOfStock ? "opacity-60 cursor-not-allowed border-slate-700/50" : "border-white/10 hover:border-white/30 hover:scale-[1.02]"}`}
      style={{ backgroundImage: `url(${CARD_BG})`, backgroundSize: "cover" }}
      onClick={!outOfStock ? onSelect : undefined}
    >
      <div className="absolute inset-0 bg-slate-900/80" />
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: outOfStock ? "#475569" : `linear-gradient(90deg, ${primary}, ${secondary})` }} />
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-bold text-lg mb-1">{product.name}</h3>
            {product.description && <p className="text-slate-400 text-sm line-clamp-2">{product.description}</p>}
          </div>
          {outOfStock && <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">نفد المخزون</Badge>}
          {!outOfStock && product.availableStock <= 5 && <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">متبقي {product.availableStock}</Badge>}
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-black" style={{ color: primary }}>{product.price}</p>
          </div>
          {!outOfStock && (
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: primary }}>
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Single Order Card (in My Orders list) ────────────────────────────────────
function OrderCard({
  order, primary, slug,
}: {
  order: {
    id: number; orderToken: string | null; status: string; productName: string;
    amount: string; createdAt: Date; cardUsername: string | null; cardPassword: string | null;
    cardsData?: string | null; quantity?: number | null; smsSent: boolean;
  };
  primary: string; slug: string;
}) {
  const [showPass, setShowPass] = useState(false);
  const st = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending;
  const trackUrl = order.orderToken ? `${window.location.origin}/store/${slug}/order/${order.orderToken}` : null;

  // تحليل cardsData إذا وجدت
  const parsedCards: { username: string; password: string | null }[] = (() => {
    try { if (order.cardsData) return JSON.parse(order.cardsData as string); } catch {}
    if (order.cardUsername) return [{ username: order.cardUsername, password: order.cardPassword ?? null }];
    return [];
  })();

  return (
    <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-white font-bold">{order.productName}</p>
          <p className="text-slate-500 text-xs mt-0.5">طلب #{order.id} — {new Date(order.createdAt).toLocaleDateString("ar-SA")}</p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${st.bg} ${st.color}`}>{st.label}</span>
      </div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-400 text-sm">المبلغ: <span className="font-bold" style={{ color: primary }}>{order.amount}</span></p>
        {order.smsSent && <p className="text-green-400 text-xs">✓ تم إرسال SMS</p>}
      </div>
      {order.status === "delivered" && parsedCards.length > 0 && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mt-3">
          <p className="text-green-400 font-bold text-sm mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {parsedCards.length > 1 ? `بطاقاتك جاهزة! (${parsedCards.length} كروت)` : 'بطاقتك جاهزة!'}
          </p>
          <div className="space-y-3">
            {parsedCards.map((card, idx) => (
              <div key={idx} className={parsedCards.length > 1 ? "border border-slate-700/50 rounded-lg p-3" : ""}>
                {parsedCards.length > 1 && <p className="text-slate-400 text-xs font-bold mb-2">كرت {idx + 1}</p>}
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-slate-500 text-xs">اسم المستخدم</p>
                      <p className="text-white font-mono font-bold">{card.username}</p>
                    </div>
                    <CopyBtn text={card.username} />
                  </div>
                  {card.password && (
                    <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-slate-500 text-xs">كلمة المرور</p>
                        <p className="text-white font-mono font-bold">{showPass ? card.password : '••••••••'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setShowPass(!showPass)} className="p-1 rounded-md hover:bg-white/10 transition-colors">
                          {showPass ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                        </button>
                        <CopyBtn text={card.password} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {trackUrl && order.status !== "delivered" && (
        <div className="mt-3">
          <a href={trackUrl} className="text-cyan-400 text-xs hover:underline flex items-center gap-1">
            <ArrowRight className="w-3 h-3" /> تتبع الطلب
          </a>
        </div>
      )}
    </div>
  );
}

// ─── My Orders Tab ────────────────────────────────────────────────────────────
function MyOrdersTab({ storeId, primary, slug }: { storeId: number; primary: string; slug: string }) {
  const [phone, setPhone] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [searched, setSearched] = useState(false);
  // ─── PIN state ───
  const [pinStep, setPinStep] = useState<"idle" | "verify" | "create" | "confirm" | "verified">("idle");
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [showOtp, setShowOtp] = useState(false);

  const checkPinExistsSearch = trpc.store.checkPinExists.useQuery(
    { storeId, phone: phone.trim() },
    { enabled: false }
  );
  const verifyPinSearch = trpc.store.verifyPin.useMutation({
    onSuccess: () => { setPinStep("verified"); setSearchPhone(phone.trim()); setSearched(true); },
    onError: (err) => toast.error(err.message),
  });
  const setPinSearch = trpc.store.setPin.useMutation({
    onSuccess: () => { toast.success("✅ تم حفظ الرقم السري"); setPinStep("verified"); setSearchPhone(phone.trim()); setSearched(true); },
    onError: (err) => toast.error(err.message),
  });
  const requestOtpSearch = trpc.store.requestPinReset.useMutation({
    onSuccess: () => { setShowOtp(true); toast.success("تم إرسال رمز OTP على جوالك"); },
    onError: (err) => toast.error(err.message),
  });
  const verifyOtpSearch = trpc.store.verifyOtpAndSetPin.useMutation({
    onSuccess: () => { toast.success("✅ تم تعيين رقم سري جديد"); setPinStep("verified"); setSearchPhone(phone.trim()); setSearched(true); },
    onError: (err) => toast.error(err.message),
  });

  const handleSearchClick = async () => {
    if (phone.trim().length < 7) { toast.error("يرجى إدخال رقم جوال صحيح"); return; }
    if (pinStep === "verified") { setSearchPhone(phone.trim()); setSearched(true); return; }
    const result = await checkPinExistsSearch.refetch();
    if (result.data?.exists) {
      setPinStep("verify");
    } else {
      setPinStep("create");
    }
    setPinValue(""); setPinConfirm("");
  };

  const { data: orders, isLoading, refetch } = trpc.store.getMyOrders.useQuery(
    { storeId, phone: searchPhone },
    { enabled: searched && searchPhone.length >= 7 && pinStep === "verified" }
  ) as any;

  // ─── شاشة PIN ───
  if (pinStep === "verify" || pinStep === "create" || pinStep === "confirm") {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 text-center space-y-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: `${primary}22` }}>
            <Lock className="w-8 h-8" style={{ color: primary }} />
          </div>
          {pinStep === "verify" && (
            <>
              <h3 className="text-white font-bold text-xl">أدخل رقمك السري</h3>
              <p className="text-slate-400 text-sm">لعرض طلباتك</p>
              <PinInput value={pinValue} onChange={setPinValue} />
              <Button
                className="w-full text-white font-bold py-3 rounded-xl"
                style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
                disabled={pinValue.length < 4 || verifyPinSearch.isPending}
                onClick={() => verifyPinSearch.mutate({ storeId, phone: phone.trim(), pin: pinValue })}
              >
                {verifyPinSearch.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> جاري...</> : "تأكيد"}
              </Button>
              {!showOtp && (
                <button className="text-slate-400 text-sm hover:text-cyan-400" onClick={() => requestOtpSearch.mutate({ storeId, phone: phone.trim() })}>
                  نسيت رقمك السري؟
                </button>
              )}
              {showOtp && (
                <div className="space-y-3">
                  <p className="text-slate-300 text-sm">أدخل رمز OTP المرسل على جوالك</p>
                  <Input value={otpValue} onChange={e => setOtpValue(e.target.value)} placeholder="رمز OTP" maxLength={6} className="bg-slate-800 border-slate-600 text-white text-center text-xl tracking-widest" dir="ltr" />
                  <Input type="password" placeholder="رقم سري جديد (4 أرقام)" maxLength={4} value={pinValue} onChange={e => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))} className="bg-slate-800 border-slate-600 text-white text-center text-xl tracking-widest" dir="ltr" />
                  <Button
                    className="w-full text-white font-bold py-3 rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
                    disabled={otpValue.length < 4 || pinValue.length < 4 || verifyOtpSearch.isPending}
                    onClick={() => verifyOtpSearch.mutate({ storeId, phone: phone.trim(), otp: otpValue, newPin: pinValue })}
                  >
                    {verifyOtpSearch.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> جاري...</> : "تعيين رقم سري جديد"}
                  </Button>
                </div>
              )}
              <button className="text-slate-500 text-xs" onClick={() => { setPinStep("idle"); setPinValue(""); setShowOtp(false); }}>← تغيير الرقم</button>
            </>
          )}
          {(pinStep === "create" || pinStep === "confirm") && (
            <>
              <h3 className="text-white font-bold text-xl">أنشئ رقمك السري</h3>
              <p className="text-slate-400 text-sm">سيحمي جميع طلباتك على هذا الجوال</p>
              {pinStep === "create" && (
                <>
                  <label className="text-slate-300 text-sm block">الرقم السري (4 أرقام)</label>
                  <PinInput value={pinValue} onChange={setPinValue} />
                  <Button
                    className="w-full text-white font-bold py-3 rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
                    disabled={pinValue.length < 4}
                    onClick={() => setPinStep("confirm")}
                  >تأكيد</Button>
                </>
              )}
              {pinStep === "confirm" && (
                <>
                  <label className="text-slate-300 text-sm block">تأكيد الرقم السري</label>
                  <PinInput value={pinConfirm} onChange={setPinConfirm} />
                  <Button
                    className="w-full text-white font-bold py-3 rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
                    disabled={pinConfirm.length < 4 || setPinSearch.isPending}
                    onClick={() => {
                      if (pinValue !== pinConfirm) { toast.error("الرقمان لا يتطابقان"); setPinConfirm(""); return; }
                      setPinSearch.mutate({ storeId, phone: phone.trim(), pin: pinValue });
                    }}
                  >
                    {setPinSearch.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> جاري...</> : "حفظ وعرض الطلبات"}
                  </Button>
                  <button className="text-slate-500 text-xs" onClick={() => { setPinStep("create"); setPinConfirm(""); }}>← تعديل</button>
                </>
              )}
              <button className="text-slate-500 text-xs" onClick={() => { setPinStep("idle"); setPinValue(""); setPinConfirm(""); }}>← تغيير الرقم</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 mb-6">
        <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-cyan-400" /> ابحث عن طلباتك
        </h2>
        <div className="flex gap-3">
          <Input
            type="tel" placeholder="أدخل رقم جوالك..."
            value={phone} onChange={(e) => { setPhone(e.target.value); if (pinStep === "verified") { setPinStep("idle"); setSearched(false); } }}
            onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
            className="bg-slate-800/60 border-slate-600 text-white placeholder:text-slate-500 flex-1" dir="ltr"
          />
          <Button onClick={handleSearchClick} disabled={isLoading || checkPinExistsSearch.isFetching} style={{ background: primary }} className="text-white font-bold px-6">
            {(isLoading || checkPinExistsSearch.isFetching) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-slate-500 text-xs mt-2">أدخل رقم الجوال ثم أدخل رقمك السري لعرض طلباتك</p>
      </div>

      {searched && pinStep === "verified" && (
        <div>
          {isLoading ? (
            <div className="text-center py-10">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
              <p className="text-slate-400">جاري البحث...</p>
            </div>
          ) : !orders || orders.length === 0 ? (
            <div className="text-center py-10 bg-slate-900/60 border border-slate-700/50 rounded-2xl">
              <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">لا توجد طلبات لهذا الرقم</p>
              <p className="text-slate-600 text-sm mt-1">تأكد من إدخال نفس الرقم المستخدم عند الطلب</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-400 text-sm">{orders.length} طلب</p>
                <button onClick={() => refetch()} className="text-cyan-400 text-sm flex items-center gap-1 hover:text-cyan-300">
                  <RefreshCw className="w-3 h-3" /> تحديث
                </button>
              </div>
              {(orders as any[]).map((order: any) => (
                <OrderCard key={order.id} order={order} primary={primary} slug={slug} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Order Tracking Page ──────────────────────────────────────────────────────
function OrderTrackingPage({
  token, store,
}: {
  token: string;
  store: { primaryColor?: string | null; secondaryColor?: string | null; bgStyle?: string | null; name: string; slug: string };
}) {
  const primary = store.primaryColor ?? "#6366f1";
  const secondary = store.secondaryColor ?? "#8b5cf6";
  const [showPass, setShowPass] = useState(false);

  const { data: order, isLoading, error, refetch } = trpc.store.getOrderByToken.useQuery(
    { token },
    { refetchInterval: 15000 }
  ) as any;

  const bgStyle = store.bgStyle ?? "dark";
  const pageBg = bgStyle === "light" ? "#f8fafc" : bgStyle === "gradient" ? `linear-gradient(160deg, ${primary}18 0%, #0f172a 100%)` : "#0f172a";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: pageBg }}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">جاري تحميل الطلب...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: pageBg }} dir="rtl">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
            <X className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">الطلب غير موجود</h1>
          <p className="text-slate-400">تأكد من صحة الرابط أو تواصل مع المتجر.</p>
          <a href={`/store/${store.slug}`} className="mt-6 inline-block text-cyan-400 hover:underline">العودة للمتجر</a>
        </div>
      </div>
    );
  }

  const st = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending;

  return (
    <div className="min-h-screen text-white" style={{ background: pageBg }} dir="rtl">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: `url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.1 }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${primary}33, #0f172a)` }} />
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
            <Wifi className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">{store.name}</h1>
          <p className="text-slate-400 text-sm">تتبع طلبك</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-16">
        {/* Order Info */}
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-white font-bold text-xl">طلب #{order.id}</h2>
              <p className="text-slate-500 text-sm mt-0.5">{order.productName}</p>
            </div>
            <span className={`text-sm font-bold px-4 py-1.5 rounded-full border ${st.bg} ${st.color}`}>{st.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-slate-500">الاسم</p><p className="text-white font-medium">{order.customerName}</p></div>
            <div><p className="text-slate-500">المبلغ</p><p className="font-bold" style={{ color: primary }}>{order.amount}</p></div>
            <div><p className="text-slate-500">تاريخ الطلب</p><p className="text-white">{new Date(order.createdAt).toLocaleDateString("ar-SA")}</p></div>
            <div><p className="text-slate-500">آخر تحديث</p><p className="text-white">{new Date(order.updatedAt).toLocaleDateString("ar-SA")}</p></div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 mb-6">
          <h3 className="text-white font-bold mb-5">حالة الطلب</h3>
          {[
            { key: "pending",   label: "تم استلام الطلب",  icon: Package },
            { key: "confirmed", label: "تم تأكيد الطلب",   icon: CheckCircle },
            { key: "delivered", label: "تم تسليم البطاقة", icon: Wifi },
          ].map((step) => {
            const statuses = ["pending", "confirmed", "delivered", "cancelled"];
            const currentIdx = statuses.indexOf(order.status);
            const stepIdx = statuses.indexOf(step.key);
            const isDone = currentIdx >= stepIdx && order.status !== "cancelled";
            const isCurrent = order.status === step.key;
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center gap-4 mb-4 last:mb-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${isDone ? "border-transparent" : "border-slate-600"}`}
                  style={isDone ? { background: primary } : {}}>
                  <Icon className={`w-5 h-5 ${isDone ? "text-white" : "text-slate-600"}`} />
                </div>
                <div className="flex-1">
                  <p className={`font-medium ${isDone ? "text-white" : "text-slate-600"}`}>{step.label}</p>
                  {isCurrent && order.status !== "delivered" && (
                    <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /> جاري المعالجة...
                    </p>
                  )}
                </div>
                {isDone && <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />}
              </div>
            );
          })}
          {order.status === "cancelled" && (
            <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
              <p className="text-red-400 font-medium">تم إلغاء هذا الطلب</p>
            </div>
          )}
        </div>

        {/* Card Credentials */}
        {order.status === "delivered" && (() => {
          const cards: { username: string; password: string | null }[] = (() => {
            try { if (order.cardsData) return JSON.parse(order.cardsData); } catch {}
            if (order.cardUsername) return [{ username: order.cardUsername, password: order.cardPassword ?? null }];
            return [];
          })();
          if (cards.length === 0) return null;
          return (
            <div className="bg-green-500/10 border border-green-500/40 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">
                    {cards.length > 1 ? `بطاقاتك جاهزة! 🎉 (${cards.length} كروت)` : 'بطاقتك جاهزة! 🎉'}
                  </h3>
                  <p className="text-slate-400 text-sm">استخدم البيانات التالية للاتصال بالإنترنت</p>
                </div>
              </div>
              <div className="space-y-4">
                {cards.map((card, idx) => (
                  <div key={idx} className={cards.length > 1 ? "border border-slate-700/50 rounded-xl p-4" : ""}>
                    {cards.length > 1 && (
                      <p className="text-slate-300 text-sm font-bold mb-3">كرت {idx + 1}</p>
                    )}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-slate-500 text-xs mb-0.5">اسم المستخدم</p>
                          <p className="text-white font-mono font-bold text-lg">{card.username}</p>
                        </div>
                        <CopyBtn text={card.username} />
                      </div>
                      {card.password && (
                        <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-3">
                          <div>
                            <p className="text-slate-500 text-xs mb-0.5">كلمة المرور</p>
                            <p className="text-white font-mono font-bold text-lg">{showPass ? card.password : '••••••••••'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setShowPass(!showPass)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                              {showPass ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                            </button>
                            <CopyBtn text={card.password} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Auto refresh notice */}
        {(order.status === "pending" || order.status === "confirmed") && (
          <div className="text-center mb-4">
            <button onClick={() => refetch()} className="text-slate-500 text-xs flex items-center justify-center gap-1 mx-auto hover:text-slate-300 transition-colors">
              <RefreshCw className="w-3 h-3" /> يتم التحديث تلقائياً كل 15 ثانية — اضغط للتحديث الآن
            </button>
          </div>
        )}

        <div className="text-center mt-4">
          <a href={`/store/${store.slug}`} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">← العودة إلى المتجر</a>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StorePage() {
  const { slug, token } = useParams<{ slug: string; token?: string }>();
  const [activeTab, setActiveTab] = useState<PageTab>("shop");
  const [step, setStep] = useState<OrderStep>("browse");
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string; price: string; availableStock: number } | null>(null);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", notes: "" });
  const [quantity, setQuantity] = useState(1);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderToken, setOrderToken] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // PIN state
  const [pinMode, setPinMode] = useState<PinMode>("verify");
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [pinVerified, setPinVerified] = useState(false);

  const { data: store, isLoading: storeLoading, error: storeError } = trpc.store.getStore.useQuery(
    { slug: slug ?? "" }, { enabled: !!slug }
  );
  const { data: products, isLoading: productsLoading } = trpc.store.getProducts.useQuery(
    { storeId: store?.id ?? 0 }, { enabled: !!store?.id }
  );

  const createOrder = trpc.store.createOrder.useMutation({
    onSuccess: (data) => { setOrderId(data.orderId); setOrderToken(data.orderToken); setStep("payment"); },
    onError: (err) => toast.error(err.message),
  });
  const checkPinExists = trpc.store.checkPinExists.useQuery(
    { storeId: store?.id ?? 0, phone: form.customerPhone.trim() },
    { enabled: false }
  );
  const setPin = trpc.store.setPin.useMutation({
    onSuccess: () => { toast.success("تم حفظ الرقم السري"); setPinVerified(true); handleSubmitOrder(); },
    onError: (err) => toast.error(err.message),
  });
  const verifyPin = trpc.store.verifyPin.useMutation({
    onSuccess: () => { toast.success("تم التحقق بنجاح"); setPinVerified(true); handleSubmitOrder(); },
    onError: (err) => toast.error(err.message),
  });
  const requestPinReset = trpc.store.requestPinReset.useMutation({
    onSuccess: (data) => {
      if (data.method === "sms") { setPinMode("otp"); toast.success("تم إرسال رمز OTP على جوالك"); }
      else { toast.info("تواصل مع المتجر لإعادة تعيين رقمك السري"); }
    },
    onError: (err) => toast.error(err.message),
  });
  const verifyOtpAndSetPin = trpc.store.verifyOtpAndSetPin.useMutation({
    onSuccess: () => { toast.success("تم إعادة تعيين الرقم السري"); setPinMode("verify"); setPinValue(""); setOtpValue(""); },
    onError: (err) => toast.error(err.message),
  });
  const uploadReceipt = trpc.store.uploadReceipt.useMutation({
    onSuccess: () => setStep("success"),
    onError: (err) => toast.error(err.message),
  });

  const handleSelectProduct = (p: typeof selectedProduct) => {
    setSelectedProduct(p); setStep("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleSubmitOrder = () => {
    if (!store || !selectedProduct) return;
    if (!form.customerName.trim() || !form.customerPhone.trim()) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    createOrder.mutate({ storeId: store.id, productId: selectedProduct.id, customerName: form.customerName, customerPhone: form.customerPhone, quantity, notes: form.notes || undefined });
  };
  const handleFormNext = async () => {
    if (!store || !selectedProduct) return;
    if (!form.customerName.trim() || !form.customerPhone.trim()) { toast.error("يرجى ملء جميع الحقول المطلوبة"); return; }
    // تحقق من وجود PIN
    const result = await checkPinExists.refetch();
    const pinData = result.data;
    if (pinData?.adminReset) {
      // الأدمن طلب إعادة تعيين — إنشاء PIN جديد
      setPinMode("create"); setPinValue(""); setPinConfirm(""); setStep("pin");
    } else if (pinData?.exists) {
      // يوجد PIN — طلب التحقق
      setPinMode("verify"); setPinValue(""); setStep("pin");
    } else {
      // أول مرة — إنشاء PIN
      setPinMode("create"); setPinValue(""); setPinConfirm(""); setStep("pin");
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };
  const handleUploadReceipt = () => {
    if (!orderId || !receiptFile) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      uploadReceipt.mutate({ orderId, receiptBase64: base64, mimeType: receiptFile.type });
    };
    reader.readAsDataURL(receiptFile);
  };
  const resetAll = () => { setStep("browse"); setSelectedProduct(null); setOrderId(null); setOrderToken(null); setReceiptFile(null); setReceiptPreview(null); setForm({ customerName: "", customerPhone: "", notes: "" }); setQuantity(1); setPinValue(""); setPinConfirm(""); setOtpValue(""); setPinVerified(false); };

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center"><Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" /><p className="text-slate-400">جاري تحميل المتجر...</p></div>
      </div>
    );
  }
  if (storeError || !store) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center" dir="rtl">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6"><X className="w-10 h-10 text-red-400" /></div>
          <h1 className="text-2xl font-bold text-white mb-3">المتجر غير موجود</h1>
          <p className="text-slate-400">لم يتم العثور على متجر بهذا الرابط أو أنه غير نشط حالياً.</p>
        </div>
      </div>
    );
  }

  // ─── Order Tracking Page ─────────────────────────────────────────────────────
  if (token) {
    return <OrderTrackingPage token={token} store={store} />;
  }

  const primary = store.primaryColor ?? "#6366f1";
  const secondary = store.secondaryColor ?? "#8b5cf6";
  const bgStyle = store.bgStyle ?? "dark";
  const pageBg = bgStyle === "light" ? "#f8fafc" : bgStyle === "gradient" ? `linear-gradient(160deg, ${primary}18 0%, ${secondary}28 40%, #0f172a 100%)` : bgStyle === "custom" ? `${primary}11` : "#0f172a";
  const textColor = bgStyle === "light" ? "#1e293b" : "#ffffff";

  // ─── Success Step ────────────────────────────────────────────────────────────
  if (step === "success") {
    const trackUrl = orderToken ? `${window.location.origin}/store/${slug}/order/${orderToken}` : null;
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center" dir="rtl">
        <div className="text-center max-w-md px-6">
          <div className="w-24 h-24 rounded-full bg-green-500/10 border-2 border-green-500/40 flex items-center justify-center mx-auto mb-6 animate-pulse">
            <CheckCircle className="w-12 h-12 text-green-400" />
          </div>
          <h1 className="text-3xl font-black text-white mb-3">تم استلام طلبك! 🎉</h1>
          <p className="text-slate-400 mb-2">رقم الطلب: <span className="text-cyan-400 font-bold">#{orderId}</span></p>
          <p className="text-slate-400 mb-6">سيتم التواصل معك على الرقم المُدخَل خلال أقل من ساعة لتسليم البطاقة.</p>

          {trackUrl && (
            <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-4 mb-6 text-right">
              <p className="text-cyan-400 font-bold text-sm mb-2">🔗 رابط تتبع طلبك</p>
              <p className="text-slate-400 text-xs mb-3">احفظ هذا الرابط لمتابعة حالة طلبك وعرض بطاقتك عند التسليم</p>
              <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2">
                <p className="text-white text-xs font-mono flex-1 truncate" dir="ltr">{trackUrl}</p>
                <CopyBtn text={trackUrl} />
              </div>
              <a href={trackUrl} className="mt-2 block text-center text-cyan-400 text-xs hover:underline">فتح صفحة التتبع →</a>
            </div>
          )}

          {store.whatsappPhone && (
            <a href={`https://wa.me/${store.whatsappPhone.replace(/\D/g, "")}?text=مرحباً، أرسلت طلب رقم ${orderId} في متجر ${store.name}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl font-bold transition-colors mb-4">
              <Phone className="w-5 h-5" /> تواصل عبر واتساب
            </a>
          )}
          <div><button onClick={resetAll} className="text-slate-400 hover:text-white underline text-sm transition-colors">العودة إلى المتجر</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ background: pageBg, color: textColor }} dir="rtl">
      {/* ─── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ backgroundImage: `url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "center", opacity: bgStyle === "light" ? 0.05 : 0.15 }} />
        <div className="absolute inset-0" style={{ background: bgStyle === "light" ? `linear-gradient(to bottom, ${primary}22, white)` : `linear-gradient(to bottom, ${primary}44, ${bgStyle === "gradient" ? secondary + "33" : "#0f172a"} 100%)` }} />
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-16 text-center">
          {store.logoUrl ? (
            <img src={store.logoUrl} alt={store.name} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-6 border-2" style={{ borderColor: primary + "80", boxShadow: `0 0 30px ${primary}50` }} />
          ) : (
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: `0 0 30px ${primary}60` }}>
              <Wifi className="w-10 h-10 text-white" />
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3 drop-shadow-lg">{store.name}</h1>
          {store.description && <p className="text-slate-300 text-lg max-w-xl mx-auto mb-6">{store.description}</p>}
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            {[{ icon: Zap, text: "تسليم فوري" }, { icon: Shield, text: "دفع آمن" }, { icon: Clock, text: "دعم 24/7" }, { icon: Star, text: "جودة مضمونة" }].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-sm text-white">
                <Icon className="w-4 h-4 text-cyan-400" />{text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Tabs (only on browse step) ───────────────────────────────────── */}
      {step === "browse" && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="flex gap-2 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-1.5 w-fit mx-auto mb-8">
            {([["shop", "المنتجات", ShoppingCart], ["myorders", "طلباتي", Package]] as const).map(([tab, label, Icon]) => (
              <button key={tab} onClick={() => setActiveTab(tab as PageTab)}
                className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === tab ? "text-white" : "text-slate-400 hover:text-slate-300"}`}
                style={activeTab === tab ? { background: primary } : {}}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pb-16">

        {/* My Orders Tab */}
        {step === "browse" && activeTab === "myorders" && (
          <MyOrdersTab storeId={store.id} primary={primary} slug={slug ?? ""} />
        )}

        {/* Shop Tab — Browse */}
        {step === "browse" && activeTab === "shop" && (
          <div>
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-white mb-2">اختر الباقة المناسبة</h2>
              <p className="text-slate-400">اختر من بين باقاتنا المتنوعة واحصل على بطاقتك فوراً</p>
            </div>
            {productsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => <div key={i} className="h-48 rounded-2xl bg-slate-800/50 animate-pulse" />)}
              </div>
            ) : !products || products.length === 0 ? (
              <div className="text-center py-16">
                <Package className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                <p className="text-slate-400 text-lg">لا توجد باقات متاحة حالياً</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} primary={primary} secondary={secondary} onSelect={() => handleSelectProduct(p)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Order Form */}
        {step === "form" && selectedProduct && (
          <div className="max-w-lg mx-auto">
            <button onClick={() => setStep("browse")} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors">
              <ArrowRight className="w-4 h-4 rotate-180" /> العودة للمنتجات
            </button>
            <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: primary }}>
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold">{selectedProduct.name}</h3>
                  <p className="font-bold" style={{ color: primary }}>
                    {quantity > 1
                      ? `${(parseFloat(selectedProduct.price) * quantity).toFixed(2)} (${quantity} × ${selectedProduct.price})`
                      : selectedProduct.price}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 space-y-4">
              <h2 className="text-white font-bold text-lg mb-2">بيانات الطلب</h2>
              {/* حقل الكمية */}
              <div>
                <Label className="text-slate-300 mb-1.5 block">عدد الكروت</Label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl border border-slate-600 text-white text-xl font-bold flex items-center justify-center hover:bg-slate-700 transition-colors"
                  >-</button>
                  <span className="text-white font-bold text-xl w-8 text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(q => Math.min(20, q + 1))}
                    className="w-10 h-10 rounded-xl border border-slate-600 text-white text-xl font-bold flex items-center justify-center hover:bg-slate-700 transition-colors"
                  >+</button>
                  <span className="text-slate-400 text-sm mr-2">من 1 إلى 20 كرت</span>
                </div>
                {quantity > 1 && (
                  <p className="text-sm mt-1.5" style={{ color: primary }}>
                    المجموع: {(parseFloat(selectedProduct.price) * quantity).toFixed(2)}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-slate-300 mb-1.5 block">الاسم الكامل *</Label>
                <Input placeholder="أدخل اسمك الكامل" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="bg-slate-800/60 border-slate-600 text-white placeholder:text-slate-500" />
              </div>
              <div>
                <Label className="text-slate-300 mb-1.5 block">رقم الجوال *</Label>
                <Input type="tel" placeholder="05xxxxxxxx" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className="bg-slate-800/60 border-slate-600 text-white placeholder:text-slate-500" dir="ltr" />
                <p className="text-slate-500 text-xs mt-1">سيُستخدم لإرسال البطاقة ولمتابعة طلباتك لاحقاً</p>
              </div>
              <div>
                <Label className="text-slate-300 mb-1.5 block">ملاحظات (اختياري)</Label>
                <Textarea placeholder="أي ملاحظات إضافية..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-slate-800/60 border-slate-600 text-white placeholder:text-slate-500" rows={3} />
              </div>
              <Button onClick={handleFormNext} disabled={checkPinExists.isFetching} className="w-full text-white font-bold py-3 rounded-xl text-lg" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
                {checkPinExists.isFetching ? <><Loader2 className="w-5 h-5 animate-spin ml-2" /> جاري التحقق...</> : <><ShoppingCart className="w-5 h-5 ml-2" /> تأكيد الطلب</>}
              </Button>
            </div>
          </div>
        )}

        {/* PIN Step */}
        {step === "pin" && (
          <div className="max-w-md mx-auto">
            <button onClick={() => setStep("form")} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors">
              <ArrowRight className="w-4 h-4 rotate-180" /> العودة
            </button>
            <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-cyan-400" />
                </div>
                {pinMode === "verify" && (
                  <>
                    <h2 className="text-white font-bold text-xl mb-2">أدخل رقمك السري</h2>
                    <p className="text-slate-400 text-sm">رقم سري من 4 أرقام مرتبط بجوالك {form.customerPhone}</p>
                  </>
                )}
                {pinMode === "create" && (
                  <>
                    <h2 className="text-white font-bold text-xl mb-2">أنشئ رقمك السري</h2>
                    <p className="text-slate-400 text-sm">سيُستخدم لحماية طلباتك القادمة على هذا الجوال</p>
                  </>
                )}
                {pinMode === "forgot" && (
                  <>
                    <h2 className="text-white font-bold text-xl mb-2">نسيت رقمك السري؟</h2>
                    <p className="text-slate-400 text-sm">سنرسل رمز تحقق على جوالك {form.customerPhone}</p>
                  </>
                )}
                {pinMode === "otp" && (
                  <>
                    <h2 className="text-white font-bold text-xl mb-2">أدخل رمز التحقق</h2>
                    <p className="text-slate-400 text-sm">تم إرسال رمز مؤقت على {form.customerPhone}</p>
                  </>
                )}
              </div>

              {/* Verify Mode */}
              {pinMode === "verify" && (
                <div className="space-y-6">
                  <PinInput value={pinValue} onChange={setPinValue} disabled={verifyPin.isPending} />
                  <Button
                    onClick={() => { if (pinValue.length === 4 && store) verifyPin.mutate({ storeId: store.id, phone: form.customerPhone.trim(), pin: pinValue }); }}
                    disabled={pinValue.length < 4 || verifyPin.isPending}
                    className="w-full text-white font-bold py-3 rounded-xl" style={{ background: primary }}>
                    {verifyPin.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> جاري التحقق...</> : "تأكيد"}
                  </Button>
                  <button onClick={() => { setPinMode("forgot"); setPinValue(""); }} className="w-full text-slate-400 text-sm hover:text-cyan-400 transition-colors">
                    نسيت رقمك السري؟
                  </button>
                </div>
              )}

              {/* Create Mode */}
              {pinMode === "create" && (
                <div className="space-y-6">
                  <div>
                    <p className="text-slate-400 text-sm text-center mb-3">الرقم السري</p>
                    <PinInput value={pinValue} onChange={setPinValue} disabled={setPin.isPending} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm text-center mb-3">تأكيد الرقم السري</p>
                    <PinInput value={pinConfirm} onChange={setPinConfirm} disabled={setPin.isPending} />
                  </div>
                  {pinValue.length === 4 && pinConfirm.length === 4 && pinValue !== pinConfirm && (
                    <p className="text-red-400 text-sm text-center">الرقمان غير متطابقَين</p>
                  )}
                  <Button
                    onClick={() => { if (pinValue.length === 4 && pinValue === pinConfirm && store) setPin.mutate({ storeId: store.id, phone: form.customerPhone.trim(), pin: pinValue }); }}
                    disabled={pinValue.length < 4 || pinConfirm.length < 4 || pinValue !== pinConfirm || setPin.isPending}
                    className="w-full text-white font-bold py-3 rounded-xl" style={{ background: primary }}>
                    {setPin.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> جاري الحفظ...</> : "حفظ وتأكيد الطلب"}
                  </Button>
                </div>
              )}

              {/* Forgot Mode */}
              {pinMode === "forgot" && (
                <div className="space-y-6">
                  <div className="bg-slate-800/60 rounded-xl p-4 text-center">
                    <p className="text-slate-300 text-sm">رقم الجوال: <span className="text-white font-bold" dir="ltr">{form.customerPhone}</span></p>
                  </div>
                  <Button
                    onClick={() => { if (store) requestPinReset.mutate({ storeId: store.id, phone: form.customerPhone.trim() }); }}
                    disabled={requestPinReset.isPending}
                    className="w-full text-white font-bold py-3 rounded-xl" style={{ background: primary }}>
                    {requestPinReset.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> جاري الإرسال...</> : "إرسال رمز التحقق"}
                  </Button>
                  {requestPinReset.data?.method === "contact_admin" && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                      <KeyRound className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                      <p className="text-yellow-300 text-sm font-bold mb-1">تواصل مع المتجر</p>
                      <p className="text-slate-400 text-xs">اطلب من صاحب المتجر إعادة تعيين رقمك السري</p>
                    </div>
                  )}
                  <button onClick={() => setPinMode("verify")} className="w-full text-slate-400 text-sm hover:text-white transition-colors">
                    العودة لإدخال الرقم السري
                  </button>
                </div>
              )}

              {/* OTP Mode */}
              {pinMode === "otp" && (
                <div className="space-y-6">
                  <div>
                    <p className="text-slate-400 text-sm text-center mb-3">رمز التحقق (4 أرقام)</p>
                    <PinInput value={otpValue} onChange={setOtpValue} disabled={verifyOtpAndSetPin.isPending} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm text-center mb-3">الرقم السري الجديد</p>
                    <PinInput value={pinValue} onChange={setPinValue} disabled={verifyOtpAndSetPin.isPending} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm text-center mb-3">تأكيد الرقم السري الجديد</p>
                    <PinInput value={pinConfirm} onChange={setPinConfirm} disabled={verifyOtpAndSetPin.isPending} />
                  </div>
                  <Button
                    onClick={() => { if (otpValue.length === 4 && pinValue.length === 4 && pinValue === pinConfirm && store) verifyOtpAndSetPin.mutate({ storeId: store.id, phone: form.customerPhone.trim(), otp: otpValue, newPin: pinValue }); }}
                    disabled={otpValue.length < 4 || pinValue.length < 4 || pinValue !== pinConfirm || verifyOtpAndSetPin.isPending}
                    className="w-full text-white font-bold py-3 rounded-xl" style={{ background: primary }}>
                    {verifyOtpAndSetPin.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> جاري التحقق...</> : "تأكيد وتعيين الرقم الجديد"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Step */}
        {step === "payment" && orderId && (
          <div className="max-w-lg mx-auto">
            <div className="bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">تم إنشاء الطلب بنجاح</h3>
                  <p className="text-slate-400 text-sm">رقم الطلب: <span className="text-cyan-400">#{orderId}</span></p>
                </div>
              </div>
            </div>
            <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Phone className="w-5 h-5 text-cyan-400" /> تعليمات الدفع</h2>
              {store.paymentPhone && (
                <div className="bg-slate-800/60 rounded-xl p-4 mb-4 text-center">
                  <p className="text-slate-400 text-sm mb-1">رقم المحفظة للتحويل</p>
                  <p className="text-2xl font-black text-cyan-400 tracking-widest">{store.paymentPhone}</p>
                </div>
              )}
              {store.paymentInstructions && (
                <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap bg-slate-800/40 rounded-xl p-4">{store.paymentInstructions}</div>
              )}
              {!store.paymentPhone && !store.paymentInstructions && <p className="text-slate-400">يرجى التواصل مع المتجر لمعرفة طريقة الدفع.</p>}
            </div>
            <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Upload className="w-5 h-5 text-cyan-400" /> رفع إيصال الدفع</h2>
              {receiptPreview ? (
                <div className="relative mb-4">
                  <img src={receiptPreview} alt="إيصال" className="w-full max-h-60 object-contain rounded-xl border border-slate-600" />
                  <button onClick={() => { setReceiptFile(null); setReceiptPreview(null); }} className="absolute top-2 left-2 w-8 h-8 rounded-full bg-red-500/80 flex items-center justify-center hover:bg-red-500 transition-colors">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: '8px' }}>
                  <label
                    htmlFor="receipt-file-input"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '16px',
                      background: 'linear-gradient(135deg, #0e7490, #1d4ed8)',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '17px',
                      textAlign: 'center',
                      boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
                      border: 'none',
                      userSelect: 'none',
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span>📎 اختر صورة الإيصال</span>
                  </label>
                  <input
                    id="receipt-file-input"
                    type="file"
                    accept="image/*"
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: '8px',
                      padding: '8px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#94a3b8',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                    onChange={handleFileChange}
                  />
                  <p style={{ color: '#475569', fontSize: '11px', textAlign: 'center', marginTop: '4px' }}>PNG, JPG, JPEG</p>
                </div>
              )}
              <Button onClick={handleUploadReceipt} disabled={!receiptFile || uploadReceipt.isPending} className="w-full mt-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 rounded-xl text-lg disabled:opacity-50">
                {uploadReceipt.isPending ? <><Loader2 className="w-5 h-5 animate-spin ml-2" /> جاري الإرسال...</> : <><CheckCircle className="w-5 h-5 ml-2" /> إرسال الطلب</>}
              </Button>
              <p className="text-slate-500 text-xs text-center mt-3">سيتم مراجعة الإيصال وإرسال البطاقة إليك خلال أقل من ساعة</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-800 py-6 text-center">
        <p className="text-slate-600 text-sm">{store.name} — مدعوم بواسطة <span className="text-cyan-600 font-medium">Radius Pro</span></p>
      </div>
    </div>
  );
}
