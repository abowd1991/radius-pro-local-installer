import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Plus,
  MessageSquare,
  Send,
  Paperclip,
  X,
  Trash2,
  CheckCircle2,
  ArrowLeft,
  Clock,
  User,
  ChevronRight,
  AlertCircle,
  CheckCheck,
  Sparkles,
  Loader2,
  Zap,
  Bot,
  ToggleLeft,
  ToggleRight,
  Pencil,
  Check,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, memo } from "react";
import { formatDateTime } from "@/lib/dateFormat";

// ─── Status & Priority helpers ───────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; labelAr: string; className: string }> = {
  open:        { label: "Open",             labelAr: "مفتوحة",         className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  in_progress: { label: "In Progress",      labelAr: "قيد المعالجة",   className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  waiting:     { label: "Waiting Customer", labelAr: "بانتظار العميل", className: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  resolved:    { label: "Resolved",         labelAr: "محلولة",         className: "bg-green-500/10 text-green-500 border-green-500/20" },
  closed:      { label: "Closed",           labelAr: "مغلقة",          className: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
};

const PRIORITY_CONFIG: Record<string, { label: string; labelAr: string; className: string; dot: string }> = {
  low:    { label: "Low",    labelAr: "منخفضة", className: "bg-green-500/10 text-green-500 border-green-500/20",   dot: "bg-green-500" },
  medium: { label: "Medium", labelAr: "متوسطة", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", dot: "bg-yellow-500" },
  high:   { label: "High",   labelAr: "عالية",  className: "bg-orange-500/10 text-orange-500 border-orange-500/20", dot: "bg-orange-500" },
  urgent: { label: "Urgent", labelAr: "عاجلة",  className: "bg-red-500/10 text-red-500 border-red-500/20",         dot: "bg-red-500" },
};

function StatusBadge({ status, lang }: { status: string; lang: string }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <Badge variant="outline" className={`text-xs ${c.className}`}>
      {lang === "ar" ? c.labelAr : c.label}
    </Badge>
  );
}

function PriorityBadge({ priority, lang }: { priority: string; lang: string }) {
  const c = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return (
    <Badge variant="outline" className={`text-xs ${c.className}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${c.dot}`} />
      {lang === "ar" ? c.labelAr : c.label}
    </Badge>
  );
}

// ─── Avatar helper ────────────────────────────────────────────────────────────
function AvatarIcon({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  const colors = [
    "bg-blue-500", "bg-purple-500", "bg-green-500",
    "bg-orange-500", "bg-pink-500", "bg-teal-500",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  const sizeClass = size === "md" ? "w-9 h-9 text-sm" : "w-7 h-7 text-xs";
  return (
    <div className={`${sizeClass} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials || <User className="w-3 h-3" />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE COMPOSER — مستقل تماماً خارج الـ parent لمنع فقدان الـ focus
// ─────────────────────────────────────────────────────────────────────────────
interface ComposerProps {
  onSend: (message: string, attachmentUrl?: string) => void;
  isSending: boolean;
  language: string;
}

const MessageComposer = memo(function MessageComposer({ onSend, isSending, language }: ComposerProps) {
  const [message, setMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(language === "ar" ? "يرجى اختيار صورة" : "Please select an image");
      return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!message.trim() && !selectedImage) {
      toast.error(language === "ar" ? "اكتب رسالة أو أرفق صورة" : "Write a message or attach an image");
      return;
    }
    let attachmentUrl = "";
    if (selectedImage) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", selectedImage);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        attachmentUrl = data.url;
      } catch {
        toast.error(language === "ar" ? "فشل رفع الصورة" : "Failed to upload image");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }
    onSend(message.trim() || (language === "ar" ? "[صورة]" : "[Image]"), attachmentUrl || undefined);
    setMessage("");
    setSelectedImage(null);
    setImagePreview(null);
  };

  const disabled = isUploading || isSending;

  return (
    <div className="border-t px-3 py-3 bg-background">
      {imagePreview && (
        <div className="mb-2 relative inline-block">
          <img src={imagePreview} alt="preview" className="h-16 rounded-lg object-cover" />
          <button
            onClick={() => { setSelectedImage(null); setImagePreview(null); }}
            className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageSelect}
          accept="image/*"
          capture="environment"
          className="hidden"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0 text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        <div className="flex-1 relative">
          <Input
            placeholder={language === "ar" ? "اكتب رسالتك..." : "Type a message..."}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={disabled}
            className="pr-2 rounded-full"
          />
        </div>
        <Button
          size="icon"
          className="h-9 w-9 flex-shrink-0 rounded-full"
          onClick={handleSend}
          disabled={disabled || (!message.trim() && !selectedImage)}
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Support() {
  const { user } = useAuth();
  const { language, direction } = useLanguage();
  const isRTL = direction === "rtl";
  const isAdmin = user?.role === "owner" || user?.role === "super_admin";

  // Mobile: "list" | "chat"
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [deleteTicketId, setDeleteTicketId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [prevMessageCount, setPrevMessageCount] = useState(0);

  // ── AI state ─────────────────────────────────────────────────────────────────
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const [aiSuggestedMessage, setAiSuggestedMessage] = useState<string>("");
  // ── Message edit/delete state ───────────────────────────────────────────────────
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [deleteMessageId, setDeleteMessageId] = useState<number | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  // ── AI Auto-Reply toggle ──────────────────────────────────────────────────────
  const { data: autoReplySetting, refetch: refetchAutoReplySetting } = trpc.settings.get.useQuery(
    { key: 'ai_auto_reply_enabled' },
    { enabled: !!isAdmin }
  );
  const autoReplyEnabled = autoReplySetting === 'true';
  const updateSettingMutation = trpc.settings.update.useMutation({
    onSuccess: () => refetchAutoReplySetting(),
    onError: (e) => toast.error(e.message),
  });
  const [latestAiMessageId, setLatestAiMessageId] = useState<number | null>(null);
  const [typedText, setTypedText] = useState<string>("");
  const [isTyping, setIsTyping] = useState(false);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const utils = trpc.useUtils();

  // ── Notification sound (Web Audio API) ──────────────────────────────────────
  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch (_) { /* ignore */ }
  }, []);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: tickets, isLoading, refetch: refetchTickets } = trpc.tickets.list.useQuery(
    undefined,
    { refetchInterval: 15_000 }
  );

  const { data: ticketMessages, refetch: refetchMessages } = trpc.tickets.getMessages.useQuery(
    { ticketId: selectedTicketId! },
    {
      enabled: !!selectedTicketId,
      refetchInterval: selectedTicketId ? 3_000 : false,
    }
  );

  const selectedTicket = tickets?.find((t: any) => t.id === selectedTicketId);

  // ── Typewriter effect for AI messages ─────────────────────────────────
  useEffect(() => {
    if (!latestAiMessageId || !ticketMessages) return;
    const msg = ticketMessages.find((m: any) => m.id === latestAiMessageId);
    if (!msg) return;
    const fullText = msg.message as string;
    setTypedText("");
    setIsTyping(true);
    let i = 0;
    const speed = Math.max(18, Math.min(40, Math.round(3000 / fullText.length)));
    const tick = () => {
      i++;
      setTypedText(fullText.slice(0, i));
      if (i < fullText.length) {
        typingRef.current = setTimeout(tick, speed);
      } else {
        setIsTyping(false);
        setLatestAiMessageId(null);
      }
    };
    typingRef.current = setTimeout(tick, speed);
    return () => { if (typingRef.current) clearTimeout(typingRef.current); };
  }, [latestAiMessageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect new incoming messages & play sound ─────────────────────────────────
  useEffect(() => {
    if (!ticketMessages) return;
    const count = ticketMessages.length;
    if (count > prevMessageCount && prevMessageCount > 0) {
      const lastMsg = ticketMessages[count - 1];
      if (lastMsg?.senderId !== user?.id) {
        playNotificationSound();
      }
    }
    setPrevMessageCount(count);
  }, [ticketMessages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Smart Auto-scroll ─────────────────────────────────────────────────────────
  // عند تغيير التذكرة: أعد ضبط الحالة فقط — بدون أي scroll
  const lastMessageIdRef = useRef<number | null>(null);
  useEffect(() => {
    setUserScrolledUp(false);
    lastMessageIdRef.current = null; // reset so first load scrolls down
  }, [selectedTicketId]); // eslint-disable-line react-hooks/exhaustive-deps

  // عند وصول رسائل جديدة فقط (ID جديد): اذهب للأسفل إذا لم يكن المستخدم يتمرر للأعلى
  useEffect(() => {
    if (!ticketMessages || ticketMessages.length === 0) return;
    const lastMsg = ticketMessages[ticketMessages.length - 1];
    const lastId = lastMsg?.id ?? null;
    if (lastId !== null && lastId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastId;
      // فقط انزل إذا المستخدم ليس في وضع القراءة
      if (!userScrolledUp) {
        requestAnimationFrame(() => {
          const vp = viewportRef.current as HTMLDivElement | null;
          if (vp) {
            vp.scrollTop = vp.scrollHeight;
          }
        });
      }
    }
  }, [ticketMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark ALL as read when user visits the support page (clears badge immediately) ──
  const markAllAsReadOnPageVisit = trpc.tickets.markAllAsReadOnPageVisit.useMutation();
  useEffect(() => {
    // Fire once on mount — clears the badge as soon as the user lands on the page
    markAllAsReadOnPageVisit.mutate(undefined, {
      onSuccess: () => utils.tickets.getUnreadCount.invalidate(),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark as read when client opens ticket ───────────────────────────────────
  const markAsReadByClient = trpc.tickets.markAsReadByClient.useMutation();
  const markAsReadByAdmin = trpc.tickets.markAsReadByAdmin.useMutation();
  useEffect(() => {
    if (!selectedTicketId) return;
    if (isAdmin) {
      // Admin: mark all client messages in this ticket as read
      markAsReadByAdmin.mutate(
        { ticketId: selectedTicketId },
        { onSuccess: () => utils.tickets.getUnreadCount.invalidate() }
      );
    } else {
      // Client: mark all admin replies in this ticket as read
      markAsReadByClient.mutate(
        { ticketId: selectedTicketId },
        { onSuccess: () => utils.tickets.getUnreadCount.invalidate() }
      );
    }
  }, [selectedTicketId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createTicket = trpc.tickets.create.useMutation({
    onSuccess: (data) => {
      toast.success(language === "ar" ? "تم إنشاء التذكرة بنجاح" : "Ticket created successfully");
      setIsNewTicketOpen(false);
      refetchTickets();
      openTicket(data.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const sendMessageMutation = trpc.tickets.addMessage.useMutation({
    onSuccess: () => {
      refetchMessages();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTicketMutation = trpc.tickets.deleteTicket.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حذف التذكرة" : "Ticket deleted");
      setDeleteTicketId(null);
      setSelectedTicketId(null);
      setMobileView("list");
      refetchTickets();
    },
    onError: (e) => toast.error(e.message),
  });

  const closeTicketMutation = trpc.tickets.closeTicket.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم إغلاق التذكرة" : "Ticket closed");
      refetchTickets();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.tickets.updateStatus.useMutation({
    onSuccess: () => refetchTickets(),
    onError: (e) => toast.error(e.message),
  });

  // ── AI mutations ─────────────────────────────────────────────────────────────
  const editMessageMutation = trpc.tickets.editMessage.useMutation({
    onSuccess: () => {
      refetchMessages();
      setEditingMessageId(null);
      setEditingText("");
      toast.success(language === "ar" ? "تم تعديل الرسالة" : "Message updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMessageMutation = trpc.tickets.deleteMessage.useMutation({
    onSuccess: () => {
      refetchMessages();
      setDeleteMessageId(null);
      toast.success(language === "ar" ? "تم حذف الرسالة" : "Message deleted");
    },
    onError: (e) => toast.error(e.message),
  });
  const aiSuggestMutation = trpc.tickets.aiSuggestReplies.useMutation({
    onSuccess: (data) => {
      setAiSuggestions(data.suggestions);
      setShowAiSuggestions(true);
    },
    onError: () => toast.error(language === "ar" ? "فشل جلب اقتراحات الذكاء الاصطناعي" : "Failed to get AI suggestions"),
  });

  const aiAutoReplyMutation = trpc.tickets.aiAutoReply.useMutation({
    onSuccess: (data) => {
      toast.success(language === "ar" ? "تم إرسال الرد التلقائي بنجاح" : "Auto-reply sent successfully");
      setShowAiSuggestions(false);
      refetchMessages().then(() => {
        if (data?.messageId) {
          setLatestAiMessageId(data.messageId);
        }
      });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const openTicket = (id: number) => {
    setSelectedTicketId(id);
    setPrevMessageCount(0);
    setMobileView("chat");
  };

  // مستقبل الرسائل من الـ MessageComposer
  const handleSendMessage = useCallback((message: string, attachmentUrl?: string) => {
    if (!selectedTicketId) return;
    sendMessageMutation.mutate({
      ticketId: selectedTicketId,
      message,
      attachmentUrl: attachmentUrl || undefined,
    });
  }, [selectedTicketId, sendMessageMutation]);

  // ── Filtered tickets ─────────────────────────────────────────────────────────
  const filteredTickets = tickets?.filter((t: any) =>
    statusFilter === "all" ? true : t.status === statusFilter
  ) ?? [];

  // ── Unread count per ticket (for badge) ──────────────────────────────────────
  const getUnreadForTicket = (ticketId: number) => {
    if (ticketId !== selectedTicketId) return 0;
    return ticketMessages?.filter((m: any) => !m.isReadByClient && m.senderId !== user?.id).length ?? 0;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 4rem)' }} dir={direction}>
      {/* Desktop: side-by-side | Mobile: single view */}
      <div className="flex-1 flex overflow-hidden border rounded-lg m-4 bg-background shadow-sm">

        {/* Ticket list — hidden on mobile when chat is open */}
        <div className={`
          w-full lg:w-80 xl:w-96 border-r flex flex-col flex-shrink-0
          ${mobileView === "chat" ? "hidden lg:flex" : "flex"}
        `}>
          {/* ── Ticket List Panel (inline JSX, not a nested component) ── */}
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  {language === "ar" ? "الدعم الفني" : "Support"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredTickets.length} {language === "ar" ? "تذكرة" : "tickets"}
                </p>
              </div>
              <Button size="sm" onClick={() => setIsNewTicketOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                {language === "ar" ? "جديدة" : "New"}
              </Button>
            </div>

            {/* Status filter */}
            <div className="px-3 py-2 border-b">
              <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                {["all", "open", "in_progress", "waiting", "resolved", "closed"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      statusFilter === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {s === "all"
                      ? language === "ar" ? "الكل" : "All"
                      : language === "ar"
                      ? STATUS_CONFIG[s]?.labelAr
                      : STATUS_CONFIG[s]?.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  {language === "ar" ? "جاري التحميل..." : "Loading..."}
                </div>
              ) : filteredTickets.length > 0 ? (
                <div className="divide-y">
                  {filteredTickets.map((ticket: any) => {
                    const unread = getUnreadForTicket(ticket.id);
                    const isSelected = ticket.id === selectedTicketId;
                    return (
                      <button
                        key={ticket.id}
                        onClick={() => openTicket(ticket.id)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          isSelected ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs text-muted-foreground font-mono">
                                #{ticket.ticketNumber}
                              </span>
                              {unread > 0 && (
                                <span className="bg-destructive text-destructive-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                  {unread}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium truncate mb-1.5">{ticket.subject}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <StatusBadge status={ticket.status} lang={language} />
                              <PriorityBadge priority={ticket.priority} lang={language} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDateTime(ticket.createdAt)}
                            </p>
                          </div>
                          <ChevronRight className={`w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 ${isRTL ? "rotate-180" : ""}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium mb-1">
                    {language === "ar" ? "لا توجد تذاكر" : "No tickets"}
                  </p>
                  <Button variant="link" size="sm" onClick={() => setIsNewTicketOpen(true)}>
                    {language === "ar" ? "إنشاء تذكرة جديدة" : "Create new ticket"}
                  </Button>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Chat panel — hidden on mobile when list is shown */}
        <div className={`
          flex-1 flex flex-col overflow-hidden
          ${mobileView === "list" ? "hidden lg:flex" : "flex"}
        `}>
          {/* ── Chat Panel (inline JSX, not a nested component) ── */}
          {selectedTicketId === null ? (
            <div className="hidden lg:flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">
                  {language === "ar" ? "اختر تذكرة لعرض المحادثة" : "Select a ticket to view chat"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
              {/* Loading skeleton while ticket data is being fetched */}
              {!selectedTicket ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                </div>
              ) : (
              <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
                {/* Back button (mobile only) */}
                <button
                  onClick={() => { setMobileView("list"); }}
                  className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
                >
                  <ArrowLeft className={`w-5 h-5 ${isRTL ? "rotate-180" : ""}`} />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground font-mono">#{selectedTicket.ticketNumber}</span>
                    <StatusBadge status={selectedTicket.status} lang={language} />
                    <PriorityBadge priority={selectedTicket.priority} lang={language} />
                  </div>
                  <p className="text-sm font-semibold truncate mt-0.5">{selectedTicket.subject}</p>
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Select
                      value={selectedTicket.status}
                      onValueChange={(val) =>
                        updateStatusMutation.mutate({ id: selectedTicket.id, status: val as any })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs w-auto border-dashed">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                          <SelectItem key={k} value={k} className="text-xs">
                            {language === "ar" ? v.labelAr : v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedTicket.status !== "closed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-green-500/30 text-green-600 hover:bg-green-500/10"
                        onClick={() => closeTicketMutation.mutate({ id: selectedTicket.id })}
                        disabled={closeTicketMutation.isPending}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        {language === "ar" ? "إغلاق" : "Close"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteTicketId(selectedTicket.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Ticket meta info bar */}
              <div className="px-4 py-2 border-b bg-muted/20 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {selectedTicket.userName || selectedTicket.userEmail || (language === "ar" ? "مجهول" : "Unknown")}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDateTime(selectedTicket.createdAt)}
                </span>
                {selectedTicket.category && (
                  <span className="flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {selectedTicket.category}
                  </span>
                )}
              </div>

              {/* Messages area — plain div with overflow-y-auto for reliable scroll control */}
              <div
                ref={viewportRef as React.RefObject<HTMLDivElement>}
                className="flex-1 min-h-0 px-4 py-3 overflow-y-auto"
                onScroll={() => {
                  const el = viewportRef.current as HTMLDivElement | null;
                  if (!el) return;
                  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                  setUserScrolledUp(distFromBottom > 100);
                }}
              >
                {ticketMessages && ticketMessages.length > 0 ? (
                  <div className="space-y-3">
                    {ticketMessages.map((msg: any, idx: number) => {
                      const isOwn = msg.senderId === user?.id;
                      const showAvatar =
                        idx === 0 || ticketMessages[idx - 1]?.senderId !== msg.senderId;
                      const isLastInGroup =
                        idx === ticketMessages.length - 1 ||
                        ticketMessages[idx + 1]?.senderId !== msg.senderId;
                      const isEditing = editingMessageId === msg.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
                          onMouseEnter={() => setHoveredMessageId(msg.id)}
                          onMouseLeave={() => setHoveredMessageId(null)}
                        >
                          {/* Avatar */}
                          <div className="w-7 flex-shrink-0">
                            {showAvatar && (
                              <AvatarIcon name={msg.senderName || "?"} size="sm" />
                            )}
                          </div>
                          {/* Bubble */}
                          <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                            {showAvatar && (
                              <span className={`text-xs text-muted-foreground mb-1 ${isOwn ? "text-right" : "text-left"}`}>
                                {msg.senderName}
                              </span>
                            )}
                            {/* Inline edit mode */}
                            {isEditing ? (
                              <div className="flex flex-col gap-1.5 w-full min-w-[200px]">
                                <textarea
                                  className="w-full rounded-xl border border-primary/40 bg-background text-sm px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                                  rows={3}
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  autoFocus
                                />
                                <div className="flex gap-1.5 justify-end">
                                  <button
                                    onClick={() => { setEditingMessageId(null); setEditingText(""); }}
                                    className="px-2.5 py-1 rounded-lg text-xs border border-border text-muted-foreground hover:bg-muted"
                                  >
                                    <X className="w-3 h-3 inline mr-0.5" />
                                    {language === "ar" ? "إلغاء" : "Cancel"}
                                  </button>
                                  <button
                                    onClick={() => editMessageMutation.mutate({ messageId: msg.id, newMessage: editingText })}
                                    disabled={editMessageMutation.isPending || !editingText.trim()}
                                    className="px-2.5 py-1 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                  >
                                    {editMessageMutation.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin inline mr-0.5" />
                                    ) : (
                                      <Check className="w-3 h-3 inline mr-0.5" />
                                    )}
                                    {language === "ar" ? "حفظ" : "Save"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="relative">
                                <div
                                  className={`rounded-2xl px-3.5 py-2.5 text-sm break-words ${
                                    isOwn
                                      ? "bg-primary text-primary-foreground rounded-br-sm"
                                      : msg.message?.startsWith("\uD83E\uDD16")
                                        ? "bg-purple-500/10 border border-purple-500/20 rounded-bl-sm"
                                        : "bg-muted rounded-bl-sm"
                                  }`}
                                >
                                  {msg.message?.startsWith("\uD83E\uDD16") && msg.id === latestAiMessageId ? (
                                    <p className="whitespace-pre-wrap">
                                      {typedText}
                                      {isTyping && (
                                        <span className="inline-block w-0.5 h-3.5 bg-purple-400 ml-0.5 animate-pulse align-middle" />
                                      )}
                                    </p>
                                  ) : (
                                    <p className="whitespace-pre-wrap">{msg.message}</p>
                                  )}
                                  {msg.attachmentUrl && (
                                    <img
                                      src={msg.attachmentUrl}
                                      alt="attachment"
                                      className="mt-2 rounded-lg cursor-pointer max-w-full h-auto max-h-48 object-cover"
                                      onClick={() => setViewerImage(msg.attachmentUrl)}
                                    />
                                  )}
                                </div>
                                {/* Admin: edit + delete buttons on hover */}
                                {isAdmin && hoveredMessageId === msg.id && (
                                  <div className={`absolute -top-1 flex items-center gap-0.5 z-10 ${
                                    isOwn ? "-left-[4.5rem]" : "-right-[4.5rem]"
                                  }`}>
                                    <button
                                      onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.message); }}
                                      className="p-1.5 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm"
                                      title={language === "ar" ? "تعديل الرسالة" : "Edit message"}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteMessageId(msg.id)}
                                      className="p-1.5 rounded-md bg-background border border-border text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 shadow-sm"
                                      title={language === "ar" ? "حذف الرسالة" : "Delete message"}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            {isLastInGroup && !isEditing && (
                              <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDateTime(msg.createdAt)}
                                </span>
                                {isOwn && (
                                  <CheckCheck className={`w-3 h-3 ${msg.isRead ? "text-blue-500" : "text-muted-foreground"}`} />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                    <MessageSquare className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm">{language === "ar" ? "لا توجد رسائل بعد" : "No messages yet"}</p>
                  </div>
                )}
              </div>

              {/* Closed ticket notice */}
              {selectedTicket.status === "closed" && (
                <div className="px-4 py-2 bg-muted/50 border-t text-center text-xs text-muted-foreground">
                  {language === "ar" ? "هذه التذكرة مغلقة" : "This ticket is closed"}
                </div>
              )}

              {/* AI toolbar (admin only) */}
              {isAdmin && selectedTicket.status !== "closed" && (
                <div className="border-t px-3 py-2 bg-muted/20">
                  {/* AI label + Auto-Reply toggle */}
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-purple-500" />
                      <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                        {language === "ar" ? "مساعد الذكاء الاصطناعي" : "AI Assistant"}
                      </span>
                    </div>
                    {/* AI Auto-Reply Global Toggle */}
                    <button
                      onClick={() => {
                        updateSettingMutation.mutate({
                          key: 'ai_auto_reply_enabled',
                          value: autoReplyEnabled ? 'false' : 'true',
                          description: 'تفعيل/تعطيل الرد التلقائي بالذكاء الاصطناعي',
                        });
                      }}
                      disabled={updateSettingMutation.isPending}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold transition-all border ${
                        autoReplyEnabled
                          ? 'bg-green-500/15 border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/25'
                          : 'bg-muted/60 border-border text-muted-foreground hover:bg-muted'
                      }`}
                      title={language === "ar" ? (
                        autoReplyEnabled ? "الرد التلقائي مفعّل — اضغط للتعطيل" : "الرد التلقائي معطّل — اضغط للتفعيل"
                      ) : (
                        autoReplyEnabled ? "Auto-Reply ON — Click to disable" : "Auto-Reply OFF — Click to enable"
                      )}
                    >
                      <Bot className="w-3 h-3" />
                      {updateSettingMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : autoReplyEnabled ? (
                        <ToggleRight className="w-3.5 h-3.5" />
                      ) : (
                        <ToggleLeft className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {language === "ar"
                          ? (autoReplyEnabled ? "رد تلقائي: شغال" : "رد تلقائي: موقف")
                          : (autoReplyEnabled ? "Auto-Reply: ON" : "Auto-Reply: OFF")}
                      </span>
                    </button>
                  </div>

                  {/* AI Loading State */}
                  {(aiSuggestMutation.isPending || aiAutoReplyMutation.isPending) && (
                    <div className="mb-2 flex items-center gap-3 px-3 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                      <div className="relative flex-shrink-0">
                        <div className="w-6 h-6 rounded-full border-2 border-purple-400/30 border-t-purple-500 animate-spin" />
                        <Sparkles className="w-3 h-3 text-purple-500 absolute inset-0 m-auto" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                          {aiSuggestMutation.isPending
                            ? (language === "ar" ? "جاري تحليل المحادثة وتوليد الاقتراحات..." : "Analyzing conversation & generating suggestions...")
                            : (language === "ar" ? "جاري كتابة الرد التلقائي..." : "Writing auto-reply message...")}
                        </p>
                        <div className="mt-1.5 h-1 w-full bg-purple-200/40 dark:bg-purple-900/40 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-400 via-purple-500 to-purple-400 rounded-full ai-progress-bar" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI suggestion chips */}
                  {showAiSuggestions && aiSuggestions.length > 0 && (
                    <div className="mb-2 space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-500" />
                        {language === "ar" ? "اقتراحات الذكاء الاصطناعي" : "AI Suggestions"}
                      </p>
                      {aiSuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setAiSuggestedMessage(s);
                            setShowAiSuggestions(false);
                          }}
                          className="w-full text-start text-xs px-3 py-2 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 transition-colors border border-purple-500/20 leading-snug"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* AI action buttons */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      title={language === "ar" ? "يقترح الذكاء الاصطناعي 3 ردود جاهزة للاختيار" : "AI suggests 3 ready replies for you to choose"}
                      className="h-7 text-xs text-purple-600 hover:bg-purple-500/10 hover:text-purple-700 gap-1.5"
                      onClick={() => {
                        if (!selectedTicketId) return;
                        setShowAiSuggestions(false);
                        aiSuggestMutation.mutate({ ticketId: selectedTicketId });
                      }}
                      disabled={aiSuggestMutation.isPending || aiAutoReplyMutation.isPending}
                    >
                      {aiSuggestMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {language === "ar" ? "اقتراح رد" : "Suggest Reply"}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      title={language === "ar" ? "يكتب الذكاء الاصطناعي رداً كاملاً ويرسله مباشرة للعميل" : "AI writes a full reply and sends it directly to the client"}
                      className="h-7 text-xs text-orange-600 hover:bg-orange-500/10 hover:text-orange-700 gap-1.5"
                      onClick={() => {
                        if (!selectedTicketId) return;
                        aiAutoReplyMutation.mutate({ ticketId: selectedTicketId });
                      }}
                      disabled={aiAutoReplyMutation.isPending || aiSuggestMutation.isPending}
                    >
                      {aiAutoReplyMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Zap className="w-3 h-3" />
                      )}
                      {language === "ar" ? "رد تلقائي" : "Auto Reply"}
                      <span className="text-[9px] bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded px-1 py-0 leading-tight">
                        {language === "ar" ? "ذكاء" : "AI"}
                      </span>
                    </Button>

                    {showAiSuggestions && (
                      <button
                        onClick={() => setShowAiSuggestions(false)}
                        className="ms-auto text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        {language === "ar" ? "إخفاء" : "Hide"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Message Composer — مكوّن مستقل بـ React.memo لمنع فقدان الـ focus */}
              {selectedTicket.status !== "closed" && (
                <MessageComposer
                  key={selectedTicketId}
                  onSend={handleSendMessage}
                  isSending={sendMessageMutation.isPending}
                  language={language}
                />
              )}
              </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── New Ticket Dialog ─────────────────────────────────────────────── */}
      <Dialog open={isNewTicketOpen} onOpenChange={setIsNewTicketOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "تذكرة دعم جديدة" : "New Support Ticket"}</DialogTitle>
            <DialogDescription>
              {language === "ar"
                ? "صف مشكلتك وسيتواصل معك فريق الدعم"
                : "Describe your issue and our support team will get back to you"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            createTicket.mutate({
              subject: fd.get("subject") as string,
              message: fd.get("message") as string,
              priority: fd.get("priority") as any,
              category: (fd.get("category") as string) || undefined,
            });
          }} className="space-y-4">
            <div>
              <Label htmlFor="subject">{language === "ar" ? "الموضوع" : "Subject"}</Label>
              <Input id="subject" name="subject" required className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{language === "ar" ? "الأولوية" : "Priority"}</Label>
                <Select name="priority" defaultValue="medium">
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {language === "ar" ? v.labelAr : v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="category">{language === "ar" ? "الفئة" : "Category"}</Label>
                <Input id="category" name="category" className="mt-1" placeholder={language === "ar" ? "اختياري" : "Optional"} />
              </div>
            </div>
            <div>
              <Label htmlFor="message">{language === "ar" ? "الرسالة" : "Message"}</Label>
              <Textarea id="message" name="message" required rows={4} className="mt-1 resize-none" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewTicketOpen(false)}>
                {language === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={createTicket.isPending}>
                {createTicket.isPending
                  ? (language === "ar" ? "جاري الإنشاء..." : "Creating...")
                  : (language === "ar" ? "إنشاء" : "Create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTicketId} onOpenChange={() => setDeleteTicketId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "ar" ? "تأكيد الحذف" : "Confirm Deletion"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "ar"
                ? "هل أنت متأكد من حذف هذه التذكرة؟ لا يمكن التراجع."
                : "Are you sure you want to delete this ticket? This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTicketId && deleteTicketMutation.mutate({ id: deleteTicketId })}
            >
              {language === "ar" ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Message Confirm Dialog ─────────────────────────────────── */}
      <AlertDialog open={!!deleteMessageId} onOpenChange={() => setDeleteMessageId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "ar" ? "حذف الرسالة" : "Delete Message"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "ar"
                ? "هل أنت متأكد من حذف هذه الرسالة؟ لا يمكن التراجع."
                : "Are you sure you want to delete this message? This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMessageId && deleteMessageMutation.mutate({ messageId: deleteMessageId })}
            >
              {deleteMessageMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                language === "ar" ? "حذف" : "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* ── Image Viewer ──────────────────────────────────────────────────── */}
      <Dialog open={!!viewerImage} onOpenChange={() => setViewerImage(null)}>
        <DialogContent className="max-w-3xl w-[95vw] p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>{language === "ar" ? "عرض الصورة" : "View Image"}</DialogTitle>
          </DialogHeader>
          {viewerImage && (
            <div className="relative">
              <img src={viewerImage} alt="full size" className="w-full h-auto rounded-lg max-h-[80vh] object-contain" />
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => setViewerImage(null)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
