/**
 * Centralized role helpers for the RADIUS SaaS platform.
 *
 * ALL role checks across the entire backend MUST use these helpers.
 * Never define isAdmin / isClient locally in individual router files.
 *
 * Role hierarchy (highest → lowest):
 *   owner > super_admin > support > reseller > client_owner > client_admin > client_staff > client
 */

/** Roles that have full system-wide visibility (see all users' data) */
export const ADMIN_ROLES = ['owner', 'super_admin', 'support'] as const;

/** Roles that are considered "clients" (see only their own data) */
export const CLIENT_ROLES = ['client', 'client_owner', 'client_admin', 'client_staff', 'reseller'] as const;

/**
 * Returns true if the role has admin-level access (sees all data).
 * Use this in every procedure to decide whether to filter by createdBy/ownerId.
 */
export function isAdmin(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Returns true if the role is a client (sees only their own data).
 */
export function isClient(role: string): boolean {
  return (CLIENT_ROLES as readonly string[]).includes(role);
}

/**
 * Returns true if the role is owner or super_admin (highest privilege).
 * Use this for operations that only the platform owner should perform.
 */
export function isOwner(role: string): boolean {
  return role === 'owner' || role === 'super_admin';
}
