import type { RetentionPolicy } from '@harness/contracts';
export function retentionSelection(
  rows: { id: string; updatedAt: number }[],
  policy: RetentionPolicy,
  protectedIds: ReadonlySet<string>,
  now: number,
  limit = 500,
) {
  if (!policy.enabled || limit < 1) return [];
  const expired = new Set<string>();
  if (policy.maxAgeDays) {
    const cutoff = now - policy.maxAgeDays * 86_400_000;
    for (const row of rows)
      if (row.updatedAt <= cutoff && !protectedIds.has(row.id))
        expired.add(row.id);
  }
  const ranked = rows
    .filter((row) => !protectedIds.has(row.id) && !expired.has(row.id))
    .sort(
      (a, b) =>
        b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const protectedCount = rows.filter((row) => protectedIds.has(row.id)).length;
  const keep =
    policy.maxConversations == null
      ? ranked.length
      : Math.max(policy.maxConversations - protectedCount, 0);
  const overflow =
    policy.maxConversations == null
      ? []
      : ranked.slice(keep).map((row) => row.id);
  return [...expired, ...overflow]
    .filter((id) => !protectedIds.has(id))
    .slice(0, limit);
}
