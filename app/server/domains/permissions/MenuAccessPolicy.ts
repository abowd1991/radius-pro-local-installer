export type MenuGroupSource = { menuItems?: unknown };

export type MenuItemOverrideSource = {
  menuPath: string;
  isGranted: boolean;
};

export function normalizeMenuPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value.filter((path): path is string => typeof path === "string" && path.startsWith("/"))
  ));
}

/**
 * Resolves the exact list displayed to a client.
 * Legacy plans fall back to the paths declared on their permission groups.
 * Explicit plan paths are then changed only by user-specific grants/revokes.
 */
export function resolveAllowedMenuItems(input: {
  planMenuItems: unknown;
  planGroups: MenuGroupSource[];
  overrides: MenuItemOverrideSource[];
}): string[] {
  const groupPaths = input.planGroups.flatMap((group) => normalizeMenuPaths(group.menuItems));
  const basePaths = input.planMenuItems === null || input.planMenuItems === undefined
    ? groupPaths
    : normalizeMenuPaths(input.planMenuItems);

  const resolved = new Set(basePaths);
  for (const override of input.overrides) {
    if (!override.menuPath.startsWith("/")) continue;
    if (override.isGranted) resolved.add(override.menuPath);
    else resolved.delete(override.menuPath);
  }

  return Array.from(resolved).sort();
}

export function isMenuPathAllowed(pathname: string, allowedMenuItems: string[]): boolean {
  return allowedMenuItems.some((allowedPath) =>
    pathname === allowedPath || pathname.startsWith(`${allowedPath}/`)
  );
}
