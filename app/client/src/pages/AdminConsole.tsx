import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Shield, Settings } from "lucide-react";

// Reuse the operating account-management surface instead of duplicating client and reseller CRUD.
import UsersManagement from "./UsersManagement";
import PermissionPlans from "./PermissionPlans";
import UserPermissionOverride from "./UserPermissionOverride";

export default function AdminConsole() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState("users");
  const [accessTab, setAccessTab] = useState("plans");

  // Only owner/super_admin can access
  if (user?.role !== "owner" && user?.role !== "super_admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {language === "ar" ? "غير مصرح" : "Unauthorized"}
          </h2>
          <p className="text-muted-foreground">
            {language === "ar" 
              ? "ليس لديك صلاحية للوصول إلى المستخدمين والصلاحيات" 
              : "You don't have permission to access user management"}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {language === "ar" ? "المستخدمون والصلاحيات" : "Users & Access"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {language === "ar" 
            ? "إدارة الحسابات والأدوار وسياسات الوصول من مكان واحد" 
            : "Manage accounts, roles, and access policies from one place"}
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto">
          <TabsTrigger value="users" className="gap-2 data-[state=active]:bg-background">
            <Users className="h-4 w-4" />
            {language === "ar" ? "المستخدمون" : "Users"}
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-2 data-[state=active]:bg-background">
            <Shield className="h-4 w-4" />
            {language === "ar" ? "الأدوار والصلاحيات" : "Roles & Permissions"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4 mt-0">
          <UsersManagement />
        </TabsContent>

        <TabsContent value="access" className="space-y-4 mt-0">
          <Tabs value={accessTab} onValueChange={setAccessTab} className="space-y-4">
            <TabsList className="bg-muted/50 p-1 h-auto">
              <TabsTrigger value="plans" className="gap-2 data-[state=active]:bg-background">
                <Shield className="h-4 w-4" />
                {language === "ar" ? "خطط الصلاحيات" : "Permission Plans"}
              </TabsTrigger>
              <TabsTrigger value="overrides" className="gap-2 data-[state=active]:bg-background">
                <Settings className="h-4 w-4" />
                {language === "ar" ? "الاستثناءات" : "Overrides"}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="plans" className="mt-0"><PermissionPlans /></TabsContent>
            <TabsContent value="overrides" className="mt-0"><UserPermissionOverride /></TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
