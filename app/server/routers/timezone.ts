import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SUPPORTED_TIMEZONES, assertTimezone } from "../core/TimezoneService";
import { timezoneRepository } from "../domains/core/TimezoneRepository";
import { getEffectiveOwnerId, getTenantContext } from "../tenant-isolation";
import { protectedProcedure, router, superAdminProcedure } from "../_core/trpc";

const timezoneInput = z.string().trim().min(1).max(64).superRefine((value, context) => {
  try { assertTimezone(value); } catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "منطقة زمنية غير صحيحة" }); }
});

export const timezoneRouter = router({
  supported: protectedProcedure.query(() => SUPPORTED_TIMEZONES),
  getMySettings: protectedProcedure.query(async ({ ctx }) => {
    const ownerId = getEffectiveOwnerId(getTenantContext(ctx.user));
    const [systemTimezone, ownerTimezone, networks] = await Promise.all([
      timezoneRepository.getSystemTimezone(),
      timezoneRepository.getOwnerTimezone(ownerId),
      timezoneRepository.listNetworks(ownerId),
    ]);
    return { ownerId, systemTimezone, ownerTimezone, networks };
  }),
  updateMyTimezone: protectedProcedure.input(z.object({ timezone: timezoneInput })).mutation(async ({ ctx, input }) => {
    const ownerId = getEffectiveOwnerId(getTenantContext(ctx.user));
    await timezoneRepository.setOwnerTimezone(ownerId, input.timezone);
    return { success: true, ownerId, timezone: input.timezone };
  }),
  updateNetworkTimezone: protectedProcedure.input(z.object({ nasId: z.number().int().positive(), timezone: timezoneInput.nullable() }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = getEffectiveOwnerId(getTenantContext(ctx.user));
      const networks = await timezoneRepository.listNetworks(ownerId);
      if (!networks.some((network: { id: number }) => network.id === input.nasId)) throw new TRPCError({ code: "NOT_FOUND", message: "الشبكة غير موجودة" });
      await timezoneRepository.setNetworkTimezone(ownerId, input.nasId, input.timezone);
      return { success: true };
    }),
  updateSystemTimezone: superAdminProcedure.input(z.object({ timezone: timezoneInput })).mutation(async ({ input }) => {
    await timezoneRepository.setSystemTimezone(input.timezone);
    return { success: true, timezone: input.timezone };
  }),
});
