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

// ─── Platform operations (/reporting/admin/operations) ───────────────────────
// Built only from what the platform persists or can probe live. Anything the
// system does not record (backups, per-job run history, queues, mail delivery
// outcomes) is listed in `notRecorded` instead of being estimated.

export type ApiServiceStatus = 'ok' | 'degraded' | 'down'

export interface ApiOperationsService {
  name: string
  status: ApiServiceStatus
  /** Round-trip of the live probe; null when the probe is configuration-only. */
  latencyMs: number | null
  details: string | null
}

export type ApiSyncStatus = 'ok' | 'stale' | 'failing' | 'never'

export interface ApiOperationsSync {
  key: string
  label: string
  /** How the source refreshes: on a schedule, or only when monitoring is opened. */
  mode: 'scheduled' | 'on-demand'
  status: ApiSyncStatus
  /** Time of the last refresh attempt; null when it has never run. */
  lastAttemptAt: string | null
  ageMinutes: number | null
  /** Most recent failure not yet followed by a success. */
  lastError: string | null
}

export interface ApiOperationsDeployments {
  configured: boolean
  /** Deployments the platform has recorded (the most recent ones only). */
  recorded: number
  failed: number
  /** Failed ÷ finished (ready + failed) deployments; null with no finished deployment. */
  failureRate: number | null
  latestProduction: { state: string; at: string } | null
  lastSuccessfulProductionAt: string | null
  recent: { id: string; state: string; target: string | null; at: string; error: string | null }[]
}

export interface ApiOperationsErrors {
  configured: boolean
  last24h: number
  last7d: number
  /** Recorded runtime errors per hour for the last 24 hours (oldest first). */
  byHour: { hour: string; label: string; count: number }[]
  topPaths: { path: string; count: number }[]
  unacknowledgedAlerts: number
  alerts: { id: string; kind: string; severity: string; message: string; at: string }[]
  /** Runtime logs are only kept for as long as the platform has synced them. */
  oldestRecordedAt: string | null
}

export interface ApiOperationsIssues {
  configured: boolean
  unresolved: number
  activeOutages: number
  newLast7d: number
  oldestUnresolvedDays: number | null
  byLevel: { label: string; count: number }[]
  top: { id: string; title: string; level: string; events: number; users: number; lastSeenAt: string | null }[]
}

export interface ApiOperationsBacklog {
  pending: number
  /** Pending requests whose expiry has already passed but were never closed. */
  pastExpiry: number
  oldestPendingDays: number | null
  byType: { label: string; count: number }[]
}

export interface ApiOperationsNotRecorded {
  key: string
  label: string
  reason: string
}

export interface ApiOperationsReport {
  generatedAt: string
  /** Which parts the caller is permitted to see; absent parts are not computed. */
  access: { health: boolean; monitoring: boolean; database: boolean }
  overall: 'healthy' | 'warning' | 'degraded' | null
  services: ApiOperationsService[] | null
  sync: ApiOperationsSync[] | null
  deployments: ApiOperationsDeployments | null
  errors: ApiOperationsErrors | null
  issues: ApiOperationsIssues | null
  backlog: ApiOperationsBacklog
  audit: { last24h: number; last7d: number }
  notRecorded: ApiOperationsNotRecorded[]
}
