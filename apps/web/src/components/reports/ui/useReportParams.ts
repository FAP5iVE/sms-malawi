'use client'

/**
 * URL-backed report state. Drill-down from a dashboard KPI (or from one report
 * section to another) is expressed as query parameters on /reports — e.g.
 * /reports?tab=aging&bucket=d90_plus — so a drilled view is linkable, survives
 * refresh and the browser Back button works. Uses the app's existing Next.js
 * navigation; no bespoke routing.
 */
import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Read/write one query parameter without disturbing the others. */
export function useReportParam(key: string): [string | undefined, (value: string | undefined) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const value = params.get(key) ?? undefined

  const set = useCallback(
    (next: string | undefined) => {
      const search = new URLSearchParams(params.toString())
      if (next === undefined || next === '') search.delete(key)
      else search.set(key, next)
      const qs = search.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, params, key],
  )

  return [value, set]
}

/** Build a /reports deep link: reportLink('aging', { bucket: 'd90_plus' }). */
export function reportLink(tab: string, params?: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams({ tab })
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) search.set(k, String(v))
    }
  }
  return `/reports?${search.toString()}`
}
