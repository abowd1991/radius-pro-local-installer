import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, json, bigint, index, uniqueIndex, datetime, smallint } from "drizzle-orm/mysql-core";

// ============================================================================
// USERS & AUTHENTICATION
// ============================================================================

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(), // Optional for traditional auth
  username: varchar("username", { length: 64 }).unique(), // For traditional auth
  passwordHash: varchar("passwordHash", { length: 255 }), // For traditional auth
  name: text("name"),
  companyName: varchar("companyName", { length: 255 }),
  email: varchar("email", { length: 320 }).unique(),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["owner", "super_admin", "client_owner", "client_admin", "client_staff", "reseller", "client", "support"]).default("client").notNull(),
  ownerId: int("ownerId"), // Tenant/Client owner (null for Owner himself)
  resellerId: int("resellerId"), // For clients: their reseller ID
  tenantId: int("tenantId"), // For sub-admins: their parent client_owner ID
  status: mysqlEnum("status", ["active", "suspended", "inactive"]).default("active").notNull(),
  // Removed old subscription system - now using balance-only system
  // Permission Plan (for global permission management)
  permissionPlanId: int("permissionPlanId"), // Reference to permission_plans
  // SaaS Billing (Daily - $0.33 per NAS per day)
  billingStartAt: timestamp("billingStartAt"), // When billing cycle starts (1st of month)
  lastDailyBillingDate: timestamp("lastDailyBillingDate"), // Last daily billing date
  dailyBillingEnabled: boolean("dailyBillingEnabled").default(true).notNull(),
  billingStatus: mysqlEnum("billingStatus", ["active", "past_due", "suspended"]).default("active").notNull(),
  lowBalanceNotifiedAt: timestamp("lowBalanceNotifiedAt"), // Last low balance notification time
  smsLowBalanceSentAt: timestamp("smsLowBalanceSentAt"), // SMS sent once when balance reaches $1 - reset when balance topped up above $1
  language: mysqlEnum("language", ["ar", "en"]).default("ar").notNull(),
  // IANA timezone used for reports and calendar boundaries. Stored timestamps remain UTC.
  timezone: varchar("timezone", { length: 64 }).default("Asia/Gaza").notNull(),
  preferredCurrency: mysqlEnum("preferredCurrency", ["USD", "ILS", "JOD", "SAR", "AED", "EGP", "YER"]).default("USD").notNull(),
  avatarUrl: text("avatarUrl"),
  emailVerified: boolean("emailVerified").default(false),
  emailVerificationCode: varchar("emailVerificationCode", { length: 10 }),
  emailVerificationExpires: timestamp("emailVerificationExpires"),
  passwordResetCode: varchar("passwordResetCode", { length: 10 }),
  passwordResetExpires: timestamp("passwordResetExpires"),
  trialExpirationNotified: boolean("trialExpirationNotified").default(false),
  onboardingCompleted: boolean("onboardingCompleted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => ({
  // Index for role-based queries (WHERE role = 'client')
  roleIdx: index("users_role_idx").on(table.role),
  // Index for tenant sub-admin queries (WHERE tenantId = ?)
  tenantIdIdx: index("users_tenant_id_idx").on(table.tenantId),
  // Index for reseller-based queries (WHERE resellerId = ?)
  resellerIdIdx: index("users_reseller_id_idx").on(table.resellerId),
  // Composite index for billing analytics (WHERE role = 'client' AND billingStatus = ?)
  roleBillingStatusIdx: index("users_role_billing_status_idx").on(table.role, table.billingStatus),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================================
// RESELLER PROFILES (Extended info for resellers)
// ============================================================================

export const resellerProfiles = mysqlTable("reseller_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  companyName: varchar("companyName", { length: 255 }),
  companyAddress: text("companyAddress"),
  taxNumber: varchar("taxNumber", { length: 50 }),
  commissionRate: decimal("commissionRate", { precision: 5, scale: 2 }).default("0.00"),
  creditLimit: decimal("creditLimit", { precision: 12, scale: 2 }).default("0.00"),
  canCreateCards: boolean("canCreateCards").default(true),
  maxClients: int("maxClients").default(100),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ResellerProfile = typeof resellerProfiles.$inferSelect;
export type InsertResellerProfile = typeof resellerProfiles.$inferInsert;

// ============================================================================
// TENANT SUBSCRIPTIONS
// ============================================================================

export const tenantSubscriptions = mysqlTable("tenant_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().unique(), // User ID of the tenant
  status: mysqlEnum("status", ["active", "expired", "suspended", "cancelled"]).default("active").notNull(),
  pricePerMonth: decimal("pricePerMonth", { precision: 10, scale: 2 }).default("10.00").notNull(),
  startDate: timestamp("startDate").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastRenewalDate: timestamp("lastRenewalDate"),
  renewedBy: int("renewedBy"), // Admin who renewed
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TenantSubscription = typeof tenantSubscriptions.$inferSelect;
export type InsertTenantSubscription = typeof tenantSubscriptions.$inferInsert;

// ============================================================================
// INTERNET PLANS / PACKAGES
// ============================================================================

export const plans = mysqlTable("plans", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(), // Owner (client/reseller) who created this plan
  name: varchar("name", { length: 100 }).notNull(),
  nameAr: varchar("nameAr", { length: 100 }),
  description: text("description"),
  descriptionAr: text("descriptionAr"),
  downloadSpeed: int("downloadSpeed").notNull(), // in Kbps
  uploadSpeed: int("uploadSpeed").notNull(), // in Kbps
  dataLimit: bigint("dataLimit", { mode: "number" }), // in bytes, null = unlimited
  // Validity settings
  validityType: mysqlEnum("validityType", ["minutes", "hours", "days"]).default("days").notNull(),
  validityValue: int("validityValue").notNull().default(30), // e.g., 30 days, 24 hours, etc.
  validityStartFrom: mysqlEnum("validityStartFrom", ["first_login", "card_creation"]).default("first_login").notNull(),
  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  resellerPrice: decimal("resellerPrice", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(), // Currency of the price (set from owner's preferredCurrency)
  // RADIUS attributes
  simultaneousUse: int("simultaneousUse").default(1), // Simultaneous-Use attribute
  sessionTimeout: int("sessionTimeout"), // Session-Timeout in seconds
  idleTimeout: int("idleTimeout"), // Idle-Timeout in seconds
  // MikroTik specific
  poolName: varchar("poolName", { length: 50 }),
  mikrotikRateLimit: varchar("mikrotikRateLimit", { length: 100 }), // e.g., "10M/5M" for 10Mbps down/5Mbps up
  mikrotikAddressPool: varchar("mikrotikAddressPool", { length: 50 }),
  // Auto-Disconnect: قطع الجلسة القديمة تلقائياً عند محاولة دخول جديدة
  autoDisconnect: boolean("autoDisconnect").default(false).notNull(), // true = enabled, false = disabled
  // NAS Restriction: if set, cards from this plan only work on this specific NAS
  // NULL = no restriction (works on all NAS devices of the owner) — safe default for existing plans
  restrictedNasId: int("restrictedNasId"),
  // Multi-NAS Restriction: JSON array of NAS IDs e.g. '[1,3,5]'
  // When set, cards only work on NAS devices in this list (takes precedence over restrictedNasId)
  // NULL = use restrictedNasId logic (backward compatible)
  restrictedNasIds: text("restrictedNasIds"), // JSON: number[] | null
  // Service type
  serviceType: mysqlEnum("serviceType", ["pppoe", "hotspot", "vpn", "all"]).default("all").notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Index for owner-based plan list (WHERE ownerId = ?)
  ownerIdIdx: index("plans_owner_id_idx").on(table.ownerId),
}));

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;

// ============================================================================
// NAS DEVICES (MikroTik Routers) - FreeRADIUS Compatible
// ============================================================================

export const nasDevices = mysqlTable("nas", {
  id: int("id").autoincrement().primaryKey(),
  nasname: varchar("nasname", { length: 128 }).notNull().unique(), // IP Address
  shortname: varchar("shortname", { length: 32 }),
  type: varchar("type", { length: 30 }).default("other"),
  ports: int("ports"),
  secret: varchar("secret", { length: 60 }).notNull(),
  server: varchar("server", { length: 64 }),
  community: varchar("community", { length: 50 }),
  description: varchar("description", { length: 200 }),
  connectionType: mysqlEnum("connectionType", ["public_ip", "vpn_sstp", "vpn_l2tp", "vpn_pptp"]).default("public_ip"),
  // VPN credentials for SSTP/L2TP connections
  vpnUsername: varchar("vpnUsername", { length: 64 }),
  vpnPassword: varchar("vpnPassword", { length: 128 }),
  vpnTunnelIp: varchar("vpnTunnelIp", { length: 45 }), // Assigned IP after VPN connects
  // Trusted LAN behind the NAS tunnel, e.g. 192.168.80.0/24.
  // Used to prove Port Forwarding targets belong to this NAS.
  lanCidr: varchar("lanCidr", { length: 18 }),
  // Extended fields for our system
  ownerId: int("ownerId").notNull(), // Owner user ID for multi-tenancy
  location: varchar("location", { length: 255 }),
  // NULL inherits the owning account timezone; a value overrides reports for this network.
  timezone: varchar("timezone", { length: 64 }),
  // MikroTik API settings (optional - for instant speed changes)
  apiEnabled: boolean("apiEnabled").default(false), // Enable/disable API access
  mikrotikApiPort: int("mikrotikApiPort").default(8728),
  mikrotikApiUser: varchar("mikrotikApiUser", { length: 64 }),
  mikrotikApiPassword: varchar("mikrotikApiPassword", { length: 128 }),
  // Winbox Remote Access (TCP Port Forward via socat on VPS)
  winboxPort: int("winboxPort"), // Unique port on VPS for Winbox access (e.g. 45000-49999)
  winboxEnabled: boolean("winboxEnabled").default(false), // Whether socat forward is active
  mikrotikWinboxPort: int("mikrotikwinboxport").default(8291), // Port of Winbox on the MikroTik device itself (default 8291)
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  lastSeen: timestamp("lastSeen"),
  // Two-Phase Auto Provisioning fields
  provisioningStatus: mysqlEnum("provisioningStatus", ["pending", "provisioning", "ready", "error"]).default("pending"),
  allocatedIp: varchar("allocatedIp", { length: 45 }),
  lastTempIp: varchar("lastTempIp", { length: 45 }),
  lastMac: varchar("lastMac", { length: 17 }),
  provisionedAt: timestamp("provisionedAt"),
  provisioningError: text("provisioningError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Index for owner-based NAS list (WHERE ownerId = ?)
  ownerIdIdx: index("nas_owner_id_idx").on(table.ownerId),
  // Index for status filter (WHERE status = 'active')
  statusIdx: index("nas_status_idx").on(table.status),
}));

export type NasDevice = typeof nasDevices.$inferSelect;
export type InsertNasDevice = typeof nasDevices.$inferInsert;

// ============================================================================
// FREERADIUS CORE TABLES
// ============================================================================

// radcheck - Authentication check attributes
export const radcheck = mysqlTable("radcheck", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull(),
  attribute: varchar("attribute", { length: 64 }).notNull(),
  op: varchar("op", { length: 2 }).default(":=").notNull(),
  value: varchar("value", { length: 253 }).notNull(),
}, (table) => ({
  // Composite index for Auth-Type lookup: WHERE username = ? AND attribute = ?
  usernameAttributeIdx: uniqueIndex("username_attribute_unique").on(table.username, table.attribute),
  // Index for username-only lookups
  usernameIdx: index("radcheck_username_idx").on(table.username),
}));

export type Radcheck = typeof radcheck.$inferSelect;
export type InsertRadcheck = typeof radcheck.$inferInsert;

// radreply - Reply attributes sent to NAS
export const radreply = mysqlTable("radreply", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull(),
  attribute: varchar("attribute", { length: 64 }).notNull(),
  op: varchar("op", { length: 2 }).default("=").notNull(),
  value: varchar("value", { length: 253 }).notNull(),
}, (table) => ({
  // Composite index for Session-Timeout lookup: WHERE username = ? AND attribute = ?
  usernameAttributeIdx: uniqueIndex("username_attribute_unique").on(table.username, table.attribute),
  // Index for username-only lookups (batch delete/select)
  usernameIdx: index("radreply_username_idx").on(table.username),
}));

export type Radreply = typeof radreply.$inferSelect;
export type InsertRadreply = typeof radreply.$inferInsert;

// radgroupcheck - Group check attributes
export const radgroupcheck = mysqlTable("radgroupcheck", {
  id: int("id").autoincrement().primaryKey(),
  groupname: varchar("groupname", { length: 64 }).notNull(),
  attribute: varchar("attribute", { length: 64 }).notNull(),
  op: varchar("op", { length: 2 }).default(":=").notNull(),
  value: varchar("value", { length: 253 }).notNull(),
});

export type Radgroupcheck = typeof radgroupcheck.$inferSelect;
export type InsertRadgroupcheck = typeof radgroupcheck.$inferInsert;

// radgroupreply - Group reply attributes
export const radgroupreply = mysqlTable("radgroupreply", {
  id: int("id").autoincrement().primaryKey(),
  groupname: varchar("groupname", { length: 64 }).notNull(),
  attribute: varchar("attribute", { length: 64 }).notNull(),
  op: varchar("op", { length: 2 }).default("=").notNull(),
  value: varchar("value", { length: 253 }).notNull(),
});

export type Radgroupreply = typeof radgroupreply.$inferSelect;
export type InsertRadgroupreply = typeof radgroupreply.$inferInsert;

// radusergroup - User to group mapping
export const radusergroup = mysqlTable("radusergroup", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull(),
  groupname: varchar("groupname", { length: 64 }).notNull(),
  priority: int("priority").default(1).notNull(),
}, (table) => ({
  // Critical FreeRADIUS index: WHERE username = ? (used in every auth request)
  usernameIdx: index("radusergroup_username_idx").on(table.username),
  // Composite index for group membership check: WHERE username = ? AND groupname = ?
  usernameGroupIdx: index("radusergroup_username_group_idx").on(table.username, table.groupname),
}));

export type Radusergroup = typeof radusergroup.$inferSelect;
export type InsertRadusergroup = typeof radusergroup.$inferInsert;

// radhuntgroup - NAS to group mapping (NAS Isolation)
export const radhuntgroup = mysqlTable("radhuntgroup", {
  id: int("id").autoincrement().primaryKey(),
  groupname: varchar("groupname", { length: 64 }).notNull(),
  nasipaddress: varchar("nasipaddress", { length: 15 }).notNull(),
  nasportid: varchar("nasportid", { length: 15 }),
}, (table) => ({
  // Critical FreeRADIUS index: WHERE nasipaddress = ? (NAS isolation lookup)
  nasipaddressIdx: index("radhuntgroup_nasipaddress_idx").on(table.nasipaddress),
  // Composite index: WHERE groupname = ? AND nasipaddress = ?
  groupNasIdx: index("radhuntgroup_group_nas_idx").on(table.groupname, table.nasipaddress),
}));

export type Radhuntgroup = typeof radhuntgroup.$inferSelect;
export type InsertRadhuntgroup = typeof radhuntgroup.$inferInsert;

// radacct - Accounting data
export const radacct = mysqlTable("radacct", {
  radacctid: bigint("radacctid", { mode: "number" }).autoincrement().primaryKey(),
  acctsessionid: varchar("acctsessionid", { length: 64 }).notNull(),
  acctuniqueid: varchar("acctuniqueid", { length: 32 }).notNull().unique(),
  username: varchar("username", { length: 64 }).notNull(),
  realm: varchar("realm", { length: 64 }),
  nasipaddress: varchar("nasipaddress", { length: 15 }).notNull(),
  nasportid: varchar("nasportid", { length: 32 }),
  nasporttype: varchar("nasporttype", { length: 32 }),
  acctstarttime: timestamp("acctstarttime"),
  acctupdatetime: timestamp("acctupdatetime"),
  acctstoptime: timestamp("acctstoptime"),
  acctinterval: int("acctinterval"),
  acctsessiontime: int("acctsessiontime"),
  acctauthentic: varchar("acctauthentic", { length: 32 }),
  connectinfo_start: varchar("connectinfo_start", { length: 50 }),
  connectinfo_stop: varchar("connectinfo_stop", { length: 50 }),
  acctinputoctets: bigint("acctinputoctets", { mode: "number" }),
  acctoutputoctets: bigint("acctoutputoctets", { mode: "number" }),
  calledstationid: varchar("calledstationid", { length: 50 }),
  callingstationid: varchar("callingstationid", { length: 50 }),
  acctterminatecause: varchar("acctterminatecause", { length: 32 }),
  servicetype: varchar("servicetype", { length: 32 }),
  framedprotocol: varchar("framedprotocol", { length: 32 }),
  framedipaddress: varchar("framedipaddress", { length: 15 }),
  framedipv6address: varchar("framedipv6address", { length: 45 }),
  framedipv6prefix: varchar("framedipv6prefix", { length: 45 }),
  framedinterfaceid: varchar("framedinterfaceid", { length: 44 }),
  delegatedipv6prefix: varchar("delegatedipv6prefix", { length: 45 }),
}, (table) => ({
  // PRIMARY PERFORMANCE INDEX: Covers the main batch query
  // SELECT SUM(acctsessiontime) WHERE username IN (...) AND acctstoptime IS NOT NULL
  // Also covers: WHERE username IN (...) AND acctstoptime IS NULL (active sessions)
  usernameStoptimeIdx: index("idx_radacct_username_stoptime").on(table.username, table.acctstoptime),
  // CRITICAL: Index for CentralAccounting (runs every 60s): WHERE acctstoptime IS NULL
  // Before: TableFullScan 312,469 rows → After: IndexRangeScan ~600 rows
  stoptimeIdx: index("idx_radacct_stoptime").on(table.acctstoptime),
  // Composite index (stoptime, username) — used in some reporting queries
  stoptimeUserIdx: index("idx_radacct_stoptime_user").on(table.acctstoptime, table.username),
  // Index for username-only queries (getUserTimeDetails, forceSyncUserUsage)
  usernameIdx: index("radacct_username_idx").on(table.username),
  // Composite index for historical queries: WHERE username = ? ORDER BY acctstarttime DESC
  // Used by card detail page (last sessions list)
  usernameStarttimeIdx: index("idx_radacct_username_starttime").on(table.username, table.acctstarttime),
  // Index for start time ordering (backfillFirstUseAt, stale session cleanup)
  starttimeIdx: index("radacct_starttime_idx").on(table.acctstarttime),
  // Index for unique session lookup (disconnect/update operations)
  // acctuniqueid has .unique() on the column itself → VPS has radacct_acctuniqueid_unique
  // No need to duplicate here; the column-level unique() covers it.
  // M-09 fix: Index for nasipaddress — used in GROUP BY nasipaddress (reports/vpn)
  // and in getActiveSessionsByOwner JOIN queries.
  nasipaddressIdx: index("idx_radacct_nasipaddress").on(table.nasipaddress),
  // Index for session ID lookup
  acctSessionIdIdx: index("idx_radacct_acctsessionid").on(table.acctsessionid),
  // Composite index for stale session cleanup:
  // WHERE acctstoptime IS NULL AND acctupdatetime < threshold
  stoptimeUpdatetimeIdx: index("radacct_stoptime_updatetime_idx").on(table.acctstoptime, table.acctupdatetime),
}));
export type Radacct = typeof radacct.$inferSelect;
export type InsertRadacct = typeof radacct.$inferInsert;

// radpostauth - Post-authentication log
export const radpostauth = mysqlTable("radpostauth", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull(),
  pass: varchar("pass", { length: 64 }),
  reply: varchar("reply", { length: 32 }),
  authdate: timestamp("authdate").defaultNow().notNull(),
}, (table) => ({
  // Index for username lookup (RadiusLogs page: WHERE username LIKE ?)
  usernameIdx: index("radpostauth_username_idx").on(table.username),
  // Index for authdate ordering (RadiusLogs page: ORDER BY authdate DESC)
  authdateIdx: index("radpostauth_authdate_idx").on(table.authdate),
  // Composite index for status filter + date range (WHERE reply = ? AND authdate >= ?)
  replyAuthdateIdx: index("radpostauth_reply_authdate_idx").on(table.reply, table.authdate),
}));

export type Radpostauth = typeof radpostauth.$inferSelect;
export type InsertRadpostauth = typeof radpostauth.$inferInsert;

// ============================================================================
// RADIUS CARDS (Real RADIUS Accounts)
// ============================================================================

export const radiusCards = mysqlTable("radius_cards", {
  id: int("id").autoincrement().primaryKey(),
  // RADIUS credentials
  username: varchar("username", { length: 64 }).notNull(), // Unique per owner only (Smart Namespace Isolation)
  // Immutable identity for this specific card lifecycle. A username may be reused
  // after deletion, but it must never inherit usage or sessions from this instance.
  lifecycleId: varchar("lifecycleId", { length: 36 }).notNull().unique(),
  password: varchar("password", { length: 64 }), // nullable for username-only auth
  authType: mysqlEnum("authType", ["password", "username-only"]).default("password").notNull(), // username-only = no password required (Auth-Type := Accept)
  // Card info
  serialNumber: varchar("serialNumber", { length: 20 }).notNull().unique(),
  batchId: varchar("batchId", { length: 50 }),
  planId: int("planId").notNull(),
  // Ownership
  createdBy: int("createdBy").notNull(),
  resellerId: int("resellerId"),
  usedBy: int("usedBy"),
  // Status
  status: mysqlEnum("status", ["unused", "reserved", "active", "used", "expired", "suspended", "cancelled"]).default("unused").notNull(),
  // Store Order Reservation (Atomic reservation to prevent race conditions)
  reservedOrderId: int("reservedOrderId"), // Store order ID that reserved this card
  reservedAt: timestamp("reservedAt"), // When reserved (used to expire reservations after 60 min)
  // Validity tracking
  activatedAt: timestamp("activatedAt"),
  firstLoginAt: timestamp("firstLoginAt"),
  expiresAt: timestamp("expiresAt"),
  // Usage tracking
  totalSessionTime: int("totalSessionTime").default(0), // in seconds
  totalDataUsed: bigint("totalDataUsed", { mode: "number" }).default(0), // in bytes
  lastActivity: timestamp("lastActivity"),
  // Time Budget System (Customer-Defined Window + Usage Budget)
  usageBudgetSeconds: int("usageBudgetSeconds").default(0), // Total usage time allowed (deducted while connected)
  windowSeconds: int("windowSeconds").default(0), // Validity window duration from first use
  firstUseAt: timestamp("firstUseAt"), // When card was first used (triggers window start)
  lastUsedAt: timestamp("lastUsedAt"), // Last time the card was used (updated on each session start)
  windowEndTime: timestamp("windowEndTime"), // When the validity window expires
  // Incremental Accounting V2: Renewal Anchor
  // When a card is renewed while a session is active, this stores the session time at renewal moment.
  // On session close: addedTime = sessionTime_at_close - renewalAnchorSessionTime
  // This prevents the pre-renewal session time from being counted against the new card budget.
  renewalAnchorSessionTime: int("renewalAnchorSessionTime"), // null = no active renewal anchor
  // Pricing
  purchasePrice: decimal("purchasePrice", { precision: 10, scale: 2 }),
  salePrice: decimal("salePrice", { precision: 10, scale: 2 }),
  // Concurrent sessions
  simultaneousUse: int("simultaneousUse").default(1), // Max simultaneous sessions allowed
  // Metadata
  fullName: varchar("fullName", { length: 255 }), // For manual cards: customer full name
  phone: varchar("phone", { length: 30 }), // For manual cards: customer phone number
  notes: text("notes"),
  macAddress: varchar("macAddress", { length: 17 }), // Optional: lock card to specific device MAC (format: AA:BB:CC:DD:EE:FF)
  isManual: boolean("isManual").default(false).notNull(), // true = created manually (not bulk generated)
  expiryReminderSentAt: timestamp("expiryReminderSentAt"), // When 24h expiry reminder was sent (null = not sent yet)
  // NAS tracking (set once on first use, updated on each Accounting Start)
  firstNasId: int("firstNasId"), // FK → nas.id — NAS where card was first activated (written once)
  lastNasId: int("lastNasId"),  // FK → nas.id — NAS where card was last seen (updated on Accounting Start)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Index for username lookup (most frequent operation in accounting)
  usernameIdx: index("radius_cards_username_idx").on(table.username),

  // Composite index for expired cards cleanup:
  // WHERE status IN ('active') AND windowEndTime < NOW()
  statusWindowIdx: index("radius_cards_status_window_idx").on(table.status, table.windowEndTime),

  // Index for owner-based queries (list cards by owner/reseller)
  createdByIdx: index("radius_cards_created_by_idx").on(table.createdBy),

  // Index for batch-based queries (list cards by batchId)
  batchIdIdx: index("radius_cards_batch_id_idx").on(table.batchId),

  // Index for expiry-based queries (find expiring cards)
  expiresAtIdx: index("radius_cards_expires_at_idx").on(table.expiresAt),

  // UNIQUE: same username cannot exist for two different owners (prevents cross-client accounting collisions)
  ownerUsernameUniq: uniqueIndex("radius_cards_owner_username_uniq").on(table.createdBy, table.username),
  lifecycleIdIdx: index("radius_cards_lifecycle_id_idx").on(table.lifecycleId),
}));
export type RadiusCard = typeof radiusCards.$inferSelect;
export type InsertRadiusCard = typeof radiusCards.$inferInsert;

// ============================================================================
// CARD LIFECYCLES — Immutable audit identity independent of RADIUS username
// ============================================================================
// `radius_cards` represents the current, editable card. This table preserves the
// identity of each issuance even after the current card row is deleted and the
// same username is issued again.
export const cardLifecycles = mysqlTable("card_lifecycles", {
  lifecycleId: varchar("lifecycleId", { length: 36 }).primaryKey(),
  cardId: int("cardId"),
  username: varchar("username", { length: 64 }).notNull(),
  ownerId: int("ownerId").notNull(),
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  closeReason: varchar("closeReason", { length: 64 }),
}, (table) => ({
  usernameOwnerIdx: index("card_lifecycles_username_owner_idx").on(table.username, table.ownerId),
  currentCardIdx: index("card_lifecycles_card_id_idx").on(table.cardId),
}));
export type CardLifecycle = typeof cardLifecycles.$inferSelect;
export type InsertCardLifecycle = typeof cardLifecycles.$inferInsert;

// Every Accounting session is bound at Start to the lifecycle that was current
// at that moment. This binding survives a later delete/re-create of the username.
export const cardLifecycleSessions = mysqlTable("card_lifecycle_sessions", {
  id: int("id").autoincrement().primaryKey(),
  lifecycleId: varchar("lifecycleId", { length: 36 }).notNull(),
  cardId: int("cardId"),
  username: varchar("username", { length: 64 }).notNull(),
  acctSessionId: varchar("acctSessionId", { length: 64 }).notNull(),
  acctUniqueId: varchar("acctUniqueId", { length: 64 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
}, (table) => ({
  uniqueSessionIdx: uniqueIndex("card_lifecycle_sessions_acct_unique_idx").on(table.acctUniqueId),
  sessionIdIdx: index("card_lifecycle_sessions_acct_session_idx").on(table.acctSessionId),
  lifecycleIdx: index("card_lifecycle_sessions_lifecycle_idx").on(table.lifecycleId),
}));
export type CardLifecycleSession = typeof cardLifecycleSessions.$inferSelect;
export type InsertCardLifecycleSession = typeof cardLifecycleSessions.$inferInsert;

// ============================================================================
// CARD SALES LEDGER
// ============================================================================
// توليد الكرت أو تفعيله لا يعني بالضرورة أنه بيع. هذا الجدول يسجل فقط حدث
// بيع/تسليم صريحاً، ويحتفظ بسعره والعملة كما كانا عند البيع.
export const cardSales = mysqlTable("card_sales", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  cardId: int("cardId").notNull().unique(),
  ownerId: int("ownerId").notNull(),
  planId: int("planId").notNull(),
  salePrice: decimal("salePrice", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  soldAt: timestamp("soldAt").defaultNow().notNull(),
  saleNasId: int("saleNasId"),
  source: mysqlEnum("source", ["store", "manual", "legacy_import"]).default("manual").notNull(),
  referenceType: varchar("referenceType", { length: 50 }),
  referenceId: int("referenceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  ownerSoldAtIdx: index("card_sales_owner_sold_at_idx").on(table.ownerId, table.soldAt),
  planSoldAtIdx: index("card_sales_plan_sold_at_idx").on(table.planId, table.soldAt),
  nasSoldAtIdx: index("card_sales_nas_sold_at_idx").on(table.saleNasId, table.soldAt),
}));

export type CardSale = typeof cardSales.$inferSelect;
export type InsertCardSale = typeof cardSales.$inferInsert;

// ============================================================================
// CARD BATCHES (For PDF generation)
// ============================================================================

export const cardBatches = mysqlTable("card_batches", {
  id: int("id").autoincrement().primaryKey(),
  batchId: varchar("batchId", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  planId: int("planId").notNull(),
  createdBy: int("createdBy").notNull(),
  resellerId: int("resellerId"),
  quantity: int("quantity").notNull(),
  // Card design
  templateImageUrl: text("templateImageUrl"),
  cardsPerPage: int("cardsPerPage").default(8),
  qrCodeUrl: varchar("qrCodeUrl", { length: 255 }), // MikroTik login page URL
  // Generated files
  pdfUrl: text("pdfUrl"),
  csvUrl: text("csvUrl"),
  // Status
  status: mysqlEnum("status", ["generating", "completed", "failed"]).default("generating").notNull(),
  errorMessage: text("errorMessage"),
  // Batch control settings
  enabled: boolean("enabled").default(true).notNull(), // Enable/Disable all cards in batch
  simultaneousUse: int("simultaneousUse").default(1), // Number of devices allowed
  // Time settings (Legacy - kept for backward compatibility)
  cardTimeValue: int("cardTimeValue").default(0), // Card activation time
  cardTimeUnit: mysqlEnum("cardTimeUnit", ["hours", "days"]).default("hours"),
  internetTimeValue: int("internetTimeValue").default(0), // Internet time available
  internetTimeUnit: mysqlEnum("internetTimeUnit", ["hours", "days"]).default("hours"),
  timeFromActivation: boolean("timeFromActivation").default(true), // Count from activation
  // New Time Budget System
  usageBudgetSeconds: int("usageBudgetSeconds").default(0), // Total usage time allowed (deducted while connected)
  windowSeconds: int("windowSeconds").default(0), // Validity window duration from first use
  // Additional settings
  hotspotPort: varchar("hotspotPort", { length: 100 }), // Hotspot port restriction
  macBinding: boolean("macBinding").default(false), // MAC binding option
  prefix: varchar("prefix", { length: 20 }), // Card prefix
  usernameLength: int("usernameLength").default(6),
  passwordLength: int("passwordLength").default(4),
  cardPrice: decimal("cardPrice", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
}, (table) => ({
  // Index for owner-based queries (list batches by owner)
  createdByIdx: index("card_batches_created_by_idx").on(table.createdBy),
  // Index for reseller-based queries (list batches by reseller)
  resellerIdIdx: index("card_batches_reseller_id_idx").on(table.resellerId),
  // Index for date ordering (ORDER BY createdAt DESC)
  createdAtIdx: index("card_batches_created_at_idx").on(table.createdAt),
}));

export type CardBatch = typeof cardBatches.$inferSelect;
export type InsertCardBatch = typeof cardBatches.$inferInsert;

// ============================================================================
// WALLET / BALANCE
// ============================================================================

export const wallets = mysqlTable("wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0.00").notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  // Credit System (Overdraft)
  creditBalance: decimal("creditBalance", { precision: 12, scale: 2 }).default("0.00").notNull(), // Current debt
  maxCreditLimit: decimal("maxCreditLimit", { precision: 12, scale: 2 }).default("2.00").notNull(), // Max $2 overdraft
  creditActivatedAt: timestamp("creditActivatedAt"), // When credit was first used
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;

// ============================================================================
// TRANSACTIONS
// ============================================================================

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["deposit", "withdrawal", "card_purchase", "subscription", "refund", "commission"]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  balanceBefore: decimal("balanceBefore", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal("balanceAfter", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  referenceType: varchar("referenceType", { length: 50 }),
  referenceId: int("referenceId"),
  status: mysqlEnum("status", ["pending", "completed", "failed", "cancelled"]).default("completed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for user transaction history (WHERE userId = ? ORDER BY createdAt DESC)
  userIdCreatedAtIdx: index("transactions_user_id_created_at_idx").on(table.userId, table.createdAt),
  // Index for wallet-based queries
  walletIdIdx: index("transactions_wallet_id_idx").on(table.walletId),
}));

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ============================================================================
// INVOICES
// ============================================================================

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull().unique(),
  userId: int("userId").notNull(),
  resellerId: int("resellerId"),
  type: mysqlEnum("type", ["subscription", "card_purchase", "deposit", "other"]).notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 12, scale: 2 }).default("0.00").notNull(),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  status: mysqlEnum("status", ["draft", "pending", "paid", "cancelled", "refunded"]).default("pending").notNull(),
  dueDate: timestamp("dueDate"),
  paidAt: timestamp("paidAt"),
  paymentMethod: varchar("paymentMethod", { length: 50 }),
  paymentReference: varchar("paymentReference", { length: 255 }),
  notes: text("notes"),
  items: json("items"),
  pdfUrl: text("pdfUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Index for user invoice list (WHERE userId = ? ORDER BY createdAt DESC)
  userIdCreatedAtIdx: index("invoices_user_id_created_at_idx").on(table.userId, table.createdAt),
  // Index for status filter (WHERE status = 'pending')
  statusIdx: index("invoices_status_idx").on(table.status),
  // Composite index for user + status filter
  userIdStatusIdx: index("invoices_user_id_status_idx").on(table.userId, table.status),
}));

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

// ============================================================================
// CHAT MESSAGES
// ============================================================================

export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  senderId: int("senderId").notNull(),
  message: text("message").notNull(),
  attachmentUrl: text("attachmentUrl"),
  isRead: boolean("isRead").default(false),
  isReadByClient: boolean("isReadByClient").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for ticket messages (WHERE ticketId = ? ORDER BY createdAt ASC)
  ticketIdCreatedAtIdx: index("chat_messages_ticket_id_created_at_idx").on(table.ticketId, table.createdAt),
}));

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ============================================================================
// SUPPORT TICKETS
// ============================================================================

export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  ticketNumber: varchar("ticketNumber", { length: 20 }).notNull().unique(),
  userId: int("userId").notNull(),
  assignedTo: int("assignedTo"),
  subject: varchar("subject", { length: 255 }).notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "waiting", "resolved", "closed"]).default("open").notNull(),
  category: varchar("category", { length: 50 }),
  lastMessageAt: timestamp("lastMessageAt"),
  lastAiReplyAt: timestamp("lastAiReplyAt"), // Track last AI auto-reply time to prevent spam
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Index for user ticket list (WHERE userId = ? ORDER BY createdAt DESC)
  userIdCreatedAtIdx: index("support_tickets_user_id_created_at_idx").on(table.userId, table.createdAt),
  // Index for status filter (WHERE status = 'open')
  statusIdx: index("support_tickets_status_idx").on(table.status),
}));
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["invoice", "payment", "card", "support", "balance", "subscription", "system"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  titleAr: varchar("titleAr", { length: 255 }),
  message: text("message").notNull(),
  messageAr: text("messageAr"),
  data: json("data"),
  isRead: boolean("isRead").default(false),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for user notifications (WHERE userId = ? AND isRead = false ORDER BY createdAt DESC)
  userIdIsReadIdx: index("notifications_user_id_is_read_idx").on(table.userId, table.isRead),
  // Index for date ordering
  createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
}));

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ============================================================================
// PAYMENT GATEWAY SETTINGS
// ============================================================================

export const paymentGateways = mysqlTable("payment_gateways", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  displayName: varchar("displayName", { length: 100 }).notNull(),
  displayNameAr: varchar("displayNameAr", { length: 100 }),
  type: mysqlEnum("type", ["paypal", "stripe", "bank_of_palestine", "manual"]).notNull(),
  config: json("config"),
  isActive: boolean("isActive").default(false),
  testMode: boolean("testMode").default(true),
  supportedCurrencies: json("supportedCurrencies"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PaymentGateway = typeof paymentGateways.$inferSelect;
export type InsertPaymentGateway = typeof paymentGateways.$inferInsert;

// ============================================================================
// PAYMENTS
// ============================================================================

export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  userId: int("userId").notNull(),
  gatewayId: int("gatewayId").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "refunded"]).default("pending").notNull(),
  gatewayTransactionId: varchar("gatewayTransactionId", { length: 255 }),
  gatewayResponse: json("gatewayResponse"),
  errorMessage: text("errorMessage"),
  paidAt: timestamp("paidAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ============================================================================
// SYSTEM SETTINGS
// ============================================================================

export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  type: mysqlEnum("type", ["string", "number", "boolean", "json"]).default("string").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// ============================================================================
// ACTIVITY LOGS
// ============================================================================

export const activityLogs = mysqlTable("activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entityType", { length: 50 }),
  entityId: int("entityId"),
  details: json("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;

// ============================================================================
// CARD TEMPLATES (For PDF Design)
// ============================================================================

export const cardTemplates = mysqlTable("card_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  resellerId: int("resellerId"), // null = system template
  imageUrl: text("imageUrl").notNull(),
  imageKey: text("imageKey"), // S3 key for deletion
  
  // Username text settings
  usernameX: int("usernameX").default(50),
  usernameY: int("usernameY").default(40),
  usernameFontSize: int("usernameFontSize").default(14),
  usernameFontFamily: varchar("usernameFontFamily", { length: 50 }).default("Arial"),
  usernameFontColor: varchar("usernameFontColor", { length: 9 }).default("#000000"),
  usernameAlign: mysqlEnum("usernameAlign", ["left", "center", "right"]).default("center"),
  
  // Password text settings
  passwordX: int("passwordX").default(50),
  passwordY: int("passwordY").default(60),
  passwordFontSize: int("passwordFontSize").default(14),
  passwordFontFamily: varchar("passwordFontFamily", { length: 50 }).default("Arial"),
  passwordFontColor: varchar("passwordFontColor", { length: 9 }).default("#000000"),
  passwordAlign: mysqlEnum("passwordAlign", ["left", "center", "right"]).default("center"),
  
  // QR Code settings
  qrCodeEnabled: boolean("qrCodeEnabled").default(false),
  qrCodeX: int("qrCodeX").default(50),
  qrCodeY: int("qrCodeY").default(50),
  qrCodeSize: int("qrCodeSize").default(50),
  qrCodeDomain: varchar("qrCodeDomain", { length: 255 }), // IP or domain for QR
  
  // Card dimensions
  cardWidth: int("cardWidth").default(350),
  cardHeight: int("cardHeight").default(200),
  
  // Print settings
  cardsPerPage: int("cardsPerPage").default(8),
  marginTop: decimal("marginTop", { precision: 4, scale: 2 }).default("1.8"),
  marginHorizontal: decimal("marginHorizontal", { precision: 4, scale: 2 }).default("1.8"),
  columnsPerPage: int("columnsPerPage").default(5),
  
  isDefault: boolean("isDefault").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CardTemplate = typeof cardTemplates.$inferSelect;
export type InsertCardTemplate = typeof cardTemplates.$inferInsert;

// ============================================================================
// ONLINE SESSIONS (Real-time tracking)
// ============================================================================

export const onlineSessions = mysqlTable("online_sessions", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull(),
  cardId: int("cardId"),
  // null is valid for Broadband subscribers, which use a separate subscription domain.
  lifecycleId: varchar("lifecycleId", { length: 36 }),
  nasId: int("nasId"),
  nasIp: varchar("nas_ip", { length: 45 }),                          // Phase 2A: NAS IP
  acctSessionId: varchar("acctSessionId", { length: 64 }).notNull(),
  acctUniqueId: varchar("acctUniqueId", { length: 64 }),
  framedIpAddress: varchar("framedIpAddress", { length: 15 }),
  callingStationId: varchar("callingStationId", { length: 50 }), // MAC
  startTime: timestamp("startTime").defaultNow().notNull(),
  lastUpdate: timestamp("lastUpdate").defaultNow().notNull(),
  lastInterimAt: datetime("last_interim_at"),                        // Phase 2A: Last Interim-Update timestamp
  sessionTime: int("sessionTime").default(0), // seconds
  inputOctets: bigint("inputOctets", { mode: "number" }).default(0),
  outputOctets: bigint("outputOctets", { mode: "number" }).default(0),
}, (table) => ({
  // Safe Optimization: Indexes for frequent query patterns
  // Added 2026-07-26 — no logic change, pure performance
  usernameIdx: index("online_sessions_username_idx").on(table.username),
  acctSessionIdIdx: index("online_sessions_acct_session_id_idx").on(table.acctSessionId),
  acctUniqueIdIdx: index("online_sessions_acct_unique_id_idx").on(table.acctUniqueId),
  lifecycleIdIdx: index("online_sessions_lifecycle_id_idx").on(table.lifecycleId),
  framedIpIdx: index("online_sessions_framed_ip_idx").on(table.framedIpAddress),
  lastInterimAtIdx: index("online_sessions_last_interim_at_idx").on(table.lastInterimAt),
}));

export type OnlineSession = typeof onlineSessions.$inferSelect;
export type InsertOnlineSession = typeof onlineSessions.$inferInsert;


// ============================================================================
// INTERNAL NOTIFICATIONS
// ============================================================================

export const internalNotifications = mysqlTable("internal_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Target user (super_admin or reseller)
  type: mysqlEnum("type", [
    "card_expired",      // كرت انتهى وقته
    "card_expiring",     // كرت على وشك الانتهاء
    "nas_disconnected",  // NAS انقطع اتصاله
    "nas_reconnected",   // NAS عاد للاتصال
    "low_balance",       // رصيد منخفض
    "new_subscription",  // اشتراك جديد
    "subscription_expired", // اشتراك انتهى
    "system"             // إشعار نظام عام
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  entityType: varchar("entityType", { length: 50 }), // card, nas, user, etc.
  entityId: int("entityId"),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for user notifications (WHERE userId = ? AND isRead = false ORDER BY createdAt DESC)
  // Critical: called on every page load to show notification badge
  userIdIsReadCreatedAtIdx: index("internal_notif_user_id_is_read_created_at_idx").on(table.userId, table.isRead, table.createdAt),
}));

export type InternalNotification = typeof internalNotifications.$inferSelect;
export type InsertInternalNotification = typeof internalNotifications.$inferInsert;


// ============================================================================
// PPPoE SUBSCRIBERS (Monthly Prepaid Subscribers)
// ============================================================================

export const subscribers = mysqlTable("subscribers", {
  id: int("id").autoincrement().primaryKey(),
  
  // RADIUS credentials
  username: varchar("username", { length: 64 }).notNull().unique(),
  password: varchar("password", { length: 64 }).notNull(),
  
  // Owner (for multi-tenancy)
  ownerId: int("ownerId").notNull(), // Client/Reseller who owns this subscriber
  createdBy: int("createdBy").notNull(), // User who created this subscriber
  
  // Subscriber info
  fullName: varchar("fullName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  nationalId: varchar("nationalId", { length: 50 }), // رقم الهوية
  notes: text("notes"),
  
  // Service configuration
  planId: int("planId").notNull(), // Linked plan for speed/limits
  nasId: int("nasId"), // Optional: restrict to specific NAS
  
  // IP Assignment
  ipAssignmentType: mysqlEnum("ipAssignmentType", ["dynamic", "static"]).default("dynamic").notNull(),
  staticIp: varchar("staticIp", { length: 45 }), // If static IP assigned
  
  // RADIUS attributes
  simultaneousUse: int("simultaneousUse").default(1), // Number of concurrent sessions
  
  // Status
  status: mysqlEnum("status", ["active", "suspended", "expired", "pending"]).default("pending").notNull(),
  
  // Subscription dates
  subscriptionStartDate: timestamp("subscriptionStartDate"),
  subscriptionEndDate: timestamp("subscriptionEndDate"),
  
  // MAC binding (optional)
  macAddress: varchar("macAddress", { length: 17 }),
  macBindingEnabled: boolean("macBindingEnabled").default(false),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
  expiryReminderSentAt: timestamp("expiryReminderSentAt"), // When 24h expiry reminder was sent
}, (table) => ({
  // Index for owner-based subscriber list (WHERE ownerId = ? OR createdBy = ? ORDER BY createdAt DESC)
  ownerIdIdx: index("subscribers_owner_id_idx").on(table.ownerId),
  createdByIdx: index("subscribers_created_by_idx").on(table.createdBy),
  // Index for status filter (WHERE status = 'active')
  statusIdx: index("subscribers_status_idx").on(table.status),
  // Index for expiry reminder job (WHERE status = 'active' AND subscriptionEndDate <= ?)
  statusEndDateIdx: index("subscribers_status_end_date_idx").on(table.status, table.subscriptionEndDate),
}));

export type Subscriber = typeof subscribers.$inferSelect;
export type InsertSubscriber = typeof subscribers.$inferInsert;

// ============================================================================
// SUBSCRIBER SUBSCRIPTIONS (Payment/Renewal History)
// ============================================================================

export const subscriberSubscriptions = mysqlTable("subscriber_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  subscriberId: int("subscriberId").notNull(),
  
  // Subscription period
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  
  // Plan at time of subscription (for historical reference)
  planId: int("planId").notNull(),
  planName: varchar("planName", { length: 100 }).notNull(),
  
  // Payment info
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "wallet", "card", "bank_transfer", "online"]).default("cash").notNull(),
  
  // Status
  status: mysqlEnum("status", ["active", "expired", "cancelled", "refunded"]).default("active").notNull(),
  
  // Who processed this subscription
  processedBy: int("processedBy").notNull(),
  
  // Notes
  notes: text("notes"),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for subscriber history (WHERE subscriberId = ? ORDER BY createdAt DESC)
  subscriberIdCreatedAtIdx: index("subscriber_subs_subscriber_id_created_at_idx").on(table.subscriberId, table.createdAt),
}));

export type SubscriberSubscription = typeof subscriberSubscriptions.$inferSelect;
export type InsertSubscriberSubscription = typeof subscriberSubscriptions.$inferInsert;


// ============================================================================
// VPN CONNECTIONS STATUS (Real-time VPN monitoring)
// ============================================================================

export const vpnConnections = mysqlTable("vpn_connections", {
  id: int("id").autoincrement().primaryKey(),
  nasId: int("nasId").notNull().unique(), // Reference to nas table
  
  // Connection type (from NAS settings)
  connectionType: mysqlEnum("connectionType", ["public_ip", "vpn_sstp", "vpn_l2tp", "vpn_pptp"]).notNull(),
  
  // Connection status
  status: mysqlEnum("status", ["connected", "disconnected", "connecting", "error"]).default("disconnected").notNull(),
  
  // IP addresses
  localVpnIp: varchar("localVpnIp", { length: 45 }), // VPN tunnel IP assigned to NAS
  remoteIp: varchar("remoteIp", { length: 45 }), // Public IP of NAS
  serverIp: varchar("serverIp", { length: 45 }), // VPN server IP
  
  // Connection metrics
  uptime: int("uptime").default(0), // seconds since connection
  lastConnectedAt: timestamp("lastConnectedAt"),
  lastDisconnectedAt: timestamp("lastDisconnectedAt"),
  disconnectCount: int("disconnectCount").default(0), // Total disconnections
  
  // Last error info
  lastError: text("lastError"),
  lastErrorAt: timestamp("lastErrorAt"),
  
  // Traffic stats (optional)
  bytesIn: bigint("bytesIn", { mode: "number" }).default(0),
  bytesOut: bigint("bytesOut", { mode: "number" }).default(0),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VpnConnection = typeof vpnConnections.$inferSelect;
export type InsertVpnConnection = typeof vpnConnections.$inferInsert;

// ============================================================================
// VPN MANAGEMENT V2 — NAS identities, live sessions and immutable history
// ============================================================================

export const vpnIdentities = mysqlTable("vpn_identities", {
  id: int("id").autoincrement().primaryKey(),
  nasId: int("nasId").notNull().unique(),
  ownerId: int("ownerId").notNull(),
  vpnUsername: varchar("vpnUsername", { length: 64 }).notNull().unique(),
  protocol: mysqlEnum("protocol", ["l2tp", "pptp", "sstp"]).notNull(),
  allocatedIp: varchar("allocatedIp", { length: 45 }),
  provisioningStatus: mysqlEnum("provisioningStatus", ["pending", "ready", "error", "revoked"]).default("pending").notNull(),
  providerReference: varchar("providerReference", { length: 128 }),
  lastProvisionedAt: timestamp("lastProvisionedAt"),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerIdx: index("vpn_identities_owner_idx").on(table.ownerId),
  provisionIdx: index("vpn_identities_provision_idx").on(table.provisioningStatus),
}));

export type VpnIdentity = typeof vpnIdentities.$inferSelect;
export type InsertVpnIdentity = typeof vpnIdentities.$inferInsert;

/** مصدر الاتصال الحي الوحيد للـVPN؛ صف واحد فقط لكل هوية NAS. */
export const vpnLiveSessions = mysqlTable("vpn_live_sessions", {
  id: int("id").autoincrement().primaryKey(),
  vpnIdentityId: int("vpnIdentityId").notNull().unique(),
  nasId: int("nasId").notNull().unique(),
  ownerId: int("ownerId").notNull(),
  protocol: mysqlEnum("protocol", ["l2tp", "pptp", "sstp"]).notNull(),
  providerSessionId: varchar("providerSessionId", { length: 128 }),
  assignedIp: varchar("assignedIp", { length: 45 }),
  interfaceName: varchar("interfaceName", { length: 128 }),
  connectedAt: timestamp("connectedAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").notNull(),
  bytesIn: bigint("bytesIn", { mode: "number" }).default(0).notNull(),
  bytesOut: bigint("bytesOut", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerIdx: index("vpn_live_sessions_owner_idx").on(table.ownerId),
  lastSeenIdx: index("vpn_live_sessions_last_seen_idx").on(table.lastSeenAt),
}));

export type VpnLiveSession = typeof vpnLiveSessions.$inferSelect;
export type InsertVpnLiveSession = typeof vpnLiveSessions.$inferInsert;

/** تاريخ غير قابل لإعادة الاستخدام لكل اتصال VPN؛ لا يستخدم لتحديد online/offline. */
export const vpnSessionLifecycles = mysqlTable("vpn_session_lifecycles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  vpnIdentityId: int("vpnIdentityId").notNull(),
  nasId: int("nasId").notNull(),
  ownerId: int("ownerId").notNull(),
  protocol: mysqlEnum("protocol", ["l2tp", "pptp", "sstp"]).notNull(),
  providerSessionId: varchar("providerSessionId", { length: 128 }),
  assignedIp: varchar("assignedIp", { length: 45 }),
  connectedAt: timestamp("connectedAt").notNull(),
  lastSeenAt: timestamp("lastSeenAt").notNull(),
  disconnectedAt: timestamp("disconnectedAt"),
  closeReason: mysqlEnum("closeReason", ["normal", "manual", "disabled", "lost_carrier", "reprovisioned", "unknown"]),
  bytesIn: bigint("bytesIn", { mode: "number" }).default(0).notNull(),
  bytesOut: bigint("bytesOut", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  identityConnectedIdx: index("vpn_session_lifecycles_identity_connected_idx").on(table.vpnIdentityId, table.connectedAt),
  nasConnectedIdx: index("vpn_session_lifecycles_nas_connected_idx").on(table.nasId, table.connectedAt),
}));

export type VpnSessionLifecycle = typeof vpnSessionLifecycles.$inferSelect;
export type InsertVpnSessionLifecycle = typeof vpnSessionLifecycles.$inferInsert;

// ============================================================================
// VPN LOGS (Connection history and events)
// ============================================================================

export const vpnLogs = mysqlTable("vpn_logs", {
  id: int("id").autoincrement().primaryKey(),
  nasId: int("nasId").notNull(), // Reference to nas table
  vpnConnectionId: int("vpnConnectionId"), // Reference to vpn_connections
  
  // Event type
  eventType: mysqlEnum("eventType", [
    "connected",           // VPN connected successfully
    "disconnected",        // VPN disconnected
    "connection_failed",   // Connection attempt failed
    "reconnecting",        // Attempting to reconnect
    "auth_failed",         // Authentication failed
    "timeout",             // Connection timeout
    "manual_disconnect",   // Manual disconnect by admin
    "manual_restart",      // Manual restart by admin
    "error",               // General error
    "radius_error"         // RADIUS-related error
  ]).notNull(),
  
  // Event details
  message: text("message"),
  details: json("details"), // Additional JSON data
  
  // IP info at time of event
  localIp: varchar("localIp", { length: 45 }),
  remoteIp: varchar("remoteIp", { length: 45 }),
  
  // Error info (if applicable)
  errorCode: varchar("errorCode", { length: 50 }),
  errorMessage: text("errorMessage"),
  
  // Who triggered (for manual actions)
  triggeredBy: int("triggeredBy"), // User ID if manual action
  
  // Timestamp
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for NAS VPN log history (WHERE nasId = ? ORDER BY createdAt DESC)
  nasIdCreatedAtIdx: index("vpn_logs_nas_id_created_at_idx").on(table.nasId, table.createdAt),
}));

export type VpnLog = typeof vpnLogs.$inferSelect;
export type InsertVpnLog = typeof vpnLogs.$inferInsert;


// ============================================================================
// AUDIT LOGS (Security and compliance tracking)
// ============================================================================

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  
  // Who performed the action
  userId: int("userId").notNull(),
  userRole: varchar("userRole", { length: 50 }).notNull(),
  
  // What action was performed
  action: varchar("action", { length: 100 }).notNull(),
  
  // Target of the action
  targetType: varchar("targetType", { length: 50 }).notNull(), // session, nas, card, subscriber, user, vpn
  targetId: varchar("targetId", { length: 100 }), // ID of the target (username, session ID, etc.)
  targetName: varchar("targetName", { length: 255 }), // Human-readable name
  
  // NAS context (if applicable)
  nasId: int("nasId"),
  nasIp: varchar("nasIp", { length: 45 }),
  
  // Additional details (JSON)
  details: json("details"),
  
  // Result of the action
  result: mysqlEnum("result", ["success", "failure", "partial"]).notNull(),
  errorMessage: text("errorMessage"),
  
  // Request context
  ipAddress: varchar("ipAddress", { length: 45 }),
  
  // Timestamp
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for user audit history (WHERE userId = ? ORDER BY createdAt DESC)
  userIdCreatedAtIdx: index("audit_logs_user_id_created_at_idx").on(table.userId, table.createdAt),
  // Index for NAS-based audit queries (WHERE nasId = ? ORDER BY createdAt DESC)
  nasIdCreatedAtIdx: index("audit_logs_nas_id_created_at_idx").on(table.nasId, table.createdAt),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;


// ============================================================================
// VPN IP POOL (Static IP allocation for VPN NAS devices)
// ============================================================================

export const vpnIpPool = mysqlTable("vpn_ip_pool", {
  id: int("id").autoincrement().primaryKey(),
  
  // Pool configuration
  name: varchar("name", { length: 100 }).notNull().default("Default VPN Pool"),
  startIp: varchar("startIp", { length: 45 }).notNull(), // e.g., 192.168.30.10
  endIp: varchar("endIp", { length: 45 }).notNull(), // e.g., 192.168.30.250
  gateway: varchar("gateway", { length: 45 }).notNull().default("192.168.30.1"), // RADIUS server IP
  subnet: varchar("subnet", { length: 45 }).notNull().default("255.255.255.0"),
  
  // Status
  isActive: boolean("isActive").default(true).notNull(),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VpnIpPool = typeof vpnIpPool.$inferSelect;
export type InsertVpnIpPool = typeof vpnIpPool.$inferInsert;

// ============================================================================
// ALLOCATED VPN IPS (Track which IPs are assigned to which NAS)
// ============================================================================

export const allocatedVpnIps = mysqlTable("allocated_vpn_ips", {
  id: int("id").autoincrement().primaryKey(),
  
  // Pool reference
  poolId: int("poolId").notNull(),
  
  // Allocated IP
  ipAddress: varchar("ipAddress", { length: 45 }).notNull().unique(),
  
  // NAS assignment
  nasId: int("nasId").notNull().unique(), // One IP per NAS
  
  // Timestamps
  allocatedAt: timestamp("allocatedAt").defaultNow().notNull(),
});

export type AllocatedVpnIp = typeof allocatedVpnIps.$inferSelect;
export type InsertAllocatedVpnIp = typeof allocatedVpnIps.$inferInsert;


// ============================================================================
// SAAS PLANS (Commercial Subscription Plans)
// ============================================================================

export const saasPlans = mysqlTable("saas_plans", {
  id: int("id").autoincrement().primaryKey(),
  
  // Basic info
  name: varchar("name", { length: 100 }).notNull(),
  nameAr: varchar("nameAr", { length: 100 }),
  description: text("description"),
  descriptionAr: text("descriptionAr"),
  
  // Pricing
  priceMonthly: decimal("priceMonthly", { precision: 10, scale: 2 }).notNull(),
  priceYearly: decimal("priceYearly", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  
  // Limits
  maxNasDevices: int("maxNasDevices").notNull().default(1),
  maxCards: int("maxCards").notNull().default(100),
  maxSubscribers: int("maxSubscribers").default(50),
  
  // Features (JSON or individual booleans)
  featureMikrotikApi: boolean("featureMikrotikApi").default(false),
  featureCoaDisconnect: boolean("featureCoaDisconnect").default(true),
  featureStaticVpnIp: boolean("featureStaticVpnIp").default(false),
  featureAdvancedReports: boolean("featureAdvancedReports").default(false),
  featureCustomBranding: boolean("featureCustomBranding").default(false),
  featurePrioritySupport: boolean("featurePrioritySupport").default(false),
  
  // Display
  displayOrder: int("displayOrder").default(0),
  isPopular: boolean("isPopular").default(false),
  isActive: boolean("isActive").default(true).notNull(),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SaasPlan = typeof saasPlans.$inferSelect;
export type InsertSaasPlan = typeof saasPlans.$inferInsert;

// ============================================================================
// SAAS SUBSCRIPTIONS (User subscription history)
// ============================================================================

export const saasSubscriptions = mysqlTable("saas_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  
  // User reference
  userId: int("userId").notNull(),
  
  // Plan reference
  planId: int("planId").notNull(),
  planName: varchar("planName", { length: 100 }).notNull(), // Snapshot at time of subscription
  
  // Subscription period
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  
  // Billing
  billingCycle: mysqlEnum("billingCycle", ["monthly", "yearly"]).default("monthly").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  
  // Status
  status: mysqlEnum("status", ["active", "expired", "cancelled", "suspended"]).default("active").notNull(),
  
  // Payment info
  paymentMethod: varchar("paymentMethod", { length: 50 }),
  paymentReference: varchar("paymentReference", { length: 255 }),
  
  // Admin actions
  activatedBy: int("activatedBy"), // Admin who activated
  notes: text("notes"),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SaasSubscription = typeof saasSubscriptions.$inferSelect;
export type InsertSaasSubscription = typeof saasSubscriptions.$inferInsert;


// ============================================================================
// SMS LOGS (Track all sent SMS messages)
// ============================================================================

export const smsLogs = mysqlTable("sms_logs", {
  id: int("id").autoincrement().primaryKey(),
  
  // Recipient info
  phone: varchar("phone", { length: 20 }).notNull(),
  userId: int("userId"), // Optional: if sent to a registered user
  
  // Message content
  message: text("message").notNull(),
  templateId: int("templateId"), // Optional: if using a template
  
  // Delivery status
  status: mysqlEnum("status", ["pending", "sent", "delivered", "failed"]).default("pending").notNull(),
  smsId: varchar("smsId", { length: 100 }), // TweetSMS message ID
  errorCode: varchar("errorCode", { length: 20 }),
  errorMessage: text("errorMessage"),
  
  // Metadata
  type: mysqlEnum("type", ["manual", "bulk", "automatic"]).default("manual").notNull(),
  triggeredBy: varchar("triggeredBy", { length: 50 }), // e.g., "subscription_expiry", "admin_manual"
  sentBy: int("sentBy"), // Admin who sent (for manual)
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
}, (table) => ({
  // Index for user SMS history (WHERE userId = ? ORDER BY createdAt DESC)
  userIdCreatedAtIdx: index("sms_logs_user_id_created_at_idx").on(table.userId, table.createdAt),
}));

export type SmsLog = typeof smsLogs.$inferSelect;
export type InsertSmsLog = typeof smsLogs.$inferInsert;

// ============================================================================
// SMS TEMPLATES (Reusable message templates)
// ============================================================================

export const smsTemplates = mysqlTable("sms_templates", {
  id: int("id").autoincrement().primaryKey(),
  
  // Template info
  name: varchar("name", { length: 100 }).notNull(),
  nameAr: varchar("nameAr", { length: 100 }),
  
  // Template content (supports variables like {name}, {days}, {plan})
  content: text("content").notNull(),
  contentAr: text("contentAr"),
  
  // Template type
  type: mysqlEnum("type", ["subscription_expiry", "welcome", "payment_reminder", "custom"]).default("custom").notNull(),
  
  // Settings
  isActive: boolean("isActive").default(true).notNull(),
  isSystem: boolean("isSystem").default(false).notNull(), // System templates can't be deleted
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SmsTemplate = typeof smsTemplates.$inferSelect;
export type InsertSmsTemplate = typeof smsTemplates.$inferInsert;

// ============================================================================
// SMS NOTIFICATION TRACKING (Prevent duplicate notifications)
// ============================================================================

export const smsNotificationTracking = mysqlTable("sms_notification_tracking", {
  id: int("id").autoincrement().primaryKey(),
  
  // Target
  userId: int("userId").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  
  // Notification type
  notificationType: varchar("notificationType", { length: 50 }).notNull(), // e.g., "subscription_expiry_2days"
  
  // Reference (e.g., subscription ID)
  referenceId: int("referenceId"),
  referenceType: varchar("referenceType", { length: 50 }), // e.g., "tenant_subscription"
  
  // Status
  smsLogId: int("smsLogId"), // Reference to sms_logs
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});

export type SmsNotificationTracking = typeof smsNotificationTracking.$inferSelect;
export type InsertSmsNotificationTracking = typeof smsNotificationTracking.$inferInsert;

// ============================================================================
// WALLET LEDGER (Transaction History)
// ============================================================================

export const walletLedger = mysqlTable("wallet_ledger", {
  id: int("id").autoincrement().primaryKey(),
  
  // User reference
  userId: int("userId").notNull(),
  
  // Transaction type
  type: mysqlEnum("type", ["credit", "debit"]).notNull(),
  
  // Amount
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  
  // Balance before and after
  balanceBefore: decimal("balanceBefore", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal("balanceAfter", { precision: 12, scale: 2 }).notNull(),
  
  // Reason/Description
  reason: varchar("reason", { length: 255 }).notNull(),
  reasonAr: varchar("reasonAr", { length: 255 }),
  
  // Reference to related entity
  entityType: varchar("entityType", { length: 50 }), // e.g., "card", "subscription", "invoice", "manual"
  entityId: int("entityId"),
  
  // Actor (who performed this transaction)
  actorId: int("actorId"), // User who performed the action (admin/reseller)
  actorRole: varchar("actorRole", { length: 50 }),
  
  // Additional metadata
  metadata: json("metadata"),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for user ledger history (WHERE userId = ? ORDER BY createdAt DESC)
  userIdCreatedAtIdx: index("wallet_ledger_user_id_created_at_idx").on(table.userId, table.createdAt),
  // Composite index for type filter (WHERE userId = ? AND type = ?)
  userIdTypeIdx: index("wallet_ledger_user_id_type_idx").on(table.userId, table.type),
}));

export type WalletLedger = typeof walletLedger.$inferSelect;
export type InsertWalletLedger = typeof walletLedger.$inferInsert;



// ============================================================================
// FEATURE ACCESS CONTROL (Owner controls what clients can see)
// ============================================================================

export const featureAccessControl = mysqlTable("feature_access_control", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // Client user ID
  // Dashboard & Monitoring
  canViewDashboard: boolean("canViewDashboard").default(true).notNull(),
  canViewActiveSessions: boolean("canViewActiveSessions").default(true).notNull(),
  canViewRadiusLogs: boolean("canViewRadiusLogs").default(false).notNull(),
  canViewNasHealth: boolean("canViewNasHealth").default(true).notNull(),
  // Infrastructure
  canManageNas: boolean("canManageNas").default(true).notNull(),
  canViewVpn: boolean("canViewVpn").default(false).notNull(),
  canManageMikrotik: boolean("canManageMikrotik").default(true).notNull(),
  // Subscribers & Users
  canManageSubscribers: boolean("canManageSubscribers").default(true).notNull(),
  canViewClients: boolean("canViewClients").default(false).notNull(), // For resellers
  // Access Control
  canManagePlans: boolean("canManagePlans").default(true).notNull(),
  canAccessRadiusControl: boolean("canAccessRadiusControl").default(false).notNull(),
  // Cards & Vouchers
  canManageCards: boolean("canManageCards").default(true).notNull(),
  canPrintCards: boolean("canPrintCards").default(true).notNull(),
  // Billing & Financial
  canViewWallet: boolean("canViewWallet").default(true).notNull(),
  canViewInvoices: boolean("canViewInvoices").default(true).notNull(),
  canViewSubscriptions: boolean("canViewSubscriptions").default(true).notNull(),
  canViewBillingDashboard: boolean("canViewBillingDashboard").default(false).notNull(),
  canViewSaasPlans: boolean("canViewSaasPlans").default(false).notNull(),
  // Reports & Analytics
  canViewReports: boolean("canViewReports").default(true).notNull(),
  canViewBandwidthAnalytics: boolean("canViewBandwidthAnalytics").default(true).notNull(),
  // System
  canViewSettings: boolean("canViewSettings").default(true).notNull(),
  canViewAuditLog: boolean("canViewAuditLog").default(false).notNull(),
  canAccessSupport: boolean("canAccessSupport").default(true).notNull(),
  canManageSms: boolean("canManageSms").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FeatureAccessControl = typeof featureAccessControl.$inferSelect;
export type InsertFeatureAccessControl = typeof featureAccessControl.$inferInsert;

// ============================================================================
// SITE SETTINGS (Owner customization for landing page & branding)
// ============================================================================

export const siteSettings = mysqlTable("site_settings", {
  id: int("id").autoincrement().primaryKey(),
  // Branding
  siteName: varchar("siteName", { length: 100 }).default("Radius Pro").notNull(),
  siteNameAr: varchar("siteNameAr", { length: 100 }).default("راديوس برو"),
  tagline: text("tagline"),
  taglineAr: text("taglineAr"),
  logoUrl: text("logoUrl"),
  faviconUrl: text("faviconUrl"),
  // Hero Section
  heroTitle: varchar("heroTitle", { length: 255 }).default("Complete SaaS System"),
  heroTitleAr: varchar("heroTitleAr", { length: 255 }).default("نظام SaaS متكامل"),
  heroSubtitle: varchar("heroSubtitle", { length: 500 }).default("Professional RADIUS platform for Internet and card management"),
  heroSubtitleAr: varchar("heroSubtitleAr", { length: 500 }).default("منصة RADIUS احترافية لإدارة الإنترنت والكروت"),
  heroDescription: text("heroDescription"),
  heroDescriptionAr: text("heroDescriptionAr"),
  // Stats
  uptimePercent: varchar("uptimePercent", { length: 10 }).default("99.9%"),
  activeClients: varchar("activeClients", { length: 20 }).default("+1000"),
  managedCards: varchar("managedCards", { length: 20 }).default("+50K"),
  supportHours: varchar("supportHours", { length: 20 }).default("24/7"),
  // Contact Info
  supportEmail: varchar("supportEmail", { length: 320 }).default("support@radius-pro.com"),
  supportPhone: varchar("supportPhone", { length: 50 }).default("+970 59 XXX XXXX"),
  whatsappNumber: varchar("whatsappNumber", { length: 50 }),
  supportHoursText: text("supportHoursText"),
  supportHoursTextAr: text("supportHoursTextAr"),
  // Footer
  companyName: varchar("companyName", { length: 255 }).default("RadiusPro"),
  companyNameAr: varchar("companyNameAr", { length: 255 }).default("راديوس برو"),
  copyrightText: text("copyrightText"),
  copyrightTextAr: text("copyrightTextAr"),
  // Social Media
  facebookUrl: text("facebookUrl"),
  twitterUrl: text("twitterUrl"),
  linkedinUrl: text("linkedinUrl"),
  instagramUrl: text("instagramUrl"),
  // SEO
  metaTitle: text("metaTitle"),
  metaTitleAr: text("metaTitleAr"),
  metaDescription: text("metaDescription"),
  metaDescriptionAr: text("metaDescriptionAr"),
  metaKeywords: text("metaKeywords"),
  // Import Limits
  clientDailyImportLimit: int("clientDailyImportLimit").default(1000).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteSettings = typeof siteSettings.$inferSelect;
export type InsertSiteSettings = typeof siteSettings.$inferInsert;

// ============================================================================
// SUBSCRIPTION PLANS (For landing page pricing section)
// ============================================================================

export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  // Plan Info
  name: varchar("name", { length: 100 }).notNull(),
  nameAr: varchar("nameAr", { length: 100 }).notNull(),
  description: text("description"),
  descriptionAr: text("descriptionAr"),
  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  billingPeriod: mysqlEnum("billingPeriod", ["monthly", "semi_annual", "yearly"]).default("monthly").notNull(),
  // Features (JSON array of strings)
  features: json("features").notNull(), // ["Feature 1", "Feature 2", ...]
  featuresAr: json("featuresAr").notNull(),
  // Limits
  maxCards: int("maxCards"), // null = unlimited
  maxNasDevices: int("maxNasDevices"), // null = unlimited
  maxResellers: int("maxResellers"), // null = unlimited
  // Display
  isPopular: boolean("isPopular").default(false).notNull(),
  displayOrder: int("displayOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

// ============================================================================
// PERMISSION PLANS SYSTEM (Global Plans like SaaS Platforms)
// ============================================================================

/**
 * Permission Groups - Define logical groups of menu items
 * Each group represents a section in the sidebar (e.g., "إدارة العملاء", "البطاقات")
 */
export const permissionGroups = mysqlTable("permission_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(), // e.g., "client_management"
  nameAr: varchar("nameAr", { length: 100 }).notNull(), // e.g., "إدارة العملاء"
  description: text("description"),
  descriptionAr: text("descriptionAr"),
  // Menu items that belong to this group (JSON array of paths)
  menuItems: json("menuItems").notNull(), // e.g., ["/clients", "/users-management"]
  // Applicable roles
  applicableRoles: json("applicableRoles").notNull(), // e.g., ["owner", "reseller", "client"]
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PermissionGroup = typeof permissionGroups.$inferSelect;
export type InsertPermissionGroup = typeof permissionGroups.$inferInsert;

/**
 * Permission Plans - Predefined plans with sets of permission groups
 * Examples: "Basic Client", "Pro Client", "Reseller Basic", "Reseller Pro"
 */
export const permissionPlans = mysqlTable("permission_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // e.g., "Basic Client"
  nameAr: varchar("nameAr", { length: 100 }).notNull(), // e.g., "عميل أساسي"
  description: text("description"),
  descriptionAr: text("descriptionAr"),
  // Target role for this plan
  role: mysqlEnum("role", ["reseller", "client"]).notNull(),
  // Is this the default plan for new users of this role?
  isDefault: boolean("isDefault").default(false).notNull(),
  // Status
  isActive: boolean("isActive").default(true).notNull(),
  // Explicit sidebar paths for the plan. NULL preserves legacy group-derived access.
  allowedMenuItems: json("allowedMenuItems"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PermissionPlan = typeof permissionPlans.$inferSelect;
export type InsertPermissionPlan = typeof permissionPlans.$inferInsert;

/**
 * Permission Plan Groups - Many-to-many relationship
 * Links permission plans to their included permission groups
 */
export const permissionPlanGroups = mysqlTable("permission_plan_groups", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull(),
  groupId: int("groupId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PermissionPlanGroup = typeof permissionPlanGroups.$inferSelect;
export type InsertPermissionPlanGroup = typeof permissionPlanGroups.$inferInsert;

/**
 * User Permission Overrides - Exceptions for specific users
 * Allows granting or revoking specific permission groups without changing the plan
 */
export const userPermissionOverrides = mysqlTable("user_permission_overrides", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId").notNull(),
  // true = grant access, false = revoke access
  isGranted: boolean("isGranted").notNull(),
  // Who made this override
  createdBy: int("createdBy").notNull(), // Owner user ID
  reason: text("reason"), // Optional reason for the override
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPermissionOverride = typeof userPermissionOverrides.$inferSelect;
export type InsertUserPermissionOverride = typeof userPermissionOverrides.$inferInsert;

/**
 * User Menu Item Overrides - Grant or revoke a single sidebar route without
 * changing the default route list assigned by the user's permission plan.
 */
export const userMenuItemOverrides = mysqlTable("user_menu_item_overrides", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  menuPath: varchar("menuPath", { length: 255 }).notNull(),
  isGranted: boolean("isGranted").notNull(),
  createdBy: int("createdBy").notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserMenuItemOverride = typeof userMenuItemOverrides.$inferSelect;
export type InsertUserMenuItemOverride = typeof userMenuItemOverrides.$inferInsert;

// ============================================================================
// BANK TRANSFER REQUESTS (Palestine Bank Payment System)
// ============================================================================

export const bankTransferRequests = mysqlTable("bank_transfer_requests", {
  id: int("id").autoincrement().primaryKey(),
  
  // User who submitted the request
  userId: int("userId").notNull(),
  
  // Requested amount in USD (what the user wants to add to their wallet)
  requestedAmount: decimal("requestedAmount", { precision: 12, scale: 2 }).notNull(),
  
  // Currency of the requested amount (selected by user)
  requestedCurrency: mysqlEnum("requestedCurrency", ["ILS", "USD"]).default("USD").notNull(),
  
  // Transferred amount (actual amount sent by user)
  transferredAmount: decimal("transferredAmount", { precision: 12, scale: 2 }).notNull(),
  
  // Currency of the transferred amount (ILS or USD)
  transferredCurrency: mysqlEnum("transferredCurrency", ["ILS", "USD"]).notNull(),
  
  // Exchange rate used for conversion (e.g., 1 ILS = 0.27 USD)
  exchangeRate: decimal("exchangeRate", { precision: 10, scale: 6 }).notNull(),
  
  // Final amount in USD after conversion
  finalAmountUSD: decimal("finalAmountUSD", { precision: 12, scale: 2 }).notNull(),
  
  // Receipt image URL (stored in S3)
  receiptImageUrl: text("receiptImageUrl").notNull(),
  
  // Reference number from the bank receipt (extracted via OCR)
  referenceNumber: varchar("referenceNumber", { length: 50 }).notNull().unique(),
  
  // OCR extracted data (JSON) - stores all extracted information for verification
  ocrData: json("ocrData"),
  
  // Request status
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  
  // Timestamps
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
  
  // Admin who reviewed the request
  reviewedBy: int("reviewedBy"),
  
  // Admin notes (reason for rejection, etc.)
  adminNotes: text("adminNotes"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Index for user transfer history (WHERE userId = ? ORDER BY submittedAt DESC)
  userIdSubmittedAtIdx: index("bank_transfer_requests_user_id_submitted_at_idx").on(table.userId, table.submittedAt),
  // Index for status filter (WHERE status = 'pending')
  statusIdx: index("bank_transfer_requests_status_idx").on(table.status),
}));

export type BankTransferRequest = typeof bankTransferRequests.$inferSelect;
export type InsertBankTransferRequest = typeof bankTransferRequests.$inferInsert;

// ============================================================================
// IP POOL CONFIGURATION
// ============================================================================
export const ipPoolConfig = mysqlTable("ip_pool_config", {
  id: int("id").primaryKey().autoincrement(),
  startIp: varchar("start_ip", { length: 15 }).notNull(),
  endIp: varchar("end_ip", { length: 15 }).notNull(),
  subnet: varchar("subnet", { length: 15 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: int("created_by").notNull(), // User ID who created this range
});

export type IpPoolConfig = typeof ipPoolConfig.$inferSelect;
export type InsertIpPoolConfig = typeof ipPoolConfig.$inferInsert;

// ============================================================================
// CARD CHECK TOKENS (Public card check links per client)
// ============================================================================
export const checkTokens = mysqlTable("check_tokens", {
  id: int("id").primaryKey().autoincrement(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  slug: varchar("slug", { length: 64 }).unique(), // Custom slug e.g. "abowdnet" → /check/abowdnet
  networkName: varchar("networkName", { length: 128 }), // Display name shown on check page
  ownerId: int("ownerId").notNull(), // The client_owner this token belongs to
  label: varchar("label", { length: 128 }), // Optional label e.g. "Twix Market Link"
  isActive: boolean("isActive").default(true).notNull(),
  // Hotspot Widget Settings
  widgetEnabled: boolean("widgetEnabled").default(false).notNull(),
  widgetPrimaryColor: varchar("widgetPrimaryColor", { length: 7 }).default("#0ea5e9").notNull(), // hex color
  widgetBgColor: varchar("widgetBgColor", { length: 7 }).default("#ffffff").notNull(),
  widgetTextColor: varchar("widgetTextColor", { length: 7 }).default("#1e293b").notNull(),
  widgetBorderRadius: int("widgetBorderRadius").default(12).notNull(), // px
  widgetShowPlan: boolean("widgetShowPlan").default(true).notNull(),
  widgetShowExpiry: boolean("widgetShowExpiry").default(true).notNull(),
  widgetShowTimeLeft: boolean("widgetShowTimeLeft").default(true).notNull(),
  widgetShowStatus: boolean("widgetShowStatus").default(true).notNull(),
  widgetShowSpeed: boolean("widgetShowSpeed").default(false).notNull(),
  widgetShowDataLimit: boolean("widgetShowDataLimit").default(false).notNull(),
  widgetShowSessions: boolean("widgetShowSessions").default(false).notNull(),
  widgetTitle: varchar("widgetTitle", { length: 128 }).default("فحص بيانات كرتك").notNull(),
  widgetPlaceholder: varchar("widgetPlaceholder", { length: 128 }).default("أدخل اسم المستخدم").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CheckToken = typeof checkTokens.$inferSelect;
export type InsertCheckToken = typeof checkTokens.$inferInsert;

// ============================================================================
// BROADCAST NOTIFICATIONS (Admin → Clients messaging system)
// ============================================================================
export const broadcasts = mysqlTable("broadcasts", {
  id: int("id").primaryKey().autoincrement(),
  senderId: int("senderId").notNull(), // The admin who sent it
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["info", "warning", "error", "success", "update"]).default("info").notNull(),
  targetType: mysqlEnum("targetType", ["all", "specific"]).default("all").notNull(), // all clients or specific
  recipientCount: int("recipientCount").default(0).notNull(), // how many received it
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Broadcast = typeof broadcasts.$inferSelect;
export type InsertBroadcast = typeof broadcasts.$inferInsert;

export const broadcastRecipients = mysqlTable("broadcast_recipients", {
  id: int("id").primaryKey().autoincrement(),
  broadcastId: int("broadcastId").notNull(),
  recipientId: int("recipientId").notNull(), // The client user ID
  isRead: boolean("isRead").default(false).notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BroadcastRecipient = typeof broadcastRecipients.$inferSelect;
export type InsertBroadcastRecipient = typeof broadcastRecipients.$inferInsert;

// ============================================================================
// NETWORK ROUTERS MONITORING
// ============================================================================
export const networkRouters = mysqlTable("network_routers", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(), // Client owner
  nasId: int("nasId").notNull(), // Which NAS (MikroTik) to ping from
  name: varchar("name", { length: 100 }).notNull(), // Display name
  ipAddress: varchar("ipAddress", { length: 45 }).notNull(), // IPv4
  webPort: int("webPort").default(80), // HTTP port for router web interface (default 80, use 8080 if MikroTik uses port 80)
  description: text("description"), // Optional notes
  // Status (updated by ping job)
  isOnline: boolean("isOnline").default(false).notNull(),
  lastPingMs: int("lastPingMs"), // Last ping response time in ms (null = no response)
  lastCheckedAt: timestamp("lastCheckedAt"), // Last time ping was attempted
  lastSeenOnlineAt: timestamp("lastSeenOnlineAt"), // Last time it was online
  consecutiveFailures: int("consecutiveFailures").default(0).notNull(), // How many consecutive ping failures
  // Notifications
  notifyOnDown: boolean("notifyOnDown").default(true).notNull(), // Send alert when goes down
  lastDownNotifiedAt: timestamp("lastDownNotifiedAt"), // Prevent duplicate notifications
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Index for owner-based router list (WHERE ownerId = ?)
  ownerIdIdx: index("network_routers_owner_id_idx").on(table.ownerId),
  // Composite index for NAS-based router list (WHERE ownerId = ? AND nasId = ?)
  ownerNasIdx: index("network_routers_owner_nas_idx").on(table.ownerId, table.nasId),
}));
export type NetworkRouter = typeof networkRouters.$inferSelect;
export type InsertNetworkRouter = typeof networkRouters.$inferInsert;

// ============================================================================
// NETWORK PORT FORWARDING — a controlled external TCP entry point per device
// ============================================================================
export const portForwardings = mysqlTable("port_forwardings", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(),
  nasId: int("nasId").notNull(),
  // The target must already be registered in Network Monitor. This prevents a
  // forwarding request from becoming an arbitrary internal-network proxy.
  networkRouterId: int("networkRouterId").notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  targetIp: varchar("targetIp", { length: 45 }).notNull(),
  targetPort: int("targetPort").notNull(),
  vpnTunnelIp: varchar("vpnTunnelIp", { length: 45 }).notNull(),
  externalPort: int("externalPort").notNull(),
  ingressPort: int("ingressPort").notNull(),
  protocol: mysqlEnum("protocol", ["tcp"]).default("tcp").notNull(),
  // Public exposure is opt-in. Restricted is the secure default.
  accessMode: mysqlEnum("accessMode", ["restricted", "public"]).default("restricted").notNull(),
  // JSON array of trusted public source CIDRs; empty only when accessMode=public.
  allowedCidrs: json("allowedCidrs").$type<string[]>().notNull(),
  status: mysqlEnum("status", ["pending", "active", "disabled", "error"]).default("pending").notNull(),
  lastError: text("lastError"),
  enabledAt: timestamp("enabledAt"),
  disabledAt: timestamp("disabledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerIdx: index("port_forwardings_owner_idx").on(table.ownerId),
  ownerNasIdx: index("port_forwardings_owner_nas_idx").on(table.ownerId, table.nasId),
  routerIdx: index("port_forwardings_router_idx").on(table.networkRouterId),
  externalPortUniq: uniqueIndex("port_forwardings_external_port_uniq").on(table.externalPort),
  nasIngressPortUniq: uniqueIndex("port_forwardings_nas_ingress_port_uniq").on(table.nasId, table.ingressPort),
}));
export type PortForwarding = typeof portForwardings.$inferSelect;
export type InsertPortForwarding = typeof portForwardings.$inferInsert;

// Per-owner logical limits. Ports remain globally unique, while this table
// controls how many forwarding records each customer may reserve.
export const portForwardingQuotas = mysqlTable("port_forwarding_quotas", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull().unique(),
  maxForwards: int("maxForwards").notNull().default(10),
  usedForwards: int("usedForwards").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PortForwardingQuota = typeof portForwardingQuotas.$inferSelect;

// ============================================================================
// MANAGEMENT VPN ACCESS SESSIONS — separate from Radius/NAS VPN identities
// ============================================================================
export const managementVpnSessions = mysqlTable("management_vpn_sessions", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(),
  nasId: int("nasId").notNull(),
  networkRouterId: int("networkRouterId").notNull(),
  createdBy: int("createdBy").notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  // VPN identity is independent of existing L2TP/PPTP/SSTP NAS identities.
  clientAddress: varchar("clientAddress", { length: 45 }).notNull(),
  virtualTargetIp: varchar("virtualTargetIp", { length: 45 }).notNull(),
  targetIp: varchar("targetIp", { length: 45 }).notNull(),
  targetPorts: json("targetPorts").$type<number[]>().notNull(),
  allowedProtocols: json("allowedProtocols").$type<string[]>().notNull(),
  clientPublicKey: varchar("clientPublicKey", { length: 128 }),
  sessionToken: varchar("sessionToken", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "active", "suspended", "revoked", "expired", "error"]).default("pending").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerIdx: index("management_vpn_owner_idx").on(table.ownerId),
  nasIdx: index("management_vpn_nas_idx").on(table.nasId),
  activeExpiryIdx: index("management_vpn_status_expiry_idx").on(table.status, table.expiresAt),
  virtualTargetIdx: index("management_vpn_virtual_target_idx").on(table.nasId, table.virtualTargetIp),
}));
export type ManagementVpnSession = typeof managementVpnSessions.$inferSelect;
export type InsertManagementVpnSession = typeof managementVpnSessions.$inferInsert;

// ============================================================================
// NETWORK MONITOR AUTO-PING SETTINGS
// ============================================================================
export const networkMonitorSettings = mysqlTable("network_monitor_settings", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull().unique(), // One setting per client
  autoPingEnabled: boolean("autoPingEnabled").default(false).notNull(),
  pingIntervalMinutes: int("pingIntervalMinutes").default(5).notNull(), // 5, 10, 15, 30
  lastAutoPingAt: timestamp("lastAutoPingAt"), // Last auto-ping run
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NetworkMonitorSettings = typeof networkMonitorSettings.$inferSelect;
export type InsertNetworkMonitorSettings = typeof networkMonitorSettings.$inferInsert;
// ============================================================================
// NETWORK ROUTER DOWN LOG (Downtime History)
// ============================================================================
export const networkRouterDownLog = mysqlTable("network_router_down_log", {
  id: int("id").primaryKey().autoincrement(),
  routerId: int("routerId").notNull(),
  ownerId: int("ownerId").notNull(),
  routerName: varchar("routerName", { length: 100 }).notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
  eventType: varchar("eventType", { length: 20 }).notNull(), // 'down' | 'up'
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  durationSeconds: int("durationSeconds"),
  notified: boolean("notified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for router downtime history (WHERE routerId = ? AND ownerId = ? ORDER BY detectedAt DESC)
  routerIdOwnerDetectedAtIdx: index("router_down_log_router_id_owner_detected_at_idx").on(table.routerId, table.ownerId, table.detectedAt),
}));
export type NetworkRouterDownLog = typeof networkRouterDownLog.$inferSelect;
export type InsertNetworkRouterDownLog = typeof networkRouterDownLog.$inferInsert;

// ============================================================================
// NOTIFICATION CHANNELS (Telegram / WhatsApp / SMS settings per owner)
// ============================================================================
export const notificationChannels = mysqlTable("notification_channels", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(),
  channel: varchar("channel", { length: 20 }).notNull(), // 'telegram' | 'whatsapp' | 'sms'
  enabled: boolean("enabled").default(false).notNull(),
  // Telegram fields
  telegramBotToken: varchar("telegramBotToken", { length: 255 }),
  telegramChatId: varchar("telegramChatId", { length: 100 }),
  // WhatsApp fields (UltraMsg / Twilio)
  whatsappApiUrl: varchar("whatsappApiUrl", { length: 255 }),
  whatsappApiToken: varchar("whatsappApiToken", { length: 255 }),
  whatsappInstanceId: varchar("whatsappInstanceId", { length: 100 }),
  whatsappPhone: varchar("whatsappPhone", { length: 50 }),
  // SMS fields
  smsApiKey: varchar("smsApiKey", { length: 255 }),
  smsSender: varchar("smsSender", { length: 50 }),
  // Admin lock for SMS — only super_admin can enable
  smsAdminEnabled: boolean("smsAdminEnabled").default(false).notNull(),
  // Monthly SMS limit set by super admin (0 = unlimited) - kept for backward compat
  smsMonthlyLimit: int("smsMonthlyLimit").default(0).notNull(),
  // Fixed SMS balance (not monthly) - set by admin, decremented per send, 0 = no balance
  smsBalance: int("smsBalance").default(0).notNull(),
  // Custom bot messages (JSON string) - for Telegram/WhatsApp bot message customization
  customMessages: text("customMessages"),
  // Custom SMS messages (JSON string) - for SMS notification text customization
  customSmsMessages: text("customSmsMessages"),
  // SMS Provider type: 'tweetsms' (default) | 'custom_api'
  smsProviderType: varchar("smsProviderType", { length: 20 }).default('tweetsms'),
  // Custom HTTP API URL for SMS sending — supports {phone}, {msg}, {sender} variables
  customSmsApiUrl: text("customSmsApiUrl"),
  // Custom HTTP API URL for balance check (optional)
  customSmsBalanceUrl: text("customSmsBalanceUrl"),
  // Reminder hours before expiry (default 24h) - how many hours before expiry to send reminder
  reminderHoursManualCard: int("reminderHoursManualCard").default(24).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type InsertNotificationChannel = typeof notificationChannels.$inferInsert;

// ============================================================================
// NOTIFICATION PREFERENCES (which events to notify per channel per owner)
// ============================================================================
export const notificationPreferences = mysqlTable("notification_preferences", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(),
  channel: varchar("channel", { length: 20 }).notNull(), // 'telegram' | 'whatsapp' | 'sms'
  // Owner/manager events
  ownerRouterDown: boolean("ownerRouterDown").default(false).notNull(),
  ownerNewSubscription: boolean("ownerNewSubscription").default(false).notNull(),
  ownerCardActivated: boolean("ownerCardActivated").default(false).notNull(),
  ownerSubscriptionExpiring: boolean("ownerSubscriptionExpiring").default(false).notNull(),
  ownerNewPayment: boolean("ownerNewPayment").default(false).notNull(),
  ownerSupportTicket: boolean("ownerSupportTicket").default(false).notNull(),
  ownerManualCardExpiring: boolean("ownerManualCardExpiring").default(false).notNull(),
  // Subscriber events
  subscriberNewSubscription: boolean("subscriberNewSubscription").default(false).notNull(),
  subscriberCardActivated: boolean("subscriberCardActivated").default(false).notNull(),
  subscriberSubscriptionExpiring: boolean("subscriberSubscriptionExpiring").default(false).notNull(),
  subscriberNewPayment: boolean("subscriberNewPayment").default(false).notNull(),
  subscriberSupportTicket: boolean("subscriberSupportTicket").default(false).notNull(),
  // Store orders SMS — send SMS to customer on order delivery
  storeOrderSms: boolean("storeOrderSms").default(false).notNull(),
  // Custom SMS template for store orders (supports {name}, {cards}, {count})
  storeOrderSmsTemplate: text("storeOrderSmsTemplate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;

// ============================================================================
// SUBSCRIBER NOTIFICATION LINKS (subscriber links Telegram/WhatsApp account)
// ============================================================================
export const subscriberNotificationLinks = mysqlTable("subscriber_notification_links", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  ownerId: int("ownerId").notNull(),
  channel: varchar("channel", { length: 20 }).notNull(), // 'telegram' | 'whatsapp'
  chatId: varchar("chatId", { length: 100 }),   // Telegram chat ID
  phone: varchar("phone", { length: 50 }),       // WhatsApp phone number
  verified: boolean("verified").default(false).notNull(),
  verifyCode: varchar("verifyCode", { length: 10 }),
  verifyExpiry: timestamp("verifyExpiry"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SubscriberNotificationLink = typeof subscriberNotificationLinks.$inferSelect;
export type InsertSubscriberNotificationLink = typeof subscriberNotificationLinks.$inferInsert;

// ============================================================================
// SMS CONTACTS (دفتر جهات الاتصال للإرسال)
// ============================================================================
export const smsContacts = mysqlTable("sms_contacts", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Index for owner-based contact list (WHERE ownerId = ? ORDER BY createdAt DESC)
  ownerIdCreatedAtIdx: index("sms_contacts_owner_id_created_at_idx").on(table.ownerId, table.createdAt),
}));
export type SmsContact = typeof smsContacts.$inferSelect;
export type InsertSmsContact = typeof smsContacts.$inferInsert;

// ============================================================================
// SMS SEND LOG (سجل إرسال الكروت عبر SMS)
// ============================================================================
export const smsSendLog = mysqlTable("sms_send_log", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(),
  contactId: int("contactId"),          // null if one-time number
  contactName: varchar("contactName", { length: 100 }),
  contactPhone: varchar("contactPhone", { length: 30 }).notNull(),
  batchId: varchar("batchId", { length: 50 }).notNull(),
  cardCount: int("cardCount").notNull(),
  smsCount: int("smsCount").notNull(),  // number of SMS messages sent
  status: varchar("status", { length: 20 }).default("sent").notNull(), // sent | failed
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for owner-based SMS send history (WHERE ownerId = ? ORDER BY createdAt DESC)
  ownerIdCreatedAtIdx: index("sms_send_log_owner_id_created_at_idx").on(table.ownerId, table.createdAt),
}));
export type SmsSendLog = typeof smsSendLog.$inferSelect;
export type InsertSmsSendLog = typeof smsSendLog.$inferInsert;

// ============================================================================
// SMS BALANCE LOG (سجل شحن/تعديل رصيد SMS)
// ============================================================================
export const smsBalanceLog = mysqlTable("sms_balance_log", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(),
  adminId: int("adminId").notNull(),
  adminName: varchar("adminName", { length: 255 }),
  action: mysqlEnum("action", ["topup", "set", "deduct"]).notNull().default("topup"),
  amount: int("amount").notNull(),
  balanceBefore: int("balanceBefore").notNull().default(0),
  balanceAfter: int("balanceAfter").notNull().default(0),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Index for owner-based SMS balance history (WHERE ownerId = ? ORDER BY createdAt DESC)
  ownerIdCreatedAtIdx: index("sms_balance_log_owner_id_created_at_idx").on(table.ownerId, table.createdAt),
}));
export type SmsBalanceLog = typeof smsBalanceLog.$inferSelect;
export type InsertSmsBalanceLog = typeof smsBalanceLog.$inferInsert;


// ============================================================================
// SYSTEM UPDATES (سجل تحديثات النظام والإصدارات)
// ============================================================================
export const systemUpdates = mysqlTable("system_updates", {
  id: int("id").primaryKey().autoincrement(),
  version: varchar("version", { length: 20 }).notNull(), // e.g. "1.1.2"
  status: mysqlEnum("status", ["pending", "running", "success", "failed"]).default("pending").notNull(),
  triggeredBy: int("triggeredBy"), // userId who triggered the update
  triggeredByName: varchar("triggeredByName", { length: 255 }),
  log: text("log"), // Full output log from build/restart
  errorMessage: text("errorMessage"), // Error details if failed
  duration: int("duration"), // Duration in seconds
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ({
  createdAtIdx: index("system_updates_created_at_idx").on(table.createdAt),
}));
export type SystemUpdate = typeof systemUpdates.$inferSelect;
export type InsertSystemUpdate = typeof systemUpdates.$inferInsert;

// ─── Cron Job Logs ──────────────────────────────────────────────────────────
export const cronJobLogs = mysqlTable("cron_job_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  jobId: varchar("job_id", { length: 100 }).notNull(),
  success: boolean("success").notNull(),
  message: text("message"),
  durationMs: int("duration_ms"),
  runAt: bigint("run_at", { mode: "number" }).notNull(), // UTC ms
  triggeredBy: varchar("triggered_by", { length: 20 }).notNull().default("auto"), // auto | manual
}, (table) => ({
  jobIdIdx: index("cron_job_logs_job_id_idx").on(table.jobId),
  runAtIdx: index("cron_job_logs_run_at_idx").on(table.runAt),
}));
export type CronJobLog = typeof cronJobLogs.$inferSelect;

// ─── Cron Job Settings ───────────────────────────────────────────────────────
export const cronJobSettings = mysqlTable("cron_job_settings", {
  jobId: varchar("job_id", { length: 100 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  consecutiveFailures: int("consecutive_failures").notNull().default(0),
  lastNotifiedAt: bigint("last_notified_at", { mode: "number" }),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type CronJobSetting = typeof cronJobSettings.$inferSelect;

// ============================================================================
// CARD STORE — متجر بطاقات الإنترنت
// ============================================================================

// --- stores: بيانات المتجر لكل عميل ---
export const stores = mysqlTable("stores", {
  id: int("id").primaryKey().autoincrement(),
  ownerId: int("ownerId").notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  logoUrl: varchar("logoUrl", { length: 512 }),
  bannerUrl: varchar("bannerUrl", { length: 512 }),
  paymentPhone: varchar("paymentPhone", { length: 30 }),
  paymentInstructions: text("paymentInstructions"),
  whatsappPhone: varchar("whatsappPhone", { length: 30 }),
  active: boolean("active").notNull().default(true),
  // تخصيص الألوان والثيم
  primaryColor: varchar("primaryColor", { length: 7 }).default("#6366f1"),
  secondaryColor: varchar("secondaryColor", { length: 7 }).default("#8b5cf6"),
  bgStyle: varchar("bgStyle", { length: 20 }).default("dark"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerIdIdx: index("stores_owner_id_idx").on(table.ownerId),
  slugIdx: index("stores_slug_idx").on(table.slug),
}));
export type Store = typeof stores.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;

// --- store_products: الباقات والأسعار ---
export const storeProducts = mysqlTable("store_products", {
  id: int("id").primaryKey().autoincrement(),
  storeId: int("storeId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  planId: int("planId"),
  batchId: varchar("batchId", { length: 50 }),
  stockThreshold: int("stockThreshold").notNull().default(5),
  active: boolean("active").notNull().default(true),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  storeIdIdx: index("store_products_store_id_idx").on(table.storeId),
  storeIdActiveIdx: index("store_products_store_id_active_idx").on(table.storeId, table.active),
}));
export type StoreProduct = typeof storeProducts.$inferSelect;
export type InsertStoreProduct = typeof storeProducts.$inferInsert;

// --- store_orders: الطلبات ---
export const storeOrders = mysqlTable("store_orders", {
  id: int("id").primaryKey().autoincrement(),
  storeId: int("storeId").notNull(),
  productId: int("productId").notNull(),
  orderToken: varchar("orderToken", { length: 64 }).unique(), // رمز تتبع الطلب للزبون
  customerName: varchar("customerName", { length: 120 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 30 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  quantity: int("quantity").notNull().default(1),
  status: mysqlEnum("status", ["pending", "confirmed", "delivered", "cancelled", "partial"]).notNull().default("pending"),
  cardId: int("cardId"),
  cardIds: text("cardIds"),
  cardUsername: varchar("cardUsername", { length: 100 }),
  cardPassword: varchar("cardPassword", { length: 100 }),
  cardsData: text("cardsData"),
  // التسليم الجزئي
  deliveredCount: int("deliveredCount").notNull().default(0),   // كم كرت سُلِّم فعلاً
  remainingCardIds: text("remainingCardIds"),                   // JSON: number[] — الكروت المحجوزة المتبقية
  receiptUrl: varchar("receiptUrl", { length: 512 }),
  notes: text("notes"),
  smsSent: boolean("smsSent").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  storeIdIdx: index("store_orders_store_id_idx").on(table.storeId),
  statusIdx: index("store_orders_status_idx").on(table.status),
  storeIdStatusIdx: index("store_orders_store_id_status_idx").on(table.storeId, table.status),
  createdAtIdx: index("store_orders_created_at_idx").on(table.createdAt),
  orderTokenIdx: index("store_orders_token_idx").on(table.orderToken),
  customerPhoneIdx: index("store_orders_phone_idx").on(table.customerPhone),
}));
export type StoreOrder = typeof storeOrders.$inferSelect;
export type InsertStoreOrder = typeof storeOrders.$inferInsert;


// --- store_phone_pins: أرقام سرية لحماية طلبات المتجر ---
export const storePhonePins = mysqlTable("store_phone_pins", {
  id: int("id").primaryKey().autoincrement(),
  storeId: int("storeId").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  pinHash: varchar("pinHash", { length: 255 }).notNull(), // bcrypt hash
  otpCode: varchar("otpCode", { length: 6 }),            // OTP مؤقت لإعادة التعيين
  otpExpiresAt: timestamp("otpExpiresAt"),               // انتهاء OTP
  failedAttempts: int("failedAttempts").default(0).notNull(), // محاولات خاطئة
  lockedUntil: timestamp("lockedUntil"),                 // قفل مؤقت بعد 5 محاولات
  adminReset: boolean("adminReset").default(false).notNull(), // الأدمن طلب إعادة تعيين
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  storePhoneIdx: index("store_phone_pins_store_phone_idx").on(table.storeId, table.phone),
}));
export type StorePhonePin = typeof storePhonePins.$inferSelect;
export type InsertStorePhonePin = typeof storePhonePins.$inferInsert;

// ============================================================================
// NAS ALERTS — تنبيهات الـ NAS التي لا ترسل Accounting Updates
// ============================================================================

export const nasAlerts = mysqlTable("nas_alerts", {
  id: int("id").autoincrement().primaryKey(),
  nasIp: varchar("nasIp", { length: 45 }).notNull(),
  nasName: varchar("nasName", { length: 255 }),
  ownerId: int("ownerId"), // Client who owns this NAS
  alertType: mysqlEnum("alertType", [
    "no_interim_updates",   // NAS لا يرسل Interim-Updates
    "stale_sessions",       // جلسات stale متراكمة
    "offline",              // NAS غير متصل
  ]).notNull(),
  message: text("message").notNull(),
  staleCount: int("staleCount").default(0), // عدد الجلسات المتأثرة
  isResolved: boolean("isResolved").default(false).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  nasIpIdx: index("nas_alerts_nas_ip_idx").on(table.nasIp),
  ownerIdIdx: index("nas_alerts_owner_id_idx").on(table.ownerId),
  isResolvedIdx: index("nas_alerts_is_resolved_idx").on(table.isResolved),
  nasIpAlertTypeIdx: index("nas_alerts_nas_ip_alert_type_idx").on(table.nasIp, table.alertType),
}));

export type NasAlert = typeof nasAlerts.$inferSelect;
export type InsertNasAlert = typeof nasAlerts.$inferInsert;

// ============================================================================
// BILLING RUN LOGS — سجل تشغيلات الفوترة اليومية
// ============================================================================
export const billingRunLogs = mysqlTable("billing_run_logs", {
  id: int("id").autoincrement().primaryKey(),
  runAt: timestamp("runAt").defaultNow().notNull(),         // وقت التشغيل
  triggeredBy: mysqlEnum("triggeredBy", ["cron", "manual"]).default("cron").notNull(),
  usersChecked: int("usersChecked").default(0).notNull(),   // عدد المستخدمين الذين تم فحصهم
  usersProcessed: int("usersProcessed").default(0).notNull(), // عدد المستخدمين الذين تم خصمهم
  usersSkipped: int("usersSkipped").default(0).notNull(),   // عدد المستخدمين الذين تم تخطيهم (لا NAS)
  usersFailed: int("usersFailed").default(0).notNull(),     // عدد المستخدمين الذين فشل خصمهم
  totalDeducted: decimal("totalDeducted", { precision: 10, scale: 2 }).default("0.00").notNull(), // إجمالي المبلغ المخصوم
  lowBalanceNotifications: int("lowBalanceNotifications").default(0).notNull(), // عدد إشعارات الرصيد المنخفض
  durationMs: int("durationMs").default(0).notNull(),       // مدة التشغيل بالمللي ثانية
  status: mysqlEnum("status", ["success", "partial", "failed"]).default("success").notNull(),
  errorMessage: text("errorMessage"),                       // رسالة الخطأ إن وجدت
}, (table) => ({
  runAtIdx: index("billing_run_logs_run_at_idx").on(table.runAt),
  statusIdx: index("billing_run_logs_status_idx").on(table.status),
}));
export type BillingRunLog = typeof billingRunLogs.$inferSelect;
export type InsertBillingRunLog = typeof billingRunLogs.$inferInsert;

// ============================================================================
// USER SESSIONS (Secure Session Management)
// ============================================================================

export const userSessions = mysqlTable("user_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionToken: varchar("sessionToken", { length: 128 }).notNull().unique(),
  rememberMe: boolean("rememberMe").default(false).notNull(),
  // Absolute expiry: 30 days normal, 90 days with rememberMe
  expiresAt: timestamp("expiresAt").notNull(),
  // Last activity for idle timeout (30 min)
  lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
  // Device/browser info for display in session manager
  userAgent: text("userAgent"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  deviceName: varchar("deviceName", { length: 255 }),
  // Revocation: password change or manual logout
  revokedAt: timestamp("revokedAt"),
  revokedReason: mysqlEnum("revokedReason", ["logout", "password_change", "admin_revoke", "expired"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
  tokenIdx: index("user_sessions_token_idx").on(table.sessionToken),
  expiresAtIdx: index("user_sessions_expires_at_idx").on(table.expiresAt),
  lastActivityIdx: index("user_sessions_last_activity_idx").on(table.lastActivityAt),
}));

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;

// ============================================================================
// SPEED SCHEDULES — جداول السرعة الزمنية للباقات
// ============================================================================
export const speedSchedules = mysqlTable("speed_schedules", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  planId: int("planId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  startHour: int("startHour").notNull(),
  startMinute: int("startMinute").default(0).notNull(),
  endHour: int("endHour").notNull(),
  endMinute: int("endMinute").default(0).notNull(),
  daysOfWeek: json("daysOfWeek").notNull(),
  downloadKbps: int("downloadKbps").notNull(),
  uploadKbps: int("uploadKbps").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  priority: int("priority").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerPlanIdx: index("speed_schedules_owner_plan_idx").on(table.ownerId, table.planId),
  planActiveIdx: index("speed_schedules_plan_active_idx").on(table.planId, table.isActive),
}));
export type SpeedSchedule = typeof speedSchedules.$inferSelect;
export type InsertSpeedSchedule = typeof speedSchedules.$inferInsert;


// ============================================================================
// FEEDBACK CENTER (نظام التغذية الراجعة والاستفتاءات)
// ============================================================================

/**
 * feedback_campaigns — حملة مستقلة لكل تحديث أو ميزة
 * يمكن إنشاء حملة لأي إصدار أو موضوع بدون تغيير الكود
 */
export const feedbackCampaigns = mysqlTable("feedback_campaigns", {
  id:          int("id").primaryKey().autoincrement(),
  version:     varchar("version", { length: 50 }).notNull(),    // "2.1.0" أو "billing-feature"
  title:       varchar("title", { length: 200 }).notNull(),     // "كيف يعجبك التصميم الجديد؟"
  description: text("description"),                             // وصف اختياري
  type:        mysqlEnum("type", ["rating", "nps", "survey", "vote"]).default("rating").notNull(),
  isActive:    boolean("isActive").default(false).notNull(),
  priority:    int("priority").default(0).notNull(),            // الأعلى يظهر أولاً
  startAt:     bigint("startAt", { mode: "number" }).notNull(), // Unix ms
  endAt:       bigint("endAt", { mode: "number" }),             // null = لا ينتهي تلقائياً
  createdAt:   bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  activeIdx:   index("fc_active_idx").on(table.isActive, table.priority),
  versionIdx:  index("fc_version_idx").on(table.version),
}));
export type FeedbackCampaign = typeof feedbackCampaigns.$inferSelect;
export type InsertFeedbackCampaign = typeof feedbackCampaigns.$inferInsert;

/**
 * feedback_categories — فئات قابلة للإدارة لكل حملة
 * مستقلة عن JSON لدعم البحث والإحصائيات
 */
export const feedbackCategories = mysqlTable("feedback_categories", {
  id:          int("id").primaryKey().autoincrement(),
  campaignId:  int("campaignId").notNull(),
  label:       varchar("label", { length: 100 }).notNull(),     // "التصميم الجديد"
  icon:        varchar("icon", { length: 50 }),                 // Lucide icon name
  sortOrder:   int("sortOrder").default(0).notNull(),
}, (table) => ({
  campaignIdx: index("fcat_campaign_idx").on(table.campaignId),
}));
export type FeedbackCategory = typeof feedbackCategories.$inferSelect;
export type InsertFeedbackCategory = typeof feedbackCategories.$inferInsert;

/**
 * feedback_responses — رد كل مستخدم على حملة معينة
 * يحفظ بيانات تحليلية كاملة مع device/browser/role
 */
export const feedbackResponses = mysqlTable("feedback_responses", {
  id:           int("id").primaryKey().autoincrement(),
  campaignId:   int("campaignId").notNull(),
  userId:       int("userId").notNull(),
  ownerId:      int("ownerId"),                                  // للتحليل حسب العميل
  role:         varchar("role", { length: 30 }),                 // دور المستخدم وقت الرد
  rating:       smallint("rating"),                              // 1-5 (null لأنواع أخرى)
  comment:      text("comment"),
  appVersion:   varchar("appVersion", { length: 20 }),           // إصدار التطبيق وقت الرد
  device:       varchar("device", { length: 100 }),
  browser:      varchar("browser", { length: 100 }),
  dismissed:    boolean("dismissed").default(false).notNull(),
  dismissedAt:  bigint("dismissedAt", { mode: "number" }),
  createdAt:    bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  campaignUserIdx: index("fr_campaign_user_idx").on(table.campaignId, table.userId),
  ownerIdx:        index("fr_owner_idx").on(table.ownerId),
  createdAtIdx:    index("fr_created_at_idx").on(table.createdAt),
}));
export type FeedbackResponse = typeof feedbackResponses.$inferSelect;
export type InsertFeedbackResponse = typeof feedbackResponses.$inferInsert;

/**
 * feedback_response_categories — ربط الردود بالفئات (Many-to-Many)
 */
export const feedbackResponseCategories = mysqlTable("feedback_response_categories", {
  responseId:  int("responseId").notNull(),
  categoryId:  int("categoryId").notNull(),
}, (table) => ({
  responseIdx: index("frc_response_idx").on(table.responseId),
  categoryIdx: index("frc_category_idx").on(table.categoryId),
  uniquePair:  uniqueIndex("frc_unique_pair").on(table.responseId, table.categoryId),
}));
export type FeedbackResponseCategory = typeof feedbackResponseCategories.$inferSelect;

/**
 * feedback_analytics — سجل Analytics لكل تفاعل مع Banner
 * يُفرّق بين: viewed / snoozed / dismissed / submitted
 */
export const feedbackAnalytics = mysqlTable("feedback_analytics", {
  id:         bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  campaignId: int("campaignId").notNull(),
  userId:     int("userId").notNull(),
  event:      mysqlEnum("event", ["viewed", "snoozed", "dismissed", "submitted"]).notNull(),
  createdAt:  bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  campaignIdx: index("fa_campaign_idx").on(table.campaignId, table.event),
  userIdx:     index("fa_user_idx").on(table.userId),
}));
export type FeedbackAnalytic = typeof feedbackAnalytics.$inferSelect;
export type InsertFeedbackAnalytic = typeof feedbackAnalytics.$inferInsert;
