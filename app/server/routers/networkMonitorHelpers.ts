/**
 * Shared helpers for Network Monitor
 * Extracted to be reused by networkMonitor.ts (router)
 */
import { getDb } from "../db";
import { nasDevices } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "../_core/env";

/** NAS info for ping session */
export type NasInfo = {
  id: number;
  nasname: string;
  vpnTunnelIp?: string | null;
  mikrotikApiPort?: number | null;
  mikrotikApiUser?: string | null;
  mikrotikApiPassword?: string | null;
  apiEnabled?: boolean | null;
};

/** MikroTik API session via SSH tunnel */
export type MikroTikSession = {
  nas: NasInfo;
  conn: { stream: any; close?: () => void };
};

/** Encode MikroTik API word (length-prefixed) */
function encodeWord(word: string): Buffer {
  const wordBuffer = Buffer.from(word, "utf8");
  const length = wordBuffer.length;
  let lengthBuffer: Buffer;
  if (length < 0x80) {
    lengthBuffer = Buffer.from([length]);
  } else if (length < 0x4000) {
    lengthBuffer = Buffer.from([
      ((length >> 8) & 0x3f) | 0x80,
      length & 0xff,
    ]);
  } else {
    lengthBuffer = Buffer.from([length]);
  }
  return Buffer.concat([lengthBuffer, wordBuffer]);
}

/** Execute a MikroTik API command via SSH tunnel stream, returns raw response */
export async function execMikroTikCmd(
  stream: any,
  command: string,
  args: Record<string, string> = {}
): Promise<string> {
  return new Promise((resolve) => {
    const parts = [encodeWord(command)];
    for (const [k, v] of Object.entries(args)) {
      parts.push(encodeWord(`=${k}=${v}`));
    }
    parts.push(Buffer.from([0]));
    const cmd = Buffer.concat(parts);
    stream.write(cmd);
    const chunks: Buffer[] = [];
    const onData = (data: Buffer) => {
      chunks.push(data);
      const combined = Buffer.concat(chunks).toString("utf8");
      if (combined.includes("!done") || combined.includes("!trap") || combined.includes("!fatal")) {
        stream.removeListener("data", onData);
        resolve(combined);
      }
    };
    stream.on("data", onData);
    setTimeout(() => {
      stream.removeListener("data", onData);
      resolve(Buffer.concat(chunks).toString("utf8"));
    }, 8000);
  });
}

/** Get NAS info from DB */
export async function getNasInfo(nasId: number): Promise<NasInfo | null> {
  const db = await getDb();
  if (!db) return null;
  const [nas] = await db.select({
    id: nasDevices.id,
    nasname: nasDevices.nasname,
    vpnTunnelIp: nasDevices.vpnTunnelIp,
    mikrotikApiPort: nasDevices.mikrotikApiPort,
    mikrotikApiUser: nasDevices.mikrotikApiUser,
    mikrotikApiPassword: nasDevices.mikrotikApiPassword,
    apiEnabled: nasDevices.apiEnabled,
  }).from(nasDevices).where(eq(nasDevices.id, nasId)).limit(1);
  return nas || null;
}

/** Open SSH tunnel to VPS and create MikroTik API session */
export async function openMikroTikSession(nasId: number, vpnIpOverride?: string): Promise<MikroTikSession | null> {
  const nas = await getNasInfo(nasId);
  if (!nas || !nas.apiEnabled || !nas.mikrotikApiUser) return null;
  const connectIp = vpnIpOverride || nas.vpnTunnelIp || nas.nasname;
  const apiPort = nas.mikrotikApiPort || 8728;
  const isVpnIp = connectIp.startsWith("192.168.");
  if (!isVpnIp) return null;

  return new Promise(async (resolve) => {
    const { Client } = (await import("ssh2")).default;
    const conn = new Client();
    let resolved = false;
    const fail = () => {
      if (!resolved) { resolved = true; conn.end(); resolve(null); }
    };
    setTimeout(fail, 20000);
    conn.on("ready", () => {
      conn.forwardOut("127.0.0.1", 0, connectIp, apiPort, async (err: any, stream: any) => {
        if (err) { fail(); return; }
        const loginCmd = Buffer.concat([
          encodeWord("/login"),
          encodeWord(`=name=${nas.mikrotikApiUser}`),
          encodeWord(`=password=${nas.mikrotikApiPassword || ""}`),
          Buffer.from([0]),
        ]);
        stream.write(loginCmd);
        await new Promise<void>((r) => {
          const onLogin = (data: Buffer) => {
            const resp = data.toString("utf8");
            if (resp.includes("!done") || resp.includes("!trap") || resp.includes("!fatal")) {
              stream.removeListener("data", onLogin);
              r();
            }
          };
          stream.on("data", onLogin);
          setTimeout(r, 5000);
        });
        if (!resolved) {
          resolved = true;
          resolve({ nas, conn: { stream, close: () => conn.end() } });
        }
      });
    });
    conn.on("error", fail);
    conn.connect({
      host: ENV.VPS_SSH_HOST,
      port: parseInt(ENV.VPS_SSH_PORT || "1991", 10),
      username: ENV.VPS_SSH_USER,
      password: ENV.VPS_SSH_PASS,
    });
  });
}

/** Ping a single IP via MikroTik API through SSH tunnel, returns ms or null */
export async function pingViaApi(
  session: MikroTikSession,
  ip: string
): Promise<number | null> {
  try {
    const response = await execMikroTikCmd(session.conn.stream, "/ping", {
      address: ip,
      count: "2",
      interval: "500ms",
    });
    const avgMatch = response.match(/avg-rtt=([\d.]+)ms/);
    if (avgMatch) return Math.round(parseFloat(avgMatch[1]));
    const timeMatch = response.match(/time=([\d.]+)ms/);
    if (timeMatch) return Math.round(parseFloat(timeMatch[1]));
    return null;
  } catch {
    return null;
  }
}
