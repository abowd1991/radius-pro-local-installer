import { getDb } from "../db";
import { internalNotifications, InsertInternalNotification } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export type NotificationType = 
  | "card_expired"
  | "card_expiring"
  | "nas_disconnected"
  | "nas_reconnected"
  | "low_balance"
  | "new_subscription"
  | "subscription_expired"
  | "system";

export interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
}

// Create a new notification
export async function createNotification(params: CreateNotificationParams): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.insert(internalNotifications).values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      isRead: false,
    });

    return (result as any).insertId || null;
  } catch (error) {
    console.error("[Notifications] Error creating notification:", error);
    return null;
  }
}

// Get notifications for a user
export async function getNotifications(
  userId: number,
  options: { limit?: number; unreadOnly?: boolean } = {}
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const { limit = 50, unreadOnly = false } = options;

    let query = db
      .select()
      .from(internalNotifications)
      .where(
        unreadOnly
          ? and(eq(internalNotifications.userId, userId), eq(internalNotifications.isRead, false))
          : eq(internalNotifications.userId, userId)
      )
      .orderBy(desc(internalNotifications.createdAt))
      .limit(limit);

    return await query;
  } catch (error) {
    console.error("[Notifications] Error getting notifications:", error);
    return [];
  }
}

// Get unread count for a user
export async function getUnreadCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  try {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(internalNotifications)
      .where(
        and(
          eq(internalNotifications.userId, userId),
          eq(internalNotifications.isRead, false)
        )
      );

    return result[0]?.count || 0;
  } catch (error) {
    console.error("[Notifications] Error getting unread count:", error);
    return 0;
  }
}

// Mark notification as read
export async function markAsRead(notificationId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db
      .update(internalNotifications)
      .set({ isRead: true })
      .where(
        and(
          eq(internalNotifications.id, notificationId),
          eq(internalNotifications.userId, userId)
        )
      );

    return true;
  } catch (error) {
    console.error("[Notifications] Error marking as read:", error);
    return false;
  }
}

// Mark all notifications as read for a user
export async function markAllAsRead(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db
      .update(internalNotifications)
      .set({ isRead: true })
      .where(eq(internalNotifications.userId, userId));

    return true;
  } catch (error) {
    console.error("[Notifications] Error marking all as read:", error);
    return false;
  }
}

// Delete a notification
export async function deleteNotification(notificationId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db
      .delete(internalNotifications)
      .where(
        and(
          eq(internalNotifications.id, notificationId),
          eq(internalNotifications.userId, userId)
        )
      );

    return true;
  } catch (error) {
    console.error("[Notifications] Error deleting notification:", error);
    return false;
  }
}

// Delete old notifications (older than 30 days)
export async function cleanupOldNotifications(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db
      .delete(internalNotifications)
      .where(sql`${internalNotifications.createdAt} < ${thirtyDaysAgo}`);

    return (result as any).affectedRows || 0;
  } catch (error) {
    console.error("[Notifications] Error cleaning up old notifications:", error);
    return 0;
  }
}

// Notify about card expiration
export async function notifyCardExpired(
  adminUserId: number,
  cardUsername: string,
  cardId: number
): Promise<void> {
  await createNotification({
    userId: adminUserId,
    type: "card_expired",
    title: "انتهاء وقت كرت",
    message: `انتهى وقت الكرت: ${cardUsername}`,
    entityType: "card",
    entityId: cardId,
  });
}

// Notify about card expiring soon
export async function notifyCardExpiring(
  adminUserId: number,
  cardUsername: string,
  cardId: number,
  remainingMinutes: number
): Promise<void> {
  await createNotification({
    userId: adminUserId,
    type: "card_expiring",
    title: "كرت على وشك الانتهاء",
    message: `الكرت ${cardUsername} سينتهي خلال ${remainingMinutes} دقيقة`,
    entityType: "card",
    entityId: cardId,
  });
}

// Notify about NAS disconnection
export async function notifyNasDisconnected(
  adminUserId: number,
  nasName: string,
  nasId: number,
  nasIp: string
): Promise<void> {
  await createNotification({
    userId: adminUserId,
    type: "nas_disconnected",
    title: "انقطاع اتصال NAS",
    message: `انقطع اتصال الجهاز: ${nasName} (${nasIp})`,
    entityType: "nas",
    entityId: nasId,
  });
}

// Notify about NAS reconnection
export async function notifyNasReconnected(
  adminUserId: number,
  nasName: string,
  nasId: number,
  nasIp: string
): Promise<void> {
  await createNotification({
    userId: adminUserId,
    type: "nas_reconnected",
    title: "عودة اتصال NAS",
    message: `عاد اتصال الجهاز: ${nasName} (${nasIp})`,
    entityType: "nas",
    entityId: nasId,
  });
}
