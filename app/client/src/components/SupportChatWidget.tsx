import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { X, Send, MessageCircle, Loader2, Bot, User, Phone, CheckCircle, AlertTriangle } from "lucide-react";

// ─── Sound helpers (Web Audio API — no external files needed) ────────────────────────────
function createAudioContext(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playPopSound() {
  const ctx = createAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.06);
  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.12);
  osc.onended = () => ctx.close();
}

function playDingSound() {
  const ctx = createAudioContext();
  if (!ctx) return;
  // Two-tone chime
  [0, 0.08].forEach((delay, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(i === 0 ? 880 : 1100, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0.12, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.35);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.35);
    osc.onended = () => { if (i === 1) ctx.close(); };
  });
}

function playTypingTick() {
  const ctx = createAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(1200 + Math.random() * 200, ctx.currentTime);
  gain.gain.setValueAtTime(0.015, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.03);
  osc.onended = () => ctx.close();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
  needs_human?: boolean;
}

const WHATSAPP_NUMBER = "+970598329324";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER.replace("+", "")}`;

// ─── Typewriter hook ──────────────────────────────────────────────────────────
function useTypewriter(text: string, speed = 18, onDone?: () => void) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const tick = () => {
      i++;
      setDisplayed(text.slice(0, i));
      // play tick every 3 chars to avoid noise overload
      if (i % 3 === 0) playTypingTick();
      if (i < text.length) {
        timerRef.current = setTimeout(tick, speed);
      } else {
        setDone(true);
        onDone?.();
      }
    };
    timerRef.current = setTimeout(tick, speed);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return { displayed, done };
}

// ─── Parse voucher card details from AI reply text ───────────────────────────
function parseVoucherCard(text: string): {
  isVoucherReply: boolean;
  hasIssue: boolean;
  status: string;
  plan: string | null;
  speed: string | null;
  expiresAt: string | null;
  activatedAt: string | null;
  usedHours: string | null;
  remainingHours: string | null;
  usagePercent: number | null;
  devices: string | null;
  issueReason: string | null;
} {
  const isActive = /✅.*الكرت يعمل|يعمل بشكل طبيعي/i.test(text);
  const isIssue = /⚠️.*تنبيه|فيه خلل/i.test(text);
  if (!isActive && !isIssue) return {
    isVoucherReply: false, hasIssue: false, status: '', plan: null, speed: null,
    expiresAt: null, activatedAt: null, usedHours: null, remainingHours: null,
    usagePercent: null, devices: null, issueReason: null,
  };

  const extract = (label: string) => {
    const re = new RegExp(`${label}[:\s]+([^\n•]+)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim().replace(/^\[|\]$/g, '') : null;
  };

  const pctMatch = text.match(/(\d+)%/);
  const usagePercent = pctMatch ? parseInt(pctMatch[1]) : null;

  return {
    isVoucherReply: true,
    hasIssue: isIssue,
    status: extract('الحالة') || (isActive ? 'نشط' : 'خلل'),
    plan: extract('الخطة'),
    speed: extract('السرعة'),
    expiresAt: extract('تاريخ الانتهاء'),
    activatedAt: extract('تاريخ التفعيل'),
    usedHours: extract('الوقت المستهلك'),
    remainingHours: extract('الرصيد المتبقي'),
    usagePercent,
    devices: extract('الأجهزة المسموحة'),
    issueReason: extract('سبب المشكلة'),
  };
}

// ─── Voucher Card UI ──────────────────────────────────────────────────────────
function VoucherCard({ data, hasIssue }: { data: ReturnType<typeof parseVoucherCard>; hasIssue: boolean }) {
  const pct = data.usagePercent ?? 0;
  const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';

  return (
    <div
      className="mt-2.5 rounded-xl overflow-hidden border"
      style={{
        borderColor: hasIssue ? 'rgba(251,191,36,0.4)' : 'rgba(34,197,94,0.3)',
        background: hasIssue
          ? 'linear-gradient(135deg, #fffdf5 0%, #fff 100%)'
          : 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{
          background: hasIssue
            ? 'linear-gradient(90deg, #fef9ec, #fffdf5)'
            : 'linear-gradient(90deg, #dcfce7, #f0fdf4)',
        }}
      >
        <span className="text-base">{hasIssue ? '📋' : '✅'}</span>
        <span className="text-xs font-bold" style={{ color: hasIssue ? '#92400e' : '#16a34a' }}>
          {hasIssue ? 'معلومات الكرت' : 'الكرت يعمل بشكل طبيعي'}
        </span>
        <span
          className="mr-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{
            background: hasIssue ? '#fef3c7' : '#dcfce7',
            color: hasIssue ? '#92400e' : '#16a34a',
            border: `1px solid ${hasIssue ? '#fcd34d' : '#86efac'}`,
          }}
        >
          {data.status}
        </span>
      </div>

      {/* Details Grid */}
      <div className="px-3 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {data.plan && (
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-wide">الخطة</span>
            <span className="text-[11px] text-zinc-700 font-semibold">{data.plan}</span>
          </div>
        )}
        {data.speed && data.speed !== 'غير محدد' && (
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-wide">السرعة</span>
            <span className="text-[11px] text-zinc-700 font-semibold font-mono">{data.speed}</span>
          </div>
        )}
        {data.expiresAt && data.expiresAt !== 'غير محدد' && (
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-wide">انتهاء الصلاحية</span>
            <span className="text-[11px] text-zinc-700 font-semibold">{data.expiresAt}</span>
          </div>
        )}
        {data.activatedAt && data.activatedAt !== 'لم يُفعَّل بعد' && data.activatedAt !== 'غير محدد' && (
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-wide">تاريخ التفعيل</span>
            <span className="text-[11px] text-zinc-700 font-semibold">{data.activatedAt}</span>
          </div>
        )}
        {data.devices && (
          <div className="flex flex-col">
            <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-wide">أجهزة مسموحة</span>
            <span className="text-[11px] text-zinc-700 font-semibold">{data.devices} جهاز</span>
          </div>
        )}

      </div>

      {/* Usage Section */}
      {(data.usedHours || data.remainingHours || data.usagePercent !== null) && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: hasIssue ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' }}>
          <span className="text-[9px] text-zinc-400 font-medium uppercase tracking-wide">⏱️ الاستهلاك</span>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 mb-2">
            {data.usedHours && (
              <div className="flex flex-col">
                <span className="text-[9px] text-zinc-400">مستهلك</span>
                <span className="text-[11px] text-zinc-700 font-semibold">{data.usedHours}</span>
              </div>
            )}
            {data.remainingHours && data.remainingHours !== 'غير محدد' && (
              <div className="flex flex-col">
                <span className="text-[9px] text-zinc-400">متبقي</span>
                <span className="text-[11px] font-bold" style={{ color: hasIssue ? '#dc2626' : '#16a34a' }}>
                  {data.remainingHours}
                </span>
              </div>
            )}
          </div>
          {/* Progress Bar */}
          {data.usagePercent !== null && (
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[9px] text-zinc-400">نسبة الاستهلاك</span>
                <span className="text-[9px] font-bold" style={{ color: barColor }}>{pct}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Single AI message with typewriter ───────────────────────────────────────
function AIMessage({ content, isNew, needs_human, onTypingDone }: {
  content: string;
  isNew: boolean;
  needs_human?: boolean;
  onTypingDone?: () => void;
}) {
  const { displayed, done } = useTypewriter(isNew ? content : content, isNew ? 16 : 0, onTypingDone);
  const text = isNew ? displayed : content;

  // ── Parse voucher details from text ──
  const voucherData = done ? parseVoucherCard(text) : { isVoucherReply: false } as ReturnType<typeof parseVoucherCard>;

  // ── Strip the structured block from the displayed text to avoid duplication ──
  const cleanText = voucherData.isVoucherReply
    ? text
        .replace(/✅[^\n]*\n?/g, '')
        .replace(/⚠️[^\n]*\n?/g, '')
        .replace(/📋[\s\S]*?(?=📞|$)/g, '')
        .replace(/⏱️[\s\S]*?(?=👥|📞|$)/g, '')
        .replace(/👥[^\n]*\n?/g, '')
        .replace(/📞[^\n]*\n?/g, '')
        .trim()
    : text;

  return (
    <div className="flex items-start gap-2.5 mb-3">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex flex-col gap-1.5 max-w-[85%]">
        <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
          {/* Text — hide if empty after cleaning */}
          {cleanText && (
            <p className="text-sm text-zinc-800 dark:text-zinc-100 leading-relaxed whitespace-pre-wrap">
              {cleanText}
              {isNew && !done && (
                <span className="inline-block w-1.5 h-3.5 bg-violet-500 rounded-sm ml-0.5 animate-pulse" />
              )}
            </p>
          )}
          {/* Typing cursor when no text yet */}
          {!cleanText && isNew && !done && (
            <span className="inline-block w-1.5 h-3.5 bg-violet-500 rounded-sm animate-pulse" />
          )}

          {/* Voucher Card */}
          {voucherData.isVoucherReply && done && (
            <VoucherCard data={voucherData} hasIssue={voucherData.hasIssue} />
          )}


        </div>
        {/* WhatsApp CTA when needs_human */}
        {needs_human && done && (
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-semibold shadow-md w-fit"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            تحدث مع الدعم الفني عبر واتساب
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────
export default function SupportChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [latestAiId, setLatestAiId] = useState<string | null>(null);
  const [typingDone, setTypingDone] = useState(true);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Auth state ────────────────────────────────────────────────────────────
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const chatMutation = trpc.aiChat.chat.useMutation();

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [messages, open]);

  // ── Focus input when opened ───────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
      setUnread(0);
    }
  }, [open]);

  // ── Initial greeting ──────────────────────────────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0) {
      const greetId = `ai-${Date.now()}`;
      setLatestAiId(greetId);
      setTypingDone(false);
      const greeting = isLoggedIn
        ? `مرحباً بك في Radius Pro! 👋\nأنا مساعدك الذكي، يمكنني مساعدتك في:\n• فحص حالة كرتك أو اشتراكك\n• حل أي مشكلة تقنية تتعلق بشبكتك\n\nكيف يمكنني مساعدتك اليوم؟`
        : `مرحباً بك في Radius Pro! 👋\nأنا مساعدك الذكي، يمكنني مساعدتك في حل أي مشكلة تقنية تتعلق بشبكتك أو اشتراكك.\nكيف يمكنني مساعدتك اليوم؟`;
      setMessages([{
        id: greetId,
        role: "assistant",
        content: greeting,
      }]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading || !typingDone) return;
    playPopSound();

    const userMsgId = `user-${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: "user", content: text },
    ];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const history = newMessages
        .filter(m => !m.isTyping)
        .map(m => ({ role: m.role, content: m.content }));

      // ── إرسال userId إذا كان المستخدم مسجلاً (للـ Tool Calling) ──
      const result = await chatMutation.mutateAsync({
        messages: history,
        ...(isLoggedIn && user?.id ? { userId: user.id } : {}),
      });

      const aiMsgId = `ai-${Date.now()}`;
      setLatestAiId(aiMsgId);
      setTypingDone(false);
      playDingSound();
      setMessages(prev => [
        ...prev,
        {
          id: aiMsgId,
          role: "assistant",
          content: result.reply,
          needs_human: result.needs_human,
        },
      ]);
      if (!open) setUnread(u => u + 1);
    } catch {
      const errId = `ai-err-${Date.now()}`;
      setLatestAiId(errId);
      setTypingDone(false);
      setMessages(prev => [
        ...prev,
        {
          id: errId,
          role: "assistant",
          content: "عذراً، حدث خطأ مؤقت. يمكنك التواصل معنا مباشرة عبر واتساب.",
          needs_human: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, typingDone, messages, chatMutation, open, isLoggedIn, user]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* ── Floating Button ──────────────────────────────────────────────── */}
      <button
        onClick={() => { setOpen(o => { if (!o) playPopSound(); return !o; }); }}
        className="fixed bottom-20 left-4 sm:bottom-6 sm:left-6 z-[9999] w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-2xl flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)",
          boxShadow: "0 8px 32px rgba(124,58,237,0.45)",
        }}
        aria-label="فتح الدعم الفني"
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <MessageCircle className="w-6 h-6 text-white" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </>
        )}
        {/* Pulse ring */}
        {!open && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ background: "linear-gradient(135deg, #7c3aed, #ec4899)" }}
          />
        )}
      </button>

      {/* ── Chat Window ──────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-36 left-2 sm:bottom-24 sm:left-6 z-[9998] w-[calc(100vw-1rem)] max-w-[340px] sm:w-[380px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            maxHeight: "520px",
            background: "var(--chat-bg, #f8f8fc)",
            border: "1px solid rgba(124,58,237,0.15)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(124,58,237,0.08)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3.5 flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 60%, #ec4899 100%)" }}
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-tight">مساعد Radius Pro</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-white/80 text-xs">
                  {isLoggedIn ? "متاح · يمكنه فحص الكروت" : "متاح الآن · ذكاء اصطناعي"}
                </span>
              </div>
            </div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center flex-shrink-0"
              title="واتساب"
            >
              <Phone className="w-4 h-4 text-white" />
            </a>
          </div>

          {/* Logged-in badge */}
          {isLoggedIn && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border-b border-violet-100">
              <CheckCircle className="w-3.5 h-3.5 text-violet-500" />
              <span className="text-xs text-violet-700 font-medium">مسجل الدخول — يمكنك فحص كرتك مباشرة</span>
            </div>
          )}

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-3 py-3"
            style={{ background: "#f4f4f8", minHeight: 0 }}
          >
            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex items-start gap-2.5 mb-3 flex-row-reverse">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
                      <User className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[80%] shadow-sm">
                      <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                );
              }
              return (
                <AIMessage
                  key={msg.id}
                  content={msg.content}
                  isNew={msg.id === latestAiId}
                  needs_human={msg.needs_human}
                  onTypingDone={() => { if (msg.id === latestAiId) setTypingDone(true); }}
                />
              );
            })}

            {/* Loading dots */}
            {isLoading && (
              <div className="flex items-start gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-md">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 border-t flex-shrink-0"
            style={{ background: "#fff", borderColor: "rgba(124,58,237,0.1)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLoggedIn ? "اكتب رقم الكرت أو سؤالك..." : "اكتب رسالتك..."}
              disabled={isLoading || !typingDone}
              className="flex-1 text-sm bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 text-zinc-800 placeholder:text-zinc-400 disabled:opacity-50"
              dir="rtl"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || !typingDone}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)" }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>

          {/* Footer */}
          <div
            className="text-center py-1.5 text-[10px] text-zinc-400 flex-shrink-0"
            style={{ background: "#fff", borderTop: "1px solid rgba(0,0,0,0.04)" }}
          >
            مدعوم بالذكاء الاصطناعي · <span className="font-semibold text-violet-500">Radius Pro</span>
          </div>
        </div>
      )}
    </>
  );
}
