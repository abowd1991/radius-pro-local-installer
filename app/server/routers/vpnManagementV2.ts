import { z } from "zod";
import { router, superAdminProcedure } from "../_core/trpc";
import { vpnSessionSyncService } from "../domains/vpn/VpnSessionSyncService";

export const vpnManagementV2Router = router({
  dashboard: superAdminProcedure.query(async () => vpnSessionSyncService.synchronize(null)),
  refresh: superAdminProcedure.mutation(async () => vpnSessionSyncService.synchronize(null)),
  provision: superAdminProcedure
    .input(z.object({ nasId: z.number().int().positive() }))
    .mutation(async ({ input }) => vpnSessionSyncService.provision(input.nasId)),
  disconnect: superAdminProcedure
    .input(z.object({ nasId: z.number().int().positive() }))
    .mutation(async ({ input }) => vpnSessionSyncService.disconnect(input.nasId)),
  disable: superAdminProcedure
    .input(z.object({ nasId: z.number().int().positive() }))
    .mutation(async ({ input }) => vpnSessionSyncService.disable(input.nasId)),
  enable: superAdminProcedure
    .input(z.object({ nasId: z.number().int().positive() }))
    .mutation(async ({ input }) => vpnSessionSyncService.enable(input.nasId)),
});
