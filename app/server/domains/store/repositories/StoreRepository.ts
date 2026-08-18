/**
 * StoreRepository — طبقة Repository لميزة المتجر
 * يُغلّف جميع SQL المباشر في store.ts
 * Radius Pro Local V2
 */
import { getDb } from '../../../db';
import {
  stores, storeProducts, storeOrders, storePhonePins,
  radiusCards, notificationChannels, notificationPreferences, users,
} from '../../../../drizzle/schema';
import { eq, and, desc, count, sql, isNull } from 'drizzle-orm';

export class StoreRepository {
  // ── Stores ──────────────────────────────────────────────────────────────────

  async findStoreById(storeId: number) {
    const db = await getDb();
    if (!db) return null;
    const [store] = await db.select().from(stores).where(eq(stores.id, storeId)).limit(1);
    return store ?? null;
  }

  async findStoreBySlug(slug: string) {
    const db = await getDb();
    if (!db) return null;
    const [store] = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
    return store ?? null;
  }

  async findStoreByOwner(ownerId: number) {
    const db = await getDb();
    if (!db) return null;
    const [store] = await db.select().from(stores).where(eq(stores.ownerId, ownerId)).limit(1);
    return store ?? null;
  }

  async upsertStore(ownerId: number, data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const [existing] = await db.select({ id: stores.id })
      .from(stores).where(eq(stores.ownerId, ownerId)).limit(1);
    if (existing) {
      await db.update(stores).set(data).where(eq(stores.ownerId, ownerId));
      return existing.id;
    } else {
      const [res] = await db.insert(stores).values({ ownerId, ...data });
      return (res as any).insertId as number;
    }
  }

  async updateStore(storeId: number, data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.update(stores).set(data).where(eq(stores.id, storeId));
  }

  async updateStoreByOwner(ownerId: number, data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.update(stores).set(data).where(eq(stores.ownerId, ownerId));
  }

  // ── Products ────────────────────────────────────────────────────────────────

  async findProductById(productId: number) {
    const db = await getDb();
    if (!db) return null;
    const [p] = await db.select().from(storeProducts).where(eq(storeProducts.id, productId)).limit(1);
    return p ?? null;
  }

  async findProductsByStore(storeId: number) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(storeProducts).where(eq(storeProducts.storeId, storeId)).orderBy(desc(storeProducts.createdAt));
  }

  async insertProduct(data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const [res] = await db.insert(storeProducts).values(data);
    return (res as any).insertId as number;
  }

  async updateProduct(productId: number, storeId: number, data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.update(storeProducts).set(data as any).where(and(eq(storeProducts.id, productId), eq(storeProducts.storeId, storeId)));
  }

  async deleteProduct(productId: number, storeId: number) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.delete(storeProducts).where(and(eq(storeProducts.id, productId), eq(storeProducts.storeId, storeId)));
  }

  // ── Orders ──────────────────────────────────────────────────────────────────

  async findOrderById(orderId: number) {
    const db = await getDb();
    if (!db) return null;
    const [o] = await db.select().from(storeOrders).where(eq(storeOrders.id, orderId)).limit(1);
    return o ?? null;
  }

  async findOrdersByStore(storeId: number, limit = 50, offset = 0) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(storeOrders)
      .where(eq(storeOrders.storeId, storeId))
      .orderBy(desc(storeOrders.createdAt))
      .limit(limit).offset(offset);
  }

  async insertOrder(data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    const [res] = await db.insert(storeOrders).values(data);
    return (res as any).insertId as number;
  }

  async updateOrder(orderId: number, data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.update(storeOrders).set(data).where(eq(storeOrders.id, orderId));
  }

  // ── Cards (reserve/release) ──────────────────────────────────────────────────

  async findAvailableCard(planId: number, ownerId: number) {
    const db = await getDb();
    if (!db) return null;
    const [card] = await db.select()
      .from(radiusCards)
      .where(and(
        eq(radiusCards.planId, planId),
        eq(radiusCards.status, 'unused'),
        eq(radiusCards.createdBy, ownerId),
        isNull(radiusCards.reservedOrderId),
      ))
      .limit(1);
    return card ?? null;
  }

  async reserveCard(cardId: number, orderId: number) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.update(radiusCards).set({
      status: 'reserved',
      reservedOrderId: orderId,
      reservedAt: new Date(),
    }).where(eq(radiusCards.id, cardId));
  }

  async releaseCard(cardId: number) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.update(radiusCards).set({
      status: 'unused',
      reservedOrderId: null,
      reservedAt: null,
    }).where(eq(radiusCards.id, cardId));
  }

  async findReservedCardByOrder(orderId: number) {
    const db = await getDb();
    if (!db) return null;
    const [card] = await db.select()
      .from(radiusCards)
      .where(and(eq(radiusCards.reservedOrderId, orderId), eq(radiusCards.status, 'reserved')))
      .limit(1);
    return card ?? null;
  }

  async countAvailableCards(planId: number, ownerId: number) {
    const db = await getDb();
    if (!db) return 0;
    const [res] = await db.select({ cnt: count() })
      .from(radiusCards)
      .where(and(
        eq(radiusCards.planId, planId),
        eq(radiusCards.status, 'unused'),
        eq(radiusCards.createdBy, ownerId),
        isNull(radiusCards.reservedOrderId),
      ));
    return res?.cnt ?? 0;
  }

  // ── Phone Pins ───────────────────────────────────────────────────────────────

  async findPhonePinsByOrder(orderId: number) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(storePhonePins).where(eq(storePhonePins.storeId, orderId));
  }

  async insertPhonePin(data: Record<string, any>) {
    const db = await getDb();
    if (!db) throw new Error('DB unavailable');
    await db.insert(storePhonePins).values(data);
  }

  // ── Notifications ────────────────────────────────────────────────────────────

  async findNotificationChannel(ownerId: number, type: string) {
    const db = await getDb();
    if (!db) return null;
    const [ch] = await db.select()
      .from(notificationChannels)
      .where(eq(notificationChannels.ownerId, ownerId))
      .limit(1);
    return ch ?? null;
  }

  async findNotificationPreference(userId: number, event: string) {
    const db = await getDb();
    if (!db) return null;
    const [pref] = await db.select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.ownerId, userId))
      .limit(1);
    return pref ?? null;
  }
}

export const storeRepository = new StoreRepository();
