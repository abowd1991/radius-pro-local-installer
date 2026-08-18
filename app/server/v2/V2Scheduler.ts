/**
 * V2Scheduler — مشغل مهام التشغيل الدوري في Radius Pro V2.
 * كل تنفيذ يمر عبر V2JobRuntime حتى يطبق زر الإيقاف والسجل الدائم.
 */
import { Scheduler } from "../core/Scheduler";
import { Logger } from "../core/Logger";
import { V2_JOB_CATALOG } from "./V2JobCatalog";
import { executeV2Job } from "./V2JobRuntime";

let started = false;

export function startV2Scheduler(): void {
  if (started) {
    Logger.warn("V2Scheduler: already started", { context: "V2Scheduler" });
    return;
  }
  started = true;

  for (const job of V2_JOB_CATALOG.filter((definition) => definition.schedulerManaged)) {
    Scheduler.register({
      name: job.id,
      intervalMs: job.intervalMs,
      runImmediately: job.id === "voucher_expiration_check" || job.id === "provisioning_check_pending" || job.id === "network_reconcile_port_forwarding",
      handler: async () => {
        const result = await executeV2Job(job.id, "auto");
        if (!result.success && !result.skipped) {
          throw new Error(result.message);
        }
      },
    });
  }

  Scheduler.start();
  Logger.info(`V2Scheduler: started (${V2_JOB_CATALOG.filter((job) => job.schedulerManaged).length} managed jobs registered)`, { context: "V2Scheduler" });
}

export function stopV2Scheduler(): void {
  Scheduler.stop();
  started = false;
}
