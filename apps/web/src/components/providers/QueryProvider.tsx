'use client'
import { useState }     from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

function makeQueryClient(): QueryClient {
  return new QueryClient({
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