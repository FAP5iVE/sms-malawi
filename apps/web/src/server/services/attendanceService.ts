/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/attendanceService.ts
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]: Postgres-backed attendance service, replacing unmediated
 *   Firestore access (attendance/{classId}/records/{date} documents) per
 *   the R3 Option B decision. Matches the established service-file
 *   pattern: import 'server-only', Prisma singleton, named exports,
 *   auditService.log(...) on the one mutating export (markAttendance).
 * [DEPENDS ON]: apps/web/src/server/services/auditService.ts,
 *   @shared/schemas/student (AttendanceEntryInput)
 */
/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/server/services/attendanceService.ts
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance
 *   Rebuild; further edited in R8 — Academics IV: Report Cards,
 *   Transcripts, Promotion & Risk Assessment
 * [PURPOSE]: R8 adds getAttendanceSummaryForTerm() — reportCardService.ts,
 *   transcriptService.ts, and riskService.ts all independently called
 *   `prisma.attendance.aggregate({_sum: {present, absent}})`, assuming a
 *   shape (numeric present/absent columns) the real R6 Attendance model
 *   never had (it stores one row per student per day with a PRESENT/
 *   ABSENT/LATE status, not pre-summed counts) — every one of those calls
 *   would throw at runtime. One shared, correct implementation here avoids
 *   three independent, duplicate re-derivations of the same term-date-range
 *   + status-counting logic.
 * [DEPENDS ON]: @shared/constants/malawi (ACADEMIC_TERMS)
 */
import 'server-only'

import { prisma }        from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import { ACADEMIC_TERMS } from '@shared/constants/malawi'
import type { AttendanceEntryInput } from '@shared/schemas/student'
import type { UserRole } from '@shared/types/roles'

/** Truncates a YYYY-MM-DD string to a midnight-UTC Date — attendance is
 *  day-granularity, matching the Attendance.date column's convention. */
function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`)
}

// ─────────────────────────────────────────────────────────
//  MARK ATTENDANCE
//  One or many students, one class, one day. Each entry is upserted
//  independently — re-marking the same student/class/day updates the
//  existing row (matching the old Firestore setDoc({merge: true}) UX)
//  rather than erroring on the unique constraint.
// ─────────────────────────────────────────────────────────

export async function markAttendance(
  classId:   string,
  date:      string,
  entries:   AttendanceEntryInput[],
  markedBy:  string,
  actorRole: UserRole
): Promise<void> {
  const day = toDateOnly(date)

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.attendance.upsert({
        where: {
          studentId_classId_date: {
            studentId: entry.studentId,
            classId,
            date: day,
          },
        },
        create: {
          studentId: entry.studentId,
          classId,
          date:      day,
          status:    entry.status,
          markedBy,
        },
        update: {
          status:   entry.status,
          markedBy,
        },
      })
    )
  )

  await auditService.log({
    action:     'attendance.marked',
    entityType: 'Attendance',
    entityId:   `${classId}:${date}`,
    actorUid:   markedBy,
    actorRole,
    metadata: {
      context: {
        classId,
        date,
        studentCount: entries.length,
        presentCount: entries.filter((e) => e.status === 'PRESENT').length,
        absentCount:  entries.filter((e) => e.status === 'ABSENT').length,
        lateCount:    entries.filter((e) => e.status === 'LATE').length,
      },
    },
  })
}

// ─────────────────────────────────────────────────────────
//  READ
// ─────────────────────────────────────────────────────────

export async function getForClass(classId: string, date: string) {
  return prisma.attendance.findMany({
    where: { classId, date: toDateOnly(date) },
    orderBy: { studentId: 'asc' },
  })
}

export async function getForStudent(studentId: string) {
  return prisma.attendance.findMany({
    where: { studentId },
    orderBy: { date: 'desc' },
  })
}

// ─────────────────────────────────────────────────────────
//  TERM ATTENDANCE SUMMARY
//  Resolves an academicYear+term to a real calendar date range (via
//  ACADEMIC_TERMS) and counts PRESENT/ABSENT/LATE rows for a student
//  within it — the correct replacement for the assumed-shape
//  prisma.attendance.aggregate({_sum: {present, absent}}) calls
//  previously duplicated across reportCardService.ts, transcriptService.ts,
//  and riskService.ts.
// ─────────────────────────────────────────────────────────

export interface TermAttendanceSummary {
  daysPresent: number
  daysAbsent:  number
  daysLate:    number
  totalDays:   number
}

/** Resolves an academicYear ("2025/2026") + term (1|2|3) to a real
 *  [start, end] calendar date range using ACADEMIC_TERMS' month/day
 *  boundaries. Term 1 falls in the first calendar year of academicYear;
 *  Terms 2 and 3 fall in the second (the academic year spans Sept–July). */
export function getTermDateRange(academicYear: string, term: number): { start: Date; end: Date } {
  const [firstYearStr, secondYearStr] = academicYear.split('/')
  const firstYear  = Number(firstYearStr)
  const secondYear = Number(secondYearStr)
  const year = term === 1 ? firstYear : secondYear

  const termKey = term === 1 ? 'TERM_1' : term === 2 ? 'TERM_2' : 'TERM_3'
  const { start, end } = ACADEMIC_TERMS[termKey]

  return {
    start: new Date(`${year}-${start}T00:00:00.000Z`),
    end:   new Date(`${year}-${end}T23:59:59.999Z`),
  }
}

export async function getAttendanceSummaryForTerm(
  studentId:    string,
  academicYear: string,
  term:         number,
): Promise<TermAttendanceSummary> {
  const { start, end } = getTermDateRange(academicYear, term)

  const grouped = await prisma.attendance.groupBy({
    by:     ['status'],
    where:  { studentId, date: { gte: start, lte: end } },
    _count: { _all: true },
  })

  const daysPresent = grouped.find((g) => g.status === 'PRESENT')?._count._all ?? 0
  const daysAbsent  = grouped.find((g) => g.status === 'ABSENT')?._count._all  ?? 0
  const daysLate    = grouped.find((g) => g.status === 'LATE')?._count._all    ?? 0

  return {
    daysPresent,
    daysAbsent,
    daysLate,
    totalDays: daysPresent + daysAbsent + daysLate,
  }
}
