import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, CheckCircle2, XCircle, Info, Loader2, Settings, Bell, MessageSquare,
  Router, CreditCard, UserPlus, Clock, DollarSign, HeadphonesIcon, RotateCcw,
} from "lucide-react";

// ─── Default messages ────────────────────────────────────────────────────────
const DEFAULT_MESSAGES: Record<string, string> = {
  welcome:
    "مرحباً بك في خدمة {network_name}! 🌐\nأرسل رقم الكرت للتحقق من حالته.",
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
};

const MESSAGE_LABELS: Record<string, { label: string; vars: string[] }> = {
  welcome: { label: "رسالة الترحيب", vars: ["{network_name}"] },
  card_active: { label: "كرت نشط ✅", vars: ["{card_code}", "{plan}", "{expires}", "{remaining_time}"] },
  card_expired: { label: "كرت منتهي ❌", vars: ["{card_code}", "{expires}"] },
  card_not_found: { label: "كرت غير موجود ⚠️", vars: ["{card_code}"] },
  subscription_confirmed: { label: "تأكيد الاشتراك 🎉", vars: ["{subscriber_name}", "{plan}", "{expires}"] },
  router_down: { label: "انقطاع الراوتر 🔴", vars: ["{router_name}", "{ip}", "{time}"] },
  router_up: { label: "عودة الراوتر 🟢", vars: ["{router_name}", "{ip}", "{time}"] },
  subscription_expiring: { label: "تذكير الانتهاء ⏰", vars: ["{subscriber_name}", "{days_left}"] },
  new_payment: { label: "دفعة جديدة 💰", vars: ["{subscriber_name}", "{amount}", "{date}"] },
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

// ─── WhatsApp SVG icon ────────────────────────────────────────────────────────
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WhatsAppNotifications() {
  const [apiUrl, setApiUrl] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [messages, setMessages] = useState<Record<string, string>>({ ...DEFAULT_MESSAGES });
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");

  const { data, isLoading } = trpc.notificationChannels.getChannelSettings.useQuery({ channel: "whatsapp" });
  const { data: customMsgsData } = trpc.notificationChannels.getCustomMessages.useQuery({ channel: "whatsapp" });

  const saveSettings = trpc.notificationChannels.saveChannelSettings.useMutation({
    onSuccess: () => toast.success("تم حفظ إعدادات WhatsApp"),
    onError: (e) => toast.error(e.message),
  });
  const savePrefs = trpc.notificationChannels.savePreferences.useMutation({
    onSuccess: () => toast.success("تم حفظ التفضيلات"),
    onError: (e) => toast.error(e.message),
  });
  const testConn = trpc.notificationChannels.testConnection.useMutation({
    onSuccess: (r) => { setConnectionStatus(r.success ? "success" : "error"); setTestMsg(r.message ?? ""); },
    onError: (e) => { setConnectionStatus("error"); setTestMsg(e.message); },
  });
  const saveMsgs = trpc.notificationChannels.saveCustomMessages.useMutation({
    onSuccess: () => toast.success("تم حفظ الرسائل"),
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (data?.settings) {
      setApiUrl(data.settings.whatsappApiUrl ?? "");
      setInstanceId(data.settings.whatsappInstanceId ?? "");
      setApiToken(data.settings.whatsappApiToken ?? "");
      setPhone(data.settings.whatsappPhone ?? "");
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
        <div className="p-2 rounded-lg bg-green-500/10">
          <WhatsAppIcon className="h-6 w-6 text-green-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">إشعارات WhatsApp</h1>
          <p className="text-sm text-muted-foreground">ربط WhatsApp Business API وتخصيص الرسائل</p>
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
          {/* API Guide */}
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
              <Info className="h-4 w-4" /> كيف تحصل على WhatsApp API؟
            </div>
            <p className="text-sm text-muted-foreground">
              يدعم النظام مزودي WhatsApp Business API مثل <strong>UltraMsg</strong> و <strong>WA-API</strong>.
              احصل على Instance ID و API Token من لوحة تحكم المزود.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { name: "UltraMsg ↗", url: "https://ultramsg.com", color: "text-green-400" },
                { name: "WA-API ↗", url: "https://wa-api.io", color: "text-blue-400" },
                { name: "CallMeBot ↗", url: "https://callmebot.com", color: "text-purple-400" },
              ].map(p => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer"
                  className={`text-sm ${p.color} underline underline-offset-2 hover:opacity-80`}>
                  {p.name}
                </a>
              ))}
            </div>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رابط API</Label>
                <Input dir="ltr" placeholder="https://api.ultramsg.com" value={apiUrl} onChange={e => setApiUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Instance ID</Label>
                <Input dir="ltr" placeholder="instance12345" value={instanceId} onChange={e => setInstanceId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>API Token</Label>
                <Input dir="ltr" placeholder="xxxxxxxxxxxxxxxx" type="password" value={apiToken} onChange={e => setApiToken(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>رقم WhatsApp (للاختبار)</Label>
                <Input dir="ltr" placeholder="9627xxxxxxxx" value={phone} onChange={e => setPhone(e.target.value)} />
                <p className="text-xs text-muted-foreground">بدون + أو 00، مثال: 9627xxxxxxxx</p>
              </div>
            </div>

            {connectionStatus !== "idle" && (
              <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${connectionStatus === "success" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {connectionStatus === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                {testMsg}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2"
                onClick={() => { setConnectionStatus("idle"); testConn.mutate({ channel: "whatsapp", whatsappApiUrl: apiUrl, whatsappInstanceId: instanceId, whatsappApiToken: apiToken, whatsappPhone: phone }); }}
                disabled={!apiUrl || !instanceId || !apiToken || testConn.isPending}>
                {testConn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                اختبار الإرسال
              </Button>
              <Button className="flex-1 gap-2"
                onClick={() => saveSettings.mutate({ channel: "whatsapp", enabled, whatsappApiUrl: apiUrl, whatsappInstanceId: instanceId, whatsappApiToken: apiToken, whatsappPhone: phone })}
                disabled={saveSettings.isPending}>
                {saveSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                حفظ الإعدادات
              </Button>
            </div>
          </div>

          {/* Pending note */}
          <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm flex gap-2">
            <Info className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-muted-foreground">
              بعد حصولك على API Key من أحد المزودين، أدخل البيانات واضغط "اختبار الإرسال" للتأكد من الاتصال.
              جميع الإعدادات والرسائل محفوظة ومنتظرة التفعيل.
            </p>
          </div>
        </TabsContent>

        {/* ── Tab 2: Preferences ── */}
        <TabsContent value="preferences" className="space-y-4 mt-4">
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

          <Button className="w-full gap-2" onClick={() => savePrefs.mutate({ channel: "whatsapp", ...prefs })} disabled={savePrefs.isPending}>
            {savePrefs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            حفظ التفضيلات
          </Button>
        </TabsContent>

        {/* ── Tab 3: Messages ── */}
        <TabsContent value="messages" className="space-y-4 mt-4">
          <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3 text-sm flex gap-2">
            <Info className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <p className="text-muted-foreground">
              خصّص رسائل WhatsApp. اضغط على أي متغير لإدراجه في نهاية الرسالة. يمكنك استعادة الرسالة الافتراضية في أي وقت.
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

              <div className="flex flex-wrap gap-1.5">
                {vars.map(v => (
                  <button key={v} onClick={() => insertVar(key, v)}
                    className="text-xs bg-muted hover:bg-accent px-2 py-0.5 rounded-full font-mono transition-colors border">
                    {v}
                  </button>
                ))}
              </div>

              <Textarea dir="rtl" value={messages[key] ?? ""} onChange={e => setMessages(prev => ({ ...prev, [key]: e.target.value }))}
                rows={3} className="font-mono text-sm resize-none" />

              <div className="rounded-md bg-muted/50 p-2.5 text-xs whitespace-pre-wrap">
                <span className="font-medium text-foreground block mb-1 text-xs">معاينة:</span>
                <span className="text-muted-foreground">{messages[key] ?? ""}</span>
              </div>
            </div>
          ))}

          <Button className="w-full gap-2" onClick={() => saveMsgs.mutate({ channel: "whatsapp", messages })} disabled={saveMsgs.isPending}>
            {saveMsgs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            حفظ جميع الرسائل
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
