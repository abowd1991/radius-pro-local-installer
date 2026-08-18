/**
 * Tenant Isolation Helper
 * 
 * Provides utilities for filtering data based on user role and tenant hierarchy.
 * 
 * Isolation Rules:
 * - owner/super_admin/support: See everything (no filtering)
 * - client_owner: See only their own data (ownerId = userId)
 * - client_admin/client_staff: See their parent client's data (ownerId = tenantId)
 * - reseller: See only their clients' data (resellerId = userId)
 * - client: See only their own data (ownerId = userId)
 *
 * IMPORTANT: Keep ADMIN_ROLES_SET in sync with ADMIN_ROLES in server/_core/roles.ts
 */

import { User } from "../drizzle/schema";
import { SQL, and, eq, or } from "drizzle-orm";

export type TenantContext = {
  userId: number;
  role: User["role"];
  tenantId: number | null;
  resellerId: number | null;
};

/**
 * Get tenant context from user object
 */
export function getTenantContext(user: Pick<User, 'id' | 'role' | 'tenantId' | 'resellerId'>): TenantContext {
  return {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId ?? null,
    resellerId: user.resellerId ?? null,
  };
}

/** Must stay in sync with ADMIN_ROLES in server/_core/roles.ts */
const ADMIN_ROLES_SET = new Set(['owner', 'super_admin', 'support']);

/**
 * Check if user can see all data (no filtering needed)
 */
export function canSeeAllData(context: TenantContext): boolean {
  return ADMIN_ROLES_SET.has(context.role);
}

/**
 * Get the effective owner ID for filtering
 * - For client_owner: their own ID
 * - For client_admin/client_staff: their parent client's ID (tenantId)
 * - For reseller: their own ID (but filtered by resellerId column)
 * - For client: their own ID
 */
export function getEffectiveOwnerId(context: TenantContext): number {
  // Sub-admins use their parent client's ID
  if ((context.role === "client_admin" || context.role === "client_staff") && context.tenantId) {
    return context.tenantId;
  }
  
  // Everyone else uses their own ID
  return context.userId;
}

/**
 * Build WHERE clause for owner-based filtering
 * 
 * @param context - Tenant context from user
 * @param ownerIdColumn - The column reference for ownerId (e.g., nasDevices.ownerId)
 * @returns SQL condition or undefined if no filtering needed
 */
export function buildOwnerFilter(
  context: TenantContext,
  ownerIdColumn: any
): SQL | undefined {
  if (canSeeAllData(context)) {
    return undefined; // No filtering for owner/super_admin
  }

  const effectiveOwnerId = getEffectiveOwnerId(context);
  return eq(ownerIdColumn, effectiveOwnerId);
}

/**
 * Build WHERE clause for reseller-based filtering
 * 
 * @param context - Tenant context from user
 * @param resellerIdColumn - The column reference for resellerId
 * @param ownerIdColumn - The column reference for ownerId (optional, for combined filtering)
 * @returns SQL condition or undefined if no filtering needed
 */
export function buildResellerFilter(
  context: TenantContext,
  resellerIdColumn: any,
  ownerIdColumn?: any
): SQL | undefined {
  if (canSeeAllData(context)) {
    return undefined; // No filtering for owner/super_admin
  }

  if (context.role === "reseller") {
    // Reseller sees only their clients
    return eq(resellerIdColumn, context.userId);
  }

  // For client_owner/client_admin/client_staff, also filter by ownerId
  if (ownerIdColumn) {
    const effectiveOwnerId = getEffectiveOwnerId(context);
    return and(
      eq(ownerIdColumn, effectiveOwnerId),
      or(
        eq(resellerIdColumn, context.resellerId ?? 0),
        eq(resellerIdColumn, null as any)
      )
    );
  }

  return undefined;
}

/**
 * Build complete WHERE clause combining owner and reseller filters
 * 
 * @param context - Tenant context from user
 * @param ownerIdColumn - The column reference for ownerId
 * @param resellerIdColumn - The column reference for resellerId (optional)
 * @returns SQL condition or undefined if no filtering needed
 */
export function buildTenantFilter(
  context: TenantContext,
  ownerIdColumn: any,
  resellerIdColumn?: any
): SQL | undefined {
  if (canSeeAllData(context)) {
    return undefined; // No filtering for owner/super_admin
  }

  const ownerFilter = buildOwnerFilter(context, ownerIdColumn);
  
  if (resellerIdColumn && context.role === "reseller") {
    return buildResellerFilter(context, resellerIdColumn, ownerIdColumn);
  }

  return ownerFilter;
}
