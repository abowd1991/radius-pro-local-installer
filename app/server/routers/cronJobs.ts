/** لوحة التحكم لمهام التشغيل الفعلية في V2 فقط. */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, superAdminProcedure } from "../_core/trpc";
import { V2_JOB_CATALOG } from "../v2/V2JobCatalog";
import { executeV2Job, getV2JobLogs, listV2Jobs, setV2JobEnabled } from "../v2/V2JobRuntime";

function ensureV2Job(jobId: string): void {
  if (!V2_JOB_CATALOG.some((job) => job.id === jobId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "مهمة V2 غير موجودة" });
  }
}

export const cronJobsRouter = router({
  list: superAdminProcedure.query(() => listV2Jobs()),

  getLogs: superAdminProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      ensureV2Job(input.jobId);
      return getV2JobLogs(input.jobId);
    }),

  toggle: superAdminProcedure
    .input(z.object({ jobId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      ensureV2Job(input.jobId);
      await setV2JobEnabled(input.jobId, input.enabled);
      return { success: true, enabled: input.enabled };
    }),

  runNow: superAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      ensureV2Job(input.id);
      const result = await executeV2Job(input.id, "manual");
      if (result.skipped === "disabled") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: result.message });
      }
      if (result.skipped === "already_running") {
        throw new TRPCError({ code: "CONFLICT", message: result.message });
      }
      return result;
    }),

  stats: superAdminProcedure.query(async () => {
    const jobs = await listV2Jobs();
    return {
      total: jobs.length,
      disabledCount: jobs.filter((job) => !job.enabled).length,
      failingCount: jobs.filter((job) => job.consecutiveFailures >= 3).length,
      withErrors: jobs.filter((job) => job.errorCount > 0).length,
      totalRuns: jobs.reduce((sum, job) => sum + job.runCount, 0),
      categories: Array.from(new Set(jobs.map((job) => job.categoryAr))).map((name) => ({
        name,
        count: jobs.filter((job) => job.categoryAr === name).length,
      })),
    };
  }),
});
