'use client'

/**
 * apps/web/src/lib/hills/usePagedRows.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8b-0: foundations)
 * [PURPOSE]: Client side paging of rows a page ALREADY holds (RULEBOOK R7.4).
 *   It never fetches and never changes a query. Rules live in paging.ts.
 *
 *   const paging = usePagedRows(filteredRows, { resetKey: search + statusFilter })
 *   {paging.visible.map(...)}
 *   <ListPager paging={paging} />
 *
 *   • Desktop: `visible` is one page; the size (10, 25, 50) is remembered.
 *   • Phone:   `visible` is the first N rows; "Show 20 more" adds the next batch.
 *   • `resetKey` changes (a filter or search changed): back to page 1 / first 20.
 *   • Server render uses the desktop default (React's server snapshot), so
 *     nothing mismatches; the stored size and the phone width apply on hydration.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_STORAGE_KEY,
  PHONE_QUERY,
  PHONE_STEP,
  clampPage,
  firstRows,
  normalizePageSize,
  pageCount,
  showMorePlan,
  sliceForPage,
  type PageSize,
  type ShowMorePlan,
} from '@/lib/hills/paging'

// ── External stores (read with useSyncExternalStore, so no setState in effects) ──

const sizeListeners = new Set<() => void>()
/** Used only when localStorage is blocked, so the choice still lasts until reload. */
let memorySize: PageSize = DEFAULT_PAGE_SIZE

function subscribeSize(onChange: () => void): () => void {
  sizeListeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    sizeListeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}
function readSize(): PageSize {
  try {
    const stored = window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY)
    return stored === null ? memorySize : normalizePageSize(stored)
  } catch {
    return memorySize
  }
}
function writeSize(size: PageSize): void {
  memorySize = size
  try {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size))
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
  sizeListeners.forEach((l) => l())
}

function subscribePhone(onChange: () => void): () => void {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const readPhone = () => window.matchMedia(PHONE_QUERY).matches

export interface PagedRows<T> {
  /** The rows to draw now. */
  visible: T[]
  total: number
  isPhone: boolean
  // desktop
  page: number
  pages: number
  pageSize: PageSize
  setPage: (page: number) => void
  setPageSize: (size: PageSize) => void
  // phone
  shown: number
  more: ShowMorePlan
  showMore: () => void
}

export function usePagedRows<T>(rows: readonly T[], options: { resetKey?: string | number } = {}): PagedRows<T> {
  const resetKey = options.resetKey ?? ''
  const [pageState, setPageState] = useState({ key: resetKey, page: 1 })
  const [shownState, setShownState] = useState({ key: resetKey, shown: PHONE_STEP })
  const pageSize = useSyncExternalStore(subscribeSize, readSize, () => DEFAULT_PAGE_SIZE)
  const isPhone = useSyncExternalStore(subscribePhone, readPhone, () => false)

  const total = rows.length
  // A changed resetKey means a new list: start again without an effect.
  const rawPage = pageState.key === resetKey ? pageState.page : 1
  const page = clampPage(rawPage, total, pageSize)
  const shown = shownState.key === resetKey ? shownState.shown : PHONE_STEP

  const setPage = useCallback((next: number) => setPageState({ key: resetKey, page: next }), [resetKey])

  const setPageSize = useCallback(
    (size: PageSize) => {
      writeSize(size)
      setPageState({ key: resetKey, page: 1 })
    },
    [resetKey],
  )

  const more = useMemo(() => showMorePlan(shown, total), [shown, total])
  const showMore = useCallback(() => setShownState({ key: resetKey, shown: more.next }), [resetKey, more.next])

  const visible = useMemo(
    () => (isPhone ? firstRows(rows, shown) : sliceForPage(rows, page, pageSize)),
    [isPhone, rows, shown, page, pageSize],
  )

  return {
    visible,
    total,
    isPhone,
    page,
    pages: pageCount(total, pageSize),
    pageSize,
    setPage,
    setPageSize,
    shown: Math.min(shown, total),
    more,
    showMore,
  }
}
