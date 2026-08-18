/**
 * UsageEngine — حساب الوقت المستهلك بدقة
 * الصيغة: totalUsed = totalSessionTime + mergeIntervals(online_sessions) - renewalAnchor
 * radacct = سجل تدقيق فقط — لا يُقرأ في كل دورة
 * Radius Pro Local V2
 */

import { sessionRepository } from './repositories/SessionRepository';
import { accountingRepository } from './repositories/AccountingRepository';
import { Logger } from '../../core/Logger';
import { Metrics } from '../../core/Metrics';
import type { UsageResult } from './types/accounting.types';
import { getDb } from '../../db';
import { radiusCards } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

export class UsageEngine {
  /**
   * حساب الاستخدام الكامل لمستخدم
   * يقرأ من: totalSessionTime (Cache) + online_sessions (النشطة)
   */
  async calculateUsage(username: string, cardId: number, lifecycleId?: string): Promise<UsageResult> {
    const start = Date.now();

    // 1. قراءة totalSessionTime من Cache
    const closedSeconds = await accountingRepository.getTotalSessionTime(cardId);

    // 2. قراءة الجلسات النشطة من online_sessions
    const activeSessions = lifecycleId
      ? await sessionRepository.findByLifecycleId(lifecycleId)
      : await sessionRepository.findByUsername(username);
    const activeSeconds = this.mergeAndSumActiveSessions(activeSessions);

    // 3. قراءة Renewal Anchor (لمنع احتساب وقت الكرت القديم)
    const renewalAnchor = await this.getRenewalAnchor(cardId);

    // 4. الحساب النهائي
    const totalUsedSeconds = closedSeconds + Math.max(0, activeSeconds - renewalAnchor);

    Metrics.record('usage.calculation_ms', Date.now() - start, { context: 'UsageEngine' });

    return {
      username,
      totalUsedSeconds,
      closedSessionsSeconds: closedSeconds,
      activeSessionsSeconds: activeSeconds,
      renewalAnchorSeconds: renewalAnchor,
      calculatedAt: new Date(),
    };
  }

  /**
   * حساب الاستخدام لمجموعة مستخدمين (Batch)
   * يُستخدم في checkAndDisableExpiredCards
   */
  async calculateBatchUsage(cards: Array<{ username: string; cardId: number; lifecycleId?: string; renewalAnchor?: number }>): Promise<Map<string, number>> {
    const start = Date.now();
    const result = new Map<string, number>();

    // قراءة جميع الجلسات النشطة مرة واحدة
    const allActiveSessions = await sessionRepository.findAll();
    const sessionsByIdentity = new Map<string, typeof allActiveSessions>();
    for (const session of allActiveSessions) {
      const identity = session.lifecycleId ?? `username:${session.username}`;
      const existing = sessionsByIdentity.get(identity) ?? [];
      existing.push(session);
      sessionsByIdentity.set(identity, existing);
    }

    for (const card of cards) {
      const closedSeconds = await accountingRepository.getTotalSessionTime(card.cardId);
      const activeSessions = sessionsByIdentity.get(card.lifecycleId ?? `username:${card.username}`) ?? [];
      const activeSeconds = this.mergeAndSumActiveSessions(activeSessions);
      const renewalAnchor = card.renewalAnchor ?? 0;
      const total = closedSeconds + Math.max(0, activeSeconds - renewalAnchor);
      result.set(card.username, total);
    }

    Metrics.record('usage.batch_calculation_ms', Date.now() - start, {
      context: 'UsageEngine',
      unit: 'ms',
    });
    Metrics.record('usage.batch_size', cards.length, { unit: 'count', context: 'UsageEngine' });

    return result;
  }

  /**
   * دمج الجلسات المتداخلة وحساب الوقت الكلي
   * يمنع احتساب نفس الوقت مرتين عند تعدد الأجهزة
   */
  private mergeAndSumActiveSessions(sessions: Array<{ startTime: Date; sessionTime: number | null }>): number {
    if (sessions.length === 0) return 0;

    // تحويل لـ intervals [start, end]
    const intervals = sessions.map(s => {
      const start = s.startTime.getTime();
      const end = start + (s.sessionTime ?? 0) * 1000;
      return [start, end] as [number, number];
    });

    // ترتيب حسب البداية
    intervals.sort((a, b) => a[0] - b[0]);

    // دمج المتداخلة
    const merged: [number, number][] = [];
    let current = intervals[0]!;
    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i]!;
      if (next[0] <= current[1]) {
        current = [current[0], Math.max(current[1], next[1])];
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    // حساب المجموع بالثواني
    return Math.round(merged.reduce((sum, [s, e]) => sum + (e - s), 0) / 1000);
  }

  private async getRenewalAnchor(cardId: number): Promise<number> {
    try {
      const db = await getDb();
      if (!db) return 0;
      const result = await db.select({ anchor: radiusCards.renewalAnchorSessionTime })
        .from(radiusCards)
        .where(eq(radiusCards.id, cardId))
        .limit(1);
      return result[0]?.anchor ?? 0;
    } catch {
      return 0;
    }
  }
}

export const usageEngine = new UsageEngine();
