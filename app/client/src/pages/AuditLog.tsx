import { useState } from "react";
import { parseDbDate } from '@/lib/dateFormat';
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  History, 
  Filter, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  User,
  Server,
  Clock,
  ChevronLeft,
  ChevronRight,
  Zap,
  Wifi,
  CreditCard,
  Users
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export default function AuditLog() {
  const [filters, setFilters] = useState({
    action: "all",
    targetType: "all",
    result: "all",
    startDate: "",
    endDate: "",
    limit: 50,
    offset: 0,
  });

  const { data: logs, isLoading, refetch } = trpc.audit.list.useQuery({
    action: filters.action === "all" ? undefined : filters.action,
    targetType: filters.targetType === "all" ? undefined : filters.targetType,
    result: (filters.result === "all" ? undefined : filters.result) as any,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    limit: filters.limit,
    offset: filters.offset,
  });

  const { data: actionTypes } = trpc.audit.actionTypes.useQuery();
  const { data: targetTypes } = trpc.audit.targetTypes.useQuery();
  const { data: stats } = trpc.audit.stats.useQuery({ days: 7 });

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'success':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 ml-1" />نجاح</Badge>;
      case 'failure':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 ml-1" />فشل</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><AlertCircle className="w-3 h-3 ml-1" />جزئي</Badge>;
      default:
        return <Badge variant="outline">{result}</Badge>;
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('session') || action.includes('disconnect')) return <Wifi className="w-4 h-4" />;
    if (action.includes('speed')) return <Zap className="w-4 h-4" />;
    if (action.includes('nas')) return <Server className="w-4 h-4" />;
    if (action.includes('card')) return <CreditCard className="w-4 h-4" />;
    if (action.includes('subscriber') || action.includes('user')) return <Users className="w-4 h-4" />;
    return <History className="w-4 h-4" />;
  };

  const getMethodBadge = (details: any) => {
    if (!details?.method) return null;
    switch (details.method) {
      case 'api':
        return <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">API</Badge>;
      case 'coa':
        return <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">CoA</Badge>;
      case 'coa_fallback':
        return <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/30">Fallback</Badge>;
      default:
        return null;
    }
  };

  const clearFilters = () => {
    setFilters({
      action: "all",
      targetType: "all",
      result: "all",
      startDate: "",
      endDate: "",
      limit: 50,
      offset: 0,
    });
  };

  const nextPage = () => {
    setFilters(f => ({ ...f, offset: f.offset + f.limit }));
  };

  const prevPage = () => {
    setFilters(f => ({ ...f, offset: Math.max(0, f.offset - f.limit) }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="w-6 h-6" />
            سجل العمليات
          </h1>
          <p className="text-muted-foreground">تتبع جميع العمليات الحساسة في النظام</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 ml-2" />
          تحديث
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي العمليات</p>
                  <p className="text-2xl font-bold">{stats.reduce((acc: any, s: any) => acc + Number(s.count), 0)}</p>
                </div>
                <History className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">ناجحة</p>
                  <p className="text-2xl font-bold text-green-500">
                    {stats.filter((s: any) => s.result === 'success').reduce((acc: any, s: any) => acc + Number(s.count), 0)}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">فاشلة</p>
                  <p className="text-2xl font-bold text-red-500">
                    {stats.filter((s: any) => s.result === 'failure').reduce((acc: any, s: any) => acc + Number(s.count), 0)}
                  </p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">آخر 7 أيام</p>
                  <p className="text-2xl font-bold">{stats.length} نوع</p>
                </div>
                <Clock className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            الفلاتر
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Select value={filters.action} onValueChange={(v) => setFilters(f => ({ ...f, action: v, offset: 0 }))}>
              <SelectTrigger>
                <SelectValue placeholder="نوع العملية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {actionTypes?.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.targetType} onValueChange={(v) => setFilters(f => ({ ...f, targetType: v, offset: 0 }))}>
              <SelectTrigger>
                <SelectValue placeholder="نوع الهدف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {targetTypes?.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.result} onValueChange={(v) => setFilters(f => ({ ...f, result: v, offset: 0 }))}>
              <SelectTrigger>
                <SelectValue placeholder="النتيجة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="success">نجاح</SelectItem>
                <SelectItem value="failure">فشل</SelectItem>
                <SelectItem value="partial">جزئي</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value, offset: 0 }))}
              placeholder="من تاريخ"
            />

            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value, offset: 0 }))}
              placeholder="إلى تاريخ"
            />

            <Button variant="outline" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>سجل العمليات</CardTitle>
          <CardDescription>
            عرض {logs?.length || 0} سجل
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs && logs.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الوقت</TableHead>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>العملية</TableHead>
                    <TableHead>الهدف</TableHead>
                    <TableHead>NAS</TableHead>
                    <TableHead>الطريقة</TableHead>
                    <TableHead>النتيجة</TableHead>
                    <TableHead>التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {log.createdAt ? format((parseDbDate(log.createdAt) ?? new Date(log.createdAt)), "dd/MM HH:mm", { locale: ar }) : '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">#{log.userId}</p>
                            <p className="text-xs text-muted-foreground">{log.userRole}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getActionIcon(log.action)}
                          <span className="text-sm">
                            {actionTypes?.find(t => t.value === log.action)?.label || log.action}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{log.targetName || '-'}</p>
                          <p className="text-xs text-muted-foreground">{log.targetType}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.nasIp ? (
                          <div className="flex items-center gap-1">
                            <Server className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm font-mono">{log.nasIp}</span>
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {getMethodBadge(log.details)}
                      </TableCell>
                      <TableCell>
                        {getResultBadge(log.result)}
                      </TableCell>
                      <TableCell>
                        {log.errorMessage ? (
                          <span className="text-xs text-red-400">{log.errorMessage}</span>
                        ) : log.details ? (
                          <span className="text-xs text-muted-foreground">
                            {log.details.uploadSpeedKbps && `↑${log.details.uploadSpeedKbps}k`}
                            {log.details.downloadSpeedKbps && ` ↓${log.details.downloadSpeedKbps}k`}
                            {log.details.executionTime && ` (${log.details.executionTime}ms)`}
                          </span>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  عرض {filters.offset + 1} - {filters.offset + (logs?.length || 0)}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prevPage}
                    disabled={filters.offset === 0}
                  >
                    <ChevronRight className="w-4 h-4" />
                    السابق
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextPage}
                    disabled={(logs?.length || 0) < filters.limit}
                  >
                    التالي
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>لا توجد سجلات</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
