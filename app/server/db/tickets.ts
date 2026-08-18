import { eq, desc, and, ne, count, sql as sqlExpr } from "drizzle-orm";
import { getDb } from "../db";
import { supportTickets, chatMessages, users, InsertSupportTicket, InsertChatMessage } from "../../drizzle/schema";
import { TenantContext, canSeeAllData, getEffectiveOwnerId } from "../tenant-isolation";
import { nanoid } from "nanoid";

function generateTicketNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const random = nanoid(6).toUpperCase();
  return `TKT-${year}${month}-${random}`;
}

export async function getAllTickets(options?: { status?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const baseQuery = db.select({
    id: supportTickets.id,
    ticketNumber: supportTickets.ticketNumber,
    userId: supportTickets.userId,
    subject: supportTickets.subject,
    status: supportTickets.status,
    priority: supportTickets.priority,
    category: supportTickets.category,
    assignedTo: supportTickets.assignedTo,
    lastMessageAt: supportTickets.lastMessageAt,
    createdAt: supportTickets.createdAt,
    updatedAt: supportTickets.updatedAt,
    userName: users.name,
    userEmail: users.email,
  })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id));

  if (options?.status) {
    return baseQuery
      .where(eq(supportTickets.status, options.status as any))
      .orderBy(desc(supportTickets.createdAt))
      .limit(options?.limit || 50);
  }
  
  return baseQuery
    .orderBy(desc(supportTickets.createdAt))
    .limit(options?.limit || 50);
}

export async function getTicketsByUserId(userId: number, options?: { status?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions: any[] = [eq(supportTickets.userId, userId)];
  
  if (options?.status) {
    conditions.push(eq(supportTickets.status, options.status as any));
  }
  
  return db.select({
    id: supportTickets.id,
    ticketNumber: supportTickets.ticketNumber,
    userId: supportTickets.userId,
    subject: supportTickets.subject,
    status: supportTickets.status,
    priority: supportTickets.priority,
    category: supportTickets.category,
    assignedTo: supportTickets.assignedTo,
    lastMessageAt: supportTickets.lastMessageAt,
    createdAt: supportTickets.createdAt,
    updatedAt: supportTickets.updatedAt,
    userName: users.name,
    userEmail: users.email,
  })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(supportTickets.createdAt))
    .limit(options?.limit || 50);
}

// Get tickets with tenant isolation (supports sub-admins)
export async function getTicketsByTenant(tenantContext: TenantContext, options?: { status?: string; page?: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  
  // Owner/super_admin see all
  if (canSeeAllData(tenantContext)) {
    return getAllTickets(options);
  }
  
  // Others see only their tickets
  const effectiveUserId = getEffectiveOwnerId(tenantContext);
  return getTicketsByUserId(effectiveUserId, options);
}

export async function getTicketById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  return result[0] || null;
}

export async function getTicketByNumber(ticketNumber: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(supportTickets).where(eq(supportTickets.ticketNumber, ticketNumber)).limit(1);
  return result[0] || null;
}

export async function createTicket(data: {
  userId: number;
  subject: string;
  message: string;
  priority?: "low" | "medium" | "high" | "urgent";
  category?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const ticketNumber = generateTicketNumber();
  
  const ticketResult = await db.insert(supportTickets).values({
    ticketNumber,
    userId: data.userId,
    subject: data.subject,
    priority: data.priority || "medium",
    category: data.category,
    status: "open",
    lastMessageAt: new Date(),
  });
  
  const ticketId = ticketResult[0].insertId;
  
  // Add initial message
  await db.insert(chatMessages).values({
    ticketId,
    senderId: data.userId,
    message: data.message,
  });
  
  return { success: true, id: ticketId, ticketNumber };
}

export async function addMessage(data: {
  ticketId: number;
  senderId: number;
  message: string;
  attachmentUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(chatMessages).values({
    ticketId: data.ticketId,
    senderId: data.senderId,
    message: data.message,
    attachmentUrl: data.attachmentUrl,
    isRead: false,
    isReadByClient: false, // Admin replies unread by client until they open the ticket
  });
  
  // Update ticket last message time
  await db.update(supportTickets)
    .set({ lastMessageAt: new Date() })
    .where(eq(supportTickets.id, data.ticketId));
  
  // Return the created message
  const messageId = Number(result.insertId) || 0;
  if (messageId > 0) {
    const messages = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
    return messages[0];
  }
  
  // Fallback: return success flag
  return { success: true } as any;
}

export async function getMessagesByTicketId(ticketId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const messages = await db.select({
    id: chatMessages.id,
    ticketId: chatMessages.ticketId,
    senderId: chatMessages.senderId,
    message: chatMessages.message,
    attachmentUrl: chatMessages.attachmentUrl,
    isRead: chatMessages.isRead,
    isReadByClient: chatMessages.isReadByClient,
    createdAt: chatMessages.createdAt,
    senderName: users.name,
    senderEmail: users.email,
  })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.senderId, users.id))
    .where(eq(chatMessages.ticketId, ticketId))
    .orderBy(chatMessages.createdAt); // Oldest first (ASC)
    
  return messages;
}

export async function updateTicketStatus(id: number, status: "open" | "in_progress" | "waiting" | "resolved" | "closed") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(supportTickets).set({ status }).where(eq(supportTickets.id, id));
  return { success: true };
}

export async function assignTicket(id: number, assignedTo: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(supportTickets)
    .set({ assignedTo, status: "in_progress" })
    .where(eq(supportTickets.id, id));
  
  return { success: true };
}

export async function markMessagesAsRead(ticketId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  
  // Mark all messages in ticket as read (except user's own messages)
  // This is a simplified version - in production you'd want more sophisticated read tracking
  await db.update(chatMessages)
    .set({ isRead: true })
    .where(eq(chatMessages.ticketId, ticketId));
}

export async function getOpenTicketsCount(userId?: number) {
  const db = await getDb();
  if (!db) return 0;
  
  let query;
  if (userId) {
    query = db.select()
      .from(supportTickets)
      .where(and(eq(supportTickets.status, "open"), eq(supportTickets.userId, userId)));
  } else {
    query = db.select()
      .from(supportTickets)
      .where(eq(supportTickets.status, "open"));
  }
  
  const result = await query;
  return result.length;
}

// Count unread admin replies for a specific user (messages from admin in user's tickets)
export async function getUnreadAdminRepliesCount(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get all ticket IDs belonging to this user
  const userTickets = await db.select({ id: supportTickets.id })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId));

  if (userTickets.length === 0) return 0;

  const ticketIds = userTickets.map((t: typeof userTickets[0]) => t.id);

  // Count messages in those tickets that are NOT from the user and NOT read by client
  let total = 0;
  for (const ticketId of ticketIds) {
    const result = await db.select({ cnt: count() })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.ticketId, ticketId),
          ne(chatMessages.senderId, userId),
          sqlExpr`${chatMessages.isReadByClient} = 0`
        )
      );
    total += Number(result[0]?.cnt || 0);
  }

  return total;
}

// Mark all admin messages in a ticket as read by client
export async function markAdminMessagesAsReadByClient(ticketId: number, clientUserId: number) {
  const db = await getDb();
  if (!db) return;

  await db.update(chatMessages)
    .set({ isReadByClient: true })
    .where(
      and(
        eq(chatMessages.ticketId, ticketId),
        ne(chatMessages.senderId, clientUserId),
        sqlExpr`${chatMessages.isReadByClient} = 0`
      )
    );
}

export async function deleteTicket(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete all messages first (foreign key constraint)
  await db.delete(chatMessages).where(eq(chatMessages.ticketId, id));
  
  // Delete the ticket
  await db.delete(supportTickets).where(eq(supportTickets.id, id));
  
  return { success: true };
}

// Count unread client messages for admin (messages from clients that admin hasn't read yet)
export async function getUnreadClientMessagesCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Count all messages where isRead = false (client messages not yet read by admin)
  const result = await db.select({ cnt: count() })
    .from(chatMessages)
    .where(sqlExpr`${chatMessages.isRead} = 0`);
  return Number(result[0]?.cnt || 0);
}

// Mark all messages in a ticket as read by admin
export async function markTicketMessagesAsReadByAdmin(ticketId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(chatMessages)
    .set({ isRead: true })
    .where(eq(chatMessages.ticketId, ticketId));
}

export async function editMessage(messageId: number, newMessage: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(chatMessages)
    .set({ message: newMessage })
    .where(eq(chatMessages.id, messageId));
  const updated = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
  return updated[0] ?? null;
}

export async function deleteMessage(messageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(chatMessages).where(eq(chatMessages.id, messageId));
  return { success: true };
}

// Mark ALL client messages across ALL tickets as read by admin (called when admin visits support page)
export async function markAllClientMessagesAsReadByAdmin() {
  const db = await getDb();
  if (!db) return;
  await db.update(chatMessages)
    .set({ isRead: true })
    .where(sqlExpr`${chatMessages.isRead} = 0`);
}

// Mark ALL admin messages across ALL tickets as read by client (called when client visits support page)
export async function markAllAdminMessagesAsReadByClient(clientUserId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(chatMessages)
    .set({ isReadByClient: true })
    .where(
      and(
        ne(chatMessages.senderId, clientUserId),
        sqlExpr`${chatMessages.isReadByClient} = 0`
      )
    );
}

export async function getMessageById(messageId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
  return rows[0] ?? null;
}
