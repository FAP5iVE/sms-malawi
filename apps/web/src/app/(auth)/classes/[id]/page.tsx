'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getAuth } from 'firebase/auth'
import { useClass, useClassTimetable } from '@/hooks/useClasses'
import type { ApiClass, ApiTimetableSlot } from '@shared/types/api'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { AttendanceSheet } from '@/components/classes/AttendanceSheet'
import { ArrowLeft, Users, ClipboardCheck, Clock, BookOpen } from 'lucide-react'

type Tab = 'roster' | 'attendance' | 'timetable' | 'assignments'

export default function ClassDetailPage() {
  return (
    <RoleGuard
      allowed={['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']}
    >
      <ClassDetailContent />
    </RoleGuard>
  )
}

interface ApiAssignment {
  id: string
  title: string
  subject: string
  dueDate: string
  submissions?: unknown[]
}

interface RosterStudent {
  id: string
  firstName: string
  lastName: string
  registrationNo: string
  sex: string
}

function ClassDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { data: cls, isLoading } = useClass(id)
  const { data: slots = [] } = useClassTimetable(id, 1)
  const [activeTab, setActiveTab] = useState<Tab>('roster')
  const [assignments, setAssignments] = useState<ApiAssignment[]>([])

  // Fetch assignments when tab opens
  useEffect(() => {
    if (activeTab !== 'assignments') return
    getAuth()
      .currentUser?.getIdToken()
      .then((token) =>
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/classes/${id}/assignments`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then(setAssignments)
      )
  }, [activeTab, id])

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

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'roster', label: 'Students', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { id: 'timetable', label: 'Timetable', icon: Clock },
    { id: 'assignments', label: 'Assignments', icon: BookOpen },
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
      <div className="flex gap-1 border-b border-base">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.id
                  ? 'border-brand-teal text-brand-teal'
                  : 'border-transparent text-muted hover:text-body',
              ].join(' ')}
              aria-label={tab.label}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}

      {activeTab === 'roster' && (
        <div className="bg-surface border border-base rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base bg-page">
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                  #
                </th>
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                  Name
                </th>
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                  Reg No
                </th>
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                  Sex
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(cls.students ?? []).map((student: RosterStudent, i: number) => (
                <tr
                  key={student.id}
                  className="border-b border-base hover:bg-page transition-colors"
                >
                  <td className="px-4 py-3 text-muted tabular text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">
                    {student.firstName} {student.lastName}
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs tabular">
                    {student.registrationNo}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">{student.sex}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/students/${student.id}`}
                      className="text-brand-teal text-xs font-medium hover:underline"
                    >
                      Profile
                    </Link>
                  </td>
                </tr>
              ))}
              {(cls.students ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted text-sm">
                    No students assigned to this class yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-3">
          <RoleGuard
            allowed={['admin', 'high_rank', 'academic', 'exam_officer']}
            fallback={
              <div className="bg-surface border border-base rounded-xl p-6 text-center text-sm text-muted">
                Only teachers and admin can mark attendance
              </div>
            }
          >
            <AttendanceSheet classId={id} students={cls.students ?? []} />
          </RoleGuard>
        </div>
      )}

      {activeTab === 'timetable' && (
        <div className="bg-surface border border-base rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base bg-page">
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                  Day
                </th>
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                  Time
                </th>
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                  Subject
                </th>
                <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                  Room
                </th>
              </tr>
            </thead>
            <tbody>
              {slots.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted text-sm">
                    No timetable for Term 1
                  </td>
                </tr>
              ) : (
                slots.map((slot: ApiTimetableSlot) => (
                  <tr key={slot.id} className="border-b border-base hover:bg-page">
                    <td className="px-4 py-3 font-medium">{slot.day}</td>
                    <td className="px-4 py-3 text-muted tabular font-mono text-xs">
                      {slot.periodStart}–{slot.periodEnd}
                    </td>
                    <td className="px-4 py-3">{slot.subject}</td>
                    <td className="px-4 py-3 text-muted">{slot.room ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-semibold text-brand-navy">Assignments</h3>
            <RoleGuard allowed={['admin', 'high_rank', 'academic']}>
              <button
                onClick={() => {
                  /* AssignmentForm not yet implemented */
                }}
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
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-heading font-semibold text-body">{a.title}</p>
                      <p className="text-sm text-muted mt-0.5">
                        {a.subject} · Due: {new Date(a.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-xs bg-brand-teal/10 text-brand-teal px-2.5 py-1 rounded-full font-semibold">
                      {a.submissions?.length ?? 0} submitted
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
