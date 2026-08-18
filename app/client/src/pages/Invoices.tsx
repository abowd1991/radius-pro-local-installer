import { useAuth } from "@/_core/hooks/useAuth";
import { parseDbDate, formatDate as _fmtDateLib } from '@/lib/dateFormat';
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Download,
  Search,
  Filter,
  FileText,
  Eye,
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Invoices() {
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleDownloadPdf = (invoice: any) => {
    if (invoice.pdfUrl) {
      const a = document.createElement("a");
      a.href = invoice.pdfUrl;
      a.download = `${invoice.invoiceNumber ?? "invoice"}.pdf`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      toast.info(language === "ar" ? "الفاتورة غير متوفرة بعد" : "Invoice PDF not available yet");
    }
  };

  const handleViewDetails = (invoice: any) => {
    setSelectedInvoice(invoice);
    setDetailsOpen(true);
  };

  // Fetch invoices
  const { data: invoices, isLoading, refetch } = trpc.invoices.list.useQuery({
    status: statusFilter !== "all" && statusFilter !== "overdue" ? statusFilter as "pending" | "paid" | "cancelled" | "draft" | "refunded" : undefined,
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  const formatDate = (date: Date | string | null) => _fmtDateLib(date);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="default" className="bg-green-500">{t("invoices.paid")}</Badge>;
      case "pending":
        return <Badge variant="default" className="bg-yellow-500">{t("invoices.pending")}</Badge>;
      case "overdue":
        return <Badge variant="destructive">{t("invoices.overdue")}</Badge>;
      case "cancelled":
        return <Badge variant="secondary">{t("invoices.cancelled")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "overdue":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  // Calculate stats
  const stats = {
    total: invoices?.length || 0,
    paid: invoices?.filter((i: any) => i.status === "paid").length || 0,
    pending: invoices?.filter((i: any) => i.status === "pending").length || 0,
    overdue: 0, // Overdue calculated based on due date
    totalAmount: invoices?.reduce((sum: any, i: any) => sum + parseFloat(i.total), 0) || 0,
    paidAmount: invoices?.filter((i: any) => i.status === "paid").reduce((sum: any, i: any) => sum + parseFloat(i.total), 0) || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("invoices.title")}</h1>
          <p className="text-muted-foreground">
            {language === "ar" ? "عرض وإدارة الفواتير" : "View and manage invoices"}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {language === "ar" ? "إجمالي الفواتير" : "Total Invoices"}
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.totalAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("invoices.paid")}
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.paid}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.paidAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("invoices.pending")}
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("invoices.overdue")}
            </CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.overdue}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${direction === "rtl" ? "right-3" : "left-3"}`} />
              <Input
                placeholder={language === "ar" ? "بحث برقم الفاتورة..." : "Search by invoice number..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={direction === "rtl" ? "pr-9" : "pl-9"}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="paid">{t("invoices.paid")}</SelectItem>
                <SelectItem value="pending">{t("invoices.pending")}</SelectItem>
                <SelectItem value="overdue">{t("invoices.overdue")}</SelectItem>
                <SelectItem value="cancelled">{t("invoices.cancelled")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === "ar" ? "رقم الفاتورة" : "Invoice #"}</TableHead>
                <TableHead>{language === "ar" ? "العميل" : "Client"}</TableHead>
                <TableHead>{t("common.amount")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{language === "ar" ? "تاريخ الإصدار" : "Issue Date"}</TableHead>
                <TableHead>{language === "ar" ? "تاريخ الاستحقاق" : "Due Date"}</TableHead>
                <TableHead className="w-[70px]">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              ) : invoices?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "لا توجد فواتير" : "No invoices found"}
                  </TableCell>
                </TableRow>
              ) : (
                invoices?.map((invoice: any) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(invoice.status)}
                        <code className="text-sm font-mono">{invoice.invoiceNumber}</code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {(invoice as any).userName || (invoice as any).userEmail || (invoice.userId ? `User #${invoice.userId}` : "-")}
                        </span>
                        {(invoice as any).userName && (invoice as any).userEmail && (
                          <span className="text-xs text-muted-foreground">{(invoice as any).userEmail}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{formatCurrency(invoice.total)}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                    <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={direction === "rtl" ? "start" : "end"}>
                          <DropdownMenuItem onClick={() => handleViewDetails(invoice)}>
                            <Eye className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                            {language === "ar" ? "عرض التفاصيل" : "View Details"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownloadPdf(invoice)}>
                            <Download className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                            {language === "ar" ? "تحميل PDF" : "Download PDF"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invoice Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {language === "ar" ? "تفاصيل الفاتورة" : "Invoice Details"}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">{language === "ar" ? "رقم الفاتورة" : "Invoice #"}</p>
                  <p className="font-mono font-medium">{selectedInvoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{language === "ar" ? "الحالة" : "Status"}</p>
                  {getStatusBadge(selectedInvoice.status)}
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{language === "ar" ? "العميل" : "Client"}</p>
                  <p className="font-medium">{selectedInvoice.userName || selectedInvoice.userEmail || `User #${selectedInvoice.userId}`}</p>
                  {selectedInvoice.userName && selectedInvoice.userEmail && (
                    <p className="text-xs text-muted-foreground">{selectedInvoice.userEmail}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{language === "ar" ? "المبلغ" : "Amount"}</p>
                  <p className="font-bold text-lg text-green-600">{formatCurrency(selectedInvoice.total)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{language === "ar" ? "تاريخ الإنشاء" : "Created"}</p>
                  <p>{formatDate(selectedInvoice.createdAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{language === "ar" ? "تاريخ الاستحقاق" : "Due Date"}</p>
                  <p>{formatDate(selectedInvoice.dueDate)}</p>
                </div>
                {selectedInvoice.paymentMethod && (
                  <div>
                    <p className="text-muted-foreground text-xs">{language === "ar" ? "طريقة الدفع" : "Payment Method"}</p>
                    <p>{selectedInvoice.paymentMethod}</p>
                  </div>
                )}
                {selectedInvoice.paymentReference && (
                  <div>
                    <p className="text-muted-foreground text-xs">{language === "ar" ? "رقم المرجع" : "Reference"}</p>
                    <p className="font-mono text-xs">{selectedInvoice.paymentReference}</p>
                  </div>
                )}
              </div>
              {selectedInvoice.notes && (
                <div className="border rounded-md p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "ملاحظات" : "Notes"}</p>
                  <p className="text-sm">{selectedInvoice.notes}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  className="flex-1 gap-2"
                  onClick={() => handleDownloadPdf(selectedInvoice)}
                  disabled={!selectedInvoice.pdfUrl}
                >
                  <Download className="h-4 w-4" />
                  {selectedInvoice.pdfUrl
                    ? (language === "ar" ? "تحميل PDF" : "Download PDF")
                    : (language === "ar" ? "PDF غير متوفر" : "PDF Not Available")}
                </Button>
                <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                  {language === "ar" ? "إغلاق" : "Close"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
