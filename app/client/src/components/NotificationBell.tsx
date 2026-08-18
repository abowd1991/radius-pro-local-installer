import { useState, useEffect } from "react";
import { parseDbDate } from '@/lib/dateFormat';
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  CreditCard,
  Server,
  AlertTriangle,
  Info,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: number | null;
  isRead: boolean;
  createdAt: Date;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "card_expired":
    case "card_expiring":
      return <CreditCard className="h-4 w-4 text-orange-500" />;
    case "nas_disconnected":
      return <Server className="h-4 w-4 text-red-500" />;
    case "nas_reconnected":
      return <Server className="h-4 w-4 text-green-500" />;
    case "low_balance":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "support":
      return <MessageSquare className="h-4 w-4 text-purple-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);

  const { data: unreadCount = 0, refetch: refetchCount } = trpc.internalNotifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 120000, refetchIntervalInBackground: false, staleTime: 60000 }
  );

  const { data: broadcastUnread } = trpc.broadcasts.getUnreadCount.useQuery(
    undefined,
    { refetchInterval: 120000, refetchIntervalInBackground: false, staleTime: 60000 }
  );
  const broadcastUnreadCount = broadcastUnread?.count ?? 0;
  const totalUnread = unreadCount + broadcastUnreadCount;

  const { data: notifications = [], refetch: refetchNotifications, isLoading } = trpc.internalNotifications.list.useQuery(
    { limit: 20 },
    { enabled: isOpen }
  );

  const markAsRead = trpc.internalNotifications.markAsRead.useMutation({
    onSuccess: () => {
      refetchCount();
      refetchNotifications();
    },
  });

  const markAllAsRead = trpc.internalNotifications.markAllAsRead.useMutation({
    onSuccess: () => {
      refetchCount();
      refetchNotifications();
    },
  });

  const deleteNotification = trpc.internalNotifications.delete.useMutation({
    onSuccess: () => {
      refetchCount();
      refetchNotifications();
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead.mutate({ id: notification.id });
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalUnread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {totalUnread > 9 ? "9+" : totalUnread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>الإشعارات</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin ml-1" />
              ) : (
                <CheckCheck className="h-3 w-3 ml-1" />
              )}
              قراءة الكل
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Bell className="h-8 w-8 mb-2 opacity-50" />
            <span className="text-sm">لا توجد إشعارات</span>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            {notifications.map((notification: Notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${
                  !notification.isRead ? "bg-accent/50" : ""
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-2 w-full">
                  {getNotificationIcon(notification.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">
                        {notification.title}
                      </span>
                      {!notification.isRead && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <span className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow((parseDbDate(notification.createdAt) ?? new Date(notification.createdAt)), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!notification.isRead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead.mutate({ id: notification.id });
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification.mutate({ id: notification.id });
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
