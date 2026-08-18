import { useAuth } from "@/_core/hooks/useAuth";
import { parseDbDate, formatDate as _fmtDateLib, formatVpsTimeOnly as _fmtTimeOnly } from '@/lib/dateFormat';
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Filter,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  History,
  Router,
  Calendar,
  Play,
  Wifi,
  Shield,
  Link2,
  Globe,
  Timer,
  Clock,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useLocation } from "wouter";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { parseDateTimeLocal, resolveOwnerRange, shiftLocalDate, todayLocalDate } from "@/lib/timezoneV6";

// Event type configurations for SoftEther logs
const eventTypeConfig: Record<string, { color: string; labelAr: string; labelEn: string; icon: any }> = {
  connecting: { color: "bg-yellow-500", labelAr: "جاري الاتصال", labelEn: "Connecting", icon: Loader2 },
  connected: { color: "bg-green-500", labelAr: "تم المصادقة", labelEn: "Authenticated", icon: CheckCircle2 },
  session_start: { color: "bg-blue-500", labelAr: "بدء الجلسة", labelEn: "Session Started", icon: Play },
  disconnected: { color: "bg-gray-500", labelAr: "انقطع", labelEn: "Disconnected", icon: XCircle },
  dhcp: { color: "bg-purple-500", labelAr: "DHCP", labelEn: "DHCP", icon: Wifi },
  info: { color: "bg-gray-400", labelAr: "معلومات", labelEn: "Info", icon: AlertCircle },
  error: { color: "bg-red-500", labelAr: "خطأ", labelEn: "Error", icon: AlertCircle },
};

// Connection type badge
function ConnectionTypeBadge({ type, direction }: { type: string; direction: string }) {
  const icons: Record<string, any> = { vpn_l2tp: Shield, vpn_sstp: Link2, public_ip: Globe };
  const labels: Record<string, { ar: string; en: string; color: string }> = {
    vpn_l2tp: { ar: "L2TP", en: "L2TP", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    vpn_sstp: { ar: "SSTP", en: "SSTP", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
    public_ip: { ar: "IP عام", en: "Public IP", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  };
  const Icon = icons[type] || Globe;
  const label = labels[type] || labels.public_ip;
  return (
    <Badge variant="secondary" className={label.color}>
      <Icon className={`w-3 h-3 ${direction === "rtl" ? "ml-1" : "mr-1"}`} />
      {label.en}
    </Badge>
  );
}

// Date range presets
type DatePreset = "today" | "yesterday" | "last7days" | "last30days" | "all";

export default function VpnLogs() {
  const { user } = useAuth();
  const { language, direction } = useLanguage();
  const { timezone } = useTimezoneV6();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEventType, setSelectedEventType] = useState<string>("all");
  const [selectedConnectionType, setSelectedConnectionType] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Redirect non-admin users
  useEffect(() => {
    if (user && user.role !== "super_admin" && user.role !== "owner") {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  if (!user || (user.role !== "super_admin" && user.role !== "owner")) {
    return null;
  }

  // Fetch VPN logs from SoftEther
  const { data: logsData, isLoading, refetch, isRefetching } = trpc.vpn.logs.useQuery({
    eventType: selectedEventType !== "all" ? selectedEventType : undefined,
    limit: 200,
  }, {
    refetchInterval: autoRefreshEnabled ? 30000 : false,
    refetchIntervalInBackground: false,
  });

  // Fetch NAS devices to map usernames to NAS names
  const { data: nasData } = trpc.nas.list.useQuery();

  // Track last refresh time
  useEffect(() => {
    if (!isRefetching && !isLoading) {
      setLastRefreshed(new Date());
    }
  }, [isRefetching, isLoading]);

  // Build username → NAS map
  const usernameToNas = useMemo(() => {
    const map: Record<string, { shortname: string; connectionType: string }> = {};
    if (nasData?.nasList) {
      for (const nas of nasData.nasList) {
        if (nas.vpnUsername) {
          map[nas.vpnUsername.toLowerCase()] = {
            shortname: nas.shortname || nas.nasname,
            connectionType: nas.connectionType || "public_ip",
          };
        }
      }
    }
    return map;
  }, [nasData]);

  // Compute date range from preset
  const dateRange = useMemo(() => {
    switch (datePreset) {
      case "today":
        { const range = resolveOwnerRange("today", timezone); return { from: range.start, to: range.end }; }
      case "yesterday":
        { const range = resolveOwnerRange("yesterday", timezone); return { from: range.start, to: range.end }; }
      case "last7days":
        return { from: parseDateTimeLocal(`${shiftLocalDate(-7, timezone)}T00:00`, timezone)!, to: new Date() };
      case "last30days":
        return { from: parseDateTimeLocal(`${shiftLocalDate(-30, timezone)}T00:00`, timezone)!, to: new Date() };
      default:
        return null;
    }
  }, [datePreset, timezone]);

  // Parse timestamp from new API format: "2026-04-30T01:53:00+0200"
  const parseLogTimestamp = (log: any): { date: string; time: string; dateObj: Date | null } => {
    if (log.timestamp) {
      try {
        const d = (parseDbDate(log.timestamp) ?? new Date(log.timestamp));
        return {
          date: _fmtDateLib(d),
          time: _fmtTimeOnly(d),
          dateObj: d,
        };
      } catch { /* fall through */ }
    }
    if (log.date) {
      try {
        const d = (parseDbDate(`${log.date} ${log.time || "00:00:00"}`) ?? new Date(`${log.date} ${log.time || "00:00:00"}`));
        return { date: log.date, time: log.time || "-", dateObj: d };
      } catch { /* fall through */ }
    }
    return { date: "-", time: "-", dateObj: null };
  };

  // Filter logs based on search, connection type, and date range
  const filteredLogs = useMemo(() => {
    if (!logsData?.logs) return [];

    return logsData.logs.filter((log: any) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        (log.username || "").toLowerCase().includes(searchLower) ||
        (log.message || "").toLowerCase().includes(searchLower) ||
        (log.ipAddress || "").toLowerCase().includes(searchLower) ||
        (log.interface || "").toLowerCase().includes(searchLower);

      // Event type filter
      const matchesEvent =
        selectedEventType === "all" || log.eventType === selectedEventType;

      // Connection type filter — L2TP uses ppp interfaces
      const matchesConnType =
        selectedConnectionType === "all" ||
        (selectedConnectionType === "l2tp") || // all VPN logs are L2TP/PPP
        (selectedConnectionType === "sstp");

      // Date range filter
      let matchesDate = true;
      if (dateRange && log.timestamp) {
        try {
          const logDate = (parseDbDate(log.timestamp) ?? new Date(log.timestamp));
          matchesDate = logDate >= dateRange.from && logDate <= dateRange.to;
        } catch {
          matchesDate = true;
        }
      }

      return matchesSearch && matchesEvent && matchesConnType && matchesDate;
    });
  }, [logsData?.logs, searchQuery, selectedEventType, selectedConnectionType, dateRange]);

  // Reset filters
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedEventType("all");
    setSelectedConnectionType("all");
    setDatePreset("all");
  };

  // Get event type badge
  const getEventTypeBadge = (eventType: string) => {
    const config = eventTypeConfig[eventType] || eventTypeConfig.info;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`${config.color} text-white border-0`}>
        <Icon className={`w-3 h-3 ${direction === "rtl" ? "ml-1" : "mr-1"}`} />
        {language === "ar" ? config.labelAr : config.labelEn}
      </Badge>
    );
  };

  // Export logs to CSV
  const exportToCSV = () => {
    if (!filteredLogs?.length) {
      toast.error(language === "ar" ? "لا توجد سجلات للتصدير" : "No logs to export");
      return;
    }

    const headers = ["Date", "Time", "Event", "NAS Device", "Connection Type", "Username", "IP Address", "Session", "Message"];
    const rows = filteredLogs.map((log: any) => {
      const nasInfo = log.username ? usernameToNas[log.username.toLowerCase()] : null;
      return [
        log.date || "-",
        log.time || "-",
        log.eventType || "-",
        nasInfo?.shortname || "-",
        nasInfo?.connectionType || "-",
        log.username || "-",
        log.ipAddress || "-",
        log.sessionName || "-",
        (log.message || "-").replace(/"/g, '""'),
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row: string[]) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `vpn-logs-${todayLocalDate(timezone)}.csv`;
    link.click();

    toast.success(language === "ar" ? "تم تصدير السجلات" : "Logs exported");
  };

  // Date preset labels
  const datePresetLabels: Record<DatePreset, { ar: string; en: string }> = {
    all: { ar: "جميع التواريخ", en: "All Dates" },
    today: { ar: "اليوم", en: "Today" },
    yesterday: { ar: "أمس", en: "Yesterday" },
    last7days: { ar: "آخر 7 أيام", en: "Last 7 Days" },
    last30days: { ar: "آخر 30 يوم", en: "Last 30 Days" },
  };

  return (
    <div className="space-y-6" dir={direction}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {language === "ar" ? "سجلات VPN" : "VPN Logs"}
          </h1>
          <p className="text-muted-foreground">
            {language === "ar"
              ? "سجل أحداث الاتصال والانقطاع من خادم SoftEther VPN"
              : "Connection events from SoftEther VPN Server"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto-refresh toggle */}
          <Button
            variant={autoRefreshEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            title={language === "ar" ? "تحديث تلقائي كل 30 ثانية" : "Auto-refresh every 30s"}
          >
            <Timer className={`w-4 h-4 ${direction === "rtl" ? "ml-1" : "mr-1"}`} />
            {autoRefreshEnabled
              ? (language === "ar" ? "تلقائي: مفعّل" : "Auto: ON")
              : (language === "ar" ? "تلقائي: متوقف" : "Auto: OFF")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { refetch(); setLastRefreshed(new Date()); }} disabled={isRefetching}>
            <RefreshCw className={`w-4 h-4 ${direction === "rtl" ? "ml-2" : "mr-2"} ${isRefetching ? "animate-spin" : ""}`} />
            {language === "ar" ? "تحديث" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className={`w-4 h-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
            {language === "ar" ? "تصدير CSV" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Last refreshed info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>
          {language === "ar"
            ? `آخر تحديث: ${_fmtTimeOnly(lastRefreshed)}`
            : `Last updated: ${_fmtTimeOnly(lastRefreshed)}`}
        </span>
        {autoRefreshEnabled && (
          <span className="text-green-600">
            {language === "ar" ? "• يتحدث تلقائياً كل 30 ثانية" : "• Auto-refreshing every 30s"}
          </span>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            {language === "ar" ? "تصفية السجلات" : "Filter Logs"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="space-y-2">
              <Label>{language === "ar" ? "بحث" : "Search"}</Label>
              <div className="relative">
                <Search className={`absolute ${direction === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                <Input
                  placeholder={language === "ar" ? "بحث في السجلات..." : "Search logs..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={direction === "rtl" ? "pr-10" : "pl-10"}
                />
              </div>
            </div>

            {/* Event Type */}
            <div className="space-y-2">
              <Label>{language === "ar" ? "نوع الحدث" : "Event Type"}</Label>
              <Select value={selectedEventType} onValueChange={setSelectedEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === "ar" ? "جميع الأحداث" : "All Events"}</SelectItem>
                  <SelectItem value="connecting">{language === "ar" ? "جاري الاتصال" : "Connecting"}</SelectItem>
                  <SelectItem value="connected">{language === "ar" ? "تم المصادقة" : "Authenticated"}</SelectItem>
                  <SelectItem value="session_start">{language === "ar" ? "بدء الجلسة" : "Session Started"}</SelectItem>
                  <SelectItem value="disconnected">{language === "ar" ? "انقطع" : "Disconnected"}</SelectItem>
                  <SelectItem value="dhcp">DHCP</SelectItem>
                  <SelectItem value="error">{language === "ar" ? "خطأ" : "Error"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Connection Type */}
            <div className="space-y-2">
              <Label>{language === "ar" ? "نوع الاتصال" : "Connection Type"}</Label>
              <Select value={selectedConnectionType} onValueChange={setSelectedConnectionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {language === "ar" ? "جميع الأنواع" : "All Types"}
                  </SelectItem>
                  <SelectItem value="l2tp">
                    <div className="flex items-center gap-2"><Shield className="w-3 h-3 text-blue-500" />L2TP</div>
                  </SelectItem>
                  <SelectItem value="sstp">
                    <div className="flex items-center gap-2"><Link2 className="w-3 h-3 text-purple-500" />SSTP</div>
                  </SelectItem>
                  <SelectItem value="public_ip">
                    <div className="flex items-center gap-2"><Globe className="w-3 h-3 text-gray-500" />{language === "ar" ? "IP عام" : "Public IP"}</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {language === "ar" ? "الفترة الزمنية" : "Date Range"}
              </Label>
              <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(datePresetLabels) as DatePreset[]).map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {language === "ar" ? datePresetLabels[preset].ar : datePresetLabels[preset].en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reset + results count */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-muted-foreground">
              {language === "ar"
                ? `عرض ${filteredLogs.length} من ${logsData?.total || 0} سجل`
                : `Showing ${filteredLogs.length} of ${logsData?.total || 0} logs`}
            </span>
            <Button variant="outline" size="sm" onClick={resetFilters}>
              {language === "ar" ? "إعادة تعيين الفلاتر" : "Reset Filters"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            {language === "ar" ? "السجلات" : "Logs"}
            <Badge variant="secondary">{filteredLogs.length}</Badge>
          </CardTitle>
          <CardDescription>
            {language === "ar"
              ? "أحداث الاتصال والانقطاع من خادم VPN — المصدر: xl2tpd + pppd"
              : "Connection & disconnection events from VPN server — Source: xl2tpd + pppd"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{language === "ar" ? "لا توجد سجلات تطابق الفلاتر المحددة" : "No logs match the selected filters"}</p>
              <Button variant="link" onClick={resetFilters} className="mt-2">
                {language === "ar" ? "إعادة تعيين الفلاتر" : "Reset Filters"}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "ar" ? "التاريخ" : "Date"}</TableHead>
                    <TableHead>{language === "ar" ? "الوقت" : "Time"}</TableHead>
                    <TableHead>{language === "ar" ? "الحدث" : "Event"}</TableHead>
                    <TableHead>{language === "ar" ? "جهاز NAS" : "NAS Device"}</TableHead>
                    <TableHead>{language === "ar" ? "نوع الاتصال" : "Conn. Type"}</TableHead>
                    <TableHead>{language === "ar" ? "المستخدم" : "Username"}</TableHead>
                    <TableHead>{language === "ar" ? "عنوان IP" : "IP Address"}</TableHead>
                    <TableHead>{language === "ar" ? "الجلسة" : "Session"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log: any, index: number) => {
                    const { date, time } = parseLogTimestamp(log);
                    const nasInfo = log.username ? usernameToNas[log.username.toLowerCase()] : null;
                    return (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {date}
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {time}
                        </TableCell>
                        <TableCell>
                          {getEventTypeBadge(log.eventType)}
                        </TableCell>
                        <TableCell>
                          {nasInfo ? (
                            <div className="flex items-center gap-1">
                              <Router className="w-3 h-3 text-muted-foreground" />
                              <span className="font-medium text-sm">{nasInfo.shortname}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">L2TP VPN</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {nasInfo ? (
                            <ConnectionTypeBadge type={nasInfo.connectionType} direction={direction} />
                          ) : (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                              <Shield className={`w-3 h-3 ${direction === "rtl" ? "ml-1" : "mr-1"}`} />
                              L2TP
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.username || <span className="text-muted-foreground text-sm">-</span>}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.ipAddress || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate">
                          {log.interface || log.sessionName || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
