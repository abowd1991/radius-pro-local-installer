import { createContext, Fragment, useContext, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { FALLBACK_TIMEZONE, setActiveTimezone } from "@/lib/timezoneV6";

type TimezoneV6ContextValue = { timezone: string; isLoading: boolean };
const TimezoneV6Context = createContext<TimezoneV6ContextValue>({ timezone: FALLBACK_TIMEZONE, isLoading: false });

function isPublicPath(): boolean {
  if (typeof window === "undefined") return true;
  const path = window.location.pathname;
  return ["/auth", "/login", "/register", "/", "/home", "/onboarding", "/design-preview"].includes(path)
    || ["/check/", "/email-verification", "/store/"].some((prefix) => path.startsWith(prefix));
}

export function TimezoneV6Provider({ children }: { children: React.ReactNode }) {
  const enabled = !isPublicPath();
  const { data, isLoading } = trpc.timezone.getMySettings.useQuery(undefined, { enabled, retry: false, staleTime: 5 * 60_000 });
  const timezone = data?.ownerTimezone || data?.systemTimezone || FALLBACK_TIMEZONE;

  useEffect(() => { setActiveTimezone(timezone); }, [timezone]);
  const value = useMemo(() => ({ timezone, isLoading: enabled && isLoading }), [timezone, isLoading, enabled]);
  return <TimezoneV6Context.Provider value={value}><Fragment key={timezone}>{children}</Fragment></TimezoneV6Context.Provider>;
}

export function useTimezoneV6(): TimezoneV6ContextValue {
  return useContext(TimezoneV6Context);
}
