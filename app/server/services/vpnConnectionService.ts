/**
 * VPN Connection Management Service
 * Handles VPN connection monitoring, control, and logging
 * Supports PPTP and SSTP connections via MikroTik API
 */

import * as db from "../db";
import * as nasDb from "../db/nas";
import { RouterOSAPI } from "node-routeros";
import * as sshVpn from "./sshVpnService";

interface VpnControlResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Get MikroTik API connection for a NAS device
 */
async function getMikrotikConnection(nasId: number): Promise<RouterOSAPI | null> {
  const nas = await nasDb.getNasById(nasId);
  if (!nas || !nas.apiEnabled) {
    return null;
  }

  try {
    const api = new RouterOSAPI({
      host: nas.nasname,
      port: nas.mikrotikApiPort || 8728,
      user: nas.mikrotikApiUser || "admin",
      password: nas.mikrotikApiPassword || "",
      timeout: 10,
    });

    await api.connect();
    return api;
  } catch (error) {
    console.error(`[VPN] Failed to connect to MikroTik API for NAS ${nasId}:`, error);
    return null;
  }
}

/**
 * Get VPN connection status from MikroTik
 */
export async function getVpnStatus(nasId: number): Promise<VpnControlResult> {
  const nas = await nasDb.getNasById(nasId);
  if (!nas) {
    return { success: false, message: "NAS device not found" };
  }

  if (nas.connectionType === "public_ip") {
    return { success: true, message: "Public IP - no VPN", data: { type: "public_ip", status: "connected" } };
  }

  // For VPN types, check if API is enabled
  if (!nas.apiEnabled) {
    // Return status from database
    const vpnConn = await db.getVpnConnectionByNasId(nasId);
    return {
      success: true,
      message: "VPN status from database (API not enabled)",
      data: vpnConn || { status: "unknown", type: nas.connectionType },
    };
  }

  // Try to get status via MikroTik API
  const api = await getMikrotikConnection(nasId);
  if (!api) {
    return { success: false, message: "Failed to connect to MikroTik API" };
  }

  try {
    let interfaceName = "";
    let status = "disconnected";
    let localIp = "";
    let remoteIp = "";
    let uptime = 0;

    if (nas.connectionType === "vpn_l2tp") {
      // Check L2TP client interface
      const l2tpClients = await api.write("/interface/l2tp-client/print");
      const client = l2tpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        status = client.running === "true" ? "connected" : "disconnected";
        localIp = client["local-address"] || "";
        remoteIp = client["remote-address"] || "";
      }
    } else if (nas.connectionType === "vpn_sstp") {
      // Check SSTP client interface
      const sstpClients = await api.write("/interface/sstp-client/print");
      const client = sstpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        status = client.running === "true" ? "connected" : "disconnected";
        localIp = client["local-address"] || "";
        remoteIp = client["remote-address"] || "";
      }
    } else if (nas.connectionType === "vpn_pptp") {
      // Check PPTP client interface
      const pptpClients = await api.write("/interface/pptp-client/print");
      const client = pptpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        status = client.running === "true" ? "connected" : "disconnected";
        localIp = client["local-address"] || "";
        remoteIp = client["remote-address"] || "";
      }
    }

    await api.close();

    // Update database
    await db.upsertVpnConnection({
      nasId,
      connectionType: nas.connectionType as any,
      status: status as any,
      localVpnIp: localIp || null,
      remoteIp: remoteIp || null,
    });

    return {
      success: true,
      message: `VPN status: ${status}`,
      data: {
        type: nas.connectionType,
        status,
        interfaceName,
        localIp,
        remoteIp,
        uptime,
      },
    };
  } catch (error: any) {
    await api.close();
    console.error(`[VPN] Error getting VPN status for NAS ${nasId}:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Restart VPN connection on MikroTik
 */
export async function restartVpnConnection(nasId: number, triggeredBy?: number): Promise<VpnControlResult> {
  const nas = await nasDb.getNasById(nasId);
  if (!nas) {
    return { success: false, message: "NAS device not found" };
  }

  if (nas.connectionType === "public_ip") {
    return { success: false, message: "Cannot restart VPN for Public IP connection" };
  }

  if (!nas.apiEnabled) {
    return { success: false, message: "MikroTik API not enabled for this NAS" };
  }

  const api = await getMikrotikConnection(nasId);
  if (!api) {
    return { success: false, message: "Failed to connect to MikroTik API" };
  }

  try {
    // Update status to connecting
    await db.updateVpnConnectionStatus(nasId, "connecting");

    // Log the restart attempt
    await db.addVpnLog({
      nasId,
      eventType: "manual_restart",
      message: "VPN restart initiated",
      triggeredBy,
    });

    let interfaceName = "";

    if (nas.connectionType === "vpn_l2tp") {
      // Find and restart L2TP client
      const l2tpClients = await api.write("/interface/l2tp-client/print");
      const client = l2tpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        // Disable then enable
        await api.write("/interface/l2tp-client/disable", [`=.id=${client[".id"]}`]);
        await new Promise((r) => setTimeout(r, 1000));
        await api.write("/interface/l2tp-client/enable", [`=.id=${client[".id"]}`]);
      }
    } else if (nas.connectionType === "vpn_sstp") {
      // Find and restart SSTP client
      const sstpClients = await api.write("/interface/sstp-client/print");
      const client = sstpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        // Disable then enable
        await api.write("/interface/sstp-client/disable", [`=.id=${client[".id"]}`]);
        await new Promise((r) => setTimeout(r, 1000));
        await api.write("/interface/sstp-client/enable", [`=.id=${client[".id"]}`]);
      }
    } else if (nas.connectionType === "vpn_pptp") {
      // Find and restart PPTP client
      const pptpClients = await api.write("/interface/pptp-client/print");
      const client = pptpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        // Disable then enable
        await api.write("/interface/pptp-client/disable", [`=.id=${client[".id"]}`]);
        await new Promise((r) => setTimeout(r, 1000));
        await api.write("/interface/pptp-client/enable", [`=.id=${client[".id"]}`]);
      }
    }

    await api.close();

    // Wait and check status
    await new Promise((r) => setTimeout(r, 3000));
    const statusResult = await getVpnStatus(nasId);

    // Log result
    await db.addVpnLog({
      nasId,
      eventType: statusResult.data?.status === "connected" ? "connected" : "reconnecting",
      message: `VPN restart completed - Status: ${statusResult.data?.status || "unknown"}`,
      triggeredBy,
    });

    return {
      success: true,
      message: `VPN restart initiated for interface ${interfaceName}`,
      data: statusResult.data,
    };
  } catch (error: any) {
    await api.close();

    // Log error
    await db.addVpnLog({
      nasId,
      eventType: "error",
      message: "VPN restart failed",
      errorMessage: error.message,
      triggeredBy,
    });

    // Update status to error
    await db.updateVpnConnectionStatus(nasId, "error", { lastError: error.message });

    console.error(`[VPN] Error restarting VPN for NAS ${nasId}:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Disconnect VPN connection - tries SoftEther API first, then MikroTik API
 */
export async function disconnectVpn(nasId: number, triggeredBy?: number): Promise<VpnControlResult> {
  const nas = await nasDb.getNasById(nasId);
  if (!nas) {
    return { success: false, message: "NAS device not found" };
  }

  if (nas.connectionType === "public_ip") {
    return { success: false, message: "Cannot disconnect VPN for Public IP connection" };
  }

  // Try to disconnect via SoftEther API first (server-side disconnect)
  if (nas.vpnUsername) {
    try {
      console.log(`[VPN] Attempting to disconnect ${nas.vpnUsername} via SoftEther API`);
      const result = await sshVpn.disconnectUserSessions(nas.vpnUsername);
      if (result.success) {
        // Log the disconnect
        await db.addVpnLog({
          nasId,
          eventType: "disconnected",
          message: `VPN disconnected via SoftEther API - ${result.message}`,
          triggeredBy,
        });
        return { success: true, message: result.message || "VPN disconnected via SoftEther" };
      }
    } catch (error: any) {
      console.error(`[VPN] SoftEther disconnect failed:`, error.message);
    }
  }

  // Fall back to MikroTik API if SoftEther fails
  if (!nas.apiEnabled) {
    return { success: false, message: "MikroTik API not enabled for this NAS" };
  }

  const api = await getMikrotikConnection(nasId);
  if (!api) {
    return { success: false, message: "Failed to connect to MikroTik API" };
  }

  try {
    // Log the disconnect attempt
    await db.addVpnLog({
      nasId,
      eventType: "manual_disconnect",
      message: "VPN disconnect initiated",
      triggeredBy,
    });

    let interfaceName = "";

    if (nas.connectionType === "vpn_l2tp") {
      // Find and disable L2TP client
      const l2tpClients = await api.write("/interface/l2tp-client/print");
      const client = l2tpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        await api.write("/interface/l2tp-client/disable", [`=.id=${client[".id"]}`]);
      }
    } else if (nas.connectionType === "vpn_sstp") {
      // Find and disable SSTP client
      const sstpClients = await api.write("/interface/sstp-client/print");
      const client = sstpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        await api.write("/interface/sstp-client/disable", [`=.id=${client[".id"]}`]);
      }
    } else if (nas.connectionType === "vpn_pptp") {
      // Find and disable PPTP client
      const pptpClients = await api.write("/interface/pptp-client/print");
      const client = pptpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        await api.write("/interface/pptp-client/disable", [`=.id=${client[".id"]}`]);
      }
    }

    await api.close();

    // Update status
    await db.updateVpnConnectionStatus(nasId, "disconnected");
    await db.incrementVpnDisconnectCount(nasId);

    // Log result
    await db.addVpnLog({
      nasId,
      eventType: "disconnected",
      message: `VPN disconnected - Interface: ${interfaceName}`,
      triggeredBy,
    });

    return {
      success: true,
      message: `VPN disconnected for interface ${interfaceName}`,
    };
  } catch (error: any) {
    await api.close();

    // Log error
    await db.addVpnLog({
      nasId,
      eventType: "error",
      message: "VPN disconnect failed",
      errorMessage: error.message,
      triggeredBy,
    });

    console.error(`[VPN] Error disconnecting VPN for NAS ${nasId}:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Connect VPN (enable interface)
 */
export async function connectVpn(nasId: number, triggeredBy?: number): Promise<VpnControlResult> {
  const nas = await nasDb.getNasById(nasId);
  if (!nas) {
    return { success: false, message: "NAS device not found" };
  }

  if (nas.connectionType === "public_ip") {
    return { success: false, message: "Cannot connect VPN for Public IP connection" };
  }

  if (!nas.apiEnabled) {
    return { success: false, message: "MikroTik API not enabled for this NAS" };
  }

  const api = await getMikrotikConnection(nasId);
  if (!api) {
    return { success: false, message: "Failed to connect to MikroTik API" };
  }

  try {
    // Update status to connecting
    await db.updateVpnConnectionStatus(nasId, "connecting");

    let interfaceName = "";

    if (nas.connectionType === "vpn_l2tp") {
      // Find and enable L2TP client
      const l2tpClients = await api.write("/interface/l2tp-client/print");
      const client = l2tpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        await api.write("/interface/l2tp-client/enable", [`=.id=${client[".id"]}`]);
      }
    } else if (nas.connectionType === "vpn_sstp") {
      // Find and enable SSTP client
      const sstpClients = await api.write("/interface/sstp-client/print");
      const client = sstpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        await api.write("/interface/sstp-client/enable", [`=.id=${client[".id"]}`]);
      }
    } else if (nas.connectionType === "vpn_pptp") {
      // Find and enable PPTP client
      const pptpClients = await api.write("/interface/pptp-client/print");
      const client = pptpClients.find((c: any) => c.name?.includes(nas.vpnUsername || ""));
      if (client) {
        interfaceName = client.name;
        await api.write("/interface/pptp-client/enable", [`=.id=${client[".id"]}`]);
      }
    }

    await api.close();

    // Wait and check status
    await new Promise((r) => setTimeout(r, 3000));
    const statusResult = await getVpnStatus(nasId);

    // Log result
    await db.addVpnLog({
      nasId,
      eventType: statusResult.data?.status === "connected" ? "connected" : "reconnecting",
      message: `VPN connect initiated - Status: ${statusResult.data?.status || "unknown"}`,
      triggeredBy,
    });

    return {
      success: true,
      message: `VPN connect initiated for interface ${interfaceName}`,
      data: statusResult.data,
    };
  } catch (error: any) {
    await api.close();

    // Log error
    await db.addVpnLog({
      nasId,
      eventType: "connection_failed",
      message: "VPN connect failed",
      errorMessage: error.message,
      triggeredBy,
    });

    // Update status to error
    await db.updateVpnConnectionStatus(nasId, "error", { lastError: error.message });

    console.error(`[VPN] Error connecting VPN for NAS ${nasId}:`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Get all VPN connections with status
 */
export async function getAllVpnConnectionsWithStatus(ownerId?: number) {
  const connections = await db.getAllVpnConnections(ownerId);
  return connections;
}

/**
 * Sync VPN status for all NAS devices
 * Should be called periodically by a cron job
 */
export async function syncAllVpnStatuses(ownerId?: number) {
  const nasList = ownerId
    ? await nasDb.getNasDevicesByOwner(ownerId)
    : await nasDb.getAllNasDevices();

  const results = [];

  for (const nas of nasList) {
    if (nas.connectionType !== "public_ip") {
      const status = await getVpnStatus(nas.id);
      results.push({
        nasId: nas.id,
        nasName: nas.shortname,
        ...status,
      });
    }
  }

  return results;
}

/**
 * Initialize VPN connection record for a NAS
 */
export async function initializeVpnConnection(nasId: number, connectionType: "public_ip" | "vpn_sstp" | "vpn_l2tp" | "vpn_pptp") {
  if (connectionType === "public_ip") {
    return null;
  }

  return db.upsertVpnConnection({
    nasId,
    connectionType,
    status: "disconnected",
  });
}
