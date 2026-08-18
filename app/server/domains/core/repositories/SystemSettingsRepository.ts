import { eq } from 'drizzle-orm';
import { systemSettings } from '../../../../drizzle/schema';
import { getDb } from '../../../db';

/** المالك الوحيد لقراءة وكتابة إعدادات النظام الدائمة ضمن Domain Core. */
export class SystemSettingsRepository {
  async getValue(key: string): Promise<string | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const rows = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return rows[0]?.value ?? null;
  }

  async upsertNumber(key: string, value: number, description: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.insert(systemSettings)
      .values({ key, value: String(value), type: 'number', description })
      .onDuplicateKeyUpdate({ set: { value: String(value), type: 'number', description } });
  }
}

export const systemSettingsRepository = new SystemSettingsRepository();
