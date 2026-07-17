/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/app/(auth)/students/[id]/page.tsx
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records; further
 *   edited in R8 — Academics IV: Report Cards, Transcripts, Promotion &
 *   Risk Assessment
 * [PURPOSE — R5]: (1) Edit button visibility moves from RoleGuard(['admin',
 *   'high_rank','lower_rank']) to PermissionGuard permission="student.edit"
 *   — admin correctly lacks student.edit per the confirmed-correct
 *   permission matrix. (2) The Fee Status card's hardcoded "Fee balance
 *   visible after Finance module is complete" placeholder is replaced with
 *   the real feeBalance/riskLevel values already present on the
 *   ApiStudentDetail object this page already fetches via useStudent() —
 *   no new backend call needed, this is a wiring-only fix (both fields
 *   were added to the shared ApiStudent type in this same phase).
 * [PURPOSE — R8]: Added a "Report Card" entry point (button + term
 *   selector) opening PrintableReportCard.tsx as an in-browser print
 *   preview — distinct from the downloadable-PDF path
 *   reportCardService.ts owns — via the new useReportCardData() hook
 *   (GET /exams/report-card/:studentId/data, this same phase). The query
 *   only runs once the panel is opened (studentId is passed as '' until
 *   then, keeping the hook's own `enabled` check off by default), so
 *   simply viewing a profile never triggers an extra fee-gated fetch.
 * [DEPENDS ON]: @shared/types/api (ApiStudent.feeBalance/riskLevel),
 *   apps/web/src/components/shared/StudentRiskBadge.tsx,
 *   apps/web/src/hooks/useExams.ts (useReportCardData),
 *   apps/web/src/hooks/usePublic.ts (usePublicSchoolInfo)
 */
'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useStudent } from '@/hooks/useStudents'
import { useReportCardData } from '@/hooks/useExams'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { StudentForm } from '@/components/students/StudentForm'
import { StudentRiskBadge } from '@/components/shared/StudentRiskBadge'
import { PrintableReportCard } from '@/components/shared/PrintableReportCard'
import { formatMWK } from '@shared/constants/malawi'
import { ArrowLeft, Pencil, Printer, FileText, Loader2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

export default function StudentProfilePage() {
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
      <ProfileContent />
    </RoleGuard>
  )
}

function ProfileContent() {
  const { id } = useParams<{ id: string }>()
  const { data: student, isLoading } = useStudent(id)
  const [editing, setEditing] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({ contentRef: printRef })

  const { data: schoolInfo } = usePublicSchoolInfo()
  const academicYear = schoolInfo?.currentYear ?? '2025/2026'
  const [showReportCard, setShowReportCard] = useState(false)
  const [reportCardTerm, setReportCardTerm] = useState<1 | 2 | 3>(3)
  const {
    data:      reportCardData,
    isLoading: reportCardLoading,
    error:     reportCardError,
  } = useReportCardData(showReportCard ? id : '', academicYear, reportCardTerm)

  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-56 rounded-xl" />
      </div>
    )
  if (!student) return <p className="text-muted">Student not found.</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/students"
          className="p-1.5 rounded-lg hover:bg-page border border-base"
          aria-label="Back to students"
        >
          <ArrowLeft className="w-4 h-4 text-muted" />
        </Link>
        <h1 className="font-heading text-xl font-bold text-brand-navy">
          {student.firstName} {student.lastName}
        </h1>
        <span className="ml-auto font-mono text-xs text-muted bg-page px-2 py-1 rounded border border-base">
          {student.registrationNo}
        </span>
        <PermissionGuard permission="student.edit">
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 border border-base px-3 py-1.5 rounded-lg text-sm hover:bg-page"
            aria-label="Edit student"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </PermissionGuard>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 border border-base px-3 py-1.5 rounded-lg text-sm hover:bg-page"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <div className="flex items-center gap-1.5">
          <select
            value={reportCardTerm}
            onChange={(e) => setReportCardTerm(Number(e.target.value) as 1 | 2 | 3)}
            aria-label="Report card term"
            className="border border-base rounded-lg text-sm px-2 py-1.5 bg-surface min-h-[36px]"
          >
            {[1, 2, 3].map((t) => (
              <option key={t} value={t}>Term {t}</option>
            ))}
          </select>
          <button
            onClick={() => setShowReportCard(true)}
            className="flex items-center gap-1.5 border border-base px-3 py-1.5 rounded-lg text-sm hover:bg-page"
          >
            <FileText className="w-3.5 h-3.5" /> Report Card
          </button>
        </div>
      </div>

      <div ref={printRef}>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Personal details card */}
          <div className="bg-surface border border-base rounded-xl p-5 space-y-3">
            <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted">
              Personal Details
            </p>
            {[
              ['Date of Birth', new Date(student.dateOfBirth).toLocaleDateString()],
              ['Sex', student.sex],
              ['Nationality', student.nationality],
              ['District', student.district],
              ['Village', student.village ?? '—'],
              ['Phone', student.phone ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Guardian + status card */}
          <div className="bg-surface border border-base rounded-xl p-5 space-y-3">
            <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted">
              Guardian & Status
            </p>
            {[
              ['Guardian', student.guardianName],
              ['Relation', student.guardianRelation],
              ['Guardian Phone', student.guardianPhone],
              ['Class', student.class?.name ?? '—'],
              ['Status', student.status],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fee balance + risk card */}
        <div className="bg-surface border border-base rounded-xl p-5 mt-4">
          <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mb-3">
            Fee Status
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted mb-1">Outstanding Balance</p>
              <p
                className={`text-lg font-heading font-bold ${
                  (student.feeBalance ?? 0) > 0 ? 'text-brand-coral' : 'text-brand-teal'
                }`}
              >
                {formatMWK(student.feeBalance ?? 0)}
              </p>
            </div>
            <StudentRiskBadge riskLevel={student.riskLevel ?? 'NONE'} variant="card" />
          </div>
        </div>
      </div>

      {editing && <StudentForm studentId={id} onClose={() => setEditing(false)} />}

      {showReportCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="absolute inset-0" onClick={() => setShowReportCard(false)} />
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl p-4">
            {reportCardLoading && (
              <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading report card…
              </div>
            )}
            {reportCardError && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <AlertTriangle className="w-6 h-6 text-brand-coral" />
                <p className="text-sm text-brand-coral font-medium">
                  {reportCardError instanceof Error ? reportCardError.message : 'Failed to load report card.'}
                </p>
                <button
                  onClick={() => setShowReportCard(false)}
                  className="mt-2 text-sm text-muted hover:text-body underline"
                >
                  Close
                </button>
              </div>
            )}
            {reportCardData && (
              <PrintableReportCard data={reportCardData} onClose={() => setShowReportCard(false)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
