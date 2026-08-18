export type ActivationDelivery = "email" | "sms" | "both";

export function validateActivationDelivery(
  delivery: ActivationDelivery,
  account: { email?: string | null; phone?: string | null },
): string | null {
  if ((delivery === "email" || delivery === "both") && !account.email) {
    return "لا يوجد بريد إلكتروني لإرسال التفعيل";
  }
  if ((delivery === "sms" || delivery === "both") && !account.phone) {
    return "لا يوجد رقم هاتف لإرسال رسالة SMS";
  }
  return null;
}

export function getActivationCodeDisplay(input: {
  verified: boolean | null | undefined;
  code: string | null | undefined;
  expires: Date | string | null | undefined;
  now?: Date;
}): { code: string | null; state: "active" | "expired" | "missing" | "verified" } {
  if (input.verified) return { code: null, state: "verified" };
  if (!input.code) return { code: null, state: "missing" };
  const expiresAt = input.expires ? new Date(input.expires) : null;
  if (expiresAt && expiresAt.getTime() <= (input.now ?? new Date()).getTime()) {
    return { code: input.code, state: "expired" };
  }
  return { code: input.code, state: "active" };
}
