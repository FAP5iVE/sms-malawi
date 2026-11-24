'use client'

/**
 * apps/web/src/components/students/StudentIdentity.tsx
 *
 * [PURPOSE]: Tells a signed-in student who they are in the school: their status (Active,
 *   Graduated, and so on), their class, and their stream when the school runs more than one
 *   in that form. Two places use it: a line under the dashboard greeting, and a muted line in
 *   the account menu. The facts come from useStudentMe (GET /students/me), nothing is asked twice.
 *   Status is text with a shape (StatusText), never a pill (RULEBOOK R2).
 */
import { StatusText } from '@/components/shared/StatusText'
import { useStudentMe } from '@/hooks/useStudents'
import { statusTone, statusWord } from '@/lib/hills/statusWord'
import { studentClassWithStream } from '@/lib/hills/studentClass'

/** "MSCE registered", "MSCE registered, results awaited", "MSCE results in", "MSCE not registered". */
export function manebWords(
  maneb: { examType: string; registered: boolean; resultsEntered?: boolean } | null | undefined,
  status: string | null | undefined,
): string | null {
  if (!maneb) return null
  if (!maneb.registered) return `${maneb.examType} not registered`
  if (maneb.resultsEntered) return `${maneb.examType} registered, results in`
  if (status === 'AWAITING_MANEB_RESULTS') return `${maneb.examType} registered, results awaited`
  return `${maneb.examType} registered`
}

function useIdentity() {
  const { data: me, isLoading } = useStudentMe()
  if (!me) return { isLoading, status: null as string | null, tone: 'neutral' as const, classText: null as string | null, maneb: null as string | null }
  return {
    isLoading,
    status: statusWord(me.status),
    tone: statusTone(me.status),
    classText: studentClassWithStream(me),
    maneb: manebWords(me.maneb, me.status),
  }
}

/** The line under the dashboard greeting: "Form 3 B · Active". */
export function StudentIdentityLine() {
  const { isLoading, status, tone, classText, maneb } = useIdentity()
  if (isLoading) return <p className="text-sm text-muted min-h-6" aria-hidden>&nbsp;</p>
  if (!status) return null
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="student-identity">
      <span className="font-heading font-semibold text-brand-navy">{classText ?? 'No class yet'}</span>
      <StatusText tone={tone}>{status}</StatusText>
      {maneb && <span className="text-muted">{maneb}</span>}
    </p>
  )
}

/** One muted line in the account menu. */
export function StudentIdentityMenuLine() {
  const { status, classText } = useIdentity()
  if (!status) return null
  return (
    <p className="text-xs text-muted font-sans truncate mt-0.5">
      {classText ?? 'No class yet'} · {status}
    </p>
  )
}
