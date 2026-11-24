/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/server/services/studentService.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records; R15 — UI/UX
 *   Polish adds sortBy/sortDir to StudentQueryFilters with the
 *   SORTABLE_STUDENT_COLUMNS allow-list, backing DataTable's new onSort
 *   server-side sort dispatch for this (currently the only)
 *   server-paginated list view.
 * [PURPOSE]: Four changes. (1) create()'s CreateStudentInput gains a
 *   `status` field, passed through instead of hardcoding 'ACTIVE'
 *   unconditionally, so a validated status value from CreateStudentSchema
 *   is no longer silently dropped. (2) generateRegistrationNo()'s
 *   read-then-write sequence is now retried on a P2002 unique-constraint
 *   collision (bounded, 5 attempts) so two concurrent creations in the same
 *   calendar year can no longer generate duplicate registration numbers.
 *   (3) This file's own local Firebase Admin singleton initializer
 *   function — a duplicate of the one already established in
 *   verifyAuth.ts — is removed entirely. createFromApplication()'s two
 *   admin.auth() calls are only ever reached via routes that already run
 *   verifyAuth first (students.ts's router-wide verifyAuth,
 *   applications.ts's /:id/convert), and verifyAuth itself always
 *   initializes the Firebase Admin default app before calling next(). By
 *   the time this file's Firebase calls run, admin.auth() (no arguments)
 *   already resolves that same default app — no local admin-app-getter
 *   call is needed here at all. (4) computeRiskLevel()'s `termAverage`
 *   parameter remains unsupplied until R7 (Exams/Grading) — tracked, not
 *   fixed here. Persisted `Student.riskLevel` (a permanently-stale column
 *   sharing a name with this file's own live-computed field) is removed
 *   from the schema in this same phase; this file already never read or
 *   wrote that column.
 * [DEPENDS ON]: apps/web/src/lib/verifyAuth.ts (must run verifyAuth before
 *   any route that reaches createFromApplication(), so the Firebase Admin
 *   default app is already initialized by the time this file's admin.auth()
 *   calls run)
 */
import 'server-only'

import { prisma, withRetry } from '@/lib/prisma'
import { logger }        from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import * as settingsService from '@/server/services/settingsService'
import * as manebRegistration from '@/server/services/manebRegistrationService'
import { SETTING_KEYS } from '@shared/types/settings'
import * as admin        from 'firebase-admin'
import { getAdminApp }   from '@/lib/verifyAuth'
import {
  Prisma,
  type StudentStatus,
  type Sex,
} from '@prisma/client'
import type { UserRole } from '@shared/types/roles'
import type { AdmissionTypeValue, ExitReasonValue } from '@shared/constants/malawi'
import { SUPPORT_NEED_TYPES, type SupportNeedTypeValue, idNumberParts, nextIdSequence, formatIdNumber } from '@shared/constants/malawi'
import type { ApiStudentGuardian } from '@shared/types/api'
import type {
  GuardianInput,
  UpdateGuardianInput,
  UpdateWelfareInput,
  SupportNeedInput,
  UpdateSupportNeedInput,
  StudentExitInput,
  StudentSelfRegistrationInput,
} from '@shared/schemas/student'
import type { ApiStudentWelfare, ApiSupportNeed, ApiWelfareSummary } from '@shared/types/api'
import * as algolia from '@/server/services/algoliaService'
import * as guardianDirectorySync from '@/server/services/guardian/guardianDirectorySync'
import * as riskService from '@/server/services/riskService'
import { sendEmail, getSchoolDisplayName } from '@/lib/email'
import { generateTempPassword } from '@/lib/tempPassword'

// ─────────────────────────────────────────────────────────
//  REGISTRATION NUMBER GENERATOR
//  The layout comes from Settings → ID numbers (STUDENT_REGISTRATION_NO_FORMAT,
//  default SMS-{YYYY}-0000 → SMS-2025-0042). The last run of zeros is the
//  running number; {YYYY} / {YY} are the year the student is registered. Numbers
//  already issued keep their value; only new students follow a changed format.
//  Finds the highest running number already issued in the current layout and
//  adds one, wrapped in a bounded retry loop: two concurrent createStudent() calls can both read
//  the same "last" sequence before either writes, so the actual duplicate
//  is only detectable by the registrationNo @unique constraint rejecting
//  the second insert (P2002) — at which point we simply recompute the next
//  sequence and retry, rather than assuming the read was still valid.
// ─────────────────────────────────────────────────────────

const REGISTRATION_NO_MAX_ATTEMPTS = 5

async function nextRegistrationNo(): Promise<string> {
  const format = await settingsService.get(SETTING_KEYS.STUDENT_REGISTRATION_NO_FORMAT)
  const parts  = idNumberParts(format)

  // Only numbers that start and end the way this layout does can set the next
  // running number. Compared in code (not by sorting the text) so a number that
  // grows a digit, e.g. 9999 → 10000, still counts as the highest.
  const issued = await prisma.student.findMany({
    where: {
      registrationNo: {
        startsWith: parts.prefix,
        ...(parts.suffix ? { endsWith: parts.suffix } : {}),
      },
    },
    select: { registrationNo: true },
  })

  return formatIdNumber(format, nextIdSequence(issued.map((s) => s.registrationNo), parts))
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  )
}

/** True when a P2002 is on the NRB number rather than the registration number. */
function isNrbCollision(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = (err.meta as { target?: unknown } | undefined)?.target
    const text = Array.isArray(target) ? target.join(',') : String(target ?? '')
    return text.includes('nrbNumber')
  }
  return false
}

/** A form can send '' for "not recorded / clear it": store that as null. */
function blankToNull(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * NRB numbers are unique but optional. Check up front so the caller gets a clear
 * 409 instead of a raw constraint error (which the registration-number retry
 * loop would otherwise mistake for a registration-number clash and retry).
 */
async function assertNrbAvailable(nrbNumber: string | null, excludeStudentId?: string): Promise<void> {
  if (!nrbNumber) return
  const clash = await prisma.student.findFirst({
    where:  { nrbNumber, ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}) },
    select: { registrationNo: true },
  })
  if (clash) {
    throw Object.assign(
      new Error(`That NRB number is already recorded for student ${clash.registrationNo}.`),
      { status: 409 },
    )
  }
}

/**
 * A student who graduates completes their final year. The promotion run recorded
 * that year as AWAITING_MANEB, so graduation turns that same row into GRADUATED
 * (one row per student per year, so the year is not double-counted). A student
 * with no recorded year, such as one who pre-dates the history table, gets a row
 * for the current academic year. This never blocks the status change: history is
 * best-effort here, and a failure is logged rather than thrown.
 */
async function recordGraduationOutcome(studentId: string): Promise<void> {
  try {
    const awaiting = await prisma.studentYearOutcome.findFirst({
      where:   { studentId, outcome: 'AWAITING_MANEB' },
      orderBy: { academicYear: 'desc' },
      select:  { id: true },
    })
    if (awaiting) {
      await prisma.studentYearOutcome.update({ where: { id: awaiting.id }, data: { outcome: 'GRADUATED' } })
      return
    }
    const [academicYear, student] = await Promise.all([
      settingsService.get(SETTING_KEYS.CURRENT_ACADEMIC_YEAR),
      prisma.student.findUnique({ where: { id: studentId }, select: { class: { select: { form: true } } } }),
    ])
    await prisma.studentYearOutcome.upsert({
      where:  { studentId_academicYear: { studentId, academicYear } },
      create: { studentId, academicYear, form: student?.class?.form ?? 4, outcome: 'GRADUATED' },
      update: { outcome: 'GRADUATED' },
    })
  } catch (err) {
    logger.warn({ event: 'student.graduation_outcome_failed', studentId, err })
  }
}

// ─────────────────────────────────────────────────────────
//  RISK
//  The old fee-only heuristic that lived here (computeRiskLevel — latest
//  invoice only, a HIGH branch that could never fire) is gone. Every badge in
//  the app — list, profile, class roster, dashboard — now comes from
//  riskService.assessStudents(), so a student has ONE risk level for a given
//  (academic year, term), derived from fees + results + attendance + library.
// ─────────────────────────────────────────────────────────

type RiskLevel = riskService.RiskLevel

/** The period risk is assessed for; defaults to the school's current one. */
export interface RiskPeriodInput {
  academicYear?: string
  term?:         number
}

const resolveRiskPeriod = riskService.resolveRiskPeriod

/** The risk-related fields of an API student, for a given viewer. */
function riskFields(
  a: riskService.RiskAssessment | undefined,
  status: string,
  viewer: riskService.RiskViewer,
): Pick<ApiStudentSummary, 'riskLevel' | 'riskScore' | 'riskFactors'> & { insights: string[] } {
  // Non-ACTIVE students (graduated/archived/awaiting MANEB) have no live risk,
  // and a viewer without student.viewRiskStatus gets no risk at all — not even
  // a level, so the API never carries more than the UI is allowed to show.
  if (!a || status !== 'ACTIVE' || !viewer.canViewRisk) {
    return { riskLevel: 'NONE', riskScore: 0, riskFactors: [], insights: [] }
  }
  const r = riskService.redactAssessment(a, viewer.visibility)
  return { riskLevel: r.riskLevel, riskScore: r.riskScore, riskFactors: r.factors, insights: r.insights }
}

// ─────────────────────────────────────────────────────────
//  API RESPONSE TYPES
// ─────────────────────────────────────────────────────────

export interface ApiStudentSummary {
  id:              string
  registrationNo:  string
  firstName:       string
  lastName:        string
  otherNames:      string | null
  sex:             Sex
  status:          StudentStatus
  classId:         string | null
  className:       string | null
  classForm:       number | null
  /** Stream letter of the class (detail view only). */
  classStream?:      string | null
  /** How many live classes this form has in the class's year (detail view only); 2 or more means show the stream. */
  classStreamCount?: number | null
  /** MANEB registration for the exam this student's form sits (JCE at Form 2, MSCE at Form 4); null for other forms. */
  maneb?: { examType: 'JCE' | 'MSCE'; academicYear: string; registered: boolean; candidateNo: string | null } | null
  photoKey:        string | null
  hasFirebaseUid:  boolean
  riskLevel:       RiskLevel
  /** 0-100 composite from the unified engine (0 when not visible / not active). */
  riskScore:       number
  riskFactors:     riskService.RiskFactor[]
  feeBalance:      number
  currentBorrowings: number
  createdAt:       string
}

export interface ApiStudentDetail extends ApiStudentSummary {
  dateOfBirth:     string
  nationality:     string
  district:        string
  village:         string | null
  address:         string | null
  phone:           string | null
  email:           string | null
  guardianName:    string
  guardianPhone:   string
  guardianRelation:string
  // Demographics (profile card). Welfare data is NOT here: it is returned only
  // by the welfare-gated endpoint (see the welfare section of this file).
  nrbNumber:            string | null
  traditionalAuthority: string | null
  religion:             string | null
  homeLanguage:         string | null
  physicalAddress:      string | null
  admissionType:        AdmissionTypeValue
  previousSchool:       string | null
  reasonForTransfer:    string | null
  /** Set only for archived students. The free-text exit note is NOT here: it is welfare-gated. */
  exitReason:           ExitReasonValue | null
  exitDate:             string | null
  /** One row per academic year, written at promotion commit. */
  yearOutcomes:         Array<{ academicYear: string; form: number; outcome: 'PROMOTED' | 'REPEATED' | 'GRADUATED' | 'AWAITING_MANEB' }>
  updatedAt:       string
  /** Cross-module risk observations (profile card only). */
  riskInsights:    string[]
}

export interface StudentListResult {
  students: ApiStudentSummary[]
  total:    number
  page:     number
  pages:    number
  pageSize: number
}

export interface StudentQueryFilters {
  search?:     string
  classId?:    string
  status?:     StudentStatus
  sex?:        Sex
  form?:       number
  hasRisk?:    boolean
  /** Period risk is assessed for (the global viewing period); defaults to the school's current one. */
  academicYear?: string
  term?:         number
  page?:       number
  pageSize?:   number
  /**
   * R15 — server-side sort for DataTable's new onSort dispatch. Only the
   * allow-listed columns in SORTABLE_STUDENT_COLUMNS are honoured; anything
   * else silently falls back to the default lastName/firstName ordering.
   */
  sortBy?:     string
  sortDir?:    'asc' | 'desc'
}

/**
 * Column allow-list for client-requested sorts (R15). Keys match the
 * students list's DataColumn keys; values build the Prisma orderBy.
 * A hand-picked map — never interpolate a raw client string into orderBy.
 */
const SORTABLE_STUDENT_COLUMNS: Record<
  string,
  (dir: 'asc' | 'desc') => Prisma.StudentOrderByWithRelationInput[]
> = {
  registrationNo: (dir) => [{ registrationNo: dir }],
  firstName:      (dir) => [{ firstName: dir }, { lastName: dir }],
  lastName:       (dir) => [{ lastName: dir }, { firstName: dir }],
  status:         (dir) => [{ status: dir }, { lastName: 'asc' }],
  createdAt:      (dir) => [{ createdAt: dir }],
}

// ─────────────────────────────────────────────────────────
//  INPUT TYPES
// ─────────────────────────────────────────────────────────

export interface CreateStudentInput {
  firstName:       string
  lastName:        string
  otherNames?:     string
  dateOfBirth:     string
  sex:             Sex
  nationality:     string
  district:        string
  village?:        string
  address?:        string
  phone?:          string
  email?:          string
  guardianName:    string
  guardianPhone:   string
  guardianRelation:string
  classId?:        string
  photoKey?:       string
  /** Firebase UID — provided when a student account is created simultaneously. */
  firebaseUid?:    string
  /** Validated by CreateStudentSchema; defaults to ACTIVE in create() when omitted. */
  status?:         StudentStatus
  nrbNumber?:            string
  traditionalAuthority?: string
  religion?:             string
  homeLanguage?:         string
  physicalAddress?:      string
  admissionType?:        AdmissionTypeValue
  previousSchool?:       string
  reasonForTransfer?:    string
}

export interface UpdateStudentInput {
  firstName?:       string
  lastName?:        string
  otherNames?:      string
  dateOfBirth?:     string
  sex?:             Sex
  nationality?:     string
  district?:        string
  village?:         string
  address?:         string
  phone?:           string
  email?:           string
  guardianName?:    string
  guardianPhone?:   string
  guardianRelation?:string
  classId?:         string
  photoKey?:        string
  status?:          StudentStatus
  nrbNumber?:            string
  traditionalAuthority?: string
  religion?:             string
  homeLanguage?:         string
  physicalAddress?:      string
  admissionType?:        AdmissionTypeValue
  previousSchool?:       string
  reasonForTransfer?:    string
}

export interface LinkFirebaseUidInput {
  studentId:   string
  firebaseUid: string
  linkedByUid: string
  linkedByRole:UserRole
}

// ─────────────────────────────────────────────────────────
//  UID → STUDENT RESOLUTION  (THE KEY NEW FUNCTION)
// ─────────────────────────────────────────────────────────

/**
 * Resolve a Firebase UID to a Student record.
 * Used on every student-role API request to derive the authenticated
 * student's database ID without trusting any URL parameter.
 *
 * Returns null if no student record is linked to this UID.
 * Callers must treat null as a 403 — the student account exists in
 * Firebase but has not yet been linked to a Student row.
 *
 * Result is NOT cached — each request queries Neon via the HTTP adapter.
 * The @@index([firebaseUid]) on the Student model makes this O(1) by index.
 *
 * @example
 *   const student = await resolveStudentFromUid(req.user!.uid)
 *   if (!student) {
 *     return res.status(403).json({ error: 'No student record linked to your account.' })
 *   }
 *   // Now use student.id safely
 */
/**
 * First-login registration form. A student may change ONLY the low-risk fields in
 * StudentSelfRegistrationSchema; identity fields are never touched here. NRB can be added only
 * when none is recorded. Clears the `registrationPending` claim (merging, never replacing, the
 * other claims) so the next token lets the student into the app.
 */
export async function completeOwnRegistration(
  firebaseUid: string,
  input: StudentSelfRegistrationInput,
): Promise<void> {
  const student = await prisma.student.findUnique({
    where:  { firebaseUid },
    select: {
      id: true, nrbNumber: true, traditionalAuthority: true, village: true, religion: true,
      homeLanguage: true, address: true, physicalAddress: true, phone: true,
      previousSchool: true, reasonForTransfer: true,
    },
  })
  if (!student) {
    throw Object.assign(new Error('No student record is linked to your account.'), { status: 403 })
  }

  const data: Prisma.StudentUpdateInput = { registrationCompletedAt: new Date() }
  if (input.traditionalAuthority !== undefined) data.traditionalAuthority = blankToNull(input.traditionalAuthority)
  if (input.village              !== undefined) data.village              = blankToNull(input.village)
  if (input.religion             !== undefined) data.religion             = blankToNull(input.religion)
  if (input.homeLanguage         !== undefined) data.homeLanguage         = blankToNull(input.homeLanguage)
  if (input.address              !== undefined) data.address              = blankToNull(input.address)
  if (input.physicalAddress      !== undefined) data.physicalAddress      = blankToNull(input.physicalAddress)
  if (input.phone                !== undefined) data.phone                = blankToNull(input.phone)
  if (input.previousSchool       !== undefined) data.previousSchool       = blankToNull(input.previousSchool)
  if (input.reasonForTransfer    !== undefined) data.reasonForTransfer    = blankToNull(input.reasonForTransfer)
  if (!student.nrbNumber && input.nrbNumber) {
    const nrb = blankToNull(input.nrbNumber)
    await assertNrbAvailable(nrb, student.id)
    data.nrbNumber = nrb
  }

  try {
    await prisma.student.update({ where: { id: student.id }, data })
  } catch (err) {
    if (isNrbCollision(err)) {
      throw Object.assign(new Error('That NRB number is already recorded for another student.'), { status: 409 })
    }
    throw err
  }

  const authApp = admin.auth(getAdminApp())
  const existing = await authApp.getUser(firebaseUid)
  await authApp.setCustomUserClaims(firebaseUid, { ...existing.customClaims, registrationPending: false })

  await auditService.log({
    action:     'student.selfRegistration',
    entityType: 'Student',
    entityId:   student.id,
    actorUid:   firebaseUid,
    actorRole:  'student',
    metadata:   { fields: Object.keys(data).filter((k) => k !== 'registrationCompletedAt' && k !== 'nrbNumber') },
  })
}

export async function resolveStudentFromUid(
  firebaseUid: string
): Promise<{ id: string; classId: string | null; status: StudentStatus } | null> {
  const student = await prisma.student.findUnique({
    where:  { firebaseUid },
    select: { id: true, classId: true, status: true },
  })
  return student ?? null
}

/**
 * Assert that the authenticated Firebase UID maps to a specific Student ID.
 * Used to prevent a student from accessing another student's data by
 * manipulating URL parameters.
 *
 * @throws Error with status 403 if the UID does not match the student record.
 */
export async function assertStudentOwnership(
  firebaseUid: string,
  studentId:   string
): Promise<void> {
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { firebaseUid: true },
  })

  if (!student) {
    throw Object.assign(new Error('Student record not found.'), { status: 404 })
  }

  if (student.firebaseUid !== firebaseUid) {
    throw Object.assign(
      new Error('You are not authorised to access this student record.'),
      { status: 403 }
    )
  }
}

// ─────────────────────────────────────────────────────────
//  LIST STUDENTS
// ─────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE     = 100

export async function list(
  filters: StudentQueryFilters,
  viewer: riskService.RiskViewer = riskService.NO_RISK_VIEWER,
): Promise<StudentListResult> {
  const {
    search,
    classId,
    status,
    sex,
    form,
    page     = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    sortBy,
    sortDir,
  } = filters

  const safePageSize = Math.min(pageSize, MAX_PAGE_SIZE)
  const safeOffset   = (Math.max(page, 1) - 1) * safePageSize

  // R15 — resolve the requested sort against the allow-list; anything not
  // on it (or no sort at all) keeps the long-standing default ordering.
  const sortBuilder = sortBy ? SORTABLE_STUDENT_COLUMNS[sortBy] : undefined
  const orderBy: Prisma.StudentOrderByWithRelationInput[] =
    sortBuilder && (sortDir === 'asc' || sortDir === 'desc')
      ? sortBuilder(sortDir)
      : [{ lastName: 'asc' }, { firstName: 'asc' }]

  // Build where clause
  const where: Prisma.StudentWhereInput = {}

  if (status)   where.status  = status
  if (sex)      where.sex     = sex
  if (classId)  where.classId = classId
  if (form) {
    where.class = { form }
  }
  if (search && search.trim().length > 0) {
    const term = search.trim()
    where.OR = [
      { firstName:      { contains: term, mode: 'insensitive' } },
      { lastName:       { contains: term, mode: 'insensitive' } },
      { registrationNo: { contains: term, mode: 'insensitive' } },
      { guardianName:   { contains: term, mode: 'insensitive' } },
      { guardianPhone:  { contains: term, mode: 'insensitive' } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy,
      skip:    safeOffset,
      take:    safePageSize,
      select: {
        id:             true,
        registrationNo: true,
        firstName:      true,
        lastName:       true,
        otherNames:     true,
        sex:            true,
        status:         true,
        classId:        true,
        photoKey:       true,
        firebaseUid:    true,
        createdAt:      true,
        class: {
          select: { name: true, form: true },
        },
        // Fee balance and risk both come from riskService (one source of truth);
        // the old "latest invoice only" select is no longer needed here.
        // Active borrowings count
        borrowings: {
          where:  { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    }),
  ])

  // ONE batched assessment for the whole page (≈7 queries, not 5 per row).
  const period   = await resolveRiskPeriod(filters)
  const assessed = await riskService.assessStudents(rows.map((r) => r.id), period)

  const students: ApiStudentSummary[] = rows.map((row) => {
    const a    = assessed.get(row.id)
    const risk = riskFields(a, row.status, viewer)

    return {
      id:              row.id,
      registrationNo:  row.registrationNo,
      firstName:       row.firstName,
      lastName:        row.lastName,
      otherNames:      row.otherNames,
      sex:             row.sex,
      status:          row.status,
      classId:         row.classId,
      className:       row.class?.name  ?? null,
      classForm:       row.class?.form  ?? null,
      photoKey:        row.photoKey,
      hasFirebaseUid:  Boolean(row.firebaseUid),
      riskLevel:       risk.riskLevel,
      riskScore:       risk.riskScore,
      riskFactors:     risk.riskFactors,
      // Outstanding through the viewed term — the same figure the FEE_DEBT risk
      // factor uses, so "fees cleared" and the risk badge can't disagree.
      feeBalance:      a?.metrics.feeBalance ?? 0,
      currentBorrowings: row.borrowings.length,
      createdAt:       row.createdAt.toISOString(),
    }
  })

  return {
    students,
    total,
    page:     Math.max(page, 1),
    pages:    Math.ceil(total / safePageSize),
    pageSize: safePageSize,
  }
}

// ─────────────────────────────────────────────────────────
//  GET BY ID
// ─────────────────────────────────────────────────────────

export async function getById(
  id: string,
  period?: RiskPeriodInput,
  viewer: riskService.RiskViewer = riskService.NO_RISK_VIEWER,
): Promise<ApiStudentDetail | null> {
  const row = await prisma.student.findUnique({
    where:  { id },
    select: {
      id:              true,
      registrationNo:  true,
      firstName:       true,
      lastName:        true,
      otherNames:      true,
      dateOfBirth:     true,
      sex:             true,
      nationality:     true,
      district:        true,
      village:         true,
      address:         true,
      phone:           true,
      email:           true,
      guardianName:    true,
      guardianPhone:   true,
      guardianRelation:true,
      nrbNumber:            true,
      traditionalAuthority: true,
      religion:             true,
      homeLanguage:         true,
      physicalAddress:      true,
      admissionType:        true,
      previousSchool:       true,
      reasonForTransfer:    true,
      exitReason:           true,
      exitDate:             true,
      yearOutcomes: {
        orderBy: { academicYear: 'asc' },
        select:  { academicYear: true, form: true, outcome: true },
      },
      classId:         true,
      photoKey:        true,
      firebaseUid:     true,
      status:          true,
      createdAt:       true,
      updatedAt:       true,
      class: {
        select: { name: true, form: true, stream: true, academicYear: true },
      },
      borrowings: {
        where:  { status: 'ACTIVE' },
        select: { id: true },
      },
    },
  })

  if (!row) return null

  // How many live classes the student's form has this year, so the screens show the stream
  // only when the school really runs more than one.
  const classStreamCount = row.class
    ? await prisma.class.count({ where: { form: row.class.form, academicYear: row.class.academicYear, status: { not: 'ARCHIVED' } } })
    : null

  const maneb = await manebRegistration.registrationSummaryForStudent(row.id, row.class)

  const assessment = (await riskService.assessStudents([row.id], await resolveRiskPeriod(period))).get(row.id)
  const risk       = riskFields(assessment, row.status, viewer)

  return {
    id:              row.id,
    registrationNo:  row.registrationNo,
    firstName:       row.firstName,
    lastName:        row.lastName,
    otherNames:      row.otherNames,
    dateOfBirth:     row.dateOfBirth.toISOString(),
    sex:             row.sex,
    nationality:     row.nationality,
    district:        row.district,
    village:         row.village,
    address:         row.address,
    phone:           row.phone,
    email:           row.email,
    guardianName:    row.guardianName,
    guardianPhone:   row.guardianPhone,
    guardianRelation:row.guardianRelation,
    nrbNumber:            row.nrbNumber,
    traditionalAuthority: row.traditionalAuthority,
    religion:             row.religion,
    homeLanguage:         row.homeLanguage,
    physicalAddress:      row.physicalAddress,
    admissionType:        row.admissionType,
    previousSchool:       row.previousSchool,
    reasonForTransfer:    row.reasonForTransfer,
    exitReason:           row.exitReason,
    exitDate:             row.exitDate ? row.exitDate.toISOString() : null,
    yearOutcomes:         row.yearOutcomes,
    classId:         row.classId,
    className:       row.class?.name  ?? null,
    classForm:       row.class?.form  ?? null,
    classStream:      row.class?.stream ?? null,
    classStreamCount,
    maneb,
    photoKey:        row.photoKey,
    hasFirebaseUid:  Boolean(row.firebaseUid),
    riskLevel:       risk.riskLevel,
    riskScore:       risk.riskScore,
    riskFactors:     risk.riskFactors,
    riskInsights:    risk.insights,
    feeBalance:      assessment?.metrics.feeBalance ?? 0,
    currentBorrowings: row.borrowings.length,
    status:          row.status,
    createdAt:       row.createdAt.toISOString(),
    updatedAt:       row.updatedAt.toISOString(),
  }
}

/**
 * Get a student record using their Firebase UID.
 * This is the student-role self-lookup path — no ID needed.
 */
export async function getByFirebaseUid(
  firebaseUid: string,
  period?: RiskPeriodInput,
  viewer: riskService.RiskViewer = riskService.NO_RISK_VIEWER,
): Promise<ApiStudentDetail | null> {
  const row = await prisma.student.findUnique({
    where:  { firebaseUid },
    select: { id: true },
  })
  if (!row) return null
  return getById(row.id, period, viewer)
}

// ─────────────────────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────────────────────

/**
 * Provision a student's login end-to-end — the single, universal credential
 * pattern shared by direct create() and application conversion (and mirroring
 * hrService.createStaff for staff). Creates a Firebase Auth account with an
 * auto-generated temporary password, sets the student claims
 * (requiresPasswordChange: true forces a reset on first login), and emails the
 * password to the student's personal email. The caller is responsible for
 * writing the returned uid onto the Student row and for deleting the account
 * (rollbackAuthAccount) if the subsequent DB write fails.
 *
 * No password is ever supplied by a human — consistency across staff and
 * students means the system generates it, emails it, and forces a reset.
 */
export async function provisionStudentAuthAccount(params: {
  email:       string
  displayName: string
}): Promise<{ firebaseUid: string; tempPassword: string }> {
  const tempPassword = generateTempPassword()

  // Use the canonical Admin initializer so this works regardless of whether
  // other admin code has run first in the request lifecycle.
  const auth = admin.auth(getAdminApp())

  let fbUser
  try {
    fbUser = await auth.createUser({
      email:         params.email,
      password:      tempPassword,
      displayName:   params.displayName,
      emailVerified: false,
      disabled:      false,
    })
  } catch (err: unknown) {
    // Surface Firebase auth failures as clean, actionable client errors rather
    // than a generic 500. The most common in practice is a duplicate email —
    // an account already exists for this address (e.g. from an earlier attempt).
    const code = (err as { errorInfo?: { code?: string }; code?: string })?.errorInfo?.code
      ?? (err as { code?: string })?.code
    if (code === 'auth/email-already-exists') {
      throw Object.assign(
        new Error(`An account already exists for ${params.email}. Use a different email, or delete the existing Firebase account first.`),
        { status: 409 },
      )
    }
    if (code === 'auth/invalid-email') {
      throw Object.assign(new Error(`"${params.email}" is not a valid email address.`), { status: 400 })
    }
    logger.error({ err, email: params.email }, '[studentService] Firebase createUser failed')
    throw Object.assign(
      new Error('Failed to create the login account for this student.'),
      { status: 502 },
    )
  }

  await auth.setCustomUserClaims(fbUser.uid, {
    role:                   'student',
    subtitle:               'Student',
    requiresPasswordChange: true,
    // After the password change the student must complete the registration form once.
    registrationPending:    true,
  })

  logger.info({ firebaseUid: fbUser.uid, email: params.email }, '[studentService] Firebase account provisioned for student')
  return { firebaseUid: fbUser.uid, tempPassword }
}

// [PRODUCTION FIX] Was inlined at the end of provisionStudentAuthAccount(),
// which meant the welcome email — containing a real, working password — went
// out BEFORE the caller's Prisma write. If that write then failed for any
// reason, the caller's rollback path (rollbackAuthAccount) deleted the
// Firebase account the email had just pointed the student at: they'd receive
// working-looking credentials for an account that no longer existed by the
// time they tried to log in, surfaced by Firebase as a generic invalid-
// credentials error with no indication anything had actually gone wrong on
// our end. Extracted so every caller can call this only AFTER their own DB
// write has committed — mirroring hrService.createStaff's (correct) ordering.
// Still best-effort: a mail failure here never unwinds a write that already
// succeeded — it's logged and the temp password stays available to the
// caller for manual relay.
export async function sendStudentWelcomeEmail(params: {
  email:        string
  displayName:  string
  tempPassword: string
}): Promise<void> {
  try {
    const emailResult = await sendEmail({
      to:      params.email,
      subject: `Welcome to ${await getSchoolDisplayName()} — Your Student Login Details`,
      html: `<p>Dear ${params.displayName},</p>
        <p>A student account has been created for you on the School Management System.</p>
        <p><strong>Email:</strong> ${params.email}<br>
           <strong>Temporary Password:</strong> <code>${params.tempPassword}</code></p>
        <p>You will be required to change your password on first login.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login">Login here</a></p>`,
      tags: [{ name: 'type', value: 'student-welcome' }],
    })
    if (!emailResult.ok) {
      logger.warn(
        { email: params.email, reason: emailResult.error },
        '[studentService] student welcome email failed to send; temp password returned to caller for manual relay',
      )
    }
  } catch (mailErr) {
    logger.warn({ email: params.email, mailErr }, '[studentService] student welcome email threw; continuing')
  }
}

/** Delete an orphaned student Auth account after a failed DB write. */
async function rollbackAuthAccount(uid: string, context: Record<string, unknown>): Promise<void> {
  try {
    await admin.auth().deleteUser(uid)
  } catch (rollbackErr) {
    logger.error({ ...context, rollbackErr, uid }, '[studentService] failed to roll back orphaned Firebase account')
  }
}

export async function create(
  input:       CreateStudentInput,
  actorUid:    string,
  actorRole:   UserRole
): Promise<ApiStudentDetail> {
  // NRB numbers are unique but optional: reject a clash BEFORE provisioning a
  // login so a duplicate can't leave an orphaned Firebase account behind.
  const nrbNumber = blankToNull(input.nrbNumber)
  await assertNrbAvailable(nrbNumber)

  // Validate firebaseUid uniqueness before writing (provides better error message)
  if (input.firebaseUid) {
    const existing = await prisma.student.findUnique({
      where:  { firebaseUid: input.firebaseUid },
      select: { id: true },
    })
    if (existing) {
      throw Object.assign(
        new Error(`A student record is already linked to Firebase UID ${input.firebaseUid}.`),
        { status: 409 }
      )
    }
  }

  // Universal credential flow: when a personal email is provided and no
  // firebaseUid was passed in, provision the login here — auto-generated
  // password, student claims, welcome email — mirroring the staff flow. The
  // resulting uid is written onto the Student row via input.firebaseUid below.
  // If the DB write then fails, the just-created Auth account is rolled back.
  let provisionedUid: string | null = null
  let tempPassword:   string | null = null
  if (!input.firebaseUid && input.email) {
    const provisioned = await provisionStudentAuthAccount({
      email:       input.email,
      displayName: `${input.firstName} ${input.lastName}`,
    })
    provisionedUid   = provisioned.firebaseUid
    tempPassword     = provisioned.tempPassword
    input.firebaseUid = provisioned.firebaseUid
  }

  let student: { id: string } | undefined
  let registrationNo = ''
  let lastErr: unknown

  for (let attempt = 0; attempt < REGISTRATION_NO_MAX_ATTEMPTS; attempt++) {
    registrationNo = await nextRegistrationNo()
    try {
      student = await prisma.student.create({
        data: {
          registrationNo,
          firstName:       input.firstName,
          lastName:        input.lastName,
          otherNames:      input.otherNames ?? null,
          dateOfBirth:     new Date(input.dateOfBirth),
          sex:             input.sex,
          nationality:     input.nationality,
          district:        input.district,
          village:         input.village  ?? null,
          address:         input.address  ?? null,
          phone:           input.phone    ?? null,
          email:           input.email    ?? null,
          guardianName:    input.guardianName,
          guardianPhone:   input.guardianPhone,
          guardianRelation:input.guardianRelation,
          classId:         input.classId ? input.classId : null,
          photoKey:        input.photoKey ?? null,
          firebaseUid:     input.firebaseUid ?? null,
          status:          input.status ?? 'ACTIVE',
          nrbNumber,
          traditionalAuthority: blankToNull(input.traditionalAuthority),
          religion:             blankToNull(input.religion),
          homeLanguage:         blankToNull(input.homeLanguage),
          physicalAddress:      blankToNull(input.physicalAddress),
          admissionType:        input.admissionType ?? 'NEW_INTAKE',
          previousSchool:       blankToNull(input.previousSchool),
          reasonForTransfer:    blankToNull(input.reasonForTransfer),
          // The legacy guardian columns above are the denormalised primary
          // guardian; this nested create writes the matching StudentGuardian row
          // in the same statement, so the two can never start out of step.
          guardians: {
            create: {
              fullName:           input.guardianName,
              relation:           input.guardianRelation,
              phone:              input.guardianPhone,
              isPrimary:          true,
              isEmergencyContact: true,
            },
          },
        },
        select: { id: true },
      })
      break
    } catch (err) {
      // Lost a race on the NRB number after the pre-check: report it, don't retry.
      if (isNrbCollision(err)) {
        if (provisionedUid) await rollbackAuthAccount(provisionedUid, { where: 'create.nrb', email: input.email })
        throw Object.assign(new Error('That NRB number is already recorded for another student.'), { status: 409 })
      }
      if (!isUniqueConstraintError(err)) {
        // Roll back a just-provisioned Auth account on a non-retryable failure.
        if (provisionedUid) await rollbackAuthAccount(provisionedUid, { where: 'create', email: input.email })
        throw err
      }
      lastErr = err
      logger.warn(
        { event: 'studentService.registrationNo_collision', attempt: attempt + 1, registrationNo },
        '[studentService] Registration number collision — retrying'
      )
    }
  }

  if (!student) {
    if (provisionedUid) await rollbackAuthAccount(provisionedUid, { where: 'create.exhausted', email: input.email })
    throw lastErr instanceof Error
      ? lastErr
      : new Error('Failed to generate a unique registration number after multiple attempts.')
  }

  // [Guardian portal] The primary guardian card was written in the same statement.
  // Propose it for portal access (PENDING, grants nothing). Best effort, never throws.
  await guardianDirectorySync.syncAfterWrite(student.id, { uid: actorUid, role: actorRole }, 'ADMISSION')

  // Student row committed successfully — safe to email the credentials now.
  if (provisionedUid && tempPassword && input.email) {
    await sendStudentWelcomeEmail({
      email:        input.email,
      displayName:  `${input.firstName} ${input.lastName}`,
      tempPassword,
    })
  }

  await auditService.log({
    action:     'student.create',
    entityType: 'Student',
    entityId:   student.id,
    actorUid,
    actorRole,
    metadata: {
      after: {
        registrationNo,
        firstName:   input.firstName,
        lastName:    input.lastName,
        classId:     input.classId,
        firebaseUid: input.firebaseUid ?? null,
        nrbRecorded: Boolean(nrbNumber),
      },
    },
  })

logger.info(
    { studentId: student.id, registrationNo, actorRole },
    '[studentService] Student created'
  )

  const created = await getById(student.id) as ApiStudentDetail
  void algolia.indexStudent({
    objectID:       created.id,
    registrationNo: created.registrationNo,
    firstName:      created.firstName,
    lastName:       created.lastName,
    otherNames:     created.otherNames ?? null,
    fullName:       `${created.firstName} ${created.lastName}`,
    className:      (created as ApiStudentDetail & { class?: { name: string; form: number; academicYear: string } | null }).class?.name ?? null,
    form:           (created as ApiStudentDetail & { class?: { name: string; form: number; academicYear: string } | null }).class?.form ?? null,
    status:         created.status,
    sex:            created.sex,
    academicYear:   (created as ApiStudentDetail & { class?: { name: string; form: number; academicYear: string } | null }).class?.academicYear ?? null,
    // [ALGOLIA ROLLOUT — Tier 1 item 3] previously collected on the model
    // and returned by getById(), but never passed into this call.
    district:       created.district ?? null,
  })
  return created
}

// ─────────────────────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────────────────────

export async function update(
  id:        string,
  input:     UpdateStudentInput,
  actorUid:  string,
  actorRole: UserRole
): Promise<ApiStudentDetail> {
  // Capture before state for the audit diff
  const before = await prisma.student.findUnique({
    where:  { id },
    select: {
      firstName: true, lastName: true, otherNames: true,
      classId: true, status: true, photoKey: true,
      nrbNumber: true, traditionalAuthority: true, religion: true,
      homeLanguage: true, physicalAddress: true,
      admissionType: true, previousSchool: true, reasonForTransfer: true,
    },
  })

  if (!before) {
    throw Object.assign(new Error('Student not found.'), { status: 404 })
  }

  // Archiving needs a recorded reason and date, which only the Archive action
  // collects. Refuse it here rather than archive a student with no exit record.
  if (input.status === 'ARCHIVED' && before.status !== 'ARCHIVED') {
    throw Object.assign(
      new Error('Use the Archive action to archive a student, so the reason for leaving is recorded.'),
      { status: 400 },
    )
  }

  const updateData: Prisma.StudentUncheckedUpdateInput = {}
  if (input.firstName        !== undefined) updateData.firstName        = input.firstName
  if (input.lastName         !== undefined) updateData.lastName         = input.lastName
  if (input.otherNames       !== undefined) updateData.otherNames       = input.otherNames
  if (input.dateOfBirth      !== undefined) updateData.dateOfBirth      = new Date(input.dateOfBirth)
  if (input.sex              !== undefined) updateData.sex              = input.sex
  if (input.nationality      !== undefined) updateData.nationality      = input.nationality
  if (input.district         !== undefined) updateData.district         = input.district
  if (input.village          !== undefined) updateData.village          = input.village
  if (input.address          !== undefined) updateData.address          = input.address
  if (input.phone            !== undefined) updateData.phone            = input.phone
  if (input.email            !== undefined) updateData.email            = input.email
  if (input.guardianName     !== undefined) updateData.guardianName     = input.guardianName
  if (input.guardianPhone    !== undefined) updateData.guardianPhone    = input.guardianPhone
  if (input.guardianRelation !== undefined) updateData.guardianRelation = input.guardianRelation
  if (input.classId          !== undefined) updateData.classId          = input.classId
  if (input.photoKey         !== undefined) updateData.photoKey         = input.photoKey
  if (input.status           !== undefined) updateData.status           = input.status
  // Demographics: '' means "clear it".
  if (input.nrbNumber            !== undefined) updateData.nrbNumber            = blankToNull(input.nrbNumber)
  if (input.traditionalAuthority !== undefined) updateData.traditionalAuthority = blankToNull(input.traditionalAuthority)
  if (input.religion             !== undefined) updateData.religion             = blankToNull(input.religion)
  if (input.homeLanguage         !== undefined) updateData.homeLanguage         = blankToNull(input.homeLanguage)
  if (input.physicalAddress      !== undefined) updateData.physicalAddress      = blankToNull(input.physicalAddress)
  if (input.admissionType        !== undefined) updateData.admissionType        = input.admissionType
  if (input.previousSchool       !== undefined) updateData.previousSchool       = blankToNull(input.previousSchool)
  if (input.reasonForTransfer    !== undefined) updateData.reasonForTransfer    = blankToNull(input.reasonForTransfer)

  if (updateData.nrbNumber !== undefined) {
    await assertNrbAvailable(updateData.nrbNumber as string | null, id)
  }

  const guardianTouched =
    input.guardianName !== undefined || input.guardianPhone !== undefined || input.guardianRelation !== undefined
  try {
    await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id },
        data:  updateData,
      })
      // The legacy columns ARE the primary guardian. Keep the primary row in
      // step so an edit made on the student form shows on the guardians card.
      if (guardianTouched) {
        const primaryPatch: Prisma.StudentGuardianUpdateManyMutationInput = {}
        if (input.guardianName     !== undefined) primaryPatch.fullName = input.guardianName
        if (input.guardianPhone    !== undefined) primaryPatch.phone    = input.guardianPhone
        if (input.guardianRelation !== undefined) primaryPatch.relation = input.guardianRelation
        await tx.studentGuardian.updateMany({ where: { studentId: id, isPrimary: true }, data: primaryPatch })
      }
    })
  } catch (err) {
    if (isNrbCollision(err)) {
      throw Object.assign(new Error('That NRB number is already recorded for another student.'), { status: 409 })
    }
    throw err
  }

  if (input.status === 'GRADUATED' && before.status !== 'GRADUATED') await recordGraduationOutcome(id)

  // [Guardian portal] The legacy guardian columns were mirrored into the primary
  // guardian card above; flag any portal link whose verified details no longer match.
  if (guardianTouched) {
    await guardianDirectorySync.syncAfterWrite(id, { uid: actorUid, role: actorRole }, 'STAFF')
  }

  // Diff what was actually applied (normalised), not the raw request body. The
  // NRB number is an identity number: the audit trail records THAT it changed,
  // never the value itself.
  const afterApplied: Record<string, unknown> = { ...before }
  for (const key of Object.keys(before)) {
    if (key in updateData) afterApplied[key] = (updateData as Record<string, unknown>)[key]
  }
  const maskNrb = (v: unknown) => (v ? '[recorded]' : null)
  const changes = auditService.createDiff(
    { ...before, nrbNumber: maskNrb(before.nrbNumber) } as Record<string, unknown>,
    { ...afterApplied, nrbNumber: maskNrb(afterApplied['nrbNumber']) },
  )

await auditService.log({
    action:     'student.edit',
    entityType: 'Student',
    entityId:   id,
    actorUid,
    actorRole,
    metadata: {
      before: { ...before, nrbNumber: maskNrb(before.nrbNumber) } as Record<string, unknown>,
      changes,
    },
  })

  const updated = await getById(id) as ApiStudentDetail
  void algolia.updateStudent({
    objectID:  id,
    firstName: updated.firstName,
    lastName:  updated.lastName,
    fullName:  `${updated.firstName} ${updated.lastName}`,
    status:    updated.status,
    // [ALGOLIA ROLLOUT — Tier 1 item 3] see the same note on indexStudent()
    // above — district was collected but never synced.
    district:  updated.district ?? null,
  })
  return updated
}

// ─────────────────────────────────────────────────────────
//  SOFT DELETE
// ─────────────────────────────────────────────────────────

/**
 * Soft-delete a student: marks status as ARCHIVED.
 * Never performs a hard DELETE — student records are permanent per spec.
 * When called by lower_rank, this should be routed through the
 * PendingAction workflow rather than called directly.
 */
/** Exit reason, date and note as stored on the Student row. */
function exitColumns(exit: StudentExitInput) {
  return {
    exitReason: exit.exitReason,
    exitDate:   new Date(`${exit.exitDate}T00:00:00Z`),
    exitNote:   blankToNull(exit.exitNote),
  }
}

export async function softDelete(
  id:        string,
  actorUid:  string,
  actorRole: UserRole,
  exit:      StudentExitInput,
): Promise<void> {
  const student = await prisma.student.findUnique({
    where:  { id },
    select: { status: true, registrationNo: true },
  })

  if (!student) {
    throw Object.assign(new Error('Student not found.'), { status: 404 })
  }

  if (student.status === 'ARCHIVED') {
    throw Object.assign(new Error('Student is already archived.'), { status: 400 })
  }

  await prisma.student.update({
    where: { id },
    data:  { status: 'ARCHIVED', ...exitColumns(exit) },
  })

await auditService.log({
    action:     'student.archive',
    entityType: 'Student',
    entityId:   id,
    actorUid,
    actorRole,
    metadata: {
      before: { status: student.status },
      after:  { status: 'ARCHIVED', exitReason: exit.exitReason, exitDate: exit.exitDate },
      context: { registrationNo: student.registrationNo },
    },
  })

  void algolia.deleteStudent(id)

  logger.info({ studentId: id, actorRole }, '[studentService] Student archived')
}

// ─────────────────────────────────────────────────────────
//  STATUS CHANGE
// ─────────────────────────────────────────────────────────

export async function changeStatus(
  id:        string,
  newStatus: StudentStatus,
  actorUid:  string,
  actorRole: UserRole,
  exit?:     StudentExitInput,
): Promise<ApiStudentDetail> {
  const student = await prisma.student.findUnique({
    where:  { id },
    select: { status: true },
  })

  if (!student) {
    throw Object.assign(new Error('Student not found.'), { status: 404 })
  }

  // Archiving records why the student left. Moving a student BACK out of
  // ARCHIVED (a returnee) clears the exit fields so "exits by reason" counts
  // current exits only; the audit log keeps the history.
  const archiving = newStatus === 'ARCHIVED' && student.status !== 'ARCHIVED'
  if (archiving && !exit) {
    throw Object.assign(new Error('An exit reason and exit date are required to archive a student.'), { status: 400 })
  }
  const leavingArchive = student.status === 'ARCHIVED' && newStatus !== 'ARCHIVED'
  const graduating = newStatus === 'GRADUATED' && student.status !== 'GRADUATED'

  await prisma.student.update({
    where: { id },
    data:  {
      status: newStatus,
      ...(archiving && exit ? exitColumns(exit) : {}),
      ...(leavingArchive ? { exitReason: null, exitDate: null, exitNote: null } : {}),
    },
  })
  if (graduating) await recordGraduationOutcome(id)

  await auditService.log({
    action:     'student.status_changed',
    entityType: 'Student',
    entityId:   id,
    actorUid,
    actorRole,
    metadata: {
      before: { status: student.status },
      after:  archiving && exit
        ? { status: newStatus, exitReason: exit.exitReason, exitDate: exit.exitDate }
        : { status: newStatus },
    },
  })

  // [FIX] This was the one student mutation path that never synced to
  // Algolia — create/update/archive all call the algolia service, but a
  // plain status change (e.g. promotion, suspension) silently left the
  // index showing the old status indefinitely.
  void algolia.updateStudent({ objectID: id, status: newStatus })

  return getById(id) as Promise<ApiStudentDetail>
}

// ─────────────────────────────────────────────────────────
//  LINK FIREBASE UID
// ─────────────────────────────────────────────────────────

/**
 * Link a Firebase UID to an existing Student record.
 * Called from User Management when creating a Firebase account
 * for an existing student who was entered before the portal launched.
 *
 * This is a critical one-time operation — logged synchronously.
 */
// [NEW] Records a student photo the browser has already uploaded directly
// to Appwrite (see students.ts's POST /:id/photo/upload-ticket and
// storage.ts's createDirectUploadTicket()) against that student's record.
export async function attachStudentPhoto(studentId: string, fileId: string): Promise<void> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } })
  if (!student) {
    throw Object.assign(new Error('Student record not found.'), { status: 404 })
  }
  await prisma.student.update({ where: { id: studentId }, data: { photoKey: fileId } })
}

export async function linkFirebaseUid(
  input: LinkFirebaseUidInput
): Promise<void> {
  const { studentId, firebaseUid, linkedByUid, linkedByRole } = input

  // Verify student exists and is not already linked
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { firebaseUid: true, registrationNo: true, firstName: true, lastName: true },
  })

  if (!student) {
    throw Object.assign(new Error('Student record not found.'), { status: 404 })
  }

  if (student.firebaseUid) {
    throw Object.assign(
      new Error(`This student is already linked to Firebase UID ${student.firebaseUid}.`),
      { status: 409 }
    )
  }

  // Verify the Firebase UID is not already used by another student
  const existingLink = await prisma.student.findUnique({
    where:  { firebaseUid },
    select: { id: true, registrationNo: true },
  })

  if (existingLink) {
    throw Object.assign(
      new Error(
        `Firebase UID ${firebaseUid} is already linked to student ${existingLink.registrationNo}.`
      ),
      { status: 409 }
    )
  }

  await prisma.student.update({
    where: { id: studentId },
    data:  { firebaseUid },
  })

  // Synchronous audit — this is a CRITICAL security-relevant operation
  await auditService.log({
    action:     'user.claims_updated',
    entityType: 'Student',
    entityId:   studentId,
    actorUid:   linkedByUid,
    actorRole:  linkedByRole,
    metadata: {
      context: {
        operation:      'firebase_uid_linked',
        linkedFirebaseUid: firebaseUid,
        studentReg:     student.registrationNo,
        studentName:    `${student.firstName} ${student.lastName}`,
      },
    },
  })

  logger.info(
    { studentId, firebaseUid, linkedByUid },
    '[studentService] Firebase UID linked to student'
  )
}

// ─────────────────────────────────────────────────────────
//  CREATE FROM APPLICATION  (the canonical admission path)
// ─────────────────────────────────────────────────────────

/**
 * Reads Application.supportNeeds (JSON written by buildApplicationCreateData) back
 * into rows for student_support_needs. The column is untyped JSON, so every entry is
 * re-checked here: anything that is not a known type is skipped, never trusted.
 */
function parseApplicationSupportNeeds(
  raw: Prisma.JsonValue | null,
): Array<{ type: SupportNeedTypeValue; accommodation: string | null; assistiveDevice: string | null }> {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const rows: Array<{ type: SupportNeedTypeValue; accommodation: string | null; assistiveDevice: string | null }> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const rec  = item as Record<string, unknown>
    const type = rec['type']
    if (typeof type !== 'string' || !(SUPPORT_NEED_TYPES as readonly string[]).includes(type) || seen.has(type)) continue
    seen.add(type)
    const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
    rows.push({
      type:            type as SupportNeedTypeValue,
      accommodation:   text(rec['accommodation'], 300),
      assistiveDevice: text(rec['assistiveDevice'], 200),
    })
  }
  return rows
}

export interface ConvertApplicationInput {
  applicationId:   string
  classId?:        string
  /** Chosen by staff in the admit dialog. Falls back to the form applied for when omitted. */
  admissionType?:  AdmissionTypeValue
  actorUid:        string
  actorRole:       UserRole
  /**
   * When true, a Firebase login is provisioned using the applicant's own
   * email (Application.email) with a system-generated password that is emailed
   * to them — the universal credential pattern. No password is supplied by a
   * human. If the applicant has no email on file, conversion fails with a clear
   * message so the email can be added first.
   */
  createLoginAccount?: boolean
}

export interface ConvertApplicationResult {
  student:     ApiStudentDetail
  firebaseUid: string | null
  tempPassword:string | null
}

/**
 * Convert an approved Application to a Student record.
 * Optionally creates a Firebase Auth account and links the UID atomically.
 *
 * Flow:
 *   1. Fetch and validate the Application (must be APPROVED or AWAITING_ADMISSION)
 *   2. Generate a registration number
 *   3. Optionally create the Firebase account (outside Prisma tx — can't roll back)
 *   4. Create the Student row in Prisma (with firebaseUid if Firebase succeeded)
 *   5. Update Application status to ADMITTED and set convertedStudentId
 *   6. Set Firebase custom claims { role: 'student', requiresPasswordChange: true }
 *   7. Audit log all changes
 */
export async function createFromApplication(
  input: ConvertApplicationInput
): Promise<ConvertApplicationResult> {
  const { applicationId, classId, admissionType, actorUid, actorRole, createLoginAccount } = input

  // ── 1. Fetch application
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
  })

  if (!app) {
    throw Object.assign(new Error('Application not found.'), { status: 404 })
  }

  if (!['APPROVED', 'AWAITING_ADMISSION'].includes(app.status)) {
    throw Object.assign(
      new Error(`Application status "${app.status}" does not allow conversion to student.`),
      { status: 400 }
    )
  }

  if (app.convertedStudentId) {
    throw Object.assign(
      new Error('This application has already been converted to a student record.'),
      { status: 409 }
    )
  }

  // ── 2a. The chosen class must be a live class of the form the applicant applied for.
  // The admit dialog only offers those, but the check lives here so no caller can place a
  // Form 1 applicant in a Form 3 stream or in an archived class.
  if (classId) {
    const target = await prisma.class.findUnique({ where: { id: classId }, select: { form: true, status: true, name: true } })
    if (!target) {
      throw Object.assign(new Error('That class does not exist.'), { status: 400 })
    }
    if (target.status !== 'ACTIVE') {
      throw Object.assign(new Error(`${target.name} is archived. Choose a live class.`), { status: 400 })
    }
    if (target.form !== app.applyingForForm) {
      throw Object.assign(
        new Error(`${target.name} is a Form ${target.form} class, but this applicant applied for Form ${app.applyingForForm}.`),
        { status: 400 },
      )
    }
  }

  // ── 2b. Data that rides along from the application.
  // NRB number is unique on the student. It was typed by the applicant and no screen
  // edits an application, so a clash must not block the admission: the student is
  // created without it (staff can add the right one on the student record) and the
  // audit entry says so.
  let nrbNumber: string | null = blankToNull(app.nrbNumber)
  let nrbSkipped = false
  if (nrbNumber) {
    const clash = await prisma.student.findFirst({ where: { nrbNumber }, select: { registrationNo: true } })
    if (clash) {
      logger.warn(
        { event: 'studentService.application_nrb_clash', applicationId, clashesWith: clash.registrationNo },
        '[studentService] Application NRB number already belongs to another student - admitting without it'
      )
      nrbNumber  = null
      nrbSkipped = true
    }
  }
  const supportNeedRows = parseApplicationSupportNeeds(app.supportNeeds)
  const hasWelfare =
    app.orphanStatus !== 'UNKNOWN' || app.isVulnerable || !!app.vulnerabilityNote ||
    !!app.medicalAlert || supportNeedRows.length > 0

  // ── 3. Optional Firebase account creation (must happen before Prisma tx)
  let firebaseUid:  string | null = null
  let tempPassword: string | null = null

  if (createLoginAccount) {
    if (!app.email) {
      throw Object.assign(
        new Error('This applicant has no email on file, so a login cannot be created. Add an email to the application first.'),
        { status: 400 }
      )
    }
    try {
      const provisioned = await provisionStudentAuthAccount({
        email:       app.email,
        displayName: `${app.firstName} ${app.lastName}`,
      })
      firebaseUid  = provisioned.firebaseUid
      tempPassword = provisioned.tempPassword
    } catch (fbErr) {
      logger.error({ fbErr, applicationId }, '[studentService] Firebase account creation failed')
      throw Object.assign(
        new Error('Failed to create Firebase account for student. No student record was created.'),
        { status: 500 }
      )
    }
  }

  // ── 4 + 5. Create student and update application atomically. Retried on a
  // registrationNo collision (bounded) — the Firebase account above is only
  // ever created once, outside this loop, since retrying it would leave an
  // orphaned duplicate Firebase user per attempt.
  let student:        { id: string } | undefined
  let registrationNo = ''
  let lastErr: unknown

  for (let attempt = 0; attempt < REGISTRATION_NO_MAX_ATTEMPTS; attempt++) {
    registrationNo = await nextRegistrationNo()
    try {
      const [createdStudent] = await withRetry(() => prisma.$transaction([
        prisma.student.create({
          data: {
            registrationNo,
            firstName:       app.firstName,
            lastName:        app.lastName,
            // These three were written as null although the Application row
            // holds them - the data was collected, then lost at admission.
            otherNames:      app.otherNames,
            dateOfBirth:     app.dateOfBirth,
            sex:             app.sex,
            nationality:     app.nationality,
            district:        app.district,
            village:         app.village,
            address:         app.address,
            phone:           app.phone,
            email:           app.email ?? null,
            traditionalAuthority: app.traditionalAuthority,
            religion:             app.religion,
            homeLanguage:         app.homeLanguage,
            previousSchool:       app.previousSchool,
            reasonForTransfer:    app.reasonForTransfer,
            nrbNumber,
            physicalAddress:      app.physicalAddress,
            // Staff choose the admission type when admitting. If a caller omits it, fall back to
            // any value already on the application (older applications), then to the form
            // applied for: Form 2+ is a learner moving in from elsewhere, Form 1 is the normal intake.
            admissionType:        admissionType ?? app.admissionType ?? (app.applyingForForm >= 2 ? 'TRANSFER_IN' : 'NEW_INTAKE'),
            // Welfare, health and special needs captured on the application.
            orphanStatus:         app.orphanStatus,
            isVulnerable:         app.isVulnerable,
            vulnerabilityNote:    app.vulnerabilityNote,
            medicalAlert:         app.medicalAlert,
            ...(app.isVulnerable || app.vulnerabilityNote ? { vulnerabilityReviewedAt: new Date() } : {}),
            ...(supportNeedRows.length > 0
              ? { supportNeeds: { create: supportNeedRows.map((n) => ({ ...n, recordedByUid: actorUid })) } }
              : {}),
            guardianName:    app.guardianName,
            guardianPhone:   app.guardianPhone,
            guardianRelation:app.guardianRelation,
            // guardianEmail / guardianAddress were captured on the application
            // but had no home on the student; they now live on the primary
            // guardian row.
            guardians: {
              create: {
                fullName:           app.guardianName,
                relation:           app.guardianRelation,
                phone:              app.guardianPhone,
                email:              app.guardianEmail || null,
                address:            app.guardianAddress || null,
                isPrimary:          true,
                isEmergencyContact: true,
              },
            },
            classId:         classId ? classId : null,
            photoKey:        null,
            firebaseUid:     firebaseUid,
            status:          'ACTIVE',
          },
          select: { id: true },
        }),
        prisma.application.update({
          where: { id: applicationId },
          data: {
            status:            'ADMITTED',
            reviewedByUid:     actorUid,
            reviewedAt:        new Date(),
            // convertedStudentId updated in the second pass below
          },
          select: { id: true },
        }),
      ]))
      student = createdStudent
      break
    } catch (err) {
      // Lost a race on the NRB number after the pre-check above: report it, don't
      // retry (the retry loop is for registration-number clashes only).
      if (isNrbCollision(err)) {
        if (firebaseUid) await rollbackAuthAccount(firebaseUid, { where: 'createFromApplication.nrb', email: app.email })
        throw Object.assign(new Error('That NRB number is already recorded for another student.'), { status: 409 })
      }
      if (!isUniqueConstraintError(err)) {
        // [PRODUCTION FIX] This branch previously rethrew without rolling
        // back the Firebase account provisioned above (create()'s equivalent
        // catch already did this — this path didn't), leaving an orphaned
        // Auth account behind on any non-retryable DB failure.
        if (firebaseUid) await rollbackAuthAccount(firebaseUid, { where: 'createFromApplication', email: app.email })
        throw err
      }
      lastErr = err
      logger.warn(
        { event: 'studentService.registrationNo_collision', attempt: attempt + 1, registrationNo },
        '[studentService] Registration number collision — retrying'
      )
    }
  }

  if (!student) {
    if (firebaseUid) await rollbackAuthAccount(firebaseUid, { where: 'createFromApplication.exhausted', email: app.email })
    throw lastErr instanceof Error
      ? lastErr
      : new Error('Failed to generate a unique registration number after multiple attempts.')
  }

  // Update convertedStudentId after we have the student ID.
  // [PRODUCTION FIX] Wrapped in its own `withRetry`: the student+ADMITTED
  // change above already committed atomically, so from here on a transient
  // connection drop must be retried in place, not by letting the error
  // escape this function — an outer retry around the whole call would
  // re-run the precondition check (line ~1103) against an application
  // that's already ADMITTED and throw a false "does not allow conversion"
  // error (idempotent to retry: re-setting the same convertedStudentId).
  await withRetry(() => prisma.application.update({
    where: { id: applicationId },
    data:  { convertedStudentId: student.id },
  }))

  // [Guardian portal] The primary guardian card (with the application's email and
  // address) was written in the same statement as the student. Propose it for portal
  // access: PENDING, grants nothing. Idempotent and best effort, so the retry note
  // above does not matter and a failure never blocks the admission.
  await guardianDirectorySync.syncAfterWrite(student.id, { uid: actorUid, role: actorRole }, 'ADMISSION')

  // Student row committed successfully — safe to email the credentials now.
  // [PRODUCTION FIX] Previously provisionStudentAuthAccount() sent this email
  // itself, before this transaction ran — a failed conversion could leave an
  // applicant emailed a password for an account that was about to be deleted.
  if (createLoginAccount && firebaseUid && tempPassword && app.email) {
    await sendStudentWelcomeEmail({
      email:        app.email,
      displayName:  `${app.firstName} ${app.lastName}`,
      tempPassword,
    })
  }

  // ── 6. Audit log
  // [PRODUCTION FIX] Wrapped in `withRetry` — this is the call that was
  // observed hitting a transient Neon connection drop and, unretried,
  // propagating out to an outer retry wrapper that re-ran this whole
  // function (see note above). Same idempotency reasoning: a retried
  // audit-log insert is an accepted, existing risk class in this codebase
  // (matches `withRetry(() => prisma.$transaction(...))` elsewhere), not a
  // new one introduced here.
  await withRetry(() => auditService.log({
    action:     'application.converted_to_student',
    entityType: 'Application',
    entityId:   applicationId,
    actorUid,
    actorRole,
    metadata: {
      context: {
        studentId:      student.id,
        registrationNo,
        firebaseUid:    firebaseUid,
        classId:        classId ?? null,
        firebaseCreated:Boolean(createLoginAccount),
        // Which application fields were carried across (values are never logged).
        nrbRecorded:         Boolean(nrbNumber),
        nrbSkippedAsClash:   nrbSkipped,
        welfareCarriedOver:  hasWelfare,
        supportNeedsCarried: supportNeedRows.length,
      },
    },
  }))

  logger.info(
    { studentId: student.id, applicationId, registrationNo, firebaseUid },
    '[studentService] Application converted to student'
  )

  const detail = await withRetry(() => getById(student.id)) as ApiStudentDetail

  return { student: detail, firebaseUid, tempPassword }
}

// ─────────────────────────────────────────────────────────
//  FINANCE GATE CHECK  (used by exam service)
// ─────────────────────────────────────────────────────────

/**
 * Returns true if the student has a zero fee balance for the given term.
 * Used by the exam results service to enforce the fee gate.
 * Returns true for non-student roles (gate only applies to students).
 */
export async function passesFeGate(
  studentId:    string,
  academicYear: string,
  term:         number
): Promise<boolean> {
  const invoice = await prisma.invoice.findUnique({
    where: {
      studentId_academicYear_term: { studentId, academicYear, term },
    },
    select: { balance: true, status: true },
  })

  if (!invoice) return true // No invoice yet — no barrier
  return Number(invoice.balance) <= 0
}

// ═══════════════════════════════════════════════════════════════════════════
// GUARDIANS
//
// Student.guardianName / guardianPhone / guardianRelation are the denormalised
// PRIMARY guardian (invoices, SMS and the forms read them). Every mutation below
// runs in one transaction and ends by mirroring the primary row back onto those
// columns, so the two can't drift. Rules, checked inside the transaction:
//   - exactly one primary guardian per student
//   - at least one emergency contact per student
// Audit entries record that a guardian changed (and which), never their phone
// numbers or addresses.
// ═══════════════════════════════════════════════════════════════════════════

type GuardianRow = Prisma.StudentGuardianGetPayload<Record<string, never>>

function toApiGuardian(g: GuardianRow): ApiStudentGuardian {
  return {
    id:                 g.id,
    studentId:          g.studentId,
    fullName:           g.fullName,
    relation:           g.relation,
    phone:              g.phone,
    altPhone:           g.altPhone,
    email:              g.email,
    address:            g.address,
    nrbNumber:          g.nrbNumber,
    isPrimary:          g.isPrimary,
    isFeePayer:         g.isFeePayer,
    isEmergencyContact: g.isEmergencyContact,
    livesWithStudent:   g.livesWithStudent,
    createdAt:          g.createdAt.toISOString(),
    updatedAt:          g.updatedAt.toISOString(),
  }
}

function guardianError(message: string, status = 409): Error {
  return Object.assign(new Error(message), { status })
}

/** Throws unless the student has exactly one primary and at least one emergency contact. */
async function assertGuardianRules(tx: Prisma.TransactionClient, studentId: string): Promise<void> {
  const rows = await tx.studentGuardian.findMany({
    where:  { studentId },
    select: { isPrimary: true, isEmergencyContact: true },
  })
  if (rows.filter((r) => r.isPrimary).length !== 1) {
    throw guardianError('A student must have exactly one primary guardian.')
  }
  if (!rows.some((r) => r.isEmergencyContact)) {
    throw guardianError('A student must have at least one emergency contact.')
  }
}

/** Copies the primary guardian onto the legacy Student columns. */
async function mirrorPrimaryGuardian(tx: Prisma.TransactionClient, studentId: string): Promise<void> {
  const primary = await tx.studentGuardian.findFirst({
    where:  { studentId, isPrimary: true },
    select: { fullName: true, phone: true, relation: true },
  })
  if (!primary) return
  await tx.student.update({
    where: { id: studentId },
    data:  { guardianName: primary.fullName, guardianPhone: primary.phone, guardianRelation: primary.relation },
  })
}

async function assertStudentExists(tx: Prisma.TransactionClient, studentId: string): Promise<void> {
  const exists = await tx.student.findUnique({ where: { id: studentId }, select: { id: true } })
  if (!exists) throw guardianError('Student not found.', 404)
}

function cleanGuardianFields(input: UpdateGuardianInput): Prisma.StudentGuardianUncheckedUpdateInput {
  const data: Prisma.StudentGuardianUncheckedUpdateInput = {}
  if (input.fullName           !== undefined) data.fullName           = input.fullName
  if (input.relation           !== undefined) data.relation           = input.relation
  if (input.phone              !== undefined) data.phone              = input.phone
  if (input.altPhone           !== undefined) data.altPhone           = blankToNull(input.altPhone)
  if (input.email              !== undefined) data.email              = blankToNull(input.email)
  if (input.address            !== undefined) data.address            = blankToNull(input.address)
  if (input.nrbNumber          !== undefined) data.nrbNumber          = blankToNull(input.nrbNumber)
  if (input.isFeePayer         !== undefined) data.isFeePayer         = input.isFeePayer
  if (input.isEmergencyContact !== undefined) data.isEmergencyContact = input.isEmergencyContact
  if (input.livesWithStudent   !== undefined) data.livesWithStudent   = input.livesWithStudent
  return data
}

export async function listGuardians(studentId: string): Promise<ApiStudentGuardian[]> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } })
  if (!student) throw guardianError('Student not found.', 404)
  const rows = await prisma.studentGuardian.findMany({
    where:   { studentId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })
  return rows.map(toApiGuardian)
}

export async function addGuardian(
  studentId: string,
  input: GuardianInput,
  actorUid: string,
  actorRole: UserRole,
): Promise<ApiStudentGuardian> {
  const created = await prisma.$transaction(async (tx) => {
    await assertStudentExists(tx, studentId)
    const existing = await tx.studentGuardian.count({ where: { studentId } })
    const makePrimary = input.isPrimary === true || existing === 0

    if (makePrimary) {
      await tx.studentGuardian.updateMany({ where: { studentId, isPrimary: true }, data: { isPrimary: false } })
    }
    const row = await tx.studentGuardian.create({
      data: {
        studentId,
        fullName:           input.fullName,
        relation:           input.relation,
        phone:              input.phone,
        altPhone:           blankToNull(input.altPhone),
        email:              blankToNull(input.email),
        address:            blankToNull(input.address),
        nrbNumber:          blankToNull(input.nrbNumber),
        isPrimary:          makePrimary,
        isFeePayer:         input.isFeePayer ?? false,
        isEmergencyContact: input.isEmergencyContact ?? false,
        livesWithStudent:   input.livesWithStudent ?? null,
      },
    })
    await assertGuardianRules(tx, studentId)
    if (makePrimary) await mirrorPrimaryGuardian(tx, studentId)
    return row
  })

  // [Guardian portal] Propose the new card for portal access (PENDING). Best effort.
  await guardianDirectorySync.syncAfterWrite(studentId, { uid: actorUid, role: actorRole }, 'STAFF')

  await auditService.log({
    action:     'student.guardian_changed',
    entityType: 'Student',
    entityId:   studentId,
    actorUid,
    actorRole,
    metadata:   { context: { change: 'added', guardianId: created.id, isPrimary: created.isPrimary } },
  })
  return toApiGuardian(created)
}

export async function updateGuardian(
  studentId: string,
  guardianId: string,
  input: UpdateGuardianInput,
  actorUid: string,
  actorRole: UserRole,
): Promise<ApiStudentGuardian> {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.studentGuardian.findFirst({ where: { id: guardianId, studentId } })
    if (!current) throw guardianError('Guardian not found.', 404)

    if (current.isPrimary && input.isPrimary === false) {
      throw guardianError('Make another guardian the primary instead of un-setting this one.')
    }

    const data = cleanGuardianFields(input)
    if (input.isPrimary === true && !current.isPrimary) {
      await tx.studentGuardian.updateMany({ where: { studentId, isPrimary: true }, data: { isPrimary: false } })
      data.isPrimary = true
    }

    const row = await tx.studentGuardian.update({ where: { id: guardianId }, data })
    await assertGuardianRules(tx, studentId)
    if (row.isPrimary) await mirrorPrimaryGuardian(tx, studentId)
    return row
  })

  // [Guardian portal] Flag any portal link whose verified details no longer match this
  // card (a changed name, number, email or relationship needs staff to look again).
  await guardianDirectorySync.syncAfterWrite(studentId, { uid: actorUid, role: actorRole }, 'STAFF')

  await auditService.log({
    action:     'student.guardian_changed',
    entityType: 'Student',
    entityId:   studentId,
    actorUid,
    actorRole,
    metadata:   { context: { change: 'updated', guardianId, fieldsChanged: Object.keys(input) } },
  })
  return toApiGuardian(updated)
}

export async function deleteGuardian(
  studentId: string,
  guardianId: string,
  actorUid: string,
  actorRole: UserRole,
): Promise<void> {
  const portalAudit = await prisma.$transaction(async (tx) => {
    const current = await tx.studentGuardian.findFirst({ where: { id: guardianId, studentId } })
    if (!current) throw guardianError('Guardian not found.', 404)
    if (current.isPrimary) {
      throw guardianError('The primary guardian cannot be removed. Make another guardian primary first.')
    }
    // [Guardian portal] FAIL CLOSED, before the delete: suspend the portal access made
    // from this card. The foreign key clears the link's card reference the moment the
    // row goes, so this cannot run afterwards. If it throws, the delete is aborted.
    const audit = await guardianDirectorySync.guardRemovalInTx(tx, guardianId, { uid: actorUid, role: actorRole })
    await tx.studentGuardian.delete({ where: { id: guardianId } })
    await assertGuardianRules(tx, studentId)
    return audit
  })
  await guardianDirectorySync.emitAudit(portalAudit)

  await auditService.log({
    action:     'student.guardian_changed',
    entityType: 'Student',
    entityId:   studentId,
    actorUid,
    actorRole,
    metadata:   { context: { change: 'removed', guardianId } },
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// WELFARE (sensitive child data)
//
// Orphan status, vulnerability, support needs and the medical alert are served
// ONLY from here, never from getById(): the routes gate reads on
// student.viewWelfare and writes on student.editWelfare, so there is no student
// payload to "strip" and nothing for a role without the permission to receive.
//
// These values are deliberately never an input to the risk score (riskService
// does not read them): a family circumstance is not a problem with the child,
// and scoring it would label children. They exist to target support and to
// prioritise bursary review.
//
// Audit entries name the fields that changed, never their values.
// ═══════════════════════════════════════════════════════════════════════════

type SupportNeedRow = Prisma.StudentSupportNeedGetPayload<Record<string, never>>

function toApiSupportNeed(n: SupportNeedRow): ApiSupportNeed {
  return {
    id:              n.id,
    type:            n.type,
    accommodation:   n.accommodation,
    assistiveDevice: n.assistiveDevice,
    identifiedAt:    n.identifiedAt ? n.identifiedAt.toISOString() : null,
    createdAt:       n.createdAt.toISOString(),
  }
}

async function auditWelfare(
  studentId: string,
  actorUid: string,
  actorRole: UserRole,
  context: Record<string, unknown>,
): Promise<void> {
  await auditService.log({
    action:     'student.welfare_edited',
    entityType: 'Student',
    entityId:   studentId,
    actorUid,
    actorRole,
    metadata:   { context },
  })
}

export async function getWelfare(studentId: string): Promise<ApiStudentWelfare> {
  const row = await prisma.student.findUnique({
    where:  { id: studentId },
    select: {
      id: true, orphanStatus: true, isVulnerable: true, vulnerabilityNote: true,
      vulnerabilityReviewedAt: true, medicalAlert: true, exitNote: true,
      supportNeeds: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!row) throw Object.assign(new Error('Student not found.'), { status: 404 })
  return {
    studentId:               row.id,
    orphanStatus:            row.orphanStatus,
    isVulnerable:            row.isVulnerable,
    vulnerabilityNote:       row.vulnerabilityNote,
    vulnerabilityReviewedAt: row.vulnerabilityReviewedAt ? row.vulnerabilityReviewedAt.toISOString() : null,
    medicalAlert:            row.medicalAlert,
    exitNote:                row.exitNote,
    supportNeeds:            row.supportNeeds.map(toApiSupportNeed),
  }
}

export async function updateWelfare(
  studentId: string,
  input: UpdateWelfareInput,
  actorUid: string,
  actorRole: UserRole,
): Promise<ApiStudentWelfare> {
  const data: Prisma.StudentUncheckedUpdateInput = {}
  const fieldsChanged: string[] = []
  if (input.orphanStatus !== undefined)      { data.orphanStatus = input.orphanStatus;                       fieldsChanged.push('orphanStatus') }
  if (input.isVulnerable !== undefined)      { data.isVulnerable = input.isVulnerable;                       fieldsChanged.push('isVulnerable') }
  if (input.vulnerabilityNote !== undefined) { data.vulnerabilityNote = blankToNull(input.vulnerabilityNote); fieldsChanged.push('vulnerabilityNote') }
  if (input.medicalAlert !== undefined)      { data.medicalAlert = blankToNull(input.medicalAlert);          fieldsChanged.push('medicalAlert') }
  if (fieldsChanged.length === 0) return getWelfare(studentId)

  // Touching the vulnerability flag or its note counts as a review, so the
  // "last reviewed" date on the card means something.
  if (input.isVulnerable !== undefined || input.vulnerabilityNote !== undefined) {
    data.vulnerabilityReviewedAt = new Date()
  }

  try {
    await prisma.student.update({ where: { id: studentId }, data })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw Object.assign(new Error('Student not found.'), { status: 404 })
    }
    throw err
  }
  await auditWelfare(studentId, actorUid, actorRole, { fieldsChanged })
  return getWelfare(studentId)
}

export async function addSupportNeed(
  studentId: string,
  input: SupportNeedInput,
  actorUid: string,
  actorRole: UserRole,
): Promise<ApiSupportNeed> {
  const exists = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } })
  if (!exists) throw Object.assign(new Error('Student not found.'), { status: 404 })

  const row = await prisma.studentSupportNeed.create({
    data: {
      studentId,
      type:            input.type,
      accommodation:   blankToNull(input.accommodation),
      assistiveDevice: blankToNull(input.assistiveDevice),
      identifiedAt:    input.identifiedAt ? new Date(input.identifiedAt) : null,
      recordedByUid:   actorUid,
    },
  })
  await auditWelfare(studentId, actorUid, actorRole, { change: 'supportNeedAdded', supportNeedId: row.id, type: row.type })
  return toApiSupportNeed(row)
}

export async function updateSupportNeed(
  studentId: string,
  needId: string,
  input: UpdateSupportNeedInput,
  actorUid: string,
  actorRole: UserRole,
): Promise<ApiSupportNeed> {
  const current = await prisma.studentSupportNeed.findFirst({ where: { id: needId, studentId } })
  if (!current) throw Object.assign(new Error('Support need not found.'), { status: 404 })

  const data: Prisma.StudentSupportNeedUncheckedUpdateInput = {}
  if (input.type            !== undefined) data.type            = input.type
  if (input.accommodation   !== undefined) data.accommodation   = blankToNull(input.accommodation)
  if (input.assistiveDevice !== undefined) data.assistiveDevice = blankToNull(input.assistiveDevice)
  if (input.identifiedAt    !== undefined) data.identifiedAt    = input.identifiedAt ? new Date(input.identifiedAt) : null

  const row = await prisma.studentSupportNeed.update({ where: { id: needId }, data })
  await auditWelfare(studentId, actorUid, actorRole, { change: 'supportNeedUpdated', supportNeedId: needId, fieldsChanged: Object.keys(input) })
  return toApiSupportNeed(row)
}

export async function deleteSupportNeed(
  studentId: string,
  needId: string,
  actorUid: string,
  actorRole: UserRole,
): Promise<void> {
  const current = await prisma.studentSupportNeed.findFirst({ where: { id: needId, studentId } })
  if (!current) throw Object.assign(new Error('Support need not found.'), { status: 404 })
  await prisma.studentSupportNeed.delete({ where: { id: needId } })
  await auditWelfare(studentId, actorUid, actorRole, { change: 'supportNeedRemoved', supportNeedId: needId, type: current.type })
}

/**
 * Welfare COUNTS for dashboards: totals only, never names. Active students only
 * (graduated and archived learners aren't a current caseload).
 */
export async function getWelfareSummary(): Promise<ApiWelfareSummary> {
  const active = { status: 'ACTIVE' as const }
  const [activeStudents, byOrphan, vulnerable, needsByType, studentsWithNeeds] = await Promise.all([
    prisma.student.count({ where: active }),
    prisma.student.groupBy({ by: ['orphanStatus'], where: active, _count: { _all: true } }),
    prisma.student.count({ where: { ...active, isVulnerable: true } }),
    prisma.studentSupportNeed.groupBy({
      by: ['type'],
      where: { student: active },
      _count: { _all: true },
    }),
    prisma.student.count({ where: { ...active, supportNeeds: { some: {} } } }),
  ])

  const orphanCount = (s: string) => byOrphan.find((r) => r.orphanStatus === s)?._count._all ?? 0
  const father = orphanCount('FATHER_DECEASED')
  const mother = orphanCount('MOTHER_DECEASED')
  const both   = orphanCount('BOTH_DECEASED')

  return {
    activeStudents,
    orphans: { total: father + mother + both, father, mother, both },
    vulnerable,
    withSupportNeeds: studentsWithNeeds,
    supportNeedsByType: needsByType
      .map((r) => ({ type: r.type, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    orphanStatusUnrecorded: orphanCount('UNKNOWN'),
  }
}
