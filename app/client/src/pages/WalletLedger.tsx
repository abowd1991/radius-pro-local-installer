import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, TrendingUp, TrendingDown, Wallet, DollarSign, ArrowUpCircle, ArrowDownCircle, Search, User } from "lucide-react";
import { formatDateTime } from '@/lib/dateFormat';

// ─── UserSearchSelect ────────────────────────────────────────────────────────
// Combobox بسيط يبحث بالاسم أو الإيميل ويعيد userId
interface Client {
  id: number;
  name: string | null;
  email: string;
  username: string | null;
}

interface UserSearchSelectProps {
  clients: Client[];
  value: string;
  onChange: (userId: string, clientName: string) => void;
  placeholder?: string;
}

function UserSearchSelect({ clients, value, onChange, placeholder = "ابحث باسم العميل..." }: UserSearchSelectProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedClient = useMemo(
    () => clients.find((c) => String(c.id) === value),
    [clients, value]
  );

  const filtered = useMemo(() => {
    if (!search) return clients.slice(0, 20);
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        c.email.toLowerCase().includes(q) ||
        (c.username && c.username.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [clients, search]);

  return (
    <div className="relative">
      <div
        className="flex items-center border rounded-md px-3 py-2 gap-2 cursor-pointer bg-background hover:border-primary transition-colors"
        onClick={() => setIsOpen((v) => !v)}
      >
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className={selectedClient ? "text-foreground" : "text-muted-foreground"}>
          {selectedClient
            ? `${selectedClient.name || selectedClient.username || "بدون اسم"} — ${selectedClient.email}`
            : placeholder}
        </span>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg">
          <div className="flex items-center border-b px-3 py-2 gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              placeholder="ابحث بالاسم أو الإيميل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">لا توجد نتائج</div>
            ) : (
              filtered.map((c) => (
                <div
                  key={c.id}
                  className={`px-3 py-2 cursor-pointer hover:bg-accent text-sm ${String(c.id) === value ? "bg-accent font-medium" : ""}`}
                  onClick={() => {
                    onChange(String(c.id), c.name || c.username || c.email);
                    setSearch("");
                    setIsOpen(false);
                  }}
                >
                  <div className="font-medium">{c.name || c.username || "بدون اسم"}</div>
                  <div className="text-xs text-muted-foreground">{c.email}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function WalletLedger() {
  const [isAddCreditOpen, setIsAddCreditOpen] = useState(false);
  const [isDeductOpen, setIsDeductOpen] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "credit" | "debit">("all");

  // Form states
  const [creditForm, setCreditForm] = useState({
    userId: "",
    userName: "",
    amount: "",
    reason: "",
    reasonAr: "",
  });

  const [deductForm, setDeductForm] = useState({
    userId: "",
    userName: "",
    amount: "",
    reason: "",
    reasonAr: "",
  });

  // Queries
  const { data: summary, isLoading: summaryLoading } = trpc.wallet.getWalletSummary.useQuery();
  const { data: history, isLoading: historyLoading, refetch } = trpc.wallet.getTransactionHistory.useQuery({
    type: filterType === "all" ? undefined : filterType,
    limit: 100,
  });
  const { data: clients = [] } = trpc.broadcasts.getClients.useQuery();

  // Mutations
  const addCreditMutation = trpc.wallet.addCredit.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الرصيد بنجاح");
      setIsAddCreditOpen(false);
      setCreditForm({ userId: "", userName: "", amount: "", reason: "", reasonAr: "" });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deductMutation = trpc.wallet.deductBalance.useMutation({
    onSuccess: () => {
      toast.success("تم خصم الرصيد بنجاح");
      setIsDeductOpen(false);
      setDeductForm({ userId: "", userName: "", amount: "", reason: "", reasonAr: "" });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleAddCredit = () => {
    if (!creditForm.userId || !creditForm.amount || !creditForm.reason) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    addCreditMutation.mutate({
      userId: parseInt(creditForm.userId),
      amount: parseFloat(creditForm.amount),
      reason: creditForm.reason,
      reasonAr: creditForm.reasonAr || undefined,
    });
  };

  const handleDeduct = () => {
    if (!deductForm.userId || !deductForm.amount || !deductForm.reason) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    deductMutation.mutate({
      userId: parseInt(deductForm.userId),
      amount: parseFloat(deductForm.amount),
      reason: deductForm.reason,
      reasonAr: deductForm.reasonAr || undefined,
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (date: Date | string) => {
    return formatDateTime(date);
  };

  return (
    <div className="container py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">سجل المحفظة</h1>
          <p className="text-muted-foreground">إدارة المعاملات المالية وسجل المحفظة</p>
        </div>
        <div className="flex gap-2">
          {/* ── إضافة رصيد ── */}
          <Dialog open={isAddCreditOpen} onOpenChange={(open) => {
            setIsAddCreditOpen(open);
            if (!open) setCreditForm({ userId: "", userName: "", amount: "", reason: "", reasonAr: "" });
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة رصيد
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>إضافة رصيد</DialogTitle>
                <DialogDescription>إضافة رصيد إلى محفظة المستخدم</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>العميل *</Label>
                  <UserSearchSelect
                    clients={clients}
                    value={creditForm.userId}
                    onChange={(id, name) => setCreditForm({ ...creditForm, userId: id, userName: name })}
                  />
                  {creditForm.userId && (
                    <p className="text-xs text-muted-foreground mt-1">رقم المستخدم: {creditForm.userId}</p>
                  )}
                </div>
                <div>
                  <Label>المبلغ (USD) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={creditForm.amount}
                    onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                    placeholder="مثال: 100.00"
                  />
                </div>
                <div>
                  <Label>السبب (English) *</Label>
                  <Textarea
                    value={creditForm.reason}
                    onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })}
                    placeholder="Manual deposit by admin"
                  />
                </div>
                <div>
                  <Label>السبب (العربية)</Label>
                  <Textarea
                    value={creditForm.reasonAr}
                    onChange={(e) => setCreditForm({ ...creditForm, reasonAr: e.target.value })}
                    placeholder="إيداع يدوي من المشرف"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddCreditOpen(false)}>
                  إلغاء
                </Button>
                <Button onClick={handleAddCredit} disabled={addCreditMutation.isPending}>
                  {addCreditMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  إضافة
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ── خصم رصيد ── */}
          <Dialog open={isDeductOpen} onOpenChange={(open) => {
            setIsDeductOpen(open);
            if (!open) setDeductForm({ userId: "", userName: "", amount: "", reason: "", reasonAr: "" });
          }}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <ArrowDownCircle className="h-4 w-4" />
                خصم رصيد
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>خصم رصيد</DialogTitle>
                <DialogDescription>خصم رصيد من محفظة المستخدم</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>العميل *</Label>
                  <UserSearchSelect
                    clients={clients}
                    value={deductForm.userId}
                    onChange={(id, name) => setDeductForm({ ...deductForm, userId: id, userName: name })}
                  />
                  {deductForm.userId && (
                    <p className="text-xs text-muted-foreground mt-1">رقم المستخدم: {deductForm.userId}</p>
                  )}
                </div>
                <div>
                  <Label>المبلغ (USD) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={deductForm.amount}
                    onChange={(e) => setDeductForm({ ...deductForm, amount: e.target.value })}
                    placeholder="مثال: 50.00"
                  />
                </div>
                <div>
                  <Label>السبب (English) *</Label>
                  <Textarea
                    value={deductForm.reason}
                    onChange={(e) => setDeductForm({ ...deductForm, reason: e.target.value })}
                    placeholder="Card purchase deduction"
                  />
                </div>
                <div>
                  <Label>السبب (العربية)</Label>
                  <Textarea
                    value={deductForm.reasonAr}
                    onChange={(e) => setDeductForm({ ...deductForm, reasonAr: e.target.value })}
                    placeholder="خصم شراء كروت"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeductOpen(false)}>
                  إلغاء
                </Button>
                <Button variant="destructive" onClick={handleDeduct} disabled={deductMutation.isPending}>
                  {deductMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  خصم
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الرصيد الحالي</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.currentBalance)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الإيداعات</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalCredits)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي السحوبات</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{formatCurrency(summary.totalDebits)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">صافي الحركة</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(summary.totalCredits - summary.totalDebits)}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>سجل المعاملات</CardTitle>
              <CardDescription>جميع المعاملات المالية</CardDescription>
            </div>
            <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المعاملات</SelectItem>
                <SelectItem value="credit">الإيداعات فقط</SelectItem>
                <SelectItem value="debit">السحوبات فقط</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : history && history.transactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الرصيد قبل</TableHead>
                  <TableHead>الرصيد بعد</TableHead>
                  <TableHead>السبب</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.transactions.map((transaction: any) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-medium">
                      {formatDate(transaction.createdAt)}
                    </TableCell>
                    <TableCell>
                      {transaction.type === "credit" ? (
                        <Badge className="bg-green-500">
                          <ArrowUpCircle className="mr-1 h-3 w-3" />
                          إيداع
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <ArrowDownCircle className="mr-1 h-3 w-3" />
                          سحب
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={transaction.type === "credit" ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                      {transaction.type === "credit" ? "+" : "-"}
                      {formatCurrency(parseFloat(transaction.amount))}
                    </TableCell>
                    <TableCell>{formatCurrency(parseFloat(transaction.balanceBefore))}</TableCell>
                    <TableCell>{formatCurrency(parseFloat(transaction.balanceAfter))}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {transaction.reasonAr || transaction.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد معاملات
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
