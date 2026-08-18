import { trpc } from "@/lib/trpc";
import { parseDbDate } from '@/lib/dateFormat';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";

const BROADCAST_ICON_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310419663030608704/JYruXSQahvP3cr6rPdjNhA/broadcast-icon-KopHnqWzkPcB3HGBTcU6pa.webp";

const typeConfig = {
  info: { label: "معلومات", bg: "bg-blue-500/10 border-blue-500/30", icon: Info, iconColor: "text-blue-400", dot: "bg-blue-400" },
  warning: { label: "تحذير", bg: "bg-yellow-500/10 border-yellow-500/30", icon: AlertTriangle, iconColor: "text-yellow-400", dot: "bg-yellow-400" },
  error: { label: "خلل", bg: "bg-red-500/10 border-red-500/30", icon: AlertCircle, iconColor: "text-red-400", dot: "bg-red-400" },
  success: { label: "نجاح", bg: "bg-green-500/10 border-green-500/30", icon: CheckCircle2, iconColor: "text-green-400", dot: "bg-green-400" },
  update: { label: "تحديث", bg: "bg-purple-500/10 border-purple-500/30", icon: RefreshCw, iconColor: "text-purple-400", dot: "bg-purple-400" },
};

export default function MyNotifications() {
  const { data: notifications = [], refetch, isLoading } = trpc.broadcasts.getMyNotifications.useQuery({ page: 1, limit: 50 });
  const { data: unreadData, refetch: refetchCount } = trpc.broadcasts.getUnreadCount.useQuery();

  const markAsRead = trpc.broadcasts.markAsRead.useMutation({
    onSuccess: () => { refetch(); refetchCount(); },
  });

  const markAllAsRead = trpc.broadcasts.markAllAsRead.useMutation({
    onSuccess: () => {
      toast.success("تم تعليم جميع الإشعارات كمقروءة");
      refetch();
      refetchCount();
    },
  });

  const unreadCount = unreadData?.count ?? 0;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src={BROADCAST_ICON_URL} alt="Notifications" className="w-14 h-14 rounded-xl object-contain" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">إشعاراتي</h1>
              {unreadCount > 0 && (
                <Badge className="bg-blue-600 text-white text-xs px-2 py-0.5">
                  {unreadCount} جديد
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">رسائل وتنبيهات من مدير النظام</p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
          >
            {markAllAsRead.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : (
              <CheckCheck className="h-4 w-4 ml-2" />
            )}
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      {/* Notifications list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <img src={BROADCAST_ICON_URL} alt="" className="w-24 h-24 opacity-20 mb-4" />
          <p className="text-lg font-medium">لا توجد إشعارات</p>
          <p className="text-sm mt-1">ستظهر هنا رسائل مدير النظام</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {notifications.map((notif: any) => {
            const cfg = typeConfig[notif.type as keyof typeof typeConfig] || typeConfig.info;
            const Icon = cfg.icon;
            const isUnread = !notif.isRead;

            return (
              <div
                key={notif.id}
                className={`relative p-4 rounded-xl border transition-all ${cfg.bg} ${isUnread ? "shadow-sm" : "opacity-70"}`}
              >
                {/* Unread dot */}
                {isUnread && (
                  <span className={`absolute top-3 left-3 w-2 h-2 rounded-full ${cfg.dot}`} />
                )}

                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-background/50 shrink-0`}>
                    <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`font-semibold text-sm ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                          {notif.title}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{notif.message}</p>
                      </div>
                      {isUnread && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-7 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => markAsRead.mutate({ broadcastId: notif.broadcastId })}
                        >
                          <CheckCheck className="h-3.5 w-3.5 ml-1" />
                          قراءة
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground/60 mt-2">
                      {formatDistanceToNow((parseDbDate(notif.sentAt) ?? new Date(notif.sentAt)), { addSuffix: true, locale: ar })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
