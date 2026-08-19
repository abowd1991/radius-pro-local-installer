import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  AlertTriangle,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Ban,
  Trash2,
  Calendar,
  RefreshCw,
  Shield,
  Store,
  User,
  Mail,
  Phone,
  Building,
  CreditCard,
  Server,
  Activity,
  LogIn,
  Send,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate as formatDisplayDate, parseDbDate } from '@/lib/dateFormat';


type UserStatus = "all" | "active" | "inactive" | "suspended";
type UserRole = "all" | "owner" | "super_admin" | "client_owner" | "client_admin" | "client_staff" | "reseller" | "client" | "support";

// Helper function to generate random password
function generateRandomPassword(): string {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

export default function UsersManagement() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<UserStatus>("all");
  const [roleFilter, setRoleFilter] = useState<UserRole>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [extendDays, setExtendDays] = useState(30);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newClientData, setNewClientData] = useState({ name: "", email: "", phone: "", password: "", role: "client" as "client" | "reseller", activationDelivery: "none" as "none" | "email" | "sms" | "both" });
  const [newPassword, setNewPassword] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<any>(null);
  const [showPortQuotaDialog, setShowPortQuotaDialog] = useState(false);
  const [portQuotaValue, setPortQuotaValue] = useState(10);
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [activationDelivery, setActivationDelivery] = useState<"email" | "sms" | "both">("email");

  // Fetch all users
  const { data: _usersListData, isLoading, refetch } = trpc.users.list.useQuery({});
  const allUsers: any[] | undefined = (_usersListData as any)?.users ?? (_usersListData as any);

  const portQuotaQuery = trpc.portForwarding.adminQuota.useQuery(
    { ownerId: selectedUser?.id ?? 1 },
    { enabled: Boolean(showPortQuotaDialog && selectedUser?.id) },
  );

  useEffect(() => {
    if (portQuotaQuery.data) setPortQuotaValue(portQuotaQuery.data.limit);
  }, [portQuotaQuery.data]);

  // Mutations
  const suspendMutation = trpc.users.suspendClient.useMutation({
    onSuccess: () => {
      toast.success("تم تعليق الحساب بنجاح");
      refetch();
      setSelectedUser(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const activateMutation = trpc.users.activateClient.useMutation({
    onSuccess: () => {
      toast.success("تم تفعيل الحساب بنجاح");
      refetch();
      setSelectedUser(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const forceActivateMutation = trpc.users.forceActivateClient.useMutation({
    onSuccess: () => {
      toast.success("تم قبول تفعيل الحساب بنجاح");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const extendMutation = trpc.users.extendSubscription.useMutation({
    onSuccess: () => {
      toast.success(`تم تمديد الاشتراك ${extendDays} يوم`);
      refetch();
      setShowExtendDialog(false);
      setSelectedUser(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const changeRoleMutation = trpc.users.changeRole.useMutation({
    onSuccess: () => {
      toast.success("تم تغيير الدور بنجاح");
      refetch();
      setShowRoleDialog(false);
      setSelectedUser(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createClientMutation = trpc.users.createClientByAdmin.useMutation({
    onSuccess: (data) => {
      setCreatedCredentials(data);
      toast.success("تم إنشاء العميل بنجاح");
      refetch();
      setNewClientData({ name: "", email: "", phone: "", password: "", role: "client", activationDelivery: "none" });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const changePasswordMutation = trpc.users.changeClientPassword.useMutation({
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور بنجاح");
      setShowPasswordDialog(false);
      setSelectedUser(null);
      setNewPassword("");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateUserMutation = trpc.users.updateClientByAdmin.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث بيانات المستخدم بنجاح");
      setEditingUser(null);
      setShowDeleteDialog(false);
      setSelectedUser(null);
      refetch();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const impersonateMutation = trpc.auth.impersonateUser.useMutation({
    onSuccess: () => window.location.assign("/dashboard"),
    onError: (error) => toast.error(error.message),
  });

  const sendActivationMutation = trpc.users.sendClientActivation.useMutation({
    onSuccess: (data) => {
      toast.success(`تم إرسال التفعيل عبر ${data.delivered.join(" و ")}`);
      setShowActivationDialog(false);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const setPortQuotaMutation = trpc.portForwarding.setAdminQuota.useMutation({
    onSuccess: (quota) => {
      toast.success(`تم ضبط حصة التوجيه: ${quota.limit} منفذاً`);
      portQuotaQuery.refetch();
      setShowPortQuotaDialog(false);
    },
    onError: (error) => toast.error(error.message),
  });

  // Filter users
  const filteredUsers = allUsers?.filter((u: any) => {
    // Role filter
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        u.name?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
        u.username?.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  // Stats
  const stats = {
    total: allUsers?.length || 0,
    active: allUsers?.filter((u: any) => u.status === "active").length || 0,
    inactive: allUsers?.filter((u: any) => u.status === "inactive").length || 0,
    suspended: allUsers?.filter((u: any) => u.status === "suspended").length || 0,
    incomplete: allUsers?.filter((u: any) => !u.name || !u.email).length || 0,
    clients: allUsers?.filter((u: any) => u.role === "client").length || 0,
    resellers: allUsers?.filter((u: any) => u.role === "reseller").length || 0,
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">نشط</Badge>;
      case "suspended":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">موقوف</Badge>;
      case "inactive":
        return <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30">غير نشط</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">غير معروف</Badge>;
    }
  };

  // Get role badge
  const getRoleBadge = (role: string) => {
    switch (role) {
      case "client":
        return <Badge variant="outline" className="border-purple-500/30 text-purple-400">عميل</Badge>;
      case "reseller":
        return <Badge variant="outline" className="border-orange-500/30 text-orange-400">موزع</Badge>;
      case "super_admin":
        return <Badge variant="outline" className="border-red-500/30 text-red-400">مدير</Badge>;
      case "owner":
        return <Badge variant="outline" className="border-cyan-500/30 text-cyan-300">مالك النظام</Badge>;
      case "client_owner":
        return <Badge variant="outline" className="border-sky-500/30 text-sky-300">مالك شركة</Badge>;
      case "client_admin":
        return <Badge variant="outline" className="border-indigo-500/30 text-indigo-300">مدير شركة</Badge>;
      case "client_staff":
        return <Badge variant="outline" className="border-slate-500/30 text-slate-300">موظف شركة</Badge>;
      case "support":
        return <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">دعم فني</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const formatUserDate = (date: string | null | Date) => {
    if (!date) return "-";
    return formatDisplayDate(parseDbDate(date) ?? new Date(date));
  };

  if (user?.role !== "super_admin" && user?.role !== "owner") {
    return (
        <div className="flex items-center justify-center h-96">
          <p className="text-slate-400">غير مصرح لك بالوصول لهذه الصفحة</p>
        </div>
    );
  }

  return (
      <div className="users-management-page space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">المستخدمون</h2>
            <p className="text-slate-400 mt-1">إضافة وتعديل وإدارة جميع المستخدمين في النظام</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <User className="h-4 w-4 ml-2" />
              إضافة مستخدم
            </Button>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 ml-2" />
              تحديث
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-700 rounded-lg">
                  <Users className="h-5 w-5 text-slate-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.total}</p>
                  <p className="text-xs text-slate-400">إجمالي</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.inactive}</p>
                  <p className="text-xs text-slate-400">غير نشط</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <UserCheck className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.active}</p>
                  <p className="text-xs text-slate-400">نشط</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <Ban className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.suspended}</p>
                  <p className="text-xs text-slate-400">موقوف</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {stats.incomplete > 0 && (
            <Card className="bg-red-900/20 border-red-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/20 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-400">{stats.incomplete}</p>
                    <p className="text-xs text-red-400">ناقص بيانات</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Filters */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="بحث بالاسم أو البريد أو اسم المستخدم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
              
              {/* Role Filter */}
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as UserRole)}>
                <SelectTrigger className="w-[150px] bg-slate-700/50 border-slate-600 text-white">
                  <SelectValue placeholder="الدور" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="owner">مالك النظام</SelectItem>
                  <SelectItem value="super_admin">مدير النظام</SelectItem>
                  <SelectItem value="client_owner">مالك شركة</SelectItem>
                  <SelectItem value="client_admin">مدير عميل</SelectItem>
                  <SelectItem value="client_staff">موظف شركة</SelectItem>
                  <SelectItem value="reseller">موزع</SelectItem>
                  <SelectItem value="client">عميل</SelectItem>
                  <SelectItem value="support">دعم فني</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UserStatus)}>
          <TabsList className="bg-slate-800 border border-slate-700">
            <TabsTrigger value="all" className="data-[state=active]:bg-slate-700">
              الكل ({stats.total})
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-green-600">
              نشط ({stats.active})
            </TabsTrigger>
            <TabsTrigger value="inactive" className="data-[state=active]:bg-blue-600">
              غير نشط ({stats.inactive})
            </TabsTrigger>
            <TabsTrigger value="suspended" className="data-[state=active]:bg-yellow-600">
              موقوف ({stats.suspended})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6 space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-12 text-center">
                    <Users className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">لا يوجد مستخدمين</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 hover:bg-transparent">
                        <TableHead className="text-slate-400">الاسم</TableHead>
                        <TableHead className="text-slate-400">البريد</TableHead>
                        <TableHead className="text-slate-400">الدور</TableHead>
                        <TableHead className="text-slate-400">الحالة</TableHead>
                        <TableHead className="text-slate-400">رقم الهاتف</TableHead>
                        <TableHead className="text-slate-400">كود التفعيل</TableHead>
                        <TableHead className="text-slate-400">آخر دخول</TableHead>
                        <TableHead className="text-slate-400 text-left">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u: any) => {
                        const isIncomplete = !u.name || !u.email;
                        
                        return (
                          <TableRow 
                            key={u.id} 
                            className={`border-slate-700 hover:bg-slate-700/30 ${isIncomplete ? 'bg-red-900/10' : ''}`}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {isIncomplete && (
                                  <AlertTriangle className="h-4 w-4 text-red-400" />
                                )}
                                <span className="text-white font-medium">
                                  {u.name || <span className="text-red-400 italic">بدون اسم</span>}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500">@{u.username}</span>
                            </TableCell>
                            <TableCell>
                              {u.email ? (
                                <span className="text-slate-300">{u.email}</span>
                              ) : (
                                <span className="text-red-400 italic">بدون بريد</span>
                              )}
                            </TableCell>
                            <TableCell>{getRoleBadge(u.role)}</TableCell>
                            <TableCell>{getStatusBadge(u.status)}</TableCell>
                            <TableCell>
                              <span className="text-slate-300">{u.phone || "-"}</span>
                            </TableCell>
                            <TableCell>
                              {!u.emailVerified ? (
                                <div className="flex flex-col gap-1.5 min-w-[126px]">
                                  {u.activationCode?.code ? (
                                    <code className={`w-fit rounded px-2 py-1 text-xs font-bold tracking-widest ${u.activationCode.state === "active" ? "bg-cyan-500/15 text-cyan-300" : "bg-amber-500/15 text-amber-300"}`}>
                                      {u.activationCode.code}
                                    </code>
                                  ) : (
                                    <span className="text-xs text-slate-500">لم يُنشأ كود</span>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => forceActivateMutation.mutate({ userId: u.id })}
                                    disabled={forceActivateMutation.isPending}
                                    className="h-7 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15"
                                  >
                                    <UserCheck className="h-3.5 w-3.5 ml-1" />
                                    قبول التفعيل
                                  </Button>
                                  {u.activationCode?.state === "expired" && <span className="text-[10px] text-amber-400">الكود منتهي؛ أرسل كوداً جديداً عند الحاجة</span>}
                                </div>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-slate-400 text-sm">
                                {formatUserDate(u.lastSignedIn)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUser(u);
                                      setShowDetailsDialog(true);
                                    }}
                                    className="text-slate-200 focus:bg-slate-700"
                                  >
                                    <Eye className="h-4 w-4 ml-2" />
                                    عرض التفاصيل
                                  </DropdownMenuItem>
                                  {!['owner', 'super_admin'].includes(u.role) && (
                                    <DropdownMenuItem
                                      onClick={() => impersonateMutation.mutate({ targetUserId: u.id })}
                                      className="text-emerald-300 focus:bg-slate-700"
                                    >
                                      <LogIn className="h-4 w-4 ml-2" />
                                      الدخول للوحة العميل
                                    </DropdownMenuItem>
                                  )}
                                  {!['owner', 'super_admin'].includes(u.role) && (
                                    <DropdownMenuItem
                                      onClick={() => setEditingUser({
                                        id: u.id,
                                        name: u.name || "",
                                        username: u.username || "",
                                        email: u.email || "",
                                        phone: u.phone || "",
                                        address: u.address || "",
                                        status: ['active', 'suspended', 'inactive'].includes(u.status) ? u.status : 'active',
                                      })}
                                      className="text-sky-300 focus:bg-slate-700"
                                    >
                                      <Edit className="h-4 w-4 ml-2" />
                                      تعديل بيانات المستخدم
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUser(u);
                                      setShowExtendDialog(true);
                                    }}
                                    className="text-slate-200 focus:bg-slate-700"
                                  >
                                    <Calendar className="h-4 w-4 ml-2" />
                                    تمديد الاشتراك
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-slate-700" />
                                  {u.accountStatus === "suspended" ? (
                                    <DropdownMenuItem
                                      onClick={() => activateMutation.mutate({ userId: u.id })}
                                      className="text-green-400 focus:bg-slate-700"
                                    >
                                      <UserCheck className="h-4 w-4 ml-2" />
                                      تفعيل الحساب
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      onClick={() => suspendMutation.mutate({ userId: u.id })}
                                      className="text-yellow-400 focus:bg-slate-700"
                                    >
                                      <Ban className="h-4 w-4 ml-2" />
                                      تعليق الحساب
                                    </DropdownMenuItem>
                                  )}
                                  {!u.emailVerified && !['owner', 'super_admin'].includes(u.role) && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedUser(u);
                                        setActivationDelivery(u.phone ? "both" : "email");
                                        setShowActivationDialog(true);
                                      }}
                                      className="text-cyan-300 focus:bg-slate-700"
                                    >
                                      <Send className="h-4 w-4 ml-2" />
                                      إرسال تفعيل الحساب
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUser(u);
                                      setNewRole(u.role || "");
                                      setShowRoleDialog(true);
                                    }}
                                    className="text-blue-400 focus:bg-slate-700"
                                  >
                                    <Shield className="h-4 w-4 ml-2" />
                                    تغيير الدور
                                  </DropdownMenuItem>
                                  {!['owner', 'super_admin'].includes(u.role) && (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedUser(u);
                                        setPortQuotaValue(10);
                                        setShowPortQuotaDialog(true);
                                      }}
                                      className="text-cyan-300 focus:bg-slate-700"
                                    >
                                      <Server className="h-4 w-4 ml-2" />
                                      حصة التوجيه الخارجي
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedUser(u);
                                      setNewPassword("");
                                      setShowPasswordDialog(true);
                                    }}
                                    className="text-purple-400 focus:bg-slate-700"
                                  >
                                    <CreditCard className="h-4 w-4 ml-2" />
                                    تغيير كلمة المرور
                                  </DropdownMenuItem>
                                  {!['owner', 'super_admin'].includes(u.role) && (
                                    <>
                                      <DropdownMenuSeparator className="bg-slate-700" />
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setSelectedUser(u);
                                          setShowDeleteDialog(true);
                                        }}
                                        className="text-red-400 focus:bg-slate-700"
                                      >
                                        <Trash2 className="h-4 w-4 ml-2" />
                                        أرشفة المستخدم
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">تفاصيل المستخدم</DialogTitle>
              <DialogDescription className="text-slate-400">
                معلومات تفصيلية عن {selectedUser?.name || selectedUser?.username}
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs">الاسم الكامل</Label>
                    <p className="text-white">{selectedUser.name || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs">اسم المستخدم</Label>
                    <p className="text-white">@{selectedUser.username}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs">البريد الإلكتروني</Label>
                    <p className="text-white">{selectedUser.email || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs">رقم الهاتف</Label>
                    <p className="text-white">{selectedUser.phone || "-"}</p>
                  </div>
                </div>

                {/* Status Info */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-slate-900/50 rounded-lg">
                  <div className="text-center">
                    <p className="text-slate-400 text-xs mb-1">الدور</p>
                    {getRoleBadge(selectedUser.role)}
                  </div>
                  <div className="text-center">
                    <p className="text-slate-400 text-xs mb-1">الحالة</p>
                    {getStatusBadge(selectedUser.status)}
                  </div>
                  <div className="text-center">
                    <p className="text-slate-400 text-xs mb-1">خطة الصلاحيات</p>
                    <span className="text-white">{selectedUser.permissionPlanId ? `#${selectedUser.permissionPlanId}` : "-"}</span>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs">تاريخ التسجيل</Label>
                    <p className="text-white">{formatUserDate(selectedUser.createdAt)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-400 text-xs">آخر دخول</Label>
                    <p className="text-white">{formatUserDate(selectedUser.lastSignedIn)}</p>
                  </div>
                </div>

                {/* Usage Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className="bg-slate-900/50 border-slate-700">
                    <CardContent className="p-3 text-center">
                      <Server className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-white">{selectedUser.nasCount || 0}</p>
                      <p className="text-xs text-slate-400">أجهزة NAS</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-slate-900/50 border-slate-700">
                    <CardContent className="p-3 text-center">
                      <CreditCard className="h-5 w-5 text-green-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-white">{selectedUser.cardsCount || 0}</p>
                      <p className="text-xs text-slate-400">الكروت</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-slate-900/50 border-slate-700">
                    <CardContent className="p-3 text-center">
                      <Activity className="h-5 w-5 text-purple-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-white">{selectedUser.activeSessionsCount || 0}</p>
                      <p className="text-xs text-slate-400">جلسات نشطة</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Extend Dialog */}
        <Dialog open={showExtendDialog} onOpenChange={setShowExtendDialog}>
          <DialogContent className="bg-slate-800 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">تمديد الاشتراك</DialogTitle>
              <DialogDescription className="text-slate-400">
                تمديد اشتراك {selectedUser?.name || selectedUser?.username}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-200">عدد الأيام</Label>
                <Select value={extendDays.toString()} onValueChange={(v) => setExtendDays(parseInt(v))}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 أيام</SelectItem>
                    <SelectItem value="14">14 يوم</SelectItem>
                    <SelectItem value="30">30 يوم (شهر)</SelectItem>
                    <SelectItem value="90">90 يوم (3 أشهر)</SelectItem>
                    <SelectItem value="180">180 يوم (6 أشهر)</SelectItem>
                    <SelectItem value="365">365 يوم (سنة)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExtendDialog(false)}>
                إلغاء
              </Button>
              <Button
                onClick={() => selectedUser && extendMutation.mutate({ userId: selectedUser.id, days: extendDays })}
                disabled={extendMutation.isPending}
              >
                {extendMutation.isPending ? "جارٍ التمديد..." : "تمديد"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Port Forwarding Quota Dialog */}
        <Dialog open={showPortQuotaDialog} onOpenChange={setShowPortQuotaDialog}>
          <DialogContent className="bg-slate-800 border-slate-700" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-white">حصة التوجيه الخارجي</DialogTitle>
              <DialogDescription className="text-slate-400">
                {selectedUser?.name || selectedUser?.username}: الحد الأقصى للتوجيهات التي يمكنه حجزها من المنافذ الحرة.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                {portQuotaQuery.isLoading ? "جاري قراءة الحصة الحالية..." : `المستخدم حالياً: ${portQuotaQuery.data?.used ?? 0} من ${portQuotaQuery.data?.limit ?? 10} توجيهات. الحذف يحرر المنفذ، والإيقاف يبقيه محجوزاً.`}
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">الحد الأقصى للتوجيهات</Label>
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={portQuotaValue}
                  onChange={(event) => setPortQuotaValue(Number(event.target.value))}
                  className="bg-slate-900 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-400">يمكن زيادته في أي وقت. لا يقبل النظام قيمة أقل من عدد التوجيهات الموجودة للعميل.</p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button
                onClick={() => selectedUser && setPortQuotaMutation.mutate({ ownerId: selectedUser.id, maxForwards: portQuotaValue })}
                disabled={setPortQuotaMutation.isPending || !Number.isInteger(portQuotaValue) || portQuotaValue < 1 || portQuotaValue > 1000}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                {setPortQuotaMutation.isPending ? "جاري الحفظ..." : "حفظ الحصة"}
              </Button>
              <Button variant="outline" onClick={() => setShowPortQuotaDialog(false)}>إلغاء</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Role Dialog */}
        <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
          <DialogContent className="bg-slate-800 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">تغيير الدور</DialogTitle>
              <DialogDescription className="text-slate-400">
                تغيير دور المستخدم {selectedUser?.name || selectedUser?.username}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-200">الدور الجديد</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                    <SelectValue placeholder="اختر الدور" />
                  </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">مالك النظام (Owner)</SelectItem>
                      <SelectItem value="super_admin">مدير النظام (Super Admin)</SelectItem>
                      <SelectItem value="client_owner">مالك شركة (Client Owner)</SelectItem>
                      <SelectItem value="client_admin">مدير عميل (Client Admin)</SelectItem>
                      <SelectItem value="client_staff">موظف شركة (Client Staff)</SelectItem>
                    <SelectItem value="reseller">موزع (Reseller)</SelectItem>
                    <SelectItem value="client">عميل (Client)</SelectItem>
                    <SelectItem value="support">دعم فني (Support)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-slate-400 space-y-1">
                <p><strong>عميل:</strong> صلاحيات محدودة لإدارة شبكته فقط</p>
                <p><strong>موزع:</strong> يمكنه إنشاء كروت وإدارة عملائه</p>
                <p><strong>مدير:</strong> صلاحيات كاملة على النظام</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
                إلغاء
              </Button>
              <Button
                onClick={() => selectedUser && newRole && changeRoleMutation.mutate({ userId: selectedUser.id, role: newRole as any })}
                disabled={changeRoleMutation.isPending || !newRole}
              >
                {changeRoleMutation.isPending ? "جارٍ التغيير..." : "تغيير الدور"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create User Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) {
            setCreatedCredentials(null);
            setNewClientData({ name: "", email: "", phone: "", password: "", role: "client", activationDelivery: "none" });
          }
        }}>
          <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-white">إضافة مستخدم</DialogTitle>
              <DialogDescription className="text-slate-400">
                إنشاء حساب عميل أو موزع من قبل المدير
              </DialogDescription>
            </DialogHeader>
            {createdCredentials ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
                  <h3 className="text-green-400 font-semibold mb-3">✅ تم إنشاء المستخدم بنجاح!</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">الاسم:</span>
                      <span className="text-white">{newClientData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">البريد الإلكتروني:</span>
                      <span className="text-white">{createdCredentials.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">اسم المستخدم:</span>
                      <span className="text-white">{createdCredentials.username}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">كلمة المرور:</span>
                      <div className="flex gap-2 items-center">
                        <span className="text-white font-mono bg-slate-900 px-2 py-1 rounded">{createdCredentials.password}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(createdCredentials.password);
                            toast.success("تم نسخ كلمة المرور");
                          }}
                        >
                          نسخ
                        </Button>
                      </div>
                    </div>
                  </div>
                  <p className="text-yellow-400 text-xs mt-3">⚠️ احفظ كلمة المرور الآن! لن تتمكن من رؤيتها مرة أخرى.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-200">الاسم</Label>
                  <Input
                    value={newClientData.name}
                    onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                    className="bg-slate-700/50 border-slate-600 text-white"
                    placeholder="اسم المستخدم"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">البريد الإلكتروني</Label>
                  <Input
                    type="email"
                    value={newClientData.email}
                    onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })}
                    className="bg-slate-700/50 border-slate-600 text-white"
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">رقم الهاتف</Label>
                  <Input
                    value={newClientData.phone}
                    onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
                    className="bg-slate-700/50 border-slate-600 text-white"
                    placeholder="0590000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">كلمة المرور (اختياري)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={newClientData.password}
                      onChange={(e) => setNewClientData({ ...newClientData, password: e.target.value })}
                      className="bg-slate-700/50 border-slate-600 text-white"
                      placeholder="اتركه فارغاً للتوليد التلقائي"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const randomPass = generateRandomPassword();
                        setNewClientData({ ...newClientData, password: randomPass });
                        toast.success("تم توليد كلمة مرور عشوائية");
                      }}
                    >
                      توليد
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400">سيتم توليد كلمة مرور عشوائية قوية إذا تركت الحقل فارغاً</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">الدور</Label>
                  <Select value={newClientData.role} onValueChange={(val: "client" | "reseller") => setNewClientData({ ...newClientData, role: val })}>
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">عميل (Client)</SelectItem>
                      <SelectItem value="reseller">موزع (Reseller)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200">تفعيل الحساب عند الإنشاء</Label>
                  <Select value={newClientData.activationDelivery} onValueChange={(value: "none" | "email" | "sms" | "both") => setNewClientData({ ...newClientData, activationDelivery: value })}>
                    <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون تفعيل (مفعّل مباشرة)</SelectItem>
                      <SelectItem value="email">إرسال كود بالبريد الإلكتروني</SelectItem>
                      <SelectItem value="sms">إرسال كود عبر SMS</SelectItem>
                      <SelectItem value="both">البريد الإلكتروني وSMS</SelectItem>
                    </SelectContent>
                  </Select>
                  {(["sms", "both"] as const).includes(newClientData.activationDelivery as "sms" | "both") && !newClientData.phone && <p className="text-xs text-amber-300">أدخل رقم هاتف صحيحاً لتفعيل SMS.</p>}
                </div>
              </div>
            )}
            <DialogFooter>
              {createdCredentials ? (
                <Button onClick={() => {
                  setShowCreateDialog(false);
                  setCreatedCredentials(null);
                  setNewClientData({ name: "", email: "", phone: "", password: "", role: "client", activationDelivery: "none" });
                }}>
                  إغلاق
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    إلغاء
                  </Button>
                  <Button
                    onClick={() => createClientMutation.mutate(newClientData)}
                    disabled={createClientMutation.isPending || !newClientData.name || !newClientData.email}
                  >
                    {createClientMutation.isPending ? "جارٍ الإضافة..." : "إضافة المستخدم"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showActivationDialog} onOpenChange={setShowActivationDialog}>
          <DialogContent className="bg-slate-800 border-slate-700" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-white">إرسال تفعيل الحساب</DialogTitle>
              <DialogDescription className="text-slate-400">سيصل كود صالح لمدة 15 دقيقة إلى {selectedUser?.name || selectedUser?.username}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-slate-200">طريقة الإرسال</Label>
              <Select value={activationDelivery} onValueChange={(value: "email" | "sms" | "both") => setActivationDelivery(value)}>
                <SelectTrigger className="bg-slate-700/50 border-slate-600 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">البريد الإلكتروني</SelectItem>
                  <SelectItem value="sms" disabled={!selectedUser?.phone}>SMS</SelectItem>
                  <SelectItem value="both" disabled={!selectedUser?.phone}>البريد الإلكتروني وSMS</SelectItem>
                </SelectContent>
              </Select>
              {!selectedUser?.phone && <p className="text-xs text-amber-300">لا يوجد رقم هاتف محفوظ؛ يتاح التفعيل بالبريد الإلكتروني فقط.</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowActivationDialog(false)}>إلغاء</Button>
              <Button onClick={() => selectedUser && sendActivationMutation.mutate({ userId: selectedUser.id, delivery: activationDelivery })} disabled={sendActivationMutation.isPending}>
                {sendActivationMutation.isPending ? "جارٍ الإرسال..." : "إرسال كود التفعيل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={Boolean(editingUser)} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent className="bg-slate-800 border-slate-700 max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-white">تعديل بيانات المستخدم</DialogTitle>
              <DialogDescription className="text-slate-400">تحديث بيانات الحساب من دون تغيير دوره أو صلاحياته.</DialogDescription>
            </DialogHeader>
            {editingUser && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label className="text-slate-200">الاسم</Label><Input value={editingUser.name} onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} className="bg-slate-700/50 border-slate-600 text-white" /></div>
                <div className="space-y-2"><Label className="text-slate-200">اسم المستخدم</Label><Input value={editingUser.username} onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })} className="bg-slate-700/50 border-slate-600 text-white" /></div>
                <div className="space-y-2"><Label className="text-slate-200">البريد الإلكتروني</Label><Input type="email" value={editingUser.email} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} className="bg-slate-700/50 border-slate-600 text-white" /></div>
                <div className="space-y-2"><Label className="text-slate-200">رقم الهاتف</Label><Input value={editingUser.phone} onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })} className="bg-slate-700/50 border-slate-600 text-white" /></div>
                <div className="space-y-2 sm:col-span-2"><Label className="text-slate-200">العنوان</Label><Input value={editingUser.address} onChange={(e) => setEditingUser({ ...editingUser, address: e.target.value })} className="bg-slate-700/50 border-slate-600 text-white" /></div>
                <div className="space-y-2"><Label className="text-slate-200">الحالة</Label><Select value={editingUser.status} onValueChange={(status) => setEditingUser({ ...editingUser, status })}><SelectTrigger className="bg-slate-700/50 border-slate-600 text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">نشط</SelectItem><SelectItem value="suspended">موقوف</SelectItem><SelectItem value="inactive">غير نشط</SelectItem></SelectContent></Select></div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingUser(null)}>إلغاء</Button>
              <Button onClick={() => editingUser && updateUserMutation.mutate(editingUser)} disabled={updateUserMutation.isPending || !editingUser?.name || !editingUser?.username || !editingUser?.email}>
                {updateUserMutation.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Password Dialog */}
        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent className="bg-slate-800 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">تغيير كلمة المرور</DialogTitle>
              <DialogDescription className="text-slate-400">
                تغيير كلمة مرور المستخدم {selectedUser?.name || selectedUser?.username}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-200">كلمة المرور الجديدة</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-slate-700/50 border-slate-600 text-white"
                    placeholder="أدخل كلمة المرور الجديدة"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const randomPass = generateRandomPassword();
                      setNewPassword(randomPass);
                      toast.success("تم توليد كلمة مرور عشوائية");
                    }}
                  >
                    توليد
                  </Button>
                </div>
                <p className="text-xs text-slate-400">يجب أن تكون كلمة المرور 8 أحرف على الأقل</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
                إلغاء
              </Button>
              <Button
                onClick={() => selectedUser && newPassword && changePasswordMutation.mutate({ userId: selectedUser.id, newPassword })}
                disabled={changePasswordMutation.isPending || !newPassword || newPassword.length < 8}
              >
                {changePasswordMutation.isPending ? "جارٍ التغيير..." : "تغيير كلمة المرور"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Safe archive confirmation — records remain available for audit. */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="bg-slate-800 border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">تأكيد أرشفة المستخدم</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                هل تريد أرشفة المستخدم "{selectedUser?.name || selectedUser?.username}"؟
                <br />
                <span className="text-amber-300 font-medium">
                  سيتوقف دخوله، مع إبقاء الكروت وجلسات المحاسبة وسجل التدقيق محفوظة.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600">
                إلغاء
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedUser && updateUserMutation.mutate({ userId: selectedUser.id, status: "inactive" })}
                className="bg-amber-600 hover:bg-amber-700"
                disabled={updateUserMutation.isPending}
              >
                {updateUserMutation.isPending ? "جارٍ الأرشفة..." : "أرشفة المستخدم"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}
