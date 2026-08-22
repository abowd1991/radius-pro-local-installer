import { describe, expect, it, vi } from "vitest";
import { RemoteManagementAccessEngine } from "./RemoteManagementAccessEngine";
import { REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE, assertRemoteManagementQuota, collectOccupiedRemoteManagementPorts, nextAvailableRemoteManagementPort, remoteManagementQuotaDelta, shouldReserveRemoteManagementQuota } from "./RemoteManagementAccessPolicy";

const ownedNas = { id: 7, ownerId: 41, vpnUsername: "nas-7", allocatedIp: "192.168.32.7", vpnTunnelIp: "192.168.32.7" };
const withLifecycle = <T extends object>(repository: T) => ({ ...repository, disableOwned: vi.fn(), reenableOwned: vi.fn() });

describe("RemoteManagementAccessEngine", () => {
  it("fails closed when the NAS does not belong to the effective owner", async () => {
    const repository = withLifecycle({ findOwnedNas: vi.fn().mockResolvedValue(null), reservePending: vi.fn() });
    const engine = new RemoteManagementAccessEngine(repository, vi.fn());
    await expect(engine.request(41, 88, { nasId: 7, service: "winbox", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.4/32"], publicAcknowledged: false }))
      .rejects.toThrow("لا يتبع لحسابك");
    expect(repository.reservePending).not.toHaveBeenCalled();
  });

  it("fails closed until a live VPN address exists", async () => {
    const repository = withLifecycle({ findOwnedNas: vi.fn().mockResolvedValue(ownedNas), reservePending: vi.fn() });
    const engine = new RemoteManagementAccessEngine(repository, vi.fn().mockResolvedValue(null));
    await expect(engine.request(41, 88, { nasId: 7, service: "winbox", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.4/32"], publicAcknowledged: false }))
      .rejects.toThrow("اتصال NAS عبر VPN");
    expect(repository.reservePending).not.toHaveBeenCalled();
  });

  it("persists a restricted access request with owner-bound input", async () => {
    const repository = withLifecycle({ findOwnedNas: vi.fn().mockResolvedValue(ownedNas), reservePending: vi.fn().mockResolvedValue({ id: 12, status: "pending" }) });
    const engine = new RemoteManagementAccessEngine(repository, vi.fn().mockResolvedValue("192.168.32.7"));
    await expect(engine.request(41, 88, { nasId: 7, service: "winbox", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.4/32"], publicAcknowledged: false }))
      .resolves.toMatchObject({ id: 12, status: "pending" });
    expect(repository.reservePending).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 41, createdBy: 88, nasId: 7, vpnTunnelIp: "192.168.32.7", allowedCidrs: ["203.0.113.4/32"] }));
  });

  it("rejects public management access to preserve the mandatory V2 allowlist", async () => {
    const repository = withLifecycle({ findOwnedNas: vi.fn().mockResolvedValue(ownedNas), reservePending: vi.fn() });
    const engine = new RemoteManagementAccessEngine(repository, vi.fn().mockResolvedValue("192.168.32.7"));
    await expect(engine.request(41, 88, { nasId: 7, service: "winbox", targetPort: 8291, accessMode: "public", allowedCidrs: [], publicAcknowledged: false }))
      .rejects.toThrow("الوصول المقيّد");
    expect(repository.reservePending).not.toHaveBeenCalled();
  });

  it("surfaces a quota rejection from the repository without creating another access", async () => {
    const repository = withLifecycle({ findOwnedNas: vi.fn().mockResolvedValue(ownedNas), reservePending: vi.fn().mockRejectedValue(new Error("تم بلوغ حصة الوصول البعيد المسموح بها")) });
    const engine = new RemoteManagementAccessEngine(repository, vi.fn().mockResolvedValue("192.168.32.7"));
    await expect(engine.request(41, 88, { nasId: 7, service: "winbox", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.4/32"], publicAcknowledged: false }))
      .rejects.toThrow("تم بلوغ حصة الوصول البعيد");
    expect(repository.reservePending).toHaveBeenCalledTimes(1);
  });

  it("models quota deltas for disable and re-enable without double counting an errored reservation", () => {
    expect(shouldReserveRemoteManagementQuota(undefined)).toBe(true);
    expect(shouldReserveRemoteManagementQuota("disabled")).toBe(true);
    expect(shouldReserveRemoteManagementQuota("pending")).toBe(false);
    expect(shouldReserveRemoteManagementQuota("active")).toBe(false);
    expect(shouldReserveRemoteManagementQuota("error")).toBe(false);
    expect(() => assertRemoteManagementQuota(3, 3)).toThrow("تم بلوغ حصة الوصول البعيد");
    expect(remoteManagementQuotaDelta("disabled", "pending")).toBe(1);
    expect(remoteManagementQuotaDelta("pending", "disabled")).toBe(-1);
    expect(remoteManagementQuotaDelta("error", "pending")).toBe(0);
  });

  it("selects a dedicated port that does not collide with remote, V2 forwarding, or legacy Winbox ports", () => {
    const used = collectOccupiedRemoteManagementPorts(
      [{ port: REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.start }],
      [{ port: REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.start + 1 }],
      [{ port: REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.start + 2 }],
    );
    expect(nextAvailableRemoteManagementPort(used)).toBe(REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.start + 3);
  });

  it("delegates owner-bound disable and re-enable transitions to the repository", async () => {
    const repository = withLifecycle({ findOwnedNas: vi.fn(), reservePending: vi.fn() });
    repository.disableOwned.mockResolvedValue({ id: 12, ownerId: 41, status: "disabled" });
    repository.reenableOwned.mockResolvedValue({ id: 12, ownerId: 41, status: "pending" });
    const engine = new RemoteManagementAccessEngine(repository, vi.fn());
    await expect(engine.disable(41, 12)).resolves.toMatchObject({ status: "disabled" });
    await expect(engine.reenable(41, 12)).resolves.toMatchObject({ status: "pending" });
    expect(repository.disableOwned).toHaveBeenCalledWith(41, 12);
    expect(repository.reenableOwned).toHaveBeenCalledWith(41, 12);
  });
});
