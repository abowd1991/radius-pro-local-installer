import { and, asc, count, countDistinct, desc, gte, inArray, lte, sql, sum } from "drizzle-orm";
import { getDb } from "../../db";
import { nasDevices, onlineSessions, radacct } from "../../../drizzle/schema";
import { getZonedParts } from "../../core/TimezoneService";

export type BandwidthSortBy = "totalData" | "totalDownload" | "totalUpload" | "sessionCount" | "totalTime";

export interface BandwidthReportInput {
  ownerId: number;
  startDate: Date;
  endDate: Date;
  timezone: string;
  sortBy: BandwidthSortBy;
  sortOrder: "asc" | "desc";
}

export type BandwidthTimelineGranularity = "hour" | "day";

export interface BandwidthTimelinePoint {
  bucketStart: string;
  key: string;
  label: string;
  tooltipLabel: string;
  totalDownload: number;
  totalUpload: number;
  totalData: number;
  sessionCount: number;
}

type BandwidthTimelineRow = {
  bucketStart: string | Date | null;
  totalDownload: number | string | null;
  totalUpload: number | string | null;
  sessionCount: number | string | null;
};

const pad = (value: number) => String(value).padStart(2, "0");

export function resolveBandwidthTimelineGranularity(startDate: Date, endDate: Date): BandwidthTimelineGranularity {
  return endDate.getTime() - startDate.getTime() < 48 * 60 * 60 * 1000 ? "hour" : "day";
}

function parseUtcBucket(value: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTimelineMetadata(instant: Date, timezone: string, granularity: BandwidthTimelineGranularity) {
  const local = getZonedParts(instant, timezone);
  const date = `${local.year}-${pad(local.month)}-${pad(local.day)}`;
  const time = `${pad(local.hour)}:00`;
  const key = granularity === "hour" ? `${date}T${time}` : date;
  return {
    key,
    label: granularity === "hour" ? time : `${pad(local.day)}/${pad(local.month)}`,
    tooltipLabel: granularity === "hour"
      ? `${pad(local.day)}/${pad(local.month)}/${local.year}، ${time}`
      : `${pad(local.day)}/${pad(local.month)}/${local.year}`,
  };
}

/**
 * تُجمع الصفوف بعد تجميع SQL لكل ساعة UTC. ثم تُسند إلى ساعة/يوم المالك هنا
 * للحفاظ على Timezone V6 وDST من دون تحميل كل سجلات radacct الخام.
 */
export function buildBandwidthTimeline(input: {
  rows: BandwidthTimelineRow[];
  startDate: Date;
  endDate: Date;
  timezone: string;
  granularity?: BandwidthTimelineGranularity;
}): { granularity: BandwidthTimelineGranularity; points: BandwidthTimelinePoint[] } {
  const granularity = input.granularity ?? resolveBandwidthTimelineGranularity(input.startDate, input.endDate);
  const points = new Map<string, BandwidthTimelinePoint>();

  const ensurePoint = (instant: Date) => {
    const metadata = getTimelineMetadata(instant, input.timezone, granularity);
    const existing = points.get(metadata.key);
    if (existing) return existing;
    const point: BandwidthTimelinePoint = {
      bucketStart: instant.toISOString(),
      ...metadata,
      totalDownload: 0,
      totalUpload: 0,
      totalData: 0,
      sessionCount: 0,
    };
    points.set(metadata.key, point);
    return point;
  };

  const rangeStart = new Date(input.startDate);
  const rangeEnd = new Date(input.endDate);
  rangeStart.setUTCMinutes(0, 0, 0);
  rangeEnd.setUTCMinutes(0, 0, 0);
  for (let cursor = rangeStart.getTime(); cursor <= rangeEnd.getTime(); cursor += 60 * 60 * 1000) {
    ensurePoint(new Date(cursor));
  }

  for (const row of input.rows) {
    const instant = parseUtcBucket(row.bucketStart);
    if (!instant) continue;
    const point = ensurePoint(instant);
    const download = Number(row.totalDownload) || 0;
    const upload = Number(row.totalUpload) || 0;
    point.totalDownload += download;
    point.totalUpload += upload;
    point.totalData += download + upload;
    point.sessionCount += Number(row.sessionCount) || 0;
  }

  return {
    granularity,
    points: Array.from(points.values()).sort((left, right) => left.bucketStart.localeCompare(right.bucketStart)),
  };
}

const emptyBandwidthReport = (startDate: Date, endDate: Date, timezone: string) => ({
  userUsage: [],
  nasUsage: [],
  stats: { totalDownload: 0, totalUpload: 0, totalData: 0, activeUsers: 0 },
  timeline: buildBandwidthTimeline({ rows: [], startDate, endDate, timezone }),
});

/**
 * V2 rule: radacct is historical usage only; online_sessions is the only
 * source used for the current active-user count.
 */
export async function getBandwidthReport(input: BandwidthReportInput) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const ownerNas = await db
    .select({ id: nasDevices.id, nasname: nasDevices.nasname, shortname: nasDevices.shortname })
    .from(nasDevices)
    .where(sql`${nasDevices.ownerId} = ${input.ownerId}`);

  if (ownerNas.length === 0) return emptyBandwidthReport(input.startDate, input.endDate, input.timezone);

  const nasNames = ownerNas.map((nas: { nasname: string }) => nas.nasname);
  const nasIds = ownerNas.map((nas: { id: number }) => nas.id);
  const nasNameMap = new Map(ownerNas.map((nas: { nasname: string; shortname: string | null }) => [nas.nasname, nas.shortname]));
  const historicalWhere = and(
    inArray(radacct.nasipaddress, nasNames),
    gte(radacct.acctstarttime, input.startDate),
    lte(radacct.acctstarttime, input.endDate),
  );

  const totalDownload = sum(radacct.acctoutputoctets);
  const totalUpload = sum(radacct.acctinputoctets);
  const totalData = sql<number>`COALESCE(${totalDownload}, 0) + COALESCE(${totalUpload}, 0)`;
  const totalSessionTime = sum(radacct.acctsessiontime);
  const utcHourBucket = sql<string>`DATE_FORMAT(${radacct.acctstarttime}, '%Y-%m-%d %H:00:00')`;
  const sortExpression = {
    totalData,
    totalDownload,
    totalUpload,
    sessionCount: count(),
    totalTime: totalSessionTime,
  }[input.sortBy];
  const order = input.sortOrder === "asc" ? asc(sortExpression) : desc(sortExpression);

  const [userUsage, nasUsage, statsResult, activeResult, timelineRows] = await Promise.all([
    db.select({
      username: radacct.username,
      totalDownload,
      totalUpload,
      sessionCount: count(),
      totalTime: totalSessionTime,
    })
      .from(radacct)
      .where(historicalWhere)
      .groupBy(radacct.username)
      .orderBy(order)
      .limit(100),
    db.select({
      nasipaddress: radacct.nasipaddress,
      totalDownload,
      totalUpload,
      userCount: countDistinct(radacct.username),
      sessionCount: count(),
    })
      .from(radacct)
      .where(historicalWhere)
      .groupBy(radacct.nasipaddress)
      .orderBy(order),
    db.select({ totalDownload, totalUpload })
      .from(radacct)
      .where(historicalWhere),
    db.select({ activeUsers: countDistinct(onlineSessions.username) })
      .from(onlineSessions)
      .where(inArray(onlineSessions.nasId, nasIds)),
    db.select({
      bucketStart: utcHourBucket,
      totalDownload,
      totalUpload,
      sessionCount: count(),
    })
      .from(radacct)
      .where(historicalWhere)
      .groupBy(utcHourBucket)
      .orderBy(asc(utcHourBucket)),
  ]);

  const stats = statsResult[0] ?? { totalDownload: 0, totalUpload: 0 };
  const download = Number(stats.totalDownload) || 0;
  const upload = Number(stats.totalUpload) || 0;

  return {
    userUsage: userUsage.map((row: any) => {
      const rowDownload = Number(row.totalDownload) || 0;
      const rowUpload = Number(row.totalUpload) || 0;
      return {
        username: row.username,
        totalDownload: rowDownload,
        totalUpload: rowUpload,
        totalData: rowDownload + rowUpload,
        sessionCount: Number(row.sessionCount) || 0,
        totalTime: Number(row.totalTime) || 0,
      };
    }),
    nasUsage: nasUsage.map((row: any) => {
      const rowDownload = Number(row.totalDownload) || 0;
      const rowUpload = Number(row.totalUpload) || 0;
      return {
        nasipaddress: row.nasipaddress,
        nasShortname: nasNameMap.get(row.nasipaddress) || null,
        totalDownload: rowDownload,
        totalUpload: rowUpload,
        totalData: rowDownload + rowUpload,
        userCount: Number(row.userCount) || 0,
        sessionCount: Number(row.sessionCount) || 0,
      };
    }),
    stats: {
      totalDownload: download,
      totalUpload: upload,
      totalData: download + upload,
      activeUsers: Number(activeResult[0]?.activeUsers) || 0,
    },
    timeline: buildBandwidthTimeline({
      rows: timelineRows as BandwidthTimelineRow[],
      startDate: input.startDate,
      endDate: input.endDate,
      timezone: input.timezone,
    }),
  };
}
