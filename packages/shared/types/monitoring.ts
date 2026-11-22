/**
 * packages/shared/types/monitoring.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: ApiXxx type pairing for the Sentry-backed /monitoring admin
 *   dashboard — mirrors every other module's convention (e.g. api.ts's
 *   ApiPlacement* types).
 */

export interface ApiMonitoringSummary {
  stats: Record<string, number>    // 'crash_free_sessions:7d' -> 99.2, 'apdex:24h' -> 0.94, etc.
  unresolvedIssues: number
  activeOutages: number
  recentAlerts: ApiMonitoringAlert[]
}

export interface ApiMonitoringIssue {
  id: string
  sentryIssueId: string
  shortId: string | null
  title: string
  culprit: string | null
  level: 'error' | 'warning' | 'fatal' | 'info' | 'debug'
  status: 'unresolved' | 'resolved' | 'ignored'
  substatus: string | null
  isUptimeIssue: boolean
  eventCount: number
  userCount: number
  lastSeenAt: string | null
  permalink: string | null
}

export interface ApiMonitoringAlert {
  id: string
  sentryAlertId: string
  name: string
  enabled: boolean
  lastTriggeredAt: string | null
}

export interface ApiMonitoringRelease {
  version: string
  dateCreated: string
  newGroups: number
  deployCount: number
}

export interface ApiMonitoringLog {
  id: string
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  message: string
  timestamp: string
  attributes?: Record<string, unknown>
}

export interface ApiMonitoringFeedback {
  id: string
  message: string
  submittedByRole?: string
  dateCreated: string
  associatedIssueId?: string
  /** [NEW] Who sent it — required on every "Report a problem" submission. */
  reporterName?: string
  /** [NEW] Employee number (staff) or student number (students), as typed. */
  reporterIdNumber?: string
  reporterIdType?: 'EMPLOYEE_NUMBER' | 'STUDENT_NUMBER'
  /** [NEW] true = typed number matches the signed-in account's record,
   *  false = it does not, null = no record on file to compare against. */
  idMatchesAccount?: boolean | null
  pageUrl?: string | null
}

export interface ApiMonitoringReplay {
  id: string
  duration: number
  errorCount: number
  browser: { name: string; version: string } | null
  urls: string[]
  finishedAt: string
}