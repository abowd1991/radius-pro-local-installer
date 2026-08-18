import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Send, Bot, Bell, MessageSquare, Settings, CheckCircle2,
  XCircle, Copy, RefreshCw, RotateCcw, Info, Loader2,
  Router, CreditCard, UserPlus, Clock, DollarSign, HeadphonesIcon,
} from "lucide-react";

// ─── Default messages ────────────────────────────────────────────────────────
const DEFAULT_MESSAGES: Record<string, string> = {
  welcome:
    "مرحباً بك في بوت {network_name}! 🌐\nأرسل رقم الكرت للتحقق من حالته.",
  card_active:
    "✅ الكرت صالح\nالكود: {card_code}\nالخطة: {plan}\nينتهي: {expires}\nالوقت المتبقي: {remaining_time}",
  card_expired:
    "❌ الكرت منتهي الصلاحية\nالكود: {card_code}\nانتهى في: {expires}",
  card_not_found:
    "⚠️ الكرت غير موجود\nالكود: {card_code}\nتأكد من الرقم وأعد المحاولة.",
  subscription_confirmed:
    "🎉 تم تفعيل اشتراكك\nالاسم: {subscriber_name}\nالخطة: {plan}\nينتهي: {expires}",
  router_down:
    "🔴 انقطع الاتصال\nالراوتر: {router_name}\nالـ IP: {ip}\nالوقت: {time}",
  router_up:
    "🟢 عاد الاتصال\nالراوتر: {router_name}\nالـ IP: {ip}\nالوقت: {time}",
  subscription_expiring:
    "⏰ تذكير انتهاء الاشتراك\nالاسم: {subscriber_name}\nالأيام المتبقية: {days_left}",
  new_payment:
    "💰 دفعة جديدة\nالاسم: {subscriber_name}\nالمبلغ: {amount}\nالتاريخ: {date}",
  manual_card_expiring:
    "⏰ تنبيه: كرت يدوي على وشك الانتهاء\nالكرت: {card_code}\nالباقة: {plan}\nتاريخ الانتهاء: {expires}\nالوقت المتبقي: {remaining_time}\n\n⚠️ يرجى تجديد الكرت قبل انتهاء المدة.",
};

const MESSAGE_LABELS: Record<string, { label: string; vars: string[] }> = {
  welcome: { label: "رسالة الترحيب /start", vars: ["{network_name}"] },
  card_active: { label: "كرت نشط ✅", vars: ["{card_code}", "{plan}", "{expires}", "{remaining_time}"] },
  card_expired: { label: "كرت منتهي ❌", vars: ["{card_code}", "{expires}"] },
  card_not_found: { label: "كرت غير موجود ⚠️", vars: ["{card_code}"] },
  subscription_confirmed: { label: "تأكيد الاشتراك 🎉", vars: ["{subscriber_name}", "{plan}", "{expires}"] },
  router_down: { label: "انقطاع الراوتر 🔴", vars: ["{router_name}", "{ip}", "{time}"] },
  router_up: { label: "عودة الراوتر 🟢", vars: ["{router_name}", "{ip}", "{time}"] },
  subscription_expiring: { label: "تذكير الانتهاء ⏰", vars: ["{subscriber_name}", "{days_left}"] },
  new_payment: { label: "دفعة جديدة 💰", vars: ["{subscriber_name}", "{amount}", "{date}"] },
  manual_card_expiring: { label: "انتهاء كرت يدوي ⏰", vars: ["{card_code}", "{plan}", "{expires}", "{remaining_time}"] },
};

interface Preferences {
  ownerRouterDown: boolean;
  ownerNewSubscription: boolean;
  ownerCardActivated: boolean;
  ownerSubscriptionExpiring: boolean;
  ownerNewPayment: boolean;
  ownerSupportTicket: boolean;
  ownerManualCardExpiring: boolean;
  subscriberNewSubscription: boolean;
  subscriberCardActivated: boolean;
  subscriberSubscriptionExpiring: boolean;
  subscriberNewPayment: boolean;
  subscriberSupportTicket: boolean;
}

const defaultPrefs: Preferences = {
  ownerRouterDown: false,
  ownerNewSubscription: false,
  ownerCardActivated: false,
  ownerSubscriptionExpiring: false,
  ownerNewPayment: false,
  ownerSupportTicket: false,
  ownerManualCardExpiring: false,
  subscriberNewSubscription: false,
  subscriberCardActivated: false,
  subscriberSubscriptionExpiring: false,
  subscriberNewPayment: false,
  subscriberSupportTicket: false,
};

const ownerEvents: { key: keyof Preferences; label: string; desc: string; icon: React.ElementType }[] = [
  { key: "ownerRouterDown", label: "انقطاع/عودة الراوتر", desc: "تنبيه فوري عند انقطاع أي راوتر أو عودته", icon: Router },
  { key: "ownerNewSubscription", label: "اشتراك جديد", desc: "عند تسجيل مشترك جديد", icon: UserPlus },
  { key: "ownerCardActivated", label: "تفعيل كرت", desc: "عند تفعيل أي كرت", icon: CreditCard },
  { key: "ownerSubscriptionExpiring", label: "اشتراك على وشك الانتهاء", desc: "قبل 3 أيام من انتهاء الاشتراك", icon: Clock },
  { key: "ownerNewPayment", label: "دفعة جديدة", desc: "عند استلام أي دفعة", icon: DollarSign },
  { key: "ownerSupportTicket", label: "تذكرة دعم فني", desc: "عند فتح تذكرة دعم جديدة", icon: HeadphonesIcon },
  { key: "ownerManualCardExpiring", label: "انتهاء كرت يدوي قريباً", desc: "تنبيه قبل 24 ساعة من انتهاء أي كرت يدوي", icon: Clock },
];

const subscriberEvents: { key: keyof Preferences; label: string; desc: string; icon: React.ElementType }[] = [
  { key: "subscriberNewSubscription", label: "تأكيد الاشتراك", desc: "يصل للمشترك عند تفعيل اشتراكه", icon: UserPlus },
  { key: "subscriberCardActivated", label: "تأكيد تفعيل الكرت", desc: "يصل للمشترك عند تفعيل كرته", icon: CreditCard },
  { key: "subscriberSubscriptionExpiring", label: "تذكير انتهاء الاشتراك", desc: "يصل للمشترك قبل 3 أيام من الانتهاء", icon: Clock },
  { key: "subscriberNewPayment", label: "إيصال الدفع", desc: "يصل للمشترك عند إتمام الدفع", icon: DollarSign },
  { key: "subscriberSupportTicket", label: "تحديث تذكرة الدعم", desc: "يصل للمشترك عند الرد على تذكرته", icon: HeadphonesIcon },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function TelegramNotifications() {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [messages, setMessages] = useState<Record<string, string>>({ ...DEFAULT_MESSAGES });
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [reminderHours, setReminderHours] = useState(24);

  const { data, isLoading } = trpc.notificationChannels.getChannelSettings.useQuery({ channel: "telegram" });
  const { data: customMsgsData } = trpc.notificationChannels.getCustomMessages.useQuery({ channel: "telegram" });
  const { data: reminderData } = trpc.notificationChannels.getReminderHours.useQuery();

  const saveSettings = trpc.notificationChannels.saveChannelSettings.useMutation({
    onSuccess: () => toast.success("تم حفظ الإعدادات"),
    onError: (e) => toast.error(e.message),
  });
  const savePrefs = trpc.notificationChannels.savePreferences.useMutation({
    onSuccess: () => toast.success("تم حفظ التفضيلات"),
    onError: (e) => toast.error(e.message),
  });
  const testConn = trpc.notificationChannels.testConnection.useMutation({
    onSuccess: (r) => {
      setConnectionStatus(r.success ? "success" : "error");
      setTestMsg(r.message ?? "");
    },
    onError: (e) => { setConnectionStatus("error"); setTestMsg(e.message); },
  });
  const saveMsgs = trpc.notificationChannels.saveCustomMessages.useMutation({
    onSuccess: () => toast.success("تم حفظ الرسائل"),
    onError: (e) => toast.error(e.message),
  });
  const saveReminder = trpc.notificationChannels.saveReminderHours.useMutation({
    onSuccess: () => toast.success("تم حفظ وقت التنبيه"),
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (data?.settings) {
      setBotToken(data.settings.telegramBotToken ?? "");
      setChatId(data.settings.telegramChatId ?? "");
      setEnabled(data.settings.enabled);
    }
    if (data?.preferences) {
      setPrefs({
        ownerRouterDown: data.preferences.ownerRouterDown,
        ownerNewSubscription: data.preferences.ownerNewSubscription,
        ownerCardActivated: data.preferences.ownerCardActivated,
        ownerSubscriptionExpiring: data.preferences.ownerSubscriptionExpiring,
        ownerNewPayment: data.preferences.ownerNewPayment,
        ownerSupportTicket: data.preferences.ownerSupportTicket,
        ownerManualCardExpiring: (data.preferences as any).ownerManualCardExpiring ?? false,
        subscriberNewSubscription: data.preferences.subscriberNewSubscription,
        subscriberCardActivated: data.preferences.subscriberCardActivated,
        subscriberSubscriptionExpiring: data.preferences.subscriberSubscriptionExpiring,
        subscriberNewPayment: data.preferences.subscriberNewPayment,
        subscriberSupportTicket: data.preferences.subscriberSupportTicket,
      });
    }
  }, [data]);

  useEffect(() => {
    if (customMsgsData?.messages) {
      setMessages({ ...DEFAULT_MESSAGES, ...customMsgsData.messages });
    }
  }, [customMsgsData]);

  useEffect(() => {
    if (reminderData?.hours) {
      setReminderHours(reminderData.hours);
    }
  }, [reminderData]);

  const webhookUrl = `${window.location.origin}/api/telegram/webhook/${botToken || "<BOT_TOKEN>"}`;

  const copyText = (text: string, label = "تم النسخ") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const insertVar = (key: string, variable: string) => {
    setMessages(prev => ({ ...prev, [key]: (prev[key] ?? "") + variable }));
  };

  const resetMessage = (key: string) => {
    setMessages(prev => ({ ...prev, [key]: DEFAULT_MESSAGES[key] }));
    toast.info("تم استعادة الرسالة الافتراضية");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Bot className="h-6 w-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">إشعارات Telegram</h1>
          <p className="text-sm text-muted-foreground">ربط بوت تيليغرام وتخصيص الرسائل</p>
        </div>
        <div className="mr-auto">
          <Badge variant={enabled ? "default" : "secondary"} className={enabled ? "bg-green-500 hover:bg-green-600" : ""}>
            {enabled ? "مفعّل" : "معطّل"}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="setup">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="setup" className="gap-1.5 text-xs md:text-sm">
            <Settings className="w-4 h-4" /> الإعداد
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5 text-xs md:text-sm">
            <Bell className="w-4 h-4" /> الإشعارات
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-1.5 text-xs md:text-sm">
            <MessageSquare className="w-4 h-4" /> الرسائل
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Setup ── */}
        <TabsContent value="setup" className="space-y-4 mt-4">
          {/* Guide */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-blue-400 font-medium text-sm">
              <Info className="h-4 w-4" /> كيف تحصل على Bot Token و Chat ID؟
            </div>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>ابحث عن <strong>@BotFather</strong> في Telegram وأرسل له <code>/newbot</code></li>
              <li>اتبع التعليمات واحصل على الـ <strong>Bot Token</strong></li>
              <li>ابدأ محادثة مع البوت الخاص بك أو أضفه لمجموعة</li>
              <li>ابحث عن <strong>@userinfobot</strong> للحصول على الـ <strong>Chat ID</strong></li>
            </ol>
          </div>

          {/* Connection settings */}
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">إعدادات الاتصال</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">تفعيل القناة</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bot Token</Label>
              <Input dir="ltr" placeholder="123456789:AABBccDDeeFFggHH..." value={botToken} onChange={e => setBotToken(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Chat ID</Label>
              <Input dir="ltr" placeholder="-100123456789 أو 123456789" value={chatId} onChange={e => setChatId(e.target.value)} />
              <p className="text-xs text-muted-foreground">للمجموعات يبدأ بـ -100، للأفراد رقم موجب</p>
            </div>

            {connectionStatus !== "idle" && (
              <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${connectionStatus === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {connectionStatus === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                {testMsg}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => { setConnectionStatus("idle"); testConn.mutate({ channel: "telegram", telegramBotToken: botToken, telegramChatId: chatId }); }} disabled={!botToken || !chatId || testConn.isPending}>
                {testConn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                اختبار الإرسال
              </Button>
              <Button className="flex-1 gap-2" onClick={() => saveSettings.mutate({ channel: "telegram", enabled, telegramBotToken: botToken, telegramChatId: chatId })} disabled={saveSettings.isPending}>
                {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                حفظ الإعدادات
              </Button>
            </div>
          </div>

          {/* Webhook setup */}
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" /> ربط الـ Webhook (لفحص الكروت عبر البوت)
            </h3>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">رابط الـ Webhook</Label>
              <div className="flex gap-2">
                <Input dir="ltr" value={webhookUrl} readOnly className="text-xs font-mono bg-muted" />
                <Button variant="outline" size="icon" onClick={() => copyText(webhookUrl, "تم نسخ الرابط")}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">رابط تفعيل الـ Webhook (افتحه في المتصفح مرة واحدة فقط)</Label>
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  value={`https://api.telegram.org/bot${botToken || "<BOT_TOKEN>"}/setWebhook?url=${webhookUrl}`}
                  readOnly
                  className="text-xs font-mono bg-muted"
                />
                <Button variant="outline" size="icon" onClick={() => copyText(`https://api.telegram.org/bot${botToken || "<BOT_TOKEN>"}/setWebhook?url=${webhookUrl}`, "تم نسخ الرابط")}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="افتح في المتصفح"
                  onClick={() => window.open(`https://api.telegram.org/bot${botToken || "<BOT_TOKEN>"}/setWebhook?url=${webhookUrl}`, '_blank')}
                  disabled={!botToken}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </Button>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-medium">الأوامر المتاحة للمشتركين:</p>
              <p className="text-muted-foreground"><code className="bg-muted px-1 rounded">/start</code> — رسالة ترحيب</p>
              <p className="text-muted-foreground"><code className="bg-muted px-1 rounded">[رقم الكرت]</code> — فحص حالة الكرت</p>
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 1.5: Reminder Settings (inside setup tab) ── */}

        {/* ── Tab 2: Preferences ── */}
        <TabsContent value="preferences" className="space-y-4 mt-4">
          {/* Owner */}
          <div className="rounded-lg border bg-card p-4 space-y-1">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">إشعارات المشغّل</h3>
            {ownerEvents.map(({ key, label, desc, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between py-2.5 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-muted">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <Switch checked={prefs[key]} onCheckedChange={v => setPrefs(p => ({ ...p, [key]: v }))} />
              </div>
            ))}
          </div>

          {/* Subscriber */}
          <div className="rounded-lg border bg-card p-4 space-y-1">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">إشعارات المشتركين</h3>
            {subscriberEvents.map(({ key, label, desc, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between py-2.5 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-muted">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <Switch checked={prefs[key]} onCheckedChange={v => setPrefs(p => ({ ...p, [key]: v }))} />
              </div>
            ))}
          </div>

          <Button className="w-full gap-2" onClick={() => savePrefs.mutate({ channel: "telegram", ...prefs })} disabled={savePrefs.isPending}>
            {savePrefs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            حفظ التفضيلات
          </Button>
        </TabsContent>

        {/* ── Tab 3: Messages ── */}
        <TabsContent value="messages" className="space-y-4 mt-4">
          {/* Reminder hours setting */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              وقت التنبيه قبل انتهاء الكرت اليدوي
            </h3>
            <p className="text-xs text-muted-foreground">حدد كم ساعة قبل الانتهاء تريد أن يصلك التنبيه عبر Telegram وSMS.</p>
            <div className="flex gap-3 items-center">
              <Input
                type="number"
                min={1}
                max={168}
                value={reminderHours}
                onChange={e => setReminderHours(Number(e.target.value))}
                className="w-28"
                dir="ltr"
              />
              <span className="text-sm text-muted-foreground">ساعة</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[6, 12, 24, 48, 72].map(h => (
                <Button
                  key={h}
                  variant={reminderHours === h ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReminderHours(h)}
                  className="text-xs"
                >
                  {h === 24 ? "24 ساعة (افتراضي)" : h < 24 ? `${h} ساعة` : `${h / 24} أيام`}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => saveReminder.mutate({ hours: reminderHours })}
              disabled={saveReminder.isPending || reminderHours < 1 || reminderHours > 168}
            >
              {saveReminder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              حفظ وقت التنبيه
            </Button>
          </div>

          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 text-sm flex gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-muted-foreground">
              خصّص رسائل البوت. اضغط على أي متغير لإدراجه في نهاية الرسالة. يمكنك استعادة الرسالة الافتراضية في أي وقت.
            </p>
          </div>

          {Object.entries(MESSAGE_LABELS).map(([key, { label, vars }]) => (
            <div key={key} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">{label}</Label>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 gap-1" onClick={() => resetMessage(key)}>
                  <RotateCcw className="w-3 h-3" /> افتراضي
                </Button>
              </div>

              {/* Variable chips */}
              <div className="flex flex-wrap gap-1.5">
                {vars.map(v => (
                  <button
                    key={v}
                    onClick={() => insertVar(key, v)}
                    className="text-xs bg-muted hover:bg-accent px-2 py-0.5 rounded-full font-mono transition-colors border"
                  >
                    {v}
                  </button>
                ))}
              </div>

              <Textarea
                dir="rtl"
                value={messages[key] ?? ""}
                onChange={e => setMessages(prev => ({ ...prev, [key]: e.target.value }))}
                rows={3}
                className="font-mono text-sm resize-none"
              />

              {/* Preview */}
              <div className="rounded-md bg-muted/50 p-2.5 text-xs whitespace-pre-wrap">
                <span className="font-medium text-foreground block mb-1 text-xs">معاينة:</span>
                <span className="text-muted-foreground">{messages[key] ?? ""}</span>
              </div>
            </div>
          ))}

          <Button className="w-full gap-2" onClick={() => saveMsgs.mutate({ channel: "telegram", messages })} disabled={saveMsgs.isPending}>
            {saveMsgs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            حفظ جميع الرسائل
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
