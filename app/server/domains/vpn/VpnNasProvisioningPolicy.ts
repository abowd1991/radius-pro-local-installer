export type ManagedVpnProtocol = 'vpn_l2tp' | 'vpn_pptp' | 'vpn_sstp';

export function isManagedVpnProtocol(connectionType: string | null | undefined): connectionType is ManagedVpnProtocol {
  return connectionType === 'vpn_l2tp' || connectionType === 'vpn_pptp' || connectionType === 'vpn_sstp';
}

export interface ProtocolIpRange {
  protocol: ManagedVpnProtocol;
  start: string;
  end: string;
  gateway: string;
}

export const MANAGED_VPN_IP_RANGES: Record<ManagedVpnProtocol, ProtocolIpRange> = {
  vpn_l2tp: { protocol: 'vpn_l2tp', start: '192.168.30.10', end: '192.168.30.99', gateway: '192.168.30.1' },
  // Must match pptpd.conf remoteip 192.168.32.10-245 on the VPS.
  vpn_pptp: { protocol: 'vpn_pptp', start: '192.168.32.10', end: '192.168.32.245', gateway: '192.168.32.1' },
  vpn_sstp: { protocol: 'vpn_sstp', start: '192.168.31.10', end: '192.168.31.99', gateway: '192.168.31.1' },
};

export function ipToNumber(ip: string): number {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

export function numberToIp(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

export function isIpInProtocolRange(protocol: ManagedVpnProtocol, ip: string): boolean {
  const range = MANAGED_VPN_IP_RANGES[protocol];
  const value = ipToNumber(ip);
  return value >= ipToNumber(range.start) && value <= ipToNumber(range.end);
}

export function findFirstAvailableProtocolIp(protocol: ManagedVpnProtocol, occupiedIps: Iterable<string>): string | null {
  const occupied = new Set(occupiedIps);
  const range = MANAGED_VPN_IP_RANGES[protocol];
  for (let value = ipToNumber(range.start); value <= ipToNumber(range.end); value += 1) {
    const candidate = numberToIp(value);
    if (!occupied.has(candidate)) return candidate;
  }
  return null;
}
