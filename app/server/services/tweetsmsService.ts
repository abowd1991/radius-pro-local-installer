/**
 * TweetSMS Service
 * Integration with TweetSMS.ps for SMS notifications in Palestine
 * 
 * API Documentation:
 * - Send SMS: http://www.tweetsms.ps/api.php?comm=sendsms&user=X&pass=X&to=X&message=X&sender=X
 * - Check Balance: http://www.tweetsms.ps/api.php?comm=chk_balance&user=X&pass=X
 * 
 * Error Codes:
 * - 1: Success
 * - -2: Invalid destination or not supported country
 * - -100: Missing parameters
 * - -110: Wrong username or password
 * - -113: Not enough balance
 * - -115: Sender not available
 * - -116: Invalid sender name
 * - -999: Failed sent by SMS provider
 */

import * as smsDb from "../db/sms";

// TweetSMS credentials from environment

// Configuration from environment
const TWEETSMS_API_URL = 'http://www.tweetsms.ps/api.php';
const TWEETSMS_USERNAME = process.env.TWEETSMS_USERNAME || '';
const TWEETSMS_PASSWORD = process.env.TWEETSMS_PASSWORD || '';
const TWEETSMS_SENDER = process.env.TWEETSMS_SENDER || 'RadiusPro';

interface SendSmsResult {
  success: boolean;
  smsId?: string;
  mobileNumber?: string;
  errorCode?: number;
  errorMessage?: string;
  logId?: number; // Database log ID
}

// Options for sending SMS with logging
interface SendSmsOptions {
  userId?: number;
  templateId?: number;
  type?: "manual" | "bulk" | "automatic";
  triggeredBy?: string;
  sentBy?: number;
  skipLogging?: boolean;
  // credentials خاصة بالعميل (تتجاوز env إذا موجودة)
  ownerCredentials?: {
    username: string;
    password: string;
    sender?: string;
    // Custom API support
    smsProviderType?: string;
    customSmsApiUrl?: string;
    customSmsBalanceUrl?: string;
  };
}

interface BalanceResult {
  success: boolean;
  balance?: number;
  errorCode?: number;
  errorMessage?: string;
}

// Error code mapping
const ERROR_MESSAGES: Record<number, string> = {
  1: 'Success',
  [-2]: 'Invalid destination or not supported country',
  [-100]: 'Missing parameters (user + pass + to + message + sender)',
  [-110]: 'Wrong username or password',
  [-113]: 'Not enough balance',
  [-115]: 'Sender not available (no opened sender)',
  [-116]: 'Invalid sender name',
  [-999]: 'Failed sent by SMS provider',
};

/**
 * Format phone number for TweetSMS
 * Accepts: 0599123456, 599123456, 972599123456, +972599123456
 * Returns: 972599123456
 */
function formatPhoneNumber(phone: string): string {
  // Remove spaces, dashes, and plus sign
  let cleaned = phone.replace(/[\s\-\+]/g, '');
  
  // If starts with 0, replace with 972
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.substring(1);
  }
  
  // If doesn't start with 972, add it
  if (!cleaned.startsWith('972')) {
    cleaned = '972' + cleaned;
  }
  
  return cleaned;
}

/**
 * Parse TweetSMS API response
 * Success format: "SMS_ID:mobileNumber" (e.g., "999:20031:972594127070")
 * Error format: error code number (e.g., "-110")
 */
function parseResponse(response: string): { success: boolean; smsId?: string; mobileNumber?: string; errorCode?: number } {
  const trimmed = response.trim();
  
  // Check if it's an error code (negative number or specific codes)
  const errorCode = parseInt(trimmed, 10);
  if (errorCode < 0 || trimmed === '-100' || trimmed === '-110' || trimmed === '-113' || trimmed === '-115' || trimmed === '-116' || trimmed === '-999') {
    return { success: false, errorCode };
  }
  
  // Check for success response format: "result:sms_id:mobile"
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length >= 2) {
      const result = parseInt(parts[0], 10);
      if (result === 1 || result > 0) {
        return {
          success: true,
          smsId: parts[1],
          mobileNumber: parts[2] || undefined,
        };
      }
    }
  }
  
  // If response is a positive number, it might be success
  if (errorCode > 0) {
    return { success: true, smsId: trimmed };
  }
  
  return { success: false, errorCode: -999 };
}

/**
 * Send SMS via TweetSMS API
 */
export async function sendSms(
  to: string,
  message: string,
  sender?: string,
  options: SendSmsOptions = {}
): Promise<SendSmsResult> {
  try {
    // إذا كان المزود custom_api — استخدم Custom HTTP API URL
    if (options.ownerCredentials?.smsProviderType === 'custom_api' && options.ownerCredentials?.customSmsApiUrl) {
      const formattedPhone = formatPhoneNumber(to);
      const activeSender = options.ownerCredentials.sender || sender || TWEETSMS_SENDER;
      return sendSmsCustomApi(formattedPhone, message, options.ownerCredentials.customSmsApiUrl, activeSender);
    }

    // استخدام credentials العميل إذا موجودة، وإلا env
    const activeUsername = options.ownerCredentials?.username || TWEETSMS_USERNAME;
    const activePassword = options.ownerCredentials?.password || TWEETSMS_PASSWORD;
    const activeSender = options.ownerCredentials?.sender || sender || TWEETSMS_SENDER;

    // Validate credentials
    if (!activeUsername || !activePassword) {
      console.error('[TweetSMS] Missing credentials');
      return {
        success: false,
        errorCode: -100,
        errorMessage: 'SMS service not configured',
      };
    }

    // Format phone number
    const formattedPhone = formatPhoneNumber(to);
    
    // Create log entry before sending
    let logId: number | undefined;
    if (!options.skipLogging) {
      try {
        logId = await smsDb.createSmsLog({
          phone: formattedPhone,
          userId: options.userId,
          message: message,
          templateId: options.templateId,
          status: "pending",
          type: options.type || "manual",
          triggeredBy: options.triggeredBy,
          sentBy: options.sentBy,
        });
      } catch (logError) {
        console.warn("[TweetSMS] Failed to create log entry:", logError);
      }
    }
    
    // Build URL with parameters
    const params = new URLSearchParams({
      comm: 'sendsms',
      user: activeUsername,
      pass: activePassword,
      to: formattedPhone,
      message: message,
      sender: activeSender,
    });

    const url = `${TWEETSMS_API_URL}?${params.toString()}`;
    
    console.log(`[TweetSMS] Sending SMS to ${formattedPhone}`);

    // Make API request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
      },
    });

    if (!response.ok) {
      console.error(`[TweetSMS] HTTP error: ${response.status}`);
      return {
        success: false,
        errorCode: -999,
        errorMessage: `HTTP error: ${response.status}`,
      };
    }

    const responseText = await response.text();
    console.log(`[TweetSMS] Response: ${responseText}`);

    // Parse response
    const parsed = parseResponse(responseText);
    
    if (parsed.success) {
      console.log(`[TweetSMS] SMS sent successfully. ID: ${parsed.smsId}`);
      
      // Update log entry with success
      if (logId) {
        try {
          await smsDb.updateSmsLogStatus(logId, "sent", parsed.smsId);
        } catch (logError) {
          console.warn("[TweetSMS] Failed to update log entry:", logError);
        }
      }
      
      return {
        success: true,
        smsId: parsed.smsId,
        mobileNumber: parsed.mobileNumber || formattedPhone,
        logId,
      };
    } else {
      const errorMessage = ERROR_MESSAGES[parsed.errorCode || -999] || 'Unknown error';
      console.error(`[TweetSMS] Failed: ${errorMessage} (code: ${parsed.errorCode})`);
      
      // Update log entry with failure
      if (logId) {
        try {
          await smsDb.updateSmsLogStatus(
            logId,
            "failed",
            undefined,
            String(parsed.errorCode),
            errorMessage
          );
        } catch (logError) {
          console.warn("[TweetSMS] Failed to update log entry:", logError);
        }
      }
      
      return {
        success: false,
        errorCode: parsed.errorCode,
        errorMessage,
        logId,
      };
    }
  } catch (error) {
    console.error('[TweetSMS] Error:', error);
    return {
      success: false,
      errorCode: -999,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send SMS using a template
 */
export async function sendSmsWithTemplate(
  to: string,
  templateType: "subscription_expiry" | "welcome" | "payment_reminder" | "custom",
  variables: Record<string, string | number>,
  language: "ar" | "en" = "ar",
  options: SendSmsOptions = {}
): Promise<SendSmsResult> {
  try {
    // Get template
    const template = await smsDb.getSmsTemplateByType(templateType);
    if (!template) {
      return {
        success: false,
        errorCode: -100,
        errorMessage: `Template not found: ${templateType}`,
      };
    }
    
    // Get content based on language
    const content = language === "ar" && template.contentAr 
      ? template.contentAr 
      : template.content;
    
    // Replace variables
    const message = smsDb.replaceTemplateVariables(content, variables);
    
    // Send SMS
    return sendSms(to, message, undefined, {
      ...options,
      templateId: template.id,
    });
  } catch (error) {
    console.error('[TweetSMS] Template send error:', error);
    return {
      success: false,
      errorCode: -999,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check SMS balance
 */
export async function checkBalance(ownerCredentials?: { username: string; password: string }): Promise<BalanceResult> {
  try {
    const activeUsername = ownerCredentials?.username || TWEETSMS_USERNAME;
    const activePassword = ownerCredentials?.password || TWEETSMS_PASSWORD;

    // Validate credentials
    if (!activeUsername || !activePassword) {
      return {
        success: false,
        errorCode: -100,
        errorMessage: 'SMS service not configured',
      };
    }

    const params = new URLSearchParams({
      comm: 'chk_balance',
      user: activeUsername,
      pass: activePassword,
    });

    const url = `${TWEETSMS_API_URL}?${params.toString()}`;
    
    console.log('[TweetSMS] Checking balance...');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        errorCode: -999,
        errorMessage: `HTTP error: ${response.status}`,
      };
    }

    const responseText = await response.text();
    const balance = parseFloat(responseText.trim());

    if (!isNaN(balance) && balance >= 0) {
      console.log(`[TweetSMS] Balance: ${balance}`);
      return {
        success: true,
        balance,
      };
    } else {
      // Check if it's an error code
      const errorCode = parseInt(responseText.trim(), 10);
      if (errorCode < 0) {
        return {
          success: false,
          errorCode,
          errorMessage: ERROR_MESSAGES[errorCode] || 'Unknown error',
        };
      }
      return {
        success: false,
        errorCode: -999,
        errorMessage: 'Invalid balance response',
      };
    }
  } catch (error) {
    console.error('[TweetSMS] Balance check error:', error);
    return {
      success: false,
      errorCode: -999,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send bulk SMS to multiple recipients
 */
export async function sendBulkSms(
  recipients: string[],
  message: string,
  sender?: string,
  options: Omit<SendSmsOptions, "type"> = {}
): Promise<{ total: number; sent: number; failed: number; results: SendSmsResult[] }> {
  const results: SendSmsResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const result = await sendSms(recipient, message, sender, {
      ...options,
      type: "bulk",
    });
    results.push(result);
    
    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Small delay between messages to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return {
    total: recipients.length,
    sent,
    failed,
    results,
  };
}

/**
 * Send SMS via Custom HTTP API URL
 * Replaces {phone}, {msg}, {sender} variables in the URL
 */
export async function sendSmsCustomApi(
  phone: string,
  message: string,
  apiUrl: string,
  sender?: string
): Promise<SendSmsResult> {
  try {
    // Replace variables in URL
    const finalUrl = apiUrl
      .replace(/\{phone\}/g, encodeURIComponent(phone))
      .replace(/\{msg\}/g, encodeURIComponent(message))
      .replace(/\{sender\}/g, encodeURIComponent(sender || 'RadiusPro'));

    console.log(`[CustomSMS] Sending to ${phone} via custom API`);

    const response = await fetch(finalUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/plain, application/json' },
    });

    const responseText = await response.text();
    console.log(`[CustomSMS] Response (${response.status}): ${responseText}`);

    if (response.ok) {
      return { success: true, smsId: responseText.trim().substring(0, 50), mobileNumber: phone };
    } else {
      return { success: false, errorCode: response.status, errorMessage: responseText.trim().substring(0, 200) };
    }
  } catch (error) {
    console.error('[CustomSMS] Error:', error);
    return {
      success: false,
      errorCode: -999,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check balance via Custom HTTP API URL
 */
export async function checkBalanceCustomApi(balanceUrl: string): Promise<BalanceResult> {
  try {
    const response = await fetch(balanceUrl, {
      method: 'GET',
      headers: { 'Accept': 'text/plain, application/json' },
    });
    const responseText = await response.text();
    const balance = parseFloat(responseText.trim());
    if (!isNaN(balance) && balance >= 0) {
      return { success: true, balance };
    }
    return { success: true, balance: 0, errorMessage: responseText.trim().substring(0, 100) };
  } catch (error) {
    return {
      success: false,
      errorCode: -999,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * جلب credentials SMS الخاصة بالعميل من DB
 * إذا لم يكن لديه credentials خاصة يرجع null (يستخدم credentials النظام)
 */
export async function getOwnerSmsCredentials(ownerId: number): Promise<{
  username: string;
  password: string;
  sender?: string;
  smsProviderType?: string;
  customSmsApiUrl?: string;
  customSmsBalanceUrl?: string;
} | null> {
  try {
    const { getDb } = await import('../db');
    const { notificationChannels } = await import('../../drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    const db = await getDb();
    if (!db) return null;

    const [channel] = await db
      .select()
      .from(notificationChannels)
      .where(and(
        eq(notificationChannels.ownerId, ownerId),
        eq(notificationChannels.channel, 'sms')
      ));

    if (!channel) return null;

    const providerType = channel.smsProviderType || 'tweetsms';

    // Custom API provider — only needs the URL
    if (providerType === 'custom_api' && channel.customSmsApiUrl) {
      return {
        username: '',
        password: '',
        sender: channel.smsSender || undefined,
        smsProviderType: 'custom_api',
        customSmsApiUrl: channel.customSmsApiUrl,
        customSmsBalanceUrl: channel.customSmsBalanceUrl || undefined,
      };
    }

    // TweetSMS provider — needs username:password
    if (!channel.smsApiKey) return null;
    const parts = channel.smsApiKey.split(':');
    if (parts.length < 2) return null;

    return {
      username: parts[0],
      password: parts.slice(1).join(':'),
      sender: channel.smsSender || undefined,
      smsProviderType: 'tweetsms',
    };
  } catch (err) {
    console.warn('[TweetSMS] Failed to load owner credentials:', err);
    return null;
  }
}

/**
 * إرسال SMS باستخدام credentials العميل تلقائياً
 * هذه هي الدالة المركزية التي يجب استخدامها في كل مكان بدلاً من sendSms مباشرة
 * تتحقق من إعدادات العميل وتستخدم Custom API أو TweetSMS الخاص أو النظام تلقائياً
 */
export async function sendSmsTenant(
  ownerId: number,
  phone: string,
  message: string,
  options: Omit<SendSmsOptions, 'ownerCredentials'> = {}
): Promise<SendSmsResult> {
  const ownerCreds = await getOwnerSmsCredentials(ownerId);
  return sendSms(phone, message, undefined, {
    ...options,
    ownerCredentials: ownerCreds || undefined,
  });
}

// Export service object for compatibility
export const tweetsmsService = {
  sendSms,
  sendSmsTenant,
  sendSmsWithTemplate,
  checkBalance,
  sendBulkSms,
  formatPhoneNumber,
};

export default tweetsmsService;
