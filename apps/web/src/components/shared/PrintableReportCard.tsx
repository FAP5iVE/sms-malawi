'use client'

/**
 * apps/web/src/components/shared/PrintableReportCard.tsx — DESIGN REWRITE (document redesign)
 *
 * [CHANGE TYPE]: REDESIGN of the card page + print wrapper; ReportCardData extended
 * [PURPOSE]: The on-screen/print report card is now the SAME document as the
 *   downloaded PDF (reportCardService.generateReportCardPDF): the shared navy
 *   letterhead (components/shared/PrintLetterhead), student card with Standing,
 *   a results block that follows the grading TRACK — JCE: C.A./Exam/Total/Grade/
 *   Remarks + term average and overall grade; MSCE: adds a Points column with the
 *   best-six subjects highlighted and an aggregate instead of an average; MANEB
 *   JCE/MSCE result cards — then attendance, the GRADING SCALE (now printed on the
 *   card, previously a screen-only strip), comments, real head/class teacher names
 *   and titles, and a circular authentication stamp.
 *   - Everything variable arrives in ReportCardData from getReportCardData(): the
 *     scale rows, remarks (= scale labels), signatories, next-term date. Nothing
 *     is typed in here.
 *   - ONE A4 page: the card is exactly 210 x 296 mm; subject rows flex between
 *     4.2 and 8.4 mm to use the space. The wrapper prints with a zero @page margin
 *     (the global 15/20 mm margin would push the card onto a second page).
 *   - Built from div grids, not <table>: globals.css forces borders/padding on every
 *     th/td at print time.
 *   - Paper colours are fixed (PrintLetterhead.PAPER): paper never re-themes.
 * ── earlier notes ────────────────────────────────────────────────────────────
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

import { useId, useRef }     from 'react'
import type { ReactNode }    from 'react'
import { useReactToPrint }   from 'react-to-print'
import { Printer, X }        from 'lucide-react'
import { useGradingScales }  from '@/hooks/useSettings'
import { FONT_BODY, FONT_HEAD, LetterheadPanel, PAPER } from '@/components/shared/PrintLetterhead'
import { MSCE_AGGREGATE_BEST, MSCE_AGGREGATE_SUBJECT_COUNT, MSCE_AGGREGATE_WORST, getGradingTrack } from '@shared/constants/malawi'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SubjectGrade {
  subject:     string
  caScore?:    number   // Continuous assessment points counted in `total` (weights set in Settings > Exam & Grading)
  examScore?:  number   // End-of-term exam points counted in `total`; caScore + examScore === total
  total:       number   // Weighted total out of 100
  grade:       string   // A / B / C / D / F  (JCE track)  or  1–9  (MSCE track)
  remarks?:    string   // the grading-scale label for `grade` ("Distinction", "Credit", ...)
  /** MSCE track only — the grade's point value on the 1–9 scale (gradeService.getGradePoints). */
  points?:       number | null
  /** MSCE track only — true when this subject is one of the best six counted in the aggregate. */
  inAggregate?:  boolean
}

/** One tier of the grading scale this card was graded on — the same rows as
 *  Settings > Exam & Grading (gradeService), trimmed to what a card prints. */
export interface ReportGradeScaleRow {
  grade:      string
  minPercent: number
  maxPercent: number
  pass:       boolean
  label:      string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// GR-2: MANEB NATIONAL RESULT (JCE/MSCE) — Form 2 Term 3 and Form 4 Term 3
// have no internal exam (MANEB administers JCE/MSCE nationally for those
// slots — see @shared/constants/malawi's getManebExamType()), so a report
// card for those terms carries a manebResult instead of the usual
// CA/Exam/Total subjects table. JCE and MSCE are intentionally different
// shapes here too — see gradeService.ts's JceOutcome/MsceOutcome.
// ─────────────────────────────────────────────────────────────────────────────

export interface ManebSubjectRow {
  subject:      string
  grade:        string
  label:        string | null   // e.g. "Distinction", "Credit", "Excellent" — scale-driven, admin-editable
  pass:         boolean
  /** MSCE only — true if this subject's points are one of the six counted
   *  in the aggregate sum. Always undefined for JCE (no aggregate exists). */
  inAggregate?: boolean
}

export interface ManebResultData {
  examType:            'JCE' | 'MSCE'
  candidateNo:         string
  centerNo:             string
  centerName:           string
  status:               string
  subjects:             ManebSubjectRow[]
  classification:       string
  pass:                 boolean
  /** MSCE only — sum of the best-six performed subjects (6–54); null if
   *  fewer than six subjects were performed. Always null for JCE. */
  points:               number | null
  certificateOption:    'A' | 'B' | null
  englishInAggregate:   boolean | null
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

  /** [MSCE CORRECTION] Which grading system produced this card's results.
   *  'MSCE' (Forms 3-4) summarises the term as an AGGREGATE OF POINTS — the
   *  sum of the six best subjects, 6-54, lower is better. 'JCE' (Forms 1-2)
   *  summarises it as an overall grade off the term average. The aggregate
   *  row at the foot of the grades table branches on this; it previously
   *  printed the average percentage for every form and left the Grade cell
   *  as a bare em dash, so an MSCE card never showed a points total at all. */
  gradingTrack?:     'JCE' | 'MSCE'
  /** MSCE track only — the aggregate. Null when fewer than six subjects
   *  were graded, in which case no valid six-subject sum exists. */
  aggregatePoints?:  number | null
  /** MSCE track only — the (up to six) subjects counted in the aggregate. */
  aggregateSubjects?: string[]

  /** GR-2: present only for Form 2 Term 3 (JCE) / Form 4 Term 3 (MSCE) —
   *  when set, the card renders the MANEB result section instead of the
   *  internal CA/Exam/Total grades table above (subjects/classPosition/
   *  classTotal/totalMarks/averagePercent are left at empty defaults). */
  manebResult?:    ManebResultData

  // Attendance
  daysPresent:     number
  daysAbsent:      number
  totalSchoolDays: number

  /** The grading scale this card was graded on (JCE track -> INTERNAL_F1F2,
   *  MSCE track -> INTERNAL_F3F4, MANEB card -> JCE / MSCE), in display order.
   *  Printed as the card's "Grading Scale" key. Optional: a stale payload
   *  without it falls back to useGradingScales() on screen. */
  gradingScale?:   ReportGradeScaleRow[]
  /** JCE track only — overall letter grade of the term average (gradeService.
   *  computeInternalTermOutcome). Empty/undefined on the MSCE track: an MSCE
   *  term has no overall grade, only an aggregate of points. */
  overallGrade?:   string

  // Staff — names/titles come from the staff directory (never a placeholder)
  classTeacher:           string   // class teacher's name, or '—'
  classTeacherTitle?:     string   // their job title, e.g. "Mathematics Teacher"
  classTeacherComment:    string
  headTeacher:            string   // head teacher's name, or '—'
  headTeacherTitle?:      string   // their job title, e.g. "Head Teacher"
  headTeacherComment:     string

  // Outcome
  promotionStatus: 'PASS_AND_PROCEED' | 'REPEAT' | null   // null = no promotion determination yet (Terms 1–2, or Term 3 pre-commit)
  nextClass?:      string     // e.g. "Form 3A"

  // Admin
  issueDate:       string     // ISO date string
  /** First day of the next term (Settings > Academic term dates). Undefined
   *  when there is none — a graduating Form 4 Term 3 card. */
  nextTermDate?:   string     // ISO date string
  /** Stamp lower-arc text derived from the school address ("Northern Region · Malawi"). */
  schoolPlace?:    string
  /** IANA timezone from Settings > Identity — dates are printed in it. */
  timezone?:       string
}

// Paper palette, typefaces and the navy letterhead panel live in PrintLetterhead.tsx — one
// definition shared by every browser-printed document (and mirrored by the PDF kit).

/** Ink for a grade, from the scale row itself: fail = red, a bare "Pass" tier = amber, any higher tier = green. */
function gradeInk(row: ReportGradeScaleRow | undefined): string {
  if (!row) return PAPER.neutral
  if (!row.pass) return PAPER.danger
  return (row.label ?? '').trim().toLowerCase() === 'pass' ? PAPER.warning : PAPER.success
}

/** "22 October 2026" in the school's timezone; a bare YYYY-MM-DD is a calendar date, not an instant. */
function fmtDay(iso: string, tz?: string, month: 'long' | 'short' = 'long'): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  const base = { day: '2-digit', month, year: 'numeric' } as const
  try {
    return new Intl.DateTimeFormat('en-GB', { ...base, ...(dateOnly ? { timeZone: 'UTC' } : tz ? { timeZone: tz } : {}) }).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat('en-GB', base).format(new Date(iso))
  }
}

const labelStyle = { fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '6.8pt', letterSpacing: '0.07em', textTransform: 'uppercase', color: PAPER.muted } as const
const cardStyle = { border: `0.3mm solid ${PAPER.rule}`, borderRadius: '2.2mm', background: PAPER.white } as const

// ── Authentication stamp — circular, double ring, text on the arcs ───────────
function SchoolStamp({ schoolName, place, label, date, caption, color, size }: {
  schoolName: string; place: string; label: string; date: string; caption: string; color: string; size: string
}) {
  const uid = useId().replace(/:/g, '')
  const R = 48, cx = 50, cy = 50
  const rInner = R * 0.63
  const rMid = rInner + (R - 0.95 - rInner) / 2
  const top = schoolName.toUpperCase()
  const bottom = (place || label).toUpperCase()
  const fs = Math.min(4.6, Math.max(2.6, (rMid * 2.7) / (Math.max(top.length, bottom.length) * 0.78)))
  const cap = fs * 0.72
  const rTop = rMid - cap / 2
  const rBot = rMid + cap / 2
  const labelFs = Math.min(14, (rInner * 1.5) / (label.length * 0.78))
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ opacity: 0.92, display: 'block' }} aria-label={`${label} stamp`}>
      <defs>
        <path id={`${uid}t`} d={`M ${cx - rTop} ${cy} A ${rTop} ${rTop} 0 0 1 ${cx + rTop} ${cy}`} />
        <path id={`${uid}b`} d={`M ${cx - rBot} ${cy} A ${rBot} ${rBot} 0 0 0 ${cx + rBot} ${cy}`} />
      </defs>
      <g fill="none" stroke={color}>
        <circle cx={cx} cy={cy} r={R} strokeWidth="1.8" />
        <circle cx={cx} cy={cy} r={R - 0.95 * 3.2} strokeWidth="0.7" />
        <circle cx={cx} cy={cy} r={rInner} strokeWidth="1" />
      </g>
      <g fill={color} style={{ fontFamily: FONT_HEAD, fontWeight: 700 }}>
        <text fontSize={fs} letterSpacing="0.9"><textPath href={`#${uid}t`} startOffset="50%" textAnchor="middle">{top}</textPath></text>
        <text fontSize={fs} letterSpacing="0.9"><textPath href={`#${uid}b`} startOffset="50%" textAnchor="middle">{bottom}</textPath></text>
        <circle cx={cx - rMid} cy={cy} r="1.5" />
        <circle cx={cx + rMid} cy={cy} r="1.5" />
        <text x={cx} y={cy - 1} fontSize={labelFs} textAnchor="middle" letterSpacing="1.2">{label.toUpperCase()}</text>
        <text x={cx} y={cy + 12} fontSize="5.8" textAnchor="middle" style={{ fontFamily: FONT_BODY }}>{date}</text>
        <text x={cx} y={cy + 20} fontSize="4.2" textAnchor="middle" letterSpacing="1">{caption.toUpperCase()}</text>
      </g>
      <line x1={cx - rInner * 0.62} x2={cx + rInner * 0.62} y1={cy + 2.6} y2={cy + 2.6} stroke={color} strokeWidth="0.6" />
    </svg>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────
function StudentCard({ rows }: { rows: Array<[[string, string], [string, string]]> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '1.2mm 0' }}>
      {rows.map(([l, r], i) => (
        [l, r].map(([k, v], j) => (
          <div key={`${i}-${j}`} style={{ display: 'grid', gridTemplateColumns: '25mm 1fr', alignItems: 'center', height: '5.5mm', padding: '0 2mm 0 2mm', margin: 0, borderLeft: j === 1 ? `0.15mm solid ${PAPER.border}` : undefined, borderTop: i > 0 ? `0.15mm solid ${PAPER.border}` : undefined }}>
            <span style={{ fontSize: '7.2pt', color: PAPER.muted }}>{k}</span>
            <span style={{ fontSize: '8.4pt', fontWeight: 700, color: PAPER.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</span>
          </div>
        ))
      ))}
    </div>
  )
}

function HeaderRow({ cols, labels, aligns }: { cols: string; labels: string[]; aligns: Array<'left' | 'center'> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', height: '6.6mm', background: PAPER.navy, color: PAPER.white, fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '7pt', borderRadius: '1.8mm 1.8mm 0 0' }}>
      {labels.map((l, i) => <div key={l} style={{ textAlign: aligns[i], padding: aligns[i] === 'left' ? '0 0 0 3mm' : 0 }}>{l}</div>)}
    </div>
  )
}

/** Rows share whatever height the page has left, between 4.2 mm and 8.4 mm each — the one-page guarantee. */
const rowFlex = { flex: '1 1 0', minHeight: '4.2mm', maxHeight: '8.4mm', display: 'grid', alignItems: 'center', borderBottom: `0.12mm solid ${PAPER.border}` } as const

function GradingScaleCard({ rows, name }: { rows: ReportGradeScaleRow[]; name: string }) {
  return (
    <div style={{ ...cardStyle, overflow: 'hidden', flex: '0 0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '5.4mm', padding: '0 4mm', background: PAPER.zebra, borderBottom: `0.2mm solid ${PAPER.border}` }}>
        <span style={{ ...labelStyle, color: PAPER.neutral }}>Grading Scale</span>
        <span style={{ fontSize: '6.8pt', fontWeight: 700, color: PAPER.muted }}>{name}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, rows.length)}, 1fr)`, height: '12.6mm' }}>
        {rows.map((r, i) => (
          <div key={r.grade} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: i > 0 ? `0.15mm solid ${PAPER.border}` : undefined, margin: '1.6mm 0', lineHeight: 1.25 }}>
            <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: rows.length > 6 ? '10.5pt' : '12pt', color: gradeInk(r) }}>{r.grade}</span>
            <span style={{ fontSize: '6.6pt', color: PAPER.muted }}>{r.minPercent}–{r.maxPercent}%</span>
            <span style={{ fontSize: '6.8pt', fontWeight: 700, color: PAPER.ink }}>{r.label ?? (r.pass ? 'Pass' : 'Fail')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SignCard({ title, comment, name, role, stampSide, children }: {
  title: string; comment: string | null; name: string; role?: string; stampSide: boolean; children?: ReactNode
}) {
  return (
    <div style={{ position: 'relative', height: comment === null ? '24mm' : '36mm', padding: '3mm 0 0', flex: 1 }}>
      <div style={labelStyle}>{title}</div>
      {comment !== null && (
        <div style={{ marginTop: '1.8mm', fontSize: '7.8pt', lineHeight: 1.37, color: comment ? PAPER.neutral : PAPER.muted, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: stampSide ? '0' : 0 }}>
          {comment ? `“${comment}”` : '—'}
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '12.6mm', borderTop: `0.15mm solid ${PAPER.border}` }}>
        <div style={{ position: 'absolute', left: 0, top: '1.4mm', ...labelStyle, fontSize: '5.4pt' }}>Name</div>
        <div style={{ position: 'absolute', right: stampSide ? '30mm' : 0, top: '1.4mm', ...labelStyle, fontSize: '5.4pt' }}>Signature</div>
        <div style={{ position: 'absolute', left: 0, top: '3.9mm', maxWidth: '50%', fontWeight: 700, fontSize: '8.6pt', color: PAPER.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        {role && <div style={{ position: 'absolute', left: 0, top: '7.6mm', maxWidth: '50%', fontSize: '6.6pt', color: PAPER.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{role}</div>}
        <div style={{ position: 'absolute', right: stampSide ? '30mm' : 0, bottom: '3.2mm', width: '30mm', borderBottom: `0.2mm solid ${PAPER.muted}` }} />
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT CARD PAGE — exactly one A4 sheet (210 × 296 mm), rendered inside printRef.
// Exported separately so batch print can wrap several inside one printRef.
//
// Same document as the downloaded PDF (reportCardService.generateReportCardPDF):
// same letterhead, same blocks, same track logic. Everything variable is read
// from `data` (built server-side from the system): JCE letter grades vs MSCE
// 1–9 + best-six aggregate, the scale rows, remarks, signatories, next term.
//
// Built from div grids, not <table>: globals.css forces borders/padding on every
// th/td at print time, which would fight a designed layout.
// ─────────────────────────────────────────────────────────────────────────────

export function PrintableReportCardPage({ data }: { data: ReportCardData }) {
  const maneb = data.manebResult
  const track: 'JCE' | 'MSCE' = maneb ? maneb.examType : (data.gradingTrack ?? getGradingTrack(data.classForm))
  const isMsce = track === 'MSCE'

  // The scale: server-supplied with the card; a stale payload falls back to the live settings rows.
  const examTypeKey = maneb ? maneb.examType : (isMsce ? 'INTERNAL_F3F4' : 'INTERNAL_F1F2')
  const { data: fetched = [] } = useGradingScales(examTypeKey)
  const scale: ReportGradeScaleRow[] = data.gradingScale?.length
    ? data.gradingScale
    : [...fetched].sort((a, b) => a.displayOrder - b.displayOrder).map((r) => ({ grade: r.grade, minPercent: r.minPercent, maxPercent: r.maxPercent, pass: r.pass, label: r.label }))
  const scaleOf = new Map(scale.map((r) => [r.grade, r]))

  const tz = data.timezone
  const fullName = `${data.student.firstName} ${data.student.lastName}`.trim()
  const sex = data.student.sex ? data.student.sex.charAt(0).toUpperCase() + data.student.sex.slice(1).toLowerCase() : '—'
  const dob = data.student.dateOfBirth ? fmtDay(data.student.dateOfBirth, tz) : '—'
  const standing = maneb || !data.classPosition ? '—' : `Position: ${data.classPosition} of ${data.classTotal}`
  const attPct = data.totalSchoolDays > 0 ? Math.round((data.daysPresent / data.totalSchoolDays) * 100) : 0
  const n = maneb ? maneb.subjects.length : data.subjects.length
  const dense = n > 16 ? '7.1pt' : n > 13 ? '7.6pt' : '8pt'

  const cols = maneb
    ? (isMsce ? '66mm 22mm 58mm 1fr' : '80mm 26mm 1fr')
    : (isMsce ? '50mm 20mm 20mm 22mm 16mm 16mm 1fr' : '54mm 22mm 22mm 24mm 18mm 1fr')
  const outInk = maneb?.pass ? PAPER.success : PAPER.danger
  const zebra = (i: number) => (i % 2 === 1 ? PAPER.zebra : PAPER.white)

  return (
    <div className="report-card print-no-break">
      <div
        style={{
          width: '210mm', height: '296mm', boxSizing: 'border-box', padding: '10mm 12mm 8mm',
          display: 'flex', flexDirection: 'column', gap: '3.2mm', overflow: 'hidden', position: 'relative',
          background: PAPER.white, color: PAPER.ink, fontFamily: FONT_BODY, fontSize: '8pt',
          WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
        }}
      >
        <LetterheadPanel
          schoolName={data.schoolName}
          motto={data.schoolMotto}
          contact={[data.schoolAddress, data.schoolPhone ? `Tel: ${data.schoolPhone}` : '', data.schoolEmail]}
          logoSrc={data.schoolLogoUrl}
          compact
        />

        {/* title */}
        <div style={{ textAlign: 'center', marginTop: '1.2mm' }}>
          <div style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '12pt', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {maneb ? `MANEB ${maneb.examType} EXAMINATION RESULT` : 'STUDENT REPORT CARD'}
          </div>
          <div style={{ fontSize: '8.2pt', color: PAPER.muted, marginTop: '1mm' }}>Academic Year {data.academicYear} — Term {data.term}</div>
        </div>

        <StudentCard
          rows={[
            [['Reg. Number', data.student.registrationNo], ['Full Name', fullName]],
            [['Class / Form', data.student.className], ['Sex', sex]],
            [['Class Teacher', data.classTeacher], maneb ? ['Candidate No.', maneb.candidateNo || '—'] : ['Standing', standing]],
            [['Date of Birth', dob], maneb ? ['Centre', maneb.centerNo ? `${maneb.centerNo} — ${maneb.centerName || '—'}` : '—'] : ['Subjects', String(data.subjects.length)]],
          ]}
        />

        {/* ── RESULTS ─────────────────────────────────────────────────────── */}
        {maneb ? (
          <>
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: '100 1 auto', maxHeight: `${6.6 + Math.max(1, n) * 8.4}mm` }}>
              <HeaderRow cols={cols} labels={isMsce ? ['Subject', 'Grade', 'Classification', 'In Aggregate'] : ['Subject', 'Grade', 'Classification']} aligns={isMsce ? ['left', 'center', 'left', 'center'] : ['left', 'center', 'left']} />
              <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', maxHeight: `${Math.max(1, n) * 8.4}mm` }}>
                {maneb.subjects.map((s, i) => (
                  <div key={s.subject} style={{ ...rowFlex, gridTemplateColumns: cols, background: zebra(i), fontSize: dense }}>
                    <div style={{ padding: '0 3mm', fontWeight: 700 }}>{s.subject}</div>
                    <div style={{ textAlign: 'center', fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '9.2pt', color: gradeInk(scaleOf.get(s.grade)) }}>{s.grade}</div>
                    <div style={{ color: PAPER.neutral }}>{s.label ?? '—'}</div>
                    {isMsce && (
                      <div style={{ textAlign: 'center' }}>
                        {s.inAggregate
                          ? <span style={{ background: PAPER.navyTint, color: PAPER.navy, fontWeight: 700, padding: '0.5mm 2.2mm', borderRadius: '1.2mm' }}>Counted</span>
                          : <span style={{ color: PAPER.muted }}>—</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...cardStyle, background: '#eef1f5', borderColor: PAPER.navy, borderWidth: '0.35mm', padding: '3mm 4mm', flex: '0 0 auto' }}>
              {isMsce ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ ...labelStyle, color: PAPER.navy }}>{`Aggregate (best ${MSCE_AGGREGATE_SUBJECT_COUNT} subjects)`}</span>
                    <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '11pt', color: PAPER.navy }}>{maneb.points != null ? `${maneb.points} points` : `Not available — fewer than ${MSCE_AGGREGATE_SUBJECT_COUNT} subjects`}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '1.4mm' }}>
                    <span style={{ ...labelStyle, color: PAPER.navy }}>Certificate Status</span>
                    <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '9.5pt', color: outInk }}>{maneb.classification}</span>
                  </div>
                  <div style={{ fontSize: '6.4pt', color: PAPER.muted, marginTop: '1mm' }}>Certificate eligibility is assessed separately from the aggregate above.</div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ ...labelStyle, color: PAPER.navy }}>Overall Result</span>
                  <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '11pt', color: outInk }}>{maneb.classification}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: '100 1 auto', maxHeight: `${6.6 + Math.max(1, n) * 8.4 + 7.2}mm` }}>
              <HeaderRow
                cols={cols}
                labels={isMsce ? ['Subject', 'C.A. (%)', 'Exam (%)', 'Total (%)', 'Grade', 'Points', 'Remarks'] : ['Subject', 'C.A. (%)', 'Exam (%)', 'Total (%)', 'Grade', 'Remarks']}
                aligns={isMsce ? ['left', 'center', 'center', 'center', 'center', 'center', 'left'] : ['left', 'center', 'center', 'center', 'center', 'left']}
              />
              <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', maxHeight: `${Math.max(1, n) * 8.4}mm` }}>
                {data.subjects.map((s, i) => (
                  <div key={s.subject} style={{ ...rowFlex, gridTemplateColumns: cols, background: zebra(i), fontSize: dense }}>
                    <div style={{ padding: '0 3mm', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.subject}</div>
                    <div style={{ textAlign: 'center', color: PAPER.neutral }}>{s.caScore != null ? s.caScore.toFixed(1) : '—'}</div>
                    <div style={{ textAlign: 'center', color: PAPER.neutral }}>{s.examScore != null ? s.examScore.toFixed(1) : '—'}</div>
                    <div style={{ textAlign: 'center', fontWeight: 700 }}>{s.total.toFixed(1)}</div>
                    <div style={{ textAlign: 'center', fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '9.4pt', color: gradeInk(scaleOf.get(s.grade)) }}>{s.grade}</div>
                    {isMsce && (
                      <div style={{ textAlign: 'center' }}>
                        <span style={s.inAggregate ? { background: PAPER.navyTint, color: PAPER.navy, fontFamily: FONT_HEAD, fontWeight: 700, padding: '0.6mm 2.4mm', borderRadius: '1.2mm' } : { color: PAPER.muted }}>
                          {s.points != null ? s.points : '—'}
                        </span>
                      </div>
                    )}
                    <div style={{ color: PAPER.neutral, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.remarks ?? '—'}</div>
                  </div>
                ))}
              </div>
              {/* summary — what differs by track comes from the track */}
              <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', height: '7.2mm', background: PAPER.navyTint, borderTop: `0.35mm solid ${PAPER.navy}`, flex: '0 0 auto' }}>
                <div style={{ padding: '0 3mm', display: 'flex', alignItems: 'baseline', gap: '4mm', whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '8pt', letterSpacing: '0.08em', color: PAPER.navy }}>{isMsce ? 'AGGREGATE' : 'OVERALL'}</span>
                  <span style={{ fontSize: '7.4pt', color: PAPER.muted }}>{data.subjects.length} Subjects</span>
                </div>
                <div /><div />
                {isMsce ? (
                  <div style={{ gridColumn: '4 / span 3', textAlign: 'left', paddingLeft: '4mm', fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '9.2pt', color: PAPER.navy, whiteSpace: 'nowrap' }}>
                    {data.aggregatePoints != null ? `${data.aggregatePoints} points` : 'Not available'}
                  </div>
                ) : (
                  <>
                    <div style={{ textAlign: 'center', fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '9.2pt' }}>{data.averagePercent.toFixed(1)}%</div>
                    <div style={{ textAlign: 'center', fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '10pt', color: gradeInk(data.overallGrade ? scaleOf.get(data.overallGrade) : undefined) }}>{data.overallGrade ?? ''}</div>
                  </>
                )}
                <div style={{ gridColumn: '-2 / -1', textAlign: 'right', paddingRight: '3mm', fontWeight: 700, fontSize: '8.2pt', whiteSpace: 'nowrap' }}>
                  {data.classPosition ? `Position: ${data.classPosition} / ${data.classTotal}` : 'Position: —'}
                </div>
              </div>
            </div>
            {isMsce && (
              <div style={{ fontSize: '6.4pt', color: PAPER.muted, marginTop: '-1.6mm', paddingLeft: '1mm' }}>
                {data.aggregatePoints != null
                  ? `Aggregate = sum of the points of the ${MSCE_AGGREGATE_SUBJECT_COUNT} best subjects (range ${MSCE_AGGREGATE_BEST}–${MSCE_AGGREGATE_WORST}; lower is better); highlighted points are the subjects counted. MSCE awards no overall grade.`
                  : `Aggregate not available — ${MSCE_AGGREGATE_SUBJECT_COUNT} graded subjects are required to form an MSCE aggregate.`}
              </div>
            )}
          </>
        )}

        {/* spacer: what's left once every row has reached its 8.4 mm cap (very few subjects) */}
        <div style={{ flex: '1 1 0', minHeight: 0 }} />

        {/* ── ATTENDANCE ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', height: '10mm', padding: '0 2mm', flex: '0 0 auto' }}>
          <span style={{ ...labelStyle, color: PAPER.neutral, width: '32mm' }}>Attendance</span>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between' }}>
            {([['Days Present', String(data.daysPresent)], ['Days Absent', String(data.daysAbsent)], ['Total Days', String(data.totalSchoolDays)], ['Attendance Rate', `${attPct}%`]] as const).map(([l, v]) => (
              <span key={l} style={{ whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: '7.6pt', color: PAPER.muted }}>{l}: </span>
                <span style={{ fontSize: '8.8pt', fontWeight: 700 }}>{v}</span>
              </span>
            ))}
          </div>
        </div>

        {scale.length > 0 && <GradingScaleCard rows={scale} name={`${track} scale`} />}

        {data.promotionStatus && (() => {
          const pass = data.promotionStatus === 'PASS_AND_PROCEED'
          const ink = pass ? PAPER.success : PAPER.danger
          return (
            <div style={{ ...cardStyle, borderColor: ink, borderWidth: '0.4mm', background: pass ? '#ecf7f2' : '#fbeeee', height: '8.5mm', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '9.5pt', letterSpacing: '0.06em', color: ink, textTransform: 'uppercase' }}>
                {pass ? `Pass and Proceed${data.nextClass ? ` to ${data.nextClass}` : ''}` : `Repeat ${data.student.className}`}
              </span>
            </div>
          )
        })()}

        {/* ── COMMENTS / SIGNATURES + STAMP ───────────────────────────────── */}
        <div style={{ display: 'flex', gap: '4mm', flex: '0 0 auto' }}>
          <SignCard title={maneb ? 'Class Teacher' : "Class Teacher's Comment"} comment={maneb ? null : data.classTeacherComment} name={data.classTeacher} role={data.classTeacherTitle} stampSide={false} />
          <SignCard title={maneb ? 'Head Teacher' : "Head Teacher's Comment"} comment={maneb ? null : data.headTeacherComment} name={data.headTeacher} role={data.headTeacherTitle} stampSide>
            <div style={{ position: 'absolute', right: '1mm', bottom: '1.2mm' }}>
              <SchoolStamp schoolName={data.schoolName} place={data.schoolPlace ?? ''} label="Official" date={fmtDay(data.issueDate, tz, 'short')} caption="Validated" color={PAPER.navy} size="21mm" />
            </div>
          </SignCard>
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────────────── */}
        <div style={{ borderTop: `0.25mm solid ${PAPER.border}`, paddingTop: '1.6mm', display: 'flex', justifyContent: 'space-between', gap: '4mm', fontSize: '7.2pt', color: PAPER.muted, flex: '0 0 auto' }}>
          <span style={{ whiteSpace: 'nowrap' }}>Date Issued: <b style={{ color: PAPER.ink }}>{fmtDay(data.issueDate, tz)}</b></span>
          {data.nextTermDate && <span style={{ whiteSpace: 'nowrap' }}>Next Term Begins: <b style={{ color: PAPER.ink }}>{fmtDay(data.nextTermDate, tz)}</b></span>}
          <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: '6.2pt', letterSpacing: '0.05em', color: PAPER.neutral, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Official Document — {data.schoolName}
          </span>
        </div>
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

/** The card is a full A4 sheet with its own margins, so the browser's page margin must be zero
 *  (globals.css sets a 15/20 mm @page margin for text documents, which would push the card to page 2). */
const REPORT_CARD_PAGE_STYLE = '@page { size: A4 portrait; margin: 0 !important; } @page :first { margin: 0 !important; } html, body { margin: 0 !important; padding: 0 !important; }'

export function PrintableReportCard({ data, onClose }: PrintableReportCardProps) {
  const printRef = useRef<HTMLDivElement>(null)

  // react-to-print v3 API
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Report-Card-${data.student.registrationNo}-${data.academicYear}-T${data.term}`,
    pageStyle: REPORT_CARD_PAGE_STYLE,
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
            className="flex items-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-deep text-white hover:brightness-110 transition-colors"
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

      {/* ── A4 preview shell (screen-only shadow / border) ────────────────── */}
      {/* The card carries its own 12 mm margins, so printRef wraps it with no padding.
          The grading scale is now part of the card itself (it used to be a screen-only strip below it). */}
      <div className="print:shadow-none print:border-none print:rounded-none max-w-[210mm] mx-auto shadow-2xl border border-base rounded-sm bg-white overflow-hidden">
        <div ref={printRef}>
          <PrintableReportCardPage data={data} />
        </div>
      </div>
    </div>
  )
}
