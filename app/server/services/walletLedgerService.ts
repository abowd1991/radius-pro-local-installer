import { getDb } from "../db";
import { walletLedger, wallets, users, transactions } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { logAudit } from "./auditLogService";

/**
 * Wallet Ledger Service
 * Manages wallet transactions with full audit trail
 */

export const walletLedgerService = {
  /**
   * Add credit to wallet (deposit)
   */
  async addCredit(params: {
    userId: number;
    amount: number;
    reason: string;
    reasonAr?: string;
    entityType?: string;
    entityId?: number;
    actorId: number;
    actorRole: string;
    metadata?: any;
  }) {
    const { userId, amount, reason, reasonAr, entityType, entityId, actorId, actorRole, metadata } = params;

    // Get current wallet balance
    const db = await getDb();
    const [wallet] = await db!.select().from(wallets).where(eq(wallets.userId, userId));
    
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore + amount;

    // Create ledger entry
    const [ledgerEntry] = await db!.insert(walletLedger).values({
      userId,
      type: "credit",
      amount: amount.toString(),
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      reason,
      reasonAr,
      entityType,
      entityId,
      actorId,
      actorRole,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    // Update wallet balance
    await db!.update(wallets)
      .set({ 
        balance: balanceAfter.toString(),
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId));

    // Write to transactions table so it appears in /wallet page
    await db!.insert(transactions).values({
      walletId: wallet.id,
      userId,
      type: "deposit",
      amount: amount.toString(),
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      description: reasonAr || reason,
      status: "completed",
    });

    // If user was past_due and now has positive balance, restore billing status to active
    // Logic: active = has balance to cover next cycle, regardless of existing debt
    const [userRecord] = await db!.select({ billingStatus: users.billingStatus })
      .from(users)
      .where(eq(users.id, userId));
    if (userRecord && userRecord.billingStatus === 'past_due' && balanceAfter > 0) {
      await db!.update(users)
        .set({ billingStatus: 'active', updatedAt: new Date() })
        .where(eq(users.id, userId));
    }

    // Audit log
    await logAudit({
      userId: actorId,
      userRole: actorRole,
      action: "card_create", // Using existing action type
      targetType: "user",
      targetId: userId.toString(),
      result: "success",
      details: {
        operation: "wallet_credit",
        amount,
        balanceBefore,
        balanceAfter,
        reason,
        billingStatusRestored: userRecord?.billingStatus === 'past_due' && balanceAfter > 0,
      },
    });

    return {
      success: true,
      ledgerEntry,
      balanceBefore,
      balanceAfter,
    };
  },

  /**
   * Deduct from wallet (payment/charge)
   */
  async deductBalance(params: {
    userId: number;
    amount: number;
    reason: string;
    reasonAr?: string;
    entityType?: string;
    entityId?: number;
    actorId: number;
    actorRole: string;
    metadata?: any;
  }) {
    const { userId, amount, reason, reasonAr, entityType, entityId, actorId, actorRole, metadata } = params;

    // Get current wallet balance
    const db = await getDb();
    const [wallet] = await db!.select().from(wallets).where(eq(wallets.userId, userId));
    
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore - amount;

    // Check sufficient balance
    if (balanceAfter < 0) {
      throw new Error("Insufficient balance");
    }

    // Create ledger entry
    const [ledgerEntry] = await db!.insert(walletLedger).values({
      userId,
      type: "debit",
      amount: amount.toString(),
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      reason,
      reasonAr,
      entityType,
      entityId,
      actorId,
      actorRole,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    // Update wallet balance
    await db!.update(wallets)
      .set({ 
        balance: balanceAfter.toString(),
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, userId));

    // Audit log
    await logAudit({
      userId: actorId,
      userRole: actorRole,
      action: "card_create", // Using existing action type
      targetType: "user",
      targetId: userId.toString(),
      result: "success",
      details: {
        operation: "wallet_debit",
        amount,
        balanceBefore,
        balanceAfter,
        reason,
      },
    });

    return {
      success: true,
      ledgerEntry,
      balanceBefore,
      balanceAfter,
    };
  },

  /**
   * Get wallet transaction history
   */
  async getTransactionHistory(params: {
    userId: number;
    type?: "credit" | "debit";
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const { userId, type, startDate, endDate, limit = 50, offset = 0 } = params;

    const conditions = [eq(walletLedger.userId, userId)];

    if (type) {
      conditions.push(eq(walletLedger.type, type));
    }

    if (startDate) {
      conditions.push(gte(walletLedger.createdAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(walletLedger.createdAt, endDate));
    }

    const db = await getDb();
    const transactions = await db!
      .select()
      .from(walletLedger)
      .where(and(...conditions))
      .orderBy(desc(walletLedger.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db!
      .select({ count: sql<number>`count(*)` })
      .from(walletLedger)
      .where(and(...conditions));

    return {
      transactions,
      total: count,
      limit,
      offset,
    };
  },

  /**
   * Get wallet summary
   */
  async getWalletSummary(userId: number) {
    const db = await getDb();
    const [wallet] = await db!.select().from(wallets).where(eq(wallets.userId, userId));

    if (!wallet) {
      return null;
    }

    // Get total credits
    const [{ totalCredits }] = await db!
      .select({ totalCredits: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL(12,2))), 0)` })
      .from(walletLedger)
      .where(and(
        eq(walletLedger.userId, userId),
        eq(walletLedger.type, "credit")
      ));

    // Get total debits
    const [{ totalDebits }] = await db!
      .select({ totalDebits: sql<number>`COALESCE(SUM(CAST(amount AS DECIMAL(12,2))), 0)` })
      .from(walletLedger)
      .where(and(
        eq(walletLedger.userId, userId),
        eq(walletLedger.type, "debit")
      ));

    // Get recent transactions
    const recentTransactions = await db!
      .select()
      .from(walletLedger)
      .where(eq(walletLedger.userId, userId))
      .orderBy(desc(walletLedger.createdAt))
      .limit(10);

    return {
      currentBalance: parseFloat(wallet.balance),
      totalCredits: totalCredits || 0,
      totalDebits: totalDebits || 0,
      recentTransactions,
    };
  },
};
