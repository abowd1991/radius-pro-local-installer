import { ALL_MENU_SECTIONS } from "./menu-config";

export type ControllableMenuItem = {
  path: string;
  label: string;
  labelAr: string;
  sectionId: string;
  sectionLabelAr: string;
  permissionGroup?: string;
};

// Account self-service must remain reachable for every signed-in user.
const CORE_PATHS = new Set(["/dashboard", "/profile", "/settings"]);

export function isClientManagedRole(role: string) {
  return role === "client" || role === "reseller" || role === "client_owner" || role === "client_admin" || role === "client_staff";
}

export function isMenuPathAllowed(pathname: string, allowedMenuItems: string[] | null | undefined) {
  if (CORE_PATHS.has(pathname)) return true;
  if (!Array.isArray(allowedMenuItems)) return true;
  return allowedMenuItems.some((allowedPath) =>
    pathname === allowedPath || pathname.startsWith(`${allowedPath}/`)
  );
}

export function getControllableMenuItems(role: "client" | "reseller"): ControllableMenuItem[] {
  return ALL_MENU_SECTIONS.flatMap((section) => {
    if (section.requiredRole && !section.requiredRole.includes(role)) return [];
    return section.items
      .filter((item) => !item.requiredRole || item.requiredRole.includes(role))
      .filter((item) => !CORE_PATHS.has(item.path))
      .map((item) => ({
        path: item.path,
        label: item.label,
        labelAr: item.labelAr,
        sectionId: section.id,
        sectionLabelAr: section.labelAr,
        permissionGroup: item.requiredPermissionGroup || section.requiredPermissionGroup,
      }));
  });
}
