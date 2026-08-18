function isIpv4(value: string): boolean {
  const octets = value.split(".");
  return octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255);
}

/** Returns a host only, never a scheme/path/port, so it is safe to render in a forwarding URL. */
export function normalizePortForwardingPublicHost(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const withoutScheme = raw.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0].replace(/:\d+$/, "").toLowerCase();
  if (isIpv4(withoutScheme)) return withoutScheme;
  if (withoutScheme.length > 253) return null;
  const labels = withoutScheme.split(".");
  if (labels.length < 2 || !labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return null;
  return withoutScheme;
}
