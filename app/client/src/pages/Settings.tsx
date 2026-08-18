import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  User,
  Bell,
  Globe,
  Shield,
  CreditCard,
  Mail,
  Key,
  Palette,
  Save,
  Server,
  Network,
  Camera,
  Upload,
  Loader2,
  DollarSign,
  Rocket,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Send,
  Timer,
} from "lucide-react";
import { CURRENCIES } from "../../../shared/currencies";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import SiteSettings from "./SiteSettings";
import TelegramNotifications from "./TelegramNotifications";
import WhatsAppNotifications from "./WhatsAppNotifications";
import SmsNotifications from "./SmsNotifications";
import BackupManagement from "./BackupManagement";

export default function Settings() {
  const { user, refresh: refetchUser } = useAuth();
  const { t, language, direction, setLanguage } = useLanguage();
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [invoiceNotifications, setInvoiceNotifications] = useState(true);
  const [supportNotifications, setSupportNotifications] = useState(true);
  
  // Profile form state
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Password reset state
  const [showPasswordResetDialog, setShowPasswordResetDialog] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordResetStep, setPasswordResetStep] = useState<'request' | 'verify'>('request');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  
  // Currency state
  const [selectedCurrency, setSelectedCurrency] = useState<string>((user as any)?.preferredCurrency || 'USD');
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [selectedTimezone, setSelectedTimezone] = useState<string>('Asia/Gaza');
  const [timezoneLoading, setTimezoneLoading] = useState(false);
  const [staleTimeoutSeconds, setStaleTimeoutSeconds] = useState(300);
  const [staleTimeoutLoading, setStaleTimeoutLoading] = useState(false);

  // SMS Settings
  const [smsProvider, setSmsProvider] = useState<'system' | 'custom' | 'custom_api'>('system');
  const [smsUsername, setSmsUsername] = useState('');
  const [smsPassword, setSmsPassword] = useState('');
  const [smsSender, setSmsSender] = useState('');
  const [customSmsApiUrl, setCustomSmsApiUrl] = useState('');
  const [customSmsBalanceUrl, setCustomSmsBalanceUrl] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsTestLoading, setSmsTestLoading] = useState(false);
  const [smsTestPhone, setSmsTestPhone] = useState('');
  const [smsTestResult, setSmsTestResult] = useState<{ success: boolean; message: string } | null>(null);
  // SMS Balance
  const [smsBalanceLoading, setSmsBalanceLoading] = useState(false);
  const [smsBalanceResult, setSmsBalanceResult] = useState<{ balance?: number; success: boolean; errorMessage?: string; source?: string } | null>(null);

  // Load SMS channel settings
  const utils = trpc.useUtils();
  const { data: smsChannelData, refetch: refetchSmsChannel } = trpc.notificationChannels.getChannelSettings.useQuery(
    { channel: 'sms' },
    { enabled: user?.role === 'owner' || user?.role === 'super_admin' }
  );

  // Initialize SMS form from DB
  useEffect(() => {
    if (smsChannelData?.settings) {
      const s = smsChannelData.settings as any;
      const providerType = s.smsProviderType || 'tweetsms';
      if (providerType === 'custom_api') {
        setSmsProvider('custom_api');
        setCustomSmsApiUrl(s.customSmsApiUrl || '');
        setCustomSmsBalanceUrl(s.customSmsBalanceUrl || '');
        setSmsSender(s.smsSender || '');
      } else if (s.smsApiKey) {
        // smsApiKey stores "username:password" for TweetSMS
        const parts = s.smsApiKey.split(':');
        setSmsUsername(parts[0] || '');
        setSmsPassword(parts.slice(1).join(':') || '');
        setSmsProvider('custom');
        setSmsSender(s.smsSender || '');
      } else {
        setSmsProvider('system');
        setSmsSender(s.smsSender || '');
      }
    }
  }, [smsChannelData]);

  const sendTestSmsMutation = trpc.notificationChannels.sendTestSms.useMutation();

  const saveSmsSettingsMutation = trpc.notificationChannels.saveChannelSettings.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم حفظ إعدادات SMS بنجاح' : 'SMS settings saved');
      refetchSmsChannel();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSaveSmsSettings = async () => {
    setSmsLoading(true);
    try {
      if (smsProvider === 'custom_api') {
        await saveSmsSettingsMutation.mutateAsync({
          channel: 'sms',
          enabled: true,
          smsApiKey: '',
          smsSender: smsSender || undefined,
          smsProviderType: 'custom_api',
          customSmsApiUrl: customSmsApiUrl || undefined,
          customSmsBalanceUrl: customSmsBalanceUrl || undefined,
        });
      } else {
        await saveSmsSettingsMutation.mutateAsync({
          channel: 'sms',
          enabled: smsProvider === 'custom',
          smsApiKey: smsProvider === 'custom' && smsUsername ? `${smsUsername}:${smsPassword}` : '',
          smsSender: smsSender || undefined,
          smsProviderType: smsProvider === 'custom' ? 'tweetsms' : 'tweetsms',
          customSmsApiUrl: undefined,
          customSmsBalanceUrl: undefined,
        });
      }
    } finally {
      setSmsLoading(false);
    }
  };

  // RADIUS Settings
  const [radiusPublicIp, setRadiusPublicIp] = useState('');
  const [portForwardingPublicHost, setPortForwardingPublicHost] = useState('');
  const [radiusVpnIp, setRadiusVpnIp] = useState('192.168.30.1');
  const [vpnServerAddress, setVpnServerAddress] = useState('');
  const [radiusSettingsLoading, setRadiusSettingsLoading] = useState(false);
  
  // Load RADIUS settings
  const { data: systemSettings, refetch: refetchSettings } = trpc.settings.getAll.useQuery();
  
  // Initialize profile form with user data
  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
      setProfileAddress(user.address || '');
      setSelectedCurrency((user as any).preferredCurrency || 'USD');
    }
  }, [user]);
  
  // Update local state when settings are loaded
  useEffect(() => {
    if (systemSettings) {
      setRadiusPublicIp(systemSettings.radius_server_public_ip || '');
      setPortForwardingPublicHost(systemSettings.port_forwarding_public_host || '');
      setRadiusVpnIp(systemSettings.radius_server_vpn_ip || '192.168.30.1');
      setVpnServerAddress(systemSettings.vpn_server_address || '');
    }
  }, [systemSettings]);
  
  const updateSettingMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Settings saved');
      refetchSettings();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });
  
  const { data: staleSessionSettings, refetch: refetchStaleSessionSettings } = trpc.staleSessions.getSettings.useQuery(undefined, {
    enabled: user?.role === 'owner' || user?.role === 'super_admin',
  });
  const updateStaleSessionSettingsMutation = trpc.staleSessions.updateSettings.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم حفظ مهلة الجلسات الراكدة' : 'Stale session timeout saved');
      refetchStaleSessionSettings();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  useEffect(() => {
    if (staleSessionSettings?.timeoutSeconds) setStaleTimeoutSeconds(staleSessionSettings.timeoutSeconds);
  }, [staleSessionSettings?.timeoutSeconds]);

  const handleSaveStaleSessionTimeout = async () => {
    setStaleTimeoutLoading(true);
    try {
      await updateStaleSessionSettingsMutation.mutateAsync({ timeoutSeconds: staleTimeoutSeconds });
    } finally {
      setStaleTimeoutLoading(false);
    }
  };

const updateCurrencyMutation = trpc.auth.updateCurrency.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم تحديث العملة المفضلة' : 'Preferred currency updated');
      refetchUser();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const handleSaveCurrency = async () => {
    setCurrencyLoading(true);
    try {
      await updateCurrencyMutation.mutateAsync({ preferredCurrency: selectedCurrency as "USD" | "ILS" | "JOD" | "SAR" | "AED" | "EGP" | "YER" });
    } finally {
      setCurrencyLoading(false);
    }
  };

  const { data: timezoneSettings, refetch: refetchTimezoneSettings } = trpc.timezone.getMySettings.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const { data: supportedTimezones } = trpc.timezone.supported.useQuery(undefined, {
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (timezoneSettings?.ownerTimezone) setSelectedTimezone(timezoneSettings.ownerTimezone);
  }, [timezoneSettings?.ownerTimezone]);

  const updateTimezoneMutation = trpc.timezone.updateMyTimezone.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم حفظ المنطقة الزمنية للتقارير' : 'Report timezone saved');
      refetchTimezoneSettings();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });
  const updateNetworkTimezoneMutation = trpc.timezone.updateNetworkTimezone.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم حفظ المنطقة الزمنية للشبكة' : 'Network timezone saved');
      refetchTimezoneSettings();
    },
    onError: (error: { message: string }) => toast.error(error.message),
  });

  const handleSaveTimezone = async () => {
    setTimezoneLoading(true);
    try {
      await updateTimezoneMutation.mutateAsync({ timezone: selectedTimezone });
    } finally {
      setTimezoneLoading(false);
    }
  };

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم تحديث الملف الشخصي' : 'Profile updated');
      refetchUser();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });
  
  const updateAvatarMutation = trpc.auth.updateAvatar.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم تحديث الصورة الشخصية' : 'Avatar updated');
      refetchUser();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });
  
  const requestPasswordChangeMutation = trpc.auth.requestPasswordChange.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم إرسال رمز التحقق لبريدك الإلكتروني' : 'Verification code sent to your email');
      setPasswordResetStep('verify');
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });
  
  const resetPasswordMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      toast.success(language === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully');
      setShowPasswordResetDialog(false);
      setPasswordResetStep('request');
      setResetCode('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });
  
  const handleSaveRadiusSettings = async () => {
    setRadiusSettingsLoading(true);
    try {
      await updateSettingMutation.mutateAsync({ key: 'radius_server_public_ip', value: radiusPublicIp });
      await updateSettingMutation.mutateAsync({ key: 'port_forwarding_public_host', value: portForwardingPublicHost.trim() });
      await updateSettingMutation.mutateAsync({ key: 'radius_server_vpn_ip', value: radiusVpnIp });
      await updateSettingMutation.mutateAsync({ key: 'vpn_server_address', value: vpnServerAddress });
    } finally {
      setRadiusSettingsLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileLoading(true);
    try {
      await updateProfileMutation.mutateAsync({
        name: profileName,
        phone: profilePhone,
        address: profileAddress,
      });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error(language === 'ar' ? 'يرجى اختيار صورة' : 'Please select an image');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(language === 'ar' ? 'حجم الصورة كبير جداً (الحد الأقصى 5MB)' : 'Image too large (max 5MB)');
      return;
    }
    
    setAvatarUploading(true);
    try {
      // Upload to S3 via API
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload/avatar', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      const { url } = await response.json();
      await updateAvatarMutation.mutateAsync({ avatarUrl: url });
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل رفع الصورة' : 'Failed to upload image');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRequestPasswordChange = async () => {
    setPasswordResetLoading(true);
    try {
      await requestPasswordChangeMutation.mutateAsync();
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(language === 'ar' ? 'كلمات المرور غير متطابقة' : 'Passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      toast.error(language === 'ar' ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters');
      return;
    }
    
    setPasswordResetLoading(true);
    try {
      await resetPasswordMutation.mutateAsync({
        email: user?.email || '',
        code: resetCode,
        newPassword: newPassword,
      });
    } finally {
      setPasswordResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.settings")}</h1>
        <p className="text-muted-foreground">
          {language === "ar" ? "إدارة إعدادات حسابك والتطبيق" : "Manage your account and application settings"}
        </p>
      </div>

      <Tabs defaultValue="notifications" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
          {/* RADIUS tab - only visible to owner/super_admin */}
          {(user?.role === 'owner' || user?.role === 'super_admin') && (
            <TabsTrigger value="radius">
              <Server className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
              {language === "ar" ? "RADIUS" : "RADIUS"}
            </TabsTrigger>
          )}
          {(user?.role === 'owner' || user?.role === 'super_admin') && (
            <TabsTrigger value="sessions">
              <Timer className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
              {language === "ar" ? "الجلسات" : "Sessions"}
            </TabsTrigger>
          )}
          <TabsTrigger value="notifications">
            <Bell className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
            {language === "ar" ? "الإشعارات" : "Notifications"}
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
            {language === "ar" ? "الأمان" : "Security"}
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
            {language === "ar" ? "المظهر" : "Appearance"}
          </TabsTrigger>
          <TabsTrigger value="onboarding">
            <Rocket className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
            {language === "ar" ? "البداية" : "Setup"}
          </TabsTrigger>
          {/* SMS tab - ضمن نفس شريط التبويبات */}
          <TabsTrigger value="sms">
            <MessageSquare className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
            SMS
          </TabsTrigger>
          {(user?.role === 'owner' || user?.role === 'super_admin') && (
            <TabsTrigger value="site">
              <Globe className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
              {language === "ar" ? "الموقع" : "Site"}
            </TabsTrigger>
          )}
          <TabsTrigger value="channels">
            <Send className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
            {language === "ar" ? "قنوات الإشعارات" : "Channels"}
          </TabsTrigger>
          {(user?.role === 'owner' || user?.role === 'super_admin') && (
            <TabsTrigger value="backups">
              <Server className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
              {language === "ar" ? "النسخ" : "Backups"}
            </TabsTrigger>
          )}
        </TabsList>

        {(user?.role === 'owner' || user?.role === 'super_admin') && (
          <TabsContent value="site" className="space-y-6">
            <SiteSettings />
          </TabsContent>
        )}

        <TabsContent value="channels" className="space-y-6">
          <Tabs defaultValue="telegram" className="space-y-5">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
              <TabsTrigger value="telegram">Telegram</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              <TabsTrigger value="sms-channel">SMS</TabsTrigger>
            </TabsList>
            <TabsContent value="telegram"><TelegramNotifications /></TabsContent>
            <TabsContent value="whatsapp"><WhatsAppNotifications /></TabsContent>
            <TabsContent value="sms-channel"><SmsNotifications /></TabsContent>
          </Tabs>
        </TabsContent>

        {(user?.role === 'owner' || user?.role === 'super_admin') && (
          <TabsContent value="backups" className="space-y-6">
            <BackupManagement />
          </TabsContent>
        )}

        {/* Profile Tab */}
        <TabsContent value="profile">
          <div className="space-y-6">
            {/* Avatar Section */}
            <Card>
              <CardHeader>
                <CardTitle>{language === "ar" ? "الصورة الشخصية" : "Profile Picture"}</CardTitle>
                <CardDescription>
                  {language === "ar" ? "قم برفع صورة شخصية لحسابك" : "Upload a profile picture for your account"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border">
                      {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-12 w-12 text-muted-foreground" />
                      )}
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                    >
                      {avatarUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{user?.name || user?.username}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                    >
                      <Upload className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                      {language === "ar" ? "رفع صورة جديدة" : "Upload new picture"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Profile Info Section */}
            <Card>
              <CardHeader>
                <CardTitle>{language === "ar" ? "معلومات الملف الشخصي" : "Profile Information"}</CardTitle>
                <CardDescription>
                  {language === "ar" ? "تحديث معلومات حسابك الشخصية" : "Update your personal account information"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t("common.name")}</Label>
                      <Input 
                        id="name" 
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t("common.email")}</Label>
                      <Input id="email" type="email" value={user?.email || ""} disabled />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t("common.phone")}</Label>
                      <Input 
                        id="phone" 
                        type="tel" 
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">{language === "ar" ? "اسم الشركة" : "Company Name"}</Label>
                      <Input id="company" disabled placeholder={language === "ar" ? "قريباً" : "Coming soon"} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">{language === "ar" ? "العنوان" : "Address"}</Label>
                    <Input 
                      id="address" 
                      value={profileAddress}
                      onChange={(e) => setProfileAddress(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={profileLoading}>
                    {profileLoading ? (
                      <Loader2 className={`h-4 w-4 animate-spin ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                    ) : (
                      <Save className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                    )}
                    {t("common.save")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* RADIUS Tab - only visible to owner/super_admin */}
        {(user?.role === 'owner' || user?.role === 'super_admin') && (
        <TabsContent value="radius">
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  {language === "ar" ? "إعدادات خادم RADIUS" : "RADIUS Server Settings"}
                </div>
              </CardTitle>
              <CardDescription>
                {language === "ar" 
                  ? "إعداد عناوين IP الحقيقية لخادم RADIUS لربط أجهزة MikroTik" 
                  : "Configure real RADIUS server IP addresses for MikroTik device connections"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Public IP Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-blue-500" />
                  <Label className="text-base font-semibold">
                    {language === "ar" ? "اتصال IP العام" : "Public IP Connection"}
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="radius-public-ip">
                    {language === "ar" ? "IP العام لخادم RADIUS" : "RADIUS Server Public IP"}
                  </Label>
                  <Input 
                    id="radius-public-ip" 
                    placeholder={language === "ar" ? "مثال: 203.0.113.50" : "e.g., 203.0.113.50"}
                    value={radiusPublicIp}
                    onChange={(e) => setRadiusPublicIp(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {language === "ar" 
                      ? "هذا العنوان يُستخدم عندما يكون لدى الراوتر IP عام ويتصل مباشرة بخادم RADIUS" 
                      : "This address is used when the router has a public IP and connects directly to RADIUS server"}
                  </p>
                </div>
                <div className="space-y-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3">
                  <Label htmlFor="port-forwarding-public-host">
                    {language === "ar" ? "دومين التوجيه الخارجي (اختياري)" : "Port Forwarding Domain (optional)"}
                  </Label>
                  <Input
                    id="port-forwarding-public-host"
                    placeholder={language === "ar" ? "مثال: remote.radius-pro.com" : "e.g., remote.radius-pro.com"}
                    value={portForwardingPublicHost}
                    onChange={(e) => setPortForwardingPublicHost(e.target.value)}
                    dir="ltr"
                  />
                  <p className="text-sm text-muted-foreground">
                    {language === "ar"
                      ? "يظهر هذا الدومين في أزرار التوجيه الخارجي. اتركه فارغاً ليظهر عنوان VPS تلقائياً. يجب أن يشير DNS إلى IP الـVPS."
                      : "This domain is shown in external forwarding buttons. Leave it empty to use the VPS address automatically. Its DNS must point to the VPS IP."}
                  </p>
                </div>
              </div>

              <Separator />

              {/* VPN Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  <Label className="text-base font-semibold">
                    {language === "ar" ? "اتصال VPN (PPTP/SSTP)" : "VPN Connection (PPTP/SSTP)"}
                  </Label>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="vpn-server-address">
                    {language === "ar" ? "عنوان خادم VPN" : "VPN Server Address"}
                  </Label>
                  <Input 
                    id="vpn-server-address" 
                    placeholder={language === "ar" ? "مثال: vpn.example.com أو 203.0.113.100" : "e.g., vpn.example.com or 203.0.113.100"}
                    value={vpnServerAddress}
                    onChange={(e) => setVpnServerAddress(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {language === "ar" 
                      ? "عنوان خادم VPN الذي سيتصل به MikroTik لإنشاء نفق VPN" 
                      : "VPN server address that MikroTik will connect to for creating VPN tunnel"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="radius-vpn-ip">
                    {language === "ar" ? "IP خادم RADIUS داخل شبكة VPN" : "RADIUS Server IP inside VPN Network"}
                  </Label>
                  <Input 
                    id="radius-vpn-ip" 
                    placeholder={language === "ar" ? "مثال: 192.168.30.1" : "e.g., 192.168.30.1"}
                    value={radiusVpnIp}
                    onChange={(e) => setRadiusVpnIp(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    {language === "ar" 
                      ? "هذا العنوان يُستخدم بعد إنشاء نفق VPN للوصول إلى خادم RADIUS" 
                      : "This address is used after VPN tunnel is established to reach RADIUS server"}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Info Box */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200">
                  {language === "ar" ? "ملاحظة هامة" : "Important Note"}
                </h4>
                <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                  {language === "ar" 
                    ? "تأكد من أن عناوين IP المدخلة صحيحة ويمكن الوصول إليها. سيتم استخدام هذه العناوين في أوامر MikroTik المُولدة لربط الراوترات." 
                    : "Make sure the entered IP addresses are correct and reachable. These addresses will be used in generated MikroTik commands for router connections."}
                </p>
              </div>

              <Button 
                onClick={handleSaveRadiusSettings} 
                disabled={radiusSettingsLoading}
                className="w-full sm:w-auto"
              >
                {radiusSettingsLoading ? (
                  <>
                    <Loader2 className={`h-4 w-4 animate-spin ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                    {language === "ar" ? "جاري الحفظ..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <Save className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                    {language === "ar" ? "حفظ إعدادات RADIUS" : "Save RADIUS Settings"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {(user?.role === 'owner' || user?.role === 'super_admin') && (
          <TabsContent value="sessions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  {language === 'ar' ? 'إعدادات Redis والجلسات' : 'Redis / Session Settings'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar'
                    ? 'تحدد هذه المهلة متى تعتبر الجلسة منقطعة عند توقف وصول Accounting أو Interim Update موثوق من NAS/MikroTik.'
                    : 'This timeout determines when a session is considered disconnected after Accounting or Interim updates stop arriving from the NAS/MikroTik.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  {language === 'ar'
                    ? 'لا تُغلق الجلسة بسبب تأخر packet واحد. يُستخدم آخر تحديث موثوق، ثم تُغلق كـ Lost-Carrier بعد انتهاء المهلة وتُثبت مدة الاستخدام الفعلية.'
                    : 'A single delayed packet does not close a session. The latest trusted update is used, then the session closes as Lost-Carrier after this timeout and its actual usage is finalized.'}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stale-session-timeout">
                    {language === 'ar' ? `مهلة الجلسة الراكدة: ${staleTimeoutSeconds / 60} دقائق` : `Stale Session Timeout: ${staleTimeoutSeconds / 60} minutes`}
                  </Label>
                  <Input
                    id="stale-session-timeout"
                    type="number"
                    min={staleSessionSettings?.minSeconds ?? 60}
                    max={staleSessionSettings?.maxSeconds ?? 3600}
                    step={60}
                    value={staleTimeoutSeconds}
                    onChange={(event) => setStaleTimeoutSeconds(Number(event.target.value))}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === 'ar' ? 'أدخل القيمة بالثواني. النطاق الآمن: من دقيقة واحدة إلى 60 دقيقة.' : 'Enter seconds. Safe range: 1 to 60 minutes.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[180, 300, 600].map((seconds) => (
                    <Button key={seconds} type="button" size="sm" variant={staleTimeoutSeconds === seconds ? 'default' : 'outline'} onClick={() => setStaleTimeoutSeconds(seconds)}>
                      {seconds / 60} {language === 'ar' ? 'دقائق' : 'minutes'}
                    </Button>
                  ))}
                </div>
                <Button onClick={handleSaveStaleSessionTimeout} disabled={staleTimeoutLoading || staleTimeoutSeconds < 60 || staleTimeoutSeconds > 3600}>
                  {staleTimeoutLoading ? <Loader2 className={`h-4 w-4 animate-spin ${direction === 'rtl' ? 'ml-2' : 'mr-2'}`} /> : <Save className={`h-4 w-4 ${direction === 'rtl' ? 'ml-2' : 'mr-2'}`} />}
                  {language === 'ar' ? 'حفظ مهلة الجلسات' : 'Save Session Timeout'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>{language === "ar" ? "إعدادات الإشعارات" : "Notification Settings"}</CardTitle>
              <CardDescription>
                {language === "ar" ? "تحكم في كيفية تلقي الإشعارات" : "Control how you receive notifications"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{language === "ar" ? "إشعارات البريد الإلكتروني" : "Email Notifications"}</Label>
                  <p className="text-sm text-muted-foreground">
                    {language === "ar" ? "استلام إشعارات عبر البريد الإلكتروني" : "Receive notifications via email"}
                  </p>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{language === "ar" ? "إشعارات الدفع" : "Push Notifications"}</Label>
                  <p className="text-sm text-muted-foreground">
                    {language === "ar" ? "إشعارات فورية في المتصفح" : "Instant browser notifications"}
                  </p>
                </div>
                <Switch checked={pushNotifications} onCheckedChange={setPushNotifications} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{language === "ar" ? "إشعارات الفواتير" : "Invoice Notifications"}</Label>
                  <p className="text-sm text-muted-foreground">
                    {language === "ar" ? "إشعارات عند إصدار فاتورة جديدة" : "Notifications for new invoices"}
                  </p>
                </div>
                <Switch checked={invoiceNotifications} onCheckedChange={setInvoiceNotifications} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{language === "ar" ? "إشعارات الدعم" : "Support Notifications"}</Label>
                  <p className="text-sm text-muted-foreground">
                    {language === "ar" ? "إشعارات عند الرد على تذاكر الدعم" : "Notifications for support ticket replies"}
                  </p>
                </div>
                <Switch checked={supportNotifications} onCheckedChange={setSupportNotifications} />
              </div>
              <Button onClick={() => toast.success(language === "ar" ? "تم حفظ الإعدادات" : "Settings saved")}>
                <Save className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                {t("common.save")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === "ar" ? "تغيير كلمة المرور" : "Change Password"}</CardTitle>
                <CardDescription>
                  {language === "ar" ? "سيتم إرسال رمز التحقق إلى بريدك الإلكتروني" : "A verification code will be sent to your email"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                    <Mail className="h-10 w-10 text-primary" />
                    <div className="flex-1">
                      <p className="font-medium">{user?.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {language === "ar" 
                          ? "سيتم إرسال رمز التحقق إلى هذا البريد" 
                          : "Verification code will be sent to this email"}
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => setShowPasswordResetDialog(true)}
                    className="w-full sm:w-auto"
                  >
                    <Key className={`h-4 w-4 ${direction === "rtl" ? "ml-2" : "mr-2"}`} />
                    {language === "ar" ? "تغيير كلمة المرور" : "Change Password"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{language === "ar" ? "المصادقة الثنائية" : "Two-Factor Authentication"}</CardTitle>
                <CardDescription>
                  {language === "ar" ? "إضافة طبقة أمان إضافية لحسابك" : "Add an extra layer of security to your account"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{language === "ar" ? "تفعيل المصادقة الثنائية" : "Enable 2FA"}</Label>
                    <p className="text-sm text-muted-foreground">
                      {language === "ar" ? "استخدام تطبيق المصادقة للتحقق" : "Use an authenticator app for verification"}
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => toast.info(language === "ar" ? "قريباً" : "Coming soon")}>
                    {language === "ar" ? "إعداد" : "Setup"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>{language === "ar" ? "إعدادات المظهر" : "Appearance Settings"}</CardTitle>
              <CardDescription>
                {language === "ar" ? "تخصيص مظهر التطبيق" : "Customize the application appearance"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{language === "ar" ? "اللغة" : "Language"}</Label>
                <Select value={language} onValueChange={(value: "ar" | "en") => setLanguage(value)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  {language === "ar" ? "المنطقة الزمنية للتقارير والشبكات" : "Reports & Networks Timezone"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {language === "ar"
                    ? "تُخزَّن الأوقات بصيغة UTC. هذا الإعداد يحدد بداية اليوم وحدود التقارير وطريقة عرض التاريخ، ولا يغير مدة الكرت أو Session-Timeout."
                    : "Times are stored in UTC. This controls report-day boundaries and date display only; it never changes card duration or Session-Timeout."}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={selectedTimezone} onValueChange={setSelectedTimezone}>
                    <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(supportedTimezones ?? []).map((timezone) => (
                        <SelectItem key={timezone.value} value={timezone.value}>
                          {language === "ar" ? timezone.labelAr : timezone.labelEn} — {timezone.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleSaveTimezone} disabled={timezoneLoading} size="sm">
                    {timezoneLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span className="mr-1">{language === "ar" ? "حفظ" : "Save"}</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {language === "ar" ? `افتراضي النظام: ${timezoneSettings?.systemTimezone ?? 'Asia/Gaza'}` : `System default: ${timezoneSettings?.systemTimezone ?? 'Asia/Gaza'}`}
                </p>
                {(timezoneSettings?.networks ?? []).length > 0 && <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-xs font-medium text-foreground">{language === "ar" ? "تخصيص الشبكات" : "Network overrides"}</p>
                  <p className="text-xs text-muted-foreground">{language === "ar" ? "تستخدم الشبكة إعداد المالك عند اختيار الوراثة." : "Choose inheritance to use the owner timezone."}</p>
                  {timezoneSettings?.networks.map((network: { id: number; name: string | null; address: string; timezone: string | null }) => (
                    <div key={network.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
                      <span className="text-sm">{network.name || network.address}</span>
                      <Select
                        value={network.timezone ?? "__inherit"}
                        onValueChange={(value) => updateNetworkTimezoneMutation.mutate({ nasId: network.id, timezone: value === "__inherit" ? null : value })}
                      >
                        <SelectTrigger className="w-[235px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__inherit">{language === "ar" ? `وراثة من المالك (${timezoneSettings?.ownerTimezone})` : `Inherit owner (${timezoneSettings?.ownerTimezone})`}</SelectItem>
                          {(supportedTimezones ?? []).map((timezone) => <SelectItem key={timezone.value} value={timezone.value}>{language === "ar" ? timezone.labelAr : timezone.labelEn} — {timezone.value}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>}
              </div>
              <Separator />
              {/* Currency Setting */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {language === "ar" ? "العملة المفضلة" : "Preferred Currency"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {language === "ar"
                    ? "تحدد عملتك لعرض الأسعار وتخزينها في الخطط والتقارير"
                    : "Sets your currency for displaying and storing prices in plans and reports"}
                </p>
                <div className="flex items-center gap-3">
                  <Select value={selectedCurrency} onValueChange={(v: string) => setSelectedCurrency(v)}>
                    <SelectTrigger className="w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((cur) => (
                        <SelectItem key={cur.code} value={cur.code}>
                          <span className="font-mono ml-2">{cur.symbol}</span> {cur.nameAr} ({cur.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleSaveCurrency} disabled={currencyLoading} size="sm">
                    {currencyLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span className="mr-1">{language === "ar" ? "حفظ" : "Save"}</span>
                  </Button>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>{language === "ar" ? "السمة" : "Theme"}</Label>
                <p className="text-sm text-muted-foreground">
                  {language === "ar" ? "يمكنك تغيير السمة من الزر في الشريط العلوي" : "You can change the theme from the button in the top bar"}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onboarding Tab */}
        <TabsContent value="onboarding">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-primary" />
                {language === "ar" ? "معالج الإعداد الأولي" : "Setup Wizard"}
              </CardTitle>
              <CardDescription>
                {language === "ar" ? "أعد تشغيل معالج الإعداد لإضافة NAS أو بروفايل سرعة أو كروت جديدة" : "Re-run the setup wizard to add NAS, speed profiles, or cards"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  {language === "ar" ? "يأخذك المعالج خلال خطوات إعداد جهاز NAS، تركيب سكربت MikroTik، إنشاء بروفايل سرعة، وتوليد كروت إنترنت." : "The wizard guides you through setting up a NAS device, installing MikroTik script, creating a speed profile, and generating cards."}
                </p>
                <Button
                  onClick={() => { window.location.href = '/onboarding'; }}
                  className="w-fit gap-2"
                >
                  <Rocket className="w-4 h-4" />
                  {language === "ar" ? "تشغيل معالج الإعداد" : "Launch Setup Wizard"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* SMS Tab - visible to all users */}
        <TabsContent value="sms">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    {language === 'ar' ? 'إعدادات SMS' : 'SMS Settings'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'ar' ? 'اختر مزود إرسال الرسائل النصية لحسابك' : 'Choose your SMS sending provider'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Provider Selection */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">{language === 'ar' ? 'مزود الإرسال' : 'SMS Provider'}</Label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setSmsProvider('system')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                          smsProvider === 'system'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {smsProvider === 'system' ? (
                          <CheckCircle className="w-6 h-6 text-primary" />
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-muted-foreground" />
                        )}
                        <span className="font-medium text-sm">{language === 'ar' ? 'من النظام' : 'System'}</span>
                        <span className="text-xs text-muted-foreground text-center">
                          {language === 'ar' ? 'يُرسَل من رصيد النظام' : 'Uses system balance'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSmsProvider('custom')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                          smsProvider === 'custom'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {smsProvider === 'custom' ? (
                          <CheckCircle className="w-6 h-6 text-primary" />
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-muted-foreground" />
                        )}
                        <span className="font-medium text-sm">{language === 'ar' ? 'TweetSMS' : 'TweetSMS'}</span>
                        <span className="text-xs text-muted-foreground text-center">
                          {language === 'ar' ? 'حسابك الخاص في TweetSMS' : 'Your own TweetSMS account'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSmsProvider('custom_api')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                          smsProvider === 'custom_api'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {smsProvider === 'custom_api' ? (
                          <CheckCircle className="w-6 h-6 text-primary" />
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-muted-foreground" />
                        )}
                        <span className="font-medium text-sm">{language === 'ar' ? 'Custom API' : 'Custom API'}</span>
                        <span className="text-xs text-muted-foreground text-center">
                          {language === 'ar' ? 'أي شركة SMS عبر HTTP' : 'Any SMS via HTTP URL'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Custom credentials - shown only when custom is selected */}
                  {smsProvider === 'custom' && (
                    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                        <span className="text-sm text-muted-foreground">
                          {language === 'ar'
                            ? 'أدخل بيانات حسابك في TweetSMS — سيتم الإرسال من رصيدك مباشرة'
                            : 'Enter your TweetSMS credentials — messages will be sent from your balance'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{language === 'ar' ? 'اسم المستخدم' : 'Username'}</Label>
                          <Input
                            value={smsUsername}
                            onChange={e => setSmsUsername(e.target.value)}
                            placeholder={language === 'ar' ? 'اسم المستخدم في TweetSMS' : 'TweetSMS username'}
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{language === 'ar' ? 'كلمة المرور' : 'Password'}</Label>
                          <Input
                            type="password"
                            value={smsPassword}
                            onChange={e => setSmsPassword(e.target.value)}
                            placeholder="••••••••"
                            dir="ltr"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>{language === 'ar' ? 'اسم المُرسِل (Sender Name)' : 'Sender Name'}</Label>
                        <Input
                          value={smsSender}
                          onChange={e => setSmsSender(e.target.value)}
                          placeholder={language === 'ar' ? 'مثال: RadiusPro' : 'e.g. RadiusPro'}
                          dir="ltr"
                          maxLength={11}
                        />
                        <p className="text-xs text-muted-foreground">
                          {language === 'ar' ? 'الحد الأقصى 11 حرف' : 'Max 11 characters'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Custom API Section — shown only when custom_api is selected */}
                  {smsProvider === 'custom_api' && (
                    <div className="space-y-4">
                      {/* How it works explanation */}
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                            <span className="text-white text-xs font-bold">?</span>
                          </div>
                          <span className="font-semibold text-sm text-blue-600 dark:text-blue-400">
                            {language === 'ar' ? 'كيف يعمل Custom API؟' : 'How does Custom API work?'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {language === 'ar'
                            ? 'أدخل رابط API الخاص بشركة SMS التي تستخدمها. النظام سيستبدل المتغيرات التالية تلقائياً عند إرسال كل رسالة:'
                            : 'Enter the API URL from your SMS provider. The system will automatically replace these variables when sending each message:'}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2 rounded bg-muted/50 text-center">
                            <code className="text-xs font-mono text-primary font-bold">{'{phone}'}</code>
                            <p className="text-xs text-muted-foreground mt-1">{language === 'ar' ? 'رقم الهاتف' : 'Phone number'}</p>
                          </div>
                          <div className="p-2 rounded bg-muted/50 text-center">
                            <code className="text-xs font-mono text-primary font-bold">{'{msg}'}</code>
                            <p className="text-xs text-muted-foreground mt-1">{language === 'ar' ? 'نص الرسالة' : 'Message text'}</p>
                          </div>
                          <div className="p-2 rounded bg-muted/50 text-center">
                            <code className="text-xs font-mono text-primary font-bold">{'{sender}'}</code>
                            <p className="text-xs text-muted-foreground mt-1">{language === 'ar' ? 'اسم المُرسِل' : 'Sender name'}</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">{language === 'ar' ? 'مثال عملي:' : 'Example:'}</p>
                          <div className="p-2 rounded bg-muted/80 border">
                            <code className="text-xs font-mono text-foreground break-all">
                              http://smsurl.com/api/send.php?user=abc&pass=xyz&phone=&#123;phone&#125;&msg=&#123;msg&#125;&sender=&#123;sender&#125;
                            </code>
                          </div>
                        </div>
                      </div>

                      {/* API Send URL */}
                      <div className="space-y-4 p-4 rounded-lg bg-muted/30 border">
                        <div className="space-y-2">
                          <Label className="font-medium">
                            {language === 'ar' ? 'رابط API الإرسال *' : 'Send API URL *'}
                          </Label>
                          <div className="relative">
                            <Input
                              value={customSmsApiUrl}
                              onChange={e => setCustomSmsApiUrl(e.target.value)}
                              placeholder="http://smsurl.com/api/send.php?user=abc&pass=xyz&phone={phone}&msg={msg}&sender={sender}"
                              dir="ltr"
                              className="font-mono text-xs pr-10"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {language === 'ar'
                              ? 'الرابط الكامل مع بيانات الاعتماد ومتغيرات {phone} و{msg} و{sender}'
                              : 'Full URL with credentials and {phone}, {msg}, {sender} variables'}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label className="font-medium">
                            {language === 'ar' ? 'اسم المُرسِل (Sender Name)' : 'Sender Name'}
                          </Label>
                          <Input
                            value={smsSender}
                            onChange={e => setSmsSender(e.target.value)}
                            placeholder={language === 'ar' ? 'مثال: RadiusPro' : 'e.g. RadiusPro'}
                            dir="ltr"
                            maxLength={11}
                          />
                          <p className="text-xs text-muted-foreground">
                            {language === 'ar' ? 'يُستخدم لاستبدال {sender} في الرابط — الحد الأقصى 11 حرف' : 'Used to replace {sender} in URL — max 11 chars'}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label className="font-medium">
                            {language === 'ar' ? 'رابط API الرصيد (اختياري)' : 'Balance API URL (optional)'}
                          </Label>
                          <Input
                            value={customSmsBalanceUrl}
                            onChange={e => setCustomSmsBalanceUrl(e.target.value)}
                            placeholder="http://smsurl.com/api/balance.php?user=abc&pass=xyz"
                            dir="ltr"
                            className="font-mono text-xs"
                          />
                          <p className="text-xs text-muted-foreground">
                            {language === 'ar'
                              ? 'رابط لفحص رصيد الرسائل المتبقي (اختياري — يُرجع رقماً)'
                              : 'URL to check remaining balance (optional — returns a number)'}
                          </p>
                        </div>
                      </div>

                      {/* Test SMS for Custom API */}
                      <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                        <div>
                          <p className="font-medium text-sm">{language === 'ar' ? 'إرسال رسالة تجريبية' : 'Send Test Message'}</p>
                          <p className="text-xs text-muted-foreground">{language === 'ar' ? 'تحقق من صحة الرابط بإرسال رسالة تجريبية' : 'Verify your API URL by sending a test message'}</p>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder={language === 'ar' ? 'رقم الهاتف (مثال: 0599999999)' : 'Phone number (e.g. 0599999999)'}
                            value={smsTestPhone}
                            onChange={(e) => { setSmsTestPhone(e.target.value); setSmsTestResult(null); }}
                            className="flex-1"
                            dir="ltr"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 shrink-0"
                            disabled={smsTestLoading || !smsTestPhone.trim() || !customSmsApiUrl.trim()}
                            onClick={async () => {
                              setSmsTestLoading(true);
                              setSmsTestResult(null);
                              try {
                                await sendTestSmsMutation.mutateAsync({ phone: smsTestPhone.trim() });
                                setSmsTestResult({ success: true, message: language === 'ar' ? 'تم الإرسال بنجاح ✅' : 'Sent successfully ✅' });
                              } catch (e: any) {
                                setSmsTestResult({ success: false, message: e.message || (language === 'ar' ? 'فشل الإرسال' : 'Send failed') });
                              } finally {
                                setSmsTestLoading(false);
                              }
                            }}
                          >
                            {smsTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {language === 'ar' ? 'إرسال' : 'Send'}
                          </Button>
                        </div>
                        {smsTestResult && (
                          <div className={`flex items-center gap-2 p-2 rounded text-sm ${
                            smsTestResult.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {smsTestResult.success
                              ? <CheckCircle className="w-4 h-4 shrink-0" />
                              : <AlertCircle className="w-4 h-4 shrink-0" />}
                            {smsTestResult.message}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Balance Check — only for custom account */}
                  {smsProvider === 'custom' && (
                  <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{language === 'ar' ? 'رصيد الرسائل المتبقي' : 'Remaining SMS Balance'}</p>
                        <p className="text-xs text-muted-foreground">
                          {language === 'ar' ? 'رصيد حسابك الخاص في TweetSMS' : 'Your own TweetSMS account balance'}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={smsBalanceLoading}
                        onClick={async () => {
                          setSmsBalanceLoading(true);
                          setSmsBalanceResult(null);
                          try {
                            const result = await utils.notificationChannels.checkSmsBalance.fetch();
                            setSmsBalanceResult(result);
                          } catch (e: any) {
                            setSmsBalanceResult({ success: false, errorMessage: e.message });
                          } finally {
                            setSmsBalanceLoading(false);
                          }
                        }}
                      >
                        {smsBalanceLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <MessageSquare className="w-4 h-4" />
                        )}
                        {language === 'ar' ? 'فحص الرصيد' : 'Check Balance'}
                      </Button>
                    </div>
                    {smsBalanceResult && (
                      <div className={`flex items-center gap-3 p-3 rounded-lg ${
                        smsBalanceResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
                      }`}>
                        {smsBalanceResult.success ? (
                          <>
                            <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                            <div>
                              <p className="font-bold text-lg text-green-500">
                                {smsBalanceResult.balance?.toLocaleString()} {language === 'ar' ? 'رسالة' : 'messages'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {smsBalanceResult.source === 'own'
                                  ? (language === 'ar' ? 'من حسابك الخاص' : 'From your own account')
                                  : (language === 'ar' ? 'من رصيد النظام' : 'From system balance')}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                            <p className="text-sm text-red-500">
                              {smsBalanceResult.errorMessage || (language === 'ar' ? 'فشل الاتصال بالخدمة' : 'Connection failed')}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Test SMS — only for custom account */}
                  {smsProvider === 'custom' && (
                  <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                    <div>
                      <p className="font-medium text-sm">{language === 'ar' ? 'إرسال رسالة تجريبية' : 'Send Test Message'}</p>
                      <p className="text-xs text-muted-foreground">{language === 'ar' ? 'تحقق من صحة إعدادات الاتصال بإرسال رسالة تجريبية' : 'Verify your SMS settings by sending a test message'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder={language === 'ar' ? 'رقم الهاتف (مثال: 0599999999)' : 'Phone number (e.g. 0599999999)'}
                        value={smsTestPhone}
                        onChange={(e) => { setSmsTestPhone(e.target.value); setSmsTestResult(null); }}
                        className="flex-1"
                        dir="ltr"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 shrink-0"
                        disabled={smsTestLoading || !smsTestPhone.trim()}
                        onClick={async () => {
                          setSmsTestLoading(true);
                          setSmsTestResult(null);
                          try {
                            await sendTestSmsMutation.mutateAsync({ phone: smsTestPhone.trim() });
                            setSmsTestResult({ success: true, message: language === 'ar' ? 'تم الإرسال بنجاح ✅' : 'Sent successfully ✅' });
                          } catch (e: any) {
                            setSmsTestResult({ success: false, message: e.message || (language === 'ar' ? 'فشل الإرسال' : 'Send failed') });
                          } finally {
                            setSmsTestLoading(false);
                          }
                        }}
                      >
                        {smsTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {language === 'ar' ? 'إرسال' : 'Send'}
                      </Button>
                    </div>
                    {smsTestResult && (
                      <div className={`flex items-center gap-2 p-2 rounded text-sm ${
                        smsTestResult.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                      }`}>
                        {smsTestResult.success
                          ? <CheckCircle className="w-4 h-4 shrink-0" />
                          : <AlertCircle className="w-4 h-4 shrink-0" />}
                        {smsTestResult.message}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveSmsSettings}
                      disabled={smsLoading}
                      className="gap-2"
                    >
                      {smsLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {language === 'ar' ? 'حفظ الإعدادات' : 'Save Settings'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
        </TabsContent>
      </Tabs>

      {/* Password Reset Dialog */}
      <Dialog open={showPasswordResetDialog} onOpenChange={setShowPasswordResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === "ar" ? "تغيير كلمة المرور" : "Change Password"}
            </DialogTitle>
            <DialogDescription>
              {passwordResetStep === 'request' 
                ? (language === "ar" 
                    ? "سيتم إرسال رمز التحقق إلى بريدك الإلكتروني" 
                    : "A verification code will be sent to your email")
                : (language === "ar" 
                    ? "أدخل رمز التحقق وكلمة المرور الجديدة" 
                    : "Enter the verification code and new password")
              }
            </DialogDescription>
          </DialogHeader>
          
          {passwordResetStep === 'request' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                <Mail className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium">{user?.email}</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPasswordResetDialog(false)}>
                  {language === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button onClick={handleRequestPasswordChange} disabled={passwordResetLoading}>
                  {passwordResetLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {language === "ar" ? "إرسال الرمز" : "Send Code"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{language === "ar" ? "رمز التحقق" : "Verification Code"}</Label>
                <Input 
                  placeholder="123456"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  maxLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === "ar" ? "كلمة المرور الجديدة" : "New Password"}</Label>
                <Input 
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{language === "ar" ? "تأكيد كلمة المرور" : "Confirm Password"}</Label>
                <Input 
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setPasswordResetStep('request');
                  setResetCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}>
                  {language === "ar" ? "رجوع" : "Back"}
                </Button>
                <Button onClick={handleResetPassword} disabled={passwordResetLoading}>
                  {passwordResetLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {language === "ar" ? "تغيير كلمة المرور" : "Change Password"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
