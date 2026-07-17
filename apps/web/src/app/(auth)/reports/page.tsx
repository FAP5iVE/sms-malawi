/**
 * apps/web/src/app/(auth)/reports/page.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (tab wiring + export affordance)
 * [R-PHASE]: R14 — Analytics & Reports Domain
 * [PURPOSE]: The page's chart panels are sound and are left alone. Four
 *   things were not:
 *
 *   1. Seven report hooks (useSchoolReport, useFinanceReport,
 *      useLibraryReport, useHRReport, useAcademicReport, useExamOfficerReport,
 *      useStudentReport) were fully built, backed by real routes, and had NO
 *      consumer anywhere in the app — only useAdminReport and useAuditLog were
 *      ever called. Each is now wired into a real Summary tab for the role
 *      whose route it serves, so every role's report actually reaches a screen.
 *
 *   2. `report.export` is the one permission granted to all nine roles, and it
 *      had no implementation at any layer — the page imported a `Download`
 *      icon and never rendered it. Every panel with tabular data now registers
 *      that data with an export context, and the header renders a real,
 *      permission-gated Download button that produces a genuine CSV via
 *      W/lib/csv.ts. Whether the button appears is decided by
 *      GET /analytics/capabilities — i.e. by ROLE_PERMISSIONS itself — not by
 *      a client-side role list that can drift from it.
 *
 *   3. analyticsService.getAcademicMarksDistribution() and
 *      getManebCandidateList() were likewise fully built, role-gated, and
 *      unreachable. Both are now wired into the academic and exam_officer tabs.
 *
 *   4. `const CURRENT_YEAR = '2025/2026'` was a hardcoded literal. It is now
 *      read from SystemSettings (current_academic_year / current_term, both
 *      isPublic) — the same source R14's routes default from, so the page and
 *      the API agree on what "now" is and the school does not silently keep
 *      reporting 2025/2026 forever after it rolls over.
 *
 *   Also corrects the budget-vs-actual chart's `dataKey="department"` to
 *   `"category"`: ApiBudgetVsActualRow's key field is the ExpenseCategory join
 *   key, not the free-text department that never matched an expense (R14,
 *   analyticsService.ts + schema.prisma).
 * [DEPENDS ON]: W/hooks/useAnalytics.ts, W/hooks/useReports.ts, W/lib/csv.ts,
 *   W/hooks/useSettings.ts
 */
'use client'
import {
  useState, useEffect, useRef, useMemo, useCallback, useContext, createContext,
} from 'react'
import { RoleGuard }         from '@/components/shared/RoleGuard'
import { PlacementAnalyticsPanel } from '@/components/placements/PlacementAnalyticsPanel'
import { chartColorAt } from '@/lib/chartPalette'
import { useAuthStore }      from '@/store/authStore'
import { usePublicSettings } from '@/hooks/useSettings'
import { SETTING_KEYS }      from '@shared/types/settings'
import { downloadCsv, csvFilename } from '@/lib/csv'
import type { CsvColumn }    from '@/lib/csv'
import {
  useAdminLoginTrend, useAdminActivityHeatmap, useAdminEntityActivity,
  useAdminActionBreakdown, useAdminAuditVolumeTrend,
} from '@/hooks/useAnalytics'
import {
  useSchoolPerformanceTrend, useClassComparison, useSubjectComparison,
  useTeacherEffectiveness, useEnrollmentTrend, useHighRankFinancialSummary,
  useAttendanceSummary,
} from '@/hooks/useAnalytics'
import {
  useFinanceCollectionByDay, useFinanceCollectionByMonth,
  useFinanceOutstandingByClass, useFinanceExpenseBreakdown,
  useFinanceBudgetVsActual, useFinanceCashFlow, useFinancePayrollTrend,
  useScholarshipSummary,
} from '@/hooks/useAnalytics'
import {
  useLibraryBorrowingTrend, useLibraryInventoryHealth,
  useLibraryTopBorrowed, useLibraryDigitalStats,
} from '@/hooks/useAnalytics'
import {
  useApplicationsFunnel, useApplicationTrend, useEnrollmentByForm,
} from '@/hooks/useAnalytics'
import {
  useAcademicSubjectPerformance, useAcademicAssignmentCompletion,
  useAcademicMarksDistribution,
} from '@/hooks/useAnalytics'
import {
  useStudentPerformanceTrend, useStudentSubjectBreakdown, useStudentFeeStatement,
  useOwnAttendance,
} from '@/hooks/useAnalytics'
import {
  useManebSchoolStats, useManebCandidates,
} from '@/hooks/useAnalytics'
import {
  useHRStaffByDepartment, useHRLeaveByType, useHRLeaveTrend,
} from '@/hooks/useAnalytics'
import { useReportCapabilities } from '@/hooks/useAnalytics'
import {
  useAdminReport, useAuditLog,
  useSchoolReport, useFinanceReport, useLibraryReport, useHRReport,
  useAcademicReport, useExamOfficerReport, useStudentReport,
} from '@/hooks/useReports'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend,
  ComposedChart, ReferenceLine,
} from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import {
  TrendingUp, TrendingDown, BookOpen, Users, DollarSign, ShieldCheck,
  BarChart2, FileText, GraduationCap, Activity, AlertTriangle,
  ArrowUpRight, ArrowDownRight, ChevronRight, Download,
} from 'lucide-react'
import type {
  ApiLoginTrendPoint, ApiCategoryBreakdown, ApiClassPerformanceStat,
  ApiSubjectAverageStat, ApiTeacherEffectivenessRow, ApiEnrollmentTrendPoint,
  ApiApplicationFunnelStage, ApiLibraryInventoryHealth, ApiTopBorrowedBook,
  ApiStudentPerformancePoint, ApiStudentSubjectScore, ApiStudentFeeStatement,
  ApiManebSchoolStat, ApiCashFlowRow, ApiBudgetVsActualRow,
  ApiAssignmentCompletionRow, ApiTimeSeriesPoint,
  ApiAttendanceSummaryRow, ApiScholarshipSummaryRow, ApiMarksDistributionBucket,
  ApiAcademicSubjectPerformanceRow,
  ApiSchoolPerformanceTrendPoint, ApiOutstandingByClassRow,
  ApiManebResultSummary, ApiAcademicClassSummary, ApiAuditLogEntry,
} from '@shared/types/api'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────


/**
 * [R14] Recharts hands a Tooltip formatter / Pie label its value as its own
 * ValueType (string | number | array), never a bare `number` — so annotating
 * the callback param `(v: number)` does not narrow it, it simply fails to
 * typecheck against the prop. These coerce at the boundary instead.
 */
function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function mwk(value: unknown): string {
  return `MWK ${num(value).toLocaleString()}`
}

/**
 * [R14] How many prior academic years the multi-year performance trend spans.
 * The years themselves are DERIVED from the school's configured current year
 * (below), never listed as literals — a hardcoded ['2023/2024', '2024/2025',
 * '2025/2026'] silently stops meaning "the last three years" the moment the
 * school rolls over.
 */
const TREND_YEARS_BACK = 2

/** "2025/2026" → ["2023/2024", "2024/2025", "2025/2026"]. */
function recentAcademicYears(currentYear: string, yearsBack: number): string[] {
  const start = Number.parseInt(currentYear.split('/')[0] ?? '', 10)
  if (Number.isNaN(start)) return [currentYear]

  const years: string[] = []
  for (let offset = yearsBack; offset >= 0; offset -= 1) {
    const from = start - offset
    years.push(`${from}/${from + 1}`)
  }
  return years
}

// ─── EXPORT CONTEXT (R14 — report.export) ────────────────────────────────────

/**
 * What the currently-visible panel offers for export.
 *
 * The Download button lives in the page header, but only the active panel
 * knows what rows it is actually showing — so panels register their table here
 * and the header renders a button that exports precisely what the user is
 * looking at, rather than some fixed guess at what the tab "probably" holds.
 *
 * `download` is a closure rather than raw rows + columns so each panel keeps
 * its own row type: type erasure happens at the boundary, not inside the panel.
 */
interface ExportRegistration {
  label: string
  hasRows: boolean
  download: () => boolean
}

interface ExportContextValue {
  registration: ExportRegistration | null
  register: (registration: ExportRegistration) => void
  clear: () => void
}

const ExportContext = createContext<ExportContextValue>({
  registration: null,
  register: () => undefined,
  clear: () => undefined,
})

/**
 * Registers the calling panel's table as the page's current export target.
 *
 * `columns` are held in a ref rather than an effect dependency on purpose:
 * panels declare them inline, so a fresh array identity arrives on every
 * render and depending on it would re-register (and therefore setState) every
 * render — an infinite loop. `rows` comes from TanStack Query and IS reference
 * -stable between renders, so it is a real dependency.
 */
function useExportable<T>(
  label: string,
  rows: readonly T[] | undefined,
  columns: readonly CsvColumn<T>[],
): void {
  const { register, clear } = useContext(ExportContext)

  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const hasRows = (rows?.length ?? 0) > 0

  useEffect(() => {
    register({
      label,
      hasRows,
      download: () => downloadCsv(csvFilename(label), rowsRef.current ?? [], columnsRef.current),
    })
    return clear
  }, [register, clear, label, hasRows])
}

/** The header's Download button — rendered only when the caller actually holds
 *  report.export, as reported by the permission matrix itself. */
function ExportButton() {
  const { registration } = useContext(ExportContext)
  const { data: capabilities } = useReportCapabilities()
  const [message, setMessage] = useState<string | null>(null)

  if (!capabilities?.canExport) return null

  const disabled = !registration?.hasRows

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          if (!registration) return
          setMessage(registration.download() ? null : 'Nothing to export on this tab.')
        }}
        disabled={disabled}
        title={disabled ? 'This tab has no exportable data yet' : `Export ${registration?.label} as CSV`}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-base bg-surface text-brand-navy transition-colors hover:bg-base disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </button>
      {message && <p role="alert" className="text-xs text-brand-coral">{message}</p>}
    </div>
  )
}

const ROLE_TABS: Record<string, { id: string; label: string; icon: React.ReactNode }[]> = {
  admin: [
    { id: 'overview',  label: 'Overview',    icon: <Activity className="w-4 h-4" /> },
    { id: 'security',  label: 'Security',    icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'audit',     label: 'Audit Log',   icon: <FileText className="w-4 h-4" /> },
  ],
  high_rank: [
    { id: 'performance', label: 'Performance',   icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'classes',     label: 'Classes',       icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'teachers',    label: 'Teachers',      icon: <Users className="w-4 h-4" /> },
    { id: 'enrollment',  label: 'Enrollment',    icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'attendance',  label: 'Attendance',    icon: <Activity className="w-4 h-4" /> },
    { id: 'finance',     label: 'Finance',       icon: <DollarSign className="w-4 h-4" /> },
    { id: 'placements',  label: 'Placements',    icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'summary',     label: 'Summary',       icon: <FileText className="w-4 h-4" /> },
  ],
  finance: [
    { id: 'collection', label: 'Fee Collection', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'outstanding', label: 'Outstanding',   icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'expenses',   label: 'Expenses',       icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'cashflow',   label: 'Cash Flow',      icon: <Activity className="w-4 h-4" /> },
    { id: 'payroll',    label: 'Payroll',        icon: <DollarSign className="w-4 h-4" /> },
    { id: 'scholarships', label: 'Scholarships', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'summary',    label: 'Summary',        icon: <FileText className="w-4 h-4" /> },
  ],
  library: [
    { id: 'overview',  label: 'Overview',     icon: <BookOpen className="w-4 h-4" /> },
    { id: 'borrowing', label: 'Borrowing',    icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'digital',   label: 'Digital',      icon: <FileText className="w-4 h-4" /> },
    { id: 'summary',   label: 'Summary',      icon: <Activity className="w-4 h-4" /> },
  ],
  lower_rank: [
    { id: 'applications', label: 'Applications', icon: <FileText className="w-4 h-4" /> },
    { id: 'enrollment',   label: 'Enrollment',   icon: <Users className="w-4 h-4" /> },
    { id: 'attendance',   label: 'Attendance',   icon: <Activity className="w-4 h-4" /> },
  ],
  academic: [
    { id: 'subjects',     label: 'Subjects',     icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'assignments',  label: 'Assignments',  icon: <FileText className="w-4 h-4" /> },
    { id: 'marks',        label: 'Marks',        icon: <Activity className="w-4 h-4" /> },
    { id: 'attendance',   label: 'Attendance',   icon: <Users className="w-4 h-4" /> },
    { id: 'summary',      label: 'My Classes',   icon: <GraduationCap className="w-4 h-4" /> },
  ],
  exam_officer: [
    { id: 'maneb',        label: 'MANEB',        icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'candidates',   label: 'Candidates',   icon: <Users className="w-4 h-4" /> },
    { id: 'subjects',     label: 'Subjects',     icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'marks',        label: 'Marks',        icon: <Activity className="w-4 h-4" /> },
    { id: 'placements',   label: 'Placements',   icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'summary',      label: 'Summary',      icon: <FileText className="w-4 h-4" /> },
  ],
  hr: [
    { id: 'staffing',  label: 'Staffing',     icon: <Users className="w-4 h-4" /> },
    { id: 'leave',     label: 'Leave',        icon: <Activity className="w-4 h-4" /> },
    { id: 'summary',   label: 'Summary',      icon: <FileText className="w-4 h-4" /> },
  ],
  student: [
    { id: 'performance', label: 'Performance', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'subjects',    label: 'Subjects',    icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'attendance',  label: 'Attendance',  icon: <Activity className="w-4 h-4" /> },
    { id: 'fees',        label: 'Fees',        icon: <DollarSign className="w-4 h-4" /> },
    { id: 'summary',     label: 'Results',     icon: <FileText className="w-4 h-4" /> },
  ],
}

// ─── SHARED UI COMPONENTS ────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, trend, warn = false,
}: {
  label: string; value: string | number; sub?: string
  trend?: 'up' | 'down' | null; warn?: boolean
}) {
  return (
    <div className={`bg-surface border rounded-2xl p-5 flex flex-col gap-1 ${warn ? 'border-brand-coral/40' : 'border-base'}`}>
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold font-heading ${warn ? 'text-brand-coral' : 'text-brand-navy'}`}>{value}</p>
      {(sub || trend) && (
        <div className="flex items-center gap-1 mt-0.5">
          {trend === 'up'   && <ArrowUpRight   className="w-3.5 h-3.5 text-brand-teal" />}
          {trend === 'down' && <ArrowDownRight className="w-3.5 h-3.5 text-brand-coral" />}
          {sub && <span className="text-xs text-muted">{sub}</span>}
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-base rounded-2xl p-5 ${className}`}>
      <h3 className="font-heading font-semibold text-brand-navy text-sm mb-4">{title}</h3>
      {children}
    </div>
  )
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-brand-teal">{icon}</span>
      <h2 className="font-heading font-bold text-brand-navy text-base">{title}</h2>
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="bg-surface border border-base rounded-2xl p-5 animate-pulse">
      <div className="h-4 w-40 bg-base rounded mb-4" />
      <div className="h-40 bg-base rounded" />
    </div>
  )
}

function EmptyState({ message = 'No data available' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted gap-2">
      <BarChart2 className="w-8 h-8 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function RoleTabs({
  role, active, onChange,
}: {
  role: string; active: string; onChange: (id: string) => void
}) {
  const tabs = ROLE_TABS[role] ?? []
  return (
    <div role="tablist" aria-label="Report sections" className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
            active === t.id
              ? 'bg-brand-navy text-white'
              : 'text-muted hover:bg-base hover:text-brand-navy'
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── ADMIN PANELS ────────────────────────────────────────────────────────────

function AdminOverviewPanel() {
  const { data: volumeRaw, isLoading: vLoading } = useAdminAuditVolumeTrend(30)
  const { data: entityRaw, isLoading: eLoading } = useAdminEntityActivity(30)
  const { data: adminBase }                       = useAdminReport()
  const volume  = volumeRaw  as ApiTimeSeriesPoint[]        | undefined
  const entity  = entityRaw  as ApiCategoryBreakdown[]      | undefined
  const base    = adminBase  as { totalStudents: number; activeStudents: number; totalStaff: number; totalInvoices: number; paidInvoices: number; totalExams: number } | undefined

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Students"  value={base?.totalStudents  ?? '—'} />
        <KpiCard label="Active Students" value={base?.activeStudents ?? '—'} trend="up" />
        <KpiCard label="Active Staff"    value={base?.totalStaff     ?? '—'} />
        <KpiCard label="Total Invoices"  value={base?.totalInvoices  ?? '—'} />
        <KpiCard label="Paid Invoices"   value={base?.paidInvoices   ?? '—'} trend="up" />
        <KpiCard label="Total Exams"     value={base?.totalExams     ?? '—'} />
      </div>

      {vLoading ? <SkeletonChart /> : (
        <ChartCard title="System Write Activity — Last 30 Days">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={volume ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="value" stroke={chartColorAt(0)} fill={chartColorAt(0)} fillOpacity={0.08} strokeWidth={2} name="Actions" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {eLoading ? <SkeletonChart /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Activity by Entity Type">
            {entity && entity.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={entity} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [num(v), 'Actions']} />
                  <Bar dataKey="value" fill={chartColorAt(1)} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
          <ChartCard title="Top Action Types">
            <AdminActionBreakdownChart />
          </ChartCard>
        </div>
      )}
    </div>
  )
}

function AdminActionBreakdownChart() {
  const { data: raw, isLoading } = useAdminActionBreakdown(30)
  const data = raw as ApiCategoryBreakdown[] | undefined
  if (isLoading) return <div className="h-40 bg-base rounded animate-pulse" />
  if (!data?.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data.slice(0, 8)} layout="vertical">
        <XAxis type="number" tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={130} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="value" fill={chartColorAt(2)} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function AdminSecurityPanel() {
  const { data: raw, isLoading } = useAdminLoginTrend(30)
  const data = raw as ApiLoginTrendPoint[] | undefined
  const successful = data?.reduce((s, d) => s + d.successful, 0) ?? 0
  const failed     = data?.reduce((s, d) => s + d.failed,     0) ?? 0
  const failRate   = successful + failed > 0 ? Math.round((failed / (successful + failed)) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Successful Logins"  value={successful} trend="up" />
        <KpiCard label="Failed Logins"      value={failed}     warn={failed > 10} />
        <KpiCard label="Failure Rate"       value={`${failRate}%`} warn={failRate > 5} />
        <KpiCard label="Period"             value="30 days" />
      </div>
      {isLoading ? <SkeletonChart /> : (
        <ChartCard title="Login Success vs Failure — Last 30 Days">
          {data && data.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="successful" fill={chartColorAt(1)} radius={[4, 4, 0, 0]} name="Successful" stackId="a" />
                <Bar dataKey="failed"     fill={chartColorAt(3)} radius={[4, 4, 0, 0]} name="Failed"     stackId="a" />
                <ReferenceLine y={0} stroke="var(--color-border)" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No login activity in this period" />}
        </ChartCard>
      )}
      <AdminHeatmapPanel />
    </div>
  )
}

function AdminHeatmapPanel() {
  const { data: raw } = useAdminActivityHeatmap()
  const cells = raw as { hour: number; dayOfWeek: number; count: number }[] | undefined
  if (!cells) return null

  const DAYS  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const maxVal = Math.max(...cells.map((c) => c.count), 1)

  return (
    <ChartCard title="Activity Heatmap — Hour × Day of Week">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs text-center">
          <thead>
            <tr>
              <th className="w-10" />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="font-normal text-muted w-6 pb-1">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, dow) => (
              <tr key={dow}>
                <td className="font-medium text-muted pr-2 text-right">{day}</td>
                {Array.from({ length: 24 }, (_, h) => {
                  const cell = cells.find((c) => c.dayOfWeek === dow && c.hour === h)
                  const intensity = cell ? Math.round((cell.count / maxVal) * 100) : 0
                  return (
                    <td key={h} className="p-px">
                      <div
                        className="w-5 h-5 rounded-sm"
                        style={{ backgroundColor: `rgba(14,138,106,${intensity / 100})`, minHeight: '20px' }}
                        title={`${day} ${h}:00 — ${cell?.count ?? 0} actions`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}

function AdminAuditPanel() {
  const { data: audit } = useAuditLog({ page: 1 })

  useExportable<ApiAuditLogEntry>('Audit Log', audit?.logs, [
    { label: 'Action',    value: (l) => l.action },
    { label: 'Entity',    value: (l) => l.entityType },
    { label: 'Entity ID', value: (l) => l.entityId },
    { label: 'Actor',     value: (l) => l.actorUid },
    { label: 'Role',      value: (l) => l.actorRole },
    { label: 'Time',      value: (l) => l.createdAt },
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{audit?.total ?? 0} total entries</p>
      </div>
      <div className="border border-base rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Action', 'Entity', 'Entity ID', 'Actor', 'Role', 'Time'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-base">
              {audit?.logs.map((log) => (
                <tr key={log.id} className="hover:bg-page transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-brand-teal whitespace-nowrap">{log.action}</td>
                  <td className="px-4 py-3 text-xs">{log.entityType}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{log.entityId.slice(0, 10)}…</td>
                  <td className="px-4 py-3 font-mono text-xs">{log.actorUid.slice(0, 8)}…</td>
                  <td className="px-4 py-3"><span className="text-xs bg-base rounded-lg px-2 py-0.5">{log.actorRole}</span></td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{new Date(log.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── HIGH RANK PANELS ────────────────────────────────────────────────────────

function HighRankPerformancePanel({ academicYear, term }: { academicYear: string; term: number }) {
  // [R14] The trend window is derived from the school's configured current
  // year, not a hardcoded ['2023/2024', '2024/2025', '2025/2026'] literal that
  // stops meaning "the last three years" the moment the school rolls over.
  const years = useMemo(
    () => recentAcademicYears(academicYear, TREND_YEARS_BACK),
    [academicYear],
  )
  const { data: trend, isLoading: tl } = useSchoolPerformanceTrend(years)

  useExportable<ApiSchoolPerformanceTrendPoint>('School Performance Trend', trend, [
    { label: 'Academic Year', value: (t) => t.academicYear },
    { label: 'Term',          value: (t) => t.term },
    { label: 'Pass Rate (%)', value: (t) => t.passRate },
    { label: 'Average',       value: (t) => t.average },
    { label: 'Results',       value: (t) => t.total },
  ])

  const current = trend?.filter((t) => t.academicYear === academicYear && t.term === term)
  const passRate = current?.[0]?.passRate ?? null
  const avgScore = current?.[0]?.average  ?? null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Pass Rate (Term)"   value={passRate !== null ? `${passRate}%` : '—'} trend="up" />
        <KpiCard label="School Avg (Term)"  value={avgScore !== null ? `${avgScore}%` : '—'} />
        <KpiCard label="Students Assessed"  value={current?.[0]?.total ?? '—'} />
        <KpiCard label="Academic Year"      value={academicYear} />
      </div>
      {tl ? <SkeletonChart /> : (
        <ChartCard title="School Pass Rate Trend — All Terms">
          {trend && trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend.map((t) => ({ ...t, label: `${t.academicYear} T${t.term}` }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="passRate" stroke={chartColorAt(1)} strokeWidth={2} dot name="Pass Rate %" />
                <Line type="monotone" dataKey="average"  stroke={chartColorAt(0)} strokeWidth={2} dot name="Average %" />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

function HighRankClassPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data: classes,  isLoading: cl } = useClassComparison(academicYear, term)
  const { data: subjects, isLoading: sl } = useSubjectComparison(academicYear, term)

  useExportable<ApiClassPerformanceStat>(`Class Comparison ${academicYear} Term ${term}`, classes, [
    { label: 'Class',         value: (c) => c.className },
    { label: 'Students',      value: (c) => c.studentCount },
    { label: 'Average',       value: (c) => c.average },
    { label: 'Pass Rate (%)', value: (c) => c.passRate },
  ])

  return (
    <div className="space-y-5">
      {cl ? <SkeletonChart /> : (
        <ChartCard title="Class Comparison — Average Score">
          {classes && classes.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={classes}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="className" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, '']} />
                <Bar dataKey="average"  fill={chartColorAt(0)} radius={[4, 4, 0, 0]} name="Average %" />
                <Bar dataKey="passRate" fill={chartColorAt(1)} radius={[4, 4, 0, 0]} name="Pass Rate %" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
      {sl ? <SkeletonChart /> : (
        <ChartCard title="Subject Average Comparison">
          {subjects && subjects.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={subjects.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="subject" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="average" fill={chartColorAt(2)} radius={[4, 4, 0, 0]} name="Average %" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

function HighRankTeachersPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data: teachers, isLoading } = useTeacherEffectiveness(academicYear, term)

  useExportable<ApiTeacherEffectivenessRow>(`Teacher Effectiveness ${academicYear} Term ${term}`, teachers, [
    { label: 'Teacher',        value: (t) => t.teacherName },
    { label: 'Department',     value: (t) => t.department },
    { label: 'Subjects',       value: (t) => t.subjectCount },
    { label: 'Classes',        value: (t) => t.classesCount },
    { label: 'Avg Score',      value: (t) => t.avgStudentScore },
    { label: 'Avg Pass Rate',  value: (t) => t.avgPassRate },
  ])

  return (
    <div className="space-y-5">
      {isLoading ? <SkeletonChart /> : (
        <>
          <ChartCard title="Teacher Effectiveness — Student Average Score">
            {teachers && teachers.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(180, teachers.length * 36)}>
                <BarChart data={teachers} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="teacherName" tick={{ fontSize: 10 }} width={130} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, '']} />
                  <Bar dataKey="avgStudentScore" fill={chartColorAt(4)} radius={[0, 4, 4, 0]} name="Avg Student Score %" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
          {teachers && teachers.length > 0 && (
            <div className="border border-base rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-page border-b border-base">
                    {['Teacher', 'Department', 'Classes', 'Avg Score', 'Pass Rate'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-base">
                  {teachers.map((t) => (
                    <tr key={t.teacherUid} className="hover:bg-page">
                      <td className="px-4 py-3 font-medium text-brand-navy">{t.teacherName}</td>
                      <td className="px-4 py-3 text-muted text-xs">{t.department}</td>
                      <td className="px-4 py-3">{t.classesCount}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${t.avgStudentScore >= 50 ? 'text-brand-teal' : 'text-brand-coral'}`}>{t.avgStudentScore}%</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${t.avgPassRate >= 50 ? 'text-brand-teal' : 'text-brand-coral'}`}>{t.avgPassRate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function HighRankEnrollmentPanel() {
  const { data: trendRaw, isLoading: tl } = useEnrollmentTrend(12)
  const trend = trendRaw as ApiEnrollmentTrendPoint[] | undefined

  return (
    <div className="space-y-5">
      {tl ? <SkeletonChart /> : (
        <ChartCard title="Student Enrollment Trend — Last 12 Months">
          {trend && trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="enrolled" fill={chartColorAt(1)} radius={[4, 4, 0, 0]} name="New Enrolled" />
                <Bar dataKey="departed" fill={chartColorAt(3)} radius={[4, 4, 0, 0]} name="Departed" />
                <Line type="monotone" dataKey="net" stroke={chartColorAt(2)} strokeWidth={2} dot={false} name="Net Change" />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

function HighRankFinancePanel({ academicYear }: { academicYear: string }) {
  const { data: cfRaw, isLoading } = useHighRankFinancialSummary(academicYear)
  const cashFlow = cfRaw as ApiCashFlowRow[] | undefined

  return (
    <div className="space-y-5">
      {cashFlow && (
        <div className="grid grid-cols-3 gap-3">
          {cashFlow.map((row) => (
            <KpiCard
              key={row.term}
              label={`Term ${row.term} Net`}
              value={`MWK ${(row.net / 1_000_000).toFixed(1)}M`}
              trend={row.net >= 0 ? 'up' : 'down'}
              warn={row.net < 0}
            />
          ))}
        </div>
      )}
      {isLoading ? <SkeletonChart /> : (
        <ChartCard title="Revenue vs Expenses by Term">
          {cashFlow && cashFlow.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cashFlow.map((r) => ({ ...r, label: `Term ${r.term}` }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue"  fill={chartColorAt(1)} radius={[4, 4, 0, 0]} name="Revenue" />
                <Bar dataKey="expenses" fill={chartColorAt(3)} radius={[4, 4, 0, 0]} name="Expenses" />
                <Bar dataKey="payroll"  fill={chartColorAt(2)} radius={[4, 4, 0, 0]} name="Payroll" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

// ─── FINANCE PANELS ──────────────────────────────────────────────────────────

function FinanceCollectionPanel() {
  const { data: dayRaw,   isLoading: dl } = useFinanceCollectionByDay(30)
  const { data: monthRaw, isLoading: ml } = useFinanceCollectionByMonth(12)
  const dayData   = dayRaw   as ApiTimeSeriesPoint[] | undefined
  const monthData = monthRaw as { month: string; collected: number; cumulative: number }[] | undefined

  const totalDay   = dayData?.reduce((s, d) => s + d.value, 0)   ?? 0
  const totalMonth = monthData?.reduce((s, d) => s + d.collected, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Last 30 Days"   value={`MWK ${totalDay.toLocaleString()}`}   trend="up" />
        <KpiCard label="Last 12 Months" value={`MWK ${totalMonth.toLocaleString()}`} />
        <KpiCard label="Daily Average"  value={`MWK ${Math.round(totalDay / 30).toLocaleString()}`} />
        <KpiCard label="Currency"       value="MWK" />
      </div>
      {dl ? <SkeletonChart /> : (
        <ChartCard title="Daily Fee Collection — Last 30 Days">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dayData ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), 'Collected']} />
              <Bar dataKey="value" fill={chartColorAt(1)} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
      {ml ? <SkeletonChart /> : (
        <ChartCard title="Monthly Collection & Cumulative — Last 12 Months">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={monthData ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left"  tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar      yAxisId="left"  dataKey="collected"  fill={chartColorAt(1)} radius={[4, 4, 0, 0]} name="Monthly" />
              <Line     yAxisId="right" dataKey="cumulative" stroke={chartColorAt(2)} strokeWidth={2} dot={false} name="Cumulative" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  )
}

function FinanceOutstandingPanel({ academicYear, term }: { academicYear: string; term?: number }) {
  const { data: rows, isLoading } = useFinanceOutstandingByClass(academicYear, term)
  const total = rows?.reduce((s, r) => s + r.outstanding, 0) ?? 0

  useExportable<ApiOutstandingByClassRow>(`Outstanding Balances ${academicYear}`, rows, [
    { label: 'Class',             value: (r) => r.className },
    { label: 'Students Owing',    value: (r) => r.studentCount },
    { label: 'Outstanding (MWK)', value: (r) => r.outstanding },
  ])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Total Outstanding" value={`MWK ${total.toLocaleString()}`} warn={total > 0} />
        <KpiCard label="Classes Affected"  value={rows?.filter((r) => r.outstanding > 0).length ?? 0} />
      </div>
      {isLoading ? <SkeletonChart /> : (
        <ChartCard title="Outstanding Balance by Class">
          {rows && rows.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rows} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="className" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), 'Outstanding']} />
                  <Bar dataKey="outstanding" fill={chartColorAt(3)} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 border border-base rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-page border-b border-base">
                    {['Class', 'Students', 'Outstanding'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted uppercase">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-base">
                    {rows.map((r) => (
                      <tr key={r.classId} className="hover:bg-page">
                        <td className="px-4 py-2 font-medium">{r.className}</td>
                        <td className="px-4 py-2 text-muted">{r.studentCount}</td>
                        <td className="px-4 py-2 font-bold text-brand-coral">MWK {r.outstanding.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <EmptyState message="No outstanding balances" />}
        </ChartCard>
      )}
    </div>
  )
}

function FinanceExpensesPanel({ academicYear, term }: { academicYear: string; term?: number }) {
  const { data: expenses, isLoading: el } = useFinanceExpenseBreakdown(academicYear, term)
  const { data: budgets,  isLoading: bl } = useFinanceBudgetVsActual(academicYear, term)

  useExportable<ApiBudgetVsActualRow>(`Budget vs Actual ${academicYear}`, budgets, [
    { label: 'Category',        value: (r) => r.category },
    { label: 'Allocated (MWK)', value: (r) => r.allocated },
    { label: 'Spent (MWK)',     value: (r) => r.spent },
    { label: 'Utilisation (%)', value: (r) => r.utilisation },
  ])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {el ? <SkeletonChart /> : (
          <ChartCard title="Expense Breakdown by Category">
            {expenses && expenses.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={expenses} dataKey="value" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={(p: PieLabelRenderProps) => `${p.name ?? ''} ${Math.round((p.percent ?? 0) * 100)}%`} labelLine fontSize={10}>
                    {expenses.map((_, i) => <Cell key={i} fill={chartColorAt(i)} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
        )}
        {bl ? <SkeletonChart /> : (
          <ChartCard title="Budget vs Actual by Category">
            {budgets && budgets.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={budgets} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                  {/* [R14] Was dataKey="department" — a field that exists on Budget
                      but not on Expense, and therefore never joined. The row's key
                      is now the ExpenseCategory it is actually budgeted against. */}
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={110} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="allocated" fill={chartColorAt(0)} radius={[0, 4, 4, 0]} name="Allocated" />
                  <Bar dataKey="spent"     fill={chartColorAt(2)} radius={[0, 4, 4, 0]} name="Spent" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
        )}
      </div>
    </div>
  )
}

function FinanceCashFlowPanel({ academicYear }: { academicYear: string }) {
  const { data: rows, isLoading } = useFinanceCashFlow(academicYear)

  useExportable<ApiCashFlowRow>(`Cash Flow ${academicYear}`, rows, [
    { label: 'Term',           value: (r) => r.term },
    { label: 'Revenue (MWK)',  value: (r) => r.revenue },
    { label: 'Expenses (MWK)', value: (r) => r.expenses },
    { label: 'Payroll (MWK)',  value: (r) => r.payroll },
    { label: 'Net (MWK)',      value: (r) => r.net },
  ])

  return (
    <div className="space-y-5">
      {rows && (
        <div className="grid grid-cols-3 gap-3">
          {rows.map((r) => (
            <KpiCard
              key={r.term}
              label={`Term ${r.term} Net`}
              value={`MWK ${Math.abs(r.net).toLocaleString()}`}
              sub={r.net >= 0 ? 'Surplus' : 'Deficit'}
              trend={r.net >= 0 ? 'up' : 'down'}
              warn={r.net < 0}
            />
          ))}
        </div>
      )}
      {isLoading ? <SkeletonChart /> : (
        <ChartCard title="Cash Flow Statement by Term">
          {rows && rows.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={rows.map((r) => ({ ...r, label: `Term ${r.term}` }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue"  fill={chartColorAt(1)} radius={[4, 4, 0, 0]} name="Revenue" />
                  <Bar dataKey="expenses" fill={chartColorAt(3)} radius={[4, 4, 0, 0]} name="Expenses" />
                  <Bar dataKey="payroll"  fill={chartColorAt(2)} radius={[4, 4, 0, 0]} name="Payroll" />
                  <Line type="monotone" dataKey="net" stroke={chartColorAt(0)} strokeWidth={2} dot name="Net" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-4 border border-base rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-page border-b border-base">
                    {['Term', 'Revenue', 'Expenses', 'Payroll', 'Net'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted uppercase">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-base">
                    {rows.map((r) => (
                      <tr key={r.term}>
                        <td className="px-4 py-2 font-medium">Term {r.term}</td>
                        <td className="px-4 py-2 text-brand-teal">MWK {r.revenue.toLocaleString()}</td>
                        <td className="px-4 py-2 text-brand-coral">MWK {r.expenses.toLocaleString()}</td>
                        <td className="px-4 py-2 text-brand-amber">MWK {r.payroll.toLocaleString()}</td>
                        <td className={`px-4 py-2 font-bold ${r.net >= 0 ? 'text-brand-teal' : 'text-brand-coral'}`}>MWK {r.net.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

function FinancePayrollPanel() {
  const { data: raw, isLoading } = useFinancePayrollTrend(12)
  const data = raw as ApiTimeSeriesPoint[] | undefined
  const total = data?.reduce((s, d) => s + d.value, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Total Payroll (12M)" value={`MWK ${total.toLocaleString()}`} />
        <KpiCard label="Monthly Average"     value={`MWK ${data?.length ? Math.round(total / data.length).toLocaleString() : '—'}`} />
      </div>
      {isLoading ? <SkeletonChart /> : (
        <ChartCard title="Monthly Payroll Cost — Last 12 Months">
          {data && data.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), 'Payroll']} />
                <Area type="monotone" dataKey="value" stroke={chartColorAt(0)} fill={chartColorAt(0)} fillOpacity={0.08} strokeWidth={2} name="Payroll" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

// ─── LIBRARY PANELS ──────────────────────────────────────────────────────────

function LibraryOverviewPanel() {
  const { data: health, isLoading: hl } = useLibraryInventoryHealth()
  const { data: top,    isLoading: tl } = useLibraryTopBorrowed(10)

  useExportable<ApiTopBorrowedBook>('Top Borrowed Books', top, [
    { label: 'Title',      value: (b) => b.title },
    { label: 'Author',     value: (b) => b.author },
    { label: 'Borrowings', value: (b) => b.borrowCount },
  ])

  return (
    <div className="space-y-5">
      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Total Titles"     value={health.totalTitles} />
          <KpiCard label="Available Copies" value={health.availableCopies} trend="up" />
          <KpiCard label="Overdue"          value={health.overdueCount} warn={health.overdueCount > 0} />
          <KpiCard label="Availability"     value={`${health.availabilityRate}%`} />
        </div>
      )}
      {hl && <SkeletonChart />}
      {tl ? <SkeletonChart /> : (
        <ChartCard title="Top 10 Most Borrowed Books">
          {top && top.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="title" tick={{ fontSize: 9 }} width={160} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="borrowCount" fill={chartColorAt(1)} radius={[0, 4, 4, 0]} name="Borrows" />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-1">
                {top.map((b, i) => (
                  <div key={b.bookId} className="flex items-center justify-between py-2 border-b border-base last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-brand-navy text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-brand-navy">{b.title}</p>
                        <p className="text-xs text-muted">{b.author} · {b.category}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-brand-teal">{b.borrowCount}×</span>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

function LibraryBorrowingPanel() {
  const { data: raw, isLoading } = useLibraryBorrowingTrend(12)
  const data = raw as ApiTimeSeriesPoint[] | undefined

  return (
    <div className="space-y-5">
      {isLoading ? <SkeletonChart /> : (
        <ChartCard title="Weekly Borrowing Trend — Last 12 Weeks">
          {data && data.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="value" stroke={chartColorAt(1)} fill={chartColorAt(1)} fillOpacity={0.13} strokeWidth={2} name="Books Issued" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

function LibraryDigitalPanel() {
  const { data: raw, isLoading } = useLibraryDigitalStats()
  const stats = raw as { byType: ApiCategoryBreakdown[]; bySubject: ApiCategoryBreakdown[]; total: number; approvedCount: number } | undefined

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Total Resources" value={stats.total} />
          <KpiCard label="Approved"        value={stats.approvedCount} trend="up" />
        </div>
      )}
      {isLoading ? <SkeletonChart /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="By Resource Type">
            {stats?.byType?.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={stats.byType} dataKey="value" nameKey="category" cx="50%" cy="50%" outerRadius={70}>
                    {stats.byType.map((_, i) => <Cell key={i} fill={chartColorAt(i)} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
          <ChartCard title="By Subject">
            {stats?.bySubject?.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.bySubject} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" fill={chartColorAt(4)} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
        </div>
      )}
    </div>
  )
}

// ─── LOWER RANK PANELS ───────────────────────────────────────────────────────

function LowerRankApplicationsPanel() {
  const { data: funnel, isLoading: fl } = useApplicationsFunnel()
  const { data: trend,  isLoading: tl } = useApplicationTrend(12)

  useExportable<ApiApplicationFunnelStage>('Applications Funnel', funnel, [
    { label: 'Stage', value: (f) => f.stage },
    { label: 'Count', value: (f) => f.count },
  ])

  return (
    <div className="space-y-5">
      {funnel && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {funnel.map((s) => (
            <KpiCard
              key={s.stage}
              label={s.stage}
              value={s.count}
              sub={`${s.pct}%`}
              warn={s.stage === 'Denied'}
            />
          ))}
        </div>
      )}
      {fl ? <SkeletonChart /> : (
        <ChartCard title="Application Funnel">
          {funnel && funnel.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={funnel.filter((s) => s.stage !== 'Denied')}>
                <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" fill={chartColorAt(0)} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
      {tl ? <SkeletonChart /> : (
        <ChartCard title="Monthly Application Submissions — Last 12 Months">
          {trend && trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={trend}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="value" stroke={chartColorAt(1)} fill={chartColorAt(1)} fillOpacity={0.08} strokeWidth={2} name="Applications" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

function LowerRankEnrollmentPanel({ academicYear }: { academicYear: string }) {
  const { data: raw, isLoading } = useEnrollmentByForm(academicYear)
  const rows = raw as { form: number; className: string; studentCount: number }[] | undefined

  return (
    <div className="space-y-5">
      {isLoading ? <SkeletonChart /> : (
        <ChartCard title={`Enrollment by Class — ${academicYear}`}>
          {rows && rows.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={rows}>
                  <XAxis dataKey="className" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="studentCount" fill={chartColorAt(1)} radius={[4, 4, 0, 0]} name="Students" />
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {[1, 2, 3, 4].map((form) => {
                  const total = rows.filter((r) => r.form === form).reduce((s, r) => s + r.studentCount, 0)
                  return <KpiCard key={form} label={`Form ${form}`} value={total} />
                })}
              </div>
            </>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

// ─── ACADEMIC STAFF PANELS ───────────────────────────────────────────────────

function AcademicSubjectsPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data: rows, isLoading } = useAcademicSubjectPerformance(academicYear, term)

  useExportable<ApiAcademicSubjectPerformanceRow>(`Subject Performance ${academicYear} Term ${term}`, rows, [
    { label: 'Subject',       value: (r) => r.subject },
    { label: 'Class',         value: (r) => r.className },
    { label: 'Students',      value: (r) => r.studentCount },
    { label: 'Average',       value: (r) => r.average },
    { label: 'Pass Rate (%)', value: (r) => r.passRate },
  ])

  return (
    <div className="space-y-5">
      {isLoading ? <SkeletonChart /> : (
        <>
          <ChartCard title="Subject Performance — My Classes">
            {rows && rows.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={rows.slice(0, 12)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="subject" tick={{ fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="average"  fill={chartColorAt(0)} radius={[4, 4, 0, 0]} name="Average %" />
                  <Bar dataKey="passRate" fill={chartColorAt(1)} radius={[4, 4, 0, 0]} name="Pass Rate %" />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState message="No finalised exam data for this term" />}
          </ChartCard>
          {rows && rows.length > 0 && (
            <div className="border border-base rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-page border-b border-base">
                  {['Subject', 'Class', 'Students', 'Avg Score', 'Pass Rate'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-base">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-page">
                      <td className="px-4 py-2 font-medium text-brand-navy">{r.subject}</td>
                      <td className="px-4 py-2 text-muted text-xs">{r.className}</td>
                      <td className="px-4 py-2">{r.studentCount}</td>
                      <td className="px-4 py-2 font-bold text-brand-navy">{r.average}%</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.passRate >= 50 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{r.passRate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AcademicAssignmentsPanel({ academicYear }: { academicYear: string }) {
  const { data: rows, isLoading } = useAcademicAssignmentCompletion(academicYear)

  useExportable<ApiAssignmentCompletionRow>(`Assignment Completion ${academicYear}`, rows, [
    { label: 'Assignment',      value: (a) => a.title },
    { label: 'Subject',         value: (a) => a.subject },
    { label: 'Due',             value: (a) => a.dueDate },
    { label: 'Submitted',       value: (a) => a.submitted },
    { label: 'Total',           value: (a) => a.total },
    { label: 'Completion (%)',  value: (a) => a.completionRate },
  ])

  return (
    <div className="space-y-5">
      {isLoading ? <SkeletonChart /> : (
        <ChartCard title="Assignment Completion Rates">
          {rows && rows.length > 0 ? (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.assignmentId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sm font-medium text-brand-navy truncate">{r.title}</p>
                      <span className="text-xs text-muted ml-2 whitespace-nowrap">{r.submitted}/{r.total}</span>
                    </div>
                    <p className="text-xs text-muted mb-1">{r.subject} · Due {r.dueDate}</p>
                    <div className="h-2 bg-base rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${r.completionRate >= 80 ? 'bg-brand-teal' : r.completionRate >= 50 ? 'bg-brand-amber' : 'bg-brand-coral'}`}
                        style={{ width: `${r.completionRate}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-sm font-bold w-12 text-right ${r.completionRate >= 80 ? 'text-brand-teal' : r.completionRate >= 50 ? 'text-brand-amber' : 'text-brand-coral'}`}>{r.completionRate}%</span>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No assignments found for this year" />}
        </ChartCard>
      )}
    </div>
  )
}

// ─── STUDENT PANELS ──────────────────────────────────────────────────────────

function StudentPerformancePanel({ studentId, academicYear, term }: { studentId: string; academicYear: string; term: number }) {
  const { data: trend,    isLoading: tl } = useStudentPerformanceTrend(studentId)
  const { data: subjects, isLoading: sl } = useStudentSubjectBreakdown(studentId, academicYear, term)

  useExportable<ApiStudentPerformancePoint>('Performance Trend', trend, [
    { label: 'Academic Year',  value: (p) => p.academicYear },
    { label: 'Term',           value: (p) => p.term },
    { label: 'Average',        value: (p) => p.average },
    { label: 'Grade',          value: (p) => p.grade },
    { label: 'Position',       value: (p) => p.position },
    { label: 'Class Total',    value: (p) => p.classTotal },
    { label: 'Attendance (%)', value: (p) => p.attendancePct },
  ])

  const latest = trend?.[trend.length - 1]

  return (
    <div className="space-y-5">
      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Latest Average" value={`${latest.average}%`} trend={latest.passStatus ? 'up' : 'down'} />
          <KpiCard label="Grade"          value={latest.grade} />
          <KpiCard label="Class Position" value={latest.position !== null ? `#${latest.position} of ${latest.classTotal}` : '—'} />
          <KpiCard label="Attendance"     value={`${latest.attendancePct}%`} warn={latest.attendancePct < 80} />
        </div>
      )}
      {tl ? <SkeletonChart /> : (
        <ChartCard title="My Performance Trend">
          {trend && trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend.map((t) => ({ ...t, label: `${t.academicYear} T${t.term}` }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, '']} />
                <Line type="monotone" dataKey="average" stroke={chartColorAt(1)} strokeWidth={2} dot name="Average %" />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState />}
        </ChartCard>
      )}
      {sl ? <SkeletonChart /> : (
        <ChartCard title={`Subject Breakdown — ${academicYear} Term ${term}`}>
          {subjects && subjects.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={subjects}>
                  <XAxis dataKey="subject" tick={{ fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="score" fill={chartColorAt(0)} radius={[4, 4, 0, 0]} name="Score">
                    {subjects.map((s, i) => (
                      <Cell key={i} fill={Number(s.score) / s.maxMark * 100 >= 50 ? chartColorAt(1) : chartColorAt(3)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {subjects.map((s) => (
                  <div key={s.subject} className="bg-page border border-base rounded-xl p-3">
                    <p className="text-xs text-muted truncate">{s.subject}</p>
                    <p className="font-bold text-brand-navy">{s.score}/{s.maxMark}</p>
                    <p className={`text-xs font-semibold ${s.grade === 'F' ? 'text-brand-coral' : 'text-brand-teal'}`}>{s.grade}</p>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState message="No results released for this term" />}
        </ChartCard>
      )}
    </div>
  )
}

function StudentFeesPanel({ studentId }: { studentId: string }) {
  const { data: invoices, isLoading } = useStudentFeeStatement(studentId)

  const totalOwed = invoices?.reduce((s, i) => s + i.balance, 0) ?? 0

  useExportable<ApiStudentFeeStatement>('Fee Statement', invoices, [
    { label: 'Academic Year', value: (i) => i.academicYear },
    { label: 'Term',          value: (i) => i.term },
    { label: 'Total (MWK)',   value: (i) => i.totalAmount },
    { label: 'Paid (MWK)',    value: (i) => i.paidAmount },
    { label: 'Balance (MWK)', value: (i) => i.balance },
    { label: 'Status',        value: (i) => i.status },
    { label: 'Due Date',      value: (i) => i.dueDate },
  ])

  return (
    <div className="space-y-5">
      {invoices && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Total Outstanding" value={`MWK ${totalOwed.toLocaleString()}`} warn={totalOwed > 0} />
          <KpiCard label="Invoices"          value={invoices.length} />
          <KpiCard label="Fully Paid"        value={invoices.filter((i) => i.status === 'PAID').length} trend="up" />
          <KpiCard label="Overdue"           value={invoices.filter((i) => i.status === 'OVERDUE').length} warn />
        </div>
      )}
      {isLoading ? <SkeletonChart /> : (
        <div className="space-y-3">
          {invoices?.map((inv) => (
            <div key={inv.invoiceId} className="bg-surface border border-base rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-brand-navy">{inv.academicYear} — Term {inv.term}</p>
                  <p className="text-xs text-muted">Due {inv.dueDate}</p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  inv.status === 'PAID'    ? 'bg-green-50 text-green-700' :
                  inv.status === 'OVERDUE' ? 'bg-red-50 text-red-700' :
                  inv.status === 'PARTIAL' ? 'bg-amber-50 text-amber-700' :
                  'bg-base text-muted'
                }`}>{inv.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                <div><p className="text-xs text-muted">Total</p><p className="font-bold">MWK {inv.totalAmount.toLocaleString()}</p></div>
                <div><p className="text-xs text-muted">Paid</p><p className="font-bold text-brand-teal">MWK {inv.paidAmount.toLocaleString()}</p></div>
                <div><p className="text-xs text-muted">Balance</p><p className={`font-bold ${inv.balance > 0 ? 'text-brand-coral' : 'text-brand-teal'}`}>MWK {inv.balance.toLocaleString()}</p></div>
              </div>
              {inv.payments.length > 0 && (
                <div className="border-t border-base pt-2 space-y-1">
                  {inv.payments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-muted">
                      <span>{p.method} · {p.paidAt}</span>
                      <span className="font-medium text-brand-navy">MWK {p.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {(!invoices || invoices.length === 0) && <EmptyState message="No invoices found" />}
        </div>
      )}
    </div>
  )
}

// ─── MANEB PANELS ────────────────────────────────────────────────────────────

function ManebAnalyticsPanel({ academicYear }: { academicYear: string }) {
  const { data: stats, isLoading } = useManebSchoolStats(academicYear)

  useExportable<ApiManebSchoolStat>(`MANEB Results ${academicYear}`, stats, [
    { label: 'Exam',          value: (m) => m.examType },
    { label: 'Candidates',    value: (m) => m.total },
    { label: 'Passed',        value: (m) => m.passCount },
    { label: 'Pass Rate (%)', value: (m) => m.passRate },
  ])

  return (
    <div className="space-y-6">
      {isLoading && <SkeletonChart />}
      {stats?.map((stat) => (
        <div key={stat.examType} className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-navy text-white">{stat.examType}</span>
            <span className="text-sm text-muted">{stat.total} candidates</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Total Candidates" value={stat.total} />
            <KpiCard label="Passed"           value={stat.passCount} trend="up" />
            <KpiCard label="Pass Rate"        value={`${stat.passRate}%`} trend={stat.passRate >= 50 ? 'up' : 'down'} warn={stat.passRate < 50} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={`${stat.examType} Grade Distribution`}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stat.gradeDistribution}>
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Students">
                    {stat.gradeDistribution.map((g, i) => (
                      <Cell key={i} fill={['A', 'B'].includes(g.category) ? chartColorAt(1) : g.category === 'U' ? chartColorAt(3) : chartColorAt(2)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title={`${stat.examType} Subject Pass Rates`}>
              {stat.subjectAverages.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stat.subjectAverages.slice(0, 8)} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="subject" tick={{ fontSize: 9 }} width={100} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, 'Pass Rate']} />
                    <Bar dataKey="passRate" radius={[0, 4, 4, 0]} name="Pass Rate %">
                      {stat.subjectAverages.slice(0, 8).map((s, i) => (
                        <Cell key={i} fill={s.passRate >= 50 ? chartColorAt(1) : chartColorAt(3)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState />}
            </ChartCard>
          </div>
        </div>
      ))}
      {!isLoading && (!stats || stats.length === 0) && <EmptyState message="No MANEB records for this academic year" />}
    </div>
  )
}

// ─── HR PANELS ───────────────────────────────────────────────────────────────

function HRStaffingPanel() {
  const { data: depts, isLoading: dl } = useHRStaffByDepartment()

  useExportable<ApiCategoryBreakdown>('Staff by Department', depts, [
    { label: 'Department', value: (d) => d.category },
    { label: 'Staff',      value: (d) => d.value },
  ])

  return (
    <div className="space-y-5">
      {depts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Active Staff"   value={depts.reduce((s, d) => s + d.value, 0)} />
          <KpiCard label="Departments"    value={depts.length} />
          <KpiCard label="Largest Dept."  value={depts[0]?.category ?? '—'} />
          <KpiCard label="Smallest Dept." value={depts[depts.length - 1]?.category ?? '—'} />
        </div>
      )}
      {dl ? <SkeletonChart /> : (
        <ChartCard title="Staff Headcount by Department">
          {depts && depts.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={depts} dataKey="value" nameKey="category" cx="50%" cy="50%" outerRadius={80}>
                    {depts.map((_, i) => <Cell key={i} fill={chartColorAt(i)} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={depts} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" fill={chartColorAt(0)} radius={[0, 4, 4, 0]} name="Staff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState />}
        </ChartCard>
      )}
    </div>
  )
}

function HRLeavePanel() {
  const { data: typeRaw, isLoading: tl } = useHRLeaveByType()
  const { data: trendRaw, isLoading: trl } = useHRLeaveTrend(12)
  const types = typeRaw as ApiCategoryBreakdown[] | undefined
  const trend = trendRaw as { label: string; value: number; value2: number }[] | undefined

  return (
    <div className="space-y-5">
      {tl ? <SkeletonChart /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Leave Days by Type — Current Year">
            {types && types.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={types} dataKey="value" nameKey="category" cx="50%" cy="50%" outerRadius={70}>
                    {types.map((_, i) => <Cell key={i} fill={chartColorAt(i)} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyState />}
          </ChartCard>
          {trl ? <SkeletonChart /> : (
            <ChartCard title="Leave Requests Trend — Last 12 Months">
              {trend && trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={trend}>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="value"  fill={chartColorAt(1)} radius={[4, 4, 0, 0]} name="Approved" />
                    <Bar dataKey="value2" fill={chartColorAt(3)} radius={[4, 4, 0, 0]} name="Rejected" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <EmptyState />}
            </ChartCard>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ROOT PAGE ────────────────────────────────────────────────────────────────

// ─── R14 — NEW PANELS ────────────────────────────────────────────────────────
// Each of these reaches an endpoint that was fully built and role-gated but
// had no screen: the three permissions R14 implements (attendance summary,
// own attendance, scholarship summary), the two zero-consumer analytics
// endpoints (marks distribution, MANEB candidate list), and the seven
// zero-consumer report hooks (one Summary tab per role).

/** report.viewAttendanceSummary — high_rank, lower_rank, academic, hr, exam_officer. */
function AttendanceSummaryPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data, isLoading } = useAttendanceSummary(academicYear, term)

  useExportable<ApiAttendanceSummaryRow>(
    `Attendance ${academicYear} Term ${term}`,
    data?.byClass,
    [
      { label: 'Class',          value: (r) => r.className },
      { label: 'Form',           value: (r) => r.form },
      { label: 'Students',       value: (r) => r.studentCount },
      { label: 'Present',        value: (r) => r.daysPresent },
      { label: 'Absent',         value: (r) => r.daysAbsent },
      { label: 'Late',           value: (r) => r.daysLate },
      { label: 'Attendance (%)', value: (r) => r.attendanceRate },
    ],
  )

  if (isLoading) return <SkeletonChart />
  if (!data || data.byClass.length === 0) return <EmptyState message="No attendance recorded for this term" />

  return (
    <div className="space-y-5">
      <SectionHeader title={`Attendance — ${academicYear} Term ${term}`} icon={<Activity className="w-4 h-4" />} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Attendance Rate" value={`${data.attendanceRate}%`} warn={data.attendanceRate < 85} />
        <KpiCard label="Days Present"    value={data.daysPresent.toLocaleString()} />
        <KpiCard label="Days Absent"     value={data.daysAbsent.toLocaleString()} warn={data.daysAbsent > 0} />
        <KpiCard label="Days Late"       value={data.daysLate.toLocaleString()} />
      </div>
      <ChartCard title="Attendance Rate by Class">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.byClass}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="className" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, 'Attendance']} />
            <ReferenceLine y={85} stroke={chartColorAt(3)} strokeDasharray="4 4" />
            <Bar dataKey="attendanceRate" radius={[4, 4, 0, 0]} name="Attendance %">
              {data.byClass.map((c) => (
                <Cell key={c.classId} fill={c.attendanceRate >= 85 ? chartColorAt(1) : chartColorAt(2)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

/** report.viewOwnAttendance — the student's own record. */
function StudentAttendancePanel({ studentId, academicYear, term }: { studentId: string; academicYear: string; term: number }) {
  const { data, isLoading } = useOwnAttendance(studentId, academicYear, term)

  useExportable('My Attendance', data ? [data] : undefined, [
    { label: 'Academic Year',  value: (r: typeof data & object) => r.academicYear },
    { label: 'Term',           value: (r: typeof data & object) => r.term },
    { label: 'Days Present',   value: (r: typeof data & object) => r.daysPresent },
    { label: 'Days Absent',    value: (r: typeof data & object) => r.daysAbsent },
    { label: 'Days Late',      value: (r: typeof data & object) => r.daysLate },
    { label: 'Total Days',     value: (r: typeof data & object) => r.totalDays },
    { label: 'Attendance (%)', value: (r: typeof data & object) => r.attendanceRate },
  ])

  if (isLoading) return <SkeletonChart />
  if (!data || data.totalDays === 0) return <EmptyState message="No attendance recorded for this term" />

  const breakdown = [
    { category: 'Present', value: data.daysPresent, pct: 0 },
    { category: 'Late',    value: data.daysLate,    pct: 0 },
    { category: 'Absent',  value: data.daysAbsent,  pct: 0 },
  ].filter((b) => b.value > 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Attendance Rate" value={`${data.attendanceRate}%`} warn={data.attendanceRate < 85} />
        <KpiCard label="Present" value={data.daysPresent} />
        <KpiCard label="Late"    value={data.daysLate} />
        <KpiCard label="Absent"  value={data.daysAbsent} warn={data.daysAbsent > 0} />
      </div>
      <ChartCard title={`My Attendance — ${academicYear} Term ${term}`}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={breakdown} dataKey="value" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={(p: PieLabelRenderProps) => `${p.name ?? ''} ${num(p.value)}`} fontSize={11}>
              {breakdown.map((b, i) => (
                <Cell key={b.category} fill={[chartColorAt(1), chartColorAt(2), chartColorAt(3)][i % 3]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)} days`, '']} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

/** report.viewScholarshipSummary — high_rank, finance. */
function FinanceScholarshipsPanel({ academicYear }: { academicYear: string }) {
  const { data, isLoading } = useScholarshipSummary(academicYear)

  useExportable<ApiScholarshipSummaryRow>(
    `Scholarships ${academicYear}`,
    data?.byScholarship,
    [
      { label: 'Scholarship',    value: (r) => r.name },
      { label: 'Discount Type',  value: (r) => r.discountType },
      { label: 'Recipients',     value: (r) => r.recipientCount },
      { label: 'Discount (MWK)', value: (r) => r.totalDiscount },
    ],
  )

  if (isLoading) return <SkeletonChart />
  if (!data || data.byScholarship.length === 0) return <EmptyState message="No active scholarships this year" />

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Active Awards"   value={data.activeScholarships} />
        <KpiCard label="Recipients"      value={data.recipientCount} />
        <KpiCard label="Total Discount"  value={`MWK ${data.totalDiscountMwk.toLocaleString()}`} />
      </div>
      <ChartCard title={`Scholarship Value — ${academicYear}`}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.byScholarship} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), 'Discount']} />
            <Bar dataKey="totalDiscount" fill={chartColorAt(4)} radius={[0, 4, 4, 0]} name="Discount" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="border border-base rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Scholarship', 'Type', 'Recipients', 'Total Discount'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.byScholarship.map((r) => (
                <tr key={r.name} className="border-b border-base last:border-0">
                  <td className="px-4 py-3 font-medium text-brand-navy">{r.name}</td>
                  <td className="px-4 py-3 text-muted">{r.discountType === 'PERCENTAGE' ? 'Percentage' : 'Fixed amount'}</td>
                  <td className="px-4 py-3">{r.recipientCount}</td>
                  <td className="px-4 py-3 font-medium">MWK {r.totalDiscount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/**
 * analyticsService.getAcademicMarksDistribution() — built, role-gated, and
 * unreachable before R14. The route 400s without an examId, so the hook stays
 * disabled until the user picks an exam.
 */
function MarksDistributionPanel() {
  const [examId, setExamId] = useState('')
  const { data: buckets, isLoading } = useAcademicMarksDistribution(examId)

  useExportable<ApiMarksDistributionBucket>('Marks Distribution', buckets, [
    { label: 'Mark Range', value: (b) => b.bucket },
    { label: 'Students',   value: (b) => b.count },
  ])

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-base rounded-2xl p-5 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label htmlFor="marks-exam-id" className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">
            Exam ID
          </label>
          <input
            id="marks-exam-id"
            type="text"
            value={examId}
            onChange={(e) => setExamId(e.target.value.trim())}
            placeholder="Paste an exam ID to see its marks distribution"
            className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
          />
        </div>
      </div>

      {examId.length === 0 ? (
        <EmptyState message="Enter an exam ID to load its marks distribution" />
      ) : isLoading ? (
        <SkeletonChart />
      ) : buckets && buckets.length > 0 ? (
        <ChartCard title="Marks Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={buckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)} students`, '']} />
              <Bar dataKey="count" fill={chartColorAt(0)} radius={[4, 4, 0, 0]} name="Students" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : (
        <EmptyState message="No marks recorded for that exam" />
      )}
    </div>
  )
}

/**
 * analyticsService.getManebCandidateList() — the second built, role-gated,
 * unreachable endpoint. MANEB results reach the system ONLY via ManebRecord
 * import; nothing on this screen sets or grades them.
 */
function ManebCandidatesPanel({ academicYear }: { academicYear: string }) {
  const [examType, setExamType] = useState<'JCE' | 'MSCE' | ''>('')
  const { data: candidates, isLoading } = useManebCandidates(
    academicYear,
    examType === '' ? undefined : examType,
  )

  useExportable<ApiManebResultSummary>(`MANEB Candidates ${academicYear}`, candidates, [
    { label: 'Candidate No', value: (c) => c.candidateNo },
    { label: 'Exam',         value: (c) => c.examType },
    { label: 'Overall Grade', value: (c) => c.overallGrade },
    { label: 'Status',       value: (c) => c.status },
    { label: 'Subjects',     value: (c) => c.subjectGrades.map((g) => `${g.subject}:${g.grade}`).join('; ') },
  ])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionHeader title={`MANEB Candidates — ${academicYear}`} icon={<Users className="w-4 h-4" />} />
        <select
          value={examType}
          onChange={(e) => setExamType(e.target.value as 'JCE' | 'MSCE' | '')}
          aria-label="Filter by exam type"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
        >
          <option value="">All exams</option>
          <option value="JCE">JCE (Form 2)</option>
          <option value="MSCE">MSCE (Form 4)</option>
        </select>
      </div>

      {isLoading ? <SkeletonChart /> : candidates && candidates.length > 0 ? (
        <div className="border border-base rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-page border-b border-base">
                  {['Candidate No', 'Exam', 'Overall', 'Subjects', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.candidateNo} className="border-b border-base last:border-0">
                    <td className="px-4 py-3 font-medium text-brand-navy whitespace-nowrap">{c.candidateNo}</td>
                    <td className="px-4 py-3 text-muted">{c.examType}</td>
                    <td className="px-4 py-3 font-bold">{c.overallGrade ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">{c.subjectGrades.length}</td>
                    <td className="px-4 py-3 text-muted">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <EmptyState message="No MANEB candidates registered for this year" />}
    </div>
  )
}

// ─── SUMMARY PANELS — the seven previously-orphaned useReports hooks ─────────

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return <KpiCard label={label} value={value} />
}

function HighRankSummaryPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data, isLoading } = useSchoolReport(academicYear, term)

  useExportable('School Summary', data?.classStats, [
    { label: 'Class',    value: (c: { name: string }) => c.name },
    { label: 'Students', value: (c: { _count: { students: number } }) => c._count.students },
  ])

  if (isLoading) return <SkeletonChart />
  if (!data) return <EmptyState />

  return (
    <div className="space-y-5">
      <SectionHeader title={`School Summary — ${academicYear} Term ${term}`} icon={<FileText className="w-4 h-4" />} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryStat label="Pass Rate" value={`${data.overall?.passRate ?? 0}%`} />
        <SummaryStat label="Average"   value={data.overall?.average ?? 0} />
        <SummaryStat label="Results"   value={data.overall?.total ?? 0} />
      </div>
      {data.classStats && data.classStats.length > 0 ? (
        <ChartCard title="Class Sizes">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.classStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="_count.students" fill={chartColorAt(0)} radius={[4, 4, 0, 0]} name="Students" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : <EmptyState message="No class statistics for this term" />}
    </div>
  )
}

function FinanceSummaryPanel({ academicYear, term }: { academicYear: string; term?: number }) {
  const { data, isLoading } = useFinanceReport(academicYear, term)

  if (isLoading) return <SkeletonChart />
  if (!data) return <EmptyState />

  return (
    <div className="space-y-5">
      <SectionHeader title={`Fee Collection Summary — ${academicYear}`} icon={<FileText className="w-4 h-4" />} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Collected"   value={`MWK ${(data.collected ?? 0).toLocaleString()}`} />
        <SummaryStat label="Target"      value={`MWK ${(data.target ?? 0).toLocaleString()}`} />
        <KpiCard label="Outstanding" value={`MWK ${(data.outstanding ?? 0).toLocaleString()}`} warn={(data.outstanding ?? 0) > 0} />
        <SummaryStat label="Collection" value={`${data.collectionPct ?? 0}%`} />
      </div>
    </div>
  )
}

function LibrarySummaryPanel() {
  const { data, isLoading } = useLibraryReport()

  if (isLoading) return <SkeletonChart />
  if (!data) return <EmptyState />

  return (
    <div className="space-y-5">
      <SectionHeader title="Library Summary" icon={<Activity className="w-4 h-4" />} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Total Copies"     value={(data.stats?._sum?.totalCopies ?? 0).toLocaleString()} />
        <SummaryStat label="Available"        value={(data.stats?._sum?.availableCopies ?? 0).toLocaleString()} />
        <KpiCard label="Overdue"          value={data.overdueBorrowings?.length ?? 0} warn={(data.overdueBorrowings?.length ?? 0) > 0} />
        <KpiCard label="Pending Approvals" value={data.pendingApprovals ?? 0} warn={(data.pendingApprovals ?? 0) > 0} />
      </div>
    </div>
  )
}

function HRSummaryPanel() {
  const { data, isLoading } = useHRReport()

  useExportable('Staff by Department', data?.staffByDept, [
    { label: 'Department', value: (d: { department: string }) => d.department },
    { label: 'Staff',      value: (d: { _count: number }) => d._count },
  ])

  if (isLoading) return <SkeletonChart />
  if (!data) return <EmptyState />

  return (
    <div className="space-y-5">
      <SectionHeader title="HR Summary" icon={<FileText className="w-4 h-4" />} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryStat label="Active Loans"      value={data.activeLoans} />
        <SummaryStat label="Loan Balance"      value={`MWK ${data.totalLoanBalance.toLocaleString()}`} />
        <KpiCard
          label="Expiring Contracts"
          value={data.expiringContracts}
          sub={`Within ${data.lookaheadDays} days`}
          warn={data.expiringContracts > 0}
        />
      </div>
      {data.staffByDept.length > 0 ? (
        <ChartCard title="Staff by Department">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.staffByDept} layout="vertical">
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="department" tick={{ fontSize: 10 }} width={120} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="_count" fill={chartColorAt(1)} radius={[0, 4, 4, 0]} name="Staff" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : <EmptyState message="No active staff on record" />}
    </div>
  )
}

function AcademicSummaryPanel({ academicYear }: { academicYear: string }) {
  const { data, isLoading } = useAcademicReport(academicYear)

  useExportable<ApiAcademicClassSummary>('My Classes', data?.summaries, [
    { label: 'Class',         value: (c) => c.className },
    { label: 'Form',          value: (c) => c.form },
    { label: 'Results',       value: (c) => c.total },
    { label: 'Pass Rate (%)', value: (c) => c.passRate },
    { label: 'Average',       value: (c) => c.avg },
  ])

  if (isLoading) return <SkeletonChart />
  if (!data || data.summaries.length === 0) {
    return <EmptyState message="You are not assigned as form teacher to any class this year" />
  }

  return (
    <div className="space-y-5">
      <SectionHeader title={`My Classes — ${academicYear}`} icon={<GraduationCap className="w-4 h-4" />} />
      <div className="border border-base rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Class', 'Form', 'Results', 'Pass Rate', 'Average'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.summaries.map((c) => (
                <tr key={c.classId} className="border-b border-base last:border-0">
                  <td className="px-4 py-3 font-medium text-brand-navy">{c.className}</td>
                  <td className="px-4 py-3 text-muted">Form {c.form}</td>
                  <td className="px-4 py-3">{c.total}</td>
                  <td className={`px-4 py-3 font-medium ${c.passRate >= 50 ? 'text-brand-teal' : 'text-brand-coral'}`}>{c.passRate}%</td>
                  <td className="px-4 py-3">{c.avg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ExamOfficerSummaryPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data, isLoading } = useExamOfficerReport(academicYear, term)

  if (isLoading) return <SkeletonChart />
  if (!data) return <EmptyState />

  return (
    <div className="space-y-5">
      <SectionHeader title={`Exam Summary — ${academicYear} Term ${term}`} icon={<FileText className="w-4 h-4" />} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Pending Marks"    value={data.pendingMarks ?? 0} warn={(data.pendingMarks ?? 0) > 0} />
        <SummaryStat label="Approved Results" value={data.approvedResults ?? 0} />
        <SummaryStat label="MANEB Records"    value={data.manebRecords?.length ?? 0} />
      </div>
    </div>
  )
}

function StudentSummaryPanel({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentReport(studentId)

  useExportable('My Results', data?.results, [
    { label: 'Academic Year', value: (r: { academicYear: string }) => r.academicYear },
    { label: 'Term',          value: (r: { term: number }) => r.term },
    { label: 'Average',       value: (r: { average: number }) => r.average },
    { label: 'Grade',         value: (r: { grade: string }) => r.grade },
    { label: 'Position',      value: (r: { position: number | null }) => r.position },
    { label: 'Passed',        value: (r: { passStatus: boolean }) => (r.passStatus ? 'Yes' : 'No') },
  ])

  if (isLoading) return <SkeletonChart />
  if (!data || data.results.length === 0) return <EmptyState message="No released results yet" />

  return (
    <div className="space-y-5">
      <SectionHeader title="My Results" icon={<FileText className="w-4 h-4" />} />
      <div className="border border-base rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Year', 'Term', 'Average', 'Grade', 'Position', 'Result'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={r.id} className="border-b border-base last:border-0">
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{r.academicYear}</td>
                  <td className="px-4 py-3 text-muted">Term {r.term}</td>
                  <td className="px-4 py-3 font-medium text-brand-navy">{r.average}</td>
                  <td className="px-4 py-3 font-bold">{r.grade}</td>
                  <td className="px-4 py-3">{r.position ?? '—'}</td>
                  <td className={`px-4 py-3 font-medium ${r.passStatus ? 'text-brand-teal' : 'text-brand-coral'}`}>
                    {r.passStatus ? 'Pass' : 'Fail'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'finance', 'library', 'hr', 'academic', 'exam_officer', 'student', 'lower_rank']}>
      <ExportProvider>
        <ReportsContent />
      </ExportProvider>
    </RoleGuard>
  )
}

/**
 * [R14] Holds whichever panel is currently on screen, so the header's Export
 * button downloads exactly what the user is looking at. `register` and `clear`
 * are stable identities — useExportable depends on them, and a fresh identity
 * each render would re-register forever.
 */
function ExportProvider({ children }: { children: React.ReactNode }) {
  const [registration, setRegistration] = useState<ExportRegistration | null>(null)

  const register = useCallback((next: ExportRegistration) => setRegistration(next), [])
  const clear    = useCallback(() => setRegistration(null), [])

  return (
    <ExportContext.Provider value={{ registration, register, clear }}>
      {children}
    </ExportContext.Provider>
  )
}

function ReportsContent() {
  const { role, user } = useAuthStore()

  // [R14] The current academic year and term come from SystemSettings — the
  // same source R14's routes default from — not from a hardcoded '2025/2026'.
  // Until they load, no period-scoped query should fire with a wrong guess, so
  // panels needing a year render only once one is known.
  const { data: settings, isLoading: settingsLoading } = usePublicSettings()
  const year = settings?.[SETTING_KEYS.CURRENT_ACADEMIC_YEAR]
  const currentTerm = settings?.[SETTING_KEYS.CURRENT_TERM]

  const [term, setTerm] = useState<number | null>(null)
  useEffect(() => {
    if (currentTerm !== undefined) setTerm((prev) => prev ?? currentTerm)
  }, [currentTerm])

  const [activeTab, setActiveTab] = useState(() => {
    const tabs = ROLE_TABS[role ?? 'student'] ?? []
    return tabs[0]?.id ?? 'overview'
  })

  const studentId = user?.uid ?? ''

  // Admin's panels are period-independent, so they render without waiting.
  const periodReady = year !== undefined && term !== null

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Reports &amp; Analytics</h1>
          <p className="text-sm text-muted mt-0.5">
            {role === 'student' ? 'Your personal academic and financial reports' : 'Analytics dashboard for your role'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={term ?? ''}
            onChange={(e) => setTerm(Number(e.target.value))}
            disabled={term === null}
            aria-label="Select term"
            className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-navy/20 disabled:opacity-50"
          >
            {[1, 2, 3].map((t) => <option key={t} value={t}>Term {t}</option>)}
          </select>
          <ExportButton />
        </div>
      </div>

      {/* ── Tab Bar ── */}
      {(ROLE_TABS[role ?? ''] ?? []).length > 1 && (
        <RoleTabs role={role ?? ''} active={activeTab} onChange={setActiveTab} />
      )}

      {/* ── Admin Panels (period-independent) ── */}
      {role === 'admin' && activeTab === 'overview'  && <AdminOverviewPanel />}
      {role === 'admin' && activeTab === 'security'  && <AdminSecurityPanel />}
      {role === 'admin' && activeTab === 'audit'     && <AdminAuditPanel />}

      {/* Every other role's panels are scoped to an academic year and term. */}
      {role !== 'admin' && !periodReady && (
        settingsLoading
          ? <SkeletonChart />
          : <EmptyState message="The school's current academic year is not configured yet." />
      )}

      {role !== 'admin' && periodReady && (
        <>
          {/* ── High Rank Panels ── */}
          {role === 'high_rank' && activeTab === 'performance' && <HighRankPerformancePanel academicYear={year} term={term} />}
          {role === 'high_rank' && activeTab === 'classes'     && <HighRankClassPanel academicYear={year} term={term} />}
          {role === 'high_rank' && activeTab === 'teachers'    && <HighRankTeachersPanel academicYear={year} term={term} />}
          {role === 'high_rank' && activeTab === 'enrollment'  && <HighRankEnrollmentPanel />}
          {role === 'high_rank' && activeTab === 'attendance'  && <AttendanceSummaryPanel academicYear={year} term={term} />}
          {role === 'high_rank' && activeTab === 'finance'     && <HighRankFinancePanel academicYear={year} />}
          {role === 'high_rank' && activeTab === 'placements'  && <PlacementAnalyticsPanel academicYear={year} />}
          {role === 'high_rank' && activeTab === 'summary'     && <HighRankSummaryPanel academicYear={year} term={term} />}

          {/* ── Finance Panels ── */}
          {role === 'finance' && activeTab === 'collection'   && <FinanceCollectionPanel />}
          {role === 'finance' && activeTab === 'outstanding'  && <FinanceOutstandingPanel academicYear={year} term={term} />}
          {role === 'finance' && activeTab === 'expenses'     && <FinanceExpensesPanel academicYear={year} term={term} />}
          {role === 'finance' && activeTab === 'cashflow'     && <FinanceCashFlowPanel academicYear={year} />}
          {role === 'finance' && activeTab === 'payroll'      && <FinancePayrollPanel />}
          {role === 'finance' && activeTab === 'scholarships' && <FinanceScholarshipsPanel academicYear={year} />}
          {role === 'finance' && activeTab === 'summary'      && <FinanceSummaryPanel academicYear={year} term={term} />}

          {/* ── Library Panels ── */}
          {role === 'library' && activeTab === 'overview'  && <LibraryOverviewPanel />}
          {role === 'library' && activeTab === 'borrowing' && <LibraryBorrowingPanel />}
          {role === 'library' && activeTab === 'digital'   && <LibraryDigitalPanel />}
          {role === 'library' && activeTab === 'summary'   && <LibrarySummaryPanel />}

          {/* ── Lower Rank Panels ── */}
          {role === 'lower_rank' && activeTab === 'applications' && <LowerRankApplicationsPanel />}
          {role === 'lower_rank' && activeTab === 'enrollment'   && <LowerRankEnrollmentPanel academicYear={year} />}
          {role === 'lower_rank' && activeTab === 'attendance'   && <AttendanceSummaryPanel academicYear={year} term={term} />}

          {/* ── Academic Staff Panels ── */}
          {role === 'academic' && activeTab === 'subjects'    && <AcademicSubjectsPanel academicYear={year} term={term} />}
          {role === 'academic' && activeTab === 'assignments' && <AcademicAssignmentsPanel academicYear={year} />}
          {role === 'academic' && activeTab === 'marks'       && <MarksDistributionPanel />}
          {role === 'academic' && activeTab === 'attendance'  && <AttendanceSummaryPanel academicYear={year} term={term} />}
          {role === 'academic' && activeTab === 'summary'     && <AcademicSummaryPanel academicYear={year} />}

          {/* ── Exam Officer Panels ── */}
          {role === 'exam_officer' && activeTab === 'maneb'      && <ManebAnalyticsPanel academicYear={year} />}
          {role === 'exam_officer' && activeTab === 'candidates' && <ManebCandidatesPanel academicYear={year} />}
          {role === 'exam_officer' && activeTab === 'subjects'   && <AcademicSubjectsPanel academicYear={year} term={term} />}
          {role === 'exam_officer' && activeTab === 'marks'      && <MarksDistributionPanel />}
          {role === 'exam_officer' && activeTab === 'placements' && <PlacementAnalyticsPanel academicYear={year} />}
          {role === 'exam_officer' && activeTab === 'summary'    && <ExamOfficerSummaryPanel academicYear={year} term={term} />}

          {/* ── HR Panels ── */}
          {role === 'hr' && activeTab === 'staffing' && <HRStaffingPanel />}
          {role === 'hr' && activeTab === 'leave'    && <HRLeavePanel />}
          {role === 'hr' && activeTab === 'summary'  && <HRSummaryPanel />}

          {/* ── Student Panels ── */}
          {role === 'student' && activeTab === 'performance' && <StudentPerformancePanel studentId={studentId} academicYear={year} term={term} />}
          {role === 'student' && activeTab === 'subjects'    && <StudentSubjectPanel studentId={studentId} academicYear={year} term={term} />}
          {role === 'student' && activeTab === 'attendance'  && <StudentAttendancePanel studentId={studentId} academicYear={year} term={term} />}
          {role === 'student' && activeTab === 'fees'        && <StudentFeesPanel studentId={studentId} />}
          {role === 'student' && activeTab === 'summary'     && <StudentSummaryPanel studentId={studentId} />}
        </>
      )}
    </div>
  )
}

// Standalone wrapper for student subject tab (reuses StudentPerformancePanel's sub-component)
function StudentSubjectPanel({ studentId, academicYear, term }: { studentId: string; academicYear: string; term: number }) {
  const { data: subjectRaw, isLoading } = useStudentSubjectBreakdown(studentId, academicYear, term)
  const subjects = subjectRaw as ApiStudentSubjectScore[] | undefined

  return (
    <div className="space-y-5">
      {isLoading ? <SkeletonChart /> : (
        <ChartCard title={`Subject Breakdown — ${academicYear} Term ${term}`}>
          {subjects && subjects.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={subjects}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="subject" tick={{ fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]} name="Score">
                    {subjects.map((s, i) => (
                      <Cell key={i} fill={(s.score / s.maxMark) * 100 >= 50 ? chartColorAt(1) : chartColorAt(3)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
                {subjects.map((s) => (
                  <div key={s.subject} className="bg-page border border-base rounded-xl p-3">
                    <p className="text-xs text-muted truncate">{s.subject}</p>
                    <p className="font-bold text-lg text-brand-navy">{s.score}/{s.maxMark}</p>
                    <p className={`text-xs font-bold ${s.grade === 'F' ? 'text-brand-coral' : 'text-brand-teal'}`}>{s.grade}</p>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState message="No released results for this term" />}
        </ChartCard>
      )}
    </div>
  )
}