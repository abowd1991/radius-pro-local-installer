import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Check, X, Star, Zap, Shield, BarChart3, Palette, Headphones } from "lucide-react";

export default function SaasPlansManagement() {
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  
  const { data: plans, isLoading, refetch } = trpc.saasPlans.getAllAdmin.useQuery();
  const createMutation = trpc.saasPlans.create.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء الخطة بنجاح");
      setIsCreateOpen(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.saasPlans.update.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الخطة بنجاح");
      setEditingPlan(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.saasPlans.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الخطة بنجاح");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Check if user is super admin or owner
  if (user?.role !== "super_admin" && user?.role !== "owner") {
    return (
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">غير مصرح لك بالوصول لهذه الصفحة</p>
        </div>
    );
  }

  const featureIcons: Record<string, any> = {
    featureMikrotikApi: { icon: Zap, label: "MikroTik API" },
    featureCoaDisconnect: { icon: Shield, label: "CoA Disconnect" },
    featureStaticVpnIp: { icon: Shield, label: "Static VPN IP" },
    featureAdvancedReports: { icon: BarChart3, label: "تقارير متقدمة" },
    featureCustomBranding: { icon: Palette, label: "علامة تجارية مخصصة" },
    featurePrioritySupport: { icon: Headphones, label: "دعم أولوية" },
  };

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">إدارة خطط الاشتراك</h1>
            <p className="text-muted-foreground">إدارة خطط SaaS التجارية للعملاء</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-2" />
                خطة جديدة
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <PlanForm
                onSubmit={(data) => createMutation.mutate(data)}
                isLoading={createMutation.isPending}
                onCancel={() => setIsCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Plans Grid */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-32 bg-muted" />
                <CardContent className="h-48 bg-muted/50" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plans?.map((plan: any) => (
              <Card key={plan.id} className={`relative ${!plan.isActive ? 'opacity-60' : ''} ${plan.isPopular ? 'ring-2 ring-primary' : ''}`}>
                {plan.isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary">
                      <Star className="h-3 w-3 ml-1" />
                      الأكثر شعبية
                    </Badge>
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      {plan.nameAr && <p className="text-sm text-muted-foreground">{plan.nameAr}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditingPlan(plan)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive"
                        onClick={async () => {
                          if (await window.confirmOperation("هل أنت متأكد من حذف هذه الخطة؟", "حذف الخطة")) {
                            deleteMutation.mutate({ id: plan.id });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Pricing */}
                  <div className="text-center py-4 bg-muted/50 rounded-lg">
                    <div className="text-3xl font-bold">${plan.priceMonthly}</div>
                    <div className="text-sm text-muted-foreground">/ شهرياً</div>
                    {plan.priceYearly && (
                      <div className="text-sm text-green-600 mt-1">
                        ${plan.priceYearly} / سنوياً (وفر {Math.round((1 - Number(plan.priceYearly) / (Number(plan.priceMonthly) * 12)) * 100)}%)
                      </div>
                    )}
                  </div>

                  {/* Limits */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">أجهزة NAS</span>
                      <span className="font-medium">{plan.maxNasDevices}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">الكروت</span>
                      <span className="font-medium">{plan.maxCards?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">المشتركين</span>
                      <span className="font-medium">{plan.maxSubscribers?.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="space-y-2 pt-4 border-t">
                    {Object.entries(featureIcons).map(([key, { icon: Icon, label }]) => (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        {(plan as any)[key] ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={(plan as any)[key] ? "" : "text-muted-foreground"}>{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Status */}
                  <div className="pt-4 border-t">
                    <Badge variant={plan.isActive ? "default" : "secondary"}>
                      {plan.isActive ? "مفعّل" : "معطّل"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {editingPlan && (
              <PlanForm
                initialData={editingPlan}
                onSubmit={(data) => updateMutation.mutate({ id: editingPlan.id, ...data })}
                isLoading={updateMutation.isPending}
                onCancel={() => setEditingPlan(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
  );
}

// Plan Form Component
function PlanForm({ 
  initialData, 
  onSubmit, 
  isLoading, 
  onCancel 
}: { 
  initialData?: any;
  onSubmit: (data: any) => void;
  isLoading: boolean;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    nameAr: initialData?.nameAr || "",
    description: initialData?.description || "",
    descriptionAr: initialData?.descriptionAr || "",
    priceMonthly: initialData?.priceMonthly ? Number(initialData.priceMonthly) : 0,
    priceYearly: initialData?.priceYearly ? Number(initialData.priceYearly) : 0,
    currency: initialData?.currency || "USD",
    maxNasDevices: initialData?.maxNasDevices || 1,
    maxCards: initialData?.maxCards || 100,
    maxSubscribers: initialData?.maxSubscribers || 50,
    featureMikrotikApi: initialData?.featureMikrotikApi || false,
    featureCoaDisconnect: initialData?.featureCoaDisconnect ?? true,
    featureStaticVpnIp: initialData?.featureStaticVpnIp || false,
    featureAdvancedReports: initialData?.featureAdvancedReports || false,
    featureCustomBranding: initialData?.featureCustomBranding || false,
    featurePrioritySupport: initialData?.featurePrioritySupport || false,
    displayOrder: initialData?.displayOrder || 0,
    isPopular: initialData?.isPopular || false,
    isActive: initialData?.isActive ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{initialData ? "تعديل الخطة" : "إنشاء خطة جديدة"}</DialogTitle>
        <DialogDescription>
          {initialData ? "قم بتعديل تفاصيل الخطة" : "أدخل تفاصيل الخطة الجديدة"}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-4">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">الاسم (English)</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nameAr">الاسم (العربية)</Label>
            <Input
              id="nameAr"
              value={formData.nameAr}
              onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="description">الوصف (English)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="descriptionAr">الوصف (العربية)</Label>
            <Textarea
              id="descriptionAr"
              value={formData.descriptionAr}
              onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="priceMonthly">السعر الشهري</Label>
            <Input
              id="priceMonthly"
              type="number"
              min="0"
              step="0.01"
              value={formData.priceMonthly}
              onChange={(e) => setFormData({ ...formData, priceMonthly: Number(e.target.value) })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priceYearly">السعر السنوي</Label>
            <Input
              id="priceYearly"
              type="number"
              min="0"
              step="0.01"
              value={formData.priceYearly}
              onChange={(e) => setFormData({ ...formData, priceYearly: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">العملة</Label>
            <Input
              id="currency"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            />
          </div>
        </div>

        {/* Limits */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxNasDevices">أجهزة NAS</Label>
            <Input
              id="maxNasDevices"
              type="number"
              min="1"
              value={formData.maxNasDevices}
              onChange={(e) => setFormData({ ...formData, maxNasDevices: Number(e.target.value) })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxCards">الكروت</Label>
            <Input
              id="maxCards"
              type="number"
              min="1"
              value={formData.maxCards}
              onChange={(e) => setFormData({ ...formData, maxCards: Number(e.target.value) })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxSubscribers">المشتركين</Label>
            <Input
              id="maxSubscribers"
              type="number"
              min="1"
              value={formData.maxSubscribers}
              onChange={(e) => setFormData({ ...formData, maxSubscribers: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* Features */}
        <div className="space-y-4 pt-4 border-t">
          <Label>الميزات</Label>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "featureMikrotikApi", label: "MikroTik API" },
              { key: "featureCoaDisconnect", label: "CoA Disconnect" },
              { key: "featureStaticVpnIp", label: "Static VPN IP" },
              { key: "featureAdvancedReports", label: "تقارير متقدمة" },
              { key: "featureCustomBranding", label: "علامة تجارية مخصصة" },
              { key: "featurePrioritySupport", label: "دعم أولوية" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={key}>{label}</Label>
                <Switch
                  id={key}
                  checked={(formData as any)[key]}
                  onCheckedChange={(checked) => setFormData({ ...formData, [key]: checked })}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Display Options */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t">
          <div className="space-y-2">
            <Label htmlFor="displayOrder">ترتيب العرض</Label>
            <Input
              id="displayOrder"
              type="number"
              value={formData.displayOrder}
              onChange={(e) => setFormData({ ...formData, displayOrder: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isPopular">الأكثر شعبية</Label>
            <Switch
              id="isPopular"
              checked={formData.isPopular}
              onCheckedChange={(checked) => setFormData({ ...formData, isPopular: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="isActive">مفعّل</Label>
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          إلغاء
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "جاري الحفظ..." : initialData ? "حفظ التغييرات" : "إنشاء الخطة"}
        </Button>
      </DialogFooter>
    </form>
  );
}
