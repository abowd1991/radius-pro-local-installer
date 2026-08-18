/**
 * Scheduler — إدارة المهام الدورية
 * لا setInterval() منتشرة في الكود — كل Job مسجّل هنا
 * Radius Pro Local V2
 */

import { Logger } from './Logger';
import { Metrics } from './Metrics';

export interface ScheduledJob {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
  runImmediately?: boolean;
}

interface RunningJob extends ScheduledJob {
  timer: ReturnType<typeof setInterval>;
  lastRun?: Date;
  lastError?: string;
  runCount: number;
}

class SchedulerService {
  private jobs = new Map<string, RunningJob>();
  private started = false;

  /** تسجيل Job دوري */
  register(job: ScheduledJob): void {
    if (this.jobs.has(job.name)) {
      Logger.warn(`Scheduler: job ${job.name} already registered — skipping`, {
        context: 'Scheduler',
      });
      return;
    }
    Logger.info(`Scheduler: registered job "${job.name}" every ${job.intervalMs}ms`, {
      context: 'Scheduler',
    });
    // سيُشغَّل عند استدعاء start()
    this.jobs.set(job.name, { ...job, timer: null as unknown as ReturnType<typeof setInterval>, runCount: 0 });
  }

  /** بدء تشغيل جميع الـ Jobs */
  start(): void {
    if (this.started) return;
    this.started = true;

    Array.from(this.jobs.entries()).forEach(([name, job]) => {
      const runJob = async () => {
        const start = Date.now();
        try {
          await job.handler();
          job.lastRun = new Date();
          job.runCount++;
          Metrics.record(`scheduler.${name}.duration_ms`, Date.now() - start, { unit: 'ms' });
        } catch (err) {
          job.lastError = err instanceof Error ? err.message : String(err);
          Logger.error(`Scheduler: job "${name}" failed`, {
            context: 'Scheduler',
            error: err,
          });
        }
      };

      if (job.runImmediately) {
        void runJob();
      }

      job.timer = setInterval(runJob, job.intervalMs);
      Logger.info(`Scheduler: started job "${name}"`, { context: 'Scheduler' });
    });
  }

  /** إيقاف جميع الـ Jobs */
  stop(): void {
    Array.from(this.jobs.entries()).forEach(([name, job]) => {
      clearInterval(job.timer);
      Logger.info(`Scheduler: stopped job "${name}"`, { context: 'Scheduler' });
    });
    this.jobs.clear();
    this.started = false;
  }

  /** حالة جميع الـ Jobs */
  status(): Array<{ name: string; lastRun?: string; lastError?: string; runCount: number }> {
    return Array.from(this.jobs.values()).map(j => ({
      name: j.name,
      lastRun: j.lastRun?.toISOString(),
      lastError: j.lastError,
      runCount: j.runCount,
    }));
  }
}

export const Scheduler = new SchedulerService();
