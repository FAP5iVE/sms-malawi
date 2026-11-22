/** Pure admin-reporting helpers (no database access, unit-tested). */
import { median, mean } from '@/server/services/reporting/kpi'

export const REPEATED_FAILURE_THRESHOLD = 5
export const MULTI_IP_THRESHOLD = 3

/** YYYY-MM-DD (UTC). */
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10)

export const dayLabel = (key: string): string =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })

/** The last `n` UTC days ending at `asOf`, oldest first. */
export function lastDays(n: number, asOf: Date): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(dayKey(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() - i))))
  }
  return out
}

/** Monday (UTC) of the week containing `d`. */
export function mondayOf(d: Date): string {
  const day = d.getUTCDay()
  return dayKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (day === 0 ? -6 : 1 - day))))
}

/** Days whose failed sign-ins are unusually high: ≥ 10 and ≥ 3× the median day. */
export function detectBursts(days: readonly { date: string; failed: number }[]): { date: string; failed: number }[] {
  const baseline = median(days.map((d) => d.failed)) ?? 0
  const floor = Math.max(10, baseline * 3)
  return days.filter((d) => d.failed >= floor)
}

export function repeatedFailures(
  events: readonly { identifier: string; at: Date }[],
  threshold = REPEATED_FAILURE_THRESHOLD,
): { identifier: string; failures: number; lastAt: Date }[] {
  const m = new Map<string, { failures: number; lastAt: Date }>()
  for (const e of events) {
    const cur = m.get(e.identifier)
    if (!cur) m.set(e.identifier, { failures: 1, lastAt: e.at })
    else {
      cur.failures += 1
      if (e.at > cur.lastAt) cur.lastAt = e.at
    }
  }
  return Array.from(m.entries())
    .filter(([, v]) => v.failures >= threshold)
    .map(([identifier, v]) => ({ identifier, ...v }))
    .sort((a, b) => b.failures - a.failures)
}

/** Today's volume is abnormal when ≥ 50 and ≥ 3× the mean of the prior days. */
export function abnormalVolume(today: number, prior: readonly number[]): boolean {
  const baseline = mean(prior)
  if (baseline === null) return false
  return today >= 50 && today >= Math.max(1, baseline) * 3
}

export const DURATION_BANDS = ['Under 5 min', '5–30 min', '30 min–2 h', '2–8 h', 'Over 8 h'] as const

export function durationBand(minutes: number): (typeof DURATION_BANDS)[number] {
  if (minutes < 5) return 'Under 5 min'
  if (minutes < 30) return '5–30 min'
  if (minutes < 120) return '30 min–2 h'
  if (minutes < 480) return '2–8 h'
  return 'Over 8 h'
}

export const durationStats = (minutes: readonly number[]) => ({
  avg: mean(minutes, 0),
  median: median(minutes, 0),
})

export type AuditCategoryKey = 'approvals' | 'releases' | 'destructive' | 'finance' | 'hr' | 'access'

export const AUDIT_CATEGORIES: { key: AuditCategoryKey; label: string; description: string }[] = [
  { key: 'approvals', label: 'Approvals & rejections', description: 'Decisions that authorise or refuse a request.' },
  { key: 'releases', label: 'Releases & finalisation', description: 'Results released, marks finalised, payroll locked.' },
  { key: 'destructive', label: 'Destructive operations', description: 'Deletions, archiving, write-offs, rollbacks and revoked sessions.' },
  { key: 'finance', label: 'Finance & procurement', description: 'Payroll, expenses, budgets, procurement and inventory actions.' },
  { key: 'hr', label: 'HR actions', description: 'Salary, allowance, loan and leave changes.' },
  { key: 'access', label: 'User & access management', description: 'Role changes, account claims and forced sign-outs.' },
]

/** The domain an audit action belongs to: text before the first '.' or '_' (LOGIN_* → auth). */
export function domainOf(action: string): string {
  if (/^LOGIN_/.test(action)) return 'auth'
  if (/^[A-Z]+_[A-Z_]+$/.test(action)) return action.split('_')[0]?.toLowerCase() ?? action
  return action.split('.')[0]?.toLowerCase() || action
}

/** Every category an audit action falls into (an action can count in more than one). */
export function categoriesOf(action: string): AuditCategoryKey[] {
  const a = action.toLowerCase()
  const domain = domainOf(action)
  const out: AuditCategoryKey[] = []
  if (/approv|reject|denied/.test(a)) out.push('approvals')
  if (/releas|finaliz|finalis|\.lock$|results_approved/.test(a)) out.push('releases')
  if (/delete|softdelete|archive|dispose|writeoff|rollback|discard|revoked|cancel/.test(a)) out.push('destructive')
  if (['finance', 'payroll', 'procurement', 'inventory'].includes(domain)) out.push('finance')
  if (domain === 'hr') out.push('hr')
  if (domain === 'user' || (domain === 'auth' && !/^LOGIN_/.test(action))) out.push('access')
  return out
}

