import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../../db";
import { remoteManagementAccesses, remoteManagementQuotas } from "../../../../drizzle/schema";
import { RemoteManagementAccessRepository } from "./RemoteManagementAccessRepository";

vi.mock("../../../db", () => ({ getDb: vi.fn() }));

type SelectResult = unknown[];

function createTransaction(selectResults: SelectResult[]) {
  const quotaInsert = { onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined) };
  const insert = vi.fn(() => ({ values: vi.fn(() => quotaInsert) }));
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) })) }));
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn().mockImplementation(async () => selectResults.shift() ?? []) })),
    })),
  }));
  return { insert, update, select };
}

const request = {
  ownerId: 41,
  nasId: 7,
  createdBy: 88,
  service: "winbox" as const,
  targetPort: 8291,
  vpnTunnelIp: "192.168.32.7",
  accessMode: "restricted" as const,
  allowedCidrs: ["203.0.113.4/32"],
};

describe("RemoteManagementAccessRepository quota lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consumes one quota slot when re-enabling a disabled record", async () => {
    const disabled = { id: 12, ...request, status: "disabled" };
    const pending = { ...disabled, status: "pending" };
    const tx = createTransaction([[disabled], [pending]]);
    vi.mocked(getDb).mockResolvedValue({ transaction: async (callback: any) => callback(tx) } as any);

    const result = await new RemoteManagementAccessRepository().reservePending(request);

    expect(result).toEqual(pending);
    expect(tx.update).toHaveBeenCalledWith(remoteManagementQuotas);
    expect(tx.update).toHaveBeenCalledWith(remoteManagementAccesses);
  });

  it("does not double-count quota when retrying an errored reservation", async () => {
    const errored = { id: 12, ...request, status: "error" };
    const pending = { ...errored, status: "pending" };
    const tx = createTransaction([[errored], [pending]]);
    vi.mocked(getDb).mockResolvedValue({ transaction: async (callback: any) => callback(tx) } as any);

    const result = await new RemoteManagementAccessRepository().reservePending(request);

    expect(result).toEqual(pending);
    expect(tx.update).not.toHaveBeenCalledWith(remoteManagementQuotas);
    expect(tx.update).toHaveBeenCalledWith(remoteManagementAccesses);
  });

  it("releases one quota slot only when disabling a record that currently holds one", async () => {
    const active = { id: 12, ownerId: 41, status: "active" };
    const disabled = { ...active, status: "disabled" };
    const tx = createTransaction([[active], [disabled]]);
    vi.mocked(getDb).mockResolvedValue({ transaction: async (callback: any) => callback(tx) } as any);

    const result = await new RemoteManagementAccessRepository().disableOwned(41, 12);

    expect(result).toEqual(disabled);
    expect(tx.update).toHaveBeenCalledWith(remoteManagementAccesses);
    expect(tx.update).toHaveBeenCalledWith(remoteManagementQuotas);
  });

  it("reserves a released quota slot only once when explicitly re-enabling a disabled record", async () => {
    const disabled = { id: 12, ownerId: 41, status: "disabled" };
    const pending = { ...disabled, status: "pending" };
    const tx = createTransaction([[disabled], [pending]]);
    vi.mocked(getDb).mockResolvedValue({ transaction: async (callback: any) => callback(tx) } as any);

    const result = await new RemoteManagementAccessRepository().reenableOwned(41, 12);

    expect(result).toEqual(pending);
    expect(tx.update).toHaveBeenCalledWith(remoteManagementQuotas);
    expect(tx.update).toHaveBeenCalledWith(remoteManagementAccesses);
  });
});
