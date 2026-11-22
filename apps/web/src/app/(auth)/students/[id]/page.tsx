/**
 * [CHANGE TYPE]: TARGETED EDIT (2026-11-04, redundancy + layout)
 * [PURPOSE]: The primary guardian was shown twice: as Guardian / Relation / Guardian
 *   Phone under "Guardian & Status" and again in the Guardians section. The section is
 *   the single place now (the legacy rows only appear for a viewer without
 *   student.view, who never gets the section). The old header block is "Class & Status",
 *   and the page is two stacks (Personal + Home & Admission | Class & Status +
 *   Guardians + Welfare) so the removal leaves no empty hole. Welfare says "Special
 *   needs" and the sub-lists are plain rows on the surface, not boxed cards.
 *
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
import { useEffectiveViewingPeriod } from '@/hooks/useViewingPeriod'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { GuardiansCard } from '@/components/students/GuardiansCard'
import { WelfareCard } from '@/components/students/WelfareCard'
import { useAuthStore } from '@/store/authStore'
import { StudentForm } from '@/components/students/StudentForm'
import { StudentRiskBadge } from '@/components/shared/StudentRiskBadge'
import { PrintableReportCard } from '@/components/shared/PrintableReportCard'
import { formatMWK, RESIDENCE_TYPE_LABELS, ADMISSION_TYPE_LABELS, EXIT_REASON_LABELS } from '@shared/constants/malawi'
import { usePermissions } from '@/hooks/usePermissions'
import { ArrowLeft, Pencil, Printer, FileText, Loader2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Modal } from '@/components/shared/Modal'
import { ModuleSurface } from '@/components/shared/ModuleSurface'
import { FactList } from '@/components/students/FactList'
import { statusWord } from '@/lib/hills/statusWord'

const sectionHeading = 'mb-3 font-heading text-sm font-semibold text-body'

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
  const { can } = usePermissions()
  const role = useAuthStore((s) => s.role)
  const printRef = useRef<HTMLDivElement>(null)
  const handlePrint = useReactToPrint({ contentRef: printRef })

  // Year and term come from the GLOBAL viewing period (header switcher) — the
  // same period the risk card, fee balance and every other tab on this page are
  // assessed for. This page used to read the school's *current* period and add
  // its own report-card term select, so the report card could describe a
  // different term from everything around it.
  const { academicYear, term: viewingTerm } = useEffectiveViewingPeriod()
  const [showReportCard, setShowReportCard] = useState(false)
  const reportCardTerm = viewingTerm as 1 | 2 | 3
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

  const actionBtn =
    'inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-base px-3.5 text-sm font-medium text-body transition-colors hover:bg-page'

  return (
    <div className="space-y-5">
      {/* Title block, then the actions on their own wrapping row, so nothing is pushed past the
          right edge of a phone. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        <Link
          href="/students"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-base hover:bg-page"
          aria-label="Back to students"
        >
          <ArrowLeft className="w-4 h-4 text-muted" />
        </Link>
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="font-heading text-xl font-bold text-brand-navy [overflow-wrap:anywhere]">
            {student.firstName} {student.otherNames ? `${student.otherNames} ` : ''}{student.lastName}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-muted">{student.registrationNo}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <PermissionGuard permission="student.edit">
            <button
              onClick={() => setEditing(true)}
              className={actionBtn}
              aria-label="Edit student"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </PermissionGuard>
          <button
            onClick={handlePrint}
            className={actionBtn}
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={() => setShowReportCard(true)}
            className={actionBtn}
            title={`Report card for Term ${reportCardTerm}, ${academicYear}. Change the period from the header.`}
          >
            <FileText className="w-3.5 h-3.5" /> Report card · T{reportCardTerm}
          </button>
        </div>
      </div>

      <div ref={printRef}>
        {/* The same full-width surface every module page uses (edge to edge on a phone). Fee and
            risk data stay behind student.viewFeeStatus / student.viewRiskStatus. Two stacks on a
            wide screen so a short block on one side leaves no hole beside a tall one: left is who
            the student is and how to reach them, right is enrolment, guardians and welfare. */}
        <ModuleSurface contentClassName="space-y-6 [&>*+*]:border-t [&>*+*]:border-base [&>*+*]:pt-6">
          <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
            <div className="space-y-6 [&>*+*]:border-t [&>*+*]:border-base [&>*+*]:pt-6">
              <section>
                <h2 className={sectionHeading}>Identity</h2>
                <FactList
                  rows={[
                    ['Date of birth', new Date(student.dateOfBirth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
                    ['Sex', statusWord(student.sex)],
                    ['Nationality', student.nationality],
                    ['Religion', student.religion],
                    ['Home language', student.homeLanguage],
                    ['NRB / birth cert. no.', student.nrbNumber],
                  ]}
                />
              </section>

              <section>
                <h2 className={sectionHeading}>Contact and address</h2>
                <FactList
                  rows={[
                    ['Phone', student.phone],
                    ['Email', student.email],
                    ['Address', student.address],
                    ['Village', student.village],
                    ['Traditional authority', student.traditionalAuthority],
                    ['District', student.district],
                  ]}
                />
              </section>

              <section>
                <h2 className={sectionHeading}>Home and admission</h2>
                <FactList
                  rows={[
                    ['Stays', student.residenceType ? RESIDENCE_TYPE_LABELS[student.residenceType] : null],
                    ['Travel to school', student.travelMinutes != null ? `${student.travelMinutes} min` : null],
                    ['Admission', ADMISSION_TYPE_LABELS[student.admissionType ?? 'NEW_INTAKE']],
                    ['Previous school', student.previousSchool],
                    ['Reason for transfer', student.reasonForTransfer],
                    ...(student.yearOutcomes && student.yearOutcomes.length > 0
                      ? ([
                          ['Times repeated', String(student.yearOutcomes.filter((y) => y.outcome === 'REPEATED').length)],
                          ['Year history', student.yearOutcomes.map((y) => `${y.academicYear} F${y.form} ${y.outcome === 'REPEATED' ? 'repeated' : y.outcome === 'PROMOTED' ? 'promoted' : y.outcome === 'AWAITING_MANEB' ? 'MANEB' : 'graduated'}`).join(', ')],
                        ] as const)
                      : []),
                    ...(student.exitReason
                      ? ([
                          ['Reason for leaving', EXIT_REASON_LABELS[student.exitReason]],
                          ['Date left', student.exitDate ? new Date(student.exitDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null],
                        ] as const)
                      : []),
                  ]}
                />
              </section>
            </div>

            <div className="space-y-6 max-lg:border-t max-lg:border-base max-lg:pt-6 [&>*+*]:border-t [&>*+*]:border-base [&>*+*]:pt-6">
              <section>
                <h2 className={sectionHeading}>Class and status</h2>
                <FactList
                  rows={[
                    ['Class', student.class?.name],
                    ['Status', statusWord(student.status)],
                    // The Guardians section below lists every guardian, primary included,
                    // so repeating the primary here was a duplicate. These three rows
                    // remain only for a viewer who can't see that section (no student.view).
                    ...(can('student.view')
                      ? []
                      : ([
                          ['Guardian', student.guardianName],
                          ['Relation', student.guardianRelation],
                          ['Guardian phone', student.guardianPhone],
                        ] as const)),
                  ]}
                />
              </section>

              {/* Guardians: visible to anyone who can open the record; only admin,
                  the headteacher and other non-lower_rank editors can change them
                  (the server enforces this too). */}
              {can('student.view') && (
                <GuardiansCard
                  studentId={id}
                  canEdit={can('student.edit') && role !== 'lower_rank' && role !== 'student'}
                />
              )}

              {/* Welfare (orphan status, vulnerability, health / medical alert, special needs):
                  sensitive child data. Rendered only for student.viewWelfare
                  (admin, headteacher, HR); the data is fetched from its own
                  endpoint, so a role without the permission never receives it. */}
              {can('student.viewWelfare') && (
                // print:hidden - the Print button prints this whole block, and
                // sensitive welfare data must not end up on paper by default.
                <div className="print:hidden">
                  <WelfareCard studentId={id} canEdit={can('student.editWelfare')} />
                </div>
              )}
            </div>
          </div>

          {can('student.viewFeeStatus') && (
            <section>
              <h2 className={sectionHeading}>Fee status</h2>
              <div>
                <p className="text-xs text-muted mb-1">Outstanding balance</p>
                <p
                  className={`text-xl font-heading font-bold ${
                    (student.feeBalance ?? 0) > 0 ? 'text-tone-coral' : 'text-tone-teal'
                  }`}
                >
                  {formatMWK(student.feeBalance ?? 0)}
                </p>
              </div>
            </section>
          )}

          {/* Risk is a composite of fees, exam results, attendance and library
              (riskService), so it gets its own section rather than sitting under
              "Fee Status". Each factor links to the module that owns it. */}
          {can('student.viewRiskStatus') && (
            <section>
              <h2 className={sectionHeading}>Risk overview</h2>
              <StudentRiskBadge
                riskLevel={student.riskLevel ?? 'NONE'}
                variant="card"
                factors={student.riskFactors}
                score={student.riskScore}
                insights={student.riskInsights}
                classId={student.classId}
              />
            </section>
          )}
        </ModuleSurface>
      </div>

      {editing && <StudentForm studentId={id} onClose={() => setEditing(false)} />}

      {showReportCard && (
        <Modal
          ariaLabel="Student report card"
          onClose={() => setShowReportCard(false)}
          size="2xl"
        >
          {reportCardLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading report card…
            </div>
          )}
          {reportCardError && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <AlertTriangle className="w-6 h-6 text-tone-coral" />
              <p className="text-sm text-tone-coral font-medium">
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
        </Modal>
      )}
    </div>
  )
}