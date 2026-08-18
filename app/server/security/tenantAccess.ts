import { TRPCError } from "@trpc/server";

export type TenantActor = { id: number; role: string };
export type ManagedClient = { id: number; role: string; ownerId: number | null };

export function assertCanManageClientPermissions(actor: TenantActor, client: ManagedClient): void {
  if (client.role !== "client") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Target must be a client account" });
  }
  if (actor.role === "super_admin") return;
  if (actor.role !== "owner" || client.ownerId !== actor.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Client belongs to another owner" });
  }
}
