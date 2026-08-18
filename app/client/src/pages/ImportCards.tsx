import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Settings2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Clock,
  X,
  Download,
  Sparkles,
  FileSpreadsheet,
  FileType,
  Columns,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

// ─── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, icon: Upload,       labelAr: "رفع الملف" },
  { id: 2, icon: Columns,      labelAr: "تحديد الأعمدة" },
  { id: 3, icon: Settings2,    labelAr: "الإعدادات" },
  { id: 4, icon: CheckCircle2, labelAr: "مراجعة وتأكيد" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fileTypeIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "txt") return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
  if (ext === "xlsx" || ext === "xls") return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
  if (ext === "docx" || ext === "doc") return <FileText className="h-5 w-5 text-blue-500" />;
  if (ext === "pdf") return <FileType className="h-5 w-5 text-red-500" />;
  return <FileText className="h-5 w-5 text-muted-foreground" />;
}

function fileTypeBadge(fileType: string) {
  if (fileType === "csv") return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">CSV</Badge>;
  if (fileType === "docx") return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">Word</Badge>;
  if (fileType === "pdf") return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">PDF</Badge>;
  if (fileType === "xlsx") return <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">Excel</Badge>;
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImportCards() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── File state ──
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // ── Column mapping state ──
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [columnCount, setColumnCount] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [fileType, setFileType] = useState("");
  const [usernameCol, setUsernameCol] = useState<number>(0);
  const [passwordCol, setPasswordCol] = useState<number>(1);
  const [skipHeader, setSkipHeader] = useState(true);

  // ── Import settings ──
  const isAdmin = user?.role === "owner" || user?.role === "super_admin";
  const isReseller = user?.role === "reseller";
  const [planId, setPlanId] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("none");
  const [batchName, setBatchName] = useState("");
  const [subscriberGroup, setSubscriberGroup] = useState("Default group");
  const [usageBudgetHours, setUsageBudgetHours] = useState("1");
  const [usageBudgetMinutes, setUsageBudgetMinutes] = useState("0");
  const [timeFromActivation, setTimeFromActivation] = useState(true);
  const [authType, setAuthType] = useState<"password" | "username-only">("password");
  const [windowHours, setWindowHours] = useState("0");
  const [windowMinutes, setWindowMinutes] = useState("0");
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    skippedReasons: Record<string, string>;
    batchId: string;
    planName: string;
  } | null>(null);

  // ── Queries ──
  const { data: plans } = trpc.plans.list.useQuery();
  const { data: _usersDataRaw } = trpc.users.list.useQuery(undefined, { enabled: isAdmin || isReseller });
  const usersData: any[] | undefined = (_usersDataRaw as any)?.users ?? (_usersDataRaw as any);
  const clients = usersData?.filter((u: any) => u.role === "client") ?? [];

  // ── Mutations ──
  const parseFileMutation = trpc.vouchers.parseImportFile.useMutation({
    onSuccess: (result) => {
      setPreviewRows(result.rows);
      setColumnCount(result.columnCount);
      setTotalRows(result.totalRows);
      setFileType(result.fileType);
      if (result.suggestedMapping) {
        setUsernameCol(result.suggestedMapping.usernameCol);
        setPasswordCol(result.suggestedMapping.passwordCol);
        setSkipHeader(result.suggestedMapping.hasHeader);
      } else if (result.columnCount >= 3) {
        setUsernameCol(1);
        setPasswordCol(2);
      } else if (result.columnCount === 2) {
        setUsernameCol(0);
        setPasswordCol(1);
      }
      setStep(2);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const importMutation = trpc.vouchers.importFromFile.useMutation({
    onSuccess: (result) => {
      setImportResult({
        imported: result.imported,
        skipped: result.skipped,
        skippedReasons: result.skippedReasons ?? {},
        batchId: result.batchId,
        planName: result.planName,
      });
      toast.success(`تم استيراد ${result.imported} كرت بنجاح`);
      setStep(5);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // ── File handling ──
  const processFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const allowed = ["csv", "txt", "docx", "doc", "pdf", "xlsx", "xls"];
    if (!allowed.includes(ext)) {
      toast.error("نوع الملف غير مدعوم. المدعوم: CSV, Excel (.xlsx), Word (.docx), PDF");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الملف كبير جداً - الحد الأقصى 5MB");
      return;
    }
    setFileName(file.name);
    setMimeType(file.type || "application/octet-stream");
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      setFileBase64(btoa(binary));
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ── Step navigation ──
  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1 && !fileBase64) errs.file = "يرجى رفع ملف أولاً";
    if (s === 2 && usernameCol === passwordCol) errs.cols = "عمود اليوزر وكلمة المرور يجب أن يكونا مختلفين";
    if (s === 3 && !planId) errs.planId = "يرجى اختيار الخدمة";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    if (step === 1) {
      parseFileMutation.mutate({ fileBase64, mimeType, fileName });
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
  };
  const back = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = () => {
    if (!validateStep(step)) return;
    const usageBudgetSeconds = (parseInt(usageBudgetHours) || 0) * 3600 + (parseInt(usageBudgetMinutes) || 0) * 60;
    importMutation.mutate({
      fileBase64,
      mimeType,
      fileName,
      usernameCol,
      passwordCol,
      skipHeader,
      planId: parseInt(planId),
      assignedToUserId: assignedToUserId !== "none" ? parseInt(assignedToUserId) : undefined,
      batchName: batchName || undefined,
      subscriberGroup,
      usageBudgetSeconds,
      windowSeconds: (parseInt(windowHours) || 0) * 3600 + (parseInt(windowMinutes) || 0) * 60,
      timeFromActivation,
      authType,
    });
  };

  const resetWizard = () => {
    setStep(1); setFileName(""); setFileBase64(""); setMimeType("");
    setPreviewRows([]); setColumnCount(0); setTotalRows(0); setFileType("");
    setUsernameCol(0); setPasswordCol(1); setSkipHeader(true);
    setPlanId(""); setAssignedToUserId("none"); setBatchName("");
    setWindowHours("0"); setWindowMinutes("0");
    setImportResult(null); setErrors({});
  };

  const selectedPlan = plans?.find((p: any) => String(p.id) === planId);
  const selectedClient = clients.find((c: any) => String(c.id) === assignedToUserId);
  const cardCount = skipHeader ? Math.max(0, totalRows - 1) : totalRows;

  // ── Success screen ──
  if (step === 5 && importResult) {
    const skippedEntries = Object.entries(importResult.skippedReasons ?? {});
    return (
      <div className="max-w-lg mx-auto mt-10 p-6 rounded-2xl border bg-card space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold">تم الاستيراد بنجاح!</h2>
          <p className="text-muted-foreground text-sm">
            تم إضافة <span className="font-bold text-foreground">{importResult.imported.toLocaleString()}</span> كرت إلى قاعدة البيانات وFreeRADIUS
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-muted/20 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">مُستورد</p>
            <p className="text-2xl font-bold text-green-600">{importResult.imported.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">مُتخطى</p>
            <p className="text-2xl font-bold text-amber-500">{importResult.skipped.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">الخدمة</p>
            <p className="text-sm font-semibold truncate">{importResult.planName}</p>
          </div>
        </div>
        {skippedEntries.length > 0 && (
          <div className="rounded-xl border bg-amber-50 p-4 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-amber-700 mb-2">الكروت المُتخطاة:</p>
            {skippedEntries.slice(0, 20).map(([username, reason]) => (
              <div key={username} className="flex justify-between text-xs text-amber-700 py-0.5">
                <span className="font-mono">{username}</span>
                <span className="text-muted-foreground">{reason}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={resetWizard}>
            <Upload className="h-4 w-4 ml-1" />استيراد ملف آخر
          </Button>
          <Link href="/vouchers" className="flex-1">
            <Button className="w-full">
              <Download className="h-4 w-4 ml-1" />عرض الكروت
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-6 mb-10">
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b bg-muted/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold">استيراد كروت من ملف</h1>
            </div>
            <Link href="/vouchers">
              <Button variant="ghost" size="icon" className="h-8 w-8"><X className="h-4 w-4" /></Button>
            </Link>
          </div>
          {/* Step Indicator */}
          <div className="flex items-center gap-1">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isDone = step > s.id;
              return (
                <div key={s.id} className="flex items-center gap-1">
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                    isActive ? "bg-primary text-primary-foreground" :
                    isDone ? "bg-green-100 text-green-700" :
                    "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{s.labelAr}</span>
                    <span className="sm:hidden">{s.id}</span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={cn("h-px w-3 shrink-0", step > s.id ? "bg-green-400" : "bg-border")} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Step 1: Upload File ── */}
        {step === 1 && (
          <div className="p-6 space-y-5">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 gap-1">
                <FileSpreadsheet className="h-3 w-3" /> CSV
              </Badge>
              <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 gap-1">
                <FileSpreadsheet className="h-3 w-3" /> Excel (.xlsx)
              </Badge>
              <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 gap-1">
                <FileText className="h-3 w-3" /> Word (.docx)
              </Badge>
              <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 gap-1">
                <FileType className="h-3 w-3" /> PDF
              </Badge>
            </div>

            <div
              className={cn(
                "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
                fileName ? "border-green-400 bg-green-50/30" : ""
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls,.docx,.doc,.pdf" className="hidden" onChange={handleFileChange} />
              {fileName ? (
                <div className="flex flex-col items-center gap-2">
                  {fileTypeIcon(fileName)}
                  <p className="font-semibold text-sm">{fileName}</p>
                  <p className="text-xs text-muted-foreground">انقر لتغيير الملف</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">اسحب الملف هنا أو انقر للاختيار</p>
                    <p className="text-xs text-muted-foreground mt-1">CSV, Excel, Word (.docx), PDF — حد أقصى 5MB</p>
                  </div>
                </div>
              )}
            </div>
            {errors.file && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.file}</p>}

            <div className="rounded-xl bg-muted/30 border p-4 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">تنسيق الملف المدعوم:</p>
              <p className="text-xs text-muted-foreground">• <strong>CSV:</strong> أي عدد من الأعمدة مفصولة بفاصلة أو فاصلة منقوطة</p>
              <p className="text-xs text-muted-foreground">• <strong>Excel:</strong> ملف XLSX أو XLS، ويُكتشف عنوانا اسم المستخدم وكلمة المرور تلقائياً إن وُجدا</p>
              <p className="text-xs text-muted-foreground">• <strong>Word:</strong> جدول يحتوي على أعمدة اليوزر وكلمة المرور</p>
              <p className="text-xs text-muted-foreground">• <strong>PDF:</strong> نص أو جدول يحتوي على البيانات</p>
              <p className="text-xs text-muted-foreground">• ستختار أي عمود = اليوزر وأي عمود = كلمة المرور في الخطوة التالية</p>
            </div>
          </div>
        )}

        {/* ── Step 2: Column Mapping ── */}
        {step === 2 && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Columns className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">تحديد أعمدة اليوزر وكلمة المرور</h2>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl border bg-muted/20">
              {fileTypeIcon(fileName)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">{totalRows.toLocaleString()} صف — {columnCount} عمود</p>
              </div>
              {fileTypeBadge(fileType)}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-primary" />عمود اسم المستخدم
                </Label>
                <Select value={String(usernameCol)} onValueChange={(v) => setUsernameCol(parseInt(v))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: columnCount }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        عمود {i + 1}{previewRows[skipHeader ? 1 : 0]?.[i] ? ` — "${previewRows[skipHeader ? 1 : 0][i]}"` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <EyeOff className="h-3.5 w-3.5 text-primary" />عمود كلمة المرور
                </Label>
                <Select value={String(passwordCol)} onValueChange={(v) => setPasswordCol(parseInt(v))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: columnCount }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        عمود {i + 1}{previewRows[skipHeader ? 1 : 0]?.[i] ? ` — "${previewRows[skipHeader ? 1 : 0][i]}"` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {errors.cols && <p className="text-xs text-destructive">{errors.cols}</p>}

            <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
              <div>
                <p className="text-sm font-medium">تخطي الصف الأول (رأس الجدول)</p>
                <p className="text-xs text-muted-foreground">فعّل إذا كان الصف الأول يحتوي على عناوين الأعمدة</p>
              </div>
              <Switch checked={skipHeader} onCheckedChange={setSkipHeader} />
            </div>

            {previewRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">معاينة أول {previewRows.length} صفوف:</p>
                <div className="rounded-xl border overflow-auto max-h-52">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Array.from({ length: columnCount }, (_, i) => (
                          <TableHead key={i} className={cn(
                            "text-xs py-2 px-3",
                            i === usernameCol ? "bg-primary/10 text-primary font-bold" :
                            i === passwordCol ? "bg-blue-50 text-blue-700 font-bold" : ""
                          )}>
                            {i === usernameCol ? "👤 Username" : i === passwordCol ? "🔑 Password" : `عمود ${i + 1}`}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, ri) => (
                        <TableRow key={ri} className={ri === 0 && skipHeader ? "opacity-40 line-through" : ""}>
                          {Array.from({ length: columnCount }, (_, ci) => (
                            <TableCell key={ci} className={cn(
                              "text-xs py-1.5 px-3 font-mono",
                              ci === usernameCol ? "bg-primary/5 font-semibold" :
                              ci === passwordCol ? "bg-blue-50/50" : ""
                            )}>
                              {row[ci] ?? "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">{cardCount.toLocaleString()} كرت سيتم استيراده</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Import Settings ── */}
        {step === 3 && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Settings2 className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">إعدادات الاستيراد</h2>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">الخدمة / الباقة <span className="text-destructive">*</span></Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر الخدمة..." /></SelectTrigger>
                <SelectContent>
                  {plans?.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.nameAr || p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.planId && <p className="text-xs text-destructive">{errors.planId}</p>}
            </div>

            {(isAdmin || isReseller) && clients.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">تعيين لعميل (اختياري)</Label>
                <Select value={assignedToUserId} onValueChange={setAssignedToUserId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="النظام (بدون تعيين)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">النظام (بدون تعيين)</SelectItem>
                    {clients.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name || c.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">اسم الدفعة (اختياري)</Label>
              <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="مثال: دفعة يناير 2026" className="h-9" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">نوع المصادقة</Label>
              <Select value={authType} onValueChange={(v: any) => setAuthType(v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="password">يوزر + كلمة مرور</SelectItem>
                  <SelectItem value="username-only">يوزر فقط (بدون كلمة مرور)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
              <div>
                <p className="text-sm font-medium">الوقت يبدأ من أول تسجيل دخول</p>
                <p className="text-xs text-muted-foreground">إذا أُوقف، يبدأ من تاريخ الاستيراد</p>
              </div>
              <Switch checked={timeFromActivation} onCheckedChange={setTimeFromActivation} />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />وقت الاستخدام المتاح
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input type="number" min="0" value={usageBudgetHours} onChange={(e) => setUsageBudgetHours(e.target.value)} className="h-9 text-center" />
                  <p className="text-xs text-center text-muted-foreground mt-1">ساعة</p>
                </div>
                <div>
                  <Input type="number" min="0" max="59" value={usageBudgetMinutes} onChange={(e) => setUsageBudgetMinutes(e.target.value)} className="h-9 text-center" />
                  <p className="text-xs text-center text-muted-foreground mt-1">دقيقة</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-500" />صلاحية الكرت (Window Time)
              </Label>
              <p className="text-xs text-muted-foreground">المدة التي يبقى فيها الكرت صالحاً للاستخدام بعد أول تسجيل دخول. اتركها 0 لعدم التحديد.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input type="number" min="0" value={windowHours} onChange={(e) => setWindowHours(e.target.value)} className="h-9 text-center" />
                  <p className="text-xs text-center text-muted-foreground mt-1">ساعة</p>
                </div>
                <div>
                  <Input type="number" min="0" max="59" value={windowMinutes} onChange={(e) => setWindowMinutes(e.target.value)} className="h-9 text-center" />
                  <p className="text-xs text-center text-muted-foreground mt-1">دقيقة</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Review & Confirm ── */}
        {step === 4 && (
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">مراجعة وتأكيد الاستيراد</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "عدد الكروت", value: cardCount.toLocaleString(), big: true },
                { label: "نوع الملف", value: fileType.toUpperCase() },
                { label: "الخدمة", value: selectedPlan?.nameAr || selectedPlan?.name || "—" },
                { label: "تعيين لـ", value: selectedClient ? (selectedClient.name || selectedClient.username) : "النظام" },
                { label: "عمود اليوزر", value: `عمود ${usernameCol + 1}` },
                { label: "عمود كلمة المرور", value: `عمود ${passwordCol + 1}` },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border bg-muted/20 p-4 space-y-1">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={cn("font-semibold truncate", item.big ? "text-2xl text-primary" : "text-sm")}>{item.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-amber-500/10 border border-amber-200 p-4 flex gap-3">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700">
                <p className="font-semibold mb-1">تنبيه قبل الاستيراد</p>
                <ul className="space-y-1 text-xs list-disc list-inside">
                  <li>اليوزرات المكررة الموجودة مسبقاً ستُتخطى تلقائياً</li>
                  <li>لا يمكن التراجع عن الاستيراد بعد التأكيد</li>
                  <li>ستُضاف الكروت مباشرة إلى قاعدة بيانات FreeRADIUS</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between bg-muted/10">
          <Button variant="ghost" size="sm" onClick={back} disabled={step === 1 || parseFileMutation.isPending || importMutation.isPending} className="gap-1.5">
            <ChevronLeft className="h-4 w-4" />السابق
          </Button>
          {step < 4 ? (
            <Button size="sm" onClick={next} disabled={parseFileMutation.isPending} className="gap-1.5">
              {parseFileMutation.isPending ? (
                <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />جاري تحليل الملف...</>
              ) : (
                <>التالي<ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} disabled={importMutation.isPending} className="gap-1.5 min-w-[130px]">
              {importMutation.isPending ? (
                <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />جاري الاستيراد...</>
              ) : (
                <><Upload className="h-4 w-4" />تأكيد الاستيراد</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
