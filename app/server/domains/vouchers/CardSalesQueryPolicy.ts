export type SalesPreset = "hour" | "today" | "yesterday" | "last7" | "thisWeek" | "last30" | "thisMonth" | "lastMonth" | "custom";
export type SalesGranularity = "hour" | "day" | "week" | "month";

export interface SalesDateRange {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

export function resolveSalesDateRange(preset: SalesPreset, customStart?: string, customEnd?: string, now = new Date(), timezone = DEFAULT_SYSTEM_TIMEZONE): SalesDateRange {
  return resolveZonedRange(preset, timezone, customStart, customEnd, now);
}

export function resolveGranularity(preset: SalesPreset, requested?: SalesGranularity): SalesGranularity {
  if (requested) return requested;
  if (preset === "hour" || preset === "today" || preset === "yesterday") return "hour";
  return "day";
}
import { DEFAULT_SYSTEM_TIMEZONE, resolveZonedRange } from "../../core/TimezoneService";
