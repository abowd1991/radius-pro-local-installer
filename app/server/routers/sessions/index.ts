// SESSIONS ROUTER - INDEX
import { router } from "../../_core/trpc";
import { list, listByClient, getByUsername, getByNas, getVpnSessions, getStats, getUserUsage, getTimeBalance, getCardLookup, getLowTimeUsers, checkExpiredUsers, monitorStatus, mikrotikGetActiveUsers, checkUserTimeStatus } from "./read";
import { coaDisconnect, disconnect, disconnectUser, disconnectVpnSession, coaDisconnectUser, coaUpdateSession, changeUserSpeed, updateUserTimeout, bulkDisconnect, mikrotikChangeSpeed, mikrotikDisconnect } from "./actions";
import { generateMikroTikScript, generateFreeRadiusConfig, triggerMonitorCheck, startMonitor, stopMonitor } from "./monitor";

export const sessionsRouter = router({
  list,
  listByClient,
  getByUsername,
  getByNas,
  getVpnSessions,
  getStats,
  getUserUsage,
  getTimeBalance,
  getCardLookup,
  getLowTimeUsers,
  checkExpiredUsers,
  monitorStatus,
  mikrotikGetActiveUsers,
  checkUserTimeStatus,
  coaDisconnect,
  disconnect,
  disconnectUser,
  disconnectVpnSession,
  coaDisconnectUser,
  coaUpdateSession,
  changeUserSpeed,
  updateUserTimeout,
  bulkDisconnect,
  mikrotikChangeSpeed,
  mikrotikDisconnect,
  generateMikroTikScript,
  generateFreeRadiusConfig,
  triggerMonitorCheck,
  startMonitor,
  stopMonitor,
});
