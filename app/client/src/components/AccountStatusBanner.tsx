import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Clock, 
  AlertTriangle, 
  XCircle, 
  CheckCircle, 
  Crown,
  Calendar,
  Zap
} from "lucide-react";
import { useLocation } from "wouter";

export function AccountStatusBanner() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [, setLocation] = useLocation();

  if (!user) return null;

  // Super admin doesn't need status banner
  if (user.role === "super_admin" || user.role === "owner") return null;

  const accountStatus = (user as any).accountStatus || "active";
  const _parseLocal = (v: unknown): Date | null => {
    if (!v) return null;
    const s = String(v).trim();
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  };
  const trialEndDate = _parseLocal((user as any).trialEndDate);
  const subscriptionEndDate = _parseLocal((user as any).subscriptionEndDate);
  const planName = (user as any).planName || null;

  const now = new Date();

  // Calculate days remaining
  const getDaysRemaining = (endDate: Date | null): number => {
    if (!endDate) return 0;
    const diff = endDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const formatDate = (date: Date) => {
    return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
  };

  // Trial Status
  if (accountStatus === "trial") {
    const daysRemaining = getDaysRemaining(trialEndDate);
    const totalDays = 7;
    const progress = ((totalDays - daysRemaining) / totalDays) * 100;

    if (daysRemaining <= 0) {
      return (
        <Alert variant="destructive" className="mb-4">
          <XCircle className="h-4 w-4" />
          <AlertTitle>
            {language === "ar" ? "انتهت الفترة التجريبية" : "Trial Expired"}
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {language === "ar" 
                ? "انتهت فترتك التجريبية. اشترك الآن للاستمرار في استخدام الخدمة."
                : "Your trial has expired. Subscribe now to continue using the service."}
            </span>
            <Button size="sm" variant="outline" className="ml-4" onClick={() => setLocation("/pricing")}>
              {language === "ar" ? "اشترك الآن" : "Subscribe Now"}
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    if (daysRemaining <= 2) {
      return (
        <Alert className="mb-4 border-orange-500 bg-orange-50 dark:bg-orange-950/20">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <AlertTitle className="text-orange-700 dark:text-orange-400">
            {language === "ar" 
              ? `⚠️ تنتهي الفترة التجريبية خلال ${daysRemaining} ${daysRemaining === 1 ? "يوم" : "أيام"}`
              : `⚠️ Trial expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-orange-600 dark:text-orange-300 text-sm">
                {language === "ar" 
                  ? `تاريخ الانتهاء: ${trialEndDate ? formatDate(trialEndDate) : "-"}`
                  : `Expires on: ${trialEndDate ? formatDate(trialEndDate) : "-"}`}
              </p>
              <Progress value={progress} className="h-2 mt-2" />
            </div>
            <Button size="sm" className="ml-4 bg-orange-500 hover:bg-orange-600" onClick={() => setLocation("/pricing")}>
              <Zap className="h-4 w-4 mr-1" />
              {language === "ar" ? "ترقية الآن" : "Upgrade Now"}
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert className="mb-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
        <Clock className="h-4 w-4 text-blue-500" />
        <AlertTitle className="text-blue-700 dark:text-blue-400 flex items-center gap-2">
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
            {language === "ar" ? "فترة تجريبية" : "Trial"}
          </Badge>
          {language === "ar" 
            ? `متبقي ${daysRemaining} ${daysRemaining === 1 ? "يوم" : "أيام"}`
            : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`}
        </AlertTitle>
        <AlertDescription>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-blue-600 dark:text-blue-300 text-sm">
                {language === "ar" 
                  ? `تاريخ الانتهاء: ${trialEndDate ? formatDate(trialEndDate) : "-"}`
                  : `Expires on: ${trialEndDate ? formatDate(trialEndDate) : "-"}`}
              </p>
              <Progress value={progress} className="h-2 mt-2" />
            </div>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Expired Status
  if (accountStatus === "expired") {
    return (
      <Alert variant="destructive" className="mb-4">
        <XCircle className="h-4 w-4" />
        <AlertTitle>
          {language === "ar" ? "❌ انتهى اشتراكك" : "❌ Subscription Expired"}
        </AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>
            {language === "ar" 
              ? "تم إيقاف خدماتك. جدد اشتراكك لإعادة التفعيل."
              : "Your services have been suspended. Renew your subscription to reactivate."}
          </span>
          <Button size="sm" variant="outline" className="ml-4" onClick={() => setLocation("/pricing")}>
            {language === "ar" ? "جدد الآن" : "Renew Now"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Suspended Status
  if (accountStatus === "suspended") {
    return (
      <Alert variant="destructive" className="mb-4">
        <XCircle className="h-4 w-4" />
        <AlertTitle>
          {language === "ar" ? "🚫 الحساب معلق" : "🚫 Account Suspended"}
        </AlertTitle>
        <AlertDescription>
          {language === "ar" 
            ? "تم تعليق حسابك. تواصل مع الدعم الفني للمزيد من المعلومات."
            : "Your account has been suspended. Contact support for more information."}
        </AlertDescription>
      </Alert>
    );
  }

  // Active Subscription
  if (accountStatus === "active" && subscriptionEndDate) {
    const daysRemaining = getDaysRemaining(subscriptionEndDate);

    // Warning if less than 7 days
    if (daysRemaining <= 7 && daysRemaining > 0) {
      return (
        <Alert className="mb-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
          <Calendar className="h-4 w-4 text-yellow-500" />
          <AlertTitle className="text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
            <Badge className="bg-yellow-100 text-yellow-700">
              {planName || (language === "ar" ? "مشترك" : "Active")}
            </Badge>
            {language === "ar" 
              ? `ينتهي اشتراكك خلال ${daysRemaining} ${daysRemaining === 1 ? "يوم" : "أيام"}`
              : `Subscription expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span className="text-yellow-600 dark:text-yellow-300 text-sm">
              {language === "ar" 
                ? `تاريخ الانتهاء: ${formatDate(subscriptionEndDate)}`
                : `Expires on: ${formatDate(subscriptionEndDate)}`}
            </span>
            <Button size="sm" className="ml-4 bg-yellow-500 hover:bg-yellow-600 text-black" onClick={() => setLocation("/pricing")}>
              {language === "ar" ? "جدد الآن" : "Renew Now"}
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    // Normal active status (optional - can be hidden)
    if (daysRemaining > 30) {
      return null; // Don't show banner for long subscriptions
    }

    return (
      <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950/20">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <AlertTitle className="text-green-700 dark:text-green-400 flex items-center gap-2">
          <Badge className="bg-green-100 text-green-700">
            <Crown className="h-3 w-3 mr-1" />
            {planName || (language === "ar" ? "مشترك" : "Active")}
          </Badge>
          {language === "ar" ? "اشتراك نشط" : "Active Subscription"}
        </AlertTitle>
        <AlertDescription className="text-green-600 dark:text-green-300 text-sm">
          {language === "ar" 
            ? `صالح حتى: ${formatDate(subscriptionEndDate)} (${daysRemaining} يوم متبقي)`
            : `Valid until: ${formatDate(subscriptionEndDate)} (${daysRemaining} days remaining)`}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
