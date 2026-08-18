import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, User, Eye, EyeOff } from "lucide-react";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { dateTimeLocalToUtcIso, todayLocalDate } from "@/lib/timezoneV6";

interface EditSubscriberDialogProps {
  open: boolean;
  inline?: boolean;
  onClose: () => void;
  subscriber: {
    id: number;
    username: string;
    fullName: string;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
    planId: number;
    simultaneousUse?: number | null;
    subscriptionEndDate?: string | Date | null;
  } | null;
  onSuccess?: () => void;
}

export function EditSubscriberDialog({ open, inline = false, onClose, subscriber, onSuccess }: EditSubscriberDialogProps) {
  const { timezone } = useTimezoneV6();
  // Credentials
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Personal
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Service
  const [planId, setPlanId] = useState<string>("");
  const [simultaneousUse, setSimultaneousUse] = useState("1");

  // Expiry
  const [expiryMode, setExpiryMode] = useState<"keep" | "custom">("keep");
  const [customDate, setCustomDate] = useState("");

  // Load plans
  const { data: plans } = trpc.plans.list.useQuery(undefined, { enabled: open });

  // Load credentials
  const { data: credentials } = trpc.subscribers.getCredentials.useQuery(
    { id: subscriber?.id ?? 0 },
    { enabled: open && !!subscriber?.id }
  );

  // Populate form when subscriber or credentials change
  useEffect(() => {
    if (!subscriber) return;
    setUsername(subscriber.username ?? "");
    setFullName(subscriber.fullName ?? "");
    setPhone(subscriber.phone ?? "");
    setAddress(subscriber.address ?? "");
    setNotes(subscriber.notes ?? "");
    setPlanId(subscriber.planId?.toString() ?? "");
    setSimultaneousUse(subscriber.simultaneousUse?.toString() ?? "1");
    setExpiryMode("keep");
    setCustomDate("");
    setPassword("");
    setShowPassword(false);
  }, [subscriber]);

  useEffect(() => {
    if (credentials) setPassword(credentials.password);
  }, [credentials]);

  const utils = trpc.useUtils();
  const updateMutation = trpc.subscribers.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث بيانات المشترك بنجاح");
      utils.subscribers.list.invalidate();
      onSuccess?.();
      if (!inline) onClose();
    },
    onError: (err) => {
      toast.error(err.message || "فشل تحديث البيانات");
    },
  });

  const handleSave = () => {
    if (!subscriber) return;
    if (!fullName.trim()) { toast.error("الاسم الكامل مطلوب"); return; }
    if (!planId) { toast.error("يجب اختيار باقة"); return; }
    if (expiryMode === "custom" && !customDate) { toast.error("يجب تحديد تاريخ الانتهاء"); return; }
    const subscriptionEndDate = expiryMode === "custom" ? dateTimeLocalToUtcIso(`${customDate}T00:00`, timezone) : undefined;
    if (expiryMode === "custom" && !subscriptionEndDate) { toast.error("تاريخ الانتهاء غير صالح في المنطقة الزمنية المحددة"); return; }

    updateMutation.mutate({
      id: subscriber.id,
      username: username.trim() !== subscriber.username ? username.trim() : undefined,
      fullName: fullName.trim(),
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
      planId: parseInt(planId),
      simultaneousUse: parseInt(simultaneousUse) || 1,
      password: password.trim().length >= 4 ? password.trim() : undefined,
      subscriptionEndDate,
    });
  };

  if (!subscriber || (!inline && !open)) return null;

  return (
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden" dir="rtl">
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <User className="w-5 h-5 text-primary" />
            بيانات المشترك القابلة للتعديل
          </h2>
          <p className="text-sm text-muted-foreground mt-1">تُحفظ كل الحقول من هذه الصفحة مباشرة.</p>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ─── بيانات الاتصال ─── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
              بيانات الاتصال
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>اسم المستخدم</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  dir="ltr"
                  className="font-mono"
                  placeholder="اسم المستخدم"
                />
              </div>
              <div className="space-y-1.5">
                <Label>كلمة المرور</Label>
                <div className="relative">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    dir="ltr"
                    className="font-mono pr-10"
                    placeholder="كلمة المرور"
                  />
                  <button
                    type="button"
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ─── البيانات الشخصية ─── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
              البيانات الشخصية
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>الاسم الكامل <span className="text-destructive">*</span></Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الكامل" />
              </div>
              <div className="space-y-1.5">
                <Label>رقم الهاتف</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+970..." dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>العنوان</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>ملاحظات</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={2} />
              </div>
            </div>
          </section>

          {/* ─── الخدمة والصلاحية ─── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b pb-1">
              الخدمة والصلاحية
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>الباقة <span className="text-destructive">*</span></Label>
                <Select value={planId} onValueChange={setPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الباقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((p: any) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        <span>{p.name}</span>
                        {p.downloadSpeed && (
                          <span className="text-xs text-muted-foreground mr-2">
                            {Math.round(p.downloadSpeed / 1000)}/{Math.round(p.uploadSpeed / 1000)} Mbps
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>الجلسات المتزامنة</Label>
                <Select value={simultaneousUse} onValueChange={setSimultaneousUse}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 10].map((n) => (
                      <SelectItem key={n} value={n.toString()}>{n} {n === 1 ? "جلسة" : "جلسات"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>تاريخ الانتهاء</Label>
                <Select value={expiryMode} onValueChange={(v) => setExpiryMode(v as "keep" | "custom")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">ابقِ التاريخ الحالي</SelectItem>
                    <SelectItem value="custom">تاريخ مخصص</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {expiryMode === "custom" && (
                <div className="col-span-2 space-y-1.5">
                  <Label>التاريخ الجديد للانتهاء</Label>
                  <Input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    dir="ltr"
                    min={todayLocalDate(timezone)}
                  />
                </div>
              )}
            </div>
          </section>

        </div>

        <div className="px-6 py-4 border-t flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
            إلغاء التغييرات
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
            {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            حفظ التغييرات
          </Button>
        </div>
    </section>
  );
}
