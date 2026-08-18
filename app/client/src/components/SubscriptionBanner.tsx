import { trpc } from "@/lib/trpc";
import { XCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * SubscriptionBanner
 *
 * منطق العرض:
 * - يظهر "حسابك مجمد" فقط عندما يكون رصيد المحفظة = $0 أو أقل
 * - يختفي تلقائياً عند إضافة رصيد من الأدمن
 * - لا يظهر لـ super_admin أو owner
 */
export function SubscriptionBanner() {
  const { user } = useAuth();

  // جلب رصيد المحفظة
  const { data: wallet, isLoading } = trpc.wallet.getMyWallet.useQuery(undefined, {
    enabled: !!user && user.role !== 'super_admin' && user.role !== 'owner',
    staleTime: 30000, // تحديث كل 30 ثانية
    refetchInterval: 60000, // إعادة جلب كل دقيقة
  });

  // لا يظهر للمدير أو أثناء التحميل
  if (!user || user.role === 'super_admin' || user.role === 'owner') {
    return null;
  }

  // أثناء التحميل لا نعرض شيئاً لتجنب الوميض
  if (isLoading) {
    return null;
  }

  // الرصيد الحالي
  const balance = parseFloat(wallet?.balance ?? '0');

  // إذا الرصيد > 0 → الحساب نشط، لا يظهر البانر
  if (balance > 0) {
    return null;
  }

  // الرصيد = 0 أو أقل → حساب مجمد
  return (
    <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-4">
      <div className="flex flex-col items-center justify-center gap-2 text-red-700 dark:text-red-400">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5" />
          <span className="text-base font-bold">
            حسابك مجمّد - الاشتراك منتهي أو معلق
          </span>
        </div>
        <p className="text-sm text-center max-w-lg">
          لا يمكنك إنشاء أو تعديل أي بيانات حالياً. جميع بياناتك محفوظة ولن يتم حذفها.
          <br />
          للتجديد، يرجى التواصل مع الدعم الفني أو إرسال تذكرة دعم.
        </p>
        <div className="flex gap-2 mt-2">
          <a
            href="/support"
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
          >
            تواصل مع الدعم
          </a>
        </div>
      </div>
    </div>
  );
}
