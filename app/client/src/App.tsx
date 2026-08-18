import { Toaster } from "@/components/ui/sonner";
import { lazy, Suspense, useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { SessionWarningDialog } from "./components/SessionWarningDialog";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import ImpersonationBanner from "./components/ImpersonationBanner";
import { OperationFeedbackOverlay } from "./components/OperationFeedbackOverlay";
import { ConfirmActionProvider } from "./components/ConfirmActionProvider";

// ─── Eager (critical path — always needed on first paint) ───────────────────
import Auth from "./pages/Auth";
import NotFound from "@/pages/NotFound";
import DashboardLayout from "./components/DashboardLayout";
import Sessions from "./pages/Sessions";
import CardLookup from "./pages/CardLookup";

// ─── Lazy pages — loaded only when navigated to ─────────────────────────────
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Plans = lazy(() => import("./pages/Plans"));
const PlanDetail = lazy(() => import("./pages/PlanDetail"));
const Vouchers = lazy(() => import("./pages/Vouchers"));
const BatchCards = lazy(() => import("./pages/BatchCards"));
const ManualCards = lazy(() => import("./pages/ManualCards"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Support = lazy(() => import("./pages/Support"));
const Invoices = lazy(() => import("./pages/Invoices"));
const NasDevices = lazy(() => import("./pages/NasDevices"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const MikrotikSetup = lazy(() => import("./pages/MikrotikSetup"));
const PrintCards = lazy(() => import("./pages/PrintCards"));
const ImportCards = lazy(() => import("./pages/ImportCards"));
const Reports = lazy(() => import("./pages/Reports"));
const Subscribers = lazy(() => import("./pages/Subscribers"));
const SubscriberDetail = lazy(() => import("./pages/SubscriberDetail"));
const OnlineUsers = lazy(() => import("./pages/OnlineUsers"));
const VpnLogs = lazy(() => import("./pages/VpnLogs"));
const VpnManagement = lazy(() => import("./pages/VpnManagement"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const RadiusLogs = lazy(() => import("./pages/RadiusLogs"));
const SaasPlansManagement = lazy(() => import("./pages/SaasPlansManagement"));
const SmsManagement = lazy(() => import("./pages/SmsManagement"));
const RadiusControlPanel = lazy(() => import("./pages/RadiusControlPanel"));
const FeatureAccessControl = lazy(() => import("./pages/FeatureAccessControl"));
const AdminControl = lazy(() => import("./pages/AdminControl"));
const StaffManagement = lazy(() => import("./pages/StaffManagement"));
const AdminConsole = lazy(() => import("./pages/AdminConsole"));
const SubscriptionPlansManagement = lazy(() => import("./pages/SubscriptionPlansManagement"));
const WalletLedger = lazy(() => import("./pages/WalletLedger"));
const BankTransferRecharge = lazy(() => import("./pages/BankTransferRecharge"));
const BankTransferAdmin = lazy(() => import("./pages/BankTransferAdmin"));
const OwnerBillingDashboard = lazy(() => import("./pages/OwnerBillingDashboard"));
const CardSales = lazy(() => import("./pages/CardSales"));
const EmailVerification = lazy(() => import("./pages/EmailVerification"));
const ActivityTimeline = lazy(() => import("./pages/ActivityTimeline"));
const DashboardPreview = lazy(() => import("./pages/DashboardPreview"));
const CardCheck = lazy(() => import("./pages/CardCheck"));
const CardCheckSettings = lazy(() => import("./pages/CardCheckSettings"));
const WinboxAccess = lazy(() => import("./pages/WinboxAccess"));
const CronJobs = lazy(() => import("./pages/CronJobs"));
const OnboardingWizard = lazy(() => import("./pages/OnboardingWizard"));
const BroadcastNotifications = lazy(() => import("./pages/BroadcastNotifications"));
const MyNotifications = lazy(() => import("./pages/MyNotifications"));
const NetworkMonitor = lazy(() => import("./pages/NetworkMonitor"));
const SecurityMonitor = lazy(() => import("./pages/SecurityMonitor"));
const SmsCards = lazy(() => import("./pages/SmsCards"));
const StorePage = lazy(() => import("./pages/StorePage"));
const StoreManagement = lazy(() => import("./pages/StoreManagement"));
const FeedbackCenter = lazy(() => import("./pages/admin/FeedbackCenter"));

// ─── Lazy global widgets (mounted app-wide but not critical for first paint) ─
const BroadcastPopup = lazy(() => import("./components/BroadcastPopup"));
const SupportChatWidget = lazy(() => import("./components/SupportChatWidget"));

// ─── Minimal loading fallback ────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Auth} />
        <Route path="/home"><DashboardLayout><Home /></DashboardLayout></Route>
        <Route path="/auth"><Redirect to="/" /></Route>
        <Route path="/login" component={Auth} />
        <Route path="/register" component={Auth} />
        <Route path="/dashboard"><DashboardLayout><Dashboard /></DashboardLayout></Route>
        <Route path="/card-lookup"><DashboardLayout><CardLookup /></DashboardLayout></Route>
        <Route path="/plans"><DashboardLayout><Plans /></DashboardLayout></Route>
        <Route path="/plans/:id">{() => <DashboardLayout><PlanDetail /></DashboardLayout>}</Route>
        <Route path="/manual-cards">{() => <DashboardLayout><ManualCards /></DashboardLayout>}</Route>
        <Route path="/vouchers"><DashboardLayout><Vouchers /></DashboardLayout></Route>
        <Route path="/vouchers/batch/:batchId">{() => <DashboardLayout><BatchCards /></DashboardLayout>}</Route>
        <Route path="/import-cards"><DashboardLayout><ImportCards /></DashboardLayout></Route>
        <Route path="/subscribers"><DashboardLayout><Subscribers /></DashboardLayout></Route>
        <Route path="/subscribers/:id">{() => <DashboardLayout><SubscriberDetail /></DashboardLayout>}</Route>
        <Route path="/wallet"><DashboardLayout><Wallet /></DashboardLayout></Route>
        <Route path="/wallet-ledger"><DashboardLayout><WalletLedger /></DashboardLayout></Route>
        <Route path="/bank-transfer-recharge"><DashboardLayout><BankTransferRecharge /></DashboardLayout></Route>
        <Route path="/bank-transfer-admin"><DashboardLayout><BankTransferAdmin /></DashboardLayout></Route>
        <Route path="/owner-billing"><DashboardLayout><OwnerBillingDashboard /></DashboardLayout></Route>
        <Route path="/support"><DashboardLayout><Support /></DashboardLayout></Route>
        <Route path="/clients"><Redirect to="/admin" /></Route>
        <Route path="/users-management"><Redirect to="/admin" /></Route>
        <Route path="/admin"><DashboardLayout><AdminConsole /></DashboardLayout></Route>
        <Route path="/admin-control"><DashboardLayout><AdminControl /></DashboardLayout></Route>
        <Route path="/staff-management"><DashboardLayout><StaffManagement /></DashboardLayout></Route>
        <Route path="/resellers"><Redirect to="/admin" /></Route>
        <Route path="/invoices"><DashboardLayout><Invoices /></DashboardLayout></Route>
        <Route path="/nas"><DashboardLayout><NasDevices /></DashboardLayout></Route>
        <Route path="/winbox"><DashboardLayout><WinboxAccess /></DashboardLayout></Route>
        <Route path="/settings"><DashboardLayout><Settings /></DashboardLayout></Route>
        <Route path="/card-check-settings"><DashboardLayout><CardCheckSettings /></DashboardLayout></Route>
        <Route path="/profile"><DashboardLayout><Profile /></DashboardLayout></Route>
        <Route path="/sessions"><DashboardLayout><Sessions /></DashboardLayout></Route>
        <Route path="/online-users"><Redirect to="/sessions" /></Route>
        <Route path="/vpn-logs"><DashboardLayout><VpnLogs /></DashboardLayout></Route>
        <Route path="/vpn-management"><VpnManagement /></Route>
        <Route path="/audit-log"><DashboardLayout><AuditLog /></DashboardLayout></Route>
        <Route path="/radius-logs"><DashboardLayout><RadiusLogs /></DashboardLayout></Route>
        <Route path="/bandwidth"><Redirect to="/reports?tab=bandwidth" /></Route>
        <Route path="/saas-plans"><DashboardLayout><SaasPlansManagement /></DashboardLayout></Route>
        <Route path="/sms"><DashboardLayout><SmsManagement /></DashboardLayout></Route>
        <Route path="/radius-control"><DashboardLayout><RadiusControlPanel /></DashboardLayout></Route>
        <Route path="/cron-jobs"><DashboardLayout><CronJobs /></DashboardLayout></Route>
        <Route path="/feature-access"><DashboardLayout><FeatureAccessControl /></DashboardLayout></Route>
        <Route path="/permission-plans"><Redirect to="/admin" /></Route>
        <Route path="/user-permission-override"><Redirect to="/admin" /></Route>
        <Route path="/reports"><DashboardLayout><Reports /></DashboardLayout></Route>
        <Route path="/subscription-plans"><DashboardLayout><SubscriptionPlansManagement /></DashboardLayout></Route>
        <Route path="/card-templates"><Redirect to="/print-cards" /></Route>
        <Route path="/print-cards"><DashboardLayout><PrintCards /></DashboardLayout></Route>
        <Route path="/card-sales">{() => <DashboardLayout><CardSales /></DashboardLayout>}</Route>
        <Route path="/default-plans"><Redirect to="/admin" /></Route>
        <Route path="/email-verification">{() => <DashboardLayout><EmailVerification /></DashboardLayout>}</Route>
        <Route path="/activity-timeline">{() => <DashboardLayout><ActivityTimeline /></DashboardLayout>}</Route>
        <Route path="/onboarding" component={OnboardingWizard} />
        <Route path="/broadcasts"><DashboardLayout><BroadcastNotifications /></DashboardLayout></Route>
        <Route path="/mikrotik-setup"><DashboardLayout><MikrotikSetup /></DashboardLayout></Route>
        <Route path="/design-preview" component={DashboardPreview} />
        <Route path="/check/:token" component={CardCheck} />
        <Route path="/network-monitor"><DashboardLayout><NetworkMonitor /></DashboardLayout></Route>
        <Route path="/security-monitor"><DashboardLayout><SecurityMonitor /></DashboardLayout></Route>
        <Route path="/sms-cards"><DashboardLayout><SmsCards /></DashboardLayout></Route>
        <Route path="/store/:slug/order/:token">{() => <StorePage />}</Route>
        <Route path="/store/:slug">{() => <StorePage />}</Route>
        <Route path="/store-management"><DashboardLayout><StoreManagement /></DashboardLayout></Route>
        <Route path="/admin/feedback"><DashboardLayout><FeedbackCenter /></DashboardLayout></Route>
        <Route path="/my-notifications"><DashboardLayout><MyNotifications /></DashboardLayout></Route>
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  // Hide the inline HTML loading screen once React has mounted
  useEffect(() => {
    const loader = document.getElementById('app-loader');
    if (loader) {
      loader.style.transition = 'opacity 0.35s ease';
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 400);
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <OperationFeedbackOverlay />
            <ConfirmActionProvider />
            <ImpersonationBanner />
            <Suspense fallback={null}>
              <BroadcastPopup />
              <SupportChatWidget />
            </Suspense>
            <SessionWarningDialog />
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
