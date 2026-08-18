import { notifyOwner } from "../_core/notification";
import { Logger } from "../core/Logger";
import { getV2JobDefinition, V2_JOB_CATALOG, type V2JobId } from "./V2JobCatalog";
import { decideV2JobExecution, type V2JobTrigger } from "./V2JobPolicy";
import { v2JobRepository } from "./V2JobRepository";

export type V2JobRunResult = {
  success: boolean;
  message: string;
  durationMs: number;
  skipped?: "disabled" | "already_running";
};

const runningJobs = new Map<string, number>();

export async function executeV2Job(jobId: string, triggeredBy: V2JobTrigger): Promise<V2JobRunResult> {
  const definition = getV2JobDefinition(jobId);
  if (!definition) return { success: false, message: "مهمة V2 غير موجودة", durationMs: 0 };

  const settings = await v2JobRepository.getSettings(definition.id);
  const decision = decideV2JobExecution({ enabled: settings.enabled, alreadyRunning: runningJobs.has(definition.id) });
  if (!decision.allowed) {
    return {
      success: false,
      skipped: decision.reason,
      durationMs: 0,
      message: decision.reason === "disabled" ? "المهمة موقوفة من لوحة V2" : "المهمة قيد التشغيل بالفعل",
    };
  }

  runningJobs.set(definition.id, Date.now());
  const startedAt = Date.now();
  try {
    const message = await definition.run();
    const durationMs = Date.now() - startedAt;
    await v2JobRepository.recordExecution({ jobId: definition.id, success: true, message, durationMs, triggeredBy });
    return { success: true, message, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    const outcome = await v2JobRepository.recordExecution({ jobId: definition.id, success: false, message, durationMs, triggeredBy });
    Logger.error(`V2 job "${definition.id}" failed`, { context: "V2JobRuntime", error });
    const notifyThresholdReached = outcome.consecutiveFailures >= 3
      && Date.now() - (outcome.lastNotifiedAt ?? 0) > 60 * 60_000;
    if (notifyThresholdReached) {
      try {
        await notifyOwner({
          title: `فشل متكرر في V2: ${definition.nameAr}`,
          content: `فشلت المهمة "${definition.nameAr}" ${outcome.consecutiveFailures} مرات متتالية. آخر خطأ: ${message}`,
        });
        await v2JobRepository.markFailureNotification(definition.id);
      } catch { /* لا يحجب فشل الإشعار سجل المهمة */ }
    }
    return { success: false, message, durationMs };
  } finally {
    runningJobs.delete(definition.id);
  }
}

export async function setV2JobEnabled(jobId: string, enabled: boolean): Promise<void> {
  const definition = getV2JobDefinition(jobId);
  if (!definition) throw new Error("مهمة V2 غير موجودة");
  await v2JobRepository.setEnabled(definition.id, enabled);
}

export async function listV2Jobs() {
  const summaries = await v2JobRepository.getSummaries(V2_JOB_CATALOG.map((job) => job.id));
  return V2_JOB_CATALOG.map((definition) => {
    const summary = summaries.get(definition.id) ?? {
      enabled: true,
      consecutiveFailures: 0,
      lastRun: null,
      lastRunResult: null,
      lastRunDurationMs: null,
      lastError: null,
      runCount: 0,
      errorCount: 0,
    };
    return {
    ...definition,
    ...summary,
    isRunning: runningJobs.has(definition.id),
    runningSince: runningJobs.get(definition.id) ?? null,
    };
  });
}

export async function getV2JobLogs(jobId: string) {
  if (!getV2JobDefinition(jobId)) throw new Error("مهمة V2 غير موجودة");
  return v2JobRepository.getLogs(jobId);
}

export const V2_JOB_IDS = V2_JOB_CATALOG.map((job) => job.id) as V2JobId[];
