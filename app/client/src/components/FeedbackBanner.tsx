import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { X, Star, ChevronDown, ChevronUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function FeedbackBanner() {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.feedback.getActiveCampaign.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const trackEvent = trpc.feedback.trackEvent.useMutation();
  const submitMutation = trpc.feedback.submit.useMutation();
  const dismissMutation = trpc.feedback.dismiss.useMutation();

  const [rating, setRating] = useState<number>(0);
  const [hovered, setHovered] = useState<number>(0);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [comment, setComment] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [visible, setVisible] = useState(false);

  const viewedRef = useRef(false);

  useEffect(() => {
    if (data && !viewedRef.current) {
      viewedRef.current = true;
      setVisible(true);
      trackEvent.mutate({ campaignId: data.campaign.id, event: "viewed" });
    }
  }, [data]);

  // شاشة الشكر بعد الإرسال
  if (submitted) {
    return (
      <div
        dir="rtl"
        className="fixed bottom-4 left-4 z-50 w-80 rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="px-4 py-6 text-center space-y-2">
          <div className="text-4xl">🎉</div>
          <p className="text-sm font-semibold text-card-foreground">شكراً على تقييمك!</p>
          <p className="text-xs text-muted-foreground">رأيك يساعدنا على التحسين المستمر.</p>
          <button
            onClick={() => { setSubmitted(false); setVisible(false); }}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground underline"
          >
            إغلاق
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !data || !visible) return null;

  const { campaign, categories } = data;

  const handleSnooze = () => {
    trackEvent.mutate({ campaignId: campaign.id, event: "snoozed" });
    setVisible(false);
  };

  const handleDismiss = async () => {
    await dismissMutation.mutateAsync({ campaignId: campaign.id });
    utils.feedback.getActiveCampaign.invalidate();
    setVisible(false);
  };

  const handleSubmit = async () => {
    if (!rating) {
      toast.error("يرجى اختيار تقييم");
      return;
    }
    try {
      await submitMutation.mutateAsync({
        campaignId: campaign.id,
        rating,
        categoryIds: selectedCategories,
        comment: comment.trim() || undefined,
        browser: navigator.userAgent.slice(0, 100),
      });
      // أولاً: أظهر شاشة الشكر
      setSubmitted(true);
      // بعد 4 ثواني: أخفِ البانر تماماً ثم حدّث الكيش
      setTimeout(() => {
        setVisible(false);
        utils.feedback.getActiveCampaign.invalidate();
      }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء الإرسال";
      toast.error(msg);
    }
  };

  const toggleCategory = (id: number) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <div
      dir="rtl"
      className="fixed bottom-4 left-4 z-50 w-80 rounded-xl border border-border bg-card shadow-2xl transition-all"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
          <span className="text-sm font-semibold text-card-foreground">{campaign.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title={expanded ? "طيّ" : "توسيع"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            onClick={handleSnooze}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="لاحقاً"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {campaign.description && (
            <p className="text-xs text-muted-foreground">{campaign.description}</p>
          )}

          {/* Star Rating */}
          <div className="flex gap-1 justify-center">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`h-7 w-7 transition-colors ${
                    star <= (hovered || rating)
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-muted-foreground"
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat: { id: number; label: string; icon: string | null; sortOrder: number; campaignId: number }) => (
                <Badge
                  key={cat.id}
                  variant={selectedCategories.includes(cat.id) ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleCategory(cat.id)}
                >
                  {cat.icon && <span className="ml-1">{cat.icon}</span>}
                  {cat.label}
                </Badge>
              ))}
            </div>
          )}

          {/* Comment */}
          <Textarea
            placeholder="أضف تعليقاً (اختياري)..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="text-sm resize-none h-20"
            maxLength={500}
          />

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 gap-1"
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
            >
              <Send className="h-3.5 w-3.5" />
              {submitMutation.isPending ? "جاري الإرسال..." : "إرسال"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              onClick={handleDismiss}
              disabled={dismissMutation.isPending}
            >
              لا تعرض مرة أخرى
            </Button>
          </div>
        </div>
      )}

      {/* Collapsed quick rating */}
      {!expanded && (
        <div className="px-4 py-2">
          <div className="flex gap-1 justify-center">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => {
                  setRating(star);
                  setExpanded(true);
                }}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`h-6 w-6 transition-colors ${
                    star <= rating
                      ? "text-yellow-400 fill-yellow-400"
                      : "text-muted-foreground"
                  }`}
                />
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-1">
            كيف تقيّم تجربتك؟
          </p>
        </div>
      )}
    </div>
  );
}
