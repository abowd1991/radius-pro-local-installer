/**
 * ImpersonationBanner
 * Shows a persistent warning bar when an admin is logged in as another user.
 * Provides a "Return to my account" button.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ImpersonationBanner() {
  const utils = trpc.useUtils();

  const { data: status } = trpc.auth.impersonationStatus.useQuery(undefined, {
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  const stopImpersonation = trpc.auth.stopImpersonation.useMutation({
    onSuccess: () => {
      toast.success("تم العودة إلى حسابك كمدير");
      // Full page reload to admin console
      setTimeout(() => {
        window.location.replace("/dashboard");
      }, 600);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!status?.isImpersonating) return null;

  const adminName = status.adminUser?.name || status.adminUser?.username || "المدير";

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 bg-orange-500 px-4 py-2 text-white shadow-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          أنت تتصفح الآن كـ{" "}
          <span className="font-bold underline underline-offset-2">
            عميل
          </span>{" "}
          — جلستك الأصلية محفوظة
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="border-white/50 bg-white/10 text-white hover:bg-white/20 hover:text-white gap-1.5 shrink-0"
        onClick={() => stopImpersonation.mutate()}
        disabled={stopImpersonation.isPending}
      >
        <LogOut className="h-3.5 w-3.5" />
        العودة لحساب {adminName}
      </Button>
    </div>
  );
}
