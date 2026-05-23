'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  LayoutGrid,
  List,
  X,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react'

export interface DataColumn<T> {
  key: keyof T | string
  label: string
  sortable?: boolean
  width?: string
  render?: (row: T) => React.ReactNode
}

interface QuickFilter {
  label: string
  value: string
}
interface Pagination {
  page: number
  pages: number
  onPageChange: (p: number) => void
}

interface DataTableProps<T> {
  data: T[]
  isLoading: boolean
  columns: DataColumn<T>[]
  quickFilters?: QuickFilter[]
  activeQuickFilter?: string
  onQuickFilter?: (value: string) => void
  rowKey: keyof T
  onBulkArchive?: (ids: string[]) => void
  onBulkAction?: (action: string, ids: string[]) => void
  filterPanel?: React.ReactNode
  pagination?: Pagination
  emptyMessage?: string
}

type SortDir = 'asc' | 'desc' | null

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="h-4 w-4 rounded bg-surface animate-pulse" />
      </td>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className={`h-4 rounded bg-surface animate-pulse ${
              i % 3 === 0 ? 'w-3/5' : i % 3 === 1 ? 'w-4/5' : 'w-2/3'
            }`}
          />
        </td>
      ))}
    </tr>
  )
}

export function DataTable<T extends object>({
  data,
  isLoading,
  columns,
  quickFilters,
  activeQuickFilter,
  onQuickFilter,
  rowKey,
  onBulkArchive,
  onBulkAction,
  filterPanel,
  pagination,
  emptyMessage = 'No records found.',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [view, setView] = useState<'table' | 'card'>('table')
  const [filterOpen, setFilterOpen] = useState(false)
  const [activeChips, setActiveChips] = useState<string[]>([])

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data
    return [...data].sort((a, b) => {
      const av = String((a as Record<string, unknown>)[sortKey] ?? '')
      const bv = String((b as Record<string, unknown>)[sortKey] ?? '')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [data, sortKey, sortDir])

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
      return
    }
    if (sortDir === 'asc') {
      setSortDir('desc')
      return
    }
    setSortKey(null)
    setSortDir(null)
  }

  function toggleRow(id: string) {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }
  function toggleAll() {
    const ids = sorted.map((r) => String(r[rowKey]))
    setSelected((p) => (p.length === ids.length ? [] : ids))
  }
  function removeChip(chip: string) {
    setActiveChips((p) => p.filter((c) => c !== chip))
  }

  const SortIcon = ({ col }: { col: DataColumn<T> }) => {
    if (!col.sortable) return null
    if (sortKey === col.key && sortDir === 'asc') return <ChevronUp className="w-3 h-3" />
    if (sortKey === col.key && sortDir === 'desc') return <ChevronDown className="w-3 h-3" />
    return <ChevronsUpDown className="w-3 h-3 text-muted" />
  }

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex gap-2 flex-wrap">
          {quickFilters?.map((f) => (
            <button
              key={f.value}
              onClick={() => onQuickFilter?.(f.value)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                activeQuickFilter === f.value
                  ? 'bg-brand-navy text-white border-brand-navy'
                  : 'bg-surface border-base text-muted hover:border-brand-navy',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected.length > 0 && onBulkArchive && (
            <button
              onClick={() => {
                onBulkArchive(selected)
                setSelected([])
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-coral/15 text-brand-coral border border-brand-coral/20 hover:bg-brand-coral/25 transition-colors"
            >
              Archive {selected.length} selected
            </button>
          )}
          {filterPanel && (
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-base rounded-lg text-xs font-medium hover:bg-page transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            </button>
          )}
          <div className="flex border border-base rounded-lg overflow-hidden">
            <button
              onClick={() => setView('table')}
              aria-label="Table view"
              className={`p-1.5 ${view === 'table' ? 'bg-brand-navy text-white' : 'hover:bg-page text-muted'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView('card')}
              aria-label="Card view"
              className={`p-1.5 ${view === 'card' ? 'bg-brand-navy text-white' : 'hover:bg-page text-muted'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {activeChips.map((chip) => (
            <span
              key={chip}
              className="flex items-center gap-1.5 bg-brand-teal/10 text-brand-teal text-xs font-medium px-2.5 py-1 rounded-full"
            >
              {chip} {/* FIX (line 197): icon-only button inside chip needs aria-label */}
              <button onClick={() => removeChip(chip)} aria-label={`Remove filter ${chip}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button onClick={() => setActiveChips([])} className="text-xs text-muted hover:text-body">
            Clear all
          </button>
        </div>
      )}

      {/* Right-slide filter panel */}
      <AnimatePresence>
        {filterOpen && filterPanel && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed inset-y-0 right-0 z-40 w-72 bg-surface border-l border-base shadow-xl p-6 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-heading font-bold text-brand-navy">Filters</h3>
              {/* FIX (line 219): icon-only close button needs aria-label */}
              <button
                onClick={() => setFilterOpen(false)}
                aria-label="Close filters"
                className="p-1 hover:bg-page rounded"
              >
                <X className="w-4 h-4 text-muted" />
              </button>
            </div>
            {filterPanel}
          </motion.div>
        )}
      </AnimatePresence>

      {/* TABLE VIEW */}
      {view === 'table' && (
        <div className="border border-base rounded-xl overflow-hidden bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-base bg-page">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      className="accent-brand-teal"
                      checked={selected.length === sorted.length && sorted.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  {columns.map((col) => (
                    <th
                      key={String(col.key)}
                      className={`px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wider ${col.width ?? ''}`}
                    >
                      <button
                        onClick={() => col.sortable && toggleSort(String(col.key))}
                        className={`flex items-center gap-1 ${col.sortable ? 'hover:text-body cursor-pointer' : 'cursor-default'}`}
                      >
                        {col.label} <SortIcon col={col} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-base">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} cols={columns.length} />
                  ))
                ) : sorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      className="text-center py-12 text-muted text-sm"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  sorted.map((row) => {
                    const id = String(row[rowKey])
                    return (
                      <tr
                        key={id}
                        className={`hover:bg-page transition-colors ${selected.includes(id) ? 'bg-brand-teal/5' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select row ${id}`}
                            className="accent-brand-teal"
                            checked={selected.includes(id)}
                            onChange={() => toggleRow(id)}
                          />
                        </td>
                        {columns.map((col) => (
                          <td key={String(col.key)} className="px-4 py-3 text-body">
                            {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CARD VIEW */}
      {view === 'card' && !isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((row) => {
            const id = String(row[rowKey])
            return (
              <div
                key={id}
                className="bg-surface border border-base rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                {columns.map((col) => (
                  <div
                    key={String(col.key)}
                    className="flex items-start justify-between mb-2 last:mb-0"
                  >
                    <span className="text-xs text-muted">{col.label}</span>
                    <span className="text-xs text-body font-medium text-right">
                      {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '—')}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {/* FIX (lines 338, 348): prev/next pagination buttons are icon-only;
          added aria-label on each */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => pagination.onPageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            aria-label="Previous page"
            className="p-2 rounded-lg border border-base hover:bg-page disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            onClick={() => pagination.onPageChange(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages}
            aria-label="Next page"
            className="p-2 rounded-lg border border-base hover:bg-page disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
