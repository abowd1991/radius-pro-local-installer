import { promises as dns } from "node:dns";
import https from "node:https";
import net from "node:net";

type Resolver = {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
};

const defaultResolver: Resolver = {
  resolve4: (hostname) => dns.resolve4(hostname),
  resolve6: (hostname) => dns.resolve6(hostname),
};

export class UnsafeExternalUrlError extends Error {}

export type ResolvedExternalUrl = {
  url: URL;
  address: string;
  family: 4 | 6;
};

const SAFE_REMOTE_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;

function isUnsafeIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

function isUnsafeIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") || normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:172.");
}

export function isUnsafeIpAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isUnsafeIpv4(address);
  if (family === 6) return isUnsafeIpv6(address);
  return true;
}

export async function resolveSafeExternalHttpsUrl(rawUrl: string, resolver: Resolver = defaultResolver): Promise<ResolvedExternalUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeExternalUrlError("رابط WhatsApp غير صالح");
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new UnsafeExternalUrlError("رابط WhatsApp يجب أن يكون HTTPS عاماً ومن دون بيانات دخول داخل الرابط");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeExternalUrlError("لا يسمح بعنوان محلي لخدمة WhatsApp");
  }

  if (net.isIP(hostname)) {
    if (isUnsafeIpAddress(hostname)) throw new UnsafeExternalUrlError("لا يسمح بعنوان داخلي أو خاص لخدمة WhatsApp");
    return { url, address: hostname, family: net.isIP(hostname) as 4 | 6 };
  }

  const resolved = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);
  const addresses = resolved.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (addresses.length === 0 || addresses.some(isUnsafeIpAddress)) {
    throw new UnsafeExternalUrlError("يجب أن يشير رابط WhatsApp إلى خدمة HTTPS عامة وآمنة");
  }

  const address = addresses[0];
  return { url, address, family: net.isIP(address) as 4 | 6 };
}

export async function assertSafeExternalHttpsUrl(rawUrl: string, resolver: Resolver = defaultResolver): Promise<URL> {
  return (await resolveSafeExternalHttpsUrl(rawUrl, resolver)).url;
}

export function isSafeRemoteImageContentType(contentType: string | undefined): boolean {
  return !!contentType && SAFE_REMOTE_IMAGE_MIMES.has(contentType.split(";", 1)[0].trim().toLowerCase());
}

export async function fetchSafeExternalImageBuffer(rawUrl: string, maxBytes = MAX_REMOTE_IMAGE_BYTES): Promise<Buffer> {
  const { url, address, family } = await resolveSafeExternalHttpsUrl(rawUrl);

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: "https:",
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.hostname,
      headers: { Accept: "image/jpeg,image/png,image/gif,image/webp" },
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    }, (response) => {
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Remote image returned HTTP ${response.statusCode ?? 0}`));
        return;
      }
      if (!isSafeRemoteImageContentType(response.headers["content-type"])) {
        response.resume();
        reject(new Error("Remote resource is not an allowed image type"));
        return;
      }
      const declaredSize = Number(response.headers["content-length"] ?? 0);
      if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
        response.resume();
        reject(new Error("Remote image exceeds the allowed size"));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy(new Error("Remote image exceeds the allowed size"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.setTimeout(15_000, () => request.destroy(new Error("Remote image request timed out")));
    request.on("error", reject);
    request.end();
  });
}

export async function postSafeExternalForm(url: URL, body: URLSearchParams): Promise<unknown> {
  const { address, family } = await resolveSafeExternalHttpsUrl(url.toString());
  const payload = body.toString();

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: "https:",
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      servername: url.hostname,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
      },
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`WhatsApp provider returned HTTP ${response.statusCode ?? 0}`));
          return;
        }
        try {
          resolve(JSON.parse(responseBody));
        } catch {
          reject(new Error("WhatsApp provider returned an invalid JSON response"));
        }
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error("WhatsApp provider request timed out")));
    request.on("error", reject);
    request.end(payload);
  });
}
