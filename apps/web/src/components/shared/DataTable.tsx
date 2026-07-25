'use client'

/**
 * apps/web/src/components/shared/DataTable.tsx — Phase C3
 *
 * Mobile-first DataTable with four responsive rendering layers:
 *
 *   < md  (mobile)  : MobileCardList — auto-rendered regardless of `view` toggle.
 *                     Stacked compact cards. Critical column as title. Optional
 *                     mobileActions bottom sheet per row.
 *   md+  (tablet+)  : Standard Table view or Card Grid view, controlled by the
 *                     `view` toggle. Toggle only visible on md+.
 *
 * Column priority system (DataColumn.priority):
 *   'critical'   — shown on ALL screens (always a visible column).
 *   'important'  — shown on md+ only  (default when priority is undefined).
 *   'optional'   — shown on lg+ only.
 *   Implemented with CSS (`hidden md:table-cell`, `hidden lg:table-cell`) —
 *   zero JS/hook overhead, SSR-safe.
 *
 * Mobile actions:
 *   Pass `mobileActions` prop with an array of labelled actions.
 *   Tapping the ⋯ button on a mobile card opens an AnimatePresence bottom
 *   sheet (SHEET_UP_VARIANTS). Tapping an action calls the handler with the row.
 *
 * Row entrance animations (Phase B8 unapplied target — completed here):
 *   • Table view: motion.tbody stagger → motion.tr entrance per row.
 *   • Card view (desktop): motion.div stagger container → card items.
 *   • Mobile card list: staggered motion.li items.
 *   Stagger is capped: only applies when ≤ 15 rows to prevent slow animations
 *   on large datasets.
 *   All animations respect motionEnabled from motionStore.
 *
 * API changes from the previous DataTable:
 *   DataColumn:    + priority?: 'critical' | 'important' | 'optional'
 *   DataTableProps: + mobileActions?: MobileAction<T>[]
 *
 * All existing DataTableProps are preserved and backward-compatible.
 *
 * [CHANGE TYPE]: MAJOR REWRITE (sorting + filter-chip subsystems only —
 *   row rendering, column configuration, and pagination-prop plumbing are
 *   unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]:
 *   (1) Added `onSort` to DataTableProps. When supplied, a sortable header
 *       click dispatches (column, direction) to the caller instead of the
 *       local client-side useMemo sort — server-paginated datasets
 *       (Students, and any future paginated list) re-query the server for
 *       a whole-dataset sort rather than sorting only the currently
 *       visible page. When omitted, the existing client-side sort is
 *       unchanged for full-dataset (non-paginated) tables.
 *   (2) Removed the dead `activeChips` local state and its render block —
 *       it was local state with no setter any consumer could reach; the
 *       prop-controlled activeFilters/onFilterRemove FilterChipsBar is the
 *       single filter-chip surface.
 *   (3) TBODY_STAGGER / TR_VARIANTS moved to W/lib/motion.ts as named
 *       exports, consistent with every other shared motion constant.
 *   (4) Sorting-subsystem a11y (CROSS_a11y recurring patterns, applied to
 *       the subsystem this rewrite touches): <th scope="col"> on every
 *       header cell, aria-hidden on the decorative sort chevrons, and a
 *       dynamic aria-sort on the actively-sorted column.
 * [DEPENDS ON]: W/lib/motion.ts (TBODY_STAGGER / TR_VARIANTS, same phase)
 */

import { useState, useMemo, useRef, useEffect }  from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  LayoutGrid,
  List,
  MoreHorizontal,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useMotionEnabled } from '@/store/motionStore'
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ITEM_VARIANTS,
  SHEET_UP_VARIANTS,
  OVERLAY_VARIANTS,
  TBODY_STAGGER,
  TR_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  DURATION,
  EASE,
} from '@/lib/motion'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface DataColumn<T> {
  key: keyof T | string
  label: string
  sortable?: boolean
  width?: string
  /**
   * Controls column visibility across breakpoints:
   *   'critical'  — visible on all screen sizes (mobile, tablet, desktop)
   *   'important' — visible on md+ (tablet/desktop only); default
   *   'optional'  — visible on lg+ (desktop only)
   */
  priority?: 'critical' | 'important' | 'optional'
  render?: (row: T) => React.ReactNode
}

export interface MobileAction<T> {
  label: string
  icon: React.ElementType
  /** 'danger' renders the label and icon in brand-coral / red tones */
  variant?: 'default' | 'danger'
  onClick: (row: T) => void
}

export interface ActiveFilter {
  key:   string
  label: string
  value: string
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

export interface DataTableProps<T> {
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
  /** Active filter chips displayed as removable tags above the table */
  activeFilters?: ActiveFilter[]
  /** Called when user removes a filter chip */
  onFilterRemove?: (key: string) => void
  /** Called when all filters are cleared */
  onFilterClearAll?: () => void
  /** Column visibility map — key: column key, value: visible */
  columnVisibility?: Record<string, boolean>
  /** Called when user toggles a column's visibility */
  onColumnVisibilityChange?: (key: string, visible: boolean) => void
  pagination?: Pagination
  emptyMessage?: string
  /** Per-row actions rendered in the mobile bottom-sheet on card tap */
  mobileActions?: MobileAction<T>[]
  /**
   * Server-side sort dispatch. When supplied, clicking a sortable header
   * calls this with (column, direction) instead of sorting the local page
   * client-side — the caller passes it through to its list query's own
   * sort parameter so the server re-orders the whole dataset, not just the
   * currently visible page. When omitted, the built-in client-side sort
   * applies (correct for full, non-paginated datasets).
   */
  onSort?: (column: string, direction: 'asc' | 'desc') => void
  /**
   * When supplied, the entire row (desktop table), desktop card, and mobile
   * card become clickable/keyboard-activatable and call this with the row.
   * Used to navigate to a detail view. Interactive controls inside the row
   * (checkbox, sort headers, the mobile ⋯ actions button) stop propagation
   * so they never trigger this. When omitted, rows are not clickable and
   * behaviour is unchanged.
   */
  onRowClick?: (row: T) => void
}

type SortDir = 'asc' | 'desc' | null

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN PRIORITY → CSS CLASS MAP
// ─────────────────────────────────────────────────────────────────────────────

function colVisibilityClass(priority: DataColumn<unknown>['priority']): string {
  switch (priority) {
    case 'critical':   return ''                       // always visible
    case 'optional':   return 'hidden lg:table-cell'   // desktop only
    case 'important':
    default:           return 'hidden md:table-cell'   // tablet+ (default)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON ROW
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="h-4 w-4 rounded bg-page animate-pulse" />
      </td>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className={[
              'h-4 rounded bg-page animate-pulse',
              i % 3 === 0 ? 'w-3/5' : i % 3 === 1 ? 'w-4/5' : 'w-2/3',
            ].join(' ')}
          />
        </td>
      ))}
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER CHIPS BAR
// ─────────────────────────────────────────────────────────────────────────────

function FilterChipsBar({
  filters,
  onRemove,
  onClearAll,
}: {
  filters:    ActiveFilter[]
  onRemove:   (key: string) => void
  onClearAll: () => void
}) {
  if (filters.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1.5 bg-brand-navy/8 text-brand-navy text-xs font-medium px-2.5 py-1 rounded-full border border-brand-navy/20"
        >
          <span className="text-muted">{f.label}:</span>
          {f.value}
          <button
            onClick={() => onRemove(f.key)}
            aria-label={`Remove ${f.label} filter`}
            className="ml-0.5 text-muted hover:text-brand-navy transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-brand-coral hover:text-brand-coral/80 font-medium transition-colors"
      >
        Clear all
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN VISIBILITY MENU
// ─────────────────────────────────────────────────────────────────────────────

function ColumnVisibilityMenu<T>({
  columns,
  visibility,
  onChange,
}: {
  columns:    DataColumn<T>[]
  visibility: Record<string, boolean>
  onChange:   (key: string, visible: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <div ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted hover:text-brand-navy border border-base rounded-xl transition-colors"
        aria-label="Toggle column visibility"
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="hidden lg:inline text-xs">Columns</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            key="col-menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 bg-surface border border-base rounded-2xl shadow-lg py-2 z-30 min-w-[160px]"
          >
            {columns.map((col) => {
              const key     = String(col.key)
              const visible = visibility[key] !== false
              return (
                <label key={key} className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-page text-sm">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => onChange(key, e.target.checked)}
                    className="w-3.5 h-3.5 accent-brand-navy"
                  />
                  <span className={visible ? 'text-brand-navy' : 'text-muted'}>{col.label}</span>
                </label>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE ACTIONS SHEET
// Bottom sheet triggered by the ⋯ button on a mobile card row.
// ─────────────────────────────────────────────────────────────────────────────

interface MobileActionsSheetProps<T> {
  row: T | null
  actions: MobileAction<T>[]
  onClose: () => void
  motionEnabled: boolean
}

function MobileActionsSheet<T>({
  row,
  actions,
  onClose,
  motionEnabled,
}: MobileActionsSheetProps<T>) {
  const sheetVariants   = reducedMotionVariants(motionEnabled, SHEET_UP_VARIANTS)
  const sheetTransition = reducedMotionTransition(motionEnabled, {
    type: 'spring',
    stiffness: 340,
    damping: 40,
    mass: 0.85,
  })
  const backdropVariants = reducedMotionVariants(motionEnabled, OVERLAY_VARIANTS)
  const backdropTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.fast,
  })

  if (!row) return null

  return (
    <AnimatePresence>
      {row && (
        <>
          <motion.div
            key="mobile-actions-backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={backdropTransition}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] md:hidden"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            key="mobile-actions-sheet"
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={sheetTransition}
            className="
              fixed inset-x-0 bottom-0 z-50
              bg-surface rounded-t-2xl shadow-2xl
              md:hidden overflow-hidden
            "
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            role="dialog"
            aria-label="Row actions"
            aria-modal="true"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1" aria-hidden>
              <span className="w-10 h-1 rounded-full bg-muted/25" />
            </div>

            <div className="pb-2">
              {actions.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      action.onClick(row)
                      onClose()
                    }}
                    className={[
                      'flex items-center gap-3.5 w-full px-5 py-3.5 transition-colors',
                      action.variant === 'danger'
                        ? 'text-brand-coral hover:bg-brand-coral/5'
                        : 'text-muted hover:bg-page hover:text-body',
                    ].join(' ')}
                  >
                    <Icon className="w-5 h-5 shrink-0" aria-hidden />
                    <span className="text-sm font-medium">{action.label}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE CARD LIST (auto below md)
// Shows all rows as stacked compact cards regardless of the `view` toggle.
// ─────────────────────────────────────────────────────────────────────────────

interface MobileCardListProps<T> {
  rows: T[]
  columns: DataColumn<T>[]
  rowKey: keyof T
  isLoading: boolean
  emptyMessage: string
  mobileActions?: MobileAction<T>[]
  motionEnabled: boolean
  onRowClick?: (row: T) => void
}

function MobileCardList<T extends object>({
  rows,
  columns,
  rowKey,
  isLoading,
  emptyMessage,
  mobileActions,
  motionEnabled,
  onRowClick,
}: MobileCardListProps<T>) {
  const [activeRow, setActiveRow] = useState<T | null>(null)

  const criticalCol  = columns.find((c) => c.priority === 'critical') ?? columns[0]
  const restCols     = columns.filter((c) => c !== criticalCol)

  const containerVariants = reducedMotionVariants(
    motionEnabled,
    rows.length <= 15 ? LIST_CONTAINER_VARIANTS : {},
  )
  const itemVariants = reducedMotionVariants(motionEnabled, LIST_ITEM_VARIANTS)
  const itemTransition = reducedMotionTransition(motionEnabled, {
    duration: DURATION.normal,
    ease: EASE.out,
  })

  if (isLoading) {
    return (
      <div className="space-y-2 md:hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-page animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="md:hidden text-center py-12 text-muted text-sm">
        {emptyMessage}
      </div>
    )
  }

  return (
    <>
      <motion.ul
        key={`mobile-list-${rows.length}`}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-2 md:hidden"
        role="list"
      >
        {rows.map((row) => {
          const id         = String(row[rowKey])
          const titleValue = criticalCol
            ? criticalCol.render
              ? criticalCol.render(row)
              : String(row[criticalCol.key as keyof T] ?? '—')
            : id

          return (
            <motion.li
              key={id}
              variants={itemVariants}
              transition={itemTransition}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
              role={onRowClick ? 'button' : 'listitem'}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick ? `View details for ${id}` : undefined}
              className={[
                'bg-surface border border-base rounded-xl px-4 py-3',
                'flex items-start justify-between gap-3',
                'hover:shadow-sm transition-shadow',
                onRowClick
                  ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
                  : '',
              ].join(' ')}
            >
              {/* Left: title + key-value pairs */}
              <div className="min-w-0 flex-1">
                {/* Critical column — title */}
                <div className="text-sm font-heading font-semibold text-body truncate mb-1.5">
                  {titleValue}
                </div>

                {/* Remaining columns — key: value pairs */}
                <div className="space-y-0.5">
                  {restCols.slice(0, 3).map((col) => (
                    <div
                      key={String(col.key)}
                      className="flex items-center gap-1.5"
                    >
                      <span className="text-[11px] text-muted shrink-0 w-20 truncate">
                        {col.label}
                      </span>
                      <span className="text-[11px] text-body truncate">
                        {col.render
                          ? col.render(row)
                          : String(row[col.key as keyof T] ?? '—')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: ⋯ button — only when mobileActions is provided */}
              {mobileActions && mobileActions.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveRow(row)
                  }}
                  className="
                    shrink-0 p-1.5 rounded-lg
                    text-muted hover:text-body hover:bg-page
                    transition-colors mt-0.5
                  "
                  aria-label={`Actions for row ${id}`}
                >
                  <MoreHorizontal className="w-4 h-4" aria-hidden />
                </button>
              )}
            </motion.li>
          )
        })}
      </motion.ul>

      {/* Actions bottom sheet */}
      {mobileActions && (
        <MobileActionsSheet
          row={activeRow}
          actions={mobileActions}
          onClose={() => setActiveRow(null)}
          motionEnabled={motionEnabled}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SORT ICON
// ─────────────────────────────────────────────────────────────────────────────

function SortIcon<T>({
  col,
  sortKey,
  sortDir,
}: {
  col: DataColumn<T>
  sortKey: string | null
  sortDir: SortDir
}) {
  if (!col.sortable) return null
  if (sortKey === col.key && sortDir === 'asc')
    return <ChevronUp className="w-3 h-3 shrink-0" aria-hidden />
  if (sortKey === col.key && sortDir === 'desc')
    return <ChevronDown className="w-3 h-3 shrink-0" aria-hidden />
  return <ChevronsUpDown className="w-3 h-3 shrink-0 text-muted" aria-hidden />
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA TABLE
// ─────────────────────────────────────────────────────────────────────────────

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
  mobileActions,
  activeFilters,
  onFilterRemove,
  onFilterClearAll,
  columnVisibility,
  onColumnVisibilityChange,
  onSort,
  onRowClick,
}: DataTableProps<T>) {
  const motionEnabled = useMotionEnabled()

  const [sortKey,    setSortKey]    = useState<string | null>(null)
  const [sortDir,    setSortDir]    = useState<SortDir>(null)
  const [selected,   setSelected]   = useState<string[]>([])
  const [view,       setView]       = useState<'table' | 'card'>('table')
  const [filterOpen, setFilterOpen] = useState(false)

  // ── Sorted data ────────────────────────────────────────────────────────────
  // When `onSort` is supplied the server owns ordering — the rows arrive
  // already sorted, so the local sort is a pass-through and sortKey/sortDir
  // exist only to drive the header indicator icons.
  const sorted = useMemo(() => {
    if (onSort) return data
    if (!sortKey || !sortDir) return data
    return [...data].sort((a, b) => {
      const av = String((a as Record<string, unknown>)[sortKey] ?? '')
      const bv = String((b as Record<string, unknown>)[sortKey] ?? '')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })
  }, [data, sortKey, sortDir, onSort])

  // ── Handlers ───────────────────────────────────────────────────────────────
  function toggleSort(key: string) {
    // Next direction follows the same asc → desc → cleared cycle in both
    // modes; in server mode a cleared sort re-dispatches ascending on the
    // next click and the caller decides what "no sort" means for its query.
    let nextDir: SortDir
    if (sortKey !== key)            nextDir = 'asc'
    else if (sortDir === 'asc')     nextDir = 'desc'
    else                            nextDir = null

    setSortKey(nextDir === null ? null : key)
    setSortDir(nextDir)

    if (onSort && nextDir !== null) onSort(key, nextDir)
  }

  function toggleRow(id: string) {
    setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id])
  }

  function toggleAll() {
    const ids = sorted.map((r) => String(r[rowKey]))
    setSelected((p) => p.length === ids.length ? [] : ids)
  }

  // ── Animation configs ──────────────────────────────────────────────────────
  const filterPanelVariants = reducedMotionVariants(motionEnabled, {
    hidden:  { x: '100%', opacity: 0 },
    visible: { x: 0, opacity: 1 },
    exit:    { x: '100%', opacity: 0 },
  })
  const filterTransition = reducedMotionTransition(motionEnabled, {
    type: 'spring',
    stiffness: 400,
    damping: 35,
  })

  const tbodyVariants = reducedMotionVariants(
    motionEnabled,
    TBODY_STAGGER(sorted.length),
  )
  const trVariants = reducedMotionVariants(motionEnabled, TR_VARIANTS)

  const cardContainerVariants = reducedMotionVariants(
    motionEnabled,
    sorted.length <= 15 ? LIST_CONTAINER_VARIANTS : {},
  )
  const cardItemVariants = reducedMotionVariants(motionEnabled, {
    hidden:  { opacity: 0, y: 8, scale: 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: DURATION.normal, ease: EASE.out },
    },
  })

  return (
    <div className="relative">

      {/* ── TOOLBAR ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">

        {/* Quick filter chips */}
        {quickFilters && quickFilters.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {quickFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => onQuickFilter?.(f.value)}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                  activeQuickFilter === f.value
                    ? 'bg-brand-navy text-white border-brand-navy'
                    : 'bg-surface border-base text-muted hover:border-brand-navy/40 hover:text-body',
                ].join(' ')}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Right controls — hidden on mobile (mobile uses card list always) */}
        <div className="flex items-center gap-2 hidden md:flex">
          {/* Bulk archive button */}
          {selected.length > 0 && onBulkArchive && (
            <button
              type="button"
              onClick={() => { onBulkArchive(selected); setSelected([]) }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-coral/15 text-brand-coral border border-brand-coral/20 hover:bg-brand-coral/25 transition-colors"
            >
              Archive {selected.length}
            </button>
          )}

          {/* Filter panel toggle */}
          {filterPanel && (
            <button
              type="button"
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-base rounded-lg text-xs font-medium hover:bg-page transition-colors"
              aria-expanded={filterOpen}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
              Filters
            </button>
          )}

          {/* Column visibility toggle — desktop only */}
          {onColumnVisibilityChange && columns.length > 0 && (
            <div className="relative hidden md:block">
              <ColumnVisibilityMenu
                columns={columns}
                visibility={columnVisibility ?? {}}
                onChange={onColumnVisibilityChange}
              />
            </div>
          )}

          {/* View toggle */}
          <div className="flex border border-base rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setView('table')}
              aria-label="Table view"
              aria-pressed={view === 'table'}
              className={`p-1.5 transition-colors ${view === 'table' ? 'bg-brand-navy text-white' : 'hover:bg-page text-muted'}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView('card')}
              aria-label="Card view"
              aria-pressed={view === 'card'}
              className={`p-1.5 transition-colors ${view === 'card' ? 'bg-brand-navy text-white' : 'hover:bg-page text-muted'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── FILTER PANEL (right slide, md+ only) ────────────────────────────── */}
      <AnimatePresence>
        {filterOpen && filterPanel && (
          <motion.div
            key="filter-panel"
            variants={filterPanelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={filterTransition}
            className="fixed inset-y-0 right-0 z-40 w-72 bg-surface border-l border-base shadow-xl p-6 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-heading font-bold text-brand-navy">Filters</h3>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                aria-label="Close filters"
                className="p-1 hover:bg-page rounded transition-colors"
              >
                <X className="w-4 h-4 text-muted" />
              </button>
            </div>
            {filterPanel}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ACTIVE FILTER CHIPS (prop-controlled) ──────────────────────────── */}
      {activeFilters && activeFilters.length > 0 && onFilterRemove && (
        <FilterChipsBar
          filters={activeFilters}
          onRemove={onFilterRemove}
          onClearAll={onFilterClearAll ?? (() => activeFilters.forEach((f) => onFilterRemove(f.key)))}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MOBILE CARD LIST (below md — always rendered, view toggle hidden)
          ════════════════════════════════════════════════════════════════════════ */}
      <MobileCardList
        rows={sorted}
        columns={columns}
        rowKey={rowKey}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        mobileActions={mobileActions}
        motionEnabled={motionEnabled}
        onRowClick={onRowClick}
      />

      {/* ════════════════════════════════════════════════════════════════════════
          TABLET + DESKTOP VIEWS (md+)
          ════════════════════════════════════════════════════════════════════════ */}

      {/* ── TABLE VIEW (md+, default) ─────────────────────────────────────── */}
      {view === 'table' && (
        <div className="hidden md:block border border-base rounded-xl overflow-hidden bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-base bg-page">
                  <th scope="col" className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      className="accent-brand-teal"
                      checked={selected.length === sorted.length && sorted.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  {columns.filter((col) => (columnVisibility ? columnVisibility[String(col.key)] !== false : true)).map((col) => (
                    <th
                      key={String(col.key)}
                      scope="col"
                      aria-sort={
                        sortKey === String(col.key) && sortDir
                          ? sortDir === 'asc' ? 'ascending' : 'descending'
                          : undefined
                      }
                      className={[
                        'px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wider',
                        col.width ?? '',
                        colVisibilityClass(col.priority),
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        onClick={() => col.sortable && toggleSort(String(col.key))}
                        className={`flex items-center gap-1 ${col.sortable ? 'hover:text-body cursor-pointer' : 'cursor-default'}`}
                      >
                        {col.label}
                        <SortIcon
                          col={col}
                          sortKey={sortKey}
                          sortDir={sortDir}
                        />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Staggered tbody */}
              <motion.tbody
                key={`tbody-${sorted.length}`}
                variants={tbodyVariants}
                initial="hidden"
                animate="visible"
                className="divide-y divide-base"
              >
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
                      <motion.tr
                        key={id}
                        variants={trVariants}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        onKeyDown={
                          onRowClick
                            ? (e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  onRowClick(row)
                                }
                              }
                            : undefined
                        }
                        tabIndex={onRowClick ? 0 : undefined}
                        aria-label={onRowClick ? `View details for ${id}` : undefined}
                        className={[
                          'hover:bg-page transition-colors',
                          selected.includes(id) ? 'bg-brand-teal/5' : '',
                          onRowClick
                            ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal'
                            : '',
                        ].join(' ')}
                      >
                        <td
                          className="px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select row ${id}`}
                            className="accent-brand-teal"
                            checked={selected.includes(id)}
                            onChange={() => toggleRow(id)}
                          />
                        </td>
                        {columns.filter((col) => (columnVisibility ? columnVisibility[String(col.key)] !== false : true)).map((col) => (
                          <td
                            key={String(col.key)}
                            className={[
                              'px-4 py-3 text-body',
                              colVisibilityClass(col.priority),
                            ].join(' ')}
                          >
                            {col.render
                              ? col.render(row)
                              : String(row[col.key as keyof T] ?? '—')}
                          </td>
                        ))}
                      </motion.tr>
                    )
                  })
                )}
              </motion.tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CARD GRID VIEW (md+, when toggled) ────────────────────────────── */}
      {view === 'card' && !isLoading && (
        <motion.div
          key={`card-grid-${sorted.length}`}
          variants={cardContainerVariants}
          initial="hidden"
          animate="visible"
          className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {sorted.length === 0 ? (
            <p className="col-span-full text-center py-12 text-muted text-sm">
              {emptyMessage}
            </p>
          ) : (
            sorted.map((row) => {
              const id = String(row[rowKey])
              return (
                <motion.div
                  key={id}
                  variants={cardItemVariants}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onRowClick(row)
                          }
                        }
                      : undefined
                  }
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick ? `View details for ${id}` : undefined}
                  className={[
                    'bg-surface border border-base rounded-xl p-4 hover:shadow-md transition-shadow',
                    onRowClick
                      ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal'
                      : '',
                  ].join(' ')}
                >
                  {columns.filter((col) => (columnVisibility ? columnVisibility[String(col.key)] !== false : true)).map((col) => (
                    <div
                      key={String(col.key)}
                      className="flex items-start justify-between mb-2 last:mb-0 gap-3"
                    >
                      <span className="text-xs text-muted shrink-0">{col.label}</span>
                      <span className="text-xs text-body font-medium text-right truncate">
                        {col.render
                          ? col.render(row)
                          : String(row[col.key as keyof T] ?? '—')}
                      </span>
                    </div>
                  ))}
                </motion.div>
              )
            })
          )}
        </motion.div>
      )}

      {/* ── PAGINATION ────────────────────────────────────────────────────── */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => pagination.onPageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            aria-label="Previous page"
            className="p-2 rounded-lg border border-base hover:bg-page disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted font-sans">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            type="button"
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