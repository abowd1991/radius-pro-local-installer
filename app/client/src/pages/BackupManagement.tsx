import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime as _fmtDTLib } from '@/lib/dateFormat';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Download,
  Upload,
  Trash2,
  Database,
  AlertCircle,
  CheckCircle2,
  Clock,
  Mail,
  Save,
  RefreshCw,
  ShieldCheck,
  HardDrive,
  FileArchive,
} from "lucide-react";
import { toast } from "sonner";

export default function BackupManagement() {
  const isRtl = true; // Arabic RTL

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [sendEmailConfirm, setSendEmailConfirm] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string } | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [emailInput, setEmailInput] = useState<string>("");

  // ── Queries ──────────────────────────────────────────────
  const backupsQuery = trpc.backup.list.useQuery(undefined, {
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  const emailQuery = trpc.backup.getEmail.useQuery();

  // Sync email input when data loads (safe: useEffect)
  useEffect(() => {
    if (emailQuery.data?.email && !emailInput) {
      setEmailInput(emailQuery.data.email);
    }
  }, [emailQuery.data?.email]);

  const utils = trpc.useUtils();

  // ── Mutations ─────────────────────────────────────────────
  const createMutation = trpc.backup.create.useMutation({
    onSuccess: (data) => {
      toast.success(
        isRtl
          ? `✅ تم إنشاء النسخة الاحتياطية — ${formatSize(data.size)}`
          : `✅ Backup created — ${formatSize(data.size)}`,
        { duration: 5000 }
      );
      backupsQuery.refetch();
    },
    onError: (err) => {
      toast.error(
        isRtl ? `❌ فشل الإنشاء: ${err.message}` : `❌ Failed: ${err.message}`,
        { duration: 8000 }
      );
    },
  });

  const sendEmailMutation = trpc.backup.sendEmail.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.message ||
          (isRtl
            ? `📤 جاري الإرسال إلى ${data.sentTo} — ستصل خلال دقائق`
            : `📤 Sending to ${data.sentTo} — will arrive in minutes`),
        { duration: 8000 }
      );
      backupsQuery.refetch();
    },
    onError: (err) => {
      toast.error(
        isRtl ? `❌ فشل الإرسال: ${err.message}` : `❌ Send failed: ${err.message}`,
        { duration: 8000 }
      );
    },
  });

  const setEmailMutation = trpc.backup.setEmail.useMutation({
    onSuccess: (data) => {
      toast.success(
        isRtl ? `✅ تم حفظ الإيميل: ${data.email}` : `✅ Email saved: ${data.email}`,
        { duration: 4000 }
      );
      emailQuery.refetch();
    },
    onError: (err) => {
      toast.error(
        isRtl ? `❌ فشل الحفظ: ${err.message}` : `❌ Save failed: ${err.message}`,
        { duration: 6000 }
      );
    },
  });

  const deleteMutation = trpc.backup.delete.useMutation({
    onSuccess: () => {
      toast.success(isRtl ? "✅ تم حذف النسخة الاحتياطية" : "✅ Backup deleted");
      setDeleteTarget(null);
      backupsQuery.refetch();
    },
    onError: (err) => {
      toast.error(
        isRtl ? `❌ فشل الحذف: ${err.message}` : `❌ Delete failed: ${err.message}`,
        { duration: 6000 }
      );
    },
  });

  const restoreMutation = trpc.backup.restore.useMutation({
    onSuccess: () => {
      toast.success(
        isRtl ? "✅ تم استعادة قاعدة البيانات بنجاح" : "✅ Database restored successfully",
        { duration: 6000 }
      );
      setRestoreConfirm(false);
      setUploadedFile(null);
      backupsQuery.refetch();
    },
    onError: (err) => {
      toast.error(
        isRtl ? `❌ فشلت الاستعادة: ${err.message}` : `❌ Restore failed: ${err.message}`,
        { duration: 8000 }
      );
    },
  });

  // ── Handlers ──────────────────────────────────────────────
  const handleDownload = async (filename: string) => {
    const toastId = toast.loading(isRtl ? "جاري التحميل..." : "Downloading...");
    try {
      const data = await utils.client.backup.download.query({ filename });
      const blob = new Blob([data.content], { type: "application/sql" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(isRtl ? `✅ تم تحميل: ${data.filename}` : `✅ Downloaded: ${data.filename}`, {
        id: toastId,
      });
    } catch (err: any) {
      toast.error(
        isRtl ? `❌ فشل التحميل: ${err.message}` : `❌ Download failed: ${err.message}`,
        { id: toastId, duration: 6000 }
      );
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".sql")) {
      toast.error(isRtl ? "❌ يجب أن يكون الملف بصيغة .sql" : "❌ File must be .sql format");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setUploadedFile({ name: file.name, content });
      toast.info(isRtl ? `📂 تم رفع: ${file.name}` : `📂 Loaded: ${file.name}`);
    };
    reader.readAsText(file);
  };

  const handleSaveEmail = () => {
    const val = emailInput.trim();
    if (!val || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
      toast.error(isRtl ? "يرجى إدخال بريد إلكتروني صالح" : "Please enter a valid email");
      return;
    }
    setEmailMutation.mutate({ email: val });
  };

  // ── Helpers ───────────────────────────────────────────────
  const formatDate = (d: Date | string) => _fmtDTLib(d);

  const formatSize = (bytes: number) => {
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const backups = backupsQuery.data ?? [];
  const currentEmail = emailQuery.data?.email || "";

  return (
    <div className={`container mx-auto py-6 space-y-6 ${isRtl ? "rtl" : "ltr"}`} dir={isRtl ? "rtl" : "ltr"}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">
              {isRtl ? "إدارة النسخ الاحتياطية" : "Backup Management"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isRtl
                ? "إنشاء نسخ احتياطية من قاعدة البيانات وإرسالها وتحميلها"
                : "Create, email, and download database backups"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => backupsQuery.refetch()}
          disabled={backupsQuery.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${backupsQuery.isFetching ? "animate-spin" : ""}`} />
          {isRtl ? "تحديث" : "Refresh"}
        </Button>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <FileArchive className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isRtl ? "إجمالي النسخ" : "Total Backups"}</p>
                <p className="text-2xl font-bold">{backupsQuery.isLoading ? "..." : backups.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isRtl ? "الحجم الكلي" : "Total Size"}</p>
                <p className="text-2xl font-bold text-blue-600">
                  {backupsQuery.isLoading
                    ? "..."
                    : formatSize(backups.reduce((s, b) => s + (b.size || 0), 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isRtl ? "آخر نسخة" : "Latest Backup"}</p>
                <p className="text-sm font-semibold text-green-600">
                  {backupsQuery.isLoading
                    ? "..."
                    : backups.length > 0
                    ? formatDate(backups[0].createdAt)
                    : (isRtl ? "لا توجد" : "None")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Email Settings ── */}
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-5 w-5 text-blue-600" />
            {isRtl ? "إعدادات إيميل النسخ الاحتياطي" : "Backup Email Settings"}
          </CardTitle>
          <CardDescription>
            {isRtl
              ? "الإيميل الذي تُرسل إليه النسخ الاحتياطية عند الطلب"
              : "Email address where backups are sent on demand"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 max-w-lg">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="backup-email">{isRtl ? "البريد الإلكتروني" : "Email Address"}</Label>
              <Input
                id="backup-email"
                type="email"
                placeholder="admin@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                dir="ltr"
                onKeyDown={(e) => e.key === "Enter" && handleSaveEmail()}
              />
            </div>
            <Button
              onClick={handleSaveEmail}
              disabled={setEmailMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {setEmailMutation.isPending
                ? (isRtl ? "جاري الحفظ..." : "Saving...")
                : (isRtl ? "حفظ" : "Save")}
            </Button>
          </div>
          {currentEmail && (
            <p className="text-sm text-muted-foreground mt-2">
              {isRtl ? "الإيميل الحالي: " : "Current email: "}
              <span className="font-medium text-foreground" dir="ltr">{currentEmail}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Actions ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-5 w-5" />
            {isRtl ? "إجراءات النسخ الاحتياطي" : "Backup Actions"}
          </CardTitle>
          <CardDescription>
            {isRtl
              ? "إنشاء نسخة احتياطية جديدة أو إرسالها أو استعادة نسخة سابقة"
              : "Create a new backup, send it by email, or restore from file"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {/* Create */}
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              size="lg"
            >
              <Database className={`h-4 w-4 mr-2 ${createMutation.isPending ? "animate-pulse" : ""}`} />
              {createMutation.isPending
                ? (isRtl ? "جاري الإنشاء..." : "Creating...")
                : (isRtl ? "إنشاء نسخة احتياطية" : "Create Backup")}
            </Button>

            {/* Send Email */}
            <Button
              onClick={() => setSendEmailConfirm(true)}
              disabled={sendEmailMutation.isPending}
              variant="outline"
              size="lg"
              className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            >
              <Mail className={`h-4 w-4 mr-2 ${sendEmailMutation.isPending ? "animate-pulse" : ""}`} />
              {sendEmailMutation.isPending
                ? (isRtl ? "جاري الإرسال..." : "Sending...")
                : (isRtl ? "إرسال نسخة بالإيميل" : "Send Backup by Email")}
            </Button>

            {/* Upload & Restore */}
            <div>
              <input
                type="file"
                accept=".sql"
                onChange={handleFileUpload}
                className="hidden"
                id="backup-upload"
              />
              <Button
                onClick={() => document.getElementById("backup-upload")?.click()}
                variant="outline"
                size="lg"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isRtl ? "رفع واستعادة نسخة" : "Upload & Restore"}
              </Button>
            </div>
          </div>

          {/* Uploaded file preview */}
          {uploadedFile && (
            <div className="p-4 bg-muted rounded-lg border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium font-mono text-sm">{uploadedFile.name}</span>
                <Badge variant="outline" className="text-green-600 border-green-600">
                  {isRtl ? "جاهز للاستعادة" : "Ready to restore"}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setRestoreConfirm(true)}
                  disabled={restoreMutation.isPending}
                  size="sm"
                  variant="destructive"
                >
                  {restoreMutation.isPending
                    ? (isRtl ? "جاري الاستعادة..." : "Restoring...")
                    : (isRtl ? "تأكيد الاستعادة" : "Confirm Restore")}
                </Button>
                <Button
                  onClick={() => setUploadedFile(null)}
                  variant="ghost"
                  size="sm"
                >
                  {isRtl ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Backups List ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{isRtl ? "النسخ الاحتياطية المتاحة" : "Available Backups"}</span>
            <Badge variant="secondary">{backups.length}</Badge>
          </CardTitle>
          <CardDescription>
            {isRtl
              ? "يتم الاحتفاظ بآخر 10 نسخ احتياطية تلقائياً"
              : "Last 10 backups are kept automatically"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backupsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">
                {isRtl ? "لا توجد نسخ احتياطية" : "No backups yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isRtl ? "ابدأ بإنشاء نسخة احتياطية جديدة" : "Create your first backup above"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((backup, idx) => (
                <div
                  key={backup.filename}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Database className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-medium">{backup.filename}</p>
                        {idx === 0 && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
                            {isRtl ? "الأحدث" : "Latest"}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(backup.createdAt)}</span>
                        <span>•</span>
                        <HardDrive className="h-3 w-3" />
                        <span>{formatSize(backup.size)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleDownload(backup.filename)}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      {isRtl ? "تحميل" : "Download"}
                    </Button>
                    <Button
                      onClick={() => setDeleteTarget(backup.filename)}
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {isRtl ? "حذف" : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Send Email Confirm Dialog ── */}
      <AlertDialog open={sendEmailConfirm} onOpenChange={setSendEmailConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRtl ? "إرسال نسخة احتياطية بالإيميل" : "Send Backup by Email"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isRtl
                ? `سيتم إنشاء نسخة احتياطية كاملة من قاعدة البيانات وإرسالها إلى:\n${currentEmail || emailInput}\n\nقد تستغرق العملية بضع دقائق.`
                : `A full database backup will be created and sent to:\n${currentEmail || emailInput}\n\nThis may take a few minutes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isRtl ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSendEmailConfirm(false);
                sendEmailMutation.mutate();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Mail className="h-4 w-4 mr-2" />
              {isRtl ? "إرسال الآن" : "Send Now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Restore Confirm Dialog ── */}
      <AlertDialog open={restoreConfirm} onOpenChange={setRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              {isRtl ? "⚠️ تأكيد استعادة قاعدة البيانات" : "⚠️ Confirm Database Restore"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isRtl
                ? `سيتم استبدال قاعدة البيانات الحالية بالملف:\n${uploadedFile?.name}\n\nهذا الإجراء لا يمكن التراجع عنه!`
                : `The current database will be replaced with:\n${uploadedFile?.name}\n\nThis action cannot be undone!`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isRtl ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRestoreConfirm(false);
                if (uploadedFile) {
                  restoreMutation.mutate({
                    filename: uploadedFile.name,
                    content: uploadedFile.content,
                  });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRtl ? "استعادة الآن" : "Restore Now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Confirm Dialog ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isRtl ? "تأكيد الحذف" : "Confirm Delete"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isRtl
                ? `هل أنت متأكد من حذف النسخة الاحتياطية؟\n${deleteTarget}\n\nلا يمكن التراجع عن هذا الإجراء.`
                : `Are you sure you want to delete this backup?\n${deleteTarget}\n\nThis cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isRtl ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate({ filename: deleteTarget })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRtl ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
