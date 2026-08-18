/**
 * UserLock — منع Race Conditions على نفس المستخدم
 * يضمن أن عملية واحدة فقط تعمل على مستخدم في نفس الوقت
 */

import { Logger } from './Logger';

class UserLockService {
  private locks = new Map<string, Promise<void>>();

  /**
   * تنفيذ عملية بشكل حصري لمستخدم معين
   * إذا كانت هناك عملية جارية → ينتظر حتى تنتهي
   */
  async withLock<T>(username: string, operation: () => Promise<T>): Promise<T> {
    // انتظر أي قفل موجود
    const existing = this.locks.get(username);
    if (existing) {
      Logger.debug(`UserLock: waiting for lock on ${username}`, { context: 'UserLock' });
      await existing.catch(() => {}); // تجاهل أخطاء القفل السابق
    }

    // إنشاء قفل جديد
    let releaseLock!: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    this.locks.set(username, lockPromise);

    try {
      return await operation();
    } finally {
      releaseLock();
      this.locks.delete(username);
    }
  }

  isLocked(username: string): boolean {
    return this.locks.has(username);
  }

  lockedCount(): number {
    return this.locks.size;
  }
}

export const UserLock = new UserLockService();

