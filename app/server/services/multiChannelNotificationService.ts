/**
 * Multi-Channel Notification Service
 * Unified notification service supporting Email, SMS (TweetSMS), and Push notifications
 * 
 * Channels:
 * - Email: SMTP via Namecheap Private Email
 * - SMS: TweetSMS API (Palestine local provider)
 * - Push: In-app notifications (database)
 */

import { sendEmail, sendVerificationEmail, sendPasswordResetEmail, sendTrialExpiringEmail, sendWelcomeEmail, sendSubscriptionExpiredEmail } from './emailService';
import { sendSms, sendSmsTenant, checkBalance as checkSmsBalance } from './tweetsmsService';
import { createNotification as createPushNotification, NotificationType } from './internalNotificationService';
import { getDb } from '../db';
import { users } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

// Notification channels
export type NotificationChannel = 'email' | 'sms' | 'push' | 'all';

// User language preference
export type Language = 'ar' | 'en';

// Notification templates
interface NotificationTemplate {
  title: { ar: string; en: string };
  message: { ar: string; en: string };
}

// SMS Templates (Arabic and English)
const smsTemplates = {
  verificationCode: (code: string): NotificationTemplate => ({
    title: { ar: 'رمز التحقق', en: 'Verification Code' },
    message: {
      ar: `رمز التحقق الخاص بك هو: ${code}\nصالح لمدة 15 دقيقة`,
      en: `Your verification code is: ${code}\nValid for 15 minutes`,
    },
  }),

  passwordReset: (code: string): NotificationTemplate => ({
    title: { ar: 'استعادة كلمة المرور', en: 'Password Reset' },
    message: {
      ar: `رمز استعادة كلمة المرور: ${code}\nصالح لمدة 15 دقيقة`,
      en: `Password reset code: ${code}\nValid for 15 minutes`,
    },
  }),

  subscriptionExpiring: (daysLeft: number): NotificationTemplate => ({
    title: { ar: 'تنبيه انتهاء الاشتراك', en: 'Subscription Expiring' },
    message: {
      ar: `تنبيه: اشتراكك ينتهي خلال ${daysLeft} يوم. جدد الآن لتجنب انقطاع الخدمة.`,
      en: `Alert: Your subscription expires in ${daysLeft} days. Renew now to avoid service interruption.`,
    },
  }),

  subscriptionExpired: (): NotificationTemplate => ({
    title: { ar: 'انتهى اشتراكك', en: 'Subscription Expired' },
    message: {
      ar: 'انتهى اشتراكك في RadiusPro. تواصل معنا للتجديد.',
      en: 'Your RadiusPro subscription has expired. Contact us to renew.',
    },
  }),

  paymentReceived: (amount: string): NotificationTemplate => ({
    title: { ar: 'تم استلام الدفعة', en: 'Payment Received' },
    message: {
      ar: `تم استلام دفعتك بقيمة $${amount} بنجاح. شكراً لك!`,
      en: `Your payment of $${amount} was received successfully. Thank you!`,
    },
  }),

  nasDisconnected: (nasName: string): NotificationTemplate => ({
    title: { ar: 'انقطاع اتصال الشبكة', en: 'Network Disconnected' },
    message: {
      ar: `تنبيه: انقطع اتصال الشبكة "${nasName}". تحقق من الاتصال.`,
      en: `Alert: Network "${nasName}" disconnected. Check connection.`,
    },
  }),

  nasReconnected: (nasName: string): NotificationTemplate => ({
    title: { ar: 'عودة اتصال الشبكة', en: 'Network Reconnected' },
    message: {
      ar: `تم استعادة اتصال الشبكة "${nasName}" بنجاح.`,
      en: `Network "${nasName}" reconnected successfully.`,
    },
  }),

  cardExpiring: (cardUsername: string, minutesLeft: number): NotificationTemplate => ({
    title: { ar: 'كرت على وشك الانتهاء', en: 'Card Expiring Soon' },
    message: {
      ar: `الكرت ${cardUsername} سينتهي خلال ${minutesLeft} دقيقة.`,
      en: `Card ${cardUsername} will expire in ${minutesLeft} minutes.`,
    },
  }),

  welcome: (name: string): NotificationTemplate => ({
    title: { ar: 'مرحباً بك!', en: 'Welcome!' },
    message: {
      ar: `مرحباً ${name}! تم تفعيل حسابك في RadiusPro. استمتع بفترتك التجريبية المجانية.`,
      en: `Welcome ${name}! Your RadiusPro account is active. Enjoy your free trial.`,
    },
  }),

  custom: (title: { ar: string; en: string }, message: { ar: string; en: string }): NotificationTemplate => ({
    title,
    message,
  }),
};

// Get user's preferred language
async function getUserLanguage(userId: number): Promise<Language> {
  try {
    const db = await getDb();
    if (!db) return 'ar'; // Default to Arabic

    const user = await db.select({ language: users.language })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return (user[0]?.language as Language) || 'ar';
  } catch {
    return 'ar';
  }
}

// Get user's phone number
async function getUserPhone(userId: number): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const user = await db.select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user[0]?.phone || null;
  } catch {
    return null;
  }
}

// Get user's email
async function getUserEmail(userId: number): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const user = await db.select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user[0]?.email || null;
  } catch {
    return null;
  }
}

// Get user's name
async function getUserName(userId: number): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return 'User';

    const user = await db.select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user[0]?.name || 'User';
  } catch {
    return 'User';
  }
}

// Send notification result
interface SendResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
}

/**
 * Send notification via SMS
 */
export async function sendSmsNotification(
  phone: string,
  template: NotificationTemplate,
  language: Language = 'ar',
  ownerId?: number
): Promise<SendResult> {
  try {
    const message = template.message[language];
    // استخدام sendSmsTenant إذا توفر ownerId لضمان إعدادات العميل
    const result = ownerId
      ? await sendSmsTenant(ownerId, phone, message, { type: 'automatic' })
      : await sendSms(phone, message);

    if (result.success) {
      console.log(`[MultiChannel] SMS sent to ${phone}`);
      return { channel: 'sms', success: true };
    } else {
      console.error(`[MultiChannel] SMS failed: ${result.errorMessage}`);
      return { channel: 'sms', success: false, error: result.errorMessage };
    }
  } catch (error) {
    console.error('[MultiChannel] SMS error:', error);
    return { channel: 'sms', success: false, error: String(error) };
  }
}

/**
 * Send push notification (in-app)
 */
export async function sendPushNotification(
  userId: number,
  template: NotificationTemplate,
  type: NotificationType = 'system',
  language: Language = 'ar'
): Promise<SendResult> {
  try {
    const title = template.title[language];
    const message = template.message[language];

    const notificationId = await createPushNotification({
      userId,
      type,
      title,
      message,
    });

    if (notificationId) {
      console.log(`[MultiChannel] Push notification created for user ${userId}`);
      return { channel: 'push', success: true };
    } else {
      return { channel: 'push', success: false, error: 'Failed to create notification' };
    }
  } catch (error) {
    console.error('[MultiChannel] Push error:', error);
    return { channel: 'push', success: false, error: String(error) };
  }
}

/**
 * Send notification to user via multiple channels
 */
export async function notifyUser(
  userId: number,
  template: NotificationTemplate,
  options: {
    channels?: NotificationChannel[];
    pushType?: NotificationType;
    emailTemplate?: string;
    emailData?: any;
  } = {}
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  const channels = options.channels || ['push']; // Default to push only
  const language = await getUserLanguage(userId);

  // Send push notification
  if (channels.includes('push') || channels.includes('all')) {
    const pushResult = await sendPushNotification(
      userId,
      template,
      options.pushType || 'system',
      language
    );
    results.push(pushResult);
  }

  // Send SMS notification — only if admin has enabled SMS in notification settings
  if (channels.includes('sms') || channels.includes('all')) {
    try {
      const { getDb: getDbSms } = await import('../db');
      const { notificationChannels: notifCh } = await import('../../drizzle/schema');
      const { eq: eqSms, and: andSms } = await import('drizzle-orm');
      const dbSms = await getDbSms();
      const smsEnabled = dbSms ? await dbSms
        .select({ smsAdminEnabled: notifCh.smsAdminEnabled, enabled: notifCh.enabled })
        .from(notifCh)
        .where(andSms(eqSms(notifCh.ownerId, userId), eqSms(notifCh.channel, 'sms')))
        .limit(1)
        .then((rows: { smsAdminEnabled: boolean; enabled: boolean }[]) => rows[0]?.smsAdminEnabled === true && rows[0]?.enabled === true)
        : false;

      if (smsEnabled) {
        const phone = await getUserPhone(userId);
        if (phone) {
          // تمرير userId كـ ownerId لضمان استخدام إعدادات العميل
          const smsResult = await sendSmsNotification(phone, template, language, userId);
          results.push(smsResult);
        } else {
          results.push({ channel: 'sms', success: false, error: 'No phone number' });
        }
      }
      // If smsAdminEnabled is false, silently skip SMS
    } catch {
      // Skip SMS on error
    }
  }

  // Send email notification (using existing email service)
  if (channels.includes('email') || channels.includes('all')) {
    const email = await getUserEmail(userId);
    if (email && options.emailTemplate && options.emailData) {
      try {
        const success = await sendEmail(email, options.emailTemplate as any, options.emailData);
        results.push({ channel: 'email', success });
      } catch (error) {
        results.push({ channel: 'email', success: false, error: String(error) });
      }
    } else if (!email) {
      results.push({ channel: 'email', success: false, error: 'No email address' });
    }
  }

  return results;
}

// ============ Convenience Functions ============

/**
 * Send verification code via SMS
 */
export async function sendVerificationCodeSms(phone: string, code: string, language: Language = 'ar'): Promise<boolean> {
  const template = smsTemplates.verificationCode(code);
  const result = await sendSmsNotification(phone, template, language);
  return result.success;
}

/**
 * Send password reset code via SMS
 */
export async function sendPasswordResetSms(phone: string, code: string, language: Language = 'ar'): Promise<boolean> {
  const template = smsTemplates.passwordReset(code);
  const result = await sendSmsNotification(phone, template, language);
  return result.success;
}

/**
 * Notify user about subscription expiring (all channels)
 */
export async function notifySubscriptionExpiring(
  userId: number,
  daysLeft: number,
  expiryDate: string
): Promise<SendResult[]> {
  const template = smsTemplates.subscriptionExpiring(daysLeft);
  const name = await getUserName(userId);

  return notifyUser(userId, template, {
    channels: ['push', 'sms', 'email'],
    pushType: 'subscription_expired',
    emailTemplate: 'trialExpiring',
    emailData: { name, daysLeft, expiryDate },
  });
}

/**
 * Notify user about subscription expired (all channels)
 */
export async function notifySubscriptionExpired(userId: number): Promise<SendResult[]> {
  const template = smsTemplates.subscriptionExpired();
  const name = await getUserName(userId);

  return notifyUser(userId, template, {
    channels: ['push', 'sms', 'email'],
    pushType: 'subscription_expired',
    emailTemplate: 'subscriptionExpired',
    emailData: { name },
  });
}

/**
 * Notify user about payment received
 */
export async function notifyPaymentReceived(userId: number, amount: string): Promise<SendResult[]> {
  const template = smsTemplates.paymentReceived(amount);

  return notifyUser(userId, template, {
    channels: ['push', 'sms'],
    pushType: 'system',
  });
}

/**
 * Notify user about NAS disconnection
 */
export async function notifyNasDisconnected(userId: number, nasName: string, nasId: number): Promise<SendResult[]> {
  const template = smsTemplates.nasDisconnected(nasName);

  // SMS معطل هنا — يُرسل فقط عبر Telegram/WhatsApp من notificationService.ts
  // بناءً على إعدادات المدير في لوحة التحكم
  return notifyUser(userId, template, {
    channels: ['push'],
    pushType: 'nas_disconnected',
  });
}

/**
 * Notify user about NAS reconnection
 */
export async function notifyNasReconnected(userId: number, nasName: string, nasId: number): Promise<SendResult[]> {
  const template = smsTemplates.nasReconnected(nasName);

  return notifyUser(userId, template, {
    channels: ['push'],
    pushType: 'nas_reconnected',
  });
}

/**
 * Notify user about card expiring
 */
export async function notifyCardExpiring(userId: number, cardUsername: string, minutesLeft: number): Promise<SendResult[]> {
  const template = smsTemplates.cardExpiring(cardUsername, minutesLeft);

  return notifyUser(userId, template, {
    channels: ['push'],
    pushType: 'card_expiring',
  });
}

/**
 * Send welcome notification to new user
 */
export async function sendWelcomeNotification(userId: number): Promise<SendResult[]> {
  const name = await getUserName(userId);
  const template = smsTemplates.welcome(name);

  return notifyUser(userId, template, {
    channels: ['push', 'email'],
    pushType: 'new_subscription',
    emailTemplate: 'welcome',
    emailData: { name },
  });
}

/**
 * Send custom notification
 */
export async function sendCustomNotification(
  userId: number,
  title: { ar: string; en: string },
  message: { ar: string; en: string },
  channels: NotificationChannel[] = ['push']
): Promise<SendResult[]> {
  const template = smsTemplates.custom(title, message);

  return notifyUser(userId, template, {
    channels,
    pushType: 'system',
  });
}

/**
 * Check SMS balance
 */
export async function getSmsBalance(): Promise<{ success: boolean; balance?: number; error?: string }> {
  const result = await checkSmsBalance();
  if (result.success) {
    return { success: true, balance: result.balance };
  }
  return { success: false, error: result.errorMessage };
}

// Export templates for external use
export { smsTemplates };
