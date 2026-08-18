export type V2JobTrigger = "auto" | "manual";

export type V2JobExecutionDecision =
  | { allowed: true }
  | { allowed: false; reason: "disabled" | "already_running" };

/**
 * سياسة موحدة تمنع تشغيل Job موقوف أو تشغيلين متوازيين لنفس المهمة.
 */
export function decideV2JobExecution(input: {
  enabled: boolean;
  alreadyRunning: boolean;
}): V2JobExecutionDecision {
  if (!input.enabled) return { allowed: false, reason: "disabled" };
  if (input.alreadyRunning) return { allowed: false, reason: "already_running" };
  return { allowed: true };
}

export function failureCountAfterRun(previousFailures: number, success: boolean): number {
  return success ? 0 : previousFailures + 1;
}
