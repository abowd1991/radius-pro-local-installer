import nodemailer from 'nodemailer';

// SMTP Configuration for Namecheap Private Email
const SMTP_CONFIG = {
  host: 'mail.privateemail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'noreply@radius-pro.com',
    pass: process.env.SMTP_PASS || '',
  },
};

const transporter = nodemailer.createTransport(SMTP_CONFIG);

const templates = {
  verification: (code: string, name: string) => ({
    subject: 'تأكيد البريد الإلكتروني - RadiusPro',
    html: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;"><h1 style="color: white; margin: 0; text-align: center;">RadiusPro</h1></div><div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;"><h2 style="color: #1f2937;">مرحباً ${name}!</h2><p style="color: #4b5563; font-size: 16px;">شكراً لتسجيلك في RadiusPro. لتأكيد بريدك الإلكتروني، استخدم الرمز التالي:</p><div style="background: #4f46e5; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;"><span style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</span></div><p style="color: #6b7280; font-size: 14px;">هذا الرمز صالح لمدة 15 دقيقة فقط.</p></div></div>`,
  }),

  passwordReset: (code: string, name: string, username: string = '') => ({
    subject: 'استعادة كلمة المرور - RadiusPro',
    html: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; border-radius: 10px 10px 0 0;"><h1 style="color: white; margin: 0; text-align: center;">RadiusPro</h1></div><div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;"><h2 style="color: #1f2937;">مرحباً ${name}!</h2>${username ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">اسم المستخدم: <strong style="color: #374151;">${username}</strong></p>` : ''}<p style="color: #4b5563; font-size: 16px;">تلقينا طلباً لاستعادة كلمة المرور الخاصة بحسابك. استخدم الرمز التالي:</p><div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;"><span style="font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</span></div><p style="color: #6b7280; font-size: 14px;">هذا الرمز صالح لمدة 15 دقيقة فقط.</p><p style="color: #ef4444; font-size: 14px; font-weight: bold;">⚠️ إذا لم تطلب استعادة كلمة المرور، يرجى تجاهل هذه الرسالة.</p></div></div>`,
  }),

  trialExpiring: (name: string, daysLeft: number, expiryDate: string) => ({
    subject: `تنبيه: اشتراكك التجريبي ينتهي خلال ${daysLeft} يوم - RadiusPro`,
    html: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 10px 10px 0 0;"><h1 style="color: white; margin: 0; text-align: center;">RadiusPro</h1></div><div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;"><h2 style="color: #1f2937;">مرحباً ${name}!</h2><p style="color: #4b5563; font-size: 16px;">نود تذكيرك بأن فترتك التجريبية المجانية ستنتهي قريباً.</p><div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 20px; border-radius: 8px; margin: 20px 0;"><p style="color: #92400e; font-size: 18px; margin: 0; text-align: center;"><strong>⏰ الأيام المتبقية: ${daysLeft}</strong></p><p style="color: #92400e; font-size: 14px; margin: 10px 0 0 0; text-align: center;">تاريخ الانتهاء: ${expiryDate}</p></div><p style="color: #4b5563;">للتجديد، تواصل مع الدعم الفني: <strong>support@radius-pro.com</strong></p></div></div>`,
  }),

  welcome: (name: string) => ({
    subject: 'مرحباً بك في RadiusPro! 🎉',
    html: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0;"><h1 style="color: white; margin: 0; text-align: center;">🎉 مرحباً بك في RadiusPro!</h1></div><div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;"><h2 style="color: #1f2937;">مرحباً ${name}!</h2><p style="color: #4b5563; font-size: 16px;">شكراً لانضمامك إلى RadiusPro - الحل الاحترافي لإدارة شبكات RADIUS.</p><div style="background: #d1fae5; border: 2px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0;"><p style="color: #065f46; font-size: 18px; margin: 0; text-align: center;"><strong>✅ تم تفعيل حسابك بنجاح!</strong></p><p style="color: #065f46; font-size: 14px; margin: 10px 0 0 0; text-align: center;">لديك فترة تجريبية مجانية لمدة 7 أيام</p></div></div></div>`,
  }),

  subscriptionExpired: (name: string) => ({
    subject: '❗ انتهى اشتراكك - RadiusPro',
    html: `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; border-radius: 10px 10px 0 0;"><h1 style="color: white; margin: 0; text-align: center;">❗ انتهى اشتراكك</h1></div><div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;"><h2 style="color: #1f2937;">مرحباً ${name}!</h2><p style="color: #4b5563; font-size: 16px;">نود إعلامك بأن اشتراكك في RadiusPro قد انتهى.</p><div style="background: #fee2e2; border: 2px solid #ef4444; padding: 20px; border-radius: 8px; margin: 20px 0;"><p style="color: #991b1b; font-size: 18px; margin: 0; text-align: center;"><strong>❌ تم إيقاف خدماتك</strong></p><p style="color: #991b1b; font-size: 14px; margin: 10px 0 0 0; text-align: center;">تم تعطيل أجهزة NAS وقطع الجلسات النشطة</p></div><p style="color: #4b5563; font-size: 16px;">لإعادة تفعيل حسابك، يرجى التواصل معنا لتجديد اشتراكك.</p><p style="color: #4b5563;">الدعم الفني: <strong>support@radius-pro.com</strong></p></div></div>`,
  }),
};

export async function sendEmail(to: string, template: keyof typeof templates, data: any): Promise<boolean> {
  try {
    if (!process.env.SMTP_PASS) {
      console.log(`[Email] SMTP not configured. Would send ${template} to ${to}`);
      return true;
    }

    const emailTemplate = (templates[template] as any)(...Object.values(data));
    
    const info = await transporter.sendMail({
      from: `"RadiusPro" <${SMTP_CONFIG.auth.user}>`,
      to,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    console.log(`[Email] Sent ${template} to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[Email] Failed to send ${template} to ${to}:`, error);
    return false;
  }
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationEmail(to: string, name: string, code: string): Promise<boolean> {
  return sendEmail(to, 'verification', { code, name });
}

export async function sendPasswordResetEmail(to: string, name: string, code: string, username: string = ''): Promise<boolean> {
  return sendEmail(to, 'passwordReset', { code, name, username });
}

export async function sendTrialExpiringEmail(to: string, name: string, daysLeft: number, expiryDate: string): Promise<boolean> {
  return sendEmail(to, 'trialExpiring', { name, daysLeft, expiryDate });
}

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  return sendEmail(to, 'welcome', { name });
}

export async function sendSubscriptionExpiredEmail(to: string, name: string): Promise<boolean> {
  return sendEmail(to, 'subscriptionExpired', { name });
}

export async function testSmtpConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log('[Email] SMTP connection verified');
    return true;
  } catch (error) {
    console.error('[Email] SMTP connection failed:', error);
    return false;
  }
}
