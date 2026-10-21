'use client'

/**
 * ReportExport — page-level export registry + toolbar.
 *
 * Panels register what they are showing (their tables, KPIs and findings) via
 * useExportable / useReportSummary; the toolbar in the page header then
 * exports exactly the visible report as CSV (one table), an Excel workbook
 * (every table, one sheet each) or a PDF report pack that opens in a browser
 * tab for review before printing. Registration is keyed by label so panels
 * never evict one another, and the toolbar only renders for roles holding
 * `report.export` (GET /analytics/capabilities — the permission matrix itself).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import type { ReportInsight, ReportKpi } from '@shared/types/reporting'
import { downloadCsv, csvFilename } from '@/lib/csv'
import type { CsvColumn } from '@/lib/csv'
import {
  downloadXlsx,
  openReportPdfPreview,
  type ExportTable,
  type PackInsight,
  type PackKpi,
} from '@/lib/reportExport'
import { filterLinesFromParams } from '@/lib/exportFilters'
import { formatKpiValue } from '@/lib/reportFormat'
import { useReportCapabilities } from '@/hooks/useAnalytics'
import { useSchoolIdentity } from '@/hooks/useSettings'

interface TableRegistration {
  label: string
  hasRows: boolean
  /** Set when the table is not the whole result; shown in the menu, the workbook and the PDF. */
  note?: string
  table: () => ExportTable
}

interface SummaryRegistration {
  label: string
  kpis: ReportKpi[]
  insights: ReportInsight[]
}

interface ExportActions {
  tables: Map<string, TableRegistration>
  summaries: Map<string, SummaryRegistration>
  registerTable: (r: TableRegistration) => void
  unregisterTable: (label: string) => void
  registerSummary: (r: SummaryRegistration) => void
  unregisterSummary: (label: string) => void
}

const noop = () => undefined

/**
 * Two contexts on purpose: `actions` is referentially stable for the life of
 * the provider (so panels' registration effects never re-run because a sibling
 * registered), while `version` changes whenever a registration appears or
 * disappears and only the toolbar subscribes to it.
 */
const ExportActionsContext = createContext<ExportActions>({
  tables: new Map(),
  summaries: new Map(),
  registerTable: noop,
  unregisterTable: noop,
  registerSummary: noop,
  unregisterSummary: noop,
})
const ExportVersionContext = createContext(0)

export function ReportExportProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)

  const actions = useMemo<ExportActions>(() => {
    const tables = new Map<string, TableRegistration>()
    const summaries = new Map<string, SummaryRegistration>()
    const bump = () => setVersion((v) => v + 1)
    return {
      tables,
      summaries,
      registerTable: (r) => {
        const prev = tables.get(r.label)
        tables.set(r.label, r)
        if (!prev || prev.hasRows !== r.hasRows) bump()
      },
      unregisterTable: (label) => {
        if (tables.delete(label)) bump()
      },
      // Summaries are read at export time only, so they never trigger renders.
      registerSummary: (r) => {
        summaries.set(r.label, r)
      },
      unregisterSummary: (label) => {
        summaries.delete(label)
      },
    }
  }, [])

  return (
    <ExportActionsContext.Provider value={actions}>
      <ExportVersionContext.Provider value={version}>{children}</ExportVersionContext.Provider>
    </ExportActionsContext.Provider>
  )
}

/**
 * Registers the calling panel's table as an export target. `columns` are held
 * in a ref (panels declare them inline, so identity changes every render);
 * `rows` from TanStack Query is reference-stable and is a real dependency.
 */
export function useExportable<T>(
  label: string | null,
  rows: readonly T[] | undefined,
  columns: readonly CsvColumn<T>[],
  note?: string,
): void {
  const { registerTable, unregisterTable } = useContext(ExportActionsContext)
  const rowsRef = useRef(rows)
  const columnsRef = useRef(columns)
  useEffect(() => {
    rowsRef.current = rows
    columnsRef.current = columns
  })
  const hasRows = (rows?.length ?? 0) > 0
  useEffect(() => {
    if (!label) return undefined
    registerTable({
      label,
      hasRows,
      ...(note ? { note } : {}),
      table: () => ({
        name: label,
        columns: columnsRef.current as unknown as ExportTable['columns'],
        rows: rowsRef.current ?? [],
        ...(note ? { note } : {}),
      }),
    })
    return () => unregisterTable(label)
  }, [registerTable, unregisterTable, label, hasRows, rows, note])
}

/** Registers KPIs + findings so the PDF report pack can include them. */
export function useReportSummary(
  label: string,
  kpis: readonly ReportKpi[] | undefined,
  insights?: readonly ReportInsight[] | undefined,
): void {
  const { registerSummary, unregisterSummary } = useContext(ExportActionsContext)
  useEffect(() => {
    if (!kpis && !insights) return undefined
    registerSummary({ label, kpis: [...(kpis ?? [])], insights: [...(insights ?? [])] })
    return () => unregisterSummary(label)
  }, [registerSummary, unregisterSummary, label, kpis, insights])
}

const BTN =
  'flex items-center gap-1.5 rounded-xl border border-base bg-surface px-3 py-2 text-sm font-medium text-brand-navy transition-colors hover:bg-base focus:outline-none focus:ring-2 focus:ring-brand-navy/20 disabled:cursor-not-allowed disabled:opacity-40'

export function ExportToolbar({
  title,
  filters,
}: {
  /** Report title used for the PDF and file names. */
  title: string
  /** Human-readable filter lines shown on the PDF, e.g. "Term: 2". Filters in the address bar are added automatically. */
  filters: string[]
}) {
  const searchParams = useSearchParams()
  const { tables, summaries } = useContext(ExportActionsContext)
  useContext(ExportVersionContext) // re-render when registrations change
  const { data: capabilities } = useReportCapabilities()
  const { data: identity } = useSchoolIdentity()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!capabilities?.canExport) return null

  const list = Array.from(tables.values())
  const exportable = list.filter((t) => t.hasRows)
  const anything = exportable.length > 0 || summaries.size > 0

  const run = async (action: () => Promise<boolean | void>) => {
    setBusy(true)
    setMessage(null)
    setOpen(false)
    try {
      const ok = await action()
      if (ok === false) setMessage('Nothing to export on this tab.')
    } catch {
      setMessage('The export could not be generated. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const packTables = (): ExportTable[] => exportable.map((t) => t.table())
  // What the file says about itself: the period plus every filter in the URL, so a
  // printout or workbook can be traced back to the screen that produced it.
  const allFilters = [...filters, ...filterLinesFromParams(searchParams.entries())]

  const openPdf = () =>
    run(async () => {
      const kpis: PackKpi[] = []
      const insights: PackInsight[] = []
      summaries.forEach((s) => {
        s.kpis.forEach((k) =>
          kpis.push({ label: k.label, value: formatKpiValue(k.value, k.unit), sub: k.subLabel }),
        )
        s.insights.forEach((i) => insights.push({ severity: i.severity, title: i.title, detail: i.detail }))
      })
      await openReportPdfPreview({
        title,
        schoolName: identity?.schoolName ?? 'School Management System',
        filters: allFilters,
        generatedAt: new Date(),
        kpis,
        insights,
        tables: packTables(),
      })
    })

  return (
    <div ref={wrapRef} className="relative flex flex-col items-end gap-1">
      <button
        type="button"
        className={BTN}
        onClick={() => setOpen((o) => !o)}
        disabled={!anything || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title={anything ? 'Export this report' : 'This tab has nothing to export yet'}
      >
        <Download className="h-4 w-4" aria-hidden />
        {busy ? 'Preparing…' : 'Export'}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-60 rounded-xl border border-base bg-surface py-1 shadow-lg"
        >
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-navy hover:bg-page" onClick={openPdf}>
            <Printer className="h-4 w-4 text-muted" aria-hidden /> PDF report (preview in new tab)
          </button>
          <button
            role="menuitem"
            type="button"
            disabled={exportable.length === 0}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-navy hover:bg-page disabled:opacity-40"
            onClick={() =>
              run(() =>
                downloadXlsx(title, packTables(), {
                  title,
                  schoolName: identity?.schoolName ?? 'School Management System',
                  filters: allFilters,
                  generatedAt: new Date(),
                }),
              )
            }
          >
            <FileSpreadsheet className="h-4 w-4 text-muted" aria-hidden /> Excel workbook ({exportable.length}{' '}
            {exportable.length === 1 ? 'sheet' : 'sheets'})
          </button>
          {exportable.length > 0 && <div className="my-1 border-t border-base" role="separator" />}
          {exportable.map((t) => (
            <button
              key={t.label}
              role="menuitem"
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-navy hover:bg-page"
              onClick={() =>
                run(async () => {
                  const tbl = t.table()
                  const done = downloadCsv(
                    csvFilename(tbl.name),
                    tbl.rows,
                    tbl.columns as unknown as CsvColumn<unknown>[],
                  )
                  // Say so when the file is not the whole result, instead of letting it pass as complete.
                  if (done && tbl.note) setMessage(`${tbl.name}: ${tbl.note}.`)
                  return done
                })
              }
            >
              <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <span>
                CSV — {t.label}
                {t.note ? <span className="block text-xs text-muted">{t.note}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}
      {message && (
        <p role="alert" className="text-xs text-brand-coral">
          {message}
        </p>
      )}
    </div>
  )
}
