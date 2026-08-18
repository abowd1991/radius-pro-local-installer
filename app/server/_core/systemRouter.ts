import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { ENV } from "./env";

// Helper: trigger GitHub Actions workflow_dispatch
async function triggerGitHubAction(version: string, triggeredBy: string) {
  const url = `https://api.github.com/repos/${ENV.GITHUB_REPO}/actions/workflows/deploy.yml/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `token ${ENV.GITHUB_DEPLOY_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: "main",
      inputs: { version, triggered_by: triggeredBy },
    }),
  });
  return resp;
}

// Helper: get latest workflow run status
async function getLatestRunStatus() {
  const url = `https://api.github.com/repos/${ENV.GITHUB_REPO}/actions/workflows/deploy.yml/runs?per_page=5`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `token ${ENV.GITHUB_DEPLOY_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!resp.ok) return null;
  const data = await resp.json() as any;
  return data.workflow_runs || [];
}

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Reload FreeRADIUS to sync NAS clients from database
   * Called after NAS create/update/delete operations
   */
  reloadFreeRADIUS: adminProcedure
    .mutation(async ({ ctx }) => {
      try {
        const response = await fetch(`${ENV.VPS_MANAGEMENT_URL}/api/reload-freeradius`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': ENV.VPS_MANAGEMENT_API_KEY,
          },
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('[reloadFreeRADIUS] Failed:', error);
          return {
            success: false,
            error: `VPS API returned ${response.status}: ${error}`,
          };
        }

        const result = await response.json();
        console.log('[reloadFreeRADIUS] Success:', result);
        return {
          success: true,
          message: 'FreeRADIUS reloaded successfully',
        };
      } catch (error: any) {
        console.error('[reloadFreeRADIUS] Exception:', error);
        return {
          success: false,
          error: error.message || 'Unknown error',
        };
      }
    }),

  /**
   * Trigger GitHub Actions deployment workflow
   * يُشغّل workflow_dispatch عبر GitHub API → يبني الكود → يرفع dist/ للـ VPS
   */
  triggerDeploy: adminProcedure
    .input(z.object({
      version: z.string().default("latest"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ENV.GITHUB_DEPLOY_TOKEN) {
        return { success: false, error: "GITHUB_DEPLOY_TOKEN غير مضبوط" };
      }

      const triggeredBy = (ctx.user as any)?.name || (ctx.user as any)?.email || "admin";
      
      try {
        const resp = await triggerGitHubAction(input.version, triggeredBy);
        
        if (resp.status === 204) {
          console.log(`[triggerDeploy] Workflow triggered by ${triggeredBy}, version: ${input.version}`);
          return {
            success: true,
            message: "تم تشغيل عملية التحديث بنجاح — ستكتمل خلال 3-5 دقائق",
            runUrl: `https://github.com/${ENV.GITHUB_REPO}/actions`,
          };
        } else {
          const errText = await resp.text();
          console.error(`[triggerDeploy] GitHub API error ${resp.status}:`, errText);
          return {
            success: false,
            error: `GitHub API: ${resp.status} - ${errText}`,
          };
        }
      } catch (error: any) {
        console.error('[triggerDeploy] Exception:', error);
        return { success: false, error: error.message || 'خطأ غير معروف' };
      }
    }),

  /**
   * Get latest deployment runs from GitHub Actions
   */
  getDeployHistory: adminProcedure
    .query(async () => {
      if (!ENV.GITHUB_DEPLOY_TOKEN) {
        return { runs: [], error: "GITHUB_DEPLOY_TOKEN غير مضبوط" };
      }

      try {
        const runs = await getLatestRunStatus();
        if (!runs) return { runs: [], error: "فشل جلب سجل التحديثات" };

        return {
          runs: runs.slice(0, 10).map((run: any) => ({
            id: run.id,
            status: run.status,        // queued | in_progress | completed
            conclusion: run.conclusion, // success | failure | cancelled | null
            createdAt: run.created_at,
            updatedAt: run.updated_at,
            htmlUrl: run.html_url,
            displayTitle: run.display_title || run.head_commit?.message || "تحديث",
            triggeredBy: run.triggering_actor?.login || "unknown",
            duration: run.updated_at && run.created_at
              ? Math.round((new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()) / 1000)
              : null,
          })),
        };
      } catch (error: any) {
        return { runs: [], error: error.message };
      }
    }),
});
