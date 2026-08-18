/**
 * NasRepository — إدارة nas + radhuntgroup
 * المالك الوحيد لجداول الشبكة
 * Radius Pro Local V2
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../../db';
import { nasDevices, radhuntgroup, NasDevice, InsertNasDevice } from '../../../../drizzle/schema';
import { Logger } from '../../../core/Logger';
import { withRetryTransaction } from '../../../core/Transaction';
import { ManagedVpnProtocol, findFirstAvailableProtocolIp, isIpInProtocolRange } from '../../vpn/VpnNasProvisioningPolicy';

export class NasRepository {
  // ─── nas ──────────────────────────────────────────────────────────────────

  async findById(id: number): Promise<NasDevice | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select().from(nasDevices).where(eq(nasDevices.id, id)).limit(1);
    return result[0] ?? null;
  }

  async findByIp(nasIp: string): Promise<NasDevice | null> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const result = await db.select().from(nasDevices)
      .where(eq(nasDevices.nasname, nasIp)).limit(1);
    return result[0] ?? null;
  }

  async findByOwnerId(ownerId: number): Promise<NasDevice[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    return db.select().from(nasDevices).where(eq(nasDevices.ownerId, ownerId));
  }

  async findAll(): Promise<NasDevice[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    return db.select().from(nasDevices);
  }

  async findByConnectionTypes(connectionTypes: ManagedVpnProtocol[]): Promise<NasDevice[]> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    return db.select().from(nasDevices).where(inArray(nasDevices.connectionType, connectionTypes));
  }

  /** يحجز العنوان فقط؛ ولا يعتبر NAS جاهزاً قبل نجاح إعداد مستخدم VPN. */
  async reserveProtocolStaticIp(nasId: number, protocol: ManagedVpnProtocol): Promise<{ ip: string }> {
    return withRetryTransaction(async (transaction) => {
      const tx = transaction as any;
      await tx.execute(sql`SELECT id FROM nas WHERE connectionType IN ('vpn_l2tp', 'vpn_pptp', 'vpn_sstp') FOR UPDATE`);
      const allNas: NasDevice[] = await tx.select().from(nasDevices);
      const nas = allNas.find((row: NasDevice) => row.id === nasId);
      if (!nas) throw new Error(`NAS ${nasId} was not found`);
      if (nas.connectionType !== protocol) throw new Error(`NAS ${nasId} protocol changed during provisioning`);

      const occupied = new Set<string>();
      for (const row of allNas) {
        if (row.id === nasId) continue;
        [row.allocatedIp, row.nasname, row.vpnTunnelIp].forEach((ip) => {
          if (ip) occupied.add(ip);
        });
      }

      let allocatedIp = nas.allocatedIp;
      if (allocatedIp && !isIpInProtocolRange(protocol, allocatedIp)) {
        // A corrected protocol range must be able to migrate an older invalid
        // reservation during the same transaction instead of leaving the NAS
        // permanently unprovisionable.
        allocatedIp = null;
      }
      if (allocatedIp && occupied.has(allocatedIp)) {
        throw new Error(`Allocated IP ${allocatedIp} is already used by another NAS`);
      }
      if (!allocatedIp) {
        allocatedIp = findFirstAvailableProtocolIp(protocol, occupied);
        if (!allocatedIp) throw new Error(`${protocol} static IP range is exhausted`);
      }

      await tx.update(nasDevices).set({
        allocatedIp,
        status: 'inactive',
        provisioningStatus: 'provisioning',
        provisioningError: null,
        updatedAt: new Date(),
      }).where(eq(nasDevices.id, nasId));

      return { ip: allocatedIp };
    }, 3, 'NasRepository.reserveProtocolStaticIp');
  }

  /** يكتب الهوية الثابتة بالكامل وبشكل ذري بعد نجاح إعداد VPN الخارجي. */
  async activateStaticProvisioning(nasId: number, allocatedIp: string): Promise<void> {
    await withRetryTransaction(async (transaction) => {
      const tx = transaction as any;
      await tx.execute(sql`SELECT id FROM nas WHERE id = ${nasId} FOR UPDATE`);
      const allNas: NasDevice[] = await tx.select().from(nasDevices);
      const nas = allNas.find((row: NasDevice) => row.id === nasId);
      if (!nas) throw new Error(`NAS ${nasId} was not found`);
      const conflict = allNas.find((row: NasDevice) => row.id !== nasId && [row.allocatedIp, row.nasname, row.vpnTunnelIp].includes(allocatedIp));
      if (conflict) throw new Error(`Static IP ${allocatedIp} is already owned by NAS ${conflict.id}`);

      await tx.update(nasDevices).set({
        allocatedIp,
        nasname: allocatedIp,
        vpnTunnelIp: allocatedIp,
        status: 'active',
        provisioningStatus: 'ready',
        provisioningError: null,
        provisionedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(nasDevices.id, nasId));
    }, 3, 'NasRepository.activateStaticProvisioning');
  }

  async markStaticProvisioningError(nasId: number, message: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.update(nasDevices).set({
      status: 'inactive',
      provisioningStatus: 'error',
      provisioningError: message,
      updatedAt: new Date(),
    }).where(eq(nasDevices.id, nasId));
  }

  async updateNas(id: number, data: Partial<NasDevice>): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.update(nasDevices).set({ ...data, updatedAt: new Date() }).where(eq(nasDevices.id, id));
  }

  // ─── radhuntgroup (NAS Isolation) ─────────────────────────────────────────

  /**
   * إضافة NAS لـ Huntgroup الخاص بـ Owner
   * يُستدعى تلقائياً عند إضافة NAS جديد
   */
  async addToHuntgroup(nasIp: string, ownerId: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const groupname = `owner_${ownerId}_group`;
    await db.insert(radhuntgroup)
      .values({ groupname, nasipaddress: nasIp })
      .onDuplicateKeyUpdate({ set: { groupname } });
    Logger.info(`NasRepo: added ${nasIp} to huntgroup ${groupname}`, { context: 'NasRepo' });
  }

  /**
   * إزالة NAS من Huntgroup
   */
  async removeFromHuntgroup(nasIp: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.delete(radhuntgroup).where(eq(radhuntgroup.nasipaddress, nasIp));
  }

  /**
   * الحصول على Huntgroup لـ Owner
   */
  getHuntgroupName(ownerId: number): string {
    return `owner_${ownerId}_group`;
  }
}

export const nasRepository = new NasRepository();
