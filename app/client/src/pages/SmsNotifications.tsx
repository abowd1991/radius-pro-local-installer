import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2,
  Router,
  CreditCard,
  UserPlus,
  Clock,
  DollarSign,
  HeadphonesIcon,
  Lock,
  MessageSquare,
  Bell,
  RotateCcw,
  CheckCircle2,
  Info,
  ShoppingBag,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

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
    storeOrderSms: boolean;
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
  storeOrderSms: false,
};

const ownerEvents = [
  { key: "ownerRouterDown" as keyof Preferences, label: "انقطاع/عودة الراوتر", icon: Router, description: "تنبيه فوري عند انقطاع أي راوتر أو عودته" },
  { key: "ownerNewSubscription" as keyof Preferences, label: "اشتراك جديد", icon: UserPlus, description: "عند تسجيل مشترك جديد" },
  { key: "ownerCardActivated" as keyof Preferences, label: "تفعيل كرت", icon: CreditCard, description: "عند تفعيل كرت إنترنت" },
  { key: "ownerSubscriptionExpiring" as keyof Preferences, label: "اشتراك على وشك الانتهاء", icon: Clock, description: "قبل انتهاء اشتراك بـ 3 أيام" },
  { key: "ownerNewPayment" as keyof Preferences, label: "دفعة جديدة", icon: DollarSign, description: "عند استلام أي دفعة" },
  { key: "ownerSupportTicket" as keyof Preferences, label: "تذكرة دعم فني", icon: HeadphonesIcon, description: "عند فتح تذكرة دعم جديدة" },
  { key: "ownerManualCardExpiring" as keyof Preferences, label: "انتهاء كرت يدوي قريباً", icon: Clock, description: "تنبيه قبل انتهاء أي كرت يدوي" },
];

const subscriberEvents = [
  { key: "subscriberNewSubscription" as keyof Preferences, label: "تأكيد الاشتراك", icon: UserPlus, description: "يصل للمشترك عند تفعيل اشتراكه" },
  { key: "subscriberCardActivated" as keyof Preferences, label: "تأكيد تفعيل الكرت", icon: CreditCard, description: "يصل للمشترك عند تفعيل كرته" },
  { key: "subscriberSubscriptionExpiring" as keyof Preferences, label: "تذكير انتهاء الاشتراك", icon: Clock, description: "يصل للمشترك قبل انتهاء اشتراكه" },
  { key: "subscriberNewPayment" as keyof Preferences, label: "إيصال الدفع", icon: DollarSign, description: "يصل للمشترك عند تأكيد دفعته" },
  { key: "subscriberSupportTicket" as keyof Preferences, label: "تحديث تذكرة الدعم", icon: HeadphonesIcon, description: "يصل للمشترك عند الرد على تذكرته" },
];

// ─── Default SMS messages ─────────────────────────────────────────────────────
const DEFAULT_SMS_MESSAGES: Record<string, string> = {
  manual_card_expiring:
    "تنبيه: الكرت {card_code} (باقة: {plan}) ينتهي في {expires}. الوقت المتبقي: {remaining_time}. يرجى التجديد.",
  subscription_expiring:
    "تذكير: اشتراك {subscriber_name} ينتهي خلال {days_left} أيام. يرجى التجديد.",
  subscription_confirmed:
    "تم تفعيل اشتراك {subscriber_name} بنجاح. الباقة: {plan}. ينتهي: {expires}.",
  card_active:
    "تم تفعيل الكرت {card_code}. الباقة: {plan}. ينتهي: {expires}.",
  new_payment:
    "تم استلام دفعة من {subscriber_name} بمبلغ {amount} بتاريخ {date}.",
};

const SMS_MESSAGE_LABELS: Record<string, { label: string; vars: string[] }> = {
  manual_card_expiring: { label: "انتهاء كرت يدوي ⏰", vars: ["{card_code}", "{plan}", "{expires}", "{remaining_time}"] },
  subscription_expiring: { label: "تذكير انتهاء الاشتراك ⏰", vars: ["{subscriber_name}", "{days_left}"] },
  subscription_confirmed: { label: "تأكيد الاشتراك 🎉", vars: ["{subscriber_name}", "{plan}", "{expires}"] },
  card_active: { label: "تفعيل كرت ✅", vars: ["{card_code}", "{plan}", "{expires}"] },
  new_payment: { label: "دفعة جديدة 💰", vars: ["{subscriber_name}", "{amount}", "{date}"] },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function SmsNotifications() {
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [smsMessages, setSmsMessages] = useState<Record<string, string>>({ ...DEFAULT_SMS_MESSAGES });
  const [reminderHours, setReminderHours] = useState(24);
  const [storeOrderSmsTemplate, setStoreOrderSmsTemplate] = useState<string | null>(null);

  const { data: smsStatus, isLoading: statusLoading } = trpc.notificationChannels.getSmsAdminStatus.useQuery();
  const { data, isLoading, refetch } = trpc.notificationChannels.getChannelSettings.useQuery({ channel: "sms" });
  const { data: smsCustomMsgsData } = trpc.notificationChannels.getSmsCustomMessages.useQuery();
  const { data: reminderData } = trpc.notificationChannels.getReminderHours.useQuery();

  const adminEnabled = smsStatus?.adminEnabled ?? false;

  useEffect(() => {
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
        storeOrderSms: (data.preferences as any).storeOrderSms ?? false,
      });
      setStoreOrderSmsTemplate((data.preferences as any).storeOrderSmsTemplate ?? null);
    }
  }, [data]);

  useEffect(() => {
    if (smsCustomMsgsData?.messages) {
      setSmsMessages({ ...DEFAULT_SMS_MESSAGES, ...smsCustomMsgsData.messages });
    }
  }, [smsCustomMsgsData]);

  useEffect(() => {
    if (reminderData?.hours) {
      setReminderHours(reminderData.hours);
    }
  }, [reminderData]);

  const savePrefs = trpc.notificationChannels.savePreferences.useMutation({
    onSuccess: () => { toast.success("تم حفظ تفضيلات الإشعارات"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const saveSmsMessages = trpc.notificationChannels.saveSmsCustomMessages.useMutation({
    onSuccess: () => toast.success("تم حفظ قوالب الرسائل"),
    onError: (e) => toast.error(e.message),
  });

  const saveReminder = trpc.notificationChannels.saveReminderHours.useMutation({
    onSuccess: () => toast.success("تم حفظ وقت التنبيه"),
    onError: (e) => toast.error(e.message),
  });

  const togglePref = (key: keyof Preferences) => setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));

  const insertVar = (key: string, variable: string) => {
    setSmsMessages(prev => ({ ...prev, [key]: (prev[key] ?? "") + variable }));
  };

  const resetMessage = (key: string) => {
    setSmsMessages(prev => ({ ...prev, [key]: DEFAULT_SMS_MESSAGES[key] }));
    toast.info("تم استعادة الرسالة الافتراضية");
  };

  if (isLoading || statusLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-orange-500/10">
          <MessageSquare className="h-6 w-6 text-orange-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">إشعارات SMS</h1>
          <p className="text-sm text-muted-foreground">إرسال رسائل نصية للمشتركين والمشغّل</p>
        </div>
        {adminEnabled && (
          <Badge className="mr-auto bg-green-500/10 text-green-400 border-green-500/20">مفعّل</Badge>
        )}
      </div>

      {/* Admin Lock Notice */}
      {!adminEnabled ? (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-orange-500/10">
              <Lock className="h-8 w-8 text-orange-400" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-base">خدمة SMS تحتاج تفعيل من المدير</h3>
            <p className="text-sm text-muted-foreground mt-1">
              لتفعيل خدمة الرسائل النصية، يرجى التواصل مع مدير النظام لتفعيل هذه الخدمة لحسابك.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              تُفعَّل الخدمة من لوحة تحكم المدير العام — قسم إدارة المشغّلين.
            </p>
          </div>
          <Button variant="outline" disabled className="gap-2">
            <Lock className="h-4 w-4" />
            في انتظار التفعيل
          </Button>
        </div>
      ) : (
        <>
          {/* Active SMS Info */}
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
              <MessageSquare className="h-4 w-4" />
              خدمة SMS مفعّلة لحسابك
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              يتم إرسال الرسائل النصية عبر خدمة SMS المدارة من قبل المدير. لا تحتاج لإعداد أي API.
            </p>
          </div>

          <Tabs defaultValue="preferences">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="preferences" className="gap-1.5 text-xs md:text-sm">
                <Bell className="w-4 h-4" /> الإشعارات
              </TabsTrigger>
              <TabsTrigger value="messages" className="gap-1.5 text-xs md:text-sm">
                <MessageSquare className="w-4 h-4" /> الرسائل
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs md:text-sm">
                <Clock className="w-4 h-4" /> الإعدادات
              </TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Preferences ── */}
            <TabsContent value="preferences" className="space-y-4 mt-4">
              <div className="rounded-lg border bg-card p-5 space-y-5">
                <h2 className="font-semibold text-base">تفضيلات الإشعارات</h2>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">إشعارات المشغّل</Badge>
                    <span className="text-xs text-muted-foreground">تصلك أنت كمدير الشبكة</span>
                  </div>
                  <div className="space-y-1">
                    {ownerEvents.map(({ key, label, icon: Icon, description }) => (
                      <div key={key} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">{description}</p>
                          </div>
                        </div>
                        <Switch checked={prefs[key]} onCheckedChange={() => togglePref(key)} />
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">إشعارات المشتركين</Badge>
                    <span className="text-xs text-muted-foreground">تصل للمشترك على رقمه المسجل</span>
                  </div>
                  <div className="space-y-1">
                    {subscriberEvents.map(({ key, label, icon: Icon, description }) => (
                      <div key={key} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">{description}</p>
                          </div>
                        </div>
                        <Switch checked={prefs[key]} onCheckedChange={() => togglePref(key)} />
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* ── Store Orders Section ── */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/20">متجر البطاقات</Badge>
                    <span className="text-xs text-muted-foreground">إشعارات الطلبات في المتجر الإلكتروني</span>
                  </div>
                  <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium">إرسال SMS عند تسليم الطلب</p>
                        <p className="text-xs text-muted-foreground">يُرسَل SMS للزبون يحتوي بيانات الكرت عند تأكيد التسليم</p>
                      </div>
                    </div>
                    <Switch checked={prefs.storeOrderSms} onCheckedChange={() => togglePref("storeOrderSms")} />
                  </div>
                  {prefs.storeOrderSms && (
                    <div className="mr-10 space-y-3">
                      {/* قالب الرسالة */}
                      <div className="rounded-md bg-cyan-500/5 border border-cyan-500/20 p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-cyan-400">قالب رسالة المتجر</p>
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setStoreOrderSmsTemplate(null)}
                          >
                            ↺ افتراضي
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          المتغيرات: <code className="bg-muted px-1 rounded">{'{name}'}</code> اسم الزبون،{' '}
                          <code className="bg-muted px-1 rounded">{'{cards}'}</code> قائمة الكروت،{' '}
                          <code className="bg-muted px-1 rounded">{'{count}'}</code> عدد الكروت
                        </p>
                        <Textarea
                          dir="rtl"
                          rows={4}
                          placeholder={`مرحباً {name}، {count} بطاقات:\n{cards}\nشكراً`}
                          value={storeOrderSmsTemplate ?? ""}
                          onChange={e => setStoreOrderSmsTemplate(e.target.value || null)}
                          className="font-mono text-xs resize-none"
                        />
                        {/* عداد الأحرف */}
                        <div className="flex items-center justify-between text-xs">
                          <span className={`${
                            (storeOrderSmsTemplate ?? '').length > 160 ? 'text-orange-400' :
                            (storeOrderSmsTemplate ?? '').length > 70 ? 'text-yellow-400' : 'text-muted-foreground'
                          }`}>
                            {(storeOrderSmsTemplate ?? '').length} حرف
                            {(storeOrderSmsTemplate ?? '').length > 160 ? ' (رسالتان SMS)' :
                             (storeOrderSmsTemplate ?? '').length > 70 ? ' (رسالة SMS واحدة)' : ' (ضمن 70 حرف)'}
                          </span>
                          <span className="text-muted-foreground">
                            {!storeOrderSmsTemplate ? 'سيستخدم القالب الافتراضي' : 'قالب مخصص'}
                          </span>
                        </div>
                        {/* معاينة */}
                        {storeOrderSmsTemplate && (
                          <div className="rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap text-muted-foreground">
                            <span className="font-medium text-foreground block mb-1">معاينة:</span>
                            {storeOrderSmsTemplate
                              .replace(/\{name\}/g, 'أحمد')
                              .replace(/\{count\}/g, '2')
                              .replace(/\{cards\}/g, '1: abc123 / pass1\n2: xyz456 / pass2')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Button onClick={() => savePrefs.mutate({ channel: "sms", ...prefs, storeOrderSmsTemplate })} disabled={savePrefs.isPending} className="w-full">
                  {savePrefs.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  حفظ التفضيلات
                </Button>
              </div>
            </TabsContent>

            {/* ── Tab 2: Messages ── */}
            <TabsContent value="messages" className="space-y-4 mt-4">
              <div className="rounded-md bg-orange-500/10 border border-orange-500/20 p-3 text-sm flex gap-2">
                <Info className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                <p className="text-muted-foreground">
                  خصّص نصوص رسائل SMS. اضغط على أي متغير لإدراجه في نهاية الرسالة. يمكنك استعادة النص الافتراضي في أي وقت.
                </p>
              </div>

              {Object.entries(SMS_MESSAGE_LABELS).map(([key, { label, vars }]) => (
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
                    value={smsMessages[key] ?? ""}
                    onChange={e => setSmsMessages(prev => ({ ...prev, [key]: e.target.value }))}
                    rows={3}
                    className="font-mono text-sm resize-none"
                  />

                  {/* Preview */}
                  <div className="rounded-md bg-muted/50 p-2.5 text-xs whitespace-pre-wrap">
                    <span className="font-medium text-foreground block mb-1 text-xs">معاينة:</span>
                    <span className="text-muted-foreground">{smsMessages[key] ?? ""}</span>
                  </div>
                </div>
              ))}

              <Button className="w-full gap-2" onClick={() => saveSmsMessages.mutate({ messages: smsMessages })} disabled={saveSmsMessages.isPending}>
                {saveSmsMessages.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                حفظ جميع الرسائل
              </Button>
            </TabsContent>

            {/* ── Tab 3: Settings ── */}
            <TabsContent value="settings" className="space-y-4 mt-4">
              <div className="rounded-lg border bg-card p-5 space-y-4">
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-500" />
                  وقت التنبيه قبل انتهاء الكرت
                </h2>
                <p className="text-sm text-muted-foreground">
                  حدد كم ساعة قبل انتهاء الكرت اليدوي تريد أن يصلك التنبيه. الافتراضي 24 ساعة.
                </p>

                <div className="space-y-2">
                  <Label>عدد الساعات قبل الانتهاء</Label>
                  <div className="flex gap-3 items-center">
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      value={reminderHours}
                      onChange={e => setReminderHours(Number(e.target.value))}
                      className="w-32"
                      dir="ltr"
                    />
                    <span className="text-sm text-muted-foreground">ساعة</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    الحد الأدنى: 1 ساعة — الحد الأقصى: 168 ساعة (7 أيام)
                  </p>
                </div>

                {/* Quick presets */}
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
                  className="w-full gap-2"
                  onClick={() => saveReminder.mutate({ hours: reminderHours })}
                  disabled={saveReminder.isPending || reminderHours < 1 || reminderHours > 168}
                >
                  {saveReminder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  حفظ وقت التنبيه
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
