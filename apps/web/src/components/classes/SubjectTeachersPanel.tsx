/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/classes/SubjectTeachersPanel.tsx
 * [PURPOSE]: The per-class "Subjects & teachers" workflow — the subject
 *   counterpart of picking a class teacher. Every subject the class offers
 *   (its preset list) gets exactly one teacher for the academic year.
 *   Assigning a subject is what unlocks it: only the assigned teacher (or the
 *   class teacher) can set assignments / enter marks for it, and students and
 *   that teacher only ever see assignments for it
 *   (assignmentService.scopeForViewer). Subjects with no teacher are listed
 *   with a warning so nothing is silently left without an owner.
 *
 *   Managers (class.assignSubject) can assign, change and remove; everyone
 *   else who reaches this panel gets the same list read-only.
 * [DEPENDS ON]: hooks/useClasses (useClassSubjects, useClassSubjectAssignments,
 *   useAssignSubjectTeacher, useChangeSubjectTeacher, useRemoveSubjectTeacher,
 *   useBackfillSubjectAssignments), hooks/useHR (useTeacherRoster),
 *   components/shared/TeacherSelect
 */
'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, Trash2, Download } from 'lucide-react'
import {
  useClassSubjects, useClassSubjectAssignments, useAssignSubjectTeacher,
  useChangeSubjectTeacher, useRemoveSubjectTeacher, useBackfillSubjectAssignments,
} from '@/hooks/useClasses'
import { useTeacherRoster } from '@/hooks/useHR'
import { TeacherSelect } from '@/components/shared/TeacherSelect'

interface Props {
  classId:         string
  academicYear:    string
  classTeacherUid: string | null | undefined
  /** Holds class.assignSubject — may assign, change and remove. */
  canManage:       boolean
}

export function SubjectTeachersPanel({ classId, academicYear, classTeacherUid, canManage }: Props) {
  const { data: meta, isLoading: loadingSubjects } = useClassSubjects(classId)
  const { data: rows = [], isLoading: loadingRows } = useClassSubjectAssignments(classId, academicYear)
  const { data: roster = [] } = useTeacherRoster()

  const assign   = useAssignSubjectTeacher()
  const change   = useChangeSubjectTeacher()
  const remove   = useRemoveSubjectTeacher()
  const backfill = useBackfillSubjectAssignments()

  const [error, setError]   = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const subjects = meta?.subjects ?? []
  const byName   = useMemo(() => new Map(rows.map((r) => [r.subject, r])), [rows])
  const nameOf   = (uid: string) => {
    const t = roster.find((x) => x.uid === uid)
    return t ? `${t.firstName} ${t.lastName}` : 'Assigned teacher'
  }
  const unassigned = subjects.filter((s) => !byName.has(s))

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')

  function pick(subject: string, teacherUid: string) {
    setError(null); setNotice(null)
    const existing = byName.get(subject)
    if (existing) {
      if (existing.teacherUid === teacherUid) return
      change.mutate({ id: existing.id, teacherUid }, { onError: fail })
    } else {
      assign.mutate({ classId, subject, teacherUid, academicYear }, { onError: fail })
    }
  }

  function unassign(id: string) {
    setError(null); setNotice(null)
    remove.mutate(id, { onError: fail })
  }

  function importFromTimetable() {
    setError(null); setNotice(null)
    backfill.mutate(academicYear, {
      onSuccess: (r) => setNotice(r.created > 0
        ? `Imported ${r.created} subject teacher${r.created === 1 ? '' : 's'} from the timetable (all classes).`
        : 'Nothing to import - no timetable slot has a teacher that is not already assigned.'),
      onError: fail,
    })
  }

  if (loadingSubjects || loadingRows) {
    return <div className="skeleton h-40 rounded-xl" />
  }

  if (subjects.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        This class has no subjects configured yet. Set its subjects first (edit the class), then
        assign a teacher to each here.
      </div>
    )
  }

  const busy = assign.isPending || change.isPending || remove.isPending

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted max-w-xl">
          Each subject has one teacher for {academicYear}. Only that teacher (or the class teacher) can set
          assignments or enter marks for the subject, and students see assignments only for subjects with a
          teacher assigned.
        </p>
        {canManage && unassigned.length > 0 && (
          <button
            type="button"
            onClick={importFromTimetable}
            disabled={backfill.isPending}
            className="inline-flex items-center gap-2 min-h-11 px-4 rounded-xl border border-base text-sm font-heading font-semibold text-body hover:bg-page transition-colors disabled:opacity-60"
          >
            <Download className="w-4 h-4" aria-hidden />
            {backfill.isPending ? 'Importing…' : 'Import from timetable'}
          </button>
        )}
      </div>

      {unassigned.length > 0 && (
        <p role="status" className="flex items-start gap-2 text-xs text-tone-amber bg-brand-amber/8 border border-brand-amber/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          {unassigned.length} of {subjects.length} subject{subjects.length === 1 ? '' : 's'} ha{unassigned.length === 1 ? 's' : 've'} no
          teacher yet ({unassigned.join(', ')}). No one can set assignments for {unassigned.length === 1 ? 'it' : 'them'} until one is assigned.
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-xs text-tone-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          {error}
        </p>
      )}
      {notice && <p role="status" className="text-xs text-muted">{notice}</p>}

      <ul className="divide-y divide-base">
        {subjects.map((subject) => {
          const row = byName.get(subject)
          return (
            <li key={subject} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-[10rem] flex-1">
                <p className="font-heading font-semibold text-sm text-body">{subject}</p>
                {row && row.teacherUid === classTeacherUid && (
                  <p className="text-xs text-muted">Also the class teacher</p>
                )}
              </div>

              {canManage ? (
                <div className="w-full sm:w-80">
                  <TeacherSelect
                    value={row?.teacherUid}
                    onChange={(uid) => pick(subject, uid)}
                    placeholder="Assign a teacher…"
                  />
                </div>
              ) : (
                <p className={`text-sm ${row ? 'text-body' : 'text-muted'}`}>
                  {row ? nameOf(row.teacherUid) : 'No teacher assigned'}
                </p>
              )}

              {canManage && row && (
                <button
                  type="button"
                  onClick={() => unassign(row.id)}
                  disabled={busy}
                  aria-label={`Remove the teacher from ${subject}`}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-muted hover:text-tone-coral hover:bg-page transition-colors disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" aria-hidden />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
