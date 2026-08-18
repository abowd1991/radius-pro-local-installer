import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import LoginTransition from "@/components/LoginTransition";
import {
  Loader2, User, Mail, Lock, Phone, Eye, EyeOff,
  ArrowRight, CheckCircle, Shield, Zap, MessageSquare,
  BarChart3, CreditCard, Users, Server,
  Activity, Network, Radio, Wifi, Globe, Key
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES } from "../../../shared/currencies";

const VERIFY_CODE_TTL = 15 * 60;
type AuthView = "login" | "register" | "forgot-password" | "reset-password" | "verify-email";

/* ─── Design Tokens ──────────────────────────────────────────────────────── */
const C = {
  bg: "#0B1120",
  card: "#111827",
  primary: "#2563EB",
  secondary: "#9333EA",
  accent: "#06B6D4",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  border: "rgba(255,255,255,0.08)",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
};

/* ─── Network Canvas Background ─────────────────────────────────────────── */
function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    // Nodes
    const NODE_COUNT = Math.floor((width * height) / 22000);
    interface Node {
      x: number; y: number;
      vx: number; vy: number;
      r: number;
      color: string;
      pulse: number;
      pulseSpeed: number;
    }
    const colors = ["#2563EB", "#9333EA", "#06B6D4", "#3B82F6", "#7C3AED"];
    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 2.5 + 1.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.02,
    }));

    // Data packets traveling along edges
    interface Packet {
      fromIdx: number;
      toIdx: number;
      t: number;
      speed: number;
      color: string;
    }
    const packets: Packet[] = [];
    const MAX_DIST = Math.min(width, height) * 0.22;

    function spawnPacket() {
      const fromIdx = Math.floor(Math.random() * nodes.length);
      // find a close neighbor
      let toIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (i === fromIdx) continue;
        const dx = nodes[i].x - nodes[fromIdx].x;
        const dy = nodes[i].y - nodes[fromIdx].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX_DIST && d < bestDist) { bestDist = d; toIdx = i; }
      }
      if (toIdx === -1) return;
      packets.push({
        fromIdx, toIdx,
        t: 0,
        speed: 0.004 + Math.random() * 0.006,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    // Spawn initial packets
    for (let i = 0; i < 8; i++) spawnPacket();

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, width, height);

      // Draw edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.18;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(37,99,235,${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // Draw packets
      for (let p = packets.length - 1; p >= 0; p--) {
        const pkt = packets[p];
        pkt.t += pkt.speed;
        if (pkt.t >= 1) { packets.splice(p, 1); spawnPacket(); continue; }
        const from = nodes[pkt.fromIdx];
        const to = nodes[pkt.toIdx];
        const px = from.x + (to.x - from.x) * pkt.t;
        const py = from.y + (to.y - from.y) * pkt.t;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = pkt.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = pkt.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw nodes
      for (const n of nodes) {
        n.pulse += n.pulseSpeed;
        const glow = 0.5 + 0.5 * Math.sin(n.pulse);

        // Outer glow ring
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 4);
        grad.addColorStop(0, n.color + "55");
        grad.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 4, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.shadowBlur = 8 + glow * 8;
        ctx.shadowColor = n.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Move
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

/* ─── Background Overlays ────────────────────────────────────────────────── */
function BgOverlays() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
      {/* Radial top-left blue */}
      <div className="absolute -top-64 -left-64 w-[700px] h-[700px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)", filter: "blur(60px)" }} />
      {/* Radial bottom-right purple */}
      <div className="absolute -bottom-64 -right-64 w-[700px] h-[700px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(147,51,234,0.10) 0%, transparent 70%)", filter: "blur(80px)" }} />
      {/* Top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent 0%, rgba(37,99,235,0.5) 30%, rgba(6,182,212,0.5) 50%, rgba(147,51,234,0.5) 70%, transparent 100%)" }} />
    </div>
  );
}

/* ─── Reusable Input ─────────────────────────────────────────────────────── */
function AuthInput({
  id, type = "text", placeholder, value, onChange, icon: Icon,
  dir = "ltr", rightSlot, disabled = false,
}: {
  id: string; type?: string; placeholder: string; value: string;
  onChange: (v: string) => void; icon?: React.ElementType;
  dir?: "ltr" | "rtl"; rightSlot?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div className="relative group">
      {Icon && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <Icon className="h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors duration-300" />
        </div>
      )}
      <input
        id={id} type={type} placeholder={placeholder} value={value}
        onChange={(e) => onChange(e.target.value)} dir={dir} disabled={disabled}
        className={`
          w-full rounded-xl py-3.5 text-white placeholder:text-slate-500
          transition-all duration-300 outline-none
          disabled:opacity-40 disabled:cursor-not-allowed
          ${Icon ? "pr-10 pl-4" : "px-4"}
          ${rightSlot ? "pl-10" : ""}
        `}
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.09)",
          fontFamily: "'Cairo', system-ui, sans-serif",
          fontSize: "14px",
          fontWeight: 500,
        }}
        onFocus={(e) => {
          e.currentTarget.style.border = "1px solid rgba(37,99,235,0.7)";
          e.currentTarget.style.background = "rgba(37,99,235,0.07)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.14), 0 0 20px rgba(37,99,235,0.1)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)";
          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
      {rightSlot && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
      )}
    </div>
  );
}

function AuthLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold mb-1.5"
      style={{ color: C.textSecondary, fontFamily: "'Cairo', system-ui, sans-serif" }}>
      {children}
    </label>
  );
}

function GradientButton({
  children, onClick, type = "button", loading = false, disabled = false,
}: {
  children: React.ReactNode; onClick?: () => void;
  type?: "button" | "submit"; loading?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled || loading}
      className="relative w-full py-3.5 px-6 rounded-xl font-bold text-white transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
      style={{
        fontFamily: "'Cairo', system-ui, sans-serif",
        fontSize: "15px",
        background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 55%, #9333EA 100%)",
        boxShadow: (loading || disabled) ? "none" : "0 0 28px rgba(37,99,235,0.5), 0 4px 16px rgba(0,0,0,0.4)",
      }}
      onMouseEnter={(e) => {
        if (!loading && !disabled) {
          e.currentTarget.style.transform = "translateY(-1px) scale(1.005)";
          e.currentTarget.style.boxShadow = "0 0 40px rgba(37,99,235,0.65), 0 8px 24px rgba(0,0,0,0.5)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = (loading || disabled) ? "none" : "0 0 28px rgba(37,99,235,0.5), 0 4px 16px rgba(0,0,0,0.4)";
      }}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span className="flex items-center gap-2">{children}</span>
    </button>
  );
}

/* ─── Logo ───────────────────────────────────────────────────────────────── */
function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  const imgSizes = { sm: "w-8 h-8", md: "w-10 h-10", lg: "w-14 h-14", xl: "w-16 h-16" };
  const textSizes = { sm: "text-base", md: "text-xl", lg: "text-2xl", xl: "text-3xl" };
  return (
    <div className="flex items-center gap-3">
      <div className={`${imgSizes[size]} rounded-2xl overflow-hidden flex-shrink-0 relative`}
        style={{ boxShadow: "0 0 20px rgba(37,99,235,0.4), 0 4px 12px rgba(0,0,0,0.4)" }}>
        <img src="/logo-icon.png" alt="Radius Pro" className="w-full h-full object-cover" />
      </div>
      <div className="flex flex-col leading-none">
        <span className={`${textSizes[size]} font-black text-white tracking-tight`}>
          Radius{" "}
          <span style={{
            background: "linear-gradient(135deg, #60a5fa, #a78bfa, #22d3ee)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}>Pro</span>
        </span>
        <span className="text-[10px] font-medium tracking-[0.2em] uppercase" style={{ color: "#475569" }}>
          Network Management
        </span>
      </div>
    </div>
  );
}

/* ─── Feature Cards ──────────────────────────────────────────────────────── */
const FEATURES = [
  { icon: Users, label: "إدارة المشتركين", color: "#2563EB", desc: "PPPoE & Hotspot" },
  { icon: CreditCard, label: "إدارة الكروت", color: "#9333EA", desc: "Bulk Generation" },
  { icon: Server, label: "MikroTik & NAS", color: "#06B6D4", desc: "Auto Provisioning" },
  { icon: Globe, label: "VPN Management", color: "#8B5CF6", desc: "SSTP & PPTP" },
  { icon: Radio, label: "FreeRADIUS", color: "#6366F1", desc: "AAA Server" },
  { icon: BarChart3, label: "التقارير", color: "#10B981", desc: "Advanced Analytics" },
];

/* ─── Stats ──────────────────────────────────────────────────────────────── */
const STATS = [
  { value: "+1000", label: "عميل نشط", color: "#2563EB" },
  { value: "99.9%", label: "وقت التشغيل", color: "#10B981" },
  { value: "+50K", label: "كرت يومياً", color: "#9333EA" },
  { value: "24/7", label: "دعم فني", color: "#06B6D4" },
];

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function Auth() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const [activeView, setActiveView] = useState<AuthView>("login");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [verificationType, setVerificationType] = useState<"email" | "sms" | "both">("email");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showTransition, setShowTransition] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(VERIFY_CODE_TTL);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(countdownRef.current!); countdownRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (activeView === "verify-email") startCountdown();
    else { if (countdownRef.current) clearInterval(countdownRef.current); setCountdown(0); }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [activeView, startCountdown]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const [loginForm, setLoginForm] = useState({ usernameOrEmail: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    username: "", email: "", password: "", confirmPassword: "", name: "", phone: "", preferredCurrency: "USD" as string,
  });
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetForm, setResetForm] = useState({ code: "", newPassword: "", confirmPassword: "" });
  const [verificationCode, setVerificationCode] = useState("");
  const utils = trpc.useUtils();

  useEffect(() => {
    // Don't redirect if we're showing the transition screen
    if (!loading && isAuthenticated && !showTransition) setLocation("/dashboard");
  }, [isAuthenticated, loading, setLocation, showTransition]);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      toast.success("تم تسجيل الدخول بنجاح!");
      try { await utils.auth.me.fetch(); } catch { /* ignore */ }
      // Show professional transition screen before navigating
      setShowTransition(true);
    },
    onError: (error) => {
      if (error.message === "EMAIL_NOT_VERIFIED") {
        // Show Arabic message and redirect to verification screen
        toast.error("⚠️ هذا الحساب غير مفعّل، يرجى تفعيل بريدك الإلكتروني أولاً", { duration: 5000 });
        setPendingEmail(loginForm.usernameOrEmail.includes("@") ? loginForm.usernameOrEmail : "");
        setActiveView("verify-email");
        startCountdown();
      } else {
        toast.error(error.message || "فشل تسجيل الدخول");
      }
    },
  });

  const { data: verSettings } = trpc.site.getVerificationSettings.useQuery();

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data, variables) => {
      // استخدام verificationType من الـ server مباشرة
      const vType = data.verificationType || "email";
      setVerificationType(vType);
      setPendingEmail(data.pendingEmail || variables.email);
      setPendingPhone(data.pendingPhone || null);

      if (vType === "sms" || vType === "both") {
        toast.success("تم إنشاء الحساب! تحقق من رسائل SMS.");
        setActiveView("verify-email");
        startCountdown();
      } else if (vType === "email") {
        toast.success("تم إنشاء الحساب! تحقق من بريدك الإلكتروني.");
        setActiveView("verify-email");
        startCountdown();
      } else {
        toast.success("تم إنشاء الحساب بنجاح! يمكنك تسجيل الدخول الآن.");
        setActiveView("login");
        setLoginForm({ usernameOrEmail: variables.username, password: "" });
      }
    },
    onError: (error) => toast.error(error.message || "فشل إنشاء الحساب"),
  });

  const forgotPasswordMutation = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => { toast.success("تم إرسال رمز الاستعادة!"); setPendingEmail(forgotEmail); setActiveView("reset-password"); },
    onError: (error) => toast.error(error.message || "فشل إرسال الرمز"),
  });

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => { toast.success("تم تغيير كلمة المرور بنجاح!"); setActiveView("login"); setResetForm({ code: "", newPassword: "", confirmPassword: "" }); },
    onError: (error) => toast.error(error.message || "فشل تغيير كلمة المرور"),
  });

  const verifyEmailMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => { toast.success("تم تأكيد البريد الإلكتروني بنجاح!"); setActiveView("login"); setLoginForm({ usernameOrEmail: registerForm.username || pendingEmail, password: "" }); },
    onError: (error) => toast.error(error.message || "رمز التحقق غير صحيح"),
  });

  const resendCodeMutation = trpc.auth.resendVerificationCode.useMutation({
    onSuccess: () => { toast.success("تم إرسال رمز جديد"); startCountdown(); },
    onError: (error) => toast.error(error.message || "فشل إرسال الرمز"),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.usernameOrEmail || !loginForm.password) { toast.error("الرجاء إدخال اسم المستخدم وكلمة المرور"); return; }
    loginMutation.mutate({ ...loginForm, rememberMe });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.name || registerForm.name.trim().length < 2) { toast.error("الاسم الكامل مطلوب"); return; }
    if (!registerForm.username || registerForm.username.trim().length < 3) { toast.error("اسم المستخدم مطلوب (3 أحرف)"); return; }
    if (!registerForm.email || !registerForm.email.includes("@")) { toast.error("البريد الإلكتروني غير صحيح"); return; }
    if (!registerForm.phone || registerForm.phone.trim().length < 7) { toast.error("رقم الجوال مطلوب"); return; }
    if (!registerForm.password || registerForm.password.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (registerForm.password !== registerForm.confirmPassword) { toast.error("كلمتا المرور غير متطابقتين"); return; }
    registerMutation.mutate({
      username: registerForm.username.trim(),
      email: registerForm.email.trim().toLowerCase(),
      password: registerForm.password,
      name: registerForm.name.trim(),
      phone: registerForm.phone.trim() || undefined,
      preferredCurrency: registerForm.preferredCurrency as "USD" | "ILS" | "JOD" | "SAR" | "AED" | "EGP" | "YER",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <NetworkCanvas />
        <BgOverlays />
        <div className="flex flex-col items-center gap-4 relative" style={{ zIndex: 10 }}>
          <Logo size="xl" />
          <div className="flex items-center gap-2 mt-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-sm text-slate-500">جاري التحميل...</span>
          </div>
        </div>
      </div>
    );
  }

  const isSimpleView = ["forgot-password", "reset-password", "verify-email"].includes(activeView);

  // Show professional transition screen after login
  if (showTransition) {
    return <LoginTransition onComplete={() => setLocation("/dashboard")} />;
  }

  return (
    <div
      className="min-h-screen flex"
      style={{ background: C.bg, direction: "rtl", fontFamily: "'Cairo', system-ui, sans-serif" }}
    >
      {/* Animated Network Background */}
      <NetworkCanvas />
      <BgOverlays />

      {/* ══════════════════════════════════════════════════════════════════
          RIGHT: Login Card (50%)
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className="flex flex-col justify-center items-center w-full lg:w-1/2 px-6 py-10 sm:px-10 md:px-16 relative min-h-screen"
        style={{
          zIndex: 10,
          fontFamily: "'Cairo', system-ui, sans-serif",
        }}
      >
        {/* Mobile logo */}
        <div className="lg:hidden mb-8 self-start">
          <Logo size="md" />
        </div>

        {/* Glass Login Card */}
        <div
          className={`w-full transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
          style={{
            maxWidth: isSimpleView ? "420px" : "460px",
            background: "linear-gradient(145deg, rgba(17,24,39,0.96) 0%, rgba(11,17,32,0.94) 100%)",
            border: "none",
            borderRadius: "28px",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            boxShadow: `
              0 40px 80px rgba(0,0,0,0.65),
              0 0 0 1px rgba(255,255,255,0.06) inset,
              0 1px 0 rgba(255,255,255,0.1) inset,
              0 0 60px rgba(37,99,235,0.08),
              0 0 30px rgba(147,51,234,0.06)
            `,
          }}
        >
          {/* Top gradient accent line */}
          <div className="h-px w-full rounded-t-[28px]" style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(37,99,235,0.7) 25%, rgba(6,182,212,0.7) 50%, rgba(147,51,234,0.7) 75%, transparent 100%)"
          }} />

          <div className="p-8 md:p-10">
            {/* Logo inside card */}
            <div className="mb-8 flex justify-center">
              <Logo size="lg" />
            </div>

            {isSimpleView ? (
              /* ── Simple Views ── */
              <>
                {activeView === "forgot-password" && (
                  <div className="space-y-5">
                    <div className="text-center mb-4">
                      <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                        style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.25)", boxShadow: "0 0 20px rgba(37,99,235,0.15)" }}>
                        <Mail className="h-7 w-7 text-blue-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">استعادة كلمة المرور</h2>
                      <p className="text-sm mt-2" style={{ color: C.textSecondary }}>أدخل بريدك الإلكتروني وسنرسل لك رمز الاستعادة</p>
                    </div>
                    <div>
                      <AuthLabel htmlFor="forgot-email">البريد الإلكتروني</AuthLabel>
                      <AuthInput id="forgot-email" type="email" placeholder="example@email.com" value={forgotEmail} onChange={setForgotEmail} icon={Mail} />
                    </div>
                    <GradientButton loading={forgotPasswordMutation.isPending}
                      onClick={() => { if (!forgotEmail) { toast.error("أدخل البريد الإلكتروني"); return; } forgotPasswordMutation.mutate({ email: forgotEmail }); }}>
                      <ArrowRight className="h-4 w-4" />
                      إرسال رمز الاستعادة
                    </GradientButton>
                    <div className="text-center">
                      <button type="button" onClick={() => setActiveView("login")}
                        className="text-sm transition-colors hover:text-white"
                        style={{ color: C.textSecondary }}>
                        ← العودة لتسجيل الدخول
                      </button>
                    </div>
                  </div>
                )}

                {activeView === "reset-password" && (
                  <div className="space-y-5">
                    <div className="text-center mb-4">
                      <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                        style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", boxShadow: "0 0 20px rgba(16,185,129,0.15)" }}>
                        <Lock className="h-7 w-7 text-emerald-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">كلمة مرور جديدة</h2>
                      <p className="text-sm mt-2" style={{ color: C.textSecondary }}>
                        تم إرسال الرمز إلى <span className="text-blue-400">{pendingEmail}</span>
                      </p>
                    </div>
                    <div>
                      <AuthLabel htmlFor="reset-code">رمز الاستعادة</AuthLabel>
                      <AuthInput id="reset-code" placeholder="أدخل الرمز المرسل" value={resetForm.code} onChange={(v) => setResetForm({ ...resetForm, code: v })} />
                    </div>
                    <div>
                      <AuthLabel htmlFor="reset-pass">كلمة المرور الجديدة</AuthLabel>
                      <AuthInput id="reset-pass" type={showPassword ? "text" : "password"} placeholder="6 أحرف+"
                        value={resetForm.newPassword} onChange={(v) => setResetForm({ ...resetForm, newPassword: v })} icon={Lock}
                        rightSlot={<button type="button" onClick={() => setShowPassword(!showPassword)} className="text-slate-500 hover:text-white transition-colors">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />
                    </div>
                    <div>
                      <AuthLabel htmlFor="reset-confirm">تأكيد كلمة المرور</AuthLabel>
                      <AuthInput id="reset-confirm" type="password" placeholder="أعد الإدخال"
                        value={resetForm.confirmPassword} onChange={(v) => setResetForm({ ...resetForm, confirmPassword: v })} icon={Lock} />
                    </div>
                    <GradientButton loading={resetPasswordMutation.isPending}
                      onClick={() => {
                        if (!resetForm.code || !resetForm.newPassword) { toast.error("أكمل جميع الحقول"); return; }
                        if (resetForm.newPassword !== resetForm.confirmPassword) { toast.error("كلمتا المرور غير متطابقتين"); return; }
                        resetPasswordMutation.mutate({ email: pendingEmail, code: resetForm.code, newPassword: resetForm.newPassword });
                      }}>
                      تغيير كلمة المرور
                    </GradientButton>
                    <div className="text-center">
                      <button type="button" onClick={() => setActiveView("login")} className="text-sm transition-colors hover:text-white" style={{ color: C.textSecondary }}>← العودة لتسجيل الدخول</button>
                    </div>
                  </div>
                )}

                {activeView === "verify-email" && (
                  <div className="space-y-5">
                    <div className="text-center mb-4">
                      <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                        style={{ background: (verificationType === "sms" || verificationType === "both") ? "rgba(16,185,129,0.12)" : "rgba(37,99,235,0.12)", border: (verificationType === "sms" || verificationType === "both") ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(37,99,235,0.25)", boxShadow: (verificationType === "sms" || verificationType === "both") ? "0 0 20px rgba(16,185,129,0.15)" : "0 0 20px rgba(37,99,235,0.15)" }}>
                        {(verificationType === "sms" || verificationType === "both") 
                          ? <MessageSquare className="h-7 w-7 text-emerald-400" />
                          : <CheckCircle className="h-7 w-7 text-blue-400" />}
                      </div>
                      <h2 className="text-2xl font-bold text-white">
                        {(verificationType === "sms" || verificationType === "both") ? "تأكيد رقم الهاتف" : "تأكيد البريد الإلكتروني"}
                      </h2>
                      <p className="text-sm mt-2" style={{ color: C.textSecondary }}>
                        {(verificationType === "sms" || verificationType === "both")
                          ? <>تم إرسال رمز التحقق عبر SMS إلى <span className="text-emerald-400">{pendingPhone || registerForm.phone}</span></>
                          : <>تم إرسال رمز التحقق إلى <span className="text-blue-400">{pendingEmail}</span></>}
                      </p>
                    </div>
                    <div>
                      <AuthLabel htmlFor="verify-code">رمز التحقق</AuthLabel>
                      <AuthInput id="verify-code" placeholder="أدخل الرمز المرسل" value={verificationCode} onChange={setVerificationCode} />
                    </div>
                    {countdown > 0 && (
                      <p className="text-center text-sm" style={{ color: C.textSecondary }}>
                        صلاحية الرمز: <span className="text-blue-400 font-mono font-bold">{formatCountdown(countdown)}</span>
                      </p>
                    )}
                    <GradientButton loading={verifyEmailMutation.isPending}
                      onClick={() => { if (!verificationCode) { toast.error("أدخل رمز التحقق"); return; } verifyEmailMutation.mutate({ email: pendingEmail, code: verificationCode }); }}>
                      تأكيد الحساب
                    </GradientButton>
                    <div className="text-center space-y-2">
                      <button type="button" disabled={countdown > 0 || resendCodeMutation.isPending}
                        onClick={() => resendCodeMutation.mutate({ email: pendingEmail })}
                        className="text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors block w-full hover:text-white"
                        style={{ color: C.textSecondary }}>
                        {resendCodeMutation.isPending ? "جاري الإرسال..." : "إعادة إرسال الرمز"}
                      </button>
                      <button type="button" onClick={() => setActiveView("login")} className="text-sm transition-colors hover:text-white" style={{ color: C.textSecondary }}>← العودة لتسجيل الدخول</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* ── Login / Register ── */
              <>
                {/* Header */}
                <div className="mb-6 text-center">
                  <h2 className="text-2xl font-bold text-white mb-1">
                    {activeView === "register" ? "إنشاء حساب جديد" : "مرحباً بعودتك 👋"}
                  </h2>
                  <p className="text-sm" style={{ color: C.textSecondary }}>
                    {activeView === "register"
                      ? "أنشئ حسابك للبدء في إدارة شبكتك"
                      : "سجل دخولك للوصول إلى لوحة التحكم"}
                  </p>
                </div>

                {/* Tab Switcher */}
                <div className="flex rounded-2xl p-1 mb-6"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  {(["login", "register"] as const).map((tab) => (
                    <button key={tab} type="button" onClick={() => setActiveView(tab)}
                      className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-300"
                      style={
                        activeView === tab
                          ? { background: "linear-gradient(135deg, #2563EB, #7C3AED)", color: "white", boxShadow: "0 2px 12px rgba(37,99,235,0.4)" }
                          : { color: "#64748b" }
                      }>
                      {tab === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
                    </button>
                  ))}
                </div>

                {/* Login Form */}
                {activeView === "login" && (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <AuthLabel htmlFor="login-username">اسم المستخدم أو البريد الإلكتروني</AuthLabel>
                      <AuthInput id="login-username" placeholder="admin@example.com"
                        value={loginForm.usernameOrEmail}
                        onChange={(v) => setLoginForm({ ...loginForm, usernameOrEmail: v })}
                        icon={User} />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <AuthLabel htmlFor="login-password">كلمة المرور</AuthLabel>
                        <button type="button" onClick={() => setActiveView("forgot-password")}
                          className="text-xs font-medium transition-colors hover:text-blue-300"
                          style={{ color: "#60a5fa" }}>
                          نسيت كلمة المرور؟
                        </button>
                      </div>
                      <AuthInput id="login-password" type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={loginForm.password}
                        onChange={(v) => setLoginForm({ ...loginForm, password: v })}
                        icon={Lock}
                        rightSlot={
                          <button type="button" onClick={() => setShowPassword(!showPassword)}
                            className="text-slate-500 hover:text-white transition-colors">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        } />
                    </div>

                    {/* Remember Me */}
                    <div className="flex items-center justify-between py-1">
                      <label
                        className="flex items-center gap-2.5 cursor-pointer group"
                        style={{ userSelect: "none" }}
                      >
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="sr-only"
                        />
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all duration-200"
                          style={{
                            background: rememberMe ? "linear-gradient(135deg, #2563EB, #9333EA)" : "rgba(255,255,255,0.05)",
                            border: rememberMe ? "1px solid #2563EB" : "1px solid rgba(255,255,255,0.15)",
                            boxShadow: rememberMe ? "0 0 10px rgba(37,99,235,0.4)" : "none",
                          }}
                        >
                          {rememberMe && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-xs font-medium transition-colors group-hover:text-slate-300" style={{ color: C.textSecondary }}>
                          تذكرني
                        </span>
                      </label>
                    </div>

                    <GradientButton type="submit" loading={loginMutation.isPending}>
                      {!loginMutation.isPending && <ArrowRight className="h-4 w-4" />}
                      تسجيل الدخول
                    </GradientButton>

                    <div className="flex items-center gap-3 my-2">
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                      <span className="text-xs" style={{ color: "#475569" }}>أو</span>
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                    </div>

                    <p className="text-center text-xs" style={{ color: C.textSecondary }}>
                      ليس لديك حساب؟{" "}
                      <button type="button" onClick={() => setActiveView("register")}
                        className="font-semibold text-blue-400 hover:text-blue-300 transition-colors">
                        إنشاء حساب
                      </button>
                    </p>
                  </form>
                )}

                {/* Register Form */}
                {activeView === "register" && (
                  <form onSubmit={handleRegister} className="space-y-3.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <AuthLabel htmlFor="reg-name">الاسم الكامل *</AuthLabel>
                        <AuthInput id="reg-name" placeholder="اسمك الكامل" value={registerForm.name}
                          onChange={(v) => setRegisterForm({ ...registerForm, name: v })} dir="rtl" />
                      </div>
                      <div>
                        <AuthLabel htmlFor="reg-username">اسم المستخدم *</AuthLabel>
                        <AuthInput id="reg-username" placeholder="username" value={registerForm.username}
                          onChange={(v) => setRegisterForm({ ...registerForm, username: v })} />
                      </div>
                    </div>
                    <div>
                      <AuthLabel htmlFor="reg-email">البريد الإلكتروني *</AuthLabel>
                      <AuthInput id="reg-email" type="email" placeholder="example@email.com" value={registerForm.email}
                        onChange={(v) => setRegisterForm({ ...registerForm, email: v })} icon={Mail} />
                    </div>
                    <div>
                      <AuthLabel htmlFor="reg-phone">رقم الجوال *</AuthLabel>
                      <AuthInput id="reg-phone" type="tel" placeholder="0590000000" value={registerForm.phone}
                        onChange={(v) => setRegisterForm({ ...registerForm, phone: v })} icon={Phone} />
                    </div>
                    <div>
                      <AuthLabel htmlFor="reg-currency">العملة المفضلة *</AuthLabel>
                      <Select value={registerForm.preferredCurrency}
                        onValueChange={(v) => setRegisterForm({ ...registerForm, preferredCurrency: v })}>
                        <SelectTrigger className="w-full rounded-xl text-sm py-3 h-auto"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "white" }}>
                          <SelectValue placeholder="اختر العملة" />
                        </SelectTrigger>
                        <SelectContent style={{ background: "#111827", borderColor: "rgba(255,255,255,0.1)" }}>
                          {CURRENCIES.map((cur) => (
                            <SelectItem key={cur.code} value={cur.code} className="text-white focus:bg-white/10">
                              <span className="font-mono ml-2">{cur.symbol}</span> {cur.nameAr} ({cur.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <AuthLabel htmlFor="reg-pass">كلمة المرور *</AuthLabel>
                        <AuthInput id="reg-pass" type={showPassword ? "text" : "password"} placeholder="6 أحرف+"
                          value={registerForm.password}
                          onChange={(v) => setRegisterForm({ ...registerForm, password: v })}
                          icon={Lock}
                          rightSlot={
                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                              className="text-slate-500 hover:text-white transition-colors">
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          } />
                      </div>
                      <div>
                        <AuthLabel htmlFor="reg-confirm">تأكيد المرور *</AuthLabel>
                        <AuthInput id="reg-confirm" type={showConfirmPassword ? "text" : "password"} placeholder="أعد الإدخال"
                          value={registerForm.confirmPassword}
                          onChange={(v) => setRegisterForm({ ...registerForm, confirmPassword: v })}
                          icon={Lock}
                          rightSlot={
                            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="text-slate-500 hover:text-white transition-colors">
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          } />
                      </div>
                    </div>
                    <GradientButton type="submit" loading={registerMutation.isPending}>
                      {!registerMutation.isPending && <ArrowRight className="h-4 w-4" />}
                      إنشاء الحساب
                    </GradientButton>
                  </form>
                )}
              </>
            )}
          </div>

          {/* Bottom gradient line */}
          <div className="h-px w-full rounded-b-[28px]" style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(147,51,234,0.4) 30%, rgba(6,182,212,0.4) 50%, rgba(37,99,235,0.4) 70%, transparent 100%)"
          }} />
        </div>

        {/* Footer - جميع الحقوق محفوظة */}
        <div className="mt-6 text-center" style={{ direction: "rtl" }}>
          <p style={{ color: "rgba(148,163,184,0.55)", fontSize: "12px", fontFamily: "'Cairo', sans-serif", letterSpacing: "0.02em" }}>
            جميع الحقوق محفوظة © {new Date().getFullYear()} — Radius Pro
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          LEFT: Branding Panel (50%) — hidden on mobile
      ══════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden" style={{ zIndex: 10, fontFamily: "'Cairo', system-ui, sans-serif" }}>

        <div className="flex flex-col justify-center h-full p-12 xl:p-16">
          {/* Middle: Main Branding */}
          <div className={`flex-1 flex flex-col justify-center items-center text-center max-w-xl mx-auto transition-all duration-700 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            {/* Badges */}
            <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#60a5fa" }}>
                <Zap className="h-3 w-3" />
                نظام إدارة شبكات من الجيل القادم
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#34d399" }}>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: "0 0 6px #10B981" }} />
                متاح الآن
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl xl:text-6xl font-black text-white leading-[1.1] mb-5 tracking-tight text-center">
              إدارة شبكتك
              <br />
              <span style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 35%, #a78bfa 65%, #f472b6 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                من مكان واحد
              </span>
            </h1>

            {/* Description */}
            <p className="text-lg leading-relaxed mb-8 text-center" style={{ color: "#94A3B8" }}>
              منصة احترافية لإدارة <strong className="text-white font-semibold">MikroTik</strong> و <strong className="text-white font-semibold">FreeRADIUS</strong>
              <br />
              والمشتركين والكروت و <strong className="text-white font-semibold">VPN</strong> والتقارير.
            </p>

            {/* Stats Row */}
            <div className="flex items-center justify-center gap-6 mb-10 flex-wrap">
              {STATS.map((stat, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-2xl font-black" style={{ color: stat.color, textShadow: `0 0 20px ${stat.color}60` }}>
                    {stat.value}
                  </span>
                  <span className="text-xs font-medium" style={{ color: "#64748B" }}>{stat.label}</span>
                </div>
              ))}
            </div>

            {/* Feature Cards Grid - smaller, cleaner */}
            <div className="grid grid-cols-3 gap-3">
              {FEATURES.map(({ icon: Icon, label, color, desc }) => (
                <div
                  key={label}
                  className="flex flex-col gap-2.5 rounded-2xl p-4 transition-all duration-300 cursor-default"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                  onMouseEnter={(e) => {
                    const r = parseInt(color.slice(1, 3), 16);
                    const g = parseInt(color.slice(3, 5), 16);
                    const b = parseInt(color.slice(5, 7), 16);
                    e.currentTarget.style.background = `rgba(${r},${g},${b},0.08)`;
                    e.currentTarget.style.border = `1px solid ${color}35`;
                    e.currentTarget.style.transform = "translateY(-3px)";
                    e.currentTarget.style.boxShadow = `0 12px 30px ${color}18`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.06)";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                    <Icon className="h-4.5 w-4.5" style={{ color, width: "18px", height: "18px" }} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white leading-tight">{label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}
