'use client'
import { useState }     from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools }               from '@tanstack/react-query-devtools'

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

function makeQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: (_data, _variables, _context, mutation) => {
        if (mutation.meta?.['affectsRisk'] === true) {
          for (const queryKey of RISK_BEARING_QUERY_ROOTS) {
            void client.invalidateQueries({ queryKey })
          }
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