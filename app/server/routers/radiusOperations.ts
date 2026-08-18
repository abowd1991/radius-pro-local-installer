import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { superAdminProcedure, router } from "../_core/trpc";
import { logAudit } from "../services/auditLogService";
import { executeRadiusOperation, getRadiusOperationsStatus, type RadiusOperation } from "../services/radiusOperationsService";

const confirmations: Record<RadiusOperation, string> = {
  reload: "RELOAD SETTINGS",
  restart: "RESTART",
  start: "START RADIUS",
  stop: "STOP RADIUS",
};

export const radiusOperationsRouter = router({
  getStatus: superAdminProcedure.query(async () => {
    const result = await getRadiusOperationsStatus();
    if (!result.success || !result.data) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: result.error || "تعذر قراءة حالة FreeRADIUS" });
    return result.data;
  }),
  execute: superAdminProcedure.input(z.object({
    action: z.enum(["reload", "restart", "start", "stop"]),
    confirmation: z.string().trim().min(1),
    reason: z.string().trim().min(3).max(300),
  })).mutation(async ({ ctx, input }) => {
    if (input.confirmation !== confirmations[input.action]) throw new TRPCError({ code: "BAD_REQUEST", message: "عبارة التأكيد غير مطابقة للعملية المطلوبة" });
    const startedAt = Date.now();
    const result = await executeRadiusOperation(input.action);
    await logAudit({
      userId: ctx.user.id, userRole: ctx.user.role, action: "service_manage", targetType: "system", targetId: "freeradius", targetName: "FreeRADIUS",
      method: "api", executionTimeMs: Date.now() - startedAt,
      details: { operation: input.action, reason: input.reason, confirmation: "verified", response: result.success ? result.data?.message : undefined },
      result: result.success ? "success" : "failure", errorMessage: result.success ? undefined : result.error, ipAddress: "",
    });
    if (!result.success || !result.data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "فشلت عملية FreeRADIUS" });
    return result.data;
  }),
});
