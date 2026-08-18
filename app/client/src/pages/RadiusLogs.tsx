import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  RefreshCw, 
  Download, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Activity,
  FileText,
  Filter,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime , parseDbDate } from '@/lib/dateFormat';
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { formatDateTime as formatOwnerDateTime, todayLocalDate } from "@/lib/timezoneV6";


export default function RadiusLogs() {
  const { user } = useAuth();
  const { timezone } = useTimezoneV6();
  const language = user?.language || "ar";
  const isRtl = language === "ar";

  const [activeTab, setActiveTab] = useState("auth");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [nasFilter, setNasFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("week");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Debounce search input to avoid excessive queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [statusFilter, nasFilter, dateFilter, limit]);

  // Queries
  const { data: authLogs, refetch: refetchAuth, isLoading: isLoadingAuth } = trpc.logs.getAuthLogs.useQuery({
    page,
    limit,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    dateRange: dateFilter,
  });

  const { data: acctLogs, refetch: refetchAcct, isLoading: isLoadingAcct } = trpc.logs.getAccountingLogs.useQuery({
    page,
    limit,
    search: searchQuery || undefined,
    nasIp: nasFilter !== "all" ? nasFilter : undefined,
    dateRange: dateFilter,
  });

  const { data: nasDevices } = trpc.nas.list.useQuery();

  const handleRefresh = () => {
    if (activeTab === "auth") {
      refetchAuth();
    } else {
      refetchAcct();
    }
    toast.success(language === "ar" ? "تم تحديث البيانات" : "Data refreshed");
  };

  const handleExport = () => {
    // Export to CSV
    const data = activeTab === "auth" ? authLogs?.logs : acctLogs?.logs;
    if (!data || data.length === 0) {
      toast.error(language === "ar" ? "لا توجد بيانات للتصدير" : "No data to export");
      return;
    }

    let csv = "";
    if (activeTab === "auth") {
      csv = "Username,Reply,NAS IP,Date\n";
      data.forEach((log: any) => {
        csv += `${log.username},${log.reply},${log.nasipaddress || "-"},${formatOwnerDateTime(parseDbDate(log.authdate) ?? new Date(log.authdate), timezone)}\n`;
      });
    } else {
      csv = "Username,NAS IP,Start Time,Stop Time,Session Time,Download (MB),Upload (MB),Terminate Cause\n";
      data.forEach((log: any) => {
        const downloadMB = log.acctoutputoctets ? (log.acctoutputoctets / 1024 / 1024).toFixed(2) : "0";
        const uploadMB = log.acctinputoctets ? (log.acctinputoctets / 1024 / 1024).toFixed(2) : "0";
        const start = log.acctstarttime ? formatOwnerDateTime(parseDbDate(log.acctstarttime) ?? new Date(log.acctstarttime), timezone) : "-";
        const stop = log.acctstoptime ? formatOwnerDateTime(parseDbDate(log.acctstoptime) ?? new Date(log.acctstoptime), timezone) : "-";
        csv += `${log.username},${log.nasipaddress},${start},${stop},${log.acctsessiontime || 0},${downloadMB},${uploadMB},${log.acctterminatecause || "-"}\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `radius-${activeTab}-logs-${todayLocalDate(timezone)}.csv`;
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

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const getReplyBadge = (reply: string) => {
    if (reply === "Access-Accept") {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="h-3 w-3 mr-1" />{language === "ar" ? "مقبول" : "Accept"}</Badge>;
    } else if (reply === "Access-Reject") {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"><XCircle className="h-3 w-3 mr-1" />{language === "ar" ? "مرفوض" : "Reject"}</Badge>;
    }
    return <Badge variant="secondary">{reply}</Badge>;
  };

  return (
      <div className={`container mx-auto py-6 ${isRtl ? "rtl" : "ltr"}`} dir={isRtl ? "rtl" : "ltr"}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6" />
              {language === "ar" ? "سجلات RADIUS" : "RADIUS Logs"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === "ar" 
                ? "عرض سجلات المصادقة والمحاسبة من FreeRADIUS" 
                : "View authentication and accounting logs from FreeRADIUS"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {language === "ar" ? "تحديث" : "Refresh"}
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              {language === "ar" ? "تصدير CSV" : "Export CSV"}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-green-200 dark:border-green-900">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "مصادقات ناجحة" : "Accepted"}</p>
                  <div className="text-2xl font-bold text-green-600">
                    {isLoadingAuth ? "..." : (authLogs?.stats?.accepted || 0).toLocaleString()}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-red-200 dark:border-red-900">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "مصادقات مرفوضة" : "Rejected"}</p>
                  <div className="text-2xl font-bold text-red-600">
                    {isLoadingAuth ? "..." : (authLogs?.stats?.rejected || 0).toLocaleString()}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
              </div>
              {authLogs && authLogs.stats && (authLogs.stats.accepted + authLogs.stats.rejected) > 0 && (
                <div className="mt-2">
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                    <div 
                      className="bg-green-500 transition-all" 
                      style={{ width: `${Math.round(authLogs.stats.accepted / (authLogs.stats.accepted + authLogs.stats.rejected) * 100)}%` }}
                    />
                    <div className="bg-red-500 flex-1" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.round(authLogs.stats.accepted / (authLogs.stats.accepted + authLogs.stats.rejected) * 100)}% {language === "ar" ? "نجاح" : "success rate"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="border-blue-200 dark:border-blue-900">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "جلسات نشطة" : "Active Sessions"}</p>
                  <div className="text-2xl font-bold text-blue-600">
                    {acctLogs?.stats?.activeSessions || 0}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-orange-200 dark:border-orange-900">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "إجمالي وقت الجلسات" : "Total Session Time"}</p>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatDuration(acctLogs?.stats?.totalSessionTime || 0)}
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Search */}
              <div className="flex-1 min-w-[200px] space-y-1">
                <Label className="text-xs">{language === "ar" ? "بحث باسم المستخدم" : "Search Username"}</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  {searchQuery && debouncedSearch !== searchQuery && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  )}
                  <Input 
                    placeholder={language === "ar" ? "701083..." : "701083..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              
              {/* Status filter - auth tab only */}
              {activeTab === "auth" && (
                <div className="space-y-1">
                  <Label className="text-xs">{language === "ar" ? "الحالة" : "Status"}</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{language === "ar" ? "الكل" : "All"}</SelectItem>
                      <SelectItem value="Access-Accept">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          {language === "ar" ? "مقبول" : "Accepted"}
                        </span>
                      </SelectItem>
                      <SelectItem value="Access-Reject">
                        <span className="flex items-center gap-1.5">
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                          {language === "ar" ? "مرفوض" : "Rejected"}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* NAS filter - accounting tab only */}
              {activeTab === "accounting" && (
                <div className="space-y-1">
                  <Label className="text-xs">{language === "ar" ? "جهاز NAS" : "NAS Device"}</Label>
                  <Select value={nasFilter} onValueChange={setNasFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{language === "ar" ? "الكل" : "All"}</SelectItem>
                      {nasDevices?.map((nas: any) => (
                        <SelectItem key={nas.id} value={nas.nasname}>
                          {nas.shortname} ({nas.nasname})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Date Range */}
              <div className="space-y-1">
                <Label className="text-xs">{language === "ar" ? "الفترة" : "Date Range"}</Label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-36">
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

              {/* Page size */}
              <div className="space-y-1">
                <Label className="text-xs">{language === "ar" ? "عرض" : "Show"}</Label>
                <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="auth">
              {language === "ar" ? "سجلات المصادقة" : "Authentication Logs"}
              {authLogs?.total !== undefined && (
                <Badge variant="secondary" className="ml-2">{authLogs.total}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="accounting">
              {language === "ar" ? "سجلات المحاسبة" : "Accounting Logs"}
              {acctLogs?.total !== undefined && (
                <Badge variant="secondary" className="ml-2">{acctLogs.total}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Authentication Logs Tab */}
          <TabsContent value="auth">
            <Card>
              <CardHeader>
                <CardTitle>{language === "ar" ? "سجلات المصادقة (radpostauth)" : "Authentication Logs (radpostauth)"}</CardTitle>
                <CardDescription>
                  {language === "ar" 
                    ? "سجل جميع محاولات تسجيل الدخول (Access-Accept / Access-Reject)" 
                    : "Log of all login attempts (Access-Accept / Access-Reject)"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAuth ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex gap-4 animate-pulse">
                        <div className="h-8 bg-muted rounded w-32" />
                        <div className="h-8 bg-muted rounded w-24" />
                        <div className="h-8 bg-muted rounded flex-1" />
                      </div>
                    ))}
                  </div>
                ) : authLogs?.logs && authLogs.logs.length > 0 ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{language === "ar" ? "اسم المستخدم" : "Username"}</TableHead>
                          <TableHead>{language === "ar" ? "كلمة السر" : "Password"}</TableHead>
                          <TableHead>{language === "ar" ? "النتيجة" : "Result"}</TableHead>
                          <TableHead>{language === "ar" ? "التاريخ والوقت" : "Date & Time"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {authLogs.logs.map((log: any, index: number) => (
                          <TableRow 
                            key={log.id || index}
                            className={log.reply === 'Access-Accept' ? 'bg-green-50/30 dark:bg-green-950/10' : log.reply === 'Access-Reject' ? 'bg-red-50/30 dark:bg-red-950/10' : ''}
                          >
                            <TableCell className="font-mono font-medium">{log.username}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{log.pass || '-'}</TableCell>
                            <TableCell>{getReplyBadge(log.reply)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDateTime(log.authdate)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-sm text-muted-foreground">
                        {language === "ar" 
                          ? `عرض ${(page - 1) * limit + 1} - ${Math.min(page * limit, authLogs.total)} من ${authLogs.total}`
                          : `Showing ${(page - 1) * limit + 1} - ${Math.min(page * limit, authLogs.total)} of ${authLogs.total}`}
                      </span>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          {language === "ar" ? "السابق" : "Previous"}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setPage(p => p + 1)}
                          disabled={page * limit >= authLogs.total}
                        >
                          {language === "ar" ? "التالي" : "Next"}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "لا توجد سجلات" : "No logs found"}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Accounting Logs Tab */}
          <TabsContent value="accounting">
            <Card>
              <CardHeader>
                <CardTitle>{language === "ar" ? "سجلات المحاسبة (radacct)" : "Accounting Logs (radacct)"}</CardTitle>
                <CardDescription>
                  {language === "ar" 
                    ? "سجل الجلسات مع تفاصيل الاستهلاك والوقت" 
                    : "Session logs with usage and time details"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAcct ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "جارٍ التحميل..." : "Loading..."}
                  </div>
                ) : acctLogs?.logs && acctLogs.logs.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{language === "ar" ? "اسم المستخدم" : "Username"}</TableHead>
                            <TableHead>{language === "ar" ? "NAS IP" : "NAS IP"}</TableHead>
                            <TableHead>{language === "ar" ? "بداية الجلسة" : "Start Time"}</TableHead>
                            <TableHead>{language === "ar" ? "نهاية الجلسة" : "Stop Time"}</TableHead>
                            <TableHead>{language === "ar" ? "المدة" : "Duration"}</TableHead>
                            <TableHead>{language === "ar" ? "تحميل" : "Download"}</TableHead>
                            <TableHead>{language === "ar" ? "رفع" : "Upload"}</TableHead>
                            <TableHead>{language === "ar" ? "سبب الإنهاء" : "Terminate Cause"}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {acctLogs.logs.map((log: any) => (
                            <TableRow key={log.radacctid}>
                              <TableCell className="font-mono">{log.username}</TableCell>
                              <TableCell className="font-mono text-sm">{log.nasipaddress}</TableCell>
                              <TableCell>
                                {log.acctstarttime 
                                  ? formatDateTime(log.acctstarttime)
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                {log.acctstoptime 
                                  ? formatDateTime(log.acctstoptime)
                                  : <Badge variant="outline" className="text-green-600">{language === "ar" ? "نشط" : "Active"}</Badge>}
                              </TableCell>
                              <TableCell>{formatDuration(log.acctsessiontime)}</TableCell>
                              <TableCell>{formatBytes(log.acctoutputoctets)}</TableCell>
                              <TableCell>{formatBytes(log.acctinputoctets)}</TableCell>
                              <TableCell>
                                {log.acctterminatecause ? (
                                  <Badge variant="secondary">{log.acctterminatecause}</Badge>
                                ) : "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-sm text-muted-foreground">
                        {language === "ar" 
                          ? `عرض ${(page - 1) * limit + 1} - ${Math.min(page * limit, acctLogs.total)} من ${acctLogs.total}`
                          : `Showing ${(page - 1) * limit + 1} - ${Math.min(page * limit, acctLogs.total)} of ${acctLogs.total}`}
                      </span>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                        >
                          {language === "ar" ? "السابق" : "Previous"}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setPage(p => p + 1)}
                          disabled={page * limit >= acctLogs.total}
                        >
                          {language === "ar" ? "التالي" : "Next"}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {language === "ar" ? "لا توجد سجلات" : "No logs found"}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
