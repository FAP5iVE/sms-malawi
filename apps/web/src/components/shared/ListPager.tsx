'use client'

/**
 * apps/web/src/components/shared/ListPager.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8b-0: foundations)
 * [PURPOSE]: The controls under a list that is paged on the client
 *   (RULEBOOK section 7). Pair it with usePagedRows:
 *
 *     const paging = usePagedRows(rows, { resetKey: filterKey })
 *     ...rows drawn from paging.visible...
 *     <ListPager paging={paging} />
 *
 *   Desktop: "26 to 50 of 130", a rows-per-page choice (10, 25, 50), Previous
 *   and Next. Phones: one full-width "Show 20 more" button and a count. A list of
 *   10 rows or fewer shows nothing. No endless scrolling.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZES, needsPaging, normalizePageSize, rangeText } from '@/lib/hills/paging'
import type { PagedRows } from '@/lib/hills/usePagedRows'

const BTN =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-base px-3 text-sm font-heading font-semibold text-body ' +
  'min-h-11 md:min-h-9 app-hover disabled:pointer-events-none disabled:opacity-50'

export function ListPager<T>({ paging, className = '' }: { paging: PagedRows<T>; className?: string }) {
  if (!needsPaging(paging.total)) return null

  if (paging.isPhone) {
    return (
      <div className={`mt-4 flex flex-col items-center gap-2 ${className}`} data-slot="list-pager" data-mode="show-more">
        <p className="text-sm text-muted" aria-live="polite">
          Showing {paging.shown} of {paging.total}
        </p>
        {!paging.more.done && (
          <button type="button" onClick={paging.showMore} className={`${BTN} w-full`}>
            {paging.more.label}
          </button>
        )}
      </div>
    )
  }

  const atFirst = paging.page <= 1
  const atLast = paging.page >= paging.pages
  return (
    <div
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 text-sm ${className}`}
      data-slot="list-pager"
      data-mode="pages"
    >
      <p className="text-muted" aria-live="polite">
        {rangeText(paging.total, paging.page, paging.pageSize)}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-muted">
          <span>Rows per page</span>
          <select
            value={paging.pageSize}
            onChange={(e) => paging.setPageSize(normalizePageSize(e.target.value))}
            className="min-h-9 rounded-lg border border-base bg-surface px-2 text-body"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => paging.setPage(paging.page - 1)} disabled={atFirst} className={BTN}>
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </button>
          <span className="px-1 text-muted tabular-nums">
            Page {paging.page} of {paging.pages}
          </span>
          <button type="button" onClick={() => paging.setPage(paging.page + 1)} disabled={atLast} className={BTN}>
            Next
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ListPager
