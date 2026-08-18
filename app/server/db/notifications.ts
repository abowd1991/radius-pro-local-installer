import { eq, desc, and } from "drizzle-orm";
import { getDb } from "../db";
import { notifications, InsertNotification } from "../../drizzle/schema";
import { TenantContext, canSeeAllData, getEffectiveOwnerId } from "../tenant-isolation";

// Valid notification types from schema
type NotificationType = "invoice" | "payment" | "card" | "support" | "balance" | "subscription" | "system";

export async function getNotificationsByUserId(userId: number, options?: { unreadOnly?: boolean; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(notifications.userId, userId)];
  
  if (options?.unreadOnly) {
    conditions.push(eq(notifications.isRead, false));
  }
  
  return db.select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(options?.limit || 50);
}

// Get notifications with tenant isolation (supports sub-admins)
export async function getNotificationsByTenant(tenantContext: TenantContext, options?: { unreadOnly?: boolean; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  // Sub-admins see their parent client's notifications
  const effectiveUserId = getEffectiveOwnerId(tenantContext);
  return getNotificationsByUserId(effectiveUserId, options);
}

export async function getNotificationById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return result[0] || null;
}

export async function createNotification(data: {
  userId: number;
  type: NotificationType;
  title: string;
  titleAr?: string;
  message: string;
  messageAr?: string;
  data?: any;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(notifications).values({
    userId: data.userId,
    type: data.type,
    title: data.title,
    titleAr: data.titleAr,
    message: data.message,
    messageAr: data.messageAr,
    data: data.data,
  });
  
  return { success: true, id: result[0].insertId };
}

export async function markAsRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  
  return { success: true };
}

export async function markAllAsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  
  return { success: true };
}

export async function getUnreadCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const result = await db.select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  
  return result.length;
}

export async function deleteNotification(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  
  return { success: true };
}

// Helper function to send common notifications
export async function sendInvoiceNotification(userId: number, invoiceNumber: string, amount: string) {
  return createNotification({
    userId,
    type: "invoice",
    title: `New Invoice #${invoiceNumber}`,
    titleAr: `فاتورة جديدة #${invoiceNumber}`,
    message: `A new invoice of $${amount} has been created.`,
    messageAr: `تم إنشاء فاتورة جديدة بقيمة $${amount}.`,
    data: { invoiceNumber, amount },
  });
}

export async function sendPaymentNotification(userId: number, success: boolean, amount: string, reference?: string) {
  if (success) {
    return createNotification({
      userId,
      type: "payment",
      title: "Payment Successful",
      titleAr: "تم الدفع بنجاح",
      message: `Your payment of $${amount} has been processed successfully.`,
      messageAr: `تم معالجة دفعتك بقيمة $${amount} بنجاح.`,
      data: { amount, reference },
    });
  } else {
    return createNotification({
      userId,
      type: "payment",
      title: "Payment Failed",
      titleAr: "فشل الدفع",
      message: `Your payment of $${amount} could not be processed. Please try again.`,
      messageAr: `لم يتم معالجة دفعتك بقيمة $${amount}. يرجى المحاولة مرة أخرى.`,
      data: { amount, reference },
    });
  }
}

export async function sendCardExpiryNotification(userId: number, serialNumber: string, daysLeft: number) {
  return createNotification({
    userId,
    type: "card",
    title: "Card Expiring Soon",
    titleAr: "البطاقة على وشك الانتهاء",
    message: `Your card ${serialNumber} will expire in ${daysLeft} days.`,
    messageAr: `بطاقتك ${serialNumber} ستنتهي خلال ${daysLeft} أيام.`,
    data: { serialNumber, daysLeft },
  });
}

export async function sendSupportNotification(userId: number, ticketNumber: string, isNewTicket: boolean) {
  if (isNewTicket) {
    return createNotification({
      userId,
      type: "support",
      title: `Ticket #${ticketNumber} Created`,
      titleAr: `تم إنشاء التذكرة #${ticketNumber}`,
      message: "Your support ticket has been created. We will respond shortly.",
      messageAr: "تم إنشاء تذكرة الدعم الخاصة بك. سنرد عليك قريباً.",
      data: { ticketNumber },
    });
  } else {
    return createNotification({
      userId,
      type: "support",
      title: `New Reply on Ticket #${ticketNumber}`,
      titleAr: `رد جديد على التذكرة #${ticketNumber}`,
      message: "You have a new reply on your support ticket.",
      messageAr: "لديك رد جديد على تذكرة الدعم الخاصة بك.",
      data: { ticketNumber },
    });
  }
}

export async function sendBalanceNotification(userId: number, type: "deposit" | "withdrawal", amount: string, newBalance: string) {
  const isDeposit = type === "deposit";
  return createNotification({
    userId,
    type: "balance",
    title: isDeposit ? "Balance Added" : "Balance Deducted",
    titleAr: isDeposit ? "تم إضافة رصيد" : "تم خصم رصيد",
    message: isDeposit 
      ? `$${amount} has been added to your wallet. New balance: $${newBalance}`
      : `$${amount} has been deducted from your wallet. New balance: $${newBalance}`,
    messageAr: isDeposit
      ? `تم إضافة $${amount} إلى محفظتك. الرصيد الجديد: $${newBalance}`
      : `تم خصم $${amount} من محفظتك. الرصيد الجديد: $${newBalance}`,
    data: { type, amount, newBalance },
  });
}
