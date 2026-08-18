/**
 * PaymentWizard - معالج الدفع الديناميكي
 * يعرض طرق الدفع المفعّلة من إعدادات الموقع
 * الخطوة 1: اختيار المبلغ وطريقة الدفع
 * الخطوة 2: عرض تفاصيل الدفع + رفع الإيصال
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, Wallet, CreditCard, ArrowRight, ArrowLeft, Upload, CheckCircle2, Copy, X } from "lucide-react";
import { toast } from "sonner";

interface PaymentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type PaymentMethod = "bank" | "palpay" | "paypal";

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  phone: string;
  accountHolder: string;
  qrCode?: string;
}

export function PaymentWizard({ open, onOpenChange, onSuccess }: PaymentWizardProps) {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [selectedBankIdx, setSelectedBankIdx] = useState(0);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>("");
  const [currency, setCurrency] = useState<"USD" | "ILS">("USD");
  const fileRef = useRef<HTMLInputElement>(null);

  // جلب إعدادات الدفع
  const { data: paySettings, isLoading: settingsLoading } = trpc.site.getPaymentSettings.useQuery();

  // mutation إرسال طلب تحويل بنكي
  const submitBankMutation = trpc.bankTransfer.submitRequest.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال طلب الدفع بنجاح! سيتم مراجعته من قِبل الإدارة.");
      handleClose();
      onSuccess?.();
    },
    onError: (err) => {
      const msg = err.message || "";
      const code = (err as any)?.data?.code || "";
      if (msg.includes("balance") || msg.includes("past_due")) {
        toast.error("💳 رصيدك غير كافٍ، يرجى شحن الرصيد أولاً", { duration: 6000 });
      } else if (code === "FORBIDDEN") {
        toast.error("🚫 ليس لديك صلاحية لإتمام هذه العملية", { duration: 6000 });
      } else {
        toast.error("❌ فشل إرسال طلب الدفع، يرجى المحاولة مرة أخرى", { duration: 6000 });
      }
    },
  });

  const handleClose = () => {
    setStep(1);
    setAmount("");
    setSelectedMethod(null);
    setSelectedBankIdx(0);
    setReceiptFile(null);
    setReceiptPreview("");
    setCurrency("USD");
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الملف يجب أن يكون أقل من 5 ميجابايت");
      return;
    }
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setReceiptPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!receiptFile) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(",")[1];
      await submitBankMutation.mutateAsync({
        requestedAmount: 0, // المبلغ يُحدده المدير بعد مراجعة الإيصال
        requestedCurrency: currency,
        receiptImage: {
          data: base64,
          filename: receiptFile.name,
          mimeType: receiptFile.type,
        },
      });
    };
    reader.readAsDataURL(receiptFile);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`تم نسخ ${label}`));
  };

  // تحديد الطرق المتاحة
  const allMethods: { key: PaymentMethod; label: string; icon: React.ReactNode; enabled: boolean }[] = [
    {
      key: "bank",
      label: "تحويل بنكي",
      icon: <img src="/manus-storage/bank-of-palestine_7f5fad8c.png" alt="Bank of Palestine" className="w-8 h-8 object-contain rounded" />,
      enabled: paySettings?.bankEnabled === true && (paySettings?.bankAccounts as BankAccount[] || []).length > 0,
    },
    {
      key: "palpay",
      label: "PalPay",
      icon: <img src="/manus-storage/palpay_319f1897.png" alt="PalPay" className="w-8 h-8 object-contain rounded" />,
      enabled: paySettings?.palpayEnabled === true,
    },
    {
      key: "paypal",
      label: "PayPal",
      icon: <img src="/manus-storage/paypal_968de24b.png" alt="PayPal" className="w-8 h-8 object-contain rounded" />,
      enabled: paySettings?.paypalEnabled === true,
    },
  ];
  const availableMethods = allMethods.filter(m => m.enabled);

  const bankAccounts = (paySettings?.bankAccounts as BankAccount[] || []);
  const selectedBank = bankAccounts[selectedBankIdx];

  if (settingsLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg w-[calc(100vw-2rem)] flex flex-col"
        style={{ maxHeight: "90dvh" }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            إضافة رصيد
          </DialogTitle>
          <DialogDescription>
            {step === 1 ? "اختر المبلغ وطريقة الدفع" : "أرسل المبلغ وارفع إيصال الدفع"}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 shrink-0 py-1">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              <span className={`text-xs ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                {s === 1 ? "اختيار الطريقة" : "تفاصيل الدفع"}
              </span>
              {s < 2 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* ======= STEP 1 ======= */}
          {step === 1 && (
            <>
              {/* Payment Methods */}
              <div>
                <Label className="text-sm font-medium">طريقة الدفع</Label>
                {availableMethods.length === 0 ? (
                  <div className="mt-2 p-4 rounded-lg border border-dashed text-center text-muted-foreground text-sm">
                    لا توجد طرق دفع مفعّلة حالياً. يرجى التواصل مع الإدارة.
                  </div>
                ) : (
                  <div className="mt-2 grid gap-2">
                    {availableMethods.map((method) => (
                      <button
                        key={method.key}
                        onClick={() => setSelectedMethod(method.key)}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 text-right transition-all ${
                          selectedMethod === method.key
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          {method.icon}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{method.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {method.key === "bank" && `${bankAccounts.length} حساب متاح`}
                            {method.key === "palpay" && paySettings?.palpayPhone}
                            {method.key === "paypal" && paySettings?.paypalEmail}
                          </div>
                        </div>
                        {selectedMethod === method.key && (
                          <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ======= STEP 2 ======= */}
          {step === 2 && selectedMethod && (
            <>
              {/* Bank Transfer Details */}
              {selectedMethod === "bank" && selectedBank && (
                <div className="space-y-3">
                  {/* Bank Selector if multiple */}
                  {bankAccounts.length > 1 && (
                    <div className="flex gap-2 flex-wrap">
                      {bankAccounts.map((acc, idx) => (
                        <button
                          key={acc.id}
                          onClick={() => setSelectedBankIdx(idx)}
                          className={`px-3 py-1 rounded-full text-xs border transition-all ${
                            selectedBankIdx === idx
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {acc.bankName || `حساب ${idx + 1}`}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-400" />
                      {selectedBank.bankName || "بيانات التحويل البنكي"}
                    </h4>
                    {selectedBank.accountHolder && (
                      <InfoRow label="اسم صاحب الحساب" value={selectedBank.accountHolder} onCopy={() => copyToClipboard(selectedBank.accountHolder, "الاسم")} />
                    )}
                    {selectedBank.accountNumber && (
                      <InfoRow label="رقم الحساب" value={selectedBank.accountNumber} onCopy={() => copyToClipboard(selectedBank.accountNumber, "رقم الحساب")} />
                    )}
                    {selectedBank.iban && (
                      <InfoRow label="IBAN" value={selectedBank.iban} onCopy={() => copyToClipboard(selectedBank.iban, "IBAN")} />
                    )}
                    {selectedBank.phone && (
                      <InfoRow label="رقم الجوال" value={selectedBank.phone} onCopy={() => copyToClipboard(selectedBank.phone, "رقم الجوال")} />
                    )}
                    {selectedBank.qrCode && (
                      <div className="mt-3 flex flex-col items-center gap-2 p-3 bg-white rounded-lg border">
                        <p className="text-xs text-gray-600 font-medium">امسح QR Code للدفع الفوري</p>
                        <img src={selectedBank.qrCode} alt="QR Code" className="w-36 h-36 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                      </div>
                    )}
                  </div>

                  {/* Currency */}
                  <div>
                    <Label className="text-xs">عملة التحويل</Label>
                    <div className="flex gap-2 mt-1">
                      {(["USD", "ILS"] as const).map(c => (
                        <button
                          key={c}
                          onClick={() => setCurrency(c)}
                          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                            currency === c ? "border-primary bg-primary/10 text-primary" : "border-border"
                          }`}
                        >
                          {c === "USD" ? "دولار (USD)" : "شيكل (ILS)"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Receipt Upload */}
                  <div>
                    <Label className="text-xs font-medium">صورة إيصال التحويل *</Label>
                    <div
                      className="mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileRef.current?.click()}
                    >
                      {receiptPreview ? (
                        <div className="relative">
                          <img src={receiptPreview} alt="إيصال" className="max-h-32 mx-auto rounded object-contain" />
                          <button
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                            onClick={(e) => { e.stopPropagation(); setReceiptFile(null); setReceiptPreview(""); }}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">اضغط لرفع صورة الإيصال</p>
                          <p className="text-xs text-muted-foreground">JPG, PNG - حد أقصى 5MB</p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              )}

              {/* PalPay Details */}
              {selectedMethod === "palpay" && (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-4 space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-green-400" />
                      بيانات PalPay
                    </h4>
                    {paySettings?.palpayPhone && (
                      <InfoRow label="رقم الهاتف" value={paySettings.palpayPhone} onCopy={() => copyToClipboard(paySettings.palpayPhone, "رقم الهاتف")} />
                    )}
                    {paySettings?.palpayAccountName && (
                      <InfoRow label="اسم الحساب" value={paySettings.palpayAccountName} onCopy={() => copyToClipboard(paySettings.palpayAccountName, "اسم الحساب")} />
                    )}
                    {paySettings?.palpayNote && (
                      <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 mt-1">
                        💬 {paySettings.palpayNote}
                      </div>
                    )}
                    {(paySettings as any)?.palpayQr && (
                      <div className="mt-3 flex flex-col items-center gap-2 p-3 bg-white rounded-lg border">
                        <p className="text-xs text-gray-600 font-medium">امسح QR Code للدفع عبر PalPay</p>
                        <img src={(paySettings as any).palpayQr} alt="QR Code PalPay" className="w-36 h-36 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                      </div>
                    )}
                  </div>

                  {/* Receipt Upload */}
                  <div>
                    <Label className="text-xs font-medium">صورة إيصال التحويل *</Label>
                    <div
                      className="mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileRef.current?.click()}
                    >
                      {receiptPreview ? (
                        <div className="relative">
                          <img src={receiptPreview} alt="إيصال" className="max-h-32 mx-auto rounded object-contain" />
                          <button
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                            onClick={(e) => { e.stopPropagation(); setReceiptFile(null); setReceiptPreview(""); }}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">اضغط لرفع صورة الإيصال</p>
                          <p className="text-xs text-muted-foreground">JPG, PNG - حد أقصى 5MB</p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              )}

              {/* PayPal Details */}
              {selectedMethod === "paypal" && (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-indigo-500/5 border-indigo-500/20 p-4 space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-indigo-400" />
                      بيانات PayPal
                    </h4>
                    {paySettings?.paypalEmail && (
                      <InfoRow label="البريد الإلكتروني" value={paySettings.paypalEmail} onCopy={() => copyToClipboard(paySettings.paypalEmail, "البريد")} />
                    )}
                    {paySettings?.paypalLink && (
                      <div>
                        <Label className="text-xs text-muted-foreground">رابط الدفع المباشر</Label>
                        <a
                          href={paySettings.paypalLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block mt-1 text-sm text-indigo-400 hover:underline truncate"
                        >
                          {paySettings.paypalLink}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Receipt Upload */}
                  <div>
                    <Label className="text-xs font-medium">صورة إيصال الدفع *</Label>
                    <div
                      className="mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileRef.current?.click()}
                    >
                      {receiptPreview ? (
                        <div className="relative">
                          <img src={receiptPreview} alt="إيصال" className="max-h-32 mx-auto rounded object-contain" />
                          <button
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                            onClick={(e) => { e.stopPropagation(); setReceiptFile(null); setReceiptPreview(""); }}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">اضغط لرفع صورة الإيصال</p>
                          <p className="text-xs text-muted-foreground">JPG, PNG - حد أقصى 5MB</p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t shrink-0">
          {step === 2 ? (
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          )}

          {step === 1 ? (
            <Button
              onClick={() => setStep(2)}
              disabled={!selectedMethod}
              className="gap-2"
            >
              التالي
              <ArrowLeft className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!receiptFile || submitBankMutation.isPending}
              className="gap-2"
            >
              {submitBankMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              إرسال الطلب
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper component for info rows with copy button
function InfoRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-mono font-medium truncate">{value}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onCopy} className="h-7 w-7 p-0 shrink-0">
        <Copy className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
