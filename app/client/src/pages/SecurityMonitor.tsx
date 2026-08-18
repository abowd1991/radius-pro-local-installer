import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatDateTime as _fmtDTLib } from '@/lib/dateFormat';
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Database,
  Server,
  Activity,
  Users,
  TrendingUp,
  Clock,
  Bell,
  ShieldCheck,
} from "lucide-react";

// Simple bar chart component
function BarChart({
  data,
  acceptKey,
  rejectKey,
  labelKey,
}: {
  data: Record<string, number | string>[];
  acceptKey: string;
  rejectKey: string;
  labelKey: string;
}) {
  if (!data || data.length === 0) return <p className="text-muted-foreground text-sm text-center py-4">لا توجد بيانات</p>;

  const maxVal = Math.max(...data.map((d) => Number(d[acceptKey] || 0) + Number(d[rejectKey] || 0)));

  return (
    <div className="space-y-2">
      {data.map((item, i) => {
        const accepted = Number(item[acceptKey] || 0);
        const rejected = Number(item[rejectKey] || 0);
        const total = accepted + rejected;
        const acceptPct = maxVal > 0 ? (accepted / maxVal) * 100 : 0;
        const rejectPct = maxVal > 0 ? (rejected / maxVal) * 100 : 0;

        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-12 text-right shrink-0">
              {String(item[labelKey])}
            </span>
            <div className="flex-1 flex h-5 rounded overflow-hidden bg-muted/30">
              <div
                className="bg-emerald-500/80 transition-all"
                style={{ width: `${acceptPct}%` }}
                title={`مقبول: ${accepted}`}
              />
              <div
                className="bg-red-500/80 transition-all"
                style={{ width: `${rejectPct}%` }}
                title={`مرفوض: ${rejected}`}
              />
            </div>
            <span className="text-xs text-muted-foreground w-14 shrink-0">
              {total.toLocaleString()}
            </span>
          </div>
        );
      })}
      <div className="flex gap-4 pt-1">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-emerald-500/80" />
          <span className="text-xs text-muted-foreground">مقبول</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-red-500/80" />
          <span className="text-xs text-muted-foreground">مرفوض</span>
        </div>
      </div>
    </div>
  );
}

export default function SecurityMonitor() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { user } = useAuth();
  const isOwner = user?.role === "owner" || user?.role === "super_admin";

  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = trpc.security.getStats.useQuery(undefined, { refetchInterval: 60_000 });

  const {
    data: allowedIPs,
    isLoading: ipsLoading,
    refetch: refetchIPs,
  } = trpc.security.getAllowedIPs.useQuery(undefined, { refetchInterval: 120_000 });

  const {
    data: tableInfo,
    isLoading: tableLoading,
    refetch: refetchTable,
  } = trpc.security.getTableInfo.useQuery(undefined, { refetchInterval: 300_000 });

  const [refreshing, setRefreshing] = useState(false);

  const refreshIpsetMutation = trpc.security.refreshIpset.useMutation({
    onSuccess: (data) => {
      toast.success(
        isAr
          ? `✅ تم تحديث ipset بنجاح على VPS`
          : `✅ ipset refreshed successfully on VPS`,
        { duration: 5000 }
      );
      console.log("[ipset] output:", data.output);
    },
    onError: (err) => {
      toast.error(
        isAr
          ? `فشل تحديث ipset: ${err.message}`
          : `Failed to refresh ipset: ${err.message}`,
        { duration: 8000 }
      );
    },
  });

  const checkAttackMutation = trpc.security.checkAttackAlert.useMutation({
    onSuccess: (data) => {
      if (data.attackDetected) {
        toast.error(
          isAr
            ? `🚨 تم رصد هجوم! ${data.totalRejects.toLocaleString()} محاولة في آخر ساعة. تم إرسال تنبيه للمدير.`
            : `🚨 Attack detected! ${data.totalRejects.toLocaleString()} rejects in last hour. Owner notified.`,
          { duration: 8000 }
        );
      } else {
        toast.success(
          isAr
            ? `✅ لا يوجد هجوم حالياً (${data.totalRejects} رفض في آخر ساعة)`
            : `✅ No attack detected (${data.totalRejects} bot rejects in last hour)`,
          { duration: 5000 }
        );
      }
    },
    onError: () => {
      toast.error(isAr ? "حدث خطأ أثناء فحص الهجوم" : "Error checking attack status");
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchIPs(), refetchTable()]);
    setRefreshing(false);
  };

  const formatDate = (d: Date | string | null | undefined) => _fmtDTLib(d as string);

  const formatNumber = (n: number) => n.toLocaleString("ar-PS");

  return (
    <div className="p-6 space-y-6" dir={isAr ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">
              {isAr ? "مراقبة الأمان" : "Security Monitor"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "إحصائيات الهجمات ومحاولات الدخول غير المصرح بها"
                : "Attack statistics and unauthorized access attempts"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* ipset refresh - owner only */}
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshIpsetMutation.mutate()}
              disabled={refreshIpsetMutation.isPending}
              className="border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
              title={isAr ? "تحديث قائمة IPs المسموح بها على VPS" : "Refresh allowed IPs on VPS firewall"}
            >
              <ShieldCheck className={`h-4 w-4 mr-2 ${refreshIpsetMutation.isPending ? "animate-spin" : ""}`} />
              {refreshIpsetMutation.isPending
                ? (isAr ? "جاري التحديث..." : "Updating...")
                : (isAr ? "تحديث ipset" : "Refresh ipset")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkAttackMutation.mutate()}
            disabled={checkAttackMutation.isPending}
            className="border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
          >
            <Bell className={`h-4 w-4 mr-2 ${checkAttackMutation.isPending ? "animate-pulse" : ""}`} />
            {isAr ? "فحص الهجوم" : "Check Attack"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-4 w-16" />
              </CardContent>
            </Card>
          ))
        ) : stats ? (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground">
                    {isAr ? "إجمالي المحاولات (30 يوم)" : "Total Attempts (30d)"}
                  </span>
                </div>
                <p className="text-2xl font-bold">{formatNumber(stats.summary.total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">
                    {isAr ? "مقبول" : "Accepted"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">
                  {formatNumber(stats.summary.accepted)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.summary.acceptRate}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">
                    {isAr ? "مرفوض" : "Rejected"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-red-600">
                  {formatNumber(stats.summary.rejected)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.summary.rejectRate}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-muted-foreground">
                    {isAr ? "نسبة الرفض" : "Reject Rate"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-orange-600">
                  {stats.summary.rejectRate}%
                </p>
                {stats.summary.rejectRate > 50 && (
                  <Badge variant="destructive" className="text-xs mt-1">
                    {isAr ? "تحذير" : "Warning"}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Alert if high reject rate */}
      {stats && stats.summary.rejectRate > 70 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {isAr
              ? `تحذير: نسبة الرفض مرتفعة جداً (${stats.summary.rejectRate}%). قد يكون هناك هجوم مكثف.`
              : `Warning: Reject rate is very high (${stats.summary.rejectRate}%). Possible brute-force attack.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {isAr ? "الاتجاه اليومي (7 أيام)" : "Daily Trend (7 days)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : stats ? (
              <BarChart
                data={stats.dailyTrend.map((d) => ({
                  ...d,
                  day: String(d.day).slice(5), // MM-DD
                }))}
                acceptKey="accepted"
                rejectKey="rejected"
                labelKey="day"
              />
            ) : null}
          </CardContent>
        </Card>

        {/* Hourly Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {isAr ? "التوزيع الساعي (24 ساعة)" : "Hourly Distribution (24h)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : stats ? (
              <BarChart
                data={stats.hourlyDist.map((d) => ({
                  ...d,
                  hour: `${d.hour}:00`,
                }))}
                acceptKey="accepted"
                rejectKey="rejected"
                labelKey="hour"
              />
            ) : null}
          </CardContent>
        </Card>

        {/* Top Attacked Usernames (Bots) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              {isAr ? "أكثر يوزرات مهاجَمة (بوتات - 7 أيام)" : "Top Attacked Usernames (Bots - 7d)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : stats && stats.topAttacked.length > 0 ? (
              <div className="space-y-2">
                {stats.topAttacked.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                      <code className="text-sm font-mono">{item.username}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">
                        {formatNumber(item.attempts)} {isAr ? "محاولة" : "attempts"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">
                {isAr ? "لا توجد هجمات من بوتات" : "No bot attacks detected"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Real Users with Failed Logins */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-500" />
              {isAr ? "مستخدمين حقيقيين بكلمة سر خاطئة (7 أيام)" : "Real Users with Wrong Password (7d)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : stats && stats.realUserFails.length > 0 ? (
              <div className="space-y-2">
                {stats.realUserFails.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                      <code className="text-sm font-mono">{item.username}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-600">
                        {formatNumber(item.failCount)} {isAr ? "فشل" : "fails"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">
                {isAr ? "لا توجد محاولات فاشلة لمستخدمين حقيقيين" : "No failed logins for real users"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Firewall / Allowed IPs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-500" />
            {isAr ? "أجهزة NAS المسموح لها (Firewall)" : "Allowed NAS Devices (Firewall)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ipsLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : allowedIPs ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {allowedIPs.internalNetworks.map((net) => (
                  <Badge key={net} variant="secondary" className="font-mono text-xs">
                    🔒 {net}
                  </Badge>
                ))}
              </div>
              {allowedIPs.nasIPs.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-right pb-2 text-muted-foreground font-medium">
                          {isAr ? "عنوان IP" : "IP Address"}
                        </th>
                        <th className="text-right pb-2 text-muted-foreground font-medium">
                          {isAr ? "المجموعة" : "Group"}
                        </th>
                        <th className="text-right pb-2 text-muted-foreground font-medium">
                          {isAr ? "الاسم" : "Name"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allowedIPs.nasIPs.map((nas, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="py-2 font-mono text-xs">{nas.ip}</td>
                          <td className="py-2">
                            <Badge variant="outline" className="text-xs">
                              {nas.groupname}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground text-xs">{nas.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {isAr ? "لا توجد أجهزة NAS مسجلة" : "No NAS devices registered"}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Table Size Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-purple-500" />
              {isAr ? "جدول radpostauth" : "radpostauth Table"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tableLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : tableInfo ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? "عدد السجلات" : "Row Count"}</span>
                  <span className="font-mono font-bold">
                    {formatNumber(tableInfo.radpostauth.rowCount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? "أقدم سجل" : "Oldest"}</span>
                  <span className="text-xs">{formatDate(tableInfo.radpostauth.oldest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? "أحدث سجل" : "Newest"}</span>
                  <span className="text-xs">{formatDate(tableInfo.radpostauth.newest)}</span>
                </div>
                {tableInfo.radpostauth.rowCount > 500_000 && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertTriangle className="h-3 w-3" />
                    <AlertDescription className="text-xs">
                      {isAr
                        ? "الجدول كبير جداً — يُنصح بالأرشفة"
                        : "Table is very large — archiving recommended"}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              {isAr ? "جدول radacct" : "radacct Table"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tableLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : tableInfo ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? "عدد السجلات" : "Row Count"}</span>
                  <span className="font-mono font-bold">
                    {formatNumber(tableInfo.radacct.rowCount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? "جلسات نشطة" : "Active Sessions"}</span>
                  <span className="font-bold text-emerald-600">
                    {formatNumber(tableInfo.radacct.activeSessions)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? "أقدم سجل" : "Oldest"}</span>
                  <span className="text-xs">{formatDate(tableInfo.radacct.oldest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? "أحدث سجل" : "Newest"}</span>
                  <span className="text-xs">{formatDate(tableInfo.radacct.newest)}</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center">
        {isAr
          ? "يتم تحديث البيانات تلقائياً كل دقيقة. التوقيت بتوقيت فلسطين."
          : "Data auto-refreshes every minute. Timestamps in Palestine time."}
      </p>
    </div>
  );
}
