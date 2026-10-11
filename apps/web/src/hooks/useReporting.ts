'use client'

/**
 * apps/web/src/hooks/useReporting.ts
 *
 * Generic TanStack Query wrapper over the domain reporting API
 * (GET /reporting/<domain>/<endpoint>). Domain hook files
 * (hooks/reporting/use<Domain>Reporting.ts) are thin typed wrappers around
 * `useReportingQuery`, so every reporting hook shares one cache namespace
 * (queryKeys.reporting), one URL builder and one error/stale policy.
 *
 * Period handling: callers pass `academicYear`/`term` explicitly (from
 * useViewingPeriod); `undefined` params are omitted from the URL and the cache
 * key, and the query stays disabled until `enabled` is true, so a request is
 * never made with a guessed year.
 */
import { useQuery } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { STALE } from '@/components/providers/QueryProvider'

export type ReportingParams = Record<string, string | number | boolean | undefined | null>

export function buildQuery(params: ReportingParams | undefined): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const rendered = search.toString()
  return rendered ? `?${rendered}` : ''
}

export interface ReportingQueryOptions {
  /** Defaults to STALE.MEDIUM. */
  staleTime?: number
  /** Extra gate (e.g. permission or period resolved). Defaults to true. */
  enabled?: boolean
}

export function useReportingQuery<T>(
  domain: string,
  endpoint: string,
  params?: ReportingParams,
  options?: ReportingQueryOptions,
) {
  const cleaned: ReportingParams = {}
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') cleaned[k] = v
    }
  }
  return useQuery({
    queryKey: queryKeys.reporting.endpoint(domain, endpoint, cleaned),
    queryFn: () => apiFetch<T>(`/reporting/${domain}/${endpoint}${buildQuery(cleaned)}`),
    staleTime: options?.staleTime ?? STALE.MEDIUM,
    enabled: options?.enabled ?? true,
  })
}

export { STALE }
