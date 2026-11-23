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

function useIdentity() {
  const { data: me, isLoading } = useStudentMe()
  if (!me) return { isLoading, status: null as string | null, tone: 'neutral' as const, classText: null as string | null, maneb: null }
  return {
    isLoading,
    status: statusWord(me.status),
    tone: statusTone(me.status),
    classText: studentClassWithStream(me),
    maneb: me.maneb ?? null,
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
      {maneb && (
        <span className="text-muted">
          {maneb.examType} {maneb.registered ? 'registered' : 'not registered'}
        </span>
      )}
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
