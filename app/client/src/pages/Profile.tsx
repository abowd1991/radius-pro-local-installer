import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserRound, Building2, Mail, Phone, MapPin, Camera, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const roleLabel: Record<string, string> = {
  owner: "مالك النظام",
  super_admin: "مدير النظام",
  client_owner: "مالك الشركة",
  client_admin: "مدير الشركة",
  client_staff: "موظف الشركة",
  reseller: "موزع",
  client: "عميل",
  support: "دعم فني",
};

export default function Profile() {
  const { data: user, isLoading, refetch } = trpc.auth.me.useQuery();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({ name: "", companyName: "", phone: "", address: "" });
  const [password, setPassword] = useState({ code: "", next: "", confirm: "" });
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfile({
      name: user.name || "",
      companyName: (user as any).companyName || "",
      phone: user.phone || "",
      address: user.address || "",
    });
  }, [user]);

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ بيانات الملف الشخصي");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateAvatar = trpc.auth.updateAvatar.useMutation({
    onSuccess: () => { toast.success("تم تحديث الصورة الشخصية"); refetch(); },
    onError: (error) => toast.error(error.message),
  });
  const requestPasswordChange = trpc.auth.requestPasswordChange.useMutation({
    onSuccess: () => toast.success("تم إرسال رمز تغيير كلمة المرور إلى بريدك الإلكتروني"),
    onError: (error) => toast.error(error.message),
  });
  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور بنجاح");
      setPassword({ code: "", next: "", confirm: "" });
    },
    onError: (error) => toast.error(error.message),
  });

  const saveProfile = () => updateProfile.mutate(profile);
  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("يرجى اختيار ملف صورة صالح");
    if (file.size > 5 * 1024 * 1024) return toast.error("حجم الصورة يجب ألا يتجاوز 5MB");
    setAvatarUploading(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch("/api/upload/avatar", { method: "POST", body: data });
      if (!response.ok) throw new Error("Upload failed");
      const { url } = await response.json();
      await updateAvatar.mutateAsync({ avatarUrl: url });
    } catch {
      toast.error("تعذر رفع الصورة الشخصية");
    } finally {
      setAvatarUploading(false);
      event.target.value = "";
    }
  };
  const savePassword = () => {
    if (!user?.email) return toast.error("لا يوجد بريد إلكتروني مرتبط بالحساب");
    if (password.next.length < 6) return toast.error("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
    if (password.next !== password.confirm) return toast.error("كلمتا المرور غير متطابقتين");
    resetPassword.mutate({ email: user.email, code: password.code, newPassword: password.next });
  };

  if (isLoading || !user) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  const initials = (user.name || user.username || "U").trim().slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">الملف الشخصي</h1>
        <p className="text-muted-foreground">بيانات حسابك وشركتك وأمان تسجيل الدخول.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
          <div className="relative">
            <Avatar className="h-24 w-24 border-4 border-primary/15">
              <AvatarImage src={(user as any).avatarUrl || undefined} alt={user.name || user.username || ""} />
              <AvatarFallback className="text-2xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            <Button type="button" size="icon" className="absolute -bottom-2 -left-2 rounded-full" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}>
              {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-right">
            <h2 className="text-xl font-bold">{user.name || user.username || "مستخدم"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{user.email || "لا يوجد بريد إلكتروني"}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge variant="secondary"><ShieldCheck className="ml-1 h-3.5 w-3.5" />{roleLabel[user.role] || user.role}</Badge>
              <Badge variant={(user as any).status === "active" ? "default" : "outline"}>{(user as any).status === "active" ? "حساب نشط" : "حساب غير نشط"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" />بيانات الحساب</CardTitle><CardDescription>البيانات الشخصية وبيانات الشركة الظاهرة في حسابك.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label>الاسم</Label><Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>اسم الشركة</Label><Input value={profile.companyName} onChange={(e) => setProfile({ ...profile, companyName: e.target.value })} placeholder="مثال: شركة النور للإنترنت" /></div>
            </div>
            <div className="space-y-2"><Label className="flex items-center gap-1"><Mail className="h-4 w-4" />البريد الإلكتروني</Label><Input value={user.email || ""} disabled /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label className="flex items-center gap-1"><Phone className="h-4 w-4" />الهاتف</Label><Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
              <div className="space-y-2"><Label className="flex items-center gap-1"><MapPin className="h-4 w-4" />العنوان</Label><Input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></div>
            </div>
            <Button onClick={saveProfile} disabled={updateProfile.isPending}>{updateProfile.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ البيانات</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />كلمة المرور</CardTitle><CardDescription>أرسل رمزاً إلى بريدك ثم أدخله لتغيير كلمة المرور.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={() => requestPasswordChange.mutate()} disabled={requestPasswordChange.isPending}>{requestPasswordChange.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إرسال رمز تغيير كلمة المرور</Button>
            <div className="space-y-2"><Label>رمز التحقق</Label><Input value={password.code} onChange={(e) => setPassword({ ...password, code: e.target.value })} inputMode="numeric" /></div>
            <div className="space-y-2"><Label>كلمة المرور الجديدة</Label><Input type="password" value={password.next} onChange={(e) => setPassword({ ...password, next: e.target.value })} /></div>
            <div className="space-y-2"><Label>تأكيد كلمة المرور الجديدة</Label><Input type="password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} /></div>
            <Button onClick={savePassword} disabled={resetPassword.isPending}>{resetPassword.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تغيير كلمة المرور</Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />معلومات الحساب</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3"><div><span className="text-muted-foreground">اسم المستخدم: </span>{user.username || "—"}</div><div><span className="text-muted-foreground">الدور: </span>{roleLabel[user.role] || user.role}</div><div><span className="text-muted-foreground">الحالة: </span>{(user as any).status === "active" ? "نشط" : "غير نشط"}</div></CardContent>
      </Card>
    </div>
  );
}
