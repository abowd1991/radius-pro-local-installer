/**
 * DHCP Lease Manager
 *
 * Manages static DHCP reservations on the VPS via the VPS API (port 8080).
 *
 * ✅ Uses VPS API (ENV.VPS_LEGACY_URL) — no SSH / sshpass dependency.
 *    Previously used sshpass which is not available in Cloud Run.
 *
 * API Endpoints used:
 *   GET    /api/dhcp/leases                    → list all leases
 *   POST   /api/vpn/dhcp/reservation           → add static reservation
 *   DELETE /api/vpn/dhcp/reservation/:hostname → remove reservation
 */

import { ENV } from "../_core/env";

const VPS_API_URL = ENV.VPS_LEGACY_URL;
const VPS_API_KEY = ENV.VPS_LEGACY_SECRET;

interface DhcpLease {
  hostname: string;
  ip: string;
  mac: string;
  state?: string;
}

/**
 * Internal helper: call VPS API
 */
async function callApi<T>(
  endpoint: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${VPS_API_URL}${endpoint}`;
  console.log(`[DHCP Manager] ${method} ${url}`);

  const response = await fetch(url, {
    method,
    headers: {
      "X-API-Key": VPS_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `VPS API ${method} ${endpoint} failed: HTTP ${response.status} — ${errorText}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Add static DHCP reservation
 * @param mac      MAC address (format: aa:bb:cc:dd:ee:ff). Use "00:00:00:00:00:00" if unknown.
 * @param ip       IP address (format: 192.168.30.X or 192.168.31.X)
 * @param hostname Unique hostname for the reservation
 */
export async function addStaticLease(
  mac: string,
  ip: string,
  hostname: string
): Promise<void> {
  console.log(
    `[DHCP Manager] Adding static reservation via API: ${mac} -> ${ip} (${hostname})`
  );

  const result = await callApi<{ success: boolean; message?: string }>(
    "/api/vpn/dhcp/reservation",
    "POST",
    { mac, ip, hostname }
  );

  if (!result.success) {
    throw new Error(
      `Failed to add DHCP reservation: ${result.message ?? "Unknown error"}`
    );
  }

  console.log(`[DHCP Manager] Reservation added: ${result.message}`);
}

/**
 * Remove static DHCP reservation by MAC address.
 * Looks up the hostname from the leases list first, then deletes by hostname.
 */
export async function removeStaticLease(mac: string): Promise<void> {
  console.log(`[DHCP Manager] Removing static reservation for MAC: ${mac}`);

  // Find the hostname associated with this MAC
  const leases = await listStaticLeases();
  const lease = leases.find(
    (l) => l.mac.toLowerCase() === mac.toLowerCase()
  );

  if (!lease) {
    console.warn(
      `[DHCP Manager] No reservation found for MAC ${mac} — skipping removal`
    );
    return;
  }

  await removeStaticLeaseByHostname(lease.hostname);
}

/**
 * Remove static DHCP reservation by hostname (direct, no lookup needed)
 */
export async function removeStaticLeaseByHostname(
  hostname: string
): Promise<void> {
  console.log(`[DHCP Manager] Removing reservation by hostname: ${hostname}`);

  const result = await callApi<{ success: boolean; message?: string }>(
    `/api/vpn/dhcp/reservation/${encodeURIComponent(hostname)}`,
    "DELETE"
  );

  if (!result.success) {
    throw new Error(
      `Failed to remove DHCP reservation: ${result.message ?? "Unknown error"}`
    );
  }

  console.log(`[DHCP Manager] Reservation removed: ${result.message}`);
}

/**
 * List all static DHCP leases / reservations
 */
export async function listStaticLeases(): Promise<
  Array<{ mac: string; ip: string; hostname: string }>
> {
  console.log("[DHCP Manager] Listing static leases via API");

  const result = await callApi<{ success: boolean; leases?: DhcpLease[] }>(
    "/api/dhcp/leases"
  );

  if (!result.success || !result.leases) {
    return [];
  }

  return result.leases.map((l) => ({
    mac: l.mac,
    ip: l.ip,
    hostname: l.hostname,
  }));
}

/**
 * Get current DHCP leases (alias for listStaticLeases with expiry field)
 */
export async function getCurrentLeases(): Promise<
  Array<{ mac: string; ip: string; hostname: string; expiry: string }>
> {
  const leases = await listStaticLeases();
  return leases.map((l) => ({ ...l, expiry: "infinite" }));
}

/**
 * Find MAC address for a given IP from current leases
 */
export async function findMACByIP(ip: string): Promise<string | null> {
  const leases = await getCurrentLeases();
  const lease = leases.find((l) => l.ip === ip);
  return lease ? lease.mac : null;
}
