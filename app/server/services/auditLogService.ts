/**
 * Audit Log Service
 * Records all critical operations for security and compliance
 */

import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";

export type AuditAction = 
  | 'session_disconnect'
  | 'session_disconnect_coa'
  | 'session_disconnect_api'
  | 'speed_change'
  | 'speed_change_coa'
  | 'speed_change_api'
  | 'nas_create'
  | 'nas_update'
  | 'nas_delete'
  | 'card_create'
  | 'card_suspend'
  | 'card_activate'
  | 'subscriber_create'
  | 'subscriber_suspend'
  | 'subscriber_activate'
  | 'subscriber_sms_sent'
  | 'vpn_connect'
  | 'vpn_disconnect'
  | 'login'
  | 'logout'
  | 'sub_admin_create'
  | 'sub_admin_update'
  | 'sub_admin_delete'
  | 'permission_plan_change'
  | 'permission_override_add'
  | 'permission_override_remove'
  | 'user_password_change'
  // VPS Management actions
  | 'system_update'
  | 'system_rollback'
  | 'backup_create'
  | 'backup_restore'
  | 'service_manage'
  // Billing actions
  | 'billing_processed'
  | 'billing_failed_insufficient_balance'
  | 'billing_error'
  | 'billing_activated'
  | 'user_force_activate'
  | 'account_activation_sent';

export type AuditResult = 'success' | 'failure' | 'partial';

export type AuditMethod = 'api' | 'coa' | 'coa_fallback' | 'direct';

export interface AuditLogEntry {
  userId: number;
  userRole: string;
  action: AuditAction;
  targetType: 'session' | 'nas' | 'card' | 'subscriber' | 'user' | 'vpn' | 'system';
  targetId?: string;
  targetName?: string;
  nasId?: number;
  nasIp?: string;
  method?: AuditMethod; // api, coa, coa_fallback, direct
  executionTimeMs?: number; // Time taken to execute the operation
  details?: Record<string, any>;
  result: AuditResult;
  errorMessage?: string;
  ipAddress?: string;
}

/**
 * Log an audit event
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn('[AuditLog] Database not available');
      return;
    }
    
    // Include method and executionTime in details
    const detailsWithMeta = {
      ...entry.details,
      method: entry.method,
      executionTime: entry.executionTimeMs,
    };
    
    await db.insert(auditLogs).values({
      userId: entry.userId,
      userRole: entry.userRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      targetName: entry.targetName,
      nasId: entry.nasId,
      nasIp: entry.nasIp,
      details: JSON.stringify(detailsWithMeta),
      result: entry.result,
      errorMessage: entry.errorMessage,
      ipAddress: entry.ipAddress,
      createdAt: new Date(),
    });
  } catch (error) {
    // Don't throw - audit logging should not break the main operation
    console.error('[AuditLog] Failed to log audit entry:', error);
  }
}

/**
 * Get audit logs with filters
 */
export async function getAuditLogs(filters?: {
  userId?: number;
  action?: AuditAction;
  targetType?: string;
  nasId?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (filters?.userId) {
    conditions.push(eq(auditLogs.userId, filters.userId));
  }
  if (filters?.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }
  if (filters?.targetType) {
    conditions.push(eq(auditLogs.targetType, filters.targetType));
  }
  if (filters?.nasId) {
    conditions.push(eq(auditLogs.nasId, filters.nasId));
  }
  if (filters?.startDate) {
    conditions.push(gte(auditLogs.createdAt, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(auditLogs.createdAt, filters.endDate));
  }

  const query = db
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters?.limit || 100)
    .offset(filters?.offset || 0);

  return query;
}

/**
 * Get audit logs for a specific NAS (for owner viewing)
 */
export async function getAuditLogsByNas(nasId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.nasId, nasId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/**
 * Get recent actions by a user
 */
export async function getRecentActionsByUser(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/**
 * Get audit statistics
 */
export async function getAuditStats(days = 7) {
  const db = await getDb();
  if (!db) return [];
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await db
    .select({
      action: auditLogs.action,
      result: auditLogs.result,
      count: sql<number>`count(*)`,
    })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, startDate))
    .groupBy(auditLogs.action, auditLogs.result);

  return stats;
}

/**
 * Log session timeout (automatic disconnect due to time exhaustion)
 */
export async function logSessionTimeout(
  username: string,
  allocatedTime: number,
  usedTime: number,
  nasIp?: string
): Promise<void> {
  await logAudit({
    userId: 0,
    userRole: 'system',
    action: 'session_disconnect',
    targetType: 'session',
    targetId: username,
    targetName: username,
    nasIp,
    method: 'direct',
    result: 'success',
    details: {
      reason: 'time_exhausted',
      allocatedTimeSeconds: allocatedTime,
      usedTimeSeconds: usedTime,
    },
  });
}

/**
 * Log validity expiration (automatic disconnect due to card expiry)
 */
export async function logValidityExpired(
  username: string,
  expiresAt: Date,
  remainingTime: number,
  nasIp?: string
): Promise<void> {
  await logAudit({
    userId: 0,
    userRole: 'system',
    action: 'session_disconnect',
    targetType: 'session',
    targetId: username,
    targetName: username,
    nasIp,
    method: 'direct',
    result: 'success',
    details: {
      reason: 'validity_expired',
      expiresAt: expiresAt.toISOString(),
      remainingTimeSeconds: remainingTime,
    },
  });
}

/**
 * Log CoA sent
 */
export async function logCoASent(
  username: string,
  nasIp: string,
  coaType: 'disconnect' | 'coa',
  success: boolean,
  details?: Record<string, any>
): Promise<void> {
  await logAudit({
    userId: 0,
    userRole: 'system',
    action: coaType === 'disconnect' ? 'session_disconnect_coa' : 'speed_change_coa',
    targetType: 'session',
    targetId: username,
    targetName: username,
    nasIp,
    method: 'coa',
    result: success ? 'success' : 'failure',
    details,
  });
}
