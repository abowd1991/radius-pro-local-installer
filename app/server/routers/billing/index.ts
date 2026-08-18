import { router } from "../../_core/trpc";
import { getMySummary, getUserSummary, getBillingRate, getUsersDue, getDashboardStats, getRevenueHistory, getLowBalanceClients, getNasPricing, calculateMonthlyCost, getWalletStats, getAllClientsBalance, getBillingRunLogs } from "./read";
import { activateUser, processUserBilling, setNasPricing } from "./manage";

export const billingRouter = router({
  getMySummary,
  getUserSummary,
  getBillingRate,
  getUsersDue,
  getDashboardStats,
  getRevenueHistory,
  getLowBalanceClients,
  getNasPricing,
  calculateMonthlyCost,
  getWalletStats,
  getAllClientsBalance,
  getBillingRunLogs,
  activateUser,
  processUserBilling,
  setNasPricing,
});
