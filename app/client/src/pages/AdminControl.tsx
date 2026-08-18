import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, UserCog, Briefcase } from "lucide-react";

// Import existing page components
import UsersManagement from "./UsersManagement";
import PermissionPlans from "./PermissionPlans";
import UserPermissionOverride from "./UserPermissionOverride";
import Resellers from "./Resellers";

/**
 * Admin Master Control Page
 * 
 * Unified admin interface for Owner to manage:
 * - Users (Clients + Resellers)
 * - Permission Plans
 * - User Permission Overrides
 * - Resellers
 */
export default function AdminControl() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Shield className="w-8 h-8" />
          لوحة التحكم الرئيسية
        </h1>
        <p className="text-muted-foreground mt-2">
          إدارة شاملة للمستخدمين والصلاحيات والموزعين
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">المستخدمين</span>
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">خطط الصلاحيات</span>
          </TabsTrigger>
          <TabsTrigger value="overrides" className="flex items-center gap-2">
            <UserCog className="w-4 h-4" />
            <span className="hidden sm:inline">الاستثناءات</span>
          </TabsTrigger>
          <TabsTrigger value="resellers" className="flex items-center gap-2">
            <Briefcase className="w-4 h-4" />
            <span className="hidden sm:inline">الموزعين</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>إدارة المستخدمين</CardTitle>
              <CardDescription>
                عرض وإدارة جميع المستخدمين في النظام
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UsersManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>خطط الصلاحيات</CardTitle>
              <CardDescription>
                إدارة خطط الصلاحيات للعملاء والموزعين
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PermissionPlans />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overrides" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>استثناءات الصلاحيات</CardTitle>
              <CardDescription>
                إدارة الاستثناءات الفردية للمستخدمين بدون تغيير الخطة الأساسية
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserPermissionOverride />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resellers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>الموزعين</CardTitle>
              <CardDescription>
                إدارة الموزعين والوكلاء
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Resellers />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
