import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Link2,
  Copy,
  CheckCircle2,
  ExternalLink,
  RefreshCcw,
  Globe,
  AlertCircle,
  Loader2,
  Check,
  X,
  Info,
  Code2,
  Palette,
  Eye,
  Wifi,
  Settings2,
} from "lucide-react";

const DEFAULT_WIDGET = {
  widgetEnabled: false,
  widgetPrimaryColor: "#0ea5e9",
  widgetBgColor: "#ffffff",
  widgetTextColor: "#1e293b",
  widgetBorderRadius: 12,
  widgetShowPlan: true,
  widgetShowExpiry: true,
  widgetShowTimeLeft: true,
  widgetShowStatus: true,
  widgetShowSpeed: false,
  widgetShowDataLimit: false,
  widgetShowSessions: false,
  widgetTitle: "فحص بيانات كرتك",
  widgetPlaceholder: "أدخل اسم المستخدم",
};

export default function CardCheckSettings() {
  const { language } = useLanguage();
  const ar = language === "ar";

  const { data: tokenData, isLoading, refetch } = trpc.checkTokens.getMyToken.useQuery();
  const { data: widgetData, refetch: refetchWidget } = trpc.checkTokens.getWidgetSettings.useQuery();
  const { data: publicAddress } = trpc.winbox.getPublicAddress.useQuery();
  const vpsAddress = publicAddress?.address ?? "";

  const [slug, setSlug] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken" | "own" | "invalid">("idle");
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingWidget, setIsSavingWidget] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedWalled, setCopiedWalled] = useState(false);

  // Widget state
  const [widget, setWidget] = useState(DEFAULT_WIDGET);

  useEffect(() => {
    if (tokenData) {
      setSlug(tokenData.slug || "");
      setNetworkName(tokenData.networkName || "");
    }
  }, [tokenData]);

  useEffect(() => {
    if (widgetData) {
      // MySQL returns 0/1 for booleans — convert explicitly
      const b = (v: unknown, def: boolean) => v == null ? def : Boolean(v);
      setWidget({
        widgetEnabled: b(widgetData.widgetEnabled, false),
        widgetPrimaryColor: widgetData.widgetPrimaryColor ?? "#0ea5e9",
        widgetBgColor: widgetData.widgetBgColor ?? "#ffffff",
        widgetTextColor: widgetData.widgetTextColor ?? "#1e293b",
        widgetBorderRadius: widgetData.widgetBorderRadius ?? 12,
        widgetShowPlan: b(widgetData.widgetShowPlan, true),
        widgetShowExpiry: b(widgetData.widgetShowExpiry, true),
        widgetShowTimeLeft: b(widgetData.widgetShowTimeLeft, true),
        widgetShowStatus: b(widgetData.widgetShowStatus, true),
        widgetShowSpeed: b(widgetData.widgetShowSpeed, false),
        widgetShowDataLimit: b(widgetData.widgetShowDataLimit, false),
        widgetShowSessions: b(widgetData.widgetShowSessions, false),
        widgetTitle: widgetData.widgetTitle ?? "فحص بيانات كرتك",
        widgetPlaceholder: widgetData.widgetPlaceholder ?? "أدخل اسم المستخدم",
      });
    }
  }, [widgetData]);

  const validateSlug = (val: string) => /^[a-z0-9-]{3,64}$/.test(val);

  const checkSlugQuery = trpc.checkTokens.checkSlugAvailability.useQuery(
    { slug: slug.trim() },
    { enabled: slug.trim().length >= 3 && validateSlug(slug.trim()), refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (slug.trim().length < 3) { setSlugStatus("idle"); return; }
    if (!validateSlug(slug.trim())) { setSlugStatus("invalid"); return; }
    if (checkSlugQuery.isFetching) { setSlugStatus("checking"); return; }
    if (checkSlugQuery.data) {
      setSlugStatus(checkSlugQuery.data.available ? (checkSlugQuery.data.own ? "own" : "available") : "taken");
    }
  }, [slug, checkSlugQuery.isFetching, checkSlugQuery.data]);

  const setSlugMutation = trpc.checkTokens.setSlug.useMutation({
    onSuccess: () => { toast.success(ar ? "تم حفظ الإعدادات" : "Settings saved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const regenerateTokenMutation = trpc.checkTokens.regenerateToken.useMutation({
    onSuccess: () => { toast.success(ar ? "تم تجديد الرابط الاحتياطي" : "Backup link regenerated"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const saveWidgetMutation = trpc.checkTokens.saveWidgetSettings.useMutation({
    onSuccess: () => { toast.success(ar ? "تم حفظ إعدادات الويدجت" : "Widget settings saved"); refetchWidget(); },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = async () => {
    setIsSaving(true);
    try { await setSlugMutation.mutateAsync({ slug: slug.trim(), networkName: networkName.trim() || undefined }); }
    finally { setIsSaving(false); }
  };

  const handleSaveWidget = async () => {
    setIsSavingWidget(true);
    try { await saveWidgetMutation.mutateAsync(widget); }
    finally { setIsSavingWidget(false); }
  };

  const copyToClipboard = useCallback((text: string, type: "link" | "code" | "walled" = "link") => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === "code") { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); }
      else if (type === "walled") { setCopiedWalled(true); setTimeout(() => setCopiedWalled(false), 2000); }
      else { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    });
  }, []);

  const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN || window.location.origin;
  const checkUrl = tokenData?.slug ? `${publicDomain}/check/${tokenData.slug}` : null;
  const backupUrl = tokenData?.token ? `${publicDomain}/check/${tokenData.token}` : null;

  // Generate hotspot widget HTML code
  const generateWidgetCode = () => {
    // HTTPS only — أكثر موثوقية مع MikroTik Walled Garden
    const apiUrl = `https://radius-pro.com/api/check-card`;
    const tokenOrSlug = tokenData?.slug || tokenData?.token || "YOUR_TOKEN";
    const isSlug = !!tokenData?.slug;
    const br = widget.widgetBorderRadius;
    const brInner = Math.max(br - 4, 4);
    const brCard = Math.max(br - 2, 4);

    const dataFields: string[] = [];
    if (widget.widgetShowPlan) dataFields.push(`    if(c.planName) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">الخطة</span><span style="font-weight:600;">'+c.planName+'</span></div>';`);
    if (widget.widgetShowExpiry) dataFields.push(`    if(c.expiresAt){var _ex=c.expiresAt;var _exd=(!_ex.includes('T')&&!_ex.includes('+')&&!_ex.includes('Z'))?new Date(_ex.replace(' ','T'));html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">تاريخ الانتهاء</span><span style="font-weight:600;">'+_exd.toLocaleDateString('ar-PS')+'</span></div>';}`);
    if (widget.widgetShowTimeLeft) dataFields.push(`    var _tLeft=c.timeRemainingSeconds!=null?c.timeRemainingSeconds:(c.budgetRemainingSeconds!=null?c.budgetRemainingSeconds:null);if(_tLeft!=null) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">الوقت المتبقي</span><span style="font-weight:600;color:'+(_tLeft<86400?'#dc2626':'#16a34a')+';">'+rcFmt(_tLeft)+'</span></div>';`);
    if (widget.widgetShowSpeed) dataFields.push(`    if(c.speedMbps) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">السرعة</span><span style="font-weight:600;">'+c.speedMbps+' Mbps</span></div>';`);
    if (widget.widgetShowDataLimit) dataFields.push(`    if(c.dataLimitMb) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">حد البيانات</span><span style="font-weight:600;">'+(c.dataLimitMb>=1024?(c.dataLimitMb/1024).toFixed(1)+' GB':c.dataLimitMb+' MB')+'</span></div>';`);
    if (widget.widgetShowSessions) dataFields.push(`    if(c.lastSessionAgo) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span style="color:#64748b;">آخر جلسة</span><span style="font-weight:600;">'+c.lastSessionAgo+'</span></div>';`);

    return `<!-- ============================================
  كود فحص الكرت - Radius Pro Hotspot Widget
  الإصدار: 1.1 | radius-pro.com
  ============================================ -->
<div id="rc-widget" style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;max-width:360px;margin:16px auto;background:${widget.widgetBgColor};color:${widget.widgetTextColor};border-radius:${br}px;box-shadow:0 4px 20px rgba(0,0,0,0.12);overflow:hidden;">
  <div style="background:${widget.widgetPrimaryColor};padding:14px 18px;">
    <h3 style="margin:0;font-size:15px;font-weight:700;color:#fff;">${widget.widgetTitle}</h3>
  </div>
  <div style="padding:16px;">
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <input id="rc-u" type="text" placeholder="${widget.widgetPlaceholder}" style="flex:1;padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:${brInner}px;font-size:13px;outline:none;background:#f8fafc;direction:ltr;text-align:center;"/>
      <button onclick="rcCheck()" style="background:${widget.widgetPrimaryColor};color:#fff;border:none;border-radius:${brInner}px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;">فحص</button>
    </div>
    <div id="rc-load" style="display:none;text-align:center;padding:10px;color:#94a3b8;font-size:13px;">⏳ جاري الفحص...</div>
    <div id="rc-err" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;color:#dc2626;font-size:13px;text-align:center;"></div>
    <div id="rc-res" style="display:none;"></div>
  </div>
</div>

<script>
var RC_STATUS_COLORS={active:'#16a34a',expired:'#dc2626',used:'#d97706',inactive:'#6b7280'};
var RC_STATUS_LABELS={active:'نشط ✅',expired:'منتهي ❌',used:'مستخدم 🔒',inactive:'معطّل ⛔'};
var RC_ENDPOINTS=['https://hotspot.radius-pro.com/check','https://radius-pro.com/api/check-card','http://${vpsAddress}/check'];
function rcFmt(s){if(!s||s<=0)return'منتهي';var d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60);if(d>0)return d+' يوم'+(h?' '+h+' ساعة':'');if(h>0)return h+' ساعة'+(m?' '+m+' دقيقة':'');return m+' دقيقة';}
function rcRender(data,brCard){
  if(!data.success){return null;}
  var c=data.card;
  var sc=RC_STATUS_COLORS[c.status]||'#6b7280';
  var sl=RC_STATUS_LABELS[c.status]||c.status;
  var html='<div style="border:1.5px solid #e2e8f0;border-radius:'+(brCard||8)+'px;overflow:hidden;">';
  html+='<div style="background:'+sc+';padding:8px 14px;text-align:center;"><span style="color:#fff;font-weight:700;font-size:14px;">'+sl+'</span></div>';
  html+='<div style="padding:12px;">';
${dataFields.join("\n")}
  html+='</div></div>';
  return html;
}
var RC_LOCK_KEY='rc_lock';function rcLockActive(){try{var t=sessionStorage.getItem(RC_LOCK_KEY);return t&&(Date.now()-parseInt(t,10))<5000;}catch(e){return false;}}function rcSetLock(){try{sessionStorage.setItem(RC_LOCK_KEY,String(Date.now()));}catch(e){}}function rcClearLock(){setTimeout(function(){try{sessionStorage.removeItem(RC_LOCK_KEY);}catch(e){}},5000);}
function rcDoRequest(url,body,onSuccess,onFail,attempt){var xhr=new XMLHttpRequest();xhr.open('POST',url,true);xhr.setRequestHeader('Content-Type','application/json');xhr.timeout=20000;xhr.onreadystatechange=function(){if(xhr.readyState!==4)return;if(xhr.status===0){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('تعذّر الاتصال بالخادم');}return;}if(xhr.status!==200){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('خطأ في الخادم');}return;}try{var d=JSON.parse(xhr.responseText);onSuccess(d);}catch(e){onFail('خطأ في البيانات');}};xhr.ontimeout=function(){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('انتهت مهلة الاتصال');};};xhr.onerror=function(){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('تعذّر الاتصال');}};xhr.send(JSON.stringify(body));}
var RC_ENDPOINTS=['https://hotspot.radius-pro.com/check','https://radius-pro.com/api/check-card','http://${vpsAddress}/check'];
function rcTryEndpoints(body,onSuccess,onFail,idx){var i=idx||0;if(i>=RC_ENDPOINTS.length){onFail('تعذّر الاتصال بالخادم');return;}rcDoRequest(RC_ENDPOINTS[i],body,onSuccess,function(){rcTryEndpoints(body,onSuccess,onFail,i+1);});}function rcCheck(){
  if(rcLockActive())return;
  var u=document.getElementById('rc-u').value.trim();
  if(!u){alert('يرجى إدخال اسم المستخدم');return;}
  var btn=document.querySelector('#rc-widget button[onclick="rcCheck()"]');
  var res=document.getElementById('rc-res'),load=document.getElementById('rc-load'),err=document.getElementById('rc-err');
  res.style.display='none';err.style.display='none';load.style.display='block';
  if(btn){btn.disabled=true;btn.textContent='جاري...';}rcSetLock();
  var body={code:u,${isSlug ? `slug:'${tokenOrSlug}'` : `token:'${tokenOrSlug}'`}};
  rcTryEndpoints(body,function(data){
    load.style.display='none';
    if(btn){btn.disabled=false;btn.textContent='فحص';}rcClearLock();
    if(!data.success){err.textContent=data.error||'حدث خطأ';err.style.display='block';return;}
    var html=rcRender(data,${brCard});
    if(html){res.innerHTML=html;res.style.display='block';}
  },function(msg){load.style.display='none';if(btn){btn.disabled=false;btn.textContent='فحص';}rcClearLock();err.textContent=msg||'حدث خطأ';err.style.display='block';});
}
</script>`;
  };

  // ── Generate Login Inline Code ──
  const generateLoginInlineCode = () => {
    const tokenOrSlug = tokenData?.slug || tokenData?.token || "YOUR_TOKEN";
    const isSlug = !!tokenData?.slug;
    const br = widget.widgetBorderRadius;
    const brInner = Math.max(br - 4, 4);
    const brCard = Math.max(br - 2, 4);
    const dataFields: string[] = [];
    if (widget.widgetShowPlan) dataFields.push(`    if(c.planName) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">الخطة</span><span style="font-weight:600;">'+c.planName+'</span></div>';`);
    if (widget.widgetShowExpiry) dataFields.push(`    if(c.expiresAt){var _ex=c.expiresAt;var _exd=(!_ex.includes('T')&&!_ex.includes('+')&&!_ex.includes('Z'))?new Date(_ex.replace(' ','T'));html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">تاريخ الانتهاء</span><span style="font-weight:600;">'+_exd.toLocaleDateString('ar-PS')+'</span></div>';}`);
    if (widget.widgetShowTimeLeft) dataFields.push(`    var _tLeft=c.timeRemainingSeconds!=null?c.timeRemainingSeconds:(c.budgetRemainingSeconds!=null?c.budgetRemainingSeconds:null);if(_tLeft!=null) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">الوقت المتبقي</span><span style="font-weight:600;color:'+(_tLeft<86400?'#dc2626':'#16a34a')+';">'+rcFmt(_tLeft)+'</span></div>';`);
    if (widget.widgetShowSpeed) dataFields.push(`    if(c.speedMbps) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">السرعة</span><span style="font-weight:600;">'+c.speedMbps+'</span></div>';`);
    if (widget.widgetShowDataLimit) dataFields.push(`    if(c.dataLimitMb) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">حد البيانات</span><span style="font-weight:600;">'+(c.dataLimitMb>=1024?(c.dataLimitMb/1024).toFixed(1)+' GB':c.dataLimitMb+' MB')+'</span></div>';`);
    if (widget.widgetShowSessions) dataFields.push(`    if(c.lastSessionAgo) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span style="color:#64748b;">آخر جلسة</span><span style="font-weight:600;">'+c.lastSessionAgo+'</span></div>';`);

    return `<!-- ============================================
  كود دمج فحص الكرت في صفحة Login - Inline
  ضعه داخل <body> في login.html بعد نموذج الدخول
  ============================================ -->
<div id="rc-login-widget" style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;max-width:360px;margin:16px auto;background:${widget.widgetBgColor};color:${widget.widgetTextColor};border-radius:${br}px;box-shadow:0 4px 20px rgba(0,0,0,0.12);overflow:hidden;">
  <div style="background:${widget.widgetPrimaryColor};padding:12px 16px;">
    <h3 style="margin:0;font-size:14px;font-weight:700;color:#fff;">${widget.widgetTitle}</h3>
  </div>
  <div style="padding:14px;">
    <div style="display:flex;gap:7px;margin-bottom:10px;">
      <input id="rc-u" type="text" placeholder="${widget.widgetPlaceholder}" style="flex:1;padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:${brInner}px;font-size:13px;outline:none;background:#f8fafc;direction:ltr;text-align:center;"/>
      <button onclick="rcCheck()" style="background:${widget.widgetPrimaryColor};color:#fff;border:none;border-radius:${brInner}px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;">فحص</button>
    </div>
    <div id="rc-load" style="display:none;text-align:center;padding:8px;color:#94a3b8;font-size:12px;">⏳ جاري الفحص...</div>
    <div id="rc-err" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:7px;padding:9px;color:#dc2626;font-size:12px;text-align:center;"></div>
    <div id="rc-res" style="display:none;"></div>
  </div>
</div>

<script>
var RC_STATUS_COLORS={active:'#16a34a',expired:'#dc2626',used:'#d97706',inactive:'#6b7280'};
var RC_STATUS_LABELS={active:'نشط ✅',expired:'منتهي ❌',used:'مستخدم 🔒',inactive:'معطّل ⛔'};
var RC_ENDPOINTS=['https://hotspot.radius-pro.com/check','https://radius-pro.com/api/check-card','http://${vpsAddress}/check'];
function rcFmt(s){if(!s||s<=0)return'منتهي';var d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60);if(d>0)return d+' يوم'+(h?' '+h+' ساعة':'');if(h>0)return h+' ساعة'+(m?' '+m+' دقيقة':'');return m+' دقيقة';}
function rcRender(data){
  if(!data.success){return null;}
  var c=data.card;
  var sc=RC_STATUS_COLORS[c.status]||'#6b7280';
  var sl=RC_STATUS_LABELS[c.status]||c.status;
  var html='<div style="border:1.5px solid #e2e8f0;border-radius:${brCard}px;overflow:hidden;">';
  html+='<div style="background:'+sc+';padding:7px 12px;text-align:center;"><span style="color:#fff;font-weight:700;font-size:13px;">'+sl+'</span></div>';
  html+='<div style="padding:10px;">';
${dataFields.join("\n")}
  html+='</div></div>';
  return html;
}
var RC_LOCK_KEY='rc_lock';function rcLockActive(){try{var t=sessionStorage.getItem(RC_LOCK_KEY);return t&&(Date.now()-parseInt(t,10))<5000;}catch(e){return false;}}function rcSetLock(){try{sessionStorage.setItem(RC_LOCK_KEY,String(Date.now()));}catch(e){}}function rcClearLock(){setTimeout(function(){try{sessionStorage.removeItem(RC_LOCK_KEY);}catch(e){}},5000);}
function rcDoRequest(url,body,onSuccess,onFail,attempt){var xhr=new XMLHttpRequest();xhr.open('POST',url,true);xhr.setRequestHeader('Content-Type','application/json');xhr.timeout=20000;xhr.onreadystatechange=function(){if(xhr.readyState!==4)return;if(xhr.status===0){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('تعذّر الاتصال بالخادم');}return;}if(xhr.status!==200){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('خطأ في الخادم');}return;}try{var d=JSON.parse(xhr.responseText);onSuccess(d);}catch(e){onFail('خطأ في البيانات');}};xhr.ontimeout=function(){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('انتهت مهلة الاتصال');};};xhr.onerror=function(){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('تعذّر الاتصال');}};xhr.send(JSON.stringify(body));}
function rcTryEndpoints(body,onSuccess,onFail,idx){var i=idx||0;if(i>=RC_ENDPOINTS.length){onFail('تعذّر الاتصال بالخادم');return;}rcDoRequest(RC_ENDPOINTS[i],body,onSuccess,function(){rcTryEndpoints(body,onSuccess,onFail,i+1);}); }
function rcCheck(){
  if(rcLockActive())return;
  var u=document.getElementById('rc-u').value.trim();
  if(!u){alert('يرجى إدخال اسم المستخدم');return;}
  var btn=document.querySelector('#rc-login-widget button[onclick="rcCheck()"]');
  var res=document.getElementById('rc-res'),load=document.getElementById('rc-load'),err=document.getElementById('rc-err');
  res.style.display='none';err.style.display='none';load.style.display='block';
  if(btn){btn.disabled=true;btn.textContent='جاري...';}rcSetLock();
  var body={code:u,${isSlug ? `slug:'${tokenOrSlug}'` : `token:'${tokenOrSlug}'`}};
  rcTryEndpoints(body,function(data){
    load.style.display='none';
    if(btn){btn.disabled=false;btn.textContent='فحص';}rcClearLock();
    if(!data.success){err.textContent=data.error||'حدث خطأ';err.style.display='block';return;}
    var html=rcRender(data,${brCard});
    if(html){res.innerHTML=html;res.style.display='block';}
  },function(msg){load.style.display='none';if(btn){btn.disabled=false;btn.textContent='فحص';}rcClearLock();err.textContent=msg||'حدث خطأ';err.style.display='block';});
}
</script>`;
  };

  // ── Generate Login Popup Code ──
  const generateLoginPopupCode = () => {
    const tokenOrSlug = tokenData?.slug || tokenData?.token || "YOUR_TOKEN";
    const isSlug = !!tokenData?.slug;
    const br = widget.widgetBorderRadius;
    const brInner = Math.max(br - 4, 4);
    const brCard = Math.max(br - 2, 4);
    const dataFields: string[] = [];
    if (widget.widgetShowPlan) dataFields.push(`    if(c.planName) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">الخطة</span><span style="font-weight:600;">'+c.planName+'</span></div>';`);
    if (widget.widgetShowExpiry) dataFields.push(`    if(c.expiresAt){var _ex=c.expiresAt;var _exd=(!_ex.includes('T')&&!_ex.includes('+')&&!_ex.includes('Z'))?new Date(_ex.replace(' ','T'));html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">تاريخ الانتهاء</span><span style="font-weight:600;">'+_exd.toLocaleDateString('ar-PS')+'</span></div>';}`);
    if (widget.widgetShowTimeLeft) dataFields.push(`    var _tLeft=c.timeRemainingSeconds!=null?c.timeRemainingSeconds:(c.budgetRemainingSeconds!=null?c.budgetRemainingSeconds:null);if(_tLeft!=null) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">الوقت المتبقي</span><span style="font-weight:600;color:'+(_tLeft<86400?'#dc2626':'#16a34a')+';">'+rcFmt(_tLeft)+'</span></div>';`);
    if (widget.widgetShowSpeed) dataFields.push(`    if(c.speedMbps) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">السرعة</span><span style="font-weight:600;">'+c.speedMbps+'</span></div>';`);
    if (widget.widgetShowDataLimit) dataFields.push(`    if(c.dataLimitMb) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">حد البيانات</span><span style="font-weight:600;">'+(c.dataLimitMb>=1024?(c.dataLimitMb/1024).toFixed(1)+' GB':c.dataLimitMb+' MB')+'</span></div>';`);
    if (widget.widgetShowSessions) dataFields.push(`    if(c.lastSessionAgo) html+='<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;"><span style="color:#64748b;">آخر جلسة</span><span style="font-weight:600;">'+c.lastSessionAgo+'</span></div>';`);

    return `<!-- ============================================
  كود زر Popup فحص الكرت في صفحة Login
  ضعه داخل <body> في login.html — يظهر زر صغير
  يفتح نافذة منبثقة عند الضغط عليه
  ============================================ -->

<!-- زر فحص الكرت — ضعه بجانب زر الدخول أو أسفله -->
<button onclick="rcOpenPopup()" style="background:transparent;color:${widget.widgetPrimaryColor};border:1.5px solid ${widget.widgetPrimaryColor};border-radius:${brInner}px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">🔍 فحص كرتي</button>

<!-- Modal Overlay -->
<div id="rc-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;align-items:center;justify-content:center;padding:16px;">
  <div style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;width:100%;max-width:360px;background:${widget.widgetBgColor};color:${widget.widgetTextColor};border-radius:${br}px;box-shadow:0 8px 40px rgba(0,0,0,0.3);overflow:hidden;">
    <div style="background:${widget.widgetPrimaryColor};padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
      <h3 style="margin:0;font-size:14px;font-weight:700;color:#fff;">${widget.widgetTitle}</h3>
      <button onclick="rcClosePopup()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:14px;line-height:1;">×</button>
    </div>
    <div style="padding:14px;">
      <div style="display:flex;gap:7px;margin-bottom:10px;">
        <input id="rc-pu" type="text" placeholder="${widget.widgetPlaceholder}" style="flex:1;padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:${brInner}px;font-size:13px;outline:none;background:#f8fafc;direction:ltr;text-align:center;"/>
        <button onclick="rcPopupCheck()" style="background:${widget.widgetPrimaryColor};color:#fff;border:none;border-radius:${brInner}px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;">فحص</button>
      </div>
      <div id="rc-pload" style="display:none;text-align:center;padding:8px;color:#94a3b8;font-size:12px;">⏳ جاري الفحص...</div>
      <div id="rc-perr" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:7px;padding:9px;color:#dc2626;font-size:12px;text-align:center;"></div>
      <div id="rc-pres" style="display:none;"></div>
    </div>
  </div>
</div>

<script>
var RC_STATUS_COLORS={active:'#16a34a',expired:'#dc2626',used:'#d97706',inactive:'#6b7280'};
var RC_STATUS_LABELS={active:'نشط ✅',expired:'منتهي ❌',used:'مستخدم 🔒',inactive:'معطّل ⛔'};
var RC_ENDPOINTS=['https://hotspot.radius-pro.com/check','https://radius-pro.com/api/check-card','http://${vpsAddress}/check'];
function rcFmt(s){if(!s||s<=0)return'منتهي';var d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60);if(d>0)return d+' يوم'+(h?' '+h+' ساعة':'');if(h>0)return h+' ساعة'+(m?' '+m+' دقيقة':'');return m+' دقيقة';}
function rcOpenPopup(){var m=document.getElementById('rc-modal');m.style.display='flex';setTimeout(function(){document.getElementById('rc-pu').focus();},100);}
function rcClosePopup(){var m=document.getElementById('rc-modal');m.style.display='none';document.getElementById('rc-pu').value='';document.getElementById('rc-pres').style.display='none';document.getElementById('rc-perr').style.display='none';}
document.getElementById('rc-modal').addEventListener('click',function(e){if(e.target===this)rcClosePopup();});
function rcRenderP(data){
  if(!data.success){return null;}
  var c=data.card;
  var sc=RC_STATUS_COLORS[c.status]||'#6b7280';
  var sl=RC_STATUS_LABELS[c.status]||c.status;
  var html='<div style="border:1.5px solid #e2e8f0;border-radius:${brCard}px;overflow:hidden;">';
  html+='<div style="background:'+sc+';padding:7px 12px;text-align:center;"><span style="color:#fff;font-weight:700;font-size:13px;">'+sl+'</span></div>';
  html+='<div style="padding:10px;">';
${dataFields.join("\n")}
  html+='</div></div>';
  return html;
}
var RC_LOCK_KEY='rc_plock';function rcLockActive(){try{var t=sessionStorage.getItem(RC_LOCK_KEY);return t&&(Date.now()-parseInt(t,10))<5000;}catch(e){return false;}}function rcSetLock(){try{sessionStorage.setItem(RC_LOCK_KEY,String(Date.now()));}catch(e){}}function rcClearLock(){setTimeout(function(){try{sessionStorage.removeItem(RC_LOCK_KEY);}catch(e){}},5000);}
function rcDoRequest(url,body,onSuccess,onFail,attempt){var xhr=new XMLHttpRequest();xhr.open('POST',url,true);xhr.setRequestHeader('Content-Type','application/json');xhr.timeout=10000;xhr.onreadystatechange=function(){if(xhr.readyState!==4)return;if(xhr.status===0){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('تعذّر الاتصال بالخادم');}return;}if(xhr.status!==200){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('خطأ في الخادم');}return;}try{var d=JSON.parse(xhr.responseText);onSuccess(d);}catch(e){onFail('خطأ في البيانات');}};xhr.ontimeout=function(){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('انتهت مهلة الاتصال');};};xhr.onerror=function(){if((attempt||1)<3){setTimeout(function(){rcDoRequest(url,body,onSuccess,onFail,(attempt||1)+1);},1000);}else{onFail('تعذّر الاتصال');}};xhr.send(JSON.stringify(body));}
function rcTryEndpoints(body,onSuccess,onFail,idx){var i=idx||0;if(i>=RC_ENDPOINTS.length){onFail('تعذّر الاتصال بالخادم');return;}rcDoRequest(RC_ENDPOINTS[i],body,onSuccess,function(){rcTryEndpoints(body,onSuccess,onFail,i+1);});}
function rcPopupCheck(){
  var u=document.getElementById('rc-pu').value.trim();
  if(!u){alert('يرجى إدخال اسم المستخدم');return;}
  if(rcLockActive())return;
  var btn=document.querySelector('#rc-modal button[onclick="rcPopupCheck()"]');
  var res=document.getElementById('rc-pres'),load=document.getElementById('rc-pload'),err=document.getElementById('rc-perr');
  res.style.display='none';err.style.display='none';load.style.display='block';
  if(btn){btn.disabled=true;btn.textContent='جاري...';}rcSetLock();
  var body={code:u,${isSlug ? `slug:'${tokenOrSlug}'` : `token:'${tokenOrSlug}'`}};
  rcTryEndpoints(body,function(data){
    load.style.display='none';
    if(btn){btn.disabled=false;btn.textContent='فحص';}rcClearLock();
    if(!data.success){err.textContent=data.error||'حدث خطأ';err.style.display='block';return;}
    var html=rcRender(data,10);
    if(html){res.innerHTML=html;res.style.display='block';}
  },function(msg){load.style.display='none';if(btn){btn.disabled=false;btn.textContent='فحص';}rcClearLock();err.textContent=msg||'حدث خطأ';err.style.display='block';});
}
</script>`;
  };

  // ── Shared card result preview ──
  const CardResultPreview = ({ compact = false }: { compact?: boolean }) => (
    <div style={{ border: "1.5px solid #e2e8f0", borderRadius: `${Math.max(widget.widgetBorderRadius - 2, 4)}px`, overflow: "hidden" }}>
      <div style={{ background: "#16a34a", padding: compact ? "6px 10px" : "7px 12px", textAlign: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: compact ? "11px" : "12px" }}>نشط ✅</span>
      </div>
      <div style={{ padding: compact ? "8px" : "10px", display: "grid", gap: "4px" }}>
        {widget.widgetShowPlan && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>الخطة</span><span style={{ fontWeight: 600 }}>باقة 1 ميغا</span></div>}
        {widget.widgetShowExpiry && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>تاريخ الانتهاء</span><span style={{ fontWeight: 600 }}>2026/06/01</span></div>}
        {widget.widgetShowTimeLeft && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>الوقت المتبقي</span><span style={{ fontWeight: 600, color: "#16a34a" }}>27 يوم</span></div>}
        {widget.widgetShowSpeed && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>السرعة</span><span style={{ fontWeight: 600 }}>1 Mbps</span></div>}
        {widget.widgetShowDataLimit && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>حد البيانات</span><span style={{ fontWeight: 600 }}>50 GB</span></div>}
        {widget.widgetShowSessions && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>آخر جلسة</span><span style={{ fontWeight: 600 }}>منذ ساعة</span></div>}
      </div>
    </div>
  );

  // ── Login page mock (shared frame) ──
  const LoginPageFrame = ({ children }: { children: React.ReactNode }) => (
    <div style={{ background: "#1e293b", borderRadius: "10px", padding: "16px", fontFamily: "'Segoe UI',Tahoma,Arial,sans-serif", direction: "rtl" }}>
      {/* Mock MikroTik login form */}
      <div style={{ background: "#0f172a", borderRadius: "8px", padding: "14px", marginBottom: "10px", border: "1px solid #334155" }}>
        <div style={{ textAlign: "center", marginBottom: "10px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0" }}>🌐 تسجيل الدخول</div>
          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>Hotspot Login</div>
        </div>
        <div style={{ display: "grid", gap: "6px" }}>
          <input readOnly placeholder="اسم المستخدم" style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#1e293b", color: "#94a3b8", fontSize: "11px", boxSizing: "border-box" }} />
          <input readOnly type="password" placeholder="كلمة المرور" style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#1e293b", color: "#94a3b8", fontSize: "11px", boxSizing: "border-box" }} />
          <div style={{ background: widget.widgetPrimaryColor, color: "#fff", textAlign: "center", padding: "8px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>دخول</div>
        </div>
      </div>
      {/* Injected widget area */}
      {children}
    </div>
  );

  // Live Preview component
  const WidgetPreview = () => (
    <div style={{ fontFamily: "'Segoe UI',Tahoma,Arial,sans-serif", direction: "rtl", maxWidth: "320px", margin: "0 auto", background: widget.widgetBgColor, color: widget.widgetTextColor, borderRadius: `${widget.widgetBorderRadius}px`, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", overflow: "hidden", border: "1px solid #e2e8f0" }}>
      <div style={{ background: widget.widgetPrimaryColor, padding: "12px 16px" }}>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#fff" }}>{widget.widgetTitle}</h3>
      </div>
      <div style={{ padding: "14px" }}>
        <div style={{ display: "flex", gap: "7px", marginBottom: "10px" }}>
          <input readOnly placeholder={widget.widgetPlaceholder} style={{ flex: 1, padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: `${Math.max(widget.widgetBorderRadius - 4, 4)}px`, fontSize: "12px", background: "#f8fafc", color: widget.widgetTextColor, direction: "ltr", textAlign: "center" }} />
          <div style={{ background: widget.widgetPrimaryColor, color: "#fff", borderRadius: `${Math.max(widget.widgetBorderRadius - 4, 4)}px`, padding: "8px 12px", fontSize: "12px", fontWeight: 600, cursor: "default", whiteSpace: "nowrap" }}>فحص</div>
        </div>
        <div style={{ border: "1.5px solid #e2e8f0", borderRadius: `${Math.max(widget.widgetBorderRadius - 2, 4)}px`, overflow: "hidden" }}>
          <div style={{ background: "#16a34a", padding: "7px 12px", textAlign: "center" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: "12px" }}>نشط ✅</span>
          </div>
          <div style={{ padding: "10px", display: "grid", gap: "5px" }}>
            {widget.widgetShowPlan && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>الخطة</span><span style={{ fontWeight: 600 }}>باقة 1 ميغا</span></div>}
            {widget.widgetShowExpiry && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>تاريخ الانتهاء</span><span style={{ fontWeight: 600 }}>2026/06/01</span></div>}
            {widget.widgetShowTimeLeft && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>الوقت المتبقي</span><span style={{ fontWeight: 600, color: "#16a34a" }}>27 يوم</span></div>}
            {widget.widgetShowSpeed && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>السرعة</span><span style={{ fontWeight: 600 }}>1 Mbps</span></div>}
            {widget.widgetShowDataLimit && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>حد البيانات</span><span style={{ fontWeight: 600 }}>50 GB</span></div>}
            {widget.widgetShowSessions && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}><span style={{ color: "#64748b" }}>آخر جلسة</span><span style={{ fontWeight: 600 }}>منذ ساعة</span></div>}
          </div>
        </div>
      </div>
    </div>
  );

  const SlugStatusIcon = () => {
    if (slugStatus === "checking") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (slugStatus === "available" || slugStatus === "own") return <Check className="h-4 w-4 text-emerald-500" />;
    if (slugStatus === "taken") return <X className="h-4 w-4 text-red-500" />;
    if (slugStatus === "invalid") return <AlertCircle className="h-4 w-4 text-amber-500" />;
    return null;
  };

  const slugStatusColor = () => {
    if (slugStatus === "available" || slugStatus === "own") return "text-emerald-600";
    if (slugStatus === "taken") return "text-red-500";
    if (slugStatus === "invalid") return "text-amber-500";
    return "text-muted-foreground";
  };

  const slugStatusText = () => {
    if (slugStatus === "checking") return ar ? "جاري التحقق..." : "Checking...";
    if (slugStatus === "available") return ar ? "✓ متاح" : "✓ Available";
    if (slugStatus === "own") return ar ? "✓ هذا رابطك الحالي" : "✓ Your current slug";
    if (slugStatus === "taken") return ar ? "✗ محجوز، جرب اسماً آخر" : "✗ Taken, try another";
    if (slugStatus === "invalid") return ar ? "فقط حروف إنجليزية صغيرة وأرقام وشرطة (-)" : "Only lowercase letters, numbers and hyphens";
    return "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const widgetCode = generateWidgetCode();

  return (
    <div className="max-w-2xl mx-auto space-y-4 p-4 md:p-6" dir={ar ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Link2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{ar ? "رابط فحص الكروت" : "Card Check Link"}</h1>
          <p className="text-sm text-muted-foreground">
            {ar ? "أنشئ رابطاً مخصصاً لعملائك أو أضف نموذج فحص في صفحة الـ Hotspot" : "Create a custom link or embed a check form in your Hotspot page"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="link">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="link" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            {ar ? "رابط الفحص" : "Check Link"}
          </TabsTrigger>
          <TabsTrigger value="hotspot" className="flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            {ar ? "كود Hotspot" : "Hotspot Widget"}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: رابط الفحص ── */}
        <TabsContent value="link" className="space-y-4 mt-4">
          {checkUrl && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">{ar ? "رابطك الحالي" : "Your Current Link"}</span>
                </div>
                <div className="flex items-center gap-2 bg-background rounded-lg border px-3 py-2.5">
                  <span className="flex-1 text-sm font-mono text-foreground truncate" dir="ltr">{checkUrl}</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => copyToClipboard(checkUrl)}>
                    {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => window.open(checkUrl, "_blank")}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                {ar ? "إعدادات الرابط" : "Link Settings"}
              </CardTitle>
              <CardDescription>{ar ? "اختر اسم شبكتك ليظهر في الرابط" : "Choose your network name to appear in the link"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="slug">{ar ? "اسم الشبكة (Slug)" : "Network Slug"}</Label>
                <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/30">
                  <span className="px-3 py-2 text-sm text-muted-foreground bg-muted border-r whitespace-nowrap" dir="ltr">
                    {publicDomain}/check/
                  </span>
                  <input
                    id="slug"
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="your-network"
                    className="flex-1 px-3 py-2 text-sm bg-background outline-none font-mono"
                    dir="ltr"
                    maxLength={64}
                  />
                  <div className="px-2"><SlugStatusIcon /></div>
                </div>
                {slugStatus !== "idle" && <p className={`text-xs ${slugStatusColor()}`}>{slugStatusText()}</p>}
                <p className="text-xs text-muted-foreground">{ar ? "فقط حروف إنجليزية صغيرة وأرقام وشرطة (-) - 3 أحرف على الأقل" : "Only lowercase letters, numbers and hyphens - minimum 3 characters"}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="networkName">{ar ? "اسم الشبكة للعرض (اختياري)" : "Display Network Name (optional)"}</Label>
                <Input id="networkName" value={networkName} onChange={(e) => setNetworkName(e.target.value)} placeholder={ar ? "مثال: شبكة أبو عود" : "e.g. Abu Oud Network"} maxLength={128} />
                <p className="text-xs text-muted-foreground">{ar ? "يظهر هذا الاسم في صفحة الفحص للعملاء" : "This name appears on the check page for customers"}</p>
              </div>

              <Button onClick={handleSave} disabled={isSaving || slugStatus === "taken" || slugStatus === "invalid" || slug.trim().length < 3} className="w-full">
                {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{ar ? "جاري الحفظ..." : "Saving..."}</> : ar ? "حفظ الإعدادات" : "Save Settings"}
              </Button>
            </CardContent>
          </Card>

          {backupUrl && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  {ar ? "الرابط الاحتياطي (Token)" : "Backup Link (Token)"}
                </CardTitle>
                <CardDescription className="text-xs">{ar ? "هذا الرابط يعمل دائماً حتى لو لم تضع slug." : "This link always works even without a slug."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg border px-3 py-2">
                  <span className="flex-1 text-xs font-mono text-muted-foreground truncate" dir="ltr">{backupUrl}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copyToClipboard(backupUrl)}><Copy className="h-3 w-3" /></Button>
                </div>
                <Button size="sm" variant="outline" className="text-xs text-red-500 border-red-200 hover:bg-red-50" disabled={regenerateTokenMutation.isPending}
                  onClick={async () => { if (await window.confirmOperation(ar ? "تحذير: الرابط الاحتياطي القديم سيتوقف. هل تريد المتابعة؟" : "Warning: Old backup link will stop working. Continue?", ar ? "تجديد الرابط الاحتياطي" : "Regenerate backup link")) regenerateTokenMutation.mutate(); }}>
                  <RefreshCcw className={`h-3 w-3 mr-1 ${regenerateTokenMutation.isPending ? "animate-spin" : ""}`} />
                  {ar ? "تجديد الرابط الاحتياطي" : "Regenerate Backup Link"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="bg-muted/30">
            <CardContent className="pt-4 pb-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Info className="h-4 w-4 text-primary" />{ar ? "كيف يعمل؟" : "How it works?"}</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                {[ar ? "اختر اسم شبكتك (مثال: abowdnet)" : "Choose your network name (e.g. abowdnet)",
                  ar ? "شارك الرابط مع عملائك" : "Share the link with your customers",
                  ar ? "يدخل العميل اسم المستخدم الخاص بكرته ليرى تفاصيله" : "Customer enters their card username to see details"
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Badge variant="outline" className="text-xs mt-0.5 shrink-0">{i + 1}</Badge>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Hotspot Widget ── */}
        <TabsContent value="hotspot" className="space-y-4 mt-4">
          {/* Enable toggle */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{ar ? "تفعيل كود Hotspot" : "Enable Hotspot Widget"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ar ? "أضف نموذج فحص الكروت مباشرة في صفحة الـ Hotspot" : "Embed card check form directly in your Hotspot login page"}</p>
                </div>
                <Switch checked={widget.widgetEnabled} onCheckedChange={(v) => setWidget(w => ({ ...w, widgetEnabled: v }))} />
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Palette className="h-4 w-4 text-primary" />{ar ? "تخصيص المظهر" : "Appearance"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Preset Templates */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">{ar ? "قوالب جاهزة" : "Preset Templates"}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "light", label: ar ? "فاتح" : "Light", primary: "#0ea5e9", bg: "#ffffff", text: "#1e293b", preview: ["#0ea5e9", "#ffffff", "#f1f5f9"] },
                    { id: "dark",  label: ar ? "داكن"  : "Dark",  primary: "#6366f1", bg: "#1e1b4b", text: "#e2e8f0", preview: ["#6366f1", "#1e1b4b", "#312e81"] },
                    { id: "green", label: ar ? "ملون"  : "Colorful", primary: "#059669", bg: "#f0fdf4", text: "#064e3b", preview: ["#059669", "#f0fdf4", "#d1fae5"] },
                  ].map(t => {
                    const isActive = widget.widgetPrimaryColor === t.primary && widget.widgetBgColor === t.bg;
                    return (
                      <button key={t.id} type="button"
                        onClick={() => setWidget(w => ({ ...w, widgetPrimaryColor: t.primary, widgetBgColor: t.bg, widgetTextColor: t.text }))}
                        className={`relative rounded-xl border-2 p-2 text-center transition-all hover:scale-105 ${
                          isActive ? "border-primary shadow-md" : "border-border hover:border-primary/50"
                        }`}>
                        {/* Color swatches */}
                        <div className="flex gap-1 justify-center mb-1.5">
                          {t.preview.map((c, i) => (
                            <span key={i} className="w-4 h-4 rounded-full border border-white/30" style={{ background: c }} />
                          ))}
                        </div>
                        <span className="text-xs font-medium">{t.label}</span>
                        {isActive && (
                          <span className="absolute top-1 right-1 w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                            <svg viewBox="0 0 12 12" className="w-2 h-2 text-white fill-current"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "widgetPrimaryColor", label: ar ? "اللون الرئيسي" : "Primary" },
                  { key: "widgetBgColor", label: ar ? "الخلفية" : "Background" },
                  { key: "widgetTextColor", label: ar ? "النص" : "Text" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <div className="flex items-center gap-2 border rounded-lg p-2">
                      <input type="color" value={widget[key as keyof typeof widget] as string}
                        onChange={(e) => setWidget(w => ({ ...w, [key]: e.target.value }))}
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0" />
                      <span className="text-xs font-mono text-muted-foreground">{widget[key as keyof typeof widget] as string}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">{ar ? `استدارة الزوايا: ${widget.widgetBorderRadius}px` : `Border Radius: ${widget.widgetBorderRadius}px`}</Label>
                <Slider value={[widget.widgetBorderRadius]} onValueChange={([v]) => setWidget(w => ({ ...w, widgetBorderRadius: v }))} min={0} max={24} step={2} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{ar ? "عنوان الويدجت" : "Widget Title"}</Label>
                  <Input value={widget.widgetTitle} onChange={(e) => setWidget(w => ({ ...w, widgetTitle: e.target.value }))} placeholder="فحص بيانات كرتك" maxLength={64} className="text-xs h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{ar ? "نص الحقل" : "Input Placeholder"}</Label>
                  <Input value={widget.widgetPlaceholder} onChange={(e) => setWidget(w => ({ ...w, widgetPlaceholder: e.target.value }))} placeholder="أدخل اسم المستخدم" maxLength={64} className="text-xs h-8" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fields */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4 text-primary" />{ar ? "البيانات المعروضة" : "Displayed Fields"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "widgetShowStatus", label: ar ? "حالة الكرت" : "Card Status" },
                  { key: "widgetShowPlan", label: ar ? "اسم الخطة" : "Plan Name" },
                  { key: "widgetShowExpiry", label: ar ? "تاريخ الانتهاء" : "Expiry Date" },
                  { key: "widgetShowTimeLeft", label: ar ? "الوقت المتبقي" : "Time Left" },
                  { key: "widgetShowSpeed", label: ar ? "السرعة" : "Speed" },
                  { key: "widgetShowDataLimit", label: ar ? "حد البيانات" : "Data Limit" },
                  { key: "widgetShowSessions", label: ar ? "الجلسات" : "Sessions" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between border rounded-lg px-3 py-2">
                    <span className="text-xs">{label}</span>
                    <Switch checked={widget[key as keyof typeof widget] as boolean} onCheckedChange={(v) => setWidget(w => ({ ...w, [key]: v }))} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Live Preview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4 text-primary" />{ar ? "معاينة مباشرة" : "Live Preview"}</CardTitle>
            </CardHeader>
            <CardContent className="bg-slate-50 rounded-lg p-4">
              <WidgetPreview />
            </CardContent>
          </Card>

          {/* Save */}
          <Button onClick={handleSaveWidget} disabled={isSavingWidget} className="w-full">
            {isSavingWidget ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{ar ? "جاري الحفظ..." : "Saving..."}</> : ar ? "حفظ الإعدادات" : "Save Settings"}
          </Button>

          {/* Generated Code */}
          {(tokenData?.token || tokenData?.slug) ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Code2 className="h-4 w-4 text-primary" />{ar ? "الكود الجاهز للنسخ" : "Ready-to-Copy Code"}</CardTitle>
                <CardDescription className="text-xs">{ar ? "اختر نوع الكود المناسب لموقعك" : "Choose the code type that fits your setup"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Code Type Tabs */}
                <Tabs defaultValue="standalone">
                  <TabsList className="w-full grid grid-cols-3 h-auto">
                    <TabsTrigger value="standalone" className="text-xs py-1.5 px-1">
                      <span className="flex flex-col items-center gap-0.5">
                        <Wifi className="h-3.5 w-3.5" />
                        {ar ? "ويدجت مستقل" : "Standalone"}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="inline" className="text-xs py-1.5 px-1">
                      <span className="flex flex-col items-center gap-0.5">
                        <Code2 className="h-3.5 w-3.5" />
                        {ar ? "دمج في Login" : "Login Inline"}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="popup" className="text-xs py-1.5 px-1">
                      <span className="flex flex-col items-center gap-0.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        {ar ? "زر Popup" : "Popup Button"}
                      </span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Standalone Widget */}
                  <TabsContent value="standalone" className="mt-3 space-y-3">
                    <p className="text-xs text-muted-foreground">{ar ? "ضعه في أي صفحة HTML — يظهر كويدجت مستقل" : "Place in any HTML page — appears as a standalone widget"}</p>
                    {/* Preview */}
                    <div className="bg-slate-100 rounded-lg p-3">
                      <p className="text-xs text-slate-500 mb-2 text-center">{ar ? "ℹ️ معاينة الويدجت" : "ℹ️ Widget Preview"}</p>
                      <WidgetPreview />
                    </div>
                    <div className="relative">
                      <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto max-h-40 font-mono leading-relaxed" dir="ltr">{widgetCode.slice(0, 400)}...</pre>
                      <Button size="sm" className="absolute top-2 left-2" onClick={() => copyToClipboard(widgetCode, "code")}>
                        {copiedCode ? <><CheckCircle2 className="h-3 w-3 mr-1" />{ar ? "تم النسخ!" : "Copied!"}</> : <><Copy className="h-3 w-3 mr-1" />{ar ? "نسخ الكود" : "Copy Code"}</>}
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Login Inline */}
                  <TabsContent value="inline" className="mt-3 space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-blue-800 mb-1">{ar ? "كيفية الاستخدام:" : "How to use:"}</p>
                      <p className="text-xs text-blue-700">{ar ? "ضع هذا الكود في login.html بعد نموذج الدخول مباشرة. سيظهر ويدجت الفحص أسفل زر الدخول." : "Place this code in login.html right after the login form. The check widget appears below the login button."}</p>
                    </div>
                    {/* Login Inline Preview */}
                    <div className="rounded-lg overflow-hidden">
                      <p className="text-xs text-slate-500 mb-2 text-center bg-slate-100 py-1.5 rounded-t-lg">{ar ? "📱 معاينة صفحة Login مع الويدجت المدمج" : "📱 Login page preview with inline widget"}</p>
                      <LoginPageFrame>
                        {/* Inline widget preview */}
                        <div style={{ background: widget.widgetBgColor, borderRadius: `${widget.widgetBorderRadius}px`, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                          <div style={{ background: widget.widgetPrimaryColor, padding: "10px 14px" }}>
                            <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>{widget.widgetTitle}</div>
                          </div>
                          <div style={{ padding: "12px" }}>
                            <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                              <input readOnly placeholder={widget.widgetPlaceholder} style={{ flex: 1, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: `${Math.max(widget.widgetBorderRadius - 4, 4)}px`, fontSize: "11px", background: "#f8fafc", color: widget.widgetTextColor, direction: "ltr", textAlign: "center" }} />
                              <div style={{ background: widget.widgetPrimaryColor, color: "#fff", borderRadius: `${Math.max(widget.widgetBorderRadius - 4, 4)}px`, padding: "6px 10px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>فحص</div>
                            </div>
                            <CardResultPreview compact />
                          </div>
                        </div>
                      </LoginPageFrame>
                    </div>
                    <div className="relative">
                      <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto max-h-40 font-mono leading-relaxed" dir="ltr">{generateLoginInlineCode().slice(0, 400)}...</pre>
                      <Button size="sm" className="absolute top-2 left-2" onClick={() => copyToClipboard(generateLoginInlineCode(), "code")}>
                        {copiedCode ? <><CheckCircle2 className="h-3 w-3 mr-1" />{ar ? "تم النسخ!" : "Copied!"}</> : <><Copy className="h-3 w-3 mr-1" />{ar ? "نسخ الكود" : "Copy Code"}</>}
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Popup Button */}
                  <TabsContent value="popup" className="mt-3 space-y-3">
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-purple-800 mb-1">{ar ? "كيفية الاستخدام:" : "How to use:"}</p>
                      <p className="text-xs text-purple-700">{ar ? "ضع هذا الكود في login.html. سيظهر زر صغير 'فحص كرتي' يفتح نافذة منبثقة عند الضغط عليه." : "Place this code in login.html. A small 'Check My Card' button will appear that opens a popup when clicked."}</p>
                    </div>
                    {/* Popup Preview */}
                    <div className="rounded-lg overflow-hidden">
                      <p className="text-xs text-slate-500 mb-2 text-center bg-slate-100 py-1.5 rounded-t-lg">{ar ? "📱 معاينة صفحة Login مع زر Popup" : "📱 Login page preview with popup button"}</p>
                      <LoginPageFrame>
                        {/* Popup button preview */}
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
                          <div style={{ background: "transparent", color: widget.widgetPrimaryColor, border: `1.5px solid ${widget.widgetPrimaryColor}`, borderRadius: `${Math.max(widget.widgetBorderRadius - 4, 4)}px`, padding: "7px 16px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>🔍 فحص كرتي</div>
                        </div>
                        {/* Popup modal preview */}
                        <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: "8px", padding: "8px" }}>
                          <div style={{ background: widget.widgetBgColor, borderRadius: `${widget.widgetBorderRadius}px`, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                            <div style={{ background: widget.widgetPrimaryColor, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>{widget.widgetTitle}</div>
                              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "#fff" }}>×</div>
                            </div>
                            <div style={{ padding: "12px" }}>
                              <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                                <input readOnly placeholder={widget.widgetPlaceholder} style={{ flex: 1, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: `${Math.max(widget.widgetBorderRadius - 4, 4)}px`, fontSize: "11px", background: "#f8fafc", color: widget.widgetTextColor, direction: "ltr", textAlign: "center" }} />
                                <div style={{ background: widget.widgetPrimaryColor, color: "#fff", borderRadius: `${Math.max(widget.widgetBorderRadius - 4, 4)}px`, padding: "6px 10px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>فحص</div>
                              </div>
                              <CardResultPreview compact />
                            </div>
                          </div>
                        </div>
                      </LoginPageFrame>
                    </div>
                    <div className="relative">
                      <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto max-h-40 font-mono leading-relaxed" dir="ltr">{generateLoginPopupCode().slice(0, 400)}...</pre>
                      <Button size="sm" className="absolute top-2 left-2" onClick={() => copyToClipboard(generateLoginPopupCode(), "code")}>
                        {copiedCode ? <><CheckCircle2 className="h-3 w-3 mr-1" />{ar ? "تم النسخ!" : "Copied!"}</> : <><Copy className="h-3 w-3 mr-1" />{ar ? "نسخ الكود" : "Copy Code"}</>}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Walled Garden */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {ar ? "مهم: إعداد Walled Garden في MikroTik" : "Important: MikroTik Walled Garden Setup"}
                  </p>
                  <p className="text-xs text-amber-700">
                    {ar ? "لكي يعمل الكود قبل تسجيل دخول العميل، أضف الأوامر التالية في MikroTik Terminal:" : "For the widget to work before login, add the following in MikroTik Terminal:"}
                  </p>

                  {/* DNS Rules */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-800">{ar ? "1. قواعد DNS (Walled Garden):" : "1. DNS Rules (Walled Garden):"}</p>
                    {[
                      "/ip hotspot walled-garden add dst-host=radius-pro.com action=allow",
                      "/ip hotspot walled-garden add dst-host=*.radius-pro.com action=allow",
                    ].map((cmd, i) => (
                      <div key={i} className="relative flex items-center">
                        <div className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs font-mono w-full pr-16" dir="ltr" style={{userSelect:'all'}}>
                          {cmd}
                        </div>
                        <button
                          onClick={() => copyToClipboard(cmd, "walled")}
                          className="absolute left-2 flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded transition-colors whitespace-nowrap"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedWalled ? (ar ? '✓ تم' : '✓') : (ar ? 'نسخ' : 'Copy')}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* IP Rules */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-800">{ar ? "2. قاعدة IP (أكثر موثوقية من DNS):" : "2. IP Rule (more reliable than DNS):"}</p>
                    <div className="relative flex items-center">
                      <div className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs font-mono w-full pr-16" dir="ltr" style={{userSelect:'all'}}>
                        /ip hotspot walled-garden ip add dst-address={vpsAddress} action=accept
                      </div>
                      <button
                        onClick={() => copyToClipboard(`/ip hotspot walled-garden ip add dst-address=${vpsAddress} action=accept`, "walled")}
                        className="absolute left-2 flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded transition-colors whitespace-nowrap"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedWalled ? (ar ? '✓ تم' : '✓') : (ar ? 'نسخ' : 'Copy')}
                      </button>
                    </div>
                    <p className="text-xs text-amber-600">
                      {ar ? "💡 MikroTik يتعامل مع IP بشكل أكثر موثوقية من DNS — أضف هذا السطر دائماً." : "💡 MikroTik handles IP more reliably than DNS — always add this line."}
                    </p>
                  </div>

                  {/* CORS note */}
                  <div className="bg-amber-100 rounded-lg p-2.5">
                    <p className="text-xs text-amber-800 font-medium">{ar ? "✅ CORS مفعّل تلقائياً" : "✅ CORS enabled automatically"}</p>
                    <p className="text-xs text-amber-700 mt-0.5">{ar ? "الخادم يرسل Access-Control-Allow-Origin: * على جميع طلبات الفحص." : "Server sends Access-Control-Allow-Origin: * on all check requests."}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{ar ? "يجب إعداد رابط الفحص أولاً من تبويب 'رابط الفحص'" : "Set up a check link first from the 'Check Link' tab"}</span>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
