import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { parseDbDate, formatDateTime as _fmtDT, formatVpsTimeOnly } from '@/lib/dateFormat';
import { assertTimeZone, FALLBACK_TIMEZONE, setActiveTimezone } from "@/lib/timezoneV6";

// ─── Types ────────────────────────────────────────────────────────────────────
type CardStatus = "active" | "used" | "expired" | "inactive";

interface Session {
  sessionId: string;
  startTime: string | null;
  stopTime: string | null;
  durationSeconds: number | null;
  ipAddress: string | null;
  inputMb: number;
  outputMb: number;
  terminateCause: string | null;
  isActive: boolean;
  isAccountingOpenWithoutLiveSession: boolean;
}

interface CardResult {
  username: string;
  status: CardStatus;
  expiresAt: string | null;
  activatedAt: string | null;
  firstLoginAt: string | null;
  firstUseAt: string | null;
  windowEndTime: string | null;
  createdAt: string;
  planName: string | null;
  dataLimitMb: number | null;
  totalDataUsedMb: number;
  speedMbps: string | null;
  lastSessionAgo: string | null;
  totalBudgetSeconds: number | null;
  totalUsedSeconds: number;
  budgetRemainingSeconds: number | null;
  windowSeconds: number | null;
  timeRemainingSeconds: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 دقيقة";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ساعة`);
  if (m > 0) parts.push(`${m} دقيقة`);
  if (s > 0 && h === 0 && m === 0) parts.push(`${s} ثانية`);
  return parts.join(" و ") || "أقل من دقيقة";
}

function _parseDb(iso: string | null): Date | null {
  return parseDbDate(iso);
}

function formatDateTime(iso: string | null): string {
  return _fmtDT(iso);
}

function formatTimeOnly(iso: string | null): string {
  return formatVpsTimeOnly(iso);
}

function formatDataSize(mb: number | null): string {
  if (!mb) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

// ─── Status Config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<CardStatus, {
  label: string;
  sublabel: string;
  gradient: string;
  glow: string;
  badge: string;
  badgeText: string;
  icon: string;
  progressColor: string;
  accentColor: string;
}> = {
  active: {
    label: "الكارت نشط",
    sublabel: "يمكن استخدام هذا الكارت",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    glow: "shadow-emerald-500/30",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    badgeText: "✓ نشط",
    icon: "✅",
    progressColor: "bg-emerald-400",
    accentColor: "#10b981",
  },
  used: {
    label: "الكارت مستخدم",
    sublabel: "تم استخدام هذا الكارت مسبقاً",
    gradient: "from-amber-500 via-orange-500 to-yellow-500",
    glow: "shadow-amber-500/30",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    badgeText: "🔒 مستخدم",
    icon: "🔒",
    progressColor: "bg-amber-400",
    accentColor: "#f59e0b",
  },
  expired: {
    label: "الكارت منتهي",
    sublabel: "انتهت صلاحية هذا الكارت",
    gradient: "from-red-500 via-rose-500 to-pink-500",
    glow: "shadow-red-500/30",
    badge: "bg-red-100 text-red-700 border-red-200",
    badgeText: "⏰ منتهي",
    icon: "⏰",
    progressColor: "bg-red-400",
    accentColor: "#ef4444",
  },
  inactive: {
    label: "الكارت معطّل",
    sublabel: "هذا الكارت غير متاح حالياً",
    gradient: "from-gray-500 via-slate-500 to-zinc-500",
    glow: "shadow-gray-500/30",
    badge: "bg-gray-100 text-gray-600 border-gray-200",
    badgeText: "🚫 معطّل",
    icon: "🚫",
    progressColor: "bg-gray-400",
    accentColor: "#6b7280",
  },
};

// ─── Sub-components ────────────────────────────────────────────────────────────
function AnimatedProgress({ value, colorClass }: { value: number; colorClass: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 100);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-1000 ease-out ${colorClass}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function StatCard({ icon, label, value, accent = false }: {
  icon: string; label: string; value: string; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 border ${accent ? "bg-teal-500/15 border-teal-500/30" : "bg-white/5 border-white/10"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base">{icon}</span>
        <p className={`text-xs font-medium ${accent ? "text-teal-300" : "text-white/40"}`}>{label}</p>
      </div>
      <p className={`text-sm font-bold leading-tight ${accent ? "text-teal-200" : "text-white"}`}>{value}</p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CardCheck() {
  const params = useParams<{ token: string }>();
  const slug = params.token ?? "";

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CardResult | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [networkName, setNetworkName] = useState<string | null>(null);
  const [ownerTimezone, setOwnerTimezone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    // Security: validate input - only allow safe characters
    if (!/^[a-zA-Z0-9_\-\.@]+$/.test(trimmed)) {
      setError("كود الكارت يحتوي على أحرف غير مسموحة");
      return;
    }

    setLoading(true);
    setResult(null);
    setSessions([]);
    setError(null);

    try {
      const isSlug = slug.length < 32;
      const body = isSlug ? { slug, code: trimmed } : { token: slug, code: trimmed };

      const res = await fetch("/api/check-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "حدث خطأ غير متوقع");
      } else {
        let verifiedTimezone: string | null = null;
        if (typeof data.ownerTimezone === "string") {
          try { verifiedTimezone = assertTimeZone(data.ownerTimezone); } catch { verifiedTimezone = null; }
        }
        // Public CardCheck must use the card owner timezone, never the visitor browser.
        setActiveTimezone(verifiedTimezone ?? FALLBACK_TIMEZONE);
        setOwnerTimezone(verifiedTimezone);
        setResult(data.card);
        setSessions(data.sessions || []);
        setNetworkName(data.networkName || null);
      }
    } catch {
      setError("تعذّر الاتصال بالخادم. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setCode("");
    setResult(null);
    setSessions([]);
    setOwnerTimezone(null);
    setActiveTimezone(FALLBACK_TIMEZONE);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  const cfg = result ? STATUS_CONFIG[result.status] : null;

  // Time progress: remaining / total budget
  const budgetProgress = result && result.totalBudgetSeconds && result.totalBudgetSeconds > 0
    ? Math.round(((result.totalBudgetSeconds - result.totalUsedSeconds) / result.totalBudgetSeconds) * 100)
    : 0;

  // Expiry progress: remaining / total window
  const expiryProgress = result && result.expiresAt && result.createdAt
    ? (() => {
        const start = (_parseDb(result.createdAt) ?? new Date()).getTime();
        const end = (_parseDb(result.expiresAt) ?? new Date()).getTime();
        const now = Date.now();
        if (now >= end) return 0;
        if (now <= start) return 100;
        return Math.round(((end - now) / (end - start)) * 100);
      })()
    : 0;

  if (!slug || slug.length < 2) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-10 max-w-sm w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-white mb-2">رابط غير صالح</h1>
          <p className="text-white/60 text-sm">هذا الرابط غير صحيح أو منتهي الصلاحية.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col" dir="rtl">
      {/* Decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-start px-4 py-8 md:py-12">

        {/* Header */}
        <div className="w-full max-w-2xl mb-8 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-4 py-2 mb-5">
            <span className="text-lg">📡</span>
            <span className="text-white font-semibold text-sm">{networkName || "فحص الكارت"}</span>
          </div>
          {result && (
            <p className={`text-xs mb-3 ${ownerTimezone ? "text-teal-200/80" : "text-amber-200/90"}`}>
              {ownerTimezone ? `التوقيت المعروض: ${ownerTimezone}` : "التوقيت المعروض: UTC (لم يتم تحديد توقيت المالك)"}
            </p>
          )}
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">تحقق من كارتك</h1>
          <p className="text-white/50 text-sm">أدخل اسم المستخدم الخاص بكارتك للتحقق من حالته وتفاصيله</p>
        </div>

        {/* Search Box */}
        {!result && (
          <div className="w-full max-w-lg">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 md:p-8 shadow-2xl">
              <form onSubmit={handleCheck} className="space-y-4">
                <div>
                  <label className="block text-white/80 text-sm font-semibold mb-2">اسم المستخدم / كود الكارت</label>
                  <div className="relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      placeholder="أدخل الكود هنا..."
                      className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-4
                                 text-white placeholder:text-white/30 text-base font-mono
                                 focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400/50
                                 transition-all"
                      autoComplete="off"
                      disabled={loading}
                      dir="ltr"
                    />
                    {code && (
                      <button type="button" onClick={() => setCode("")}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 text-lg transition-colors">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || !code.trim()}
                  className="w-full py-4 rounded-2xl text-white font-bold text-base
                             bg-gradient-to-r from-teal-500 to-cyan-500
                             hover:from-teal-400 hover:to-cyan-400
                             disabled:opacity-40 disabled:cursor-not-allowed
                             transition-all duration-200 shadow-lg shadow-teal-500/25
                             flex items-center justify-center gap-2"
                >
                  {loading ? <><Spinner /> جاري الفحص...</> : <><span>🔍</span> فحص الكارت</>}
                </button>
              </form>
              {error && (
                <div className="mt-4 bg-red-500/20 border border-red-500/30 rounded-2xl px-4 py-3 text-center">
                  <p className="text-red-300 text-sm font-medium">{error}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Result ── */}
        {result && cfg && (
          <div className="w-full max-w-2xl space-y-4">

            {/* ── Main Status Card ── */}
            <div className={`relative rounded-3xl overflow-hidden shadow-2xl ${cfg.glow}`}>
              {/* Gradient header */}
              <div className={`bg-gradient-to-r ${cfg.gradient} p-6 md:p-8`}>
                <div className="flex items-start justify-between mb-4">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${cfg.badge}`}>
                    {cfg.badgeText}
                  </span>
                  <button onClick={handleReset}
                    className="text-white/70 hover:text-white text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-all">
                    فحص آخر ↩
                  </button>
                </div>

                <div className="mb-4">
                  <p className="text-white/70 text-xs mb-1">اسم المستخدم</p>
                  <p className="text-white text-2xl md:text-3xl font-black tracking-wider font-mono">{result.username}</p>
                </div>

                <div className="flex items-center gap-3 mb-5">
                  <span className="text-3xl">{cfg.icon}</span>
                  <div>
                    <p className="text-white font-bold text-lg">{cfg.label}</p>
                    <p className="text-white/70 text-sm">{cfg.sublabel}</p>
                  </div>
                </div>

                {/* Usage budget progress */}
                {result.totalBudgetSeconds && result.totalBudgetSeconds > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-white/80 text-xs mb-1.5">
                      <span>⏱ الوقت المتبقي من الباقة</span>
                      <span className="font-bold">
                        {result.budgetRemainingSeconds !== null
                          ? formatDuration(result.budgetRemainingSeconds)
                          : "—"}
                      </span>
                    </div>
                    <AnimatedProgress value={Math.max(0, Math.min(100, budgetProgress))} colorClass={cfg.progressColor} />
                    <div className="flex justify-between text-white/50 text-xs mt-1">
                      <span>مستهلك: {formatDuration(result.totalUsedSeconds)}</span>
                      <span>الكلي: {formatDuration(result.totalBudgetSeconds)}</span>
                    </div>
                  </div>
                )}

                {/* Expiry countdown */}
                {result.expiresAt && result.status === "active" && result.timeRemainingSeconds !== null && (
                  <div>
                    <div className="flex justify-between text-white/80 text-xs mb-1.5">
                      <span>🗓 الوقت حتى انتهاء الصلاحية</span>
                      <span className="font-bold">{formatDuration(result.timeRemainingSeconds)}</span>
                    </div>
                    <AnimatedProgress value={Math.max(0, Math.min(100, expiryProgress))} colorClass="bg-cyan-300" />
                    <div className="flex justify-between text-white/50 text-xs mt-1">
                      <span>بدأ: {formatDateTime(result.activatedAt || result.createdAt)}</span>
                      <span>ينتهي: {formatDateTime(result.expiresAt)}</span>
                    </div>
                  </div>
                )}

                {result.status === "expired" && result.expiresAt && (
                  <div className="bg-white/10 rounded-2xl px-4 py-3 text-center">
                    <p className="text-white/90 text-sm">
                      انتهت الصلاحية في: <span className="font-bold">{formatDateTime(result.expiresAt)}</span>
                    </p>
                  </div>
                )}
              </div>

              {/* ── Details Section ── */}
              <div className="bg-slate-900/90 backdrop-blur p-5 md:p-6">
                <h3 className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-4">تفاصيل الكارت</h3>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {result.planName && (
                    <StatCard icon="📋" label="الخطة" value={result.planName} />
                  )}
                  {result.speedMbps && (
                    <StatCard icon="🚀" label="السرعة" value={result.speedMbps} />
                  )}
                  {result.totalBudgetSeconds && result.totalBudgetSeconds > 0 && (
                    <StatCard icon="⏱" label="مدة الباقة الكلية" value={formatDuration(result.totalBudgetSeconds)} />
                  )}
                  {result.totalUsedSeconds > 0 && (
                    <StatCard icon="📊" label="الوقت المستهلك" value={formatDuration(result.totalUsedSeconds)} />
                  )}
                  {result.budgetRemainingSeconds !== null && result.budgetRemainingSeconds >= 0 && (
                    <StatCard icon="⚡" label="الوقت المتبقي" value={formatDuration(result.budgetRemainingSeconds)} accent />
                  )}
                  {result.dataLimitMb && result.dataLimitMb > 0 && (
                    <StatCard icon="📶" label="حد البيانات" value={formatDataSize(result.dataLimitMb)} />
                  )}
                  {result.totalDataUsedMb > 0 && (
                    <StatCard icon="📈" label="بيانات مستهلكة" value={formatDataSize(result.totalDataUsedMb)} />
                  )}
                  {result.lastSessionAgo && (
                    <StatCard icon="🕐" label="آخر جلسة" value={result.lastSessionAgo} />
                  )}
                </div>

                {/* Dates */}
                <div className="mt-4 space-y-2">
                  <h3 className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">📅 التواريخ</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {result.activatedAt && (
                      <DateRow label="تاريخ التفعيل" value={formatDateTime(result.activatedAt)} />
                    )}
                    {result.firstLoginAt && (
                      <DateRow label="أول دخول" value={formatDateTime(result.firstLoginAt)} />
                    )}
                    {result.expiresAt && (
                      <DateRow
                        label="تاريخ الانتهاء"
                        value={formatDateTime(result.expiresAt)}
                        highlight={result.status === "expired"}
                      />
                    )}
                    {result.windowEndTime && (
                      <DateRow label="نهاية النافذة الزمنية" value={formatDateTime(result.windowEndTime)} />
                    )}
                    <DateRow label="تاريخ الإنشاء" value={formatDateTime(result.createdAt)} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Sessions Table ── */}
            {sessions.length > 0 && (
              <div className="bg-white/5 backdrop-blur border border-white/10 rounded-3xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
                  <span className="text-base">🕐</span>
                  <h3 className="text-white font-bold text-sm">سجل جلسات الدخول</h3>
                  <span className="text-white/40 text-xs mr-auto">{sessions.length} جلسة</span>
                </div>

                {/* Mobile: card list */}
                <div className="md:hidden divide-y divide-white/5">
                  {sessions.map((s, i) => (
                    <div key={s.sessionId || i} className={`px-4 py-3 ${s.isActive ? "bg-emerald-500/5" : ""}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border
                          ${s.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-white/40 border-white/10"}`}>
                          {s.isActive ? "● نشط الآن" : s.isAccountingOpenWithoutLiveSession ? "◌ سجل محاسبة غير متزامن" : "○ منتهي"}
                        </span>
                        {s.durationSeconds !== null && (
                          <span className="text-teal-300 font-bold text-sm">{formatDuration(s.durationSeconds)}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>
                          <span className="text-white/40">البداية: </span>
                          <span className="text-white/80">{formatTimeOnly(s.startTime)}</span>
                        </div>
                        <div>
                          <span className="text-white/40">النهاية: </span>
                          <span className={s.isActive ? "text-emerald-400" : "text-white/80"}>
                            {s.isActive ? "جارٍ الآن" : s.isAccountingOpenWithoutLiveSession ? "غير متزامن" : formatTimeOnly(s.stopTime)}
                          </span>
                        </div>
                        {s.ipAddress && (
                          <div className="col-span-2">
                            <span className="text-white/40">IP: </span>
                            <span className="text-white/60 font-mono">{s.ipAddress}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5">
                        <th className="px-4 py-3 text-right text-white/40 text-xs font-semibold uppercase tracking-wide">الحالة</th>
                        <th className="px-4 py-3 text-right text-white/40 text-xs font-semibold uppercase tracking-wide">وقت البداية</th>
                        <th className="px-4 py-3 text-right text-white/40 text-xs font-semibold uppercase tracking-wide">وقت النهاية</th>
                        <th className="px-4 py-3 text-right text-white/40 text-xs font-semibold uppercase tracking-wide">المدة</th>
                        <th className="px-4 py-3 text-right text-white/40 text-xs font-semibold uppercase tracking-wide">IP</th>
                        <th className="px-4 py-3 text-right text-white/40 text-xs font-semibold uppercase tracking-wide">البيانات ↑↓</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {sessions.map((s, i) => (
                        <tr key={s.sessionId || i}
                          className={`hover:bg-white/5 transition-colors ${s.isActive ? "bg-emerald-500/5" : ""}`}>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border
                              ${s.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-white/5 text-white/40 border-white/10"}`}>
                              {s.isActive ? "● نشط" : s.isAccountingOpenWithoutLiveSession ? "◌ سجل محاسبة غير متزامن" : "○ منتهي"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/70 text-xs">{formatTimeOnly(s.startTime)}</td>
                          <td className="px-4 py-3 text-xs">
                            {s.isActive
                              ? <span className="text-emerald-400 font-semibold">جارٍ الآن</span>
                              : <span className="text-white/70">{s.isAccountingOpenWithoutLiveSession ? "سجل محاسبة غير متزامن" : formatTimeOnly(s.stopTime)}</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-teal-300 font-bold text-xs">
                            {s.durationSeconds !== null ? formatDuration(s.durationSeconds) : "—"}
                          </td>
                          <td className="px-4 py-3 text-white/50 font-mono text-xs">{s.ipAddress || "—"}</td>
                          <td className="px-4 py-3 text-white/50 text-xs">
                            {(s.inputMb > 0 || s.outputMb > 0)
                              ? `↑${s.outputMb.toFixed(1)} / ↓${s.inputMb.toFixed(1)} MB`
                              : "—"
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {sessions.length === 0 && (result.status === "active" || result.status === "used" || result.status === "expired") && (
              <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-center text-white/30 text-sm">
                لا توجد جلسات مسجّلة لهذا الكارت
              </div>
            )}

            {/* Search again */}
            <button onClick={handleReset}
              className="w-full py-3.5 rounded-2xl text-white/70 font-semibold text-sm
                         bg-white/5 hover:bg-white/10 border border-white/10
                         transition-all duration-200 flex items-center justify-center gap-2">
              <span>🔍</span> فحص كارت آخر
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-white/20 text-xs mt-8">
          Radius Pro &copy; {new Date().getFullYear()} — {networkName || slug}
        </p>
      </div>
    </div>
  );
}

// ─── DateRow ──────────────────────────────────────────────────────────────────
function DateRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
      <span className="text-white/40 text-xs">{label}</span>
      <span className={`text-xs font-semibold ${highlight ? "text-red-400" : "text-white/80"}`}>{value}</span>
    </div>
  );
}
