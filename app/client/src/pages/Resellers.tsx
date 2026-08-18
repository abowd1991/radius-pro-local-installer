import { useAuth } from "@/_core/hooks/useAuth";
import { parseDbDate, formatDate as _fmtDateLib } from '@/lib/dateFormat';
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Edit,
  Search,
  Users,
  Mail,
  Phone,
  Wallet,
  Ban,
  CheckCircle,
  Building2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { usePagination } from "@/hooks/usePagination";
import { useSorting } from "@/hooks/useSorting";
import { DataPagination } from "@/components/ui/data-pagination";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function Resellers() {
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingReseller, setEditingReseller] = useState<any>(null);

  // Fetch resellers
  const { data: _resellersListData, isLoading, refetch } = trpc.users.list.useQuery({
    role: "reseller",
    search: searchQuery || undefined,
  });
  const resellers: any[] | undefined = (_resellersListData as any)?.users ?? (_resellersListData as any);
  const resellersMeta = _resellersListData as any;

  // Sorting
  const { sortedData: sortedResellers, sortColumn, sortDirection, handleSort } = useSorting(
    resellers,
    "createdAt",
    "desc"
  );

  // Pagination
  const {
    paginatedData: paginatedResellers,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedResellers, 15);

  // Mutations
  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حذف المستخدم بنجاح" : "User deleted successfully");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const toggleStatus = trpc.users.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تحديث الحالة" : "Status updated");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
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
      case "active":
        return <Badge variant="default" className="bg-green-500">{t("common.active")}</Badge>;
      case "inactive":
        return <Badge variant="secondary">{t("common.inactive")}</Badge>;
      case "suspended":
        return <Badge variant="destructive">{t("common.suspended")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast.info(language === "ar" ? "سيتم إضافة هذه الميزة قريباً" : "This feature will be added soon");
    setIsAddDialogOpen(false);
    setEditingReseller(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-gradient-to-br from-primary to-teal-600 rounded-xl shadow-sm">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{t("nav.resellers")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {language === "ar" ? "إدارة الموزعين والوكلاء" : "Manage resellers and agents"}
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
              {language === "ar" ? "إضافة موزع" : "Add Reseller"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language === "ar" ? "إضافة موزع جديد" : "Add New Reseller"}</DialogTitle>
              <DialogDescription>
                {language === "ar" ? "أدخل بيانات الموزع الجديد" : "Enter the new reseller's information"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("common.name")}</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t("common.email")}</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("common.phone")}</Label>
                  <Input id="phone" name="phone" type="tel" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">{language === "ar" ? "اسم الشركة" : "Company Name"}</Label>
                  <Input id="company" name="company" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commission">{language === "ar" ? "نسبة العمولة (%)" : "Commission Rate (%)"}</Label>
                  <Input id="commission" name="commission" type="number" min="0" max="100" defaultValue="10" />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit">
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Summary */}
      {resellers && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {/* Primary - Total */}
          <div className="col-span-2 md:col-span-1 relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-primary to-teal-600 shadow-md">
            <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10 blur-xl" />
            <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-black/10 blur-2xl" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">
                  {language === "ar" ? "إجمالي الموزعين" : "Total Resellers"}
                </p>
                <p className="text-4xl font-bold leading-none">{resellersMeta?.total || resellers?.length || 0}</p>
                <p className="text-white/60 text-xs mt-1">{language === "ar" ? "موزع مسجل" : "registered resellers"}</p>
              </div>
              <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </div>
          {/* Active */}
          <div className="relative overflow-hidden rounded-2xl p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">{t("common.active")}</p>
              <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {(resellers || []).filter((r: any) => r.status === "active").length}
            </p>
          </div>
          {/* Suspended */}
          <div className="relative overflow-hidden rounded-2xl p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wider">{language === "ar" ? "موقوف" : "Suspended"}</p>
              <div className="p-1.5 bg-red-100 dark:bg-red-900/40 rounded-lg">
                <Ban className="h-4 w-4 text-red-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">
              {(resellers || []).filter((r: any) => r.status === "suspended").length}
            </p>
          </div>
          {/* Total Balance */}
          <div className="relative overflow-hidden rounded-2xl p-4 bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-violet-700 dark:text-violet-400 uppercase tracking-wider">{language === "ar" ? "إجمالي الرصيد" : "Total Balance"}</p>
              <div className="p-1.5 bg-violet-100 dark:bg-violet-900/40 rounded-lg">
                <Wallet className="h-4 w-4 text-violet-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
              ${(resellers || []).reduce((acc: number, r: any) => acc + parseFloat(r.walletBalance || '0'), 0).toFixed(0)}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${direction === "rtl" ? "right-3" : "left-3"}`} />
        <Input
          placeholder={language === "ar" ? "بحث بالاسم أو البريد..." : "Search by name or email..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`${direction === "rtl" ? "pr-9" : "pl-9"} h-10`}
        />
      </div>

      {/* Resellers Table */}
      <Card className="border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <SortableTableHead
                  column="name"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  {t("common.name")}
                </SortableTableHead>
                <SortableTableHead
                  column="email"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  {t("common.email")}
                </SortableTableHead>
                <TableHead className="font-semibold">{t("common.phone")}</TableHead>
                <SortableTableHead
                  column="clientCount"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  {language === "ar" ? "عدد العملاء" : "Clients"}
                </SortableTableHead>
                <SortableTableHead
                  column="walletBalance"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  {t("wallet.balance")}
                </SortableTableHead>
                <SortableTableHead
                  column="status"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  {t("common.status")}
                </SortableTableHead>
                <SortableTableHead
                  column="createdAt"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  {t("common.created_at")}
                </SortableTableHead>
                <TableHead className="w-[70px] font-semibold">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={5} columns={8} />
              ) : paginatedResellers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "لا يوجد موزعين" : "No resellers found"}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedResellers?.map((reseller: any) => (
                  <TableRow key={reseller.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="font-medium text-sm">{reseller.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span>{reseller.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {reseller.phone ? (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{reseller.phone}</span>
                        </div>
                      ) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium">{reseller.clientCount || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Wallet className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium">{formatCurrency(reseller.walletBalance || "0")}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">{getStatusBadge(reseller.status)}</TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">{formatDate(reseller.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={direction === "rtl" ? "start" : "end"}>
                          <DropdownMenuItem onClick={() => setEditingReseller(reseller)}>
                            <Edit className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                            {t("common.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.info(language === "ar" ? "قريباً" : "Coming soon")}>
                            <Users className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                            {language === "ar" ? "عرض العملاء" : "View Clients"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {reseller.status === "active" ? (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => toggleStatus.mutate({ userId: reseller.id, status: "suspended" })}
                            >
                              <Ban className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                              {language === "ar" ? "إيقاف" : "Suspend"}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => toggleStatus.mutate({ userId: reseller.id, status: "active" })}
                            >
                              <CheckCircle className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                              {language === "ar" ? "تفعيل" : "Activate"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={async () => {
                              if (await window.confirmOperation(language === "ar" ? "هل أنت متأكد من حذف هذا المستخدم؟" : "Are you sure you want to delete this user?", language === "ar" ? "حذف المستخدم" : "Delete user")) {
                                deleteUser.mutate({ userId: reseller.id });
                              }
                            }}
                          >
                            <Trash2 className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                            {language === "ar" ? "حذف" : "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <DataPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingReseller} onOpenChange={(open) => !open && setEditingReseller(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "تعديل الموزع" : "Edit Reseller"}</DialogTitle>
          </DialogHeader>
          {editingReseller && (
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">{t("common.name")}</Label>
                  <Input id="edit-name" name="name" defaultValue={editingReseller.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">{t("common.email")}</Label>
                  <Input id="edit-email" name="email" type="email" defaultValue={editingReseller.email} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">{t("common.phone")}</Label>
                  <Input id="edit-phone" name="phone" type="tel" defaultValue={editingReseller.phone || ""} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingReseller(null)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit">
                  {t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
