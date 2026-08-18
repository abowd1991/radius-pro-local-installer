/** سياسة بادئة اسم المستخدم لكروت SMS المتوافقة مع مولد الكروت V2 الرقمي. */
export const SMS_CARD_PREFIX_PATTERN = /^\d{1,3}$/;

export function isValidSmsCardPrefix(value: string | null | undefined): value is string {
  return typeof value === "string" && SMS_CARD_PREFIX_PATTERN.test(value.trim());
}

export function normalizeSmsCardPrefix(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  if (!SMS_CARD_PREFIX_PATTERN.test(normalized)) {
    throw new RangeError("يجب إدخال بادئة رقمية من 1 إلى 3 خانات لإنشاء كروت SMS");
  }
  return normalized;
}
