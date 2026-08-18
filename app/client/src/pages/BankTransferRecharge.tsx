import { useState, useRef } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle, XCircle, Clock, DollarSign, Image as ImageIcon } from "lucide-react";
import { formatDateTime as _fmtDT } from '@/lib/dateFormat';
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent } from "../components/ui/dialog";

export default function BankTransferRecharge() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: myRequests, refetch } = trpc.bankTransfer.getMy.useQuery();
  const submitMutation = trpc.bankTransfer.submitRequest.useMutation();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار صورة فقط");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5 ميجابايت");
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error("يرجى رفع صورة إشعار التحويل");
      return;
    }

    setIsSubmitting(true);

    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const raw = reader.result as string;
          // إزالة prefix مثل data:image/jpeg;base64,
          resolve(raw.includes(',') ? raw.split(',')[1] : raw);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      const result = await submitMutation.mutateAsync({
        requestedAmount: 0, // المبلغ يُحدده المدير
        receiptImage: {
          data: base64,
          filename: selectedFile.name,
          mimeType: selectedFile.type,
        },
      });

      toast.success("تم رفع إشعارك بنجاح! سيتم المراجعة في أسرع وقت", {
        duration: 5000,
        description: "سيتم إشعارك بمجرد الموافقة على طلبك وإضافة الرصيد إلى محفظتك"
      });
      
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      refetch();
    } catch (error: any) {
      toast.error(error.message || "فشل إرسال الطلب");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30"><Clock className="w-3 h-3 ml-1" /> بانتظار المراجعة</Badge>;
      case "approved":
        return <Badge className="bg-green-500/20 text-green-600 border-green-500/30"><CheckCircle className="w-3 h-3 ml-1" /> تمت الموافقة</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/20 text-red-600 border-red-500/30"><XCircle className="w-3 h-3 ml-1" /> مرفوض</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <DollarSign className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">شحن الرصيد عبر بنك فلسطين</h1>
          <p className="text-muted-foreground">قم برفع صورة إشعار التحويل لشحن رصيدك</p>
        </div>
      </div>

      {/* Upload Form */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">طلب شحن جديد</h2>
        
        <div className="space-y-4">
          <div>
            <Label>صورة إشعار التحويل</Label>
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id="receipt-upload"
              />
              <label
                htmlFor="receipt-upload"
                className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="max-h-60 object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="w-12 h-12" />
                    <span>اضغط لرفع صورة الإشعار</span>
                    <span className="text-sm">PNG, JPG, JPEG (حتى 5MB)</span>
                  </div>
                )}
              </label>
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h3 className="font-semibold text-blue-600 mb-2">ملاحظات مهمة:</h3>
            <ul className="text-sm space-y-1 text-blue-600/80">
              <li>• تأكد من وضوح الصورة وظهور جميع التفاصيل</li>
              <li>• يجب أن يظهر الرقم المرجعي بوضوح</li>
              <li>• يجب أن يظهر المبلغ المحوّل والعملة</li>
              <li>• سيتم مراجعة طلبك من قبل الإدارة خلال 24 ساعة</li>
              <li>• العملات المدعومة: دولار أمريكي (USD) و شيكل إسرائيلي (ILS)</li>
            </ul>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!selectedFile || isSubmitting}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                جاري المعالجة...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 ml-2" />
                إرسال طلب الشحن
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Requests History */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">طلباتي السابقة</h2>
        
        {!myRequests || !myRequests.requests || myRequests.requests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>لا توجد طلبات سابقة</p>
          </div>
        ) : (
          <div className="space-y-4">
            {myRequests.requests.map((request: any) => (
              <div
                key={request.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">طلب #{request.id}</span>
                      {getStatusBadge(request.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {_fmtDT(request.submittedAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedImage(request.receiptImageUrl)}
                  >
                    <ImageIcon className="w-4 h-4 ml-1" />
                    عرض الإشعار
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">المبلغ المحوّل:</span>
                    <p className="font-semibold">{request.transferredAmount} {request.transferredCurrency}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">سعر التحويل:</span>
                    <p className="font-semibold">{parseFloat(request.exchangeRate || '1').toFixed(4)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">المبلغ النهائي:</span>
                    <p className="font-semibold text-green-600">${parseFloat(request.finalAmountUSD || '0').toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">الرقم المرجعي:</span>
                    <p className="font-semibold">{request.referenceNumber || "N/A"}</p>
                  </div>
                </div>

                {request.status === "rejected" && request.adminNotes && (
                  <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded p-3">
                    <span className="text-sm font-semibold text-red-600">سبب الرفض:</span>
                    <p className="text-sm text-red-600/80 mt-1">{request.adminNotes}</p>
                  </div>
                )}

                {request.status === "approved" && request.reviewedAt && (
                  <div className="mt-3 bg-green-500/10 border border-green-500/30 rounded p-3 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4 inline ml-1" />
                    تمت الموافقة في {_fmtDT(request.reviewedAt)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Image Viewer Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          {selectedImage && (
            <img src={selectedImage} alt="Receipt" className="w-full h-auto" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
