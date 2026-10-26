'use client'
import { useState }     from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools }               from '@tanstack/react-query-devtools'
import { toast }                                from 'sonner'
import { ApiError }                             from '@/lib/api-client'
import { getErrorMessage }                      from '@/lib/feedback'

/**
 * Categorised stale times.
 * - STATIC:    reference data that rarely changes (grading scales, school settings)
 * - SLOW:      HR, library inventory, enrollment counts
 * - MEDIUM:    exam results, term data, reports
 * - FAST:      dashboard KPIs, attendance, notifications
 * - REALTIME:  live flags (pending actions, unread count)
 */
const STALE = {
  STATIC:   1000 * 60 * 60 * 24,   // 24 hours
  SLOW:     1000 * 60 * 30,         // 30 minutes
  MEDIUM:   1000 * 60 * 5,          // 5 minutes
  FAST:     1000 * 60,              // 1 minute
  REALTIME: 1000 * 20,              // 20 seconds
} as const

/**
 * Student risk is DERIVED from fees, results, attendance and the library, and
 * is shown on the Students list, the student profile, the class roster and the
 * dashboard. When any mutation that changes one of those inputs succeeds
 * (tagged `meta: { affectsRisk: true }` on the hook), refresh every query that
 * carries risk so the badge moves immediately instead of up to STALE.MEDIUM
 * (5 min) later. Tagging a hook is the only thing a module has to do to take
 * part — the modules don't need to know about each other.
 */
const RISK_BEARING_QUERY_ROOTS: ReadonlyArray<readonly unknown[]> = [
  ['students'],            // list, detail, me, at-risk
  ['classes', 'detail'],   // class roster dots
]

/**
 * Server answers that are a QUESTION for the caller, not a failure to report.
 * The invoice screen reacts to a 409 carrying `overpayments` by opening a
 * "this exceeds the balance - confirm?" dialog, and the results-compute
 * screen reacts to `missingCa` by offering "compute anyway". An error toast
 * on top of those would announce a failure that is really a prompt.
 */
function isPromptNotFailure(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false
  const details = error.details as { overpayments?: unknown; missingCa?: unknown } | undefined
  return Array.isArray(details?.overpayments) || Array.isArray(details?.missingCa)
}

function makeQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      // [FEEDBACK] Every failed mutation tells the user, unless the caller
      // opted out with `meta.feedback: 'manual'`. Before this, only the
      // handful of hooks that remembered to toast ever did - the rest failed
      // silently (a rejected Save looked identical to a successful one).
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.['feedback'] === 'manual') return
        if (isPromptNotFailure(error)) return
        const title  = mutation.meta?.['failureTitle']
        const reason = getErrorMessage(error)
        toast.error(typeof title === 'string' ? title : reason, {
          // Same message => same toast: a bulk action that fails 12 times shows one toast.
          id: `mutation-error:${typeof title === 'string' ? title : ''}:${reason}`,
          ...(typeof title === 'string' ? { description: reason } : {}),
        })
      },
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.['affectsRisk'] === true) {
          for (const queryKey of RISK_BEARING_QUERY_ROOTS) {
            void client.invalidateQueries({ queryKey })
          }
        }
        // [FEEDBACK] Confirmation toast for hooks that declare one.
        const message = mutation.meta?.['successMessage']
        if (mutation.meta?.['feedback'] !== 'manual' && typeof message === 'string') {
          // Same message => same toast, so a bulk action doesn't stack N copies.
          toast.success(message, { id: `mutation-ok:${message}` })
        }
      },
    }),
    defaultOptions: {
      queries: {
        // Default: MEDIUM — overridden per-hook where needed
        staleTime:             STALE.MEDIUM,
        gcTime:                1000 * 60 * 10,    // 10 minutes garbage collection
        retry:                 2,
        retryDelay:            (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
        refetchOnWindowFocus:  false,
        refetchOnReconnect:    true,
        refetchOnMount:        true,
      },
      mutations: {
        retry: 0,
      },
    },
  })
  return client
}

let browserQueryClient: QueryClient | undefined

function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always a new client
    return makeQueryClient()
  }
  // Browser: singleton to preserve cache across renders
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </QueryClientProvider>
  )
}

// ─── STALE TIME EXPORTS ───────────────────────────────────────────────────────
// Import these in individual hooks to override default staleTime per category.

export { STALE }