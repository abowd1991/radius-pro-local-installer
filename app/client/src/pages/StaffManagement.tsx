import { useEffect, useMemo, useState } from "react";
import { parseDbDate } from '@/lib/dateFormat';
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Pencil, Trash2, Users, Search, Download, ArrowUpDown, ShieldCheck, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";

/**
 * Staff Management Page
 * 
 * Allows client_owner to create and manage sub-admins (staff members)
 * Sub-admins can be client_admin or client_staff with limited permissions
 * 
 * Features:
 * - Filter by role (client_owner / client_admin / client_staff)
 * - Search by name or email
 * - Sort by name, email, role, or created date
 * - Export to CSV
 */
export default function StaffManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPermissionDialogOpen, setIsPermissionDialogOpen] = useState(false);
  const [isCredentialsDialogOpen, setIsCredentialsDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [permissionStaff, setPermissionStaff] = useState<any>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [selectedMenuItems, setSelectedMenuItems] = useState<string[]>([]);
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null);
  const [editPassword, setEditPassword] = useState("");
  
  // Filters and search
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "email" | "role" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [newStaff, setNewStaff] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    role: "client_staff" as const,
  });

  const utils = trpc.useUtils();
  const { data: subAdmins, isLoading } = trpc.subAdmin.listMySubAdmins.useQuery();
  const { data: clientScope } = trpc.staffPermissions.getClientScope.useQuery();
  const staffPermissionsQuery = trpc.staffPermissions.get.useQuery(
    { staffId: permissionStaff?.id ?? 0 },
    { enabled: Boolean(permissionStaff?.id && isPermissionDialogOpen) },
  );
  const setStaffPermissionsMutation = trpc.staffPermissions.set.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ صلاحيات الموظف");
      utils.staffPermissions.get.invalidate({ staffId: permissionStaff?.id ?? 0 });
      setIsPermissionDialogOpen(false);
      setPermissionStaff(null);
    },
    onError: (error) => toast.error(error.message || "فشل حفظ الصلاحيات"),
  });

  useEffect(() => {
    if (!staffPermissionsQuery.data) return;
    setSelectedGroupIds(staffPermissionsQuery.data.groups.map((group: any) => group.id));
    setSelectedMenuItems(staffPermissionsQuery.data.allowedMenuItems);
  }, [staffPermissionsQuery.data]);
  const createMutation = trpc.subAdmin.createSubAdmin.useMutation({
    onSuccess: (createdStaff, variables) => {
      toast.success("تم إنشاء الموظف بنجاح");
      utils.subAdmin.listMySubAdmins.invalidate();
      setIsCreateDialogOpen(false);
      setCreatedCredentials({ username: createdStaff.username, password: variables.password });
      setIsCredentialsDialogOpen(true);
      setNewStaff({ name: "", username: "", email: "", password: "", role: "client_staff" });
    },
    onError: (error) => {
      toast.error(error.message || "فشل إنشاء الموظف");
    },
  });

  const updateMutation = trpc.subAdmin.updateSubAdmin.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الموظف بنجاح");
      utils.subAdmin.listMySubAdmins.invalidate();
      setIsEditDialogOpen(false);
      setSelectedStaff(null);
    },
    onError: (error) => {
      toast.error(error.message || "فشل تحديث الموظف");
    },
  });

  const deleteMutation = trpc.subAdmin.deleteSubAdmin.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الموظف بنجاح");
      utils.subAdmin.listMySubAdmins.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "فشل حذف الموظف");
    },
  });

  const handleCreate = () => {
    if (!newStaff.name || !newStaff.username || !newStaff.email || !newStaff.password) {
      toast.error("يرجى ملء جميع الحقول");
      return;
    }
    createMutation.mutate(newStaff);
  };

  const handleUpdate = () => {
    if (!selectedStaff) return;
    updateMutation.mutate({
      id: selectedStaff.id,
      name: selectedStaff.name,
      username: selectedStaff.username,
      email: selectedStaff.email,
      password: editPassword || undefined,
      role: selectedStaff.role,
      status: selectedStaff.status,
    });
  };

  const handleDelete = async (id: number) => {
    if (await window.confirmOperation("هل أنت متأكد من حذف هذا الموظف؟", "حذف الموظف")) {
      deleteMutation.mutate({ id });
    }
  };

  // Filtered and sorted staff list
  const filteredAndSortedStaff = useMemo(() => {
    if (!subAdmins) return [];

    let filtered = [...subAdmins];

    // Role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter((staff: any) => staff.role === roleFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((staff: any) => 
        staff.name.toLowerCase().includes(query) || 
        staff.email.toLowerCase().includes(query) ||
        String(staff.username || "").toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a: any, b: any) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      if (sortBy === "createdAt") {
        const _p = (v: string) => { const s = String(v); return new Date(s.replace(' ', 'T')).getTime(); };
        aVal = _p(aVal);
        bVal = _p(bVal);
      } else if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [subAdmins, roleFilter, searchQuery, sortBy, sortOrder]);

  // CSV Export
  const handleExportCSV = () => {
    if (!filteredAndSortedStaff || filteredAndSortedStaff.length === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }

    const headers = ["الاسم", "اسم المستخدم", "البريد الإلكتروني", "الدور", "الحالة", "تاريخ الإنشاء"];
    const rows = filteredAndSortedStaff.map((staff: any) => [
      staff.name,
      staff.username || "",
      staff.email,
      staff.role === "client_admin" ? "مدير" : staff.role === "client_staff" ? "موظف" : staff.role,
      staff.status === "active" ? "نشط" : staff.status,
      (() => { const d = parseDbDate(staff.createdAt) ?? new Date(staff.createdAt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `staff_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("تم تصدير البيانات بنجاح");
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-6 h-6" />
                إدارة الموظفين
              </CardTitle>
              <CardDescription>
                إنشاء وإدارة حسابات الموظفين (المديرين الفرعيين)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportCSV} disabled={!subAdmins || subAdmins.length === 0}>
                <Download className="w-4 h-4 mr-2" />
                تصدير CSV
              </Button>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="w-4 h-4 mr-2" />
                    إضافة موظف
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>إضافة موظف جديد</DialogTitle>
                    <DialogDescription>
                      أنشئ حساب دخول محلي باسم مستخدم وكلمة مرور، ثم خصص له ما يمكنه رؤيته.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">الاسم</Label>
                      <Input
                        id="name"
                        value={newStaff.name}
                        onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                        placeholder="اسم الموظف"
                      />
                    </div>
                    <div>
                      <Label htmlFor="username">اسم المستخدم للدخول</Label>
                      <Input
                        id="username"
                        value={newStaff.username}
                        onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value.trim() })}
                        placeholder="مثال: sales_ahmad"
                        autoComplete="username"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">يستخدمه الموظف في صفحة تسجيل الدخول، ويجب أن يكون فريداً.</p>
                    </div>
                    <div>
                      <Label htmlFor="email">البريد الإلكتروني</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newStaff.email}
                        onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="password">كلمة المرور المحلية</Label>
                      <Input
                        id="password"
                        type="password"
                        value={newStaff.password}
                        onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                        placeholder="6 أحرف على الأقل"
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">الدور</Label>
                      <Select
                        value={newStaff.role}
                        onValueChange={(value) => setNewStaff({ ...newStaff, role: value as any })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent><SelectItem value="client_staff">موظف مبيعات</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full">
                      {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو اسم المستخدم أو البريد الإلكتروني..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="تصفية حسب الدور" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأدوار</SelectItem>
                <SelectItem value="client_staff">موظف مبيعات</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p>جاري التحميل...</p>
          ) : !subAdmins || subAdmins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>لا يوجد موظفين بعد</p>
              <p className="text-sm">أضف موظفين لمساعدتك في إدارة حسابك</p>
            </div>
          ) : filteredAndSortedStaff.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>لا توجد نتائج</p>
              <p className="text-sm">جرب تغيير معايير البحث أو الفلترة</p>
            </div>
          ) : (
            <>
              <div className="text-sm text-muted-foreground mb-4">
                عرض {filteredAndSortedStaff.length} من {subAdmins.length} موظف
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort("name")} className="flex items-center gap-1">
                        الاسم
                        <ArrowUpDown className="w-3 h-3" />
                      </Button>
                    </TableHead>
                    <TableHead>اسم المستخدم</TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort("email")} className="flex items-center gap-1">
                        البريد الإلكتروني
                        <ArrowUpDown className="w-3 h-3" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort("role")} className="flex items-center gap-1">
                        الدور
                        <ArrowUpDown className="w-3 h-3" />
                      </Button>
                    </TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" onClick={() => toggleSort("createdAt")} className="flex items-center gap-1">
                        تاريخ الإنشاء
                        <ArrowUpDown className="w-3 h-3" />
                      </Button>
                    </TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedStaff.map((staff: any) => (
                    <TableRow key={staff.id}>
                      <TableCell>{staff.name}</TableCell>
                      <TableCell dir="ltr">{staff.username || "—"}</TableCell>
                      <TableCell>{staff.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">موظف مبيعات</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={staff.status === "active" ? "default" : "destructive"}>
                          {staff.status === "active" ? "نشط" : staff.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{(() => { const d = parseDbDate(staff.createdAt) ?? new Date(staff.createdAt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedStaff(staff);
                              setEditPassword("");
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="ضبط الصلاحيات"
                            onClick={() => {
                              setPermissionStaff(staff);
                              setSelectedGroupIds([]);
                              setSelectedMenuItems([]);
                              setIsPermissionDialogOpen(true);
                            }}
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(staff.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل الموظف</DialogTitle>
            <DialogDescription>تحديث معلومات الموظف</DialogDescription>
          </DialogHeader>
          {selectedStaff && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">الاسم</Label>
                <Input
                  id="edit-name"
                  value={selectedStaff.name}
                  onChange={(e) => setSelectedStaff({ ...selectedStaff, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-username">اسم المستخدم للدخول</Label>
                <Input
                  id="edit-username"
                  value={selectedStaff.username || ""}
                  onChange={(e) => setSelectedStaff({ ...selectedStaff, username: e.target.value.trim() })}
                  autoComplete="username"
                />
              </div>
              <div>
                <Label htmlFor="edit-email">البريد الإلكتروني</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={selectedStaff.email}
                  onChange={(e) => setSelectedStaff({ ...selectedStaff, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-password">تعيين كلمة مرور جديدة</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="اتركها فارغة للإبقاء على كلمة المرور الحالية"
                  autoComplete="new-password"
                />
                <p className="mt-1 text-xs text-muted-foreground">للحسابات التي أنشئت سابقاً، أدخل كلمة مرور هنا لتحويلها إلى دخول محلي.</p>
              </div>
              <div>
                <Label htmlFor="edit-role">الدور</Label>
                <Select
                  value={selectedStaff.role}
                  onValueChange={(value) => setSelectedStaff({ ...selectedStaff, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent><SelectItem value="client_staff">موظف مبيعات</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-status">الحالة</Label>
                <Select
                  value={selectedStaff.status}
                  onValueChange={(value) => setSelectedStaff({ ...selectedStaff, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="suspended">موقوف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="w-full">
                {updateMutation.isPending ? "جاري التحديث..." : "تحديث"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCredentialsDialogOpen} onOpenChange={setIsCredentialsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />بيانات دخول الموظف</DialogTitle>
            <DialogDescription>احتفظ بهذه البيانات وأرسلها للموظف. لا تُعرض كلمة المرور مرة أخرى من النظام.</DialogDescription>
          </DialogHeader>
          {createdCredentials && (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4" dir="rtl">
              <div><span className="text-sm text-muted-foreground">اسم المستخدم</span><p className="font-mono font-semibold" dir="ltr">{createdCredentials.username}</p></div>
              <div><span className="text-sm text-muted-foreground">كلمة المرور</span><p className="font-mono font-semibold" dir="ltr">{createdCredentials.password}</p></div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  void navigator.clipboard.writeText(`اسم المستخدم: ${createdCredentials.username}\nكلمة المرور: ${createdCredentials.password}`);
                  toast.success("تم نسخ بيانات الدخول");
                }}
              ><Copy className="ml-2 h-4 w-4" />نسخ بيانات الدخول</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPermissionDialogOpen} onOpenChange={setIsPermissionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>صلاحيات {permissionStaff?.name || "الموظف"}</DialogTitle>
            <DialogDescription>
              لا يمكنك منح الموظف إلا صلاحيات وصفحات مسموحة لحسابك من مالك النظام.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-3">
              <Label>مجموعات الصلاحيات</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(clientScope?.groups || []).map((group: any) => (
                  <label key={group.id} className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(group.id)}
                      onChange={(event) => setSelectedGroupIds((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))}
                    />
                    <span className="text-sm"><strong>{group.nameAr}</strong><br /><span className="text-muted-foreground">{group.descriptionAr || group.name}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Label>الصفحات التي تظهر في القائمة</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(clientScope?.allowedMenuItems || []).map((path: string) => (
                  <label key={path} className="flex items-center gap-2 rounded-md border p-3 cursor-pointer text-sm" dir="ltr">
                    <input
                      type="checkbox"
                      checked={selectedMenuItems.includes(path)}
                      onChange={(event) => setSelectedMenuItems((current) => event.target.checked ? [...current, path] : current.filter((item) => item !== path))}
                    />
                    <span>{path}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!permissionStaff || setStaffPermissionsMutation.isPending}
              onClick={() => permissionStaff && setStaffPermissionsMutation.mutate({ staffId: permissionStaff.id, groupIds: selectedGroupIds, allowedMenuItems: selectedMenuItems })}
            >
              {setStaffPermissionsMutation.isPending ? "جاري الحفظ..." : "حفظ صلاحيات الموظف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
