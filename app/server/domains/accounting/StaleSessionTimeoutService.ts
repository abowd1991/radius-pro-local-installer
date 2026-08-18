import { getRedis } from '../../_core/redis';
import { systemSettingsRepository } from '../core/repositories/SystemSettingsRepository';

export const STALE_SESSION_TIMEOUT_KEY = 'session.stale_timeout_seconds';
export const STALE_SESSION_TIMEOUT_REDIS_KEY = 'radius-pro:settings:session.stale_timeout_seconds';
export const DEFAULT_STALE_SESSION_TIMEOUT_SECONDS = 300;
export const MIN_STALE_SESSION_TIMEOUT_SECONDS = 60;
export const MAX_STALE_SESSION_TIMEOUT_SECONDS = 3600;

export function normalizeStaleSessionTimeout(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < MIN_STALE_SESSION_TIMEOUT_SECONDS || parsed > MAX_STALE_SESSION_TIMEOUT_SECONDS) {
    return DEFAULT_STALE_SESSION_TIMEOUT_SECONDS;
  }
  return parsed;
}

/**
 * مصدر مهلة stale الوحيد. system_settings هو المصدر الدائم، وRedis cache فقط.
 * لا توجد أي قيمة ثابتة تشغيلية داخل CleanupEngine أو Dashboard Health.
 */
export class StaleSessionTimeoutService {
  private memoryValue: number | null = null;

  async getTimeoutSeconds(): Promise<number> {
    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get(STALE_SESSION_TIMEOUT_REDIS_KEY);
        if (cached !== null) {
          const normalized = normalizeStaleSessionTimeout(cached);
          this.memoryValue = normalized;
          return normalized;
        }
      } catch {
        // Redis cache is optional; use the persisted setting below.
      }
    }

    try {
      const persisted = await systemSettingsRepository.getValue(STALE_SESSION_TIMEOUT_KEY);
      const normalized = persisted === null
        ? DEFAULT_STALE_SESSION_TIMEOUT_SECONDS
        : normalizeStaleSessionTimeout(persisted);
      if (persisted === null) {
        await systemSettingsRepository.upsertNumber(
          STALE_SESSION_TIMEOUT_KEY,
          normalized,
          'مهلة اعتبار الجلسة متوقفة عند غياب Accounting/Interim Update موثوق (بالثواني)'
        );
      }
      this.memoryValue = normalized;
      if (redis) await redis.set(STALE_SESSION_TIMEOUT_REDIS_KEY, String(normalized)).catch(() => {});
      return normalized;
    } catch {
      return this.memoryValue ?? DEFAULT_STALE_SESSION_TIMEOUT_SECONDS;
    }
  }

  async updateTimeoutSeconds(value: number): Promise<number> {
    if (!Number.isInteger(value) || value < MIN_STALE_SESSION_TIMEOUT_SECONDS || value > MAX_STALE_SESSION_TIMEOUT_SECONDS) {
      throw new Error(`Stale session timeout must be ${MIN_STALE_SESSION_TIMEOUT_SECONDS}-${MAX_STALE_SESSION_TIMEOUT_SECONDS} seconds`);
    }
    await systemSettingsRepository.upsertNumber(
      STALE_SESSION_TIMEOUT_KEY,
      value,
      'مهلة اعتبار الجلسة متوقفة عند غياب Accounting/Interim Update موثوق (بالثواني)'
    );
    this.memoryValue = value;
    const redis = getRedis();
    if (redis) await redis.set(STALE_SESSION_TIMEOUT_REDIS_KEY, String(value)).catch(() => {});
    return value;
  }
}

export const staleSessionTimeoutService = new StaleSessionTimeoutService();
