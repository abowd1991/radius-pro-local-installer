import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatDate as _fmtDateLib, formatDateTime as _fmtDTLib } from '@/lib/dateFormat';
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { formatDate, formatDateTime, shiftLocalDate, todayLocalDate } from "@/lib/timezoneV6";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

function safeFormatDate(v: unknown, timezone: string, options: Intl.DateTimeFormatOptions): string {
  if (v === null || v === undefined || v === '') return '';
  const hasTime = options.hour !== undefined;
  return hasTime ? formatDateTime(v as string, timezone) : formatDate(v as string, timezone);
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  icon: Icon,
  color,
  sub,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── AddCreditDialog ──────────────────────────────────────────────────────────
interface AddCreditDialogProps {
  client: { id: number; name: string; username: string; email: string; balance: number } | null;
  onClose: () => void;
  onSuccess: () => void;
}

function AddCreditDialog({ client, onClose, onSuccess }: AddCreditDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const addCreditMutation = trpc.wallet.addCredit.useMutation({
    onSuccess: () => {
      toast.success(`تم إضافة ${fmt(parseFloat(amount))} لـ ${client?.name || client?.username} بنجاح`);
      utils.billing.getAllClientsBalance.invalidate();
      utils.billing.getWalletStats.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => {
      toast.error(`فشل إضافة الرصيد: ${e.message}`);
    },
  });

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("أدخل مبلغاً صحيحاً أكبر من صفر");
      return;
    }
    if (!reason.trim()) {
      toast.error("أدخل سبب الإضافة");
      return;
    }
    if (!client) return;
    addCreditMutation.mutate({
      userId: client.id,
      amount: parsedAmount,
      reason: reason.trim(),
      reasonAr: reason.trim(),
      entityType: "manual",
    });
  };

  if (!client) return null;

  return (
    <Dialog open={!!client} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-green-600" />
            إضافة رصيد
          </DialogTitle>
        </DialogHeader>

        {/* Client Info */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">العميل</span>
            <span className="font-medium">{client.name || client.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">البريد</span>
            <span className="text-muted-foreground">{client.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">الرصيد الحالي</span>
            <span className={`font-bold ${client.balance <= 2 ? "text-red-600" : client.balance <= 5 ? "text-orange-600" : "text-green-600"}`}>
              {fmt(client.balance)}
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>المبلغ ($)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="مثال: 10.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            {amount && parseFloat(amount) > 0 && (
              <p className="text-xs text-muted-foreground">
                الرصيد بعد الإضافة:{" "}
                <span className="font-semibold text-green-600">
                  {fmt(client.balance + parseFloat(amount))}
                </span>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>سبب الإضافة</Label>
            <Input
              placeholder="مثال: شحن رصيد، دفعة شهرية..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={addCreditMutation.isPending}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            {addCreditMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                جاري الإضافة...
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                إضافة الرصيد
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OwnerBillingDashboard() {
  const { timezone } = useTimezoneV6();
  // Date range — default: last 30 days
  const [fromDate, setFromDate] = useState(() => shiftLocalDate(-30, timezone));
  const [toDate, setToDate] = useState(() => todayLocalDate(timezone));
  const [appliedFrom, setAppliedFrom] = useState(fromDate);
  const [appliedTo, setAppliedTo] = useState(toDate);

  // Client search
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  // Add credit dialog
  const [selectedClient, setSelectedClient] = useState<{
    id: number; name: string; username: string; email: string; balance: number;
  } | null>(null);

  // Queries
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } =
    trpc.billing.getWalletStats.useQuery({ from: appliedFrom, to: appliedTo });

  const { data: clients, isLoading: clientsLoading, refetch: refetchClients } =
    trpc.billing.getAllClientsBalance.useQuery({ search: appliedSearch });

  const { data: billingRunLogs, isLoading: logsLoading, refetch: refetchLogs } =
    trpc.billing.getBillingRunLogs.useQuery();

  const applyDateFilter = () => {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  };

  const applySearch = () => setAppliedSearch(search);

  // Summary stats
  const totalDeposits = stats?.totalDeposits ?? 0;
  const totalDeductions = stats?.totalDeductions ?? 0;
  const netFlow = stats?.netFlow ?? 0;
  const totalBalance = stats?.totalBalance ?? 0;

  // Client counts
  const lowCount = useMemo(() => clients?.filter((c) => c.balance <= 5).length ?? 0, [clients]);

  return (
    <div className="container py-8 space-y-8">
      {/* ── Add Credit Dialog ── */}
      <AddCreditDialog
        client={selectedClient}
        onClose={() => setSelectedClient(null)}
        onSuccess={() => { refetchStats(); refetchClients(); }}
      />

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">لوحة الفوترة المالية</h1>
          <p className="text-muted-foreground mt-1">إحصائيات الإيداعات والخصومات وأرصدة العملاء</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => { refetchStats(); refetchClients(); refetchLogs(); }}
        >
          <RefreshCw className="h-4 w-4" />
          تحديث
        </Button>
      </div>

      {/* ── Date Filter ── */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">من تاريخ</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">إلى تاريخ</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button onClick={applyDateFilter} className="gap-2">
              <Search className="h-4 w-4" />
              تطبيق الفلتر
            </Button>
            <span className="text-xs text-muted-foreground self-end pb-1">
              الفترة: {appliedFrom} → {appliedTo}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Stats Cards ── */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="إجمالي الإيداعات"
            value={fmt(totalDeposits)}
            icon={ArrowUpCircle}
            color="text-green-600"
            sub="في الفترة المحددة"
          />
          <StatCard
            title="إجمالي الخصومات"
            value={fmt(totalDeductions)}
            icon={ArrowDownCircle}
            color="text-red-600"
            sub="في الفترة المحددة"
          />
          <StatCard
            title="صافي التدفق"
            value={fmt(netFlow)}
            icon={netFlow >= 0 ? TrendingUp : TrendingDown}
            color={netFlow >= 0 ? "text-blue-600" : "text-orange-600"}
            sub="إيداعات − خصومات"
          />
          <StatCard
            title="إجمالي أرصدة العملاء"
            value={fmt(totalBalance)}
            icon={Wallet}
            color="text-purple-600"
            sub="الرصيد الحالي الكلي"
          />
        </div>
      )}

      {/* ── Chart ── */}
      <Card>
        <CardHeader>
          <CardTitle>حركة الأموال اليومية</CardTitle>
          <CardDescription>
            الإيداعات والخصومات يوماً بيوم خلال الفترة المحددة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : stats && stats.chart.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.chart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) =>
                    safeFormatDate(v, timezone, { month: 'short', day: 'numeric' })
                  }
                  tick={{ fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  labelFormatter={(v) =>
                    safeFormatDate(v, timezone, { year: 'numeric', month: 'long', day: 'numeric' })
                  }
                  formatter={(value: any, name: any) => [
                    fmt(Number(value ?? 0)),
                    name === "deposits" ? "إيداعات" : "خصومات",
                  ]}
                />
                <Legend formatter={(v) => (v === "deposits" ? "إيداعات" : "خصومات")} />
                <Bar dataKey="deposits" fill="#22c55e" radius={[4, 4, 0, 0]} name="deposits" />
                <Bar dataKey="deductions" fill="#ef4444" radius={[4, 4, 0, 0]} name="deductions" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <DollarSign className="h-10 w-10 opacity-30" />
              <p>لا توجد معاملات في هذه الفترة</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Clients Table ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                أرصدة العملاء
              </CardTitle>
              <CardDescription>
                {clients
                  ? `${clients.length} عميل — ${lowCount} بأرصدة منخفضة (≤ $5)`
                  : "جاري التحميل..."}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="بحث بالاسم أو الإيميل..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                className="w-56"
              />
              <Button variant="outline" size="sm" onClick={applySearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {clientsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : clients && clients.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-right py-3 px-4 font-medium">العميل</th>
                    <th className="text-right py-3 px-4 font-medium">البريد الإلكتروني</th>
                    <th className="text-right py-3 px-4 font-medium">الرصيد الحالي</th>
                    <th className="text-right py-3 px-4 font-medium">حالة الفوترة</th>
                    <th className="text-right py-3 px-4 font-medium">الحساب</th>
                    <th className="text-center py-3 px-4 font-medium">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr
                      key={client.id}
                      className={`border-b transition-colors hover:bg-muted/30 ${
                        client.balance <= 2
                          ? "bg-red-50/40 dark:bg-red-950/20"
                          : client.balance <= 5
                          ? "bg-orange-50/40 dark:bg-orange-950/20"
                          : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-medium">
                        {client.name || client.username || "—"}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{client.email}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-bold ${
                            client.balance <= 2
                              ? "text-red-600"
                              : client.balance <= 5
                              ? "text-orange-600"
                              : "text-green-600"
                          }`}
                        >
                          {fmt(client.balance)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            client.billingStatus === "active"
                              ? "default"
                              : client.billingStatus === "past_due"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {client.billingStatus === "active"
                            ? "نشط"
                            : client.billingStatus === "past_due"
                            ? "متأخر"
                            : "معلق"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={client.status === "active" ? "outline" : "secondary"}
                        >
                          {client.status === "active"
                            ? "مفعّل"
                            : client.status === "suspended"
                            ? "موقوف"
                            : "غير نشط"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-8 text-green-700 border-green-300 hover:bg-green-50 hover:border-green-500 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950"
                          onClick={() =>
                            setSelectedClient({
                              id: client.id,
                              name: client.name,
                              username: client.username,
                              email: client.email,
                              balance: client.balance,
                            })
                          }
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          إضافة رصيد
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا يوجد عملاء</p>
            </div>
          )}
        </CardContent>
      </Card>
      {/* ── Billing Run Logs ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-muted-foreground" />
            سجل تشغيلات الفوترة اليومية
          </CardTitle>
          <CardDescription>آخر 20 دورة فوترة — يعمل يومياً عند 00:05 صباحاً</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !billingRunLogs?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">لا توجد سجلات بعد — ستظهر بعد أول تشغيل</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-2 px-3 font-medium">التاريخ والوقت</th>
                    <th className="text-center py-2 px-3 font-medium">الحالة</th>
                    <th className="text-center py-2 px-3 font-medium">النوع</th>
                    <th className="text-center py-2 px-3 font-medium">تم فحصهم</th>
                    <th className="text-center py-2 px-3 font-medium">تم خصمهم</th>
                    <th className="text-center py-2 px-3 font-medium">تخطي</th>
                    <th className="text-center py-2 px-3 font-medium">فشل</th>
                    <th className="text-center py-2 px-3 font-medium">إشعارات رصيد منخفض</th>
                    <th className="text-center py-2 px-3 font-medium">المدة</th>
                  </tr>
                </thead>
                <tbody>
                  {billingRunLogs.map((log: typeof billingRunLogs[0]) => (
                    <tr key={log.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 text-right">
                        {safeFormatDate(log.runAt, timezone, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {log.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> ناجح
                          </span>
                        ) : log.status === 'partial' ? (
                          <span className="inline-flex items-center gap-1 text-orange-500 text-xs font-medium">
                            <AlertCircle className="h-3.5 w-3.5" /> جزئي
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium">
                            <XCircle className="h-3.5 w-3.5" /> فشل
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={log.triggeredBy === 'manual' ? 'secondary' : 'outline'} className="text-xs">
                          {log.triggeredBy === 'manual' ? 'يدوي' : 'تلقائي'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">{log.usersChecked}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-green-600">{log.usersProcessed}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-muted-foreground">{log.usersSkipped}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-red-500">{log.usersFailed}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-orange-500">{log.lowBalanceNotifications}</td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground text-xs">
                        {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
