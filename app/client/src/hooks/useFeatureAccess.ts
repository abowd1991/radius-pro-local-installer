import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMemo } from "react";

/**
 * Hook to get feature access permissions for the current user
 * Uses Permission Plans system with group-based permissions
 * Returns default permissions for owner/super_admin
 * Returns plan-based permissions for clients/resellers
 */
export function useFeatureAccess() {
  const { user } = useAuth();

  // Owner and super_admin have all permissions by default
  if (user?.role === "owner" || user?.role === "super_admin") {
    return {
      permissions: {
        // All groups enabled for super admin
        client_management: true,
        cards_vouchers: true,
        reports_analytics: true,
        billing_finance: true,
        infrastructure_nas: true,
        vpn_management: true,
        network_management: true,
        support_tickets: true,
        system_settings: true,
        advanced_features: true,
        
        // Legacy permissions for backward compatibility
        canViewDashboard: true,
        canManageNas: true,
        canManageVouchers: true,
        canManagePlans: true,
        canViewSessions: true,
        canViewReports: true,
        canViewWallet: true,
        canManageSubscribers: true,
        canViewVpn: true,
        canViewRadiusLogs: true,
        canViewAuditLog: true,
        canManageSms: true,
        canViewSupport: true,
        canViewBilling: true,
        canManageInvoices: true,
      },
      allowedMenuItems: null,
      isLoading: false,
    };
  }

  // For clients/resellers, fetch their effective permissions (plan + overrides)
  const { data: effectivePermissions, isLoading } = trpc.userEffectivePermissions.get.useQuery(
    { userId: user?.id },
    {
      enabled: !!user?.id && ["client", "reseller", "client_owner", "client_admin", "client_staff"].includes(user?.role || ""),
    }
  );

  // Convert group permissions to legacy format
  const permissions = useMemo(() => {
    console.log('[useFeatureAccess] effectivePermissions:', effectivePermissions);
    if (!effectivePermissions) {
      // Default permissions for clients without a plan
      return {
        client_management: false,
        cards_vouchers: true,
        reports_analytics: false,
        billing_finance: true,
        infrastructure_nas: false,
        vpn_management: false,
        network_management: false,
        support_tickets: true,
        system_settings: false,
        advanced_features: false,
        
        // Legacy
        canViewDashboard: true,
        canManageNas: false,
        canManageVouchers: true,
        canManagePlans: true,
        canViewSessions: false,
        canViewReports: false,
        canViewWallet: true,
        canManageSubscribers: false,
        canViewVpn: false,
        canViewRadiusLogs: false,
        canViewAuditLog: false,
        canManageSms: false,
        canViewSupport: true,
        canViewBilling: true,
        canManageInvoices: true,
      };
    }

    // Map group keys to boolean permissions
    const groupPermissions: Record<string, boolean> = {};
    effectivePermissions.groups.forEach((group: any) => {
      groupPermissions[group.name] = true;
    });
    console.log('[useFeatureAccess] groupPermissions:', groupPermissions);

    // Map to legacy permissions for backward compatibility
    return {
      // New group-based permissions
      ...groupPermissions,
      
      // Legacy permissions mapped from groups
      canViewDashboard: true, // Always true
      canManageNas: groupPermissions.infrastructure_nas || false,
      canManageVouchers: groupPermissions.cards_vouchers || false,
      canManagePlans: groupPermissions.cards_vouchers || false,
      canViewSessions: groupPermissions.network_management || false,
      canViewReports: groupPermissions.reports_analytics || false,
      canViewWallet: groupPermissions.billing_finance || false,
      canManageSubscribers: groupPermissions.client_management || false,
      canViewVpn: groupPermissions.vpn_management || false,
      canViewRadiusLogs: groupPermissions.network_management || false,
      canViewAuditLog: groupPermissions.system_settings || false,
      canManageSms: groupPermissions.system_settings || false,
      canViewSupport: groupPermissions.support_tickets || false,
      canViewBilling: groupPermissions.billing_finance || false,
      canManageInvoices: groupPermissions.billing_finance || false,
    };
  }, [effectivePermissions]);

  return {
    permissions,
    allowedMenuItems: effectivePermissions?.allowedMenuItems ?? [],
    isLoading,
  };
}
