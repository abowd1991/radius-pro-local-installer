import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  installGlobalOperationFeedbackBridge,
  subscribeToOperationFeedback,
  type OperationFeedbackEvent,
} from "@/lib/operationFeedback";
import { triggerMobileErrorHaptic } from "@/lib/mobileFeedback";

const SUCCESS_DURATION_MS = 3400;

export function OperationFeedbackOverlay() {
  const { language, direction } = useLanguage();
  const [feedback, setFeedback] = useState<OperationFeedbackEvent | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const acknowledgementRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => {
    if (!feedback || isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setFeedback(null);
      setIsClosing(false);
    }, 180);
  }, [feedback, isClosing]);

  useEffect(() => {
    installGlobalOperationFeedbackBridge();
    return subscribeToOperationFeedback((nextFeedback) => {
      setIsClosing(false);
      setFeedback(nextFeedback);
    });
  }, []);

  useEffect(() => {
    if (!feedback || isClosing) return;
    acknowledgementRef.current?.focus();

    if (feedback.kind === "error") triggerMobileErrorHaptic();

    if (feedback.kind !== "success") return;
    const timer = window.setTimeout(dismiss, SUCCESS_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dismiss, feedback, isClosing]);

  useEffect(() => {
    if (!feedback || feedback.kind !== "success") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, feedback]);

  if (!feedback) return null;

  const isSuccess = feedback.kind === "success";
  const title = isSuccess
    ? language === "ar" ? "تمت العملية بنجاح" : "Operation completed"
    : language === "ar" ? "تعذر إتمام العملية" : "Could not complete the operation";
  const closeLabel = language === "ar" ? "حسناً" : "OK";

  return (
    <div
      className={`fixed inset-0 z-[120] flex min-h-[100dvh] items-end justify-center bg-slate-950/55 px-3 pt-12 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[5px] motion-safe:transition-opacity motion-safe:duration-200 sm:items-center sm:p-4 ${isClosing ? "motion-safe:opacity-0" : "opacity-100"}`}
      aria-live="assertive"
      dir={direction}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="operation-feedback-title"
        aria-describedby="operation-feedback-description"
        className={`relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-[24px] border border-white/15 bg-gradient-to-br from-slate-950/95 via-slate-900/95 to-violet-950/90 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-[0_24px_90px_rgba(2,6,23,0.62)] motion-reduce:transition-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-[28px] sm:p-8 ${isClosing ? "motion-safe:animate-out motion-safe:slide-out-to-bottom-6 motion-safe:duration-200 sm:motion-safe:zoom-out-95 sm:motion-safe:slide-out-to-bottom-0" : "motion-safe:animate-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-300 sm:motion-safe:zoom-in-95 sm:motion-safe:slide-in-from-bottom-0"}`}
      >
        <div className={`pointer-events-none absolute -top-16 ${direction === "rtl" ? "-right-16" : "-left-16"} h-44 w-44 rounded-full blur-3xl ${isSuccess ? "bg-emerald-400/25" : "bg-rose-500/25"}`} />
        <div className="pointer-events-none absolute -bottom-20 left-1/2 h-36 w-56 -translate-x-1/2 rounded-full bg-violet-500/20 blur-3xl" />

        <div className="relative flex flex-col items-center text-center">
          <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full border shadow-inner sm:mb-5 sm:h-20 sm:w-20 ${isSuccess ? "border-emerald-300/45 bg-emerald-400/15 text-emerald-300 shadow-emerald-400/20" : "border-rose-300/45 bg-rose-400/15 text-rose-300 shadow-rose-400/20"}`}>
            {isSuccess ? <CheckCircle2 className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={2.2} /> : <ShieldAlert className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={2.2} />}
          </div>

          <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${isSuccess ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200" : "border-rose-300/20 bg-rose-400/10 text-rose-200"}`}>
            {isSuccess ? <Sparkles className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {isSuccess ? (language === "ar" ? "تأكيد العملية" : "Operation status") : (language === "ar" ? "تحتاج إلى مراجعة" : "Action required")}
          </div>

          <h2 id="operation-feedback-title" className="text-lg font-bold tracking-tight sm:text-2xl">{title}</h2>
          <p id="operation-feedback-description" className="mt-2.5 max-w-sm text-sm leading-6 text-slate-200 sm:mt-3 sm:text-base">
            {feedback.message}
          </p>
          {feedback.description && (
            <p className="mt-2 max-w-sm rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs leading-5 text-slate-300">
              {feedback.description}
            </p>
          )}

          <button
            ref={acknowledgementRef}
            type="button"
            onClick={dismiss}
            className={`mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white shadow-lg transition-transform duration-150 ease-out active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-slate-900 sm:mt-7 sm:min-w-36 sm:w-auto ${isSuccess ? "bg-gradient-to-l from-emerald-500 to-teal-500 shadow-emerald-950/40" : "bg-gradient-to-l from-rose-500 to-red-500 shadow-rose-950/40"}`}
          >
            {closeLabel}
          </button>
          {isSuccess && (
            <p className="mt-3 text-xs text-slate-400">
              {language === "ar" ? "سيُغلق تلقائياً خلال ثوانٍ" : "Closes automatically in a few seconds"}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
