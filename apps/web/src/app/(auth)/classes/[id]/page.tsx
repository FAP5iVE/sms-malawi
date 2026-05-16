'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useClass, useClassTimetable } from '@/hooks/useClasses'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { AttendanceSheet } from '@/components/classes/AttendanceSheet'
import { ArrowLeft, Users, ClipboardCheck, Clock } from 'lucide-react'

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

function ClassDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { data: cls, isLoading } = useClass(id)
  const { data: slots = [] } = useClassTimetable(id, 1)
  const [activeTab, setActiveTab] = useState<Tab>('roster')

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
    { id: 'roster', label: 'Student Roster', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { id: 'timetable', label: 'Timetable', icon: Clock },
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
              {(cls.students ?? []).map((student: any, i: number) => (
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
                slots.map((slot: any) => (
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
    </div>
  )
}
