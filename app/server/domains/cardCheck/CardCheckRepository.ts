/**
 * CardCheckRepository — قراءة عامة معزولة لدورة الكرت.
 *
 * online_sessions = الحالة الحية فقط.
 * radacct = تاريخ وتدقيق فقط، ويرتبط عبر card_lifecycle_sessions لا username.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { plans, radiusCards } from "../../../drizzle/schema";
import { accountingRepository } from "../accounting/repositories/AccountingRepository";
import { sessionRepository } from "../accounting/repositories/SessionRepository";

export interface CardCheckCard {
  id: number;
  lifecycleId: string;
  username: string;
  status: string;
  expiresAt: Date | null;
  activatedAt: Date | null;
  firstLoginAt: Date | null;
  firstUseAt: Date | null;
  windowEndTime: Date | null;
  createdAt: Date;
  createdBy: number;
  planName: string | null;
  dataLimitBytes: number | null;
  sessionTimeout: number | null;
  rateLimit: string | null;
  usageBudgetSeconds: number;
  windowSeconds: number;
  totalSessionTime: number;
  totalDataUsed: number;
}

export class CardCheckRepository {
  async findLifecycleIdByCardId(cardId: number): Promise<string | null> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const rows = await db.select({ lifecycleId: radiusCards.lifecycleId })
      .from(radiusCards)
      .where(eq(radiusCards.id, cardId))
      .limit(1);
    return rows[0]?.lifecycleId ?? null;
  }

  async findCurrentCard(ownerId: number, username: string): Promise<CardCheckCard | null> {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const rows = await db.select({
      id: radiusCards.id,
      lifecycleId: radiusCards.lifecycleId,
      username: radiusCards.username,
      status: radiusCards.status,
      expiresAt: radiusCards.expiresAt,
      activatedAt: radiusCards.activatedAt,
      firstLoginAt: radiusCards.firstLoginAt,
      firstUseAt: radiusCards.firstUseAt,
      windowEndTime: radiusCards.windowEndTime,
      createdAt: radiusCards.createdAt,
      createdBy: radiusCards.createdBy,
      planName: plans.name,
      dataLimitBytes: plans.dataLimit,
      sessionTimeout: plans.sessionTimeout,
      rateLimit: plans.mikrotikRateLimit,
      usageBudgetSeconds: radiusCards.usageBudgetSeconds,
      windowSeconds: radiusCards.windowSeconds,
      totalSessionTime: radiusCards.totalSessionTime,
      totalDataUsed: radiusCards.totalDataUsed,
    })
      .from(radiusCards)
      .leftJoin(plans, eq(radiusCards.planId, plans.id))
      .where(and(eq(radiusCards.username, username), eq(radiusCards.createdBy, ownerId)))
      .limit(1);

    const card = rows[0];
    if (!card) return null;
    return {
      ...card,
      usageBudgetSeconds: Number(card.usageBudgetSeconds ?? 0),
      windowSeconds: Number(card.windowSeconds ?? 0),
      totalSessionTime: Number(card.totalSessionTime ?? 0),
      totalDataUsed: Number(card.totalDataUsed ?? 0),
      dataLimitBytes: card.dataLimitBytes === null ? null : Number(card.dataLimitBytes),
      sessionTimeout: card.sessionTimeout === null ? null : Number(card.sessionTimeout),
    };
  }

  /** التاريخ والجلسة الحية معزولان بالـlifecycleId للكرت الحالي فقط. */
  async getLifecycleSnapshot(lifecycleId: string) {
    const [audit, activeSessions] = await Promise.all([
      accountingRepository.getLifecycleAuditSnapshot(lifecycleId),
      sessionRepository.findByLifecycleId(lifecycleId),
    ]);
    return { audit, activeSessions };
  }
}

export const cardCheckRepository = new CardCheckRepository();
