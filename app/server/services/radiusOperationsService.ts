import fs from "node:fs";

export type RadiusOperation = "reload" | "restart" | "start" | "stop";

export interface RadiusOperationsStatus {
  activeState: "active" | "inactive" | "failed" | "unknown";
  subState: string;
  pid: number | null;
  activeSince: string | null;
  uptimeSeconds: number;
  uptimeHuman: string;
  activeSessions: number;
  lastConfigCheck: { success: boolean | null; checkedAt: string | null; summary: string | null };
  recentLogs: string[];
}

interface OperationsResponse<T> { success: boolean; data?: T; error?: string }

const OPERATIONS_URL = process.env.RADIUS_OPERATIONS_URL || "http://127.0.0.1:8080";
const KEY_FILE = process.env.RADIUS_OPERATIONS_KEY_FILE || "/opt/radius-pro/.radius-operations.key";

function getKey(): string {
  if (process.env.RADIUS_OPERATIONS_KEY?.trim()) return process.env.RADIUS_OPERATIONS_KEY.trim();
  try {
    const key = fs.readFileSync(KEY_FILE, "utf8").trim();
    if (key) return key;
  } catch {
    // Local development intentionally has no VPS operations key.
  }
  throw new Error("Radius Operations key is not configured");
}

async function callOperations<T>(path: string, method: "GET" | "POST" = "GET", body?: Record<string, unknown>): Promise<OperationsResponse<T>> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const response = await fetch(`${OPERATIONS_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Radius-Operations-Key": getKey() },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const payload = await response.json().catch(() => ({})) as OperationsResponse<T>;
    return response.ok && payload.success ? payload : { success: false, error: payload.error || `HTTP ${response.status}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Radius Operations API unavailable" };
  }
}

export function getRadiusOperationsStatus() {
  return callOperations<RadiusOperationsStatus>("/api/radius/operations/status");
}

export function executeRadiusOperation(action: RadiusOperation) {
  return callOperations<RadiusOperationsStatus & { operation: RadiusOperation; message: string }>("/api/radius/operations/action", "POST", { action });
}
