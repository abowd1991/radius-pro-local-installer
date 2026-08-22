import { normalizeTrustedCidrs } from "./PortForwardingPolicy";

/** Dedicated range that does not overlap the legacy Winbox or V2 LAN-forward ranges. */
export const REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE = { start: 40000, end: 44999 } as const;
export const DEFAULT_REMOTE_MANAGEMENT_ACCESS_QUOTA = 3;
export const MAX_REMOTE_MANAGEMENT_ACCESS_QUOTA = 50;

export type RemoteManagementService = "winbox";
export type RemoteManagementAccessMode = "restricted" | "public";

function isIpv4(value: string) {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

export function assertRemoteManagementTarget(input: { vpnTunnelIp: string; targetPort: number; externalPort?: number }) {
  if (!isIpv4(input.vpnTunnelIp)) throw new Error("عنوان VPN الخاص بجهاز NAS غير صالح");
  if (!Number.isInteger(input.targetPort) || input.targetPort < 1 || input.targetPort > 65535) {
    throw new Error("منفذ الإدارة الداخلي غير صالح");
  }
  if (input.externalPort !== undefined && (input.externalPort < REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.start || input.externalPort > REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.end)) {
    throw new Error("المنفذ الخارجي خارج نطاق الإدارة البعيدة المخصص");
  }
}

export function normalizeRemoteManagementAccess(input: { accessMode: RemoteManagementAccessMode; allowedCidrs: string[]; publicAcknowledged: boolean }) {
  if (input.accessMode !== "restricted") {
    throw new Error("Winbox V2 يدعم الوصول المقيّد بقائمة سماح فقط");
  }
  return normalizeTrustedCidrs(input.allowedCidrs, "restricted");
}

export function assertRemoteManagementQuota(maxAccesses: number, usedAccesses: number) {
  if (!Number.isInteger(maxAccesses) || maxAccesses < 1 || maxAccesses > MAX_REMOTE_MANAGEMENT_ACCESS_QUOTA) {
    throw new Error("حصة الإدارة البعيدة غير صالحة");
  }
  if (usedAccesses >= maxAccesses) throw new Error("تم بلوغ حصة الوصول البعيد المسموح بها");
}

export type RemoteManagementLifecycleStatus = "pending" | "active" | "disabled" | "error";

/** A disabled record releases capacity; errored records retain their original reservation. */
export function shouldReserveRemoteManagementQuota(existingStatus: RemoteManagementLifecycleStatus | undefined) {
  return existingStatus === undefined || existingStatus === "disabled";
}

export function remoteManagementQuotaDelta(from: RemoteManagementLifecycleStatus | undefined, to: RemoteManagementLifecycleStatus) {
  const holdsQuota = (status: RemoteManagementLifecycleStatus | undefined) => status === "pending" || status === "active" || status === "error";
  return Number(holdsQuota(to)) - Number(holdsQuota(from));
}

export function collectOccupiedRemoteManagementPorts(...sources: Array<ReadonlyArray<{ port: number | null }>>) {
  return new Set<number>(sources.flatMap((source) => source.map((row) => Number(row.port)).filter((port) => Number.isInteger(port) && port > 0)));
}

export function nextAvailableRemoteManagementPort(usedPorts: ReadonlySet<number>) {
  for (let port = REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.start; port <= REMOTE_MANAGEMENT_EXTERNAL_PORT_RANGE.end; port++) {
    if (!usedPorts.has(port)) return port;
  }
  throw new Error("لا توجد منافذ متاحة ضمن نطاق الإدارة البعيدة");
}
