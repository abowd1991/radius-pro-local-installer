export const DEFAULT_SYSTEM_TIMEZONE = "Asia/Gaza";

export const SUPPORTED_TIMEZONES = [
  { value: "Asia/Gaza", labelAr: "فلسطين", labelEn: "Palestine" },
  { value: "Africa/Cairo", labelAr: "مصر", labelEn: "Egypt" },
  { value: "Asia/Aden", labelAr: "اليمن", labelEn: "Yemen" },
  { value: "UTC", labelAr: "التوقيت العالمي UTC", labelEn: "Coordinated Universal Time (UTC)" },
] as const;

export type SupportedTimezone = (typeof SUPPORTED_TIMEZONES)[number]["value"];
export type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
export type TimeRange = { start: Date; end: Date; previousStart: Date; previousEnd: Date };
export type TimePreset = "hour" | "today" | "yesterday" | "last7" | "thisWeek" | "last30" | "thisMonth" | "lastMonth" | "custom";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string) {
  assertTimezone(timezone);
  const existing = formatterCache.get(timezone);
  if (existing) return existing;
  const value = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timezone, value);
  return value;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function assertTimezone(timezone: string): void {
  if (!isValidTimezone(timezone)) throw new Error(`منطقة زمنية غير مدعومة: ${timezone}`);
}

/** يعيد الأجزاء الميلادية المحلية للحظة UTC محددة. */
export function getZonedParts(instant: Date, timezone: string): DateParts {
  const map: Record<string, string> = {};
  for (const part of formatter(timezone).formatToParts(instant)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    hour: Number(map.hour), minute: Number(map.minute), second: Number(map.second),
  };
}

/** يحول تاريخاً/ساعةً اختارها المستخدم في منطقته إلى لحظة UTC. يرمي خطأً في وقت DST غير الموجود. */
export function zonedDateTimeToUtc(parts: DateParts, timezone: string): Date {
  assertTimezone(timezone);
  const wanted = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let candidate = new Date(wanted);
  for (let attempt = 0; attempt < 4; attempt++) {
    const observed = getZonedParts(candidate, timezone);
    const observedStamp = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const difference = wanted - observedStamp;
    if (difference === 0) return candidate;
    candidate = new Date(candidate.getTime() + difference);
  }
  throw new Error("الوقت المحلي غير صالح في المنطقة الزمنية المختارة");
}

/** يحول datetime-local بلا offset من Timezone المالك إلى UTC، أو يقبل ISO صريحاً. */
export function parseZonedDateTimeInput(value: string, timezone: string): Date {
  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (local) {
    return zonedDateTimeToUtc({
      year: Number(local[1]), month: Number(local[2]), day: Number(local[3]),
      hour: Number(local[4]), minute: Number(local[5]), second: Number(local[6] ?? 0),
    }, timezone);
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error("تاريخ الانتهاء غير صالح");
  return instant;
}

/** يصيغ لحظة UTC بصيغة MySQL DATETIME في المنطقة المعطاة؛ يستخدم فقط لجداول DATETIME التاريخية. */
export function formatDateTimeInTimezone(instant: Date, timezone: string): string {
  const parts = getZonedParts(instant, timezone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function calendarDateAtNoon(parts: Pick<DateParts, "year" | "month" | "day">, dayOffset = 0) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, 12, 0, 0));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function startOfZonedDay(instant: Date, timezone: string): Date {
  const parts = getZonedParts(instant, timezone);
  return zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, timezone);
}

export function endOfZonedDay(instant: Date, timezone: string): Date {
  const parts = getZonedParts(instant, timezone);
  const next = calendarDateAtNoon(parts, 1);
  return new Date(zonedDateTimeToUtc({ ...next, hour: 0, minute: 0, second: 0 }, timezone).getTime() - 1);
}

function startOfZonedMonth(instant: Date, timezone: string): Date {
  const parts = getZonedParts(instant, timezone);
  return zonedDateTimeToUtc({ year: parts.year, month: parts.month, day: 1, hour: 0, minute: 0, second: 0 }, timezone);
}

function parseDateOnly(value: string): Pick<DateParts, "year" | "month" | "day"> | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const valid = new Date(Date.UTC(year, month - 1, day));
  return valid.getUTCFullYear() === year && valid.getUTCMonth() === month - 1 && valid.getUTCDate() === day ? { year, month, day } : null;
}

/** نطاق تقارير UTC مع حدود اليوم/الأسبوع/الشهر في Timezone المختارة. */
export function resolveZonedRange(preset: TimePreset, timezone: string, customStart?: string, customEnd?: string, now = new Date()): TimeRange {
  assertTimezone(timezone);
  const startToday = startOfZonedDay(now, timezone);
  let start: Date;
  let end: Date;
  if (preset === "hour") { start = new Date(now.getTime() - 60 * 60 * 1000); end = now; }
  else if (preset === "today") { start = startToday; end = now; }
  else if (preset === "yesterday") {
    const local = getZonedParts(now, timezone);
    const prior = calendarDateAtNoon(local, -1);
    start = zonedDateTimeToUtc({ ...prior, hour: 0, minute: 0, second: 0 }, timezone);
    end = new Date(startToday.getTime() - 1);
  } else if (preset === "last7") { start = new Date(now.getTime() - 7 * 86_400_000); end = now; }
  else if (preset === "last30") { start = new Date(now.getTime() - 30 * 86_400_000); end = now; }
  else if (preset === "thisWeek") {
    const local = getZonedParts(now, timezone);
    const sundayOffset = new Date(Date.UTC(local.year, local.month - 1, local.day, 12)).getUTCDay();
    const weekStart = calendarDateAtNoon(local, -sundayOffset);
    start = zonedDateTimeToUtc({ ...weekStart, hour: 0, minute: 0, second: 0 }, timezone);
    end = now;
  } else if (preset === "thisMonth") { start = startOfZonedMonth(now, timezone); end = now; }
  else if (preset === "lastMonth") {
    const local = getZonedParts(now, timezone);
    const currentMonth = zonedDateTimeToUtc({ year: local.year, month: local.month, day: 1, hour: 0, minute: 0, second: 0 }, timezone);
    const priorMonthDate = calendarDateAtNoon({ year: local.year, month: local.month, day: 1 }, -1);
    start = zonedDateTimeToUtc({ year: priorMonthDate.year, month: priorMonthDate.month, day: 1, hour: 0, minute: 0, second: 0 }, timezone);
    end = new Date(currentMonth.getTime() - 1);
  } else {
    const localStart = customStart ? parseDateOnly(customStart) : null;
    const localEnd = customEnd ? parseDateOnly(customEnd) : null;
    if (!localStart || !localEnd) throw new Error("نطاق التاريخ غير صالح");
    start = zonedDateTimeToUtc({ ...localStart, hour: 0, minute: 0, second: 0 }, timezone);
    const endStart = zonedDateTimeToUtc({ ...localEnd, hour: 0, minute: 0, second: 0 }, timezone);
    end = new Date(endOfZonedDay(endStart, timezone).getTime());
    if (start > end) throw new Error("نطاق التاريخ غير صالح");
  }
  const duration = end.getTime() - start.getTime();
  return { start, end, previousStart: new Date(start.getTime() - duration), previousEnd: new Date(start) };
}

export function formatZonedDate(instant: Date | string, timezone: string, locale = "ar-PS"): string {
  const value = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat(locale, { timeZone: timezone, calendar: "gregory", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}
