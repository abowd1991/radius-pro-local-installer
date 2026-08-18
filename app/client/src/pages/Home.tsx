import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import {
  Wifi,
  Users,
  CreditCard,
  Shield,
  Globe,
  BarChart3,
  ArrowRight,
  Check,
  MessageCircle,
  Facebook,
  Twitter,
  Linkedin,
  Instagram,
} from "lucide-react";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // جلب كل بيانات الصفحة من قاعدة البيانات (site_settings)
  const { data: site } = trpc.site.getPublicSiteSettings.useQuery();
  // جلب خطط الأسعار من قاعدة البيانات
  const { data: subscriptionPlans } = trpc.site.listSubscriptionPlans.useQuery();

  // Redirect to dashboard if authenticated
  useEffect(() => {
    if (isAuthenticated && !loading) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, loading, setLocation]);

  const features = [
    {
      icon: Wifi,
      title: "تكامل MikroTik",
      description: "تكامل كامل مع أجهزة MikroTik عبر RADIUS للتحكم في PPPoE/PPTP",
    },
    {
      icon: Users,
      title: "إدارة متعددة المستويات",
      description: "لوحات تحكم منفصلة للمشرفين والموزعين والعملاء",
    },
    {
      icon: CreditCard,
      title: "نظام الكروت",
      description: "إنشاء وإدارة كروت الشحن مع طباعة PDF",
    },
    {
      icon: Shield,
      title: "أمان متقدم",
      description: "مصادقة JWT وتشفير كامل للبيانات",
    },
    {
      icon: Globe,
      title: "بوابات دفع متعددة",
      description: "دعم PayPal و Stripe وبنك فلسطين",
    },
    {
      icon: BarChart3,
      title: "تقارير وإحصائيات",
      description: "تقارير مفصلة عن الاستخدام والإيرادات",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // القيم الافتراضية إذا لم تُحمَّل البيانات بعد
  const siteName = site?.siteNameAr || site?.siteName || "Radius Pro";
  const heroTitle = site?.heroTitleAr || site?.heroTitle || "منصة إدارة خدمات الإنترنت المتكاملة";
  const heroSubtitle = site?.heroSubtitleAr || site?.heroSubtitle || "نظام RADIUS SaaS متكامل لإدارة مزودي خدمات الإنترنت مع تكامل كامل مع MikroTik، نظام محاسبة متقدم، وبوابات دفع إلكتروني متعددة.";
  const heroDescription = site?.heroDescriptionAr || site?.heroDescription || heroSubtitle;
  const companyName = site?.companyNameAr || site?.companyName || "Radius Pro";
  const copyrightText = site?.copyrightTextAr || site?.copyrightText || `© ${new Date().getFullYear()} ${companyName}. جميع الحقوق محفوظة.`;
  const uptimePercent = site?.uptimePercent || "99.9%";
  const activeClients = site?.activeClients || "+1000";
  const managedCards = site?.managedCards || "+50K";
  const supportHours = site?.supportHours || "24/7";
  const whatsappNum = site?.whatsappNumber || site?.supportPhone;

  // خطط الأسعار: من قاعدة البيانات أو fallback
  const plans = subscriptionPlans && subscriptionPlans.length > 0
    ? subscriptionPlans.filter((p: any) => p.isActive)
    : [
        {
          id: 0,
          nameAr: "اشتراك شهري",
          name: "Monthly Plan",
          price: "15",
          currency: "USD",
          billingPeriod: "monthly",
          isPopular: true,
          featuresAr: [
            "كروت غير محدودة",
            "أجهزة NAS غير محدودة",
            "تقارير متقدمة وتصدير",
            "دعم فني على مدار الساعة",
            "نسخ احتياطي يومي",
            "نظام الموزعين",
            "API كامل للتكامل",
            "تخصيص كامل",
          ],
          features: [],
        },
      ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30" dir="rtl">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            {site?.logoUrl ? (
              <img src={site.logoUrl} alt={siteName} className="h-10 w-auto object-contain" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Wifi className="h-6 w-6 text-primary-foreground" />
              </div>
            )}
            <span className="text-xl font-bold">{siteName}</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium hover:text-primary transition-colors">
              المميزات
            </a>
            <a href="#pricing" className="text-sm font-medium hover:text-primary transition-colors">
              الأسعار
            </a>
            <a href="#contact" className="text-sm font-medium hover:text-primary transition-colors">
              تواصل معنا
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <a href="/auth">تسجيل الدخول</a>
            </Button>
            <Button asChild>
              <a href="/auth">ابدأ الآن</a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              {heroTitle}
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              {heroDescription}
            </p>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{uptimePercent}</div>
                <div className="text-sm text-muted-foreground mt-1">وقت التشغيل</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{activeClients}</div>
                <div className="text-sm text-muted-foreground mt-1">عميل نشط</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{managedCards}</div>
                <div className="text-sm text-muted-foreground mt-1">كرت مُدار</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{supportHours}</div>
                <div className="text-sm text-muted-foreground mt-1">دعم فني</div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <a href="/auth">
                  ابدأ تجربتك المجانية
                  <ArrowRight className="mr-2 h-5 w-5" />
                </a>
              </Button>
              {whatsappNum && (
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/20 hover:text-green-700"
                  onClick={() => {
                    const num = whatsappNum.replace(/[^0-9]/g, "");
                    window.open(`https://wa.me/${num}?text=${encodeURIComponent("مرحباً، أريد الاستفسار عن خدمات " + siteName)}`, "_blank");
                  }}
                >
                  <MessageCircle className="h-5 w-5" />
                  تواصل عبر واتساب
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-muted/50">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">مميزات المنصة</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              كل ما تحتاجه لإدارة خدمات الإنترنت في مكان واحد
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">خطط الأسعار</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              اختر الخطة المناسبة لحجم عملك
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 max-w-4xl mx-auto">
            {plans.map((plan: any, index: number) => {
              const planName = plan.nameAr || plan.name;
              const planFeatures: string[] = Array.isArray(plan.featuresAr) && plan.featuresAr.length > 0
                ? plan.featuresAr
                : Array.isArray(plan.features) ? plan.features : [];
              const periodLabel = plan.billingPeriod === "yearly" ? "/سنوياً"
                : plan.billingPeriod === "semi_annual" ? "/نصف سنوي"
                : "/شهرياً";
              const priceDisplay = `${plan.price} ${plan.currency === "USD" ? "$" : plan.currency}`;
              return (
                <Card
                  key={plan.id || index}
                  className={`relative w-full max-w-sm ${plan.isPopular ? "border-primary shadow-lg" : ""}`}
                >
                  {plan.isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                        الأكثر شعبية
                      </span>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle>{planName}</CardTitle>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">{priceDisplay}</span>
                      <span className="text-muted-foreground">{periodLabel}</span>
                    </div>
                    {(plan.descriptionAr || plan.description) && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {plan.descriptionAr || plan.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 mb-6">
                      {planFeatures.map((feature: string, i: number) => (
                        <li key={i} className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2">
                      <Button className="flex-1" variant="default" asChild>
                        <a href="/auth">ابدأ الآن</a>
                      </Button>
                      {whatsappNum && (
                        <Button
                          variant="outline"
                          className="flex-1 gap-2 bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/20 hover:text-green-700"
                          onClick={() => {
                            const num = whatsappNum.replace(/[^0-9]/g, "");
                            window.open(`https://wa.me/${num}?text=${encodeURIComponent("مرحباً، أريد الاستفسار عن خدمات " + siteName)}`, "_blank");
                          }}
                        >
                          <MessageCircle className="h-4 w-4" />
                          تواصل
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container text-center">
          <h2 className="text-3xl font-bold mb-4">جاهز للبدء؟</h2>
          <p className="text-primary-foreground/80 max-w-2xl mx-auto mb-8">
            انضم إلى مئات مزودي خدمات الإنترنت الذين يستخدمون منصتنا لإدارة أعمالهم بكفاءة
          </p>
          <Button size="lg" variant="secondary" asChild>
            <a href="/auth">
              ابدأ الآن مجاناً
              <ArrowRight className="mr-2 h-5 w-5" />
            </a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="border-t py-12">
        <div className="container">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-4">
                {site?.logoUrl ? (
                  <img src={site.logoUrl} alt={siteName} className="h-8 w-auto object-contain" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                    <Wifi className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                <span className="font-bold">{siteName}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {site?.taglineAr || site?.tagline || "منصة متكاملة لإدارة خدمات الإنترنت ومزودي الخدمة"}
              </p>
              {/* Social Media Links */}
              <div className="flex gap-3 mt-4">
                {site?.facebookUrl && (
                  <a href={site.facebookUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Facebook className="h-5 w-5" />
                  </a>
                )}
                {site?.twitterUrl && (
                  <a href={site.twitterUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Twitter className="h-5 w-5" />
                  </a>
                )}
                {site?.linkedinUrl && (
                  <a href={site.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Linkedin className="h-5 w-5" />
                  </a>
                )}
                {site?.instagramUrl && (
                  <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Instagram className="h-5 w-5" />
                  </a>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4">المنتج</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground">المميزات</a></li>
                <li><a href="#pricing" className="hover:text-foreground">الأسعار</a></li>
                <li><a href="#" className="hover:text-foreground">التوثيق</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">الشركة</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">من نحن</a></li>
                <li><a href="#" className="hover:text-foreground">تواصل معنا</a></li>
                <li><a href="#" className="hover:text-foreground">الشركاء</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">التواصل</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {site?.supportEmail && (
                  <li>
                    <a href={`mailto:${site.supportEmail}`} className="hover:text-foreground">
                      {site.supportEmail}
                    </a>
                  </li>
                )}
                {site?.supportPhone && (
                  <li>
                    <a href={`tel:${site.supportPhone}`} className="hover:text-foreground">
                      {site.supportPhone}
                    </a>
                  </li>
                )}
                {site?.supportHoursTextAr || site?.supportHoursText ? (
                  <li>{site.supportHoursTextAr || site.supportHoursText}</li>
                ) : null}
                {whatsappNum && (
                  <li>
                    <button
                      className="hover:text-foreground flex items-center gap-1"
                      onClick={() => {
                        const num = whatsappNum.replace(/[^0-9]/g, "");
                        window.open(`https://wa.me/${num}`, "_blank");
                      }}
                    >
                      <MessageCircle className="h-4 w-4 text-green-500" />
                      واتساب
                    </button>
                  </li>
                )}
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            {copyrightText}
          </div>
        </div>
      </footer>
    </div>
  );
}
