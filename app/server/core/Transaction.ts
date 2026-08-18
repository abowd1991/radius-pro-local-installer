/**
 * Transaction Helper — ACID Transactions مضمونة
 * كل عملية حساسة تمر عبر هذا الـ Helper
 * Radius Pro Local V2
 */

import { getDb } from '../db';
import { Logger } from './Logger';

// نستخدم unknown لتجنب مشاكل TypeScript مع أنواع Drizzle Transaction الداخلية
export type TransactionCallback<T> = (tx: unknown) => Promise<T>;

/**
 * تنفيذ عملية داخل ACID Transaction
 * إذا فشل أي جزء → ROLLBACK تلقائي
 */
export async function withTransaction<T>(
  callback: TransactionCallback<T>,
  context?: string
): Promise<T> {
  const db = await getDb();
  if (!db) {
    throw new Error('DB_002: Database connection not available');
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (db as any).transaction(async (tx: unknown) => {
      return await callback(tx);
    });
    Logger.debug(`Transaction committed`, { context: context ?? 'Transaction' });
    return result;
  } catch (err) {
    Logger.error(`Transaction rolled back`, {
      context: context ?? 'Transaction',
      errorCode: 'DB_001',
      error: err,
    });
    throw err;
  }
}

/**
 * تنفيذ عملية مع إعادة المحاولة عند Deadlock
 */
export async function withRetryTransaction<T>(
  callback: TransactionCallback<T>,
  maxRetries = 3,
  context?: string
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTransaction(callback, context);
    } catch (err) {
      lastError = err;
      const isDeadlock = err instanceof Error &&
        (err.message.includes('Deadlock') || err.message.includes('deadlock'));
      if (isDeadlock && attempt < maxRetries) {
        Logger.warn(`Deadlock detected, retrying (${attempt}/${maxRetries})`, {
          context: context ?? 'Transaction',
          errorCode: 'DB_004',
        });
        await new Promise(r => setTimeout(r, 50 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
