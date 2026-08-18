/**
 * ErrorCodes — كل خطأ له كود واضح
 * ACC-001, VPN-004, RADIUS-008...
 * يُسهّل التشخيص السريع في الإنتاج
 */

export const ErrorCodes = {
  // ─── Accounting ───────────────────────────────────────────────────────────
  ACC_001: 'ACC-001: Session not found in online_sessions',
  ACC_002: 'ACC-002: Failed to update totalSessionTime — Transaction rolled back',
  ACC_003: 'ACC-003: Usage calculation mismatch > 60s vs radacct',
  ACC_004: 'ACC-004: Stale session detected — Lost-Carrier cleanup',
  ACC_005: 'ACC-005: Duplicate session detected for same username',
  ACC_006: 'ACC-006: renewalAnchorSessionTime not set — renewal anchor missing',

  // ─── Voucher ──────────────────────────────────────────────────────────────
  VCH_001: 'VCH-001: Card not found',
  VCH_002: 'VCH-002: Card already expired or disabled',
  VCH_003: 'VCH-003: Renewal failed — active session anchor error',
  VCH_004: 'VCH-004: Card activation failed — radcheck write error',
  VCH_005: 'VCH-005: Card disable failed — radcheck write error',

  // ─── CoA ──────────────────────────────────────────────────────────────────
  COA_001: 'COA-001: Disconnect request failed — NAS did not respond',
  COA_002: 'COA-002: NAS unreachable — connection timeout',
  COA_003: 'COA-003: CoA loop detected — skipping duplicate request',
  COA_004: 'COA-004: Speed change CoA failed',
  COA_005: 'COA-005: CoA response: Access-Reject from NAS',

  // ─── FreeRADIUS ───────────────────────────────────────────────────────────
  RAD_001: 'RAD-001: FreeRADIUS reload failed',
  RAD_002: 'RAD-002: NAS not found in database',
  RAD_003: 'RAD-003: radcheck write failed',
  RAD_004: 'RAD-004: radhuntgroup write failed — NAS Isolation error',
  RAD_005: 'RAD-005: FreeRADIUS not responding',

  // ─── VPN ──────────────────────────────────────────────────────────────────
  VPN_001: 'VPN-001: VPN user creation failed',
  VPN_002: 'VPN-002: IP allocation failed — pool exhausted',
  VPN_003: 'VPN-003: VPN user deletion failed',
  VPN_004: 'VPN-004: VPN tunnel not established',

  // ─── Database ─────────────────────────────────────────────────────────────
  DB_001:  'DB-001: Transaction failed — ROLLBACK executed',
  DB_002:  'DB-002: Connection pool exhausted',
  DB_003:  'DB-003: Query timeout exceeded',
  DB_004:  'DB-004: Deadlock detected — retry attempted',

  // ─── Queue ────────────────────────────────────────────────────────────────
  QUE_001: 'QUE-001: Job failed after max retries',
  QUE_002: 'QUE-002: Queue overflow — job dropped',

  // ─── Notification ─────────────────────────────────────────────────────────
  NOT_001: 'NOT-001: SMS send failed',
  NOT_002: 'NOT-002: Telegram send failed',
  NOT_003: 'NOT-003: WhatsApp send failed',

} as const;

export type ErrorCode = keyof typeof ErrorCodes;
export type ErrorMessage = typeof ErrorCodes[ErrorCode];
