import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Shield,
  Search,
  Settings,
  Eye,
  EyeOff,
  User,
  RefreshCw,
} from "lucide-react";
import { FilterBar } from "@/components/FilterBar";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/LoadingSkeleton";

export default function FeatureAccessControl() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [permissions, setPermissions] = useState<any>({});

  // Fetch all clients
  const { data: clients, isLoading, refetch } = trpc.featureAccess.listClientsWithPermissions.useQuery();

  // Fetch user permissions
  const { data: userPermissions } = trpc.featureAccess.getUserPermissions.useQuery(
    { userId: selectedUser?.id },
    { enabled: !!selectedUser }
  );

  // Update permissions mutation
  const updatePermissions = trpc.featureAccess.updatePermissions.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الصلاحيات بنجاح");
      setIsDialogOpen(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  // Filter clients
  const filteredClients = clients?.filter((client: any) =>
    client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditPermissions = (client: any) => {
    setSelectedUser(client);
    setIsDialogOpen(true);
  };

  const handleSavePermissions = () => {
    if (!selectedUser) return;
    updatePermissions.mutate({
      userId: selectedUser.id,
      permissions,
    });
  };

  // Permission groups
  const permissionGroups = [
    {
      title: "لوحة التحكم والمراقبة",
      permissions: [
        { key: "canViewDashboard", label: "عرض لوحة التحكم" },
        { key: "canViewActiveSessions", label: "عرض الجلسات النشطة" },
        { key: "canViewRadiusLogs", label: "عرض سجلات RADIUS" },
        { key: "canViewNasHealth", label: "مراقبة NAS" },
      ],
    },
    {
      title: "البنية التحتية",
      permissions: [
        { key: "canManageNas", label: "إدارة أجهزة NAS" },
        { key: "canViewVpn", label: "عرض VPN" },
        { key: "canManageMikrotik", label: "إدارة MikroTik" },
      ],
    },
    {
      title: "المستخدمين والعملاء",
      permissions: [
        { key: "canManageSubscribers", label: "إدارة المشتركين" },
        { key: "canViewClients", label: "عرض العملاء (للموزعين)" },
      ],
    },
    {
      title: "التحكم بالوصول",
      permissions: [
        { key: "canManagePlans", label: "إدارة الخطط" },
        { key: "canAccessRadiusControl", label: "الوصول لتحكم RADIUS" },
      ],
    },
    {
      title: "البطاقات والكروت",
      permissions: [
        { key: "canManageCards", label: "إدارة البطاقات" },
        { key: "canPrintCards", label: "طباعة البطاقات" },
      ],
    },
    {
      title: "الفوترة والمالية",
      permissions: [
        { key: "canViewWallet", label: "عرض المحفظة" },
        { key: "canViewInvoices", label: "عرض الفواتير" },
        { key: "canViewSubscriptions", label: "عرض الاشتراكات" },
        { key: "canViewBillingDashboard", label: "لوحة الفوترة" },
        { key: "canViewSaasPlans", label: "خطط SaaS" },
      ],
    },
    {
      title: "التقارير والتحليلات",
      permissions: [
        { key: "canViewReports", label: "عرض التقارير" },
        { key: "canViewBandwidthAnalytics", label: "تحليلات الباندويث" },
      ],
    },
    {
      title: "النظام",
      permissions: [
        { key: "canViewSettings", label: "الإعدادات" },
        { key: "canViewAuditLog", label: "سجل العمليات" },
        { key: "canAccessSupport", label: "الدعم الفني" },
        { key: "canManageSms", label: "إدارة SMS" },
      ],
    },
  ];

  if (user?.role !== "owner" && user?.role !== "super_admin") {
    return (
      <div className="container py-8">
        <EmptyState
          icon={Shield}
          title="غير مصرح"
          description="ليس لديك صلاحية للوصول إلى هذه الصفحة"
        />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            التحكم بصلاحيات الميزات
          </h1>
          <p className="text-muted-foreground mt-2">
            تحكم بما يراه كل عميل في لوحة التحكم
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 ml-2" />
          تحديث
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">إجمالي العملاء</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">صلاحيات مخصصة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients?.filter((c: any) => c.hasCustomPermissions)?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">صلاحيات افتراضية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients?.filter((c: any) => !c.hasCustomPermissions)?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader>
          <CardTitle>قائمة العملاء</CardTitle>
          <CardDescription>
            اختر عميل لتعديل صلاحياته
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterBar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="بحث بالاسم، البريد، أو اسم المستخدم..."
          />

          {isLoading ? (
            <TableSkeleton rows={5} columns={4} />
          ) : filteredClients && filteredClients.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العميل</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الصلاحيات</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client: any) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{client.name}</div>
                          <div className="text-sm text-muted-foreground">
                            @{client.username}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{client.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          client.status === "active"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {client.status === "active" ? "نشط" : "معلق"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.hasCustomPermissions ? "default" : "outline"}>
                        {client.hasCustomPermissions ? "مخصصة" : "افتراضية"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        onClick={() => handleEditPermissions(client)}
                        size="sm"
                        variant="outline"
                      >
                        <Settings className="h-4 w-4 ml-2" />
                        تعديل الصلاحيات
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={User}
              title="لا يوجد عملاء"
              description="لم يتم العثور على أي عملاء"
            />
          )}
        </CardContent>
      </Card>

      {/* Edit Permissions Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل صلاحيات: {selectedUser?.name}</DialogTitle>
            <DialogDescription>
              حدد الميزات التي يمكن للعميل الوصول إليها
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {permissionGroups.map((group) => (
              <div key={group.title} className="space-y-3">
                <h4 className="font-semibold text-sm">{group.title}</h4>
                <div className="space-y-2 pr-4">
                  {group.permissions.map((perm) => (
                    <div
                      key={perm.key}
                      className="flex items-center justify-between py-2"
                    >
                      <Label htmlFor={perm.key} className="cursor-pointer">
                        {perm.label}
                      </Label>
                      <Switch
                        id={perm.key}
                        checked={permissions[perm.key] ?? userPermissions?.[perm.key] ?? true}
                        onCheckedChange={(checked) =>
                          setPermissions({ ...permissions, [perm.key]: checked })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSavePermissions}
              disabled={updatePermissions.isPending}
            >
              {updatePermissions.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
