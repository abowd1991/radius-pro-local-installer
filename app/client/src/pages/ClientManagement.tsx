import { useState } from "react";
import { parseDbDate, formatDate as _fmtDateLib } from '@/lib/dateFormat';
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { 
  Users, 
  Search, 
  MoreVertical, 
  Edit,
  Trash2,
  Key,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Filter,
  UserCheck,
  Eye,
  EyeOff,
  Copy,
  ChevronLeft,
  ChevronRight,
  LogIn,
} from "lucide-react";
import { toast } from "sonner";

export default function ClientManagement() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const utils = trpc.useUtils();
  
  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [page, setPage] = useState(1);
  const LIMIT = 20;
  
  // Bulk Selection
  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  
  // Dialogs
  const [editDialog, setEditDialog] = useState<{ open: boolean; client: any | null }>({ open: false, client: null });
  const [passwordDialog, setPasswordDialog] = useState<{ open: boolean; clientId: number | null; clientName: string }>({ open: false, clientId: null, clientName: "" });
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; clientId: number | null; clientName: string }>({ open: false, clientId: null, clientName: "" });
  const [activationDialog, setActivationDialog] = useState<{ open: boolean; client: any | null }>({ open: false, client: null });
  const [showVerificationCode, setShowVerificationCode] = useState(false);

  // Forms
  const [editForm, setEditForm] = useState<{
    name: string;
    username: string;
    email: string;
    phone: string;
    address: string;
    status: 'active' | 'suspended' | 'inactive';
  }>({
    name: "",
    username: "",
    email: "",
    phone: "",
    address: "",
    status: "active",
  });
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [permissionsTab, setPermissionsTab] = useState("plan");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }>>({});
  const [featureAccess, setFeatureAccess] = useState<Record<string, boolean>>({});

  // Queries
  const { data: clientsData, isLoading } = trpc.users.list.useQuery({
    role: "client",
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    search: search || undefined,
    page,
    limit: LIMIT,
  });

  const { data: plans } = trpc.permissionPlans.list.useQuery();
  const { data: permissionGroups } = trpc.permissionGroups.list.useQuery();

  // Verification code query (only when activation dialog is open)
  const { data: verificationData, isLoading: isLoadingCode } = trpc.users.getClientVerificationCode.useQuery(
    { userId: activationDialog.client?.id ?? 0 },
    { enabled: activationDialog.open && !!activationDialog.client?.id && !activationDialog.client?.emailVerified }
  );

  // Mutations
  const updateClientMutation = trpc.users.updateClientByAdmin.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تحديث بيانات العميل بنجاح" : "Client updated successfully");
      setEditDialog({ open: false, client: null });
      utils.users.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const changePasswordMutation = trpc.users.changeClientPassword.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تغيير كلمة المرور بنجاح" : "Password changed successfully");
      setPasswordDialog({ open: false, clientId: null, clientName: "" });
      setPasswordForm({ newPassword: "", confirmPassword: "" });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const deleteClientMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حذف العميل بنجاح" : "Client deleted successfully");
      utils.users.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const bulkDeleteMutation = trpc.users.bulkDelete.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? `تم حذف ${selectedClients.length} عميل بنجاح` : `${selectedClients.length} clients deleted successfully`);
      setSelectedClients([]);
      utils.users.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const bulkSuspendMutation = trpc.users.bulkSuspend.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? `تم تعليق ${selectedClients.length} عميل بنجاح` : `${selectedClients.length} clients suspended successfully`);
      setSelectedClients([]);
      utils.users.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const bulkActivateMutation = trpc.users.bulkActivate.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? `تم تفعيل ${selectedClients.length} عميل بنجاح` : `${selectedClients.length} clients activated successfully`);
      setSelectedClients([]);
      utils.users.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const impersonateUser = trpc.auth.impersonateUser.useMutation({
    onSuccess: (data: any) => {
      toast.success(language === "ar" ? `تم الدخول كـ ${data.targetUser?.name || data.targetUser?.username}` : `Logged in as ${data.targetUser?.name || data.targetUser?.username}`);
      setTimeout(() => { window.location.replace("/dashboard"); }, 600);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const forceActivateMutation = trpc.users.forceActivateClient.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تفعيل الحساب بنجاح" : "Account activated successfully");
      setActivationDialog({ open: false, client: null });
      utils.users.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // Handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked && clientsData?.users) {
      setSelectedClients(clientsData.users.map((c: any) => c.id));
    } else {
      setSelectedClients([]);
    }
  };

  const handleSelectClient = (clientId: number, checked: boolean) => {
    if (checked) {
      setSelectedClients([...selectedClients, clientId]);
    } else {
      setSelectedClients(selectedClients.filter(id => id !== clientId));
    }
  };

  const handleEditClient = (client: any) => {
    setEditForm({
      name: client.name || "",
      username: client.username || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      status: client.status || "active",
    });
    setEditDialog({ open: true, client });
  };

  const handleSaveEdit = () => {
    if (!editDialog.client) return;
    updateClientMutation.mutate({
      userId: editDialog.client.id,
      name: editForm.name || undefined,
      username: editForm.username || undefined,
      email: editForm.email || undefined,
      phone: editForm.phone || undefined,
      address: editForm.address || undefined,
      status: editForm.status,
    });
  };

  const handleChangePassword = () => {
    if (!passwordDialog.clientId) return;
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(language === "ar" ? "كلمة المرور غير متطابقة" : "Passwords do not match");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error(language === "ar" ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل" : "Password must be at least 8 characters");
      return;
    }
    changePasswordMutation.mutate({
      userId: passwordDialog.clientId!,
      newPassword: passwordForm.newPassword,
    });
  };

  const handleDeleteClient = async (clientId: number, clientName: string) => {
    if (await window.confirmOperation(language === "ar" ? `هل أنت متأكد من حذف العميل "${clientName}"؟` : `Are you sure you want to delete client "${clientName}"?`, language === "ar" ? "حذف العميل" : "Delete client")) {
      deleteClientMutation.mutate({ userId: clientId });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedClients.length === 0) {
      toast.error(language === "ar" ? "يرجى تحديد عميل واحد على الأقل" : "Please select at least one client");
      return;
    }
    if (await window.confirmOperation(language === "ar" ? `هل أنت متأكد من حذف ${selectedClients.length} عميل؟` : `Are you sure you want to delete ${selectedClients.length} clients?`, language === "ar" ? "حذف العملاء" : "Delete clients")) {
      bulkDeleteMutation.mutate({ ids: selectedClients });
    }
  };

  const handleBulkSuspend = () => {
    if (selectedClients.length === 0) {
      toast.error(language === "ar" ? "يرجى تحديد عميل واحد على الأقل" : "Please select at least one client");
      return;
    }
    bulkSuspendMutation.mutate({ ids: selectedClients });
  };

  const handleBulkActivate = () => {
    if (selectedClients.length === 0) {
      toast.error(language === "ar" ? "يرجى تحديد عميل واحد على الأقل" : "Please select at least one client");
      return;
    }
    bulkActivateMutation.mutate({ ids: selectedClients });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(language === "ar" ? "تم نسخ الكود" : "Code copied");
  };

  const clients = clientsData?.users || [];
  const total = clientsData?.total || 0;
  const totalPages = clientsData?.totalPages || 1;

  if (!user) {
    return (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
    );
  }

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{language === "ar" ? "إدارة العملاء" : "Client Management"}</h1>
            <p className="text-muted-foreground mt-1">
              {language === "ar" ? "إدارة شاملة للعملاء والصلاحيات" : "Comprehensive client and permissions management"}
            </p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            <Users className="w-5 h-5 mr-2" />
            {total} {language === "ar" ? "عميل" : "Clients"}
          </Badge>
        </div>

        {/* Filters & Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder={language === "ar" ? "بحث بالاسم أو البريد أو اسم المستخدم أو الهاتف..." : "Search by name, email, username or phone..."}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === "ar" ? "جميع الحالات" : "All Status"}</SelectItem>
                  <SelectItem value="active">{language === "ar" ? "نشط" : "Active"}</SelectItem>
                  <SelectItem value="suspended">{language === "ar" ? "معلق" : "Suspended"}</SelectItem>
                  <SelectItem value="inactive">{language === "ar" ? "غير نشط" : "Inactive"}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="w-full md:w-auto"
              >
                <Filter className="w-4 h-4 mr-2" />
                {language === "ar" ? "فلاتر متقدمة" : "Advanced Filters"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions Toolbar */}
        {selectedClients.length > 0 && (
          <Alert>
            <AlertDescription className="flex items-center justify-between">
              <span className="font-medium">
                {language === "ar" ? `تم تحديد ${selectedClients.length} عميل` : `${selectedClients.length} clients selected`}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleBulkActivate} disabled={bulkActivateMutation.isPending}>
                  {bulkActivateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {language === "ar" ? "تفعيل" : "Activate"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleBulkSuspend} disabled={bulkSuspendMutation.isPending}>
                  {bulkSuspendMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <XCircle className="w-4 h-4 mr-2" />
                  {language === "ar" ? "تعليق" : "Suspend"}
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleteMutation.isPending}>
                  {bulkDeleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Trash2 className="w-4 h-4 mr-2" />
                  {language === "ar" ? "حذف" : "Delete"}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Clients Table */}
        <Card>
          <CardHeader>
            <CardTitle>{language === "ar" ? "قائمة العملاء" : "Clients List"}</CardTitle>
            <CardDescription>
              {language === "ar" ? "عرض وإدارة جميع العملاء في النظام" : "View and manage all clients in the system"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : clients.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{language === "ar" ? "لا يوجد عملاء" : "No clients found"}</p>
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedClients.length === clients.length && clients.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>{language === "ar" ? "الاسم / المستخدم" : "Name / Username"}</TableHead>
                      <TableHead>{language === "ar" ? "البريد الإلكتروني" : "Email"}</TableHead>
                      <TableHead>{language === "ar" ? "الهاتف" : "Phone"}</TableHead>
                      <TableHead>{language === "ar" ? "الرصيد" : "Balance"}</TableHead>
                      <TableHead>{language === "ar" ? "الحالة" : "Status"}</TableHead>
                      <TableHead>{language === "ar" ? "آخر دخول" : "Last Login"}</TableHead>
                      <TableHead>{language === "ar" ? "تاريخ الإنشاء" : "Created At"}</TableHead>
                      <TableHead className="text-right">{language === "ar" ? "الإجراءات" : "Actions"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client: any) => (
                      <TableRow key={client.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedClients.includes(client.id)}
                            onCheckedChange={(checked) => handleSelectClient(client.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{client.name || "-"}</span>
                            <span className="text-xs text-muted-foreground">@{client.username}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{client.email}</span>
                            {!client.emailVerified && (
                              <Badge variant="outline" className="text-xs w-fit mt-1 text-orange-500 border-orange-300">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {language === "ar" ? "غير مفعّل" : "Not Verified"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{client.phone || "-"}</TableCell>
                        <TableCell>
                          <span className={`font-medium ${(client.balance || 0) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {Number(client.balance || 0).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {client.status === "active" && (
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {language === "ar" ? "نشط" : "Active"}
                            </Badge>
                          )}
                          {client.status === "suspended" && (
                            <Badge variant="destructive">
                              <XCircle className="w-3 h-3 mr-1" />
                              {language === "ar" ? "معلق" : "Suspended"}
                            </Badge>
                          )}
                          {client.status === "inactive" && (
                            <Badge variant="secondary">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {language === "ar" ? "غير نشط" : "Inactive"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {client.lastSignedIn ? _fmtDateLib(client.lastSignedIn) : "-"}
                        </TableCell>
                        <TableCell>{_fmtDateLib(client.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditClient(client)}>
                                <Edit className="w-4 h-4 mr-2" />
                                {language === "ar" ? "تعديل البيانات" : "Edit Details"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setPasswordDialog({ open: true, clientId: client.id, clientName: client.name })}>
                                <Key className="w-4 h-4 mr-2" />
                                {language === "ar" ? "تغيير كلمة المرور" : "Change Password"}
                              </DropdownMenuItem>
                              {!client.emailVerified && (
                                <DropdownMenuItem onClick={() => { setShowVerificationCode(false); setActivationDialog({ open: true, client }); }}>
                                  <UserCheck className="w-4 h-4 mr-2" />
                                  {language === "ar" ? "تفعيل الحساب" : "Activate Account"}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setPermissionsDialog({ open: true, clientId: client.id, clientName: client.name })}>
                                <Shield className="w-4 h-4 mr-2" />
                                {language === "ar" ? "إدارة الصلاحيات" : "Manage Permissions"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-orange-500 focus:text-orange-500 font-medium"
                                onClick={async () => {
                                  if (await window.confirmOperation(
                                    language === "ar"
                                      ? `ستدخل كـ "${client.name || client.username}" وترى كل شيء بعينيه. متأكد؟`
                                      : `You will login as "${client.name || client.username}". Confirm?`
                                  , language === "ar" ? "الدخول كعميل" : "Login as client", "primary")) {
                                    impersonateUser.mutate({ targetUserId: client.id });
                                  }
                                }}
                                disabled={impersonateUser.isPending}
                              >
                                <LogIn className="w-4 h-4 mr-2" />
                                {language === "ar" ? "دخول كـ هذا العميل" : "Login as this client"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteClient(client.id, client.name)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {language === "ar" ? "حذف" : "Delete"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    {language === "ar" 
                      ? `عرض ${(page - 1) * LIMIT + 1} - ${Math.min(page * LIMIT, total)} من ${total}`
                      : `Showing ${(page - 1) * LIMIT + 1} - ${Math.min(page * LIMIT, total)} of ${total}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <span className="text-sm">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Edit Client Dialog */}
        <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog({ open, client: null })}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{language === "ar" ? "تعديل بيانات العميل" : "Edit Client Details"}</DialogTitle>
              <DialogDescription>
                {language === "ar" ? "تحديث معلومات العميل الأساسية" : "Update client basic information"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{language === "ar" ? "الاسم الكامل" : "Full Name"}</Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div>
                  <Label>{language === "ar" ? "اسم المستخدم" : "Username"}</Label>
                  <Input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} placeholder="username" />
                </div>
              </div>
              <div>
                <Label>{language === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div>
                <Label>{language === "ar" ? "رقم الجوال" : "Phone"}</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="0590000000" />
              </div>
              <div>
                <Label>{language === "ar" ? "العنوان" : "Address"}</Label>
                <Textarea value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              </div>
              <div>
                <Label>{language === "ar" ? "الحالة" : "Status"}</Label>
                <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value as 'active' | 'suspended' | 'inactive' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{language === "ar" ? "نشط" : "Active"}</SelectItem>
                    <SelectItem value="suspended">{language === "ar" ? "معلق" : "Suspended"}</SelectItem>
                    <SelectItem value="inactive">{language === "ar" ? "غير نشط" : "Inactive"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialog({ open: false, client: null })}>
                {language === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateClientMutation.isPending}>
                {updateClientMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {language === "ar" ? "حفظ" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Password Dialog */}
        <Dialog open={passwordDialog.open} onOpenChange={(open) => setPasswordDialog({ open, clientId: null, clientName: "" })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language === "ar" ? "تغيير كلمة المرور" : "Change Password"}</DialogTitle>
              <DialogDescription>
                {language === "ar" ? `تغيير كلمة مرور العميل: ${passwordDialog.clientName}` : `Change password for client: ${passwordDialog.clientName}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{language === "ar" ? "كلمة المرور الجديدة" : "New Password"}</Label>
                <Input 
                  type="password" 
                  value={passwordForm.newPassword} 
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} 
                  placeholder={language === "ar" ? "أدخل كلمة المرور الجديدة" : "Enter new password"}
                />
              </div>
              <div>
                <Label>{language === "ar" ? "تأكيد كلمة المرور" : "Confirm Password"}</Label>
                <Input 
                  type="password" 
                  value={passwordForm.confirmPassword} 
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} 
                  placeholder={language === "ar" ? "أعد إدخال كلمة المرور" : "Re-enter password"}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPasswordDialog({ open: false, clientId: null, clientName: "" })}>
                {language === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {language === "ar" ? "تغيير" : "Change"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Activation Dialog */}
        <Dialog open={activationDialog.open} onOpenChange={(open) => setActivationDialog({ open, client: null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language === "ar" ? "تفعيل حساب العميل" : "Activate Client Account"}</DialogTitle>
              <DialogDescription>
                {language === "ar" 
                  ? `الحساب: ${activationDialog.client?.name} (@${activationDialog.client?.username})`
                  : `Account: ${activationDialog.client?.name} (@${activationDialog.client?.username})`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Verification Code Section */}
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <p className="text-sm font-medium">
                  {language === "ar" ? "كود التفعيل المُرسَل للعميل:" : "Verification code sent to client:"}
                </p>
                {isLoadingCode ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">{language === "ar" ? "جاري التحميل..." : "Loading..."}</span>
                  </div>
                ) : verificationData?.code ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-background border rounded text-center font-mono text-lg tracking-widest">
                      {showVerificationCode ? verificationData.code : "••••••"}
                    </code>
                    <Button variant="ghost" size="sm" onClick={() => setShowVerificationCode(!showVerificationCode)}>
                      {showVerificationCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleCopyCode(verificationData.code!)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {language === "ar" ? "لا يوجد كود تفعيل نشط" : "No active verification code"}
                  </p>
                )}
                {verificationData?.expires && (
                  <p className="text-xs text-muted-foreground">
                    {language === "ar" ? `ينتهي: ${_fmtDateLib(verificationData.expires)}` : `Expires: ${_fmtDateLib(verificationData.expires)}`}
                  </p>
                )}
              </div>

              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  {language === "ar" 
                    ? "التفعيل اليدوي سيُفعّل الحساب فوراً دون الحاجة لكود التفعيل."
                    : "Manual activation will immediately activate the account without requiring the verification code."}
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActivationDialog({ open: false, client: null })}>
                {language === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button 
                onClick={() => forceActivateMutation.mutate({ userId: activationDialog.client!.id })}
                disabled={forceActivateMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {forceActivateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <UserCheck className="w-4 h-4 mr-2" />
                {language === "ar" ? "تفعيل يدوي" : "Force Activate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Permissions Management Dialog */}
        <Dialog open={permissionsDialog.open} onOpenChange={(open) => setPermissionsDialog({ open, clientId: null, clientName: "" })}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{language === "ar" ? "إدارة الصلاحيات" : "Manage Permissions"}</DialogTitle>
              <DialogDescription>
                {language === "ar" ? `إدارة صلاحيات العميل: ${permissionsDialog.clientName}` : `Manage permissions for client: ${permissionsDialog.clientName}`}
              </DialogDescription>
            </DialogHeader>
            
            <Tabs value={permissionsTab} onValueChange={setPermissionsTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="plan">{language === "ar" ? "خطة الصلاحيات" : "Permission Plan"}</TabsTrigger>
                <TabsTrigger value="overrides">{language === "ar" ? "تجاوزات" : "Overrides"}</TabsTrigger>
                <TabsTrigger value="features">{language === "ar" ? "الميزات" : "Features"}</TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="space-y-4">
                <div>
                  <Label>{language === "ar" ? "اختر خطة الصلاحيات" : "Select Permission Plan"}</Label>
                  <Select value={selectedPlanId?.toString() || ""} onValueChange={(value) => setSelectedPlanId(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder={language === "ar" ? "اختر خطة..." : "Select plan..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {plans?.map((plan: any) => (
                        <SelectItem key={plan.id} value={plan.id.toString()}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedPlanId && (
                  <Alert>
                    <AlertDescription>
                      {language === "ar" ? "سيتم تطبيق جميع صلاحيات هذه الخطة على العميل" : "All permissions from this plan will be applied to the client"}
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="overrides" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {language === "ar" ? "تجاوز صلاحيات محددة للعميل (أولوية أعلى من الخطة)" : "Override specific permissions for the client (higher priority than plan)"}
                </p>
                {permissionGroups?.map((group: any) => (
                  <Card key={group.id}>
                    <CardHeader>
                      <CardTitle className="text-base">{group.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4">
                        {["view", "create", "edit", "delete"].map((action) => (
                          <div key={action} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`${group.id}-${action}`}
                              checked={(permissionOverrides[group.id] as any)?.[action] || false}
                              onCheckedChange={(checked) => setPermissionOverrides({
                                ...permissionOverrides,
                                [group.id]: { ...permissionOverrides[group.id], [action]: checked as boolean }
                              })}
                            />
                            <label htmlFor={`${group.id}-${action}`} className="text-sm">
                              {action === "view" && (language === "ar" ? "عرض" : "View")}
                              {action === "create" && (language === "ar" ? "إنشاء" : "Create")}
                              {action === "edit" && (language === "ar" ? "تعديل" : "Edit")}
                              {action === "delete" && (language === "ar" ? "حذف" : "Delete")}
                            </label>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="features" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {language === "ar" ? "تفعيل أو تعطيل ميزات معينة للعميل" : "Enable or disable specific features for the client"}
                </p>
                <div className="space-y-3">
                  {["vpn_access", "api_access", "bulk_operations", "export_reports", "advanced_filters"].map((feature) => (
                    <div key={feature} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">
                          {feature === "vpn_access" && (language === "ar" ? "الوصول إلى VPN" : "VPN Access")}
                          {feature === "api_access" && (language === "ar" ? "الوصول إلى API" : "API Access")}
                          {feature === "bulk_operations" && (language === "ar" ? "العمليات الجماعية" : "Bulk Operations")}
                          {feature === "export_reports" && (language === "ar" ? "تصدير التقارير" : "Export Reports")}
                          {feature === "advanced_filters" && (language === "ar" ? "الفلاتر المتقدمة" : "Advanced Filters")}
                        </p>
                      </div>
                      <Checkbox 
                        checked={featureAccess[feature] || false}
                        onCheckedChange={(checked) => setFeatureAccess({ ...featureAccess, [feature]: checked as boolean })}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPermissionsDialog({ open: false, clientId: null, clientName: "" })}>
                {language === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button onClick={() => {
                toast.success(language === "ar" ? "تم حفظ الصلاحيات بنجاح" : "Permissions saved successfully");
                setPermissionsDialog({ open: false, clientId: null, clientName: "" });
              }}>
                {language === "ar" ? "حفظ الصلاحيات" : "Save Permissions"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
