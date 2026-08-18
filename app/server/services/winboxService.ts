/**
 * WinboxService
 * Manages TCP port forwarding (socat) on the VPS for Winbox remote access.
 * Each NAS device gets a unique port on the VPS that forwards to the device's VPN IP:8291.
 *
 * Port range: 45000 - 49999 (5000 possible ports)
 * Connection: SSH to VPS using ssh2 npm package (no sshpass dependency)
 * Tool: socat (pre-installed on VPS) running as systemd service
 */

import { Client as SshClient } from "ssh2";
import { getDb } from "../db";
import { nasDevices } from "../../drizzle/schema";
import { eq, isNotNull } from "drizzle-orm";
import { ENV } from "../_core/env";

// VPS SSH credentials - loaded from environment variables (never hardcoded)
const VPS_HOST = ENV.VPS_SSH_HOST;
const VPS_PORT = parseInt(ENV.VPS_SSH_PORT || "1991", 10);
const VPS_USER = ENV.VPS_SSH_USER;
const VPS_PASS = ENV.VPS_SSH_PASS;

const WINBOX_PORT_MIN = 45000;
const WINBOX_PORT_MAX = 49999;
const MIKROTIK_WINBOX_PORT_DEFAULT = 8291;

/**
 * Run a command on the VPS via SSH using ssh2 npm (no sshpass needed)
 */
function sshExec(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const conn = new SshClient();
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      conn.destroy();
      resolve({ stdout, stderr: stderr || "SSH connection timeout" });
    }, 20000);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ stdout: "", stderr: err.message });
          return;
        }
        stream.on("close", () => {
          clearTimeout(timeout);
          conn.end();
          resolve({ stdout, stderr });
        });
        stream.on("data", (data: Buffer) => { stdout += data.toString(); });
        stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ stdout: "", stderr: err.message });
    });

    conn.connect({
      host: VPS_HOST,
      port: VPS_PORT,
      username: VPS_USER,
      password: VPS_PASS,
      readyTimeout: 15000,
      // Accept any host key (equivalent to StrictHostKeyChecking=no)
      hostVerifier: () => true,
    });
  });
}

/**
 * Get a unique available port in range 45000-49999
 */
export async function allocateWinboxPort(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all used ports
  const usedPorts = await db
    .select({ port: nasDevices.winboxPort })
    .from(nasDevices)
    .where(isNotNull(nasDevices.winboxPort));

  const usedSet = new Set(usedPorts.map((r: any) => r.port));

  // Find first available port
  for (let port = WINBOX_PORT_MIN; port <= WINBOX_PORT_MAX; port++) {
    if (!usedSet.has(port)) return port;
  }
  throw new Error("No available Winbox ports in range 45000-49999");
}

/**
 * Create a systemd service for socat port forwarding
 * Service name: winbox-{nasId}
 */
export async function enableWinboxForward(nasId: number, vpnIp: string, port: number, mikrotikPort?: number): Promise<{ success: boolean; error?: string }> {
  const targetPort = mikrotikPort || MIKROTIK_WINBOX_PORT_DEFAULT;
  const serviceName = `winbox-${nasId}`;
  const serviceContent = [
    "[Unit]",
    `Description=Winbox TCP Forward for NAS ${nasId} (${vpnIp}:${targetPort})`,
    "After=network.target",
    "",
    "[Service]",
    `ExecStart=/usr/bin/socat TCP-LISTEN:${port},fork,reuseaddr TCP:${vpnIp}:${targetPort}`,
    "Restart=always",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
  ].join("\\n");

  // Write service file and enable it using printf to avoid quoting issues
  const commands = [
    `printf '${serviceContent}' > /etc/systemd/system/${serviceName}.service`,
    `systemctl daemon-reload`,
    `systemctl enable ${serviceName}`,
    `systemctl start ${serviceName}`,
    `systemctl is-active ${serviceName}`,
  ].join(" && ");

  const { stdout, stderr } = await sshExec(commands);
  const isActive = stdout.trim().includes("active");

  if (!isActive && stderr && !stderr.includes("Warning") && !stderr.includes("Created symlink")) {
    console.error(`[WinboxService] Failed to start ${serviceName}:`, stderr);
    return { success: false, error: stderr.substring(0, 200) };
  }

  // Update DB
  const db = await getDb();
  if (db) {
    await db.update(nasDevices)
      .set({ winboxPort: port, winboxEnabled: true } as any)
      .where(eq(nasDevices.id, nasId));
  }

  console.log(`[WinboxService] ✅ ${serviceName} started on port ${port} → ${vpnIp}:${targetPort}`);
  return { success: true };
}

/**
 * Disable and remove socat service for a NAS
 */
export async function disableWinboxForward(nasId: number): Promise<{ success: boolean; error?: string }> {
  const serviceName = `winbox-${nasId}`;

  const commands = [
    `systemctl stop ${serviceName} 2>/dev/null || true`,
    `systemctl disable ${serviceName} 2>/dev/null || true`,
    `rm -f /etc/systemd/system/${serviceName}.service`,
    `systemctl daemon-reload`,
    `echo done`,
  ].join(" && ");

  const { stdout, stderr } = await sshExec(commands);

  if (!stdout.includes("done")) {
    console.error(`[WinboxService] Failed to stop ${serviceName}:`, stderr);
    return { success: false, error: stderr.substring(0, 200) };
  }

  // Update DB
  const db = await getDb();
  if (db) {
    await db.update(nasDevices)
      .set({ winboxEnabled: false } as any)
      .where(eq(nasDevices.id, nasId));
  }

  console.log(`[WinboxService] ✅ ${serviceName} stopped and removed`);
  return { success: true };
}

/**
 * Check if socat service is running for a NAS
 */
export async function checkWinboxStatus(nasId: number): Promise<"active" | "inactive" | "unknown"> {
  const serviceName = `winbox-${nasId}`;
  const { stdout } = await sshExec(`systemctl is-active ${serviceName} 2>/dev/null || echo inactive`);
  const status = stdout.trim();
  if (status === "active") return "active";
  if (status === "inactive" || status === "failed") return "inactive";
  return "unknown";
}

/**
 * Restart socat service (useful when VPN IP changes)
 */
export async function restartWinboxForward(nasId: number, vpnIp: string, port: number): Promise<{ success: boolean; error?: string }> {
  await disableWinboxForward(nasId);
  return enableWinboxForward(nasId, vpnIp, port);
}
