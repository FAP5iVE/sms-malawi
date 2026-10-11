'use client'

/**
 * ReportTable — compact, sortable detail table for report tabs.
 *
 *  - Columns declare how to render (`cell`), sort (`sortValue`) and export
 *    (`exportValue`, defaulting to sortValue) a value.
 *  - Passing `exportLabel` registers the table with the report export toolbar
 *    so what the user sees is what they can download.
 *  - Rows may be clickable (`rowHref`) so a table row drills into the entity.
 *  - Long tables show `pageSize` rows with a "Show more" control; sorting
 *    applies to the whole data set, not just the visible page.
 */
import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type { CsvCell } from '@/lib/csv'
import { cn } from '@/lib/utils'
import { useExportable } from './ReportExport'
import { ReportEmpty } from './ReportStates'

export interface ReportTableColumn<T> {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  /** Rendered cell. Defaults to the sort/export value as text. */
  cell?: (row: T) => ReactNode
  /** Value used for sorting (and export when exportValue is omitted). */
  sortValue?: (row: T) => string | number | null | undefined
  exportValue?: (row: T) => CsvCell
  /** Hide on small screens to keep the table readable on mobile. */
  hideOnMobile?: boolean
}

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const an = a === null || a === undefined
  const bn = b === null || b === undefined
  if (an && bn) return 0
  if (an) return 1 // nulls always last
  if (bn) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  exportLabel,
  caption,
  emptyMessage = 'No records for this selection.',
  pageSize = 15,
  defaultSort,
  className,
}: {
  columns: readonly ReportTableColumn<T>[]
  rows: readonly T[] | undefined
  rowKey: (row: T, index: number) => string
  rowHref?: (row: T) => string | undefined
  exportLabel?: string
  caption?: string
  emptyMessage?: string
  pageSize?: number
  defaultSort?: { key: string; direction: 'asc' | 'desc' }
  className?: string
}) {
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(defaultSort ?? null)
  const [visible, setVisible] = useState(pageSize)

  const sorted = useMemo(() => {
    const data = rows ?? []
    if (!sort) return data
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return data
    const dir = sort.direction === 'asc' ? 1 : -1
    const get = col.sortValue
    return [...data].sort((x, y) => {
      const a = get(x)
      const b = get(y)
      // Keep nulls last regardless of direction.
      if (a === null || a === undefined || b === null || b === undefined) return compareValues(a, b)
      return compareValues(a, b) * dir
    })
  }, [rows, columns, sort])

  useExportable(
    exportLabel ?? null,
    exportLabel ? rows : undefined,
    columns.map((c) => ({
      label: c.label,
      value: (row: T): CsvCell =>
        c.exportValue ? c.exportValue(row) : (c.sortValue?.(row) as CsvCell) ?? '',
    })),
  )

  if (!rows || rows.length === 0) return <ReportEmpty message={emptyMessage} />

  const shown = sorted.slice(0, visible)

  const toggleSort = (c: ReportTableColumn<T>) => {
    if (!c.sortValue) return
    setSort((prev) =>
      prev?.key === c.key
        ? { key: c.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key: c.key, direction: 'asc' },
    )
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="min-w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-base text-left text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => {
              const active = sort?.key === c.key
              const SortIcon = !active ? ChevronsUpDown : sort?.direction === 'asc' ? ArrowUp : ArrowDown
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'whitespace-nowrap px-3 py-2 font-medium',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.hideOnMobile && 'hidden md:table-cell',
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c)}
                      className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20 rounded"
                    >
                      {c.label}
                      <SortIcon className={cn('h-3 w-3', active ? 'text-brand-navy' : 'opacity-40')} aria-hidden />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => {
            const href = rowHref?.(row)
            return (
              <tr key={rowKey(row, i)} className={cn('border-b border-base/60 last:border-0', href && 'hover:bg-page')}>
                {columns.map((c, ci) => {
                  const content = c.cell
                    ? c.cell(row)
                    : (c.sortValue?.(row) ?? '—')
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2 tabular-nums text-brand-navy',
                        c.align === 'right' && 'text-right',
                        c.align === 'center' && 'text-center',
                        c.hideOnMobile && 'hidden md:table-cell',
                      )}
                    >
                      {href && ci === 0 ? (
                        <Link href={href} className="font-medium text-brand-teal hover:underline">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.length > visible && (
        <div className="flex items-center justify-between pt-3 text-xs text-muted">
          <span>
            Showing {shown.length.toLocaleString('en-US')} of {sorted.length.toLocaleString('en-US')}
          </span>
          <button
            type="button"
            onClick={() => setVisible((v) => v + pageSize)}
            className="rounded-lg border border-base px-3 py-1.5 font-medium text-brand-navy hover:bg-base focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
          >
            Show more
          </button>
        </div>
      )}
    </div>
  )
}
