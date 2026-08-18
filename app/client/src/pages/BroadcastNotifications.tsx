import { useState } from "react";
import { parseDbDate } from '@/lib/dateFormat';
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Megaphone,
  Users,
  User,
  Send,
  Trash2,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Search,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

// URLs للصور المحلية (مخزنة في client/public/icons)
const TEMPLATE_IMAGES = {
  update:      "/icons/rocket.png",
  maintenance: "/icons/maintenance.png",
  warning:     "/icons/warning.png",
  gift:        "/icons/gift.png",
  shield:      "/icons/shield.png",
  trophy:      "/icons/trophy.png",
};

const typeConfig = {
  info:    { label: "معلومات", color: "bg-blue-500/10 text-blue-400 border-blue-500/30",    icon: Info },
  warning: { label: "تحذير",   color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", icon: AlertTriangle },
  error:   { label: "خلل",     color: "bg-red-500/10 text-red-400 border-red-500/30",       icon: AlertCircle },
  success: { label: "نجاح",    color: "bg-green-500/10 text-green-400 border-green-500/30", icon: CheckCircle2 },
  update:  { label: "تحديث",   color: "bg-purple-500/10 text-purple-400 border-purple-500/30", icon: RefreshCw },
};

// القوالب الجاهزة الستة
const READY_TEMPLATES = [
  {
    id: "sys-update",
    label: "تحديث النظام",
    badgeColor: "bg-blue-100 text-blue-700",
    borderColor: "border-blue-200",
    titleColor: "text-blue-700",
    btnColor: "bg-blue-100 text-blue-700 hover:bg-blue-200",
    image: TEMPLATE_IMAGES.update,
    type: "update" as const,
    title: "🚀 نقوم بتحديث النظام",
    message: "نعمل حالياً على تحسين النظام لنقدم لكم تجربة أفضل وأسرع.\n\nقد تتأثر بعض الخدمات مؤقتاً.",
    footer: "شكراً لصبركم وتفهمكم 💙",
  },
  {
    id: "maintenance",
    label: "صيانة النظام",
    badgeColor: "bg-orange-100 text-orange-700",
    borderColor: "border-orange-200",
    titleColor: "text-orange-700",
    btnColor: "bg-orange-100 text-orange-700 hover:bg-orange-200",
    image: TEMPLATE_IMAGES.maintenance,
    type: "warning" as const,
    title: "🔧 النظام تحت الصيانة",
    message: "نقوم حالياً بإجراء صيانة دورية لضمان استقرار وأمان النظام.\n\nستعود قريباً بإذن الله.",
    footer: "شكراً لصبركم وتفهمكم 🧡",
  },
  {
    id: "alert",
    label: "تنبيه",
    badgeColor: "bg-red-100 text-red-700",
    borderColor: "border-red-200",
    titleColor: "text-red-700",
    btnColor: "bg-red-100 text-red-700 hover:bg-red-200",
    image: TEMPLATE_IMAGES.warning,
    type: "error" as const,
    title: "⚠️ يوجد خلل مؤقت",
    message: "نواجه حالياً خللاً تقنياً غير متوقع.\n\nنعمل على إصلاحه في أسرع وقت.\n\nقد تتأثر بعض الخدمات مؤقتاً.",
    footer: "شكراً لصبركم وتفهمكم 🙏",
  },
  {
    id: "new-feature",
    label: "تحديث جديد",
    badgeColor: "bg-green-100 text-green-700",
    borderColor: "border-green-200",
    titleColor: "text-green-700",
    btnColor: "bg-green-100 text-green-700 hover:bg-green-200",
    image: TEMPLATE_IMAGES.gift,
    type: "info" as const,
    title: "🎉 ميزة جديدة أصبحت متاحة!",
    message: "يسرنا إبلاغكم بأن ميزة جديدة أصبحت متاحة الآن.\n\nنأمل أن تضيف لكم تجربة أفضل.",
    footer: "✨ اكتشف الميزة الآن",
  },
  {
    id: "resolved",
    label: "تم الحل",
    badgeColor: "bg-teal-100 text-teal-700",
    borderColor: "border-teal-200",
    titleColor: "text-teal-700",
    btnColor: "bg-teal-100 text-teal-700 hover:bg-teal-200",
    image: TEMPLATE_IMAGES.shield,
    type: "success" as const,
    title: "✅ تم حل المشكلة بنجاح",
    message: "تم إصلاح الخلل وتعمل الخدمات الآن بشكل طبيعي.\n\nشكراً لتفهمكم وصبركم.",
    footer: "💙 نحن هنا دائماً لخدمتكم",
  },
  {
    id: "achievement",
    label: "إنجاز",
    badgeColor: "bg-purple-100 text-purple-700",
    borderColor: "border-purple-200",
    titleColor: "text-purple-700",
    btnColor: "bg-purple-100 text-purple-700 hover:bg-purple-200",
    image: TEMPLATE_IMAGES.trophy,
    type: "success" as const,
    title: "😍 حققنا نجاحاً جديداً معكم!",
    message: "بفضلكم ودعمكم المستمر نستمر في التقدم وتقديم الأفضل.\n\nشكراً لكونكم جزءاً من نجاحنا.",
    footer: "💜 نعدكم بالأفضل دائماً",
  },
];

export default function BroadcastNotifications() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"info" | "warning" | "error" | "success" | "update">("info");
  const [targetType, setTargetType] = useState<"all" | "specific">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"templates" | "custom">("templates");

  const { data: clients = [] } = trpc.broadcasts.getClients.useQuery();
  const { data: sentList = [], refetch: refetchList } = trpc.broadcasts.list.useQuery({ page: 1, limit: 50 });

  const sendMutation = trpc.broadcasts.send.useMutation({
    onSuccess: (data) => {
      toast.success(`تم الإرسال بنجاح إلى ${data.recipientCount} مستلم`);
      setTitle("");
      setMessage("");
      setType("info");
      setTargetType("all");
      setSelectedIds([]);
      setConfirmOpen(false);
      refetchList();
    },
    onError: (err) => {
      toast.error(`فشل الإرسال: ${err.message}`);
    },
  });

  const deleteMutation = trpc.broadcasts.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الإشعار");
      refetchList();
    },
  });

  const filteredClients = clients.filter((c: { id: number; name: string | null; username: string | null; email: string | null; status: string }) =>
    (c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleClient = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === filteredClients.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredClients.map((c: { id: number }) => c.id));
    }
  };

  const applyTemplate = (tpl: typeof READY_TEMPLATES[0]) => {
    setTitle(tpl.title + "\n" + tpl.footer);
    setMessage(tpl.message);
    setType(tpl.type);
    setActiveTab("custom");
    toast.success(`تم تطبيق قالب "${tpl.label}"`);
  };

  const handleSend = () => {
    if (!title.trim() || !message.trim()) {
      toast.error("يرجى ملء العنوان والرسالة");
      return;
    }
    if (targetType === "specific" && selectedIds.length === 0) {
      toast.error("يرجى اختيار مستلم واحد على الأقل");
      return;
    }
    setConfirmOpen(true);
  };

  const confirmSend = () => {
    sendMutation.mutate({
      title,
      message,
      type,
      targetType,
      recipientIds: targetType === "specific" ? selectedIds : undefined,
    });
  };

  const recipientCount = targetType === "all" ? clients.length : selectedIds.length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
          <Megaphone className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">نظام الإشعارات الجماعية</h1>
          <p className="text-muted-foreground">أرسل رسائل وتنبيهات لعملائك مباشرة</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose Panel */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-400" />
              إنشاء رسالة جديدة
            </CardTitle>
            <CardDescription>اختر قالباً جاهزاً أو اكتب رسالتك الخاصة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tabs */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setActiveTab("templates")}
                className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "templates"
                    ? "bg-blue-600 text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                قوالب جاهزة
              </button>
              <button
                onClick={() => setActiveTab("custom")}
                className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === "custom"
                    ? "bg-blue-600 text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Megaphone className="w-3.5 h-3.5" />
                رسالة مخصصة
              </button>
            </div>

            {/* Templates Grid */}
            {activeTab === "templates" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">اضغط على أي قالب لتطبيقه وتعديله قبل الإرسال</p>
                <div className="grid grid-cols-2 gap-3">
                  {READY_TEMPLATES.map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      className={`relative cursor-pointer rounded-xl border-2 ${tpl.borderColor} bg-white p-3 hover:shadow-md transition-all hover:scale-[1.02] group`}
                    >
                      {/* Badge */}
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${tpl.badgeColor}`}>
                        {tpl.label}
                      </span>
                      {/* Image */}
                      <div className="flex justify-center mb-2">
                        <img src={tpl.image} alt={tpl.label} className="w-14 h-14 object-contain drop-shadow-md" />
                      </div>
                      {/* Title */}
                      <p className={`text-xs font-bold text-center leading-tight ${tpl.titleColor}`}>
                        {tpl.title.split("\n")[0]}
                      </p>
                      {/* Hover overlay */}
                      <div className="absolute inset-0 rounded-xl bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-700 bg-white/90 px-2 py-1 rounded-full shadow">تطبيق ←</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Form */}
            {activeTab === "custom" && (
              <div className="space-y-4">
                {/* Title */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">عنوان الإشعار</label>
                  <Input
                    placeholder="مثال: تحديث النظام - صيانة مجدولة"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="bg-background"
                  />
                </div>

                {/* Message */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">نص الرسالة</label>
                  <Textarea
                    placeholder="اكتب تفاصيل الرسالة هنا..."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={4}
                    className="bg-background resize-none"
                  />
                </div>

                {/* Type */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">نوع الإشعار</label>
                  <Select value={type} onValueChange={(v: any) => setType(v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeConfig).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <cfg.icon className="h-4 w-4" />
                            {cfg.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Target */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">المستلمون</label>
                  <Select value={targetType} onValueChange={(v: any) => setTargetType(v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          جميع العملاء ({clients.length})
                        </div>
                      </SelectItem>
                      <SelectItem value="specific">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          عملاء محددون
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Specific clients selector */}
                {targetType === "specific" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="بحث عن عميل..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="bg-background pr-9"
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={toggleAll}>
                        {selectedIds.length === filteredClients.length ? "إلغاء الكل" : "تحديد الكل"}
                      </Button>
                    </div>
                    <ScrollArea className="h-48 border border-border rounded-md p-2">
                      {filteredClients.length === 0 ? (
                        <p className="text-center text-muted-foreground text-sm py-4">لا يوجد عملاء</p>
                      ) : (
                        filteredClients.map((client: { id: number; name: string | null; username: string | null; email: string | null; status: string }) => (
                          <div
                            key={client.id}
                            className="flex items-center gap-3 py-2 px-2 hover:bg-accent rounded-md cursor-pointer"
                            onClick={() => toggleClient(client.id)}
                          >
                            <Checkbox
                              checked={selectedIds.includes(client.id)}
                              onCheckedChange={() => toggleClient(client.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{client.name || client.username || "—"}</p>
                              <p className="text-xs text-muted-foreground truncate">{client.email || client.username}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </ScrollArea>
                    {selectedIds.length > 0 && (
                      <p className="text-xs text-blue-400">تم تحديد {selectedIds.length} عميل</p>
                    )}
                  </div>
                )}

                {/* Preview */}
                {title && (
                  <div className={`p-3 rounded-lg border ${typeConfig[type].color} flex items-start gap-2`}>
                    {(() => { const Icon = typeConfig[type].icon; return <Icon className="h-4 w-4 mt-0.5 shrink-0" />; })()}
                    <div>
                      <p className="text-sm font-semibold">{title}</p>
                      {message && <p className="text-xs mt-0.5 opacity-80 line-clamp-2">{message}</p>}
                    </div>
                  </div>
                )}

                {/* Send button */}
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleSend}
                  disabled={sendMutation.isPending}
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <Send className="h-4 w-4 ml-2" />
                  )}
                  إرسال إلى {recipientCount} مستلم
                </Button>
              </div>
            )}

            {/* Send button on templates tab */}
            {activeTab === "templates" && title && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">القالب المحدد: <strong className="text-foreground">{title.split("\n")[0]}</strong></p>
                <div className="flex gap-2">
                  <Select value={targetType} onValueChange={(v: any) => setTargetType(v)}>
                    <SelectTrigger className="bg-background flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع العملاء ({clients.length})</SelectItem>
                      <SelectItem value="specific">عملاء محددون</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleSend}
                    disabled={sendMutation.isPending}
                  >
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    إرسال
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sent History */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-purple-400" />
              الإشعارات المرسلة
            </CardTitle>
            <CardDescription>سجل جميع الإشعارات التي أرسلتها</CardDescription>
          </CardHeader>
          <CardContent>
            {sentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Megaphone className="w-16 h-16 opacity-20 mb-3" />
                <p className="text-sm">لم ترسل أي إشعارات بعد</p>
              </div>
            ) : (
              <ScrollArea className="h-[420px]">
                <div className="space-y-3">
                  {sentList.map((item: any) => {
                    const cfg = typeConfig[item.type as keyof typeof typeConfig] || typeConfig.info;
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background/50"
                      >
                        <div className={`p-2 rounded-lg border ${cfg.color} shrink-0`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold truncate">{item.title}</p>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {item.recipientCount} مستلم
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.message}</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {formatDistanceToNow((parseDbDate(item.createdAt) ?? new Date(item.createdAt)), { addSuffix: true, locale: ar })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => deleteMutation.mutate({ id: item.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-400" />
              تأكيد الإرسال
            </DialogTitle>
            <DialogDescription>
              سيتم إرسال الإشعار التالي إلى <strong>{recipientCount} مستلم</strong>
            </DialogDescription>
          </DialogHeader>
          <div className={`p-4 rounded-lg border ${typeConfig[type].color}`}>
            <div className="flex items-start gap-2">
              {(() => { const Icon = typeConfig[type].icon; return <Icon className="h-5 w-5 mt-0.5 shrink-0" />; })()}
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm mt-1 opacity-80">{message}</p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>إلغاء</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={confirmSend}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              إرسال الآن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
