/**
 * Notification Service
 * Handles sending notifications via Telegram, WhatsApp, and SMS
 * Multi-tenant: each owner has their own channel settings
 */

import { getDb } from "../db";
import { notificationChannels, notificationPreferences, subscriberNotificationLinks } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { assertSafeExternalHttpsUrl, postSafeExternalForm } from "../security/externalUrlPolicy";

// ============================================================================
// TYPES
// ============================================================================

export type NotificationChannel = 'telegram' | 'whatsapp' | 'sms';

export type NotificationEvent =
  | 'ownerRouterDown'
  | 'ownerNewSubscription'
  | 'ownerCardActivated'
  | 'ownerSubscriptionExpiring'
  | 'ownerNewPayment'
  | 'ownerSupportTicket'
  | 'ownerManualCardExpiring'
  | 'subscriberNewSubscription'
  | 'subscriberCardActivated'
  | 'subscriberSubscriptionExpiring'
  | 'subscriberNewPayment'
  | 'subscriberSupportTicket';

export interface NotificationPayload {
  title: string;
  message: string;
  emoji?: string;
  // Optional fields for template variable substitution
  cardCode?: string;
  planName?: string;
  expiresAt?: string;
  remainingTime?: string;
  subscriberName?: string;
  daysLeft?: string;
  amount?: string;
  date?: string;
  routerName?: string;
  ip?: string;
  time?: string;
  networkName?: string;
}

// ============================================================================
// TELEGRAM
// ============================================================================

async function sendTelegram(botToken: string, chatId: string, payload: NotificationPayload): Promise<boolean> {
  try {
    const text = `${payload.emoji || '🔔'} *${payload.title}*\n\n${payload.message}`;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    const data = await res.json() as any;
    if (!data.ok) {
      console.error('[Telegram] Send failed:', data.description);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[Telegram] Error:', e.message);
    return false;
  }
}

// ============================================================================
// WHATSAPP (UltraMsg API)
// ============================================================================

async function sendWhatsApp(
  apiUrl: string,
  instanceId: string,
  apiToken: string,
  phone: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const text = `${payload.emoji || '🔔'} *${payload.title}*\n\n${payload.message}`;
    const safeBaseUrl = await assertSafeExternalHttpsUrl(apiUrl);
    const endpoint = new URL(safeBaseUrl.toString());
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/instance${encodeURIComponent(instanceId)}/messages/chat`;
    const data = await postSafeExternalForm(endpoint, new URLSearchParams({ token: apiToken, to: phone, body: text })) as any;
    if (data.sent === 'true' || data.sent === true) return true;
    console.error('[WhatsApp] Send failed:', JSON.stringify(data));
    return false;
  } catch (e: any) {
    console.error('[WhatsApp] Error:', e.message);
    return false;
  }
}

// ============================================================================
// SMS (TweetSMS — already integrated)
// ============================================================================

async function sendSmsToPhone(phone: string, payload: NotificationPayload, ownerId?: number): Promise<boolean> {
  try {
    const { sendSms: tweetSmsSend, getOwnerSmsCredentials } = await import('./tweetsmsService');
    // جلب credentials العميل إذا توفر ownerId
    const ownerCredentials = ownerId ? await getOwnerSmsCredentials(ownerId) : null;
    const message = `${payload.emoji || '\uD83D\uDD14'} ${payload.title}\n\n${payload.message}`;
    const result = await tweetSmsSend(phone, message, undefined, {
      type: 'automatic',
      ownerCredentials: ownerCredentials || undefined,
    });
    if (!result.success) {
      console.error('[SMS] Send failed:', result.errorMessage);
    }
    return result.success;
  } catch (e: any) {
    console.error('[SMS] Error:', e.message);
    return false;
  }
}

// ============================================================================
// MAIN: Send notification to owner via all enabled channels
// ============================================================================

export async function notifyOwnerEvent(
  ownerId: number,
  event: NotificationEvent,
  payload: NotificationPayload
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const channels: NotificationChannel[] = ['telegram', 'whatsapp', 'sms'];

    for (const channel of channels) {
      // Get channel config
      const [channelConfig] = await db
        .select()
        .from(notificationChannels)
        .where(and(
          eq(notificationChannels.ownerId, ownerId),
          eq(notificationChannels.channel, channel)
        ));

      // For SMS: إذا كان العميل عنده حساب خارجي (Custom API / TweetSMS خاص) → يرسل بدون فحص smsAdminEnabled
      if (channel === 'sms') {
        if (!channelConfig) continue;
        const providerType = channelConfig.smsProviderType || 'tweetsms';
        const hasCustomApi = providerType === 'custom_api' && channelConfig.customSmsApiUrl;
        const hasOwnTweetSms = providerType !== 'custom_api' && channelConfig.smsApiKey;
        const isExternalSms = !!(hasCustomApi || hasOwnTweetSms);
        // للحسابات الداخلية فقط: يجب تفعيل smsAdminEnabled
        if (!isExternalSms && !channelConfig.smsAdminEnabled) continue;
      } else {
        if (!channelConfig?.enabled) continue;
      }

      // Get preferences
      const [prefs] = await db
        .select()
        .from(notificationPreferences)
        .where(and(
          eq(notificationPreferences.ownerId, ownerId),
          eq(notificationPreferences.channel, channel)
        ));

      if (!prefs) continue;

      // Check if this event is enabled
      const eventEnabled = prefs[event as keyof typeof prefs] as boolean;
      if (!eventEnabled) continue;

      // Build final payload — apply custom message template if available for this event
      let finalPayload = payload;
      if (channelConfig.customMessages) {
        try {
          const customMsgs = JSON.parse(channelConfig.customMessages) as Record<string, string>;
          // Map event name to template key
          const eventTemplateMap: Record<string, string> = {
            ownerManualCardExpiring: 'manual_card_expiring',
            ownerSubscriptionExpiring: 'subscription_expiring',
            ownerNewSubscription: 'subscription_confirmed',
            ownerCardActivated: 'card_active',
            ownerNewPayment: 'new_payment',
            ownerRouterDown: 'router_down',
            subscriberNewSubscription: 'subscription_confirmed',
            subscriberCardActivated: 'card_active',
            subscriberSubscriptionExpiring: 'subscription_expiring',
            subscriberNewPayment: 'new_payment',
          };
          const templateKey = eventTemplateMap[event];
          const template = templateKey ? customMsgs[templateKey] : undefined;
          if (template) {
            const vars: Record<string, string> = {
              '{card_code}': payload.cardCode ?? '',
              '{plan}': payload.planName ?? '',
              '{expires}': payload.expiresAt ?? '',
              '{remaining_time}': payload.remainingTime ?? '',
              '{subscriber_name}': payload.subscriberName ?? '',
              '{days_left}': payload.daysLeft ?? '',
              '{amount}': payload.amount ?? '',
              '{date}': payload.date ?? '',
              '{router_name}': payload.routerName ?? '',
              '{ip}': payload.ip ?? '',
              '{time}': payload.time ?? '',
              '{network_name}': payload.networkName ?? '',
            };
            let msg = template;
            for (const [k, v] of Object.entries(vars)) msg = msg.split(k).join(v);
            finalPayload = { ...payload, message: msg };
          }
        } catch { /* use default payload */ }
      }

      // Send via channel
      if (channel === 'telegram' && channelConfig.telegramBotToken && channelConfig.telegramChatId) {
        console.log(`[NotificationService] Sending Telegram to owner ${ownerId} (chatId: ${channelConfig.telegramChatId}) for event: ${event}`);
        await sendTelegram(channelConfig.telegramBotToken, channelConfig.telegramChatId, finalPayload);
      } else if (channel === 'whatsapp' && channelConfig.whatsappApiUrl && channelConfig.whatsappInstanceId && channelConfig.whatsappApiToken && channelConfig.whatsappPhone) {
        await sendWhatsApp(channelConfig.whatsappApiUrl, channelConfig.whatsappInstanceId, channelConfig.whatsappApiToken, channelConfig.whatsappPhone, payload);
      } else if (channel === 'sms') {
        // SMS: build short message using customSmsMessages template (separate from Telegram customMessages)
        let smsPayload = payload;
        const eventTemplateMap: Record<string, string> = {
          ownerManualCardExpiring: 'manual_card_expiring',
          ownerSubscriptionExpiring: 'subscription_expiring',
          ownerNewSubscription: 'subscription_confirmed',
          ownerCardActivated: 'card_active',
          ownerNewPayment: 'new_payment',
          ownerRouterDown: 'router_down',
          subscriberSubscriptionExpiring: 'subscription_expiring',
        };
        const templateKey = eventTemplateMap[event];
        // Try customSmsMessages first
        if (channelConfig.customSmsMessages && templateKey) {
          try {
            const customSmsMsgs = JSON.parse(channelConfig.customSmsMessages) as Record<string, string>;
            const template = customSmsMsgs[templateKey];
            if (template) {
              const vars: Record<string, string> = {
                '{card_code}': payload.cardCode ?? '',
                '{plan}': payload.planName ?? '',
                '{expires}': payload.expiresAt ?? '',
                '{remaining_time}': payload.remainingTime ?? '',
                '{subscriber_name}': payload.subscriberName ?? '',
                '{days_left}': payload.daysLeft ?? '',
                '{amount}': payload.amount ?? '',
                '{date}': payload.date ?? '',
                '{router_name}': payload.routerName ?? '',
                '{ip}': payload.ip ?? '',
                '{time}': payload.time ?? '',
                '{network_name}': payload.networkName ?? '',
              };
              let msg = template;
              for (const [k, v] of Object.entries(vars)) msg = msg.split(k).join(v);
              smsPayload = { ...payload, message: msg };
            }
          } catch { /* use default */ }
        }
        // If no custom template, build a short default SMS message
        if (smsPayload === payload) {
          const shortMessages: Record<string, string> = {
            ownerManualCardExpiring: `تنبيه: كرت ${payload.cardCode ?? ''} سينتهي خلال ${payload.remainingTime ?? '24 ساعة'} - ${payload.expiresAt ?? ''}`,
            ownerSubscriptionExpiring: `تنبيه: اشتراك ${payload.subscriberName ?? ''} سينتهي خلال ${payload.remainingTime ?? '24 ساعة'}`,
            ownerRouterDown: `تنبيه: الراوتر ${payload.routerName ?? ''} انقطع الاتصال به`,
            ownerNewSubscription: `اشتراك جديد: ${payload.subscriberName ?? ''} - ${payload.planName ?? ''}`,
            ownerCardActivated: `تم تفعيل كرت: ${payload.cardCode ?? ''}`,
            ownerNewPayment: `دفعة جديدة: ${payload.amount ?? ''} - ${payload.date ?? ''}`,
          };
          const shortMsg = templateKey ? shortMessages[event] : undefined;
          if (shortMsg) {
            smsPayload = { ...payload, message: shortMsg };
          }
        }
        // Send to owner's phone
        // Note: ownerManualCardExpiring is excluded here because centralAccountingService
        // already sends SMS directly to the subscriber's phone (card.phone).
        // Sending to the owner's phone too would result in duplicate SMS messages.
        if (event !== 'ownerManualCardExpiring') {
          const { getDb: getDbInner } = await import('../db');
          const innerDb = await getDbInner();
          if (innerDb) {
            const { users } = await import('../../drizzle/schema');
            const [owner] = await innerDb.select({ phone: users.phone }).from(users).where(eq(users.id, ownerId));
            if (owner?.phone) {
              await sendSmsToPhone(owner.phone, smsPayload, ownerId);
            }
          }
        }
      }
    }
  } catch (e: any) {
    console.error('[NotificationService] Error:', e.message);
  }
}

// ============================================================================
// Send notification to a subscriber
// ============================================================================

export async function notifySubscriberEvent(
  subscriberUserId: number,
  ownerId: number,
  event: NotificationEvent,
  payload: NotificationPayload
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const channels: NotificationChannel[] = ['telegram', 'whatsapp'];

    for (const channel of channels) {
      // Check owner has this channel enabled with this event
      const [channelConfig] = await db
        .select()
        .from(notificationChannels)
        .where(and(
          eq(notificationChannels.ownerId, ownerId),
          eq(notificationChannels.channel, channel)
        ));

      if (!channelConfig?.enabled) continue;

      const [prefs] = await db
        .select()
        .from(notificationPreferences)
        .where(and(
          eq(notificationPreferences.ownerId, ownerId),
          eq(notificationPreferences.channel, channel)
        ));

      if (!prefs) continue;
      const eventEnabled = prefs[event as keyof typeof prefs] as boolean;
      if (!eventEnabled) continue;

      // Get subscriber's linked account
      const [link] = await db
        .select()
        .from(subscriberNotificationLinks)
        .where(and(
          eq(subscriberNotificationLinks.userId, subscriberUserId),
          eq(subscriberNotificationLinks.ownerId, ownerId),
          eq(subscriberNotificationLinks.channel, channel),
          eq(subscriberNotificationLinks.verified, true)
        ));

      if (!link) continue;

      if (channel === 'telegram' && link.chatId && channelConfig.telegramBotToken) {
        await sendTelegram(channelConfig.telegramBotToken, link.chatId, payload);
      } else if (channel === 'whatsapp' && link.phone && channelConfig.whatsappApiUrl && channelConfig.whatsappInstanceId && channelConfig.whatsappApiToken) {
        await sendWhatsApp(channelConfig.whatsappApiUrl, channelConfig.whatsappInstanceId, channelConfig.whatsappApiToken, link.phone, payload);
      }
    }
  } catch (e: any) {
    console.error('[NotificationService] Subscriber error:', e.message);
  }
}

// ============================================================================
// Test connection for a channel
// ============================================================================

export async function testChannelConnection(
  channel: NotificationChannel,
  config: {
    telegramBotToken?: string;
    telegramChatId?: string;
    whatsappApiUrl?: string;
    whatsappInstanceId?: string;
    whatsappApiToken?: string;
    whatsappPhone?: string;
  }
): Promise<{ success: boolean; message: string }> {
  const testPayload: NotificationPayload = {
    title: 'اختبار الاتصال',
    message: 'تم الاتصال بنجاح! النظام جاهز لإرسال الإشعارات.',
    emoji: '✅',
  };

  if (channel === 'telegram') {
    if (!config.telegramBotToken || !config.telegramChatId) {
      return { success: false, message: 'Bot Token و Chat ID مطلوبان' };
    }
    const ok = await sendTelegram(config.telegramBotToken, config.telegramChatId, testPayload);
    return ok
      ? { success: true, message: 'تم إرسال رسالة تجريبية على Telegram بنجاح' }
      : { success: false, message: 'فشل الإرسال — تحقق من Bot Token و Chat ID' };
  }

  if (channel === 'whatsapp') {
    if (!config.whatsappApiUrl || !config.whatsappInstanceId || !config.whatsappApiToken || !config.whatsappPhone) {
      return { success: false, message: 'جميع حقول WhatsApp مطلوبة' };
    }
    const ok = await sendWhatsApp(config.whatsappApiUrl, config.whatsappInstanceId, config.whatsappApiToken, config.whatsappPhone, testPayload);
    return ok
      ? { success: true, message: 'تم إرسال رسالة تجريبية على WhatsApp بنجاح' }
      : { success: false, message: 'فشل الإرسال — تحقق من بيانات UltraMsg' };
  }

  return { success: false, message: 'قناة غير مدعومة' };
}
