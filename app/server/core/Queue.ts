/**
 * Queue — نظام المهام غير الفورية
 * SMS, Telegram, CoA, Reports تدخل Queue — لا تُنفَّذ بشكل متزامن
 * Radius Pro Local V2
 */

import { Logger } from './Logger';
import { Metrics } from './Metrics';
import { Config } from './ConfigService';

export type JobType =
  | 'sms'
  | 'telegram'
  | 'whatsapp'
  | 'coa.disconnect'
  | 'coa.speed_change'
  | 'coa.speed_restore'
  | 'report.generate'
  | 'audit.write'
  | 'card.check_expiry';

interface Job<T = unknown> {
  id: string;
  type: JobType;
  data: T;
  attempts: number;
  createdAt: number;
  scheduledAt?: number;
}

type JobProcessor<T = unknown> = (job: Job<T>) => Promise<void>;

class QueueService {
  private queues = new Map<JobType, Job[]>();
  private processors = new Map<JobType, JobProcessor>();
  private running = new Map<JobType, boolean>();
  private jobCounter = 0;

  /** إضافة مهمة للـ Queue */
  add<T = unknown>(type: JobType, data: T, options?: { delayMs?: number }): string {
    const id = `job_${++this.jobCounter}_${Date.now()}`;
    const job: Job<T> = {
      id,
      type,
      data,
      attempts: 0,
      createdAt: Date.now(),
      scheduledAt: options?.delayMs ? Date.now() + options.delayMs : undefined,
    };

    const existing = this.queues.get(type) ?? [];
    this.queues.set(type, [...existing, job as Job]);

    Logger.debug(`Queue: added job ${id} of type ${type}`, { context: 'Queue' });
    Metrics.record('queue.job_added', 1, { unit: 'count', context: type });

    // تشغيل المعالج إذا لم يكن يعمل
    void this.processNext(type);
    return id;
  }

  /** تسجيل معالج لنوع مهمة */
  process<T = unknown>(type: JobType, processor: JobProcessor<T>): void {
    this.processors.set(type, processor as JobProcessor);
  }

  private async processNext(type: JobType): Promise<void> {
    if (this.running.get(type)) return;

    const processor = this.processors.get(type);
    if (!processor) return;

    const queue = this.queues.get(type) ?? [];
    if (queue.length === 0) return;

    this.running.set(type, true);

    // معالجة بالتوازي حتى QUEUE_CONCURRENCY
    const batch = queue.splice(0, Config.QUEUE_CONCURRENCY);
    this.queues.set(type, queue);

    await Promise.allSettled(
      batch.map(async (job) => {
        // انتظر إذا كانت المهمة مجدولة لوقت لاحق
        if (job.scheduledAt && job.scheduledAt > Date.now()) {
          const delay = job.scheduledAt - Date.now();
          await new Promise(r => setTimeout(r, delay));
        }

        job.attempts++;
        const start = Date.now();
        try {
          await processor(job);
          Metrics.record('queue.job_success_ms', Date.now() - start, { unit: 'ms', context: type });
        } catch (err) {
          Logger.error(`Queue: job ${job.id} failed (attempt ${job.attempts})`, {
            context: 'Queue',
            error: err,
            data: { type, jobId: job.id },
          });

          // إعادة المحاولة
          if (job.attempts < Config.QUEUE_MAX_RETRIES) {
            const retryQueue = this.queues.get(type) ?? [];
            retryQueue.push({ ...job, scheduledAt: Date.now() + Config.QUEUE_RETRY_DELAY_MS });
            this.queues.set(type, retryQueue);
          } else {
            Logger.error(`Queue: job ${job.id} dropped after ${job.attempts} attempts`, {
              context: 'Queue',
              errorCode: 'QUE_001',
            });
          }
        }
      })
    );

    this.running.set(type, false);

    // استمر في المعالجة إذا كانت هناك مهام
    const remaining = this.queues.get(type) ?? [];
    if (remaining.length > 0) {
      void this.processNext(type);
    }
  }

  size(type?: JobType): number {
    if (type) return this.queues.get(type)?.length ?? 0;
    let total = 0;
    Array.from(this.queues.values()).forEach(q => { total += q.length; });
    return total;
  }
}

export const Queue = new QueueService();
