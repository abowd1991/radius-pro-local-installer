import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Shield, Users, Building2 } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function DefaultPlans() {
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();

  // Fetch all permission plans
  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = trpc.permissionPlans.list.useQuery();

  // Fetch default plans
  const { data: defaults, isLoading: defaultsLoading, refetch: refetchDefaults } = trpc.defaultPlans.listDefaults.useQuery();

  // Set default plan mutation
  const setDefaultMutation = trpc.defaultPlans.setDefaultPlan.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || (language === "ar" ? "تم تعيين الخطة الافتراضية بنجاح" : "Default plan set successfully"));
      refetchPlans();
      refetchDefaults();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const isLoading = plansLoading || defaultsLoading;

  const isDefaultPlan = (planId: number, role: string) => {
    return defaults?.some((d: any) => d.id === planId && d.role === role);
  };

  const handleSetDefault = (planId: number, role: "reseller" | "client") => {
    setDefaultMutation.mutate({ planId, role });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "reseller":
        return <Building2 className="h-4 w-4" />;
      case "client":
        return <Users className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "reseller":
        return language === "ar" ? "موزع" : "Reseller";
      case "client":
        return language === "ar" ? "عميل" : "Client";
      default:
        return role;
    }
  };

  // Group plans by role
  const resellerPlans = plans?.filter((p: any) => p.role === "reseller") || [];
  const clientPlans = plans?.filter((p: any) => p.role === "client") || [];

  return (
    <div className="container py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {language === "ar" ? "الخطط الافتراضية" : "Default Plans"}
        </h1>
        <p className="text-muted-foreground mt-2">
          {language === "ar"
            ? "إدارة الخطط الافتراضية التي يتم تعيينها تلقائياً عند تسجيل مستخدم جديد"
            : "Manage default plans that are automatically assigned when a new user registers"}
        </p>
      </div>

      {/* Reseller Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>{language === "ar" ? "خطط الموزعين" : "Reseller Plans"}</CardTitle>
          </div>
          <CardDescription>
            {language === "ar"
              ? "الخطة الافتراضية التي يتم تعيينها للموزعين الجدد عند التسجيل"
              : "Default plan assigned to new resellers upon registration"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">{language === "ar" ? "اسم الخطة" : "Plan Name"}</TableHead>
                <TableHead className="font-semibold">{language === "ar" ? "الوصف" : "Description"}</TableHead>
                <TableHead className="font-semibold">{language === "ar" ? "الحالة" : "Status"}</TableHead>
                <TableHead className="w-[150px] font-semibold">{language === "ar" ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={3} columns={4} />
              ) : resellerPlans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "لا توجد خطط للموزعين" : "No reseller plans found"}
                  </TableCell>
                </TableRow>
              ) : (
                resellerPlans.map((plan: any) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell className="text-muted-foreground">{plan.description || "-"}</TableCell>
                    <TableCell>
                      {isDefaultPlan(plan.id, "reseller") ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {language === "ar" ? "افتراضي" : "Default"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{language === "ar" ? "غير افتراضي" : "Not Default"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isDefaultPlan(plan.id, "reseller") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetDefault(plan.id, "reseller")}
                          disabled={setDefaultMutation.isPending}
                        >
                          {setDefaultMutation.isPending
                            ? (language === "ar" ? "جاري التعيين..." : "Setting...")
                            : (language === "ar" ? "تعيين كافتراضي" : "Set as Default")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Client Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>{language === "ar" ? "خطط العملاء" : "Client Plans"}</CardTitle>
          </div>
          <CardDescription>
            {language === "ar"
              ? "الخطة الافتراضية التي يتم تعيينها للعملاء الجدد عند التسجيل"
              : "Default plan assigned to new clients upon registration"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">{language === "ar" ? "اسم الخطة" : "Plan Name"}</TableHead>
                <TableHead className="font-semibold">{language === "ar" ? "الوصف" : "Description"}</TableHead>
                <TableHead className="font-semibold">{language === "ar" ? "الحالة" : "Status"}</TableHead>
                <TableHead className="w-[150px] font-semibold">{language === "ar" ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={3} columns={4} />
              ) : clientPlans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "لا توجد خطط للعملاء" : "No client plans found"}
                  </TableCell>
                </TableRow>
              ) : (
                clientPlans.map((plan: any) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell className="text-muted-foreground">{plan.description || "-"}</TableCell>
                    <TableCell>
                      {isDefaultPlan(plan.id, "client") ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {language === "ar" ? "افتراضي" : "Default"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{language === "ar" ? "غير افتراضي" : "Not Default"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isDefaultPlan(plan.id, "client") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetDefault(plan.id, "client")}
                          disabled={setDefaultMutation.isPending}
                        >
                          {setDefaultMutation.isPending
                            ? (language === "ar" ? "جاري التعيين..." : "Setting...")
                            : (language === "ar" ? "تعيين كافتراضي" : "Set as Default")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
