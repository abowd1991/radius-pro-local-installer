# Radius Pro Local V2 — الإصدار الرسمي

هذا المستودع هو **مرجع التثبيت الوحيد** لإصدار Radius Pro Local V2. يحتوي على حزمة تطبيق إنتاجية نظيفة، وقوالب FreeRADIUS المعتمدة، وخدمات VPN وCoA، ومثبت واحد فقط.

## التثبيت

استخدم Ubuntu 22.04 LTS جديداً مع صلاحية `root` أو `sudo` واتصال إنترنت. يشغّل الأمر التالي المثبت كاملاً دون إدخال تفاعلي؛ تُولّد الأسرار وكلمة مرور المدير تلقائياً وتحفظ محلياً بصلاحيات مقيدة.

```bash
curl -fsSL https://raw.githubusercontent.com/abowd1991/radius-pro-local-installer/main/install.sh | sudo bash
```

يمكن تمرير إعدادات اختيارية في نفس الأمر، مثل `RADIUS_PRO_PUBLIC_IP` و`RADIUS_PRO_ADMIN_USERNAME` و`RADIUS_PRO_ADMIN_PASSWORD` و`RADIUS_PRO_ADMIN_EMAIL`. لا تُضمّن أي أسرار في هذا المستودع.

## ما يتم تثبيته

| المكوّن | التشغيل |
|---|---|
| التطبيق | Node.js 22 وPM2 على `127.0.0.1:3000` مع Nginx على المنفذ 80 |
| قاعدة البيانات | MySQL محلي وقاعدة `radius_pro` وحسابات منفصلة للتطبيق وFreeRADIUS |
| التخزين | مجلد محلي آمن داخل `/opt/radius-pro/uploads`، بلا اعتماد على تخزين خارجي |
| Redis | محلي موثّق على `127.0.0.1:6379` |
| FreeRADIUS | SQL وAccounting وV2 Authorization Bridge وعزل NAS fail-closed على 1812/1813 |
| VPN | L2TP/IPsec وPPTP وSSTP عبر accel-ppp على 8443 |
| APIs | VPN API وCoA API محليتان فقط على 8080 و8082 |
| الحماية | UFW، Fail2ban، نسخ احتياطي يومي، Logrotate، والتحقق النهائي للخدمات |

بعد التثبيت توجد بيانات الإدارة والأسرار في `/etc/radius-pro/installer.env`، وبيانات MySQL في `/root/.mysql_credentials`، والنسخ الاحتياطية في `/var/backups/radius-pro`.

## النسخ الاحتياطي والاستعادة

تُنشأ نسخة يومية تلقائياً عند الساعة 02:00 UTC وتُحتفَظ النسخ لمدة 30 يوماً. يتكون كل تشغيل من ملف قاعدة بيانات `radius_pro_*.sql.gz` وملف إعدادات وبيانات `radius_pro_config_*.tar.gz`، ويشمل الأخير إعدادات التطبيق وFreeRADIUS وVPN وNginx وملفات الرفع المحلية ولقطة Redis إن وجدت.

لإنشاء نسخة فورية:

```bash
sudo radius-pro-backup
```

الاستعادة عملية يدوية مؤكدة فقط؛ فهي تنشئ نسخة أمان جديدة أولاً ثم تستعيد قاعدة البيانات والإعدادات وملفات الرفع، وتعيد تشغيل الخدمات المطلوبة:

```bash
sudo RADIUS_PRO_CONFIRM_RESTORE=YES radius-pro-restore /var/backups/radius-pro/radius_pro_YYYYMMDD-HHMMSS.sql.gz /var/backups/radius-pro/radius_pro_config_YYYYMMDD-HHMMSS.tar.gz
```

> لا يحتوي الإصدار على ملفات Vitest أو Debug أو سجلات أو سكربتات ترقية/إصلاح تجريبية. تبقى الاختبارات في مستودع التطوير فقط ولا تُشحن في حزمة التطبيق.
