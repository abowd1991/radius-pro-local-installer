/**
 * StoreManagement — لوحة تحكم المتجر للعميل
 * إعداد المتجر + إدارة المنتجات + إدارة الطلبات
 */
import { useState, useRef } from "react";
import { parseDbDate } from '@/lib/dateFormat';
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Store, Package, ShoppingBag, Settings, Plus, Edit2, Trash2, CheckCircle,
  XCircle, ExternalLink, Copy, Loader2, RefreshCw, Eye, Clock, TrendingUp,
  AlertTriangle, ChevronDown, ChevronUp, Image as ImageIcon, MessageSquare, Link2,
  Wifi, Code2, Palette, ChevronRight, Lock, KeyRound
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
type Tab = "setup" | "products" | "orders";

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "معلق", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    confirmed: { label: "مؤكد", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    delivered: { label: "مُسلَّم", className: "bg-green-500/20 text-green-400 border-green-500/30" },
    cancelled: { label: "ملغي", className: "bg-red-500/20 text-red-400 border-red-500/30" },
    partial: { label: "جزئي", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  };
  const s = map[status] ?? { label: status, className: "bg-slate-500/20 text-slate-400 border-slate-500/30" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.className}`}>{s.label}</span>;
}

// ─── Hotspot Button Code Generator ───────────────────────────────────────────
const HOTSPOT_DESIGNS = [
  {
    id: "modern",
    label: "عصري",
    preview: (color: string) => `background:${color};color:#fff;border-radius:10px;padding:13px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;border:none;cursor:pointer;width:100%;display:block;text-decoration:none;text-align:center;box-shadow:0 4px 15px ${color}55;`,
    generate: (color: string, url: string, text: string) =>
      `<a href="${url}" style="background:${color};color:#fff;border-radius:10px;padding:13px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;display:block;text-decoration:none;text-align:center;box-shadow:0 4px 15px ${color}55;margin-top:12px;">${text}</a>`,
  },
  {
    id: "outline",
    label: "إطار",
    preview: (color: string) => `background:transparent;color:${color};border-radius:10px;padding:12px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;border:2px solid ${color};cursor:pointer;width:100%;display:block;text-decoration:none;text-align:center;`,
    generate: (color: string, url: string, text: string) =>
      `<a href="${url}" style="background:transparent;color:${color};border-radius:10px;padding:12px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;display:block;text-decoration:none;text-align:center;border:2px solid ${color};margin-top:12px;">${text}</a>`,
  },
  {
    id: "gradient",
    label: "تدرج",
    preview: (color: string) => `background:linear-gradient(135deg,${color},${color}99);color:#fff;border-radius:10px;padding:13px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;border:none;cursor:pointer;width:100%;display:block;text-decoration:none;text-align:center;`,
    generate: (color: string, url: string, text: string) =>
      `<a href="${url}" style="background:linear-gradient(135deg,${color},${color}99);color:#fff;border-radius:10px;padding:13px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;display:block;text-decoration:none;text-align:center;margin-top:12px;">${text}</a>`,
  },
  {
    id: "pill",
    label: "دائري",
    preview: (color: string) => `background:${color};color:#fff;border-radius:50px;padding:13px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;border:none;cursor:pointer;width:100%;display:block;text-decoration:none;text-align:center;`,
    generate: (color: string, url: string, text: string) =>
      `<a href="${url}" style="background:${color};color:#fff;border-radius:50px;padding:13px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;display:block;text-decoration:none;text-align:center;margin-top:12px;">${text}</a>`,
  },
  {
    id: "dark",
    label: "داكن",
    preview: (_color: string) => `background:#1e293b;color:#fff;border-radius:10px;padding:13px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;border:none;cursor:pointer;width:100%;display:block;text-decoration:none;text-align:center;border:1px solid #334155;`,
    generate: (_color: string, url: string, text: string) =>
      `<a href="${url}" style="background:#1e293b;color:#fff;border-radius:10px;padding:13px 20px;font-weight:700;font-size:15px;font-family:Arial,sans-serif;display:block;text-decoration:none;text-align:center;border:1px solid #334155;margin-top:12px;">${text}</a>`,
  },
];

// ─── Button Sizes ────────────────────────────────────────────────────────────
const BTN_SIZES = [
  { id: "sm", label: "صغير",  padding: "8px 16px",  fontSize: "13px" },
  { id: "md", label: "متوسط", padding: "12px 20px", fontSize: "15px" },
  { id: "lg", label: "كبير",  padding: "16px 24px", fontSize: "18px" },
];

// ─── Cart Icons ───────────────────────────────────────────────────────────────
const CART_ICONS = [
  { id: "none",  label: "بدون",   svg: "" },
  {
    id: "cart", label: "سلة",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-left:6px"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  },
  {
    id: "bag", label: "حقيبة",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-left:6px"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  },
  {
    id: "wifi", label: "واي فاي",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-left:6px"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
  },
  {
    id: "star", label: "نجمة",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="display:inline;vertical-align:middle;margin-left:6px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  },
];

function HotspotCodeSection({ storeUrl }: { storeUrl: string }) {
  const [design, setDesign] = useState("modern");
  const [color, setColor] = useState("#6366f1");
  const [btnText, setBtnText] = useState("اشتر بطاقة إنترنت");
  const [size, setSize] = useState("md");
  const [iconId, setIconId] = useState("cart");
  const [copied, setCopied] = useState<"btn" | "wg" | null>(null);

  const selectedDesign = HOTSPOT_DESIGNS.find(d => d.id === design) ?? HOTSPOT_DESIGNS[0];
  const selectedSize = BTN_SIZES.find(s => s.id === size) ?? BTN_SIZES[1];
  const selectedIcon = CART_ICONS.find(i => i.id === iconId) ?? CART_ICONS[0];

  // بناء الكود مع الحجم والأيقونة
  const fullLabel = selectedIcon.svg ? `${btnText}${selectedIcon.svg}` : btnText;
  // Intent URL يجبر Android على فتح Chrome مباشرة بدل Captive Portal WebView
  const intentUrl = `intent://${storeUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(storeUrl)};end`;
  const normalBtn = selectedDesign
    .generate(color, storeUrl, fullLabel)
    .replace(/padding:[^;]+;/, `padding:${selectedSize.padding};`)
    .replace(/font-size:[^;]+;/, `font-size:${selectedSize.fontSize};`);
  const intentBtn = selectedDesign
    .generate(color, intentUrl, `${fullLabel} (Android Chrome)`)
    .replace(/padding:[^;]+;/, `padding:${selectedSize.padding};`)
    .replace(/font-size:[^;]+;/, `font-size:${selectedSize.fontSize};`);
  const generatedCode = `<!-- زر يعمل على جميع المتصفحات -->
${normalBtn}

<!-- زر يفتح Chrome مباشرة على Android (الأفضل لـ Hotspot) -->
${intentBtn}`;

  const walledGardenCmd = `/ip hotspot walled-garden add dst-host=*.radius-pro.com action=allow`;

  const copyText = async (text: string, key: "btn" | "wg") => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // بناء style المعاينة
  const previewStyleStr = selectedDesign.preview(color)
    .replace(/padding:[^;]+;/, `padding:${selectedSize.padding};`)
    .replace(/font-size:[^;]+;/, `font-size:${selectedSize.fontSize};`);
  const previewStyle = Object.fromEntries(
    previewStyleStr.split(";").filter(Boolean).map((s: string) => {
      const [k, ...v] = s.split(":");
      return [k.trim().replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase()), v.join(":").trim()];
    })
  ) as React.CSSProperties;

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center">
          <Wifi className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-white font-bold text-sm">كود Hotspot</h3>
          <p className="text-slate-400 text-xs">أضف زر شراء في صفحة تسجيل دخول الـ Hotspot</p>
        </div>
      </div>

      {/* اختيار التصميم */}
      <div>
        <p className="text-slate-300 text-xs font-semibold mb-2 flex items-center gap-1"><Palette className="w-3.5 h-3.5" /> التصميم</p>
        <div className="grid grid-cols-5 gap-2">
          {HOTSPOT_DESIGNS.map(d => (
            <button
              key={d.id}
              onClick={() => setDesign(d.id)}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${
                design === d.id
                  ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                  : "border-slate-600 bg-slate-700/40 text-slate-400 hover:border-slate-500"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* الحجم والأيقونة */}
      <div className="grid grid-cols-2 gap-3">
        {/* حجم الزر */}
        <div>
          <p className="text-slate-300 text-xs font-semibold mb-2">حجم الزر</p>
          <div className="flex gap-2">
            {BTN_SIZES.map(s => (
              <button
                key={s.id}
                onClick={() => setSize(s.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  size === s.id
                    ? "border-violet-500 bg-violet-500/20 text-violet-300"
                    : "border-slate-600 bg-slate-700/40 text-slate-400 hover:border-slate-500"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {/* الأيقونة */}
        <div>
          <p className="text-slate-300 text-xs font-semibold mb-2">أيقونة</p>
          <div className="flex gap-1.5 flex-wrap">
            {CART_ICONS.map(ic => (
              <button
                key={ic.id}
                onClick={() => setIconId(ic.id)}
                className={`py-1 px-2 rounded-lg text-xs font-medium border transition-all ${
                  iconId === ic.id
                    ? "border-pink-500 bg-pink-500/20 text-pink-300"
                    : "border-slate-600 bg-slate-700/40 text-slate-400 hover:border-slate-500"
                }`}
              >
                {ic.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* اللون والنص */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-slate-300 text-xs font-semibold mb-2">لون الزر</p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-9 h-9 rounded-lg border border-slate-600 cursor-pointer bg-transparent p-0.5"
            />
            <input
              type="text"
              value={color}
              onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setColor(e.target.value); }}
              className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs font-mono"
            />
          </div>
          <div className="flex gap-1.5 mt-2">
            {["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#1e293b"].map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  color === c ? "border-white scale-125" : "border-transparent hover:border-slate-400"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-slate-300 text-xs font-semibold mb-2">نص الزر</p>
          <input
            type="text"
            value={btnText}
            onChange={e => setBtnText(e.target.value)}
            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
            placeholder="نص الزر"
          />
        </div>
      </div>

      {/* معاينة الزر */}
      <div>
        <p className="text-slate-300 text-xs font-semibold mb-2">معاينة</p>
        <div className="bg-white rounded-xl p-4">
          <div className="text-center">
            <p style={{ color: "#1e293b", fontFamily: "Arial", fontSize: 13, marginBottom: 6 }}>مرحباً بك في الشبكة</p>
            <input readOnly value="" placeholder="اسم المستخدم"
              style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 10px", width: "100%", marginBottom: 6, fontSize: 13, color: "#1e293b" }} />
            <input readOnly value="" placeholder="كلمة المرور"
              style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 10px", width: "100%", marginBottom: 6, fontSize: 13, color: "#1e293b" }} />
            <button style={{ background: "#3b82f6", color: "#fff", borderRadius: 6, padding: "8px 20px", border: "none", width: "100%", fontSize: 13, fontWeight: 700, fontFamily: "Arial", marginBottom: 0 }}>
              تسجيل الدخول
            </button>
            <a href="#" style={previewStyle} onClick={e => e.preventDefault()}>
              {btnText}
              {selectedIcon.id !== "none" && (
                <svg xmlns="http://www.w3.org/2000/svg" width={selectedSize.id === "lg" ? 18 : selectedSize.id === "sm" ? 13 : 15}
                  height={selectedSize.id === "lg" ? 18 : selectedSize.id === "sm" ? 13 : 15}
                  viewBox="0 0 24 24" fill={selectedIcon.id === "star" ? "currentColor" : "none"}
                  stroke={selectedIcon.id === "star" ? "none" : "currentColor"}
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }}>
                  {selectedIcon.id === "cart" && <>
                    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                  </>}
                  {selectedIcon.id === "bag" && <>
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 0 1-8 0"/>
                  </>}
                  {selectedIcon.id === "wifi" && <>
                    <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                    <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                    <line x1="12" y1="20" x2="12.01" y2="20"/>
                  </>}
                  {selectedIcon.id === "star" && <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>}
                </svg>
              )}
            </a>
          </div>
        </div>
      </div>

      {/* كود الزر */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-slate-300 text-xs font-semibold flex items-center gap-1"><Code2 className="w-3.5 h-3.5" /> كود HTML للزر</p>
          <button
            onClick={() => copyText(generatedCode, "btn")}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            {copied === "btn" ? <><CheckCircle className="w-3.5 h-3.5 text-green-400" /> تم النسخ!</> : <><Copy className="w-3.5 h-3.5" /> نسخ</>}
          </button>
        </div>
        <pre className="bg-slate-900/80 border border-slate-700 rounded-xl p-3 text-xs text-cyan-300 font-mono overflow-x-auto whitespace-pre-wrap break-all">{generatedCode}</pre>
      </div>

      {/* Walled Garden */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-amber-300 font-bold text-xs mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> مهم: Walled Garden
            </p>
            <p className="text-slate-400 text-xs mb-2">أضف هذا الأمر في MikroTik حتى يتمكن الزبون من فتح صفحة المتجر قبل تسجيل الدخول:</p>
            <code className="text-amber-200 text-xs font-mono bg-amber-500/10 px-2 py-1 rounded block">{walledGardenCmd}</code>
          </div>
          <button
            onClick={() => copyText(walledGardenCmd, "wg")}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors flex-shrink-0 mt-4"
          >
            {copied === "wg" ? <><CheckCircle className="w-3.5 h-3.5" /> تم!</> : <><Copy className="w-3.5 h-3.5" /> نسخ</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StoreManagement() {
  const [tab, setTab] = useState<Tab>("setup");
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [orderStatus, setOrderStatus] = useState<"all" | "pending" | "confirmed" | "delivered" | "cancelled" | "partial">("all");
  // حالة نافذة التسليم الجزئي
  const [partialDeliverOrder, setPartialDeliverOrder] = useState<{ id: number; quantity: number; deliveredCount: number } | null>(null);
  const [partialDeliverCount, setPartialDeliverCount] = useState(1);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // ─── Store Setup Form ──────────────────────────────────────────────────────
  const [storeForm, setStoreForm] = useState({
    slug: "", name: "", description: "", paymentPhone: "",
    paymentInstructions: "", whatsappPhone: "",
    primaryColor: "#6366f1", secondaryColor: "#8b5cf6", bgStyle: "dark" as "dark" | "light" | "gradient" | "custom"
  });

  // ─── Product Form ──────────────────────────────────────────────────────────
  const [productForm, setProductForm] = useState({
    name: "", description: "", price: "", batchId: "", stockThreshold: "5", sortOrder: "0"
  });

  // ─── Queries ───────────────────────────────────────────────────────────────
  const { data: myStore, isLoading: storeLoading, refetch: refetchStore } = trpc.store.getMyStore.useQuery();

  const { data: products, isLoading: productsLoading, refetch: refetchProducts } = trpc.store.getMyProducts.useQuery(
    { storeId: myStore?.id ?? 0 },
    { enabled: !!myStore?.id }
  );

  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.store.getOrders.useQuery(
    { storeId: myStore?.id ?? 0, status: orderStatus as any, page: 1, limit: 50 },
    { enabled: !!myStore?.id }
  );

  const { data: stats } = trpc.store.getStoreStats.useQuery(
    { storeId: myStore?.id ?? 0 },
    { enabled: !!myStore?.id }
  );

  // جلب الدفعات المتاحة لربط المنتجات
  const { data: batches } = trpc.vouchers.getBatches.useQuery(undefined, { enabled: tab === "products" });

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const setupStore = trpc.store.setupStore.useMutation({
    onSuccess: () => { toast.success("✅ تم حفظ إعدادات المتجر بنجاح"); refetchStore(); },
    onError: (err) => toast.error(err.message),
  });

  const toggleStore = trpc.store.toggleStore.useMutation({
    onSuccess: () => { refetchStore(); },
    onError: (err) => toast.error(err.message),
  });

  const updateLogo = trpc.store.updateStoreLogo.useMutation({
    onSuccess: () => { toast.success("✅ تم تحديث الشعار"); refetchStore(); },
    onError: (err) => toast.error(err.message),
  });

  const addProduct = trpc.store.addProduct.useMutation({
    onSuccess: () => {
      toast.success("✅ تم إضافة المنتج");
      setShowAddProduct(false);
      setProductForm({ name: "", description: "", price: "", batchId: "", stockThreshold: "5", sortOrder: "0" });
      refetchProducts();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateProduct = trpc.store.updateProduct.useMutation({
    onSuccess: () => { toast.success("✅ تم تحديث المنتج"); setEditingProduct(null); refetchProducts(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteProduct = trpc.store.deleteProduct.useMutation({
    onSuccess: () => { toast.success("✅ تم حذف المنتج"); refetchProducts(); },
    onError: (err) => toast.error(err.message),
  });

  const confirmOrder = trpc.store.confirmOrder.useMutation({
    onSuccess: () => { toast.success("✅ تم تأكيد الطلب"); refetchOrders(); },
    onError: (err) => toast.error(err.message),
  });

  const deliverOrder = trpc.store.deliverOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ تم تسليم الكرت — اسم المستخدم: ${data.cardUsername}${data.smsSent ? " — تم إرسال SMS" : ""}`);
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelOrder = trpc.store.cancelOrder.useMutation({
    onSuccess: () => { toast.success("✅ تم إلغاء الطلب"); refetchOrders(); },
    onError: (err) => toast.error(err.message),
  });
  // تسليم جزئي
  const partialDeliver = trpc.store.partialDeliver.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ تم تسليم ${data.deliveredCount} كرت${data.isFullyDelivered ? " — اكتمل الطلب" : ` — المتبقي: ${data.remaining}`}`);
      setPartialDeliverOrder(null);
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });
  // إلغاء الكروت المتبقية
  const cancelRemaining = trpc.store.cancelRemaining.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ تم تحرير ${data.freedCards} كرت — الطلب: ${data.finalStatus === 'delivered' ? 'مُسلَّم جزئياً' : 'ملغي'}`);
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });
  // إرسال الكرت عبر SMS
  const deliverOrderBySms = trpc.store.deliverOrderBySms.useMutation({
    onSuccess: () => { toast.success("✅ تم إرسال الكرت عبر SMS للزبون"); refetchOrders(); },
    onError: (err) => toast.error(err.message),
  });
  // إرسال رابط التتبع عبر SMS
  const sendOrderTrackLink = trpc.store.sendOrderTrackLink.useMutation({
    onSuccess: () => { toast.success("✅ تم إرسال رابط التتبع للزبون"); },
    onError: (err) => toast.error(err.message),
  });
  // حالة SMS للعميل
  const { data: smsStatus } = trpc.notificationChannels.getSmsAdminStatus.useQuery(
    undefined,
    { enabled: tab === "orders" }
  );
  // إعادة تعيين PIN
  const adminResetPin = trpc.store.adminResetPin.useMutation({
    onSuccess: () => { toast.success("✅ تم إعادة تعيين PIN — سيُطلب من الزبون إنشاء رقم سري جديد"); refetchOrders(); },
    onError: (err) => toast.error(err.message),
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleSaveStore = () => {
    if (!storeForm.name || !storeForm.slug) {
      toast.error("يرجى ملء اسم المتجر والرابط");
      return;
    }
    setupStore.mutate(storeForm as any);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      updateLogo.mutate({ logoBase64: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleAddProduct = () => {
    if (!myStore) return;
    if (!productForm.name || !productForm.price) {
      toast.error("يرجى ملء اسم المنتج والسعر");
      return;
    }
    addProduct.mutate({
      storeId: myStore.id,
      name: productForm.name,
      description: productForm.description || undefined,
      price: productForm.price,
      batchId: productForm.batchId || undefined,
      stockThreshold: Number(productForm.stockThreshold) || 5,
      sortOrder: Number(productForm.sortOrder) || 0,
    });
  };

  const handleToggleProductActive = (productId: number, storeId: number, currentActive: boolean) => {
    updateProduct.mutate({ productId, storeId, active: !currentActive });
  };

  const copyStoreLink = () => {
    if (!myStore) return;
    const link = `${window.location.origin}/store/${myStore.slug}`;
    navigator.clipboard.writeText(link);
    toast.success("✅ تم نسخ الرابط");
  };

  // تهيئة نموذج المتجر من البيانات الموجودة
  const initStoreForm = () => {
    if (myStore && !storeForm.name) {
      setStoreForm({
        slug: myStore.slug,
        name: myStore.name,
        description: myStore.description ?? "",
        paymentPhone: myStore.paymentPhone ?? "",
        paymentInstructions: myStore.paymentInstructions ?? "",
        whatsappPhone: myStore.whatsappPhone ?? "",
        primaryColor: myStore.primaryColor ?? "#6366f1",
        secondaryColor: myStore.secondaryColor ?? "#8b5cf6",
        bgStyle: (myStore.bgStyle as "dark" | "light" | "gradient" | "custom") ?? "dark",
      });
    }
  };

  if (storeLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // تهيئة النموذج عند أول تحميل
  if (myStore && !storeForm.name) initStoreForm();

  const storeUrl = myStore ? `${window.location.origin}/store/${myStore.slug}` : null;

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      {/* ─── شريط تجريبي ───────────────────────────────────────────────────────────────────────── */}
      <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
        <span className="text-amber-400 text-xl leading-none mt-0.5">⚠️</span>
        <div>
          <p className="text-amber-300 font-semibold text-sm">ميزة تجريبية — قيد التطوير</p>
          <p className="text-amber-200/80 text-xs mt-0.5">هذه الميزة لا تزال في مرحلة التجربة، قد تتغير بعض الخصائص أو الواجهة قبل الإطلاق الرسمي. نرحب بملاحظاتك لتحسينها.</p>
        </div>
      </div>
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <Store className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">متجر البطاقات</h1>
            <p className="text-slate-400 text-sm">إدارة متجرك الإلكتروني لبيع بطاقات الإنترنت</p>
          </div>
        </div>
        {myStore && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">{myStore.active ? "نشط" : "معطّل"}</span>
              <Switch
                checked={myStore.active}
                onCheckedChange={(v) => toggleStore.mutate({ active: v })}
              />
            </div>
            <Button variant="outline" size="sm" onClick={copyStoreLink} className="gap-2">
              <Copy className="w-4 h-4" />
              نسخ الرابط
            </Button>
            <a href={storeUrl!} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                عرض المتجر
              </Button>
            </a>
          </div>
        )}
      </div>

      {/* ─── Stats ──────────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: "إجمالي الطلبات", value: stats.total, color: "text-white" },
            { label: "معلق", value: stats.pending, color: "text-yellow-400" },
            { label: "مؤكد", value: stats.confirmed, color: "text-blue-400" },
            { label: "مُسلَّم", value: stats.delivered, color: "text-green-400" },
            { label: "الإيرادات", value: `${stats.revenue.toFixed(2)} ₪`, color: "text-cyan-400" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-slate-400 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 mb-6">
        {[
          { id: "setup" as Tab, label: "إعداد المتجر", icon: Settings },
          { id: "products" as Tab, label: "المنتجات", icon: Package },
          { id: "orders" as Tab, label: "الطلبات", icon: ShoppingBag },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all
              ${tab === id ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-white"}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ─── Tab: Setup ─────────────────────────────────────────────────────── */}
      {tab === "setup" && (
        <div className="space-y-6">
          {/* شعار المتجر */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-400" />
              شعار المتجر
            </h3>
            <div className="flex items-center gap-4">
              {myStore?.logoUrl ? (
                <img src={myStore.logoUrl} alt="شعار" className="w-16 h-16 rounded-xl object-cover border border-slate-600" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-700 border border-slate-600 flex items-center justify-center">
                  <Store className="w-8 h-8 text-slate-500" />
                </div>
              )}
              <div>
                <label htmlFor="logo-upload-input" style={{ cursor: updateLogo.isPending ? 'not-allowed' : 'pointer' }}>
                  <input
                    id="logo-upload-input"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleLogoUpload}
                    disabled={updateLogo.isPending}
                  />
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: '1px solid #475569',
                      background: 'transparent',
                      color: '#e2e8f0',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: updateLogo.isPending ? 'not-allowed' : 'pointer',
                      opacity: updateLogo.isPending ? 0.6 : 1,
                      userSelect: 'none',
                    }}
                  >
                    {updateLogo.isPending ? '⏳ جاري الرفع...' : '📷 تغيير الشعار'}
                  </span>
                </label>
                <p className="text-slate-500 text-xs mt-1">PNG, JPG — يُفضَّل 200×200 بكسل</p>
              </div>
            </div>
          </div>

          {/* معلومات المتجر */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Store className="w-4 h-4 text-blue-400" />
              معلومات المتجر
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300 mb-2 block text-sm">اسم المتجر *</Label>
                <Input
                  value={storeForm.name}
                  onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                  placeholder="مثال: عبود نت"
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div>
                <Label className="text-slate-300 mb-2 block text-sm">
                  رابط المتجر *
                  <span className="text-slate-500 text-xs mr-2">(حروف إنجليزية وأرقام وشرطة فقط)</span>
                </Label>
                <div className="flex items-center">
                  <span className="text-slate-400 text-sm bg-slate-700 border border-l-0 border-slate-600 rounded-r-lg px-3 py-2 whitespace-nowrap">/store/</span>
                  <Input
                    value={storeForm.slug}
                    onChange={(e) => setStoreForm({ ...storeForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    placeholder="aboud-net"
                    className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 rounded-r-none"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label className="text-slate-300 mb-2 block text-sm">وصف المتجر</Label>
                <Textarea
                  value={storeForm.description}
                  onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })}
                  placeholder="وصف مختصر عن خدماتك..."
                  rows={2}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* معلومات الدفع */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              معلومات الدفع والتواصل
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300 mb-2 block text-sm">رقم المحفظة / الدفع</Label>
                <Input
                  value={storeForm.paymentPhone}
                  onChange={(e) => setStoreForm({ ...storeForm, paymentPhone: e.target.value })}
                  placeholder="0599xxxxxx"
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div>
                <Label className="text-slate-300 mb-2 block text-sm">رقم واتساب للتواصل</Label>
                <Input
                  value={storeForm.whatsappPhone}
                  onChange={(e) => setStoreForm({ ...storeForm, whatsappPhone: e.target.value })}
                  placeholder="970599xxxxxx"
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-slate-300 mb-2 block text-sm">تعليمات الدفع</Label>
                <Textarea
                  value={storeForm.paymentInstructions}
                  onChange={(e) => setStoreForm({ ...storeForm, paymentInstructions: e.target.value })}
                  placeholder="مثال: قم بتحويل المبلغ على رقم المحفظة أعلاه ثم ارفع صورة الإيصال..."
                  rows={3}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* تخصيص الألوان والثيم */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <span className="text-lg">🎨</span>
              تخصيص الألوان والثيم
            </h3>

            {/* اختيار نمط الخلفية */}
            <div className="mb-5">
              <Label className="text-slate-300 mb-3 block text-sm">نمط خلفية المتجر</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([
                  { value: "dark", label: "داكن", desc: "خلفية داكنة احترافية", bg: "bg-slate-900", border: "border-slate-700" },
                  { value: "light", label: "فاتح", desc: "خلفية بيضاء نظيفة", bg: "bg-white", border: "border-slate-300" },
                  { value: "gradient", label: "تدرج", desc: "تدرج بالألوان المختارة", bg: "", border: "border-purple-500" },
                  { value: "custom", label: "مخصص", desc: "لون خلفية مخصص", bg: "", border: "border-blue-500" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStoreForm({ ...storeForm, bgStyle: opt.value })}
                    className={`relative rounded-xl p-3 border-2 transition-all text-right ${
                      storeForm.bgStyle === opt.value
                        ? "border-blue-500 ring-2 ring-blue-500/30"
                        : "border-slate-600 hover:border-slate-500"
                    }`}
                  >
                    {/* معاينة مصغرة */}
                    <div
                      className={`w-full h-10 rounded-lg mb-2 overflow-hidden ${
                        opt.value === "dark" ? "bg-slate-900" :
                        opt.value === "light" ? "bg-gray-50" : ""
                      }`}
                      style={opt.value === "gradient" ? {
                        background: `linear-gradient(135deg, ${storeForm.primaryColor}22, ${storeForm.secondaryColor}44, #0f172a)`
                      } : opt.value === "custom" ? {
                        background: `${storeForm.primaryColor}22`
                      } : {}}
                    >
                      <div
                        className="w-full h-2 rounded-t-lg"
                        style={{ background: storeForm.primaryColor }}
                      />
                    </div>
                    <p className="text-white text-xs font-medium">{opt.label}</p>
                    <p className="text-slate-400 text-xs">{opt.desc}</p>
                    {storeForm.bgStyle === opt.value && (
                      <div className="absolute top-2 left-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* اختيار الألوان */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* اللون الأساسي */}
              <div>
                <Label className="text-slate-300 mb-2 block text-sm">اللون الأساسي</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={storeForm.primaryColor}
                    onChange={(e) => setStoreForm({ ...storeForm, primaryColor: e.target.value })}
                    className="w-12 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent p-0.5"
                  />
                  <Input
                    value={storeForm.primaryColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setStoreForm({ ...storeForm, primaryColor: v });
                    }}
                    maxLength={7}
                    placeholder="#6366f1"
                    className="bg-slate-700 border-slate-600 text-white font-mono text-sm"
                  />
                </div>
                {/* ألوان جاهزة */}
                <div className="flex gap-2 mt-2 flex-wrap">
                  {["#6366f1","#3b82f6","#10b981","#f59e0b","#ef4444","#ec4899","#8b5cf6","#06b6d4"].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setStoreForm({ ...storeForm, primaryColor: c })}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        storeForm.primaryColor === c ? "border-white scale-110" : "border-transparent hover:border-slate-400"
                      }`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>

              {/* اللون الثانوي */}
              <div>
                <Label className="text-slate-300 mb-2 block text-sm">اللون الثانوي</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={storeForm.secondaryColor}
                    onChange={(e) => setStoreForm({ ...storeForm, secondaryColor: e.target.value })}
                    className="w-12 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent p-0.5"
                  />
                  <Input
                    value={storeForm.secondaryColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setStoreForm({ ...storeForm, secondaryColor: v });
                    }}
                    maxLength={7}
                    placeholder="#8b5cf6"
                    className="bg-slate-700 border-slate-600 text-white font-mono text-sm"
                  />
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {["#8b5cf6","#a855f7","#06b6d4","#14b8a6","#f97316","#e11d48","#6366f1","#3b82f6"].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setStoreForm({ ...storeForm, secondaryColor: c })}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        storeForm.secondaryColor === c ? "border-white scale-110" : "border-transparent hover:border-slate-400"
                      }`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* معاينة حية */}
            <div className="mt-5 rounded-xl overflow-hidden border border-slate-600">
              <div
                className="p-4"
                style={{
                  background: storeForm.bgStyle === "dark" ? "#0f172a" :
                    storeForm.bgStyle === "light" ? "#f8fafc" :
                    storeForm.bgStyle === "gradient" ? `linear-gradient(135deg, ${storeForm.primaryColor}22, ${storeForm.secondaryColor}44, #0f172a)` :
                    `${storeForm.primaryColor}11`
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg" style={{ background: storeForm.primaryColor }} />
                  <div>
                    <p className="font-bold text-sm" style={{ color: storeForm.bgStyle === "light" ? "#1e293b" : "#fff" }}>
                      {storeForm.name || "اسم المتجر"}
                    </p>
                    <p className="text-xs" style={{ color: storeForm.bgStyle === "light" ? "#64748b" : "#94a3b8" }}>معاينة حية</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: storeForm.primaryColor }}
                  >باقة ساعة</div>
                  <div
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: storeForm.secondaryColor }}
                  >باقة يوم</div>
                </div>
              </div>
            </div>
          </div>

          <Button
            onClick={handleSaveStore}
            disabled={setupStore.isPending}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3"
          >
            {setupStore.isPending ? <><Loader2 className="w-4 h-4 animate-spin ml-2" /> جاري الحفظ...</> : "حفظ الإعدادات"}
          </Button>

          {/* ─── Hotspot Code Section ─────────────────────────────────────────── */}
          {myStore && storeUrl && (
            <HotspotCodeSection storeUrl={storeUrl} />
          )}
        </div>
      )}

      {/* ─── Tab: Products ──────────────────────────────────────────────────── */}
      {tab === "products" && (
        <div className="space-y-4">
          {!myStore && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">يجب إنشاء المتجر أولاً من تبويب "إعداد المتجر"</p>
            </div>
          )}

          {myStore && (
            <>
              {/* زر إضافة منتج */}
              <div className="flex justify-between items-center">
                <h3 className="text-white font-semibold">المنتجات ({products?.length ?? 0})</h3>
                <Button onClick={() => setShowAddProduct(!showAddProduct)} className="gap-2 bg-blue-600 hover:bg-blue-500">
                  <Plus className="w-4 h-4" />
                  إضافة منتج
                </Button>
              </div>

              {/* نموذج إضافة منتج */}
              {showAddProduct && (
                <div className="bg-slate-800/50 border border-blue-500/30 rounded-xl p-5">
                  <h4 className="text-white font-medium mb-4">منتج جديد</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-300 mb-2 block text-sm">اسم الباقة *</Label>
                      <Input
                        value={productForm.name}
                        onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                        placeholder="مثال: باقة ساعة"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300 mb-2 block text-sm">السعر (₪) *</Label>
                      <Input
                        value={productForm.price}
                        onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                        placeholder="5.00"
                        type="number"
                        step="0.01"
                        min="0"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-slate-300 mb-2 block text-sm">الوصف</Label>
                      <Input
                        value={productForm.description}
                        onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                        placeholder="وصف مختصر للباقة..."
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300 mb-2 block text-sm">دفعة الكروت (اختياري)</Label>
                      <Select value={productForm.batchId} onValueChange={(v) => setProductForm({ ...productForm, batchId: v === "__none__" ? "" : v })}>
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                          <SelectValue placeholder="اختر دفعة..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">بدون دفعة</SelectItem>
                          {batches?.map((b: any) => (
                            <SelectItem key={b.batchId} value={b.batchId}>
                              {b.name} ({b.stats?.unused ?? 0} كرت متاح)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-300 mb-2 block text-sm">حد التنبيه (عدد الكروت)</Label>
                      <Input
                        value={productForm.stockThreshold}
                        onChange={(e) => setProductForm({ ...productForm, stockThreshold: e.target.value })}
                        type="number"
                        min="1"
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <Button onClick={handleAddProduct} disabled={addProduct.isPending} className="bg-green-600 hover:bg-green-500">
                      {addProduct.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "إضافة"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowAddProduct(false)}>إلغاء</Button>
                  </div>
                </div>
              )}

              {/* قائمة المنتجات */}
              {productsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
              ) : products && products.length > 0 ? (
                <div className="space-y-3">
                  {products.map((p: any) => (
                    <div key={p.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                      {editingProduct === p.id ? (
                        // نموذج التعديل
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              defaultValue={p.name}
                              id={`edit-name-${p.id}`}
                              placeholder="اسم الباقة"
                              className="bg-slate-700 border-slate-600 text-white"
                            />
                            <Input
                              defaultValue={p.price}
                              id={`edit-price-${p.id}`}
                              placeholder="السعر"
                              type="number"
                              step="0.01"
                              className="bg-slate-700 border-slate-600 text-white"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-500"
                              onClick={() => {
                                const name = (document.getElementById(`edit-name-${p.id}`) as HTMLInputElement)?.value;
                                const price = (document.getElementById(`edit-price-${p.id}`) as HTMLInputElement)?.value;
                                updateProduct.mutate({ productId: p.id, storeId: myStore.id, name, price });
                              }}
                            >
                              حفظ
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingProduct(null)}>إلغاء</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="text-white font-medium">{p.name}</p>
                              {p.description && <p className="text-slate-400 text-sm">{p.description}</p>}
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-cyan-400 font-bold">{Number(p.price).toFixed(2)} ₪</span>
                                {p.batchId && (
                                  <span className="text-slate-400 text-xs">
                                    مخزون: <span className={p.availableStock <= p.stockThreshold ? "text-orange-400" : "text-green-400"}>{p.availableStock}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={p.active}
                              onCheckedChange={() => handleToggleProductActive(p.id, myStore.id, p.active)}
                            />
                            <Button size="sm" variant="ghost" onClick={() => setEditingProduct(p.id)}>
                              <Edit2 className="w-4 h-4 text-blue-400" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                if (await window.confirmOperation("هل أنت متأكد من حذف هذا المنتج؟", "حذف المنتج")) {
                                  deleteProduct.mutate({ productId: p.id, storeId: myStore.id });
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>لا توجد منتجات بعد — أضف منتجاً جديداً</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Tab: Orders ────────────────────────────────────────────────────── */}
      {tab === "orders" && (
        <div className="space-y-4">
          {!myStore ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">يجب إنشاء المتجر أولاً</p>
            </div>
          ) : (
            <>
              {/* فلتر الحالة */}
              <div className="flex items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  {(["all", "pending", "confirmed", "delivered", "partial", "cancelled"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setOrderStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                        ${orderStatus === s ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
                    >
                      {s === "all" ? "الكل" : s === "pending" ? "معلق" : s === "confirmed" ? "مؤكد" : s === "delivered" ? "مُسلَّم" : s === "partial" ? "جزئي" : "ملغي"}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm" onClick={() => refetchOrders()} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  تحديث
                </Button>
              </div>

              {/* قائمة الطلبات */}
              {ordersLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
              ) : ordersData?.orders && ordersData.orders.length > 0 ? (
                <div className="space-y-3">
                  {ordersData.orders.map((order: any) => (
                    <div key={order.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                      {/* رأس الطلب */}
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                        onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">#{order.id}</span>
                              <StatusBadge status={order.status} />
                            </div>
                            <p className="text-slate-400 text-sm mt-0.5">{order.customerName} — {order.customerPhone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-cyan-400 font-bold">{Number(order.amount).toFixed(2)} ₪</span>
                          <span className="text-slate-500 text-xs">{(parseDbDate(order.createdAt) ?? new Date(order.createdAt)).toLocaleDateString("ar")}</span>
                          {expandedOrder === order.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>

                      {/* تفاصيل الطلب */}
                      {expandedOrder === order.id && (
                        <div className="border-t border-slate-700/50 p-4 space-y-4">
                          {/* معلومات الزبون */}
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-slate-400">الاسم:</span>
                              <span className="text-white mr-2">{order.customerName}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">الجوال:</span>
                              <span className="text-white mr-2">{order.customerPhone}</span>
                            </div>
                            {order.notes && (
                              <div className="col-span-2">
                                <span className="text-slate-400">ملاحظات:</span>
                                <span className="text-white mr-2">{order.notes}</span>
                              </div>
                            )}
                          </div>

                          {/* زر إعادة تعيين PIN */}
                          <div className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Lock className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-400 text-sm">رقم سري الزبون</span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 text-xs"
                              onClick={async () => {
                                if (await window.confirmOperation(`إعادة تعيين PIN للزبون ${order.customerPhone}?\nسيُطلب منه إنشاء رقم سري جديد عند طلبه القادم.`, "إعادة تعيين PIN", "primary")) {
                                  adminResetPin.mutate({ storeId: myStore.id, phone: order.customerPhone });
                                }
                              }}
                              disabled={adminResetPin.isPending}
                            >
                              <KeyRound className="w-3 h-3" />
                              إعادة تعيين PIN
                            </Button>
                          </div>

                          {/* إيصال الدفع */}
                          {order.receiptUrl && (
                            <div>
                              <p className="text-slate-400 text-sm mb-2">إيصال الدفع:</p>
                              <a href={order.receiptUrl} target="_blank" rel="noopener noreferrer">
                                <img src={order.receiptUrl} alt="إيصال" className="max-h-40 rounded-lg border border-slate-600 object-contain" />
                              </a>
                            </div>
                          )}

                          {/* الكرت المُسلَّم */}
                          {order.status === "delivered" && order.cardUsername && (
                            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                              <p className="text-green-400 text-sm font-medium mb-1">الكرت المُسلَّم:</p>
                              <p className="text-white text-sm">اسم المستخدم: <span className="font-mono text-cyan-400">{order.cardUsername}</span></p>
                              {order.cardPassword && (
                                <p className="text-white text-sm">كلمة المرور: <span className="font-mono text-cyan-400">{order.cardPassword}</span></p>
                              )}
                              {order.smsSent && <p className="text-green-400 text-xs mt-1">✓ تم إرسال SMS</p>}
                            </div>
                          )}

                          {/* أزرار الإجراءات */}
                          <div className="flex gap-2 flex-wrap">
                            {(order.status === "pending" || order.status === "confirmed") && (
                              <>
                                {order.status === "pending" && (
                                  <Button
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-500 gap-2"
                                    onClick={() => confirmOrder.mutate({ orderId: order.id, storeId: myStore.id })}
                                    disabled={confirmOrder.isPending}
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                    تأكيد الطلب
                                  </Button>
                                )}
                                {/* تسليم كامل */}
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-500 gap-2"
                                  onClick={() => deliverOrder.mutate({ orderId: order.id, storeId: myStore.id })}
                                  disabled={deliverOrder.isPending}
                                >
                                  {deliverOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                  {order.quantity > 1 ? `تسليم الكل (${order.quantity})` : "تسليم الكرت"}
                                </Button>
                                {/* تسليم جزئي — يظهر فقط إذا الكمية > 1 */}
                                {order.quantity > 1 && (
                                  <Button
                                    size="sm"
                                    className="bg-orange-600 hover:bg-orange-500 gap-2"
                                    onClick={() => {
                                      setPartialDeliverOrder({ id: order.id, quantity: order.quantity, deliveredCount: order.deliveredCount ?? 0 });
                                      setPartialDeliverCount(1);
                                    }}
                                  >
                                    <Package className="w-4 h-4" />
                                    تسليم جزئي
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 border-red-500/50 text-red-400 hover:bg-red-500/10"
                                  onClick={() => cancelOrder.mutate({ orderId: order.id, storeId: myStore.id })}
                                  disabled={cancelOrder.isPending}
                                >
                                  <XCircle className="w-4 h-4" />
                                  إلغاء
                                </Button>
                                {smsStatus?.adminEnabled && order.orderToken && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-2 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
                                    onClick={() => sendOrderTrackLink.mutate({ orderId: order.id, storeId: myStore.id })}
                                    disabled={sendOrderTrackLink.isPending}
                                  >
                                    {sendOrderTrackLink.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                    إرسال رابط التتبع
                                  </Button>
                                )}
                              </>
                            )}

                            {/* ─── حالة جزئي ─── */}
                            {order.status === "partial" && (
                              <>
                                {/* معلومات التقدم */}
                                <div className="w-full bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 mb-1">
                                  <p className="text-orange-300 text-sm font-medium">
                                    تسليم جزئي: {order.deliveredCount ?? 0} / {order.quantity} بطاقة
                                  </p>
                                  <p className="text-slate-400 text-xs mt-0.5">
                                    المتبقي: {order.quantity - (order.deliveredCount ?? 0)} بطاقة محجوزة
                                  </p>
                                </div>
                                {/* تسليم الباقي */}
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-500 gap-2"
                                  onClick={() => {
                                    setPartialDeliverOrder({ id: order.id, quantity: order.quantity, deliveredCount: order.deliveredCount ?? 0 });
                                    setPartialDeliverCount(order.quantity - (order.deliveredCount ?? 0));
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                  تسليم الباقي ({order.quantity - (order.deliveredCount ?? 0)})
                                </Button>
                                {/* تسليم جزئي إضافي */}
                                <Button
                                  size="sm"
                                  className="bg-orange-600 hover:bg-orange-500 gap-2"
                                  onClick={() => {
                                    setPartialDeliverOrder({ id: order.id, quantity: order.quantity, deliveredCount: order.deliveredCount ?? 0 });
                                    setPartialDeliverCount(1);
                                  }}
                                >
                                  <Package className="w-4 h-4" />
                                  تسليم جزئي
                                </Button>
                                {/* إلغاء الباقي */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 border-red-500/50 text-red-400 hover:bg-red-500/10"
                                  onClick={async () => {
                                    if (await window.confirmOperation(`إلغاء ${order.quantity - (order.deliveredCount ?? 0)} بطاقة متبقية وتحرير المخزون؟`, "إلغاء البطاقات المتبقية")) {
                                      cancelRemaining.mutate({ orderId: order.id, storeId: myStore.id });
                                    }
                                  }}
                                  disabled={cancelRemaining.isPending}
                                >
                                  <XCircle className="w-4 h-4" />
                                  إلغاء الباقي
                                </Button>
                              </>
                            )}

                            {/* للطلبات المُسلَّمة: زر إعادة إرسال الكرت عبر SMS */}
                            {order.status === "delivered" && smsStatus?.adminEnabled && order.cardUsername && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                                onClick={() => deliverOrderBySms.mutate({ orderId: order.id, storeId: myStore.id })}
                                disabled={deliverOrderBySms.isPending}
                                title="إعادة إرسال بيانات الكرت للزبون عبر SMS"
                              >
                                {deliverOrderBySms.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                                إعادة إرسال SMS
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>لا توجد طلبات {orderStatus !== "all" ? "بهذه الحالة" : ""}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── نافذة التسليم الجزئي ─── */}
      {partialDeliverOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">تسليم جزئي</h3>
              <button onClick={() => setPartialDeliverOrder(null)} className="text-slate-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-700/50 rounded-xl p-3 text-sm">
              <p className="text-slate-300">طلب #<span className="text-white font-bold">{partialDeliverOrder.id}</span></p>
              <p className="text-slate-400 mt-1">
                سُلِّم مسبقاً: <span className="text-green-400 font-medium">{partialDeliverOrder.deliveredCount}</span> — المتبقي: <span className="text-orange-400 font-medium">{partialDeliverOrder.quantity - partialDeliverOrder.deliveredCount}</span>
              </p>
            </div>
            <div>
              <label className="text-slate-300 text-sm font-medium block mb-2">عدد البطاقات المراد تسليمها الآن</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPartialDeliverCount(Math.max(1, partialDeliverCount - 1))}
                  className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg flex items-center justify-center"
                >-</button>
                <span className="text-white font-bold text-xl w-12 text-center">{partialDeliverCount}</span>
                <button
                  onClick={() => setPartialDeliverCount(Math.min(partialDeliverOrder.quantity - partialDeliverOrder.deliveredCount, partialDeliverCount + 1))}
                  className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-lg flex items-center justify-center"
                >+</button>
              </div>
              <p className="text-slate-500 text-xs mt-2">من 1 إلى {partialDeliverOrder.quantity - partialDeliverOrder.deliveredCount}</p>
            </div>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-500"
                onClick={() => {
                  if (!myStore) return;
                  partialDeliver.mutate({
                    orderId: partialDeliverOrder.id,
                    storeId: myStore.id,
                    deliverCount: partialDeliverCount,
                  });
                }}
                disabled={partialDeliver.isPending}
              >
                {partialDeliver.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                تسليم {partialDeliverCount} بطاقة
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setPartialDeliverOrder(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
