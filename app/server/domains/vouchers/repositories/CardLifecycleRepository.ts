/**
 * CardLifecycleRepository — immutable identity for each card issuance.
 * A RADIUS username may be reused; a lifecycleId must never be reused.
 */
import { and, eq, or } from 'drizzle-orm';
import { getDb } from '../../../db';
import { cardLifecycles, cardLifecycleSessions, radiusCards } from '../../../../drizzle/schema';

export interface CardLifecycleIdentity {
  cardId: number;
  lifecycleId: string;
  username: string;
  ownerId: number;
}

export class CardLifecycleRepository {
  async ensureOpen(identity: CardLifecycleIdentity): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.insert(cardLifecycles).values({
      lifecycleId: identity.lifecycleId,
      cardId: identity.cardId,
      username: identity.username,
      ownerId: identity.ownerId,
    }).onDuplicateKeyUpdate({
      set: { cardId: identity.cardId, username: identity.username, ownerId: identity.ownerId, closedAt: null, closeReason: null },
    });
  }

  async openInTransaction(tx: unknown, identity: CardLifecycleIdentity): Promise<void> {
    const db = tx as any;
    await db.insert(cardLifecycles).values({
      lifecycleId: identity.lifecycleId,
      cardId: identity.cardId,
      username: identity.username,
      ownerId: identity.ownerId,
    });
  }

  async closeForCard(cardId: number, reason: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    await db.update(cardLifecycles)
      .set({ closedAt: new Date(), closeReason: reason })
      .where(eq(cardLifecycles.cardId, cardId));
  }

  async closeForCardInTransaction(tx: unknown, cardId: number, reason: string): Promise<void> {
    const db = tx as any;
    await db.update(cardLifecycles)
      .set({ closedAt: new Date(), closeReason: reason })
      .where(eq(cardLifecycles.cardId, cardId));
  }

  async bindSessionInTransaction(tx: unknown, identity: Pick<CardLifecycleIdentity, 'cardId' | 'lifecycleId' | 'username'>, acctSessionId: string, acctUniqueId?: string | null): Promise<void> {
    const db = tx as any;
    await db.insert(cardLifecycleSessions).values({
      lifecycleId: identity.lifecycleId,
      cardId: identity.cardId,
      username: identity.username,
      acctSessionId,
      acctUniqueId: acctUniqueId ?? null,
    }).onDuplicateKeyUpdate({ set: { lifecycleId: identity.lifecycleId, cardId: identity.cardId, username: identity.username } });
  }

  async markSessionClosedInTransaction(tx: unknown, acctSessionId: string, acctUniqueId?: string | null): Promise<void> {
    const db = tx as any;
    const identity = acctUniqueId?.trim()
      ? eq(cardLifecycleSessions.acctUniqueId, acctUniqueId)
      : eq(cardLifecycleSessions.acctSessionId, acctSessionId);
    await db.update(cardLifecycleSessions).set({ closedAt: new Date() }).where(identity);
  }

  async isCurrentCardInstance(cardId: number, lifecycleId: string): Promise<boolean> {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const rows = await db.select({ id: radiusCards.id }).from(radiusCards)
      .where(and(eq(radiusCards.id, cardId), eq(radiusCards.lifecycleId, lifecycleId)))
      .limit(1);
    return rows.length === 1;
  }

  async findBoundSession(acctSessionId: string, acctUniqueId?: string | null) {
    const db = await getDb();
    if (!db) throw new Error('DB not available');
    const predicate = acctUniqueId?.trim()
      ? or(eq(cardLifecycleSessions.acctUniqueId, acctUniqueId), eq(cardLifecycleSessions.acctSessionId, acctSessionId))
      : eq(cardLifecycleSessions.acctSessionId, acctSessionId);
    const rows = await db.select().from(cardLifecycleSessions).where(predicate).limit(1);
    return rows[0] ?? null;
  }
}

export const cardLifecycleRepository = new CardLifecycleRepository();
