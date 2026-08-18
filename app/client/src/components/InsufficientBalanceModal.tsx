import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

interface InsufficientBalanceModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal displayed when a user tries to perform an action but has zero balance.
 * Shown for: create NAS, generate cards, create speed plans.
 */
export function InsufficientBalanceModal({ open, onClose }: InsufficientBalanceModalProps) {
  const [, setLocation] = useLocation();

  const handleGoToWallet = () => {
    onClose();
    setLocation("/wallet");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md text-center" dir="rtl">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-red-500">
            رصيدك غير كافٍ
          </DialogTitle>
          <DialogDescription className="text-base mt-2 text-foreground/80">
            لا يمكن تنفيذ هذه العملية لأن رصيدك الحالي <strong>$0.00</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-right">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium mb-1">
            💡 تذكير: سعر الخدمة
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <strong>$15 شهرياً</strong> لكل جهاز NAS نشط
            <br />
            (أي $0.50 يومياً لكل جهاز)
          </p>
        </div>

        <div className="flex flex-col gap-3 mt-2">
          <Button
            onClick={handleGoToWallet}
            className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
            size="lg"
          >
            <CreditCard className="w-4 h-4" />
            اذهب إلى المحفظة وأعد الشحن
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full"
          >
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Helper to check if a tRPC error is an insufficient balance error
 */
export function isInsufficientBalanceError(error: any): boolean {
  if (!error) return false;
  const msg = error?.message || "";
  return (
    msg.includes("INSUFFICIENT_BALANCE") ||
    msg.includes("رصيدك صفر") ||
    msg.includes("insufficient balance") ||
    (error?.data?.code === "FORBIDDEN" && msg.includes("رصيد"))
  );
}
