'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { apiFetch } from '@/lib/api-client'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AUDIT_ENTITY_TYPES, AUDIT_SEVERITY_CONFIG } from '@shared/constants/audit'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShieldOff, ChevronDown, ChevronRight, Search, Download, CalendarIcon, RefreshCw } from 'lucide-react'
import type { Severity } from '@/server/services/auditService'

// ─────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────

interface AuditMetadata {
  before?:   Record<string, unknown>
  after?:    Record<string, unknown>
  changes?:  Array<{ field: string; oldValue: unknown; newValue: unknown }>
  context?:  Record<string, unknown>
}

interface AuditLogRow {
  id:         string
  action:     string
  severity:   Severity
  entityType: string
  entityId:   string
  actorUid:   string
  actorRole:  string
  metadata:   AuditMetadata | null
  createdAt:  string
}

interface AuditQueryResult {
  entries:  AuditLogRow[]
  total:    number
  page:     number
  pages:    number
  pageSize: number
}

interface AuditLogViewerProps {
  /** Pre-filter to a specific entity — locks entityType and entityId filters. */
  fixedEntityType?: string
  fixedEntityId?:   string
  /** Pre-filter to a specific actor UID. */
  fixedActorUid?:   string
  /** Title shown in the viewer header. */
  title?: string
  /** Maximum page size. Default 25. */
  defaultPageSize?: number
}

// ─────────────────────────────────────────────────────────
//  SEVERITY CONFIG
// ─────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────
//  METADATA DIFF VIEWER
// ─────────────────────────────────────────────────────────

function MetadataDiffRow({ row }: { row: AuditLogRow }) {
  const [expanded, setExpanded] = useState(false)
  const hasMetadata =
    row.metadata &&
    (row.metadata.before || row.metadata.after ||
     row.metadata.changes?.length || row.metadata.context)

  if (!hasMetadata) return null

  const { before, after, changes, context } = row.metadata!

  return (
    <TableRow className="bg-muted/20">
      <TableCell colSpan={7} className="p-0">
                <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-start h-auto"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          )}
          {changes && changes.length > 0
            ? `${changes.length} field${changes.length === 1 ? '' : 's'} changed`
            : 'View metadata'}
        </Button>

        {expanded && (
          <div className="px-4 pb-3 space-y-3">

            {/* Field-level changes */}
            {changes && changes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Changes
                </p>
                <div className="rounded-md border divide-y text-xs font-mono">
                  {changes.map((c, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2 px-3 py-1.5">
                      <span className="font-sans font-medium text-foreground truncate">
                        {c.field}
                      </span>
                      <span className="text-red-600 dark:text-red-400 truncate line-through opacity-70">
                        {JSON.stringify(c.oldValue)}
                      </span>
                      <span className="text-green-600 dark:text-green-400 truncate">
                        {JSON.stringify(c.newValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Before / After snapshots (only if no computed diff) */}
            {!changes?.length && (before || after) && (
              <div className="grid grid-cols-2 gap-3">
                {before && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Before</p>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto max-h-32">
                      {JSON.stringify(before, null, 2)}
                    </pre>
                  </div>
                )}
                {after && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">After</p>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto max-h-32">
                      {JSON.stringify(after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Context */}
            {context && Object.keys(context).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Context</p>
                <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto max-h-24">
                  {JSON.stringify(context, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}

// ─────────────────────────────────────────────────────────
//  SKELETON
// ─────────────────────────────────────────────────────────

function AuditLogSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded" />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  XLSX EXPORT HELPER
// ─────────────────────────────────────────────────────────

async function exportToXlsx(entries: AuditLogRow[], filename: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SMS Malawi'
  wb.created  = new Date()

  const ws = wb.addWorksheet('Audit Log')

  ws.columns = [
    { header: 'Timestamp',   key: 'createdAt',  width: 22 },
    { header: 'Action',      key: 'action',     width: 36 },
    { header: 'Severity',    key: 'severity',   width: 12 },
    { header: 'Entity Type', key: 'entityType', width: 18 },
    { header: 'Entity ID',   key: 'entityId',   width: 30 },
    { header: 'Actor UID',   key: 'actorUid',   width: 30 },
    { header: 'Actor Role',  key: 'actorRole',  width: 16 },
    { header: 'Changes',     key: 'changes',    width: 60 },
  ]

  // Bold header row
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  }

  for (const entry of entries) {
    const changesText = entry.metadata?.changes
      ?.map((c) => `${c.field}: ${JSON.stringify(c.oldValue)} → ${JSON.stringify(c.newValue)}`)
      .join('; ') ?? ''

    ws.addRow({
      createdAt:  format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      action:     entry.action,
      severity:   entry.severity,
      entityType: entry.entityType,
      entityId:   entry.entityId,
      actorUid:   entry.actorUid,
      actorRole:  entry.actorRole,
      changes:    changesText,
    })
  }

  // Auto-freeze the header row
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────

export function AuditLogViewer({
  fixedEntityType,
  fixedEntityId,
  fixedActorUid,
  title = 'Audit Log',
  defaultPageSize = 25,
}: AuditLogViewerProps) {
  const { initialized } = useAuthStore()
  const { can } = usePermissions()

  // ── Filter state
  const [search,     setSearch]     = useState('')
  const [entityType, setEntityType] = useState(fixedEntityType ?? '')
  const [severity,   setSeverity]   = useState<Severity | ''>('')
  const [actorUid,   setActorUid]   = useState(fixedActorUid ?? '')
  const [dateFrom,   setDateFrom]   = useState<Date | undefined>(
    () => subDays(new Date(), 7)
  )
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date())
  const [page,   setPage]   = useState(1)

  // Date picker open state
  const [dateFromOpen, setDateFromOpen] = useState(false)
  const [dateToOpen,   setDateToOpen]   = useState(false)

  const canView = can('userMgmt.viewAuditLogs') || can('report.viewAuditLogs')

  // ── Build query key — changes trigger re-fetch
  const queryKey = [
    'audit-log-viewer',
    search, entityType, severity, actorUid,
    dateFrom?.toISOString(), dateTo?.toISOString(),
    page, defaultPageSize,
    fixedEntityType, fixedEntityId, fixedActorUid,
  ]

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      // If fixed entity — use the entity-specific endpoint
      if (fixedEntityType && fixedEntityId) {
        const result = await apiFetch<{
          entityType: string
          entityId:   string
          entries:    AuditLogRow[]
          count:      number
        }>(`/audit/entity/${fixedEntityType}/${fixedEntityId}`)
        return {
          entries:  result.entries,
          total:    result.count,
          page:     1,
          pages:    1,
          pageSize: result.count,
        } satisfies AuditQueryResult
      }

      // If fixed actor — use the actor-specific endpoint
      if (fixedActorUid) {
        const params = new URLSearchParams()
        if (dateFrom) params.set('dateFrom', dateFrom.toISOString())
        if (dateTo)   params.set('dateTo',   endOfDay(dateTo).toISOString())
        params.set('limit', String(defaultPageSize))

        const result = await apiFetch<{
          actorUid: string
          entries:  AuditLogRow[]
          count:    number
        }>(`/audit/actor/${fixedActorUid}?${params}`)
        return {
          entries:  result.entries,
          total:    result.count,
          page:     1,
          pages:    1,
          pageSize: result.count,
        } satisfies AuditQueryResult
      }

      // General paginated query
      const params = new URLSearchParams()
      if (search.trim())     params.set('search',     search.trim())
      if (entityType)        params.set('entityType',  entityType)
      if (severity)          params.set('severity',    severity)
      if (actorUid.trim())   params.set('actorUid',    actorUid.trim())
      if (dateFrom)          params.set('dateFrom',    startOfDay(dateFrom).toISOString())
      if (dateTo)            params.set('dateTo',      endOfDay(dateTo).toISOString())
      params.set('page',     String(page))
      params.set('pageSize', String(defaultPageSize))

      return apiFetch<AuditQueryResult>(`/audit?${params}`)
    },
    enabled: initialized && canView,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })

  const handleExport = useCallback(async () => {
    if (!data?.entries?.length) return
    const ts = format(new Date(), 'yyyyMMdd-HHmm')
    await exportToXlsx(data.entries, `audit-log-${ts}.xlsx`)
  }, [data])

  const handleResetFilters = useCallback(() => {
    setSearch('')
    setEntityType(fixedEntityType ?? '')
    setSeverity('')
    setActorUid(fixedActorUid ?? '')
    setDateFrom(subDays(new Date(), 7))
    setDateTo(new Date())
    setPage(1)
  }, [fixedEntityType, fixedActorUid])

  // ── Access denied
  if (initialized && !canView) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
        <ShieldOff className="w-9 h-9 opacity-40" />
        <p className="text-sm font-medium">You do not have permission to view audit logs.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
          {data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {data.total.toLocaleString()} total entr{data.total === 1 ? 'y' : 'ies'}
              {data.total > data.pageSize && ` — page ${data.page} of ${data.pages}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={!data?.entries?.length}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export XLSX
          </Button>
        </div>
      </div>

      {/* ── Filters — hidden when fixed entity / actor is provided */}
      {!fixedEntityType && !fixedEntityId && !fixedActorUid && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border">

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search action, entity, actor…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-8 h-9 text-sm"
            />
          </div>

          {/* Entity type */}
          <Select
            value={entityType || '__all__'}
            onValueChange={(v) => { setEntityType(v === '__all__' ? '' : v); setPage(1) }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All entity types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All entity types</SelectItem>
              {AUDIT_ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Severity */}
          <Select
            value={severity || '__all__'}
            onValueChange={(v) => { setSeverity(v === '__all__' ? '' : v as Severity); setPage(1) }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All severities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>

          {/* Actor UID */}
          <Input
            placeholder="Filter by actor UID…"
            value={actorUid}
            onChange={(e) => { setActorUid(e.target.value); setPage(1) }}
            className="h-9 text-sm font-mono"
          />

          {/* Date from */}
          <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 text-sm font-normal justify-start gap-2">
                <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                {dateFrom ? format(dateFrom, 'dd MMM yyyy') : 'From date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateFrom}
                onSelect={(d) => { setDateFrom(d); setDateFromOpen(false); setPage(1) }}
                disabled={{ after: dateTo ?? new Date() }}
              />
            </PopoverContent>
          </Popover>

          {/* Date to */}
          <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 text-sm font-normal justify-start gap-2">
                <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                {dateTo ? format(dateTo, 'dd MMM yyyy') : 'To date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateTo}
                onSelect={(d) => { setDateTo(d); setDateToOpen(false); setPage(1) }}
                disabled={{ before: dateFrom, after: new Date() }}
              />
            </PopoverContent>
          </Popover>

          {/* Reset */}
          <div className="sm:col-span-2 lg:col-span-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              Reset filters
            </Button>
          </div>
        </div>
      )}

      {/* ── Table */}
      {isLoading ? (
        <AuditLogSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
          <p className="text-sm">Failed to load audit logs. Please refresh and try again.</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : !data?.entries?.length ? (
        <div className="flex flex-col items-center justify-center h-32 border rounded-lg bg-muted/20 text-muted-foreground">
          <p className="text-sm font-medium">No audit log entries match the current filters.</p>
          <p className="text-xs mt-1">Try widening the date range or clearing the filters.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[160px] text-xs">Timestamp</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="w-[90px] text-xs">Severity</TableHead>
                  <TableHead className="w-[120px] text-xs">Entity Type</TableHead>
                  <TableHead className="w-[200px] text-xs font-mono">Entity ID</TableHead>
                  <TableHead className="text-xs">Actor</TableHead>
                  <TableHead className="w-[100px] text-xs">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.entries.map((entry) => {
                  const severityConfig = AUDIT_SEVERITY_CONFIG[entry.severity]
                  const hasMetadata =
                    entry.metadata &&
                    (entry.metadata.before || entry.metadata.after ||
                     (entry.metadata.changes?.length ?? 0) > 0 ||
                     entry.metadata.context)

                  return (
                    <>
                      <TableRow
                        key={entry.id}
                        className="font-mono text-xs hover:bg-muted/30 align-top"
                      >
                        <TableCell className="text-muted-foreground whitespace-nowrap py-2.5">
                          {format(new Date(entry.createdAt), 'dd MMM yy HH:mm:ss')}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span className="font-medium text-foreground">{entry.action}</span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${severityConfig.badgeClass}`}
                          >
                            {severityConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-muted-foreground">
                          {entry.entityType}
                        </TableCell>
                        <TableCell className="py-2.5 text-muted-foreground">
                          <span
                            className="truncate block max-w-[180px]"
                            title={entry.entityId}
                          >
                            {entry.entityId}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-muted-foreground">
                          <span
                            className="truncate block max-w-[180px]"
                            title={entry.actorUid}
                          >
                            {entry.actorUid === 'anonymous'
                              ? <span className="italic">anonymous</span>
                              : entry.actorUid}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {entry.actorRole}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {hasMetadata && <MetadataDiffRow key={`${entry.id}-meta`} row={entry} />}
                    </>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}

      {/* ── Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Showing {((data.page - 1) * data.pageSize) + 1}–
            {Math.min(data.page * data.pageSize, data.total)} of {data.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page <= 1 || isFetching}
            >
              Previous
            </Button>
            <span className="text-muted-foreground tabular-nums">
              {data.page} / {data.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={data.page >= data.pages || isFetching}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}