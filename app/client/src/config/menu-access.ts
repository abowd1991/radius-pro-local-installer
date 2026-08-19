import { ALL_MENU_SECTIONS } from "./menu-config";

export type ControllableMenuItem = {
  path: string;
  label: string;
  labelAr: string;
  sectionId: string;
  sectionLabelAr: string;
  permissionGroup?: string;
};

// Dashboard and profile remain personal account pages. Settings is deliberately
// excluded so client_staff receives it only through explicit delegation.
const CORE_PATHS = new Set(["/dashboard", "/profile", "/user-guide"]);

export function isClientManagedRole(role: string) {
  return role === "client" || role === "reseller" || role === "client_owner" || role === "client_admin" || role === "client_staff";
}

export function isMenuPathAllowed(pathname: string, allowedMenuItems: string[] | null | undefined, role?: string) {
  if (CORE_PATHS.has(pathname)) return true;
  if (pathname === "/settings") {
    if (role === "client_staff") {
      return Array.isArray(allowedMenuItems) && allowedMenuItems.some((path) => path === "/settings");
    }
    return true;
  }
  if (pathname === "/staff-management") {
    return role === "client" || role === "client_owner";
  }
  if (pathname === "/recycle-bin") {
    return role !== "client_staff";
  }
  if (!Array.isArray(allowedMenuItems)) return role !== "client_staff";
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
