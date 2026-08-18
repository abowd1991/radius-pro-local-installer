import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function EmailVerification() {
  const { user } = useAuth();
  const { language, direction } = useLanguage();
  const [verificationCode, setVerificationCode] = useState("");

  const sendCode = trpc.auth.resendVerificationCode.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم إرسال رمز التحقق إلى بريدك الإلكتروني" : "Verification code sent to your email");
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const verifyCode = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      toast.success(language === "ar" ? "تم تفعيل البريد الإلكتروني بنجاح" : "Email verified successfully");
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleSendCode = () => {
    if (!user?.email) return;
    sendCode.mutate({ email: user.email });
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!verificationCode.trim()) {
      toast.error(language === "ar" ? "الرجاء إدخال رمز التحقق" : "Please enter verification code");
      return;
    }
    if (!user.email) return;
    verifyCode.mutate({ email: user.email, code: verificationCode });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {language === "ar" ? "تفعيل البريد الإلكتروني" : "Email Verification"}
          </CardTitle>
          <CardDescription>
            {language === "ar" 
              ? "قم بتفعيل بريدك الإلكتروني لتأمين حسابك والحصول على جميع الميزات"
              : "Verify your email to secure your account and access all features"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status */}
          <div className={`flex items-center gap-3 p-4 rounded-lg ${user.emailVerified ? "bg-green-50 dark:bg-green-950" : "bg-orange-50 dark:bg-orange-950"}`}>
            {user.emailVerified ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-100">
                    {language === "ar" ? "البريد الإلكتروني مُفعّل" : "Email Verified"}
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    {user.email}
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-medium text-orange-900 dark:text-orange-100">
                    {language === "ar" ? "البريد الإلكتروني غير مُفعّل" : "Email Not Verified"}
                  </p>
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    {user.email}
                  </p>
                </div>
              </>
            )}
          </div>

          {!user.emailVerified && (
            <>
              {/* Send Code */}
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {language === "ar"
                    ? "انقر على الزر أدناه لإرسال رمز التحقق إلى بريدك الإلكتروني"
                    : "Click the button below to send a verification code to your email"}
                </p>
                <Button 
                  onClick={handleSendCode} 
                  disabled={sendCode.isPending}
                  className="w-full"
                >
                  {sendCode.isPending 
                    ? (language === "ar" ? "جاري الإرسال..." : "Sending...") 
                    : (language === "ar" ? "إرسال رمز التحقق" : "Send Verification Code")}
                </Button>
              </div>

              {/* Verify Form */}
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">
                    {language === "ar" ? "رمز التحقق" : "Verification Code"}
                  </Label>
                  <Input
                    id="code"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder={language === "ar" ? "أدخل الرمز المكون من 6 أرقام" : "Enter 6-digit code"}
                    maxLength={6}
                    dir="ltr"
                    className="text-center text-2xl tracking-widest font-mono"
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={verifyCode.isPending}
                  className="w-full"
                  variant="default"
                >
                  {verifyCode.isPending 
                    ? (language === "ar" ? "جاري التحقق..." : "Verifying...") 
                    : (language === "ar" ? "تفعيل البريد الإلكتروني" : "Verify Email")}
                </Button>
              </form>

              {/* Help Text */}
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{language === "ar" ? "لم تستلم الرمز؟" : "Didn't receive the code?"}</p>
                <ul className={`list-disc ${direction === "rtl" ? "mr-5" : "ml-5"} space-y-1`}>
                  <li>{language === "ar" ? "تحقق من مجلد الرسائل غير المرغوب فيها (Spam)" : "Check your spam folder"}</li>
                  <li>{language === "ar" ? "تأكد من صحة عنوان البريد الإلكتروني" : "Make sure your email address is correct"}</li>
                  <li>{language === "ar" ? "انتظر دقيقة واحدة ثم أعد المحاولة" : "Wait 1 minute and try again"}</li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
