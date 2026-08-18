import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '../../../db';
import { radcheck, radiusCards, subscribers } from '../../../../drizzle/schema';

/**
 * Namespace موحد لمصادقة RADIUS: لا يجوز أن يملكه Broadband وVoucher معاً.
 * هذا يمنع أن تمس عملية PPPoE بيانات دورة كرت مستقلة تحمل الاسم ذاته.
 */
export class BroadbandIdentityRepository {
  async isUsernameReserved(username: string, excludeSubscriberId?: number): Promise<boolean> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const [subscriberRows, cardRows, credentialRows] = await Promise.all([
      db.select({ id: subscribers.id }).from(subscribers).where(
        excludeSubscriberId === undefined
          ? eq(subscribers.username, username)
          : and(eq(subscribers.username, username), ne(subscribers.id, excludeSubscriberId))
      ).limit(1),
      db.select({ id: radiusCards.id }).from(radiusCards).where(eq(radiusCards.username, username)).limit(1),
      db.select({ id: radcheck.id }).from(radcheck).where(eq(radcheck.username, username)).limit(1),
    ]);
    return subscriberRows.length > 0 || cardRows.length > 0 || credentialRows.length > 0;
  }
}

export const broadbandIdentityRepository = new BroadbandIdentityRepository();
