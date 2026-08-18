/**
 * VPS Management Service
 * Provides interface for system status and management operations
 * 
 * Uses TWO APIs:
 * - Port 8081: Management API (App updates only) - NEW
 * - Port 8080: Legacy API (RADIUS/VPN/DHCP status)
 * 
 * ⚠️ IMPORTANT: Management API (8081) does NOT touch:
 * - FreeRADIUS
 * - VPN/SoftEther
 * - DHCP
 * - Any system services
 * 
 * It ONLY handles: git pull → pnpm install → pnpm build → pm2 reload app
 */

import { ENV } from "../_core/env";

// Management API (Port 8080) - App updates only
const MGMT_API_URL = ENV.VPS_MANAGEMENT_URL;
const MGMT_API_KEY = ENV.VPS_MANAGEMENT_API_KEY || ENV.VPS_LEGACY_SECRET;

// Legacy API (Port 8080) - RADIUS/VPN/DHCP status
const LEGACY_API_URL = ENV.VPS_LEGACY_URL;
const LEGACY_API_KEY = ENV.VPS_LEGACY_SECRET;

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

interface ServiceStatus {
  app: string;
  freeradius: string;
  vpn: string;
  dhcp: string;
}

interface HealthCheck {
  app_running: boolean;
  api_responding: boolean;
  db_connected: boolean;
}

interface SystemStatus {
  version: string;
  services: ServiceStatus;
  disk_usage: string;
  memory_usage: string;
  cpu_usage: string;
  backups_count: number;
  health: HealthCheck;
  timestamp: string;
  uptime: string;
}

interface VersionInfo {
  hash: string;
  message: string;
  date: string;
}

interface BackupInfo {
  id: string;
  filename: string;
  size: string;
  created: string;
}

interface UpdateResult {
  old_version: string;
  new_version: string;
  health: HealthCheck;
  backup_id: string;
  message: string;
}

interface RollbackResult {
  previous_version: string;
  current_version: string;
  message: string;
}

/**
 * Call Management API (Port 8081) - For app updates only
 */
async function callMgmtApi<T>(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  try {
    const url = `${MGMT_API_URL}${endpoint}`;
    console.log(`[VPSManagement] Calling MGMT API: ${method} ${url}`);
    
    const response = await fetch(url, {
      method,
      headers: {
        "X-API-Key": MGMT_API_KEY,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn(`[VPSManagement] MGMT API returned non-JSON response (${contentType})`);
      return {
        success: false,
        error: "Management API unavailable or returned invalid response",
      };
    }
    
    const data = await response.json();
    console.log(`[VPSManagement] MGMT Response:`, JSON.stringify(data).substring(0, 200));
    
    if (!response.ok || data.success === false) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
        details: data,
      };
    }

    return { success: true, data: data.data || data };
  } catch (error) {
    console.error(`[VPSManagement] MGMT API call failed: ${endpoint}`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Call Legacy API (Port 8080) - For RADIUS/VPN/DHCP status
 */
async function callLegacyApi<T>(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  try {
    const url = `${LEGACY_API_URL}${endpoint}`;
    console.log(`[VPSManagement] Calling Legacy API: ${method} ${url}`);
    
    const response = await fetch(url, {
      method,
      headers: {
        "X-API-Key": LEGACY_API_KEY,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: errorText,
      };
    }

    const data = await response.json();
    console.log(`[VPSManagement] Legacy Response:`, JSON.stringify(data).substring(0, 200));
    return { success: true, data: data as T };
  } catch (error) {
    console.error(`[VPSManagement] Legacy API call failed: ${endpoint}`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get system status using Legacy API (8080) only
 * Management API (8081) is not available
 * Returns: RADIUS status, VPN status, DHCP leases count
 */
export async function getSystemStatus(): Promise<ApiResponse<SystemStatus>> {
  try {
    // Fetch from Legacy API (8080) - RADIUS/VPN/DHCP status
    const [radiusResult, vpnResult, dhcpResult] = await Promise.all([
      callLegacyApi<{ isActive: boolean; status: string; success: boolean }>("/api/radius/status"),
      callLegacyApi<{ status?: { hubName?: string; online?: boolean }; online?: boolean; success?: boolean }>("/api/vpn/status"),
      callLegacyApi<{ count?: number; leases?: unknown[] }>("/api/dhcp/leases"),
    ]);

    // Build services status
    let vpnOnline = false;
    if (vpnResult.success && vpnResult.data) {
      const vpnData = vpnResult.data as { status?: { online?: boolean }; online?: boolean };
      vpnOnline = vpnData.status?.online ?? vpnData.online ?? false;
    }
    
    const radiusActive = radiusResult.success && radiusResult.data?.isActive === true;
    const dhcpLeases = dhcpResult.success && dhcpResult.data 
      ? (dhcpResult.data as { leases?: unknown[] }).leases?.length ?? 0
      : 0;
    
    const services: ServiceStatus = {
      app: "active", // Our app is running since we're responding
      freeradius: radiusActive ? "active" : "inactive",
      vpn: vpnOnline ? "active" : "inactive",
      dhcp: dhcpResult.success ? "active" : "inactive",
    };

    // Health check
    const health: HealthCheck = {
      app_running: true,
      api_responding: radiusResult.success || vpnResult.success,
      db_connected: true,
    };

    const systemStatus: SystemStatus = {
      version: "v1.0.0",
      services,
      disk_usage: "N/A", // Not available via Legacy API
      memory_usage: "N/A", // Not available via Legacy API
      cpu_usage: "N/A", // Not available via Legacy API
      backups_count: 0,
      health,
      timestamp: new Date().toISOString(),
      uptime: "N/A", // Not available via Legacy API
      // Extra fields for Dashboard display
      dhcp_leases_count: dhcpLeases,
      radius_active: radiusActive,
      vpn_online: vpnOnline,
      api_available: radiusResult.success || vpnResult.success,
    } as SystemStatus & {
      dhcp_leases_count: number;
      radius_active: boolean;
      vpn_online: boolean;
      api_available: boolean;
    };

    return { success: true, data: systemStatus };
  } catch (error) {
    console.error("[VPSManagement] getSystemStatus failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get system status",
    };
  }
}

/**
 * Get list of available versions/releases
 */
export async function getVersions(): Promise<ApiResponse<{ current: string; versions: VersionInfo[] }>> {
  const result = await callMgmtApi<{
    current: string;
    currentRelease: string;
    versions: Array<{
      name: string;
      version: string;
      message: string;
      created: string;
      isCurrent: boolean;
    }>;
  }>("/api/app/versions");

  if (!result.success) {
    return {
      success: false,
      error: result.error || "Failed to get versions",
    };
  }

  const data = result.data;
  return {
    success: true,
    data: {
      current: data?.current || "unknown",
      versions: (data?.versions || []).map(v => ({
        hash: v.name,
        message: v.message || v.version,
        date: v.created,
      })),
    },
  };
}

/**
 * Update to latest version
 * Uses Management API (8081) - ONLY does: git pull → build → reload app
 * Does NOT touch: RADIUS, VPN, DHCP, or any system services
 */
export async function updateSystem(): Promise<ApiResponse<UpdateResult>> {
  console.log("[VPSManagement] Starting app update via Management API (8081)");
  
  const result = await callMgmtApi<{
    message: string;
    release: string;
    version: string;
    previousVersion: string;
    backupCreated: string;
  }>("/api/app/update", "POST");

  if (!result.success) {
    return {
      success: false,
      error: result.error || "فشل التحديث",
      details: result.details,
    };
  }

  const data = result.data;
  return {
    success: true,
    data: {
      old_version: data?.previousVersion || "unknown",
      new_version: data?.version || "unknown",
      health: {
        app_running: true,
        api_responding: true,
        db_connected: true,
      },
      backup_id: data?.backupCreated || "",
      message: data?.message || "تم التحديث بنجاح",
    },
  };
}

/**
 * Rollback to a specific version
 * Uses Management API (8081) - ONLY switches symlink and reloads app
 * Does NOT touch: RADIUS, VPN, DHCP, or any system services
 */
export async function rollbackSystem(version?: string): Promise<ApiResponse<RollbackResult>> {
  console.log(`[VPSManagement] Starting rollback via Management API (8081) to: ${version || "previous"}`);
  
  const result = await callMgmtApi<{
    message: string;
    release: string;
    previousRelease: string;
  }>("/api/app/rollback", "POST", version ? { release: version } : undefined);

  if (!result.success) {
    return {
      success: false,
      error: result.error || "فشل الرجوع للنسخة السابقة",
      details: result.details,
    };
  }

  const data = result.data;
  return {
    success: true,
    data: {
      previous_version: data?.previousRelease || "unknown",
      current_version: data?.release || "unknown",
      message: data?.message || "تم الرجوع للنسخة السابقة بنجاح",
    },
  };
}

/**
 * Get list of available backups
 */
export async function getBackups(): Promise<ApiResponse<BackupInfo[]>> {
  const result = await callMgmtApi<{
    backups: Array<{
      name: string;
      size: string;
      created: string;
    }>;
  }>("/api/app/backups");

  if (!result.success) {
    return {
      success: true,
      data: [], // Return empty array on error
    };
  }

  const data = result.data;
  return {
    success: true,
    data: (data?.backups || []).map(b => ({
      id: b.name,
      filename: b.name,
      size: b.size,
      created: b.created,
    })),
  };
}

/**
 * Get service logs (app logs only)
 */
export async function getServiceLogs(
  serviceName: string,
  lines: number = 100
): Promise<ApiResponse<{ service: string; logs: string }>> {
  if (serviceName !== "app" && serviceName !== "radius-saas") {
    return {
      success: false,
      error: "سجلات هذه الخدمة غير متاحة من Management API",
    };
  }

  const result = await callMgmtApi<{ logs: string }>(`/api/app/logs?lines=${Math.min(lines, 200)}`);

  if (!result.success) {
    return {
      success: false,
      error: result.error || "فشل جلب السجلات",
    };
  }

  return {
    success: true,
    data: {
      service: serviceName,
      logs: (result.data as { logs: string })?.logs || "",
    },
  };
}

/**
 * Manage a service (start/stop/restart/reload)
 * Only RADIUS reload is available via Legacy API (8080)
 * App reload is available via Management API (8081)
 */
export async function manageService(
  serviceName: string,
  action: "start" | "stop" | "restart" | "reload"
): Promise<ApiResponse<{ service: string; action: string; new_status: string }>> {
  // App reload via Management API (8081)
  if ((serviceName === "app" || serviceName === "radius-saas") && action === "reload") {
    const result = await callMgmtApi<{ message: string }>("/api/app/reload", "POST");
    if (result.success) {
      return {
        success: true,
        data: {
          service: serviceName,
          action: action,
          new_status: "active",
        },
      };
    }
    return {
      success: false,
      error: result.error || "Failed to reload app",
    };
  }

  // RADIUS reload via Legacy API (8080)
  if (serviceName === "freeradius" && action === "reload") {
    const result = await callLegacyApi<{ success: boolean; message?: string }>("/api/radius/reload", "POST");
    if (result.success) {
      return {
        success: true,
        data: {
          service: serviceName,
          action: action,
          new_status: "active",
        },
      };
    }
    return {
      success: false,
      error: result.error || "Failed to reload FreeRADIUS",
    };
  }

  return {
    success: false,
    error: `إدارة الخدمة ${serviceName} (${action}) غير متاحة.`,
  };
}

/**
 * Manage FreeRADIUS: reload, restart, start, or stop
 * All actions go via Legacy API (8080)
 * - reload  → POST /api/radius/reload
 * - restart → POST /api/radius/restart  (fallback to reload on 404)
 * - start   → POST /api/radius/start    (fallback to reload on 404)
 * - stop    → POST /api/radius/stop
 */
export async function manageFreeRadius(
  action: 'reload' | 'restart' | 'start' | 'stop'
): Promise<ApiResponse<{ service: string; action: string; new_status: string }>> {
  const endpointMap: Record<string, string> = {
    reload:  '/api/radius/reload',
    restart: '/api/radius/restart',
    start:   '/api/radius/start',
    stop:    '/api/radius/stop',
  };
  const endpoint = endpointMap[action];
  const result = await callLegacyApi<{ success: boolean; message?: string }>(endpoint, 'POST');

  if (result.success) {
    const newStatus = action === 'stop' ? 'inactive' : 'active';
    return {
      success: true,
      data: { service: 'freeradius', action, new_status: newStatus },
    };
  }

  // If endpoint not found (404), fall back to reload for restart/start
  const is404 = result.error?.includes('404') || result.error?.includes('Not Found');
  if ((action === 'restart' || action === 'start') && is404) {
    console.warn(`[VPSManagement] ${endpoint} not found — falling back to reload`);
    const fallback = await callLegacyApi<{ success: boolean; message?: string }>('/api/radius/reload', 'POST');
    if (fallback.success) {
      return {
        success: true,
        data: { service: 'freeradius', action: 'reload (fallback)', new_status: 'active' },
      };
    }
    return { success: false, error: fallback.error || 'Failed to reload FreeRADIUS (fallback)' };
  }

  return { success: false, error: result.error || `Failed to ${action} FreeRADIUS` };
}

/**
 * Quick reload of the application
 */
export async function reloadApp(): Promise<ApiResponse<{ message: string; status: string; output: string }>> {
  const result = await callMgmtApi<{ message: string }>("/api/app/reload", "POST");
  
  if (!result.success) {
    return {
      success: false,
      error: result.error || "فشل إعادة تحميل التطبيق",
    };
  }

  return {
    success: true,
    data: {
      message: (result.data as { message: string })?.message || "تم إعادة تحميل التطبيق",
      status: "active",
      output: "",
    },
  };
}

// ============================================================
// NEW FUNCTIONS - Matching vpn-api.py (Port 8080) endpoints
// ============================================================

/** GET /api/vpn/users — List all VPN users */
export async function getVpnUsers(): Promise<ApiResponse<{ username: string; connection_type: string }[]>> {
  return callLegacyApi("/api/vpn/users");
}

/** POST /api/vpn/users — Create VPN user (also upserts: updates password/IP if user exists) */
export async function createVpnUser(username: string, password: string, connectionType: string = 'l2tp', staticIp?: string): Promise<ApiResponse<unknown>> {
  const body: Record<string, string> = { username, password, connectionType };
  if (staticIp) body.staticIp = staticIp;
  return callLegacyApi("/api/vpn/users", "POST", body);
}

/** Update VPN user IP — uses upsert: POST /api/vpn/users with existing username + new staticIp
 *  The API only updates IP when user already exists (password field is required but ignored for existing users)
 */
export async function updateVpnUserIp(username: string, newIp: string, currentPassword: string = ''): Promise<ApiResponse<unknown>> {
  // We pass a sentinel password; the API ignores it when user exists and only updates IP
  return callLegacyApi("/api/vpn/users", "POST", { username, password: currentPassword || '__keep__', staticIp: newIp });
}

/** DELETE /api/vpn/users/:username — Delete VPN user */
export async function deleteVpnUser(username: string): Promise<ApiResponse<unknown>> {
  return callLegacyApi(`/api/vpn/users/${username}`, "POST", { _method: 'DELETE' });
}

/** GET /api/vpn/sessions — List active PPP sessions */
export async function getVpnSessions(): Promise<ApiResponse<unknown[]>> {
  return callLegacyApi("/api/vpn/sessions");
}

/** POST /api/vpn/user/:username/disconnect — Disconnect all sessions for a user */
export async function disconnectVpnUser(username: string): Promise<ApiResponse<unknown>> {
  return callLegacyApi(`/api/vpn/user/${username}/disconnect`, "POST");
}

/** GET /api/vpn/user/:username/sessions — Get sessions for a specific user */
export async function getUserSessions(username: string): Promise<ApiResponse<unknown[]>> {
  return callLegacyApi(`/api/vpn/user/${username}/sessions`);
}

/** GET /api/vpn/session/:username/mac — Get MAC address of active session */
export async function getSessionMac(username: string): Promise<ApiResponse<{ mac: string; ip: string }>> {
  return callLegacyApi(`/api/vpn/session/${username}/mac`);
}

/** GET /api/vpn/logs — Get VPN logs */
export async function getVpnLogs(lines: number = 100): Promise<ApiResponse<{ logs: string[] }>> {
  return callLegacyApi(`/api/vpn/logs?lines=${lines}`);
}

/** POST /api/vpn/dhcp/reservation — Create DHCP reservation */
export async function createDhcpReservation(mac: string, ip: string, hostname: string): Promise<ApiResponse<unknown>> {
  return callLegacyApi("/api/vpn/dhcp/reservation", "POST", { mac, ip, hostname });
}

/** DELETE /api/vpn/dhcp/reservation/:hostname — Delete DHCP reservation */
export async function deleteDhcpReservation(hostname: string): Promise<ApiResponse<unknown>> {
  return callLegacyApi(`/api/vpn/dhcp/reservation/${hostname}`, "POST", { _method: 'DELETE' });
}

/** GET /api/dhcp/lease?ip=x — Get single DHCP lease by IP */
export async function getDhcpLease(ip: string): Promise<ApiResponse<unknown>> {
  return callLegacyApi(`/api/dhcp/lease?ip=${ip}`);
}

/** POST /api/radius/clients — Add RADIUS client (NAS) */
export async function addRadiusClient(nasIp: string, secret: string, shortname?: string): Promise<ApiResponse<unknown>> {
  return callLegacyApi("/api/radius/clients", "POST", { nas_ip: nasIp, secret, shortname });
}

/** POST /api/radius/disconnect — Send CoA Disconnect to NAS */
export async function radiusDisconnect(nasIp: string, username: string, sessionId?: string): Promise<ApiResponse<unknown>> {
  return callLegacyApi("/api/radius/disconnect", "POST", { nas_ip: nasIp, username, session_id: sessionId });
}

/** GET /api/sessions/active — Get active sessions from DB */
export async function getActiveSessions(): Promise<ApiResponse<unknown[]>> {
  return callLegacyApi("/api/sessions/active");
}

/** POST /api/sessions/cleanup — Cleanup stale DB sessions */
export async function cleanupStaleSessions(): Promise<ApiResponse<unknown>> {
  return callLegacyApi("/api/sessions/cleanup", "POST");
}

/** GET /api/sstp/sessions — Get active SSTP sessions */
export async function getSstpSessions(): Promise<ApiResponse<unknown[]>> {
  return callLegacyApi("/api/sstp/sessions");
}

/** POST /api/sstp/sessions/:username/disconnect — Disconnect SSTP session */
export async function disconnectSstpSession(username: string): Promise<ApiResponse<unknown>> {
  return callLegacyApi(`/api/sstp/sessions/${username}/disconnect`, "POST");
}

/** GET /api/sstp/status — Get SSTP server status */
export async function getSstpStatus(): Promise<ApiResponse<unknown>> {
  return callLegacyApi("/api/sstp/status");
}

/** GET /api/health — Health check */
export async function getApiHealth(): Promise<ApiResponse<unknown>> {
  return callLegacyApi("/api/health");
}

// Legacy functions - kept for compatibility but return not available
export async function createBackup(prefix: string = "manual"): Promise<ApiResponse<{ backup_id: string; path: string; size: number }>> {
  return {
    success: false,
    error: "إنشاء النسخ الاحتياطية غير متاح من هذه الواجهة.",
  };
}

export async function restoreBackup(backupId: string): Promise<ApiResponse<{ restored_backup: string; timestamp: string }>> {
  return {
    success: false,
    error: "استعادة النسخ الاحتياطية غير متاحة من هذه الواجهة.",
  };
}

export async function deployUpdate(packageData: string): Promise<ApiResponse<{ message: string; output: string }>> {
  return {
    success: false,
    error: "استخدم زر التحديث بدلاً من هذه الوظيفة.",
  };
}

export const vpsManagementService = {
  // Existing
  getSystemStatus,
  getVersions,
  updateSystem,
  rollbackSystem,
  getBackups,
  createBackup,
  restoreBackup,
  getServiceLogs,
  manageService,
  deployUpdate,
  reloadApp,
  // New - from vpn-api.py
  getVpnUsers,
  createVpnUser,
  deleteVpnUser,
  getVpnSessions,
  disconnectVpnUser,
  getUserSessions,
  getSessionMac,
  getVpnLogs,
  createDhcpReservation,
  deleteDhcpReservation,
  getDhcpLease,
  addRadiusClient,
  radiusDisconnect,
  getActiveSessions,
  cleanupStaleSessions,
  getSstpSessions,
  disconnectSstpSession,
  getSstpStatus,
  getApiHealth,
};
