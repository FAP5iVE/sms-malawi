/** Response types for /reporting/admin/* — security, sessions, governance, adoption. */

export interface ApiSecurityDay {
  date: string
  label: string
  successful: number
  failed: number
  failureRate: number | null
}

export interface ApiSecurityReport {
  days: number
  successful: number
  failed: number
  failureRate: number | null
  trend: ApiSecurityDay[]
  /** Days with an unusually high number of failed sign-ins. */
  bursts: { date: string; label: string; failed: number }[]
  /** Identifiers (email typed) with repeated failures in the last 24 hours. */
  repeatedFailures: { identifier: string; failures: number; lastAt: string }[]
  repeatedFailureThreshold: number
  forcedLogouts: { count: number; recent: { at: string; role: string }[] }
  /** Accounts that signed in from several different IP addresses in the last 7 days. */
  multiIpAccounts: { uid: string; role: string; ipCount: number; sessions: number }[]
  multiIpThreshold: number
}

export interface ApiSessionsReport {
  days: number
  activeNow: number
  activeByRole: { role: string; count: number }[]
  perDay: { date: string; label: string; sessions: number; users: number }[]
  avgDurationMinutes: number | null
  medianDurationMinutes: number | null
  durationBands: { label: string; count: number }[]
  endReasons: { label: string; count: number }[]
  totalSessions: number
}

export interface ApiGovernanceCategory {
  key: string
  label: string
  description: string
  count: number
  /** The most frequent actions inside the category. */
  top: { action: string; count: number }[]
}

export interface ApiGovernanceReport {
  days: number
  total: number
  perDay: { date: string; label: string; count: number }[]
  byRole: { label: string; count: number }[]
  byDomain: { label: string; count: number }[]
  byAction: { label: string; count: number }[]
  categories: ApiGovernanceCategory[]
}

export interface ApiAdoptionRole {
  role: string
  accounts: number
  active7: number
  active30: number
  /** Accounts with no session in 30 days. */
  inactive: number
  activeRate: number | null
}

export interface ApiAdoptionReport {
  accounts: number
  active7: number
  active30: number
  activeRate30: number | null
  byRole: ApiAdoptionRole[]
  weekly: { weekStart: string; label: string; users: number }[]
  /** Which parts of the system are used, by audit activity (last 30 days). */
  featureUsage: { label: string; count: number }[]
}
