/**
 * packages/shared/types/vercel-monitoring.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: ApiXxx type pairing for the Vercel-native "Platform" tab of
 *   /monitoring — mirrors monitoring.ts's convention exactly, kept in a
 *   separate file since it's a separate backend service
 *   (vercelMonitoringService) with no Sentry dependency.
 */

// `configured: false` means VERCEL_API_TOKEN / VERCEL_PROJECT_ID aren't
// set yet — the UI should show a "not set up" state, not an error.
export type ApiVercelSummary =
  | { configured: false }
  | {
      configured: true
      stats: Record<string, number> // 'pageviews:24h' -> N, 'visitors:24h' -> N
      latestDeploymentState: string | null
      unacknowledgedAlerts: number
      errorCount24h: number
    }

export interface ApiVercelDeployment {
  id: string
  deploymentId: string
  state: string // BUILDING | ERROR | INITIALIZING | QUEUED | READY | CANCELED | BLOCKED
  target: string | null
  url: string | null
  errorMessage: string | null
  createdAtVercel: string
  readyAtVercel: string | null
}

export interface ApiVercelErrorLog {
  id: string
  level: 'debug' | 'error' | 'fatal' | 'info' | 'trace' | 'warning'
  message: string
  source: string | null
  deploymentId: string | null
  requestPath: string | null
  responseStatusCode: number | null
  timestamp: string
}

export interface ApiVercelAlert {
  id: string
  kind: 'deployment_failed' | 'error_spike'
  severity: 'warning' | 'critical'
  message: string
  deploymentId: string | null
  occurredAt: string
  acknowledged: boolean
}