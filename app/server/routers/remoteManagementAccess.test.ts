import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "../db";
import { remoteManagementAccessEngine } from "../domains/network/RemoteManagementAccessEngine";
import { remoteManagementAccessRepository } from "../domains/network/repositories/RemoteManagementAccessRepository";
import { remoteManagementVpsService } from "../services/remoteManagementVpsService";
import { remoteManagementAccessRouter } from "./remoteManagementAccess";

const context = {
  req: {} as any,
  res: {} as any,
  user: { id: 81, role: "client", tenantId: null, resellerId: null } as any,
};

describe("remoteManagementAccessRouter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps devices, quota and lifecycle commands isolated to the caller owner", async () => {
    const caller = remoteManagementAccessRouter.createCaller(context);
    const record = { id: 302, nasId: 91, externalPort: 40010, status: "pending" } as any;
    const listDevices = vi.spyOn(remoteManagementAccessRepository, "listOwnedNas").mockResolvedValue([{ id: 91, nasname: "10.5.0.8", vpnTunnelIp: "10.5.0.8", mikrotikWinboxPort: 8291 }] as any);
    const list = vi.spyOn(remoteManagementAccessRepository, "listForOwner").mockResolvedValue([record]);
    const quota = vi.spyOn(remoteManagementAccessRepository, "getQuota").mockResolvedValue({ ownerId: 81, maxAccesses: 3, usedAccesses: 1 } as any);
    const request = vi.spyOn(remoteManagementAccessEngine, "request").mockResolvedValue(record);
    const disable = vi.spyOn(remoteManagementAccessEngine, "disable").mockResolvedValue({ ...record, status: "disabled" });
    const reenable = vi.spyOn(remoteManagementAccessEngine, "reenable").mockResolvedValue(record);
    const recordEvent = vi.spyOn(remoteManagementAccessRepository, "recordEvent").mockResolvedValue(undefined);
    const history = vi.spyOn(remoteManagementAccessRepository, "listEventsForOwned").mockResolvedValue([{ id: 1, accessId: 302, action: "requested" }] as any);

    await expect(caller.devices()).resolves.toHaveLength(1);
    await expect(caller.list()).resolves.toEqual([record]);
    await expect(caller.quota()).resolves.toMatchObject({ ownerId: 81, usedAccesses: 1 });
    await expect(caller.request({ nasId: 91, targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.9/32"], publicAcknowledged: false })).resolves.toEqual(record);
    await expect(caller.history({ id: 302 })).resolves.toHaveLength(1);
    await expect(caller.activationRequirements()).resolves.toMatchObject({ status: "awaiting_vps_activation" });
    await expect(caller.disable({ id: 302 })).resolves.toMatchObject({ status: "disabled" });
    await expect(caller.reenable({ id: 302 })).resolves.toEqual(record);

    expect(listDevices).toHaveBeenCalledWith(81);
    expect(list).toHaveBeenCalledWith(81);
    expect(quota).toHaveBeenCalledWith(81);
    expect(request).toHaveBeenCalledWith(81, 81, expect.objectContaining({ nasId: 91, service: "winbox" }));
    expect(history).toHaveBeenCalledWith(81, 302);
    expect(recordEvent).toHaveBeenCalledWith(81, 302, 81, "requested", { source: "winbox_v2" });
    expect(recordEvent).toHaveBeenCalledWith(81, 302, 81, "disable_requested");
    expect(recordEvent).toHaveBeenCalledWith(81, 302, 81, "disabled");
    expect(disable).toHaveBeenCalledWith(81, 302);
    expect(reenable).toHaveBeenCalledWith(81, 302);
  });

  it("returns a normalized VPS host without calling the legacy Winbox router", async () => {
    vi.spyOn(db, "getSystemSettings").mockResolvedValue({ port_forwarding_public_host: "https://ACCESS.EXAMPLE.COM:443/path", radius_server_public_ip: null } as any);
    const caller = remoteManagementAccessRouter.createCaller(context);
    await expect(caller.publicHost()).resolves.toEqual({ host: "access.example.com" });
  });

  it("activates and rolls back only the caller-owned V2 mapping while recording the lifecycle", async () => {
    const caller = remoteManagementAccessRouter.createCaller(context);
    const record = { id: 303, ownerId: 81, externalPort: 40011, vpnTunnelIp: "10.5.0.9", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.9/32"], status: "pending" } as any;
    const getOwned = vi.spyOn(remoteManagementAccessRepository, "getOwned").mockResolvedValue(record);
    const desired = vi.spyOn(remoteManagementAccessRepository, "listForVpsSync")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...record, status: "active" }]);
    const recordEvent = vi.spyOn(remoteManagementAccessRepository, "recordEvent").mockResolvedValue(undefined);
    const markActive = vi.spyOn(remoteManagementAccessRepository, "markActiveOwned").mockResolvedValue({ ...record, status: "active" });
    const disable = vi.spyOn(remoteManagementAccessEngine, "disable").mockResolvedValue({ ...record, status: "disabled" });
    const sync = vi.spyOn(remoteManagementVpsService, "sync").mockResolvedValue(undefined);

    await expect(caller.activate({ id: 303 })).resolves.toMatchObject({ status: "active" });
    await expect(caller.rollback({ id: 303 })).resolves.toMatchObject({ status: "disabled" });

    expect(getOwned).toHaveBeenCalledWith(81, 303);
    expect(sync).toHaveBeenNthCalledWith(1, [expect.objectContaining({ id: 303, externalPort: 40011 })]);
    expect(sync).toHaveBeenNthCalledWith(2, []);
    expect(markActive).toHaveBeenCalledWith(81, 303);
    expect(disable).toHaveBeenCalledWith(81, 303);
    expect(recordEvent).toHaveBeenCalledWith(81, 303, 81, "activation_requested");
    expect(recordEvent).toHaveBeenCalledWith(81, 303, 81, "activated");
    expect(recordEvent).toHaveBeenCalledWith(81, 303, 81, "rollback_requested");
    expect(recordEvent).toHaveBeenCalledWith(81, 303, 81, "rollback_completed");
  });

  it("marks activation as failed and records the audit event when VPS synchronization fails", async () => {
    const caller = remoteManagementAccessRouter.createCaller(context);
    const record = { id: 304, ownerId: 81, externalPort: 40012, vpnTunnelIp: "10.5.0.10", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.10/32"], status: "pending" } as any;
    vi.spyOn(remoteManagementAccessRepository, "getOwned").mockResolvedValue(record);
    vi.spyOn(remoteManagementAccessRepository, "listForVpsSync").mockResolvedValue([]);
    const recordEvent = vi.spyOn(remoteManagementAccessRepository, "recordEvent").mockResolvedValue(undefined);
    const markError = vi.spyOn(remoteManagementAccessRepository, "markErrorOwned").mockResolvedValue({ ...record, status: "error" });
    vi.spyOn(remoteManagementVpsService, "sync").mockRejectedValue(new Error("VPS endpoint unavailable"));

    await expect(caller.activate({ id: 304 })).rejects.toThrow("VPS endpoint unavailable");

    expect(markError).toHaveBeenCalledWith(81, 304, "VPS endpoint unavailable");
    expect(recordEvent).toHaveBeenCalledWith(81, 304, 81, "activation_requested");
    expect(recordEvent).toHaveBeenCalledWith(81, 304, 81, "activation_failed", expect.objectContaining({ message: "VPS endpoint unavailable" }));
  });

  it("restores the prior VPS desired state when local activation persistence fails", async () => {
    const caller = remoteManagementAccessRouter.createCaller(context);
    const record = { id: 306, ownerId: 81, externalPort: 40014, vpnTunnelIp: "10.5.0.12", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.12/32"], status: "pending" } as any;
    vi.spyOn(remoteManagementAccessRepository, "getOwned").mockResolvedValue(record);
    vi.spyOn(remoteManagementAccessRepository, "listForVpsSync").mockResolvedValue([]);
    vi.spyOn(remoteManagementAccessRepository, "recordEvent").mockResolvedValue(undefined);
    vi.spyOn(remoteManagementAccessRepository, "markActiveOwned").mockRejectedValue(new Error("DB write failed"));
    vi.spyOn(remoteManagementAccessRepository, "markErrorOwned").mockResolvedValue({ ...record, status: "error" });
    const sync = vi.spyOn(remoteManagementVpsService, "sync").mockResolvedValue(undefined);

    await expect(caller.activate({ id: 306 })).rejects.toThrow("DB write failed");

    expect(sync).toHaveBeenNthCalledWith(1, [expect.objectContaining({ id: 306 })]);
    expect(sync).toHaveBeenNthCalledWith(2, []);
  });

  it("records an unreconciled VPS warning when activation recovery also fails", async () => {
    const caller = remoteManagementAccessRouter.createCaller(context);
    const record = { id: 308, ownerId: 81, externalPort: 40016, vpnTunnelIp: "10.5.0.14", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.14/32"], status: "pending" } as any;
    vi.spyOn(remoteManagementAccessRepository, "getOwned").mockResolvedValue(record);
    vi.spyOn(remoteManagementAccessRepository, "listForVpsSync").mockResolvedValue([]);
    const recordEvent = vi.spyOn(remoteManagementAccessRepository, "recordEvent").mockResolvedValue(undefined);
    const markError = vi.spyOn(remoteManagementAccessRepository, "markErrorOwned").mockResolvedValue({ ...record, status: "error" });
    vi.spyOn(remoteManagementAccessRepository, "markActiveOwned").mockRejectedValue(new Error("DB write failed"));
    vi.spyOn(remoteManagementVpsService, "sync")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("VPS recovery unavailable"));

    await expect(caller.activate({ id: 308 })).rejects.toThrow("تعذرت مصالحة VPS");

    expect(markError).toHaveBeenCalledWith(81, 308, expect.stringContaining("تعذرت مصالحة VPS"));
    expect(recordEvent).toHaveBeenCalledWith(81, 308, 81, "activation_failed", expect.objectContaining({
      message: "DB write failed",
      reconciliationError: "VPS recovery unavailable",
    }));
  });

  it("keeps the local access unchanged and records rollback failure when VPS synchronization fails", async () => {
    const caller = remoteManagementAccessRouter.createCaller(context);
    const record = { id: 305, ownerId: 81, externalPort: 40013, vpnTunnelIp: "10.5.0.11", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.11/32"], status: "active" } as any;
    vi.spyOn(remoteManagementAccessRepository, "getOwned").mockResolvedValue(record);
    vi.spyOn(remoteManagementAccessRepository, "listForVpsSync").mockResolvedValue([record]);
    const recordEvent = vi.spyOn(remoteManagementAccessRepository, "recordEvent").mockResolvedValue(undefined);
    const disable = vi.spyOn(remoteManagementAccessEngine, "disable");
    vi.spyOn(remoteManagementVpsService, "sync").mockRejectedValue(new Error("VPS endpoint unavailable"));

    await expect(caller.rollback({ id: 305 })).rejects.toThrow("VPS endpoint unavailable");

    expect(disable).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(81, 305, 81, "rollback_requested");
    expect(recordEvent).toHaveBeenCalledWith(81, 305, 81, "rollback_failed", expect.objectContaining({ message: "VPS endpoint unavailable" }));
  });

  it("restores the VPS mapping when local disable persistence fails during rollback", async () => {
    const caller = remoteManagementAccessRouter.createCaller(context);
    const record = { id: 307, ownerId: 81, externalPort: 40015, vpnTunnelIp: "10.5.0.13", targetPort: 8291, accessMode: "restricted", allowedCidrs: ["203.0.113.13/32"], status: "active" } as any;
    vi.spyOn(remoteManagementAccessRepository, "getOwned").mockResolvedValue(record);
    vi.spyOn(remoteManagementAccessRepository, "listForVpsSync").mockResolvedValue([record]);
    vi.spyOn(remoteManagementAccessRepository, "recordEvent").mockResolvedValue(undefined);
    vi.spyOn(remoteManagementAccessEngine, "disable").mockRejectedValue(new Error("DB disable failed"));
    const sync = vi.spyOn(remoteManagementVpsService, "sync").mockResolvedValue(undefined);

    await expect(caller.rollback({ id: 307 })).rejects.toThrow("DB disable failed");

    expect(sync).toHaveBeenNthCalledWith(1, []);
    expect(sync).toHaveBeenNthCalledWith(2, [expect.objectContaining({ id: 307 })]);
  });
});
