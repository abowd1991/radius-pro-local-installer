// Supported currencies for the RADIUS SaaS platform
// Prices are stored in the user's selected currency (NOT converted from USD)

export type CurrencyCode = "USD" | "ILS" | "JOD" | "SAR" | "AED" | "EGP" | "YER";

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  name: string;
  nameAr: string;
  dir?: "ltr" | "rtl"; // text direction for symbol placement
}

export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$",   name: "US Dollar",       nameAr: "دولار أمريكي",   dir: "ltr" },
  { code: "ILS", symbol: "₪",   name: "Israeli Shekel",  nameAr: "شيكل إسرائيلي", dir: "ltr" },
  { code: "JOD", symbol: "د.أ", name: "Jordanian Dinar", nameAr: "دينار أردني",    dir: "rtl" },
  { code: "SAR", symbol: "﷼",   name: "Saudi Riyal",     nameAr: "ريال سعودي",     dir: "rtl" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham",      nameAr: "درهم إماراتي",   dir: "rtl" },
  { code: "EGP", symbol: "ج.م", name: "Egyptian Pound",  nameAr: "جنيه مصري",      dir: "rtl" },
  { code: "YER", symbol: "﷼",   name: "Yemeni Rial",     nameAr: "ريال يمني",      dir: "rtl" },
];

export const CURRENCY_MAP: Record<CurrencyCode, Currency> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c])
) as Record<CurrencyCode, Currency>;

/**
 * Format a price with its currency symbol
 * e.g. formatPrice(2, "ILS") => "₪2.00"
 */
export function formatPrice(amount: number | string | null | undefined, currency: CurrencyCode | string = "USD"): string {
  const num = parseFloat(String(amount ?? 0));
  if (isNaN(num)) return "0.00";
  const cur = CURRENCY_MAP[currency as CurrencyCode];
  const symbol = cur?.symbol ?? currency;
  const dir = cur?.dir ?? "ltr";
  const formatted = num.toFixed(2);
  return dir === "rtl" ? `${formatted} ${symbol}` : `${symbol}${formatted}`;
}

/**
 * Get currency symbol by code
 */
export function getCurrencySymbol(currency: CurrencyCode | string = "USD"): string {
  return CURRENCY_MAP[currency as CurrencyCode]?.symbol ?? currency;
}
