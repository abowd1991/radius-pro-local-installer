export type LifecycleActivityRow = {
  lifecycleId: string;
  firstLogin: Date | null;
  lastSeen: Date | null;
};

/**
 * An accounting history must be keyed by the immutable card lifecycle, never
 * by a reusable RADIUS username. This prevents a re-created manual card from
 * displaying an earlier card instance's sessions.
 */
export function buildLifecycleActivityMap(rows: LifecycleActivityRow[]): Record<string, { firstLogin: Date | null; lastSeen: Date | null }> {
  const map: Record<string, { firstLogin: Date | null; lastSeen: Date | null }> = {};
  for (const row of rows) {
    map[row.lifecycleId] = {
      firstLogin: row.firstLogin ?? null,
      lastSeen: row.lastSeen ?? null,
    };
  }
  return map;
}
