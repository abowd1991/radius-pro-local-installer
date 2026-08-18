/**
 * Timezone V6 frontend contract.
 *
 * Instants are always UTC. This module is the only bridge between those
 * instants and owner/network-local text or `<input type="datetime-local">`.
 */

export const FALLBACK_TIMEZONE = "UTC";

let activeTimezone = FALLBACK_TIMEZONE;

type DateLike = Date | string | number | null | undefined;
type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const pad = (value: number) => String(value).padStart(2, "0");

export function assertTimeZone(timeZone: string): string {
  try {
    Intl.DateTimeFormat("en-GB", { timeZone }).format();
    return timeZone;
  } catch {
    throw new Error(`Unsupported IANA timezone: ${timeZone}`);
  }
}

export function setActiveTimezone(timeZone: string | null | undefined): void {
  activeTimezone = timeZone ? assertTimeZone(timeZone) : FALLBACK_TIMEZONE;
}

export function getActiveTimezone(): string {
  return activeTimezone;
}

export function resolveTimezone(timeZone?: string | null): string {
  return timeZone ? assertTimeZone(timeZone) : getActiveTimezone();
}

/** Parse a stored UTC value. Naive strings are treated as UTC, never browser-local time. */
export function parseUtcDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = String(value).trim();
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(text)
    ? text
    : `${text.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getZonedParts(value: DateLike, timeZone?: string | null): DateParts | null {
  const date = parseUtcDate(value);
  if (!date) return null;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: resolveTimezone(timeZone),
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

export function formatDate(value: DateLike, timeZone?: string | null): string {
  const parts = getZonedParts(value, timeZone);
  return parts ? `${pad(parts.day)}/${pad(parts.month)}/${parts.year}` : "-";
}

export function formatTime(value: DateLike, timeZone?: string | null, includeSeconds = false): string {
  const parts = getZonedParts(value, timeZone);
  if (!parts) return "-";
  return includeSeconds ? `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}` : `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatDateTime(value: DateLike, timeZone?: string | null): string {
  const date = formatDate(value, timeZone);
  return date === "-" ? date : `${date}، ${formatTime(value, timeZone)}`;
}

export function formatDateWithWeekday(value: DateLike, language = "ar", timeZone?: string | null): string {
  const date = parseUtcDate(value);
  if (!date) return "-";
  const formatted = new Intl.DateTimeFormat(language === "ar" ? "ar" : "en-GB", {
    timeZone: resolveTimezone(timeZone),
    calendar: "gregory",
    weekday: "long",
  }).format(date);
  return `${formatted} ${formatDate(date, timeZone)}`;
}

export function formatDateShort(value: DateLike, timeZone?: string | null): string {
  const parts = getZonedParts(value, timeZone);
  if (!parts) return "-";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parts.day} ${months[parts.month - 1]} ${parts.year}`;
}

export function formatDateCompact(value: DateLike, timeZone?: string | null): string {
  const parts = getZonedParts(value, timeZone);
  return parts ? `${pad(parts.day)}/${pad(parts.month)}` : "-";
}

/** UTC instant → exact local value required by datetime-local. */
export function formatDateTimeLocal(value: DateLike, timeZone?: string | null): string {
  const parts = getZonedParts(value, timeZone);
  return parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}` : "";
}

function localParts(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0) };
  const valid = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  return valid.getUTCFullYear() === parts.year && valid.getUTCMonth() + 1 === parts.month && valid.getUTCDate() === parts.day ? parts : null;
}

function zoneOffsetMilliseconds(instant: Date, timeZone: string): number {
  const parts = getZonedParts(instant, timeZone);
  if (!parts) throw new Error("Unable to derive timezone offset");
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant.getTime();
}

/**
 * datetime-local → UTC instant without ever allowing the browser timezone to
 * interpret the value. Returns null for malformed or DST-nonexistent times.
 */
export function parseDateTimeLocal(value: string | null | undefined, timeZone?: string | null): Date | null {
  if (!value) return null;
  const parts = localParts(value);
  if (!parts) return null;
  const zone = resolveTimezone(timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let candidate = new Date(localAsUtc - zoneOffsetMilliseconds(new Date(localAsUtc), zone));
  candidate = new Date(localAsUtc - zoneOffsetMilliseconds(candidate, zone));
  const verified = getZonedParts(candidate, zone);
  if (!verified || verified.year !== parts.year || verified.month !== parts.month || verified.day !== parts.day || verified.hour !== parts.hour || verified.minute !== parts.minute || verified.second !== parts.second) return null;
  return candidate;
}

/** datetime-local → canonical UTC ISO string. Uses parseDateTimeLocal first. */
export function dateTimeLocalToUtcIso(value: string | null | undefined, timeZone?: string | null): string | undefined {
  const instant = parseDateTimeLocal(value, timeZone);
  return instant ? instant.toISOString() : undefined;
}

export function nowDateTimeLocal(timeZone?: string | null, clock: Date = new Date()): string {
  return formatDateTimeLocal(clock, timeZone);
}

export function todayLocalDate(timeZone?: string | null, clock: Date = new Date()): string {
  const parts = getZonedParts(clock, timeZone);
  return parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` : "";
}

export function shiftLocalDate(days: number, timeZone?: string | null, clock: Date = new Date()): string {
  const parts = getZonedParts(clock, timeZone);
  if (!parts) return "";
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export type OwnerRangePreset = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last30Days" | "last90Days";

export function resolveOwnerRange(preset: OwnerRangePreset, timeZone?: string | null, now: Date = new Date()): { start: Date; end: Date } {
  const zone = resolveTimezone(timeZone);
  const local = getZonedParts(now, zone);
  if (!local) throw new Error("Unable to resolve owner timezone range");
  const atLocal = (offset: number, hour: string) => {
    const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    return parseDateTimeLocal(`${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${hour}`, zone)!;
  };
  const startToday = atLocal(0, "00:00");
  if (preset === "today") return { start: startToday, end: now };
  if (preset === "yesterday") return { start: atLocal(-1, "00:00"), end: new Date(startToday.getTime() - 1) };
  if (preset === "last30Days") return { start: new Date(now.getTime() - 30 * 86_400_000), end: now };
  if (preset === "last90Days") return { start: new Date(now.getTime() - 90 * 86_400_000), end: now };
  if (preset === "thisWeek" || preset === "lastWeek") {
    const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day, 12)).getUTCDay();
    const start = atLocal(-weekday - (preset === "lastWeek" ? 7 : 0), "00:00");
    return { start, end: preset === "lastWeek" ? new Date(atLocal(-weekday, "00:00").getTime() - 1) : now };
  }
  const currentMonthStart = parseDateTimeLocal(`${local.year}-${pad(local.month)}-01T00:00`, zone)!;
  if (preset === "thisMonth") return { start: currentMonthStart, end: now };
  const previousMonth = new Date(Date.UTC(local.year, local.month - 2, 1));
  const start = parseDateTimeLocal(`${previousMonth.getUTCFullYear()}-${pad(previousMonth.getUTCMonth() + 1)}-01T00:00`, zone)!;
  return { start, end: new Date(currentMonthStart.getTime() - 1) };
}

export function formatRelative(value: DateLike, now: Date = new Date()): string {
  const date = parseUtcDate(value);
  if (!date) return "—";
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return `منذ ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}

export function isExpired(value: DateLike, now: Date = new Date()): boolean {
  const date = parseUtcDate(value);
  return Boolean(date && date.getTime() < now.getTime());
}
