import type { Express, Request, Response } from 'express';
import { usageEngine } from '../domains/accounting/UsageEngine';
import { voucherEngine } from '../domains/vouchers/VoucherEngine';
import { voucherRepository } from '../domains/vouchers/repositories/VoucherRepository';
import { expiryReplyMessage, type VoucherExpiryReason } from '../domains/vouchers/CardStatusPolicy';
import { planNasIsolationRepository } from '../domains/radius/repositories/PlanNasIsolationRepository';
import { Logger } from '../core/Logger';

interface AuthorizationBody { username?: string; USER_NAME?: string; nasIp?: string; NAS_IP_ADDRESS?: string }

/**
 * جسر V2 داخل مسار authorize. يقرر expiry قبل Access-Accept، ويعيد حد الجلسة
 * الأصغر بين Usage المتبقي وValidity المتبقي. لا يملك كلمات المرور ولا يتحقق منها.
 */
async function authorizeCard(username: string, nasIp?: string): Promise<{ decision: 'allow' | 'reject'; replyMessage?: string; sessionTimeout?: number }> {
  const card = await voucherRepository.getRuntimeStateByUsername(username);
  if (!card) return { decision: 'allow' };

  if (nasIp) {
    const isolation = await planNasIsolationRepository.isNasAllowed(username, nasIp);
    if (isolation.restricted && !isolation.allowed) {
      return { decision: 'reject', replyMessage: 'هذا الكرت غير مسموح على هذه الشبكة' };
    }
  }

  const usage = await usageEngine.calculateUsage(username, card.id);
  const reason: VoucherExpiryReason | null = card.isUsageExhausted || (card.usageBudgetSeconds > 0 && usage.totalUsedSeconds >= card.usageBudgetSeconds)
    ? 'usage_exhausted'
    : card.isWindowExpired
      ? 'validity_expired'
      : card.isAbsoluteExpired
        ? 'absolute_expired'
        : null;
  if (reason) {
    await voucherEngine.expireCard({ cardId: card.id, username, reason, totalUsedSeconds: usage.totalUsedSeconds });
    return { decision: 'reject', replyMessage: expiryReplyMessage(reason) };
  }

  const limits: number[] = [];
  const budget = Number(card.usageBudgetSeconds ?? 0);
  if (budget > 0) limits.push(Math.max(0, budget - usage.totalUsedSeconds));
  const validity = card.remainingValiditySeconds;
  if (validity !== null) limits.push(validity);
  const sessionTimeout = limits.length ? Math.min(...limits) : undefined;
  return { decision: 'allow', sessionTimeout };
}

export function registerAuthorizationBridge(app: Express): void {
  app.post('/api/radius/authorize-card', async (req: Request, res: Response) => {
    const body = req.body as AuthorizationBody;
    const username = String(body?.username ?? body?.USER_NAME ?? '').trim();
    const nasIp = String(body?.nasIp ?? body?.NAS_IP_ADDRESS ?? '').trim();
    if (!username) return res.status(400).json({ error: 'missing username' });
    try {
      const result = await authorizeCard(username, nasIp || undefined);
      return res.json({ ok: true, ...result });
    } catch (error) {
      Logger.error('AuthorizationBridge: card decision failed', { context: 'AuthorizationBridge', error, data: { username } });
      return res.status(503).json({ error: 'authorization unavailable' });
    }
  });
}
