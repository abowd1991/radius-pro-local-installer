import { getDb } from "../db";
import { smsLogs, smsTemplates, smsNotificationTracking } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, like, sql } from "drizzle-orm";

// ============================================================================
// SMS LOGS
// ============================================================================

export interface CreateSmsLogInput {
  phone: string;
  userId?: number;
  message: string;
  templateId?: number;
  status?: "pending" | "sent" | "delivered" | "failed";
  smsId?: string;
  errorCode?: string;
  errorMessage?: string;
  type?: "manual" | "bulk" | "automatic";
  triggeredBy?: string;
  sentBy?: number;
}

export async function createSmsLog(input: CreateSmsLogInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(smsLogs).values({
    phone: input.phone,
    userId: input.userId || null,
    message: input.message,
    templateId: input.templateId || null,
    status: input.status || "pending",
    smsId: input.smsId || null,
    errorCode: input.errorCode || null,
    errorMessage: input.errorMessage || null,
    type: input.type || "manual",
    triggeredBy: input.triggeredBy || null,
    sentBy: input.sentBy || null,
    sentAt: input.status === "sent" ? new Date() : null,
  });
  return result.insertId;
}

export async function updateSmsLogStatus(
  id: number,
  status: "pending" | "sent" | "delivered" | "failed",
  smsId?: string,
  errorCode?: string,
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(smsLogs).set({
    status,
    smsId: smsId || undefined,
    errorCode: errorCode || undefined,
    errorMessage: errorMessage || undefined,
    sentAt: status === "sent" ? new Date() : undefined,
  }).where(eq(smsLogs.id, id));
}

export interface GetSmsLogsInput {
  page?: number;
  limit?: number;
  status?: "pending" | "sent" | "delivered" | "failed";
  type?: "manual" | "bulk" | "automatic";
  phone?: string;
  startDate?: Date;
  endDate?: Date;
}

export async function getSmsLogs(input: GetSmsLogsInput = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const page = input.page || 1;
  const limit = input.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  
  if (input.status) {
    conditions.push(eq(smsLogs.status, input.status));
  }
  if (input.type) {
    conditions.push(eq(smsLogs.type, input.type));
  }
  if (input.phone) {
    conditions.push(like(smsLogs.phone, `%${input.phone}%`));
  }
  if (input.startDate) {
    conditions.push(gte(smsLogs.createdAt, input.startDate));
  }
  if (input.endDate) {
    conditions.push(lte(smsLogs.createdAt, input.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, countResult] = await Promise.all([
    db.select()
      .from(smsLogs)
      .where(whereClause)
      .orderBy(desc(smsLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(smsLogs)
      .where(whereClause),
  ]);

  return {
    logs,
    total: countResult[0]?.count || 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.count || 0) / limit),
  };
}

export async function getSmsLogById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [log] = await db.select().from(smsLogs).where(eq(smsLogs.id, id));
  return log;
}

export async function getSmsStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [stats] = await db.select({
    total: sql<number>`count(*)`,
    sent: sql<number>`sum(case when status = 'sent' or status = 'delivered' then 1 else 0 end)`,
    failed: sql<number>`sum(case when status = 'failed' then 1 else 0 end)`,
    todayCount: sql<number>`sum(case when createdAt >= ${today} then 1 else 0 end)`,
  }).from(smsLogs);

  return {
    total: stats?.total || 0,
    sent: stats?.sent || 0,
    failed: stats?.failed || 0,
    todayCount: stats?.todayCount || 0,
  };
}

// ============================================================================
// SMS TEMPLATES
// ============================================================================

export interface CreateSmsTemplateInput {
  name: string;
  nameAr?: string;
  content: string;
  contentAr?: string;
  type?: "subscription_expiry" | "welcome" | "payment_reminder" | "custom";
  isActive?: boolean;
  isSystem?: boolean;
}

export async function createSmsTemplate(input: CreateSmsTemplateInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(smsTemplates).values({
    name: input.name,
    nameAr: input.nameAr || null,
    content: input.content,
    contentAr: input.contentAr || null,
    type: input.type || "custom",
    isActive: input.isActive ?? true,
    isSystem: input.isSystem ?? false,
  });
  return result.insertId;
}

export async function updateSmsTemplate(
  id: number,
  input: Partial<CreateSmsTemplateInput>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(smsTemplates).set({
    name: input.name,
    nameAr: input.nameAr,
    content: input.content,
    contentAr: input.contentAr,
    type: input.type,
    isActive: input.isActive,
  }).where(eq(smsTemplates.id, id));
}

export async function deleteSmsTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if it's a system template
  const [template] = await db.select().from(smsTemplates).where(eq(smsTemplates.id, id));
  if (template?.isSystem) {
    throw new Error("Cannot delete system templates");
  }
  await db.delete(smsTemplates).where(eq(smsTemplates.id, id));
}

export async function getSmsTemplates(activeOnly = false) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = activeOnly ? eq(smsTemplates.isActive, true) : undefined;
  return db.select().from(smsTemplates).where(conditions).orderBy(smsTemplates.type, smsTemplates.name);
}

export async function getSmsTemplateById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [template] = await db.select().from(smsTemplates).where(eq(smsTemplates.id, id));
  return template;
}

export async function getSmsTemplateByType(type: "subscription_expiry" | "welcome" | "payment_reminder" | "custom") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [template] = await db.select()
    .from(smsTemplates)
    .where(and(eq(smsTemplates.type, type), eq(smsTemplates.isActive, true)));
  return template;
}

// ============================================================================
// SMS NOTIFICATION TRACKING
// ============================================================================

export interface CreateNotificationTrackingInput {
  userId: number;
  phone: string;
  notificationType: string;
  referenceId?: number;
  referenceType?: string;
  smsLogId?: number;
}

export async function createNotificationTracking(input: CreateNotificationTrackingInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(smsNotificationTracking).values({
    userId: input.userId,
    phone: input.phone,
    notificationType: input.notificationType,
    referenceId: input.referenceId || null,
    referenceType: input.referenceType || null,
    smsLogId: input.smsLogId || null,
  });
  return result.insertId;
}

export async function hasNotificationBeenSent(
  userId: number,
  notificationType: string,
  referenceId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [
    eq(smsNotificationTracking.userId, userId),
    eq(smsNotificationTracking.notificationType, notificationType),
  ];
  
  if (referenceId) {
    conditions.push(eq(smsNotificationTracking.referenceId, referenceId));
  }

  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(smsNotificationTracking)
    .where(and(...conditions));

  return (result?.count || 0) > 0;
}

// ============================================================================
// TEMPLATE VARIABLE REPLACEMENT
// ============================================================================

export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}
