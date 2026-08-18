export const DEFAULT_PORT_FORWARDING_QUOTA = 10;
export const MIN_PORT_FORWARDING_QUOTA = 1;
export const MAX_PORT_FORWARDING_QUOTA = 1000;

export function assertValidPortForwardingQuota(value: number): void {
  if (!Number.isInteger(value) || value < MIN_PORT_FORWARDING_QUOTA || value > MAX_PORT_FORWARDING_QUOTA) {
    throw new Error(`حصة التوجيه يجب أن تكون رقماً صحيحاً بين ${MIN_PORT_FORWARDING_QUOTA} و${MAX_PORT_FORWARDING_QUOTA}`);
  }
}

export function assertPortForwardingQuotaAvailable(used: number, limit: number): void {
  if (used >= limit) {
    throw new Error(`وصلت إلى الحد المسموح للتوجيهات الخارجية (${used}/${limit})؛ اطلب من المدير زيادة الحصة أو احذف توجيهاً غير مستخدم`);
  }
}

export function assertQuotaCanBeReduced(used: number, nextLimit: number): void {
  assertValidPortForwardingQuota(nextLimit);
  if (nextLimit < used) {
    throw new Error(`لا يمكن خفض الحصة إلى ${nextLimit} لأن العميل يستخدم حالياً ${used} توجيهات`);
  }
}

export function remainingPortForwardingQuota(used: number, limit: number): number {
  return Math.max(0, limit - used);
}
