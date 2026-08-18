/**
 * PortForwardingPolicy — validation boundary for external TCP exposure.
 * A forwarding never receives a raw destination address from a browser; the
 * target is resolved from an owned Network Monitor record by the Engine.
 */

export const EXTERNAL_PORT_RANGE = { start: 47000, end: 59999 } as const;
export const INGRESS_PORT_RANGE = { start: 20000, end: 39999 } as const;
export type PortForwardingAccessMode = "restricted" | "public";

function toOctets(value: string): number[] | null {
  const parts = value.trim().split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  return octets.every((part) => part >= 0 && part <= 255) ? octets : null;
}

export function isIpv4Cidr(value: string): boolean {
  const [address, prefix] = value.trim().split("/");
  const prefixNumber = Number(prefix);
  return Boolean(toOctets(address)) && Number.isInteger(prefixNumber) && prefixNumber >= 8 && prefixNumber <= 30;
}

export function isCanonicalIpv4Cidr(value: string): boolean {
  if (!isIpv4Cidr(value)) return false;
  const [address, prefixText] = value.trim().split("/");
  const prefix = Number(prefixText);
  const octets = toOctets(address);
  if (!octets) return false;
  const addressValue = octets.reduce((result, octet) => (result << 8) + octet, 0) >>> 0;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return ((addressValue & mask) >>> 0) === addressValue;
}

export function isIpWithinCidr(ip: string, cidr: string): boolean {
  if (!isIpv4Cidr(cidr)) return false;
  const [network, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  const ipOctets = toOctets(ip);
  const networkOctets = toOctets(network);
  if (!ipOctets || !networkOctets) return false;
  const ipValue = ipOctets.reduce((value, octet) => (value << 8) + octet, 0) >>> 0;
  const networkValue = networkOctets.reduce((value, octet) => (value << 8) + octet, 0) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipValue & mask) === (networkValue & mask);
}

export function cidrsOverlap(first: string, second: string): boolean {
  if (!isCanonicalIpv4Cidr(first) || !isCanonicalIpv4Cidr(second)) return false;
  const [firstNetwork] = first.split("/");
  const [secondNetwork] = second.split("/");
  return isIpWithinCidr(firstNetwork, second) || isIpWithinCidr(secondNetwork, first);
}

export function isSafePrivateLanTarget(ip: string): boolean {
  const octets = toOctets(ip);
  if (!octets) return false;
  const [a, b] = octets;
  const privateLan = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  if (!privateLan) return false;
  // VPN transport ranges must never be exposed as internal devices.
  if (a === 192 && b === 168 && (octets[2] === 30 || octets[2] === 31)) return false;
  return true;
}

export function normalizeTrustedCidrs(values: string[], accessMode: PortForwardingAccessMode = "restricted"): string[] {
  if (accessMode === "public") return [];
  const unique = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (unique.length === 0) throw new Error("يجب تحديد مصدر وصول موثوق واحد على الأقل");
  if (unique.length > 10) throw new Error("الحد الأقصى هو 10 مصادر وصول موثوقة لكل توجيه");
  for (const value of unique) {
    const match = value.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/);
    if (!match || !toOctets(match[1])) throw new Error(`CIDR غير صالح: ${value}`);
    if (value === "0.0.0.0/0") throw new Error("لا يُسمح بفتح التوجيه للعامة");
  }
  return unique;
}

export function assertForwardTarget(input: { targetIp: string; targetPort: number; externalPort?: number; ingressPort?: number }) {
  if (!isSafePrivateLanTarget(input.targetIp)) {
    throw new Error("عنوان الجهاز يجب أن يكون عنوان LAN خاصاً آمناً وليس عنوان VPS أو نفق VPN أو localhost");
  }
  if (!Number.isInteger(input.targetPort) || input.targetPort < 1 || input.targetPort > 65535) {
    throw new Error("منفذ الجهاز الداخلي غير صالح");
  }
  if (input.externalPort !== undefined && (input.externalPort < EXTERNAL_PORT_RANGE.start || input.externalPort > EXTERNAL_PORT_RANGE.end)) {
    throw new Error("المنفذ الخارجي خارج النطاق الآمن المخصص للتوجيهات");
  }
  if (input.ingressPort !== undefined && (input.ingressPort < INGRESS_PORT_RANGE.start || input.ingressPort > INGRESS_PORT_RANGE.end)) {
    throw new Error("منفذ الدخول الداخلي خارج النطاق المخصص للتوجيهات");
  }
}
