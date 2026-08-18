import { getDb } from "../db";
import { users, wallets, walletLedger, radiusCards } from "../../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

/**
 * Billing Analytics Service
 * Provides statistics and insights for owner dashboard
 * 
 * Revenue sources:
 * 1. Daily billing fees (wallet_ledger WHERE type='debit' AND entityType='billing')
 * 2. Card sales revenue (radius_cards WHERE status IN ('used','active','expired') - salePrice)
 */

interface DashboardStats {
  dailyRevenue: number;
  monthlyRevenue: number;
  totalRevenue: number;
  // Card sales breakdown
  cardSalesRevenue: number;
  billingFeesRevenue: number;
  totalCardsSold: number;
  // Client stats
  activeClients: number;
  pastDueClients: number;
  suspendedClients: number;
  averageBalance: number;
  lowBalanceCount: number;
}

interface RevenueDataPoint {
  date: string;
  revenue: number;
  billingFees: number;
  cardSales: number;
}

interface LowBalanceClient {
  id: number;
  username: string;
  email: string;
  balance: number;
  activeNasCount: number;
  billingStatus: string;
  lastDailyBillingDate: Date | null;
}

/**
 * Get daily revenue (today) - billing fees + card sales
 */
export async function getDailyRevenue(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Daily billing fees
  const billingResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(CAST(${walletLedger.amount} AS DECIMAL(10,2))), 0)`,
    })
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.type, "debit"),
        eq(walletLedger.entityType, "billing"),
        gte(walletLedger.createdAt, today),
        lte(walletLedger.createdAt, tomorrow)
      )
    );

  // Card sales today: plan.price × COUNT(cards)
  const cardSalesResult = await db.execute(
    sql.raw(`SELECT COALESCE(SUM(CAST(COALESCE(p.price, '0') AS DECIMAL(10,2))), 0) as total
        FROM radius_cards rc
        LEFT JOIN plans p ON rc.planId = p.id
        WHERE rc.status = 'used'
          AND rc.updatedAt >= '${today.toISOString()}'
          AND rc.updatedAt < '${tomorrow.toISOString()}'`)
  );

  return Number(billingResult[0]?.total || 0) + Number((cardSalesResult as any[])[0]?.[0]?.total || 0);
}

/**
 * Get monthly revenue (current month) - billing fees + card sales
 */
export async function getMonthlyRevenue(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Monthly billing fees
  const billingResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(CAST(${walletLedger.amount} AS DECIMAL(10,2))), 0)`,
    })
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.type, "debit"),
        eq(walletLedger.entityType, "billing"),
        gte(walletLedger.createdAt, firstDayOfMonth),
        lte(walletLedger.createdAt, firstDayOfNextMonth)
      )
    );

  // Card sales this month: plan.price × COUNT(cards)
  const cardSalesResult = await db.execute(
    sql.raw(`SELECT COALESCE(SUM(CAST(COALESCE(p.price, '0') AS DECIMAL(10,2))), 0) as total
        FROM radius_cards rc
        LEFT JOIN plans p ON rc.planId = p.id
        WHERE rc.status = 'used'
          AND rc.updatedAt >= '${firstDayOfMonth.toISOString()}'
          AND rc.updatedAt < '${firstDayOfNextMonth.toISOString()}'`)
  );

  return Number(billingResult[0]?.total || 0) + Number((cardSalesResult as any[])[0]?.[0]?.total || 0);
}

/**
 * Get total revenue (all time) - billing fees + card sales
 */
export async function getTotalRevenue(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Total billing fees
  const billingResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(CAST(${walletLedger.amount} AS DECIMAL(10,2))), 0)`,
    })
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.type, "debit"),
        eq(walletLedger.entityType, "billing")
      )
    );

  // Total card sales: plan.price × COUNT(cards)
  const cardSalesResult = await db.execute(
    sql.raw(`SELECT 
          COALESCE(SUM(CAST(COALESCE(p.price, '0') AS DECIMAL(10,2))), 0) as total,
          COUNT(rc.id) as count
        FROM radius_cards rc
        LEFT JOIN plans p ON rc.planId = p.id
        WHERE rc.status IN ('used', 'active', 'expired')`)
  );

  return Number(billingResult[0]?.total || 0) + Number((cardSalesResult as any[])[0]?.[0]?.total || 0);
}

/**
 * Get card sales revenue breakdown
 */
export async function getCardSalesRevenue(): Promise<{ revenue: number; count: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(
    sql.raw(`SELECT 
          COALESCE(SUM(CAST(COALESCE(p.price, '0') AS DECIMAL(10,2))), 0) as revenue,
          COUNT(rc.id) as count
        FROM radius_cards rc
        LEFT JOIN plans p ON rc.planId = p.id
        WHERE rc.status IN ('used', 'active', 'expired')`)
  );

  const rows = (result as any[])[0];
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    revenue: Number(row?.revenue || 0),
    count: Number(row?.count || 0),
  };
}

/**
 * Get billing fees revenue
 */
export async function getBillingFeesRevenue(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(CAST(${walletLedger.amount} AS DECIMAL(10,2))), 0)`,
    })
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.type, "debit"),
        eq(walletLedger.entityType, "billing")
      )
    );

  return Number(result[0]?.total || 0);
}

/**
 * Get clients count by billing status
 */
export async function getClientsByBillingStatus(): Promise<{
  active: number;
  pastDue: number;
  suspended: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const activeResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(
      and(
        eq(users.role, "client"),
        eq(users.billingStatus, "active")
      )
    );

  const pastDueResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(
      and(
        eq(users.role, "client"),
        eq(users.billingStatus, "past_due")
      )
    );

  const suspendedResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(
      and(
        eq(users.role, "client"),
        eq(users.billingStatus, "suspended")
      )
    );

  return {
    active: Number(activeResult[0]?.count || 0),
    pastDue: Number(pastDueResult[0]?.count || 0),
    suspended: Number(suspendedResult[0]?.count || 0),
  };
}

/**
 * Get average client balance
 */
export async function getAverageClientBalance(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({
      avg: sql<number>`AVG(CAST(${wallets.balance} AS DECIMAL(10,2)))`,
    })
    .from(wallets)
    .innerJoin(users, eq(wallets.userId, users.id))
    .where(eq(users.role, "client"));

  return Number(result[0]?.avg || 0);
}

/**
 * Get clients with low balance (<= $5)
 */
export async function getLowBalanceClients(): Promise<LowBalanceClient[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const lowBalanceUsers = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      balance: wallets.balance,
      billingStatus: users.billingStatus,
      lastDailyBillingDate: users.lastDailyBillingDate,
    })
    .from(users)
    .innerJoin(wallets, eq(wallets.userId, users.id))
    .where(
      and(
        eq(users.role, "client"),
        sql`CAST(${wallets.balance} AS DECIMAL(10,2)) <= 5.00`
      )
    )
    .orderBy(wallets.balance);

  // Get NAS count for each user
  const clientsWithNas = await Promise.all(
    lowBalanceUsers.map(async (user: any) => {
      const nasCount = await db.execute(
        sql`SELECT COUNT(*) as count FROM nas WHERE ownerId = ${user.id} AND status = 'active'`
      );
      return {
        ...user,
        balance: parseFloat(user.balance),
        activeNasCount: Number((nasCount[0] as any)?.count || 0),
      };
    })
  );

  return clientsWithNas;
}

/**
 * Get revenue history for last N days (billing fees + card sales combined)
 */
export async function getRevenueHistory(days: number = 30): Promise<RevenueDataPoint[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  // Billing fees per day
  const billingResult = await db.execute(
    sql`
      SELECT 
        DATE_FORMAT(createdAt, '%Y-%m-%d') as date,
        SUM(CAST(amount AS DECIMAL(10,2))) as billing_fees
      FROM wallet_ledger
      WHERE type = 'debit' 
        AND entityType = 'billing'
        AND createdAt >= ${startDate}
      GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')
      ORDER BY DATE_FORMAT(createdAt, '%Y-%m-%d')
    `
  );

  // Card sales per day: plan.price × COUNT(cards)
  const cardSalesResult = await db.execute(
    sql`
      SELECT 
        DATE_FORMAT(rc.updatedAt, '%Y-%m-%d') as date,
        COALESCE(SUM(CAST(COALESCE(p.price, '0') AS DECIMAL(10,2))), 0) as card_sales
      FROM radius_cards rc
      LEFT JOIN plans p ON rc.planId = p.id
      WHERE rc.status = 'used'
        AND rc.updatedAt >= ${startDate}
      GROUP BY DATE_FORMAT(rc.updatedAt, '%Y-%m-%d')
      ORDER BY DATE_FORMAT(rc.updatedAt, '%Y-%m-%d')
    `
  );

  // Merge both datasets by date
  // db.execute returns [[rows], [fields]] - rows are at index [0]
  const billingRows = Array.isArray((billingResult as any[])[0]) ? (billingResult as any[])[0] : (billingResult as any[]);
  const cardSalesRows = Array.isArray((cardSalesResult as any[])[0]) ? (cardSalesResult as any[])[0] : (cardSalesResult as any[]);

  const billingMap = new Map<string, number>();
  billingRows.forEach((row: any) => {
    billingMap.set(row.date, Number(row.billing_fees || 0));
  });

  const cardSalesMap = new Map<string, number>();
  cardSalesRows.forEach((row: any) => {
    cardSalesMap.set(row.date, Number(row.card_sales || 0));
  });

  // Collect all unique dates
  const allDates = new Set([...Array.from(billingMap.keys()), ...Array.from(cardSalesMap.keys())]);
  const sortedDates = Array.from(allDates).sort();

  return sortedDates.map((date) => {
    const billingFees = billingMap.get(date) || 0;
    const cardSales = cardSalesMap.get(date) || 0;
    return {
      date,
      revenue: billingFees + cardSales,
      billingFees,
      cardSales,
    };
  });
}

/**
 * Get complete dashboard statistics
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    dailyRevenue,
    monthlyRevenue,
    clientsByStatus,
    averageBalance,
    lowBalanceClients,
    cardSalesData,
    billingFeesRevenue,
  ] = await Promise.all([
    getDailyRevenue(),
    getMonthlyRevenue(),
    getClientsByBillingStatus(),
    getAverageClientBalance(),
    getLowBalanceClients(),
    getCardSalesRevenue(),
    getBillingFeesRevenue(),
  ]);

  const totalRevenue = cardSalesData.revenue + billingFeesRevenue;

  return {
    dailyRevenue,
    monthlyRevenue,
    totalRevenue,
    cardSalesRevenue: cardSalesData.revenue,
    billingFeesRevenue,
    totalCardsSold: cardSalesData.count,
    activeClients: clientsByStatus.active,
    pastDueClients: clientsByStatus.pastDue,
    suspendedClients: clientsByStatus.suspended,
    averageBalance,
    lowBalanceCount: lowBalanceClients.length,
  };
}
