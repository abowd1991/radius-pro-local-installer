import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from '@/lib/dateFormat';
import { 
  Clock, 
  User, 
  CreditCard, 
  Server, 
  LogIn, 
  DollarSign,
  Activity,
  Loader2
} from "lucide-react";

export default function ActivityTimeline() {
  const { user } = useAuth();
  const { language } = useLanguage();

  const { data: activities, isLoading } = trpc.users.getActivityTimeline.useQuery({
    userId: user?.id || 0,
    limit: 100,
  }, {
    enabled: !!user,
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "login":
        return <LogIn className="w-5 h-5 text-green-500" />;
      case "balance_change":
        return <DollarSign className="w-5 h-5 text-blue-500" />;
      case "card_creation":
        return <CreditCard className="w-5 h-5 text-purple-500" />;
      case "nas_management":
        return <Server className="w-5 h-5 text-orange-500" />;
      default:
        return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "login":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "balance_change":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "card_creation":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "nas_management":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  if (!user) {
    return (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
    );
  }

  return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">{language === "ar" ? "سجل النشاطات" : "Activity Timeline"}</h1>
          <p className="text-muted-foreground mt-1">
            {language === "ar" ? "عرض جميع نشاطاتك في النظام" : "View all your activities in the system"}
          </p>
        </div>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {language === "ar" ? "آخر 100 نشاط" : "Last 100 Activities"}
            </CardTitle>
            <CardDescription>
              {language === "ar" ? "سجل كامل لجميع العمليات التي قمت بها" : "Complete log of all operations you performed"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : activities && activities.activities.length > 0 ? (
              <div className="space-y-4">
                {activities.activities.map((activity: any, index: number) => (
                  <div key={index} className="flex items-start gap-4 p-4 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="mt-1">
                      {getActivityIcon(activity.action_type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={getActivityColor(activity.action_type)}>
                          {activity.action_type}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDateTime(activity.created_at)}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{activity.description || activity.action}</p>
                      {activity.details && (
                        <p className="text-sm text-muted-foreground">{activity.details}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {language === "ar" ? "لا توجد نشاطات بعد" : "No activities yet"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
