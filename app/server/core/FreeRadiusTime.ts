/** V2 source: windowEndTime is UTC; render FreeRADIUS Expiration in UTC only. */
export function formatFreeRadiusExpiration(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid Expiration date');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, '0')} ${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}
