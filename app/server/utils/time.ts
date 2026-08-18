/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TIME UTILITY — Radius Pro
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all time/date operations in the project.
 *
 * POLICY:
 *   • Dates are stored in DB as UTC via Drizzle/MySQL driver
 *   • Report and display timezone is supplied by owner/network context
 *
 * FORBIDDEN:
 *   ❌ +02:00 / +03:00 hardcoded offsets
 *   ❌ new Date().toLocaleString() without timeZone option
 *   ❌ Date → string → Date double-conversion
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import duration from 'dayjs/plugin/duration';
import { DEFAULT_SYSTEM_TIMEZONE } from '../core/TimezoneService';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);

/** Legacy export retained for compatibility; new code must pass owner/NAS timezone explicitly. */
export const PALESTINE_TZ = DEFAULT_SYSTEM_TIMEZONE;

/** Current time as a dayjs object in Palestine timezone */
export const nowPalestine = (timezone = DEFAULT_SYSTEM_TIMEZONE) => dayjs().tz(timezone);

/** Current time as a native JS Date (UTC internally, but represents Palestine "now") */
export const nowDate = () => new Date();

/**
 * Format a date/string/number for display in Palestine timezone.
 * Returns: DD/MM/YYYY HH:mm  (24h, Gregorian)
 */
export function formatDate(date: Date | string | number | null | undefined, timezone = DEFAULT_SYSTEM_TIMEZONE): string {
  if (!date) return '—';
  return dayjs(date).tz(timezone).format('DD/MM/YYYY HH:mm');
}

/**
 * Format date only (no time) in Palestine timezone.
 * Returns: DD/MM/YYYY
 */
export function formatDateOnly(date: Date | string | number | null | undefined, timezone = DEFAULT_SYSTEM_TIMEZONE): string {
  if (!date) return '—';
  return dayjs(date).tz(timezone).format('DD/MM/YYYY');
}

/**
 * Format time only in Palestine timezone.
 * Returns: HH:mm:ss
 */
export function formatTimeOnly(date: Date | string | number | null | undefined, timezone = DEFAULT_SYSTEM_TIMEZONE): string {
  if (!date) return '—';
  return dayjs(date).tz(timezone).format('HH:mm:ss');
}

/**
 * Format for Arabic locale display — used in SMS, reports, notifications.
 * Returns Arabic-formatted date string in Palestine timezone.
 */
export function formatArabic(date: Date | string | number | null | undefined, timezone = DEFAULT_SYSTEM_TIMEZONE): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ar-PS', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(date));
}

/**
 * Get current Palestine time as a native Date object.
 * Use this instead of: new Date(new Date().toLocaleString('en-US', { timeZone: ... }))
 */
export function getPalestineNow(timezone = DEFAULT_SYSTEM_TIMEZONE): Date {
  return dayjs().tz(timezone).toDate();
}

/**
 * Convert any date to Palestine timezone dayjs object.
 */
export function toPalestine(date: Date | string | number, timezone = DEFAULT_SYSTEM_TIMEZONE): dayjs.Dayjs {
  return dayjs(date).tz(timezone);
}

/**
 * Add time to a date and return as Date.
 * @param base - base date
 * @param amount - amount to add
 * @param unit - 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month'
 */
export function addTime(
  base: Date | string | number,
  amount: number,
  unit: dayjs.ManipulateType,
  timezone = DEFAULT_SYSTEM_TIMEZONE,
): Date {
  return dayjs(base).tz(timezone).add(amount, unit).toDate();
}

/**
 * Check if a date is in the past (expired).
 */
export function isExpired(date: Date | string | number | null | undefined): boolean {
  if (!date) return false;
  return dayjs(date).isBefore(dayjs());
}

/**
 * Get start of today in Palestine timezone as Date.
 */
export function startOfTodayPalestine(timezone = DEFAULT_SYSTEM_TIMEZONE): Date {
  return dayjs().tz(timezone).startOf('day').toDate();
}

/**
 * Get end of today in Palestine timezone as Date.
 */
export function endOfTodayPalestine(timezone = DEFAULT_SYSTEM_TIMEZONE): Date {
  return dayjs().tz(timezone).endOf('day').toDate();
}

/**
 * Format duration in seconds to human-readable Arabic string.
 * e.g. 3661 → "1 ساعة 1 دقيقة 1 ثانية"
 */
export function formatDurationAr(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ساعة`);
  if (m > 0) parts.push(`${m} دقيقة`);
  if (s > 0 || parts.length === 0) parts.push(`${s} ثانية`);
  return parts.join(' ');
}

export { dayjs };
