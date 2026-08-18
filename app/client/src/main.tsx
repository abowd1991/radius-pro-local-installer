import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { TimezoneV6Provider } from "./contexts/TimezoneV6Context";
// Using local auth page instead of OAuth
import "./index.css";

const queryClient = new QueryClient();

// Public routes that must NOT redirect to /auth even when unauthenticated
const PUBLIC_ROUTE_PREFIXES = ["/check/", "/email-verification", "/store/"];
const PUBLIC_ROUTE_EXACT = ["/auth", "/login", "/register", "/", "/home", "/onboarding", "/design-preview"];
const isPublicRoute = (): boolean => {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (PUBLIC_ROUTE_EXACT.includes(path)) return true;
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  // Never redirect on public pages (e.g. /check/:token card check page)
  if (isPublicRoute()) return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;

  window.location.href = "/auth";
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// Hide the inline loading screen once React takes over
const hideLoader = () => {
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.style.transition = 'opacity 0.3s ease';
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 350);
  }
};

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <TimezoneV6Provider><App /></TimezoneV6Provider>
    </QueryClientProvider>
  </trpc.Provider>
);

// React owns the root after the next paint; only then remove the static HTML loader.
requestAnimationFrame(() => requestAnimationFrame(hideLoader));
