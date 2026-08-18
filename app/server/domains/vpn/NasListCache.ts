export async function invalidateNasListCache(): Promise<void> {
  try {
    const { cache } = await import('../../_core/cache.js');
    cache.deletePattern('nas:*');
  } catch (error) {
    console.error('[NAS Create] Failed to invalidate NAS list cache:', error);
  }
}
