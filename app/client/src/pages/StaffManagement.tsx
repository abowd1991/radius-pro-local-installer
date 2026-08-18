import { useState, useMemo } from "react";
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
import { UserPlus, Pencil, Trash2, Users, Search, Download, ArrowUpDown } from "lucide-react";
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
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  
  // Filters and search
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "email" | "role" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [newStaff, setNewStaff] = useState({
    name: "",
    email: "",
    password: "",
    role: "client_admin" as "client_admin" | "client_staff",
  });

  const utils = trpc.useUtils();
  const { data: subAdmins, isLoading } = trpc.subAdmin.listMySubAdmins.useQuery();
  const createMutation = trpc.subAdmin.createSubAdmin.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء الموظف بنجاح");
      utils.subAdmin.listMySubAdmins.invalidate();
      setIsCreateDialogOpen(false);
      setNewStaff({ name: "", email: "", password: "", role: "client_admin" });
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
    if (!newStaff.name || !newStaff.email || !newStaff.password) {
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
      email: selectedStaff.email,
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
        staff.email.toLowerCase().includes(query)
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

    const headers = ["الاسم", "البريد الإلكتروني", "الدور", "الحالة", "تاريخ الإنشاء"];
    const rows = filteredAndSortedStaff.map((staff: any) => [
      staff.name,
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
                      أنشئ حساب موظف جديد يمكنه الوصول إلى بياناتك
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
                      <Label htmlFor="password">كلمة المرور</Label>
                      <Input
                        id="password"
                        type="password"
                        value={newStaff.password}
                        onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                        placeholder="••••••••"
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
                        <SelectContent>
                          <SelectItem value="client_admin">مدير</SelectItem>
                          <SelectItem value="client_staff">موظف</SelectItem>
                        </SelectContent>
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
                placeholder="بحث بالاسم أو البريد الإلكتروني..."
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
                <SelectItem value="client_owner">مالك</SelectItem>
                <SelectItem value="client_admin">مدير</SelectItem>
                <SelectItem value="client_staff">موظف</SelectItem>
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
                      <TableCell>{staff.email}</TableCell>
                      <TableCell>
                        <Badge variant={staff.role === "client_admin" ? "default" : "secondary"}>
                          {staff.role === "client_admin" ? "مدير" : staff.role === "client_staff" ? "موظف" : staff.role}
                        </Badge>
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
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
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
                <Label htmlFor="edit-email">البريد الإلكتروني</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={selectedStaff.email}
                  onChange={(e) => setSelectedStaff({ ...selectedStaff, email: e.target.value })}
                />
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
                  <SelectContent>
                    <SelectItem value="client_admin">مدير</SelectItem>
                    <SelectItem value="client_staff">موظف</SelectItem>
                  </SelectContent>
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
    </div>
  );
}
