import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { remoteManagementAccessEngine } from "../domains/network/RemoteManagementAccessEngine";
import { remoteManagementActivationEngine } from "../domains/network/RemoteManagementActivationEngine";
import { remoteManagementAccessRepository } from "../domains/network/repositories/RemoteManagementAccessRepository";
import { normalizePortForwardingPublicHost } from "../domains/network/PortForwardingPublicHostPolicy";
import { getEffectiveOwnerId, getTenantContext } from "../tenant-isolation";
import * as db from "../db";

function ownerId(user: any): number {
  return getEffectiveOwnerId(getTenantContext(user));
}

function trpcError(error: unknown): never {
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "فشل طلب الوصول البعيد" });
}

const requestInput = z.object({
  nasId: z.number().int().positive(),
  targetPort: z.number().int().min(1).max(65535).default(8291),
  accessMode: z.literal("restricted").default("restricted"),
  allowedCidrs: z.array(z.string()).max(10).default([]),
  publicAcknowledged: z.boolean().default(false),
});

const accessIdInput = z.object({ id: z.number().int().positive() });

const activationRequirements = {
  status: "awaiting_vps_activation" as const,
  requirements: ["VPS API route /api/remote-management/v2/sync", "Nginx Stream include", "UFW range 40000:44999/tcp"],
};

/** Thin tRPC controller: all V2 lifecycle orchestration is delegated to domain engines. */
export const remoteManagementAccessRouter = router({
  publicHost: protectedProcedure.query(async () => {
    const settings = await db.getSystemSettings();
    const host = normalizePortForwardingPublicHost(settings.port_forwarding_public_host)
      || normalizePortForwardingPublicHost(settings.radius_server_public_ip)
      || normalizePortForwardingPublicHost(ENV.VPS_PUBLIC_IP);
    if (!host) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "عنوان VPS العام غير مهيأ في إعدادات النظام" });
    return { host };
  }),
  devices: protectedProcedure.query(({ ctx }) => remoteManagementAccessRepository.listOwnedNas(ownerId(ctx.user))),
  list: protectedProcedure.query(({ ctx }) => remoteManagementAccessRepository.listForOwner(ownerId(ctx.user))),
  quota: protectedProcedure.query(({ ctx }) => remoteManagementAccessRepository.getQuota(ownerId(ctx.user))),
  activationRequirements: protectedProcedure.query(() => activationRequirements),
  history: protectedProcedure.input(accessIdInput).query(({ ctx, input }) => remoteManagementAccessRepository.listEventsForOwned(ownerId(ctx.user), input.id)),
  request: protectedProcedure.input(requestInput).mutation(async ({ ctx, input }) => {
    try {
      const access = await remoteManagementAccessEngine.request(ownerId(ctx.user), ctx.user.id, { ...input, service: "winbox" }) as { id: number };
      await remoteManagementAccessRepository.recordEvent(ownerId(ctx.user), access.id, ctx.user.id, "requested", { source: "winbox_v2" });
      return access;
    }
    catch (error) { return trpcError(error); }
  }),
  disable: protectedProcedure.input(accessIdInput).mutation(async ({ ctx, input }) => {
    try {
      await remoteManagementAccessRepository.recordEvent(ownerId(ctx.user), input.id, ctx.user.id, "disable_requested");
      const access = await remoteManagementAccessEngine.disable(ownerId(ctx.user), input.id);
      await remoteManagementAccessRepository.recordEvent(ownerId(ctx.user), input.id, ctx.user.id, "disabled");
      return access;
    }
    catch (error) { return trpcError(error); }
  }),
  reenable: protectedProcedure.input(accessIdInput).mutation(async ({ ctx, input }) => {
    try {
      await remoteManagementAccessRepository.recordEvent(ownerId(ctx.user), input.id, ctx.user.id, "reenable_requested");
      return await remoteManagementAccessEngine.reenable(ownerId(ctx.user), input.id);
    }
    catch (error) { return trpcError(error); }
  }),
  activate: protectedProcedure.input(accessIdInput).mutation(async ({ ctx, input }) => {
    try { return await remoteManagementActivationEngine.activate(ownerId(ctx.user), ctx.user.id, input.id); }
    catch (error) { return trpcError(error); }
  }),
  rollback: protectedProcedure.input(accessIdInput).mutation(async ({ ctx, input }) => {
    try { return await remoteManagementActivationEngine.rollback(ownerId(ctx.user), ctx.user.id, input.id); }
    catch (error) { return trpcError(error); }
  }),
});
