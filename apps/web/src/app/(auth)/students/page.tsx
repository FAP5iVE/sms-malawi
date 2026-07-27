'use client'

/**
 * apps/web/src/app/(auth)/students/page.tsx — Phase C5
 * [CHANGE TYPE]: TARGETED EDIT (R5); further edited in R8 — Academics IV:
 *   Report Cards, Transcripts, Promotion & Risk Assessment
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: (1) 'Add Student' visibility moves from RoleGuard(['admin',
 *   'high_rank','lower_rank']) to PermissionGuard permission="student.
 *   create" — admin correctly lacks student.create per the confirmed-
 *   correct permission matrix (Phase 10A), and RoleGuard's hand-maintained
 *   role list can't express that distinction (sms-erp-security Rule 6).
 *   (2) mobileActions' Edit/Archive are now built conditionally from a real
 *   usePermissions() check instead of appearing unconditionally for all 8
 *   roles allowed on this page — three of those roles (finance, library,
 *   hr) hold neither student.edit nor student.softDelete and previously
 *   got a silent 403 tapping either. (3) The archive mutation now surfaces
 *   a 403/failure via an inline role="alert" banner instead of failing
 *   silently. R8 adds a Risk column wiring in StudentRiskBadge.tsx (badge
 *   variant, sourced from the already-fetched ApiStudent.riskLevel — no
 *   new query) — one of the four locations that component's own header
 *   comment already claimed it was used, before this phase made it true.
 *
 * R15 — UI/UX Polish:
 *   • DataTable's new onSort callback is wired through to the list query's
 *     sortBy/sortDir parameters (useStudents → GET /students → the
 *     allow-listed server-side sort added the same phase), so sorting this
 *     server-paginated table re-orders the whole dataset, not just the
 *     visible page. Sorting resets to page 1.
 *   • The bulk-archive action — previously N immediate soft-deletes from a
 *     single unconfirmed tap — now routes through the shared ConfirmDialog
 *     stating exactly how many students it will archive.
 *
 * C5 changes applied:
 *   • COLUMNS gain `priority` field — registrationNo + Student: 'critical' (always
 *     visible); Class: 'important' (md+); Status: 'important' (md+); Fees: 'optional' (lg+).
 *     The DataTable C3 priority system maps these to CSS hide/show classes.
 *   • `mobileActions` prop added — Edit (opens StudentForm in edit mode) and
 *     Archive (soft-deletes) accessible via the ⋯ bottom-sheet on mobile cards.
 *   • `editStudentId` state — when set, renders StudentForm in edit mode.
 *   • "Add Student" button enforces min-h-[44px] touch target (WCAG 2.5.5 / C5).
 *   • StudentForm is rendered for both create (`showForm`) and edit (`editStudentId`)
 *     without wrapping AnimatePresence — the form manages its own exit animation
 *     via its internal visible state and onExitComplete callback.
 */

import { useState }                               from 'react'
import { Archive, Pencil, UserPlus }              from 'lucide-react'
import { useStudents, useArchiveStudent }          from '@/hooks/useStudents'
import { useClasses }                             from '@/hooks/useClasses'
import { usePermissions }                         from '@/hooks/usePermissions'
import { RoleGuard }                              from '@/components/shared/RoleGuard'
import { PermissionGuard }                        from '@/components/shared/PermissionGuard'
import { StudentForm }                            from '@/components/students/StudentForm'
import { DataTable }                              from '@/components/shared/DataTable'
import type { DataColumn, MobileAction }          from '@/components/shared/DataTable'
import ConfirmDialog                              from '@/components/shared/ConfirmDialog'
import { StudentRiskBadge }                       from '@/components/shared/StudentRiskBadge'
import type { ApiStudent }                        from '@shared/types/api'
import { useRouter }                              from 'next/navigation'

type Student = ApiStudent

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:                 'bg-brand-teal/15 text-brand-teal',
  ARCHIVED:               'bg-base text-muted',
  AWAITING_MANEB_RESULTS: 'bg-blue-50 text-blue-700',
  GRADUATED:              'bg-purple-50 text-purple-700',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-1 rounded-full
        text-xs font-heading font-semibold
        ${STATUS_STYLES[status] ?? 'bg-base text-muted'}
      `}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUMNS — priority system wires to DataTable C3 CSS column visibility
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS: DataColumn<Student>[] = [
  {
    key:      'registrationNo',
    label:    'Reg No.',
    sortable: true,
    width:    'w-28',
    // Always visible — primary identifier on all screen sizes
    priority: 'critical',
  },
  {
    key:      'firstName',
    label:    'Student',
    sortable: true,
    // Always visible — name is the secondary identifier on mobile
    priority: 'critical',
    render: (s: Student) => (
      <div>
        <p className="font-heading font-medium text-body text-sm">
          {s.firstName} {s.lastName}
        </p>
        <p className="text-xs text-muted">{s.sex}</p>
      </div>
    ),
  },
  {
    key:      'class',
    label:    'Class',
    sortable: false,
    // Visible on tablet + desktop; hidden on mobile (card shows it as key-value)
    priority: 'important',
    render: (s: Student) => (
      <span className="text-sm text-body">{s.class?.name ?? '—'}</span>
    ),
  },
  {
    key:      'status',
    label:    'Status',
    sortable: true,
    priority: 'important',
    render: (s: Student) => <StatusBadge status={s.status} />,
  },
  {
    // R15 (typecheck cleanup in a touched file): this column read
    // s.feesStatus — a field that exists neither on ApiStudent nor in the
    // list payload (a baseline-confirmed type error) — so every row always
    // rendered the falsy branch. Derived from the real feeBalance field
    // the list actually returns: 0 (or absent) balance = cleared.
    key:      'feeBalance',
    label:    'Fees',
    sortable: false,
    // Optional: only visible on desktop (lg+); finance-relevant detail
    priority: 'optional',
    render: (s: Student) => {
      const cleared = (s.feeBalance ?? 0) <= 0
      return (
        <span
          className={`
            text-xs font-semibold px-2 py-0.5 rounded-full
            ${cleared
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-brand-coral/10 text-brand-coral'}
          `}
        >
          {cleared ? 'Cleared' : 'Outstanding'}
        </span>
      )
    },
  },
  {
    key:      'riskLevel',
    label:    'Risk',
    sortable: false,
    // Optional: only visible on desktop (lg+) — a compact severity signal,
    // not the primary reason someone opens this list.
    priority: 'optional',
    render: (s: Student) => <StudentRiskBadge riskLevel={s.riskLevel ?? 'NONE'} variant="badge" />,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// QUICK FILTERS
// ─────────────────────────────────────────────────────────────────────────────

const QUICK_FILTERS = [
  { label: 'Active',          value: 'ACTIVE' },
  { label: 'Graduated',       value: 'GRADUATED' },
  { label: 'Awaiting MANEB',  value: 'AWAITING_MANEB_RESULTS' },
  { label: 'Archived',        value: 'ARCHIVED' },
]

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function StudentsPage() {
  return (
    <RoleGuard
      allowed={[
        'admin',
        'high_rank',
        'finance',
        'library',
        'lower_rank',
        'academic',
        'hr',
        'exam_officer',
      ]}
    >
      <StudentsContent />
    </RoleGuard>
  )
}

function StudentsContent() {
  const router = useRouter()
  const [showForm,      setShowForm]      = useState(false)
  const [editStudentId, setEditStudentId] = useState<string | null>(null)
  const [status,        setStatus]        = useState('ACTIVE')
  const [page,          setPage]          = useState(1)
  const [actionError,   setActionError]   = useState<string | null>(null)
  // R15 — server-side sort state, dispatched by DataTable's onSort
  const [sortBy,  setSortBy]  = useState<string | undefined>(undefined)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | undefined>(undefined)
  // R15 — ids awaiting bulk-archive confirmation (null = dialog closed)
  const [pendingArchiveIds, setPendingArchiveIds] = useState<string[] | null>(null)
  // R19 — free-text search, wired to useStudents()'s existing `search` filter
  const [search, setSearch] = useState('')
  // Class filter — useStudents + GET /students already support classId; this
  // adds the UI control. Empty string = all classes.
  const [classId, setClassId] = useState('')

  const { data: classes = [] } = useClasses()

  const { data, isLoading } = useStudents(
    sortBy && sortDir
      ? { status, page, sortBy, sortDir, search: search || undefined, classId: classId || undefined }
      : { status, page, search: search || undefined, classId: classId || undefined },
  )
  const archive             = useArchiveStudent()
  const { can }             = usePermissions()

  function handleArchive(id: string) {
    setActionError(null)
    archive.mutate(id, {
      onError: (err) => setActionError(err instanceof Error ? err.message : 'Failed to archive student.'),
    })
  }

  // ── Mobile per-row actions — rendered in the C3 bottom-sheet, gated on
  // the actual permission each action requires rather than shown
  // unconditionally to every role allowed on this page.
  const mobileActions: MobileAction<Student>[] = [
    ...(can('student.edit')
      ? [{
          label:   'Edit',
          icon:    Pencil,
          variant: 'default' as const,
          onClick: (row: Student) => setEditStudentId(row.id),
        }]
      : []),
    ...(can('student.softDelete')
      ? [{
          label:   'Archive',
          icon:    Archive,
          variant: 'danger' as const,
          onClick: (row: Student) => handleArchive(row.id),
        }]
      : []),
  ]

  return (
    <div className="space-y-5">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-xl font-bold text-brand-navy">
            Students
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {data?.total ?? '—'} students enrolled
          </p>
        </div>

        {/* R19 — server-backed search (GET /students already supports `search`) */}
        <div className="flex w-full sm:w-auto gap-2">
          <div className="flex-1 sm:w-72">
            <label htmlFor="student-search" className="sr-only">Search students</label>
            <input
              id="student-search"
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by name or registration no…"
              className="w-full min-h-[44px] border border-base rounded-xl px-4 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          <div className="w-40 sm:w-48">
            <label htmlFor="student-class-filter" className="sr-only">Filter by class</label>
            <select
              id="student-class-filter"
              value={classId}
              onChange={(e) => { setClassId(e.target.value); setPage(1) }}
              className="w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            >
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Add Student — min-h-[44px] enforced for C5 touch target */}
        <PermissionGuard permission="student.create">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="
              flex items-center gap-2
              min-h-[44px] px-5 rounded-xl
              text-sm font-heading font-semibold
              bg-brand-teal text-white
              hover:bg-brand-teal/90 transition-colors
            "
          >
            <UserPlus className="w-4 h-4" aria-hidden />
            Add Student
          </button>
        </PermissionGuard>
      </div>

      {actionError && (
        <p
          role="alert"
          className="text-sm text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3"
        >
          {actionError}
        </p>
      )}

      {/* ── Data table ──────────────────────────────────────────────────── */}
      {/*
        columns: priority system hides low-priority columns on small screens.
        mobileActions: Edit + Archive appear in the C3 per-row bottom sheet,
        each only when the current user actually holds the permission it requires.
      */}
      <DataTable<Student>
        data={data?.students ?? []}
        isLoading={isLoading}
        columns={COLUMNS}
        quickFilters={QUICK_FILTERS}
        activeQuickFilter={status}
        onQuickFilter={(v) => {
          setStatus(v)
          setPage(1)
        }}
        rowKey="id"
        mobileActions={mobileActions}
        onRowClick={(row) => router.push(`/students/${row.id}`)}
        onBulkArchive={(ids) => setPendingArchiveIds(ids)}
        onSort={(column, direction) => {
          setSortBy(column)
          setSortDir(direction)
          setPage(1)
        }}
        pagination={{
          page,
          pages: data?.pages ?? 1,
          onPageChange: setPage,
        }}
        emptyMessage="No students found for this filter."
      />

      {/* ── StudentForm — create ─────────────────────────────────────────── */}
      {/*
        StudentForm manages its own visible state and exit animation.
        When onClose fires (after exit animation completes), we clear the
        open flags. No wrapping AnimatePresence needed here.
      */}
      {showForm && (
        <StudentForm
          key="student-form-create"
          onClose={() => setShowForm(false)}
        />
      )}

      {/* ── StudentForm — edit ───────────────────────────────────────────── */}
      {editStudentId && (
        <StudentForm
          key={`student-form-edit-${editStudentId}`}
          studentId={editStudentId}
          onClose={() => setEditStudentId(null)}
        />
      )}

      {/* ── R15 — bulk-archive confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={pendingArchiveIds !== null}
        title={
          pendingArchiveIds && pendingArchiveIds.length === 1
            ? 'Archive this student?'
            : `Archive ${pendingArchiveIds?.length ?? 0} students?`
        }
        description={
          pendingArchiveIds
            ? `${pendingArchiveIds.length === 1 ? 'This student' : `These ${pendingArchiveIds.length} students`} will be archived (soft-deleted) and removed from the active list. Records are preserved and can be restored by an administrator.`
            : ''
        }
        confirmLabel="Archive"
        destructive
        onConfirm={() => {
          pendingArchiveIds?.forEach((id) => handleArchive(id))
          setPendingArchiveIds(null)
        }}
        onCancel={() => setPendingArchiveIds(null)}
      />
    </div>
  )
}