import { router } from "../../_core/trpc";
import { list, get, history, getActiveSession, getCredentials, getSessions, getPaymentHistory, checkUsername, getActivityLog } from "./read";
import { create, update, suspend, activate, renew, disconnect, sendCustomSms } from "./manage";
import { deleteSubscriber } from "./manage";

export const subscribersRouter = router({
  list,
  get,
  history,
  getActiveSession,
  getCredentials,
  getSessions,
  getPaymentHistory,
  checkUsername,
  getActivityLog,
  create,
  update,
  suspend,
  activate,
  renew,
  delete: deleteSubscriber,
  disconnect,
  sendCustomSms,
});
