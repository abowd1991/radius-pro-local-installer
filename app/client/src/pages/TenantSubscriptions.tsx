import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatDate , parseDbDate } from '@/lib/dateFormat';
import { 
  CreditCard, 
  Plus, 
  Calendar, 
  Pause, 
  Play, 
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Users
} from "lucide-react";

export default function TenantSubscriptions() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<number | null>(null);
  const [months, setMonths] = useState(1);
  const [notes, setNotes] = useState("");

  const { data: subscriptions, isLoading, refetch } = trpc.tenantSubscriptions.list.useQuery();
  const { data: _usersRaw } = trpc.users.list.useQuery();
  const users: any[] | undefined = (_usersRaw as any)?.users ?? (_usersRaw as any);
  const { data: expiring } = trpc.tenantSubscriptions.getExpiring.useQuery({ withinDays: 7 });

  const createMutation = trpc.tenantSubscriptions.create.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء الاشتراك بنجاح");
      setCreateDialogOpen(false);
      setSelectedTenant(null);
      setMonths(1);
      setNotes("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const extendMutation = trpc.tenantSubscriptions.extend.useMutation({
    onSuccess: () => {
      toast.success("تم تمديد الاشتراك بنجاح");
      setExtendDialogOpen(false);
      setSelectedTenant(null);
      setMonths(1);
      setNotes("");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const suspendMutation = trpc.tenantSubscriptions.suspend.useMutation({
    onSuccess: () => {
      toast.success("تم تعليق الاشتراك");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const activateMutation = trpc.tenantSubscriptions.activate.useMutation({
    onSuccess: () => {
      toast.success("تم تفعيل الاشتراك");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const getStatusBadge = (status: string, expiresAt: Date) => {
    const isExpired = (parseDbDate(expiresAt) ?? new Date(expiresAt)) < new Date();
    
    if (status === "active" && !isExpired) {
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 ml-1" /> نشط</Badge>;
    } else if (status === "suspended") {
      return <Badge variant="secondary"><Pause className="w-3 h-3 ml-1" /> معلق</Badge>;
    } else if (status === "cancelled") {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 ml-1" /> ملغي</Badge>;
    } else {
      return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 ml-1" /> منتهي</Badge>;
    }
  };

  const getDaysRemaining = (expiresAt: Date) => {
    const now = new Date();
    const expiry = (parseDbDate(expiresAt) ?? new Date(expiresAt));
    const diff = expiry.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  // Get users without subscriptions
  const usersWithoutSubscription = users?.filter(
    (user: any) => 
      user.role !== 'super_admin' && 
      !subscriptions?.some((sub) => sub.tenantId === user.id)
  ) || [];

  const handleCreate = () => {
    if (!selectedTenant) {
      toast.error("الرجاء اختيار عميل");
      return;
    }
    createMutation.mutate({
      tenantId: selectedTenant,
      months,
      notes: notes || undefined,
    });
  };

  const handleExtend = () => {
    if (!selectedTenant) return;
    extendMutation.mutate({
      tenantId: selectedTenant,
      months,
      notes: notes || undefined,
    });
  };

  const openExtendDialog = (tenantId: number) => {
    setSelectedTenant(tenantId);
    setMonths(1);
    setNotes("");
    setExtendDialogOpen(true);
  };

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">إدارة الاشتراكات</h1>
            <p className="text-muted-foreground">إدارة اشتراكات العملاء - $10/شهر</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 ml-2" />
            إنشاء اشتراك
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الاشتراكات</CardTitle>
              <CreditCard className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{subscriptions?.length || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">الاشتراكات النشطة</CardTitle>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {subscriptions?.filter((s) => s.status === "active" && (parseDbDate(s.expiresAt) ?? new Date(s.expiresAt)) > new Date()).length || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">تنتهي قريباً</CardTitle>
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{expiring?.length || 0}</div>
              <p className="text-xs text-muted-foreground">خلال 7 أيام</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">بدون اشتراك</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{usersWithoutSubscription.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Expiring Soon Alert */}
        {expiring && expiring.length > 0 && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <CardHeader>
              <CardTitle className="text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                اشتراكات تنتهي قريباً
              </CardTitle>
              <CardDescription>
                {expiring.length} اشتراك(ات) ستنتهي خلال 7 أيام
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Subscriptions Table */}
        <Card>
          <CardHeader>
            <CardTitle>قائمة الاشتراكات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">جاري التحميل...</div>
            ) : subscriptions && subscriptions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العميل</TableHead>
                    <TableHead className="text-right">البريد</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">السعر</TableHead>
                    <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                    <TableHead className="text-right">المتبقي</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((sub) => {
                    const daysRemaining = getDaysRemaining(sub.expiresAt);
                    return (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.tenantName}</TableCell>
                        <TableCell>{sub.tenantEmail}</TableCell>
                        <TableCell>{getStatusBadge(sub.status, sub.expiresAt)}</TableCell>
                        <TableCell>${sub.pricePerMonth}/شهر</TableCell>
                        <TableCell>
                          {formatDate(sub.expiresAt)}
                        </TableCell>
                        <TableCell>
                          <span className={daysRemaining <= 7 ? "text-red-600 font-bold" : ""}>
                            {daysRemaining > 0 ? `${daysRemaining} يوم` : "منتهي"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openExtendDialog(sub.tenantId)}
                            >
                              <Calendar className="w-4 h-4 ml-1" />
                              تمديد
                            </Button>
                            {sub.status === "active" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => suspendMutation.mutate({ tenantId: sub.tenantId })}
                              >
                                <Pause className="w-4 h-4 ml-1" />
                                تعليق
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => activateMutation.mutate({ tenantId: sub.tenantId })}
                              >
                                <Play className="w-4 h-4 ml-1" />
                                تفعيل
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                لا توجد اشتراكات حالياً
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Subscription Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إنشاء اشتراك جديد</DialogTitle>
              <DialogDescription>
                اختر العميل وحدد مدة الاشتراك
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>العميل</Label>
                <Select
                  value={selectedTenant?.toString() || ""}
                  onValueChange={(v) => setSelectedTenant(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر العميل" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersWithoutSubscription.map((user: any) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المدة (أشهر)</Label>
                <Input
                  type="number"
                  min={1}
                  value={months}
                  onChange={(e) => setMonths(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label>ملاحظات (اختياري)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أي ملاحظات إضافية..."
                />
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm">
                  <strong>الإجمالي:</strong> ${months * 10}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء الاشتراك"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Extend Subscription Dialog */}
        <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تمديد الاشتراك</DialogTitle>
              <DialogDescription>
                حدد عدد الأشهر للتمديد
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>المدة (أشهر)</Label>
                <Input
                  type="number"
                  min={1}
                  value={months}
                  onChange={(e) => setMonths(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-2">
                <Label>ملاحظات (اختياري)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="سبب التمديد أو ملاحظات..."
                />
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm">
                  <strong>الإجمالي:</strong> ${months * 10}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExtendDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleExtend} disabled={extendMutation.isPending}>
                {extendMutation.isPending ? "جاري التمديد..." : "تمديد الاشتراك"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
