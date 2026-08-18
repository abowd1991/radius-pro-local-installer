import { eq, desc, count, sum, and, gte, lt } from "drizzle-orm";
import { getDb } from "../db";
import { wallets, transactions, users, bankTransferRequests, InsertWallet, InsertTransaction } from "../../drizzle/schema";

export async function getWalletByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  
  if (result.length === 0) {
    // Create wallet if not exists
    await db.insert(wallets).values({ userId, balance: "0.00" });
    const newWallet = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
    return newWallet[0] || null;
  }
  
  return result[0];
}

export async function getTransactionsByUserId(userId: number, limit = 20, page = 1) {
  const db = await getDb();
  if (!db) return { data: [], total: 0, page, limit, totalPages: 0 };

  const offset = (page - 1) * limit;

  // Fetch wallet transactions + bank transfer requests in parallel
  const [walletTxRows, bankRows] = await Promise.all([
    db.select().from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt)),
    db.select().from(bankTransferRequests)
      .where(eq(bankTransferRequests.userId, userId))
      .orderBy(desc(bankTransferRequests.submittedAt)),
  ]);

  // Normalize wallet transactions
  const walletNorm = walletTxRows.map((tx: any) => ({
    id: tx.id,
    type: tx.type as string,
    amount: tx.amount,
    balanceAfter: tx.balanceAfter,
    description: tx.description,
    status: tx.status,
    createdAt: tx.createdAt,
    receiptImageUrl: null as string | null,
    source: 'wallet' as const,
  }));

  // Normalize bank transfer requests — only show non-pending or all
  const bankNorm = bankRows.map((r: any) => ({
    id: r.id,
    type: 'bank_transfer' as string,
    amount: r.finalAmountUSD,
    balanceAfter: null as string | null,
    description: `تحويل بنكي — ${r.referenceNumber ?? ''}`.trim(),
    status: r.status as string,
    createdAt: r.submittedAt,
    receiptImageUrl: r.receiptImageUrl as string | null,
    source: 'bank_transfer' as const,
  }));

  // Merge and sort by date descending
  const merged = [...walletNorm, ...bankNorm].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const total = merged.length;
  const data = merged.slice(offset, offset + limit);

  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

// Get wallet statistics (total deposits, withdrawals, transaction count)
export async function getWalletStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalDeposits: 0, totalWithdrawals: 0, transactionCount: 0 };
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const [allStats, monthStats] = await Promise.all([
    db.select({ total: count() }).from(transactions).where(eq(transactions.userId, userId)),
    db.select({ total: count() }).from(transactions).where(
      and(eq(transactions.userId, userId), gte(transactions.createdAt, startOfMonth))
    ),
  ]);
  
  // Get deposit and withdrawal sums (all time)
  const allTx = await db.select({ type: transactions.type, amount: transactions.amount })
    .from(transactions)
    .where(eq(transactions.userId, userId));
  
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  for (const tx of allTx) {
    const amt = parseFloat(tx.amount as string) || 0;
    if (tx.type === 'deposit' || tx.type === 'transfer_in' || tx.type === 'refund') {
      totalDeposits += amt;
    } else {
      totalWithdrawals += amt;
    }
  }
  
  return {
    totalDeposits,
    totalWithdrawals,
    transactionCount: Number(allStats[0]?.total ?? 0),
    monthTransactionCount: Number(monthStats[0]?.total ?? 0),
  };
}

export async function deposit(userId: number, amount: string, description?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const wallet = await getWalletByUserId(userId);
  if (!wallet) throw new Error("Wallet not found");
  
  const currentBalance = parseFloat(wallet.balance as string);
  const depositAmount = parseFloat(amount);
  const currentCredit = parseFloat((wallet as any).creditBalance || '0');
  
  // Deduct outstanding debt from deposit first
  let actualDeposit = depositAmount;
  let debtDeducted = 0;
  let newCreditBalance = currentCredit;
  
  if (currentCredit > 0) {
    debtDeducted = Math.min(currentCredit, depositAmount);
    actualDeposit = depositAmount - debtDeducted;
    newCreditBalance = currentCredit - debtDeducted;
  }
  
  const newBalance = (currentBalance + actualDeposit).toFixed(2);
  
  // Update wallet balance and credit
  await db.update(wallets)
    .set({
      balance: newBalance,
      ...(currentCredit > 0 ? { creditBalance: newCreditBalance.toFixed(2) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(wallets.userId, userId));
  
  // Create transaction record
  await db.insert(transactions).values({
    walletId: wallet.id,
    userId,
    type: "deposit",
    amount,
    balanceBefore: wallet.balance as string,
    balanceAfter: newBalance,
    description: debtDeducted > 0
      ? `${description || 'Deposit'} (خصم مديونية $${debtDeducted.toFixed(2)})`
      : (description || "Deposit"),
    status: "completed",
  });
  
  // Restore billing status to 'active' if user has positive balance after deposit
  // Logic: billingStatus = 'active' as long as balance > 0 (can cover next billing cycle)
  // Even if there's remaining debt (creditBalance > 0), the user is considered active
  // because they have funds to continue service. past_due only means "couldn't pay today".
  const hasPositiveBalance = parseFloat(newBalance) > 0;
  if (hasPositiveBalance) {
    const [userRecord] = await db.select({ id: users.id, billingStatus: users.billingStatus })
      .from(users)
      .where(eq(users.id, userId));
    if (userRecord && userRecord.billingStatus === 'past_due') {
      await db.update(users)
        .set({ billingStatus: 'active', updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
  }

  return { success: true, newBalance, debtDeducted };
}

export async function withdraw(userId: number, amount: string, type: "withdrawal" | "card_purchase" | "subscription", description?: string, referenceType?: string, referenceId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const wallet = await getWalletByUserId(userId);
  if (!wallet) throw new Error("Wallet not found");
  
  const currentBalance = parseFloat(wallet.balance as string);
  const withdrawAmount = parseFloat(amount);
  
  if (currentBalance < withdrawAmount) {
    throw new Error("Insufficient balance");
  }
  
  const newBalance = (currentBalance - withdrawAmount).toFixed(2);
  
  // Update wallet balance
  await db.update(wallets)
    .set({ balance: newBalance })
    .where(eq(wallets.userId, userId));
  
  // Create transaction record
  await db.insert(transactions).values({
    walletId: wallet.id,
    userId,
    type,
    amount,
    balanceBefore: wallet.balance as string,
    balanceAfter: newBalance,
    description,
    referenceType,
    referenceId,
    status: "completed",
  });
  
  return { success: true, newBalance };
}

export async function getBalance(userId: number): Promise<string> {
  const wallet = await getWalletByUserId(userId);
  return wallet?.balance as string || "0.00";
}
