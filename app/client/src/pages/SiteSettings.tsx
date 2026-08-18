import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Upload, Mail, MessageSquare, ShieldCheck, AlertCircle, CreditCard, Building2, Wallet, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/operationFeedback";

export default function SiteSettings() {
  const { data: settings, isLoading, refetch } = trpc.site.getSiteSettings.useQuery();
  const updateMutation = trpc.site.updateSiteSettings.useMutation();

  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync(formData);
      toast.success("تم حفظ الإعدادات بنجاح!");
      refetch();
    } catch (error: any) {
      toast.error(`فشل الحفظ: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">إعدادات الموقع</h1>
          <p className="text-muted-foreground mt-1">
            تحكم كامل في محتوى وعلامة الموقع التجارية
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              جاري الحفظ...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 ml-2" />
              حفظ التغييرات
            </>
          )}
        </Button>
      </div>

      <Tabs defaultValue="branding" dir="rtl">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="branding">العلامة التجارية</TabsTrigger>
          <TabsTrigger value="hero">الصفحة الرئيسية</TabsTrigger>
          <TabsTrigger value="stats">الإحصائيات</TabsTrigger>
          <TabsTrigger value="contact">معلومات الاتصال</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="payment" className="gap-1 text-xs">
            <CreditCard className="w-3 h-3" />
            الدفع
          </TabsTrigger>
          <TabsTrigger value="registration" className="gap-1 text-xs">
            <ShieldCheck className="w-3 h-3" />
            التسجيل
          </TabsTrigger>
          <TabsTrigger value="sms_system" className="gap-1 text-xs">
            <MessageSquare className="w-3 h-3" />
            SMS
          </TabsTrigger>
        </TabsList>

        {/* Branding Tab */}
        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>العلامة التجارية</CardTitle>
              <CardDescription>اسم الموقع، الشعار، والأيقونة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="siteName">اسم الموقع (English)</Label>
                  <Input
                    id="siteName"
                    value={formData.siteName || ""}
                    onChange={(e) => handleChange("siteName", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="siteNameAr">اسم الموقع (العربية)</Label>
                  <Input
                    id="siteNameAr"
                    value={formData.siteNameAr || ""}
                    onChange={(e) => handleChange("siteNameAr", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="tagline">الشعار (English)</Label>
                  <Input
                    id="tagline"
                    value={formData.tagline || ""}
                    onChange={(e) => handleChange("tagline", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="taglineAr">الشعار (العربية)</Label>
                  <Input
                    id="taglineAr"
                    value={formData.taglineAr || ""}
                    onChange={(e) => handleChange("taglineAr", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="logoUrl">رابط الشعار (Logo URL)</Label>
                  <Input
                    id="logoUrl"
                    value={formData.logoUrl || ""}
                    onChange={(e) => handleChange("logoUrl", e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div>
                  <Label htmlFor="faviconUrl">رابط الأيقونة (Favicon URL)</Label>
                  <Input
                    id="faviconUrl"
                    value={formData.faviconUrl || ""}
                    onChange={(e) => handleChange("faviconUrl", e.target.value)}
                    placeholder="https://example.com/favicon.ico"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>معلومات الشركة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="companyName">اسم الشركة (English)</Label>
                  <Input
                    id="companyName"
                    value={formData.companyName || ""}
                    onChange={(e) => handleChange("companyName", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="companyNameAr">اسم الشركة (العربية)</Label>
                  <Input
                    id="companyNameAr"
                    value={formData.companyNameAr || ""}
                    onChange={(e) => handleChange("companyNameAr", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="copyrightText">نص حقوق النشر (English)</Label>
                  <Input
                    id="copyrightText"
                    value={formData.copyrightText || ""}
                    onChange={(e) => handleChange("copyrightText", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="copyrightTextAr">نص حقوق النشر (العربية)</Label>
                  <Input
                    id="copyrightTextAr"
                    value={formData.copyrightTextAr || ""}
                    onChange={(e) => handleChange("copyrightTextAr", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hero Section Tab */}
        <TabsContent value="hero" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>قسم Hero (الصفحة الرئيسية)</CardTitle>
              <CardDescription>العنوان الرئيسي والوصف</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="heroTitle">العنوان الرئيسي (English)</Label>
                  <Input
                    id="heroTitle"
                    value={formData.heroTitle || ""}
                    onChange={(e) => handleChange("heroTitle", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="heroTitleAr">العنوان الرئيسي (العربية)</Label>
                  <Input
                    id="heroTitleAr"
                    value={formData.heroTitleAr || ""}
                    onChange={(e) => handleChange("heroTitleAr", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="heroSubtitle">العنوان الفرعي (English)</Label>
                  <Input
                    id="heroSubtitle"
                    value={formData.heroSubtitle || ""}
                    onChange={(e) => handleChange("heroSubtitle", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="heroSubtitleAr">العنوان الفرعي (العربية)</Label>
                  <Input
                    id="heroSubtitleAr"
                    value={formData.heroSubtitleAr || ""}
                    onChange={(e) => handleChange("heroSubtitleAr", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="heroDescription">الوصف (English)</Label>
                  <Textarea
                    id="heroDescription"
                    value={formData.heroDescription || ""}
                    onChange={(e) => handleChange("heroDescription", e.target.value)}
                    rows={4}
                  />
                </div>
                <div>
                  <Label htmlFor="heroDescriptionAr">الوصف (العربية)</Label>
                  <Textarea
                    id="heroDescriptionAr"
                    value={formData.heroDescriptionAr || ""}
                    onChange={(e) => handleChange("heroDescriptionAr", e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>إحصائيات الصفحة الرئيسية</CardTitle>
              <CardDescription>الأرقام التي تظهر في الصفحة الرئيسية</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="uptimePercent">نسبة التشغيل (Uptime)</Label>
                  <Input
                    id="uptimePercent"
                    value={formData.uptimePercent || ""}
                    onChange={(e) => handleChange("uptimePercent", e.target.value)}
                    placeholder="99.9%"
                  />
                </div>
                <div>
                  <Label htmlFor="activeClients">العملاء النشطون</Label>
                  <Input
                    id="activeClients"
                    value={formData.activeClients || ""}
                    onChange={(e) => handleChange("activeClients", e.target.value)}
                    placeholder="+1000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="managedCards">الكروت المُدارة</Label>
                  <Input
                    id="managedCards"
                    value={formData.managedCards || ""}
                    onChange={(e) => handleChange("managedCards", e.target.value)}
                    placeholder="+50K"
                  />
                </div>
                <div>
                  <Label htmlFor="supportHours">ساعات الدعم</Label>
                  <Input
                    id="supportHours"
                    value={formData.supportHours || ""}
                    onChange={(e) => handleChange("supportHours", e.target.value)}
                    placeholder="24/7"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>إعدادات استيراد الكروت</CardTitle>
              <CardDescription>تحكم في حدود الاستيراد اليومية للعملاء</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clientDailyImportLimit">الحد اليومي للاستيراد (لكل عميل)</Label>
                  <Input
                    id="clientDailyImportLimit"
                    type="number"
                    min="0"
                    value={formData.clientDailyImportLimit ?? 0}
                    onChange={(e) => handleChange("clientDailyImportLimit", e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground mt-1">أقصى عدد كروت يستطيع العميل استيرادها يومياً. 0 = بلا حد.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact Tab */}
        <TabsContent value="contact" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>معلومات الاتصال</CardTitle>
              <CardDescription>البريد الإلكتروني، الهاتف، ووسائل التواصل</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="supportEmail">البريد الإلكتروني للدعم</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={formData.supportEmail || ""}
                    onChange={(e) => handleChange("supportEmail", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="supportPhone">رقم الهاتف</Label>
                  <Input
                    id="supportPhone"
                    value={formData.supportPhone || ""}
                    onChange={(e) => handleChange("supportPhone", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="whatsappNumber">رقم WhatsApp (لزر تواصل معنا)</Label>
                  <Input
                    id="whatsappNumber"
                    placeholder="مثال: 970568329324"
                    value={formData.whatsappNumber || ""}
                    onChange={(e) => handleChange("whatsappNumber", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">أدخل الرقم بدون رمز + أو مسافات (مثال: 970568329324)</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="supportHoursText">ساعات العمل (English)</Label>
                  <Input
                    id="supportHoursText"
                    value={formData.supportHoursText || ""}
                    onChange={(e) => handleChange("supportHoursText", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="supportHoursTextAr">ساعات العمل (العربية)</Label>
                  <Input
                    id="supportHoursTextAr"
                    value={formData.supportHoursTextAr || ""}
                    onChange={(e) => handleChange("supportHoursTextAr", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>وسائل التواصل الاجتماعي</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="Facebook URL"
                    value={formData.facebookUrl || ""}
                    onChange={(e) => handleChange("facebookUrl", e.target.value)}
                  />
                  <Input
                    placeholder="Twitter URL"
                    value={formData.twitterUrl || ""}
                    onChange={(e) => handleChange("twitterUrl", e.target.value)}
                  />
                  <Input
                    placeholder="LinkedIn URL"
                    value={formData.linkedinUrl || ""}
                    onChange={(e) => handleChange("linkedinUrl", e.target.value)}
                  />
                  <Input
                    placeholder="Instagram URL"
                    value={formData.instagramUrl || ""}
                    onChange={(e) => handleChange("instagramUrl", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEO Tab */}
        <TabsContent value="seo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>إعدادات SEO</CardTitle>
              <CardDescription>تحسين محركات البحث</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="metaTitle">عنوان الصفحة (English)</Label>
                  <Input
                    id="metaTitle"
                    value={formData.metaTitle || ""}
                    onChange={(e) => handleChange("metaTitle", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="metaTitleAr">عنوان الصفحة (العربية)</Label>
                  <Input
                    id="metaTitleAr"
                    value={formData.metaTitleAr || ""}
                    onChange={(e) => handleChange("metaTitleAr", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="metaDescription">الوصف (English)</Label>
                  <Textarea
                    id="metaDescription"
                    value={formData.metaDescription || ""}
                    onChange={(e) => handleChange("metaDescription", e.target.value)}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="metaDescriptionAr">الوصف (العربية)</Label>
                  <Textarea
                    id="metaDescriptionAr"
                    value={formData.metaDescriptionAr || ""}
                    onChange={(e) => handleChange("metaDescriptionAr", e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="metaKeywords">الكلمات المفتاحية</Label>
                <Textarea
                  id="metaKeywords"
                  value={formData.metaKeywords || ""}
                  onChange={(e) => handleChange("metaKeywords", e.target.value)}
                  rows={2}
                  placeholder="radius, internet, management, saas"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Registration & Verification Tab */}
        <TabsContent value="registration" className="space-y-4">
          <VerificationSettingsPanel />
        </TabsContent>

        {/* Payment Settings Tab */}
        <TabsContent value="payment" className="space-y-4">
          <PaymentSettingsPanel />
        </TabsContent>

        {/* SMS System Credentials Tab - for owner/super_admin */}
        <TabsContent value="sms_system" className="space-y-4">
          <SmsSystemPanel />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end mt-6">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              جاري الحفظ...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 ml-2" />
              حفظ جميع التغييرات
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// PAYMENT SETTINGS PANEL
// ============================================================================
function PaymentSettingsPanel() {
  const { data: paySettings, isLoading: payLoading, refetch: payRefetch } =
    trpc.site.getPaymentSettings.useQuery();

  const updatePayMutation = trpc.site.updatePaymentSettings.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ إعدادات الدفع بنجاح");
      payRefetch();
    },
    onError: (err) => toast.error(`فشل الحفظ: ${err.message}`),
  });

  const [bankEnabled, setBankEnabled] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<Array<{
    id: string; bankName: string; accountNumber: string;
    iban: string; phone: string; accountHolder: string; qrCode?: string;
  }>>([])
  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [paypalLink, setPaypalLink] = useState("");
  const [palpayEnabled, setPalpayEnabled] = useState(false);
  const [palpayPhone, setPalpayPhone] = useState("");
  const [palpayAccountName, setPalpayAccountName] = useState("");
  const [palpayNote, setPalpayNote] = useState("");
  const [palpayQr, setPalpayQr] = useState("");

  useEffect(() => {
    if (paySettings) {
      setBankEnabled(paySettings.bankEnabled);
      setBankAccounts((paySettings.bankAccounts as any) || []);
      setPaypalEnabled(paySettings.paypalEnabled);
      setPaypalEmail(paySettings.paypalEmail);
      setPaypalLink(paySettings.paypalLink);
      setPalpayEnabled(paySettings.palpayEnabled);
      setPalpayPhone(paySettings.palpayPhone);
      setPalpayAccountName(paySettings.palpayAccountName);
      setPalpayNote(paySettings.palpayNote);
      setPalpayQr((paySettings as any).palpayQr || "");
    }
  }, [paySettings]);

  const addBankAccount = () => {
    setBankAccounts(prev => [...prev, {
      id: Date.now().toString(),
      bankName: "", accountNumber: "", iban: "", phone: "", accountHolder: "", qrCode: ""
    }]);
  };

  const removeBankAccount = (id: string) => {
    setBankAccounts(prev => prev.filter(a => a.id !== id));
  };

  const updateBankAccount = (id: string, field: string, value: string) => {
    setBankAccounts(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleSave = () => {
    updatePayMutation.mutate({
      bankEnabled,
      bankAccounts,
      paypalEnabled,
      paypalEmail,
      paypalLink,
      palpayEnabled,
      palpayPhone,
      palpayAccountName,
      palpayNote,
      palpayQr,
    });
  };

  if (payLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info Card */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">إدارة طرق الدفع</p>
              <p>فعّل أو عطّل طرق الدفع التي تريد عرضها للمشتركين عند طلب إضافة رصيد. ستظهر فقط الطرق المفعّلة في معالج الدفع.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank Transfer */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden border border-border flex items-center justify-center bg-white">
                <img src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030608704/JYruXSQahvP3cr6rPdjNhA/bank-of-palestine_659b8fc7.png" alt="بنك فلسطين" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <CardTitle className="text-base">التحويل البنكي</CardTitle>
                <CardDescription>دفع مباشر عبر بنك فلسطين مع رفع إيصال الدفع</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={bankEnabled ? "default" : "secondary"}>
                {bankEnabled ? "مفعّل" : "معطّل"}
              </Badge>
              <Switch checked={bankEnabled} onCheckedChange={setBankEnabled} />
            </div>
          </div>
        </CardHeader>
        {bankEnabled && (
          <CardContent className="space-y-4">
            {bankAccounts.map((acc, idx) => (
              <div key={acc.id} className="border rounded-lg p-4 space-y-3 relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-muted-foreground">حساب {idx + 1}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBankAccount(acc.id)}
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">اسم البنك</Label>
                    <Input
                      value={acc.bankName}
                      onChange={e => updateBankAccount(acc.id, "bankName", e.target.value)}
                      placeholder="مثال: بنك فلسطين"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">اسم صاحب الحساب</Label>
                    <Input
                      value={acc.accountHolder}
                      onChange={e => updateBankAccount(acc.id, "accountHolder", e.target.value)}
                      placeholder="الاسم الكامل"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">رقم الحساب</Label>
                    <Input
                      value={acc.accountNumber}
                      onChange={e => updateBankAccount(acc.id, "accountNumber", e.target.value)}
                      placeholder="0000-0000-0000-0000"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">IBAN (اختياري)</Label>
                    <Input
                      value={acc.iban}
                      onChange={e => updateBankAccount(acc.id, "iban", e.target.value)}
                      placeholder="PS00XXXX..."
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">رقم الجوال (للتحويل الفوري)</Label>
                    <Input
                      value={acc.phone}
                      onChange={e => updateBankAccount(acc.id, "phone", e.target.value)}
                      placeholder="05XXXXXXXX"
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">رابط QR Code للدفع (اختياري)</Label>
                    <Input
                      value={acc.qrCode || ""}
                      onChange={e => updateBankAccount(acc.id, "qrCode", e.target.value)}
                      placeholder="https://... أو أدخل رابط صورة QR Code"
                      className="mt-1"
                    />
                    {acc.qrCode && (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={acc.qrCode} alt="QR Code" className="w-20 h-20 rounded border object-contain bg-white p-1" onError={e => (e.currentTarget.style.display = 'none')} />
                        <span className="text-xs text-muted-foreground">معاينة QR Code</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addBankAccount} className="gap-2 w-full">
              <Plus className="w-4 h-4" />
              إضافة حساب بنكي
            </Button>
          </CardContent>
        )}
      </Card>

      {/* PalPay */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden border border-border flex items-center justify-center">
                <img src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030608704/JYruXSQahvP3cr6rPdjNhA/palpay-logo_05a062e3.png" alt="PalPay" className="w-12 h-12 object-cover" />
              </div>
              <div>
                <CardTitle className="text-base">PalPay</CardTitle>
                <CardDescription>محفظة PalPay الإلكترونية الفلسطينية</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={palpayEnabled ? "default" : "secondary"}>
                {palpayEnabled ? "مفعّل" : "معطّل"}
              </Badge>
              <Switch checked={palpayEnabled} onCheckedChange={setPalpayEnabled} />
            </div>
          </div>
        </CardHeader>
        {palpayEnabled && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">رقم هاتف PalPay</Label>
                <Input
                  value={palpayPhone}
                  onChange={e => setPalpayPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">اسم صاحب الحساب</Label>
                <Input
                  value={palpayAccountName}
                  onChange={e => setPalpayAccountName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">ملاحظة إضافية (اختياري)</Label>
              <Input
                value={palpayNote}
                onChange={e => setPalpayNote(e.target.value)}
                placeholder="مثال: أرسل اسمك ورقم اشتراكك في تعليق التحويل"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">رابط QR Code لـ PalPay (اختياري)</Label>
              <Input
                value={palpayQr}
                onChange={e => setPalpayQr(e.target.value)}
                placeholder="https://... رابط صورة QR Code الخاص بحسابك"
                className="mt-1"
              />
              {palpayQr && (
                <div className="mt-2 flex items-center gap-2">
                  <img src={palpayQr} alt="QR Code PalPay" className="w-20 h-20 rounded border object-contain bg-white p-1" onError={e => (e.currentTarget.style.display = 'none')} />
                  <span className="text-xs text-muted-foreground">معاينة QR Code</span>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* PayPal */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <CardTitle className="text-base">PayPal</CardTitle>
                <CardDescription>\u062f\u0641\u0639 \u0639\u0628\u0631 PayPal \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u062f\u0648\u0644\u064a\u064a\u0646</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={paypalEnabled ? "default" : "secondary"}>
                {paypalEnabled ? "\u0645\u0641\u0639\u0651\u0644" : "\u0645\u0639\u0637\u0651\u0644"}
              </Badge>
              <Switch checked={paypalEnabled} onCheckedChange={setPaypalEnabled} />
            </div>
          </div>
        </CardHeader>
        {paypalEnabled && (
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">\u0628\u0631\u064a\u062f PayPal \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a</Label>
              <Input
                value={paypalEmail}
                onChange={e => setPaypalEmail(e.target.value)}
                placeholder="example@paypal.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">\u0631\u0627\u0628\u0637 \u0627\u0644\u062f\u0641\u0639 (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)</Label>
              <Input
                value={paypalLink}
                onChange={e => setPaypalLink(e.target.value)}
                placeholder="https://paypal.me/yourname"
                className="mt-1"
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updatePayMutation.isPending}
          className="gap-2"
        >
          {updatePayMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          \u062d\u0641\u0638 \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u062f\u0641\u0639
        </Button>
      </div>
    </div>
  );
}

// VERIFICATION SETTINGS PANEL
// ============================================================================
function VerificationSettingsPanel() {
  const { data: verSettings, isLoading: verLoading, refetch: verRefetch } =
    trpc.site.getVerificationSettings.useQuery();

  const updateVerMutation = trpc.site.updateVerificationSettings.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ إعدادات التحقق بنجاح");
      verRefetch();
    },
    onError: (err) => toast.error(`فشل الحفظ: ${err.message}`),
  });

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [method, setMethod] = useState<"email" | "sms" | "both">("email");

  useEffect(() => {
    if (verSettings) {
      setEmailEnabled(verSettings.emailEnabled);
      setSmsEnabled(verSettings.smsEnabled);
      setMethod(verSettings.verificationMethod);
    }
  }, [verSettings]);

  const handleSave = () => {
    // Validation: at least one channel must be active
    if (!emailEnabled && !smsEnabled) {
      toast.error("يجب تفعيل قناة واحدة على الأقل (إيميل أو SMS)");
      return;
    }
    // Auto-fix method if it conflicts with enabled channels
    let finalMethod = method;
    if (method === "sms" && !smsEnabled) finalMethod = "email";
    if (method === "email" && !emailEnabled) finalMethod = "sms";

    updateVerMutation.mutate({
      emailEnabled,
      smsEnabled,
      verificationMethod: finalMethod,
    });
  };

  if (verLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Explanation Card */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">كيف يعمل التحقق عند التسجيل؟</p>
              <p>عند تسجيل مستخدم جديد، يتلقى كوداً مكوناً من 6 أرقام لتأكيد هويته قبل تفعيل الحساب.</p>
              <p>يمكنك اختيار إرسال هذا الكود عبر <strong>البريد الإلكتروني</strong> أو <strong>رسالة SMS</strong> أو <strong>كليهما معاً</strong>.</p>
              <p className="text-yellow-500">⚠️ لإرسال SMS يجب أن يكون TweetSMS مُفعّلاً ومُعدّاً في إعدادات SMS.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Channel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">التحقق عبر البريد الإلكتروني</CardTitle>
                <CardDescription>إرسال كود التحقق إلى بريد المستخدم الإلكتروني</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={emailEnabled ? "default" : "secondary"}>
                {emailEnabled ? "مفعّل" : "معطّل"}
              </Badge>
              <Switch
                checked={emailEnabled}
                onCheckedChange={setEmailEnabled}
              />
            </div>
          </div>
        </CardHeader>
        {emailEnabled && (
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
              <p>✅ الكود يُرسل تلقائياً عبر SMTP المُعدّ في إعدادات البريد الإلكتروني.</p>
              <p className="mt-1">المدة: الكود صالح لمدة <strong>15 دقيقة</strong>.</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* SMS Channel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base">التحقق عبر SMS</CardTitle>
                <CardDescription>إرسال كود التحقق كرسالة نصية على هاتف المستخدم</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={smsEnabled ? "default" : "secondary"}>
                {smsEnabled ? "مفعّل" : "معطّل"}
              </Badge>
              <Switch
                checked={smsEnabled}
                onCheckedChange={setSmsEnabled}
              />
            </div>
          </div>
        </CardHeader>
        {smsEnabled && (
          <CardContent className="pt-0">
            <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
              <p>✅ الكود يُرسل عبر TweetSMS على رقم هاتف المستخدم المُدخل في نموذج التسجيل.</p>
              <p className="mt-1">⚠️ إذا لم يُدخل المستخدم رقم هاتفه، سيُرسل الكود عبر الإيميل كبديل.</p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Method Selection */}
      {emailEnabled && smsEnabled && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">طريقة الإرسال عند تفعيل القناتين</CardTitle>
            <CardDescription>اختر كيف يُرسل الكود عندما يكون كلاهما مفعّلاً</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "email", label: "إيميل فقط", icon: "📧", desc: "يُرسل الكود فقط عبر البريد الإلكتروني" },
                { value: "sms", label: "SMS فقط", icon: "📱", desc: "يُرسل الكود فقط عبر رسالة نصية" },
                { value: "both", label: "كلاهما", icon: "📧📱", desc: "يُرسل الكود عبر الإيميل والرسالة معاً" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMethod(opt.value as "email" | "sms" | "both")}
                  className={`p-4 rounded-lg border-2 text-right transition-all ${
                    method === opt.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="text-2xl mb-2">{opt.icon}</div>
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateVerMutation.isPending}
          className="gap-2"
        >
          {updateVerMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          حفظ إعدادات التحقق
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// SMS System Panel — إعدادات SMS الرئيسية للنظام (owner فقط)
// ============================================================
function SmsSystemPanel() {
  const { data: smsData, refetch: refetchSms } = trpc.notificationChannels.getChannelSettings.useQuery({ channel: 'sms' });
  const saveMutation = trpc.notificationChannels.saveChannelSettings.useMutation({
    onSuccess: () => { toast.success("تم حفظ إعدادات SMS بنجاح"); refetchSms(); },
    onError: (err) => toast.error(`فشل الحفظ: ${err.message}`),
  });

  const [smsUsername, setSmsUsername] = useState('');
  const [smsPassword, setSmsPassword] = useState('');
  const [smsSenderName, setSmsSenderName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (smsData?.settings) {
      const s = smsData.settings as any;
      if (s.smsApiKey) {
        const parts = s.smsApiKey.split(':');
        setSmsUsername(parts[0] || '');
        setSmsPassword(parts.slice(1).join(':') || '');
      }
      setSmsSenderName(s.smsSender || '');
    }
  }, [smsData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMutation.mutateAsync({
        channel: 'sms',
        enabled: true,
        smsApiKey: smsUsername ? `${smsUsername}:${smsPassword}` : '',
        smsSender: smsSenderName || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            إعدادات SMS الرئيسية للنظام
          </CardTitle>
          <CardDescription>
            بيانات حساب TweetSMS الرئيسي — يُستخدم لإرسال الرسائل لجميع العملاء الذين اختاروا "من النظام"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>اسم المستخدم (TweetSMS)</Label>
              <Input
                value={smsUsername}
                onChange={e => setSmsUsername(e.target.value)}
                placeholder="TweetSMS username"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
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
            <Label>اسم المُرسِل (Sender Name)</Label>
            <Input
              value={smsSenderName}
              onChange={e => setSmsSenderName(e.target.value)}
              placeholder="مثال: RadiusPro"
              dir="ltr"
              maxLength={11}
            />
            <p className="text-xs text-muted-foreground">الحد الأقصى 11 حرف — يظهر كاسم المُرسِل في رسائل العملاء الذين يستخدمون النظام</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ الإعدادات
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
