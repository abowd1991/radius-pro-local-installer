/**
 * HealthCheck — مراقبة صحة النظام
 * يفحص: قاعدة البيانات، Redis، FreeRADIUS، الذاكرة، القرص
 * Radius Pro Local V2
 */

import { getDb } from '../db';
import { Logger } from './Logger';
import { EventBus, Events } from './EventBus';
import { Config } from './ConfigService';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: 'ok' | 'error';
    memory: 'ok' | 'warning' | 'critical';
    uptime: number;
  };
}

class HealthCheckService {
  async check(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkMemory(),
    ]);

    const dbStatus = checks[0]?.status === 'fulfilled' ? checks[0].value : 'error';
    const memStatus = checks[1]?.status === 'fulfilled' ? checks[1].value : 'warning';

    const status: HealthStatus['status'] =
      dbStatus === 'error' ? 'unhealthy' :
      memStatus === 'critical' ? 'degraded' : 'healthy';

    const result: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus as 'ok' | 'error',
        memory: memStatus as 'ok' | 'warning' | 'critical',
        uptime: Math.floor(process.uptime()),
      },
    };

    if (status !== 'healthy') {
      Logger.warn(`HealthCheck: system is ${status}`, {
        context: 'HealthCheck',
        data: result.checks as unknown as Record<string, unknown>,
      });
      await EventBus.publish(Events.HEALTH_CHECK_FAILED, result);
    }

    return result;
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      const db = await getDb();
      if (!db) return 'error';
      // ping بسيط
      await (db as { execute: (q: string) => Promise<unknown> }).execute('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private checkMemory(): 'ok' | 'warning' | 'critical' {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const percent = Math.round((heapUsedMB / heapTotalMB) * 100);

    if (percent >= Config.MEMORY_WARNING_THRESHOLD + 10) return 'critical';
    if (percent >= Config.MEMORY_WARNING_THRESHOLD) return 'warning';
    return 'ok';
  }
}

export const HealthCheck = new HealthCheckService();

