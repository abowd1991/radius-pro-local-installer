import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import {
  CreditCard,
  Server,
  Users,
  Shield,
  BarChart3,
  Zap,
  Globe,
  Layers,
  Check,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  ChevronDown,
  Wifi,
  Clock,
  Settings,
  Lock,
} from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading } = useAuth();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, loading, setLocation]);
  
  // Fetch site settings and subscription plans from database
  const { data: siteSettings } = trpc.site.getSiteSettings.useQuery();
  const { data: subscriptionPlans, isLoading: plansLoading } = trpc.site.listSubscriptionPlans.useQuery();
  const { data: dbPlans } = trpc.saasPlans.getAll.useQuery();
  const { data: contactData } = trpc.site.getPublicContact.useQuery();

  const features = [
    {
      icon: <CreditCard className="h-8 w-8" />,
      title: "إدارة كروت الإنترنت",
      description: "إنشاء وإدارة كروت بالساعات أو الأيام أو الرصيد مع طباعة PDF احترافية",
    },
    {
      icon: <Server className="h-8 w-8" />,
      title: "تكامل MikroTik",
      description: "اتصال مباشر مع أجهزة MikroTik عبر API مع دعم RADIUS الكامل",
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "Multi-Tenant",
      description: "فصل كامل بين العملاء - كل عميل يرى بياناته فقط",
    },
    {
      icon: <Zap className="h-8 w-8" />,
      title: "قطع تلقائي للجلسات",
      description: "قطع الجلسات تلقائياً عند انتهاء الوقت مع Accounting دقيق",
    },
    {
      icon: <BarChart3 className="h-8 w-8" />,
      title: "تقارير وإحصائيات",
      description: "تقارير مفصلة للإيرادات والمشتركين والجلسات مع تصدير Excel/PDF",
    },
    {
      icon: <Settings className="h-8 w-8" />,
      title: "لوحة تحكم حديثة",
      description: "واجهة سهلة الاستخدام بتصميم عصري يدعم العربية بالكامل",
    },
    {
      icon: <Globe className="h-8 w-8" />,
      title: "دعم VPN",
      description: "دعم اتصالات PPTP و SSTP للوصول عن بُعد لأجهزة NAS",
    },
    {
      icon: <Layers className="h-8 w-8" />,
      title: "نظام SaaS جاهز",
      description: "جاهز للعمل كمنصة SaaS مع اشتراكات وفترات تجريبية",
    },
  ];

  const steps = [
    {
      number: "1",
      title: "سجّل حسابك",
      description: "أنشئ حسابك مجاناً واحصل على فترة تجريبية كاملة",
      icon: <Users className="h-6 w-6" />,
    },
    {
      number: "2",
      title: "أضف أجهزة NAS",
      description: "أضف أجهزة MikroTik الخاصة بك واربطها بالنظام",
      icon: <Server className="h-6 w-6" />,
    },
    {
      number: "3",
      title: "أنشئ الباقات والكروت",
      description: "حدد الباقات والأسعار وابدأ بإنشاء كروت الإنترنت",
      icon: <CreditCard className="h-6 w-6" />,
    },
    {
      number: "4",
      title: "ابدأ البيع",
      description: "وزّع الكروت على عملائك وتابع الإيرادات من لوحة التحكم",
      icon: <BarChart3 className="h-6 w-6" />,
    },
  ];

  // Fallback static plans (used when DB plans not available)
  const staticPlans = [
    {
      name: "أساسي",
      price: "49",
      period: "شهرياً",
      description: "مثالي للشبكات الصغيرة",
      features: [
        "حتى 100 كرت نشط",
        "جهاز NAS واحد",
        "تقارير أساسية",
        "دعم بريد إلكتروني",
        "نسخ احتياطي يومي",
      ],
      popular: false,
    },
    {
      name: "احترافي",
      price: "99",
      period: "شهرياً",
      description: "للشبكات المتوسطة والكبيرة",
      features: [
        "حتى 500 كرت نشط",
        "حتى 5 أجهزة NAS",
        "تقارير متقدمة + تصدير",
        "دعم أولوية",
        "نسخ احتياطي + استعادة",
        "API للتكامل",
        "موزعين غير محدودين",
      ],
      popular: true,
    },
    {
      name: "مؤسسي",
      price: "199",
      period: "شهرياً",
      description: "للمؤسسات والشركات الكبرى",
      features: [
        "كروت غير محدودة",
        "أجهزة NAS غير محدودة",
        "جميع التقارير والتحليلات",
        "دعم 24/7",
        "تخصيص كامل",
        "API متقدم",
        "مدير حساب مخصص",
        "تدريب فريق العمل",
      ],
      popular: false,
    },
  ];

  // Use subscription_plans from database, fallback to old dbPlans
  const plans = subscriptionPlans && subscriptionPlans.length > 0 
    ? subscriptionPlans
        .filter((p: any) => p.isActive)
        .sort((a: any, b: any) => a.displayOrder - b.displayOrder)
        .map((plan: any) => ({
          name: plan.nameAr || plan.name,
          price: plan.price.toString(),
          period: plan.billingPeriod === 'monthly' ? 'شهرياً' : 'سنوياً',
          description: plan.descriptionAr || plan.description,
          features: Array.isArray(plan.featuresAr) ? plan.featuresAr : [],
          popular: plan.isPopular,
        }))
    : dbPlans && dbPlans.length > 0 ? dbPlans.map((plan: any, index: number) => {
        const features = [];
        if (plan.maxCards !== null) features.push(`حتى ${plan.maxCards} كرت نشط`);
        else features.push("كروت غير محدودة");
        if (plan.maxNas !== null) features.push(`حتى ${plan.maxNas} جهاز NAS`);
        else features.push("أجهزة NAS غير محدودة");
        if (plan.maxSubscribers !== null) features.push(`حتى ${plan.maxSubscribers} مشترك`);
        else features.push("مشتركين غير محدودين");
        if (plan.hasApi) features.push("API للتكامل");
        if (plan.hasCoa) features.push("دعم CoA/Disconnect");
        if (plan.hasVpn) features.push("دعم VPN");
        if (plan.hasAdvancedReports) features.push("تقارير متقدمة");
        
        return {
          name: plan.name,
          price: plan.priceMonthly?.toString() || "0",
          period: "شهرياً",
          description: plan.description || "",
          features,
          popular: index === 1, // Middle plan is popular
        };
  }) : staticPlans;

  const faqs = [
    {
      question: "ما هو Radius Pro؟",
      answer: "Radius Pro هو نظام SaaS متكامل لإدارة شبكات الإنترنت وكروت الاشتراكات. يعمل مع أجهزة MikroTik ويوفر حلاً كاملاً لإدارة المستخدمين والفوترة والتقارير.",
    },
    {
      question: "هل يعمل مع جميع أجهزة MikroTik؟",
      answer: "نعم، يعمل Radius Pro مع جميع أجهزة MikroTik التي تدعم RADIUS. يمكنك الاتصال عبر IP عام أو من خلال VPN (PPTP/SSTP).",
    },
    {
      question: "هل يمكنني تجربة النظام قبل الاشتراك؟",
      answer: "بالتأكيد! نوفر فترة تجريبية مجانية لمدة 14 يوماً بجميع الميزات. لا نطلب بطاقة ائتمان للتجربة.",
    },
    {
      question: "كيف يتم حساب عدد الكروت؟",
      answer: "يتم احتساب الكروت النشطة فقط (غير المستخدمة أو قيد الاستخدام). الكروت المنتهية أو الملغاة لا تُحتسب من الحد.",
    },
    {
      question: "هل بياناتي آمنة؟",
      answer: "نعم، نستخدم تشفير SSL/TLS لجميع الاتصالات، ونسخ احتياطي يومي تلقائي، وفصل كامل للبيانات بين العملاء.",
    },
    {
      question: "هل يمكنني إلغاء الاشتراك في أي وقت؟",
      answer: "نعم، يمكنك إلغاء اشتراكك في أي وقت. لا توجد عقود طويلة الأمد أو رسوم إلغاء.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white" dir="rtl">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Wifi className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Radius Pro
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-slate-300 hover:text-white transition-colors">الميزات</a>
            <a href="#how-it-works" className="text-slate-300 hover:text-white transition-colors">كيف يعمل</a>
            <a href="#pricing" className="text-slate-300 hover:text-white transition-colors">الأسعار</a>
            <a href="#faq" className="text-slate-300 hover:text-white transition-colors">الأسئلة الشائعة</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setLocation("/auth")}>
              تسجيل الدخول
            </Button>
            <Button 
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              onClick={() => setLocation("/auth?mode=register")}
            >
              ابدأ مجاناً
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center">
          <Badge className="mb-6 bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20">
            <Zap className="h-3 w-3 ml-1" />
            نظام SaaS متكامل
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
              {siteSettings?.heroTitleAr || "منصة Radius Pro احترافية"}
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              {siteSettings?.heroSubtitleAr || "لإدارة الإنترنت والكروت مع MikroTik"}
            </span>
          </h1>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            {siteSettings?.heroDescriptionAr || "نظام SaaS متكامل لإدارة شبكات الإنترنت مع MikroTik"}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-lg px-8 py-6"
              onClick={() => setLocation("/auth?mode=register")}
            >
              ابدأ تجربتك المجانية
              <ArrowLeft className="mr-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-lg px-8 py-6"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              اكتشف الميزات
            </Button>
          </div>
          
          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {[
              { value: "99.9%", label: "وقت التشغيل" },
              { value: "+1000", label: "عميل نشط" },
              { value: "+50K", label: "كرت مُدار" },
              { value: "24/7", label: "دعم فني" },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  {stat.value}
                </div>
                <div className="text-slate-500 text-sm mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-slate-900/50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-purple-500/10 text-purple-400 border-purple-500/20">
              الميزات
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              كل ما تحتاجه لإدارة شبكتك
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              مجموعة شاملة من الأدوات لإدارة الإنترنت والمستخدمين والفوترة
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition-all duration-300 hover:-translate-y-1"
              >
                <CardHeader>
                  <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-blue-400 mb-4">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-white">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-400">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-green-500/10 text-green-400 border-green-500/20">
              كيف يعمل
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              ابدأ في 4 خطوات بسيطة
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              من التسجيل إلى البيع في دقائق معدودة
            </p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <div className="text-center">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-slate-400">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-0 w-full h-0.5 bg-gradient-to-l from-blue-600/50 to-transparent -translate-x-1/2" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 bg-slate-900/50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
              الأسعار
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              خطط تناسب جميع الاحتياجات
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              اختر الخطة المناسبة لحجم شبكتك - جميع الخطط تشمل فترة تجريبية مجانية
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plansLoading ? (
              // Loading skeleton
              Array.from({ length: 3 }).map((_, index) => (
                <Card key={index} className="bg-slate-800/50 border-slate-700">
                  <CardHeader className="text-center pb-2">
                    <Skeleton className="h-6 w-24 mx-auto mb-2" />
                    <Skeleton className="h-4 w-32 mx-auto" />
                  </CardHeader>
                  <CardContent className="text-center">
                    <Skeleton className="h-12 w-28 mx-auto my-6" />
                    <div className="space-y-3 mb-6">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-4 w-full" />
                      ))}
                    </div>
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : plans.map((plan: any, index: any) => (
              <Card 
                key={index} 
                className={`relative bg-slate-800/50 border-slate-700 ${
                  plan.popular ? 'border-blue-500 ring-2 ring-blue-500/20' : ''
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-600 text-white">الأكثر شعبية</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-white text-xl">{plan.name}</CardTitle>
                  <CardDescription className="text-slate-400">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="my-6">
                    <span className="text-5xl font-bold text-white">${plan.price}</span>
                    <span className="text-slate-400 mr-2">/ {plan.period}</span>
                  </div>
                  <ul className="space-y-3 text-right mb-6">
                    {plan.features.map((feature: any, fIndex: any) => (
                      <li key={fIndex} className="flex items-center gap-2 text-slate-300">
                        <Check className="h-5 w-5 text-green-500 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Button 
                      className={`flex-1 ${
                        plan.popular 
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700' 
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                      onClick={() => setLocation("/auth?mode=register")}
                    >
                      ابدأ الآن
                    </Button>
                    {contactData?.whatsappNumber && (
                      <Button
                        variant="outline"
                        className="flex-1 border-green-500/50 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                        onClick={() => {
                          const num = contactData.whatsappNumber!.replace(/[^0-9]/g, '');
                          window.open(`https://wa.me/${num}?text=${encodeURIComponent('مرحباً، أريد الاستفسار عن خدمة Radius Pro')}`, '_blank');
                        }}
                      >
                        تواصل معنا
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20">
              الأسئلة الشائعة
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              إجابات لأسئلتك
            </h2>
          </div>
          
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="bg-slate-800/50 border border-slate-700 rounded-lg px-6"
              >
                <AccordionTrigger className="text-white hover:text-blue-400 text-right">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 px-4 bg-slate-900/50">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
              تواصل معنا
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              نحن هنا لمساعدتك
            </h2>
            <p className="text-slate-400">
              لديك سؤال أو استفسار؟ تواصل معنا وسنرد عليك في أقرب وقت
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">البريد الإلكتروني</h3>
                  <p className="text-slate-400">{siteSettings?.supportEmail || 'support@radius-pro.com'}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400 shrink-0">
                  <Phone className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">الهاتف</h3>
                  <p className="text-slate-400">{contactData?.supportPhone || siteSettings?.supportPhone || '+970 568329324'}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">ساعات العمل</h3>
                  <p className="text-slate-400">{siteSettings?.supportHoursTextAr || 'السبت - الخميس: 9 صباحاً - 6 مساءً'}</p>
                </div>
              </div>
            </div>
            
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6">
                <form className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input 
                      placeholder="الاسم" 
                      className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                    />
                    <Input 
                      placeholder="البريد الإلكتروني" 
                      type="email"
                      className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <Input 
                    placeholder="الموضوع" 
                    className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                  />
                  <Textarea 
                    placeholder="رسالتك..." 
                    rows={4}
                    className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                  />
                  <Button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                    إرسال الرسالة
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-slate-800">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Wifi className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Radius Pro</span>
              </div>
              <p className="text-slate-400 text-sm">
                منصة Radius Pro احترافية لإدارة الإنترنت والكروت والاشتراكات
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">روابط سريعة</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#features" className="hover:text-white transition-colors">الميزات</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">الأسعار</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">الأسئلة الشائعة</a></li>
                <li><a href="#contact" className="hover:text-white transition-colors">تواصل معنا</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">قانوني</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors">سياسة الخصوصية</a></li>
                <li><a href="#" className="hover:text-white transition-colors">شروط الاستخدام</a></li>
                <li><a href="#" className="hover:text-white transition-colors">سياسة الاسترداد</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">حسابك</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <button onClick={() => setLocation("/auth")} className="hover:text-white transition-colors">
                    تسجيل الدخول
                  </button>
                </li>
                <li>
                  <button onClick={() => setLocation("/auth?mode=register")} className="hover:text-white transition-colors">
                    إنشاء حساب
                  </button>
                </li>
                <li>
                  <button onClick={() => setLocation("/auth?mode=forgot")} className="hover:text-white transition-colors">
                    نسيت كلمة المرور
                  </button>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()} Radius Pro. جميع الحقوق محفوظة.
            </p>
            <div className="flex items-center gap-4">
              <Lock className="h-4 w-4 text-green-500" />
              <span className="text-slate-500 text-sm">اتصال آمن ومشفر</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
