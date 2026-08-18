import { useState, useEffect } from "react";
import { usePagination } from "@/hooks/usePagination";
import { useSorting } from "@/hooks/useSorting";
import { DataPagination } from "@/components/ui/data-pagination";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users,
  Wifi,
  WifiOff,
  Search,
  RefreshCw,
  Clock,
  Download,
  Upload,
  Monitor,
  Globe,
  Loader2,
} from "lucide-react";

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Format seconds to human readable duration
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}س ${minutes}د`;
  } else if (minutes > 0) {
    return `${minutes}د ${secs}ث`;
  } else {
    return `${secs}ث`;
  }
}

export default function OnlineUsers() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [disconnectDialog, setDisconnectDialog] = useState<{
    open: boolean;
    username: string;
    sessionId: string;
    nasIp: string;
  }>({ open: false, username: "", sessionId: "", nasIp: "" });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [pageSize, setPageSize] = useState(50);

  // Fetch online sessions
  const { data: sessions, isLoading, refetch } = trpc.sessions.list.useQuery(undefined, {
    refetchInterval: autoRefresh ? 30000 : false, // Auto-refresh every 30 seconds
  });

  // Disconnect mutation
  const disconnectMutation = trpc.sessions.disconnectUser.useMutation({
    onSuccess: () => {
      toast.success("تم فصل المستخدم بنجاح");
      setDisconnectDialog({ open: false, username: "", sessionId: "", nasIp: "" });
      refetch();
    },
    onError: (error) => {
      toast.error(`فشل فصل المستخدم: ${error.message}`);
    },
  });

  // Filter sessions by search term
  const filteredSessions = sessions?.filter((session) =>
    session.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    session.nasIpAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    session.framedIpAddress?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Sorting
  const { sortedData: sortedSessions, sortColumn, sortDirection, handleSort } = useSorting(
    filteredSessions,
    "username",
    "asc"
  );

  // Pagination
  const effectivePageSize = showAll ? sortedSessions.length || 1 : pageSize;
  const {
    paginatedData: paginatedSessions,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedSessions, effectivePageSize);

  // Calculate stats
  const stats = {
    total: filteredSessions.length,
    totalDownload: filteredSessions.reduce((sum, s) => sum + (s.outputOctets || 0), 0),
    totalUpload: filteredSessions.reduce((sum, s) => sum + (s.inputOctets || 0), 0),
  };

  const handleDisconnect = (session: any) => {
    setDisconnectDialog({
      open: true,
      username: session.username,
      sessionId: session.id,
      nasIp: session.nasIpAddress,
    });
  };

  const confirmDisconnect = () => {
    disconnectMutation.mutate({ username: disconnectDialog.username });
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">المتصلين الآن</h1>
          <p className="text-muted-foreground">
            مراقبة وإدارة الجلسات النشطة في الوقت الفعلي
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 ml-2 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "تحديث تلقائي" : "تحديث يدوي"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 ml-2" />
            تحديث
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">المتصلين</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{sessions?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              جلسة نشطة الآن
              {searchTerm && stats.total !== sessions?.length && (
                <span className="mr-1 text-yellow-500">({stats.total} مطابق للبحث)</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">إجمالي التحميل</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {formatBytes(stats.totalDownload)}
            </div>
            <p className="text-xs text-muted-foreground">البيانات المستلمة</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">إجمالي الرفع</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">
              {formatBytes(stats.totalUpload)}
            </div>
            <p className="text-xs text-muted-foreground">البيانات المرسلة</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Controls */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث باسم المستخدم أو IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1.5 text-sm bg-background"
            value={showAll ? 'all' : pageSize}
            onChange={(e) => {
              if (e.target.value === 'all') {
                setShowAll(true);
              } else {
                setShowAll(false);
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }
            }}
          >
            <option value={25}>25 في الصفحة</option>
            <option value={50}>50 في الصفحة</option>
            <option value={100}>100 في الصفحة</option>
            <option value={200}>200 في الصفحة</option>
            <option value="all">عرض الكل</option>
          </select>
        </div>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              عرض <strong>{paginatedSessions.length}</strong> من إجمالي <strong className="text-green-500">{sessions?.length ?? 0}</strong> متصل
              {searchTerm && ` (${stats.total} مطابق للبحث)`}
            </span>
            {!showAll && totalPages > 1 && (
              <span className="text-xs text-muted-foreground">
                صفحة {currentPage} من {totalPages}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted/30 rounded animate-pulse" />
              ))}
            </div>
          ) : paginatedSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <WifiOff className="h-12 w-12 mb-4" />
              <p>لا يوجد متصلين حالياً</p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <SortableTableHead
                      column="username"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="text-right"
                    >
                      المستخدم
                    </SortableTableHead>
                    <SortableTableHead
                      column="framedIpAddress"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="text-right"
                    >
                      IP المستخدم
                    </SortableTableHead>
                    <SortableTableHead
                      column="nasName"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="text-right"
                    >
                      الشبكة
                    </SortableTableHead>
                    <SortableTableHead
                      column="sessionTime"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="text-right"
                    >
                      مدة الاتصال
                    </SortableTableHead>
                    <SortableTableHead
                      column="outputOctets"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="text-right"
                    >
                      تحميل
                    </SortableTableHead>
                    <SortableTableHead
                      column="inputOctets"
                      sortColumn={sortColumn}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                      className="text-right"
                    >
                      رفع
                    </SortableTableHead>
                    <TableHead className="text-right font-semibold">MAC</TableHead>
                    <TableHead className="text-center font-semibold w-[100px]">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSessions.map((session) => (
                    <TableRow key={session.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                          <span className="font-medium text-sm">{session.username}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Globe className="h-3.5 w-3.5" />
                          <span className="font-mono">{session.framedIpAddress || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1.5">
                          <Monitor className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <div>
                            <div className="font-medium text-sm">{session.nasName || session.nasIpAddress}</div>
                            {session.nasName && (
                              <div className="text-xs text-muted-foreground font-mono">{session.nasIpAddress}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{formatDuration(session.sessionTime || 0)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="text-blue-600 text-xs">
                          <Download className="h-3 w-3 ml-1" />
                          {formatBytes(session.outputOctets || 0)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant="outline" className="text-purple-600 text-xs">
                          <Upload className="h-3 w-3 ml-1" />
                          {formatBytes(session.inputOctets || 0)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-xs font-mono text-muted-foreground">
                          {session.callingStationId || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8"
                          onClick={() => handleDisconnect(session)}
                        >
                          <WifiOff className="h-3.5 w-3.5 ml-1" />
                          فصل
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <DataPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
              />
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <Dialog
        open={disconnectDialog.open}
        onOpenChange={(open) =>
          setDisconnectDialog({ ...disconnectDialog, open })
        }
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد فصل المستخدم</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من فصل المستخدم{" "}
              <strong>{disconnectDialog.username}</strong>؟
              <br />
              سيتم قطع اتصاله فوراً من الشبكة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setDisconnectDialog({ open: false, username: "", sessionId: "", nasIp: "" })
              }
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <WifiOff className="h-4 w-4 ml-2" />
              )}
              فصل المستخدم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
