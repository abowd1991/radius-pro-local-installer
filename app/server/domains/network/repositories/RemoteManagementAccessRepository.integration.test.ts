import { eq } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../../../db";
import { nasDevices, portForwardings, remoteManagementAccesses, remoteManagementAccessEvents, remoteManagementQuotas } from "../../../../drizzle/schema";
import { REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE } from "../RemoteManagementAccessPolicy";
import { RemoteManagementAccessRepository } from "./RemoteManagementAccessRepository";

class IntentionalRollback extends Error {}

describe("RemoteManagementAccessRepository database integration", () => {
  it("allocates around real occupied ports and keeps quota correct through disable and re-enable", async () => {
    const db = await getDb();
    if (!db) throw new Error("قاعدة بيانات الاختبار غير متاحة");
    const token = Date.now() % 100_000_000;
    const ownerId = 1_000_000_000 + token;

    try {
      await db.transaction(async (tx: any) => {
        const [remoteRows, forwardingRows, legacyRows] = await Promise.all([
          tx.select({ port: remoteManagementAccesses.externalPort }).from(remoteManagementAccesses),
          tx.select({ port: portForwardings.externalPort }).from(portForwardings),
          tx.select({ port: nasDevices.winboxPort }).from(nasDevices),
        ]);
        const occupied = new Set([...remoteRows, ...forwardingRows, ...legacyRows].map((row: any) => Number(row.port)));
        let base = REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.start + (token % 500);
        while ([base, base + 1, base + 2, base + 3].some((port) => occupied.has(port))) base++;

        const makeNas = async (suffix: string, winboxPort?: number) => {
          const result = await tx.insert(nasDevices).values({
            nasname: `10.254.${token % 200}.${suffix === "one" ? 11 : 12}`,
            shortname: `rma-${suffix}-${token}`,
            secret: `test-${token}-${suffix}`,
            ownerId,
            connectionType: "vpn_sstp",
            vpnUsername: `rma-${suffix}-${token}`,
            vpnTunnelIp: suffix === "one" ? "192.168.32.11" : "192.168.32.12",
            allocatedIp: suffix === "one" ? "192.168.32.11" : "192.168.32.12",
            winboxPort,
          });
          return Number(result[0].insertId);
        };

        const firstNasId = await makeNas("one", base + 2);
        const targetNasId = await makeNas("two");
        await tx.insert(remoteManagementAccesses).values({
          ownerId,
          nasId: firstNasId,
          createdBy: ownerId,
          service: "winbox",
          targetPort: 8291,
          vpnTunnelIp: "192.168.32.11",
          externalPort: base,
          accessMode: "restricted",
          allowedCidrs: ["203.0.113.4/32"],
          status: "active",
        });
        await tx.insert(portForwardings).values({
          ownerId,
          nasId: firstNasId,
          networkRouterId: 900_000_000 + token,
          label: `rma-forward-${token}`,
          targetIp: "192.168.88.2",
          targetPort: 8291,
          vpnTunnelIp: "192.168.32.11",
          externalPort: base + 1,
          ingressPort: 20_000 + (token % 1_000),
          accessMode: "restricted",
          allowedCidrs: ["203.0.113.4/32"],
          status: "active",
        });

        const repository = new RemoteManagementAccessRepository();
        const created = await repository.reservePendingInTransaction(tx, {
          ownerId,
          nasId: targetNasId,
          createdBy: ownerId,
          service: "winbox",
          targetPort: 8291,
          vpnTunnelIp: "192.168.32.12",
          accessMode: "restricted",
          allowedCidrs: ["203.0.113.4/32"],
        });
        expect([base, base + 1, base + 2]).not.toContain(created?.externalPort);

        const [reservedQuota] = await tx.select().from(remoteManagementQuotas).where(eq(remoteManagementQuotas.ownerId, ownerId));
        expect(reservedQuota.usedAccesses).toBe(1);

        await repository.disableOwnedInTransaction(tx, ownerId, created!.id);
        const [releasedQuota] = await tx.select().from(remoteManagementQuotas).where(eq(remoteManagementQuotas.ownerId, ownerId));
        expect(releasedQuota.usedAccesses).toBe(0);

        await repository.reenableOwnedInTransaction(tx, ownerId, created!.id);
        const [reenabledQuota] = await tx.select().from(remoteManagementQuotas).where(eq(remoteManagementQuotas.ownerId, ownerId));
        expect(reenabledQuota.usedAccesses).toBe(1);

        throw new IntentionalRollback();
      });
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error;
    }
  });

  it("persists active state and owner-isolated lifecycle events in the real database", async () => {
    const db = await getDb();
    if (!db) throw new Error("قاعدة بيانات الاختبار غير متاحة");
    const token = Date.now() % 100_000_000;
    const ownerId = 1_100_000_000 + token;
    const repository = new RemoteManagementAccessRepository();
    let nasId: number | null = null;
    let accessId: number | null = null;

    try {
      const nas = await db.insert(nasDevices).values({
        nasname: `10.253.${token % 200}.11`,
        shortname: `rma-events-${token}`,
        secret: `test-events-${token}`,
        ownerId,
        connectionType: "vpn_sstp",
        vpnUsername: `rma-events-${token}`,
        vpnTunnelIp: "192.168.32.21",
        allocatedIp: "192.168.32.21",
      });
      nasId = Number(nas[0].insertId);
      const access = await repository.reservePending({
        ownerId,
        nasId,
        createdBy: ownerId,
        service: "winbox",
        targetPort: 8291,
        vpnTunnelIp: "192.168.32.21",
        accessMode: "restricted",
        allowedCidrs: ["203.0.113.21/32"],
      });
      accessId = access!.id;

      await repository.recordEvent(ownerId, accessId, ownerId, "activation_requested");
      await repository.markActiveOwned(ownerId, accessId);
      await repository.recordEvent(ownerId, accessId, ownerId, "activated");

      const active = await repository.getOwned(ownerId, accessId);
      const events = await repository.listEventsForOwned(ownerId, accessId);
      const vpsDesired = await repository.listForVpsSync();

      expect(active.status).toBe("active");
      expect(events.map((event) => event.action)).toEqual(expect.arrayContaining(["activation_requested", "activated"]));
      expect(vpsDesired.some((entry) => entry.id === accessId)).toBe(true);
    } finally {
      if (accessId) await db.delete(remoteManagementAccessEvents).where(eq(remoteManagementAccessEvents.accessId, accessId));
      if (accessId) await db.delete(remoteManagementAccesses).where(eq(remoteManagementAccesses.id, accessId));
      await db.delete(remoteManagementQuotas).where(eq(remoteManagementQuotas.ownerId, ownerId));
      if (nasId) await db.delete(nasDevices).where(eq(nasDevices.id, nasId));
    }
  });
});
