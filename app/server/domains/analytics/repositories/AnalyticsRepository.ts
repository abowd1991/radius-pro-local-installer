/**
 * AnalyticsRepository — طبقة Repository للتحليلات
 * يُغلّف raw SQL queries في analytics.ts
 * Radius Pro Local V2
 */
import { getDb } from '../../../db';
import { sql } from 'drizzle-orm';

export class AnalyticsRepository {
  /**
   * تنفيذ raw SQL query للتحليلات
   * Analytics queries معقدة (GROUP BY, SUM, DATE_FORMAT) لا يمكن تبسيطها بـ ORM
   */
  async executeRaw(query: string, params: any[] = []) {
    const db = await getDb();
    if (!db) return [];
    const result = await db.execute(sql.raw(query));
    return result[0] as any[];
  }
}

export const analyticsRepository = new AnalyticsRepository();

