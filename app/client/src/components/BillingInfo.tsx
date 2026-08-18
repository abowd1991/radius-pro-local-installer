import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDbDate } from '@/lib/dateFormat';
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Calendar, DollarSign, Server } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BillingInfoProps {
  data: {
    activeNasCount: number;
    dailyCost: number;
    billingStatus: string;
    billingStartAt: Date | null;
    lastDailyBillingDate: Date | null;
    dailyBillingEnabled: boolean;
    currentBalance: number;
  } | null;
  isLoading: boolean;
}

export function BillingInfo({ data, isLoading }: BillingInfoProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>معلومات الفوترة</CardTitle>
          <CardDescription>لم يتم تفعيل نظام الفوترة بعد</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              سيتم تفعيل نظام الفوترة من قبل المسؤول
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const statusColors: Record<string, string> = {
    active: "bg-green-500",
    past_due: "bg-red-500",
    suspended: "bg-gray-500",
  };

  const statusLabels: Record<string, string> = {
    active: "نشط",
    past_due: "متأخر",
    suspended: "معلق",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>معلومات الفوترة</CardTitle>
            <CardDescription>نظام الفوترة الشهري حسب عدد NAS الفعّالة</CardDescription>
          </div>
          <Badge className={statusColors[data.billingStatus]}>
            {statusLabels[data.billingStatus]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Past Due Alert */}
        {data.billingStatus === "past_due" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              رصيدك غير كافٍ. يرجى إضافة رصيد لمحفظتك لتجنب تعليق الخدمات.
            </AlertDescription>
          </Alert>
        )}

        {/* Active NAS & Monthly Cost */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 p-4 border rounded-lg">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">عدد NAS الفعّالة</p>
              <p className="text-2xl font-bold">{data.activeNasCount}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 border rounded-lg">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">التكلفة اليومية</p>
              <p className="text-2xl font-bold">${data.dailyCost.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                ${(data.dailyCost / (data.activeNasCount || 1)).toFixed(2)} لكل NAS
              </p>
            </div>
          </div>
        </div>

        {/* Low Balance Warning */}
        {data.currentBalance <= 2 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              ⚠️ رصيدك منخفض: ${data.currentBalance.toFixed(2)}. يرجى إضافة رصيد قريباً.
            </AlertDescription>
          </Alert>
        )}

        {/* Billing History */}
        {data.billingStartAt && (
          <div className="text-sm text-muted-foreground space-y-1 pt-2 border-t">
            <p>
              <span className="font-medium">تاريخ التفعيل:</span>{" "}
              {(() => { const d = parseDbDate(data.billingStartAt) ?? new Date(data.billingStartAt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })()}
            </p>
            {data.lastDailyBillingDate && (
              <p>
                <span className="font-medium">آخر خصم يومي:</span>{" "}
                {(() => { const d = parseDbDate(data.lastDailyBillingDate) ?? new Date(data.lastDailyBillingDate); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })()}
              </p>
            )}
            <p>
              <span className="font-medium">الرصيد الحالي:</span> $
              {data.currentBalance.toFixed(2)}
            </p>
          </div>
        )}

        {/* Info Note */}
        <div className="text-xs text-muted-foreground bg-muted p-3 rounded-lg">
          <p className="font-medium mb-1">ملاحظة:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>يتم الخصم تلقائياً يومياً من أول الشهر</li>
            <li>التكلفة: $0.33 يومياً لكل NAS فعّال</li>
            <li>NAS المعطّلة لا تُحسب في الفوترة</li>
            <li>إشعار تلقائي عند انخفاض الرصيد إلى $2 أو أقل</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
