import 'server-only'

import { prisma }        from '@/lib/prisma'
import { logger }        from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import * as admin        from 'firebase-admin'
import type { App }      from 'firebase-admin/app'
import {
  Prisma,
  type StudentStatus,
  type Sex,
} from '@prisma/client'
import type { UserRole } from '@shared/types/roles'

// ─────────────────────────────────────────────────────────
//  FIREBASE ADMIN SINGLETON
// ─────────────────────────────────────────────────────────

function getAdminApp(): App {
  if (admin.apps.length > 0) return admin.app()
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    }),
  })
}

// ─────────────────────────────────────────────────────────
//  REGISTRATION NUMBER GENERATOR
//  Format: SMS-YYYY-NNNN  (e.g. SMS-2025-0042)
//  Sequence is per academic year, zero-padded to 4 digits.
//  Uses a Prisma aggregate to find the current year's max seq.
// ─────────────────────────────────────────────────────────

async function generateRegistrationNo(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `SMS-${year}-`

  const last = await prisma.student.findFirst({
    where:   { registrationNo: { startsWith: prefix } },
    orderBy: { registrationNo: 'desc' },
    select:  { registrationNo: true },
  })

  const lastSeq = last
    ? parseInt(last.registrationNo.replace(prefix, ''), 10)
    : 0

  const nextSeq = lastSeq + 1
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

// ─────────────────────────────────────────────────────────
//  RISK LEVEL COMPUTATION
//  Lightweight heuristic — computes a risk level string from
//  available data without additional DB queries.
//  Full riskService (Phase D7) will replace this with a richer model.
// ─────────────────────────────────────────────────────────

type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'

function computeRiskLevel(
  feeBalance:   number,
  feeTotal:     number,
  termAverage?: number | null
): RiskLevel {
  const hasHighFeeDebt  = feeTotal > 0 && (feeBalance / feeTotal) > 0.5
  const hasPoorGrades   = termAverage != null && termAverage < 40
  const hasModestGrades = termAverage != null && termAverage < 50

  if (hasHighFeeDebt && hasPoorGrades)   return 'HIGH'
  if (hasHighFeeDebt || hasPoorGrades)   return 'MEDIUM'
  if (hasModestGrades)                    return 'LOW'
  return 'NONE'
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
  photoKey:        string | null
  hasFirebaseUid:  boolean
  riskLevel:       RiskLevel
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
  updatedAt:       string
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
  page?:       number
  pageSize?:   number
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
  filters: StudentQueryFilters
): Promise<StudentListResult> {
  const {
    search,
    classId,
    status,
    sex,
    form,
    page     = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = filters

  const safePageSize = Math.min(pageSize, MAX_PAGE_SIZE)
  const safeOffset   = (Math.max(page, 1) - 1) * safePageSize

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
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
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
        // Latest invoice for fee balance
        invoices: {
          orderBy:     { createdAt: 'desc' },
          take:        1,
          select: {
            balance:     true,
            totalAmount: true,
          },
        },
        // Active borrowings count
        borrowings: {
          where:  { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    }),
  ])

  const students: ApiStudentSummary[] = rows.map((row) => {
    const latestInvoice  = row.invoices[0] as { balance: Prisma.Decimal | number; totalAmount: Prisma.Decimal | number } | undefined
    const feeBalance     = latestInvoice ? Number(latestInvoice.balance)     : 0
    const feeTotal       = latestInvoice ? Number(latestInvoice.totalAmount)  : 0

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
      riskLevel:       computeRiskLevel(feeBalance, feeTotal),
      feeBalance,
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

export async function getById(id: string): Promise<ApiStudentDetail | null> {
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
      classId:         true,
      photoKey:        true,
      firebaseUid:     true,
      status:          true,
      createdAt:       true,
      updatedAt:       true,
      class: {
        select: { name: true, form: true },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take:    1,
        select:  { balance: true, totalAmount: true },
      },
      borrowings: {
        where:  { status: 'ACTIVE' },
        select: { id: true },
      },
    },
  })

  if (!row) return null

  const latestInvoice  = row.invoices[0] as { balance: Prisma.Decimal | number; totalAmount: Prisma.Decimal | number } | undefined
  const feeBalance     = latestInvoice ? Number(latestInvoice.balance)    : 0
  const feeTotal       = latestInvoice ? Number(latestInvoice.totalAmount) : 0

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
    classId:         row.classId,
    className:       row.class?.name  ?? null,
    classForm:       row.class?.form  ?? null,
    photoKey:        row.photoKey,
    hasFirebaseUid:  Boolean(row.firebaseUid),
    riskLevel:       computeRiskLevel(feeBalance, feeTotal),
    feeBalance,
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
  firebaseUid: string
): Promise<ApiStudentDetail | null> {
  const row = await prisma.student.findUnique({
    where:  { firebaseUid },
    select: { id: true },
  })
  if (!row) return null
  return getById(row.id)
}

// ─────────────────────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────────────────────

export async function create(
  input:       CreateStudentInput,
  actorUid:    string,
  actorRole:   UserRole
): Promise<ApiStudentDetail> {
  const registrationNo = await generateRegistrationNo()

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

  const student = await prisma.student.create({
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
      classId:         input.classId  ?? null,
      photoKey:        input.photoKey ?? null,
      firebaseUid:     input.firebaseUid ?? null,
      status:          'ACTIVE',
    },
    select: { id: true },
  })

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
      },
    },
  })

  logger.info(
    { studentId: student.id, registrationNo, actorRole },
    '[studentService] Student created'
  )

  return getById(student.id) as Promise<ApiStudentDetail>
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
    },
  })

  if (!before) {
    throw Object.assign(new Error('Student not found.'), { status: 404 })
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

  await prisma.student.update({
    where: { id },
    data:  updateData,
  })

  const afterSelect = { ...before }
  const changes     = auditService.createDiff(
    before as Record<string, unknown>,
    { ...before, ...input } as Record<string, unknown>
  )

  await auditService.log({
    action:     'student.edit',
    entityType: 'Student',
    entityId:   id,
    actorUid,
    actorRole,
    metadata: { before: before as Record<string, unknown>, changes },
  })

  return getById(id) as Promise<ApiStudentDetail>
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
export async function softDelete(
  id:        string,
  actorUid:  string,
  actorRole: UserRole
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
    data:  { status: 'ARCHIVED' },
  })

  await auditService.log({
    action:     'student.archive',
    entityType: 'Student',
    entityId:   id,
    actorUid,
    actorRole,
    metadata: {
      before: { status: student.status },
      after:  { status: 'ARCHIVED' },
      context: { registrationNo: student.registrationNo },
    },
  })

  logger.info({ studentId: id, actorRole }, '[studentService] Student archived')
}

// ─────────────────────────────────────────────────────────
//  STATUS CHANGE
// ─────────────────────────────────────────────────────────

export async function changeStatus(
  id:        string,
  newStatus: StudentStatus,
  actorUid:  string,
  actorRole: UserRole
): Promise<ApiStudentDetail> {
  const student = await prisma.student.findUnique({
    where:  { id },
    select: { status: true },
  })

  if (!student) {
    throw Object.assign(new Error('Student not found.'), { status: 404 })
  }

  await prisma.student.update({
    where: { id },
    data:  { status: newStatus },
  })

  await auditService.log({
    action:     'student.status_changed',
    entityType: 'Student',
    entityId:   id,
    actorUid,
    actorRole,
    metadata: {
      before: { status: student.status },
      after:  { status: newStatus },
    },
  })

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

export interface ConvertApplicationInput {
  applicationId:   string
  classId?:        string
  actorUid:        string
  actorRole:       UserRole
  /** If provided, a Firebase account is created and linked immediately. */
  createFirebaseAccount?: {
    email:    string
    password: string
  }
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
  const { applicationId, classId, actorUid, actorRole, createFirebaseAccount } = input

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

  // ── 2. Registration number
  const registrationNo = await generateRegistrationNo()

  // ── 3. Optional Firebase account creation (must happen before Prisma tx)
  let firebaseUid:  string | null = null
  let tempPassword: string | null = null

  if (createFirebaseAccount) {
    try {
      const fbUser = await admin.auth(getAdminApp()).createUser({
        email:         createFirebaseAccount.email,
        password:      createFirebaseAccount.password,
        displayName:   `${app.firstName} ${app.lastName}`,
        emailVerified: false,
        disabled:      false,
      })
      firebaseUid  = fbUser.uid
      tempPassword = createFirebaseAccount.password

      // Set custom claims immediately — role and password change flag
      await admin.auth(getAdminApp()).setCustomUserClaims(firebaseUid, {
        role:                  'student',
        subtitle:              'Student',
        requiresPasswordChange: true,
      })

      logger.info(
        { firebaseUid, email: createFirebaseAccount.email },
        '[studentService] Firebase account created for student'
      )
    } catch (fbErr) {
      logger.error({ fbErr, applicationId }, '[studentService] Firebase account creation failed')
      throw Object.assign(
        new Error('Failed to create Firebase account for student. No student record was created.'),
        { status: 500 }
      )
    }
  }

  // ── 4 + 5. Create student and update application atomically
  const [student] = await prisma.$transaction([
    prisma.student.create({
      data: {
        registrationNo,
        firstName:       app.firstName,
        lastName:        app.lastName,
        otherNames:      null,
        dateOfBirth:     app.dateOfBirth,
        sex:             app.sex,
        nationality:     app.nationality,
        district:        app.district,
        village:         app.village,
        address:         null,
        phone:           null,
        email:           createFirebaseAccount?.email ?? null,
        guardianName:    app.guardianName,
        guardianPhone:   app.guardianPhone,
        guardianRelation:app.guardianRelation,
        classId:         classId ?? null,
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
  ])

  // Update convertedStudentId after we have the student ID
  await prisma.application.update({
    where: { id: applicationId },
    data:  { convertedStudentId: student.id },
  })

  // ── 6. Audit log
  await auditService.log({
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
        firebaseCreated:Boolean(createFirebaseAccount),
      },
    },
  })

  logger.info(
    { studentId: student.id, applicationId, registrationNo, firebaseUid },
    '[studentService] Application converted to student'
  )

  const detail = await getById(student.id) as ApiStudentDetail

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