/**
 * SpeedScheduleManager — مكوّن إدارة جداول السرعة الزمنية للباقة
 * يُعرض داخل نموذج تعديل الباقة فقط (isEdit=true)
 * يدعم الوقت اليدوي بصيغة HH:MM (مثل 1:15، 23:45)
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, Clock, Edit2, AlertCircle, Zap } from "lucide-react";
import { toast } from "sonner";

interface SpeedScheduleManagerProps {
  planId: number;
  language: "ar" | "en";
}

// preset day groups → daysOfWeek arrays (0=الأحد, 1=الإثنين, ..., 6=السبت)
const DAY_PRESETS: Record<string, number[]> = {
  all:      [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
  sun: [0], mon: [1], tue: [2], wed: [3], thu: [4], fri: [5], sat: [6],
};

const DAYS_OPTIONS = [
  { value: "all",      labelAr: "كل الأيام",                   labelEn: "Every Day" },
  { value: "weekdays", labelAr: "أيام العمل (الإثنين–الجمعة)", labelEn: "Weekdays (Mon–Fri)" },
  { value: "weekends", labelAr: "عطلة نهاية الأسبوع",          labelEn: "Weekends" },
  { value: "sun",      labelAr: "الأحد",    labelEn: "Sunday" },
  { value: "mon",      labelAr: "الإثنين",  labelEn: "Monday" },
  { value: "tue",      labelAr: "الثلاثاء", labelEn: "Tuesday" },
  { value: "wed",      labelAr: "الأربعاء", labelEn: "Wednesday" },
  { value: "thu",      labelAr: "الخميس",  labelEn: "Thursday" },
  { value: "fri",      labelAr: "الجمعة",   labelEn: "Friday" },
  { value: "sat",      labelAr: "السبت",    labelEn: "Saturday" },
];

function daysToPreset(days: number[]): string {
  const sorted = [...days].sort().join(",");
  for (const [key, arr] of Object.entries(DAY_PRESETS)) {
    if ([...arr].sort().join(",") === sorted) return key;
  }
  return "all";
}

function formatSpeed(kbps: number): string {
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(kbps % 1000 === 0 ? 0 : 1)}M`;
  return `${kbps}K`;
}

function getDayLabel(days: number[] | string, language: "ar" | "en"): string {
  const preset = Array.isArray(days) ? daysToPreset(days) : days;
  const opt = DAYS_OPTIONS.find(d => d.value === preset);
  if (!opt) return String(days);
  return language === "ar" ? opt.labelAr : opt.labelEn;
}

/** تحويل HH:MM إلى { hour, minute } */
function parseTime(timeStr: string): { hour: number; minute: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** تحويل hour + minute إلى نص HH:MM */
function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** التحقق من صحة نص الوقت */
function isValidTimeStr(timeStr: string): boolean {
  return parseTime(timeStr) !== null;
}

interface ScheduleFormData {
  name: string;
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  dayPreset: string;
  downloadKbps: number;
  uploadKbps: number;
  isActive: boolean;
}

const defaultForm: ScheduleFormData = {
  name: "",
  startTime: "00:00",
  endTime: "08:00",
  dayPreset: "all",
  downloadKbps: 10000,
  uploadKbps: 10000,
  isActive: true,
};

export function SpeedScheduleManager({ planId, language }: SpeedScheduleManagerProps) {
  const ar = language === "ar";
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ScheduleFormData>(defaultForm);
  const [startTimeError, setStartTimeError] = useState("");
  const [endTimeError, setEndTimeError] = useState("");

  const utils = trpc.useUtils();

  // @ts-ignore — speedSchedules is registered in appRouter; TS inference depth exceeded
  const { data: schedules = [], isLoading } = (trpc as any).speedSchedules.getByPlan.useQuery(
    { planId },
    { enabled: !!planId }
  );

  // @ts-ignore
  const createMutation = (trpc as any).speedSchedules.create.useMutation({
    onSuccess: (_data: any, variables: any) => {
      (utils as any).speedSchedules.getByPlan.invalidate({ planId });
      setIsDialogOpen(false);
      setForm(defaultForm);
      // فحص هل الوقت الحالي ضمن نطاق الجدول الجديد
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const d = now.getDay();
      const days: number[] = variables.daysOfWeek ?? [0,1,2,3,4,5,6];
      const sh = variables.startHour ?? 0;
      const sm = variables.startMinute ?? 0;
      const eh = variables.endHour ?? 23;
      const em = variables.endMinute ?? 59;
      const nowMins = h * 60 + m;
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;
      const inRange = days.includes(d) && nowMins >= startMins && nowMins < endMins;
      if (inRange) {
        toast.success(
          ar
            ? `✅ تم إضافة الجدول وتطبيق السرعة الجديدة فوراً — تم إرسال أمر التحديث للمستخدمين المتصلين`
            : `✅ Schedule added and speed applied immediately — CoA sent to active users`,
          { duration: 5000 }
        );
      } else {
        toast.success(
          ar ? "✅ تم إضافة جدول السرعة — سيُطبَّق عند حلول وقته" : "✅ Speed schedule added — will apply at scheduled time",
          { duration: 4000 }
        );
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  // @ts-ignore
  const updateMutation = (trpc as any).speedSchedules.update.useMutation({
    onSuccess: (_data: any, variables: any) => {
      (utils as any).speedSchedules.getByPlan.invalidate({ planId });
      setIsDialogOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const d = now.getDay();
      const data = variables.data ?? {};
      const sh = data.startHour ?? 0;
      const sm = data.startMinute ?? 0;
      const eh = data.endHour ?? 23;
      const em = data.endMinute ?? 59;
      const days: number[] = data.daysOfWeek ?? [0,1,2,3,4,5,6];
      const nowMins = h * 60 + m;
      const inRange = days.includes(d) && nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
      if (inRange) {
        toast.success(
          ar
            ? `✅ تم تحديث الجدول وتطبيق السرعة الجديدة فوراً — تم إرسال أمر التحديث للمستخدمين المتصلين`
            : `✅ Schedule updated and speed applied immediately — CoA sent to active users`,
          { duration: 5000 }
        );
      } else {
        toast.success(
          ar ? "✅ تم تحديث جدول السرعة" : "✅ Speed schedule updated",
          { duration: 3000 }
        );
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  // @ts-ignore
  const deleteMutation = (trpc as any).speedSchedules.delete.useMutation({
    onSuccess: () => {
      (utils as any).speedSchedules.getByPlan.invalidate({ planId });
      toast.success(
        ar
          ? "🔄 تم حذف الجدول — تم إرجاع السرعة الأصلية للكروت وإرسال أمر التحديث للمتصلين"
          : "🔄 Schedule deleted — original speed restored and CoA sent to active users",
        { duration: 5000 }
      );
    },
    onError: (e: any) => toast.error(e.message),
  });

  // @ts-ignore
  const applyNowMutation = (trpc as any).speedSchedules.applyNow.useMutation({
    onSuccess: (data: any) => {
      const isSchedule = data?.applied === 'schedule';
      const count = data?.cardCount ?? 0;
      toast.success(
        ar
          ? `⚡ تم تطبيق السرعة فوراً على ${count} كرت — ${isSchedule ? 'سرعة الجدول النشط' : 'السرعة الأصلية'} مُطبَّقة — تم إرسال CoA للمتصلين`
          : `⚡ Speed applied to ${count} cards — ${isSchedule ? 'active schedule speed' : 'original plan speed'} — CoA sent to active users`,
        { duration: 5000 }
      );
    },
    onError: (e: any) => toast.error(ar ? `خطأ: ${e.message}` : `Error: ${e.message}`),
  });

  // @ts-ignore
  const toggleMutation = (trpc as any).speedSchedules.toggleActive.useMutation({
    onSuccess: (_data: any, variables: any) => {
      (utils as any).speedSchedules.getByPlan.invalidate({ planId });
      if (variables.isActive) {
        toast.success(
          ar
            ? "✅ تم تفعيل الجدول — السرعة الجديدة مُطبَّقة على المتصلين"
            : "✅ Schedule activated — new speed applied to active users",
          { duration: 4000 }
        );
      } else {
        toast.success(
          ar
            ? "🔄 تم تعطيل الجدول — تم إرجاع السرعة الأصلية للكروت"
            : "🔄 Schedule deactivated — original speed restored",
          { duration: 4000 }
        );
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openAdd() {
    setEditingId(null);
    setForm(defaultForm);
    setStartTimeError("");
    setEndTimeError("");
    setIsDialogOpen(true);
  }

  function openEdit(s: any) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      startTime: formatTime(s.startHour, s.startMinute ?? 0),
      endTime: formatTime(s.endHour, s.endMinute ?? 0),
      dayPreset: daysToPreset(s.daysOfWeek ?? [0,1,2,3,4,5,6]),
      downloadKbps: s.downloadKbps,
      uploadKbps: s.uploadKbps,
      isActive: s.isActive,
    });
    setStartTimeError("");
    setEndTimeError("");
    setIsDialogOpen(true);
  }

  function handleStartTimeChange(val: string) {
    setForm(f => ({ ...f, startTime: val }));
    if (val && !isValidTimeStr(val)) {
      setStartTimeError(ar ? "صيغة الوقت غير صحيحة (HH:MM)" : "Invalid time format (HH:MM)");
    } else {
      setStartTimeError("");
    }
  }

  function handleEndTimeChange(val: string) {
    setForm(f => ({ ...f, endTime: val }));
    if (val && !isValidTimeStr(val)) {
      setEndTimeError(ar ? "صيغة الوقت غير صحيحة (HH:MM)" : "Invalid time format (HH:MM)");
    } else {
      setEndTimeError("");
    }
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      toast.error(ar ? "أدخل اسم الجدول" : "Enter schedule name");
      return;
    }

    const startParsed = parseTime(form.startTime);
    const endParsed = parseTime(form.endTime);

    if (!startParsed) {
      setStartTimeError(ar ? "صيغة الوقت غير صحيحة (HH:MM)" : "Invalid time format (HH:MM)");
      return;
    }
    if (!endParsed) {
      setEndTimeError(ar ? "صيغة الوقت غير صحيحة (HH:MM)" : "Invalid time format (HH:MM)");
      return;
    }

    // التحقق من أن وقت البداية ≠ وقت النهاية
    const startTotal = startParsed.hour * 60 + startParsed.minute;
    const endTotal = endParsed.hour * 60 + endParsed.minute;
    if (startTotal === endTotal) {
      toast.error(ar ? "وقت البداية والنهاية لا يمكن أن يكونا متساويين" : "Start and end times cannot be equal");
      return;
    }

    if (form.downloadKbps < 64 || form.uploadKbps < 64) {
      toast.error(ar ? "السرعة يجب أن تكون 64 كيلو على الأقل" : "Speed must be at least 64 Kbps");
      return;
    }

    const daysOfWeek = DAY_PRESETS[form.dayPreset] ?? DAY_PRESETS["all"];

    const payload = {
      name: form.name,
      startHour: startParsed.hour,
      startMinute: startParsed.minute,
      endHour: endParsed.hour,
      endMinute: endParsed.minute,
      daysOfWeek,
      downloadKbps: form.downloadKbps,
      uploadKbps: form.uploadKbps,
      isActive: form.isActive,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate({ planId, ...payload });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {ar ? "جداول السرعة الزمنية" : "Speed Schedules"}
          </p>
          {schedules.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {schedules.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/30"
            onClick={() => applyNowMutation.mutate({ planId })}
            disabled={applyNowMutation.isPending}
            title={ar ? "تطبيق السرعة الحالية فوراً على جميع الكروت وإرسال CoA للمتصلين" : "Apply current speed now to all cards and send CoA to active users"}
          >
            <Zap className="h-3.5 w-3.5 mr-1" />
            {applyNowMutation.isPending
              ? (ar ? "جاري..." : "Applying...")
              : (ar ? "تطبيق الآن" : "Apply Now")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
            onClick={openAdd}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {ar ? "إضافة جدول" : "Add Schedule"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {ar
          ? "حدد أوقاتاً تتغير فيها سرعة الإنترنت تلقائياً (مثل: مضاعفة السرعة ليلاً)"
          : "Set time periods where internet speed changes automatically (e.g., double speed at night)"}
      </p>

      {/* List */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">{ar ? "جاري التحميل..." : "Loading..."}</p>
      ) : schedules.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          {ar ? "لا توجد جداول سرعة — اضغط «إضافة جدول» لإنشاء أول جدول" : "No speed schedules — click «Add Schedule» to create one"}
        </p>
      ) : (
        <div className="space-y-1.5">
          {schedules.map((s: any) => (
            <div
              key={s.id}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-opacity ${
                s.isActive
                  ? "bg-white dark:bg-background border-blue-200 dark:border-blue-800"
                  : "bg-muted/40 border-muted opacity-60"
              }`}
            >
              {/* Toggle */}
              <Switch
                checked={s.isActive}
                onCheckedChange={(v) => toggleMutation.mutate({ id: s.id, isActive: v })}
                className="scale-75"
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate">{s.name}</span>
                <span className="text-muted-foreground mx-1.5">·</span>
                <span className="text-muted-foreground font-mono">
                  {formatTime(s.startHour, s.startMinute ?? 0)} – {formatTime(s.endHour, s.endMinute ?? 0)}
                </span>
                <span className="text-muted-foreground mx-1.5">·</span>
                <span className="text-muted-foreground">{getDayLabel(s.daysOfWeek ?? [], language)}</span>
              </div>

              {/* Speed badge */}
              <span className="text-xs font-mono text-green-600 dark:text-green-400 shrink-0">
                ↓{formatSpeed(s.downloadKbps)} ↑{formatSpeed(s.uploadKbps)}
              </span>

              {/* Actions */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => openEdit(s)}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => deleteMutation.mutate({ id: s.id })}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? (ar ? "تعديل جدول السرعة" : "Edit Speed Schedule")
                : (ar ? "إضافة جدول سرعة جديد" : "Add Speed Schedule")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-sm">{ar ? "اسم الجدول" : "Schedule Name"}</Label>
              <Input
                placeholder={ar ? "مثال: سرعة ليلية، ذروة النهار" : "e.g., Night Boost, Peak Hours"}
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Time Range — حقول وقت يدوية HH:MM */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{ar ? "من الوقت" : "From Time"}</Label>
                <div className="relative">
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    className={`font-mono ${startTimeError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    placeholder="00:00"
                  />
                </div>
                {startTimeError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {startTimeError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {ar ? "مثال: 01:15، 23:30" : "e.g., 01:15, 23:30"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{ar ? "إلى الوقت" : "To Time"}</Label>
                <div className="relative">
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => handleEndTimeChange(e.target.value)}
                    className={`font-mono ${endTimeError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                    placeholder="08:00"
                  />
                </div>
                {endTimeError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {endTimeError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {ar ? "مثال: 08:30، 14:45" : "e.g., 08:30, 14:45"}
                </p>
              </div>
            </div>

            {/* Days */}
            <div className="space-y-1.5">
              <Label className="text-sm">{ar ? "الأيام" : "Days"}</Label>
              <Select
                value={form.dayPreset}
                onValueChange={(v) => setForm(f => ({ ...f, dayPreset: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {ar ? d.labelAr : d.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Speed */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{ar ? "سرعة التنزيل (كيلو)" : "Download (Kbps)"}</Label>
                <Input
                  type="number"
                  min={64}
                  step={1000}
                  value={form.downloadKbps}
                  onChange={(e) => setForm(f => ({ ...f, downloadKbps: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">{formatSpeed(form.downloadKbps)}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{ar ? "سرعة الرفع (كيلو)" : "Upload (Kbps)"}</Label>
                <Input
                  type="number"
                  min={64}
                  step={1000}
                  value={form.uploadKbps}
                  onChange={(e) => setForm(f => ({ ...f, uploadKbps: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">{formatSpeed(form.uploadKbps)}</p>
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))}
              />
              <Label className="text-sm cursor-pointer">
                {ar ? "تفعيل الجدول فوراً" : "Activate schedule immediately"}
              </Label>
            </div>

            {/* Preview */}
            {form.name && isValidTimeStr(form.startTime) && isValidTimeStr(form.endTime) && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{form.name}</span>
                {" — "}
                <span className="font-mono">{form.startTime}</span>
                {" → "}
                <span className="font-mono">{form.endTime}</span>
                {" · "}
                {getDayLabel(DAY_PRESETS[form.dayPreset] ?? [], language)}
                {" · "}
                <span className="font-mono text-green-600 dark:text-green-400">
                  {formatSpeed(form.downloadKbps)}/{formatSpeed(form.uploadKbps)}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isPending}>
              {isPending
                ? (ar ? "جاري الحفظ..." : "Saving...")
                : (ar ? "حفظ" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
