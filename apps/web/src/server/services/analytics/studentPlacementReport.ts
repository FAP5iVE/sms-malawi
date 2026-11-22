/**
 * studentPlacementReport.ts — the signed-in student's own placement report.
 *
 * Self-scoped by construction: the only input is the Student.id the route
 * resolved from the authenticated uid, and every query is keyed on it. Nothing
 * here reads another student's row, the cohort registry or any analytics.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { ApiStudentPlacement } from '@shared/types/reporting-student'
import { isManebRecordPlacementReady } from '@/server/services/placementMatchingService'
import { buildStudentPlacement, type OwnPlacementRow } from './studentPlacementLogic'

export async function getStudentPlacement(studentId: string): Promise<ApiStudentPlacement> {
  const [student, record, manebRecords] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { status: true } }),
    prisma.universityPlacement.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true, entrySource: true, admissionYear: true,
        placedUniversityId: true, placedProgrammeId: true, placedUniversityName: true, placedProgrammeName: true,
        ncheBatchRef: true, claimProofNote: true, rejectionReason: true, verifiedAt: true, createdAt: true,
      },
    }),
    prisma.manebRecord.findMany({
      where: { studentId, examType: 'MSCE' },
      select: { examType: true, status: true, subjectGrades: true },
    }),
  ])

  const hasCertifiedMsce = manebRecords.some((r: { examType: string; status: string; subjectGrades: unknown }) =>
    isManebRecordPlacementReady({
      examType: r.examType,
      status: r.status,
      subjectGrades: r.subjectGrades as Record<string, string> | null,
    }))

  return buildStudentPlacement({
    studentStatus: student?.status ?? 'ACTIVE',
    hasCertifiedMsce,
    record: record as OwnPlacementRow | null,
  })
}
