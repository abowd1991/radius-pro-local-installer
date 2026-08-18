// USERS ROUTER - INDEX
import { router } from "../../_core/trpc";
import { list, getById, getMyClients, getClientsWithSubscription, getClientDetails, getActivityTimeline, getOnlineClients } from "./read";
import { updateStatus, activateClient, suspendClient, extendSubscription, changeClientPlan, changeRole, deleteUser, createClientByAdmin, changeClientPassword, bulkDelete, bulkSuspend, bulkActivate, updateClientByAdmin, forceActivateClient, getClientVerificationCode, sendClientActivation } from "./manage";
import { updateProfile, changePassword } from "./profile";

export const usersRouter = router({
  list,
  getById,
  getMyClients,
  getClientsWithSubscription,
  getClientDetails,
  getActivityTimeline,
  getOnlineClients,
  updateStatus,
  activateClient,
  suspendClient,
  extendSubscription,
  changeClientPlan,
  changeRole,
  delete: deleteUser,
  deleteUser,
  createClientByAdmin,
  changeClientPassword,
  bulkDelete,
  bulkSuspend,
  bulkActivate,
  updateClientByAdmin,
  forceActivateClient,
  getClientVerificationCode,
  sendClientActivation,
  updateProfile,
  changePassword,
});
