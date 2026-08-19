# Radius Pro Local V2 — الإصدار الرسمي

هذا المستودع هو **مرجع التثبيت الوحيد** لإصدار Radius Pro Local V2. يحتوي على حزمة تطبيق إنتاجية نظيفة، وقوالب FreeRADIUS المعتمدة، وخدمات VPN وCoA، ومثبت واحد فقط.

## التثبيت

استخدم خادم Ubuntu LTS جديداً بمعمارية `amd64` مع صلاحية `root` أو `sudo` واتصال إنترنت. يدعم المثبّت الرسمي Ubuntu **20.04** و**22.04** و**24.04** و**26.04 LTS**؛ ويمنع الإصدارات المرحلية والمنتهية الدعم كي لا يثبت نظاماً إنتاجياً على قاعدة غير مستقرة. يشغّل الأمر التالي المثبّت كاملاً دون إدخال تفاعلي؛ تُولّد الأسرار وتحفظ محلياً بصلاحيات مقيدة، وبيانات دخول المدير الافتراضية هي `admin` / `admin` ما لم تمرر قيمة بديلة صراحةً.

```bash
curl -fsSL https://raw.githubusercontent.com/abowd1991/radius-pro-local-installer/v3.3.5/install.sh | sudo bash
```

يمكن تمرير إعدادات اختيارية في نفس الأمر، مثل `RADIUS_PRO_PUBLIC_IP` و`RADIUS_PRO_ADMIN_USERNAME` و`RADIUS_PRO_ADMIN_PASSWORD` و`RADIUS_PRO_ADMIN_EMAIL`. لا تُضمّن أي أسرار في هذا المستودع. يثبت الرابط إصداراً موسوماً محدداً؛ وللاستخدام التجريبي لأحدث فرع رئيسي فقط، مرر `RADIUS_PRO_INSTALLER_REF=main` صراحةً.

## استكمال تثبيت تجريبي متوقف

يحفظ المثبّت الأسرار التي ولّدها في `/etc/radius-pro/installer.env` ويستخدمها عند إعادة التشغيل. على خادم تجريبي قابل للحذف فقط، إذا وُجدت قاعدة MySQL سابقة بكلمة مرور جذر مجهولة، يمكن إعادة ضبط بيانات MySQL قبل استكمال التثبيت:

```bash
curl -fsSL https://raw.githubusercontent.com/abowd1991/radius-pro-local-installer/v3.3.5/install.sh | sudo RADIUS_PRO_RESET_MYSQL=1 bash
```

> هذا الخيار يحذف نهائياً `/var/lib/mysql`، ولا يجوز استخدامه على خادم يحتوي أي بيانات MySQL مطلوبة.

## ما يتم تثبيته

| المكوّن | التشغيل |
|---|---|
| التطبيق | Node.js 22 وPM2 على `127.0.0.1:3000` مع Nginx على المنفذ 80 |
| قاعدة البيانات | MySQL محلي وقاعدة `radius_pro` وحسابات منفصلة للتطبيق وFreeRADIUS |
| التخزين | مجلد محلي آمن داخل `/opt/radius-pro/uploads`، بلا اعتماد على تخزين خارجي |
| Redis | محلي موثّق على `127.0.0.1:6379` |
| FreeRADIUS | SQL وAccounting وV2 Authorization Bridge وعزل NAS fail-closed على 1812/1813 |
| VPN | L2TP/IPsec وPPTP وSSTP عبر accel-ppp على 8443؛ يبني المثبّت PPTP من مصدر موثّق ومثبّت البصمة عند غياب حزمة `pptpd` في Ubuntu الحديثة |
| APIs | VPN API وCoA API محليتان فقط على 8080 و8082 |
| الحماية | UFW، Fail2ban، نسخ احتياطي يومي، Logrotate، والتحقق النهائي للخدمات |

بعد التثبيت توجد بيانات الإدارة والأسرار في `/etc/radius-pro/installer.env`، وبيانات MySQL في `/root/.mysql_credentials`، والنسخ الاحتياطية في `/var/backups/radius-pro`.

## النسخ الاحتياطي والاستعادة

تُنشأ نسخة يومية تلقائياً عند الساعة 02:00 UTC وتُحتفَظ النسخ لمدة 30 يوماً. يتكون كل تشغيل من ملف قاعدة بيانات `radius_pro_*.sql.gz` وملف إعدادات وبيانات `radius_pro_config_*.tar.gz`، ويشمل الأخير إعدادات التطبيق وFreeRADIUS وVPN وNginx وملفات الرفع المحلية ولقطة Redis إن وجدت.

لإنشاء نسخة فورية:

```bash
sudo radius-pro-backup
```

لفحص سلامة النسخة من دون تعديل أي بيانات أو إيقاف خدمات:

```bash
sudo radius-pro-verify-backup /var/backups/radius-pro/radius_pro_YYYYMMDD-HHMMSS.sql.gz /var/backups/radius-pro/radius_pro_config_YYYYMMDD-HHMMSS.tar.gz
```

ولفحص أعمق، يستعيد البرنامج النسخة مؤقتاً داخل قاعدة MySQL جديدة ثم يحذفها تلقائياً، من دون لمس قاعدة `radius_pro`. شغّله خارج أوقات الذروة لأنه يستهلك موارد تقارب حجم النسخة مؤقتاً:

```bash
sudo radius-pro-verify-backup /var/backups/radius-pro/radius_pro_YYYYMMDD-HHMMSS.sql.gz /var/backups/radius-pro/radius_pro_config_YYYYMMDD-HHMMSS.tar.gz --deep
```

الاستعادة عملية يدوية مؤكدة فقط؛ فهي تنشئ نسخة أمان جديدة أولاً ثم تستعيد قاعدة البيانات والإعدادات وملفات الرفع، وتعيد تشغيل الخدمات المطلوبة:

```bash
sudo RADIUS_PRO_CONFIRM_RESTORE=YES radius-pro-restore /var/backups/radius-pro/radius_pro_YYYYMMDD-HHMMSS.sql.gz /var/backups/radius-pro/radius_pro_config_YYYYMMDD-HHMMSS.tar.gz
```

> لا يحتوي الإصدار على ملفات Vitest أو Debug أو سجلات أو سكربتات ترقية/إصلاح تجريبية. تبقى الاختبارات في مستودع التطوير فقط ولا تُشحن في حزمة التطبيق.
