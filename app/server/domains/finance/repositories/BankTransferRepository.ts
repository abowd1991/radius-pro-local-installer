/**
 * BankTransferRepository — طبقة Repository لتحويلات البنك
 * يُغلّف جميع SQL المباشر في bankTransfer.ts
 * Radius Pro Local V2
 */
import { getDb } from '../../../db';
import { bankTransferRequests, wallets, walletLedger, users } from '../../../../drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';

export class BankTransferRepository {
  async insertRequest(data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const [res] = await db.insert(bankTransferRequests).values(data);
    return (res as any).insertId as number;
  }

  async findRequestById(id: number) {
    const db = await getDb();
    if (!db) return null;
    const [r] = await db.select().from(bankTransferRequests).where(eq(bankTransferRequests.id, id)).limit(1);
    return r ?? null;
  }

  async findRequestsByOwner(ownerId: number, limit = 50, offset = 0) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(bankTransferRequests)
      .where(eq(bankTransferRequests.userId, ownerId))
      .orderBy(desc(bankTransferRequests.createdAt))
      .limit(limit).offset(offset);
  }

  async findAllRequests(limit = 100, offset = 0) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(bankTransferRequests)
      .orderBy(desc(bankTransferRequests.createdAt))
      .limit(limit).offset(offset);
  }

  async updateRequest(id: number, data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.update(bankTransferRequests).set(data).where(eq(bankTransferRequests.id, id));
  }

  async findWalletByOwner(ownerId: number) {
    const db = await getDb();
    if (!db) return null;
    const [w] = await db.select().from(wallets).where(eq(wallets.userId, ownerId)).limit(1);
    return w ?? null;
  }

  async updateWalletBalance(ownerId: number, balance: string) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.update(wallets).set({ balance }).where(eq(wallets.userId, ownerId));
  }

  async insertLedgerEntry(data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.insert(walletLedger).values(data);
  }

  async findUserById(userId: number) {
    const db = await getDb();
    if (!db) return null;
    const [u] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.id, userId)).limit(1);
    return u ?? null;
  }
}

export const bankTransferRepository = new BankTransferRepository();
