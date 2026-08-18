import { asc, eq, sql } from "drizzle-orm";
import { plans, radiusCards } from "../../../../drizzle/schema";
import { getDb } from "../../../db";
import {
  resolveGranularity,
  resolveSalesDateRange,
  type SalesGranularity,
  type SalesPreset,
} from "../CardSalesQueryPolicy";
import { DEFAULT_SYSTEM_TIMEZONE, getZonedParts } from "../../../core/TimezoneService";

export interface CardSalesFilters {
  ownerId: number | null;
  timezone?: string;
  preset: SalesPreset;
  customStart?: string;
  customEnd?: string;
  planId?: number;
  currency?: string;
  page?: number;
  pageSize?: number;
  granularity?: SalesGranularity;
}

const asRows = (result: unknown): Record<string, unknown>[] => {
  const rows = result as [Record<string, unknown>[]];
  return Array.isArray(rows[0]) ? rows[0] : (result as Record<string, unknown>[]);
};
const toNumber = (value: unknown) => Number(value ?? 0);
const sqlDate = (value: Date) => value.toISOString().slice(0, 19).replace("T", " ");
const currencyValue = (value: unknown) => String(value ?? "USD");
const asUtcInstant = (value: unknown) => {
  if (value instanceof Date) return value;
  const source = String(value ?? "").trim();
  return new Date(source.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(source) ? source : `${source.replace(" ", "T")}Z`);
};
const padded = (value: number) => String(value).padStart(2, "0");
function bucketForTimezone(instant: Date, timezone: string, granularity: SalesGranularity): string {
  const local = getZonedParts(instant, timezone);
  if (granularity === "hour") return `${local.year}-${padded(local.month)}-${padded(local.day)} ${padded(local.hour)}:00`;
  if (granularity === "month") return `${local.year}-${padded(local.month)}`;
  if (granularity === "week") {
    const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day, 12)).getUTCDay();
    const sunday = new Date(Date.UTC(local.year, local.month - 1, local.day - weekday, 12));
    return `${sunday.getUTCFullYear()}-W${padded(Math.ceil(sunday.getUTCDate() / 7))}-${padded(sunday.getUTCMonth() + 1)}`;
  }
  return `${local.year}-${padded(local.month)}-${padded(local.day)}`;
}

/**
 * مصدر المبيعات هو الكرت المنتهي فقط. كل عملة تأتي من plans.currency ولا يتم
 * جمع إيرادات عملتين مختلفتين في إجمالي أو مخطط واحد.
 */
export class CardSalesRepository {
  async getDashboard(filters: CardSalesFilters) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const timezone = filters.timezone ?? DEFAULT_SYSTEM_TIMEZONE;
    const range = resolveSalesDateRange(filters.preset, filters.customStart, filters.customEnd, new Date(), timezone);
    const granularity = resolveGranularity(filters.preset, filters.granularity);
    const start = sqlDate(range.start);
    const end = sqlDate(range.end);
    const previousStart = sqlDate(range.previousStart);
    const previousEnd = sqlDate(range.previousEnd);
    const ownerClause = filters.ownerId ? sql`AND rc.createdBy = ${filters.ownerId}` : sql``;
    const planClause = filters.planId ? sql`AND rc.planId = ${filters.planId}` : sql``;
    const currencyClause = filters.currency ? sql`AND COALESCE(p.currency, 'USD') = ${filters.currency}` : sql``;
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(50, Math.max(5, filters.pageSize ?? 15));
    const offset = (page - 1) * pageSize;

    const [currencySummaryRaw, chartRaw, plansRaw, recentRaw, planOptions] = await Promise.all([
      db.execute(sql`
        SELECT 'current' AS tag, COALESCE(p.currency, 'USD') AS currency,
          COUNT(*) AS cardsSold,
          COALESCE(SUM(CAST(rc.salePrice AS DECIMAL(12,2))), 0) AS revenue,
          COALESCE(AVG(CAST(rc.salePrice AS DECIMAL(12,2))), 0) AS averagePrice
        FROM radius_cards rc
        LEFT JOIN plans p ON p.id = rc.planId
        WHERE rc.status = 'expired' AND rc.updatedAt >= ${start} AND rc.updatedAt <= ${end} ${ownerClause} ${planClause}
        GROUP BY COALESCE(p.currency, 'USD')
        UNION ALL
        SELECT 'previous', COALESCE(p.currency, 'USD'),
          COUNT(*), COALESCE(SUM(CAST(rc.salePrice AS DECIMAL(12,2))), 0),
          COALESCE(AVG(CAST(rc.salePrice AS DECIMAL(12,2))), 0)
        FROM radius_cards rc
        LEFT JOIN plans p ON p.id = rc.planId
        WHERE rc.status = 'expired' AND rc.updatedAt >= ${previousStart} AND rc.updatedAt <= ${previousEnd} ${ownerClause} ${planClause}
        GROUP BY COALESCE(p.currency, 'USD')`),
      db.execute(sql`
        SELECT rc.updatedAt AS soldAt, COALESCE(p.currency, 'USD') AS currency,
          CAST(rc.salePrice AS DECIMAL(12,2)) AS salePrice
        FROM radius_cards rc
        LEFT JOIN plans p ON p.id = rc.planId
        WHERE rc.status = 'expired' AND rc.updatedAt >= ${start} AND rc.updatedAt <= ${end} ${ownerClause} ${planClause} ${currencyClause}
        ORDER BY rc.updatedAt ASC LIMIT 5000`),
      db.execute(sql`
        SELECT p.id AS planId, COALESCE(p.nameAr, p.name, 'بدون خطة') AS planName,
          COALESCE(p.currency, 'USD') AS currency, COUNT(rc.id) AS cardsSold,
          COALESCE(AVG(CAST(rc.salePrice AS DECIMAL(12,2))), 0) AS unitPrice,
          COALESCE(SUM(CAST(rc.salePrice AS DECIMAL(12,2))), 0) AS revenue
        FROM radius_cards rc
        LEFT JOIN plans p ON p.id = rc.planId
        WHERE rc.status = 'expired' AND rc.updatedAt >= ${start} AND rc.updatedAt <= ${end} ${ownerClause} ${planClause} ${currencyClause}
        GROUP BY p.id, p.name, p.nameAr, p.currency
        ORDER BY currency ASC, cardsSold DESC, revenue DESC LIMIT 50`),
      db.execute(sql`
        SELECT rc.id, rc.username, COALESCE(p.nameAr, p.name, 'بدون خطة') AS planName,
          rc.salePrice, COALESCE(p.currency, 'USD') AS currency, rc.updatedAt AS soldAt
        FROM radius_cards rc
        LEFT JOIN plans p ON p.id = rc.planId
        WHERE rc.status = 'expired' AND rc.updatedAt >= ${start} AND rc.updatedAt <= ${end} ${ownerClause} ${planClause} ${currencyClause}
        ORDER BY rc.updatedAt DESC LIMIT ${pageSize} OFFSET ${offset}`),
      filters.ownerId
        ? db.select({ id: plans.id, name: plans.name, nameAr: plans.nameAr, price: plans.price, currency: plans.currency })
          .from(plans).where(eq(plans.ownerId, filters.ownerId)).orderBy(asc(plans.name))
        : db.select({ id: plans.id, name: plans.name, nameAr: plans.nameAr, price: plans.price, currency: plans.currency })
          .from(plans).orderBy(asc(plans.name)),
    ]);

    const currencySummaryRows = asRows(currencySummaryRaw);
    const planRows = asRows(plansRaw);
    const currentByCurrency = new Map<string, Record<string, unknown>>();
    const previousByCurrency = new Map<string, Record<string, unknown>>();
    for (const row of currencySummaryRows) {
      (row.tag === "previous" ? previousByCurrency : currentByCurrency).set(currencyValue(row.currency), row);
    }
    const growth = (currentValue: number, previousValue: number) => previousValue === 0
      ? (currentValue > 0 ? 100 : 0)
      : Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
    const currencySummaries = Array.from(currentByCurrency.entries()).map(([currency, current]) => {
      const previous = previousByCurrency.get(currency) ?? {};
      const cardsSold = toNumber(current.cardsSold);
      const revenue = toNumber(current.revenue);
      const currencyPlans = planRows.filter(row => currencyValue(row.currency) === currency);
      return {
        currency,
        cardsSold,
        revenue,
        averagePrice: toNumber(current.averagePrice),
        cardsGrowth: growth(cardsSold, toNumber(previous.cardsSold)),
        revenueGrowth: growth(revenue, toNumber(previous.revenue)),
        bestPlan: currencyPlans[0]?.planName ? String(currencyPlans[0].planName) : null,
      };
    }).sort((a, b) => a.currency.localeCompare(b.currency));
    const selectedCurrency = filters.currency ?? currencySummaries[0]?.currency ?? "USD";
    const selectedKpis = currencySummaries.find(item => item.currency === selectedCurrency) ?? {
      currency: selectedCurrency, cardsSold: 0, revenue: 0, averagePrice: 0, cardsGrowth: 0, revenueGrowth: 0, bestPlan: null,
    };
    const recentRows = asRows(recentRaw);
    const chartBuckets = new Map<string, { period: string; currency: string; cardsSold: number; revenue: number }>();
    for (const row of asRows(chartRaw)) {
      const instant = asUtcInstant(row.soldAt);
      if (Number.isNaN(instant.getTime())) continue;
      const rowCurrency = currencyValue(row.currency);
      const period = bucketForTimezone(instant, timezone, granularity);
      const key = `${rowCurrency}\u0000${period}`;
      const existing = chartBuckets.get(key) ?? { period, currency: rowCurrency, cardsSold: 0, revenue: 0 };
      existing.cardsSold += 1;
      existing.revenue += toNumber(row.salePrice);
      chartBuckets.set(key, existing);
    }

    return {
      periodStart: range.start.toISOString(),
      periodEnd: range.end.toISOString(),
      timezone,
      granularity,
      selectedCurrency,
      currencySummaries,
      networkFilter: { available: false, reason: "لا يوجد NAS مسجل على الكروت المنتهية الحالية" },
      kpis: selectedKpis,
      chart: Array.from(chartBuckets.values()).sort((left, right) => left.period.localeCompare(right.period)),
      byPlan: planRows.map(row => ({
        planId: toNumber(row.planId), planName: String(row.planName), cardsSold: toNumber(row.cardsSold),
        unitPrice: toNumber(row.unitPrice), revenue: toNumber(row.revenue), currency: currencyValue(row.currency),
      })),
      recentSales: recentRows.map(row => ({
        id: toNumber(row.id), cardId: toNumber(row.id), username: String(row.username ?? "—"),
        planName: String(row.planName), salePrice: toNumber(row.salePrice), currency: currencyValue(row.currency),
        soldAt: String(row.soldAt), source: "expired_card",
      })),
      pagination: { page, pageSize, hasMore: recentRows.length === pageSize },
      planOptions,
      dataQuality: {
        historicalConfirmedSales: selectedKpis.cardsSold,
        legacyActivatedCardsExcluded: false,
        message: `المبيعات المعروضة بعملة ${selectedCurrency} تساوي الكروت المنتهية فقط، وسعرها من salePrice المحفوظ على الكرت.`,
      },
    };
  }
}

export const cardSalesRepository = new CardSalesRepository();
