import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Star, MessageSquare, Eye, TrendingUp, Plus, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Calendar, Users, Filter, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { useTimezoneV6 } from "@/contexts/TimezoneV6Context";
import { nowDateTimeLocal, parseDateTimeLocal } from "@/lib/timezoneV6";

// ─── Types ──────────────────────────────────────────────────────────────────
type Campaign = {
  id: number;
  title: string;
  description: string | null;
  type: string;
  isActive: boolean;
  priority: number;
  version: string;
  startAt: number;
  endAt: number | null;
  createdAt: number;
  stats: {
    campaignId: number;
    totalResponses: number;
    avgRating: string | null;
    totalViews: number;
  };
};

const STAR_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];
const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#fb923c", "#facc15", "#4ade80", "#34d399", "#22d3ee"];

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
      <div className={`rounded-lg p-2.5 ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold text-card-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Create Campaign Dialog ───────────────────────────────────────────────────
function CreateCampaignDialog({ onCreated }: { onCreated: () => void }) {
  const { timezone } = useTimezoneV6();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    version: "1.0",
    title: "",
    description: "",
    type: "rating" as "rating" | "nps" | "survey" | "vote",
    priority: 0,
    startAt: nowDateTimeLocal(timezone),
    endAt: "",
    isActive: true,
  });
  const [categories, setCategories] = useState([
    { label: "سرعة الأداء", icon: "⚡" },
    { label: "سهولة الاستخدام", icon: "✨" },
    { label: "الدعم الفني", icon: "🛠️" },
    { label: "الميزات", icon: "🎯" },
  ]);

  const createMutation = trpc.feedback.adminCreate.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء الحملة بنجاح");
      setOpen(false);
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return toast.error("العنوان مطلوب");
    const startAt = parseDateTimeLocal(form.startAt, timezone);
    const endAt = form.endAt ? parseDateTimeLocal(form.endAt, timezone) : null;
    if (!startAt || (form.endAt && !endAt)) return toast.error("تاريخ الحملة غير صالح في المنطقة الزمنية المحددة");
    if (endAt && endAt.getTime() <= startAt.getTime()) return toast.error("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء");
    createMutation.mutate({
      ...form,
      startAt: startAt.getTime(),
      endAt: endAt?.getTime(),
      categories: categories.filter((c) => c.label.trim()).map((c, i) => ({
        label: c.label,
        icon: c.icon,
        sortOrder: i,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) setForm((current) => ({ ...current, startAt: nowDateTimeLocal(timezone) }));
    }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          حملة جديدة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء حملة تقييم جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>العنوان *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="كيف تقيّم تجربتك؟" />
            </div>
            <div>
              <Label>الإصدار</Label>
              <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="1.0" />
            </div>
          </div>
          <div>
            <Label>الوصف</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف اختياري..." className="h-16 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>تاريخ البدء</Label>
              <Input type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            </div>
            <div>
              <Label>تاريخ الانتهاء (اختياري)</Label>
              <Input type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الأولوية</Label>
              <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
            </div>
            <div>
              <Label>الحالة</Label>
              <Select value={form.isActive ? "active" : "inactive"} onValueChange={(v) => setForm({ ...form, isActive: v === "active" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">نشطة</SelectItem>
                  <SelectItem value="inactive">معطلة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>الفئات</Label>
            <div className="space-y-2 mt-1">
              {categories.map((cat, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="w-12 text-center"
                    value={cat.icon}
                    onChange={(e) => {
                      const updated = [...categories];
                      updated[i].icon = e.target.value;
                      setCategories(updated);
                    }}
                    placeholder="🎯"
                  />
                  <Input
                    className="flex-1"
                    value={cat.label}
                    onChange={(e) => {
                      const updated = [...categories];
                      updated[i].label = e.target.value;
                      setCategories(updated);
                    }}
                    placeholder="اسم الفئة"
                  />
                  <Button variant="ghost" size="sm" onClick={() => setCategories(categories.filter((_, j) => j !== i))}>✕</Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setCategories([...categories, { label: "", icon: "📌" }])}>
                + إضافة فئة
              </Button>
            </div>
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء الحملة"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaign Stats Panel ────────────────────────────────────────────────────
function CampaignStatsPanel({ campaignId }: { campaignId: number }) {
  const [page, setPage] = useState(1);
  const [ratingFilter, setRatingFilter] = useState<string>("all");

  const { data, isLoading } = trpc.feedback.adminStats.useQuery({
    campaignId,
    rating: ratingFilter !== "all" ? Number(ratingFilter) : undefined,
    page,
    pageSize: 10,
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>;
  if (!data) return null;

  const { kpi, distribution, analytics, topCategories, comments, totalPages } = data;

  const distData = [1, 2, 3, 4, 5].map((star) => ({
    name: `${star}★`,
    count: distribution.find((d: { rating: number | null; count: number }) => d.rating === star)?.count ?? 0,
    fill: STAR_COLORS[star - 1],
  }));

  const participationRate = analytics.views > 0
    ? ((analytics.submitted / analytics.views) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-6" dir="rtl">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Star className="h-5 w-5 text-yellow-400" />} label="متوسط التقييم" value={kpi.avgRating ? Number(kpi.avgRating).toFixed(1) : "—"} sub={`من ${kpi.total} تقييم`} color="bg-yellow-500/10" />
        <KpiCard icon={<Eye className="h-5 w-5 text-blue-400" />} label="المشاهدات" value={analytics.views} sub={`${participationRate}% مشاركة`} color="bg-blue-500/10" />
        <KpiCard icon={<MessageSquare className="h-5 w-5 text-green-400" />} label="التعليقات" value={kpi.withComment} sub={`من ${kpi.total} استجابة`} color="bg-green-500/10" />
        <KpiCard icon={<TrendingUp className="h-5 w-5 text-purple-400" />} label="تم الإغلاق" value={analytics.dismissed} sub={`${analytics.snoozed} تأجيل`} color="bg-purple-500/10" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Distribution Bar Chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 text-card-foreground">توزيع التقييمات</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={distData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Bar dataKey="count" name="عدد التقييمات" radius={[4, 4, 0, 0]}>
                {distData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Categories Pie Chart */}
        {topCategories.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 text-card-foreground">أكثر الفئات تقييماً</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={topCategories}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={65}
                  label={({ name, percent }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {topCategories.map((_: { label: string; icon: string | null; count: number }, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Comments Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-card-foreground">التعليقات</h3>
          <Select value={ratingFilter} onValueChange={(v) => { setRatingFilter(v); setPage(1); }}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <Filter className="h-3 w-3 ml-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التقييمات</SelectItem>
              {[5, 4, 3, 2, 1].map((s) => (
                <SelectItem key={s} value={String(s)}>{s} نجوم</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">التقييم</TableHead>
              <TableHead className="text-right">التعليق</TableHead>
              <TableHead className="text-right">الجهاز</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد تعليقات</TableCell>
              </TableRow>
            ) : (
              comments.map((c: { id: number; rating: number | null; comment: string | null; device: string | null; createdAt: number }) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-3.5 w-3.5 ${s <= (c.rating ?? 0) ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground"}`} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs text-sm">{c.comment}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.device?.slice(0, 30) ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString("ar-PS")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>السابق</Button>
            <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>التالي</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Campaign Row ─────────────────────────────────────────────────────────────
function CampaignRow({ campaign, onRefresh }: { campaign: Campaign; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const updateMutation = trpc.feedback.adminUpdate.useMutation({
    onSuccess: () => { toast.success("تم التحديث"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = () => {
    updateMutation.mutate({ id: campaign.id, isActive: !campaign.isActive });
  };

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setExpanded((e) => !e)}>
        <TableCell>
          <div className="flex items-center gap-2">
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            <div>
              <p className="font-medium text-sm">{campaign.title}</p>
              <p className="text-xs text-muted-foreground">v{campaign.version}</p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={campaign.isActive ? "default" : "secondary"} className="text-xs">
            {campaign.isActive ? "نشطة" : "معطلة"}
          </Badge>
        </TableCell>
        <TableCell className="text-sm">{campaign.stats.totalViews}</TableCell>
        <TableCell className="text-sm">{campaign.stats.totalResponses}</TableCell>
        <TableCell>
          {campaign.stats.avgRating ? (
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
              <span className="text-sm font-medium">{campaign.stats.avgRating}</span>
            </div>
          ) : <span className="text-muted-foreground text-sm">—</span>}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {new Date(campaign.createdAt).toLocaleDateString("ar-PS")}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleActive}
            disabled={updateMutation.isPending}
            className="gap-1 text-xs"
          >
            {campaign.isActive
              ? <><ToggleRight className="h-4 w-4 text-green-500" /> تعطيل</>
              : <><ToggleLeft className="h-4 w-4 text-muted-foreground" /> تفعيل</>
            }
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/20 p-4">
            <CampaignStatsPanel campaignId={campaign.id} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FeedbackCenter() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  if (user?.role !== "super_admin" && user?.role !== "owner") {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        غير مصرح لك بالوصول لهذه الصفحة.
      </div>
    );
  }

  const { data: campaigns, isLoading, refetch } = trpc.feedback.adminListCampaigns.useQuery();

  const totalViews = campaigns?.reduce((s: number, c: Campaign) => s + c.stats.totalViews, 0) ?? 0;
  const totalResponses = campaigns?.reduce((s: number, c: Campaign) => s + c.stats.totalResponses, 0) ?? 0;
  const activeCampaigns = campaigns?.filter((c: Campaign) => c.isActive).length ?? 0;

  return (
    <div className="space-y-6 p-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
            مركز التقييمات
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة حملات التقييم وتحليل آراء المستخدمين</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
          <CreateCampaignDialog onCreated={() => utils.feedback.adminListCampaigns.invalidate()} />
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Calendar className="h-5 w-5 text-blue-400" />} label="إجمالي الحملات" value={campaigns?.length ?? 0} color="bg-blue-500/10" />
        <KpiCard icon={<ToggleRight className="h-5 w-5 text-green-400" />} label="الحملات النشطة" value={activeCampaigns} color="bg-green-500/10" />
        <KpiCard icon={<Eye className="h-5 w-5 text-purple-400" />} label="إجمالي المشاهدات" value={totalViews} color="bg-purple-500/10" />
        <KpiCard icon={<Users className="h-5 w-5 text-orange-400" />} label="إجمالي الاستجابات" value={totalResponses} color="bg-orange-500/10" />
      </div>

      {/* Campaigns Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-card-foreground">الحملات</h2>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="py-12 text-center">
            <Star className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد حملات بعد</p>
            <p className="text-xs text-muted-foreground mt-1">أنشئ أول حملة تقييم للبدء</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الحملة</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">المشاهدات</TableHead>
                <TableHead className="text-right">الاستجابات</TableHead>
                <TableHead className="text-right">متوسط التقييم</TableHead>
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c: Campaign) => (
                <CampaignRow key={c.id} campaign={c} onRefresh={() => utils.feedback.adminListCampaigns.invalidate()} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
