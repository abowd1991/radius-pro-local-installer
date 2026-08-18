/**
 * AuditLog — تسجيل كل عملية مهمة في قاعدة البيانات
 * ليس PM2 logs فقط — يُخزَّن في جدول audit_log
 * Radius Pro Local V2
 */

import { getDb } from '../db';
import { Logger } from './Logger';

export interface AuditEntry {
  action: string;
  entityType: 'card' | 'session' | 'user' | 'nas' | 'coa' | 'system' | 'voucher';
  entityId?: string | number;
  operator?: string;
  operatorId?: number;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ip?: string;
  metadata?: Record<string, unknown>;
}

class AuditLogService {
  private buffer: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  async record(entry: AuditEntry): Promise<void> {
    // إضافة للـ buffer وتأجيل الكتابة (batch writes)
    this.buffer.push(entry);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      void this.flush();
    }, 1000); // كتابة كل ثانية
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const entries = [...this.buffer];
    this.buffer = [];
    this.flushTimer = null;

    try {
      const db = await getDb();
      if (!db) {
        Logger.warn('AuditLog: DB not available, dropping entries', { context: 'AuditLog' });
        return;
      }

      // كتابة في جدول audit_log إذا كان موجوداً
      // إذا لم يكن موجوداً، نكتب في Logger فقط
      for (const entry of entries) {
        Logger.info(`AUDIT: ${entry.action} on ${entry.entityType}#${entry.entityId ?? 'N/A'}`, {
          context: 'AuditLog',
          data: {
            operator: entry.operator,
            oldValue: entry.oldValue,
            newValue: entry.newValue,
          } as Record<string, unknown>,
        });
      }

      // TODO: كتابة في جدول audit_log عند إنشائه في migration
      // await db.insert(auditLog).values(entries.map(e => ({...})));
    } catch (err) {
      Logger.error('AuditLog: flush failed', { context: 'AuditLog', error: err });
      // إعادة الإدخالات للـ buffer
      this.buffer = [...entries, ...this.buffer];
    }
  }
}

export const AuditLog = new AuditLogService();
