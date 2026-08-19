import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  registerConfirmationListener,
  type ConfirmActionOptions,
} from "@/lib/confirmAction";

type PendingConfirmation = {
  options: ConfirmActionOptions;
  resolve: (confirmed: boolean) => void;
};

export function ConfirmActionProvider() {
  const { language, direction } = useLanguage();
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    registerConfirmationListener((options) => new Promise<boolean>((resolve) => {
      setIsClosing(false);
      setPending({ options, resolve });
    }));
    return () => registerConfirmationListener(null);
  }, []);

  useEffect(() => {
    if (!isClosing) confirmRef.current?.focus();
  }, [isClosing, pending]);

  // Keep every Hook above the conditional return. Opening a confirmation must
  // not introduce a Hook that was absent in the previous render.
  const close = useCallback((confirmed: boolean) => {
    if (!pending || isClosing) return;
    pending.resolve(confirmed);
    setIsClosing(true);
    window.setTimeout(() => {
      setPending(null);
      setIsClosing(false);
    }, 180);
  }, [isClosing, pending]);

  if (!pending) return null;

  const { options } = pending;
  const destructive = options.tone === "destructive";

  return (
    <div className={`fixed inset-0 z-[121] flex min-h-[100dvh] items-end justify-center bg-slate-950/60 px-3 pt-12 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[5px] motion-safe:transition-opacity motion-safe:duration-200 sm:items-center sm:p-4 ${isClosing ? "motion-safe:opacity-0" : "opacity-100"}`} dir={direction}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title" className={`relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-[24px] border border-white/15 bg-gradient-to-br from-slate-950/95 via-slate-900/95 to-violet-950/90 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-[0_24px_90px_rgba(2,6,23,0.65)] motion-reduce:transition-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-[28px] sm:p-8 ${isClosing ? "motion-safe:animate-out motion-safe:slide-out-to-bottom-6 motion-safe:duration-200 sm:motion-safe:zoom-out-95 sm:motion-safe:slide-out-to-bottom-0" : "motion-safe:animate-in motion-safe:slide-in-from-bottom-6 motion-safe:duration-300 sm:motion-safe:zoom-in-95 sm:motion-safe:slide-in-from-bottom-0"}`}>
        <div className={`pointer-events-none absolute -top-14 ${direction === "rtl" ? "-right-14" : "-left-14"} h-40 w-40 rounded-full blur-3xl ${destructive ? "bg-rose-500/25" : "bg-violet-500/25"}`} />
        <button type="button" onClick={() => close(false)} className={`absolute top-3 flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70 ${direction === "rtl" ? "left-3" : "right-3"}`} aria-label={language === "ar" ? "إغلاق" : "Close"}>
          <X className="h-5 w-5" />
        </button>
        <div className="relative text-center">
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border sm:h-16 sm:w-16 ${destructive ? "border-rose-300/45 bg-rose-400/15 text-rose-300" : "border-violet-300/45 bg-violet-400/15 text-violet-200"}`}>
            {destructive ? <AlertTriangle className="h-7 w-7 sm:h-8 sm:w-8" /> : <ShieldCheck className="h-7 w-7 sm:h-8 sm:w-8" />}
          </div>
          <h2 id="confirm-action-title" className="mt-4 text-lg font-bold sm:mt-5 sm:text-xl">{options.title}</h2>
          <p className="mt-2.5 text-sm leading-6 text-slate-200 sm:mt-3">{options.description}</p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:mt-7 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => close(false)} className="h-12 w-full rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-slate-100 transition hover:bg-white/10 active:scale-[0.97] sm:w-auto">
              {options.cancelLabel || (language === "ar" ? "إلغاء" : "Cancel")}
            </button>
            <button ref={confirmRef} type="button" onClick={() => close(true)} className={`h-12 w-full rounded-xl px-5 text-sm font-semibold text-white shadow-lg transition active:scale-[0.97] sm:w-auto ${destructive ? "bg-gradient-to-l from-rose-500 to-red-500 shadow-rose-950/40" : "bg-gradient-to-l from-violet-500 to-indigo-500 shadow-violet-950/40"}`}>
              {options.confirmLabel || (language === "ar" ? "تأكيد" : "Confirm")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
