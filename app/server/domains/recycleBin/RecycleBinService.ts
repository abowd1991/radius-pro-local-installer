import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import {
  auditLogs,
  cardBatches,
  onlineSessions,
  radiusCards,
  radcheck,
  radreply,
  radusergroup,
  recycleBinItems,
  subscriberSubscriptions,
  subscribers,
  systemSettings,
} from "../../../drizzle/schema";

export type RecycleEntityType = "card" | "batch" | "subscriber";

export type RecycleActor = {
  userId: number;
  role: string;
  ownerId: number;
  resellerId?: number | null;
};

type RecycleSnapshot = {
  version: 1;
  entityType: RecycleEntityType;
  data: Record<string, unknown>;
};

const DEFAULT_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 365;

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function restoreDates<T extends Record<string, any>>(row: T, keys: string[]): T {
  const copy: Record<string, any> = { ...row };
  for (const key of keys) {
    if (copy[key]) copy[key] = toDate(copy[key]);
  }
  return copy as T;
}

async function retentionDays(db: any): Promise<number> {
  const [setting] = await db.select().from(systemSettings)
    .where(eq(systemSettings.key, "recycle_bin_retention_days"))
    .limit(1);
  const parsed = Number(setting?.value ?? DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(parsed)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(1, Math.floor(parsed)));
}

async function getSettingValue(db: any, key: string, fallback: string): Promise<string> {
  const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return setting?.value ?? fallback;
}

async function setSettingValue(db: any, key: string, value: string, description: string) {
  await db.insert(systemSettings).values({ key, value, type: "string", description })
    .onDuplicateKeyUpdate({ set: { value, description } });
}

function purgeAtFrom(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function writeAudit(db: any, actor: RecycleActor, action: string, type: RecycleEntityType, id: string, name: string, details: Record<string, unknown>) {
  await db.insert(auditLogs).values({
    userId: actor.userId,
    userRole: actor.role,
    action,
    targetType: type === "card" ? "card" : type === "subscriber" ? "subscriber" : "system",
    targetId: id,
    targetName: name,
    details,
    result: "success",
    createdAt: new Date(),
  });
}

async function archiveRadiusRows(db: any, usernames: string[]) {
  if (!usernames.length) return { checks: [], replies: [], groups: [] };
  const [checks, replies, groups] = await Promise.all([
    db.select().from(radcheck).where(inArray(radcheck.username, usernames)),
    db.select().from(radreply).where(inArray(radreply.username, usernames)),
    db.select().from(radusergroup).where(inArray(radusergroup.username, usernames)),
  ]);
  await Promise.all([
    db.delete(radcheck).where(inArray(radcheck.username, usernames)),
    db.delete(radreply).where(inArray(radreply.username, usernames)),
    db.delete(radusergroup).where(inArray(radusergroup.username, usernames)),
  ]);
  return { checks, replies, groups };
}

async function archiveLiveSessions(db: any, usernames: string[]) {
  if (!usernames.length) return [];
  const sessions = await db.select().from(onlineSessions).where(inArray(onlineSessions.username, usernames));
  await db.delete(onlineSessions).where(inArray(onlineSessions.username, usernames));
  return sessions;
}

async function restoreRadiusRows(db: any, radius: any) {
  if (radius?.checks?.length) await db.insert(radcheck).values(radius.checks);
  if (radius?.replies?.length) await db.insert(radreply).values(radius.replies);
  if (radius?.groups?.length) await db.insert(radusergroup).values(radius.groups);
}

function hydrateCard(card: Record<string, any>) {
  return restoreDates(card, [
    "activatedAt", "firstLoginAt", "expiresAt", "lastActivity", "firstUseAt",
    "lastUsedAt", "windowEndTime", "expiryReminderSentAt", "createdAt", "updatedAt",
  ]);
}

function hydrateBatch(batch: Record<string, any>) {
  return restoreDates(batch, ["createdAt", "updatedAt"]);
}

function hydrateSubscriber(subscriber: Record<string, any>) {
  return restoreDates(subscriber, [
    "subscriptionStartDate", "subscriptionEndDate", "lastLoginAt", "expiryReminderSentAt",
    "createdAt", "updatedAt",
  ]);
}

function hydrateSubscription(subscription: Record<string, any>) {
  return restoreDates(subscription, ["startDate", "endDate", "createdAt"]);
}

export class RecycleBinService {
  async archiveCard(cardId: number, actor: RecycleActor) {
    const db = await getDb();
    if (!db) throw new Error("قاعدة البيانات غير متاحة");
    return db.transaction(async (tx: any) => {
      const [card] = await tx.select().from(radiusCards).where(eq(radiusCards.id, cardId)).limit(1);
      if (!card || card.createdBy !== actor.ownerId) throw new Error("الكرت غير موجود أو غير مصرح");
      const radius = await archiveRadiusRows(tx, [card.username]);
      const liveSessions = await archiveLiveSessions(tx, [card.username]);
      const id = nanoid(24);
      const days = await retentionDays(tx);
      const snapshot: RecycleSnapshot = { version: 1, entityType: "card", data: { card, radius, liveSessions } };
      await tx.insert(recycleBinItems).values({
        id, entityType: "card", entityId: String(card.id), displayName: card.username,
        batchId: card.batchId, ownerId: actor.ownerId, resellerId: card.resellerId ?? actor.resellerId ?? null, deletedBy: actor.userId,
        deletedByRole: actor.role, snapshot, purgeAt: purgeAtFrom(days),
      });
      await tx.delete(radiusCards).where(eq(radiusCards.id, card.id));
      await writeAudit(tx, actor, "recycle_bin_moved", "card", String(card.id), card.username, { recycleBinId: id });
      return { id, displayName: card.username, entityType: "card" as const };
    });
  }

  async archiveBatch(batchId: string, deleteCards: boolean, actor: RecycleActor) {
    const db = await getDb();
    if (!db) throw new Error("قاعدة البيانات غير متاحة");
    return db.transaction(async (tx: any) => {
      const [batch] = await tx.select().from(cardBatches).where(eq(cardBatches.batchId, batchId)).limit(1);
      if (!batch || (batch.createdBy !== actor.ownerId && batch.resellerId !== actor.ownerId)) {
        throw new Error("الدفعة غير موجودة أو غير مصرح");
      }
      const cards = await tx.select().from(radiusCards).where(eq(radiusCards.batchId, batchId));
      const id = nanoid(24);
      const days = await retentionDays(tx);
      let radius = { checks: [], replies: [], groups: [] } as any;
      let liveSessions: any[] = [];
      if (deleteCards && cards.length) {
        radius = await archiveRadiusRows(tx, cards.map((card: any) => card.username));
        liveSessions = await archiveLiveSessions(tx, cards.map((card: any) => card.username));
        await tx.delete(radiusCards).where(inArray(radiusCards.id, cards.map((card: any) => card.id)));
      } else if (cards.length) {
        await tx.update(radiusCards).set({ batchId: null }).where(inArray(radiusCards.id, cards.map((card: any) => card.id)));
      }
      const snapshot: RecycleSnapshot = {
        version: 1,
        entityType: "batch",
        data: { batch, cards: deleteCards ? cards : [], detachedCardIds: deleteCards ? [] : cards.map((card: any) => card.id), radius, liveSessions, deleteCards },
      };
      await tx.insert(recycleBinItems).values({
        id, entityType: "batch", entityId: batch.batchId, displayName: batch.name, batchId: batch.batchId,
        ownerId: actor.ownerId, resellerId: batch.resellerId ?? actor.resellerId ?? null, deletedBy: actor.userId, deletedByRole: actor.role,
        snapshot, purgeAt: purgeAtFrom(days),
      });
      await tx.delete(cardBatches).where(eq(cardBatches.batchId, batch.batchId));
      await writeAudit(tx, actor, "recycle_bin_moved", "batch", batch.batchId, batch.name, { recycleBinId: id, deleteCards, cardCount: cards.length });
      return { id, displayName: batch.name, entityType: "batch" as const, cardCount: cards.length };
    });
  }

  async archiveSubscriber(subscriberId: number, actor: RecycleActor) {
    const db = await getDb();
    if (!db) throw new Error("قاعدة البيانات غير متاحة");
    return db.transaction(async (tx: any) => {
      const [subscriber] = await tx.select().from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
      if (!subscriber || subscriber.ownerId !== actor.ownerId) throw new Error("المشترك غير موجود أو غير مصرح");
      const subscriptions = await tx.select().from(subscriberSubscriptions)
        .where(eq(subscriberSubscriptions.subscriberId, subscriber.id));
      const radius = await archiveRadiusRows(tx, [subscriber.username]);
      const liveSessions = await archiveLiveSessions(tx, [subscriber.username]);
      const id = nanoid(24);
      const days = await retentionDays(tx);
      const snapshot: RecycleSnapshot = { version: 1, entityType: "subscriber", data: { subscriber, subscriptions, radius, liveSessions } };
      await tx.insert(recycleBinItems).values({
        id, entityType: "subscriber", entityId: String(subscriber.id), displayName: subscriber.fullName,
        ownerId: actor.ownerId, resellerId: actor.resellerId ?? null, deletedBy: actor.userId, deletedByRole: actor.role,
        snapshot, purgeAt: purgeAtFrom(days),
      });
      await tx.delete(subscriberSubscriptions).where(eq(subscriberSubscriptions.subscriberId, subscriber.id));
      await tx.delete(subscribers).where(eq(subscribers.id, subscriber.id));
      await writeAudit(tx, actor, "recycle_bin_moved", "subscriber", String(subscriber.id), subscriber.fullName, { recycleBinId: id, username: subscriber.username });
      return { id, displayName: subscriber.fullName, entityType: "subscriber" as const };
    });
  }

  async list(ownerId: number, entityType?: RecycleEntityType) {
    const db = await getDb();
    if (!db) return [];
    const where = entityType
      ? and(eq(recycleBinItems.ownerId, ownerId), eq(recycleBinItems.entityType, entityType), eq(recycleBinItems.status, "deleted"))
      : and(eq(recycleBinItems.ownerId, ownerId), eq(recycleBinItems.status, "deleted"));
    return db.select().from(recycleBinItems).where(where).orderBy(asc(recycleBinItems.purgeAt));
  }

  async getById(itemId: string) {
    const db = await getDb();
    if (!db) return null;
    const [item] = await db.select().from(recycleBinItems).where(eq(recycleBinItems.id, itemId)).limit(1);
    return item ?? null;
  }

  async restore(itemId: string, actor: RecycleActor) {
    const db = await getDb();
    if (!db) throw new Error("قاعدة البيانات غير متاحة");
    return db.transaction(async (tx: any) => {
      const [item] = await tx.select().from(recycleBinItems)
        .where(and(eq(recycleBinItems.id, itemId), eq(recycleBinItems.ownerId, actor.ownerId), eq(recycleBinItems.status, "deleted")))
        .limit(1);
      if (!item) throw new Error("العنصر غير موجود في سلة المحذوفات أو غير مصرح");
      const snapshot = item.snapshot as RecycleSnapshot;
      const data = snapshot.data as any;

      if (snapshot.entityType === "card") {
        const card = hydrateCard(data.card);
        const [collision] = await tx.select({ id: radiusCards.id }).from(radiusCards).where(eq(radiusCards.username, card.username)).limit(1);
        if (collision) throw new Error("لا يمكن الاستعادة: اسم مستخدم الكرت مستخدم حالياً");
        await tx.insert(radiusCards).values(card);
        await restoreRadiusRows(tx, data.radius);
      } else if (snapshot.entityType === "batch") {
        const batch = hydrateBatch(data.batch);
        const [collision] = await tx.select({ id: cardBatches.id }).from(cardBatches).where(eq(cardBatches.batchId, batch.batchId)).limit(1);
        if (collision) throw new Error("لا يمكن الاستعادة: رقم الدفعة مستخدم حالياً");
        const cards = (data.cards ?? []).map(hydrateCard);
        for (const card of cards) {
          const [cardCollision] = await tx.select({ id: radiusCards.id }).from(radiusCards).where(eq(radiusCards.username, card.username)).limit(1);
          if (cardCollision) throw new Error(`لا يمكن الاستعادة: الكرت ${card.username} مستخدم حالياً`);
        }
        await tx.insert(cardBatches).values(batch);
        if (cards.length) await tx.insert(radiusCards).values(cards);
        if (data.detachedCardIds?.length) {
          await tx.update(radiusCards).set({ batchId: batch.batchId }).where(and(inArray(radiusCards.id, data.detachedCardIds), eq(radiusCards.batchId, null as any)));
        }
        await restoreRadiusRows(tx, data.radius);
      } else if (snapshot.entityType === "subscriber") {
        const subscriber = hydrateSubscriber(data.subscriber);
        const [collision] = await tx.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.username, subscriber.username)).limit(1);
        if (collision) throw new Error("لا يمكن الاستعادة: اسم مستخدم المشترك مستخدم حالياً");
        await tx.insert(subscribers).values(subscriber);
        const subscriptions = (data.subscriptions ?? []).map(hydrateSubscription);
        if (subscriptions.length) await tx.insert(subscriberSubscriptions).values(subscriptions);
        await restoreRadiusRows(tx, data.radius);
      } else {
        throw new Error("نوع أرشيف غير مدعوم");
      }

      await tx.delete(recycleBinItems).where(eq(recycleBinItems.id, item.id));
      await writeAudit(tx, actor, "recycle_bin_restored", snapshot.entityType, item.entityId, item.displayName, { recycleBinId: item.id });
      return { success: true, entityType: snapshot.entityType, displayName: item.displayName };
    });
  }

  async permanentlyDelete(itemId: string, actor: RecycleActor) {
    const db = await getDb();
    if (!db) throw new Error("قاعدة البيانات غير متاحة");
    return db.transaction(async (tx: any) => {
      const [item] = await tx.select().from(recycleBinItems)
        .where(and(eq(recycleBinItems.id, itemId), eq(recycleBinItems.ownerId, actor.ownerId), eq(recycleBinItems.status, "deleted")))
        .limit(1);
      if (!item) throw new Error("العنصر غير موجود في سلة المحذوفات أو غير مصرح");
      await tx.delete(recycleBinItems).where(eq(recycleBinItems.id, item.id));
      await writeAudit(tx, actor, "recycle_bin_purged", item.entityType as RecycleEntityType, item.entityId, item.displayName, { recycleBinId: item.id, manual: true });
      return { success: true };
    });
  }

  async cleanupExpired() {
    const db = await getDb();
    if (!db) return 0;
    return db.transaction(async (tx: any) => {
      const expired = await tx.select().from(recycleBinItems)
        .where(and(eq(recycleBinItems.status, "deleted"), lte(recycleBinItems.purgeAt, new Date())));
      if (!expired.length) return 0;
      for (const item of expired) {
        await writeAudit(tx, {
          userId: 0,
          role: "system",
          ownerId: item.ownerId,
          resellerId: item.resellerId,
        }, "recycle_bin_expired", item.entityType as RecycleEntityType, item.entityId, item.displayName, {
          recycleBinId: item.id,
          automatic: true,
          purgeAt: item.purgeAt.toISOString(),
        });
      }
      await tx.delete(recycleBinItems).where(inArray(recycleBinItems.id, expired.map((item: { id: string }) => item.id)));
      return expired.length;
    });
  }

  async cleanupIfDue() {
    const db = await getDb();
    if (!db) return { skipped: true, reason: "قاعدة البيانات غير متاحة", deleted: 0 };
    const enabled = await getSettingValue(db, "recycle_bin_cleanup_enabled", "true");
    if (enabled !== "true") return { skipped: true, reason: "التنظيف التلقائي متوقف", deleted: 0 };
    const requestedHours = Number(await getSettingValue(db, "recycle_bin_cleanup_interval_hours", "24"));
    const intervalHours = Math.min(24, Math.max(1, Number.isFinite(requestedHours) ? Math.floor(requestedHours) : 24));
    const previous = toDate(await getSettingValue(db, "recycle_bin_cleanup_last_run_at", ""));
    if (previous && Date.now() - previous.getTime() < intervalHours * 60 * 60 * 1000) {
      return { skipped: true, reason: "لم يحن موعد التنظيف", deleted: 0 };
    }
    const deleted = await this.cleanupExpired();
    await setSettingValue(db, "recycle_bin_cleanup_last_run_at", new Date().toISOString(), "آخر تشغيل لتنظيف سلة المحذوفات");
    return { skipped: false, deleted, intervalHours };
  }
}

export const recycleBinService = new RecycleBinService();
