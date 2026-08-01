'use client'

/**
 * apps/web/src/components/shared/PrintableReportCard.tsx — Phase C8
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment
 * [PURPOSE]: Replaced the standalone GRADE_SCALE 5-tier taxonomy — the
 *   third independent grading taxonomy in the codebase, matching neither
 *   the real MSCE nor JCE scale — with useGradingScales() (this same
 *   phase), reading the real gradeService.ts-backed boundaries via the
 *   already-open GET /settings/grading-scales route. gradeColor() is now
 *   derived from the fetched row's pass/label (bare "Pass" grades render
 *   amber, Distinction/Credit-tier passes render green, fails render red)
 *   rather than a hardcoded per-letter map. Added schoolLogoUrl (via
 *   ReportCardData, sourced server-side from settingsService.
 *   getIdentitySettings()) rendered as a real <img>, replacing the
 *   hardcoded "CREST" text placeholder; falls back to the school's
 *   initials (derived from schoolName) when no logo has been uploaded,
 *   never a literal placeholder word. Added an entry point from the
 *   Student detail page (students/[id]/page.tsx, R5) — see that file.
 *   ReportCardData/SubjectGrade's existing field shapes are unchanged
 *   except the two additive fields below.
 * [DEPENDS ON]: apps/web/src/hooks/useSettings.ts (useGradingScales)
 *
 * A4 report card template implementing the Malawi Secondary School standard
 * format. Renders a pixel-accurate screen preview (print-preview mode) and
 * produces a clean A4 PDF when triggered via react-to-print v3.
 *
 * Layout (top → bottom, inside a 210 mm × 277 mm A4 frame):
 *   1. School header        — name, term, academic year, report type label
 *   2. Student details      — reg no., name, class, sex, DOB, class teacher
 *   3. Grades table         — subject | CA% | Exam% | Total | Grade | Remark
 *   4. Aggregate row        — total marks, average, class position
 *   5. Attendance row       — present / absent / total / percentage
 *   6. Teacher comments     — class teacher + headteacher with signature lines
 *   7. Promotion status     — PASS AND PROCEED / REPEAT with next class label
 *   8. Footer               — issue date, next term date, school stamp box
 *
 * Grading scale: sourced live from gradeService.ts (useGradingScales()) —
 * MSCE/INTERNAL_F3F4 use the 1–9 scale (1&2 Distinction, 3–6 Credit,
 * 7&8 Pass, 9 Fail); JCE/INTERNAL_F1F2 use the A–F scale (A Excellent,
 * B Very Good, C Good, D Average, F Fail). No longer a hardcoded local copy.
 *
 * Usage:
 *   <PrintableReportCard data={reportCardData} onClose={() => setOpen(false)} />
 *
 * Print trigger:
 *   react-to-print v3 — useReactToPrint({ contentRef }) returns a trigger fn.
 *   The print button is in a `print:hidden` wrapper so it never appears on paper.
 *   The `.report-card` CSS class (defined in globals.css @media print) enforces
 *   the A4 dimensions and page-break rules during printing.
 *
 * Multiple report cards:
 *   When rendering several students (batch print), map over an array of
 *   ReportCardData and render a PrintableReportCardPage per student inside a
 *   single printRef wrapper. `.report-card + .report-card` CSS rule handles
 *   the page break between students.
 */

import { useRef }            from 'react'
import { useReactToPrint }   from 'react-to-print'
import { Printer, X }        from 'lucide-react'
import { useGradingScales }  from '@/hooks/useSettings'
import type { GradingScaleRow } from '@/hooks/useSettings'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SubjectGrade {
  subject:     string
  caScore?:    number   // Continuous assessment — 30% weight
  examScore?:  number   // End-term/midterm exam — 70% weight
  total:       number   // Weighted total out of 100
  grade:       string   // A / B / C / D / F
  remarks?:    string   // e.g. "Improving", "Needs attention"
}

export interface ReportCardData {
  // School identity
  schoolName:    string
  schoolMotto?:  string
  schoolAddress: string
  schoolPhone:   string
  schoolEmail?:  string
  schoolLogoUrl?: string

  // Student identity
  student: {
    registrationNo: string
    firstName:      string
    lastName:       string
    sex:            'male' | 'female' | string
    dateOfBirth?:   string
    className:      string   // e.g. "Form 2A"
    photoUrl?:      string
  }
  /** Numeric form (1–4) — selects which grading scale (INTERNAL_F1F2 vs
   *  INTERNAL_F3F4) useGradingScales() fetches for this card. */
  classForm: number

  // Academic period
  academicYear: string       // e.g. "2025/2026"
  term:         1 | 2 | 3

  // Results
  subjects:        SubjectGrade[]
  classPosition:   number     // e.g. 5
  classTotal:      number     // e.g. 45  → "5 / 45"
  totalMarks:      number
  averagePercent:  number

  // Attendance
  daysPresent:     number
  daysAbsent:      number
  totalSchoolDays: number

  // Staff
  classTeacher:           string
  classTeacherComment:    string
  headTeacher:            string
  headTeacherComment:     string

  // Outcome
  promotionStatus: 'PASS_AND_PROCEED' | 'REPEAT' | null   // null = no promotion determination yet (Terms 1–2, or Term 3 pre-commit)
  nextClass?:      string     // e.g. "Form 3A"

  // Admin
  issueDate:       string     // ISO date string
  nextTermDate:    string     // ISO date string
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADE COLOUR — derived from the real fetched scale row's pass/label,
// not a hardcoded per-letter map. Bare "Pass" grades render amber,
// Distinction/Credit-tier passes render green, fails render red.
// ─────────────────────────────────────────────────────────────────────────────

function gradeColor(row: GradingScaleRow | undefined): string {
  if (!row) return '#374151'
  if (!row.pass) return '#dc2626'
  return (row.label ?? '').trim().toLowerCase() === 'pass' ? '#b45309' : '#15803d'
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL INITIALS — fallback when no logo has been uploaded yet.
// ─────────────────────────────────────────────────────────────────────────────

function schoolInitials(schoolName: string): string {
  const words = schoolName.trim().split(/\s+/).filter(Boolean)
  return words.slice(0, 3).map((w) => w[0]!.toUpperCase()).join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmt(date: string): string {
  return new Date(date).toLocaleDateString('en-MW', {
    day:   '2-digit',
    month: 'long',
    year:  'numeric',
  })
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!)
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT CARD PAGE — the actual A4 content rendered inside printRef
// Exported separately so batch print can wrap multiple inside one printRef.
// ─────────────────────────────────────────────────────────────────────────────

export function PrintableReportCardPage({ data }: { data: ReportCardData }) {
  const examTypeKey = data.classForm >= 3 ? 'INTERNAL_F3F4' : 'INTERNAL_F1F2'
  const { data: gradingScale = [] } = useGradingScales(examTypeKey)
  const gradeRow = (grade: string) => gradingScale.find((g) => g.grade === grade)

  const attendancePct = data.totalSchoolDays > 0
    ? Math.round((data.daysPresent / data.totalSchoolDays) * 100)
    : 0

  return (
    <div
      className="report-card print-no-break"
      style={{
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        fontSize:   '9.5pt',
        color:      '#111827',
        padding:    '0',
        background: '#ffffff',
      }}
    >
      {/* ── 1. SCHOOL HEADER ─────────────────────────────────────────────── */}
      <div
        style={{
          borderBottom: '2.5pt solid #1e3a5f',
          paddingBottom: '10pt',
          marginBottom: '8pt',
          textAlign: 'center',
        }}
      >
        {/* School crest/logo — real image when uploaded (settingsService.
            getIdentitySettings().schoolLogoUrl), initials fallback otherwise */}
        {data.schoolLogoUrl ? (
          // next/image is wrong here, not just unoptimized: (1) this is a
          // print-only crest captured by react-to-print, and next/image's
          // lazy-loading can leave the image unloaded when the DOM is
          // captured for PDF generation; (2) schoolLogoUrl is a dynamic,
          // per-school Appwrite signed URL, and no images.remotePatterns is
          // configured in next.config.ts, so next/image would throw at
          // runtime for an unconfigured host; (3) the whole document is
          // sized in `pt` (print points) throughout, not px, which
          // next/image's width/height props don't accommodate.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.schoolLogoUrl}
            alt={`${data.schoolName} crest`}
            style={{
              width: '48pt', height: '48pt',
              margin: '0 auto 6pt',
              borderRadius: '50%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '48pt', height: '48pt',
              border: '1pt solid #d1d5db',
              borderRadius: '50%',
              margin: '0 auto 6pt',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f3f4f6',
              fontSize: '13pt', fontWeight: 700, color: '#1e3a5f',
            }}
          >
            {schoolInitials(data.schoolName)}
          </div>
        )}

        <div
          style={{
            fontSize: '15pt', fontWeight: 700,
            color: '#1e3a5f', letterSpacing: '0.03em',
            textTransform: 'uppercase',
          }}
        >
          {data.schoolName}
        </div>

        {data.schoolMotto && (
          <div style={{ fontSize: '8pt', color: '#6b7280', fontStyle: 'italic', marginTop: '2pt' }}>
            {data.schoolMotto}
          </div>
        )}

        <div style={{ fontSize: '8pt', color: '#6b7280', marginTop: '3pt' }}>
          {data.schoolAddress} · Tel: {data.schoolPhone}
          {data.schoolEmail && ` · ${data.schoolEmail}`}
        </div>

        <div
          style={{
            marginTop: '8pt',
            fontSize: '12pt', fontWeight: 700,
            color: '#1e3a5f', letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          STUDENT REPORT CARD
        </div>

        <div style={{ fontSize: '9pt', color: '#374151', marginTop: '2pt' }}>
          Academic Year {data.academicYear} — Term {data.term}
        </div>
      </div>

      {/* ── 2. STUDENT DETAILS ───────────────────────────────────────────── */}
      <table
        style={{
          width: '100%', borderCollapse: 'collapse',
          marginBottom: '8pt', border: '1pt solid #d1d5db',
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: '3pt 6pt', width: '25%', background: '#f9fafb', fontWeight: 600, fontSize: '8.5pt', color: '#374151', borderRight: '1pt solid #d1d5db', borderBottom: '1pt solid #d1d5db' }}>
              Reg. Number
            </td>
            <td style={{ padding: '3pt 6pt', width: '25%', fontWeight: 700, color: '#1e3a5f', borderRight: '1pt solid #e5e7eb', borderBottom: '1pt solid #d1d5db' }}>
              {data.student.registrationNo}
            </td>
            <td style={{ padding: '3pt 6pt', width: '25%', background: '#f9fafb', fontWeight: 600, fontSize: '8.5pt', color: '#374151', borderRight: '1pt solid #d1d5db', borderBottom: '1pt solid #d1d5db' }}>
              Full Name
            </td>
            <td style={{ padding: '3pt 6pt', fontWeight: 600, borderBottom: '1pt solid #d1d5db' }}>
              {data.student.firstName} {data.student.lastName}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '3pt 6pt', background: '#f9fafb', fontWeight: 600, fontSize: '8.5pt', color: '#374151', borderRight: '1pt solid #d1d5db', borderBottom: '1pt solid #d1d5db' }}>
              Class / Form
            </td>
            <td style={{ padding: '3pt 6pt', borderRight: '1pt solid #e5e7eb', borderBottom: '1pt solid #d1d5db' }}>
              {data.student.className}
            </td>
            <td style={{ padding: '3pt 6pt', background: '#f9fafb', fontWeight: 600, fontSize: '8.5pt', color: '#374151', borderRight: '1pt solid #d1d5db', borderBottom: '1pt solid #d1d5db' }}>
              Sex
            </td>
            <td style={{ padding: '3pt 6pt', textTransform: 'capitalize', borderBottom: '1pt solid #d1d5db' }}>
              {data.student.sex}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '3pt 6pt', background: '#f9fafb', fontWeight: 600, fontSize: '8.5pt', color: '#374151', borderRight: '1pt solid #d1d5db' }}>
              Class Teacher
            </td>
            <td style={{ padding: '3pt 6pt', borderRight: '1pt solid #e5e7eb' }}>
              {data.classTeacher}
            </td>
            <td style={{ padding: '3pt 6pt', background: '#f9fafb', fontWeight: 600, fontSize: '8.5pt', color: '#374151', borderRight: '1pt solid #d1d5db' }}>
              Date of Birth
            </td>
            <td style={{ padding: '3pt 6pt' }}>
              {data.student.dateOfBirth ? fmt(data.student.dateOfBirth) : '—'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── 3. GRADES TABLE ──────────────────────────────────────────────── */}
      <table
        style={{
          width: '100%', borderCollapse: 'collapse',
          marginBottom: '6pt', border: '1pt solid #d1d5db',
        }}
      >
        <thead>
          <tr style={{ background: '#1e3a5f', color: '#ffffff' }}>
            {[
              { label: 'Subject',                 w: '32%', align: 'left'   },
              { label: 'C.A. (%)',                w: '10%', align: 'center' },
              { label: 'Exam (%)',                w: '10%', align: 'center' },
              { label: 'Total (%)',               w: '11%', align: 'center' },
              { label: 'Grade',                   w: '8%',  align: 'center' },
              { label: 'Remarks',                 w: '29%', align: 'left'   },
            ].map(({ label, w, align }) => (
              <th
                key={label}
                style={{
                  padding: '4pt 5pt', fontSize: '8pt',
                  fontWeight: 700, letterSpacing: '0.04em',
                  width: w, textAlign: align as React.CSSProperties['textAlign'],
                  borderRight: '1pt solid #2d5186',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.subjects.map((s, i) => (
            <tr
              key={s.subject}
              style={{ background: i % 2 === 0 ? '#ffffff' : '#f9fafb' }}
            >
              <td style={{ padding: '3pt 5pt', fontWeight: 600, fontSize: '8.5pt', borderRight: '1pt solid #e5e7eb', borderBottom: '0.5pt solid #e5e7eb' }}>
                {s.subject}
              </td>
              <td style={{ padding: '3pt 5pt', textAlign: 'center', borderRight: '1pt solid #e5e7eb', borderBottom: '0.5pt solid #e5e7eb' }}>
                {s.caScore != null ? s.caScore.toFixed(1) : '—'}
              </td>
              <td style={{ padding: '3pt 5pt', textAlign: 'center', borderRight: '1pt solid #e5e7eb', borderBottom: '0.5pt solid #e5e7eb' }}>
                {s.examScore != null ? s.examScore.toFixed(1) : '—'}
              </td>
              <td style={{ padding: '3pt 5pt', textAlign: 'center', fontWeight: 700, borderRight: '1pt solid #e5e7eb', borderBottom: '0.5pt solid #e5e7eb' }}>
                {s.total.toFixed(1)}
              </td>
              <td
                style={{
                  padding: '3pt 5pt', textAlign: 'center',
                  fontWeight: 800, fontSize: '10pt',
                  color: gradeColor(gradeRow(s.grade)),
                  borderRight: '1pt solid #e5e7eb', borderBottom: '0.5pt solid #e5e7eb',
                }}
              >
                {s.grade}
              </td>
              <td style={{ padding: '3pt 5pt', fontSize: '8pt', color: '#4b5563', borderBottom: '0.5pt solid #e5e7eb' }}>
                {s.remarks ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>

        {/* Aggregate row */}
        <tfoot>
          <tr style={{ background: '#f0f4f8', borderTop: '1.5pt solid #1e3a5f' }}>
            <td colSpan={2} style={{ padding: '4pt 5pt', fontWeight: 700, fontSize: '8.5pt', color: '#1e3a5f', borderRight: '1pt solid #d1d5db' }}>
              AGGREGATE
            </td>
            <td style={{ padding: '4pt 5pt', textAlign: 'center', fontWeight: 700, borderRight: '1pt solid #d1d5db' }}>
              —
            </td>
            <td style={{ padding: '4pt 5pt', textAlign: 'center', fontWeight: 800, color: '#1e3a5f', borderRight: '1pt solid #d1d5db' }}>
              {data.averagePercent.toFixed(1)}%
            </td>
            <td style={{ padding: '4pt 5pt', textAlign: 'center', fontWeight: 800, fontSize: '10pt', color: '#374151', borderRight: '1pt solid #d1d5db' }}>
              —
            </td>
            <td style={{ padding: '4pt 5pt', fontWeight: 700, color: '#1e3a5f' }}>
              Position: {ordinal(data.classPosition)} / {data.classTotal}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ── 4. ATTENDANCE ────────────────────────────────────────────────── */}
      <table
        style={{
          width: '100%', borderCollapse: 'collapse',
          border: '1pt solid #d1d5db', marginBottom: '8pt',
        }}
      >
        <thead>
          <tr style={{ background: '#374151', color: '#ffffff' }}>
            <th style={{ padding: '3pt 6pt', fontSize: '8pt', fontWeight: 700, textAlign: 'left', borderRight: '1pt solid #4b5563' }}>
              Attendance
            </th>
            <th style={{ padding: '3pt 6pt', fontSize: '8pt', fontWeight: 600, textAlign: 'center', borderRight: '1pt solid #4b5563' }}>Days Present</th>
            <th style={{ padding: '3pt 6pt', fontSize: '8pt', fontWeight: 600, textAlign: 'center', borderRight: '1pt solid #4b5563' }}>Days Absent</th>
            <th style={{ padding: '3pt 6pt', fontSize: '8pt', fontWeight: 600, textAlign: 'center', borderRight: '1pt solid #4b5563' }}>Total Days</th>
            <th style={{ padding: '3pt 6pt', fontSize: '8pt', fontWeight: 600, textAlign: 'center' }}>Attendance %</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '3pt 6pt', background: '#f9fafb', fontWeight: 600, fontSize: '8.5pt', borderRight: '1pt solid #e5e7eb' }}>
              Term {data.term}
            </td>
            <td style={{ padding: '3pt 6pt', textAlign: 'center', fontWeight: 700, color: '#15803d', borderRight: '1pt solid #e5e7eb' }}>{data.daysPresent}</td>
            <td style={{ padding: '3pt 6pt', textAlign: 'center', fontWeight: 700, color: data.daysAbsent > 5 ? '#dc2626' : '#374151', borderRight: '1pt solid #e5e7eb' }}>{data.daysAbsent}</td>
            <td style={{ padding: '3pt 6pt', textAlign: 'center', borderRight: '1pt solid #e5e7eb' }}>{data.totalSchoolDays}</td>
            <td style={{ padding: '3pt 6pt', textAlign: 'center', fontWeight: 700, color: attendancePct >= 80 ? '#15803d' : '#dc2626' }}>
              {attendancePct}%
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── 5. COMMENTS ──────────────────────────────────────────────────── */}
      <table
        style={{
          width: '100%', borderCollapse: 'collapse',
          border: '1pt solid #d1d5db', marginBottom: '8pt',
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                padding: '5pt 7pt', width: '50%',
                verticalAlign: 'top',
                borderRight: '1pt solid #d1d5db',
              }}
            >
              <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: '3pt', letterSpacing: '0.06em' }}>
                Class Teacher&apos;s Comment
              </div>
              <div style={{ fontSize: '8.5pt', color: '#111827', minHeight: '28pt', lineHeight: 1.5 }}>
                {data.classTeacherComment || '—'}
              </div>
              <div style={{ marginTop: '10pt', borderTop: '0.5pt solid #9ca3af', paddingTop: '3pt', fontSize: '7.5pt', color: '#6b7280' }}>
                Name: {data.classTeacher} &nbsp;&nbsp;&nbsp; Signature: _______________
              </div>
            </td>
            <td style={{ padding: '5pt 7pt', verticalAlign: 'top' }}>
              <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#374151', textTransform: 'uppercase', marginBottom: '3pt', letterSpacing: '0.06em' }}>
                Head Teacher&apos;s Comment
              </div>
              <div style={{ fontSize: '8.5pt', color: '#111827', minHeight: '28pt', lineHeight: 1.5 }}>
                {data.headTeacherComment || '—'}
              </div>
              <div style={{ display: 'flex', gap: '8pt', marginTop: '10pt', borderTop: '0.5pt solid #9ca3af', paddingTop: '3pt' }}>
                <div style={{ flex: 1, fontSize: '7.5pt', color: '#6b7280' }}>
                  Name: {data.headTeacher} &nbsp;&nbsp; Signature: _______________
                </div>
                <div
                  style={{
                    width: '40pt', height: '40pt',
                    border: '0.5pt dashed #9ca3af',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '6.5pt', color: '#9ca3af', flexShrink: 0,
                  }}
                >
                  SCHOOL STAMP
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── 6. PROMOTION STATUS (annual — only once committed at Term 3) ── */}
      {data.promotionStatus && (
      <div
        style={{
          border: `2pt solid ${data.promotionStatus === 'PASS_AND_PROCEED' ? '#15803d' : '#dc2626'}`,
          borderRadius: '4pt',
          padding: '6pt 12pt',
          marginBottom: '8pt',
          background: data.promotionStatus === 'PASS_AND_PROCEED' ? '#f0fdf4' : '#fef2f2',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '10pt', fontWeight: 800, letterSpacing: '0.05em',
              color: data.promotionStatus === 'PASS_AND_PROCEED' ? '#15803d' : '#dc2626',
            }}
          >
            {data.promotionStatus === 'PASS_AND_PROCEED'
              ? `✓  PASS AND PROCEED${data.nextClass ? ` TO ${data.nextClass.toUpperCase()}` : ''}`
              : `✗  REPEAT ${data.student.className.toUpperCase()}`}
          </div>
          <div style={{ fontSize: '8pt', color: '#4b5563', marginTop: '2pt' }}>
            {data.promotionStatus === 'PASS_AND_PROCEED'
              ? 'This student has met the requirements to proceed to the next form.'
              : 'This student does not meet the minimum requirements for promotion.'}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '8pt', color: '#4b5563' }}>
          <div style={{ fontWeight: 600 }}>Average: {data.averagePercent.toFixed(1)}%</div>
          <div>Position: {ordinal(data.classPosition)} / {data.classTotal}</div>
        </div>
      </div>
      )}

      {/* ── 7. FOOTER ────────────────────────────────────────────────────── */}
      <div
        style={{
          borderTop: '1pt solid #d1d5db', paddingTop: '5pt',
          display: 'flex', justifyContent: 'space-between',
          fontSize: '7.5pt', color: '#6b7280',
        }}
      >
        <div>Date Issued: {fmt(data.issueDate)}</div>
        <div>Next Term Begins: {fmt(data.nextTermDate)}</div>
        <div
          style={{
            border: '0.5pt solid #d1d5db', padding: '2pt 6pt',
            borderRadius: '2pt', background: '#f9fafb',
          }}
        >
          OFFICIAL DOCUMENT — {data.schoolName.toUpperCase()}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADING KEY TABLE (rendered on screen only, hidden on print)
// ─────────────────────────────────────────────────────────────────────────────

function GradingKey({ scale }: { scale: GradingScaleRow[] }) {
  if (scale.length === 0) return null
  const sorted = [...scale].sort((a, b) => a.displayOrder - b.displayOrder)
  return (
    <div className="print:hidden mt-4 border border-base rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-page border-b border-base">
        <span className="text-xs font-heading font-bold text-muted uppercase tracking-wider">
          Grading Scale
        </span>
      </div>
      <div className="flex divide-x divide-base">
        {sorted.map((row) => (
          <div key={row.grade} className="flex-1 px-3 py-2 text-center">
            <div className="text-lg font-bold" style={{ color: gradeColor(row) }}>
              {row.grade}
            </div>
            <div className="text-[10px] text-muted">{row.minPercent}–{row.maxPercent}%</div>
            <div className="text-[10px] text-body font-medium">{row.label ?? '—'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINTABLE REPORT CARD — main export
// Wraps the page content with a screen preview shell and a print trigger.
// ─────────────────────────────────────────────────────────────────────────────

interface PrintableReportCardProps {
  data:      ReportCardData
  onClose?:  () => void
}

export function PrintableReportCard({ data, onClose }: PrintableReportCardProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const examTypeKey = data.classForm >= 3 ? 'INTERNAL_F3F4' : 'INTERNAL_F1F2'
  const { data: gradingScale = [] } = useGradingScales(examTypeKey)

  // react-to-print v3 API
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Report-Card-${data.student.registrationNo}-${data.academicYear}-T${data.term}`,
  })

  return (
    <div className="space-y-4">

      {/* ── Screen-only toolbar ─────────────────────────────────────────── */}
      <div className="print:hidden flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-heading font-bold text-lg text-brand-navy">
            Report Card Preview
          </h2>
          <p className="text-sm text-muted mt-0.5">
            {data.student.firstName} {data.student.lastName} ·{' '}
            {data.student.className} · {data.academicYear} Term {data.term}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handlePrint()}
            className="flex items-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors"
          >
            <Printer className="w-4 h-4" aria-hidden />
            Print / Save PDF
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-xl border border-base text-muted hover:bg-page hover:text-body transition-colors"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── A4 preview shell (screen only shadow/border) ─────────────────── */}
      {/*
        The outer div provides the screen preview aesthetics (shadow, rounded
        border, max-width) — these are all `print:hidden` visually but the
        inner printRef content is what actually gets printed.
      */}
      <div
        className="
          print:shadow-none print:border-none print:rounded-none print:max-w-none
          max-w-[210mm] mx-auto
          shadow-2xl border border-base rounded-sm
          bg-white
          overflow-hidden
        "
      >
        {/* printRef points here — react-to-print captures this exact element */}
        <div ref={printRef} className="p-[20mm]">
          <PrintableReportCardPage data={data} />
        </div>
      </div>

      {/* ── Grading key (screen only) ─────────────────────────────────── */}
      <GradingKey scale={gradingScale} />
    </div>
  )
}