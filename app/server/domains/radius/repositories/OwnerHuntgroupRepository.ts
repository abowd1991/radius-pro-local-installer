import { and, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '../../../db';
import { nasDevices, radgroupcheck, radhuntgroup } from '../../../../drizzle/schema';

/** مصدر الحقيقة لعزل NAS: NASات المالك النشطة فقط. */
export class OwnerHuntgroupRepository {
  async syncOwner(ownerId: number): Promise<{ groupName: string; nasCount: number }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const groupName = `owner_${ownerId}`;
    return db.transaction(async (tx: any) => {
      const activeNas = await tx.select({ nasname: nasDevices.nasname })
        .from(nasDevices)
        .where(and(eq(nasDevices.ownerId, ownerId), eq(nasDevices.status, 'active'), isNotNull(nasDevices.nasname)));
      const addresses = Array.from(new Set<string>(activeNas.map((row: any) => row.nasname as string).filter((ip: string) => Boolean(ip && ip !== 'pending'))));
      await tx.delete(radhuntgroup).where(eq(radhuntgroup.groupname, groupName));
      if (addresses.length) {
        await tx.insert(radhuntgroup).values(addresses.map(nasipaddress => ({ groupname: groupName, nasipaddress })));
      }
      await tx.delete(radgroupcheck).where(and(eq(radgroupcheck.groupname, groupName), eq(radgroupcheck.attribute, 'Huntgroup-Name')));
      await tx.insert(radgroupcheck).values({ groupname: groupName, attribute: 'Huntgroup-Name', op: '==', value: groupName });
      return { groupName, nasCount: addresses.length };
    });
  }
}

export const ownerHuntgroupRepository = new OwnerHuntgroupRepository();
