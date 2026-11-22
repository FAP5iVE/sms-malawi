'use client'

/**
 * Operations report tabs: the asset register, stocktakes, procurement value and
 * inventory stock levels. Every figure is read from the lifecycle states the
 * system already stores; each table row links to the screen where that record
 * can be investigated. Filters live in the URL so a view can be shared, survives
 * refresh, and Back works.
 *
 * Money measures are kept apart on purpose: requested, approved, ordered,
 * received, expensed and paid are different questions, and open commitments are
 * the same figure Finance reports — so nothing here can double count.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import {
  useAssetRegisterReport, useProcurementPipeline, useProcurementValue, useStockReport, useStocktakeReport, useStocktakeVariance,
} from '@/hooks/reporting/useOperationsReporting'
import { useBuildings, useDepartments, useRooms } from '@/hooks/useLocations'
import type {
  ApiAssetCountRow, ApiAssetCustodianRow, ApiAssetLocationRow, ApiAssetRecord, ApiLowStockRow, ApiPurchaseOrderRow,
  ApiRequisitionValueRow, ApiStockMovementRow, ApiStocktakeRow, ApiVarianceItemRow, AssetFlag,
} from '@shared/types/reporting-operations'
import { formatCount, formatDate, formatMwk, formatMwkCompact } from '@/lib/reportFormat'
import { FilterBar, FilterDate, FilterSelect, TERM_OPTIONS } from '../ui/ReportFilters'
import { useReportParam } from '../ui/useReportParams'
import { ReportCard } from '../ui/ReportCard'
import { ReportTable } from '../ui/ReportTable'
import { QueryState } from '../ui/ReportStates'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { kpiTile } from './kpiHelpers'
import { PanelStack, TwoUp } from './common'

const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** Build a link to an existing screen; empty values are left out. */
function link(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

/** Options for department / building / room selects, from the existing location lists. */
function useLocationOptions(buildingId?: string) {
  const departments = useDepartments()
  const buildings = useBuildings()
  const rooms = useRooms(buildingId ? { buildingId } : {})
  return {
    departments: (departments.data ?? []).map((d) => ({ value: d.id, label: d.name })),
    buildings: (buildings.data ?? []).map((b) => ({ value: b.id, label: b.name })),
    rooms: (rooms.data ?? []).map((r) => ({ value: r.id, label: `${r.building?.name ?? ''} · ${r.name}`.replace(/^ · /, '') })),
  }
}

const dateOrUndefined = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

// ─── Assets ───────────────────────────────────────────────────────────────────

const ASSET_CATEGORIES = ['FURNITURE', 'IT_EQUIPMENT', 'LAB_EQUIPMENT', 'SPORTS_EQUIPMENT', 'KITCHEN_EQUIPMENT', 'VEHICLE', 'MAINTENANCE_TOOL', 'OTHER']
const ASSET_STATUS_KEYS = ['IN_STORE', 'ALLOCATED', 'UNDER_REPAIR', 'LOST', 'DISPOSED']
const ASSET_CONDITION_KEYS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']
const opts = (keys: readonly string[]) => keys.map((k) => ({ value: k, label: humanize(k) }))

const FLAG_LABEL: Record<AssetFlag, string> = {
  damaged: 'Damaged',
  under_repair: 'Under repair',
  lost: 'Lost',
  warranty_expiring: 'Warranty ending',
  no_location: 'No location',
  no_custodian: 'No custodian',
  no_cost: 'No cost recorded',
}

export function AssetsTab() {
  const [category, setCategory] = useReportParam('category')
  const [status, setStatus] = useReportParam('status')
  const [condition, setCondition] = useReportParam('condition')
  const [departmentId, setDepartmentId] = useReportParam('departmentId')
  const [buildingId, setBuildingId] = useReportParam('buildingId')
  const [roomId, setRoomId] = useReportParam('roomId')
  const [custodianUid, setCustodianUid] = useReportParam('custodianUid')
  const [from, setFrom] = useReportParam('from')
  const [to, setTo] = useReportParam('to')
  const loc = useLocationOptions(buildingId)

  const q = useAssetRegisterReport({
    category, status, condition, departmentId, buildingId, roomId, custodianUid,
    from: dateOrUndefined(from), to: dateOrUndefined(to),
  })
  const d = q.data
  const reg = (extra: Record<string, string | undefined>) => link('/assets', { tab: 'register', ...extra })
  const filtered = Boolean(category || status || condition || departmentId || buildingId || roomId || custodianUid || from || to)

  return (
    <PanelStack>
      <FilterBar ariaLabel="Asset filters">
        <FilterSelect label="Category" value={category ?? ''} onChange={setCategory} options={opts(ASSET_CATEGORIES)} allLabel="All categories" />
        <FilterSelect label="Status" value={status ?? ''} onChange={setStatus} options={opts(ASSET_STATUS_KEYS)} allLabel="All statuses" />
        <FilterSelect label="Condition" value={condition ?? ''} onChange={setCondition} options={opts(ASSET_CONDITION_KEYS)} allLabel="All conditions" />
        <FilterSelect label="Department" value={departmentId ?? ''} onChange={setDepartmentId} options={loc.departments} allLabel="All departments" />
        <FilterSelect label="Building" value={buildingId ?? ''} onChange={(v) => { setBuildingId(v); setRoomId('') }} options={loc.buildings} allLabel="All buildings" />
        <FilterSelect label="Room" value={roomId ?? ''} onChange={setRoomId} options={loc.rooms} allLabel="All rooms" />
        <FilterDate label="Acquired from" value={from ?? ''} onChange={setFrom} max={to || undefined} />
        <FilterDate label="Acquired to" value={to ?? ''} onChange={setTo} min={from || undefined} />
        {custodianUid ? (
          <button type="button" onClick={() => setCustodianUid('')} className="rounded-lg border border-base px-3 py-2 text-xs font-medium text-brand-navy hover:bg-base">
            Clear custodian filter
          </button>
        ) : null}
      </FilterBar>

      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('assets', 'Register items', d.totals.assets, 'count', 'Rows in the asset register that match the filters. A bulk line (for example 40 chairs) is one row.', 'neutral', `${formatCount(d.totals.units)} units`, reg({ category, status, condition })),
          kpiTile('cost', 'Register valuation', d.totals.recordedCost, 'mwk', 'Recorded acquisition cost of items that are not disposed. Items with no cost recorded are not valued.', 'neutral', d.totals.withoutCost > 0 ? `${d.totals.withoutCost} with no cost recorded` : undefined),
          kpiTile('store', 'In store (unassigned)', d.byStatus.find((s) => s.key === 'IN_STORE')?.count ?? 0, 'count', 'Items with status “in store”. Not allocated to anyone.', 'neutral', undefined, reg({ status: 'IN_STORE', category, condition })),
          kpiTile('allocated', 'Allocated', d.byStatus.find((s) => s.key === 'ALLOCATED')?.count ?? 0, 'count', 'Items currently allocated to a person, department or room.', 'neutral', undefined, reg({ status: 'ALLOCATED', category, condition })),
          kpiTile('action', 'Needing action', d.totals.needsAction, 'count', 'Items that are damaged, under repair, lost, out of warranty soon, with no location, or allocated with no custodian.', d.totals.needsAction > 0 ? 'watch' : 'healthy'),
        ] : undefined}
      />
      {d?.rowsCapped ? (
        <p role="status" className="rounded-lg border border-brand-amber/50 bg-surface p-3 text-sm text-muted">
          The register is larger than this report reads in one pass, so figures cover only part of it. Narrow the filters.
        </p>
      ) : null}

      <TwoUp>
        <ChartCard title="Items by category" sub={filtered ? 'Matching the filters' : 'Whole register'} isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={(d?.byCategory ?? []).map((c) => ({ x: c.label, items: c.count }))} series={[{ key: 'items', label: 'Register items' }]} height={260} emptyStateMessage="No assets match these filters." ariaLabel="Register items by category" />
        </ChartCard>
        <ReportCard title="Status and condition" sub="Select a row to open those items in the register">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <div className="space-y-4">
              <ReportTable<ApiAssetCountRow>
                rows={d?.byStatus}
                rowKey={(r) => r.key}
                rowHref={(r) => reg({ status: r.key, category, condition })}
                exportLabel="Assets by status"
                columns={[
                  { key: 'label', label: 'Status', sortValue: (r) => r.label },
                  { key: 'count', label: 'Items', align: 'right', sortValue: (r) => r.count, cell: (r) => formatCount(r.count) },
                  { key: 'units', label: 'Units', align: 'right', sortValue: (r) => r.units, cell: (r) => formatCount(r.units) },
                ]}
              />
              <ReportTable<ApiAssetCountRow>
                rows={d?.byCondition}
                rowKey={(r) => r.key}
                rowHref={(r) => reg({ condition: r.key, category, status })}
                exportLabel="Assets by condition"
                columns={[
                  { key: 'label', label: 'Condition', sortValue: (r) => r.label },
                  { key: 'count', label: 'Items', align: 'right', sortValue: (r) => r.count, cell: (r) => formatCount(r.count) },
                  { key: 'units', label: 'Units', align: 'right', sortValue: (r) => r.units, cell: (r) => formatCount(r.units) },
                ]}
              />
            </div>
          </QueryState>
        </ReportCard>
      </TwoUp>

      <ReportCard title="Needs attention" sub="Damaged, under repair, lost, warranty ending, no location or custodian. Open one to act on it" href="/assets?tab=register" hrefLabel="Open register">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiAssetRecord>
            rows={d?.records}
            rowKey={(r) => r.id}
            rowHref={(r) => reg({ asset: r.id })}
            exportLabel="Assets needing attention"
            exportNote={d?.recordsTruncated ? `First ${d?.records.length ?? 0} of ${d?.totals.needsAction ?? 'more'} only: narrow the filters for the rest` : undefined}
            emptyMessage="No asset needs attention."
            columns={[
              { key: 'name', label: 'Asset', sortValue: (r) => r.name, cell: (r) => r.name, exportValue: (r) => r.name },
              { key: 'tag', label: 'Tag', hideOnMobile: true, sortValue: (r) => r.assetTag ?? '', cell: (r) => r.assetTag ?? '-', exportValue: (r) => r.assetTag ?? '' },
              { key: 'status', label: 'Status', sortValue: (r) => r.status, cell: (r) => humanize(r.status), exportValue: (r) => r.status },
              { key: 'condition', label: 'Condition', hideOnMobile: true, sortValue: (r) => r.condition, cell: (r) => humanize(r.condition), exportValue: (r) => r.condition },
              { key: 'location', label: 'Location', hideOnMobile: true, sortValue: (r) => r.location },
              { key: 'custodian', label: 'Custodian', hideOnMobile: true, sortValue: (r) => r.custodian ?? '', cell: (r) => r.custodian ?? '-', exportValue: (r) => r.custodian ?? '' },
              { key: 'flags', label: 'Why', sortValue: (r) => r.flags.length, cell: (r) => r.flags.map((f) => FLAG_LABEL[f]).join(', '), exportValue: (r) => r.flags.map((f) => FLAG_LABEL[f]).join('; ') },
              { key: 'cost', label: 'Cost', align: 'right', hideOnMobile: true, sortValue: (r) => r.acquisitionCost, cell: (r) => formatMwkCompact(r.acquisitionCost), exportValue: (r) => r.acquisitionCost },
            ]}
          />
          {d?.recordsTruncated ? <p className="mt-2 text-xs text-muted">Showing the first {d.records.length} of {d.totals.needsAction}. Narrow the filters to see the rest.</p> : null}
        </QueryState>
      </ReportCard>

      <TwoUp>
        <ReportCard title="Where assets are" sub="Rooms and departments, items needing action first">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable<ApiAssetLocationRow>
              rows={d?.byLocation}
              rowKey={(r) => r.key}
              rowHref={() => '/assets?tab=rooms'}
              exportLabel="Assets by location"
              emptyMessage="No assets to place."
              columns={[
                { key: 'label', label: 'Location', sortValue: (r) => r.label },
                { key: 'assets', label: 'Items', align: 'right', sortValue: (r) => r.assets, cell: (r) => formatCount(r.assets) },
                { key: 'units', label: 'Units', align: 'right', hideOnMobile: true, sortValue: (r) => r.units, cell: (r) => formatCount(r.units) },
                { key: 'attention', label: 'Need action', align: 'right', sortValue: (r) => r.needsAttention, cell: (r) => formatCount(r.needsAttention) },
                { key: 'cost', label: 'Cost', align: 'right', hideOnMobile: true, sortValue: (r) => r.recordedCost, cell: (r) => formatMwkCompact(r.recordedCost), exportValue: (r) => r.recordedCost },
              ]}
            />
          </QueryState>
        </ReportCard>
        <ReportCard title="Who is responsible" sub="Assets allocated or kept in a custodian’s room. Select a person to filter">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable<ApiAssetCustodianRow>
              rows={d?.byCustodian}
              rowKey={(r) => r.key}
              exportLabel="Assets by custodian"
              emptyMessage="No assets are allocated."
              columns={[
                {
                  key: 'label',
                  label: 'Custodian',
                  sortValue: (r) => r.label,
                  cell: (r) =>
                    r.uid ? (
                      <button type="button" onClick={() => setCustodianUid(r.uid ?? '')} className="text-left text-brand-navy underline-offset-2 app-action focus:outline-none focus:ring-2 focus:ring-brand-navy/20 rounded">
                        {r.label}
                      </button>
                    ) : (
                      r.label
                    ),
                  exportValue: (r) => r.label,
                },
                { key: 'kind', label: 'Held as', hideOnMobile: true, sortValue: (r) => r.kind, cell: (r) => humanize(r.kind.replace('-', ' ')), exportValue: (r) => r.kind },
                { key: 'assets', label: 'Items', align: 'right', sortValue: (r) => r.assets, cell: (r) => formatCount(r.assets) },
                { key: 'units', label: 'Units', align: 'right', hideOnMobile: true, sortValue: (r) => r.units, cell: (r) => formatCount(r.units) },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>

      <ReportCard title="Requests" sub="Equipment requests are a separate approval flow from purchase requisitions" href="/assets?tab=requests" hrefLabel="Open requests">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:max-w-md">
            <div>
              <dt className="text-xs text-muted">Awaiting approval</dt>
              <dd className="font-heading text-lg font-semibold text-brand-navy">{d ? formatCount(d.requests.pending) : '-'}</dd>
            </div>
            {d && d.requests.outstandingAdvances !== null ? (
              <div>
                <dt className="text-xs text-muted">Advances not yet reconciled</dt>
                <dd className="font-heading text-lg font-semibold text-brand-navy">{formatMwk(d.requests.outstandingAdvances)}</dd>
              </div>
            ) : null}
          </dl>
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

// ─── Stocktakes ───────────────────────────────────────────────────────────────

const STOCKTAKE_STATUS_KEYS = ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'COMPLETED', 'CANCELLED']

export function StocktakeTab({ academicYear, term }: { academicYear: string; term?: number }) {
  // "all" lifts the term filter; otherwise the term defaults to the term being viewed.
  const [termParam, setTermParam] = useReportParam('stocktakeTerm')
  const [departmentId, setDepartmentId] = useReportParam('departmentId')
  const [roomId, setRoomId] = useReportParam('roomId')
  const [status, setStatus] = useReportParam('status')
  const loc = useLocationOptions()
  const termValue = termParam ?? (term ? String(term) : 'all')
  const effectiveTerm = termValue === 'all' ? undefined : termValue

  const q = useStocktakeReport({ academicYear, term: effectiveTerm, departmentId, roomId, status })
  const variance = useStocktakeVariance(academicYear)
  const d = q.data
  const t = d?.totals
  const stocktakes = (extra: Record<string, string | undefined> = {}) => link('/assets', { tab: 'stocktakes', ...extra })

  return (
    <PanelStack>
      <FilterBar ariaLabel="Stocktake filters">
        <FilterSelect label="Term" value={termValue} onChange={setTermParam} options={[{ value: 'all', label: 'All terms' }, ...TERM_OPTIONS]} />
        <FilterSelect label="Department" value={departmentId ?? ''} onChange={setDepartmentId} options={loc.departments} allLabel="All departments" />
        <FilterSelect label="Room" value={roomId ?? ''} onChange={setRoomId} options={loc.rooms} allLabel="All rooms" />
        <FilterSelect label="Status" value={status ?? ''} onChange={setStatus} options={opts(STOCKTAKE_STATUS_KEYS)} allLabel="All statuses" />
      </FilterBar>

      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d && t ? [
          kpiTile('coverage', 'Rooms counted', d.coverage.coverageRate, 'percent', 'Active rooms with a completed stocktake in this period ÷ all active rooms (cancelled stocktakes do not count).', d.coverage.coverageRate !== null && d.coverage.coverageRate < 50 ? 'watch' : 'neutral', `${d.coverage.counted} of ${d.coverage.activeRooms} rooms`, stocktakes()),
          kpiTile('incomplete', 'Not yet completed', t.incomplete, 'count', `Stocktakes that are draft, in progress, submitted or reviewed. No due date is recorded, so one open more than ${d.staleAfterDays} days is flagged as overdue.`, t.stale > 0 ? 'watch' : 'neutral', t.stale > 0 ? `${t.stale} open over ${d.staleAfterDays} days` : undefined),
          kpiTile('rate', 'Lines with a variance', t.varianceRate, 'percent', 'Counted lines where the count differed from the book quantity ÷ all lines counted.', 'neutral', `${t.varianceLines} of ${t.lines} lines`),
          kpiTile('unresolved', 'Unresolved discrepancies', t.unresolvedVariances, 'count', 'Variances still open or under investigation.', t.unresolvedVariances > 0 ? 'watch' : 'healthy'),
          kpiTile('net', 'Counted vs expected', t.lines === 0 ? null : t.netVariance, 'count', 'Total counted quantity minus total expected quantity across the lines recorded (negative = shortage overall).', 'neutral', t.lines === 0 ? undefined : `${num(t.counted)} counted · ${num(t.expected)} expected`),
        ] : undefined}
      />

      <ReportCard title="Stocktakes" sub="Unfinished and overdue first: open one to count or resolve" href="/assets?tab=stocktakes" hrefLabel="Open stocktakes">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiStocktakeRow>
            rows={d?.rows}
            rowKey={(r) => r.id}
            rowHref={(r) => stocktakes({ stocktake: r.id })}
            exportLabel="Stocktakes"
            emptyMessage="No stocktakes match these filters."
            columns={[
              { key: 'no', label: 'Stocktake', sortValue: (r) => r.stocktakeNumber },
              { key: 'room', label: 'Room', sortValue: (r) => `${r.building ?? ''} ${r.room ?? ''}`, cell: (r) => (r.room ? `${r.building ?? ''} · ${r.room}`.replace(/^ · /, '') : r.department ?? 'Whole school'), exportValue: (r) => r.room ?? r.department ?? 'Whole school' },
              { key: 'term', label: 'Term', hideOnMobile: true, sortValue: (r) => r.term ?? 0, cell: (r) => (r.term ? `Term ${r.term}` : '-'), exportValue: (r) => r.term ?? '' },
              { key: 'status', label: 'Status', sortValue: (r) => r.status, cell: (r) => `${humanize(r.status)}${r.stale ? ' overdue' : ''}`, exportValue: (r) => r.status },
              { key: 'who', label: 'Responsible', hideOnMobile: true, sortValue: (r) => r.responsible ?? '', cell: (r) => r.responsible ?? '-', exportValue: (r) => r.responsible ?? '' },
              { key: 'open', label: 'Days open', align: 'right', sortValue: (r) => r.openDays, cell: (r) => (r.openDays === null ? '-' : String(r.openDays)), exportValue: (r) => r.openDays },
              { key: 'lines', label: 'Lines', align: 'right', hideOnMobile: true, sortValue: (r) => r.lines, cell: (r) => formatCount(r.lines) },
              { key: 'exp', label: 'Expected', align: 'right', hideOnMobile: true, sortValue: (r) => r.expected, cell: (r) => num(r.expected), exportValue: (r) => r.expected },
              { key: 'cnt', label: 'Counted', align: 'right', hideOnMobile: true, sortValue: (r) => r.counted, cell: (r) => num(r.counted), exportValue: (r) => r.counted },
              { key: 'var', label: 'Variances', align: 'right', sortValue: (r) => r.varianceLines, cell: (r) => `${r.varianceLines}${r.unresolved ? ` (${r.unresolved} open)` : ''}`, exportValue: (r) => r.varianceLines },
              { key: 'done', label: 'Completed', align: 'right', hideOnMobile: true, sortValue: (r) => r.completedAt, cell: (r) => formatDate(r.completedAt), exportValue: (r) => r.completedAt },
            ]}
          />
        </QueryState>
      </ReportCard>

      <TwoUp>
        <ReportCard title="Rooms not counted yet" sub="Active rooms with no stocktake in this period">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable
              rows={d?.coverage.notStartedRooms}
              rowKey={(r) => r.id}
              exportLabel="Rooms not counted"
              emptyMessage="Every active room has a stocktake."
              columns={[{ key: 'room', label: 'Room', sortValue: (r) => r.label }]}
            />
          </QueryState>
        </ReportCard>
        <ReportCard title="Unresolved discrepancies" sub={`Whole academic year ${academicYear} unresolved first`}>
          <QueryState isLoading={variance.isLoading} isError={variance.isError} onRetry={() => void variance.refetch()}>
            <ReportTable<ApiVarianceItemRow>
              rows={variance.data?.items}
              rowKey={(r) => r.varianceId}
              rowHref={() => stocktakes()}
              exportLabel="Stocktake discrepancies"
              emptyMessage="No stocktake variances recorded."
              columns={[
                { key: 'item', label: 'Item', sortValue: (r) => r.itemName },
                { key: 'room', label: 'Room', hideOnMobile: true, sortValue: (r) => `${r.building} · ${r.room}`, cell: (r) => `${r.building} · ${r.room}`, exportValue: (r) => `${r.building} · ${r.room}` },
                { key: 'type', label: 'Type', sortValue: (r) => r.varianceType, cell: (r) => humanize(r.varianceType) },
                { key: 'qty', label: 'Qty', align: 'right', sortValue: (r) => r.quantity },
                { key: 'status', label: 'Status', sortValue: (r) => r.status, cell: (r) => humanize(r.status), exportValue: (r) => r.status },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>
    </PanelStack>
  )
}

// ─── Procurement ──────────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [
  { value: '90', label: 'Last 3 months' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last 12 months' },
  { value: '730', label: 'Last 24 months' },
]

export function ProcurementTab() {
  const [windowDays, setWindowDays] = useReportParam('window')
  const [departmentId, setDepartmentId] = useReportParam('departmentId')
  const [from, setFrom] = useReportParam('from')
  const [to, setTo] = useReportParam('to')
  const loc = useLocationOptions()
  const days = Number(windowDays) || 365
  const f = dateOrUndefined(from)
  const t = dateOrUndefined(to)
  const customRange = Boolean(f || t)

  const q = useProcurementValue({ days, departmentId, from: f, to: t })
  // Cycle times use the rolling window, so they are only shown when no custom dates are set.
  const cycle = useProcurementPipeline(days, { enabled: !customRange })
  const d = q.data
  const list = (ptab: string) => link('/finances', { tab: 'procurement', ptab })
  const value = (key: string) => d?.stages.find((s) => s.key === key)?.value ?? null
  const count = (key: string) => d?.stages.find((s) => s.key === key)?.count ?? 0

  return (
    <PanelStack>
      <FilterBar ariaLabel="Procurement filters">
        <FilterSelect label="Window" value={String(days)} onChange={(v) => { setWindowDays(v); setFrom(''); setTo('') }} options={WINDOW_OPTIONS} />
        <FilterDate label="From" value={from ?? ''} onChange={setFrom} max={to || undefined} />
        <FilterDate label="To" value={to ?? ''} onChange={setTo} min={from || undefined} />
        <FilterSelect label="Department" value={departmentId ?? ''} onChange={setDepartmentId} options={loc.departments} allLabel="All departments" />
      </FilterBar>
      <p className="text-xs text-muted">
        Requisitions raised {d ? `${formatDate(d.from)} to ${formatDate(d.to)}` : 'in this period'}, followed through their purchase orders, receipts and expenses.
      </p>

      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('requested', 'Requested', value('requested'), 'mwk', 'Estimated cost of requisitions submitted for approval.', 'neutral', `${count('requested')} requisitions`, list('requisitions')),
          kpiTile('ordered', 'Ordered', value('ordered'), 'mwk', 'Total of approved purchase orders, including tax.', 'neutral', `${count('ordered')} orders`, list('orders')),
          kpiTile('received', 'Received', value('received'), 'mwk', 'Value of goods accepted so far, at ordered prices.', 'neutral', undefined, list('receipts')),
          kpiTile('paid', 'Paid', value('paid'), 'mwk', 'Approved expenses recorded against these orders that have a payment date.', 'neutral', d.expenses.payable > 0 ? `${formatMwkCompact(d.expenses.payable)} approved, not yet paid` : undefined),
          kpiTile('open', 'Open commitments', d.openNow.value, 'mwk', 'Undelivered value of every open purchase order, whatever its date. The same figure Finance reports as open commitments.', 'neutral', `${d.openNow.orders} open orders`, list('orders')),
        ] : undefined}
      />

      <TwoUp>
        <ChartCard title="Value at each stage" sub="Different measures of the same requisitions. Not added together" isLoading={q.isLoading} height={260}>
          <Chart
            type="bar"
            data={(d?.stages ?? []).filter((s) => s.value !== null).map((s) => ({ x: s.label, value: s.value ?? 0 }))}
            series={[{ key: 'value', label: 'MWK' }]}
            height={260}
            emptyStateMessage="No procurement activity in this period."
            ariaLabel="Procurement value by stage"
          />
        </ChartCard>
        <ReportCard title="What each stage means">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable
              rows={d?.stages}
              rowKey={(r) => r.key}
              exportLabel="Procurement value by stage"
              columns={[
                { key: 'stage', label: 'Stage', sortValue: (r) => r.label, cell: (r) => <span title={r.description}>{r.label}</span>, exportValue: (r) => r.label },
                { key: 'count', label: 'Count', align: 'right', sortValue: (r) => r.count, cell: (r) => formatCount(r.count) },
                { key: 'value', label: 'Value', align: 'right', sortValue: (r) => r.value, cell: (r) => formatMwk(r.value), exportValue: (r) => r.value },
                { key: 'what', label: 'Measures', hideOnMobile: true, sortValue: (r) => r.description, cell: (r) => <span className="text-muted">{r.description}</span>, exportValue: (r) => r.description },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>

      <ReportCard title="Where the ordered value is now" sub="Ordered = received + released + open, so nothing is counted twice">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          {d ? (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {([
                  ['Ordered', d.orders.ordered, 'Approved purchase orders'],
                  ['Received', d.orders.received, 'Goods accepted'],
                  ['Released', d.orders.released, 'Cancelled quantity and cancelled orders'],
                  ['Open', d.orders.open, 'Still to be delivered'],
                ] as const).map(([label, v, hint]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="font-heading text-lg font-semibold text-brand-navy">{formatMwkCompact(v)}</dd>
                    <p className="text-xs text-muted">{hint}</p>
                  </div>
                ))}
              </dl>
              {!d.orders.reconciles ? (
                <p role="alert" className="rounded-lg border border-brand-coral/50 p-3 text-sm text-tone-coral">
                  These figures do not add up. An order has a line with no quantity. Check the purchase orders.
                </p>
              ) : null}
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                <li>Expenses are recorded separately: {formatMwk(d.expenses.approved)} approved ({formatMwk(d.expenses.paid)} paid, {formatMwk(d.expenses.payable)} owed), {formatMwk(d.expenses.pendingApproval)} waiting for approval.</li>
                {d.expenses.receivedNotExpensed > 0 ? <li>{formatMwk(d.expenses.receivedNotExpensed)} of goods received has no approved expense yet.</li> : null}
                {d.expenses.expensedAheadOfDelivery > 0 ? <li>{formatMwk(d.expenses.expensedAheadOfDelivery)} has been expensed ahead of delivery.</li> : null}
                <li>Direct expenses that are not linked to a purchase order are in Finance’s expense reports, not here.</li>
              </ul>
            </div>
          ) : null}
        </QueryState>
      </ReportCard>

      <TwoUp>
        <ReportCard title="Waiting for a decision" sub="Requisitions and purchase orders awaiting approval" href={list('requisitions')} hrefLabel="Open requisitions">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            {d ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Requisitions</dt>
                  <dd className="font-heading text-lg font-semibold text-brand-navy">{formatCount(d.awaitingApproval.requisitions.count)}</dd>
                  <p className="text-xs text-muted">{formatMwkCompact(d.awaitingApproval.requisitions.value)}{d.awaitingApproval.requisitions.oldestDays !== null ? ` · oldest ${d.awaitingApproval.requisitions.oldestDays} days` : ''}</p>
                </div>
                <div>
                  <dt className="text-xs text-muted">Purchase orders</dt>
                  <dd className="font-heading text-lg font-semibold text-brand-navy">{formatCount(d.awaitingApproval.purchaseOrders.count)}</dd>
                  <p className="text-xs text-muted">{formatMwkCompact(d.awaitingApproval.purchaseOrders.value)}</p>
                </div>
              </dl>
            ) : null}
          </QueryState>
        </ReportCard>
        <ReportCard title="Delivery times" sub={customRange ? 'Shown for the rolling windows only' : 'Average days, over the window'}>
          <QueryState isLoading={cycle.isLoading} isError={cycle.isError} onRetry={() => void cycle.refetch()}>
            {customRange ? (
              <p className="text-sm text-muted">Choose a window instead of dates to see average approval and delivery times.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Submission to approval</dt>
                  <dd className="font-heading text-lg font-semibold text-brand-navy">{cycle.data?.avgApprovalDays == null ? 'N/A' : `${cycle.data.avgApprovalDays} days`}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Order to first delivery</dt>
                  <dd className="font-heading text-lg font-semibold text-brand-navy">{cycle.data?.avgDeliveryDays == null ? 'N/A' : `${cycle.data.avgDeliveryDays} days`}</dd>
                </div>
              </dl>
            )}
          </QueryState>
        </ReportCard>
      </TwoUp>

      <TwoUp>
        <ReportCard title="Delayed purchase orders" sub="Past the expected delivery date with goods still to come" href={list('orders')} hrefLabel="Open orders">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable<ApiPurchaseOrderRow>
              rows={d?.delayed}
              rowKey={(r) => r.id}
              rowHref={() => list('orders')}
              exportLabel="Delayed purchase orders"
              emptyMessage="No order is past its delivery date."
              columns={[
                { key: 'po', label: 'Order', sortValue: (r) => r.poNumber },
                { key: 'supplier', label: 'Supplier', hideOnMobile: true, sortValue: (r) => r.supplier },
                { key: 'late', label: 'Days late', align: 'right', sortValue: (r) => r.daysLate, cell: (r) => (r.daysLate === null ? '-' : String(r.daysLate)) },
                { key: 'open', label: 'Still to deliver', align: 'right', sortValue: (r) => r.openValue, cell: (r) => formatMwkCompact(r.openValue), exportValue: (r) => r.openValue },
              ]}
            />
          </QueryState>
        </ReportCard>
        <ReportCard title="Partly delivered" sub="Some goods received, the rest outstanding" href={list('receipts')} hrefLabel="Open receipts">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable<ApiPurchaseOrderRow>
              rows={d?.partiallyDelivered}
              rowKey={(r) => r.id}
              rowHref={() => list('orders')}
              exportLabel="Partly delivered purchase orders"
              emptyMessage="No order is partly delivered."
              columns={[
                { key: 'po', label: 'Order', sortValue: (r) => r.poNumber },
                { key: 'supplier', label: 'Supplier', hideOnMobile: true, sortValue: (r) => r.supplier },
                { key: 'rec', label: 'Received', align: 'right', sortValue: (r) => r.receivedValue, cell: (r) => formatMwkCompact(r.receivedValue), exportValue: (r) => r.receivedValue },
                { key: 'open', label: 'Outstanding', align: 'right', sortValue: (r) => r.openValue, cell: (r) => formatMwkCompact(r.openValue), exportValue: (r) => r.openValue },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>

      <ReportCard title="Requisitions" sub="Open ones first, oldest at the top" href={list('requisitions')} hrefLabel="Open requisitions">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiRequisitionValueRow>
            rows={d?.requisitions}
            rowKey={(r) => r.id}
            rowHref={() => list('requisitions')}
            exportLabel="Requisitions by value"
            exportNote={d?.requisitionsTruncated ? `Largest ${d?.requisitions.length ?? 0} only: narrow the filters for the rest` : undefined}
            emptyMessage="No requisitions in this period."
            columns={[
              { key: 'no', label: 'Requisition', sortValue: (r) => r.requisitionNumber },
              { key: 'dept', label: 'Department', hideOnMobile: true, sortValue: (r) => r.department },
              { key: 'status', label: 'Status', sortValue: (r) => r.status, cell: (r) => humanize(r.status), exportValue: (r) => r.status },
              { key: 'age', label: 'Days open', align: 'right', hideOnMobile: true, sortValue: (r) => r.ageDays, cell: (r) => (r.ageDays === null ? '-' : String(r.ageDays)), exportValue: (r) => r.ageDays },
              { key: 'req', label: 'Requested', align: 'right', sortValue: (r) => r.requested, cell: (r) => formatMwkCompact(r.requested), exportValue: (r) => r.requested },
              { key: 'ord', label: 'Ordered', align: 'right', hideOnMobile: true, sortValue: (r) => r.ordered, cell: (r) => formatMwkCompact(r.ordered), exportValue: (r) => r.ordered },
              { key: 'rec', label: 'Received', align: 'right', hideOnMobile: true, sortValue: (r) => r.received, cell: (r) => formatMwkCompact(r.received), exportValue: (r) => r.received },
              { key: 'exp', label: 'Expensed', align: 'right', hideOnMobile: true, sortValue: (r) => r.expensed, cell: (r) => formatMwkCompact(r.expensed), exportValue: (r) => r.expensed },
              { key: 'paid', label: 'Paid', align: 'right', sortValue: (r) => r.paid, cell: (r) => formatMwkCompact(r.paid), exportValue: (r) => r.paid },
            ]}
          />
          {d?.requisitionsTruncated ? <p className="mt-2 text-xs text-muted">Showing the first {d.requisitions.length}. Narrow the period or department to see the rest.</p> : null}
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

// ─── Inventory stock levels ───────────────────────────────────────────────────

const STOCK_WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
]

const STATE_LABEL: Record<ApiLowStockRow['state'], string> = { negative: 'Negative balance', out: 'Out of stock', low: 'Low' }

export function InventoryTab() {
  const [windowDays, setWindowDays] = useReportParam('window')
  const [departmentId, setDepartmentId] = useReportParam('departmentId')
  const [roomId, setRoomId] = useReportParam('roomId')
  const [from, setFrom] = useReportParam('from')
  const [to, setTo] = useReportParam('to')
  const loc = useLocationOptions()
  const days = Number(windowDays) || 30
  const q = useStockReport({ days, departmentId, roomId, from: dateOrUndefined(from), to: dateOrUndefined(to) })
  const d = q.data
  const inv = (extra: Record<string, string | undefined> = {}) => link('/assets', { tab: 'inventory', ...extra })

  return (
    <PanelStack>
      <FilterBar ariaLabel="Stock filters">
        <FilterSelect label="Movements" value={String(days)} onChange={(v) => { setWindowDays(v); setFrom(''); setTo('') }} options={STOCK_WINDOWS} />
        <FilterDate label="From" value={from ?? ''} onChange={setFrom} max={to || undefined} />
        <FilterDate label="To" value={to ?? ''} onChange={setTo} min={from || undefined} />
        <FilterSelect label="Department" value={departmentId ?? ''} onChange={setDepartmentId} options={loc.departments} allLabel="All departments" />
        <FilterSelect label="Room" value={roomId ?? ''} onChange={setRoomId} options={loc.rooms} allLabel="All rooms" />
      </FilterBar>
      <p className="text-xs text-muted">Stock levels are school-wide. The window, department and room filters apply to the movements.</p>

      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('items', 'Items tracked', d.totals.items, 'count', 'Active inventory items.', 'neutral', undefined, inv()),
          kpiTile('low', 'At or below reorder level', d.totals.belowReorder, 'count', 'Items whose balance (sum of all their movements) is at or below the reorder level. Items with no reorder level cannot be assessed.', d.totals.belowReorder > 0 ? 'watch' : 'healthy', undefined, inv({ low: '1' })),
          kpiTile('out', 'Out of stock', d.totals.outOfStock, 'count', 'Items that have had stock but whose balance is now zero or less.', d.totals.outOfStock > 0 ? 'watch' : 'healthy'),
          kpiTile('negative', 'Negative balances', d.totals.negative, 'count', 'Items whose recorded issues exceed receipts. A record needs correcting.', d.totals.negative > 0 ? 'critical' : 'healthy'),
          kpiTile('norl', 'No reorder level', d.totals.withoutReorderLevel, 'count', 'Items that cannot be checked for low stock because no reorder level is set.', 'neutral'),
        ] : undefined}
      />

      <ReportCard title="Low stock" sub="With the movements that explain the change in the window. Open an item to receive or issue stock" href="/assets?tab=inventory&low=1" hrefLabel="Open inventory">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiLowStockRow>
            rows={d?.low}
            rowKey={(r) => r.itemId}
            rowHref={(r) => inv({ item: r.itemCode })}
            exportLabel="Low stock items"
            emptyMessage="No item is at or below its reorder level."
            columns={[
              { key: 'item', label: 'Item', sortValue: (r) => r.name, cell: (r) => r.name, exportValue: (r) => r.name },
              { key: 'code', label: 'Code', hideOnMobile: true, sortValue: (r) => r.itemCode, exportValue: (r) => r.itemCode },
              { key: 'state', label: 'State', sortValue: (r) => r.state, cell: (r) => STATE_LABEL[r.state], exportValue: (r) => STATE_LABEL[r.state] },
              { key: 'bal', label: 'Balance', align: 'right', sortValue: (r) => r.balance, cell: (r) => `${num(r.balance)} ${r.unit}`, exportValue: (r) => r.balance },
              { key: 'rl', label: 'Reorder at', align: 'right', hideOnMobile: true, sortValue: (r) => r.reorderLevel, cell: (r) => num(r.reorderLevel), exportValue: (r) => r.reorderLevel },
              { key: 'short', label: 'Shortfall', align: 'right', sortValue: (r) => r.shortfall, cell: (r) => num(r.shortfall), exportValue: (r) => r.shortfall },
              { key: 'rq', label: 'Reorder qty', align: 'right', hideOnMobile: true, sortValue: (r) => r.reorderQuantity, cell: (r) => (r.reorderQuantity === null ? '-' : num(r.reorderQuantity)), exportValue: (r) => r.reorderQuantity },
              { key: 'in', label: 'In', align: 'right', hideOnMobile: true, sortValue: (r) => r.receivedInWindow, cell: (r) => num(r.receivedInWindow), exportValue: (r) => r.receivedInWindow },
              { key: 'out', label: 'Out', align: 'right', hideOnMobile: true, sortValue: (r) => r.issuedInWindow, cell: (r) => num(r.issuedInWindow), exportValue: (r) => r.issuedInWindow },
              { key: 'net', label: 'Net change', align: 'right', sortValue: (r) => r.netChangeInWindow, cell: (r) => num(r.netChangeInWindow), exportValue: (r) => r.netChangeInWindow },
              { key: 'last', label: 'Last movement', align: 'right', hideOnMobile: true, sortValue: (r) => r.lastMovementAt, cell: (r) => formatDate(r.lastMovementAt), exportValue: (r) => r.lastMovementAt },
            ]}
          />
        </QueryState>
      </ReportCard>

      <TwoUp>
        <ChartCard title="Stock in and out by day" sub="Effect on the balance; transfers between rooms are not counted" isLoading={q.isLoading} height={260}>
          <Chart
            type="bar"
            data={(d?.movementsByDay ?? []).map((m) => ({ x: m.label, inbound: m.inbound, outbound: m.outbound }))}
            series={[{ key: 'inbound', label: 'In' }, { key: 'outbound', label: 'Out' }]}
            height={260}
            emptyStateMessage="No stock movements in this window."
            ariaLabel="Stock received and issued per day"
          />
        </ChartCard>
        <ReportCard title="Movements by type">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable
              rows={d?.movementsByType}
              rowKey={(r) => r.type}
              exportLabel="Stock movements by type"
              emptyMessage="No stock movements in this window."
              columns={[
                { key: 'type', label: 'Type', sortValue: (r) => r.type, cell: (r) => humanize(r.type), exportValue: (r) => r.type },
                { key: 'count', label: 'Movements', align: 'right', sortValue: (r) => r.count, cell: (r) => formatCount(r.count) },
                { key: 'qty', label: 'Quantity', align: 'right', sortValue: (r) => r.quantity, cell: (r) => num(r.quantity), exportValue: (r) => r.quantity },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>

      <ReportCard title="Recent movements" sub="Newest first">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiStockMovementRow>
            rows={d?.movements}
            rowKey={(r) => r.id}
            rowHref={(r) => inv({ item: r.itemCode })}
            exportLabel="Stock movements"
            exportNote={d?.movementsTruncated ? `Latest ${d?.movements.length ?? 0} only: narrow the window for the rest` : undefined}
            emptyMessage="No stock movements in this window."
            columns={[
              { key: 'at', label: 'When', sortValue: (r) => r.at, cell: (r) => formatDate(r.at), exportValue: (r) => r.at },
              { key: 'item', label: 'Item', sortValue: (r) => r.itemName, cell: (r) => `${r.itemName} (${r.itemCode})`, exportValue: (r) => r.itemName },
              { key: 'type', label: 'Type', sortValue: (r) => r.type, cell: (r) => humanize(r.type), exportValue: (r) => r.type },
              { key: 'qty', label: 'Quantity', align: 'right', sortValue: (r) => r.quantity, cell: (r) => (r.effect === 0 ? num(r.quantity) : `${r.effect > 0 ? '+' : '−'}${num(Math.abs(r.effect))}`), exportValue: (r) => r.effect || r.quantity },
              { key: 'route', label: 'From → to', hideOnMobile: true, sortValue: (r) => `${r.from ?? ''}${r.to ?? ''}`, cell: (r) => (r.from || r.to ? `${r.from ?? '-'} → ${r.to ?? '-'}` : '-'), exportValue: (r) => `${r.from ?? ''} → ${r.to ?? ''}` },
              { key: 'dept', label: 'Department', hideOnMobile: true, sortValue: (r) => r.department ?? '', cell: (r) => r.department ?? '-', exportValue: (r) => r.department ?? '' },
              { key: 'why', label: 'Reason', hideOnMobile: true, sortValue: (r) => r.reason ?? '', cell: (r) => r.reason ?? '-', exportValue: (r) => r.reason ?? '' },
            ]}
          />
          {d?.movementsTruncated ? <p className="mt-2 text-xs text-muted">Showing the latest {d.movements.length}. Narrow the window to see earlier movements.</p> : null}
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
