/**
 * Splits a dashboard's KPIs into the few that lead (large tiles) and the rest
 * (a compact list). Pure and shared by every role dashboard.
 *
 * `preferred` is an ordered list of KPI keys. The first `max` of them that the
 * server actually returned lead, in that order. A preferred KPI the caller has
 * no data for is skipped, never invented, and the next preference takes its
 * place. If none of the preferences exist, the first `max` KPIs lead so the
 * dashboard is never left without headlines. Every KPI lands in exactly one tier.
 */
export function splitKpis<K extends { key: string }>(
  kpis: readonly K[] | undefined,
  preferred: readonly string[],
  max = 4,
): { primary: K[]; secondary: K[] } {
  const all = kpis ?? []
  const limit = Math.max(0, Math.floor(max))
  const primary: K[] = []
  for (const key of preferred) {
    if (primary.length >= limit) break
    const found = all.find((k) => k.key === key)
    if (found && !primary.includes(found)) primary.push(found)
  }
  if (primary.length === 0) primary.push(...all.slice(0, limit))
  return { primary, secondary: all.filter((k) => !primary.includes(k)) }
}

/** "2 need watching" / "All healthy" / "" — from the KPIs inside a collapsed section, so a closed section still signals trouble. */
export function statusHeadline(kpis: readonly { status: string }[]): string {
  const hot = kpis.filter((k) => k.status === 'watch' || k.status === 'critical').length
  if (hot > 0) return `${hot} need${hot === 1 ? 's' : ''} watching`
  const judged = kpis.filter((k) => k.status !== 'neutral')
  return judged.length > 0 && judged.every((k) => k.status === 'healthy') ? 'All healthy' : ''
}

/** "Oldest 12 days" / "Oldest 1 day" / "Oldest today"; null when the age is not recorded (never "0 days" for unknown). */
export function ageLabel(ageDays: number | null | undefined): string | null {
  if (ageDays === null || ageDays === undefined || !Number.isFinite(ageDays) || ageDays < 0) return null
  const d = Math.round(ageDays)
  return d === 0 ? 'Oldest today' : `Oldest ${d} ${d === 1 ? 'day' : 'days'}`
}
