/**
 * سياسة الوقت التراكمي للكروت.
 * totalSessionTime هو المصدر المغلق، والجلسات الحية تُضاف إليه في UsageEngine.
 */
export function calculateRemainingSessionSeconds(
  usageBudgetSeconds: number | null | undefined,
  totalUsedSeconds: number | null | undefined,
): number | null {
  const budget = Number(usageBudgetSeconds ?? 0);
  if (budget <= 0) return null;
  return Math.max(0, budget - Math.max(0, Number(totalUsedSeconds ?? 0)));
}

