import { useAuth } from "@/_core/hooks/useAuth";
import { formatDateTime as _fmtDTLib } from '@/lib/dateFormat';
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Wallet as WalletIcon,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  FileText,
  CreditCard,
  History,
  Receipt,
  Building,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Banknote,
  BarChart3,
} from "lucide-react";
import { useState, useMemo } from "react";
import { PaymentWizard } from "@/components/PaymentWizard";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(amount: string | number, lang: string) {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat(lang === "ar" ? "en-US" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num);
}

function fmtDate(date: Date | string) {
  return _fmtDTLib(date);
}

const DEBIT_TYPES = new Set([
  "withdrawal", "purchase", "voucher_purchase", "card_purchase",
  "subscription", "subscription_payment", "commission", "transfer_out",
]);

function isDebit(type: string) {
  return DEBIT_TYPES.has(type);
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <p className="text-xl font-bold text-foreground leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  label,
  desc,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2 shadow-sm hover:shadow-md hover:border-primary/40 transition-all text-left w-full group"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} group-hover:scale-110 transition-transform`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

function TxStatusBadge({ type, status, lang }: { type: string; status?: string; lang: string }) {
  if (type === "bank_transfer") {
    if (status === "approved") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />{lang === "ar" ? "موافق" : "Approved"}</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs gap-1"><XCircle className="w-3 h-3" />{lang === "ar" ? "مرفوض" : "Rejected"}</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs gap-1"><Clock className="w-3 h-3" />{lang === "ar" ? "قيد المراجعة" : "Pending"}</Badge>;
  }
  return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />{lang === "ar" ? "مكتملة" : "Completed"}</Badge>;
}

function TxTypeLabel({ type, lang }: { type: string; lang: string }) {
  const labels: Record<string, { ar: string; en: string }> = {
    deposit: { ar: "إيداع", en: "Deposit" },
    withdrawal: { ar: "سحب", en: "Withdrawal" },
    purchase: { ar: "شراء", en: "Purchase" },
    voucher_purchase: { ar: "شراء كروت", en: "Voucher Purchase" },
    card_purchase: { ar: "شراء كروت", en: "Card Purchase" },
    subscription_payment: { ar: "دفع اشتراك", en: "Subscription" },
    subscription: { ar: "اشتراك", en: "Subscription" },
    refund: { ar: "استرداد", en: "Refund" },
    transfer_in: { ar: "تحويل وارد", en: "Transfer In" },
    transfer_out: { ar: "تحويل صادر", en: "Transfer Out" },
    admin_adjustment: { ar: "تعديل إداري", en: "Admin Adj." },
    bank_transfer: { ar: "تحويل بنكي", en: "Bank Transfer" },
    commission: { ar: "عمولة", en: "Commission" },
    credit: { ar: "مديونية", en: "Credit" },
  };
  return <span>{labels[type]?.[lang as "ar" | "en"] || type}</span>;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Wallet() {
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();
  const isRtl = direction === "rtl";
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const TX_LIMIT = 15;

  // ── queries ──
  const { data: wallet, isLoading: walletLoading, refetch: refetchWallet } =
    trpc.wallet.getMyWallet.useQuery();

  const { data: txResult, isLoading: txLoading, refetch: refetchTx } =
    trpc.wallet.getTransactions.useQuery({ page: txPage, limit: TX_LIMIT });

  const { data: walletStats } = trpc.wallet.getWalletStats.useQuery();

  const { data: creditStatus, refetch: refetchCredit } =
    trpc.wallet.getCreditStatus.useQuery();

  const { data: invoices, isLoading: invoicesLoading } =
    trpc.invoices.list.useQuery({ page: 1, limit: 6 });

  // ── mutations ──
  const activateCredit = trpc.wallet.activateCredit.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تفعيل المديونية بنجاح! رصيدك الآن $2.00" : "Credit activated! Balance is now $2.00");
      refetchWallet(); refetchCredit(); refetchTx();
    },
    onError: (e) => toast.error(e.message),
  });

  const generateReceipt = trpc.bankTransfer.generateReceipt.useMutation({
    onSuccess: (data) => {
      const bytes = atob(data.pdfData);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = data.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(language === "ar" ? "تم تحميل الإيصال" : "Receipt downloaded");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── derived values ──
  const balance = parseFloat(wallet?.balance as string || "0");
  const creditDebt = parseFloat(creditStatus?.creditBalance?.toString() || "0");
  const maxCredit = parseFloat(creditStatus?.maxCreditLimit?.toString() || "2");
  const balancePercent = Math.min(100, (balance / 100) * 100);

  const transactions = txResult?.data ?? [];
  const txTotal = txResult?.total ?? 0;
  const txTotalPages = txResult?.totalPages ?? 1;

  const totalDeposits = walletStats?.totalDeposits ?? 0;
  const totalWithdrawals = walletStats?.totalWithdrawals ?? 0;
  const txCount = walletStats?.transactionCount ?? 0;

  const invoiceList = (invoices as any)?.invoices ?? invoices ?? [];

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6 pb-8">

        {/* ── Header ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-sm">
              <WalletIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {language === "ar" ? "المحفظة" : "Wallet"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {language === "ar" ? "إدارة رصيدك ومعاملاتك المالية" : "Manage your balance and transactions"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { refetchWallet(); refetchTx(); refetchCredit(); }}
              className="gap-2 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {language === "ar" ? "تحديث" : "Refresh"}
            </Button>
            <Button
              size="sm"
              onClick={() => setIsDepositOpen(true)}
              className="gap-2 text-xs bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              {language === "ar" ? "إضافة رصيد" : "Add Funds"}
            </Button>
          </div>
        </div>

        {/* ── Main Balance + Stats ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Balance Card */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-2xl p-6 text-white shadow-lg"
            style={{ background: "linear-gradient(135deg, #0d9488 0%, #059669 50%, #047857 100%)" }}>
            {/* decorative blobs */}
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-black/10 blur-3xl pointer-events-none" />

            <div className="relative">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1">
                  <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-2">
                    {language === "ar" ? "الرصيد المتاح" : "Available Balance"}
                  </p>
                  <div className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight">
                    {walletLoading ? (
                      <div className="h-14 w-40 bg-white/20 rounded-xl animate-pulse" />
                    ) : (
                      fmtCurrency(balance, language)
                    )}
                  </div>
                  <p className="text-white/60 text-xs mt-2">
                    {language === "ar" ? "آخر تحديث: الآن" : "Last updated: just now"}
                  </p>

                  {/* Debt indicator */}
                  {creditDebt > 0 && (
                    <div className="mt-3 flex items-center gap-2 bg-red-500/20 border border-red-400/30 rounded-xl px-3 py-2 w-fit">
                      <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
                      <span className="text-red-200 text-xs font-medium">
                        {language === "ar"
                          ? `مديونية مستحقة: ${fmtCurrency(creditDebt, language)}`
                          : `Outstanding debt: ${fmtCurrency(creditDebt, language)}`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 items-start sm:items-end shrink-0">
                  <Button
                    size="lg"
                    onClick={() => setIsDepositOpen(true)}
                    className="bg-white text-teal-700 hover:bg-white/90 font-bold shadow-md gap-2 px-6"
                  >
                    <Plus className="w-5 h-5" />
                    {language === "ar" ? "إضافة رصيد" : "Add Funds"}
                  </Button>

                  {creditStatus && balance <= 0 && creditStatus.hasCreditAvailable && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-300 text-amber-200 hover:bg-amber-500/20 text-xs"
                      onClick={() => activateCredit.mutate()}
                      disabled={activateCredit.isPending}
                    >
                      {activateCredit.isPending
                        ? (language === "ar" ? "جاري..." : "Processing...")
                        : (language === "ar" ? `تفعيل مديونية $${maxCredit}` : `Activate $${maxCredit} Credit`)}
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-5">
                <div className="flex justify-between text-white/60 text-xs mb-1.5">
                  <span>{language === "ar" ? "نسبة الرصيد" : "Balance level"}</span>
                  <span>{balancePercent.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${balancePercent}%`,
                      background: balancePercent > 50
                        ? "rgba(255,255,255,0.8)"
                        : balancePercent > 20
                          ? "rgba(251,191,36,0.9)"
                          : "rgba(239,68,68,0.9)",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stats column */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <StatCard
              icon={TrendingUp}
              label={language === "ar" ? "إجمالي الإيداعات" : "Total Deposits"}
              value={fmtCurrency(totalDeposits, language)}
              color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
            />
            <StatCard
              icon={TrendingDown}
              label={language === "ar" ? "إجمالي المصروفات" : "Total Expenses"}
              value={fmtCurrency(totalWithdrawals, language)}
              color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            />
            <StatCard
              icon={Activity}
              label={language === "ar" ? "عدد العمليات" : "Transactions"}
              value={txCount.toLocaleString()}
              color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            />
            <StatCard
              icon={DollarSign}
              label={language === "ar" ? "الرصيد الحالي" : "Current Balance"}
              value={fmtCurrency(balance, language)}
              color="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
            />
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {language === "ar" ? "إجراءات سريعة" : "Quick Actions"}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <QuickActionCard
              icon={Plus}
              label={language === "ar" ? "إضافة رصيد" : "Add Funds"}
              desc={language === "ar" ? "شحن محفظتك" : "Top up wallet"}
              color="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
              onClick={() => setIsDepositOpen(true)}
            />
            <QuickActionCard
              icon={History}
              label={language === "ar" ? "سجل العمليات" : "Transactions"}
              desc={language === "ar" ? "عرض كل العمليات" : "View all history"}
              color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              onClick={() => document.getElementById("tx-section")?.scrollIntoView({ behavior: "smooth" })}
            />
            <QuickActionCard
              icon={FileText}
              label={language === "ar" ? "الفواتير" : "Invoices"}
              desc={language === "ar" ? "عرض الفواتير" : "View invoices"}
              color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
              onClick={() => document.getElementById("inv-section")?.scrollIntoView({ behavior: "smooth" })}
            />
            <QuickActionCard
              icon={Building}
              label={language === "ar" ? "تحويل بنكي" : "Bank Transfer"}
              desc={language === "ar" ? "إرسال إشعار" : "Submit receipt"}
              color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
              onClick={() => setIsDepositOpen(true)}
            />
            <QuickActionCard
              icon={BarChart3}
              label={language === "ar" ? "الإحصائيات" : "Statistics"}
              desc={language === "ar" ? "ملخص مالي" : "Financial summary"}
              color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
            />
          </div>
        </div>

        {/* ── Transactions ── */}
        <div id="tx-section" className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">
                {language === "ar" ? "سجل العمليات" : "Transaction History"}
              </h2>
              {txTotal > 0 && (
                <Badge variant="secondary" className="text-xs">{txTotal.toLocaleString()}</Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetchTx()} className="gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="w-3.5 h-3.5" />
              {language === "ar" ? "تحديث" : "Refresh"}
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-start px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {language === "ar" ? "التاريخ" : "Date"}
                  </th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {language === "ar" ? "الوصف" : "Description"}
                  </th>
                  <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {language === "ar" ? "النوع" : "Type"}
                  </th>
                  <th className="text-end px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {language === "ar" ? "المبلغ" : "Amount"}
                  </th>
                  <th className="text-end px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    {language === "ar" ? "الرصيد بعد" : "Balance After"}
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {language === "ar" ? "الحالة" : "Status"}
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    {language === "ar" ? "الإشعار" : "Receipt"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {txLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <History className="w-10 h-10 opacity-30" />
                        <p className="font-medium">{language === "ar" ? "لا توجد عمليات بعد" : "No transactions yet"}</p>
                        <p className="text-xs">{language === "ar" ? "ستظهر عملياتك هنا بعد أول شحن" : "Your transactions will appear here after first deposit"}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx: any) => {
                    const debit = isDebit(tx.type);
                    return (
                      <tr
                        key={`${tx.source ?? "w"}-${tx.id}`}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(tx.createdAt)}
                        </td>
                        <td className="px-4 py-3.5 max-w-[180px]">
                          <span className="text-xs text-foreground truncate block">
                            {tx.description || (language === "ar" ? "—" : "—")}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-muted-foreground">
                            <TxTypeLabel type={tx.type} lang={language} />
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-end">
                          <span className={`font-semibold text-sm ${debit ? "text-red-500" : "text-emerald-500"}`}>
                            {debit ? "−" : "+"}{fmtCurrency(tx.amount, language)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-end hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {tx.balanceAfter ? fmtCurrency(tx.balanceAfter, language) : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <TxStatusBadge type={tx.type} status={tx.status} lang={language} />
                        </td>
                        <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                          {tx.type === "bank_transfer" && tx.receiptImageUrl ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <a
                                href={tx.receiptImageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-600 text-xs underline"
                              >
                                {language === "ar" ? "عرض" : "View"}
                              </a>
                              {tx.status === "approved" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => generateReceipt.mutate({ requestId: tx.id })}
                                  disabled={generateReceipt.isPending}
                                >
                                  <Download className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {txTotalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/20">
              <p className="text-xs text-muted-foreground">
                {language === "ar"
                  ? `صفحة ${txPage} من ${txTotalPages} — ${txTotal} عملية`
                  : `Page ${txPage} of ${txTotalPages} — ${txTotal} transactions`}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={txPage <= 1}
                  onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                >
                  {isRtl ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                </Button>
                {Array.from({ length: Math.min(5, txTotalPages) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <Button
                      key={page}
                      variant={txPage === page ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setTxPage(page)}
                    >
                      {page}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={txPage >= txTotalPages}
                  onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))}
                >
                  {isRtl ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Invoices ── */}
        <div id="inv-section">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">
                {language === "ar" ? "الفواتير الأخيرة" : "Recent Invoices"}
              </h2>
            </div>
          </div>

          {invoicesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-3" />
                  <div className="h-6 bg-muted rounded w-1/2 mb-2" />
                  <div className="h-3 bg-muted rounded w-full" />
                </div>
              ))}
            </div>
          ) : invoiceList.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium text-sm">
                {language === "ar" ? "لا توجد فواتير بعد" : "No invoices yet"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {invoiceList.map((inv: any) => {
                const statusColor =
                  inv.status === "paid"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : inv.status === "pending"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";

                const statusLabel =
                  inv.status === "paid"
                    ? (language === "ar" ? "مدفوعة" : "Paid")
                    : inv.status === "pending"
                      ? (language === "ar" ? "قيد الانتظار" : "Pending")
                      : (language === "ar" ? "ملغاة" : "Cancelled");

                return (
                  <div
                    key={inv.id}
                    className="bg-card border border-border rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {language === "ar" ? "فاتورة" : "Invoice"} #{inv.id}
                        </p>
                        <p className="font-bold text-lg text-foreground mt-0.5">
                          {fmtCurrency(inv.amount, language)}
                        </p>
                      </div>
                      <Badge className={`${statusColor} border-0 text-xs shrink-0`}>
                        {statusLabel}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{inv.createdAt ? fmtDate(inv.createdAt) : "—"}</span>
                      </div>
                      {inv.paymentMethod && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CreditCard className="w-3 h-3 shrink-0" />
                          <span>{inv.paymentMethod}</span>
                        </div>
                      )}
                    </div>
                    {inv.status === "paid" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 text-xs mt-1"
                        onClick={() => {
                          if ((inv as any).pdfUrl) {
                            const a = document.createElement("a");
                            a.href = (inv as any).pdfUrl;
                            a.download = `${inv.invoiceNumber ?? "invoice"}.pdf`;
                            a.target = "_blank";
                            a.rel = "noopener noreferrer";
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          } else {
                            toast.info(language === "ar" ? "الفاتورة غير متوفرة بعد" : "Invoice PDF not available yet");
                          }
                        }}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {language === "ar" ? "تحميل PDF" : "Download PDF"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Payment Wizard */}
      <PaymentWizard
        open={isDepositOpen}
        onOpenChange={setIsDepositOpen}
        onSuccess={() => { refetchWallet(); refetchTx(); refetchCredit(); }}
      />
    </>
  );
}
