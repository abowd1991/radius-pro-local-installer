/**
 * SessionWarningDialog.tsx
 * مكوّن تحذير انتهاء الجلسة بسبب عدم النشاط
 * يظهر قبل دقيقة من انتهاء الـ Idle Timeout
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Constants ────────────────────────────────────────────────────────────────
const IDLE_TIMEOUT_MS     = 30 * 60 * 1000;   // 30 دقيقة
const WARN_BEFORE_MS      = 60 * 1000;         // تحذير قبل دقيقة
const ACTIVITY_EVENTS     = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
const THROTTLE_MS         = 5_000;             // تحديث lastActivity كل 5 ثواني كحد أقصى

// ─── SessionWarningDialog ─────────────────────────────────────────────────────
export function SessionWarningDialog() {
  const { user } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottleRef = useRef<number>(0);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  const isAr = document.documentElement.dir === "rtl" || document.documentElement.lang === "ar";

  // ─── Reset idle timer ───────────────────────────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;

    // Hide warning if shown
    if (showWarning) {
      setShowWarning(false);
      setCountdown(60);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }

    // Clear and reset warning timer
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(60);
      // Start countdown
      countdownTimerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            // Auto logout
            clearInterval(countdownTimerRef.current!);
            logoutMutation.mutate();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);
  }, [showWarning]);

  // ─── Activity listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const handleActivity = () => {
      const now = Date.now();
      // Throttle: only update if enough time has passed
      if (now - lastThrottleRef.current < THROTTLE_MS) return;
      lastThrottleRef.current = now;
      resetIdleTimer();
    };

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
    resetIdleTimer(); // Start timer on mount

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [user]);

  // ─── Continue session ───────────────────────────────────────────────────────
  const handleContinue = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setShowWarning(false);
    setCountdown(60);
    resetIdleTimer();
  };

  // ─── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    logoutMutation.mutate();
  };

  if (!user || !showWarning) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        direction: isAr ? "rtl" : "ltr",
      }}
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "32px 28px",
          maxWidth: 420,
          width: "90%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "rgba(234,179,8,0.15)",
          border: "2px solid rgba(234,179,8,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
          fontSize: 28,
        }}>
          ⏱️
        </div>

        {/* Title */}
        <h2 style={{
          color: "var(--foreground)",
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 12,
        }}>
          {isAr ? "ستنتهي جلستك قريباً" : "Session Expiring Soon"}
        </h2>

        {/* Message */}
        <p style={{
          color: "var(--muted-foreground)",
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 8,
        }}>
          {isAr
            ? "ستنتهي جلستك خلال دقيقة بسبب عدم النشاط. هل تريد الاستمرار؟"
            : "Your session will expire in 1 minute due to inactivity. Do you want to continue?"}
        </p>

        {/* Countdown */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(234,179,8,0.1)",
          border: "1px solid rgba(234,179,8,0.3)",
          borderRadius: 8,
          padding: "6px 16px",
          marginBottom: 24,
        }}>
          <span style={{ color: "#eab308", fontSize: 20, fontWeight: 700 }}>{countdown}</span>
          <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
            {isAr ? "ثانية" : "seconds"}
          </span>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={handleLogout}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.08)",
              color: "#ef4444",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isAr ? "تسجيل الخروج" : "Logout"}
          </button>
          <button
            onClick={handleContinue}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isAr ? "الاستمرار" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
