import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Users, Shield, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getControllableMenuItems } from "@/config/menu-access";

export default function PermissionPlans() {
  const { t, language } = useLanguage();
  // Using toast from sonner
  const utils = trpc.useUtils();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);

  // Fetch data
  const { data: plans, isLoading: plansLoading } = trpc.permissionPlans.list.useQuery();
  const { data: groups, isLoading: groupsLoading } = trpc.permissionGroups.list.useQuery();

  // Mutations
  const createPlan = trpc.permissionPlans.create.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم إنشاء الخطة بنجاح" : "Plan created successfully");
      utils.permissionPlans.list.invalidate();
      setIsCreateDialogOpen(false);
    },
    onError: (error) => {
      toast.error(language === "ar" ? "فشل إنشاء الخطة: " + error.message : "Failed to create plan: " + error.message);
    }
  });

  const updatePlan = trpc.permissionPlans.update.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تحديث الخطة بنجاح" : "Plan updated successfully");
      utils.permissionPlans.list.invalidate();
      setIsEditDialogOpen(false);
      setSelectedPlan(null);
    },
    onError: (error) => {
      toast.error(language === "ar" ? "فشل تحديث الخطة: " + error.message : "Failed to update plan: " + error.message);
    }
  });

  const deletePlan = trpc.permissionPlans.delete.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حذف الخطة بنجاح" : "Plan deleted successfully");
      utils.permissionPlans.list.invalidate();
    },
    onError: (error) => {
      toast.error(language === "ar" ? "فشل حذف الخطة: " + error.message : "Failed to delete plan: " + error.message);
    }
  });

  const setDefaultPlan = trpc.defaultPlans.setDefaultPlan.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تعيين الخطة الافتراضية بنجاح" : "Default plan set successfully");
      utils.permissionPlans.list.invalidate();
    },
    onError: (error) => {
      toast.error(language === "ar" ? "فشل تعيين الخطة الافتراضية: " + error.message : "Failed to set default plan: " + error.message);
    }
  });

  const handleEdit = async (plan: any) => {
    const fullPlan = await utils.permissionPlans.getById.fetch({ id: plan.id });
    setSelectedPlan(fullPlan);
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (planId: number, isDefault: boolean) => {
    if (isDefault) {
      toast.error(language === "ar" ? "لا يمكن حذف الخطة الافتراضية. يرجى تعيين خطة افتراضية أخرى أولاً." : "Cannot delete default plan. Please set another default plan first.");
      return;
    }
    if (await window.confirmOperation(language === "ar" ? "هل أنت متأكد من حذف هذه الخطة؟" : "Are you sure you want to delete this plan?", language === "ar" ? "حذف الخطة" : "Delete plan")) {
      deletePlan.mutate({ id: planId });
    }
  };

  const handleSetDefault = async (planId: number, role: string) => {
    if (await window.confirmOperation(language === "ar" ? "هل تريد تعيين هذه الخطة كافتراضية؟ سيتم إلغاء الخطة الافتراضية السابقة." : "Set this plan as default? This will unset the previous default plan.", language === "ar" ? "تعيين الخطة الافتراضية" : "Set default plan", "primary")) {
      setDefaultPlan.mutate({ planId, role: role as "reseller" | "client" });
    }
  };

  if (plansLoading || groupsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{language === "ar" ? "جاري التحميل..." : "Loading..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{language === "ar" ? "خطط الصلاحيات" : "Permission Plans"}</h1>
          <p className="text-muted-foreground mt-1">
            {language === "ar" ? "إدارة خطط الصلاحيات للعملاء والموزعين" : "Manage permission plans for clients and resellers"}
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {language === "ar" ? "إنشاء خطة جديدة" : "Create Plan"}
        </Button>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan: any) => (
          <Card key={plan.id} className={plan.isDefault ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    {language === "ar" ? plan.nameAr : plan.name}
                    {plan.isDefault && (
                      <Badge variant="default" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {language === "ar" ? "افتراضي" : "Default"}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {language === "ar" ? plan.descriptionAr : plan.description}
                  </CardDescription>
                </div>
                <Badge variant={plan.role === "reseller" ? "secondary" : "outline"}>
                  <Users className="h-3 w-3 mr-1" />
                  {plan.role === "reseller" ? (language === "ar" ? "موزع" : "Reseller") : (language === "ar" ? "عميل" : "Client")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span>{language === "ar" ? "الحالة:" : "Status:"}</span>
                  <Badge variant={plan.isActive ? "default" : "secondary"}>
                    {plan.isActive ? (language === "ar" ? "نشط" : "Active") : (language === "ar" ? "غير نشط" : "Inactive")}
                  </Badge>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(plan)}>
                      <Edit className="h-4 w-4 mr-2" />
                      {language === "ar" ? "تعديل" : "Edit"}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleDelete(plan.id, plan.isDefault)}
                      disabled={plan.isDefault}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {!plan.isDefault && (
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleSetDefault(plan.id, plan.role)}
                      disabled={setDefaultPlan.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {language === "ar" ? "تعيين كافتراضي" : "Set as Default"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Dialog */}
      <PlanFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        groups={groups || []}
        onSubmit={(data) => createPlan.mutate(data)}
        isLoading={createPlan.isPending}
        language={language}
      />

      {/* Edit Dialog */}
      {selectedPlan && (
        <PlanFormDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          groups={groups || []}
          plan={selectedPlan}
          onSubmit={(data) => updatePlan.mutate({ id: selectedPlan.id, ...data })}
          isLoading={updatePlan.isPending}
          language={language}
        />
      )}
    </div>
  );
}

// ============================================================================
// PLAN FORM DIALOG
// ============================================================================

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: any[];
  plan?: any;
  onSubmit: (data: any) => void;
  isLoading: boolean;
  language: string;
}

function PlanFormDialog({ open, onOpenChange, groups, plan, onSubmit, isLoading, language }: PlanFormDialogProps) {
  const inheritedMenuItems = plan?.allowedMenuItems ?? plan?.groups?.flatMap((group: any) => group.menuItems || []) ?? [];
  const [formData, setFormData] = useState({
    name: plan?.name || "",
    nameAr: plan?.nameAr || "",
    description: plan?.description || "",
    descriptionAr: plan?.descriptionAr || "",
    role: plan?.role || "client",
    isDefault: plan?.isDefault || false,
    isActive: plan?.isActive ?? true,
    groupIds: plan?.groups?.map((g: any) => g.id) || [],
    allowedMenuItems: inheritedMenuItems
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const toggleGroup = (groupId: number) => {
    setFormData(prev => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter((id: number) => id !== groupId)
        : [...prev.groupIds, groupId]
    }));
  };

  const toggleMenuItem = (path: string) => {
    setFormData(prev => ({
      ...prev,
      allowedMenuItems: prev.allowedMenuItems.includes(path)
        ? prev.allowedMenuItems.filter((itemPath: string) => itemPath !== path)
        : [...prev.allowedMenuItems, path],
    }));
  };

  const selectedGroupNames = new Set(
    groups.filter((group: any) => formData.groupIds.includes(group.id)).map((group: any) => group.name)
  );
  const menuItems = getControllableMenuItems(formData.role as "client" | "reseller")
    .filter((item) => !item.permissionGroup || selectedGroupNames.has(item.permissionGroup));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {plan ? (language === "ar" ? "تعديل الخطة" : "Edit Plan") : (language === "ar" ? "إنشاء خطة جديدة" : "Create New Plan")}
          </DialogTitle>
          <DialogDescription>
            {language === "ar" ? "قم بتعبئة المعلومات أدناه لإنشاء أو تعديل خطة الصلاحيات" : "Fill in the information below to create or edit a permission plan"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{language === "ar" ? "الاسم (English)" : "Name (English)"}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameAr">{language === "ar" ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
              <Input
                id="nameAr"
                value={formData.nameAr}
                onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Description */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="description">{language === "ar" ? "الوصف (English)" : "Description (English)"}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descriptionAr">{language === "ar" ? "الوصف (عربي)" : "Description (Arabic)"}</Label>
              <Textarea
                id="descriptionAr"
                value={formData.descriptionAr}
                onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="role">{language === "ar" ? "الدور" : "Role"}</Label>
            <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">{language === "ar" ? "عميل" : "Client"}</SelectItem>
                <SelectItem value="reseller">{language === "ar" ? "موزع" : "Reseller"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Checkboxes */}
          <div className="flex gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked as boolean })}
              />
              <Label htmlFor="isDefault" className="cursor-pointer">
                {language === "ar" ? "خطة افتراضية" : "Default Plan"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked as boolean })}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                {language === "ar" ? "نشط" : "Active"}
              </Label>
            </div>
          </div>

          {/* Permission Groups */}
          <div className="space-y-2">
            <Label>{language === "ar" ? "مجموعات الصلاحيات" : "Permission Groups"}</Label>
            <div className="border rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
              {groups
                .filter((group: any) => group.applicableRoles.includes(formData.role))
                .map((group: any) => (
                  <div key={group.id} className="flex items-start space-x-2">
                    <Checkbox
                      id={`group-${group.id}`}
                      checked={formData.groupIds.includes(group.id)}
                      onCheckedChange={() => toggleGroup(group.id as number)}
                    />
                    <Label htmlFor={`group-${group.id}`} className="cursor-pointer flex-1">
                      <div className="font-medium">{language === "ar" ? group.nameAr : group.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {language === "ar" ? group.descriptionAr : group.description}
                      </div>
                    </Label>
                  </div>
                ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{language === "ar" ? "عناصر القائمة الافتراضية للخطة" : "Default sidebar items for this plan"}</Label>
            <p className="text-xs text-muted-foreground">
              {language === "ar" ? "اختر مجموعات الصلاحيات أولاً، ثم حدّد بالضبط ما يظهر لكل مستخدم في الخطة. يمكن تعديل أي عميل لاحقاً باستثناء فردي." : "Select permission groups first, then choose exactly which items appear for users on this plan."}
            </p>
            <div className="border rounded-lg p-4 space-y-3 max-h-72 overflow-y-auto">
              {menuItems.map((item) => (
                <div key={item.path} className="flex items-start gap-2">
                  <Checkbox
                    id={`menu-${item.path}`}
                    checked={formData.allowedMenuItems.includes(item.path)}
                    onCheckedChange={() => toggleMenuItem(item.path)}
                  />
                  <Label htmlFor={`menu-${item.path}`} className="cursor-pointer flex-1">
                    <span className="font-medium">{language === "ar" ? item.labelAr : item.label}</span>
                    <span className="mr-2 text-xs text-muted-foreground">{item.sectionLabelAr}</span>
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (language === "ar" ? "جاري الحفظ..." : "Saving...") : (language === "ar" ? "حفظ" : "Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
