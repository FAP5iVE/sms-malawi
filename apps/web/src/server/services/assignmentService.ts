/**
 * [FILE]: apps/web/src/server/services/assignmentService.ts
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]: Every rule of the assignment workflow lives here (routes only
 *   authenticate, validate and delegate). Follows the studentService/classService
 *   convention: 'server-only', Prisma singleton, named exports, auditService.log
 *   on every mutation. Dates, lateness, workflow state and file allowlists come
 *   from ONE shared module (packages/shared/utils/assignment.ts) so the API and
 *   the UI cannot disagree.
 *
 * VISIBILITY (scopeForViewer) - applied to every read, including files:
 *     admin / high_rank / exam_officer .. every assignment (read-only)
 *     class teacher ...................... their class (all subjects) + any other
 *                                          class where they teach a subject
 *     subject teacher .................... only their (class, subject) pairs
 *     student ............................ only their own class, only subjects that
 *                                          have an assigned teacher, only own hand-in
 *     everyone else ...................... nothing
 *   MUTATION: only the subject's teacher or the class teacher (canManage). The
 *   read-only roles cannot edit, delete, mark or record - checked here, not just
 *   hidden in the UI.
 *
 * FILES
 *   Uploads go straight to storage (the API never sees the bytes), so before any
 *   id from a client is stored it is VERIFIED here: it carries the expected prefix,
 *   is not already referenced by another record (DB-unique), exists, is recent, and
 *   its STORED name/type/size pass the allowlist (shared/utils/assignment.ts).
 *   Name/type/size shown to users are taken from the stored object, never from
 *   the request. Private files (attachments, hand-ins) are read only through the
 *   /api/files proxy, which asks canAccessAssignmentFile(); pictures embedded in
 *   rich text must be publicly viewable by URL (see FILE_PREFIX.ASSIGNMENT_IMAGE)
 *   and are therefore a separate prefix that never holds documents or hand-ins.
 *
 * RICH TEXT
 *   description / requirements are sanitised on write AND on read (rows written by
 *   the pre-workflow plain-text form are converted to safe HTML). Formulas are
 *   stored as LaTeX source only (<span data-math>) and drawn client-side by KaTeX.
 *
 * MARKS are informational "session" marks. Nothing here, and nothing in the
 *   exam / continuous-assessment / report-card code, reads them in either direction.
 *
 * NOTIFICATIONS are idempotent: feed items use a deterministic id per event and
 *   the device push is sent only for items this call actually created, so a
 *   retried request cannot alert anyone twice.
 */
import 'server-only'

import { randomUUID }    from 'node:crypto'
import { prisma }        from '@/lib/prisma'
import type { Prisma }   from '@prisma/client'
import * as auditService from '@/server/services/auditService'
import * as notificationFeedService from '@/server/services/notificationFeedService'
import { sendToUser }    from '@/lib/push'
import { logger }        from '@/lib/logger'
import {
  FILE_PREFIX, SCHOOL_BUCKET, deleteFile, getFileMetadata, getPublicViewUrl, getSignedViewUrl,
} from '@/lib/storage'
import { sanitizeRichText } from '@/server/lib/sanitizeRichText'
import {
  ASSIGNMENT_LIMITS, checkFileAgainstRules, classifyByDay, classifyByInstant, extractEmbeddedFileIds,
  noonOfSchoolDay, schoolDayOf, studentAssignmentState, todayInSchool, validateSubmittedOn,
  endOfSchoolDay,
} from '@shared/utils/assignment'
import type { AssignmentFileKind } from '@shared/utils/assignment'
import type {
  CreateAssignmentInput, UpdateAssignmentInput, MarkSubmissionInput,
} from '@shared/schemas/student'
import type {
  ApiAssignment, ApiAssignmentAttachment, ApiAssignmentDetail, ApiAssignmentRoster,
  ApiAssignmentRosterRow, ApiAssignmentStats, ApiAssignmentStudentStatus, ApiAssignmentSubmission,
} from '@shared/types/api'
import type { UserRole } from '@shared/types/roles'

export interface AssignmentViewer {
  uid:        string
  role:       UserRole
  superUser?: boolean
}

const fail = (message: string, status: number) => Object.assign(new Error(message), { status })
const forbidden = (message: string) => fail(message, 403)
const notFound = () => fail('Assignment not found.', 404)

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === 'P2002'

/** Roles that may open another student's hand-in file (the file proxy's READ_ROLES, minus the owner). */
const SUBMISSION_FILE_STAFF: ReadonlySet<string> = new Set(['admin', 'high_rank', 'academic'])

/** A stored upload must be claimed within this long of being uploaded. */
const UPLOAD_CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000
/** Hand-in list bound: newest-due first. A class accumulates a bounded number per year. */
const LIST_LIMIT = 200

// ─────────────────────────────────────────────────────────
//  VISIBILITY / PERMISSIONS
// ─────────────────────────────────────────────────────────

/** Subjects of a class that currently have a teacher assigned (explicit
 *  ClassSubjectAssignment rows for the class's own academic year). */
export async function assignedSubjectsForClass(classId: string): Promise<string[]> {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { academicYear: true } })
  if (!cls) return []
  const rows = await prisma.classSubjectAssignment.findMany({
    where:  { classId, academicYear: cls.academicYear },
    select: { subject: true },
  })
  return rows.map((r) => r.subject)
}

/**
 * The Prisma `where` that limits assignments to what `viewer` may see, or null
 * when they may see none (callers answer 403). Pass `classId` to scope to one
 * class - a class the viewer has no relationship to yields null, never an
 * empty-looking success.
 */
export async function scopeForViewer(
  viewer: AssignmentViewer,
  classId?: string,
): Promise<Prisma.AssignmentWhereInput | null> {
  if (viewer.superUser === true || viewer.role === 'admin' || viewer.role === 'high_rank' || viewer.role === 'exam_officer') {
    return classId ? { classId } : {}
  }

  if (viewer.role === 'student') {
    const student = await prisma.student.findFirst({
      where:  { firebaseUid: viewer.uid, ...(classId ? { classId } : {}) },
      select: { classId: true },
    })
    if (!student?.classId) return null
    const subjects = await assignedSubjectsForClass(student.classId)
    return { classId: student.classId, subject: { in: subjects } }
  }

  if (viewer.role === 'academic') {
    const [headed, taught] = await Promise.all([
      prisma.class.findMany({
        where:  { teacherId: viewer.uid, ...(classId ? { id: classId } : {}) },
        select: { id: true },
      }),
      prisma.classSubjectAssignment.findMany({
        where:  { teacherUid: viewer.uid, ...(classId ? { classId } : {}) },
        select: { classId: true, subject: true },
      }),
    ])
    const or: Prisma.AssignmentWhereInput[] = []
    if (headed.length > 0) or.push({ classId: { in: headed.map((c) => c.id) } })
    for (const t of taught) or.push({ classId: t.classId, subject: t.subject })
    return or.length > 0 ? { OR: or } : null
  }

  return null
}

/** What `uid` may edit/mark in one class: everything (class teacher) or specific subjects. */
async function manageScope(uid: string, classId: string): Promise<{ all: boolean; subjects: Set<string> }> {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true, academicYear: true } })
  if (!cls) return { all: false, subjects: new Set() }
  if (cls.teacherId === uid) return { all: true, subjects: new Set() }
  const rows = await prisma.classSubjectAssignment.findMany({
    where:  { classId, teacherUid: uid, academicYear: cls.academicYear },
    select: { subject: true },
  })
  return { all: false, subjects: new Set(rows.map((r) => r.subject)) }
}

async function canManage(viewer: AssignmentViewer, classId: string, subject: string): Promise<boolean> {
  if (viewer.role !== 'academic') return false // admin / high_rank / exam_officer are read-only here
  const m = await manageScope(viewer.uid, classId)
  return m.all || m.subjects.has(subject)
}

/** Subjects of `classId` the user may post work for (empty = none). */
export async function subjectsUserMayPost(classId: string, uid: string): Promise<string[]> {
  const m = await manageScope(uid, classId)
  const assigned = await assignedSubjectsForClass(classId)
  return m.all ? assigned : assigned.filter((s) => m.subjects.has(s))
}

/**
 * Who may set an assignment for (class, subject): the subject must have a teacher
 * assigned in this class, and the actor must be that teacher or the class teacher.
 */
export async function assertCanCreateForSubject(classId: string, subject: string, actorUid: string): Promise<void> {
  const cls = await prisma.class.findUnique({
    where:  { id: classId },
    select: { teacherId: true, academicYear: true },
  })
  if (!cls) throw fail('Class not found.', 404)

  const assigned = await prisma.classSubjectAssignment.findUnique({
    where: { classId_subject_academicYear: { classId, subject, academicYear: cls.academicYear } },
    select: { teacherUid: true },
  })
  if (!assigned) {
    throw fail(
      `${subject} has no teacher assigned in this class yet. Assign a subject teacher first (class page \u2192 Subjects & teachers).`,
      409,
    )
  }
  if (assigned.teacherUid !== actorUid && cls.teacherId !== actorUid) {
    throw forbidden(`Only the teacher assigned to ${subject} in this class, or the class teacher, can set ${subject} assignments.`)
  }
}

/** Gate for the attachment upload-ticket routes: a teacher who can post at least one subject here. */
export async function assertCanPostInClass(classId: string, viewer: AssignmentViewer): Promise<void> {
  if (viewer.role !== 'academic') throw forbidden('Only teachers can attach files to assignments.')
  const subjects = await subjectsUserMayPost(classId, viewer.uid)
  if (subjects.length === 0) throw forbidden('You do not teach any subject in this class.')
}

/** The student record behind a student viewer (null for everyone else). */
async function ownStudent(viewer: AssignmentViewer, classId?: string) {
  if (viewer.role !== 'student') return null
  return prisma.student.findFirst({
    where:  { firebaseUid: viewer.uid, ...(classId ? { classId } : {}) },
    select: { id: true, classId: true, status: true },
  })
}

// ─────────────────────────────────────────────────────────
//  RICH TEXT
// ─────────────────────────────────────────────────────────

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Pre-workflow rows are plain text typed into a <textarea>: show them as safe paragraphs. */
function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Where pictures embedded in assignment text must be hosted. */
function imagePrefix(): string | undefined {
  const endpoint = process.env.APPWRITE_ENDPOINT
  return endpoint ? `${endpoint}/storage/buckets/${SCHOOL_BUCKET}/files/${FILE_PREFIX.ASSIGNMENT_IMAGE}_` : undefined
}

/**
 * Safe HTML for storage AND for output (idempotent). Plain-text legacy values are
 * escaped into paragraphs; HTML is run through the allowlist (formulas allowed,
 * pictures only from our own bucket). Returns null when nothing visible is left.
 */
export function toSafeHtml(raw: string | null | undefined): string | null {
  if (!raw) return null
  const looksLikeHtml = /<\/?[a-z][\s\S]*?>/i.test(raw)
  const out = looksLikeHtml
    ? sanitizeRichText(raw, { math: true, imageSrcPrefix: imagePrefix() })
    : plainTextToHtml(raw)
  const hasText = out.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
  const hasMedia = /<img\b/i.test(out) || /data-math=/i.test(out)
  return hasText || hasMedia ? out : null
}

// ─────────────────────────────────────────────────────────
//  FILE VERIFICATION
// ─────────────────────────────────────────────────────────

interface VerifiedFile { fileKey: string; fileName: string; mimeType: string; sizeBytes: number }

async function isReferenced(fileKey: string): Promise<boolean> {
  const [a, s] = await Promise.all([
    prisma.assignmentAttachment.findFirst({ where: { fileKey }, select: { id: true } }),
    prisma.assignmentSubmission.findFirst({ where: { fileKey }, select: { id: true } }),
  ])
  return !!(a || s)
}

/**
 * Looks at the STORED object (not the request) and accepts it only if it exists,
 * was uploaded recently (when `requireFresh`) and passes the allowlist for `kind`.
 * A rejected, unreferenced upload is deleted so a refused file does not linger.
 */
async function inspectUpload(
  fileKey: string,
  kind: AssignmentFileKind,
  opts: { requireFresh: boolean },
): Promise<VerifiedFile> {
  let meta: { name: string; mimeType: string; sizeOriginal: number; $createdAt: string }
  try {
    meta = await getFileMetadata(SCHOOL_BUCKET, fileKey)
  } catch {
    throw fail('One of the uploaded files could not be found. Please upload it again.', 400)
  }
  if (opts.requireFresh && Date.now() - Date.parse(meta.$createdAt) > UPLOAD_CLAIM_WINDOW_MS) {
    throw fail(`"${meta.name}" was uploaded too long ago. Please upload it again.`, 400)
  }
  const info = { name: meta.name, mimeType: meta.mimeType, sizeBytes: meta.sizeOriginal }
  const problem = checkFileAgainstRules(info, kind)
  if (problem) {
    // Safe to delete: callers verify the key is unreferenced before inspecting.
    await deleteFile(SCHOOL_BUCKET, fileKey).catch(() => undefined)
    throw fail(problem, 400)
  }
  return { fileKey, fileName: meta.name.slice(0, 255), mimeType: meta.mimeType.split(';')[0]?.trim().toLowerCase() ?? '', sizeBytes: meta.sizeOriginal }
}

/** Verifies teacher attachments the request wants to add (ids not already on THIS assignment). */
async function verifyNewAttachments(fileKeys: string[]): Promise<Array<VerifiedFile & { kind: 'FILE' | 'IMAGE' }>> {
  const out: Array<VerifiedFile & { kind: 'FILE' | 'IMAGE' }> = []
  for (const fileKey of fileKeys) {
    const kind: 'FILE' | 'IMAGE' | null =
      fileKey.startsWith(`${FILE_PREFIX.ASSIGNMENT_IMAGE}_`) ? 'IMAGE'
      : fileKey.startsWith(`${FILE_PREFIX.ASSIGNMENT_FILE}_`) ? 'FILE'
      : null
    if (!kind) throw fail('An attachment was not uploaded through the assignment upload route.', 400)
    if (await isReferenced(fileKey)) throw fail('One of the files is already used by another record. Please upload it again.', 409)
    out.push({ ...(await inspectUpload(fileKey, kind === 'IMAGE' ? 'IMAGE' : 'ATTACHMENT', { requireFresh: true })), kind })
  }
  return out
}

/** Pictures embedded in the text must be real raster images in our public-image prefix. */
async function verifyEmbeddedImages(html: string | null, alreadyKnown: Set<string> = new Set()): Promise<void> {
  const ids = extractEmbeddedFileIds(html, FILE_PREFIX.ASSIGNMENT_IMAGE)
  if (ids.length > ASSIGNMENT_LIMITS.maxEmbeddedImages) {
    throw fail(`Use at most ${ASSIGNMENT_LIMITS.maxEmbeddedImages} pictures in the text.`, 400)
  }
  await Promise.all(ids.filter((id) => !alreadyKnown.has(id)).map((id) => inspectUpload(id, 'IMAGE', { requireFresh: false })))
}

/** Deletes stored files that nothing references any more (best effort, never throws). */
async function deleteIfUnreferenced(fileKeys: string[]): Promise<void> {
  await Promise.allSettled(fileKeys.map(async (key) => {
    if (await isReferenced(key)) return
    if (key.startsWith(`${FILE_PREFIX.ASSIGNMENT_IMAGE}_`)) {
      // Embedded pictures have no row of their own: they are "referenced" by text.
      const used = await prisma.assignment.count({
        where: { OR: [{ description: { contains: key } }, { requirements: { contains: key } }] },
      })
      if (used > 0) return
    }
    await deleteFile(SCHOOL_BUCKET, key)
  }))
}

// ─────────────────────────────────────────────────────────
//  SHAPING
// ─────────────────────────────────────────────────────────

const SUBMISSION_SELECT = {
  id: true, studentId: true, status: true, submittedAt: true, fileKey: true, fileName: true, note: true,
  recordedByUid: true, marks: true, feedback: true, markedAt: true, updatedAt: true,
} satisfies Prisma.AssignmentSubmissionSelect

type SubmissionRow = Prisma.AssignmentSubmissionGetPayload<{ select: typeof SUBMISSION_SELECT }>

function statusOf(sub: { status: string } | null | undefined): ApiAssignmentStudentStatus {
  if (!sub || sub.status === 'MISSING') return 'NOT_SUBMITTED'
  return sub.status === 'LATE' ? 'LATE' : 'SUBMITTED'
}

/**
 * What a STUDENT may see of their own hand-in. Marks and feedback appear only
 * when the teacher switched marks on for the assignment AND entered a mark; the
 * private storage key is never sent (the file is opened through an authorised
 * endpoint instead).
 */
function toStudentSubmission(sub: SubmissionRow | undefined, marksEnabled: boolean): ApiAssignmentSubmission | null {
  if (!sub || sub.status === 'MISSING') return null
  const marked = marksEnabled && sub.marks != null
  return {
    studentId:         sub.studentId,
    status:            sub.status,
    submittedAt:       sub.submittedAt.toISOString(),
    hasFile:           !!sub.fileKey,
    fileName:          sub.fileName,
    note:              sub.note,
    recordedByTeacher: !!sub.recordedByUid,
    marks:             marked ? sub.marks : null,
    feedback:          marked ? sub.feedback : null,
    markedAt:          marked && sub.markedAt ? sub.markedAt.toISOString() : null,
    updatedAt:         sub.updatedAt.toISOString(),
  }
}

async function staffNames(uids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(uids.filter(Boolean)))
  if (unique.length === 0) return new Map()
  const rows = await prisma.staffProfile.findMany({
    where:  { uid: { in: unique } },
    select: { uid: true, firstName: true, lastName: true },
  })
  return new Map(rows.map((r) => [r.uid, `${r.firstName} ${r.lastName}`.trim()]))
}

function buildStats(
  rosterIds: Set<string>,
  submissions: Array<{ studentId: string; status: string; marks: number | null }>,
  viewerIds: Iterable<string>,
): ApiAssignmentStats {
  let submitted = 0, late = 0, marked = 0
  for (const s of submissions) {
    if (!rosterIds.has(s.studentId)) continue // withdrawn / moved students are not counted
    if (s.status === 'SUBMITTED') submitted++
    else if (s.status === 'LATE') late++
    if (s.marks != null && s.status !== 'MISSING') marked++
  }
  let viewed = 0
  for (const id of viewerIds) if (rosterIds.has(id)) viewed++
  return {
    totalStudents: rosterIds.size,
    viewed,
    submitted,
    late,
    // MISSING markers and "no record" are both "not submitted"
    notSubmitted: Math.max(0, rosterIds.size - submitted - late),
    marked,
  }
}

async function activeRoster(classId: string) {
  return prisma.student.findMany({
    where:   { classId, status: 'ACTIVE' },
    select:  { id: true, firstName: true, lastName: true, registrationNo: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
}

async function toAttachment(a: { id: string; fileKey: string; fileName: string; mimeType: string; sizeBytes: number; kind: string }): Promise<ApiAssignmentAttachment> {
  const kind = a.kind === 'IMAGE' ? 'IMAGE' : 'FILE'
  return {
    id: a.id, fileKey: a.fileKey, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, kind,
    url: kind === 'IMAGE' ? await getPublicViewUrl(SCHOOL_BUCKET, a.fileKey) : await getSignedViewUrl(a.fileKey),
  }
}

// ─────────────────────────────────────────────────────────
//  NOTIFICATIONS (idempotent)
// ─────────────────────────────────────────────────────────

const deepLink = (classId: string, assignmentId: string) =>
  `/classes/${classId}?tab=assignments&assignment=${assignmentId}`

/** In-app feed (once per `dedupeKey`) + device push only for the items created now. Never throws. */
async function alertUids(
  uids: string[],
  args: { classId: string; assignmentId: string; title: string; body: string; dedupeKey: string; type?: 'INFO' | 'SUCCESS' },
): Promise<void> {
  try {
    if (uids.length === 0) return
    const actionUrl = deepLink(args.classId, args.assignmentId)
    const created = await notificationFeedService.pushToManyFeedsOnce(
      uids,
      { title: args.title, body: args.body, type: args.type ?? 'INFO', category: 'assignment', actionUrl },
      args.dedupeKey,
    )
    await Promise.allSettled(
      created.map((uid) => sendToUser(uid, { title: args.title, body: args.body, clickAction: actionUrl, tag: args.dedupeKey })),
    )
  } catch (err) {
    logger.error({ err, assignmentId: args.assignmentId }, '[assignmentService] alert failed')
  }
}

async function alertClassStudents(
  classId: string,
  args: { assignmentId: string; title: string; body: string; dedupeKey: string },
): Promise<void> {
  try {
    const students = await prisma.student.findMany({
      where:  { classId, status: 'ACTIVE', firebaseUid: { not: null } },
      select: { firebaseUid: true },
    })
    const uids = students.map((s) => s.firebaseUid).filter((u): u is string => !!u)
    await alertUids(uids, { classId, ...args })
  } catch (err) {
    logger.error({ err, classId }, '[assignmentService] alertClassStudents failed')
  }
}

// ─────────────────────────────────────────────────────────
//  LIST
// ─────────────────────────────────────────────────────────

export async function listForViewer(classId: string, viewer: AssignmentViewer): Promise<ApiAssignment[]> {
  const scope = await scopeForViewer(viewer, classId)
  if (!scope) throw forbidden('You do not have access to this class\u2019s assignments.')

  const own = await ownStudent(viewer, classId)
  const rows = await prisma.assignment.findMany({
    where: scope,
    select: {
      id: true, title: true, subject: true, classId: true, dueDate: true, createdByUid: true,
      createdAt: true, updatedAt: true, marksEnabled: true, maxMarks: true,
      _count: { select: { attachments: true } },
      // students: only their own rows; staff: ids/status only (never file keys or notes)
      submissions: own
        ? { where: { studentId: own.id }, select: SUBMISSION_SELECT }
        : { select: { studentId: true, status: true, marks: true } },
      views: own
        ? { where: { studentId: own.id }, select: { studentId: true, firstViewedAt: true } }
        : { select: { studentId: true } },
    },
    orderBy: { dueDate: 'desc' },
    take: LIST_LIMIT,
  })

  const names = await staffNames(rows.map((r) => r.createdByUid))
  const roster = own ? null : await activeRoster(classId)
  const rosterIds = new Set((roster ?? []).map((s) => s.id))
  const manage = viewer.role === 'academic' ? await manageScope(viewer.uid, classId) : null
  const now = new Date()

  return rows.map((a): ApiAssignment => {
    const base: ApiAssignment = {
      id: a.id, title: a.title, subject: a.subject, classId: a.classId,
      dueDate: a.dueDate.toISOString(), createdByUid: a.createdByUid,
      createdByName: names.get(a.createdByUid) ?? null,
      createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
      marksEnabled: a.marksEnabled, maxMarks: a.maxMarks,
      attachmentCount: a._count.attachments,
    }
    if (own) {
      const mineRow = (a.submissions as SubmissionRow[])[0]
      const mine = toStudentSubmission(mineRow, a.marksEnabled)
      const views = a.views as Array<{ firstViewedAt: Date }>
      return {
        ...base,
        mine,
        myStatus: statusOf(mineRow),
        myState: studentAssignmentState({ dueDate: a.dueDate, submission: mineRow ?? null, now }),
        viewedAt: views[0]?.firstViewedAt?.toISOString() ?? null,
        submissions: mine ? [mine] : [],
      }
    }
    const subs = a.submissions as Array<{ studentId: string; status: string; marks: number | null }>
    const views = a.views as Array<{ studentId: string }>
    return {
      ...base,
      canManage: !!manage && (manage.all || manage.subjects.has(a.subject)),
      stats: buildStats(rosterIds, subs, views.map((v) => v.studentId)),
    }
  })
}

// ─────────────────────────────────────────────────────────
//  DETAIL (a read: no side effects) and VIEW tracking
// ─────────────────────────────────────────────────────────

async function findVisible(classId: string, viewer: AssignmentViewer) {
  const scope = await scopeForViewer(viewer, classId)
  if (!scope) throw forbidden('You do not have access to this class\u2019s assignments.')
  return scope
}

export async function getDetail(classId: string, assignmentId: string, viewer: AssignmentViewer): Promise<ApiAssignmentDetail> {
  const scope = await findVisible(classId, viewer)
  const own = await ownStudent(viewer, classId)

  const a = await prisma.assignment.findFirst({
    where: { AND: [{ id: assignmentId }, { classId }, scope] },
    include: {
      attachments: { orderBy: { createdAt: 'asc' } },
      submissions: own
        ? { where: { studentId: own.id }, select: SUBMISSION_SELECT }
        : { select: { studentId: true, status: true, marks: true } },
      views: own
        ? { where: { studentId: own.id }, select: { studentId: true, firstViewedAt: true } }
        : { select: { studentId: true } },
    },
  })
  if (!a) throw notFound()

  const [names, attachments] = await Promise.all([
    staffNames([a.createdByUid]),
    Promise.all(a.attachments.map(toAttachment)),
  ])

  const common = {
    id: a.id, title: a.title,
    description: toSafeHtml(a.description), requirements: toSafeHtml(a.requirements),
    subject: a.subject, classId: a.classId, dueDate: a.dueDate.toISOString(),
    createdByUid: a.createdByUid, createdByName: names.get(a.createdByUid) ?? null,
    createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
    marksEnabled: a.marksEnabled, maxMarks: a.maxMarks,
    attachmentCount: attachments.length, attachments,
  }

  if (own) {
    const mineRow = (a.submissions as SubmissionRow[])[0]
    const mine = toStudentSubmission(mineRow, a.marksEnabled)
    const views = a.views as Array<{ firstViewedAt: Date }>
    return {
      ...common,
      mine,
      myStatus: statusOf(mineRow),
      myState: studentAssignmentState({ dueDate: a.dueDate, submission: mineRow ?? null }),
      viewedAt: views[0]?.firstViewedAt?.toISOString() ?? null,
      submissions: mine ? [mine] : [],
    }
  }

  const roster = await activeRoster(classId)
  const subs = a.submissions as Array<{ studentId: string; status: string; marks: number | null }>
  const views = a.views as Array<{ studentId: string }>
  return {
    ...common,
    canManage: await canManage(viewer, classId, a.subject),
    stats: buildStats(new Set(roster.map((s) => s.id)), subs, views.map((v) => v.studentId)),
  }
}

/**
 * A student opened the assignment. ONE row per (assignment, student); firstViewedAt
 * is set once. viewCount counts VISITS: re-opening within VIEW_VISIT_WINDOW does not
 * count, so React re-renders, retries, double taps and refetches cannot inflate it.
 * Done as a single atomic upsert (no read-then-write race).
 */
const VIEW_VISIT_WINDOW_MINUTES = 30
export async function recordView(classId: string, assignmentId: string, viewer: AssignmentViewer): Promise<{ viewedAt: string }> {
  if (viewer.role !== 'student') throw forbidden('Only students record views.')
  const scope = await findVisible(classId, viewer)
  const own = await ownStudent(viewer, classId)
  if (!own) throw forbidden('You are not in this class.')
  const a = await prisma.assignment.findFirst({ where: { AND: [{ id: assignmentId }, { classId }, scope] }, select: { id: true } })
  if (!a) throw notFound()

  const rows = await prisma.$queryRaw<Array<{ firstViewedAt: Date }>>`
    INSERT INTO "assignment_views" ("id", "assignmentId", "studentId", "firstViewedAt", "lastViewedAt", "viewCount")
    VALUES (${randomUUID()}, ${assignmentId}, ${own.id}, NOW(), NOW(), 1)
    ON CONFLICT ("assignmentId", "studentId") DO UPDATE SET
      "viewCount" = CASE
        WHEN "assignment_views"."lastViewedAt" < NOW() - make_interval(mins => ${VIEW_VISIT_WINDOW_MINUTES})
        THEN "assignment_views"."viewCount" + 1 ELSE "assignment_views"."viewCount" END,
      "lastViewedAt" = CASE
        WHEN "assignment_views"."lastViewedAt" < NOW() - make_interval(mins => ${VIEW_VISIT_WINDOW_MINUTES})
        THEN NOW() ELSE "assignment_views"."lastViewedAt" END
    RETURNING "firstViewedAt"`
  const row = rows[0]
  if (!row) throw new Error('Failed to record assignment view.')
  return { viewedAt: row.firstViewedAt.toISOString() }
}

// ─────────────────────────────────────────────────────────
//  ROSTER (teacher: the whole class against one assignment)
// ─────────────────────────────────────────────────────────

function toRosterRow(
  st: { id: string; firstName: string; lastName: string; registrationNo: string },
  view: { firstViewedAt: Date; lastViewedAt: Date; viewCount: number } | undefined,
  sub: SubmissionRow | undefined,
): ApiAssignmentRosterRow {
  const real = sub && sub.status !== 'MISSING' ? sub : undefined
  return {
    studentId: st.id, firstName: st.firstName, lastName: st.lastName, registrationNo: st.registrationNo,
    viewedAt: view?.firstViewedAt.toISOString() ?? null,
    lastViewedAt: view?.lastViewedAt.toISOString() ?? null,
    viewCount: view?.viewCount ?? 0,
    status: statusOf(sub),
    submittedAt: real ? real.submittedAt.toISOString() : null,
    hasFile: !!real?.fileKey,
    fileName: real?.fileName ?? null,
    note: real?.note ?? null,
    recordedByTeacher: !!sub?.recordedByUid,
    marks: real?.marks ?? null,
    feedback: real?.feedback ?? null,
    markedAt: real?.markedAt?.toISOString() ?? null,
    updatedAt: sub ? sub.updatedAt.toISOString() : null,
  }
}

export async function getRoster(classId: string, assignmentId: string, viewer: AssignmentViewer): Promise<ApiAssignmentRoster> {
  if (viewer.role === 'student') throw forbidden('Students cannot see the class list.')
  const scope = await findVisible(classId, viewer)

  const a = await prisma.assignment.findFirst({
    where: { AND: [{ id: assignmentId }, { classId }, scope] },
    select: {
      id: true, title: true, subject: true, dueDate: true, createdAt: true, marksEnabled: true, maxMarks: true,
      submissions: { select: SUBMISSION_SELECT },
      views: { select: { studentId: true, firstViewedAt: true, lastViewedAt: true, viewCount: true } },
    },
  })
  if (!a) throw notFound()

  const roster = await activeRoster(classId)
  const subByStudent = new Map(a.submissions.map((s) => [s.studentId, s]))
  const viewByStudent = new Map(a.views.map((v) => [v.studentId, v]))
  const rows = roster.map((st) => toRosterRow(st, viewByStudent.get(st.id), subByStudent.get(st.id)))

  return {
    assignment: {
      id: a.id, title: a.title, subject: a.subject, dueDate: a.dueDate.toISOString(),
      postedAt: a.createdAt.toISOString(),
      marksEnabled: a.marksEnabled, maxMarks: a.maxMarks,
      canManage: await canManage(viewer, classId, a.subject),
    },
    stats: buildStats(new Set(roster.map((s) => s.id)), a.submissions, a.views.map((v) => v.studentId)),
    rows,
  }
}

// ─────────────────────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────────────────────

export async function createAssignment(
  classId:   string,
  data:      CreateAssignmentInput,
  actorUid:  string,
  actorRole: UserRole,
) {
  const subject = data.subject.trim()
  await assertCanCreateForSubject(classId, subject, actorUid)

  if (data.dueDate < todayInSchool()) throw fail('The due date cannot be in the past.', 400)

  const description = toSafeHtml(data.description)
  const requirements = toSafeHtml(data.requirements)
  if (!description) throw fail('Write the assignment content.', 400)

  // Double-post guard (double click / client retry after a timeout).
  const dup = await prisma.assignment.findFirst({
    where: { classId, subject, createdByUid: actorUid, title: data.title.trim(), createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } },
    select: { id: true },
  })
  if (dup) throw fail('This assignment was just posted. Refresh the list instead of posting it again.', 409)

  await Promise.all([verifyEmbeddedImages(description), verifyEmbeddedImages(requirements)])
  const attachments = await verifyNewAttachments(data.attachments.map((a) => a.fileKey))

  let assignment
  try {
    assignment = await prisma.assignment.create({
      data: {
        title: data.title.trim(), description, requirements, subject,
        dueDate: endOfSchoolDay(data.dueDate),
        classId, createdByUid: actorUid,
        marksEnabled: data.marksEnabled,
        maxMarks: data.marksEnabled ? (data.maxMarks ?? null) : null,
        attachments: {
          create: attachments.map((f) => ({
            fileKey: f.fileKey, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, kind: f.kind, uploadedByUid: actorUid,
          })),
        },
      },
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw fail('One of the files is already used by another assignment. Please upload it again.', 409)
    throw err
  }

  await auditService.log({
    action: 'assignment.created', entityType: 'Assignment', entityId: assignment.id, actorUid, actorRole,
    metadata: { after: { classId, subject, dueDate: assignment.dueDate.toISOString(), marksEnabled: assignment.marksEnabled, attachments: attachments.length } },
  })

  await alertClassStudents(classId, {
    assignmentId: assignment.id,
    title: `New ${subject} assignment`,
    body: `${assignment.title} \u2014 due ${data.dueDate}`,
    dedupeKey: `assignment_${assignment.id}_posted`,
  })

  return assignment
}

// ─────────────────────────────────────────────────────────
//  UPDATE / DELETE (teacher)
// ─────────────────────────────────────────────────────────

async function loadManaged(classId: string, assignmentId: string, viewer: AssignmentViewer) {
  const a = await prisma.assignment.findFirst({
    where:   { id: assignmentId, classId },
    include: { attachments: true },
  })
  if (!a) throw notFound()
  if (!(await canManage(viewer, classId, a.subject))) {
    throw forbidden(`Only the teacher assigned to ${a.subject} in this class, or the class teacher, can change this assignment.`)
  }
  return a
}

export async function updateAssignment(
  classId: string,
  assignmentId: string,
  data: UpdateAssignmentInput,
  viewer: AssignmentViewer,
) {
  const a = await loadManaged(classId, assignmentId, viewer)

  const patch: Prisma.AssignmentUpdateInput = {}
  if (data.title !== undefined) patch.title = data.title.trim()

  let description = a.description, requirements = a.requirements
  if (data.description !== undefined) {
    description = toSafeHtml(data.description)
    if (!description) throw fail('Write the assignment content.', 400)
    patch.description = description
  }
  if (data.requirements !== undefined) {
    requirements = toSafeHtml(data.requirements)
    patch.requirements = requirements
  }

  // Pictures newly embedded by this edit must be real images; pictures that left
  // the text are cleaned up afterwards if nothing else uses them.
  const idsBefore = new Set([
    ...extractEmbeddedFileIds(a.description, FILE_PREFIX.ASSIGNMENT_IMAGE),
    ...extractEmbeddedFileIds(a.requirements, FILE_PREFIX.ASSIGNMENT_IMAGE),
  ])
  await Promise.all([verifyEmbeddedImages(description, idsBefore), verifyEmbeddedImages(requirements, idsBefore)])
  const idsAfter = new Set([
    ...extractEmbeddedFileIds(description, FILE_PREFIX.ASSIGNMENT_IMAGE),
    ...extractEmbeddedFileIds(requirements, FILE_PREFIX.ASSIGNMENT_IMAGE),
  ])
  const droppedImages = Array.from(idsBefore).filter((id) => !idsAfter.has(id))

  let dueChanged = false
  if (data.dueDate !== undefined && data.dueDate !== schoolDayOf(a.dueDate)) {
    if (data.dueDate < todayInSchool()) throw fail('The due date cannot be in the past.', 400)
    patch.dueDate = endOfSchoolDay(data.dueDate)
    dueChanged = true
  }

  const marksEnabled = data.marksEnabled ?? a.marksEnabled
  const maxMarks = marksEnabled ? (data.maxMarks !== undefined ? data.maxMarks : a.maxMarks) : null
  if (marksEnabled && !maxMarks) throw fail('Enter the total marks.', 400)
  if (marksEnabled && maxMarks) {
    const over = await prisma.assignmentSubmission.count({ where: { assignmentId, marks: { gt: maxMarks } } })
    if (over > 0) throw fail(`${over} student(s) already have more than ${maxMarks} marks. Raise the total or correct those marks first.`, 409)
  }
  patch.marksEnabled = marksEnabled
  patch.maxMarks = maxMarks

  let removedKeys: string[] = []
  if (data.attachments !== undefined) {
    const wanted = new Set(data.attachments.map((x) => x.fileKey))
    const existing = new Set(a.attachments.map((x) => x.fileKey))
    const removed = a.attachments.filter((x) => !wanted.has(x.fileKey))
    const addedKeys = Array.from(wanted).filter((k) => !existing.has(k))
    const added = await verifyNewAttachments(addedKeys)
    patch.attachments = {
      deleteMany: removed.length ? { id: { in: removed.map((x) => x.id) } } : undefined,
      create: added.map((f) => ({
        fileKey: f.fileKey, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, kind: f.kind, uploadedByUid: viewer.uid,
      })),
    }
    removedKeys = removed.map((x) => x.fileKey)
  }

  let updated
  try {
    // The "has someone else changed it since I opened it?" check and the write
    // share one transaction, so a stale save can never slip in between.
    updated = await prisma.$transaction(async (tx) => {
      if (data.expectedUpdatedAt) {
        const cur = await tx.assignment.findUnique({ where: { id: assignmentId }, select: { updatedAt: true } })
        if (!cur) throw notFound()
        if (cur.updatedAt.getTime() !== Date.parse(data.expectedUpdatedAt)) {
          throw fail('This assignment was changed by someone else while you were editing. Reload it and apply your changes again.', 409)
        }
      }
      return tx.assignment.update({ where: { id: assignmentId }, data: patch })
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw fail('One of the files is already used by another assignment. Please upload it again.', 409)
    throw err
  }

  // After the commit: remove bytes that nothing references any more.
  await deleteIfUnreferenced([...removedKeys, ...droppedImages])

  await auditService.log({
    action: 'assignment.updated', entityType: 'Assignment', entityId: assignmentId,
    actorUid: viewer.uid, actorRole: viewer.role,
    metadata: {
      before: { dueDate: a.dueDate.toISOString(), marksEnabled: a.marksEnabled, maxMarks: a.maxMarks },
      after:  { dueDate: updated.dueDate.toISOString(), marksEnabled: updated.marksEnabled, maxMarks: updated.maxMarks },
    },
  })

  if (dueChanged) {
    const day = schoolDayOf(updated.dueDate)
    // 10-minute bucket: identical concurrent requests collapse to one alert,
    // a genuine later change notifies again.
    const bucket = Math.floor(Date.now() / (10 * 60 * 1000))
    await alertClassStudents(classId, {
      assignmentId,
      title: `${a.subject} assignment updated`,
      body: `${updated.title} \u2014 new due date ${day}`,
      dedupeKey: `assignment_${assignmentId}_due_${day}_${bucket}`,
    })
  }
  return updated
}

export async function deleteAssignment(classId: string, assignmentId: string, viewer: AssignmentViewer) {
  const a = await loadManaged(classId, assignmentId, viewer)
  // A teacher's "not submitted" marker (status MISSING) is not student work: it must
  // not block deleting, but its row has to go first (the submission FK is RESTRICT,
  // which is also what protects real submissions at the database level).
  const realWork = await prisma.assignmentSubmission.count({ where: { assignmentId, status: { not: 'MISSING' } } })
  if (realWork > 0) {
    throw fail('Students have already handed in work on this assignment, so it cannot be deleted. Edit it instead.', 409)
  }
  await prisma.$transaction([
    prisma.assignmentSubmission.deleteMany({ where: { assignmentId, status: 'MISSING' } }),
    prisma.assignment.delete({ where: { id: assignmentId } }),
  ])
  const images = [
    ...extractEmbeddedFileIds(a.description, FILE_PREFIX.ASSIGNMENT_IMAGE),
    ...extractEmbeddedFileIds(a.requirements, FILE_PREFIX.ASSIGNMENT_IMAGE),
  ]
  await deleteIfUnreferenced([...a.attachments.map((x) => x.fileKey), ...images])
  await auditService.log({
    action: 'assignment.deleted', entityType: 'Assignment', entityId: assignmentId,
    actorUid: viewer.uid, actorRole: viewer.role,
    metadata: { before: { classId, subject: a.subject, dueDate: a.dueDate.toISOString() } },
  })
  return { success: true }
}

// ─────────────────────────────────────────────────────────
//  HAND IN (student)
//  Resubmission replaces the student's own hand-in until the teacher marks it or
//  records it. A teacher's "not submitted" marker (MISSING) never locks the student.
// ─────────────────────────────────────────────────────────

export async function submitAssignment(
  classId: string,
  assignmentId: string,
  viewer: AssignmentViewer,
  input: { fileId?: string | null; note?: string | null },
) {
  if (viewer.role !== 'student') throw forbidden('Only students can hand in work.')
  const own = await ownStudent(viewer, classId)
  // The student is derived from the signed-in user - never from the request.
  if (!own || own.classId !== classId) throw forbidden('You are not in this class.')
  if (own.status !== 'ACTIVE') throw forbidden('Only active students can hand in work.')
  const studentId = own.id

  const scope = await scopeForViewer(viewer, classId)
  const assignment = scope
    ? await prisma.assignment.findFirst({
        where:  { AND: [{ id: assignmentId }, { classId }, scope] },
        select: { dueDate: true },
      })
    : null
  if (!assignment) throw notFound()

  const existing = await prisma.assignmentSubmission.findUnique({
    where:  { assignmentId_studentId: { assignmentId, studentId } },
    select: SUBMISSION_SELECT,
  })
  const realExisting = existing && existing.status !== 'MISSING' ? existing : null
  if (realExisting) {
    if (realExisting.marks != null) throw fail('Your teacher has already marked this work, so it can no longer be replaced.', 409)
    if (realExisting.recordedByUid) throw fail('Your teacher has already recorded this hand-in, so it can no longer be changed.', 409)
  }

  const note = input.note?.trim() || null

  // Re-sending exactly what is already there (same file or none, same note) is a
  // no-op: it must not refresh the hand-in time, or a student re-opening an
  // on-time hand-in after the deadline would turn it into a LATE one.
  const noNewFile = !input.fileId || input.fileId === realExisting?.fileKey
  if (realExisting && noNewFile && note === (realExisting.note ?? null)) return realExisting

  let file: VerifiedFile | null = null
  if (input.fileId) {
    if (!input.fileId.startsWith(`${FILE_PREFIX.ASSIGNMENT_SUBMISSION}_`)) {
      throw fail('The file was not uploaded through the hand-in upload route.', 400)
    }
    // Re-sending the same file (e.g. editing only the note) is not a new claim.
    if (!(realExisting && realExisting.fileKey === input.fileId)) {
      if (await isReferenced(input.fileId)) throw fail('That file is already used by another hand-in. Please upload it again.', 409)
      file = await inspectUpload(input.fileId, 'SUBMISSION', { requireFresh: true })
    }
  }

  // A note-only resubmission keeps the file already handed in.
  const keepFileKey = !input.fileId && realExisting?.fileKey ? realExisting.fileKey : undefined
  const fileKey = file?.fileKey ?? input.fileId ?? keepFileKey ?? null
  const fileName = file?.fileName ?? (fileKey && fileKey === realExisting?.fileKey ? realExisting.fileName : null)
  if (!fileKey && !note) throw fail('Attach a file or write a note to hand in.', 400)

  const submittedAt = new Date()
  const status = classifyByInstant(submittedAt, assignment.dueDate)

  let submission
  try {
    submission = await prisma.assignmentSubmission.upsert({
      where:  { assignmentId_studentId: { assignmentId, studentId } },
      create: { assignmentId, studentId, fileKey, fileName, note, submittedAt, status },
      update: { fileKey, fileName, note, submittedAt, status, recordedByUid: null, marks: null, feedback: null, markedAt: null, markedByUid: null },
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw fail('That file is already used by another hand-in. Please upload it again.', 409)
    throw err
  }

  // The previous file was replaced: remove it unless something still points at it.
  if (realExisting?.fileKey && realExisting.fileKey !== fileKey) await deleteIfUnreferenced([realExisting.fileKey])

  await auditService.log({
    action: 'assignment.submitted', entityType: 'AssignmentSubmission', entityId: submission.id,
    actorUid: viewer.uid, actorRole: viewer.role,
    metadata: { after: { assignmentId, studentId, status, hasFile: !!fileKey, hasNote: !!note } },
  })
  return submission
}

// ─────────────────────────────────────────────────────────
//  MARK ONE STUDENT (teacher)
//  Teacher picks Submitted / Late submission / Not submitted. For hand-ins the
//  "submitted on" day is REQUIRED, must be a real day between posting and today,
//  and must AGREE with the choice under the one shared lateness rule, so a record
//  can never contradict its own date.
// ─────────────────────────────────────────────────────────

export async function markStudent(
  classId: string,
  assignmentId: string,
  studentId: string,
  input: MarkSubmissionInput,
  viewer: AssignmentViewer,
): Promise<ApiAssignmentRosterRow> {
  const a = await loadManaged(classId, assignmentId, viewer)

  const student = await prisma.student.findFirst({
    where:  { id: studentId, classId, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, registrationNo: true, firebaseUid: true },
  })
  if (!student) throw fail('That student is not in this class.', 404)

  const feedback = input.feedback?.trim() || null
  let submittedOn: string | null = null
  let marks: number | null = null

  if (input.status !== 'MISSING') {
    submittedOn = input.submittedOn as string // required by MarkSubmissionSchema
    const dateProblem = validateSubmittedOn(submittedOn, { postedAt: a.createdAt })
    if (dateProblem) throw fail(dateProblem, 400)
    const derived = classifyByDay(submittedOn, a.dueDate)
    if (derived !== input.status) {
      throw fail(
        derived === 'LATE'
          ? `That date is after the due date (${schoolDayOf(a.dueDate)}), so it must be recorded as a late submission.`
          : `That date is on or before the due date (${schoolDayOf(a.dueDate)}), so it cannot be recorded as late.`,
        400,
      )
    }
    if (input.marks != null) {
      if (!a.marksEnabled) throw fail('Marks are not switched on for this assignment. Edit the assignment to enable them.', 400)
      if (a.maxMarks != null && input.marks > a.maxMarks) throw fail(`Marks cannot be more than ${a.maxMarks}.`, 400)
      marks = Math.round(input.marks * 100) / 100
    }
  }

  let before: SubmissionRow | null = null
  let saved: SubmissionRow
  try {
    ;({ before, saved } = await prisma.$transaction(async (tx) => {
      const existing = await tx.assignmentSubmission.findUnique({
        where:  { assignmentId_studentId: { assignmentId, studentId } },
        select: SUBMISSION_SELECT,
      })
      // Stale-save guard: null = "I saw no record", string = "I saw this version".
      if (input.expectedUpdatedAt !== undefined) {
        const stale = input.expectedUpdatedAt === null
          ? !!existing
          : !existing || existing.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt)
        if (stale) throw fail('This student\u2019s record changed while you were editing it. Reload the class list and try again.', 409)
      }
      const real = existing && existing.status !== 'MISSING' ? existing : null

      if (input.status === 'MISSING') {
        if (real && !real.recordedByUid) {
          throw fail('This student handed the work in themselves, so it cannot be marked as not submitted.', 409)
        }
        const s = await tx.assignmentSubmission.upsert({
          where:  { assignmentId_studentId: { assignmentId, studentId } },
          create: { assignmentId, studentId, status: 'MISSING', recordedByUid: viewer.uid, feedback },
          update: { status: 'MISSING', fileKey: null, fileName: null, note: null, recordedByUid: viewer.uid, marks: null, markedAt: null, markedByUid: null, feedback },
          select: SUBMISSION_SELECT,
        })
        return { before: existing, saved: s }
      }

      // Keep the student's exact hand-in instant when the teacher only marks it
      // (same calendar day); a different day is the teacher deliberately recording
      // a date and is flagged as teacher-recorded.
      const sameDay = !!real && schoolDayOf(real.submittedAt) === submittedOn
      const when = sameDay ? real!.submittedAt : noonOfSchoolDay(submittedOn as string)
      const recordedBy = sameDay ? (real!.recordedByUid ?? null) : viewer.uid
      const markFields = marks != null
        ? { marks, markedAt: new Date(), markedByUid: viewer.uid }
        : { marks: null, markedAt: null, markedByUid: null }
      const s = await tx.assignmentSubmission.upsert({
        where:  { assignmentId_studentId: { assignmentId, studentId } },
        create: { assignmentId, studentId, status: input.status, submittedAt: when, recordedByUid: recordedBy, feedback, ...markFields },
        update: { status: input.status, submittedAt: when, recordedByUid: recordedBy, feedback, ...markFields },
        select: SUBMISSION_SELECT,
      })
      return { before: existing, saved: s }
    }))
  } catch (err) {
    if (isUniqueViolation(err)) throw fail('This record was changed at the same moment. Reload the class list and try again.', 409)
    throw err
  }

  await auditService.log({
    action: 'assignment.student_marked', entityType: 'AssignmentSubmission', entityId: `${assignmentId}:${studentId}`,
    actorUid: viewer.uid, actorRole: viewer.role,
    metadata: {
      before: before ? { status: before.status, submittedOn: schoolDayOf(before.submittedAt), marks: before.marks } : undefined,
      after:  { assignmentId, studentId, status: saved.status, submittedOn, marks },
    },
  })

  // Tell the student about a NEW or CHANGED mark (idempotent per mark value).
  if (a.marksEnabled && marks != null && marks !== (before?.marks ?? null) && student.firebaseUid) {
    await alertUids([student.firebaseUid], {
      classId, assignmentId, type: 'SUCCESS',
      title: `${a.subject}: your work was marked`,
      body: `${a.title} \u2014 ${marks}${a.maxMarks ? ` / ${a.maxMarks}` : ''}`,
      dedupeKey: `assignment_${assignmentId}_mark_${studentId}_${String(marks).replace('.', 'p')}`,
    })
  }

  const view = await prisma.assignmentView.findUnique({
    where:  { assignmentId_studentId: { assignmentId, studentId } },
    select: { firstViewedAt: true, lastViewedAt: true, viewCount: true },
  })
  return toRosterRow(student, view ?? undefined, saved)
}

// ─────────────────────────────────────────────────────────
//  FILE ACCESS
// ─────────────────────────────────────────────────────────

/**
 * The storage id behind one student's hand-in, after authorisation: the student
 * themself, or staff who both hold a role allowed to read hand-ins and have the
 * class/subject relationship. Clients never receive the id in list payloads.
 */
export async function getSubmissionFileId(
  classId: string,
  assignmentId: string,
  studentId: string,
  viewer: AssignmentViewer,
): Promise<string> {
  const scope = await findVisible(classId, viewer)
  if (viewer.role === 'student') {
    const own = await ownStudent(viewer, classId)
    if (!own || own.id !== studentId) throw forbidden('You can only open your own hand-in.')
  } else if (!viewer.superUser && !SUBMISSION_FILE_STAFF.has(viewer.role)) {
    throw forbidden('Your role cannot open students\u2019 files.')
  }
  const sub = await prisma.assignmentSubmission.findFirst({
    where:  { assignmentId, studentId, assignment: { is: { AND: [{ id: assignmentId }, { classId }, scope] } } },
    select: { fileKey: true, status: true },
  })
  if (!sub?.fileKey || sub.status === 'MISSING') throw fail('There is no file to open.', 404)
  return sub.fileKey
}

/**
 * canReadFile() in lib/storage.ts is only a ROLE gate. For assignment material
 * the viewer must also belong to the class / teach the subject; this is called by
 * the /api/files proxy for EVERY role (not only students).
 */
export async function canAccessAssignmentFile(fileId: string, viewer: AssignmentViewer): Promise<boolean> {
  const adminLike = viewer.superUser === true || viewer.role === 'admin'

  if (fileId.startsWith(`${FILE_PREFIX.ASSIGNMENT_FILE}_`) || fileId.startsWith(`${FILE_PREFIX.ASSIGNMENT_IMAGE}_`)) {
    const scope = await scopeForViewer(viewer)
    if (!scope) return false
    const hit = await prisma.assignment.findFirst({
      where:  { AND: [{ attachments: { some: { fileKey: fileId } } }, scope] },
      select: { id: true },
    })
    return !!hit || adminLike
  }

  if (fileId.startsWith(`${FILE_PREFIX.ASSIGNMENT_SUBMISSION}_`)) {
    if (viewer.role === 'student') {
      const own = await ownStudent(viewer)
      if (!own) return false
      return !!(await prisma.assignmentSubmission.findFirst({ where: { fileKey: fileId, studentId: own.id }, select: { id: true } }))
    }
    if (!adminLike && !SUBMISSION_FILE_STAFF.has(viewer.role)) return false
    const scope = await scopeForViewer(viewer)
    if (!scope) return false
    const hit = await prisma.assignmentSubmission.findFirst({
      where:  { fileKey: fileId, assignment: { is: scope } },
      select: { id: true },
    })
    return !!hit || adminLike
  }

  return true
}
