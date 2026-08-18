import { getDb } from "../db";
import { users, radiusCards, radacct, plans, tenantSubscriptions, wallets, transactions, invoices, nasDevices, onlineSessions } from "../../drizzle/schema";
import { eq, and, gte, lte, sql, count, sum, desc, asc, isNull, isNotNull, inArray } from "drizzle-orm";

// ============================================================================
// REVENUE REPORTS
// ============================================================================

export interface RevenueData {
  date: string;
  revenue: number;
  transactions: number;
}

export interface RevenueReport {
  totalRevenue: number;
  totalTransactions: number;
  averageTransaction: number;
  revenueByPeriod: RevenueData[];
  revenueByClient: { clientId: number; clientName: string; revenue: number }[];
}

export async function getRevenueReport(
  ownerId: number,
  startDate: Date,
  endDate: Date,
  groupBy: "day" | "week" | "month" = "day"
): Promise<RevenueReport> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const totalResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'deposit' THEN ${transactions.amount} ELSE 0 END), 0)`,
      count: count(),
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .where(
      and(
        eq(wallets.userId, ownerId),
        gte(transactions.createdAt, startDate),
        lte(transactions.createdAt, endDate),
        sql`${transactions.type} = 'deposit'`
      )
    );

  const totalRevenue = Number(totalResult[0]?.total || 0);
  const totalTransactions = Number(totalResult[0]?.count || 0);

  const revenueByPeriod = await db
    .select({
      date: sql<string>`DATE_FORMAT(${transactions.createdAt}, '%Y-%m-%d')`,
      revenue: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      transactions: count(),
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .where(
      and(
        eq(wallets.userId, ownerId),
        gte(transactions.createdAt, startDate),
        lte(transactions.createdAt, endDate),
        sql`${transactions.type} = 'deposit'`
      )
    )
    .groupBy(sql`DATE_FORMAT(${transactions.createdAt}, '%Y-%m-%d')`)
    .orderBy(asc(sql`DATE_FORMAT(${transactions.createdAt}, '%Y-%m-%d')`));

  return {
    totalRevenue,
    totalTransactions,
    averageTransaction: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
    revenueByPeriod: revenueByPeriod.map((r: any) => ({
      date: r.date,
      revenue: Number(r.revenue),
      transactions: Number(r.transactions),
    })),
    revenueByClient: [],
  };
}

// ============================================================================
// SUBSCRIBERS REPORTS — مُصلَح: tenant isolation صارم
// ============================================================================

export interface SubscribersReport {
  totalSubscribers: number;
  activeSubscribers: number;
  expiredSubscribers: number;
  suspendedSubscribers: number;
  newSubscribersThisPeriod: number;
  subscriberGrowth: { date: string; count: number }[];
}

export async function getSubscribersReport(
  ownerId: number,
  startDate: Date,
  endDate: Date
): Promise<SubscribersReport> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // ✅ مُصلَح: فلترة بـ ownerId عبر جدول subscribers
  // ✅ tenantSubscriptions.tenantId = User ID للعميل مباشرة
  const statusCounts = await db
    .select({
      status: tenantSubscriptions.status,
      count: count(),
    })
    .from(tenantSubscriptions)
    .where(eq(tenantSubscriptions.tenantId, ownerId))
    .groupBy(tenantSubscriptions.status);

  const statusMap: Record<string, number> = {};
  statusCounts.forEach((s: any) => {
    statusMap[s.status] = Number(s.count);
  });

  const newSubscribers = await db
    .select({ count: count() })
    .from(tenantSubscriptions)
    .where(
      and(
        eq(tenantSubscriptions.tenantId, ownerId),
        gte(tenantSubscriptions.createdAt, startDate),
        lte(tenantSubscriptions.createdAt, endDate)
      )
    );

  const subscriberGrowth = await db
    .select({
      date: sql<string>`DATE_FORMAT(${tenantSubscriptions.createdAt}, '%Y-%m-%d')`,
      count: count(),
    })
    .from(tenantSubscriptions)
    .where(
      and(
        eq(tenantSubscriptions.tenantId, ownerId),
        gte(tenantSubscriptions.createdAt, startDate),
        lte(tenantSubscriptions.createdAt, endDate)
      )
    )
    .groupBy(sql`DATE_FORMAT(${tenantSubscriptions.createdAt}, '%Y-%m-%d')`)
    .orderBy(asc(sql`DATE_FORMAT(${tenantSubscriptions.createdAt}, '%Y-%m-%d')`));

  return {
    totalSubscribers: Object.values(statusMap).reduce((a, b) => a + b, 0),
    activeSubscribers: statusMap["active"] || 0,
    expiredSubscribers: statusMap["expired"] || 0,
    suspendedSubscribers: statusMap["suspended"] || 0,
    newSubscribersThisPeriod: Number(newSubscribers[0]?.count || 0),
    subscriberGrowth: subscriberGrowth.map((g: any) => ({
      date: g.date,
      count: Number(g.count),
    })),
  };
}

// ============================================================================
// CARDS & PLANS REPORTS
// ============================================================================

export interface CardsReport {
  totalCards: number;
  unusedCards: number;
  activeCards: number;
  usedCards: number;
  expiredCards: number;
  bestSellingPlans: { planId: number; planName: string; count: number; revenue: number }[];
  cardsByStatus: { status: string; count: number }[];
  timeConsumptionByCard: { cardId: number; username: string; totalTime: number; planName: string }[];
}

export async function getCardsReport(
  ownerId: number,
  startDate: Date,
  endDate: Date
): Promise<CardsReport> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const cardStatusCounts = await db
    .select({
      status: radiusCards.status,
      count: count(),
    })
    .from(radiusCards)
    .where(eq(radiusCards.createdBy, ownerId))
    .groupBy(radiusCards.status);

  const statusMap: Record<string, number> = {};
  cardStatusCounts.forEach((s: any) => {
    statusMap[s.status] = Number(s.count);
  });

  const bestSellingPlans = await db
    .select({
      planId: radiusCards.planId,
      planName: plans.name,
      count: count(),
      revenue: sql<number>`COALESCE(SUM(CAST(COALESCE(${radiusCards.salePrice}, ${plans.price}, '0') AS DECIMAL(10,2))), 0)`,
    })
    .from(radiusCards)
    .innerJoin(plans, eq(radiusCards.planId, plans.id))
    .where(
      and(
        eq(radiusCards.createdBy, ownerId),
        gte(radiusCards.createdAt, startDate),
        lte(radiusCards.createdAt, endDate)
      )
    )
    .groupBy(radiusCards.planId, plans.name)
    .orderBy(desc(count()))
    .limit(10);

  const timeConsumption = await db
    .select({
      cardId: radiusCards.id,
      username: radiusCards.username,
      totalTime: radiusCards.totalSessionTime,
      planName: plans.name,
    })
    .from(radiusCards)
    .innerJoin(plans, eq(radiusCards.planId, plans.id))
    .where(
      and(
        eq(radiusCards.createdBy, ownerId),
        isNotNull(radiusCards.totalSessionTime)
      )
    )
    .orderBy(desc(radiusCards.totalSessionTime))
    .limit(20);

  return {
    totalCards: Object.values(statusMap).reduce((a, b) => a + b, 0),
    unusedCards: statusMap["unused"] || 0,
    activeCards: statusMap["active"] || 0,
    usedCards: statusMap["used"] || 0,
    expiredCards: statusMap["expired"] || 0,
    bestSellingPlans: bestSellingPlans.map((p: any) => ({
      planId: p.planId,
      planName: p.planName || "غير معروف",
      count: Number(p.count),
      revenue: Number(p.revenue),
    })),
    cardsByStatus: cardStatusCounts.map((s: any) => ({
      status: s.status,
      count: Number(s.count),
    })),
    timeConsumptionByCard: timeConsumption.map((t: any) => ({
      cardId: t.cardId,
      username: t.username,
      totalTime: Number(t.totalTime || 0),
      planName: t.planName || "غير معروف",
    })),
  };
}

// ============================================================================
// SESSIONS REPORTS
// ============================================================================

export interface SessionsReport {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  averageSessionDuration: number;
  totalSessionTime: number;
  sessionsByDay: { date: string; count: number; duration: number }[];
  sessionsByNas: { nasIp: string; nasName: string; count: number }[];
}

export async function getSessionsReport(
  ownerId: number,
  startDate: Date,
  endDate: Date
): Promise<SessionsReport> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const totalResult = await db
    .select({
      total: count(),
      completed: sql<number>`SUM(CASE WHEN ${radacct.acctstoptime} IS NOT NULL THEN 1 ELSE 0 END)`,
      totalTime: sql<number>`COALESCE(SUM(${radacct.acctsessiontime}), 0)`,
    })
    .from(radacct)
    .innerJoin(nasDevices, eq(radacct.nasipaddress, nasDevices.nasname))
    .where(
      and(
        eq(nasDevices.ownerId, ownerId),
        gte(radacct.acctstarttime, startDate),
        lte(radacct.acctstarttime, endDate)
      )
    );

  const totalSessions = Number(totalResult[0]?.total || 0);
  const completedSessions = Number(totalResult[0]?.completed || 0);
  const totalSessionTime = Number(totalResult[0]?.totalTime || 0);
  const ownerNasIds = await db
    .select({ id: nasDevices.id })
    .from(nasDevices)
    .where(eq(nasDevices.ownerId, ownerId));
  const activeResult = ownerNasIds.length === 0
    ? [{ active: 0 }]
    : await db.select({ active: count() })
      .from(onlineSessions)
      .where(inArray(onlineSessions.nasId, ownerNasIds.map((nas: any) => nas.id)));
  const activeSessions = Number(activeResult[0]?.active || 0);

  const sessionsByDay = await db
    .select({
      date: sql<string>`DATE_FORMAT(${radacct.acctstarttime}, '%Y-%m-%d')`,
      count: count(),
      duration: sql<number>`COALESCE(SUM(${radacct.acctsessiontime}), 0)`,
    })
    .from(radacct)
    .innerJoin(nasDevices, eq(radacct.nasipaddress, nasDevices.nasname))
    .where(
      and(
        eq(nasDevices.ownerId, ownerId),
        gte(radacct.acctstarttime, startDate),
        lte(radacct.acctstarttime, endDate)
      )
    )
    .groupBy(sql`DATE_FORMAT(${radacct.acctstarttime}, '%Y-%m-%d')`)
    .orderBy(asc(sql`DATE_FORMAT(${radacct.acctstarttime}, '%Y-%m-%d')`));

  const sessionsByNas = await db
    .select({
      nasIp: radacct.nasipaddress,
      nasName: nasDevices.shortname,
      count: count(),
    })
    .from(radacct)
    .innerJoin(nasDevices, eq(radacct.nasipaddress, nasDevices.nasname))
    .where(
      and(
        eq(nasDevices.ownerId, ownerId),
        gte(radacct.acctstarttime, startDate),
        lte(radacct.acctstarttime, endDate)
      )
    )
    .groupBy(radacct.nasipaddress, nasDevices.shortname)
    .orderBy(desc(count()))
    .limit(10);

  return {
    totalSessions,
    activeSessions,
    completedSessions,
    averageSessionDuration: completedSessions > 0 ? totalSessionTime / completedSessions : 0,
    totalSessionTime,
    sessionsByDay: sessionsByDay.map((s: any) => ({
      date: s.date,
      count: Number(s.count),
      duration: Number(s.duration),
    })),
    sessionsByNas: sessionsByNas.map((s: any) => ({
      nasIp: s.nasIp,
      nasName: s.nasName || s.nasIp,
      count: Number(s.count),
    })),
  };
}

// ============================================================================
// USAGE REPORTS
// ============================================================================

export interface UsageReport {
  summary: {
    totalSessions: number;
    totalTime: number;
    uniqueUsers: number;
    avgSessionDuration: number;
    peakHour: number;
    peakDay: string;
  };
  hourlyUsage: { hour: number; sessions: number; totalTime: number }[];
  dailyUsage: { date: string; sessions: number; uniqueUsers: number }[];
  weeklySummary: { weekNumber: number; startDate: string; endDate: string; sessions: number; uniqueUsers: number; totalTime: number }[];
  topUsersByTime: { username: string; totalTime: number; sessions: number }[];
}

export async function getUsageReport(
  ownerId: number,
  startDate: Date,
  endDate: Date
): Promise<UsageReport> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Get NAS IPs for this owner
  const ownerNas = await db
    .select({ nasname: nasDevices.nasname })
    .from(nasDevices)
    .where(eq(nasDevices.ownerId, ownerId));

  if (ownerNas.length === 0) {
    return {
      summary: { totalSessions: 0, totalTime: 0, uniqueUsers: 0, avgSessionDuration: 0, peakHour: 0, peakDay: '-' },
      hourlyUsage: [],
      dailyUsage: [],
      weeklySummary: [],
      topUsersByTime: [],
    };
  }

  const nasIps = ownerNas.map((n: any) => n.nasname);

  const summaryResult = await db
    .select({
      total: count(),
      totalTime: sql<number>`COALESCE(SUM(${radacct.acctsessiontime}), 0)`,
      uniqueUsers: sql<number>`COUNT(DISTINCT ${radacct.username})`,
    })
    .from(radacct)
    .where(
      and(
        inArray(radacct.nasipaddress, nasIps),
        gte(radacct.acctstarttime, startDate),
        lte(radacct.acctstarttime, endDate)
      )
    );

  const totalSessions = Number(summaryResult[0]?.total || 0);
  const totalTime = Number(summaryResult[0]?.totalTime || 0);
  const uniqueUsers = Number(summaryResult[0]?.uniqueUsers || 0);

  const hourlyUsage = await db
    .select({
      hour: sql<number>`HOUR(${radacct.acctstarttime})`,
      sessions: count(),
      totalTime: sql<number>`COALESCE(SUM(${radacct.acctsessiontime}), 0)`,
    })
    .from(radacct)
    .where(
      and(
        inArray(radacct.nasipaddress, nasIps),
        gte(radacct.acctstarttime, startDate),
        lte(radacct.acctstarttime, endDate)
      )
    )
    .groupBy(sql`HOUR(${radacct.acctstarttime})`)
    .orderBy(asc(sql`HOUR(${radacct.acctstarttime})`));

  const peakHour = hourlyUsage.reduce((max: any, h: any) => (Number(h.sessions) > Number(max.sessions) ? h : max), { hour: 0, sessions: 0 });

  const dailyUsage = await db
    .select({
      date: sql<string>`DATE_FORMAT(${radacct.acctstarttime}, '%Y-%m-%d')`,
      sessions: count(),
      uniqueUsers: sql<number>`COUNT(DISTINCT ${radacct.username})`,
    })
    .from(radacct)
    .where(
      and(
        inArray(radacct.nasipaddress, nasIps),
        gte(radacct.acctstarttime, startDate),
        lte(radacct.acctstarttime, endDate)
      )
    )
    .groupBy(sql`DATE_FORMAT(${radacct.acctstarttime}, '%Y-%m-%d')`)
    .orderBy(asc(sql`DATE_FORMAT(${radacct.acctstarttime}, '%Y-%m-%d')`));

  const peakDay = dailyUsage.reduce((max: any, d: any) => (Number(d.sessions) > Number(max.sessions) ? d : max), { date: '-', sessions: 0 });

  const topUsersByTime = await db
    .select({
      username: radacct.username,
      totalTime: sql<number>`COALESCE(SUM(${radacct.acctsessiontime}), 0)`,
      sessions: count(),
    })
    .from(radacct)
    .where(
      and(
        inArray(radacct.nasipaddress, nasIps),
        gte(radacct.acctstarttime, startDate),
        lte(radacct.acctstarttime, endDate)
      )
    )
    .groupBy(radacct.username)
    .orderBy(desc(sql`COALESCE(SUM(${radacct.acctsessiontime}), 0)`))
    .limit(10);

  return {
    summary: {
      totalSessions,
      totalTime,
      uniqueUsers,
      avgSessionDuration: totalSessions > 0 ? totalTime / totalSessions : 0,
      peakHour: Number((peakHour as any).hour || 0),
      peakDay: (peakDay as any).date || '-',
    },
    hourlyUsage: hourlyUsage.map((h: any) => ({
      hour: Number(h.hour),
      sessions: Number(h.sessions),
      totalTime: Number(h.totalTime),
    })),
    dailyUsage: dailyUsage.map((d: any) => ({
      date: d.date,
      sessions: Number(d.sessions),
      uniqueUsers: Number(d.uniqueUsers),
    })),
    weeklySummary: [],
    topUsersByTime: topUsersByTime.map((u: any) => ({
      username: u.username,
      totalTime: Number(u.totalTime),
      sessions: Number(u.sessions),
    })),
  };
}

// ============================================================================
// DASHBOARD SUMMARY — مُصلَح: tenant isolation صارم
// ============================================================================

export interface DashboardSummary {
  revenue: { today: number; thisWeek: number; thisMonth: number; growth: number };
  subscribers: { total: number; active: number; new: number };
  cards: { total: number; active: number; unused: number };
  sessions: { active: number; today: number };
}

export async function getDashboardSummary(ownerId: number): Promise<DashboardSummary> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [revenueToday, revenueThisWeek, revenueThisMonth, revenueLastMonth] = await Promise.all([
    db.select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` }).from(transactions).innerJoin(wallets, eq(transactions.walletId, wallets.id)).where(and(eq(wallets.userId, ownerId), gte(transactions.createdAt, todayStart), sql`${transactions.type} = 'deposit'`)),
    db.select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` }).from(transactions).innerJoin(wallets, eq(transactions.walletId, wallets.id)).where(and(eq(wallets.userId, ownerId), gte(transactions.createdAt, weekStart), sql`${transactions.type} = 'deposit'`)),
    db.select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` }).from(transactions).innerJoin(wallets, eq(transactions.walletId, wallets.id)).where(and(eq(wallets.userId, ownerId), gte(transactions.createdAt, monthStart), sql`${transactions.type} = 'deposit'`)),
    db.select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` }).from(transactions).innerJoin(wallets, eq(transactions.walletId, wallets.id)).where(and(eq(wallets.userId, ownerId), gte(transactions.createdAt, lastMonthStart), lte(transactions.createdAt, lastMonthEnd), sql`${transactions.type} = 'deposit'`)),
  ]);

  const thisMonthRev = Number(revenueThisMonth[0]?.total || 0);
  const lastMonthRev = Number(revenueLastMonth[0]?.total || 0);
  const growth = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : 0;

  // ✅ مُصلَح: فلترة المشتركين بـ ownerId
  const [subscriberStats, newSubs] = await Promise.all([
    db.select({ status: tenantSubscriptions.status, count: count() }).from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, ownerId)).groupBy(tenantSubscriptions.status),
    db.select({ count: count() }).from(tenantSubscriptions).where(and(eq(tenantSubscriptions.tenantId, ownerId), gte(tenantSubscriptions.createdAt, monthStart))),
  ]);

  const subMap: Record<string, number> = {};
  subscriberStats.forEach((s: any) => { subMap[s.status] = Number(s.count); });
  const totalSubs = Object.values(subMap).reduce((a, b) => a + b, 0);

  // Cards
  const cardStats = await db.select({ status: radiusCards.status, count: count() }).from(radiusCards).where(eq(radiusCards.createdBy, ownerId)).groupBy(radiusCards.status);
  const cardMap: Record<string, number> = {};
  cardStats.forEach((c: any) => { cardMap[c.status] = Number(c.count); });

  // Sessions via NAS
  const ownerNas = await db.select({ nasname: nasDevices.nasname }).from(nasDevices).where(eq(nasDevices.ownerId, ownerId));
  let activeSessions = 0, todaySessions = 0;
  if (ownerNas.length > 0) {
    const nasIps = ownerNas.map((n: any) => n.nasname);
    const ownerNasIds = ownerNas.map((n: any) => n.id);
    const [activeRes, todayRes] = await Promise.all([
      db.select({ count: count() }).from(onlineSessions).where(inArray(onlineSessions.nasId, ownerNasIds)),
      db.select({ count: count() }).from(radacct).where(and(inArray(radacct.nasipaddress, nasIps), gte(radacct.acctstarttime, todayStart))),
    ]);
    activeSessions = Number(activeRes[0]?.count || 0);
    todaySessions = Number(todayRes[0]?.count || 0);
  }

  return {
    revenue: { today: Number(revenueToday[0]?.total || 0), thisWeek: Number(revenueThisWeek[0]?.total || 0), thisMonth: thisMonthRev, growth },
    subscribers: { total: totalSubs, active: subMap["active"] || 0, new: Number(newSubs[0]?.count || 0) },
    cards: { total: Object.values(cardMap).reduce((a, b) => a + b, 0), active: cardMap["active"] || 0, unused: cardMap["unused"] || 0 },
    sessions: { active: activeSessions, today: todaySessions },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0د";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}س ${minutes}د`;
  return `${minutes}د`;
}
