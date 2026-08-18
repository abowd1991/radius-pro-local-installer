/** خصائص RADIUS المشتركة التي تنتج من إعدادات الشبكة في الخطة. */

export const BYTES_PER_GIB = 1024 ** 3;

export type PlanNetworkReplyAttribute = {
  attribute: "Mikrotik-Total-Limit" | "Framed-Pool";
  op: ":=" | "=";
  value: string;
};

export function gigabytesToBytes(gigabytes: number | null | undefined): number | null {
  if (gigabytes === null || gigabytes === undefined || gigabytes === 0) return null;
  if (!Number.isFinite(gigabytes) || gigabytes < 0) {
    throw new RangeError("Data limit must be a non-negative number of GiB");
  }
  return Math.round(gigabytes * BYTES_PER_GIB);
}

export function bytesToGigabytes(bytes: number | null | undefined): number | null {
  if (bytes === null || bytes === undefined || bytes === 0) return null;
  return bytes / BYTES_PER_GIB;
}

export function normalizeMikrotikAddressPool(pool: string | null | undefined): string | null {
  const normalized = pool?.trim();
  return normalized ? normalized : null;
}

export function buildPlanNetworkReplyAttributes(input: {
  dataLimitBytes?: number | null;
  mikrotikAddressPool?: string | null;
}): PlanNetworkReplyAttribute[] {
  const attributes: PlanNetworkReplyAttribute[] = [];
  const pool = normalizeMikrotikAddressPool(input.mikrotikAddressPool);

  if (pool) {
    attributes.push({ attribute: "Framed-Pool", op: "=", value: pool });
  }

  if (input.dataLimitBytes && input.dataLimitBytes > 0) {
    attributes.push({
      attribute: "Mikrotik-Total-Limit",
      op: ":=",
      value: String(input.dataLimitBytes),
    });
  }

  return attributes;
}
