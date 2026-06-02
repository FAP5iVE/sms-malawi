'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState }                          from 'react'
import dynamic                               from 'next/dynamic'

// Dynamic import — the devtools bundle (~150 kB) is NEVER sent to
// production users. The component is only loaded in development.
const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () =>
          import('@tanstack/react-query-devtools').then(
            (m) => m.ReactQueryDevtools
          ),
        { ssr: false }
      )
    : () => null

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState ensures one QueryClient per Next.js request on the server
  // and one persistent client on the browser — prevents state leaking
  // between server renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 1-minute stale time — balances freshness vs unnecessary refetches.
            // Individual queries override this per their update frequency
            // (see Phase A: INT-021 stale-time categorisation — Phase E work).
            staleTime:           60 * 1000,
            refetchOnWindowFocus:false,
            retry:               1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}