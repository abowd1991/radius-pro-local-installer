import { router } from "../../_core/trpc";
import { dashboardSummary, revenue, subscribers, cards, sessions, usage, getBandwidthUsage } from "./read";
import { exportRevenueExcel, exportCardsExcel, exportSessionsExcel, exportSubscribersExcel, exportRevenuePDF, exportCardsPDF, exportSessionsPDF } from "./export";

export const reportsRouter = router({
  dashboardSummary,
  revenue,
  subscribers,
  cards,
  sessions,
  usage,
  getBandwidthUsage,
  exportRevenueExcel,
  exportCardsExcel,
  exportSessionsExcel,
  exportSubscribersExcel,
  exportRevenuePDF,
  exportCardsPDF,
  exportSessionsPDF,
});
