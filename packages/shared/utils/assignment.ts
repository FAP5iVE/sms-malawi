/**
 * [FILE]: packages/shared/utils/assignment.ts
 * [PURPOSE]: The ONE place the assignment workflow's rules live, shared by the
 *   API (assignmentService, routes, file proxy) and the UI so that they can
 *   never disagree. Pure functions only - no I/O, no framework imports - so
 *   they are unit-testable without a database or a browser.
 *
 * DATES  School time is Africa/Blantyre (CAT, UTC+2, no daylight saving, which
 *   Malawi does not observe - hence a fixed offset is exact and needs no ICU).
 *   A due date is a CALENDAR DAY chosen by the teacher; the deadline is the last
 *   millisecond of that day in school time. Rows written before the Assignment
 *   workflow stored the due day as midnight UTC (= 02:00 CAT on the same day);
 *   deadlineFor() maps both representations to the same deadline, so no
 *   historical row is rewritten and none changes meaning.
 *
 * LATENESS  classifyByInstant() judges a student's own submission (an instant);
 *   classifyByDay() judges a teacher-recorded "submitted on" calendar day. They
 *   share deadlineFor()/schoolDayOf() so the two can never drift apart.
 *
 * WORKFLOW STATE  studentAssignmentState() is the single definition of what a
 *   student sees (PENDING / OVERDUE / SUBMITTED / LATE) and of the tab badge:
 *   the badge counts PENDING work only - not handed in AND not yet past its
 *   deadline. Overdue work stays visible in the list (and is flagged) but does
 *   not inflate the badge forever.
 *
 * FILES  The allowlists below are enforced server-side after a direct-to-storage
 *   upload (the API never sees the bytes, so it inspects the stored object's
 *   metadata). Executable / script-capable types (html, svg, js, xml...) are
 *   never allowed: they would run on the app origin if opened through the
 *   same-origin file proxy.
 */

// ─── School time ─────────────────────────────────────────────────────────────

export const SCHOOL_TIME_ZONE = 'Africa/Blantyre'
const SCHOOL_OFFSET_MS = 2 * 60 * 60 * 1000
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-31, 2026-13-01). */
export function isValidYmd(value: string): boolean {
  const m = YMD.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d
}

/** The calendar day (YYYY-MM-DD) of an instant, in school time. */
export function schoolDayOf(at: Date | string | number): string {
  const ms = at instanceof Date ? at.getTime() : new Date(at).getTime()
  return new Date(ms + SCHOOL_OFFSET_MS).toISOString().slice(0, 10)
}

export const todayInSchool = (now: Date = new Date()): string => schoolDayOf(now)

/** Whole days from `fromYmd` to `toYmd` (negative when `toYmd` is earlier). */
export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000)
}

/** The last millisecond of a school-time day. */
export function endOfSchoolDay(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999+02:00`)
}

/** Midday of a school-time day - where a teacher-entered "submitted on" date is stored,
 *  so the calendar day is stable whatever time zone the value is later read in. */
export function noonOfSchoolDay(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000+02:00`)
}

/** When an assignment stops being on time. Works for new rows (end of the due day)
 *  and legacy rows (midnight UTC of the due day). */
export function deadlineFor(dueDate: Date | string): Date {
  return endOfSchoolDay(schoolDayOf(dueDate))
}

export type HandInStatus = 'SUBMITTED' | 'LATE'

/** Status of a student's own hand-in made at the instant `at`. */
export function classifyByInstant(at: Date, dueDate: Date | string): HandInStatus {
  return at.getTime() > deadlineFor(dueDate).getTime() ? 'LATE' : 'SUBMITTED'
}

/** Status of a hand-in recorded as made on school-time day `submittedOn`. */
export function classifyByDay(submittedOn: string, dueDate: Date | string): HandInStatus {
  return submittedOn > schoolDayOf(dueDate) ? 'LATE' : 'SUBMITTED'
}

/**
 * Validates the "submitted on" day a teacher enters. Returns a user-facing message,
 * or null when acceptable. Rules: a real date; not in the future; not before the
 * assignment was posted (a hand-in cannot predate the assignment).
 */
export function validateSubmittedOn(
  submittedOn: string,
  ctx: { postedAt: Date | string; now?: Date },
): string | null {
  if (!isValidYmd(submittedOn)) return 'Enter a valid submitted-on date.'
  if (submittedOn > todayInSchool(ctx.now)) return 'The submitted-on date cannot be in the future.'
  if (submittedOn < schoolDayOf(ctx.postedAt)) return 'The submitted-on date cannot be before the assignment was posted.'
  return null
}

// ─── Workflow state (one definition for UI + API) ────────────────────────────

export type SubmissionStatusLike = 'SUBMITTED' | 'LATE' | 'MISSING'
export type StudentAssignmentState = 'PENDING' | 'OVERDUE' | 'SUBMITTED' | 'LATE'

/**
 * What a student sees for one assignment.
 *  - SUBMITTED / LATE : there is a real hand-in (a "MISSING" marker is NOT a hand-in)
 *  - OVERDUE          : nothing handed in and the deadline has passed
 *  - PENDING          : nothing handed in and still on time
 */
export function studentAssignmentState(input: {
  dueDate: Date | string
  submission?: { status: SubmissionStatusLike } | null
  now?: Date
}): StudentAssignmentState {
  const s = input.submission
  if (s && s.status === 'LATE') return 'LATE'
  if (s && s.status === 'SUBMITTED') return 'SUBMITTED'
  const now = input.now ?? new Date()
  return now.getTime() > deadlineFor(input.dueDate).getTime() ? 'OVERDUE' : 'PENDING'
}

/** The tab badge: work still to do and still on time. */
export const isOutstanding = (state: StudentAssignmentState): boolean => state === 'PENDING'

// ─── Rich text helpers ───────────────────────────────────────────────────────

/** Visible text, a picture or a formula. An emptied editor still emits "<p></p>". */
export function richTextHasContent(html: string | null | undefined): boolean {
  if (!html) return false
  if (/<img\b|data-math=/i.test(html)) return true
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}

/** UTF-8 byte length (the API's JSON body limit is in BYTES; Chichewa/accents/formulas are multi-byte). */
export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length
}

/** Storage ids of pictures embedded in rich text, e.g. "assignment_image_ab12...". */
export function extractEmbeddedFileIds(html: string | null | undefined, idPrefix: string): string[] {
  if (!html) return []
  const re = new RegExp(`${idPrefix}_[A-Za-z0-9]{6,32}`, 'g')
  return Array.from(new Set(html.match(re) ?? []))
}

// ─── File rules ──────────────────────────────────────────────────────────────

export const ASSIGNMENT_LIMITS = {
  /** Per file, for teacher attachments and student hand-ins. */
  maxFileBytes: 20 * 1024 * 1024,
  maxAttachments: 10,
  maxEmbeddedImages: 20,
  /** Rich-text field caps in UTF-8 bytes, sized so the whole JSON body fits express.json's 50 KB limit. */
  maxContentBytes: 30_000,
  maxRequirementsBytes: 8_000,
} as const

export type AssignmentFileKind = 'ATTACHMENT' | 'SUBMISSION' | 'IMAGE'

const DOCUMENT_TYPES: Record<string, readonly string[]> = {
  pdf:  ['application/pdf'],
  doc:  ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ppt:  ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  xls:  ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv:  ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
  txt:  ['text/plain'],
  odt:  ['application/vnd.oasis.opendocument.text'],
  ods:  ['application/vnd.oasis.opendocument.spreadsheet'],
  odp:  ['application/vnd.oasis.opendocument.presentation'],
  zip:  ['application/zip', 'application/x-zip-compressed'],
}
// Raster images only. SVG is deliberately absent: it can carry script.
const IMAGE_TYPES: Record<string, readonly string[]> = {
  jpg:  ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png:  ['image/png'],
  gif:  ['image/gif'],
  webp: ['image/webp'],
  heic: ['image/heic', 'image/heif'],
  heif: ['image/heic', 'image/heif'],
}

const RULES: Record<AssignmentFileKind, Record<string, readonly string[]>> = {
  // Teacher worksheets: documents and pictures.
  ATTACHMENT: { ...DOCUMENT_TYPES, ...IMAGE_TYPES },
  // Students hand in documents and photos of handwritten work.
  SUBMISSION: { ...DOCUMENT_TYPES, ...IMAGE_TYPES },
  // Pictures embedded in rich text must be raster images.
  IMAGE: IMAGE_TYPES,
}

/** File-picker `accept` string for a kind (UI hint only - the server is the check). */
export function acceptAttribute(kind: AssignmentFileKind): string {
  return Object.keys(RULES[kind]).map((e) => `.${e}`).join(',')
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

/**
 * Checks a stored/selected file's metadata against the allowlist for its kind.
 * Returns a user-facing message, or null when acceptable. The extension must be
 * allowed AND the reported MIME type must be one of the types allowed for that
 * extension (so "evil.html" renamed "evil.pdf" with an HTML type is refused).
 */
export function checkFileAgainstRules(
  meta: { name: string; mimeType: string; sizeBytes: number },
  kind: AssignmentFileKind,
): string | null {
  const ext = fileExtension(meta.name)
  const allowedMimes = RULES[kind][ext]
  if (!allowedMimes) return `"${meta.name}" is not an allowed file type.`
  if (meta.sizeBytes <= 0) return `"${meta.name}" is empty.`
  if (meta.sizeBytes > ASSIGNMENT_LIMITS.maxFileBytes) return `"${meta.name}" is larger than ${ASSIGNMENT_LIMITS.maxFileBytes / 1024 / 1024} MB.`
  const mime = (meta.mimeType.split(';')[0] ?? '').trim().toLowerCase()
  if (!allowedMimes.includes(mime)) return `"${meta.name}" does not look like a .${ext} file.`
  return null
}

/** Types the browser may render inline from the same-origin file proxy. Everything else downloads. */
export function isInlineSafeMime(mimeType: string): boolean {
  const mime = (mimeType.split(';')[0] ?? '').trim().toLowerCase()
  return mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/gif' || mime === 'image/webp'
}
