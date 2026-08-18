import { desc, eq, sql } from "drizzle-orm";
import { cronJobLogs, cronJobSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { failureCountAfterRun, type V2JobTrigger } from "./V2JobPolicy";

export type V2JobSettings = {
  enabled: boolean;
  consecutiveFailures: number;
  lastNotifiedAt: number | null;
};

export type V2JobSummary = {
  enabled: boolean;
  consecutiveFailures: number;
  lastRun: number | null;
  lastRunResult: string | null;
  lastRunDurationMs: number | null;
  lastError: string | null;
  runCount: number;
  errorCount: number;
};

class V2JobRepository {
  async getSettings(jobId: string): Promise<V2JobSettings> {
    const db = await getDb();
    const rows = await db.select().from(cronJobSettings).where(eq(cronJobSettings.jobId, jobId)).limit(1);
    const setting = rows[0];
    return {
      enabled: setting?.enabled ?? true,
      consecutiveFailures: setting?.consecutiveFailures ?? 0,
      lastNotifiedAt: setting?.lastNotifiedAt ?? null,
    };
  }

  async setEnabled(jobId: string, enabled: boolean): Promise<void> {
    const db = await getDb();
    await db.insert(cronJobSettings)
      .values({ jobId, enabled, consecutiveFailures: 0, updatedAt: Date.now() })
      .onDuplicateKeyUpdate({ set: { enabled, consecutiveFailures: 0, updatedAt: Date.now() } });
  }

  async recordExecution(input: {
    jobId: string;
    success: boolean;
    message: string;
    durationMs: number;
    triggeredBy: V2JobTrigger;
  }): Promise<V2JobSettings> {
    const db = await getDb();
    const settings = await this.getSettings(input.jobId);
    const consecutiveFailures = failureCountAfterRun(settings.consecutiveFailures, input.success);

    await db.transaction(async (tx: any) => {
      await tx.insert(cronJobLogs).values({
        jobId: input.jobId,
        success: input.success,
        message: input.message,
        durationMs: input.durationMs,
        runAt: Date.now(),
        triggeredBy: input.triggeredBy,
      });
      await tx.insert(cronJobSettings)
        .values({
          jobId: input.jobId,
          enabled: settings.enabled,
          consecutiveFailures,
          lastNotifiedAt: settings.lastNotifiedAt ?? undefined,
          updatedAt: Date.now(),
        })
        .onDuplicateKeyUpdate({ set: { consecutiveFailures, updatedAt: Date.now() } });
    });

    return { ...settings, consecutiveFailures };
  }

  async markFailureNotification(jobId: string): Promise<void> {
    const db = await getDb();
    await db.insert(cronJobSettings)
      .values({ jobId, enabled: true, consecutiveFailures: 0, lastNotifiedAt: Date.now(), updatedAt: Date.now() })
      .onDuplicateKeyUpdate({ set: { lastNotifiedAt: Date.now(), updatedAt: Date.now() } });
  }

  async getLogs(jobId: string) {
    const db = await getDb();
    return db.select()
      .from(cronJobLogs)
      .where(eq(cronJobLogs.jobId, jobId))
      .orderBy(desc(cronJobLogs.runAt))
      .limit(10);
  }

  async getSummaries(jobIds: string[]): Promise<Map<string, V2JobSummary>> {
    const db = await getDb();
    const [settings, aggregates, recentLogs] = await Promise.all([
      db.select().from(cronJobSettings),
      db.select({
        jobId: cronJobLogs.jobId,
        runCount: sql<number>`COUNT(*)`,
        errorCount: sql<number>`SUM(CASE WHEN ${cronJobLogs.success} = 0 THEN 1 ELSE 0 END)`,
      }).from(cronJobLogs).groupBy(cronJobLogs.jobId),
      db.select().from(cronJobLogs).orderBy(desc(cronJobLogs.runAt)).limit(Math.max(100, jobIds.length * 10)),
    ]);

    const settingMap = new Map<string, {
      enabled: boolean;
      consecutiveFailures: number;
      lastNotifiedAt: number | null;
    }>(settings.map((row: any): [string, { enabled: boolean; consecutiveFailures: number; lastNotifiedAt: number | null }] => [row.jobId, {
      enabled: row.enabled,
      consecutiveFailures: row.consecutiveFailures,
      lastNotifiedAt: row.lastNotifiedAt ?? null,
    }]));
    const aggregateMap = new Map<string, { runCount: number; errorCount: number }>(
      aggregates.map((row: any): [string, { runCount: number; errorCount: number }] => [row.jobId, {
        runCount: Number(row.runCount),
        errorCount: Number(row.errorCount),
      }]),
    );
    const latestLogMap = new Map<string, typeof recentLogs[number]>();
    for (const log of recentLogs) {
      if (!latestLogMap.has(log.jobId)) latestLogMap.set(log.jobId, log);
    }

    return new Map<string, V2JobSummary>(jobIds.map((jobId): [string, V2JobSummary] => {
      const setting = settingMap.get(jobId);
      const aggregate = aggregateMap.get(jobId);
      const latest = latestLogMap.get(jobId);
      return [jobId, {
        enabled: setting?.enabled ?? true,
        consecutiveFailures: setting?.consecutiveFailures ?? 0,
        lastRun: latest?.runAt ?? null,
        lastRunResult: latest?.success ? latest.message ?? "نجاح" : "error",
        lastRunDurationMs: latest?.durationMs ?? null,
        lastError: latest && !latest.success ? latest.message ?? "خطأ غير معروف" : null,
        runCount: Number(aggregate?.runCount ?? 0),
        errorCount: Number(aggregate?.errorCount ?? 0),
      }];
    }));
  }
}

export const v2JobRepository = new V2JobRepository();
