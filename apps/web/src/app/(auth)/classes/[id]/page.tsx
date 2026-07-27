/**
 * [CHANGE TYPE]: MAJOR REWRITE of the Assignments tab's "+ New Assignment"
 *   wiring and the Roster/Timetable tabs' table markup; the page's overall
 *   layout and tab structure are otherwise unaffected. Further edited in
 *   R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment (Roster tab gains a Risk column).
 * [FILE]: apps/web/src/app/(auth)/classes/[id]/page.tsx
 * [R-PHASE]: R1 (Assignments tab's data-fetching, retained — already
 *   sources from useClass(id)'s Prisma include, no separate fetch); R6 —
 *   Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]:
 *   0. (R8) Roster tab's DataTable gains a Risk column wiring in
 *      StudentRiskBadge.tsx (dot variant, sourced from the already-loaded
 *      ApiStudent.riskLevel via useClass(id) — no new query) — one of the
 *      four locations that component's own header comment already
 *      claimed it was used, before this phase made it true.
 *   1. Wired the "+ New Assignment" button's previously-empty onClick to
 *      open the new AssignmentForm.
 *   2. Roster and Timetable tabs: replaced bespoke raw <table> markup with
 *      DataTable.tsx; replaced the bespoke tab-switcher with ModuleTabs.tsx.
 *   3. Added a term selector to the Timetable tab (useClassTimetable(id,
 *      term) in place of the hardcoded useClassTimetable(id, 1)); pending
 *      (unapproved) exam_officer-created slots now show a visible
 *      "Pending approval" indicator rather than looking identical to a
 *      live slot.
 *   4. Roster tab's "Profile" link to /students/:id now renders
 *      conditionally based on whether the current viewer's role can
 *      actually reach that page (mirrors students/[id]/page.tsx's own
 *      RoleGuard allowlist exactly) instead of unconditionally producing a
 *      dead end for student-role viewers.
 *   5. Attendance tab's wrapping guard changed from RoleGuard(['admin',
 *      'high_rank','academic','exam_officer']) to PermissionGuard
 *      permission="class.markAttendance" — the backend's real access
 *      control for attendance (this same phase) only grants that
 *      permission to 'academic'; the old broader guard let admin/
 *      high_rank/exam_officer open a UI that would then 403 on every
 *      interaction, exactly the class of front-end/back-end mismatch this
 *      audit repeatedly flags.
 * [DEPENDS ON]: apps/web/src/hooks/useClasses.ts, @shared/types/api,
 *   apps/web/src/components/classes/AssignmentForm.tsx,
 *   apps/web/src/components/classes/AttendanceSheet.tsx (rewritten in the
 *   same phase), apps/web/src/components/shared/DataTable.tsx,
 *   apps/web/src/components/shared/ModuleTabs.tsx
 */
'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useClass, useClassTimetable } from '@/hooks/useClasses'
import { useAuthStore } from '@/store/authStore'
import type { ApiTimetableSlot } from '@shared/types/api'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { StudentRiskBadge } from '@/components/shared/StudentRiskBadge'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { AttendanceSheet } from '@/components/classes/AttendanceSheet'
import AssignmentForm from '@/components/classes/AssignmentForm'
import { TimetableSlotForm } from '@/components/classes/TimetableSlotForm'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import type { TabItem } from '@/components/shared/ModuleTabs'
import { ArrowLeft, Users, ClipboardCheck, Clock, BookOpen, Hourglass, Plus } from 'lucide-react'

type Tab = 'roster' | 'attendance' | 'timetable' | 'assignments'

// Mirrors students/[id]/page.tsx's own RoleGuard allowlist exactly — a
// student-role viewer cannot reach that page, so the Roster tab's
// "Profile" link must not be offered to them either. Kept local rather
// than imported since the source page doesn't export its allowlist as a
// reusable constant.
const STUDENT_PROFILE_VIEWER_ROLES = [
  'admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer',
] as const

export default function ClassDetailPage() {
  return (
    <RoleGuard
      allowed={['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']}
    >
      <ClassDetailContent />
    </RoleGuard>
  )
}

interface RosterStudent {
  id: string
  firstName: string
  lastName: string
  registrationNo: string
  sex: string
  riskLevel?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
}

function ClassDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { data: cls, isLoading } = useClass(id)
  const { role } = useAuthStore()
  const [term, setTerm] = useState(1)
  const { data: slots = [] } = useClassTimetable(id, term)
  const [activeTab, setActiveTab] = useState<Tab>('roster')
  const [showAssignmentForm, setShowAssignmentForm] = useState(false)
  const [showSlotForm, setShowSlotForm] = useState(false)
  // classService.getClass()'s Prisma `include` already returns assignments —
  // no second request needed once the Assignments tab is opened.
  const assignments = cls?.assignments ?? []

  const canViewStudentProfile = role
    ? (STUDENT_PROFILE_VIEWER_ROLES as readonly string[]).includes(role)
    : false

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    )
  }

  if (!cls) {
    return <p className="text-muted">Class not found.</p>
  }

  const TABS: TabItem<Tab>[] = [
    { id: 'roster', label: 'Students', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { id: 'timetable', label: 'Timetable', icon: Clock },
    { id: 'assignments', label: 'Assignments', icon: BookOpen, badge: assignments.length },
  ]

  const rosterColumns: DataColumn<RosterStudent>[] = [
    {
      key: 'firstName',
      label: 'Name',
      priority: 'critical',
      render: (s) => `${s.firstName} ${s.lastName}`,
    },
    { key: 'registrationNo', label: 'Reg No', priority: 'important' },
    { key: 'sex', label: 'Sex', priority: 'optional' },
    {
      key: 'riskLevel',
      label: 'Risk',
      priority: 'optional',
      render: (s) => <StudentRiskBadge riskLevel={s.riskLevel ?? 'NONE'} variant="dot" />,
    },
    {
      key: 'profile',
      label: '',
      priority: 'important',
      render: (s) =>
        canViewStudentProfile ? (
          <Link href={`/students/${s.id}`} className="text-brand-teal text-xs font-medium hover:underline">
            Profile
          </Link>
        ) : null,
    },
  ]

  const timetableColumns: DataColumn<ApiTimetableSlot>[] = [
    { key: 'day', label: 'Day', priority: 'critical' },
    {
      key: 'periodStart',
      label: 'Time',
      priority: 'critical',
      render: (s) => `${s.periodStart}–${s.periodEnd}`,
    },
    { key: 'subject', label: 'Subject', priority: 'important' },
    { key: 'room', label: 'Room', priority: 'optional', render: (s) => s.room ?? '—' },
    {
      key: 'approvedAt',
      label: 'Status',
      priority: 'important',
      render: (s) =>
        s.approvedAt ? null : (
          <span className="inline-flex items-center gap-1 text-[10px] font-heading font-semibold text-brand-amber bg-brand-amber/10 border border-brand-amber/30 rounded-full px-2 py-0.5">
            <Hourglass className="w-2.5 h-2.5" aria-hidden />
            Pending approval
          </span>
        ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/classes"
          className="p-1.5 rounded-lg hover:bg-page border border-base"
          aria-label="Back to classes"
        >
          <ArrowLeft className="w-4 h-4 text-muted" />
        </Link>
        <div>
          <h1 className="font-heading text-xl font-bold text-brand-navy">{cls.name}</h1>
          <p className="text-sm text-muted">
            Form {cls.form}
            {cls.stream ? ` · ${cls.stream}` : ''}
            {cls.room ? ` · ${cls.room}` : ''}
            {` · ${cls.students?.length ?? 0} students`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <ModuleTabs<Tab>
        id="class-detail-tabs"
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        variant="underline"
      />

      {/* Tab content */}

      {activeTab === 'roster' && (
        <DataTable<RosterStudent>
          data={cls.students ?? []}
          isLoading={false}
          columns={rosterColumns}
          rowKey="id"
          emptyMessage="No students assigned to this class yet."
        />
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-3">
          <PermissionGuard
            permission="class.markAttendance"
            fallback={
              <div className="bg-surface border border-base rounded-xl p-6 text-center text-sm text-muted">
                Only this class&apos;s assigned teacher can mark attendance.
              </div>
            }
          >
            <AttendanceSheet classId={id} students={cls.students ?? []} />
          </PermissionGuard>
        </div>
      )}

      {activeTab === 'timetable' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <RoleGuard allowed={['admin', 'high_rank', 'exam_officer']}>
              <button
                type="button"
                onClick={() => setShowSlotForm(true)}
                className="inline-flex items-center gap-2 bg-brand-teal text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-brand-teal-light min-h-11"
              >
                <Plus className="w-4 h-4" aria-hidden />
                Add Slot
              </button>
            </RoleGuard>
            <label className="flex items-center gap-2 text-sm text-muted ml-auto">
              Term
              <select
                value={term}
                onChange={(e) => setTerm(Number(e.target.value))}
                className="border border-base rounded-lg px-2 py-1.5 text-sm bg-surface min-h-[36px]"
              >
                {[1, 2, 3].map((t) => (
                  <option key={t} value={t}>Term {t}</option>
                ))}
              </select>
            </label>
          </div>

          {showSlotForm && (
            <TimetableSlotForm
              classId={id}
              academicYear={cls.academicYear}
              term={term}
              onClose={() => setShowSlotForm(false)}
            />
          )}

          <DataTable<ApiTimetableSlot>
            data={slots}
            isLoading={false}
            columns={timetableColumns}
            rowKey="id"
            emptyMessage={`No timetable for Term ${term}.`}
          />
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-semibold text-brand-navy">Assignments</h3>
            <RoleGuard allowed={['admin', 'high_rank', 'academic']}>
              <button
                onClick={() => setShowAssignmentForm(true)}
                className="flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-brand-teal-light transition-colors"
              >
                + New Assignment
              </button>
            </RoleGuard>
          </div>

          {assignments.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm border border-base rounded-xl">
              No assignments yet. Click &quot;New Assignment&quot; to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((a) => (
                <div key={a.id} className="bg-surface border border-base rounded-xl p-4">
                  <p className="font-heading font-semibold text-body">{a.title}</p>
                  <p className="text-sm text-muted mt-0.5">
                    {a.subject} · Due: {new Date(a.dueDate).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAssignmentForm && (
        <AssignmentForm classId={id} onClose={() => setShowAssignmentForm(false)} />
      )}
    </div>
  )
}