/**
 * VPS Date Fix Utilities — DEPRECATED (No-Op)
 *
 * ⚠️  ARCHITECTURE DECISION (2026-06-04):
 * ─────────────────────────────────────────────────────────────────────────────
 * The system now uses UNIFIED Palestine time (Asia/Jerusalem +3) throughout:
 *
 *   - VPS OS:         Asia/Jerusalem (IDT +3)
 *   - MySQL:          SYSTEM = Asia/Jerusalem (+3)
 *   - FreeRADIUS:     writes radacct in Palestine time (+3)
 *   - Node.js:        process.env.TZ = 'Asia/Jerusalem'
 *   - mysql2 pool:    timezone: 'local'  ← KEY CHANGE: no automatic conversion
 *
 * With timezone: 'local', mysql2 reads timestamps AS-IS from MySQL without
 * adding or subtracting any hours. This means:
 *   - acctstarttime "2026-06-04 01:08:42" (Palestine) → JS Date "01:08:42"  ✅
 *   - No manual offset correction needed anywhere
 *
 * CRITICAL: Do NOT use toISOString() on dates from MySQL — it converts to UTC
 * and subtracts 3 hours. Always use formatDateLocal() or return the raw string.
 *
 * THESE FUNCTIONS ARE NOW NO-OPS — kept only for backward compatibility.
 * DO NOT use fixVpsDateObj or fixVpsDate in new code.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Format a date as "YYYY-MM-DD HH:mm:ss" using LOCAL time (no UTC conversion).
 * This is the safe way to serialize Palestine timestamps without losing 3 hours.
 */
function formatDateLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * @deprecated No-op. mysql2 timezone='local' handles Palestine time natively.
 * Returns local datetime string (YYYY-MM-DD HH:mm:ss) — no UTC conversion.
 */
export function fixVpsDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  if (typeof date === 'string') return date; // already a string from MySQL — return as-is
  if (isNaN(date.getTime())) return null;
  return formatDateLocal(date); // use local time, NOT toISOString()
}

/**
 * @deprecated No-op. mysql2 timezone='local' handles Palestine time natively.
 * Returns the Date object as-is (no hour subtraction).
 */
export function fixVpsDateObj(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d;
}
