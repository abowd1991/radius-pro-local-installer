// NAS ROUTER - INDEX
import { router } from "../../_core/trpc";

// READ
import {
  list, getById, getSetupScripts, getProvisioningStatus,
  listWithProvisioningStatus, getPoolStats, listDhcpLeases, getIpPoolRanges,
} from "./read";

// MANAGE
import {
  create, update, deleteNas, bulkDeleteNas,
  retryProvisioning, triggerProvisioning, expandIpPool, reassignIp, toggleNasStatus,
} from "./manage";

// VPN
import {
  syncVpnIp, updateVpnIp, testApiConnection, getVpnStatus, autoSyncVpnIp,
  getHealthStatus, getVpnIpPoolStats, getAllocatedVpnIp, getAllAllocatedVpnIps,
  getAvailableVpnIps, releaseVpnIp, updateVpnIpPool, createVpnIpPool,
} from "./vpn";

export const nasRouter = router({
  // ── READ ──────────────────────────────────────────────────────────────────
  list,
  getById,
  getSetupScripts,
  getProvisioningStatus,
  listWithProvisioningStatus,
  getPoolStats,
  listDhcpLeases,
  getIpPoolRanges,

  // ── MANAGE ────────────────────────────────────────────────────────────────
  create,
  update,
  delete: deleteNas,
  bulkDeleteNas,
  retryProvisioning,
  triggerProvisioning,
  expandIpPool,
  reassignIp,
  toggleNasStatus,

  // ── VPN ───────────────────────────────────────────────────────────────────
  syncVpnIp,
  updateVpnIp,
  testApiConnection,
  getVpnStatus,
  autoSyncVpnIp,
  getHealthStatus,
  getVpnIpPoolStats,
  getAllocatedVpnIp,
  getAllAllocatedVpnIps,
  getAvailableVpnIps,
  releaseVpnIp,
  updateVpnIpPool,
  createVpnIpPool,
});
