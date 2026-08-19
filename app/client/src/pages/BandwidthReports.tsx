import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { 
  RefreshCw, 
  Download, 
  BarChart3,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Users,
  Server,
  Calendar,
  HardDrive
} from "lucide-react";
import { toast } from "sonner";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { resolveOwnerRange, todayLocalDate } from "@/lib/timezoneV6";

interface UsageData {
  username: string;
  totalDownload: number;
  totalUpload: number;
  totalData: number;
  sessionCount: number;
  totalTime: number;
  lastActivity: Date | null;
}

interface NasUsageData {
  nasipaddress: string;
  nasShortname: string | null;
  totalDownload: number;
  totalUpload: number;
  totalData: number;
  userCount: number;
  sessionCount: number;
}

type BandwidthReportsProps = { embedded?: boolean };

const RANGE_PRESETS = {
  today: "today",
  yesterday: "yesterday",
  week: "thisWeek",
  month: "thisMonth",
  all: "last90Days",
} as const;

export function BandwidthReports({ embedded = false }: BandwidthReportsProps) {
  const { user } = useAuth();
  const { timezone } = useTimezoneV6();
  const language = user?.language || "ar";
  const isRtl = language === "ar";

  const [activeTab, setActiveTab] = useState("users");
  const [dateRange, setDateRange] = useState("today");
  const [sortBy, setSortBy] = useState("totalData");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const ownerRange = useMemo(
    () => resolveOwnerRange(RANGE_PRESETS[dateRange as keyof typeof RANGE_PRESETS], timezone),
    [dateRange, timezone],
  );

  // Queries
  const { data: usageData, refetch: refetchUsage, isLoading } = trpc.reports.getBandwidthUsage.useQuery({
    startDate: ownerRange.start.toISOString(),
    endDate: ownerRange.end.toISOString(),
    sortBy: sortBy as "totalData" | "totalDownload" | "totalUpload" | "sessionCount" | "totalTime",
    sortOrder,
  });

  const handleRefresh = () => {
    refetchUsage();
    toast.success(language === "ar" ? "تم تحديث البيانات" : "Data refreshed");
  };

  const handleExport = () => {
    if (!usageData) {
      toast.error(language === "ar" ? "لا توجد بيانات للتصدير" : "No data to export");
      return;
    }

    let csv = "";
    if (activeTab === "users") {
      csv = "Username,Download (MB),Upload (MB),Total (MB),Sessions,Total Time (hours)\n";
      usageData.userUsage?.forEach((u: UsageData) => {
        csv += `${u.username},${(u.totalDownload / 1024 / 1024).toFixed(2)},${(u.totalUpload / 1024 / 1024).toFixed(2)},${(u.totalData / 1024 / 1024).toFixed(2)},${u.sessionCount},${(u.totalTime / 3600).toFixed(2)}\n`;
      });
    } else {
      csv = "NAS IP,Name,Download (MB),Upload (MB),Total (MB),Users,Sessions\n";
      usageData.nasUsage?.forEach((n: NasUsageData) => {
        csv += `${n.nasipaddress},${n.nasShortname || '-'},${(n.totalDownload / 1024 / 1024).toFixed(2)},${(n.totalUpload / 1024 / 1024).toFixed(2)},${(n.totalData / 1024 / 1024).toFixed(2)},${n.userCount},${n.sessionCount}\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bandwidth-${activeTab}-${todayLocalDate(timezone, new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(language === "ar" ? "تم تصدير البيانات" : "Data exported");
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "0 B";
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatAxisBytes = (bytes: number) => {
    if (!bytes) return "0";
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)}${sizes[i]}`;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Calculate top user percentage for progress bar
  const maxUserData = useMemo(() => {
    if (!usageData?.userUsage || usageData.userUsage.length === 0) return 1;
    return Math.max(...usageData.userUsage.map((u: UsageData) => u.totalData));
  }, [usageData?.userUsage]);

  const maxNasData = useMemo(() => {
    if (!usageData?.nasUsage || usageData.nasUsage.length === 0) return 1;
    return Math.max(...usageData.nasUsage.map((n: NasUsageData) => n.totalData));
  }, [usageData?.nasUsage]);

  return (
      <div className={`${embedded ? "" : "container mx-auto py-6"} ${isRtl ? "rtl" : "ltr"}`} dir={isRtl ? "rtl" : "ltr"}>
        {/* Header */}
        {!embedded && <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              {language === "ar" ? "تقارير استهلاك الباندويث" : "Bandwidth Usage Reports"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === "ar" 
                ? "تحليل استهلاك البيانات لكل مستخدم وجهاز NAS" 
                : "Analyze data usage per user and NAS device"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {language === "ar" ? "تحديث" : "Refresh"}
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              {language === "ar" ? "تصدير CSV" : "Export CSV"}
            </Button>
          </div>
        </div>}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-blue-500" />
                {language === "ar" ? "إجمالي التحميل" : "Total Download"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {formatBytes(usageData?.stats?.totalDownload || 0)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                {language === "ar" ? "إجمالي الرفع" : "Total Upload"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatBytes(usageData?.stats?.totalUpload || 0)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-purple-500" />
                {language === "ar" ? "إجمالي البيانات" : "Total Data"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {formatBytes(usageData?.stats?.totalData || 0)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-orange-500" />
                {language === "ar" ? "المتصلون الآن" : "Connected Now"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {usageData?.stats?.activeUsers || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{language === "ar" ? "الفترة الزمنية" : "Date Range"}</Label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">{language === "ar" ? "اليوم" : "Today"}</SelectItem>
                    <SelectItem value="yesterday">{language === "ar" ? "أمس" : "Yesterday"}</SelectItem>
                    <SelectItem value="week">{language === "ar" ? "هذا الأسبوع" : "This Week"}</SelectItem>
                    <SelectItem value="month">{language === "ar" ? "هذا الشهر" : "This Month"}</SelectItem>
                    <SelectItem value="all">{language === "ar" ? "الكل" : "All Time"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>{language === "ar" ? "ترتيب حسب" : "Sort By"}</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="totalData">{language === "ar" ? "إجمالي البيانات" : "Total Data"}</SelectItem>
                    <SelectItem value="totalDownload">{language === "ar" ? "التحميل" : "Download"}</SelectItem>
                    <SelectItem value="totalUpload">{language === "ar" ? "الرفع" : "Upload"}</SelectItem>
                    <SelectItem value="sessionCount">{language === "ar" ? "عدد الجلسات" : "Sessions"}</SelectItem>
                    <SelectItem value="totalTime">{language === "ar" ? "الوقت" : "Time"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>{language === "ar" ? "الترتيب" : "Order"}</Label>
                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">{language === "ar" ? "تنازلي (الأكبر أولاً)" : "Descending"}</SelectItem>
                    <SelectItem value="asc">{language === "ar" ? "تصاعدي (الأصغر أولاً)" : "Ascending"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* V2: historical bandwidth from radacct; active count remains sourced from online_sessions. */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                {language === "ar" ? "استهلاك الباندويث عبر الزمن" : "Bandwidth Usage Over Time"}
              </CardTitle>
              <CardDescription>
                {usageData?.timeline?.granularity === "hour"
                  ? (language === "ar" ? "تجميع كل ساعة حسب توقيت المالك" : "Hourly aggregation in the owner's timezone")
                  : (language === "ar" ? "تجميع يومي حسب توقيت المالك" : "Daily aggregation in the owner's timezone")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[280px] animate-pulse rounded-md bg-muted" />
              ) : usageData?.timeline?.points?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={usageData.timeline.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bandwidthDownload" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.55} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.04} />
                      </linearGradient>
                      <linearGradient id="bandwidthUpload" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.55} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={28} />
                    <YAxis tickFormatter={formatAxisBytes} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={56} />
                    <Tooltip
                      formatter={(value: any) => formatBytes(Number(value ?? 0))}
                      labelFormatter={(label: any, payload: readonly any[]) => payload?.[0]?.payload?.tooltipLabel || label}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="totalDownload" name={language === "ar" ? "التحميل" : "Download"} stackId="usage" stroke="#3b82f6" fill="url(#bandwidthDownload)" strokeWidth={2} />
                    <Area type="monotone" dataKey="totalUpload" name={language === "ar" ? "الرفع" : "Upload"} stackId="usage" stroke="#10b981" fill="url(#bandwidthUpload)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  {language === "ar" ? "لا توجد بيانات تاريخية للفترة المحددة" : "No historical usage data for the selected period"}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                {language === "ar" ? "إجمالي البيانات والجلسات" : "Total Data and Sessions"}
              </CardTitle>
              <CardDescription>
                {language === "ar" ? "مرّر المؤشر فوق الرسم لعرض التفاصيل" : "Hover over the chart to view details"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[280px] animate-pulse rounded-md bg-muted" />
              ) : usageData?.timeline?.points?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={usageData.timeline.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={28} />
                    <YAxis yAxisId="bytes" tickFormatter={formatAxisBytes} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={56} />
                    <YAxis yAxisId="sessions" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={30} />
                    <Tooltip
                      formatter={(value: any, name: any) => [name === (language === "ar" ? "الجلسات" : "Sessions") ? value : formatBytes(Number(value ?? 0)), name]}
                      labelFormatter={(label: any, payload: readonly any[]) => payload?.[0]?.payload?.tooltipLabel || label}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="bytes" type="monotone" dataKey="totalData" name={language === "ar" ? "إجمالي البيانات" : "Total Data"} stroke="#8b5cf6" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                    <Line yAxisId="sessions" type="monotone" dataKey="sessionCount" name={language === "ar" ? "الجلسات" : "Sessions"} stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  {language === "ar" ? "لا توجد جلسات تاريخية للفترة المحددة" : "No historical sessions for the selected period"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              {language === "ar" ? "حسب المستخدم" : "By User"}
              {usageData?.userUsage && (
                <Badge variant="secondary" className="ml-2">{usageData.userUsage.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="nas">
              <Server className="h-4 w-4 mr-2" />
              {language === "ar" ? "حسب NAS" : "By NAS"}
              {usageData?.nasUsage && (
                <Badge variant="secondary" className="ml-2">{usageData.nasUsage.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>{language === "ar" ? "استهلاك المستخدمين" : "User Bandwidth Usage"}</CardTitle>
                <CardDescription>
                  {language === "ar" 
                    ? "تفاصيل استهلاك البيانات لكل مستخدم" 
                    : "Data usage details per user"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "جارٍ التحميل..." : "Loading..."}
                  </div>
                ) : usageData?.userUsage && usageData.userUsage.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>{language === "ar" ? "المستخدم" : "User"}</TableHead>
                        <TableHead>{language === "ar" ? "تحميل" : "Download"}</TableHead>
                        <TableHead>{language === "ar" ? "رفع" : "Upload"}</TableHead>
                        <TableHead>{language === "ar" ? "إجمالي" : "Total"}</TableHead>
                        <TableHead>{language === "ar" ? "الجلسات" : "Sessions"}</TableHead>
                        <TableHead>{language === "ar" ? "الوقت" : "Time"}</TableHead>
                        <TableHead className="w-[200px]">{language === "ar" ? "النسبة" : "Usage"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usageData.userUsage.map((user: UsageData, index: number) => (
                        <TableRow key={user.username}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell className="font-mono">{user.username}</TableCell>
                          <TableCell className="text-blue-600">{formatBytes(user.totalDownload)}</TableCell>
                          <TableCell className="text-green-600">{formatBytes(user.totalUpload)}</TableCell>
                          <TableCell className="font-medium">{formatBytes(user.totalData)}</TableCell>
                          <TableCell>{user.sessionCount}</TableCell>
                          <TableCell>{formatDuration(user.totalTime)}</TableCell>
                          <TableCell>
                            <Progress 
                              value={(user.totalData / maxUserData) * 100} 
                              className="h-2"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "لا توجد بيانات" : "No data found"}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* NAS Tab */}
          <TabsContent value="nas">
            <Card>
              <CardHeader>
                <CardTitle>{language === "ar" ? "استهلاك أجهزة NAS" : "NAS Bandwidth Usage"}</CardTitle>
                <CardDescription>
                  {language === "ar" 
                    ? "تفاصيل استهلاك البيانات لكل جهاز NAS" 
                    : "Data usage details per NAS device"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "جارٍ التحميل..." : "Loading..."}
                  </div>
                ) : usageData?.nasUsage && usageData.nasUsage.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>{language === "ar" ? "الجهاز" : "Device"}</TableHead>
                        <TableHead>{language === "ar" ? "العنوان" : "IP Address"}</TableHead>
                        <TableHead>{language === "ar" ? "تحميل" : "Download"}</TableHead>
                        <TableHead>{language === "ar" ? "رفع" : "Upload"}</TableHead>
                        <TableHead>{language === "ar" ? "إجمالي" : "Total"}</TableHead>
                        <TableHead>{language === "ar" ? "المستخدمين" : "Users"}</TableHead>
                        <TableHead>{language === "ar" ? "الجلسات" : "Sessions"}</TableHead>
                        <TableHead className="w-[200px]">{language === "ar" ? "النسبة" : "Usage"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usageData.nasUsage.map((nas: NasUsageData, index: number) => (
                        <TableRow key={nas.nasipaddress}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>{nas.nasShortname || "-"}</TableCell>
                          <TableCell className="font-mono text-sm">{nas.nasipaddress}</TableCell>
                          <TableCell className="text-blue-600">{formatBytes(nas.totalDownload)}</TableCell>
                          <TableCell className="text-green-600">{formatBytes(nas.totalUpload)}</TableCell>
                          <TableCell className="font-medium">{formatBytes(nas.totalData)}</TableCell>
                          <TableCell>{nas.userCount}</TableCell>
                          <TableCell>{nas.sessionCount}</TableCell>
                          <TableCell>
                            <Progress 
                              value={(nas.totalData / maxNasData) * 100} 
                              className="h-2"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "لا توجد بيانات" : "No data found"}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}

export default BandwidthReports;
