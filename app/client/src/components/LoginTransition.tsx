import { useEffect, useRef, useState } from "react";

/* ─── Color constants ────────────────────────────────────────────────────── */
const C = {
  bg: "#0B1120",
  blue: "#2563EB",
  purple: "#7C3AED",
  cyan: "#06B6D4",
  accent: "#9333EA",
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

    const NODE_COUNT = 55;
    const colors = [C.blue, C.purple, C.cyan, "#3B82F6", "#8B5CF6"];

    interface Node {
      x: number; y: number;
      vx: number; vy: number;
      r: number; color: string;
      pulse: number; pulseSpeed: number;
    }
    interface Packet {
      fromIdx: number; toIdx: number;
      t: number; speed: number; color: string;
    }

    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2.5 + 1.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.02,
    }));

    const packets: Packet[] = [];
    const MAX_DIST = Math.min(width, height) * 0.2;

    function spawnPacket() {
      const fromIdx = Math.floor(Math.random() * nodes.length);
      let toIdx = -1, bestDist = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (i === fromIdx) continue;
        const dx = nodes[i].x - nodes[fromIdx].x;
        const dy = nodes[i].y - nodes[fromIdx].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < MAX_DIST && d < bestDist) { bestDist = d; toIdx = i; }
      }
      if (toIdx === -1) return;
      packets.push({ fromIdx, toIdx, t: 0, speed: 0.005 + Math.random() * 0.007, color: colors[Math.floor(Math.random() * colors.length)] });
    }
    for (let i = 0; i < 10; i++) spawnPacket();

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, width, height);

      // Grid overlay
      ctx.strokeStyle = "rgba(37,99,235,0.04)";
      ctx.lineWidth = 1;
      const gridSize = 60;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // Edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.2;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(37,99,235,${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // Packets
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.t += p.speed;
        if (p.t >= 1) { packets.splice(i, 1); spawnPacket(); continue; }
        const from = nodes[p.fromIdx], to = nodes[p.toIdx];
        const px = from.x + (to.x - from.x) * p.t;
        const py = from.y + (to.y - from.y) * p.t;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Nodes
      for (const n of nodes) {
        n.pulse += n.pulseSpeed;
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        const r = n.r + Math.sin(n.pulse) * 0.8;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = n.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    const onResize = () => {
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = width; canvas.height = height;
    };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", onResize); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
}

/* ─── Orbital Rings around Logo ─────────────────────────────────────────── */
function OrbitalRings() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {/* Ring 1 */}
      <div className="absolute rounded-full border"
        style={{
          width: "140px", height: "140px",
          borderColor: "rgba(37,99,235,0.35)",
          borderTopColor: "#2563EB",
          borderWidth: "2px",
          animation: "spin 2.5s linear infinite",
        }} />
      {/* Ring 2 */}
      <div className="absolute rounded-full border"
        style={{
          width: "180px", height: "180px",
          borderColor: "rgba(124,58,237,0.25)",
          borderRightColor: "#7C3AED",
          borderWidth: "1.5px",
          animation: "spin 4s linear infinite reverse",
        }} />
      {/* Ring 3 */}
      <div className="absolute rounded-full border"
        style={{
          width: "224px", height: "224px",
          borderColor: "rgba(6,182,212,0.15)",
          borderBottomColor: "#06B6D4",
          borderWidth: "1px",
          animation: "spin 6s linear infinite",
        }} />
      {/* Dots on Ring 1 */}
      <div className="absolute rounded-full"
        style={{
          width: "8px", height: "8px",
          background: "#2563EB",
          boxShadow: "0 0 12px #2563EB",
          top: "calc(50% - 70px)",
          left: "50%",
          transform: "translateX(-50%)",
          animation: "orbit1 2.5s linear infinite",
        }} />
      {/* Dots on Ring 2 */}
      <div className="absolute rounded-full"
        style={{
          width: "6px", height: "6px",
          background: "#7C3AED",
          boxShadow: "0 0 10px #7C3AED",
          top: "calc(50% - 90px)",
          left: "50%",
          transform: "translateX(-50%)",
          animation: "orbit2 4s linear infinite reverse",
        }} />
    </div>
  );
}

/* ─── Progress Steps ─────────────────────────────────────────────────────── */
const STEPS = [
  "التحقق من الجلسة",
  "تحميل بيانات المستخدم",
  "تحميل إعدادات النظام",
  "الاتصال بالخادم",
  "تجهيز لوحة التحكم",
];

/* ─── Main Component ─────────────────────────────────────────────────────── */
interface LoginTransitionProps {
  onComplete: () => void;
}

export default function LoginTransition({ onComplete }: LoginTransitionProps) {
  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Fade in
    const t0 = setTimeout(() => setMounted(true), 50);

    // Step timings (ms): 0→400, 1→750, 2→1100, 3→1450, 4→1800
    const stepDelay = 360;
    const stepTimers: ReturnType<typeof setTimeout>[] = [];

    STEPS.forEach((_, i) => {
      // Show step as active
      const t1 = setTimeout(() => {
        setCurrentStep(i);
      }, 200 + i * stepDelay);

      // Mark step as complete
      const t2 = setTimeout(() => {
        setCompletedSteps((prev) => [...prev, i]);
      }, 200 + i * stepDelay + stepDelay - 80);

      stepTimers.push(t1, t2);
    });

    // Progress bar animation
    let prog = 0;
    const progInterval = setInterval(() => {
      prog += 1.8;
      if (prog >= 100) { prog = 100; clearInterval(progInterval); }
      setProgress(prog);
    }, 32);

    // Fade out and complete
    const tFade = setTimeout(() => setFadeOut(true), 2200);
    const tDone = setTimeout(() => onComplete(), 2700);

    return () => {
      clearTimeout(t0);
      stepTimers.forEach(clearTimeout);
      clearInterval(progInterval);
      clearTimeout(tFade);
      clearTimeout(tDone);
    };
  }, [onComplete]);

  return (
    <>
      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orbit1 {
          from { transform: translateX(-50%) rotate(0deg) translateY(-70px) rotate(0deg); }
          to   { transform: translateX(-50%) rotate(360deg) translateY(-70px) rotate(-360deg); }
        }
        @keyframes orbit2 {
          from { transform: translateX(-50%) rotate(0deg) translateY(-90px) rotate(0deg); }
          to   { transform: translateX(-50%) rotate(-360deg) translateY(-90px) rotate(360deg); }
        }
        @keyframes logoPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 18px rgba(37,99,235,0.7)); }
          50%       { transform: scale(1.06); filter: drop-shadow(0 0 32px rgba(124,58,237,0.9)); }
        }
        @keyframes shimmer {
          0%   { left: -100%; }
          100% { left: 200%; }
        }
        @keyframes stepIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 0.9; }
        }
      `}</style>

      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{
          background: C.bg,
          zIndex: 9999,
          fontFamily: "'Cairo', system-ui, sans-serif",
          direction: "rtl",
          opacity: mounted ? (fadeOut ? 0 : 1) : 0,
          transition: fadeOut ? "opacity 0.5s ease-out" : "opacity 0.4s ease-in",
        }}
      >
        {/* Network Background */}
        <NetworkCanvas />

        {/* Radial glow overlays */}
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)", filter: "blur(60px)" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)", filter: "blur(40px)" }} />
        </div>

        {/* Main Card */}
        <div
          className="relative flex flex-col items-center"
          style={{
            zIndex: 10,
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0) scale(1)" : "translateY(20px) scale(0.97)",
            transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
          }}
        >
          {/* Orbital rings + Logo */}
          <div className="relative flex items-center justify-center mb-10" style={{ width: "240px", height: "240px" }}>
            <OrbitalRings />

            {/* Logo */}
            <div
              className="relative z-10 rounded-3xl overflow-hidden flex-shrink-0"
              style={{
                width: "88px", height: "88px",
                animation: "logoPulse 2s ease-in-out infinite",
                boxShadow: "0 0 40px rgba(37,99,235,0.5), 0 0 80px rgba(124,58,237,0.3)",
              }}
            >
              <img src="/logo-icon.png" alt="Radius Pro" className="w-full h-full object-cover" />
            </div>

            {/* Shimmer on logo */}
            <div className="absolute z-20 rounded-3xl overflow-hidden pointer-events-none"
              style={{ width: "88px", height: "88px", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
              <div style={{
                position: "absolute", top: 0, bottom: 0, width: "40%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
                animation: "shimmer 2s ease-in-out infinite",
              }} />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-black text-white mb-2 tracking-tight text-center">
            جارٍ تحميل لوحة التحكم...
          </h2>
          <p className="text-sm mb-8 text-center" style={{ color: "#64748B" }}>
            يتم مزامنة الشبكات والبيانات والإحصائيات
          </p>

          {/* Progress Bar */}
          <div className="w-80 mb-8">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold" style={{ color: "#475569" }}>التقدم</span>
              <span className="text-xs font-bold" style={{ color: "#60a5fa" }}>{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full relative overflow-hidden"
                style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, #2563EB, #7C3AED, #06B6D4)",
                  boxShadow: "0 0 12px rgba(37,99,235,0.6)",
                  transition: "width 0.1s linear",
                }}
              >
                {/* Shimmer on progress bar */}
                <div style={{
                  position: "absolute", top: 0, bottom: 0, width: "50%",
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                  animation: "shimmer 1.2s ease-in-out infinite",
                }} />
              </div>
            </div>
          </div>

          {/* Steps */}
          <div className="w-80 flex flex-col gap-2.5">
            {STEPS.map((step, i) => {
              const isDone = completedSteps.includes(i);
              const isActive = currentStep === i && !isDone;
              const isPending = i > currentStep;

              return (
                <div
                  key={i}
                  className="flex items-center gap-3"
                  style={{
                    opacity: isPending ? 0.3 : 1,
                    animation: isActive || isDone ? "stepIn 0.3s ease-out forwards" : undefined,
                    transition: "opacity 0.3s ease",
                  }}
                >
                  {/* Icon */}
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{
                      background: isDone
                        ? "rgba(16,185,129,0.15)"
                        : isActive
                          ? "rgba(37,99,235,0.15)"
                          : "rgba(255,255,255,0.04)",
                      border: isDone
                        ? "1px solid rgba(16,185,129,0.5)"
                        : isActive
                          ? "1px solid rgba(37,99,235,0.5)"
                          : "1px solid rgba(255,255,255,0.08)",
                      transition: "all 0.3s ease",
                    }}
                  >
                    {isDone ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : isActive ? (
                      <div className="w-2 h-2 rounded-full" style={{
                        background: "#2563EB",
                        animation: "glowPulse 0.8s ease-in-out infinite",
                        boxShadow: "0 0 6px #2563EB",
                      }} />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className="text-sm font-medium"
                    style={{
                      color: isDone ? "#10B981" : isActive ? "#F8FAFC" : "#374151",
                      transition: "color 0.3s ease",
                    }}
                  >
                    {step}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Brand name at bottom */}
          <div className="mt-10 flex items-center gap-2 opacity-40">
            <span className="text-xs font-semibold text-white tracking-widest uppercase">Radius Pro</span>
            <span className="text-xs" style={{ color: "#475569" }}>— Network Management Platform</span>
          </div>
        </div>
      </div>
    </>
  );
}
