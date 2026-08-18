import { useEffect, useRef, useState } from "react";
import { parseDbDate } from '@/lib/dateFormat';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  X,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

// صور 3D لكل نوع رسالة
const TYPE_IMAGES: Record<string, string> = {
  update:  "https://d2xsxph8kpxj0f.cloudfront.net/manus-storage/rocket_174e4ed4.png",
  warning: "https://d2xsxph8kpxj0f.cloudfront.net/manus-storage/warning_d3f47f0f.png",
  error:   "https://d2xsxph8kpxj0f.cloudfront.net/manus-storage/warning_d3f47f0f.png",
  success: "https://d2xsxph8kpxj0f.cloudfront.net/manus-storage/trophy_e4b6183d.png",
  info:    "https://d2xsxph8kpxj0f.cloudfront.net/manus-storage/gift_4161a2b0.png",
};

const typeConfig = {
  info:    { label: "معلومات", badgeColor: "bg-blue-100 text-blue-700",    borderColor: "border-blue-200",    btnColor: "bg-blue-600 hover:bg-blue-700 text-white",    topBar: "bg-blue-500" },
  warning: { label: "تحذير",   badgeColor: "bg-orange-100 text-orange-700", borderColor: "border-orange-200",  btnColor: "bg-orange-500 hover:bg-orange-600 text-white",  topBar: "bg-orange-500" },
  error:   { label: "تنبيه",   badgeColor: "bg-red-100 text-red-700",       borderColor: "border-red-200",     btnColor: "bg-red-600 hover:bg-red-700 text-white",       topBar: "bg-red-500" },
  success: { label: "نجاح",    badgeColor: "bg-green-100 text-green-700",   borderColor: "border-green-200",   btnColor: "bg-green-600 hover:bg-green-700 text-white",   topBar: "bg-green-500" },
  update:  { label: "تحديث",   badgeColor: "bg-blue-100 text-blue-700",     borderColor: "border-blue-200",    btnColor: "bg-blue-600 hover:bg-blue-700 text-white",     topBar: "bg-blue-600" },
};

type NotifType = keyof typeof typeConfig;

interface Notification {
  id: number;
  broadcastId: number;
  isRead: boolean;
  title: string;
  message: string;
  type: NotifType;
  sentAt: Date | string;
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const freqs = [880, 1100];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      const end = start + 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.start(start);
      osc.stop(end + 0.01);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    // تجاهل الخطأ
  }
}

export default function BroadcastPopup() {
  const { user, loading: authLoading } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const prevUnreadCount = useRef(0);

  const isClient = !authLoading && !!user && user.role !== "super_admin" && user.role !== "owner";

  const { data: notifications = [], refetch } = trpc.broadcasts.getMyNotifications.useQuery(
    { page: 1, limit: 20 },
    { enabled: isClient, refetchOnWindowFocus: false }
  );

  const markAsRead = trpc.broadcasts.markAsRead.useMutation({ onSuccess: () => refetch() });
  const markAllAsRead = trpc.broadcasts.markAllAsRead.useMutation({ onSuccess: () => refetch() });

  const unread = (notifications as Notification[]).filter((n) => !n.isRead);

  useEffect(() => {
    if (unread.length > prevUnreadCount.current && prevUnreadCount.current >= 0) {
      playNotificationSound();
    }
    prevUnreadCount.current = unread.length;
    setCurrentIndex(0);
    if (unread.length > 0) setDismissed(false);
  }, [unread.length]);

  if (!isClient || dismissed || unread.length === 0) return null;

  const current = unread[currentIndex];
  if (!current) return null;

  const cfg = typeConfig[current.type] ?? typeConfig.info;
  const img3d = TYPE_IMAGES[current.type] ?? TYPE_IMAGES.info;
  const total = unread.length;

  const handleDismiss = () => {
    markAsRead.mutate({ broadcastId: current.broadcastId });
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setDismissed(true);
    }
  };

  const handleMarkAllRead = () => {
    markAllAsRead.mutate();
    setDismissed(true);
  };

  const handlePrev = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setCurrentIndex((i) => Math.min(total - 1, i + 1));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Card - خلفية بيضاء واضحة */}
      <div
        className={`relative w-full max-w-sm rounded-3xl border-2 ${cfg.borderColor} bg-white shadow-2xl overflow-hidden`}
      >
        {/* شريط علوي ملون */}
        <div className={`h-1.5 w-full ${cfg.topBar}`} />

        {/* زر الإغلاق */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 left-4 z-10 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors text-gray-500 hover:text-gray-700"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Badge النوع - أعلى اليمين */}
        <div className="flex justify-end px-5 pt-4">
          <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${cfg.badgeColor}`}>
            {cfg.label}
          </span>
        </div>

        {/* الصورة 3D */}
        <div className="flex justify-center pt-2 pb-1">
          <img
            src={img3d}
            alt={cfg.label}
            className="w-28 h-28 object-contain drop-shadow-lg"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>

        {/* المحتوى */}
        <div className="px-6 pb-2 space-y-2 text-center">
          {/* العنوان */}
          <h2 className="text-xl font-bold text-gray-900 leading-snug whitespace-pre-line">
            {current.title}
          </h2>

          {/* النص */}
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
            {current.message}
          </p>

          {/* التاريخ */}
          <p className="text-xs text-gray-400">
            {(() => { const d = parseDbDate(current.sentAt) ?? new Date(current.sentAt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })()}
          </p>
        </div>

        {/* الفوتر */}
        <div className="px-6 pb-6 pt-3 space-y-2">
          {/* زر تم القراءة */}
          <Button
            className={`w-full rounded-xl py-2.5 font-semibold text-sm ${cfg.btnColor}`}
            onClick={handleDismiss}
          >
            <CheckCircle2 className="w-4 h-4 ml-1.5" />
            تم القراءة ✓
          </Button>

          {/* أزرار التنقل والقراءة الكاملة */}
          <div className="flex items-center justify-between">
            {total > 1 ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors text-gray-500"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-400 px-1">{currentIndex + 1} / {total}</span>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === total - 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors text-gray-500"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div />
            )}

            {total > 1 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                تم قراءة الكل
              </button>
            )}

            {total === 1 && (
              <p className="text-xs text-gray-400 text-center w-full">مع تحيات المدير</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
