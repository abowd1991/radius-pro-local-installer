/**
 * AccountingBridge — الجسر بين FreeRADIUS والـ V2 SessionEngine
 *
 * FreeRADIUS يُرسل Accounting requests عبر exec module لسكربت يستدعي هذا الـ endpoint:
 * POST /api/radius/accounting
 *
 * Radius Pro Local V2
 */
import type { Express, Request, Response } from 'express';
import { sessionEngine } from '../domains/accounting/SessionEngine';
import { Logger } from '../core/Logger';
import { Metrics } from '../core/Metrics';
import { getDb } from '../db';
import { eq } from 'drizzle-orm';
import { radiusCards } from '../../drizzle/schema';
import { voucherRepository } from '../domains/vouchers/repositories/VoucherRepository';
import { cardLifecycleRepository } from '../domains/vouchers/repositories/CardLifecycleRepository';
import { voucherEngine } from '../domains/vouchers/VoucherEngine';
import { usageEngine } from '../domains/accounting/UsageEngine';
import { calculateRemainingSessionSeconds } from '../domains/accounting/UsagePolicy';
import type { VoucherExpiryReason } from '../domains/vouchers/CardStatusPolicy';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountingPayload {
  acctStatusType?: string;
  acctSessionId?: string;
  acctUniqueId?: string;
  username?: string;
  nasIpAddress?: string;
  framedIpAddress?: string;
  acctSessionTime?: number | string;
  acctInputOctets?: number | string;
  acctOutputOctets?: number | string;
  acctTerminateCause?: string;
  // FreeRADIUS env vars format (uppercase)
  ACCT_STATUS_TYPE?: string;
  ACCT_SESSION_ID?: string;
  ACCT_UNIQUE_SESSION_ID?: string;
  USER_NAME?: string;
  NAS_IP_ADDRESS?: string;
  FRAMED_IP_ADDRESS?: string;
  ACCT_SESSION_TIME?: string;
  ACCT_INPUT_OCTETS?: string;
  ACCT_OUTPUT_OCTETS?: string;
  ACCT_TERMINATE_CAUSE?: string;
}

// ─── Helper: normalize FreeRADIUS env vars to camelCase ──────────────────────

function normalize(body: AccountingPayload) {
  return {
    acctStatusType: (body.acctStatusType ?? body.ACCT_STATUS_TYPE ?? 'Start') as string,
    acctSessionId: body.acctSessionId ?? body.ACCT_SESSION_ID ?? '',
    acctUniqueId: body.acctUniqueId ?? body.ACCT_UNIQUE_SESSION_ID ?? body.acctSessionId ?? body.ACCT_SESSION_ID ?? '',
    username: body.username ?? body.USER_NAME ?? '',
    nasIpAddress: body.nasIpAddress ?? body.NAS_IP_ADDRESS ?? '',
    framedIpAddress: body.framedIpAddress ?? body.FRAMED_IP_ADDRESS ?? '',
    acctSessionTime: Number(body.acctSessionTime ?? body.ACCT_SESSION_TIME ?? 0),
    acctInputOctets: Number(body.acctInputOctets ?? body.ACCT_INPUT_OCTETS ?? 0),
    acctOutputOctets: Number(body.acctOutputOctets ?? body.ACCT_OUTPUT_OCTETS ?? 0),
    acctTerminateCause: body.acctTerminateCause ?? body.ACCT_TERMINATE_CAUSE ?? 'NAS-Request',
  };
}

// ─── Helper: find card by username ───────────────────────────────────────────

interface CardInfo {
  id: number;
  lifecycleId: string;
  createdBy: number;
  usageBudgetSeconds: number | null;
  windowSeconds: number | null;
  windowEndTime: Date | null;
  firstUseAt: Date | null;
  totalSessionTime: number | null;
}

async function findCard(username: string): Promise<CardInfo | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select({
      id: radiusCards.id,
      lifecycleId: radiusCards.lifecycleId,
      createdBy: radiusCards.createdBy,
      usageBudgetSeconds: radiusCards.usageBudgetSeconds,
      windowSeconds: radiusCards.windowSeconds,
      windowEndTime: radiusCards.windowEndTime,
      firstUseAt: radiusCards.firstUseAt,
      totalSessionTime: radiusCards.totalSessionTime,
    })
      .from(radiusCards)
      .where(eq(radiusCards.username, username))
      .limit(1);
    return result[0] ?? null;
  } catch {
    return null;
  }
}

/** يعيد الكرت الحالي فقط إن طابقت هويته الثابتة Session Lifecycle. */
async function findCurrentCard(cardId: number | null, lifecycleId: string | null): Promise<CardInfo | null> {
  if (!cardId || !lifecycleId) return null;
  const card = await findCardById(cardId);
  return card?.lifecycleId === lifecycleId ? card : null;
}

async function findCardById(cardId: number): Promise<CardInfo | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const result = await db.select({
      id: radiusCards.id,
      lifecycleId: radiusCards.lifecycleId,
      createdBy: radiusCards.createdBy,
      usageBudgetSeconds: radiusCards.usageBudgetSeconds,
      windowSeconds: radiusCards.windowSeconds,
      windowEndTime: radiusCards.windowEndTime,
      firstUseAt: radiusCards.firstUseAt,
      totalSessionTime: radiusCards.totalSessionTime,
    }).from(radiusCards).where(eq(radiusCards.id, cardId)).limit(1);
    return result[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Helper: update card on first use ────────────────────────────────────────

async function updateCardOnStart(card: CardInfo, username: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const { sql: drizzleSql } = await import('drizzle-orm');

    // 1. تحديث firstUseAt + status → active عند أول استخدام فقط
    await db.execute(drizzleSql`
      UPDATE radius_cards
      SET
        status = 'active',
        firstUseAt = COALESCE(firstUseAt, NOW()),
        activatedAt = COALESCE(activatedAt, NOW()),
        lastUsedAt = NOW()
      WHERE id = ${card.id}
    `);

    // 2. تحديث windowEndTime عند أول استخدام (Validity Window)
    // windowSeconds = مدة الصلاحية من بداية الاستخدام
    const windowSec = card.windowSeconds ?? 0;
    if (windowSec > 0 && !card.windowEndTime && !card.firstUseAt) {
      // أول استخدام — احسب windowEndTime = NOW() + windowSeconds
      const windowEnd = new Date(Date.now() + windowSec * 1000);
      await db.execute(drizzleSql`
        UPDATE radius_cards
        SET windowEndTime = ${windowEnd}
        WHERE id = ${card.id} AND windowEndTime IS NULL
      `);
      // تحديث Expiration في radcheck ليعكس نهاية الـ Window
      await voucherRepository.updateExpirationInRadcheck(username, windowEnd);
      Logger.info(`AccountingBridge: set windowEndTime for ${username}: ${windowEnd.toISOString()} (window=${windowSec}s)`, {
        context: 'AccountingBridge',
      });
    } else if (windowSec > 0 && card.windowEndTime) {
      // الـ Window موجود بالفعل — تأكد من أن Expiration في radcheck محدّث
      const existing = card.windowEndTime;
      if (existing <= new Date()) {
        // الـ Window انتهى — أضف Reject
        Logger.warn(`AccountingBridge: card ${username} window expired at ${existing.toISOString()} — adding Reject`, {
          context: 'AccountingBridge',
        });
        await voucherEngine.expireCard({ cardId: card.id, username, reason: 'validity_expired', totalUsedSeconds: Number(card.totalSessionTime ?? 0) });
      }
    }

  } catch (err) {
    Logger.warn('AccountingBridge: updateCardOnStart failed', {
      context: 'AccountingBridge',
      data: { cardId: card.id, err: String(err) },
    });
  }
}

/**
 * مزامنة سياسة الدخول التالية فوراً بعد Stop أو Interim-Update.
 * لا تعتمد على Scheduler؛ FreeRADIUS يقرأ القيمة الجديدة قبل Reconnect.
 */
async function syncRemainingSessionTimeout(username: string, card: CardInfo): Promise<void> {
  const usage = await usageEngine.calculateUsage(username, card.id, card.lifecycleId);
  const runtime = await voucherRepository.getRuntimeStateByUsername(username);
  if (!runtime) return;
  const reason: VoucherExpiryReason | null = runtime.isUsageExhausted || (runtime.usageBudgetSeconds > 0 && usage.totalUsedSeconds >= runtime.usageBudgetSeconds)
    ? 'usage_exhausted'
    : runtime.isWindowExpired
      ? 'validity_expired'
      : runtime.isAbsoluteExpired
        ? 'absolute_expired'
        : null;
  if (reason) {
    await voucherEngine.expireCard({ cardId: card.id, username, reason, totalUsedSeconds: usage.totalUsedSeconds });
    Logger.info(`AccountingBridge: card expired for ${username}; Access-Reject enabled`, {
      context: 'AccountingBridge',
      data: { reason, used: usage.totalUsedSeconds },
    });
    return;
  }

  const limits: number[] = [];
  const budget = runtime.usageBudgetSeconds;
  if (budget > 0) limits.push(calculateRemainingSessionSeconds(budget, usage.totalUsedSeconds) ?? 0);
  if (runtime.remainingValiditySeconds !== null) limits.push(runtime.remainingValiditySeconds);
  if (!limits.length) return;
  const remaining = Math.min(...limits);
  await voucherRepository.updateSessionTimeoutInRadreply(username, remaining);
  Logger.info(`AccountingBridge: remaining Session-Timeout synchronized for ${username}`, {
    context: 'AccountingBridge',
    data: { budget, used: usage.totalUsedSeconds, remaining },
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handleAccounting(req: Request, res: Response): Promise<void> {
  const start = Date.now();
  try {
    const data = normalize(req.body as AccountingPayload);

    if (!data.username || !data.acctSessionId) {
      res.status(400).json({ error: 'missing username or acctSessionId' });
      return;
    }

    Logger.info(`AccountingBridge: ${data.acctStatusType} for ${data.username}`, {
      context: 'AccountingBridge',
      data: { acctSessionId: data.acctSessionId, nasIp: data.nasIpAddress },
    });

    if (data.acctStatusType === 'Start') {
      const card = await findCard(data.username);
      if (card) {
        await cardLifecycleRepository.ensureOpen({
          cardId: card.id,
          lifecycleId: card.lifecycleId,
          username: data.username,
          ownerId: card.createdBy,
        });
      }

      await sessionEngine.handleStart({
        acctSessionId: data.acctSessionId,
        acctUniqueId: data.acctUniqueId,
        username: data.username,
        nasIpAddress: data.nasIpAddress,
        framedIpAddress: data.framedIpAddress,
        startTime: new Date(),
        cardId: card?.id,
        lifecycleId: card?.lifecycleId,
      });

      if (card?.id) {
        await updateCardOnStart(card, data.username);
      }

      Metrics.record('accounting.start_time_ms', Date.now() - start, { context: 'AccountingBridge' });
      res.json({ ok: true, type: 'Start' });

    } else if (data.acctStatusType === 'Interim-Update') {
      const session = await sessionEngine.getActiveSessionForControl(data.acctSessionId);
      const card = await findCurrentCard(session?.cardId ?? null, session?.lifecycleId ?? null);
      await sessionEngine.handleUpdate(
        data.acctSessionId,
        data.acctSessionTime,
        data.acctInputOctets,
        data.acctOutputOctets,
      );
      if (card) {
        await syncRemainingSessionTimeout(data.username, card);
      }

      Metrics.record('accounting.update_time_ms', Date.now() - start, { context: 'AccountingBridge' });
      res.json({ ok: true, type: 'Interim-Update' });

    } else if (data.acctStatusType === 'Stop') {
      // Resolve before online_sessions is removed: an old Stop must not target a new card with the same username.
      const session = await sessionEngine.getActiveSessionForControl(data.acctSessionId);
      const card = await findCurrentCard(session?.cardId ?? null, session?.lifecycleId ?? null);

      await sessionEngine.handleStop({
        acctSessionId: data.acctSessionId,
        acctUniqueId: data.acctUniqueId,
        username: data.username,
        sessionTimeSeconds: data.acctSessionTime,
        terminateCause: data.acctTerminateCause,
        inputOctets: data.acctInputOctets,
        outputOctets: data.acctOutputOctets,
        cardId: session?.cardId ?? undefined,
        lifecycleId: session?.lifecycleId ?? undefined,
      });

      if (card) {
        await syncRemainingSessionTimeout(data.username, card);
      }

      Metrics.record('accounting.stop_time_ms', Date.now() - start, { context: 'AccountingBridge' });
      res.json({ ok: true, type: 'Stop' });

    } else {
      res.json({ ok: true, type: 'ignored' });
    }

  } catch (err) {
    Logger.warn('AccountingBridge: handler failed', {
      context: 'AccountingBridge',
      data: { err: String(err) },
    });
    res.status(500).json({ error: 'internal error' });
  }
}

// ─── Register routes ──────────────────────────────────────────────────────────

export function registerAccountingBridge(app: Express): void {
  // POST /api/radius/accounting — يستقبل من FreeRADIUS exec module (localhost فقط)
  app.post('/api/radius/accounting', handleAccounting);

  // GET /api/radius/accounting/health
  app.get('/api/radius/accounting/health', (_req, res) => {
    res.json({ ok: true, service: 'AccountingBridge', version: 'v2' });
  });

  Logger.info('AccountingBridge: registered /api/radius/accounting', {
    context: 'AccountingBridge',
  });
}
