/**
 * CardCheck/Card Lookup live-session projection.
 * A radacct row is audit history; only a matching online_sessions row is live.
 */
export function isLiveSessionFromV2(
  acctSessionId: string | null | undefined,
  liveSessionIds: ReadonlySet<string>,
): boolean {
  return Boolean(acctSessionId && liveSessionIds.has(acctSessionId));
}

export function isOpenAccountingWithoutLiveSession(
  acctStopTime: unknown,
  acctSessionId: string | null | undefined,
  liveSessionIds: ReadonlySet<string>,
): boolean {
  return !acctStopTime && !isLiveSessionFromV2(acctSessionId, liveSessionIds);
}
