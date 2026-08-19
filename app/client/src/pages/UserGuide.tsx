import { Link } from "wouter";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Clipboard,
  CreditCard,
  ExternalLink,
  FileUp,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Network,
  Phone,
  Printer,
  Router,
  Settings2,
  ShieldCheck,
  Users,
  Wifi,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/operationFeedback";

const guideSections = [
  {
    id: "start",
    number: "01",
    title: "ابدأ بإعداد حسابك",
    description: "راجع بيانات شركتك، العملة، وقنوات الإشعارات قبل البدء بإدارة الشبكة.",
    icon: Settings2,
    action: "/settings",
    actionLabel: "فتح الإعدادات",
    steps: [
      "افتح الإعدادات وأكمل بيانات الحساب والصورة والعملة المناسبة.",
      "من تبويب الإشعارات، فعّل القنوات التي ستستخدمها لاستلام التنبيهات.",
      "تأكد أن مسؤول الحساب منح موظفيك الصلاحيات المطلوبة قبل البدء.",
    ],
  },
  {
    id: "nas",
    number: "02",
    title: "أضف جهاز NAS واربط MikroTik",
    description: "كل شبكة تبدأ بجهاز NAS؛ منه يميّز النظام مصدر طلبات RADIUS ويطبق الخطط الصحيحة.",
    icon: Router,
    action: "/nas",
    actionLabel: "إدارة NAS",
    steps: [
      "أنشئ NAS جديداً باسم واضح للشبكة وحدد نوع الاتصال وبياناته بدقة.",
      "احفظ السر المشترك في مكان آمن ولا تستخدمه في أي جهاز غير تابع للشبكة.",
      "انتقل إلى إعداد MikroTik لإكمال ربط الراوتر ثم تحقق من حالة الاتصال داخل النظام.",
    ],
  },
  {
    id: "plans",
    number: "03",
    title: "أنشئ خطة خدمة",
    description: "الخطة تحدد السرعة والمدة والاستخدام وقيد NAS إن كنت تريد حصرها على شبكة معيّنة.",
    icon: Wifi,
    action: "/plans",
    actionLabel: "فتح الخطط",
    steps: [
      "أضف اسم الخطة والسرعات وسعرها ومدة صلاحيتها المناسبة.",
      "اختر عزل الشبكات عند الحاجة لتحديد أجهزة NAS المسموح لها باستخدام الخطة.",
      "احفظ الخطة ثم راجعها قبل إنشاء أي بطاقات منها.",
    ],
  },
  {
    id: "vouchers",
    number: "04",
    title: "أنشئ الكروت أو استوردها",
    description: "أنشئ دفعات بطاقات من الخطة أو أضف كرتاً يدوياً أو استورد ملفاً منظماً.",
    icon: CreditCard,
    action: "/vouchers",
    actionLabel: "إدارة الكروت",
    steps: [
      "اضغط إنشاء كروت واختر الخطة والعدد ونمط اسم المستخدم وكلمة المرور.",
      "للكروت الموجودة مسبقاً، استخدم استيراد الكروت وحدد أعمدة اسم المستخدم وكلمة المرور بدقة.",
      "تابع حالة كل كرت من القائمة: غير مستخدم، متصل، منتهٍ أو موقوف.",
    ],
  },
  {
    id: "print",
    number: "05",
    title: "اطبع ووزّع البطاقات",
    description: "استعمل القالب المناسب للدفعة ثم اطبع PDF أو صدّر البيانات حسب احتياجك.",
    icon: Printer,
    action: "/print-cards",
    actionLabel: "طباعة الكروت",
    steps: [
      "اختر قالب الطباعة الذي يناسب حجم الكروت وهوية نشاطك.",
      "حدّد الدفعة ثم راجع معاينة أسماء المستخدمين وكلمات المرور قبل التصدير.",
      "لا تشارك ملف التصدير إلا مع الأشخاص المخولين لأنه يحتوي بيانات دخول فعالة.",
    ],
  },
  {
    id: "subscribers",
    number: "06",
    title: "تابع المشتركين والجلسات",
    description: "استخدم المشتركين لإدارة العملاء الدائمين، والجلسات لمتابعة الاتصال الحي فقط.",
    icon: Users,
    action: "/subscribers",
    actionLabel: "فتح المشتركين",
    steps: [
      "أضف بيانات المشترك والخطة عند إدارة اشتراكات مباشرة بدلاً من كروت مؤقتة.",
      "افتح صفحة الجلسات لرؤية الاتصالات الحية وفصل اتصال عند الحاجة.",
      "استخدم السجل للتدقيق؛ حالة الاتصال الحية تؤخذ من صفحة الجلسات فقط.",
    ],
  },
];

const quickLinks = [
  { label: "إدارة NAS", path: "/nas", icon: Network },
  { label: "إعداد MikroTik", path: "/mikrotik-setup", icon: Router },
  { label: "استيراد الكروت", path: "/import-cards", icon: FileUp },
  { label: "الجلسات النشطة", path: "/sessions", icon: ListChecks },
];

type IllustrationVariant = "hero" | "nas" | "vouchers";

function GuideIllustration({ variant, className = "" }: { variant: IllustrationVariant; className?: string }) {
  const isVoucher = variant === "vouchers";
  const isNas = variant === "nas";

  return (
    <div className={`relative overflow-hidden bg-slate-950 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 640 360" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`guide-main-${variant}`} x1="60" y1="34" x2="590" y2="333" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22D3EE" />
            <stop offset="0.55" stopColor="#6366F1" />
            <stop offset="1" stopColor="#C026D3" />
          </linearGradient>
          <filter id={`guide-glow-${variant}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id={`guide-grid-${variant}`} width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" stroke="#38BDF8" strokeOpacity="0.09" />
          </pattern>
        </defs>
        <rect width="640" height="360" fill="#070F22" />
        <rect width="640" height="360" fill={`url(#guide-grid-${variant})`} />
        <circle cx="550" cy="55" r="98" fill="#4F46E5" fillOpacity="0.16" />
        <circle cx="105" cy="305" r="112" fill="#0891B2" fillOpacity="0.12" />

        {variant === "hero" && <>
          <path d="M110 227C187 145 270 136 349 171C416 201 452 155 533 89" stroke={`url(#guide-main-${variant})`} strokeWidth="2" strokeDasharray="7 8" opacity="0.8" />
          {[[110,227],[226,160],[350,171],[466,145],[533,89]].map(([cx, cy], index) => (
            <g key={index} filter={`url(#guide-glow-${variant})`}><circle cx={cx} cy={cy} r="7" fill={index % 2 ? "#A78BFA" : "#22D3EE"} /><circle cx={cx} cy={cy} r="15" fill={index % 2 ? "#A78BFA" : "#22D3EE"} fillOpacity="0.12" /></g>
          ))}
          <rect x="221" y="104" width="196" height="124" rx="22" fill="#111C35" stroke="#334A70" />
          <rect x="246" y="129" width="146" height="48" rx="12" fill="#172554" />
          <path d="M270 153H368" stroke={`url(#guide-main-${variant})`} strokeWidth="5" strokeLinecap="round" />
          <circle cx="274" cy="198" r="5" fill="#22D3EE" /><circle cx="296" cy="198" r="5" fill="#A78BFA" /><circle cx="318" cy="198" r="5" fill="#34D399" />
        </>}

        {isNas && <>
          <path d="M109 202C183 202 195 112 286 112C366 112 367 235 490 235" stroke={`url(#guide-main-${variant})`} strokeWidth="3" strokeDasharray="8 8" />
          <rect x="205" y="92" width="170" height="116" rx="20" fill="#111C35" stroke="#334A70" />
          <rect x="231" y="123" width="117" height="39" rx="10" fill="#172554" />
          <path d="M249 143H330" stroke="#22D3EE" strokeWidth="4" strokeLinecap="round" />
          {[251,274,297,320].map((x) => <circle key={x} cx={x} cy="182" r="4" fill="#34D399" />)}
          <circle cx="104" cy="202" r="35" fill="#172554" stroke="#22D3EE" strokeWidth="2" /><path d="M90 203L104 187L118 203L104 219Z" fill="#22D3EE" />
          <circle cx="506" cy="235" r="36" fill="#241451" stroke="#A78BFA" strokeWidth="2" /><path d="M492 235H520M506 221V249" stroke="#A78BFA" strokeWidth="4" strokeLinecap="round" />
        </>}

        {isVoucher && <>
          <g transform="rotate(-9 235 188)"><rect x="133" y="112" width="205" height="122" rx="18" fill="#172554" stroke="#22D3EE" strokeOpacity="0.7" /><rect x="156" y="143" width="105" height="11" rx="5" fill="#67E8F9" fillOpacity="0.8" /><rect x="156" y="172" width="142" height="8" rx="4" fill="#C4B5FD" fillOpacity="0.8" /><circle cx="293" cy="183" r="17" stroke="#22D3EE" strokeWidth="3" /></g>
          <g transform="rotate(7 312 196)"><rect x="241" y="142" width="205" height="122" rx="18" fill="#25144B" stroke="#A78BFA" strokeOpacity="0.8" /><rect x="264" y="173" width="105" height="11" rx="5" fill="#DDD6FE" fillOpacity="0.85" /><rect x="264" y="202" width="142" height="8" rx="4" fill="#67E8F9" fillOpacity="0.8" /><circle cx="401" cy="213" r="17" stroke="#A78BFA" strokeWidth="3" /></g>
          <rect x="442" y="105" width="84" height="118" rx="18" fill="#111C35" stroke="#334A70" /><rect x="458" y="130" width="52" height="58" rx="7" fill="#1E293B" /><circle cx="484" cy="204" r="6" fill="#34D399" />
        </>}
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/15" />
    </div>
  );
}

export default function UserGuide() {
  const copySupportPath = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/support`);
    toast.success("تم نسخ رابط الدعم الفني");
  };

  return (
    <div className="space-y-8 pb-10" dir="rtl">
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-slate-950 px-6 py-10 text-white shadow-2xl md:px-10 md:py-14">
        <GuideIllustration variant="hero" className="absolute inset-0 opacity-85" />
        <div className="absolute inset-0 bg-gradient-to-l from-slate-950/40 via-slate-950/70 to-slate-950" />
        <div className="relative z-10 max-w-2xl space-y-5">
          <Badge className="border-primary/35 bg-primary/15 text-primary-foreground hover:bg-primary/20">
            <BookOpen className="ml-2 h-3.5 w-3.5" />
            مرجع Radius Pro العملي
          </Badge>
          <div>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">دليل الاستخدام خطوة بخطوة</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-slate-200 md:text-lg">
              ابدأ بتجهيز الشبكة، أضف NAS، أنشئ الخطط والكروت، ثم تابع المشتركين والجلسات من مكان واحد.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="#start"><Button className="bg-primary text-primary-foreground hover:bg-primary/90">ابدأ الدليل <ArrowLeft className="mr-2 h-4 w-4" /></Button></a>
            <Link href="/support"><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">تواصل مع الدعم</Button></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {quickLinks.map(({ label, path, icon: Icon }) => (
          <Link key={path} href={path}>
            <Card className="group h-full cursor-pointer transition-all hover:-translate-y-1 hover:border-primary/45 hover:shadow-lg">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
                <span className="font-semibold">{label}</span>
                <ExternalLink className="mr-auto h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-1" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-2xl border bg-card p-4 shadow-sm">
            <p className="mb-3 text-sm font-bold text-muted-foreground">محتوى الدليل</p>
            <nav className="space-y-1">
              {guideSections.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                  <span className="font-mono text-xs text-primary">{section.number}</span>{section.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="space-y-6">
          {guideSections.map((section, index) => {
            const Icon = section.icon;
            const illustration = index === 1
              ? "nas"
              : index === 3 || index === 4
                ? "vouchers"
                : null;
            return (
              <Card id={section.id} key={section.id} className="scroll-mt-6 overflow-hidden border-border/80 shadow-sm">
                <CardContent className="p-0">
                  <div className={`grid ${illustration ? "md:grid-cols-[minmax(0,1fr)_240px]" : ""}`}>
                    <div className="p-6 md:p-7">
                      <div className="mb-5 flex items-start gap-4">
                        <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Icon className="h-6 w-6" /></div>
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2"><Badge variant="outline" className="font-mono text-xs">{section.number}</Badge><CardTitle className="text-xl">{section.title}</CardTitle></div>
                          <CardDescription className="text-sm leading-6">{section.description}</CardDescription>
                        </div>
                      </div>
                      <ol className="space-y-3">
                        {section.steps.map((step, stepIndex) => (
                          <li key={step} className="flex gap-3 text-sm leading-6 text-foreground/90">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{stepIndex + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      <Link href={section.action}>
                        <Button variant="outline" size="sm" className="mt-6">{section.actionLabel}<ArrowLeft className="mr-2 h-3.5 w-3.5" /></Button>
                      </Link>
                    </div>
                    {illustration && <GuideIllustration variant={illustration} className="h-52 w-full md:h-full" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Lightbulb className="h-5 w-5 text-amber-500" /> قبل أن تبدأ التوزيع</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>اختبر كرتاً واحداً على NAS الصحيح قبل إنشاء دفعة كبيرة.</p>
            <p>راجع عزل NAS في الخطة إن كانت الكروت مخصصة لشبكة واحدة فقط.</p>
            <p>احتفظ بالسر المشترك وبيانات الدخول خارج ملفات التصدير العامة.</p>
          </CardContent>
        </Card>
        <Card className="border-primary/25 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" /> تحتاج مساعدة؟</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>عند وجود خطأ، أرفق اسم الشبكة أو NAS والخطوة التي كنت تنفذها في تذكرة الدعم لتسريع المعالجة.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/support"><Button size="sm"><BadgeCheck className="ml-2 h-4 w-4" />فتح الدعم الفني</Button></Link>
              <Button size="sm" variant="outline" onClick={copySupportPath}><Clipboard className="ml-2 h-4 w-4" />نسخ رابط الدعم</Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden border-emerald-500/25 bg-gradient-to-l from-emerald-500/10 via-card to-card shadow-sm">
        <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <div className="mb-2 flex items-center gap-2 text-lg font-bold"><MessageCircle className="h-5 w-5 text-emerald-500" /> تواصل مباشر</div>
            <p className="text-sm leading-6 text-muted-foreground">للدعم أو المساعدة في إعداد الشبكة، تواصل معنا عبر WhatsApp أو الهاتف.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="https://wa.me/970598329324" target="_blank" rel="noreferrer">
              <Button className="bg-emerald-600 text-white hover:bg-emerald-700"><MessageCircle className="ml-2 h-4 w-4" />WhatsApp <span dir="ltr" className="mr-1">+970598329324</span></Button>
            </a>
            <a href="tel:0598329324">
              <Button variant="outline"><Phone className="ml-2 h-4 w-4" />للتواصل <span dir="ltr" className="mr-1">0598329324</span></Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
