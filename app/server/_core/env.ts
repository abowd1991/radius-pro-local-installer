export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // VPS Management API (Port 8081 - App updates only)
  VPS_MANAGEMENT_URL: process.env.VPS_MANAGEMENT_URL ?? "http://127.0.0.1:8080",
  VPS_MANAGEMENT_API_KEY: process.env.VPS_MANAGEMENT_API_KEY ?? "",
  // Legacy VPS API (Port 8080 - RADIUS/VPN/DHCP status)
  VPS_LEGACY_URL: process.env.VPS_LEGACY_URL ?? "http://127.0.0.1:8080",
  // VPS_LEGACY_SECRET هو المفتاح التشغيلي الذي يطابق radius-pro-vpn-api.
  // MANAGEMENT_VPN_API_KEY يستخدم فقط كـfallback للمنشآت التي لا تملك المفتاح التشغيلي القديم.
  VPS_LEGACY_SECRET: process.env.VPS_LEGACY_SECRET ?? process.env.VPS_MANAGEMENT_SECRET ?? process.env.MANAGEMENT_VPN_API_KEY ?? "",
  // VPS SSH Access (kept for legacy/fallback use)
  VPS_SSH_HOST: process.env.VPS_SSH_HOST ?? "127.0.0.1",
  VPS_SSH_PORT: process.env.VPS_SSH_PORT ?? "1991",
  VPS_SSH_USER: process.env.VPS_SSH_USER ?? "root",
  VPS_SSH_PRIVATE_KEY_B64: process.env.VPS_SSH_PRIVATE_KEY_B64 ?? "",
  VPS_SSH_PASS: process.env.VPS_SSH_PASS ?? "",
  // Public address used in user-facing provisioning, Winbox and CardCheck links.
  // Installer sets this automatically from the detected public IPv4.
  VPS_PUBLIC_IP: process.env.VPS_PUBLIC_IP ?? process.env.VPS_SSH_HOST ?? "",
  // VPS CoA API Service (Port 8082 - HTTP-based radclient execution)
  VPS_COA_API_URL: process.env.VPS_COA_API_URL ?? "http://127.0.0.1:8082",
  VPS_COA_API_KEY: process.env.VPS_COA_API_KEY ?? "",
  // GitHub Deploy Token (for triggering GitHub Actions)
  GITHUB_DEPLOY_TOKEN: process.env.GITHUB_DEPLOY_TOKEN ?? "",
  GITHUB_REPO: process.env.GITHUB_REPO ?? "abowd1991/radius-saas",
  // Redis Cache (optional — falls back to in-memory if not set)
  REDIS_URL: process.env.REDIS_URL ?? "",
};
