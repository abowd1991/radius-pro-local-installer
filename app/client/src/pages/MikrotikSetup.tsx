import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { Check, Copy, Globe, Link2, Router, Server, Settings, Shield, Wifi } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function MikrotikSetup() {
  const { user } = useAuth();
  const { language, t, direction } = useLanguage();
  const [selectedNasId, setSelectedNasId] = useState<string>("");
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  // Fetch NAS devices
  const { data: nasDevices, isLoading: nasLoading } = trpc.nas.list.useQuery();

  const selectedNas = nasDevices?.find((nas: any) => nas.id.toString() === selectedNasId);

  // Fetch setup scripts from API
  const { data: setupData, isLoading: scriptsLoading } = trpc.nas.getSetupScripts.useQuery(
    { id: parseInt(selectedNasId) },
    { enabled: !!selectedNasId }
  );

  const connectionType = selectedNas?.connectionType || "public_ip";

  const copyToClipboard = async (text: string, commandId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(commandId);
      toast.success(language === 'ar' ? 'تم النسخ بنجاح' : 'Copied successfully');
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (err) {
      toast.error(language === 'ar' ? 'فشل النسخ' : 'Failed to copy');
    }
  };

  // Get icon for script category
  const getScriptIcon = (category: string) => {
    switch (category) {
      case 'vpn': return <Link2 className="h-5 w-5" />;
      case 'radius': return <Server className="h-5 w-5" />;
      case 'hotspot': return <Wifi className="h-5 w-5" />;
      case 'pppoe': return <Router className="h-5 w-5" />;
      default: return <Settings className="h-5 w-5" />;
    }
  };

  if (!user) {
    return null;
  }

  return (
      <div className="space-y-6" dir={direction}>
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {language === 'ar' ? 'اتصال ميكروتك' : 'MikroTik Connection'}
            </h1>
            <p className="text-muted-foreground">
              {language === 'ar' 
                ? 'نقطة اتصال من الميكروتك الى النظام'
                : 'Connection point from MikroTik to the system'}
            </p>
          </div>
        </div>

        {/* NAS Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Router className="h-5 w-5" />
              {language === 'ar' ? 'اختر جهاز NAS' : 'Select NAS Device'}
            </CardTitle>
            <CardDescription>
              {language === 'ar' 
                ? 'اختر جهاز MikroTik لعرض أوامر الإعداد الخاصة به'
                : 'Select a MikroTik device to view its setup commands'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {nasLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={selectedNasId} onValueChange={setSelectedNasId}>
                <SelectTrigger className="w-full md:w-[400px]">
                  <SelectValue placeholder={language === 'ar' ? 'اختر جهاز...' : 'Select device...'} />
                </SelectTrigger>
                <SelectContent>
                  {nasDevices?.map((nas: any) => (
                    <SelectItem key={nas.id} value={nas.id.toString()}>
                      {nas.shortname} - {nas.nasname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Commands Section */}
        {selectedNasId && (
          <Card className="bg-slate-900 text-white border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <span>{language === 'ar' ? 'أوامر الإعداد' : 'Setup Commands'}</span>
                {setupData?.combinedScript && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => copyToClipboard(setupData.combinedScript, 'all')}
                  >
                    {copiedCommand === 'all' ? (
                      <>
                        <Check className="h-4 w-4 ml-2" />
                        {language === 'ar' ? 'تم النسخ' : 'Copied'}
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 ml-2" />
                        {language === 'ar' ? 'نسخ الكل' : 'Copy All'}
                      </>
                    )}
                  </Button>
                )}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {language === 'ar'
                  ? `أوامر إعداد ${selectedNas?.shortname} - نوع الاتصال: ${
                      connectionType === 'public_ip' ? 'اي بي عالمي' :
                      connectionType === 'vpn_l2tp' ? 'VPN L2TP' : 'VPN SSTP'
                    }`
                  : `Setup commands for ${selectedNas?.shortname} - Connection type: ${connectionType}`}
              </CardDescription>

            </CardHeader>
            <CardContent className="space-y-4">
              {scriptsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 w-full bg-slate-800" />
                  ))}
                </div>
              ) : setupData?.scripts?.map((script) => (
                <div key={script.id} className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden">
                  {/* Command Header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-700/50">
                    <div className="flex items-center gap-2">
                      {getScriptIcon(script.category)}
                      <span className="font-medium text-white">
                        {language === 'ar' ? script.titleAr : script.title}
                      </span>
                      {script.required && (
                        <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded">
                          {language === 'ar' ? 'مطلوب' : 'Required'}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      onClick={() => copyToClipboard(script.command, script.id)}
                    >
                      {copiedCommand === script.id ? (
                        <>
                          <Check className="h-3 w-3 ml-1" />
                          {language === 'ar' ? 'تم' : 'Done'}
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 ml-1" />
                          {language === 'ar' ? 'نسخ' : 'Copy'}
                        </>
                      )}
                    </Button>
                  </div>
                  {/* Command Content */}
                  <div className="p-4">
                    <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap break-all" dir="ltr">
                      {script.command}
                    </pre>
                  </div>
                  {/* Description */}
                  <div className="px-4 pb-3 border-t border-slate-700 pt-2">
                    <p className="text-xs text-slate-400">
                      {language === 'ar' ? script.descriptionAr : script.description}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Instructions Card */}
        {!selectedNasId && (
          <Card>
            <CardHeader>
              <CardTitle>
                {language === 'ar' ? 'تعليمات الإعداد' : 'Setup Instructions'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {language === 'ar' ? 'أضف جهاز NAS' : 'Add NAS Device'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar'
                        ? 'قم بإضافة جهاز MikroTik من صفحة أجهزة NAS أولاً'
                        : 'Add your MikroTik device from the NAS Devices page first'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {language === 'ar' ? 'اختر الجهاز' : 'Select Device'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar'
                        ? 'اختر الجهاز من القائمة أعلاه لعرض الأوامر'
                        : 'Select the device from the list above to view commands'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {language === 'ar' ? 'انسخ الأوامر' : 'Copy Commands'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar'
                        ? 'انسخ كل أمر والصقه في Terminal الخاص بـ MikroTik'
                        : 'Copy each command and paste it in MikroTik Terminal'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    4
                  </div>
                  <div>
                    <h4 className="font-medium">
                      {language === 'ar' ? 'اختبر الاتصال' : 'Test Connection'}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar'
                        ? 'تأكد من نجاح الاتصال عبر اختبار مستخدم RADIUS'
                        : 'Verify connection by testing a RADIUS user'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
  );
}
