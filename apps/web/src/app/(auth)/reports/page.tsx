/**
 * apps/web/src/app/(auth)/reports/page.tsx
 *
 * Reports for every role. The page owns the role → tab map and the viewing
 * period; the tabs themselves live in two places:
 *
 *   - components/reports/panels/*  — the role reports backed by the
 *     /reporting/<domain> endpoints (KPI strip, findings, attention queue,
 *     charts and tables). Their numbers come from the same server services the
 *     dashboards use, so a dashboard KPI and the report it links to agree.
 *   - the panels below — the long-standing chart panels, kept where they still
 *     show something the newer tabs do not.
 *
 * The active tab is the `?tab=` URL parameter, which is what dashboard KPIs
 * link to (see reportLink). Export (CSV / Excel / PDF report pack) is
 * registered per panel through useExportable and offered by ExportToolbar,
 * which is shown only to roles holding `report.export`. Year and term come from
 * the app-wide viewing period (SystemSettings), never from literals.
 */
'use client'
import { Suspense, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { RoleGuard } from '@/components/shared/RoleGuard'
import type { UserRole } from '@shared/types/roles'
import { SuperUserRoleSwitcher } from '@/components/shared/SuperUserRoleSwitcher'
import { ModuleSurface } from '@/components/shared/ModuleSurface'
import { PlacementAnalyticsPanel } from '@/components/placements/PlacementAnalyticsPanel'
import { AdminSessionsPanel } from '@/components/reports/AdminSessionsPanel'
import { ExecutiveOverviewTab } from '@/components/reports/panels/ExecutivePanels'
import {
  FinanceOverviewTab,
  FinanceAgingTab,
  FinancePaymentsTab,
  ProcurementTab,
  StocktakeTab,
} from '@/components/reports/panels/FinancePanels'
import {
  HrOverviewTab,
  HrWorkforceTab,
  HrLeaveTab,
  HrContractsTab,
  HrLoansTab,
  HrReviewsTab,
} from '@/components/reports/panels/HrPanels'
import { MarkCompletionTab, ExamPipelineTab } from '@/components/reports/panels/ExamPanels'
import {
  LibraryOverviewSection,
  LibraryCirculationTab,
  LibraryFinesTab,
} from '@/components/reports/panels/LibraryPanels'
import { AttendanceReportTab } from '@/components/reports/panels/AttendancePanels'
import { AdmissionsTab, EnrollmentTab } from '@/components/reports/panels/AdmissionsPanels'
import {
  AcademicTeachingTab,
  AcademicAssignmentsTab,
  AcademicStudentsTab,
  AcademicReadinessTab,
} from '@/components/reports/panels/AcademicPanels'
import {
  AdminOverviewSection,
  AdminSecurityTab,
  AdminSessionsReportTab,
  AdminGovernanceTab,
  AdminAdoptionTab,
} from '@/components/reports/panels/AdminPanels'
import {
  StudentOverviewTab,
  StudentProgressTab,
  StudentAssignmentsTab,
  StudentLibraryTab,
  StudentAttendanceTab,
  StudentFeesTab,
} from '@/components/reports/panels/StudentPanels'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { CopyableId } from '@/components/shared/CopyableId'
import { chartColorAt } from '@/lib/chartPalette'
import { useAuthStore } from '@/store/authStore'
import { useViewingPeriod } from '@/hooks/useViewingPeriod'
import { ReportExportProvider, ExportToolbar, useExportable } from '@/components/reports/ui/ReportExport'
import { useReportParam } from '@/components/reports/ui/useReportParams'
import {
  useAdminActivityHeatmap,
  useAdminEntityActivity,
  useAdminActionBreakdown,
  useAdminAuditVolumeTrend,
} from '@/hooks/useAnalytics'
import {
  useSchoolPerformanceTrend,
  useClassComparison,
  useSubjectComparison,
  useTeacherEffectiveness,
  useEnrollmentTrend,
  useHighRankFinancialSummary,
  useAttendanceSummary,
} from '@/hooks/useAnalytics'
import {
  useFinanceCollectionByDay,
  useFinanceCollectionByMonth,
  useFinanceOutstandingByClass,
  useFinanceExpenseBreakdown,
  useFinanceBudgetVsActual,
  useFinanceCashFlow,
  useFinancePayrollTrend,
  useScholarshipSummary,
} from '@/hooks/useAnalytics'
import {
  useLibraryBorrowingTrend,
  useLibraryInventoryHealth,
  useLibraryTopBorrowed,
  useLibraryDigitalStats,
} from '@/hooks/useAnalytics'
import { useApplicationsFunnel } from '@/hooks/useAnalytics'
import { useAcademicSubjectPerformance, useAcademicMarksDistribution } from '@/hooks/useAnalytics'
import { useManebSchoolStats, useManebCandidates } from '@/hooks/useAnalytics'
import { useHRStaffByDepartment } from '@/hooks/useAnalytics'
import {
  useAdminReport,
  useAuditLog,
  useSchoolReport,
  useFinanceReport,
  useAcademicReport,
  useStudentReport,
} from '@/hooks/useReports'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
} from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import {
  TrendingUp,
  BookOpen,
  Users,
  DollarSign,
  ShieldCheck,
  BarChart2,
  FileText,
  GraduationCap,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  Wifi,
} from 'lucide-react'
import type {
  ApiCategoryBreakdown,
  ApiClassPerformanceStat,
  ApiTeacherEffectivenessRow,
  ApiEnrollmentTrendPoint,
  ApiTopBorrowedBook,
  ApiManebSchoolStat,
  ApiCashFlowRow,
  ApiBudgetVsActualRow,
  ApiTimeSeriesPoint,
  ApiScholarshipSummaryRow,
  ApiMarksDistributionBucket,
  ApiAcademicSubjectPerformanceRow,
  ApiSchoolPerformanceTrendPoint,
  ApiOutstandingByClassRow,
  ApiManebResultSummary,
  ApiAcademicClassSummary,
  ApiAuditLogEntry,
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

const I = {
  trend: <TrendingUp className="w-4 h-4" />,
  chart: <BarChart2 className="w-4 h-4" />,
  users: <Users className="w-4 h-4" />,
  grad: <GraduationCap className="w-4 h-4" />,
  activity: <Activity className="w-4 h-4" />,
  money: <DollarSign className="w-4 h-4" />,
  doc: <FileText className="w-4 h-4" />,
  alert: <AlertTriangle className="w-4 h-4" />,
  book: <BookOpen className="w-4 h-4" />,
  shield: <ShieldCheck className="w-4 h-4" />,
  wifi: <Wifi className="w-4 h-4" />,
}

/**
 * Tab ids double as deep-link targets: dashboards link to `/reports?tab=<id>`
 * (see reportLink), so renaming an id here means updating the dashboards.
 */
const ROLE_TABS: Record<string, { id: string; label: string; icon: React.ReactNode }[]> = {
  admin: [
    { id: 'overview', label: 'Overview', icon: I.activity },
    { id: 'security', label: 'Security', icon: I.shield },
    { id: 'sessions', label: 'Sessions', icon: I.wifi },
    { id: 'governance', label: 'Governance', icon: I.doc },
    { id: 'adoption', label: 'Adoption', icon: I.users },
    { id: 'audit', label: 'Audit Log', icon: I.doc },
  ],
  high_rank: [
    { id: 'overview', label: 'Overview', icon: I.activity },
    { id: 'performance', label: 'Performance', icon: I.trend },
    { id: 'classes', label: 'Classes', icon: I.chart },
    { id: 'teachers', label: 'Teachers', icon: I.users },
    { id: 'enrollment', label: 'Enrollment', icon: I.grad },
    { id: 'admissions', label: 'Admissions', icon: I.doc },
    { id: 'attendance', label: 'Attendance', icon: I.activity },
    { id: 'completion', label: 'Exams', icon: I.doc },
    { id: 'finance', label: 'Finance', icon: I.money },
    { id: 'aging', label: 'Receivables', icon: I.alert },
    { id: 'procurement', label: 'Procurement', icon: I.doc },
    { id: 'stocktake', label: 'Stock', icon: I.chart },
    { id: 'workforce', label: 'HR', icon: I.users },
    { id: 'leave', label: 'Leave', icon: I.activity },
    { id: 'contracts', label: 'Contracts', icon: I.alert },
    { id: 'circulation', label: 'Library', icon: I.book },
    { id: 'placements', label: 'Placements', icon: I.grad },
    { id: 'governance', label: 'Governance', icon: I.shield },
    { id: 'summary', label: 'Summary', icon: I.doc },
  ],
  finance: [
    { id: 'overview', label: 'Overview', icon: I.activity },
    { id: 'collection', label: 'Fee Collection', icon: I.trend },
    { id: 'outstanding', label: 'Outstanding', icon: I.alert },
    { id: 'aging', label: 'Aging', icon: I.alert },
    { id: 'payments', label: 'Payments', icon: I.money },
    { id: 'expenses', label: 'Expenses', icon: I.chart },
    { id: 'cashflow', label: 'Cash Flow', icon: I.activity },
    { id: 'payroll', label: 'Payroll', icon: I.money },
    { id: 'scholarships', label: 'Scholarships', icon: I.grad },
    { id: 'procurement', label: 'Procurement', icon: I.doc },
    { id: 'stocktake', label: 'Stocktake', icon: I.chart },
    { id: 'summary', label: 'Summary', icon: I.doc },
  ],
  library: [
    { id: 'overview', label: 'Overview', icon: I.book },
    { id: 'circulation', label: 'Circulation', icon: I.activity },
    { id: 'borrowing', label: 'Borrowing', icon: I.trend },
    { id: 'fines', label: 'Fines', icon: I.money },
    { id: 'digital', label: 'Digital', icon: I.doc },
  ],
  lower_rank: [
    { id: 'admissions', label: 'Admissions', icon: I.doc },
    { id: 'enrollment', label: 'Enrollment', icon: I.users },
    { id: 'attendance', label: 'Attendance', icon: I.activity },
  ],
  academic: [
    { id: 'teaching', label: 'Teaching', icon: I.chart },
    { id: 'assignments', label: 'Assignments', icon: I.doc },
    { id: 'marks', label: 'Marks', icon: I.activity },
    { id: 'students', label: 'Students', icon: I.alert },
    { id: 'readiness', label: 'Exam Readiness', icon: I.grad },
    { id: 'attendance', label: 'Attendance', icon: I.users },
    { id: 'summary', label: 'My Classes', icon: I.grad },
  ],
  exam_officer: [
    { id: 'completion', label: 'Mark Completion', icon: I.activity },
    { id: 'pipeline', label: 'Results Pipeline', icon: I.trend },
    { id: 'maneb', label: 'MANEB', icon: I.grad },
    { id: 'candidates', label: 'Candidates', icon: I.users },
    { id: 'subjects', label: 'Subjects', icon: I.chart },
    { id: 'marks', label: 'Marks', icon: I.activity },
    { id: 'placements', label: 'Placements', icon: I.grad },
  ],
  hr: [
    { id: 'overview', label: 'Overview', icon: I.activity },
    { id: 'workforce', label: 'Workforce', icon: I.users },
    { id: 'leave', label: 'Leave', icon: I.activity },
    { id: 'contracts', label: 'Contracts', icon: I.alert },
    { id: 'loans', label: 'Staff Loans', icon: I.money },
    { id: 'reviews', label: 'Reviews', icon: I.doc },
  ],
  student: [
    { id: 'overview', label: 'Overview', icon: I.activity },
    { id: 'progress', label: 'Progress', icon: I.trend },
    { id: 'assignments', label: 'Assignments', icon: I.doc },
    { id: 'attendance', label: 'Attendance', icon: I.activity },
    { id: 'library', label: 'Library', icon: I.book },
    { id: 'fees', label: 'Fees', icon: I.money },
    { id: 'summary', label: 'Results', icon: I.doc },
  ],
}

/**
 * Deep links written for a role's own report (e.g. the finance reports' `outstanding`
 * or the HR reports' `loans`) that leadership sees inside a wider tab.
 */
const TAB_ALIASES: Record<string, Record<string, string>> = {
  high_rank: {
    collection: 'finance',
    outstanding: 'aging',
    expenses: 'finance',
    payments: 'finance',
    loans: 'workforce',
    reviews: 'workforce',
    fines: 'circulation',
    library: 'circulation',
    pipeline: 'completion',
  },
}

// ─── SHARED UI COMPONENTS ────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  trend,
  warn = false,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: 'up' | 'down' | null
  warn?: boolean
}) {
  return (
    <div
      className={`bg-surface border rounded-2xl p-5 flex flex-col gap-1 ${warn ? 'border-brand-coral/40' : 'border-base'}`}
    >
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p
        className={`text-2xl font-bold font-heading ${warn ? 'text-brand-coral' : 'text-brand-navy'}`}
      >
        {value}
      </p>
      {(sub || trend) && (
        <div className="flex items-center gap-1 mt-0.5">
          {trend === 'up' && <ArrowUpRight className="w-3.5 h-3.5 text-brand-teal" />}
          {trend === 'down' && <ArrowDownRight className="w-3.5 h-3.5 text-brand-coral" />}
          {sub && <span className="text-xs text-muted">{sub}</span>}
        </div>
      )}
    </div>
  )
}

function ChartCard({
  title,
  children,
  className = '',
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
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
  role,
  active,
  onChange,
}: {
  role: string
  active: string
  onChange: (id: string) => void
}) {
  const tabs = ROLE_TABS[role] ?? []
  return (
    <div
      role="tablist"
      aria-label="Report sections"
      className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
            active === t.id
              ? 'bg-brand-deep text-white'
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
  const { data: adminBase } = useAdminReport()
  const volume = volumeRaw as ApiTimeSeriesPoint[] | undefined
  const entity = entityRaw as ApiCategoryBreakdown[] | undefined
  const base = adminBase as
    | {
        totalStudents: number
        activeStudents: number
        totalStaff: number
        totalInvoices: number
        paidInvoices: number
        totalExams: number
      }
    | undefined

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Students" value={base?.totalStudents ?? '—'} />
        <KpiCard label="Active Students" value={base?.activeStudents ?? '—'} trend="up" />
        <KpiCard label="Active Staff" value={base?.totalStaff ?? '—'} />
        <KpiCard label="Total Invoices" value={base?.totalInvoices ?? '—'} />
        <KpiCard label="Paid Invoices" value={base?.paidInvoices ?? '—'} trend="up" />
        <KpiCard label="Total Exams" value={base?.totalExams ?? '—'} />
      </div>

      {vLoading ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="System Write Activity — Last 30 Days">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={volume ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartColorAt(0)}
                fill={chartColorAt(0)}
                fillOpacity={0.08}
                strokeWidth={2}
                name="Actions"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {eLoading ? (
        <SkeletonChart />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Activity by Entity Type">
            {entity && entity.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={entity} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    width={100}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [num(v), 'Actions']} />
                  <Bar dataKey="value" fill={chartColorAt(1)} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
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
        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          width={130}
        />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="value" fill={chartColorAt(2)} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
function AdminHeatmapPanel() {
  const { data: raw } = useAdminActivityHeatmap()
  const cells = raw as { hour: number; dayOfWeek: number; count: number }[] | undefined
  if (!cells) return null

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const maxVal = Math.max(...cells.map((c) => c.count), 1)

  return (
    <ChartCard title="Activity Heatmap — Hour × Day of Week">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs text-center">
          <thead>
            <tr>
              <th className="w-10" />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="font-normal text-muted w-6 pb-1">
                  {h}
                </th>
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
                        style={{
                          backgroundColor: `rgba(14,138,106,${intensity / 100})`,
                          minHeight: '20px',
                        }}
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

// Static column specs for AdminAuditPanel's table — hoisted out of the
// component so useResizableColumns doesn't see a new array identity on
// every render (harmless either way given its ref-based design, but no
// reason to recreate static data each render).
const AUDIT_COLUMNS: { key: string; defaultWidth: number; minWidth: number }[] = [
  { key: 'action', defaultWidth: 140, minWidth: 90 },
  { key: 'entity', defaultWidth: 110, minWidth: 70 },
  { key: 'entityId', defaultWidth: 150, minWidth: 90 },
  { key: 'actor', defaultWidth: 170, minWidth: 100 },
  { key: 'idNo', defaultWidth: 130, minWidth: 80 },
  { key: 'role', defaultWidth: 100, minWidth: 70 },
  { key: 'time', defaultWidth: 150, minWidth: 110 },
]
const AUDIT_HEADERS: { key: string; label: string }[] = [
  { key: 'action', label: 'Action' },
  { key: 'entity', label: 'Entity' },
  { key: 'entityId', label: 'Entity ID' },
  { key: 'actor', label: 'Actor' },
  { key: 'idNo', label: 'ID No.' },
  { key: 'role', label: 'Role' },
  { key: 'time', label: 'Time' },
]

const AUDIT_PAGE_SIZE = 50

/** Compact page list: 1 … 4 5 [6] 7 8 … 20 (null = ellipsis). */
function auditPageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  if (current <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }
  if (current >= total - 2) {
    pages.add(total - 1)
    pages.add(total - 2)
    pages.add(total - 3)
  }
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push(null)
    out.push(p)
  })
  return out
}

function AdminAuditPanel() {
  const [page, setPage] = useState(1)
  const { data: audit, isFetching } = useAuditLog({ page, limit: AUDIT_PAGE_SIZE })
  const totalPages = Math.max(1, audit?.pages ?? 1)
  const safePage = Math.min(page, totalPages)
  const totalEntries = audit?.total ?? 0
  const firstShown = totalEntries === 0 ? 0 : (safePage - 1) * AUDIT_PAGE_SIZE + 1
  const lastShown = Math.min(safePage * AUDIT_PAGE_SIZE, totalEntries)
  // ...useExportable(...) and the rest unchanged

  useExportable<ApiAuditLogEntry>('Audit Log', audit?.logs, [
    { label: 'Action', value: (l) => l.action },
    { label: 'Entity', value: (l) => l.entityType },
    { label: 'Entity ID', value: (l) => l.entityId },
    { label: 'Actor Name', value: (l) => l.actorName ?? '' },
    { label: 'Employee No.', value: (l) => l.actorEmployeeNo ?? '' },
    { label: 'Reg. No.', value: (l) => l.actorRegistrationNo ?? '' },
    { label: 'Actor', value: (l) => l.actorUid },
    { label: 'Role', value: (l) => l.actorRole },
    { label: 'Time', value: (l) => l.createdAt },
  ])

  // [PRODUCTION FIX] Column widths are now admin-adjustable (drag the
  // handle at each header's right edge) rather than a fixed best-guess
  // split — long Entity/Actor ID values were getting clipped no matter
  // what fixed percentages this table shipped with, because "long enough
  // to matter" depends on what's actually in the data on a given day, not
  // something a static width can predict. Widths persist per-admin via
  // localStorage (reports.auditLog.columnWidths), the same "adjust once,
  // stays adjusted" convention as Notion/Linear/Airtable's own resizable
  // columns.
  //
  // The standalone Actor UID column from the previous version is gone —
  // it's now the copy icon on the Actor cell below. Showing the raw UID
  // as its own column stopped pulling weight the moment the Name/ID No.
  // columns existed right next to it: everyone identifies an actor by
  // name, and the one time the raw UID itself is actually needed (cross-
  // referencing against a database record, a support ticket) is exactly
  // what a copy button is for — one click of the real ID, not a
  // permanent extra column of one for the other 99% of the time.
  const { widths, startResize } = useResizableColumns(
    AUDIT_COLUMNS,
    'reports.auditLog.columnWidths'
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {totalEntries} total entries
          {totalEntries > 0 && (
            <>
              {' '}
              · showing {firstShown}–{lastShown}
            </>
          )}
        </p>
      </div>
      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse table-fixed">
            <colgroup>
              {AUDIT_HEADERS.map((h) => (
                <col key={h.key} style={{ width: widths[h.key] }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-page border-b border-base">
                {AUDIT_HEADERS.map((h) => (
                  <th
                    key={h.key}
                    className="relative px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap select-none"
                  >
                    {h.label}
                    {/* Drag handle — grab the right edge of any header to
                       resize that column. Widens the hit target well past
                       the visible 1.5px line since a pixel-perfect border
                       is nearly impossible to grab with a mouse. */}
                    <span
                      onMouseDown={startResize(h.key)}
                      className="absolute top-0 right-0 h-full w-2 -mr-1 cursor-col-resize hover:bg-brand-teal/40 active:bg-brand-teal/60 z-10"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-base">
              {audit?.logs.map((log) => (
                <tr key={log.id} className="hover:bg-page transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-brand-teal truncate">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 text-xs truncate">{log.entityType}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted overflow-hidden">
                    <CopyableId value={log.entityId} display={`${log.entityId.slice(0, 10)}…`} />
                  </td>
                  {/* [NEW] Name/ID resolved server-side against StaffProfile
                     (by uid) / Student (by firebaseUid) — see
                     reportService.getAuditLogs(). Neither match (a deleted
                     account, or a system/cron actor) renders an em dash
                     rather than blank, so it reads as "checked, nothing
                     found" rather than a missing value. The copy icon
                     copies the actual actorUid — still one click away for
                     the rare case it's genuinely needed, just not taking
                     up a whole column of its own any more. */}
                  <td className="px-4 py-3 text-xs overflow-hidden">
                    <CopyableId
                      value={log.actorUid}
                      display={log.actorName ?? <span className="text-muted">—</span>}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted truncate">
                    {log.actorEmployeeNo ?? log.actorRegistrationNo ?? <span>—</span>}
                  </td>
                  <td className="px-4 py-3 truncate">
                    <span className="text-xs">{log.actorRole}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted truncate">
                    {new Date(log.createdAt).toLocaleString('en-GB', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalEntries > 0 && (
        <nav
          aria-label="Audit log pagination"
          className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-base"
        >
          <p className="text-xs text-muted" aria-live="polite">
            Page {safePage} of {totalPages}
            {isFetching ? ' · loading…' : ''}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, Math.min(totalPages, p - 1)))}
              disabled={safePage <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-base text-sm hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden /> Prev
            </button>
            {auditPageWindow(safePage, totalPages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1 text-muted text-sm select-none">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(Math.max(1, Math.min(totalPages, p)))}
                  aria-current={p === safePage ? 'page' : undefined}
                  className={`min-w-[36px] min-h-[36px] px-2 rounded-lg text-sm border ${
                    p === safePage
                      ? 'bg-brand-teal text-white border-brand-teal font-semibold'
                      : 'border-base hover:bg-page'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, Math.min(totalPages, p + 1)))}
              disabled={safePage >= totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg border border-base text-sm hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}

// ─── HIGH RANK PANELS ────────────────────────────────────────────────────────

function HighRankPerformancePanel({ academicYear, term }: { academicYear: string; term: number }) {
  // [R14] The trend window is derived from the school's configured current
  // year, not a hardcoded ['2023/2024', '2024/2025', '2025/2026'] literal that
  // stops meaning "the last three years" the moment the school rolls over.
  const years = useMemo(() => recentAcademicYears(academicYear, TREND_YEARS_BACK), [academicYear])
  const { data: trend, isLoading: tl } = useSchoolPerformanceTrend(years)

  useExportable<ApiSchoolPerformanceTrendPoint>('School Performance Trend', trend, [
    { label: 'Academic Year', value: (t) => t.academicYear },
    { label: 'Term', value: (t) => t.term },
    { label: 'Pass Rate (%)', value: (t) => t.passRate },
    { label: 'Average', value: (t) => t.average },
    { label: 'Results', value: (t) => t.total },
  ])

  const current = trend?.filter((t) => t.academicYear === academicYear && t.term === term)
  const passRate = current?.[0]?.passRate ?? null
  const avgScore = current?.[0]?.average ?? null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Pass Rate (Term)"
          value={passRate !== null ? `${passRate}%` : '—'}
          trend="up"
        />
        <KpiCard label="School Avg (Term)" value={avgScore !== null ? `${avgScore}%` : '—'} />
        <KpiCard label="Students Assessed" value={current?.[0]?.total ?? '—'} />
        <KpiCard label="Academic Year" value={academicYear} />
      </div>
      {tl ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="School Pass Rate Trend — All Terms">
          {trend && trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend.map((t) => ({ ...t, label: `${t.academicYear} T${t.term}` }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="passRate"
                  stroke={chartColorAt(1)}
                  strokeWidth={2}
                  dot
                  name="Pass Rate %"
                />
                <Line
                  type="monotone"
                  dataKey="average"
                  stroke={chartColorAt(0)}
                  strokeWidth={2}
                  dot
                  name="Average %"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      )}
      {/*
       * [PRODUCTION FIX] high_rank holds report.viewSchoolPerformance — the
       * same permission GET /maneb/school-stats is gated on — but national
       * exam results (JCE/MSCE) had no home on this tab at all, only on
       * exam_officer's separate 'maneb' tab. A school's national exam
       * standing is core leadership-level performance data, not just an
       * exam office operational concern. Reuses the exact same panel
       * exam_officer sees.
       */}
      <div className="space-y-5">
        <SectionHeader
          title="MANEB National Exam Results"
          icon={<GraduationCap className="w-4 h-4" />}
        />
        <ManebAnalyticsPanel academicYear={academicYear} />
      </div>
    </div>
  )
}

function HighRankClassPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data: classes, isLoading: cl } = useClassComparison(academicYear, term)
  const { data: subjects, isLoading: sl } = useSubjectComparison(academicYear, term)

  useExportable<ApiClassPerformanceStat>(`Class Comparison ${academicYear} Term ${term}`, classes, [
    { label: 'Class', value: (c) => c.className },
    { label: 'Students', value: (c) => c.studentCount },
    { label: 'Average', value: (c) => c.average },
    { label: 'Pass Rate (%)', value: (c) => c.passRate },
  ])

  return (
    <div className="space-y-5">
      {cl ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Class Comparison — Average Score">
          {classes && classes.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={classes}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="className"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, '']} />
                <Bar
                  dataKey="average"
                  fill={chartColorAt(0)}
                  radius={[4, 4, 0, 0]}
                  name="Average %"
                />
                <Bar
                  dataKey="passRate"
                  fill={chartColorAt(1)}
                  radius={[4, 4, 0, 0]}
                  name="Pass Rate %"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      )}
      {sl ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Subject Average Comparison">
          {subjects && subjects.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={subjects.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="subject"
                  tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="average"
                  fill={chartColorAt(2)}
                  radius={[4, 4, 0, 0]}
                  name="Average %"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      )}
      {/*
       * [PRODUCTION FIX] GET /academic/marks-distribution is gated on the
       * same report.viewClassPerformance permission as the two charts above
       * — high_rank already holds it — but this tab never surfaced it.
       * Reuses the exact panel academic/exam_officer already use.
       */}
      <div className="space-y-5">
        <SectionHeader
          title="Marks Distribution by Exam"
          icon={<BarChart2 className="w-4 h-4" />}
        />
        <MarksDistributionPanel />
      </div>
    </div>
  )
}

function HighRankTeachersPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data: teachers, isLoading } = useTeacherEffectiveness(academicYear, term)

  useExportable<ApiTeacherEffectivenessRow>(
    `Teacher Effectiveness ${academicYear} Term ${term}`,
    teachers,
    [
      { label: 'Teacher', value: (t) => t.teacherName },
      { label: 'Department', value: (t) => t.department },
      { label: 'Subjects', value: (t) => t.subjectCount },
      { label: 'Classes', value: (t) => t.classesCount },
      { label: 'Avg Score', value: (t) => t.avgStudentScore },
      { label: 'Avg Pass Rate', value: (t) => t.avgPassRate },
    ]
  )

  // [PRODUCTION FIX] Highest/lowest performer — computed client-side from
  // data this tab already fetches, no new endpoint needed. Sorted copies so
  // the source array (and the export above) keep the backend's own order.
  const bySc =
    teachers && teachers.length > 0
      ? [...teachers].sort((a, b) => b.avgStudentScore - a.avgStudentScore)
      : undefined
  const topTeacher = bySc?.[0]
  const bottomTeacher = bySc && bySc.length > 1 ? bySc[bySc.length - 1] : undefined

  return (
    <div className="space-y-5">
      {topTeacher && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <KpiCard
            label="Highest Avg Score"
            value={`${topTeacher.avgStudentScore}%`}
            sub={topTeacher.teacherName}
            trend="up"
          />
          {bottomTeacher && (
            <KpiCard
              label="Lowest Avg Score"
              value={`${bottomTeacher.avgStudentScore}%`}
              sub={bottomTeacher.teacherName}
              trend={bottomTeacher.avgStudentScore < 50 ? 'down' : null}
              warn={bottomTeacher.avgStudentScore < 50}
            />
          )}
        </div>
      )}
      {isLoading ? (
        <SkeletonChart />
      ) : (
        <>
          <ChartCard title="Teacher Effectiveness — Student Average Score">
            {teachers && teachers.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(180, teachers.length * 36)}>
                <BarChart data={teachers} layout="vertical">
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="teacherName"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    width={130}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, '']} />
                  <Bar
                    dataKey="avgStudentScore"
                    fill={chartColorAt(4)}
                    radius={[0, 4, 4, 0]}
                    name="Avg Student Score %"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
          {teachers && teachers.length > 0 && (
            <div className="table-scroll">
              <table className="w-full text-sm min-w-130">
                <thead>
                  <tr className="bg-page border-b border-base">
                    {['Teacher', 'Department', 'Classes', 'Avg Score', 'Pass Rate'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase"
                      >
                        {h}
                      </th>
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
                        <span
                          className={`font-bold ${t.avgStudentScore >= 50 ? 'text-brand-teal' : 'text-brand-coral'}`}
                        >
                          {t.avgStudentScore}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${t.avgPassRate >= 50 ? 'text-brand-teal' : 'text-brand-coral'}`}
                        >
                          {t.avgPassRate}%
                        </span>
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
      {tl ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Student Enrollment Trend — Last 12 Months">
          {trend && trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="enrolled"
                  fill={chartColorAt(1)}
                  radius={[4, 4, 0, 0]}
                  name="New Enrolled"
                />
                <Bar
                  dataKey="departed"
                  fill={chartColorAt(3)}
                  radius={[4, 4, 0, 0]}
                  name="Departed"
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke={chartColorAt(2)}
                  strokeWidth={2}
                  dot={false}
                  name="Net Change"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      )}
    </div>
  )
}

function HighRankFinancePanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data: cfRaw, isLoading } = useHighRankFinancialSummary(academicYear)
  const cashFlow = cfRaw as ApiCashFlowRow[] | undefined

  return (
    <div className="space-y-8">
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
        {isLoading ? (
          <SkeletonChart />
        ) : (
          <ChartCard title="Revenue vs Expenses by Term">
            {cashFlow && cashFlow.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cashFlow.map((r) => ({ ...r, label: `Term ${r.term}` }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="revenue"
                    fill={chartColorAt(1)}
                    radius={[4, 4, 0, 0]}
                    name="Revenue"
                  />
                  <Bar
                    dataKey="expenses"
                    fill={chartColorAt(3)}
                    radius={[4, 4, 0, 0]}
                    name="Expenses"
                  />
                  <Bar
                    dataKey="payroll"
                    fill={chartColorAt(2)}
                    radius={[4, 4, 0, 0]}
                    name="Payroll"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        )}
      </div>

      {/*
       * [PRODUCTION FIX] high_rank holds report.viewFeeCollection,
       * viewOutstandingBalances, viewExpenseBreakdown (covers budget-vs-
       * actual too — same permission gates both routes), viewPayrollSummary,
       * and viewScholarshipSummary (packages/shared/types/permissions.ts) —
       * six analytics endpoints this tab never rendered, even though the
       * dedicated 'finance' role's own tabs already use every one of them
       * below. Reusing those exact panels rather than re-deriving new chart
       * code: same data, same permission, already proven correct.
       */}
      <div className="space-y-5">
        <SectionHeader title="Fee Collection" icon={<DollarSign className="w-4 h-4" />} />
        <FinanceCollectionPanel />
      </div>
      <div className="space-y-5">
        <SectionHeader title="Outstanding Balances" icon={<AlertTriangle className="w-4 h-4" />} />
        <FinanceOutstandingPanel academicYear={academicYear} term={term} />
      </div>
      <div className="space-y-5">
        <SectionHeader title="Expenses & Budget" icon={<FileText className="w-4 h-4" />} />
        <FinanceExpensesPanel academicYear={academicYear} term={term} />
      </div>
      <div className="space-y-5">
        <SectionHeader title="Payroll" icon={<Users className="w-4 h-4" />} />
        <FinancePayrollPanel />
      </div>
      <div className="space-y-5">
        <SectionHeader title="Scholarships" icon={<GraduationCap className="w-4 h-4" />} />
        <FinanceScholarshipsPanel academicYear={academicYear} />
      </div>
    </div>
  )
}

// ─── FINANCE PANELS ──────────────────────────────────────────────────────────

function FinanceCollectionPanel() {
  const { data: dayRaw, isLoading: dl } = useFinanceCollectionByDay(30)
  const { data: monthRaw, isLoading: ml } = useFinanceCollectionByMonth(12)
  const dayData = dayRaw as ApiTimeSeriesPoint[] | undefined
  const monthData = monthRaw as
    { month: string; collected: number; cumulative: number }[] | undefined

  const totalDay = dayData?.reduce((s, d) => s + d.value, 0) ?? 0
  const totalMonth = monthData?.reduce((s, d) => s + d.collected, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Last 30 Days" value={`MWK ${totalDay.toLocaleString()}`} trend="up" />
        <KpiCard label="Last 12 Months" value={`MWK ${totalMonth.toLocaleString()}`} />
        <KpiCard
          label="Daily Average"
          value={`MWK ${Math.round(totalDay / 30).toLocaleString()}`}
        />
        <KpiCard label="Currency" value="MWK" />
      </div>
      {dl ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Daily Fee Collection — Last 30 Days">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dayData ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
              />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), 'Collected']} />
              <Bar dataKey="value" fill={chartColorAt(1)} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
      {ml ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Monthly Collection & Cumulative — Last 12 Months">
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={monthData ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
              />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="left"
                dataKey="collected"
                fill={chartColorAt(1)}
                radius={[4, 4, 0, 0]}
                name="Monthly"
              />
              <Line
                yAxisId="right"
                dataKey="cumulative"
                stroke={chartColorAt(2)}
                strokeWidth={2}
                dot={false}
                name="Cumulative"
              />
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
    { label: 'Class', value: (r) => r.className },
    { label: 'Students Owing', value: (r) => r.studentCount },
    { label: 'Outstanding (MWK)', value: (r) => r.outstanding },
  ])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Total Outstanding"
          value={`MWK ${total.toLocaleString()}`}
          warn={total > 0}
        />
        <KpiCard
          label="Classes Affected"
          value={rows?.filter((r) => r.outstanding > 0).length ?? 0}
        />
      </div>
      {isLoading ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Outstanding Balance by Class">
          {rows && rows.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rows} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                  />
                  <YAxis
                    type="category"
                    dataKey="className"
                    tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(v) => [mwk(v), 'Outstanding']}
                  />
                  <Bar dataKey="outstanding" fill={chartColorAt(3)} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 table-scroll">
                <table className="w-full text-sm min-w-130">
                  <thead>
                    <tr className="bg-page border-b border-base">
                      {['Class', 'Students', 'Outstanding'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2 text-left text-xs font-semibold text-muted uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base">
                    {rows.map((r) => (
                      <tr key={r.classId} className="hover:bg-page">
                        <td className="px-4 py-2 font-medium">{r.className}</td>
                        <td className="px-4 py-2 text-muted">{r.studentCount}</td>
                        <td className="px-4 py-2 font-bold text-brand-coral">
                          MWK {r.outstanding.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState message="No outstanding balances" />
          )}
        </ChartCard>
      )}
    </div>
  )
}

function FinanceExpensesPanel({ academicYear, term }: { academicYear: string; term?: number }) {
  const { data: expenses, isLoading: el } = useFinanceExpenseBreakdown(academicYear, term)
  const { data: budgets, isLoading: bl } = useFinanceBudgetVsActual(academicYear, term)

  useExportable<ApiBudgetVsActualRow>(`Budget vs Actual ${academicYear}`, budgets, [
    { label: 'Category', value: (r) => r.category },
    { label: 'Allocated (MWK)', value: (r) => r.allocated },
    { label: 'Spent (MWK)', value: (r) => r.spent },
    { label: 'Utilisation (%)', value: (r) => r.utilisation },
  ])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {el ? (
          <SkeletonChart />
        ) : (
          <ChartCard title="Expense Breakdown by Category">
            {expenses && expenses.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={expenses}
                    dataKey="value"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(p: PieLabelRenderProps) =>
                      `${p.name ?? ''} ${Math.round((p.percent ?? 0) * 100)}%`
                    }
                    labelLine
                    fontSize={10}
                  >
                    {expenses.map((_, i) => (
                      <Cell key={i} fill={chartColorAt(i)} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        )}
        {bl ? (
          <SkeletonChart />
        ) : (
          <ChartCard title="Budget vs Actual by Category">
            {budgets && budgets.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={budgets} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                  />
                  {/* [R14] Was dataKey="department" — a field that exists on Budget
                      but not on Expense, and therefore never joined. The row's key
                      is now the ExpenseCategory it is actually budgeted against. */}
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    width={110}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="allocated"
                    fill={chartColorAt(0)}
                    radius={[0, 4, 4, 0]}
                    name="Allocated"
                  />
                  <Bar dataKey="spent" fill={chartColorAt(2)} radius={[0, 4, 4, 0]} name="Spent" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        )}
      </div>
    </div>
  )
}

function FinanceCashFlowPanel({ academicYear }: { academicYear: string }) {
  const { data: rows, isLoading } = useFinanceCashFlow(academicYear)

  useExportable<ApiCashFlowRow>(`Cash Flow ${academicYear}`, rows, [
    { label: 'Term', value: (r) => r.term },
    { label: 'Revenue (MWK)', value: (r) => r.revenue },
    { label: 'Expenses (MWK)', value: (r) => r.expenses },
    { label: 'Payroll (MWK)', value: (r) => r.payroll },
    { label: 'Net (MWK)', value: (r) => r.net },
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
      {isLoading ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Cash Flow Statement by Term">
          {rows && rows.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={rows.map((r) => ({ ...r, label: `Term ${r.term}` }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="revenue"
                    fill={chartColorAt(1)}
                    radius={[4, 4, 0, 0]}
                    name="Revenue"
                  />
                  <Bar
                    dataKey="expenses"
                    fill={chartColorAt(3)}
                    radius={[4, 4, 0, 0]}
                    name="Expenses"
                  />
                  <Bar
                    dataKey="payroll"
                    fill={chartColorAt(2)}
                    radius={[4, 4, 0, 0]}
                    name="Payroll"
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke={chartColorAt(0)}
                    strokeWidth={2}
                    dot
                    name="Net"
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-4 table-scroll">
                <table className="w-full text-sm min-w-130">
                  <thead>
                    <tr className="bg-page border-b border-base">
                      {['Term', 'Revenue', 'Expenses', 'Payroll', 'Net'].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2 text-left text-xs font-semibold text-muted uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base">
                    {rows.map((r) => (
                      <tr key={r.term}>
                        <td className="px-4 py-2 font-medium">Term {r.term}</td>
                        <td className="px-4 py-2 text-brand-teal">
                          MWK {r.revenue.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-brand-coral">
                          MWK {r.expenses.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-brand-amber">
                          MWK {r.payroll.toLocaleString()}
                        </td>
                        <td
                          className={`px-4 py-2 font-bold ${r.net >= 0 ? 'text-brand-teal' : 'text-brand-coral'}`}
                        >
                          MWK {r.net.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState />
          )}
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
        <KpiCard
          label="Monthly Average"
          value={`MWK ${data?.length ? Math.round(total / data.length).toLocaleString() : '—'}`}
        />
      </div>
      {isLoading ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Monthly Payroll Cost — Last 12 Months">
          {data && data.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                  tickFormatter={(v: number) => `${(v / 1_000_000).toFixed(1)}M`}
                />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), 'Payroll']} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={chartColorAt(0)}
                  fill={chartColorAt(0)}
                  fillOpacity={0.08}
                  strokeWidth={2}
                  name="Payroll"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      )}
    </div>
  )
}

// ─── LIBRARY PANELS ──────────────────────────────────────────────────────────

function LibraryOverviewPanel() {
  const { data: health, isLoading: hl } = useLibraryInventoryHealth()
  const { data: top, isLoading: tl } = useLibraryTopBorrowed(10)

  useExportable<ApiTopBorrowedBook>('Top Borrowed Books', top, [
    { label: 'Title', value: (b) => b.title },
    { label: 'Author', value: (b) => b.author },
    { label: 'Borrowings', value: (b) => b.borrowCount },
  ])

  return (
    <div className="space-y-5">
      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Total Titles" value={health.totalTitles} />
          <KpiCard label="Available Copies" value={health.availableCopies} trend="up" />
          <KpiCard label="Overdue" value={health.overdueCount} warn={health.overdueCount > 0} />
          <KpiCard label="Availability" value={`${health.availabilityRate}%`} />
        </div>
      )}
      {hl && <SkeletonChart />}
      {tl ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Top 10 Most Borrowed Books">
          {top && top.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="title"
                    tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
                    width={160}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="borrowCount"
                    fill={chartColorAt(1)}
                    radius={[0, 4, 4, 0]}
                    name="Borrows"
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-1">
                {top.map((b, i) => (
                  <div
                    key={b.bookId}
                    className="flex items-center justify-between py-2 border-b border-base last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-brand-deep text-white text-xs flex items-center justify-center font-bold">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-brand-navy">{b.title}</p>
                        <p className="text-xs text-muted">
                          {b.author} · {b.category}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-brand-teal">{b.borrowCount}×</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState />
          )}
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
      {isLoading ? (
        <SkeletonChart />
      ) : (
        <ChartCard title="Weekly Borrowing Trend — Last 12 Weeks">
          {data && data.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={chartColorAt(1)}
                  fill={chartColorAt(1)}
                  fillOpacity={0.13}
                  strokeWidth={2}
                  name="Books Issued"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      )}
    </div>
  )
}

function LibraryDigitalPanel() {
  const { data: raw, isLoading } = useLibraryDigitalStats()
  const stats = raw as
    | {
        byType: ApiCategoryBreakdown[]
        bySubject: ApiCategoryBreakdown[]
        total: number
        approvedCount: number
      }
    | undefined

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Total Resources" value={stats.total} />
          <KpiCard label="Approved" value={stats.approvedCount} trend="up" />
        </div>
      )}
      {isLoading ? (
        <SkeletonChart />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="By Resource Type">
            {stats?.byType?.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={stats.byType}
                    dataKey="value"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                  >
                    {stats.byType.map((_, i) => (
                      <Cell key={i} fill={chartColorAt(i)} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
          <ChartCard title="By Subject">
            {stats?.bySubject?.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.bySubject} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    width={100}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" fill={chartColorAt(4)} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        </div>
      )}
    </div>
  )
}

// ─── ACADEMIC STAFF PANELS ───────────────────────────────────────────────────

function AcademicSubjectsPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data: rows, isLoading } = useAcademicSubjectPerformance(academicYear, term)

  useExportable<ApiAcademicSubjectPerformanceRow>(
    `Subject Performance ${academicYear} Term ${term}`,
    rows,
    [
      { label: 'Subject', value: (r) => r.subject },
      { label: 'Class', value: (r) => r.className },
      { label: 'Students', value: (r) => r.studentCount },
      { label: 'Average', value: (r) => r.average },
      { label: 'Pass Rate (%)', value: (r) => r.passRate },
    ]
  )

  return (
    <div className="space-y-5">
      {isLoading ? (
        <SkeletonChart />
      ) : (
        <>
          <ChartCard title="Subject Performance — My Classes">
            {rows && rows.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={rows.slice(0, 12)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="subject"
                    tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                  />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${num(v)}%`, '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="average"
                    fill={chartColorAt(0)}
                    radius={[4, 4, 0, 0]}
                    name="Average %"
                  />
                  <Bar
                    dataKey="passRate"
                    fill={chartColorAt(1)}
                    radius={[4, 4, 0, 0]}
                    name="Pass Rate %"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No finalised exam data for this term" />
            )}
          </ChartCard>
          {rows && rows.length > 0 && (
            <div className="table-scroll">
              <table className="w-full text-sm min-w-130">
                <thead>
                  <tr className="bg-page border-b border-base">
                    {['Subject', 'Class', 'Students', 'Avg Score', 'Pass Rate'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-semibold text-muted uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-base">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-page">
                      <td className="px-4 py-2 font-medium text-brand-navy">{r.subject}</td>
                      <td className="px-4 py-2 text-muted text-xs">{r.className}</td>
                      <td className="px-4 py-2">{r.studentCount}</td>
                      <td className="px-4 py-2 font-bold text-brand-navy">{r.average}%</td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs font-semibold ${r.passRate >= 50 ? 'text-brand-teal' : 'text-brand-coral'}`}
                        >
                          {r.passRate}%
                        </span>
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

// ─── MANEB PANELS ────────────────────────────────────────────────────────────

function ManebAnalyticsPanel({ academicYear }: { academicYear: string }) {
  const { data: stats, isLoading } = useManebSchoolStats(academicYear)

  useExportable<ApiManebSchoolStat>(`MANEB Results ${academicYear}`, stats, [
    { label: 'Exam', value: (m) => m.examType },
    { label: 'Candidates', value: (m) => m.total },
    { label: 'Passed', value: (m) => m.passCount },
    { label: 'Pass Rate (%)', value: (m) => m.passRate },
  ])

  return (
    <div className="space-y-6">
      {isLoading && <SkeletonChart />}
      {stats?.map((stat) => (
        <div key={stat.examType} className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-status-info">
              {stat.examType}
            </span>
            <span className="text-sm text-muted">{stat.total} candidates</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Total Candidates" value={stat.total} />
            <KpiCard label="Passed" value={stat.passCount} trend="up" />
            <KpiCard
              label="Pass Rate"
              value={`${stat.passRate}%`}
              trend={stat.passRate >= 50 ? 'up' : 'down'}
              warn={stat.passRate < 50}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title={`${stat.examType} Grade Distribution`}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stat.gradeDistribution}>
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Students">
                    {stat.gradeDistribution.map((g, i) => (
                      <Cell
                        key={i}
                        fill={
                          ['A', 'B'].includes(g.category)
                            ? chartColorAt(1)
                            : g.category === 'U'
                              ? chartColorAt(3)
                              : chartColorAt(2)
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title={`${stat.examType} Subject Pass Rates`}>
              {stat.subjectAverages.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stat.subjectAverages.slice(0, 8)} layout="vertical">
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="subject"
                      tick={{ fontSize: 9, fill: 'var(--color-muted-foreground)' }}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(v) => [`${num(v)}%`, 'Pass Rate']}
                    />
                    <Bar dataKey="passRate" radius={[0, 4, 4, 0]} name="Pass Rate %">
                      {stat.subjectAverages.slice(0, 8).map((s, i) => (
                        <Cell key={i} fill={s.passRate >= 50 ? chartColorAt(1) : chartColorAt(3)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </ChartCard>
          </div>
        </div>
      ))}
      {!isLoading && (!stats || stats.length === 0) && (
        <EmptyState message="No MANEB records for this academic year" />
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

/** report.viewScholarshipSummary — high_rank, finance. */
function FinanceScholarshipsPanel({ academicYear }: { academicYear: string }) {
  const { data, isLoading } = useScholarshipSummary(academicYear)

  useExportable<ApiScholarshipSummaryRow>(`Scholarships ${academicYear}`, data?.byScholarship, [
    { label: 'Scholarship', value: (r) => r.name },
    { label: 'Discount Type', value: (r) => r.discountType },
    { label: 'Recipients', value: (r) => r.recipientCount },
    { label: 'Discount (MWK)', value: (r) => r.totalDiscount },
  ])

  if (isLoading) return <SkeletonChart />
  if (!data || data.byScholarship.length === 0)
    return <EmptyState message="No active scholarships this year" />

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Active Awards" value={data.activeScholarships} />
        <KpiCard label="Recipients" value={data.recipientCount} />
        <KpiCard label="Total Discount" value={`MWK ${data.totalDiscountMwk.toLocaleString()}`} />
      </div>
      <ChartCard title={`Scholarship Value — ${academicYear}`}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.byScholarship} layout="vertical">
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              width={130}
            />
            <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [mwk(v), 'Discount']} />
            <Bar
              dataKey="totalDiscount"
              fill={chartColorAt(4)}
              radius={[0, 4, 4, 0]}
              name="Discount"
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Scholarship', 'Type', 'Recipients', 'Total Discount'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.byScholarship.map((r) => (
                <tr key={r.name} className="border-b border-base last:border-0">
                  <td className="px-4 py-3 font-medium text-brand-navy">{r.name}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.discountType === 'PERCENTAGE' ? 'Percentage' : 'Fixed amount'}
                  </td>
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
    { label: 'Students', value: (b) => b.count },
  ])

  return (
    <div className="space-y-5">
      <div className="pb-5 border-b border-base flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor="marks-exam-id"
            className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5"
          >
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
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(v) => [`${num(v)} students`, '']}
              />
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
    examType === '' ? undefined : examType
  )

  useExportable<ApiManebResultSummary>(`MANEB Candidates ${academicYear}`, candidates, [
    { label: 'Candidate No', value: (c) => c.candidateNo },
    { label: 'Exam', value: (c) => c.examType },
    { label: 'Overall Grade', value: (c) => c.overallGrade },
    { label: 'Status', value: (c) => c.status },
    {
      label: 'Subjects',
      value: (c) => c.subjectGrades.map((g) => `${g.subject}:${g.grade}`).join('; '),
    },
  ])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionHeader
          title={`MANEB Candidates — ${academicYear}`}
          icon={<Users className="w-4 h-4" />}
        />
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

      {isLoading ? (
        <SkeletonChart />
      ) : candidates && candidates.length > 0 ? (
        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-page border-b border-base">
                  {['Candidate No', 'Exam', 'Overall', 'Subjects', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.candidateNo} className="border-b border-base last:border-0">
                    <td className="px-4 py-3 font-medium text-brand-navy whitespace-nowrap">
                      {c.candidateNo}
                    </td>
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
      ) : (
        <EmptyState message="No MANEB candidates registered for this year" />
      )}
    </div>
  )
}

// ─── SUMMARY PANELS — the seven previously-orphaned useReports hooks ─────────

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return <KpiCard label={label} value={value} />
}

function HighRankSummaryPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const { data, isLoading } = useSchoolReport(academicYear, term)

  // [PRODUCTION FIX] A "summary" tab that only ever showed 3 KPIs and one
  // class-size chart wasn't summarizing much. Every hook below is already
  // imported and already used elsewhere on this exact page (Finance,
  // Attendance, HR, Admissions, Library, Classes tabs) — this pulls them
  // together in one place for the first time, which is what an executive
  // summary is for. No new endpoints, no new permissions — high_rank
  // already held every one of these.
  const { data: finance } = useFinanceReport(academicYear, term)
  const { data: attendance } = useAttendanceSummary(academicYear, term)
  const { data: staffByDept } = useHRStaffByDepartment()
  const { data: funnel } = useApplicationsFunnel()
  const { data: library } = useLibraryInventoryHealth()
  const { data: classes } = useClassComparison(academicYear, term)

  useExportable('School Summary', data?.classStats, [
    { label: 'Class', value: (c: { name: string }) => c.name },
    { label: 'Students', value: (c: { _count: { students: number } }) => c._count.students },
  ])

  if (isLoading) return <SkeletonChart />
  if (!data) return <EmptyState />

  const totalStaff = staffByDept?.reduce((s, d) => s + d.value, 0)
  const totalApplications = funnel?.find((f) => f.stage === 'Total Applications')?.count
  const lowAttendanceClasses = attendance?.byClass.filter((c) => c.attendanceRate < 85) ?? []
  const underperformingClasses = classes?.filter((c) => c.average < 50) ?? []

  // [PRODUCTION FIX] Each condition below is real, live data already
  // fetched for other panels on this page — this is what "issues the high
  // rank should be tracking" actually means: not a new metric, a flag on
  // an existing one.
  const issues: { label: string; detail: string }[] = []
  if ((finance?.outstanding ?? 0) > 0) {
    issues.push({
      label: 'Outstanding fees',
      detail: `MWK ${(finance?.outstanding ?? 0).toLocaleString()} not yet collected`,
    })
  }
  if (lowAttendanceClasses.length > 0) {
    issues.push({
      label: 'Low attendance',
      detail: `${lowAttendanceClasses.length} class${lowAttendanceClasses.length === 1 ? '' : 'es'} below 85% attendance`,
    })
  }
  if (underperformingClasses.length > 0) {
    issues.push({
      label: 'Underperforming classes',
      detail: `${underperformingClasses.length} class${underperformingClasses.length === 1 ? '' : 'es'} averaging below 50%`,
    })
  }
  if ((library?.overdueCount ?? 0) > 0) {
    issues.push({
      label: 'Overdue library books',
      detail: `${library?.overdueCount} book${library?.overdueCount === 1 ? '' : 's'} not yet returned`,
    })
  }

  // [PRODUCTION FIX] getSchoolPerformanceReport (server/services/
  // reportService.ts) has always computed and returned enrollmentByForm —
  // active students grouped by classId — but ApiSchoolReport never declared
  // the field, so it was invisible to every consumer even though it was on
  // every response. Joined here against classStats (same response, now
  // also declaring `id`) to show active vs total roster per class — a
  // direct, real data-quality signal, not a cosmetic addition. Falls back
  // to the raw id rather than dropping the row if a class ever goes
  // unmatched.
  const enrollmentByClass = (data.enrollmentByForm ?? []).map((row) => {
    const match = data.classStats?.find((c) => c.id === row.classId)
    return {
      name: match?.name ?? row.classId,
      active: row._count,
      roster: match?._count.students ?? 0,
    }
  })

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`School Summary — ${academicYear} Term ${term}`}
        icon={<FileText className="w-4 h-4" />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Pass Rate" value={`${data.overall?.passRate ?? 0}%`} />
        <SummaryStat label="Average" value={data.overall?.average ?? 0} />
        <SummaryStat label="Results" value={data.overall?.total ?? 0} />
        <SummaryStat
          label="Attendance"
          value={attendance ? `${attendance.attendanceRate}%` : '—'}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat
          label="Fee Collection"
          value={finance ? `${finance.collectionPct ?? 0}%` : '—'}
        />
        <SummaryStat label="Total Staff" value={totalStaff ?? '—'} />
        <SummaryStat label="Applications" value={totalApplications ?? '—'} />
        <SummaryStat label="Library Books" value={library ? library.totalTitles : '—'} />
      </div>

      <div className="pt-2">
        <SectionHeader
          title="Issues Needing Attention"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        {issues.length === 0 ? (
          <p className="text-sm text-muted mt-3">No outstanding issues flagged for this term.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {issues.map((issue) => (
              <div
                key={issue.label}
                className="flex items-start gap-3 bg-brand-coral/5 border border-brand-coral/20 rounded-xl px-4 py-3"
              >
                <AlertTriangle className="w-4 h-4 text-brand-coral shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-brand-navy">{issue.label}</p>
                  <p className="text-xs text-muted">{issue.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.classStats && data.classStats.length > 0 ? (
        <ChartCard title="Class Sizes">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.classStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="_count.students"
                fill={chartColorAt(0)}
                radius={[4, 4, 0, 0]}
                name="Students"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : (
        <EmptyState message="No class statistics for this term" />
      )}

      {enrollmentByClass.length > 0 && (
        <ChartCard title="Active Enrollment vs Total Roster by Class">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={enrollmentByClass}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {/* [PRODUCTION FIX] "Total Roster" is a neutral headcount, not
                 a bad/at-risk figure, but chartColorAt(3) put it on the
                 palette's red — the same colour "Rejected"/"At Risk"/
                 "Departed" use elsewhere in this file. Moved to neutral
                 navy so red keeps one consistent meaning across every
                 chart on this page. */}
              <Bar
                dataKey="roster"
                fill={chartColorAt(0)}
                radius={[4, 4, 0, 0]}
                name="Total Roster"
              />
              <Bar
                dataKey="active"
                fill={chartColorAt(1)}
                radius={[4, 4, 0, 0]}
                name="Active Students"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  )
}

function FinanceSummaryPanel({ academicYear, term }: { academicYear: string; term?: number }) {
  const { data, isLoading } = useFinanceReport(academicYear, term)

  if (isLoading) return <SkeletonChart />
  if (!data) return <EmptyState />

  return (
    <div className="space-y-5">
      <SectionHeader
        title={`Fee Collection Summary — ${academicYear}`}
        icon={<FileText className="w-4 h-4" />}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Collected" value={`MWK ${(data.collected ?? 0).toLocaleString()}`} />
        <SummaryStat label="Target" value={`MWK ${(data.target ?? 0).toLocaleString()}`} />
        <KpiCard
          label="Outstanding"
          value={`MWK ${(data.outstanding ?? 0).toLocaleString()}`}
          warn={(data.outstanding ?? 0) > 0}
        />
        <SummaryStat label="Collection" value={`${data.collectionPct ?? 0}%`} />
      </div>
    </div>
  )
}
function AcademicSummaryPanel({ academicYear }: { academicYear: string }) {
  const { data, isLoading } = useAcademicReport(academicYear)

  useExportable<ApiAcademicClassSummary>('My Classes', data?.summaries, [
    { label: 'Class', value: (c) => c.className },
    { label: 'Form', value: (c) => c.form },
    { label: 'Results', value: (c) => c.total },
    { label: 'Pass Rate (%)', value: (c) => c.passRate },
    { label: 'Average', value: (c) => c.avg },
  ])

  if (isLoading) return <SkeletonChart />
  if (!data || data.summaries.length === 0) {
    return <EmptyState message="You are not assigned as form teacher to any class this year" />
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title={`My Classes — ${academicYear}`}
        icon={<GraduationCap className="w-4 h-4" />}
      />
      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Class', 'Form', 'Results', 'Pass Rate', 'Average'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.summaries.map((c) => (
                <tr key={c.classId} className="border-b border-base last:border-0">
                  <td className="px-4 py-3 font-medium text-brand-navy">{c.className}</td>
                  <td className="px-4 py-3 text-muted">Form {c.form}</td>
                  <td className="px-4 py-3">{c.total}</td>
                  <td
                    className={`px-4 py-3 font-medium ${c.passRate >= 50 ? 'text-brand-teal' : 'text-brand-coral'}`}
                  >
                    {c.passRate}%
                  </td>
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
function StudentSummaryPanel({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentReport(studentId)

  useExportable('My Results', data?.results, [
    { label: 'Academic Year', value: (r: { academicYear: string }) => r.academicYear },
    { label: 'Term', value: (r: { term: number }) => r.term },
    { label: 'Average', value: (r: { average: number }) => r.average },
    { label: 'Grade', value: (r: { grade: string }) => r.grade },
    { label: 'Position', value: (r: { position: number | null }) => r.position },
    { label: 'Passed', value: (r: { passStatus: boolean }) => (r.passStatus ? 'Yes' : 'No') },
  ])

  if (isLoading) return <SkeletonChart />
  if (!data || data.results.length === 0) return <EmptyState message="No released results yet" />

  return (
    <div className="space-y-5">
      <SectionHeader title="My Results" icon={<FileText className="w-4 h-4" />} />
      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page border-b border-base">
                {['Year', 'Term', 'Average', 'Grade', 'Position', 'Result'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase whitespace-nowrap"
                  >
                    {h}
                  </th>
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
                  <td
                    className={`px-4 py-3 font-medium ${r.passStatus ? 'text-brand-teal' : 'text-brand-coral'}`}
                  >
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
    <RoleGuard
      allowed={[
        'admin',
        'high_rank',
        'finance',
        'library',
        'hr',
        'academic',
        'exam_officer',
        'student',
        'lower_rank',
      ]}
    >
      <ReportExportProvider>
        <Suspense fallback={<SkeletonChart />}>
          <ReportsContent />
        </Suspense>
      </ReportExportProvider>
    </RoleGuard>
  )
}

function ReportsContent() {
  const { role: authRole, user, superUser } = useAuthStore()
  // alpha_admin can open every staff role's report tabs; everyone else sees their own.
  const [viewAs, setViewAs] = useState<UserRole>('admin')
  const role = superUser ? viewAs : authRole

  // [UNIVERSAL PERIOD FILTER] Year and term come from the app-wide header
  // filter (useViewingPeriod): the person's pick if they made one, otherwise
  // the school's current period from SystemSettings. Until the period
  // resolves, no period-scoped query fires with a wrong guess, so panels
  // needing a year render only once one is known. The term select below
  // writes THROUGH to the global filter.
  const { academicYear: year, term: viewingTerm, isLoading: settingsLoading, setTerm } = useViewingPeriod()
  const term = viewingTerm ?? null

  // The active tab lives in the URL (?tab=) so dashboard KPIs can deep-link to a
  // report, a drilled view survives refresh, and Back works. An id the role does
  // not have falls back to its first tab.
  const router = useRouter()
  const [tabParam] = useReportParam('tab')
  const tabs = ROLE_TABS[role ?? 'student'] ?? []
  const requested = tabParam ? (TAB_ALIASES[role ?? '']?.[tabParam] ?? tabParam) : undefined
  const activeTab = tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id ?? 'overview'
  const setActiveTab = useCallback(
    (id: string) => router.replace(`/reports?tab=${encodeURIComponent(id)}`, { scroll: false }),
    [router],
  )

  // Admin's panels are period-independent, so they render without waiting.
  const periodReady = year !== undefined && term !== null

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">
            Reports &amp; Analytics
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {role === 'student'
              ? 'Your personal academic and financial reports'
              : 'Analytics dashboard for your role'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {superUser && (
            <SuperUserRoleSwitcher
              value={viewAs}
              onChange={(r) => {
                setViewAs(r)
                setActiveTab(ROLE_TABS[r]?.[0]?.id ?? 'overview')
              }}
            />
          )}
          <select
            value={term ?? ''}
            onChange={(e) => setTerm(Number(e.target.value))}
            disabled={term === null}
            aria-label="Select term"
            className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-navy/20 disabled:opacity-50"
          >
            {[1, 2, 3].map((t) => (
              <option key={t} value={t}>
                Term {t}
              </option>
            ))}
          </select>
          <ExportToolbar
            title={`Reports — ${(role ?? '').replace(/_/g, ' ')}`}
            filters={year ? [`Academic year: ${year}`, ...(term ? [`Term: ${term}`] : [])] : []}
          />
        </div>
      </div>

      <ModuleSurface>
        {/* ── Tab Bar ── */}
        {(ROLE_TABS[role ?? ''] ?? []).length > 1 && (
          <RoleTabs role={role ?? ''} active={activeTab} onChange={setActiveTab} />
        )}

        {/* ── Admin Panels (period-independent) ── */}
        {role === 'admin' && activeTab === 'overview' && (
          <div className="space-y-5">
            <AdminOverviewSection />
            <AdminOverviewPanel />
          </div>
        )}
        {role === 'admin' && activeTab === 'security' && <AdminSecurityTab />}
        {role === 'admin' && activeTab === 'sessions' && (
          <div className="space-y-5">
            <AdminSessionsReportTab />
            <AdminSessionsPanel />
          </div>
        )}
        {role === 'admin' && activeTab === 'governance' && (
          <div className="space-y-5">
            <AdminGovernanceTab />
            <AdminHeatmapPanel />
          </div>
        )}
        {role === 'admin' && activeTab === 'adoption' && <AdminAdoptionTab />}
        {role === 'admin' && activeTab === 'audit' && <AdminAuditPanel />}

        {/* Every other role's panels are scoped to an academic year and term. */}
        {role !== 'admin' &&
          !periodReady &&
          (settingsLoading ? (
            <SkeletonChart />
          ) : (
            <EmptyState message="The school's current academic year is not configured yet." />
          ))}

        {role !== 'admin' && periodReady && (
          <>
            {/* ── High Rank Panels ── */}
            {role === 'high_rank' && activeTab === 'overview' && (
              <ExecutiveOverviewTab academicYear={year} term={term} />
            )}
            {role === 'high_rank' && activeTab === 'performance' && (
              <HighRankPerformancePanel academicYear={year} term={term} />
            )}
            {role === 'high_rank' && activeTab === 'classes' && (
              <HighRankClassPanel academicYear={year} term={term} />
            )}
            {role === 'high_rank' && activeTab === 'teachers' && (
              <HighRankTeachersPanel academicYear={year} term={term} />
            )}
            {role === 'high_rank' && activeTab === 'enrollment' && (
              <div className="space-y-5">
                <EnrollmentTab academicYear={year} />
                <HighRankEnrollmentPanel />
              </div>
            )}
            {role === 'high_rank' && activeTab === 'admissions' && (
              <AdmissionsTab academicYear={year} term={term} />
            )}
            {role === 'high_rank' && activeTab === 'attendance' && (
              <AttendanceReportTab academicYear={year} term={term} />
            )}
            {role === 'high_rank' && activeTab === 'completion' && (
              <div className="space-y-5">
                <MarkCompletionTab academicYear={year} term={term} />
                <ExamPipelineTab academicYear={year} term={term} />
              </div>
            )}
            {role === 'high_rank' && activeTab === 'finance' && (
              <HighRankFinancePanel academicYear={year} term={term} />
            )}
            {role === 'high_rank' && activeTab === 'aging' && (
              <FinanceAgingTab academicYear={year} term={term} />
            )}
            {role === 'high_rank' && activeTab === 'procurement' && <ProcurementTab />}
            {role === 'high_rank' && activeTab === 'stocktake' && <StocktakeTab academicYear={year} />}
            {role === 'high_rank' && activeTab === 'workforce' && (
              <div className="space-y-5">
                <HrOverviewTab academicYear={year} />
                <HrWorkforceTab />
              </div>
            )}
            {role === 'high_rank' && activeTab === 'leave' && <HrLeaveTab />}
            {role === 'high_rank' && activeTab === 'contracts' && <HrContractsTab />}
            {role === 'high_rank' && activeTab === 'circulation' && (
              <div className="space-y-5">
                <LibraryOverviewSection />
                <LibraryCirculationTab />
              </div>
            )}
            {role === 'high_rank' && activeTab === 'governance' && <AdminGovernanceTab />}
            {role === 'high_rank' && activeTab === 'placements' && (
              <PlacementAnalyticsPanel academicYear={year} />
            )}
            {role === 'high_rank' && activeTab === 'summary' && (
              <HighRankSummaryPanel academicYear={year} term={term} />
            )}

            {/* ── Finance Panels ── */}
            {role === 'finance' && activeTab === 'overview' && (
              <FinanceOverviewTab academicYear={year} term={term} />
            )}
            {role === 'finance' && activeTab === 'collection' && <FinanceCollectionPanel />}
            {role === 'finance' && activeTab === 'outstanding' && (
              <FinanceOutstandingPanel academicYear={year} term={term} />
            )}
            {role === 'finance' && activeTab === 'aging' && (
              <FinanceAgingTab academicYear={year} term={term} />
            )}
            {role === 'finance' && activeTab === 'payments' && (
              <FinancePaymentsTab academicYear={year} term={term} />
            )}
            {role === 'finance' && activeTab === 'expenses' && (
              <FinanceExpensesPanel academicYear={year} term={term} />
            )}
            {role === 'finance' && activeTab === 'cashflow' && (
              <FinanceCashFlowPanel academicYear={year} />
            )}
            {role === 'finance' && activeTab === 'payroll' && <FinancePayrollPanel />}
            {role === 'finance' && activeTab === 'scholarships' && (
              <FinanceScholarshipsPanel academicYear={year} />
            )}
            {role === 'finance' && activeTab === 'procurement' && <ProcurementTab />}
            {role === 'finance' && activeTab === 'stocktake' && <StocktakeTab academicYear={year} />}
            {role === 'finance' && activeTab === 'summary' && (
              <FinanceSummaryPanel academicYear={year} term={term} />
            )}

            {/* ── Library Panels ── */}
            {role === 'library' && activeTab === 'overview' && (
              <div className="space-y-5">
                <LibraryOverviewSection />
                <LibraryOverviewPanel />
              </div>
            )}
            {role === 'library' && activeTab === 'circulation' && <LibraryCirculationTab />}
            {role === 'library' && activeTab === 'borrowing' && <LibraryBorrowingPanel />}
            {role === 'library' && activeTab === 'fines' && <LibraryFinesTab />}
            {role === 'library' && activeTab === 'digital' && <LibraryDigitalPanel />}

            {/* ── Lower Rank Panels ── */}
            {role === 'lower_rank' && activeTab === 'admissions' && (
              <AdmissionsTab academicYear={year} term={term} />
            )}
            {role === 'lower_rank' && activeTab === 'enrollment' && (
              <EnrollmentTab academicYear={year} />
            )}
            {role === 'lower_rank' && activeTab === 'attendance' && (
              <AttendanceReportTab academicYear={year} term={term} />
            )}

            {/* ── Academic Staff Panels ── */}
            {role === 'academic' && activeTab === 'teaching' && (
              <AcademicTeachingTab academicYear={year} term={term} />
            )}
            {role === 'academic' && activeTab === 'assignments' && (
              <AcademicAssignmentsTab academicYear={year} term={term} />
            )}
            {role === 'academic' && activeTab === 'marks' && (
              <div className="space-y-5">
                <MarkCompletionTab academicYear={year} term={term} showTeachers={false} />
                <MarksDistributionPanel />
              </div>
            )}
            {role === 'academic' && activeTab === 'students' && (
              <AcademicStudentsTab academicYear={year} term={term} />
            )}
            {role === 'academic' && activeTab === 'readiness' && (
              <AcademicReadinessTab academicYear={year} term={term} />
            )}
            {role === 'academic' && activeTab === 'attendance' && (
              <AttendanceReportTab academicYear={year} term={term} />
            )}
            {role === 'academic' && activeTab === 'summary' && (
              <AcademicSummaryPanel academicYear={year} />
            )}

            {/* ── Exam Officer Panels ── */}
            {role === 'exam_officer' && activeTab === 'completion' && (
              <MarkCompletionTab academicYear={year} term={term} />
            )}
            {role === 'exam_officer' && activeTab === 'pipeline' && (
              <ExamPipelineTab academicYear={year} term={term} />
            )}
            {role === 'exam_officer' && activeTab === 'maneb' && (
              <ManebAnalyticsPanel academicYear={year} />
            )}
            {role === 'exam_officer' && activeTab === 'candidates' && (
              <ManebCandidatesPanel academicYear={year} />
            )}
            {role === 'exam_officer' && activeTab === 'subjects' && (
              <AcademicSubjectsPanel academicYear={year} term={term} />
            )}
            {role === 'exam_officer' && activeTab === 'marks' && <MarksDistributionPanel />}
            {role === 'exam_officer' && activeTab === 'placements' && (
              <PlacementAnalyticsPanel academicYear={year} />
            )}

            {/* ── HR Panels ── */}
            {role === 'hr' && activeTab === 'overview' && <HrOverviewTab academicYear={year} />}
            {role === 'hr' && activeTab === 'workforce' && <HrWorkforceTab />}
            {role === 'hr' && activeTab === 'leave' && <HrLeaveTab />}
            {role === 'hr' && activeTab === 'contracts' && <HrContractsTab />}
            {role === 'hr' && activeTab === 'loans' && <HrLoansTab />}
            {role === 'hr' && activeTab === 'reviews' && <HrReviewsTab academicYear={year} />}

            {/* ── Student Panels (self-only; fee-gated results) ── */}
            {role === 'student' && activeTab === 'overview' && (
              <StudentOverviewTab academicYear={year} term={term} />
            )}
            {role === 'student' && activeTab === 'progress' && (
              <StudentProgressTab academicYear={year} term={term} />
            )}
            {role === 'student' && activeTab === 'assignments' && (
              <StudentAssignmentsTab academicYear={year} term={term} />
            )}
            {role === 'student' && activeTab === 'attendance' && (
              <StudentAttendanceTab academicYear={year} term={term} />
            )}
            {role === 'student' && activeTab === 'library' && (
              <StudentLibraryTab academicYear={year} term={term} />
            )}
            {role === 'student' && activeTab === 'fees' && (
              <StudentFeesTab academicYear={year} term={term} />
            )}
            {role === 'student' && activeTab === 'summary' && (
              <StudentSummaryPanel studentId={user?.uid ?? ''} />
            )}
          </>
        )}
      </ModuleSurface>
    </div>
  )
}

