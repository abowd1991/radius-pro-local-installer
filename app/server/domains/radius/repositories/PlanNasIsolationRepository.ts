import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../../db';
import { radgroupcheck, radhuntgroup, radusergroup } from '../../../../drizzle/schema';

/** يقرر عزل خطة الكرت من مصدر بيانات V2: user group ثم Huntgroup ثم NAS المصدر. */
export class PlanNasIsolationRepository {
  async isNasAllowed(username: string, nasIp: string): Promise<{ restricted: boolean; allowed: boolean }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const memberships = await db.select({ groupName: radusergroup.groupname })
      .from(radusergroup)
      .innerJoin(radgroupcheck, and(eq(radgroupcheck.groupname, radusergroup.groupname), eq(radgroupcheck.attribute, 'Huntgroup-Name')))
      .where(eq(radusergroup.username, username));
    const groups = Array.from(new Set((memberships as Array<{ groupName: string | null }>).map((row) => row.groupName).filter((group): group is string => Boolean(group))));
    if (!groups.length) return { restricted: false, allowed: true };
    const matching = await db.select({ groupName: radhuntgroup.groupname })
      .from(radhuntgroup)
      .where(and(inArray(radhuntgroup.groupname, groups), eq(radhuntgroup.nasipaddress, nasIp)));
    return { restricted: true, allowed: matching.length === groups.length };
  }
}

export const planNasIsolationRepository = new PlanNasIsolationRepository();
