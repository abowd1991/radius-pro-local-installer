import { z } from "zod";
import { protectedProcedure, router, superAdminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { portForwardingEngine } from "../domains/network/PortForwardingEngine";
import * as db from "../db";

function getOwnerId(user: any): number {
  return user.role === "client_owner" ? user.id : (user.ownerId || user.id);
}

function toTrpcError(error: unknown): never {
  const message = error instanceof Error ? error.message : "حدث خطأ أثناء إدارة التوجيه";
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

const editableInput = z.object({
  label: z.string().min(1).max(100),
  targetPort: z.number().int().min(1).max(65535),
  accessMode: z.enum(["restricted", "public"]).default("restricted"),
  allowedCidrs: z.array(z.string()).max(10).default([]),
});

export const portForwardingRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => portForwardingEngine.list(getOwnerId(ctx.user))),
  quota: protectedProcedure.query(async ({ ctx }) => portForwardingEngine.getQuota(getOwnerId(ctx.user))),
  adminQuota: superAdminProcedure.input(z.object({ ownerId: z.number().int().positive() })).query(async ({ input }) => {
    const owner = await db.getUserById(input.ownerId);
    if (!owner || ["owner", "super_admin"].includes((owner as any).role)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "العميل غير موجود أو لا يمكن تعديل حصته" });
    }
    return portForwardingEngine.getQuota(input.ownerId);
  }),
  setAdminQuota: superAdminProcedure.input(z.object({ ownerId: z.number().int().positive(), maxForwards: z.number().int().min(1).max(1000) })).mutation(async ({ input }) => {
    const owner = await db.getUserById(input.ownerId);
    if (!owner || ["owner", "super_admin"].includes((owner as any).role)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "العميل غير موجود أو لا يمكن تعديل حصته" });
    }
    try { return await portForwardingEngine.setQuota(input.ownerId, input.maxForwards); } catch (error) { return toTrpcError(error); }
  }),
  create: protectedProcedure.input(editableInput.extend({ networkRouterId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try { return await portForwardingEngine.create(getOwnerId(ctx.user), input); } catch (error) { return toTrpcError(error); }
  }),
  update: protectedProcedure.input(editableInput.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input;
    try { return await portForwardingEngine.update(getOwnerId(ctx.user), id, updates); } catch (error) { return toTrpcError(error); }
  }),
  enable: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try { return await portForwardingEngine.enable(getOwnerId(ctx.user), input.id); } catch (error) { return toTrpcError(error); }
  }),
  disable: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try { return await portForwardingEngine.disable(getOwnerId(ctx.user), input.id); } catch (error) { return toTrpcError(error); }
  }),
  delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    try { return await portForwardingEngine.delete(getOwnerId(ctx.user), input.id); } catch (error) { return toTrpcError(error); }
  }),
});
