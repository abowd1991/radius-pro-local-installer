// VOUCHERS ROUTER - INDEX (assembles all sub-modules into one router)
import { router } from "../../_core/trpc";

// READ
import {
  list, getById, getSubscriberGroups, getBatches, getBatchWithStats,
  getCardsByBatch, getActivity, getStats, getNamespaceCapacity,
  getManualCards, getOnlineCardIds, getBatchOnlineCounts,
} from "./read";

// GENERATE & ACTIONS
import {
  generate, activate, suspend, unsuspend, bulkSuspendCards, bulkUnsuspendCards,
  redeem, bulkActivate, bulkDeactivate, createManualCard, renewCard, updateCardPlanSpeed,
} from "./generate";

// BATCH & EXPORT
import {
  updateNotes, updateCard, enableBatch, disableBatch, updateBatchTime,
  updateBatchProperties, deleteBatch, bulkDeleteBatches, bulkDisableBatches,
  bulkEnableBatches, exportBatchCards, exportMultipleBatchCards,
  generateBatchPDF, getBatchPDFPreview, generateBatchPDFWithTemplate,
  exportBatchCSV, deleteCard, bulkDelete,
} from "./batch";

// IMPORT & SMS
import {
  importFromCsv, parseImportFile, importFromFile, sendManualCardSms,
} from "./import";

export const vouchersRouter = router({
  // ── READ ──────────────────────────────────────────────────────────────────
  list,
  getById,
  getSubscriberGroups,
  getBatches,
  getBatchWithStats,
  getCardsByBatch,
  getActivity,
  getStats,
  getNamespaceCapacity,
  getManualCards,
  getOnlineCardIds,
  getBatchOnlineCounts,

  // ── GENERATE & ACTIONS ────────────────────────────────────────────────────
  generate,
  activate,
  suspend,
  unsuspend,
  bulkSuspendCards,
  bulkUnsuspendCards,
  redeem,
  bulkActivate,
  bulkDeactivate,
  createManualCard,
  renewCard,
  updateCardPlanSpeed,

  // ── BATCH & EXPORT ────────────────────────────────────────────────────────
  updateNotes,
  updateCard,
  enableBatch,
  disableBatch,
  updateBatchTime,
  updateBatchProperties,
  deleteBatch,
  bulkDeleteBatches,
  bulkDisableBatches,
  bulkEnableBatches,
  exportBatchCards,
  exportMultipleBatchCards,
  generateBatchPDF,
  getBatchPDFPreview,
  generateBatchPDFWithTemplate,
  exportBatchCSV,
  deleteCard,
  bulkDelete,

  // ── IMPORT & SMS ──────────────────────────────────────────────────────────
  importFromCsv,
  parseImportFile,
  importFromFile,
  sendManualCardSms,
});
