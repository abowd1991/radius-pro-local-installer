import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Edit, Trash2, Star } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/operationFeedback";

export default function SubscriptionPlansManagement() {
  const { data: plans, isLoading, refetch } = trpc.site.listSubscriptionPlans.useQuery();
  const createMutation = trpc.site.createSubscriptionPlan.useMutation();
  const updateMutation = trpc.site.updateSubscriptionPlan.useMutation();
  const deleteMutation = trpc.site.deleteSubscriptionPlan.useMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [formData, setFormData] = useState<any>({
    name: "",
    nameAr: "",
    description: "",
    descriptionAr: "",
    price: 0,
    currency: "USD",
    billingPeriod: "monthly",
    features: [],
    featuresAr: [],
    maxCards: null,
    maxNasDevices: null,
    maxResellers: null,
    isPopular: false,
    displayOrder: 0,
    isActive: true,
  });
  const [featureInput, setFeatureInput] = useState("");
  const [featureInputAr, setFeatureInputAr] = useState("");

  const handleOpenDialog = (plan?: any) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features : [],
        featuresAr: Array.isArray(plan.featuresAr) ? plan.featuresAr : [],
      });
    } else {
      setEditingPlan(null);
      setFormData({
        name: "",
        nameAr: "",
        description: "",
        descriptionAr: "",
        price: 0,
        currency: "USD",
        billingPeriod: "monthly",
        features: [],
        featuresAr: [],
        maxCards: null,
        maxNasDevices: null,
        maxResellers: null,
        isPopular: false,
        displayOrder: 0,
        isActive: true,
      });
    }
    setDialogOpen(true);
  };

  const handleAddFeature = () => {
    if (featureInput.trim()) {
      setFormData((prev: any) => ({
        ...prev,
        features: [...prev.features, featureInput.trim()],
      }));
      setFeatureInput("");
    }
  };

  const handleAddFeatureAr = () => {
    if (featureInputAr.trim()) {
      setFormData((prev: any) => ({
        ...prev,
        featuresAr: [...prev.featuresAr, featureInputAr.trim()],
      }));
      setFeatureInputAr("");
    }
  };

  const handleRemoveFeature = (index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      features: prev.features.filter((_: any, i: number) => i !== index),
    }));
  };

  const handleRemoveFeatureAr = (index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      featuresAr: prev.featuresAr.filter((_: any, i: number) => i !== index),
    }));
  };

  const handleSave = async () => {
    try {
      if (editingPlan) {
        await updateMutation.mutateAsync({ id: editingPlan.id, ...formData });
        toast.success("تم تحديث الخطة بنجاح!");
      } else {
        await createMutation.mutateAsync(formData);
        toast.success("تم إنشاء الخطة بنجاح!");
      }
      setDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(`فشلت العملية: ${error.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (await window.confirmOperation("هل أنت متأكد من حذف هذه الخطة؟", "حذف الخطة")) {
      try {
        await deleteMutation.mutateAsync({ id });
        toast.success("تم حذف الخطة بنجاح!");
        refetch();
      } catch (error: any) {
        toast.error(`فشل الحذف: ${error.message}`);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">إدارة خطط الاشتراك</h1>
          <p className="text-muted-foreground mt-1">
            إدارة خطط SaaS التجارية للعملاء
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 ml-2" />
              خطة جديدة
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPlan ? "تعديل الخطة" : "إنشاء خطة جديدة"}
              </DialogTitle>
              <DialogDescription>
                املأ تفاصيل الخطة باللغتين العربية والإنجليزية
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">اسم الخطة (English)</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="nameAr">اسم الخطة (العربية)</Label>
                  <Input
                    id="nameAr"
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="description">الوصف (English)</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                  />
                </div>
                <div>
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
                <div>
                  <Label htmlFor="price">السعر</Label>
                  <Input
                    id="price"
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="currency">العملة</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="ILS">ILS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="billingPeriod">الفترة</Label>
                  <Select
                    value={formData.billingPeriod}
                    onValueChange={(value) => setFormData({ ...formData, billingPeriod: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">شهري</SelectItem>
                      <SelectItem value="semi_annual">6 أشهر</SelectItem>
                      <SelectItem value="yearly">سنوي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Limits */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="maxCards">حد الكروت (اختياري)</Label>
                  <Input
                    id="maxCards"
                    type="number"
                    value={formData.maxCards || ""}
                    onChange={(e) => setFormData({ ...formData, maxCards: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="غير محدود"
                  />
                </div>
                <div>
                  <Label htmlFor="maxNasDevices">حد أجهزة NAS (اختياري)</Label>
                  <Input
                    id="maxNasDevices"
                    type="number"
                    value={formData.maxNasDevices || ""}
                    onChange={(e) => setFormData({ ...formData, maxNasDevices: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="غير محدود"
                  />
                </div>
                <div>
                  <Label htmlFor="maxResellers">حد الموزعين (اختياري)</Label>
                  <Input
                    id="maxResellers"
                    type="number"
                    value={formData.maxResellers || ""}
                    onChange={(e) => setFormData({ ...formData, maxResellers: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="غير محدود"
                  />
                </div>
              </div>

              {/* Features (English) */}
              <div>
                <Label>الميزات (English)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={featureInput}
                    onChange={(e) => setFeatureInput(e.target.value)}
                    placeholder="أضف ميزة..."
                    onKeyPress={(e) => e.key === "Enter" && handleAddFeature()}
                  />
                  <Button type="button" onClick={handleAddFeature}>إضافة</Button>
                </div>
                <ul className="mt-2 space-y-1">
                  {formData.features.map((feature: string, index: number) => (
                    <li key={index} className="flex items-center justify-between bg-muted p-2 rounded">
                      <span>{feature}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFeature(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Features (Arabic) */}
              <div>
                <Label>الميزات (العربية)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={featureInputAr}
                    onChange={(e) => setFeatureInputAr(e.target.value)}
                    placeholder="أضف ميزة..."
                    onKeyPress={(e) => e.key === "Enter" && handleAddFeatureAr()}
                  />
                  <Button type="button" onClick={handleAddFeatureAr}>إضافة</Button>
                </div>
                <ul className="mt-2 space-y-1">
                  {formData.featuresAr.map((feature: string, index: number) => (
                    <li key={index} className="flex items-center justify-between bg-muted p-2 rounded">
                      <span>{feature}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFeatureAr(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Display Options */}
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isPopular"
                    checked={formData.isPopular}
                    onCheckedChange={(checked) => setFormData({ ...formData, isPopular: checked })}
                  />
                  <Label htmlFor="isPopular">خطة مميزة</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                  <Label htmlFor="isActive">نشطة</Label>
                </div>
                <div>
                  <Label htmlFor="displayOrder">ترتيب العرض</Label>
                  <Input
                    id="displayOrder"
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSave}>
                {editingPlan ? "تحديث" : "إنشاء"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans?.map((plan: any) => (
          <Card key={plan.id} className={plan.isPopular ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {plan.nameAr}
                    {plan.isPopular && <Star className="w-4 h-4 fill-primary text-primary" />}
                  </CardTitle>
                  <CardDescription>{plan.descriptionAr}</CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenDialog(plan)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(plan.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold mb-4">
                ${plan.price}
                <span className="text-sm text-muted-foreground">
                  /{plan.billingPeriod === "monthly" ? "شهر" : plan.billingPeriod === "semi_annual" ? "6 أشهر" : "سنة"}
                </span>
              </div>
              <ul className="space-y-2">
                {(plan.featuresAr || []).map((feature: string, index: number) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <span className="text-primary">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-1">
                {plan.maxCards && <div>حد الكروت: {plan.maxCards}</div>}
                {plan.maxNasDevices && <div>حد NAS: {plan.maxNasDevices}</div>}
                {plan.maxResellers && <div>حد الموزعين: {plan.maxResellers}</div>}
                <div>الحالة: {plan.isActive ? "نشطة" : "معطلة"}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {plans?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">لا توجد خطط اشتراك</p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 ml-2" />
              إنشاء خطة جديدة
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
