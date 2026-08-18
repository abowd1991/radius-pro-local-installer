import { useAuth } from "@/_core/hooks/useAuth";
import { parseDbDate, formatDate as _fmtDateLib } from '@/lib/dateFormat';
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { toast } from "@/lib/operationFeedback";
import { confirmAction } from "@/lib/confirmAction";
import {
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Search,
  Router,
  Wifi,
  Signal,
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle,
  Globe,
  Shield,
  Link2,
  Eye,
  EyeOff,
  Copy,
  Loader2,
  WifiOff,
  ArrowRightLeft,
  Clock,
  AlertTriangle,
  Zap,
  ChevronLeft,
  ChevronRight,
  ListChecks,
} from "lucide-react";
import React, { useState, useRef, useMemo } from "react";
import { Link } from "wouter";
import { InsufficientBalanceModal, isInsufficientBalanceError } from "@/components/InsufficientBalanceModal";
import { usePagination } from "@/hooks/usePagination";
import { useSorting } from "@/hooks/useSorting";
import { DataPagination } from "@/components/ui/data-pagination";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TableSkeleton } from "@/components/ui/table-skeleton";

// Connection type options
const connectionTypes = [
  { value: "public_ip", labelAr: "اي بي عالمي", labelEn: "Public IP", icon: Globe },
  { value: "vpn_l2tp", labelAr: "اتصال VPN L2TP", labelEn: "VPN L2TP", icon: Shield },
  { value: "vpn_sstp", labelAr: "اتصال VPN SSTP", labelEn: "VPN SSTP", icon: Link2 },
  { value: "vpn_pptp", labelAr: "اتصال VPN PPTP", labelEn: "VPN PPTP", icon: Shield },
];

// IP Pool Stats Component (Admin Only)
function IPPoolStats() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { data: poolStats, isLoading } = trpc.nas.getPoolStats.useQuery();

  // Only show for owner/super_admin
  if (!user || (user.role !== 'owner' && user.role !== 'super_admin')) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {language === "ar" ? "إحصائيات مجموعة IP" : "IP Pool Statistics"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!poolStats) return null;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-blue-600" />
          {language === "ar" ? "إحصائيات مجموعة IP" : "IP Pool Statistics"}
        </CardTitle>
        <CardDescription>
          {language === "ar" 
            ? "مجموعة IP المتاحة للشبكات VPN (192.168.30.10-200)" 
            : "Available IP pool for VPN networks (192.168.30.10-200)"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center p-3 rounded-lg bg-background">
            <div className="text-2xl font-bold text-blue-600">{poolStats.total}</div>
            <div className="text-xs text-muted-foreground">
              {language === "ar" ? "إجمالي IP" : "Total IPs"}
            </div>
          </div>
          <div className="text-center p-3 rounded-lg bg-background">
            <div className="text-2xl font-bold text-green-600">{poolStats.allocated}</div>
            <div className="text-xs text-muted-foreground">
              {language === "ar" ? "مخصص" : "Allocated"}
            </div>
          </div>
          <div className="text-center p-3 rounded-lg bg-background">
            <div className="text-2xl font-bold text-orange-600">{poolStats.available}</div>
            <div className="text-xs text-muted-foreground">
              {language === "ar" ? "متاح" : "Available"}
            </div>
          </div>
          <div className="text-center p-3 rounded-lg bg-background">
            <div className="text-2xl font-bold text-purple-600">{poolStats.utilizationPercent}%</div>
            <div className="text-xs text-muted-foreground">
              {language === "ar" ? "الاستخدام" : "Utilization"}
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{language === "ar" ? "الاستخدام" : "Usage"}</span>
            <span className="font-medium">{poolStats.allocated} / {poolStats.total}</span>
          </div>
          <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${
                poolStats.utilizationPercent >= 90 ? 'bg-red-500' :
                poolStats.utilizationPercent >= 70 ? 'bg-orange-500' :
                'bg-green-500'
              }`}
              style={{ width: `${poolStats.utilizationPercent}%` }}
            />
          </div>
          {poolStats.utilizationPercent >= 90 && (
            <div className="flex items-center gap-2 text-sm text-red-600 mt-2">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {language === "ar" 
                  ? "تحذير: مجموعة IP شبه ممتلئة!" 
                  : "Warning: IP pool almost full!"
                }
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Kept outside NasDevices deliberately: defining this component inside the page
// recreated its React type on each parent render and caused API inputs to lose focus.
function ApiConnectionPanel() {
  const { language } = useLanguage();
  const { data: devices, refetch } = trpc.nas.list.useQuery();
  const [selectedNasId, setSelectedNasId] = useState<number | null>(null);
  const [apiEnabled, setApiEnabled] = useState(false);
  const [apiPort, setApiPort] = useState("8728");
  const [apiUser, setApiUser] = useState("admin");
  const [apiPassword, setApiPassword] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const selectedNas = devices?.find((device: any) => device.id === selectedNasId);
  const testApi = trpc.nas.testApiConnection.useMutation({
    onSuccess: (data) => {
      const result = data as { success: boolean; message: string };
      setTestResult(result);
      if (result.success) toast.success(language === "ar" ? "اتصال API ناجح" : "API connection successful");
      else toast.error(result.message);
    },
    onError: (error) => setTestResult({ success: false, message: error.message }),
  });
  const saveApiSettings = trpc.nas.update.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حفظ إعدادات API بنجاح" : "API settings saved successfully");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleNetworkSelect = (nasId: string) => {
    const id = Number(nasId);
    const device = devices?.find((item: any) => item.id === id);
    setSelectedNasId(id);
    setTestResult(null);
    if (device) {
      setApiEnabled(Boolean(device.apiEnabled));
      setApiPort(device.mikrotikApiPort?.toString() || "8728");
      setApiUser(device.mikrotikApiUser || "admin");
      setApiPassword("");
    }
  };

  const handleTest = () => {
    if (!selectedNas || !apiPassword) {
      toast.validation(language === "ar" ? "اختر الشبكة وأدخل كلمة مرور API" : "Select a network and enter the API password");
      return;
    }
    testApi.mutate({ nasIp: selectedNas.nasname, apiPort: Number(apiPort), apiUser, apiPassword, nasId: selectedNas.id });
  };

  const handleSave = () => {
    if (!selectedNasId) {
      toast.validation(language === "ar" ? "يرجى اختيار شبكة" : "Select a network first");
      return;
    }
    saveApiSettings.mutate({
      id: selectedNasId,
      apiEnabled,
      mikrotikApiPort: Number(apiPort),
      mikrotikApiUser: apiUser,
      mikrotikApiPassword: apiPassword || undefined,
    });
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 py-2">
      <div className="rounded-2xl border bg-muted/20 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary"><Wifi className="h-5 w-5" /></div>
          <div><h3 className="font-semibold">{language === "ar" ? "إعداد MikroTik API" : "MikroTik API setup"}</h3><p className="text-sm text-muted-foreground">{language === "ar" ? "اختر الجهاز ثم اكتب الإعدادات دون أن تفقد الكتابة." : "Select a device and enter settings without losing your typing."}</p></div>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{language === "ar" ? "اختر الشبكة" : "Select network"}</Label>
            <Select value={selectedNasId?.toString() || ""} onValueChange={handleNetworkSelect}>
              <SelectTrigger className="bg-background"><SelectValue placeholder={language === "ar" ? "اختر شبكة..." : "Select network..."} /></SelectTrigger>
              <SelectContent>
                {devices?.filter((device: any) => device.type === "mikrotik").map((device: any) => <SelectItem key={device.id} value={device.id.toString()}>{device.shortname} ({device.nasname})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedNasId && (
            <>
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4">
                <div><span className="flex items-center gap-2 text-sm font-medium"><Wifi className="h-4 w-4 text-primary" />{language === "ar" ? "تفعيل API" : "Enable API"}</span><p className="mt-1 text-xs text-muted-foreground">{language === "ar" ? "يسمح بتشغيل عمليات MikroTik الفورية." : "Allows instant MikroTik operations."}</p></div>
                <input type="checkbox" checked={apiEnabled} onChange={(event) => setApiEnabled(event.target.checked)} className="h-5 w-5 rounded border-gray-300 text-primary" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label>{language === "ar" ? "منفذ API" : "API port"}</Label><Input type="number" value={apiPort} onChange={(event) => setApiPort(event.target.value)} placeholder="8728" /></div>
                <div className="space-y-2"><Label>{language === "ar" ? "اسم مستخدم API" : "API username"}</Label><Input value={apiUser} onChange={(event) => setApiUser(event.target.value)} placeholder="admin" /></div>
              </div>
              <div className="space-y-2"><Label>{language === "ar" ? "كلمة مرور API" : "API password"}</Label><Input type="password" value={apiPassword} onChange={(event) => setApiPassword(event.target.value)} placeholder={selectedNas?.mikrotikApiPassword ? "•••••••• (محفوظة)" : "••••••••"} /><p className="text-xs text-muted-foreground">{language === "ar" ? "اتركها فارغة للإبقاء على كلمة المرور الحالية." : "Leave empty to retain the current password."}</p></div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {apiEnabled && <Button type="button" variant="outline" onClick={handleTest} disabled={testApi.isPending || !apiPassword} className="flex-1 gap-2">{testApi.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}{language === "ar" ? "اختبار الاتصال" : "Test connection"}</Button>}
                <Button type="button" onClick={handleSave} disabled={saveApiSettings.isPending} className="flex-1 gap-2">{saveApiSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}{language === "ar" ? "حفظ الإعدادات" : "Save settings"}</Button>
              </div>
              {testResult && <div className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${testResult.success ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-red-500/30 bg-red-500/10 text-red-700"}`}>{testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{testResult.message}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NasDevices() {
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [showInsufficientBalance, setShowInsufficientBalance] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingDevice, setEditingDevice] = useState<any>(null);
  const [connectionType, setConnectionType] = useState("public_ip");
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState("create");
  const [createStep, setCreateStep] = useState(1);
  const [autoIpAddress, setAutoIpAddress] = useState("");
  const [apiTestResult, setApiTestResult] = useState<{success: boolean; message: string} | null>(null);
  const [ipAddress, setIpAddress] = useState("");
  const [nasName, setNasName] = useState("");
  const [radiusSecret, setRadiusSecret] = useState("");
  const [ipWarning, setIpWarning] = useState<string | null>(null);
  const createFormRef = useRef<HTMLFormElement>(null);

  // Check if IP is private
  const isPrivateIP = (ip: string): boolean => {
    if (!ip) return false;
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;
    // 10.0.0.0 - 10.255.255.255
    if (parts[0] === 10) return true;
    // 172.16.0.0 - 172.31.255.255
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0 - 192.168.255.255
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  };

  // Handle IP change with validation
  const handleIpChange = (value: string) => {
    setIpAddress(value);
    if (connectionType === "public_ip" && isPrivateIP(value)) {
      setIpWarning(language === "ar" 
        ? "⚠️ هذا عنوان IP خاص (Private). إذا كان الراوتر خلف NAT، استخدم اتصال VPN بدلاً من ذلك."
        : "⚠️ This is a private IP address. If router is behind NAT, use VPN connection instead."
      );
    } else {
      setIpWarning(null);
    }
  };
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [vpnStatusDevice, setVpnStatusDevice] = useState<any>(null);
  const [isSyncingVpn, setIsSyncingVpn] = useState(false);
  // VPN credentials are auto-generated on the server, no need for state
  const [createdNasInfo, setCreatedNasInfo] = useState<{name: string; connectionType: string; vpnUsername?: string; vpnPassword?: string; vpnIp?: string; nasId?: number} | null>(null);

  // Fetch NAS devices
  const { data: devices, isLoading, refetch } = trpc.nas.list.useQuery();

  // Fetch VPN connections to show live status in table (admin/owner only)
  const isAdminUser = user?.role === 'owner' || user?.role === 'super_admin';
  const { data: vpnData, refetch: refetchVpn } = trpc.vpn.list.useQuery(undefined, {
    enabled: isAdminUser,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // Build a map: nasId → vpn status ('connected' | 'disconnected')
  const vpnStatusMap = useMemo(() => {
    const map: Record<number, { status: string; localVpnIp: string | null }> = {};
    if (vpnData?.connections) {
      for (const conn of vpnData.connections) {
        map[conn.nas.id] = {
          status: conn.vpn.status,
          localVpnIp: conn.vpn.localVpnIp || null,
        };
      }
    }
    return map;
  }, [vpnData]);

  // Mutations
  const createDevice = trpc.nas.create.useMutation({
    onSuccess: (data: any) => {
      setIsAddDialogOpen(false);
      setNasName("");
      setRadiusSecret("");
      setIpAddress("");
      setCreateStep(1);
      refetch();
      // Show setup guide dialog
      setCreatedNasInfo({
        name: data?.shortname || data?.nasname || "",
        connectionType: connectionType,
        vpnUsername: data?.vpnUsername,
        vpnPassword: data?.vpnPassword,
        vpnIp: data?.nasname,
        nasId: data?.id,
      });
    },
    onError: (error: any) => {
      if (isInsufficientBalanceError(error)) {
        setShowInsufficientBalance(true);
      } else {
        const rawMessage = String(error?.message || "");
        if (rawMessage.includes('"path":["name"]') || rawMessage.includes('"path":["secret"]')) {
          toast.validation(language === "ar" ? "أدخل اسم الشبكة وRADIUS Secret أولاً" : "Enter the network name and RADIUS secret first");
        } else {
          toast.error(error.message);
        }
      }
    },
  });

  const updateDevice = trpc.nas.update.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تحديث الشبكة بنجاح" : "Network updated successfully");
      setEditingDevice(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const deleteDevice = trpc.nas.delete.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم حذف الشبكة" : "Network deleted");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const reassignIp = trpc.nas.reassignIp.useMutation({
    onSuccess: (result: any) => {
      toast.success(result.message);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleReassignIp = async (nasId: number) => {
    const confirmed = await confirmAction({
      title: language === "ar" ? "إعادة تخصيص عنوان IP" : "Reassign IP address",
      description: language === "ar"
        ? "سيتم حذف DHCP Lease القديم وإنشاء حجز جديد لهذه الشبكة."
        : "The existing DHCP lease will be removed and a new reservation will be created.",
      confirmLabel: language === "ar" ? "إعادة التخصيص" : "Reassign",
      tone: "primary",
    });
    if (confirmed) {
      reassignIp.mutate({ nasId });
    }
  };

  // VPN Status Query
  const vpnStatusQuery = trpc.nas.getVpnStatus.useQuery(
    { id: vpnStatusDevice?.id || 0 },
    { enabled: !!vpnStatusDevice }
  );

  // Sync VPN IP Mutation
  const syncVpnIp = trpc.nas.syncVpnIp.useMutation({
    onSuccess: (result: any) => {
      setIsSyncingVpn(false);
      if (result.success) {
        toast.success(result.message);
        vpnStatusQuery.refetch();
        refetch();
      } else {
        toast.error(result.message);
      }
    },
    onError: (error: any) => {
      setIsSyncingVpn(false);
      toast.error(error.message);
    },
  });

  // Auto-sync VPN IP Mutation with retry
  const autoSyncVpnIp = trpc.nas.autoSyncVpnIp.useMutation({
    onSuccess: (result: any) => {
      setIsSyncingVpn(false);
      if (result.success) {
        toast.success(`${result.message} (محاولة ${result.attempts})`);
        vpnStatusQuery.refetch();
        refetch();
      } else {
        toast.error(result.message);
      }
    },
    onError: (error: any) => {
      setIsSyncingVpn(false);
      toast.error(error.message);
    },
  });

  const handleSyncVpnIp = (nasId: number) => {
    setIsSyncingVpn(true);
    autoSyncVpnIp.mutate({ id: nasId, maxRetries: 3, retryDelayMs: 5000 });
  };

  // Toggle NAS Status Mutation (Admin Only)
  const toggleNasStatus = trpc.nas.toggleNasStatus.useMutation({
    onSuccess: (result: any) => {
      if (result.status === 'inactive') {
        toast.success(
          language === "ar"
            ? `تم إيقاف الشبكة${result.vpnDisconnected ? ' وقطع اتصال VPN فوراً' : ''}`
            : `Network disabled${result.vpnDisconnected ? ' and VPN disconnected immediately' : ''}`
        );
      } else {
        toast.success(language === "ar" ? 'تم تفعيل الشبكة بنجاح' : 'Network enabled successfully');
      }
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || (language === "ar" ? 'فشل تغيير حالة الشبكة' : 'Failed to toggle network status'));
    },
  });

  // Retry Provisioning Mutation
  const retryProvisioning = trpc.nas.retryProvisioning.useMutation({
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success(language === "ar" ? "تم إعادة التهيئة بنجاح" : "Provisioning completed successfully");
      } else {
        toast.info(result.message);
      }
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const testApiConnection = trpc.nas.testApiConnection.useMutation({
    onSuccess: (result: any) => {
      setApiTestResult(result);
      setIsTestingApi(false);
      if (result.success) {
        toast.success(language === "ar" ? "✅ اتصال API ناجح!" : "✅ API connection successful!");
      } else {
        toast.error(result.message);
      }
    },
    onError: (error: any) => {
      setApiTestResult({ success: false, message: error.message });
      setIsTestingApi(false);
      toast.error(error.message);
    },
  });

  const handleTestApi = () => {
    // Get form values
    const form = document.querySelector('form') as HTMLFormElement;
    if (!form) return;
    
    const formData = new FormData(form);
    const nasIp = formData.get('ipAddress') as string;
    const apiPort = parseInt(formData.get('mikrotikApiPort') as string) || 8728;
    const apiUser = formData.get('mikrotikApiUser') as string;
    const apiPassword = formData.get('mikrotikApiPassword') as string;
    
    if (!nasIp || nasIp === 'pending') {
      toast.validation(language === "ar" ? "يرجى إدخال عنوان IP" : "Please enter IP address");
      return;
    }
    if (!apiUser) {
      toast.validation(language === "ar" ? "يرجى إدخال اسم مستخدم API" : "Please enter API username");
      return;
    }
    if (!apiPassword) {
      toast.validation(language === "ar" ? "يرجى إدخال كلمة مرور API" : "Please enter API password");
      return;
    }
    
    setIsTestingApi(true);
    setApiTestResult(null);
    // Include nasId if editing an existing device (for VPN IP resolution)
    testApiConnection.mutate({ 
      nasIp, 
      apiPort, 
      apiUser, 
      apiPassword,
      nasId: editingDevice?.id 
    });
  };

  const formatDate = (date: Date | string | null) => _fmtDateLib(date);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500">{t("common.active")}</Badge>;
      case "inactive":
        return <Badge variant="secondary">{t("common.inactive")}</Badge>;
      case "maintenance":
        return <Badge variant="default" className="bg-yellow-500">{language === "ar" ? "صيانة" : "Maintenance"}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getConnectionTypeBadge = (type: string) => {
    const connType = connectionTypes.find(c => c.value === type);
    if (!connType) return null;
    const Icon = connType.icon;
    return (
      <Badge variant="outline" className="gap-1">
        <Icon className="h-3 w-3" />
        {language === "ar" ? connType.labelAr : connType.labelEn}
      </Badge>
    );
  };

  // VPN Connection Status Badge (live status from SoftEther)
  const getVpnConnectionBadge = (nasId: number, connectionType: string | null) => {
    // Only show for VPN connection types
    if (!connectionType || connectionType === 'public_ip') return null;
    // Only show for admin users who have VPN data
    if (!isAdminUser) return null;
    const vpnInfo = vpnStatusMap[nasId];
    if (!vpnInfo) {
      // VPN data loaded but this NAS not found = disconnected
      if (vpnData) {
        return (
          <Badge variant="secondary" className="gap-1 text-xs">
            <WifiOff className="h-3 w-3" />
            {language === "ar" ? "غير متصل" : "Disconnected"}
          </Badge>
        );
      }
      return null;
    }
    if (vpnInfo.status === 'connected') {
      return (
        <div className="flex flex-col gap-0.5">
          <Badge variant="default" className="bg-green-500 gap-1 text-xs">
            <Wifi className="h-3 w-3" />
            {language === "ar" ? "متصل" : "Connected"}
          </Badge>
          {vpnInfo.localVpnIp && (
            <span className="text-xs text-muted-foreground font-mono">{vpnInfo.localVpnIp}</span>
          )}
        </div>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <WifiOff className="h-3 w-3" />
        {language === "ar" ? "غير متصل" : "Disconnected"}
      </Badge>
    );
  };

  // Provisioning Status Badge
  const getProvisioningStatusBadge = (status: string | null | undefined, connectionType: string | null) => {
    // Only show for VPN connections
    if (connectionType === 'public_ip') return null;
    
    switch (status) {
      case 'ready':
        return (
          <Badge variant="default" className="bg-green-500 gap-1">
            <CheckCircle className="h-3 w-3" />
            {language === "ar" ? "جاهز" : "Ready"}
          </Badge>
        );
      case 'provisioning':
        return (
          <Badge variant="default" className="bg-blue-500 gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {language === "ar" ? "جاري التهيئة" : "Provisioning"}
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {language === "ar" ? "خطأ" : "Error"}
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            {language === "ar" ? "بانتظار الاتصال" : "Pending"}
          </Badge>
        );
    }
  };

  const submitNasCreate = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    
    // For VPN connections, IP will be assigned automatically by the system
    // For Public IP, user provides the IP manually
    const ipAddress = connectionType === "public_ip" 
      ? formData.get("ipAddress") as string
      : "pending"; // Will be updated when VPN connects
    
    // MikroTik API settings
    const apiEnabled = formData.get("apiEnabled") === "on";
    const mikrotikApiPort = formData.get("mikrotikApiPort") ? parseInt(formData.get("mikrotikApiPort") as string) : 8728;
    const mikrotikApiUser = formData.get("mikrotikApiUser") as string || undefined;
    const mikrotikApiPassword = formData.get("mikrotikApiPassword") as string || undefined;
    
    const data = {
      name: formData.get("name") as string,
      ipAddress: ipAddress,
      secret: formData.get("secret") as string,
      type: formData.get("type") as "mikrotik" | "cisco" | "other",
      connectionType: connectionType as "public_ip" | "vpn_l2tp" | "vpn_sstp" | "vpn_pptp",
      description: formData.get("description") as string || undefined,
      // VPN credentials will be auto-generated on the server
      vpnUsername: undefined,
      vpnPassword: undefined,
      // MikroTik API settings (optional)
      apiEnabled: apiEnabled,
      mikrotikApiPort: mikrotikApiPort,
      mikrotikApiUser: mikrotikApiUser,
      mikrotikApiPassword: mikrotikApiPassword,
    };

    if (editingDevice) {
      updateDevice.mutate({ id: editingDevice.id, ...data });
    } else {
      createDevice.mutate(data);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitNasCreate(event.currentTarget);
  };

  const filteredDevices = devices?.filter((device: any) =>
    (device.shortname || device.nasname).toLowerCase().includes(searchQuery.toLowerCase()) ||
    device.nasname.includes(searchQuery)
  );

  // Sorting
  const { sortedData: sortedDevices, sortColumn, sortDirection, handleSort } = useSorting(
    filteredDevices,
    "createdAt",
    "desc"
  );

  // Pagination
  const {
    paginatedData: paginatedDevices,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    setCurrentPage,
  } = usePagination(sortedDevices, 15);

  const createSteps = language === "ar"
    ? ["اسم الشبكة وSecret", "نوع الاتصال"]
    : ["Network name & secret", "Connection type"];

  const goToNextCreateStep = () => {
    const form = createFormRef.current;
    const getField = (name: string) => form?.elements.namedItem(name) as HTMLInputElement | null;
    if (createStep === 1 && (!getField("name")?.value.trim() || !getField("secret")?.value.trim())) {
      toast.validation(language === "ar" ? "أدخل اسم الشبكة وRADIUS Secret أولاً" : "Enter the network name and RADIUS secret first");
      return;
    }
    setCreateStep(2);
  };

  const handleWizardSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const publicIp = form?.elements.namedItem("ipAddress") as HTMLInputElement | null;
    if (connectionType === "public_ip" && !publicIp?.value.trim()) {
      toast.validation(language === "ar" ? "أدخل عنوان IP العام للراوتر" : "Enter the router public IP");
      return;
    }
    submitNasCreate(form);
  };

  const triggerNasCreate = () => {
    const form = createFormRef.current;
    if (!form) return;
    const publicIp = form.elements.namedItem("ipAddress") as HTMLInputElement | null;
    if (connectionType === "public_ip" && !publicIp?.value.trim()) {
      toast.validation(language === "ar" ? "أدخل عنوان IP العام للراوتر" : "Enter the router public IP");
      return;
    }
    submitNasCreate(form);
  };

  // This preserves every original field and the existing handleSubmit contract.
  // Steps only control presentation; inputs remain mounted so draft values are never lost.
  const CreateNetworkForm = () => (
    <form ref={createFormRef} onSubmit={handleWizardSubmit} className="space-y-6">
      <div className="rounded-2xl border bg-muted/20 p-3 sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          {createSteps.map((label, index) => {
            const step = index + 1;
            const isCurrent = createStep === step;
            const isComplete = createStep > step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => step < createStep && setCreateStep(step)}
                className={`flex min-w-0 flex-col items-center gap-2 rounded-xl px-1 py-2 text-center transition-colors ${
                  isCurrent ? "bg-primary/10 text-primary" : isComplete ? "text-emerald-600" : "text-muted-foreground"
                } ${step < createStep ? "cursor-pointer hover:bg-background" : "cursor-default"}`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  isCurrent ? "bg-primary text-primary-foreground" : isComplete ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {isComplete ? <CheckCircle className="h-4 w-4" /> : step}
                </span>
                <span className="hidden text-[11px] font-medium leading-4 sm:block">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-7">
        <div className="mb-6 flex items-start gap-3 border-b pb-4">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            {createStep === 1 ? <Router className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="font-semibold">{createSteps[createStep - 1]}</h3>
            <p className="text-sm text-muted-foreground">
              {createStep === 1 && (language === "ar" ? "أدخل اسم الشبكة وRADIUS Secret فقط." : "Enter only the network name and RADIUS secret.")}
              {createStep === 2 && (language === "ar" ? "اختر نوع الاتصال ثم أنشئ الجهاز. ستظهر إعدادات MikroTik مباشرة بعد الإنشاء." : "Choose the connection type, then create the device. MikroTik setup will appear after creation.")}
            </p>
          </div>
        </div>

        <div className={createStep === 1 ? "space-y-5" : "hidden"}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{language === "ar" ? "اسم جهاز NAS" : "NAS name"}</Label>
              <Input id="name" name="name" required value={nasName} onChange={(event) => setNasName(event.target.value)} placeholder={language === "ar" ? "مثال: abowd net" : "Example: abowd net"} className="bg-background" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret">RADIUS Secret</Label>
              <Input id="secret" name="secret" type="text" required value={radiusSecret} onChange={(event) => setRadiusSecret(event.target.value)} className="bg-background" placeholder="مثال: radius-secret-123" />
            </div>
          </div>
          <input type="hidden" name="type" value="mikrotik" />
          <input type="hidden" name="description" value="" />
        </div>

        <div className={createStep === 2 ? "space-y-5" : "hidden"}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {connectionTypes.map((type) => {
              const Icon = type.icon;
              const isSelected = connectionType === type.value;
              return (
                <button key={type.value} type="button" onClick={() => setConnectionType(type.value)} className={`relative min-h-28 rounded-2xl border-2 p-4 text-center transition-all ${isSelected ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}>
                  <Icon className={`mx-auto mb-2 h-6 w-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="block text-sm font-medium">{language === "ar" ? type.labelAr : type.labelEn}</span>
                  {isSelected && <span className="absolute left-3 top-3 h-2.5 w-2.5 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ipAddress">{connectionType === "public_ip" ? (language === "ar" ? "عنوان IP العام للراوتر" : "Router public IP") : (language === "ar" ? "عنوان IP النفق" : "Tunnel IP")}</Label>
            {connectionType === "public_ip" ? (
              <>
                <Input id="ipAddress" name="ipAddress" placeholder="203.0.113.50" value={ipAddress} onChange={(e) => handleIpChange(e.target.value)} className={`bg-background ${ipWarning ? "border-amber-500" : ""}`} />
                {ipWarning && <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">{ipWarning}</p>}
              </>
            ) : (
              <div className="relative">
                <Input id="ipAddress" name="ipAddress" value={autoIpAddress || (language === "ar" ? "سيتم تعيينه تلقائياً بعد اتصال VPN" : "Assigned automatically after VPN connection")} readOnly className="bg-muted text-muted-foreground" />
                <Badge variant="secondary" className="absolute left-3 top-1/2 -translate-y-1/2">{language === "ar" ? "تلقائي" : "Auto"}</Badge>
              </div>
            )}
          </div>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" onClick={() => setCreateStep((step) => Math.max(step - 1, 1))} disabled={createStep === 1} className="gap-2">{direction === "rtl" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}{language === "ar" ? "السابق" : "Previous"}</Button>
          {createStep < 2 ? (
            <Button type="button" onClick={goToNextCreateStep} className="gap-2">{language === "ar" ? "التالي" : "Next"}{direction === "rtl" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button>
          ) : (
            <Button type="button" onClick={triggerNasCreate} disabled={createDevice.isPending} className="gap-2">{createDevice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{createDevice.isPending ? (language === "ar" ? "جاري الإنشاء..." : "Creating...") : (language === "ar" ? "إنشاء جهاز NAS" : "Create NAS device")}</Button>
          )}
        </div>
      </div>
    </form>
  );

  // API Connection Tab Content
  const SpecialToolsContent = () => {
    const [selectedNasId, setSelectedNasId] = useState<number | null>(null);
    const [apiEnabled, setApiEnabled] = useState(false);
    const [apiPort, setApiPort] = useState("8728");
    const [apiUser, setApiUser] = useState("admin");
    const [apiPassword, setApiPassword] = useState("");
    const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [connectionTested, setConnectionTested] = useState(false);

    // Get selected NAS device
    const selectedNas = devices?.find((d: any) => d.id === selectedNasId);

    // Load existing API settings when network is selected
    const handleNetworkSelect = (nasId: string) => {
      const id = parseInt(nasId);
      setSelectedNasId(id);
      setTestResult(null);
      setConnectionTested(false);
      
      const device = devices?.find((d: any) => d.id === id);
      if (device) {
        setApiEnabled(device.apiEnabled || false);
        setApiPort(device.mikrotikApiPort?.toString() || "8728");
        setApiUser(device.mikrotikApiUser || "admin");
        setApiPassword(""); // Don't load password for security
      }
    };

    const testApi = trpc.nas.testApiConnection.useMutation({
      onSuccess: (data) => {
        const result = data as { success: boolean; message: string };
        setTestResult(result);
        setIsTesting(false);
        if (result.success) {
          setConnectionTested(true);
          toast.success(language === "ar" ? "اتصال ناجح!" : "Connection successful!");
        } else {
          setConnectionTested(false);
          toast.error(result.message);
        }
      },
      onError: (error) => {
        setTestResult({ success: false, message: error.message });
        setIsTesting(false);
        setConnectionTested(false);
        toast.error(error.message);
      },
    });

    const saveApiSettings = trpc.nas.update.useMutation({
      onSuccess: () => {
        setIsSaving(false);
        toast.success(language === "ar" ? "تم حفظ إعدادات API بنجاح" : "API settings saved successfully");
        refetch();
      },
      onError: (error) => {
        setIsSaving(false);
        toast.error(error.message);
      },
    });

    const handleTest = () => {
      if (!selectedNas) {
        toast.error(language === "ar" ? "يرجى اختيار شبكة" : "Please select a network");
        return;
      }
      if (!apiPassword) {
        toast.error(language === "ar" ? "يرجى إدخال كلمة مرور API" : "Please enter API password");
        return;
      }
      setIsTesting(true);
      setTestResult(null);
      setConnectionTested(false);
      testApi.mutate({
        nasIp: selectedNas.nasname,
        apiPort: parseInt(apiPort),
        apiUser,
        apiPassword,
        nasId: selectedNas.id, // Send NAS ID to get VPN local IP
      });
    };

    const handleSave = () => {
      if (!selectedNasId) {
        toast.error(language === "ar" ? "يرجى اختيار شبكة" : "Please select a network");
        return;
      }
      // Allow saving API credentials without testing
      // if (apiEnabled && !connectionTested) {
      //   toast.error(language === "ar" ? "يرجى اختبار الاتصال أولاً" : "Please test the connection first");
      //   return;
      // }
      setIsSaving(true);
      saveApiSettings.mutate({
        id: selectedNasId,
        apiEnabled,
        mikrotikApiPort: parseInt(apiPort),
        mikrotikApiUser: apiUser,
        mikrotikApiPassword: apiPassword || undefined,
      });
    };

    return (
      <div className="space-y-6 py-4">
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold mb-2">
            {language === "ar" ? "إعدادات MikroTik API" : "MikroTik API Settings"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {language === "ar" 
              ? "إدارة إعدادات API للشبكات الموجودة"
              : "Manage API settings for existing networks"
            }
          </p>
        </div>

        <div className="max-w-md mx-auto space-y-4">
          {/* Select Network */}
          <div className="space-y-2">
            <Label>{language === "ar" ? "اختر الشبكة" : "Select Network"}</Label>
            <Select 
              value={selectedNasId?.toString() || ""} 
              onValueChange={handleNetworkSelect}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={language === "ar" ? "اختر شبكة..." : "Select network..."} />
              </SelectTrigger>
              <SelectContent>
                {devices?.filter((d: any) => d.type === "mikrotik").map((device: any) => (
                  <SelectItem key={device.id} value={device.id.toString()}>
                    {device.shortname} ({device.nasname})
                    {device.apiEnabled && " ✓"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedNasId && (
            <>
              {/* API Enabled Toggle */}
              <div className="p-4 rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-sm">
                      {language === "ar" ? "تفعيل API" : "Enable API"}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={apiEnabled}
                    onChange={(e) => {
                      setApiEnabled(e.target.checked);
                      setConnectionTested(false);
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
                <p className="text-xs text-muted-foreground mt-2">
                  {language === "ar" 
                    ? "تفعيل API يسمح بتغيير السرعة فوراً بدون انقطاع المستخدم"
                    : "Enabling API allows instant speed changes without disconnecting users"
                  }
                </p>
              </div>

              {/* API Port */}
              <div className="space-y-2">
                <Label>{language === "ar" ? "منفذ API" : "API Port"}</Label>
                <Input
                  type="number"
                  value={apiPort}
                  onChange={(e) => {
                    setApiPort(e.target.value);
                    setConnectionTested(false);
                  }}
                  placeholder="8728"
                  className="bg-background"
                />
              </div>

              {/* API Username */}
              <div className="space-y-2">
                <Label>{language === "ar" ? "اسم مستخدم API" : "API Username"}</Label>
                <Input
                  value={apiUser}
                  onChange={(e) => {
                    setApiUser(e.target.value);
                    setConnectionTested(false);
                  }}
                  placeholder="admin"
                  className="bg-background"
                />
              </div>

              {/* API Password */}
              <div className="space-y-2">
                <Label>{language === "ar" ? "كلمة مرور API" : "API Password"}</Label>
                <Input
                  type="password"
                  value={apiPassword}
                  onChange={(e) => {
                    setApiPassword(e.target.value);
                    setConnectionTested(false);
                  }}
                  placeholder={selectedNas?.mikrotikApiPassword ? "•••••••• (محفوظة)" : "••••••••"}
                  className="bg-background"
                />
                {selectedNas?.mikrotikApiPassword && (
                  <p className="text-xs text-muted-foreground">
                    {language === "ar" 
                      ? "اترك فارغاً للإبقاء على كلمة المرور الحالية"
                      : "Leave empty to keep current password"
                    }
                  </p>
                )}
              </div>

              {/* Buttons */}
              <div className="space-y-3 pt-2">
                {/* Test Connection Button (Optional) */}
                {apiEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTest}
                    disabled={isTesting || !apiPassword}
                    className="w-full gap-2"
                  >
                    {isTesting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        {language === "ar" ? "جاري الاختبار..." : "Testing..."}
                      </>
                    ) : (
                      <>
                        <Wifi className="h-4 w-4" />
                        {language === "ar" ? "اختبار الاتصال" : "Test Connection"}
                      </>
                    )}
                  </Button>
                )}

                {/* Save Button */}
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full gap-2"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {language === "ar" ? "جاري..." : "Saving..."}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      {language === "ar" ? "حفظ الإعدادات" : "Save Settings"}
                    </>
                  )}
                </Button>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${
                  testResult.success 
                    ? 'bg-green-500/10 border border-green-500/30' 
                    : 'bg-red-500/10 border border-red-500/30'
                }`}>
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className={testResult.success ? 'text-green-600' : 'text-red-600'}>
                    {testResult.message}
                  </span>
                </div>
              )}

              {/* Info about test requirement - removed to allow saving without testing */}
            </>
          )}

          {/* No networks message */}
          {devices?.filter((d: any) => d.type === "mikrotik").length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Router className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{language === "ar" ? "لا توجد شبكات MikroTik" : "No MikroTik networks found"}</p>
              <p className="text-sm mt-2">
                {language === "ar" 
                  ? "أنشئ شبكة جديدة أولاً"
                  : "Create a new network first"
                }
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Insufficient Balance Modal */}
      <InsufficientBalanceModal
        open={showInsufficientBalance}
        onClose={() => setShowInsufficientBalance(false)}
      />

      {/* Setup Guide Dialog - shown after creating a new network */}
      {createdNasInfo && (
        <SetupGuideDialog
          nasInfo={createdNasInfo}
          onClose={() => setCreatedNasInfo(null)}
          language={language}
          direction={direction}
        />
      )}
      {/* Header - visual only; all NAS data actions below remain unchanged */}
      <div className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-l from-primary/10 via-background to-background p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20">
            <Router className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <p className="mb-1 text-sm text-muted-foreground">{language === "ar" ? "إدارة الشبكات" : "Network management"}</p>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{language === "ar" ? "أجهزة NAS" : "NAS devices"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{language === "ar" ? "أضف وأدر أجهزة MikroTik واتصالاتها بأمان." : "Add and manage MikroTik devices and their connections safely."}</p>
          </div>
        </div>
      </div>

      {/* Main Card with Tabs */}
      <Card className="overflow-hidden border shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6 grid w-full max-w-md grid-cols-2 rounded-xl bg-muted/70 p-1">
              <TabsTrigger value="create" className="gap-2">
                <Edit className="h-4 w-4" />
                {language === "ar" ? "إنشاء شبكة جديدة" : "Create Network"}
              </TabsTrigger>
              <TabsTrigger value="tools" className="gap-2">
                <Wifi className="h-4 w-4" />
                {language === "ar" ? "اتصال API" : "API Connection"}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="create">
              {CreateNetworkForm()}
            </TabsContent>
            
            <TabsContent value="tools">
              <ApiConnectionPanel />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {/* Primary Card - Total */}
        <div className="col-span-2 md:col-span-1 relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-primary to-teal-600 shadow-md">
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/10 blur-xl" />
          <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-black/10 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">
                {language === "ar" ? "إجمالي الشبكات" : "Total Networks"}
              </p>
              <p className="text-4xl font-bold leading-none">{devices?.length || 0}</p>
              <p className="text-white/60 text-xs mt-1">{language === "ar" ? "جهاز NAS مسجّل" : "registered NAS devices"}</p>
            </div>
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
              <Router className="h-5 w-5" />
            </div>
          </div>
        </div>
        {/* Active */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">{t("common.active")}</p>
            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-lg">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {devices?.filter((d: any) => d.status === "active").length || 0}
          </p>
        </div>
        {/* Inactive */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-red-700 dark:text-red-400 uppercase tracking-wider">{t("common.inactive")}</p>
            <div className="p-1.5 bg-red-100 dark:bg-red-900/40 rounded-lg">
              <XCircle className="h-4 w-4 text-red-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">
            {devices?.filter((d: any) => d.status === "inactive").length || 0}
          </p>
        </div>
        {/* MikroTik */}
        <div className="relative overflow-hidden rounded-2xl p-4 bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-violet-700 dark:text-violet-400 uppercase tracking-wider">MikroTik</p>
            <div className="p-1.5 bg-violet-100 dark:bg-violet-900/40 rounded-lg">
              <Wifi className="h-4 w-4 text-violet-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-violet-600 dark:text-violet-400">
            {devices?.filter((d: any) => d.type === "mikrotik").length || 0}
          </p>
        </div>
      </div>

      {/* IP Pool Statistics */}
      <IPPoolStats />

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${direction === "rtl" ? "right-3" : "left-3"}`} />
            <Input
              placeholder={language === "ar" ? "بحث بالاسم أو IP..." : "Search by name or IP..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={direction === "rtl" ? "pr-9" : "pl-9"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Devices Table */}
      <Card className="overflow-hidden rounded-2xl border shadow-sm">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2"><Router className="h-5 w-5 text-primary" />{language === "ar" ? "قائمة الشبكات" : "Network List"}</CardTitle>
          <CardDescription>
            {language === "ar" ? "جميع الشبكات المسجلة في النظام" : "All registered networks in the system"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDevices && filteredDevices.length > 0 ? (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <SortableTableHead
                    column="shortname"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    {language === "ar" ? "الاسم" : "Name"}
                  </SortableTableHead>
                  <SortableTableHead
                    column="nasname"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    IP
                  </SortableTableHead>
                  <SortableTableHead
                    column="connectionType"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    {language === "ar" ? "نوع الاتصال" : "Connection"}
                  </SortableTableHead>
                  <SortableTableHead
                    column="type"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    {language === "ar" ? "النوع" : "Type"}
                  </SortableTableHead>
                  <TableHead className="font-semibold">{t("common.status")}</TableHead>
                  <TableHead className="font-semibold">{language === "ar" ? "حالة التهيئة" : "Provisioning"}</TableHead>
                  {isAdminUser && (
                    <TableHead className="font-semibold">{language === "ar" ? "حالة الاتصال" : "Connection"}</TableHead>
                  )}
                  <SortableTableHead
                    column="lastSeen"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  >
                    {language === "ar" ? "آخر اتصال" : "Last Seen"}
                  </SortableTableHead>
                  <TableHead className="text-center font-semibold w-[100px]">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableSkeleton rows={5} columns={8} />
                ) : paginatedDevices && paginatedDevices.length > 0 ? (
                  paginatedDevices.map((device: any) => (
                  <TableRow key={device.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Router className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="font-medium text-sm">{device.shortname || device.nasname}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 font-mono text-sm text-muted-foreground">{device.nasname}</TableCell>
                    <TableCell className="py-3">
                      {getConnectionTypeBadge((device as any).connectionType || "public_ip")}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant="outline" className="text-xs">{device.type || "mikrotik"}</Badge>
                    </TableCell>
                    <TableCell className="py-3">{getStatusBadge(device.status)}</TableCell>
                    <TableCell className="py-3">{getProvisioningStatusBadge((device as any).provisioningStatus, (device as any).connectionType)}</TableCell>
                    {isAdminUser && (
                      <TableCell className="py-3">
                        {getVpnConnectionBadge(device.id, (device as any).connectionType)}
                      </TableCell>
                    )}
                    <TableCell className="py-3 text-sm text-muted-foreground">{formatDate(device.lastSeen)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 justify-center">
                        {/* Edit Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingDevice(device)}
                          title={t("common.edit")}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        
                        {/* Delete Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            const confirmed = await confirmAction({
                              title: language === "ar" ? "حذف الشبكة" : "Delete network",
                              description: language === "ar" ? "سيتم حذف الشبكة وكل ما يرتبط بها. لا يمكن التراجع عن هذه العملية." : "The network and its related configuration will be removed. This cannot be undone.",
                              confirmLabel: language === "ar" ? "حذف الشبكة" : "Delete network",
                              tone: "destructive",
                            });
                            if (confirmed) {
                              deleteDevice.mutate({ id: device.id });
                            }
                          }}
                          title={t("common.delete")}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        
                        {/* More Options Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                          {/* VPN Status option - only for VPN connection types */}
                          {((device as any).connectionType === 'vpn_l2tp' || (device as any).connectionType === 'vpn_sstp' || (device as any).connectionType === 'vpn_pptp') && (
                            <DropdownMenuItem onClick={() => setVpnStatusDevice(device)}>
                              <Wifi className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                              {language === "ar" ? "حالة VPN" : "VPN Status"}
                            </DropdownMenuItem>
                          )}
                          {/* Retry Provisioning - only for VPN with pending/error status */}
                          {((device as any).connectionType === 'vpn_l2tp' || (device as any).connectionType === 'vpn_sstp' || (device as any).connectionType === 'vpn_pptp') && 
                           ((device as any).provisioningStatus === 'pending' || (device as any).provisioningStatus === 'error') && (
                            <DropdownMenuItem onClick={() => retryProvisioning.mutate({ nasId: device.id })}>
                              <Zap className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                              {language === "ar" ? "إعادة التهيئة" : "Retry Provisioning"}
                            </DropdownMenuItem>
                          )}
                          {/* Re-assign IP - only for VPN connections and admin only */}
                          {((device as any).connectionType === 'vpn_l2tp' || (device as any).connectionType === 'vpn_sstp' || (device as any).connectionType === 'vpn_pptp') && 
                           (user?.role === 'owner' || user?.role === 'super_admin') && (
                            <DropdownMenuItem onClick={() => handleReassignIp(device.id)}>
                              <RefreshCw className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                              {language === "ar" ? "إعادة تخصيص IP" : "Re-assign IP"}
                            </DropdownMenuItem>
                          )}
                          {/* Toggle NAS Status - Admin Only */}
                          {(user?.role === 'owner' || user?.role === 'super_admin') && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={async () => {
                                  const isActive = device.status === 'active';
                                  const confirmed = await confirmAction({
                                    title: isActive
                                      ? (language === 'ar' ? 'إيقاف الشبكة' : 'Disable network')
                                      : (language === 'ar' ? 'تفعيل الشبكة' : 'Enable network'),
                                    description: isActive
                                      ? (language === 'ar' ? `سيتم إيقاف "${device.shortname || device.nasname}" وقطع اتصال VPN فوراً.` : `"${device.shortname || device.nasname}" will be disabled and its VPN will be disconnected immediately.`)
                                      : (language === 'ar' ? `سيتم تفعيل "${device.shortname || device.nasname}".` : `"${device.shortname || device.nasname}" will be enabled.`),
                                    confirmLabel: isActive
                                      ? (language === 'ar' ? 'إيقاف الشبكة' : 'Disable network')
                                      : (language === 'ar' ? 'تفعيل الشبكة' : 'Enable network'),
                                    tone: isActive ? 'destructive' : 'primary',
                                  });
                                  if (confirmed) {
                                    toggleNasStatus.mutate({
                                      nasId: device.id,
                                      status: isActive ? 'inactive' : 'active',
                                    });
                                  }
                                }}
                                className={device.status === 'active' ? 'text-orange-600 focus:text-orange-600' : 'text-green-600 focus:text-green-600'}
                              >
                                {device.status === 'active' ? (
                                  <><WifiOff className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />{language === 'ar' ? 'إيقاف الشبكة' : 'Disable Network'}</>
                                ) : (
                                  <><Wifi className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />{language === 'ar' ? 'تفعيل الشبكة' : 'Enable Network'}</>
                                )}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {language === 'ar' ? 'لا توجد شبكات' : 'No networks found'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Router className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">
                {language === "ar" ? "لا توجد شبكات" : "No Networks"}
              </h3>
              <p className="text-muted-foreground mt-1">
                {language === "ar" ? "قم بإضافة شبكة جديدة للبدء" : "Add a new network to get started"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingDevice} onOpenChange={(open) => !open && setEditingDevice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "تعديل الشبكة" : "Edit Network"}</DialogTitle>
            <DialogDescription>
              {language === "ar" ? "تعديل بيانات الشبكة" : "Edit network information"}
            </DialogDescription>
          </DialogHeader>
          {editingDevice && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Connection Type Selector */}
              <div className="space-y-3">
                <Label className="text-base font-medium">
                  {language === "ar" ? "نوع الاتصال" : "Connection Type"}
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  {connectionTypes.map((type) => {
                    const Icon = type.icon;
                    const isSelected = connectionType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setConnectionType(type.value)}
                        className={`
                          relative flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all
                          ${isSelected 
                            ? "border-primary bg-primary/5 text-primary" 
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                          }
                        `}
                      >
                        <Icon className={`h-6 w-6 mb-2 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-sm font-medium text-center">
                          {language === "ar" ? type.labelAr : type.labelEn}
                        </span>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">{language === "ar" ? "إسم الشبكة" : "Network Name"}</Label>
                  <Input 
                    id="edit-name" 
                    name="name" 
                    defaultValue={editingDevice.shortname || ""} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-ipAddress">IP</Label>
                  <Input 
                    id="edit-ipAddress" 
                    name="ipAddress" 
                    defaultValue={editingDevice.nasname} 
                    required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-secret">{language === "ar" ? "كلمة السر" : "Secret"}</Label>
                  <div className="relative">
                    <Input 
                      id="edit-secret" 
                      name="secret" 
                      type={showPassword ? "text" : "password"} 
                      defaultValue={editingDevice.secret || ""} 
                      required 
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-type">{language === "ar" ? "نوع" : "Type"}</Label>
                  <Select name="type" defaultValue={editingDevice.type || "mikrotik"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mikrotik">{language === "ar" ? "مايكروتك" : "MikroTik"}</SelectItem>
                      <SelectItem value="cisco">Cisco</SelectItem>
                      <SelectItem value="ubiquiti">Ubiquiti</SelectItem>
                      <SelectItem value="other">{language === "ar" ? "أخرى" : "Other"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">{language === "ar" ? "وصف" : "Description"}</Label>
                <Input 
                  id="edit-description" 
                  name="description" 
                  defaultValue={editingDevice.description || ""} 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-lanCidr">{language === "ar" ? "شبكة LAN الداخلية" : "Internal LAN network"}</Label>
                <Input
                  id="edit-lanCidr"
                  name="lanCidr"
                  defaultValue={editingDevice.lanCidr || ""}
                  placeholder="192.168.80.0/24"
                />
                <p className="text-xs text-muted-foreground">
                  {language === "ar"
                    ? "اكتب شبكة CIDR خلف هذا الـNAS، مثل 192.168.80.0/24."
                    : "Enter the LAN CIDR behind this NAS, for example 192.168.80.0/24."}
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingDevice(null)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={updateDevice.isPending}>
                  {updateDevice.isPending 
                    ? (language === "ar" ? "جاري الحفظ..." : "Saving...") 
                    : t("common.save")
                  }
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* VPN Status Dialog */}
      <Dialog open={!!vpnStatusDevice} onOpenChange={(open) => !open && setVpnStatusDevice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" />
              {language === "ar" ? "حالة VPN" : "VPN Status"}
            </DialogTitle>
            <DialogDescription>
              {vpnStatusDevice?.shortname || vpnStatusDevice?.nasname}
            </DialogDescription>
          </DialogHeader>
          
          {vpnStatusQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : vpnStatusQuery.data ? (
            <div className="space-y-4">
              {/* VPN Connection Status */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  {vpnStatusQuery.data.connected ? (
                    <div className="p-2 rounded-full bg-green-500/10">
                      <Wifi className="h-5 w-5 text-green-500" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-full bg-red-500/10">
                      <WifiOff className="h-5 w-5 text-red-500" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">
                      {language === "ar" ? "حالة الاتصال" : "Connection Status"}
                    </p>
                    <p className={`text-sm ${vpnStatusQuery.data.connected ? 'text-green-500' : 'text-red-500'}`}>
                      {vpnStatusQuery.data.message}
                    </p>
                  </div>
                </div>
                <Badge variant={vpnStatusQuery.data.connected ? "default" : "destructive"}>
                  {vpnStatusQuery.data.connected 
                    ? (language === "ar" ? "متصل" : "Connected")
                    : (language === "ar" ? "غير متصل" : "Disconnected")
                  }
                </Badge>
              </div>

              {/* IP Information */}
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">
                    {language === "ar" ? "اسم مستخدم VPN" : "VPN Username"}
                  </span>
                  <span className="font-mono text-sm">{vpnStatusQuery.data.vpnUsername || '-'}</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">
                    {language === "ar" ? "VPN Local IP (مصدر RADIUS)" : "VPN Local IP (RADIUS Source)"}
                  </span>
                  <span className={`font-mono text-sm ${vpnStatusQuery.data.vpnLocalIp ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {vpnStatusQuery.data.vpnLocalIp || (language === "ar" ? "غير متوفر" : "Not available")}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">
                    {language === "ar" ? "nasname الحالي" : "Current nasname"}
                  </span>
                  <span className={`font-mono text-sm ${
                    vpnStatusQuery.data.isPlaceholder ? 'text-yellow-500' : 
                    (vpnStatusQuery.data.nasname === vpnStatusQuery.data.vpnLocalIp ? 'text-green-500' : 'text-orange-500')
                  }`}>
                    {vpnStatusQuery.data.nasname}
                  </span>
                </div>

                {/* Sync Status */}
                {vpnStatusQuery.data.needsSync && (
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      {language === "ar" 
                        ? "⚠️ nasname لا يتطابق مع VPN IP. يجب المزامنة ليعمل RADIUS."
                        : "⚠️ nasname doesn't match VPN IP. Sync required for RADIUS to work."
                      }
                    </p>
                  </div>
                )}

                {/* Success Status */}
                {vpnStatusQuery.data.connected && !vpnStatusQuery.data.needsSync && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      {language === "ar" 
                        ? "✅ النظام جاهز - RADIUS سيعمل بشكل صحيح"
                        : "✅ System ready - RADIUS will work correctly"
                      }
                    </p>
                  </div>
                )}
              </div>

              {/* Sync Button */}
              {vpnStatusQuery.data.connected && vpnStatusQuery.data.needsSync && (
                <Button 
                  onClick={() => handleSyncVpnIp(vpnStatusDevice.id)}
                  disabled={isSyncingVpn}
                  className="w-full"
                >
                  {isSyncingVpn ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {language === "ar" ? "جاري المزامنة..." : "Syncing..."}
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      {language === "ar" ? "مزامنة VPN IP" : "Sync VPN IP"}
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              {language === "ar" ? "فشل تحميل البيانات" : "Failed to load data"}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => vpnStatusQuery.refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {language === "ar" ? "تحديث" : "Refresh"}
            </Button>
            <Button variant="secondary" onClick={() => setVpnStatusDevice(null)}>
              {language === "ar" ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── SetupGuideDialog ──────────────────────────────────────────────────────
// Shows real MikroTik terminal commands fetched from getSetupScripts after NAS creation
function SetupGuideDialog({
  nasInfo,
  onClose,
  language,
  direction,
}: {
  nasInfo: { name: string; connectionType: string; vpnUsername?: string; vpnPassword?: string; nasId?: number };
  onClose: () => void;
  language: string;
  direction: string;
}) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const { data: setupData, isLoading } = trpc.nas.getSetupScripts.useQuery(
    { id: nasInfo.nasId! },
    { enabled: !!nasInfo.nasId }
  );

  const copyAll = async () => {
    if (!setupData?.scripts) return;
    const all = setupData.scripts.map((s: any) => s.command).join('\n\n');
    await navigator.clipboard.writeText(all);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyOne = async (id: string, command: string) => {
    await navigator.clipboard.writeText(command);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir={direction}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/20 rounded-xl">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {language === "ar" ? "✅ تم إنشاء الشبكة بنجاح" : "✅ Network Created Successfully"}
              </DialogTitle>
              <DialogDescription>
                {language === "ar"
                  ? `شبكة "${nasInfo.name}" جاهزة — اتبع الخطوات التالية لربطها بالراوتر`
                  : `Network "${nasInfo.name}" is ready — follow the steps below to connect your router`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* VPN credentials card */}
          {nasInfo.connectionType !== 'public_ip' && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-5 w-5 text-blue-400" />
                <h3 className="font-semibold text-blue-400">
                  {language === "ar" ? "بيانات اتصال VPN" : "VPN Connection Credentials"}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "نوع الاتصال" : "Connection Type"}</p>
                  <code className="text-sm font-mono text-primary">{nasInfo.connectionType.replace('vpn_', '').toUpperCase()}</code>
                </div>
                {nasInfo.vpnUsername && (
                  <div className="bg-background/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "اسم المستخدم" : "Username"}</p>
                    <code className="text-sm font-mono text-green-400 select-all">{nasInfo.vpnUsername}</code>
                  </div>
                )}
                {nasInfo.vpnPassword && (
                  <div className="bg-background/50 rounded-lg p-3 col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "كلمة المرور" : "Password"}</p>
                    <code className="text-sm font-mono text-green-400 select-all">{nasInfo.vpnPassword}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Terminal commands from API */}
          <div className="bg-muted/50 border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                <h3 className="font-semibold">
                  {language === "ar" ? "أوامر الترمينل (MikroTik)" : "Terminal Commands (MikroTik)"}
                </h3>
              </div>
              {setupData?.scripts && setupData.scripts.length > 0 && (
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={copyAll}>
                  {copiedId === 'all' ? <CheckCircle className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  {language === "ar" ? "نسخ الكل" : "Copy All"}
                </Button>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <RefreshCw className="h-4 w-4 animate-spin" />
                {language === "ar" ? "جاري تحميل الأوامر..." : "Loading commands..."}
              </div>
            ) : setupData?.scripts && setupData.scripts.length > 0 ? (
              <div className="space-y-3">
                {setupData.scripts.map((script: any) => (
                  <div key={script.id} className="rounded-lg bg-black/40 border border-slate-700 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-300">
                          {language === "ar" ? script.titleAr : script.title}
                        </span>
                        {script.required && (
                          <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                            {language === "ar" ? "مطلوب" : "Required"}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => copyOne(script.id, script.command)}
                      >
                        {copiedId === script.id ? <CheckCircle className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                        {language === "ar" ? "نسخ" : "Copy"}
                      </Button>
                    </div>
                    <pre className="text-green-400 text-xs p-3 overflow-x-auto whitespace-pre font-mono leading-relaxed select-all">
                      {script.command}
                    </pre>
                    <div className="px-3 py-1.5 border-t border-slate-700/50">
                      <p className="text-xs text-slate-500">
                        {language === "ar" ? script.descriptionAr : script.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                {language === "ar" ? "لا توجد أوامر متاحة" : "No commands available"}
              </p>
            )}
          </div>

          {/* Direct post-creation transition to MikroTik setup */}
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">
                {language === "ar" ? "إعداد MikroTik التالي" : "Next: MikroTik setup"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {language === "ar"
                  ? "انتقل إلى صفحة الإعداد وانسخ أوامر الراوتر الجديدة"
                  : "Open setup and copy the new router commands"}
              </p>
            </div>
            <Link href="/mikrotik-setup" onClick={onClose}>
              <Button variant="default" size="sm" className="gap-2 whitespace-nowrap">
                <ArrowRightLeft className="h-4 w-4" />
                {language === "ar" ? "إعداد MikroTik" : "Set up MikroTik"}
              </Button>
            </Link>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            {language === "ar" ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
