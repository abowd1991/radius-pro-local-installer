import { useAuth } from "@/_core/hooks/useAuth";
import ClientDashboard from "@/pages/ClientDashboard";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDateTime as _fmtDT } from '@/lib/dateFormat';
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { formatDate, formatTime } from "@/lib/timezoneV6";
import { BillingInfo } from "@/components/BillingInfo";
// AccountStatusBanner removed - no trial warnings shown to users
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Users,
  Building2,
  CreditCard,
  FileText,
  Wallet,
  Activity,
  MessageSquare,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  RefreshCcw,
  Link2,
  ExternalLink,
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Timer,
  Download,
  DollarSign,
  CalendarX2,
  LogIn,
  CheckSquare,
  AlarmClock,
} from "lucide-react";
import { useLocation } from "wouter";
import { EnhancedDashboard } from "@/components/EnhancedDashboard";
import { useState, useEffect } from "react";
import { formatPrice } from "../../../shared/currencies";

export default function Dashboard() {
  const { user } = useAuth();
  const { t, language, direction } = useLanguage();
  const { timezone } = useTimezoneV6();
  const [, setLocation] = useLocation();

  // Fetch dashboard stats
  const { data: stats, isLoading, refetch } = trpc.dashboard.getStats.useQuery();
  
  // Fetch admin stats (for owner/super_admin)
  const { data: adminStats, isLoading: isAdminStatsLoading } = trpc.dashboard.getAdminStats.useQuery(
    undefined,
    { enabled: user?.role === 'owner' || user?.role === 'super_admin' }
  );
  
  // Fetch client stats (for clients)
  const { data: clientStats, isLoading: isClientStatsLoading, refetch: refetchClientStats } = trpc.dashboard.getClientStats.useQuery(
    undefined,
    { enabled: user?.role === 'client' || user?.role === 'client_owner', refetchInterval: 120000, refetchIntervalInBackground: false, staleTime: 60000 }
  );
  
  // Analytics data
  const [analyticsDays, setAnalyticsDays] = useState(30);
  // Analytics: no auto-polling — heavy queries, user can refresh manually
  const analyticsOpts = { staleTime: 300000, refetchOnWindowFocus: false };
  const { data: revenueData } = trpc.analytics.revenueTrend.useQuery({ days: analyticsDays }, analyticsOpts);
  const { data: sessionsData } = trpc.analytics.sessionsTrend.useQuery({ days: analyticsDays }, analyticsOpts);
  const { data: nasHealthData } = trpc.analytics.nasHealth.useQuery(undefined, analyticsOpts);
  const { data: userGrowthData } = trpc.analytics.userGrowth.useQuery(
    { days: analyticsDays },
    { ...analyticsOpts, enabled: user?.role === 'owner' || user?.role === 'super_admin' }
  );
  const { data: sessionsTimelineData } = trpc.analytics.sessionsTimeline.useQuery(
    undefined,
    { ...analyticsOpts, enabled: user?.role === 'owner' || user?.role === 'super_admin' }
  );
  const { data: totalCardsData } = trpc.analytics.totalCardsCreated.useQuery(
    undefined,
    { ...analyticsOpts, enabled: user?.role === 'owner' || user?.role === 'super_admin' }
  );

  // VPS Stats (for owner/super_admin)
  const { data: vpsStats, isLoading: isVpsLoading, refetch: refetchVps } = trpc.vpsManagement.getStatus.useQuery(
    undefined,
    { enabled: user?.role === 'owner' || user?.role === 'super_admin', refetchInterval: 10000, refetchIntervalInBackground: true, staleTime: 8000 }
  );
  
  // Fetch billing info for clients
  const { data: billingData, isLoading: isBillingLoading } = trpc.billing.getMySummary.useQuery(
    undefined,
    { enabled: user?.role === 'client' }
  );

  // Use user's preferred currency for display
  // Wallet, NAS cost, and all financial figures MUST always display in USD
  // preferredCurrency is ONLY for plan prices in Vouchers page
  const formatCurrency = (amount: string | number) => {
    return formatPrice(amount, 'USD');
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-US").format(num);
  };

  // Card Check Token for client_owner
  const { data: checkTokenData, refetch: refetchToken } = trpc.checkTokens.getMyToken.useQuery(
    undefined,
    { enabled: user?.role === 'client_owner' || user?.role === 'client' || user?.role === 'owner' || user?.role === 'super_admin' }
  );
  const regenerateTokenMutation = trpc.checkTokens.regenerateToken.useMutation({
    onSuccess: () => refetchToken(),
  });
  const [copied, setCopied] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN || window.location.origin;
  const checkLink = checkTokenData?.token
    ? `${publicDomain}/check/${checkTokenData.token}`
    : null;

  function copyCheckLink() {
    if (!checkLink) return;
    navigator.clipboard.writeText(checkLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Client & Client Owner → New Professional Dashboard
  if (user?.role === "client_owner" || user?.role === "client") {
    return <ClientDashboard />;
  }

  // Legacy client_owner (kept for fallback)
  if (false && user?.role === "client_owner") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("dashboard.welcome")}، {user.name}
            </h1>
            <p className="text-muted-foreground">
              {language === "ar" ? "لوحة تحكم مالك العميل" : "Client Owner Dashboard"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Live Clock - Same as EnhancedDashboard */}
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-card shadow-sm">
              <Clock className="h-4 w-4 text-primary shrink-0" />
              <div className={`flex flex-col ${direction === "rtl" ? "items-end" : "items-start"}`}>
                <span className="text-xl font-bold font-mono tracking-widest leading-none text-foreground">
                  {formatTime(currentTime, timezone, true)}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(currentTime, timezone)}
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"} ${isLoading ? "animate-spin" : ""}`} />
              {language === "ar" ? "تحديث" : "Refresh"}
            </Button>
          </div>
        </div>

        {/* Stats Grid - Client Owner Widgets */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {/* PRIMARY: Cards Used */}
          <Card className="relative overflow-hidden border-0 shadow-md text-white cursor-pointer" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #9333EA 100%)', boxShadow: '0 4px 20px rgba(37,99,235,0.3)' }} onClick={() => setLocation("/vouchers")}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
              <CardTitle className="text-sm font-medium text-white/80">
                {language === "ar" ? "الكروت المستخدمة" : "Cards Used"}
              </CardTitle>
              <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-4xl font-bold text-white">{formatNumber((stats as any)?.usedCards || 0)}</div>
              <div className="flex gap-3 mt-2 text-xs text-white/70">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{language === "ar" ? "اليوم" : "Today"}: {formatNumber((stats as any)?.cardsUsedToday || 0)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>{language === "ar" ? "الأسبوع" : "Week"}: {formatNumber((stats as any)?.cardsUsedThisWeek || 0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-green-50 dark:bg-green-950/30 cursor-pointer hover:shadow-md transition-all" onClick={() => setLocation("/nas")}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-400">
                {language === "ar" ? "أجهزة NAS النشطة" : "Active NAS"}
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Activity className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-green-700 dark:text-green-400">{formatNumber((stats as any)?.activeNasCount || 0)}</div>
              <p className="text-xs text-green-600/70 mt-1">
                {language === "ar" ? "أجهزة متصلة" : "Connected devices"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-blue-50 dark:bg-blue-950/30 cursor-pointer hover:shadow-md transition-all" onClick={() => setLocation("/staff-management")}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-400">
                {language === "ar" ? "إجمالي الموظفين" : "Total Staff"}
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">{formatNumber((stats as any)?.totalStaff || 0)}</div>
              <p className="text-xs text-blue-600/70 mt-1">
                {language === "ar" ? "مديرين وموظفين" : "Admins and staff"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Stats */}
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setLocation("/wallet")}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("dashboard.wallet_balance")}</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-stat">{formatCurrency(stats?.walletBalance || "0")}</div>
              <Button variant="link" className="p-0 h-auto mt-2 text-xs" onClick={() => setLocation("/wallet")}>
                {language === "ar" ? "إضافة رصيد" : "Add funds"}
                <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-200 border" onClick={() => setLocation("/vouchers")}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {language === "ar" ? "إجمالي الكروت" : "Total Cards"}
              </CardTitle>
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-stat">{formatNumber((stats as any)?.totalCards || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatNumber((stats as any)?.usedCards || 0)} {language === "ar" ? "مستخدم" : "used"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{language === "ar" ? "إجراءات سريعة" : "Quick Actions"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-3">
              <Button variant="outline" className="h-auto py-3 flex flex-col gap-1.5 hover:bg-primary/5 hover:border-primary/30 transition-all" onClick={() => setLocation("/staff-management")}>
                <Users className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">{language === "ar" ? "إدارة الموظفين" : "Manage Staff"}</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex flex-col gap-1.5 hover:bg-primary/5 hover:border-primary/30 transition-all" onClick={() => setLocation("/vouchers")}>
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">{language === "ar" ? "إنشاء كروت" : "Generate Cards"}</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex flex-col gap-1.5 hover:bg-primary/5 hover:border-primary/30 transition-all" onClick={() => setLocation("/support")}>
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">{language === "ar" ? "الدعم الفني" : "Support"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    );
  }

  // Owner/Super Admin Dashboard
  if (user?.role === "owner" || user?.role === "super_admin") {
    return (
      <EnhancedDashboard
        userName={user.name || user.username || ""}
        adminStats={adminStats}
        isAdminStatsLoading={isAdminStatsLoading}
      />
    );
  }

  // Owner/Super Admin Dashboard (OLD - REMOVED)
  if (false) {
    return (
      <div className="space-y-5">
        {/* Header + Status Bar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {t("dashboard.welcome")}، {user?.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                {language === "ar" ? "نظرة عامة على النظام" : "System Overview"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="self-start md:self-auto">
              <RefreshCw className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
              {language === "ar" ? "تحديث" : "Refresh"}
            </Button>
          </div>
          {/* System Status Bar */}
          <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-card border shadow-sm">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-green-700 dark:text-green-400">{language === "ar" ? "النظام يعمل" : "System Online"}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Activity className="h-3 w-3 text-blue-600" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">{formatNumber(stats?.activeSessions || 0)} {language === "ar" ? "جلسة نشطة" : "Active Sessions"}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Users className="h-3 w-3 text-purple-600" />
              <span className="text-xs font-medium text-purple-700 dark:text-purple-400">{formatNumber(stats?.totalUsers || 0)} {language === "ar" ? "مستخدم" : "Users"}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Wallet className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-primary">{formatCurrency(stats?.totalRevenue || "0")} {language === "ar" ? "إجمالي" : "Total Revenue"}</span>
            </div>
          </div>
        </div>

        {/* New Admin Stats Cards */}
        {isAdminStatsLoading ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-2">{language === "ar" ? "جاري التحميل..." : "Loading..."}</p>
          </div>
        ) : adminStats && (
          <>
            {/* Financial Stats - Primary Cards (bigger) */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* PRIMARY: Total Revenue */}
              <Card className="relative overflow-hidden border-0 shadow-md bg-gradient-to-br from-green-500 to-emerald-600 text-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-white/80">{language === "ar" ? "إجمالي الإيرادات" : "Total Revenue"}</CardTitle>
                  <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
                    <Wallet className="h-5 w-5 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-white">{formatCurrency(adminStats?.totalRevenue ?? "0")}</div>
                  <p className="text-xs text-white/70 mt-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {language === "ar" ? "من جميع الإيداعات" : "From all deposits"}
                  </p>
                </CardContent>
              </Card>

              {/* PRIMARY: Monthly Revenue */}
              <Card className="relative overflow-hidden border-0 shadow-md bg-gradient-to-br from-primary to-teal-600 text-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-white/80">{language === "ar" ? "الإيرادات الشهرية" : "Monthly Revenue"}</CardTitle>
                  <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-white">{formatCurrency(adminStats?.monthlyRevenue ?? "0")}</div>
                  <p className="text-xs text-white/70 mt-2">
                    {language === "ar" ? "هذا الشهر" : "This month"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Secondary Financial Cards */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30 cursor-pointer hover:shadow-md transition-all" onClick={() => setLocation("/bank-transfer-admin")}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-orange-800 dark:text-orange-300">{language === "ar" ? "طلبات تحويل بنكي" : "Bank Transfer Requests"}</CardTitle>
                  <div className="h-8 w-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 text-orange-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-700 dark:text-orange-400">{formatNumber(adminStats?.pendingBankTransfers ?? 0)}</div>
                  <Badge className="mt-2 bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
                    <Clock className="h-3 w-3 mr-1" />
                    {language === "ar" ? "قيد المراجعة" : "Pending Review"}
                  </Badge>
                </CardContent>
              </Card>

              <Card className="border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-300">{language === "ar" ? "رصيد النظام الكلي" : "Total System Balance"}</CardTitle>
                  <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Wallet className="h-4 w-4 text-blue-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">{formatCurrency(adminStats?.totalSystemBalance ?? "0")}</div>
                  <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">
                    {language === "ar" ? "مجموع أرصدة العملاء" : "Sum of all wallets"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* User Stats - Secondary Cards with tinted backgrounds */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Card className="cursor-pointer hover:shadow-md transition-all border-0 shadow-sm bg-green-50 dark:bg-green-950/30" onClick={() => setLocation("/clients")}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-400">{language === "ar" ? "مستخدمين نشطين" : "Active Users"}</CardTitle>
                  <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Users className="h-4 w-4 text-green-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-700 dark:text-green-400">{formatNumber(adminStats?.activeUsers ?? 0)}</div>
                  <div className="flex items-center gap-1 mt-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-600 dark:text-green-400">{language === "ar" ? "نشط" : "Active"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-all border-0 shadow-sm bg-amber-50 dark:bg-amber-950/30" onClick={() => setLocation("/clients")}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">{language === "ar" ? "تنتهي قريباً" : "Expiring Soon"}</CardTitle>
                  <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">{formatNumber(adminStats?.expiringSoon ?? 0)}</div>
                  <p className="text-xs text-amber-600/70 mt-1">{language === "ar" ? "خلال 7 أيام" : "Within 7 days"}</p>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-all border-0 shadow-sm bg-blue-50 dark:bg-blue-950/30" onClick={() => setLocation("/clients")}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-400">{language === "ar" ? "مستخدمين جدد" : "New Users"}</CardTitle>
                  <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">{formatNumber(adminStats?.newUsersThisMonth ?? 0)}</div>
                  <p className="text-xs text-blue-600/70 mt-1">{language === "ar" ? "هذا الشهر" : "This month"}</p>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:shadow-md transition-all border-0 shadow-sm bg-red-50 dark:bg-red-950/30" onClick={() => setLocation("/clients")}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-400">{language === "ar" ? "رصيد منخفض" : "Low Balance"}</CardTitle>
                  <div className="h-8 w-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-700 dark:text-red-400">{formatNumber(adminStats?.lowBalanceAccounts ?? 0)}</div>
                  <p className="text-xs text-red-600/70 mt-1">{language === "ar" ? "أقل من $5" : "Less than $5"}</p>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Old Stats Grid (keep for backward compatibility) */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/clients")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.total_users")}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.totalUsers || 0)}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="text-green-500">+12%</span>
                {language === "ar" ? "من الشهر الماضي" : "from last month"}
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/resellers")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.total_resellers")}</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.totalResellers || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {language === "ar" ? "موزعين نشطين" : "Active resellers"}
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/sessions")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.active_sessions")}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.activeSessions || 0)}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                {language === "ar" ? "متصلين الآن" : "Online now"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.total_revenue")}</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats?.totalRevenue || "0")}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="text-green-500">+8%</span>
                {language === "ar" ? "من الشهر الماضي" : "from last month"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/invoices")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.pending_invoices")}</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.pendingInvoices || 0)}</div>
              <Badge variant="secondary" className="mt-2">
                <Clock className="h-3 w-3 mr-1" />
                {language === "ar" ? "بانتظار الدفع" : "Awaiting payment"}
              </Badge>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/support")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.open_tickets")}</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.openTickets || 0)}</div>
              <Badge variant={stats?.openTickets && (stats?.openTickets ?? 0) > 0 ? "destructive" : "secondary"} className="mt-2">
                {stats?.openTickets && (stats?.openTickets ?? 0) > 0 ? (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {language === "ar" ? "تحتاج اهتمام" : "Needs attention"}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {language === "ar" ? "لا توجد تذاكر" : "All clear"}
                  </>
                )}
              </Badge>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/subscriptions")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.active_subscriptions")}</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.activeSubscriptions || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {language === "ar" ? "اشتراكات نشطة" : "Active subscriptions"}
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/clients")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.total_clients")}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.totalClients || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {language === "ar" ? "عملاء مسجلين" : "Registered clients"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* VPS Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
          {/* CPU */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{language === "ar" ? "المعالج CPU" : "CPU"}</CardTitle>
              <Cpu className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {isVpsLoading ? (
                <div className="text-center py-4"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-blue-600">
                    {(vpsStats as any)?.cpu_usage || 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{language === "ar" ? "استخدام المعالج" : "CPU usage"}</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* RAM */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{language === "ar" ? "الذاكرة RAM" : "RAM"}</CardTitle>
              <MemoryStick className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              {isVpsLoading ? (
                <div className="text-center py-4"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-purple-600">
                    {(vpsStats as any)?.memory_usage || 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{language === "ar" ? "استخدام الذاكرة" : "Memory usage"}</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Disk */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{language === "ar" ? "القرص Disk" : "Disk"}</CardTitle>
              <HardDrive className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              {isVpsLoading ? (
                <div className="text-center py-4"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="text-2xl font-bold text-orange-600">
                    {(vpsStats as any)?.disk_usage || 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{language === "ar" ? "استخدام القرص" : "Disk usage"}</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Uptime */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{language === "ar" ? "وقت التشغيل Uptime" : "Uptime"}</CardTitle>
              <Timer className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {isVpsLoading ? (
                <div className="text-center py-4"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="text-lg font-bold text-green-600 leading-tight">
                    {(vpsStats as any)?.uptime || 'N/A'}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-xs text-muted-foreground">{language === "ar" ? "السيرفر يعمل" : "Server running"}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{language === "ar" ? "إجراءات سريعة" : "Quick Actions"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all" onClick={() => setLocation("/resellers")}>
                <Building2 className="h-5 w-5" />
                <span className="text-sm font-medium">{language === "ar" ? "إضافة موزع" : "Add Reseller"}</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all" onClick={() => setLocation("/plans")}>
                <CreditCard className="h-5 w-5" />
                <span className="text-sm font-medium">{language === "ar" ? "إدارة الخطط" : "Manage Plans"}</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2 hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all" onClick={() => setLocation("/nas")}>
                <Activity className="h-5 w-5" />
                <span className="text-sm font-medium">{language === "ar" ? "أجهزة NAS" : "NAS Devices"}</span>
              </Button>
              <Button className="h-auto py-4 flex flex-col gap-2 bg-primary hover:bg-primary/90" onClick={() => setLocation("/vouchers")}>
                <CreditCard className="h-5 w-5" />
                <span className="text-sm font-medium">{language === "ar" ? "إنشاء كروت" : "Generate Vouchers"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    );
  }
  // Reseller Dashboardd
  if (user?.role === "reseller") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("dashboard.welcome")}، {user.name}
            </h1>
            <p className="text-muted-foreground">
              {language === "ar" ? "لوحة تحكم الموزع" : "Reseller Dashboard"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
            {language === "ar" ? "تحديث" : "Refresh"}
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/wallet")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.wallet_balance")}</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats?.walletBalance || "0")}</div>
              <Button variant="link" className="p-0 h-auto mt-2" onClick={() => setLocation("/wallet")}>
                {language === "ar" ? "إضافة رصيد" : "Add funds"}
                <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/clients")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.total_clients")}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.totalClients || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {language === "ar" ? "عملاء نشطين" : "Active clients"}
              </p>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/vouchers")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.total_vouchers")}</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber((stats as any)?.totalCards || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {(stats as any)?.usedCards || 0} {language === "ar" ? "مستخدم" : "used"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Stats */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/subscriptions")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.active_subscriptions")}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.activeSubscriptions || 0)}</div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setLocation("/invoices")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("dashboard.pending_invoices")}</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats?.pendingInvoices || 0)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>{language === "ar" ? "إجراءات سريعة" : "Quick Actions"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/clients")}>
                <Users className="h-5 w-5" />
                <span>{language === "ar" ? "إضافة عميل" : "Add Client"}</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/vouchers")}>
                <CreditCard className="h-5 w-5" />
                <span>{language === "ar" ? "إنشاء كروت" : "Generate Vouchers"}</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => setLocation("/support")}>
                <MessageSquare className="h-5 w-5" />
                <span>{language === "ar" ? "الدعم الفني" : "Support"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

}
