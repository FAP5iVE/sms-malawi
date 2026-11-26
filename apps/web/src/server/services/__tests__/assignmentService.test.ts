/**
 * assignmentService.test.ts
 * Runs the REAL assignmentService against an in-memory Prisma double that evaluates
 * the where-clauses the service generates (see fakeAssignmentDb.ts). Covers who may
 * see / change what, the marking and hand-in rules, file claims, view tracking and
 * what each payload does and does not reveal. Storage, push, audit and the feed are
 * mocked; the HTML sanitizer is mocked as a pass-through (sanitize-html itself is
 * covered separately), so these tests do not claim anything about sanitisation.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { endOfSchoolDay, schoolDayOf } from '@shared/utils/assignment'
import { createFakeDb } from './fakeAssignmentDb'
import type { Seed } from './fakeAssignmentDb'

const mocks = vi.hoisted(() => ({
  state: { prisma: {} as Record<string, unknown> },
  audit: { log: vi.fn(async (..._args: unknown[]) => undefined) },
  feed: { pushToManyFeedsOnce: vi.fn(async (uids: string[], _item: unknown, _key: string) => uids) },
  push: { sendToUser: vi.fn(async () => undefined) },
  storage: {
    FILE_PREFIX: {
      ASSIGNMENT_FILE: 'assignment_file',
      ASSIGNMENT_IMAGE: 'assignment_image',
      ASSIGNMENT_SUBMISSION: 'assignment_submission',
    },
    getPublicUrlPrefix: vi.fn(() => 'https://cdn.example/assignment_image_'),
    deleteFile: vi.fn(async () => undefined),
    getFileMetadata: vi.fn(),
    getPublicViewUrl: vi.fn(async (id: string) => `https://cdn.example/${id}`),
    getSignedViewUrl: vi.fn(async (id: string) => `/api/files/${id}`),
  },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: (_t: unknown, k: string) => mocks.state.prisma[k] }),
}))
vi.mock('@/server/services/auditService', () => mocks.audit)
vi.mock('@/server/services/notificationFeedService', () => mocks.feed)
vi.mock('@/lib/push', () => mocks.push)
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/storage', () => mocks.storage)
vi.mock('@/server/lib/sanitizeRichText', () => ({ sanitizeRichText: (html: string) => html }))

import type { AssignmentViewer } from '../assignmentService'
import type { CreateAssignmentInput } from '@shared/schemas/student'

let svc: typeof import('../assignmentService')
beforeAll(async () => {
  svc = await import('../assignmentService')
})

const DAY = 86_400_000
const ymd = (offsetDays: number) => schoolDayOf(new Date(Date.now() + offsetDays * DAY))
const dueEnd = (offsetDays: number) => endOfSchoolDay(ymd(offsetDays))

// ── people ──
const STUDENT_A = { uid: 'u_s1', role: 'student' as const } // s1, class A
const STUDENT_A2 = { uid: 'u_s2', role: 'student' as const } // s2, class A
const STUDENT_B = { uid: 'u_s3', role: 'student' as const } // s3, class B
const MATH_TEACHER = { uid: 't_math', role: 'academic' as const } // teaches Mathematics in A
const ENG_TEACHER = { uid: 't_eng', role: 'academic' as const }
const CLASS_TEACHER_A = { uid: 't_class', role: 'academic' as const }
const OTHER_TEACHER = { uid: 't_other', role: 'academic' as const } // teaches nothing in A
const ADMIN = { uid: 'u_admin', role: 'admin' as const }
const HIGH_RANK = { uid: 'u_hr', role: 'high_rank' as const }
const EXAM_OFFICER = { uid: 'u_exam', role: 'exam_officer' as const }
const FINANCE = { uid: 'u_fin', role: 'finance' as const }

function seed(over: Partial<Seed> = {}): Seed {
  return {
    classes: [
      { id: 'A', teacherId: 't_class', academicYear: '2026' },
      { id: 'B', teacherId: 't_b', academicYear: '2026' },
    ],
    csa: [
      { classId: 'A', subject: 'Mathematics', teacherUid: 't_math', academicYear: '2026' },
      { classId: 'A', subject: 'English', teacherUid: 't_eng', academicYear: '2026' },
      { classId: 'A', subject: 'Biology', teacherUid: 't_math', academicYear: '2026' },
      { classId: 'B', subject: 'Mathematics', teacherUid: 't_b', academicYear: '2026' },
    ],
    students: [
      {
        id: 's1',
        firebaseUid: 'u_s1',
        classId: 'A',
        status: 'ACTIVE',
        firstName: 'Ada',
        lastName: 'Banda',
        registrationNo: 'R1',
      },
      {
        id: 's2',
        firebaseUid: 'u_s2',
        classId: 'A',
        status: 'ACTIVE',
        firstName: 'Ben',
        lastName: 'Chirwa',
        registrationNo: 'R2',
      },
      {
        id: 's3',
        firebaseUid: 'u_s3',
        classId: 'B',
        status: 'ACTIVE',
        firstName: 'Cleo',
        lastName: 'Dube',
        registrationNo: 'R3',
      },
      {
        id: 's4',
        firebaseUid: 'u_s4',
        classId: 'A',
        status: 'SUSPENDED',
        firstName: 'Dan',
        lastName: 'Eze',
        registrationNo: 'R4',
      },
    ],
    assignments: [
      {
        id: 'a_math',
        classId: 'A',
        subject: 'Mathematics',
        title: 'Algebra',
        description: '<p>Solve</p>',
        requirements: null,
        dueDate: dueEnd(1),
        createdByUid: 't_math',
        createdAt: new Date(Date.now() - 3 * DAY),
        updatedAt: new Date(Date.now() - 2 * DAY),
        marksEnabled: true,
        maxMarks: 20,
      },
      {
        id: 'a_eng',
        classId: 'A',
        subject: 'English',
        title: 'Essay',
        description: 'Plain text\nwith 5 < 6 & more',
        requirements: null,
        dueDate: dueEnd(-2),
        createdByUid: 't_eng',
        createdAt: new Date(Date.now() - 6 * DAY),
        updatedAt: new Date(Date.now() - 5 * DAY),
        marksEnabled: false,
        maxMarks: null,
      },
      {
        id: 'a_b',
        classId: 'B',
        subject: 'Mathematics',
        title: 'Class B work',
        description: '<p>B</p>',
        requirements: null,
        dueDate: dueEnd(1),
        createdByUid: 't_b',
        createdAt: new Date(Date.now() - 3 * DAY),
        updatedAt: new Date(Date.now() - 2 * DAY),
        marksEnabled: false,
        maxMarks: null,
      },
    ],
    ...over,
  }
}
function use(over: Partial<Seed> = {}) {
  const fake = createFakeDb(seed(over))
  mocks.state.prisma = fake.prisma
  return fake
}
beforeEach(() => {
  for (const m of [
    mocks.audit.log,
    mocks.feed.pushToManyFeedsOnce,
    mocks.push.sendToUser,
    mocks.storage.deleteFile,
    mocks.storage.getFileMetadata,
  ])
    m.mockClear()
  mocks.feed.pushToManyFeedsOnce.mockImplementation(async (uids: string[]) => uids)
  use()
})

const status = (n: number) => ({ status: n })

// ═════════════════════════════════════════════════════════════════════════════
describe('who can SEE assignments (scopeForViewer, applied to list and detail)', () => {
  it('a student sees only their own class, never another class', async () => {
    const mine = await svc.listForViewer('A', STUDENT_A)
    expect(mine.map((a) => a.id).sort()).toEqual(['a_eng', 'a_math'])
    await expect(svc.listForViewer('B', STUDENT_A)).rejects.toMatchObject(status(403))
    await expect(svc.getDetail('B', 'a_b', STUDENT_A)).rejects.toMatchObject(status(403))
  })
  it("a student cannot read another class's assignment by id even through their own class route", async () => {
    await expect(svc.getDetail('A', 'a_b', STUDENT_A)).rejects.toMatchObject(status(404))
  })
  it('a student does not see a subject that has no teacher assigned', async () => {
    use({ csa: seed().csa.filter((r) => r.subject !== 'English') })
    const ids = (await svc.listForViewer('A', STUDENT_A)).map((a) => a.id)
    expect(ids).toEqual(['a_math'])
  })
  it('a subject teacher sees only their subject; the class teacher sees every subject of their class', async () => {
    expect((await svc.listForViewer('A', MATH_TEACHER)).map((a) => a.id)).toEqual(['a_math'])
    expect((await svc.listForViewer('A', CLASS_TEACHER_A)).map((a) => a.id).sort()).toEqual([
      'a_eng',
      'a_math',
    ])
  })
  it('a teacher with no relationship to the class is refused', async () => {
    await expect(svc.listForViewer('A', OTHER_TEACHER)).rejects.toMatchObject(status(403))
    await expect(svc.getDetail('A', 'a_math', OTHER_TEACHER)).rejects.toMatchObject(status(403))
    await expect(svc.getRoster('A', 'a_math', OTHER_TEACHER)).rejects.toMatchObject(status(403))
  })
  it('a teacher of class B cannot see class A', async () => {
    await expect(svc.listForViewer('A', { uid: 't_b', role: 'academic' })).rejects.toMatchObject(
      status(403)
    )
  })
  it('admin, high_rank and exam_officer may read; other roles may not', async () => {
    for (const v of [ADMIN, HIGH_RANK, EXAM_OFFICER])
      expect((await svc.listForViewer('A', v)).length).toBe(2)
    await expect(svc.listForViewer('A', FINANCE)).rejects.toMatchObject(status(403))
  })
  it('a student can never open the class list', async () => {
    await expect(svc.getRoster('A', 'a_math', STUDENT_A)).rejects.toMatchObject(status(403))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('who can CHANGE things (server-side, not just hidden buttons)', () => {
  const edit = { title: 'New title' }
  const mark = { status: 'SUBMITTED' as const, submittedOn: ymd(0), expectedUpdatedAt: null }

  it('read-only roles cannot edit, delete or mark - even calling the service directly', async () => {
    const readOnly: AssignmentViewer[] = [ADMIN, HIGH_RANK, EXAM_OFFICER, FINANCE, STUDENT_A]
    for (const v of readOnly) {
      await expect(svc.updateAssignment('A', 'a_math', edit, v)).rejects.toMatchObject(status(403))
      await expect(svc.deleteAssignment('A', 'a_math', v)).rejects.toMatchObject(status(403))
      await expect(svc.markStudent('A', 'a_math', 's1', mark, v)).rejects.toMatchObject(status(403))
    }
  })
  it('a read-only ROLE stays read-only even when that person is also assigned as class/subject teacher', async () => {
    // e.g. a head teacher (high_rank) who also takes class A, or an exam officer who teaches Mathematics.
    const headWhoTeaches: AssignmentViewer = { uid: 't_class', role: 'high_rank' } // is class A's teacher
    const examOfficerWhoTeaches: AssignmentViewer = { uid: 't_math', role: 'exam_officer' } // teaches Mathematics in A
    for (const v of [headWhoTeaches, examOfficerWhoTeaches]) {
      await expect(svc.updateAssignment('A', 'a_math', edit, v)).rejects.toMatchObject(status(403))
      await expect(svc.deleteAssignment('A', 'a_math', v)).rejects.toMatchObject(status(403))
      await expect(svc.markStudent('A', 'a_math', 's1', mark, v)).rejects.toMatchObject(status(403))
      // ...and may still READ
      expect((await svc.listForViewer('A', v)).length).toBeGreaterThan(0)
    }
  })
  it('a subject teacher manages their subject but not another subject of the same class', async () => {
    await expect(svc.updateAssignment('A', 'a_math', edit, MATH_TEACHER)).resolves.toBeTruthy()
    await expect(svc.updateAssignment('A', 'a_eng', edit, MATH_TEACHER)).rejects.toMatchObject(
      status(403)
    )
    await expect(
      svc.markStudent('A', 'a_eng', 's1', { status: 'LATE', submittedOn: ymd(-1) }, MATH_TEACHER)
    ).rejects.toMatchObject(status(403))
  })
  it('the class teacher manages every subject of their class', async () => {
    await expect(svc.updateAssignment('A', 'a_eng', edit, CLASS_TEACHER_A)).resolves.toBeTruthy()
  })
  it('the class teacher can still manage work whose subject-teacher row was later removed', async () => {
    use({ csa: seed().csa.filter((r) => r.subject !== 'English') })
    await expect(svc.updateAssignment('A', 'a_eng', edit, CLASS_TEACHER_A)).resolves.toBeTruthy()
  })
  it('an unrelated teacher cannot change anything, and the assignment id must belong to the class in the URL', async () => {
    await expect(svc.updateAssignment('A', 'a_math', edit, OTHER_TEACHER)).rejects.toMatchObject(
      status(403)
    )
    await expect(svc.updateAssignment('A', 'a_b', edit, MATH_TEACHER)).rejects.toMatchObject(
      status(404)
    )
    await expect(svc.deleteAssignment('B', 'a_math', MATH_TEACHER)).rejects.toMatchObject(
      status(404)
    )
  })
  it('only the subject teacher / class teacher may attach files in a class', async () => {
    await expect(svc.assertCanPostInClass('A', MATH_TEACHER)).resolves.toBeUndefined()
    await expect(svc.assertCanPostInClass('A', CLASS_TEACHER_A)).resolves.toBeUndefined()
    await expect(svc.assertCanPostInClass('A', OTHER_TEACHER)).rejects.toMatchObject(status(403))
    await expect(svc.assertCanPostInClass('A', ADMIN)).rejects.toMatchObject(status(403))
    await expect(svc.assertCanPostInClass('A', STUDENT_A)).rejects.toMatchObject(status(403))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('marking one student (the teacher records a hand-in)', () => {
  const T = MATH_TEACHER
  const base = { status: 'SUBMITTED' as const, expectedUpdatedAt: null }

  it('records an on-time hand-in with the date the teacher entered, flagged as teacher-recorded', async () => {
    const { db } = use()
    const row = await svc.markStudent(
      'A',
      'a_math',
      's1',
      { ...base, submittedOn: ymd(0), marks: 15 },
      T
    )
    expect(row.status).toBe('SUBMITTED')
    expect(row.recordedByTeacher).toBe(true)
    expect(row.marks).toBe(15)
    const saved = db.submissions!.find((s) => s.studentId === 's1')!
    expect(schoolDayOf(saved.submittedAt)).toBe(ymd(0))
    expect(saved.recordedByUid).toBe('t_math')
    expect(saved.markedByUid).toBe('t_math')
  })

  it('the chosen status must agree with the date under the shared lateness rule', async () => {
    // a_eng is due 2 days ago
    await expect(
      svc.markStudent(
        'A',
        'a_eng',
        's1',
        { ...base, status: 'SUBMITTED', submittedOn: ymd(-1) },
        ENG_TEACHER
      )
    ).rejects.toMatchObject({ status: 400, message: expect.any(String) })
    await expect(
      svc.markStudent(
        'A',
        'a_eng',
        's1',
        { ...base, status: 'SUBMITTED', submittedOn: ymd(-1) },
        ENG_TEACHER
      )
    ).rejects.toThrow(/late submission/)
    await expect(
      svc.markStudent(
        'A',
        'a_eng',
        's1',
        { ...base, status: 'LATE', submittedOn: ymd(-3) },
        ENG_TEACHER
      )
    ).rejects.toThrow(/cannot be recorded as late/)
    const ok = await svc.markStudent(
      'A',
      'a_eng',
      's1',
      { ...base, status: 'LATE', submittedOn: ymd(-1) },
      ENG_TEACHER
    )
    expect(ok.status).toBe('LATE')
  })

  it('on the due day itself is on time, the day after is late', async () => {
    use({
      assignments: seed().assignments.map((a) =>
        a.id === 'a_math' ? { ...a, dueDate: dueEnd(0) } : a
      ),
    }) // due today
    const onTime = await svc.markStudent('A', 'a_math', 's1', { ...base, submittedOn: ymd(0) }, T)
    expect(onTime.status).toBe('SUBMITTED')
    use({
      assignments: seed().assignments.map((a) =>
        a.id === 'a_math' ? { ...a, dueDate: dueEnd(-1) } : a
      ),
    }) // due yesterday
    await expect(
      svc.markStudent('A', 'a_math', 's2', { ...base, status: 'SUBMITTED', submittedOn: ymd(0) }, T)
    ).rejects.toThrow(/late submission/)
    expect(
      (
        await svc.markStudent(
          'A',
          'a_math',
          's2',
          { ...base, status: 'LATE', submittedOn: ymd(0) },
          T
        )
      ).status
    ).toBe('LATE')
  })

  it('rejects a submitted-on date in the future, before the assignment was posted, or not a real date', async () => {
    await expect(
      svc.markStudent('A', 'a_math', 's1', { ...base, submittedOn: ymd(1) }, T)
    ).rejects.toThrow(/future/)
    await expect(
      svc.markStudent('A', 'a_math', 's1', { ...base, submittedOn: ymd(-4) }, T)
    ).rejects.toThrow(/before the assignment was posted/)
    await expect(
      svc.markStudent('A', 'a_math', 's1', { ...base, submittedOn: '2026-02-30' }, T)
    ).rejects.toThrow(/valid/)
  })

  it('validates marks against the configured maximum and the marks switch', async () => {
    await expect(
      svc.markStudent('A', 'a_math', 's1', { ...base, submittedOn: ymd(0), marks: 21 }, T)
    ).rejects.toThrow(/more than 20/)
    await expect(
      svc.markStudent(
        'A',
        'a_eng',
        's1',
        { ...base, status: 'LATE', submittedOn: ymd(-1), marks: 5 },
        ENG_TEACHER
      )
    ).rejects.toThrow(/not switched on/)
    const { db } = use()
    await svc.markStudent('A', 'a_math', 's1', { ...base, submittedOn: ymd(0), marks: 8.126 }, T)
    expect(db.submissions!.find((s) => s.studentId === 's1')!.marks).toBe(8.13) // rounded to 2 dp
    await svc.markStudent('A', 'a_math', 's2', { ...base, submittedOn: ymd(0), marks: 20 }, T) // the maximum itself is fine
  })

  it('a student can never be marked "not submitted" over work they handed in themselves', async () => {
    const { db } = use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          submittedAt: new Date(),
          recordedByUid: null,
          fileKey: 'assignment_submission_k1',
          updatedAt: new Date(),
        },
      ],
    })
    await expect(
      svc.markStudent(
        'A',
        'a_math',
        's1',
        { status: 'MISSING', expectedUpdatedAt: db.submissions![0]!.updatedAt.toISOString() },
        T
      )
    ).rejects.toMatchObject(status(409))
  })

  it('"not submitted" on teacher-recorded work clears it; on a fresh student it writes a marker', async () => {
    const { db } = use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          submittedAt: new Date(),
          recordedByUid: 't_math',
          marks: 9,
          markedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    const cleared = await svc.markStudent(
      'A',
      'a_math',
      's1',
      { status: 'MISSING', expectedUpdatedAt: db.submissions![0]!.updatedAt.toISOString() },
      T
    )
    expect(cleared.status).toBe('NOT_SUBMITTED')
    expect(cleared.marks).toBeNull()
    const marker = await svc.markStudent(
      'A',
      'a_math',
      's2',
      { status: 'MISSING', expectedUpdatedAt: null },
      T
    )
    expect(marker.status).toBe('NOT_SUBMITTED')
    expect(db.submissions!.find((s) => s.studentId === 's2')!.status).toBe('MISSING')
  })

  it('only students ACTIVE in this class can be recorded', async () => {
    await expect(
      svc.markStudent('A', 'a_math', 's3', { ...base, submittedOn: ymd(0) }, T)
    ).rejects.toMatchObject(status(404)) // other class
    await expect(
      svc.markStudent('A', 'a_math', 's4', { ...base, submittedOn: ymd(0) }, T)
    ).rejects.toMatchObject(status(404)) // suspended
    await expect(
      svc.markStudent('A', 'a_math', 'nobody', { ...base, submittedOn: ymd(0) }, T)
    ).rejects.toMatchObject(status(404))
  })

  it('stale saves are refused instead of overwriting (409), including "I saw no record" after a hand-in appeared', async () => {
    const t0 = new Date(Date.now() - 60_000)
    const { db } = use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          submittedAt: new Date(),
          updatedAt: t0,
        },
      ],
    })
    await expect(
      svc.markStudent(
        'A',
        'a_math',
        's1',
        {
          ...base,
          submittedOn: ymd(0),
          expectedUpdatedAt: new Date(t0.getTime() - 5000).toISOString(),
        },
        T
      )
    ).rejects.toMatchObject(status(409))
    await expect(
      svc.markStudent(
        'A',
        'a_math',
        's1',
        { ...base, submittedOn: ymd(0), expectedUpdatedAt: null },
        T
      )
    ).rejects.toMatchObject(status(409))
    const ok = await svc.markStudent(
      'A',
      'a_math',
      's1',
      { ...base, submittedOn: ymd(0), expectedUpdatedAt: t0.toISOString() },
      T
    )
    expect(ok.status).toBe('SUBMITTED')
    expect(db.submissions!.length).toBe(1) // no duplicate record
  })

  it("keeps the student's exact hand-in instant when the teacher only adds a mark on the same day", async () => {
    const handedIn = new Date()
    const { db } = use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          submittedAt: handedIn,
          recordedByUid: null,
          fileKey: 'assignment_submission_k1',
          updatedAt: new Date(Date.now() - 1000),
        },
      ],
    })
    const existing = db.submissions![0]!
    const row = await svc.markStudent(
      'A',
      'a_math',
      's1',
      {
        ...base,
        submittedOn: schoolDayOf(handedIn),
        marks: 12,
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      },
      T
    )
    const saved = db.submissions![0]!
    expect(saved.submittedAt.getTime()).toBe(handedIn.getTime()) // not replaced by noon
    expect(saved.recordedByUid).toBeNull() // still the student's own hand-in
    expect(row.recordedByTeacher).toBe(false)
    expect(row.marks).toBe(12)
  })

  it('a different day is the teacher deliberately recording a date, and is flagged as such', async () => {
    const handedIn = new Date()
    const { db } = use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          submittedAt: handedIn,
          recordedByUid: null,
          updatedAt: new Date(Date.now() - 1000),
        },
      ],
    })
    await svc.markStudent(
      'A',
      'a_math',
      's1',
      {
        ...base,
        submittedOn: ymd(-1),
        expectedUpdatedAt: db.submissions![0]!.updatedAt.toISOString(),
      },
      T
    )
    expect(schoolDayOf(db.submissions![0]!.submittedAt)).toBe(ymd(-1))
    expect(db.submissions![0]!.recordedByUid).toBe('t_math')
  })

  it('alerts the student of a NEW or CHANGED mark only - not of "not submitted" or an unchanged mark', async () => {
    const { db } = use()
    await svc.markStudent('A', 'a_math', 's1', { ...base, submittedOn: ymd(0), marks: 15 }, T)
    expect(mocks.feed.pushToManyFeedsOnce).toHaveBeenCalledTimes(1)
    const feedCall = mocks.feed.pushToManyFeedsOnce.mock.calls[0]
    expect(feedCall).toBeDefined()
    const [uids, item, key] = feedCall as unknown as [
      string[],
      { body: string; actionUrl: string },
      string,
    ]
    expect(uids).toEqual(['u_s1'])
    expect(item.body).toContain('15 / 20')
    expect(item.actionUrl).toBe('/classes/A?tab=assignments&assignment=a_math')
    expect(key).toBe('assignment_a_math_mark_s1_15')
    // saving the same mark again: no second alert
    await svc.markStudent(
      'A',
      'a_math',
      's1',
      {
        ...base,
        submittedOn: ymd(0),
        marks: 15,
        expectedUpdatedAt: db.submissions![0]!.updatedAt.toISOString(),
      },
      T
    )
    expect(mocks.feed.pushToManyFeedsOnce).toHaveBeenCalledTimes(1)
    // a marker never alerts
    await svc.markStudent('A', 'a_math', 's2', { status: 'MISSING', expectedUpdatedAt: null }, T)
    expect(mocks.feed.pushToManyFeedsOnce).toHaveBeenCalledTimes(1)
  })

  it('is audited with who did it and what changed', async () => {
    await svc.markStudent('A', 'a_math', 's1', { ...base, submittedOn: ymd(0) }, T)
    const lastAudit = mocks.audit.log.mock.calls.at(-1)
    expect(lastAudit).toBeDefined()
    const call = lastAudit?.[0] as Record<string, unknown> | undefined
    expect(call).toBeDefined()
    expect(call).toMatchObject({
      action: 'assignment.student_marked',
      actorUid: 't_math',
      actorRole: 'academic',
    })
    expect(JSON.stringify(call)).not.toContain('feedback') // no free text in the audit trail
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('student hand-in', () => {
  const goodMeta = () => ({
    name: 'work.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    createdAt: new Date(),
  })
  const FILE = 'assignment_submission_AbCdEf123456'
  beforeEach(() => {
    mocks.storage.getFileMetadata.mockImplementation(async () => goodMeta())
  })

  it('only a student of the class, who is active, can hand in', async () => {
    await expect(
      svc.submitAssignment('A', 'a_math', MATH_TEACHER, { note: 'x' })
    ).rejects.toMatchObject(status(403))
    await expect(
      svc.submitAssignment('A', 'a_math', STUDENT_B, { note: 'x' })
    ).rejects.toMatchObject(status(403))
    await expect(
      svc.submitAssignment('A', 'a_math', { uid: 'u_s4', role: 'student' }, { note: 'x' })
    ).rejects.toThrow(/active/)
  })
  it("the student is derived from the signed-in user: another student's record is never touched", async () => {
    const { db } = use()
    await svc.submitAssignment('A', 'a_math', STUDENT_A, { note: 'mine' })
    expect(db.submissions!.map((s) => s.studentId)).toEqual(['s1'])
  })
  it('classifies by the real deadline: before it is on time, after it is late', async () => {
    const { db } = use()
    await svc.submitAssignment('A', 'a_math', STUDENT_A, { note: 'on time' }) // due tomorrow
    await svc.submitAssignment('A', 'a_eng', STUDENT_A, { note: 'late' }) // due 2 days ago
    expect(db.submissions!.find((s) => s.assignmentId === 'a_math')!.status).toBe('SUBMITTED')
    expect(db.submissions!.find((s) => s.assignmentId === 'a_eng')!.status).toBe('LATE')
  })
  it('handing in on the due day itself is on time (the original bug)', async () => {
    const { db } = use({
      assignments: seed().assignments.map((a) =>
        a.id === 'a_math' ? { ...a, dueDate: dueEnd(0) } : a
      ),
    })
    await svc.submitAssignment('A', 'a_math', STUDENT_A, { note: 'today' })
    expect(db.submissions![0]!.status).toBe('SUBMITTED')
  })
  it("stores the file's name/type from storage, never from the request", async () => {
    const { db } = use()
    await svc.submitAssignment('A', 'a_math', STUDENT_A, { fileId: FILE })
    expect(db.submissions![0]).toMatchObject({ fileKey: FILE, fileName: 'work.pdf' })
    expect(mocks.storage.getFileMetadata).toHaveBeenCalledWith(FILE)
  })
  it('rejects ids that were not minted by the hand-in upload route', async () => {
    await expect(
      svc.submitAssignment('A', 'a_math', STUDENT_A, { fileId: 'assignment_file_AbCdEf123456' })
    ).rejects.toMatchObject(status(400))
    await expect(
      svc.submitAssignment('A', 'a_math', STUDENT_A, { fileId: 'payslip_AbCdEf123456' })
    ).rejects.toMatchObject(status(400))
    expect(mocks.storage.getFileMetadata).not.toHaveBeenCalled()
  })
  it('refuses a file another hand-in already uses, WITHOUT deleting it', async () => {
    use({
      submissions: [
        {
          assignmentId: 'a_eng',
          studentId: 's2',
          status: 'SUBMITTED',
          fileKey: FILE,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    await expect(
      svc.submitAssignment('A', 'a_math', STUDENT_A, { fileId: FILE })
    ).rejects.toMatchObject(status(409))
    expect(mocks.storage.deleteFile).not.toHaveBeenCalled()
  })
  it('a file that belongs to ANOTHER record is never inspected or deleted, even if it would fail the rules now', async () => {
    use({
      submissions: [
        {
          assignmentId: 'a_eng',
          studentId: 's2',
          status: 'SUBMITTED',
          fileKey: FILE,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    mocks.storage.getFileMetadata.mockImplementation(async () => ({
      ...goodMeta(),
      name: 'page.html',
      mimeType: 'text/html',
    })) // would be refused...
    await expect(
      svc.submitAssignment('A', 'a_math', STUDENT_A, { fileId: FILE })
    ).rejects.toMatchObject(status(409))
    expect(mocks.storage.getFileMetadata).not.toHaveBeenCalled() // ...but it is not even looked at
    expect(mocks.storage.deleteFile).not.toHaveBeenCalled() // and certainly not deleted
  })
  it('a student can only hand in to assignments they may see: own class, subject with a teacher', async () => {
    await expect(svc.submitAssignment('A', 'a_b', STUDENT_A, { note: 'x' })).rejects.toMatchObject(
      status(404)
    ) // class B's work via class A's route
    await expect(svc.submitAssignment('B', 'a_b', STUDENT_A, { note: 'x' })).rejects.toMatchObject(
      status(403)
    ) // class B's route
    await expect(
      svc.submitAssignment('A', 'does_not_exist', STUDENT_A, { note: 'x' })
    ).rejects.toMatchObject(status(404))
    use({ csa: seed().csa.filter((r) => r.subject !== 'English') }) // English now has no teacher
    await expect(
      svc.submitAssignment('A', 'a_eng', STUDENT_A, { note: 'x' })
    ).rejects.toMatchObject(status(404))
  })
  it('refuses disallowed, mismatched, oversized, stale and missing uploads; a refused unreferenced file is deleted', async () => {
    const reject = async (meta: object | Error, expectStatus: number, deleted: boolean) => {
      mocks.storage.deleteFile.mockClear()
      mocks.storage.getFileMetadata.mockImplementation(async () => {
        if (meta instanceof Error) throw meta
        return { ...goodMeta(), ...meta }
      })
      await expect(
        svc.submitAssignment('A', 'a_math', STUDENT_A, { fileId: FILE })
      ).rejects.toMatchObject(status(expectStatus))
      expect(mocks.storage.deleteFile).toHaveBeenCalledTimes(deleted ? 1 : 0)
    }
    await reject({ name: 'page.html', mimeType: 'text/html' }, 400, true)
    await reject({ name: 'logo.svg', mimeType: 'image/svg+xml' }, 400, true)
    await reject({ name: 'evil.pdf', mimeType: 'text/html' }, 400, true)
    await reject({ sizeBytes: 21 * 1024 * 1024 }, 400, true)
    await reject({ sizeBytes: 0 }, 400, true)
    await reject({ createdAt: new Date(Date.now() - 25 * 3_600_000) }, 400, false) // stale: refused, not deleted
    await reject(new Error('not found'), 400, false)
  })
  it('a marked or teacher-recorded hand-in is locked; a "not submitted" marker is NOT', async () => {
    use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          marks: 10,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    await expect(
      svc.submitAssignment('A', 'a_math', STUDENT_A, { note: 'again' })
    ).rejects.toMatchObject(status(409))
    use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          recordedByUid: 't_math',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    await expect(
      svc.submitAssignment('A', 'a_math', STUDENT_A, { note: 'again' })
    ).rejects.toMatchObject(status(409))
    const { db } = use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'MISSING',
          recordedByUid: 't_math',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    await svc.submitAssignment('A', 'a_math', STUDENT_A, { note: 'finally' })
    expect(db.submissions![0]).toMatchObject({
      status: 'SUBMITTED',
      recordedByUid: null,
      note: 'finally',
    })
  })
  it('re-sending exactly what is already there is a no-op (it must not turn an on-time hand-in late)', async () => {
    const original = new Date(Date.now() - 3_600_000)
    const { prisma, db } = use({
      assignments: seed().assignments.map((a) =>
        a.id === 'a_math' ? { ...a, dueDate: dueEnd(-1) } : a
      ),
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          note: 'same',
          fileKey: null,
          submittedAt: original,
          updatedAt: new Date(),
        },
      ],
    })
    await svc.submitAssignment('A', 'a_math', STUDENT_A, { note: 'same' })
    const submission = db.submissions![0]!
    expect(prisma.assignmentSubmission.upsert).not.toHaveBeenCalled()
    expect(submission).toMatchObject({ status: 'SUBMITTED' })
    expect(submission.submittedAt.getTime()).toBe(original.getTime())
  })
  it('a note-only resubmission keeps the file already handed in', async () => {
    const { db } = use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          fileKey: FILE,
          fileName: 'work.pdf',
          note: 'v1',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    await svc.submitAssignment('A', 'a_math', STUDENT_A, { note: 'v2' })
    expect(db.submissions![0]).toMatchObject({ fileKey: FILE, fileName: 'work.pdf', note: 'v2' })
    expect(mocks.storage.getFileMetadata).not.toHaveBeenCalled()
  })
  it('replacing the file removes the old stored file once nothing references it', async () => {
    use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          fileKey: 'assignment_submission_OldOldOld111',
          fileName: 'old.pdf',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    await svc.submitAssignment('A', 'a_math', STUDENT_A, { fileId: FILE })
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith('assignment_submission_OldOldOld111')
  })
  it('a concurrent claim of the same file surfaces as 409, not a 500', async () => {
    const { prisma } = use()
    prisma.assignmentSubmission.upsert.mockImplementationOnce(async () => {
      throw Object.assign(new Error('dup'), { code: 'P2002' })
    })
    await expect(
      svc.submitAssignment('A', 'a_math', STUDENT_A, { fileId: FILE })
    ).rejects.toMatchObject(status(409))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('creating an assignment', () => {
  const metaFor = (key: string) =>
    key.startsWith('assignment_image_')
      ? {
          name: 'diagram.png',
          mimeType: 'image/png',
          sizeBytes: 5000,
          createdAt: new Date(),
        }
      : {
          name: 'sheet.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 9000,
          createdAt: new Date(),
        }
  beforeEach(() => {
    mocks.storage.getFileMetadata.mockImplementation(async (id: string) => metaFor(id))
  })
  const payload = (over: Partial<CreateAssignmentInput> = {}): CreateAssignmentInput => ({
    title: 'New work',
    subject: 'Mathematics',
    dueDate: ymd(2),
    description: '<p>Do it</p>',
    requirements: undefined,
    marksEnabled: false,
    maxMarks: null,
    attachments: [],
    ...over,
  })

  it('creates the assignment, audits it and alerts only the ACTIVE students of that class', async () => {
    const { db } = use()
    const a = await svc.createAssignment('A', payload(), 't_math', 'academic')
    expect(db.assignments.some((x) => x.id === a.id && x.classId === 'A')).toBe(true)
    expect(schoolDayOf(a.dueDate)).toBe(ymd(2)) // deadline = end of that day, Malawi time
    expect(mocks.audit.log.mock.calls.at(-1)![0]).toMatchObject({
      action: 'assignment.created',
      actorUid: 't_math',
    })
    const [uids, item, key] = mocks.feed.pushToManyFeedsOnce.mock.calls[0]! as [
      string[],
      { actionUrl: string },
      string,
    ]
    expect(uids).toEqual(['u_s1', 'u_s2']) // not s3 (class B), not s4 (suspended)
    expect(key).toBe(`assignment_${a.id}_posted`)
    expect(item.actionUrl).toBe(`/classes/A?tab=assignments&assignment=${a.id}`)
    expect(mocks.push.sendToUser).toHaveBeenCalledTimes(2)
  })
  it('a retried alert never double-notifies: push goes only to items this call actually created', async () => {
    mocks.feed.pushToManyFeedsOnce.mockImplementation(async () => []) // every item already existed
    await svc.createAssignment('A', payload(), 't_math', 'academic')
    expect(mocks.push.sendToUser).not.toHaveBeenCalled()
    mocks.feed.pushToManyFeedsOnce.mockImplementation(async () => ['u_s1']) // only one was new
    await svc.createAssignment('A', payload({ title: 'Another one' }), 't_math', 'academic')
    expect(mocks.push.sendToUser).toHaveBeenCalledTimes(1)
    expect(mocks.push.sendToUser).toHaveBeenCalledWith('u_s1')
  })
  it('a failing notification never fails or rolls back the post', async () => {
    mocks.feed.pushToManyFeedsOnce.mockImplementation(async () => {
      throw new Error('firestore down')
    })
    const { db } = use()
    mocks.feed.pushToManyFeedsOnce.mockImplementation(async () => {
      throw new Error('firestore down')
    })
    await expect(svc.createAssignment('A', payload(), 't_math', 'academic')).resolves.toBeTruthy()
    expect(db.assignments.length).toBe(4)
  })
  it('only the subject teacher / class teacher can post a subject; the subject needs a teacher', async () => {
    await expect(
      svc.createAssignment('A', payload({ subject: 'English' }), 't_math', 'academic')
    ).rejects.toMatchObject(status(403))
    await expect(svc.createAssignment('A', payload(), 't_other', 'academic')).rejects.toMatchObject(
      status(403)
    )
    await expect(
      svc.createAssignment('A', payload({ subject: 'Chemistry' }), 't_class', 'academic')
    ).rejects.toMatchObject(status(409))
    await expect(
      svc.createAssignment('A', payload({ subject: 'English' }), 't_class', 'academic')
    ).resolves.toBeTruthy() // class teacher: any assigned subject
    await expect(svc.createAssignment('Z', payload(), 't_math', 'academic')).rejects.toMatchObject(
      status(404)
    )
  })
  it('refuses a past due date and an immediate duplicate post', async () => {
    await expect(
      svc.createAssignment('A', payload({ dueDate: ymd(-1) }), 't_math', 'academic')
    ).rejects.toThrow(/past/)
    await svc.createAssignment('A', payload(), 't_math', 'academic')
    await expect(svc.createAssignment('A', payload(), 't_math', 'academic')).rejects.toMatchObject(
      status(409)
    )
  })
  it('attachments are claimed from storage: name/type/size come from the stored object, kind from the id prefix', async () => {
    const { db } = use()
    const a = await svc.createAssignment(
      'A',
      payload({
        attachments: [
          { fileKey: 'assignment_file_Att000000001' },
          { fileKey: 'assignment_image_Img000000001' },
        ],
      }),
      't_math',
      'academic'
    )
    const rows = db.attachments!.filter((x) => x.assignmentId === a.id)
    expect(rows.map((r) => [r.fileKey, r.kind, r.fileName, r.uploadedByUid])).toEqual([
      ['assignment_file_Att000000001', 'FILE', 'sheet.pdf', 't_math'],
      ['assignment_image_Img000000001', 'IMAGE', 'diagram.png', 't_math'],
    ])
  })
  it('rejects forged ids, files already used elsewhere, and disallowed types', async () => {
    await expect(
      svc.createAssignment(
        'A',
        payload({ attachments: [{ fileKey: 'assignment_submission_Sub000000001' }] }),
        't_math',
        'academic'
      )
    ).rejects.toMatchObject(status(400))
    await expect(
      svc.createAssignment(
        'A',
        payload({ attachments: [{ fileKey: 'whatever' }] }),
        't_math',
        'academic'
      )
    ).rejects.toMatchObject(status(400))
    use({
      attachments: [
        {
          id: 'att0',
          assignmentId: 'a_b',
          fileKey: 'assignment_file_Att000000001',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          kind: 'FILE',
        },
      ],
    })
    await expect(
      svc.createAssignment(
        'A',
        payload({ attachments: [{ fileKey: 'assignment_file_Att000000001' }] }),
        't_math',
        'academic'
      )
    ).rejects.toMatchObject(status(409))
    mocks.storage.getFileMetadata.mockImplementation(async () => ({
      name: 'run.exe',
      mimeType: 'application/x-msdownload',
      sizeBytes: 10,
      createdAt: new Date(),
    }))
    await expect(
      svc.createAssignment(
        'A',
        payload({ attachments: [{ fileKey: 'assignment_file_Exe000000001' }] }),
        't_math',
        'academic'
      )
    ).rejects.toThrow(/not an allowed file type/)
  })
  it('an attachment id already used by another record is never inspected or deleted, even if it would fail the rules', async () => {
    use({
      attachments: [
        {
          id: 'att0',
          assignmentId: 'a_b',
          fileKey: 'assignment_file_Att000000001',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          kind: 'FILE',
        },
      ],
    })
    mocks.storage.getFileMetadata.mockImplementation(async () => ({
      name: 'page.html',
      mimeType: 'text/html',
      sizeBytes: 10,
      createdAt: new Date(),
    }))
    await expect(
      svc.createAssignment(
        'A',
        payload({ attachments: [{ fileKey: 'assignment_file_Att000000001' }] }),
        't_math',
        'academic'
      )
    ).rejects.toMatchObject(status(409))
    expect(mocks.storage.getFileMetadata).not.toHaveBeenCalled()
    expect(mocks.storage.deleteFile).not.toHaveBeenCalled()
  })
  it('pictures embedded in the text must be real images, and there is a cap', async () => {
    mocks.storage.getFileMetadata.mockImplementation(async () => ({
      name: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      createdAt: new Date(),
    }))
    const img = (id: string) =>
      `<img src="https://cdn.example/storage/buckets/school/files/${id}/view">`
    await expect(
      svc.createAssignment(
        'A',
        payload({ description: `<p>${img('assignment_image_NotAnImage001')}</p>` }),
        't_math',
        'academic'
      )
    ).rejects.toThrow(/not an allowed file type/)
    const many = Array.from({ length: 21 }, (_, i) =>
      img(`assignment_image_Many${String(i).padStart(8, '0')}`)
    ).join('')
    await expect(
      svc.createAssignment('A', payload({ description: `<p>${many}</p>` }), 't_math', 'academic')
    ).rejects.toThrow(/at most 20 pictures/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('editing and deleting', () => {
  const T = MATH_TEACHER
  const attRow = (key: string, id = 'att1') => ({
    id,
    assignmentId: 'a_math',
    fileKey: key,
    fileName: 'old.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 5,
    kind: 'FILE',
    createdAt: new Date(),
  })
  beforeEach(() => {
    mocks.storage.getFileMetadata.mockImplementation(async () => ({
      name: 'new.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      createdAt: new Date(),
    }))
  })

  it('a stale edit is refused (409); an edit based on the current version succeeds and bumps the version', async () => {
    const { db } = use()
    const loaded = db.assignments.find((a) => a.id === 'a_math')!.updatedAt
    await expect(
      svc.updateAssignment(
        'A',
        'a_math',
        { title: 'Mine', expectedUpdatedAt: new Date(loaded.getTime() - 1000).toISOString() },
        T
      )
    ).rejects.toMatchObject(status(409))
    const updated = await svc.updateAssignment(
      'A',
      'a_math',
      { title: 'Mine', expectedUpdatedAt: loaded.toISOString() },
      T
    )
    expect(updated.title).toBe('Mine')
    await expect(
      svc.updateAssignment(
        'A',
        'a_math',
        { title: 'Theirs', expectedUpdatedAt: loaded.toISOString() },
        T
      )
    ).rejects.toMatchObject(status(409)) // the second editor, same base
  })
  it('a due-date change alerts the class once per change window; an unchanged due date alerts no one', async () => {
    await svc.updateAssignment('A', 'a_math', { dueDate: ymd(4) }, T)
    const [uids, item, key] = mocks.feed.pushToManyFeedsOnce.mock.calls[0]! as [
      string[],
      { body: string },
      string,
    ]
    expect(uids).toEqual(['u_s1', 'u_s2'])
    expect(item.body).toContain(ymd(4))
    expect(key).toMatch(new RegExp(`^assignment_a_math_due_${ymd(4)}_\\d+$`))
    mocks.feed.pushToManyFeedsOnce.mockClear()
    await svc.updateAssignment('A', 'a_math', { dueDate: ymd(4), title: 'Same day' }, T) // same day now stored -> not a change
    expect(mocks.feed.pushToManyFeedsOnce).not.toHaveBeenCalled()
  })
  it('does not rewrite or "change" a legacy (midnight-UTC) due date when the day is the same', async () => {
    const legacy = new Date(`${ymd(1)}T00:00:00.000Z`)
    const { prisma } = use({
      assignments: seed().assignments.map((a) =>
        a.id === 'a_math' ? { ...a, dueDate: legacy } : a
      ),
    })
    await svc.updateAssignment('A', 'a_math', { dueDate: ymd(1), title: 'Retitled' }, T)
    expect(mocks.feed.pushToManyFeedsOnce).not.toHaveBeenCalled()
    expect('dueDate' in prisma.assignment.update.mock.calls[0][0].data).toBe(false)
  })
  it('refuses a past due date; lowering total marks below an existing mark; marks on without a total', async () => {
    await expect(svc.updateAssignment('A', 'a_math', { dueDate: ymd(-1) }, T)).rejects.toThrow(
      /past/
    )
    use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          marks: 18,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    await expect(svc.updateAssignment('A', 'a_math', { maxMarks: 10 }, T)).rejects.toMatchObject(
      status(409)
    )
    use()
    await expect(
      svc.updateAssignment('A', 'a_eng', { marksEnabled: true }, ENG_TEACHER)
    ).rejects.toThrow(/total marks/)
  })
  it('clearing the requirements stores null', async () => {
    const { db } = use({
      assignments: seed().assignments.map((a) =>
        a.id === 'a_math' ? { ...a, requirements: '<p>old</p>' } : a
      ),
    })
    await svc.updateAssignment('A', 'a_math', { requirements: '' }, T)
    expect(db.assignments.find((a) => a.id === 'a_math')!.requirements).toBeNull()
  })
  it('replaces attachments safely: new ones verified and owned, removed ones deleted from storage', async () => {
    const { db } = use({ attachments: [attRow('assignment_file_Old000000001')] })
    await svc.updateAssignment(
      'A',
      'a_math',
      { attachments: [{ fileKey: 'assignment_file_New000000001' }] },
      T
    )
    expect(db.attachments!.map((a) => a.fileKey)).toEqual(['assignment_file_New000000001'])
    expect(db.attachments![0]!.uploadedByUid).toBe('t_math')
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith('assignment_file_Old000000001')
  })
  it('keeping an attachment is not a new claim (no storage lookup, no duplicate row)', async () => {
    const { db } = use({ attachments: [attRow('assignment_file_Old000000001')] })
    await svc.updateAssignment(
      'A',
      'a_math',
      { attachments: [{ fileKey: 'assignment_file_Old000000001' }] },
      T
    )
    expect(db.attachments!.length).toBe(1)
    expect(mocks.storage.getFileMetadata).not.toHaveBeenCalled()
    expect(mocks.storage.deleteFile).not.toHaveBeenCalled()
  })
  it('a picture dropped from the text is deleted only if no other assignment still uses it', async () => {
    const IMG = 'assignment_image_ImgImgImg0001'
    const withImg = (id: string) =>
      `<p><img src="https://cdn.example/storage/buckets/school/files/${id}/view"></p>`
    const mk = (bDescription: string) =>
      seed().assignments.map((a) =>
        a.id === 'a_math'
          ? { ...a, description: withImg(IMG) }
          : a.id === 'a_b'
            ? { ...a, description: bDescription }
            : a
      )
    use({ assignments: mk(withImg(IMG)) }) // class B's work embeds the same picture
    await svc.updateAssignment('A', 'a_math', { description: '<p>no picture now</p>' }, T)
    expect(mocks.storage.deleteFile).not.toHaveBeenCalled()
    use({ assignments: mk('<p>B</p>') }) // nobody else uses it
    await svc.updateAssignment('A', 'a_math', { description: '<p>no picture now</p>' }, T)
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith(IMG)
  })

  it('delete is refused once real work exists (nothing is removed)', async () => {
    const { db } = use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'LATE',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    await expect(svc.deleteAssignment('A', 'a_math', T)).rejects.toMatchObject(status(409))
    expect(db.assignments.some((a) => a.id === 'a_math')).toBe(true)
    expect(db.submissions!.length).toBe(1)
    expect(mocks.storage.deleteFile).not.toHaveBeenCalled()
  })
  it('"not submitted" markers do not block deleting; they are removed with it, along with attachment files', async () => {
    const { db } = use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'MISSING',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      attachments: [attRow('assignment_file_Old000000001')],
    })
    await expect(svc.deleteAssignment('A', 'a_math', T)).resolves.toEqual({ success: true })
    expect(db.assignments.some((a) => a.id === 'a_math')).toBe(false)
    expect(db.submissions!.length).toBe(0)
    expect(mocks.storage.deleteFile).toHaveBeenCalledWith('assignment_file_Old000000001')
    expect(mocks.audit.log.mock.calls.at(-1)![0]).toMatchObject({ action: 'assignment.deleted' })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('file access (what the /api/files proxy asks)', () => {
  const SUB_S1 = 'assignment_submission_S1S1S1S1S1S1'
  const SUB_S2 = 'assignment_submission_S2S2S2S2S2S2'
  const ATT = 'assignment_file_Att000000001'
  beforeEach(() => {
    use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'SUBMITTED',
          fileKey: SUB_S1,
          fileName: 'one.pdf',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
        {
          assignmentId: 'a_eng',
          studentId: 's2',
          status: 'LATE',
          fileKey: SUB_S2,
          fileName: 'two.pdf',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      attachments: [
        {
          id: 'att1',
          assignmentId: 'a_math',
          fileKey: ATT,
          fileName: 'sheet.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 9,
          kind: 'FILE',
        },
      ],
    })
  })
  const can = (id: string, v: AssignmentViewer) => svc.canAccessAssignmentFile(id, v)

  it('a hand-in file: its owner, and staff with the class/subject - nobody else', async () => {
    expect(await can(SUB_S1, STUDENT_A)).toBe(true) // own
    expect(await can(SUB_S1, STUDENT_A2)).toBe(false) // classmate
    expect(await can(SUB_S1, STUDENT_B)).toBe(false) // other class
    expect(await can(SUB_S1, MATH_TEACHER)).toBe(true) // teaches that subject
    expect(await can(SUB_S1, CLASS_TEACHER_A)).toBe(true) // class teacher
    expect(await can(SUB_S1, ENG_TEACHER)).toBe(false) // teaches another subject of the same class
    expect(await can(SUB_S1, OTHER_TEACHER)).toBe(false) // unrelated teacher
    expect(await can(SUB_S1, { uid: 't_b', role: 'academic' })).toBe(false) // teacher of another class
    expect(await can(SUB_S2, MATH_TEACHER)).toBe(false) // English hand-in, Mathematics teacher
    expect(await can(SUB_S2, ENG_TEACHER)).toBe(true)
  })
  it('a hand-in file: roles outside admin/high_rank/academic are refused even with scope (exam officer, finance)', async () => {
    expect(await can(SUB_S1, EXAM_OFFICER)).toBe(false)
    expect(await can(SUB_S1, FINANCE)).toBe(false)
    expect(await can(SUB_S1, HIGH_RANK)).toBe(true)
    expect(await can(SUB_S1, ADMIN)).toBe(true)
  })
  it('a forged / unknown / unreferenced hand-in id is refused for everyone except admin', async () => {
    const forged = 'assignment_submission_ForgedForged1'
    for (const v of [STUDENT_A, MATH_TEACHER, CLASS_TEACHER_A, HIGH_RANK, EXAM_OFFICER])
      expect(await can(forged, v)).toBe(false)
  })
  it('a teacher attachment: students and teachers of THAT class/subject only', async () => {
    expect(await can(ATT, STUDENT_A)).toBe(true)
    expect(await can(ATT, STUDENT_A2)).toBe(true)
    expect(await can(ATT, STUDENT_B)).toBe(false)
    expect(await can(ATT, MATH_TEACHER)).toBe(true)
    expect(await can(ATT, ENG_TEACHER)).toBe(false)
    expect(await can(ATT, OTHER_TEACHER)).toBe(false)
    expect(await can('assignment_file_ForgedForged1', STUDENT_A)).toBe(false)
    expect(await can('assignment_file_ForgedForged1', MATH_TEACHER)).toBe(false)
  })
  it('opening one hand-in through its endpoint: self or staff, with the right role, and only if a file exists', async () => {
    await expect(svc.getSubmissionFileId('A', 'a_math', 's1', STUDENT_A)).resolves.toBe(SUB_S1)
    await expect(svc.getSubmissionFileId('A', 'a_math', 's1', MATH_TEACHER)).resolves.toBe(SUB_S1)
    await expect(svc.getSubmissionFileId('A', 'a_math', 's1', STUDENT_A2)).rejects.toMatchObject(
      status(403)
    ) // another student by changing the id
    await expect(svc.getSubmissionFileId('A', 'a_math', 's1', EXAM_OFFICER)).rejects.toMatchObject(
      status(403)
    ) // role cannot open files
    await expect(svc.getSubmissionFileId('A', 'a_math', 's1', OTHER_TEACHER)).rejects.toMatchObject(
      status(403)
    )
    await expect(svc.getSubmissionFileId('A', 'a_math', 's2', MATH_TEACHER)).rejects.toMatchObject(
      status(404)
    ) // s2 has no Mathematics file
    use({
      submissions: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          status: 'MISSING',
          fileKey: SUB_S1,
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })
    await expect(svc.getSubmissionFileId('A', 'a_math', 's1', STUDENT_A)).rejects.toMatchObject(
      status(404)
    ) // a marker is not a hand-in
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('view tracking', () => {
  it('only a student of the class can record a view; the response carries first-opened', async () => {
    const { prisma } = use()
    await expect(svc.recordView('A', 'a_math', MATH_TEACHER)).rejects.toMatchObject(status(403))
    await expect(svc.recordView('A', 'a_math', STUDENT_B)).rejects.toMatchObject(status(403))
    await expect(svc.recordView('A', 'a_b', STUDENT_A)).rejects.toMatchObject(status(404))
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
    const r = await svc.recordView('A', 'a_math', STUDENT_A)
    expect(r.viewedAt).toBe('2026-10-01T08:00:00.000Z')
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })
  it('reading the detail is a pure read: it never records a view, however often it is fetched', async () => {
    const { prisma } = use()
    await svc.getDetail('A', 'a_math', STUDENT_A)
    await svc.getDetail('A', 'a_math', STUDENT_A)
    await svc.listForViewer('A', STUDENT_A)
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })
  it('the visit-window debounce is in the single atomic statement (not a read-then-write)', async () => {
    const { prisma } = use()
    await svc.recordView('A', 'a_math', STUDENT_A)
    const sql = String(prisma.$queryRaw.mock.calls[0][0].join('?'))
    expect(sql).toMatch(/ON CONFLICT \("assignmentId", "studentId"\) DO UPDATE/)
    expect(sql).toMatch(/CASE\s+WHEN "assignment_views"\."lastViewedAt" </)
    expect(sql).toMatch(/RETURNING "firstViewedAt"/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('what each payload reveals', () => {
  const SUB = 'assignment_submission_S1S1S1S1S1S1'
  const handIn = (over: Record<string, unknown> = {}) => ({
    assignmentId: 'a_math',
    studentId: 's1',
    status: 'SUBMITTED',
    fileKey: SUB,
    fileName: 'one.pdf',
    note: 'private note',
    marks: null,
    feedback: null,
    submittedAt: new Date(),
    updatedAt: new Date(),
    ...over,
  })

  it('a student never receives a storage key, only hasFile', async () => {
    use({ submissions: [handIn()] })
    const detail = await svc.getDetail('A', 'a_math', STUDENT_A)
    expect(detail.mine).toMatchObject({ hasFile: true, fileName: 'one.pdf' })
    expect(JSON.stringify(detail)).not.toContain(SUB)
    expect(JSON.stringify(await svc.listForViewer('A', STUDENT_A))).not.toContain(SUB)
  })
  it('marks and feedback are hidden unless marks are switched on AND a mark exists', async () => {
    // marks enabled, mark entered -> visible
    use({ submissions: [handIn({ marks: 15, feedback: 'Well done', markedAt: new Date() })] })
    expect((await svc.getDetail('A', 'a_math', STUDENT_A)).mine).toMatchObject({
      marks: 15,
      feedback: 'Well done',
    })
    // marks enabled, comment but no mark yet -> comment hidden
    use({ submissions: [handIn({ marks: null, feedback: 'Draft thought' })] })
    expect((await svc.getDetail('A', 'a_math', STUDENT_A)).mine).toMatchObject({
      marks: null,
      feedback: null,
    })
    // marks switched OFF (a_eng) even though a mark is stored -> hidden
    use({
      submissions: [
        handIn({ assignmentId: 'a_eng', marks: 7, feedback: 'hidden', status: 'LATE' }),
      ],
    })
    const eng = await svc.getDetail('A', 'a_eng', STUDENT_A)
    expect(eng.mine).toMatchObject({ marks: null, feedback: null })
  })
  it("a student sees only their OWN row, never a classmate's", async () => {
    use({
      submissions: [
        handIn(),
        handIn({
          studentId: 's2',
          note: 'classmate note',
          fileKey: 'assignment_submission_S2S2S2S2S2S2',
        }),
      ],
    })
    const detail = await svc.getDetail('A', 'a_math', STUDENT_A)
    expect(detail.submissions!.map((s) => s.studentId)).toEqual(['s1'])
    expect(JSON.stringify(detail)).not.toContain('classmate note')
  })
  it('staff list payloads carry counts, never notes, files or keys; the roster carries hasFile only', async () => {
    use({ submissions: [handIn()] })
    const list = await svc.listForViewer('A', MATH_TEACHER)
    expect(JSON.stringify(list)).not.toContain(SUB)
    expect(JSON.stringify(list)).not.toContain('private note')
    const roster = await svc.getRoster('A', 'a_math', MATH_TEACHER)
    expect(JSON.stringify(roster)).not.toContain(SUB)
    expect(roster.rows.find((r) => r.studentId === 's1')).toMatchObject({
      hasFile: true,
      status: 'SUBMITTED',
      registrationNo: 'R1',
    })
  })
  it('the roster lists exactly the ACTIVE students of the class, ordered by name', async () => {
    const roster = await svc.getRoster('A', 'a_math', CLASS_TEACHER_A)
    expect(roster.rows.map((r) => r.studentId)).toEqual(['s1', 's2']) // not s3 (B), not s4 (suspended)
    expect(roster.assignment).toMatchObject({ canManage: true, marksEnabled: true, maxMarks: 20 })
  })
  it('counts ignore students outside the roster; a "not submitted" marker is not a hand-in', async () => {
    use({
      submissions: [
        handIn({ studentId: 's1', status: 'SUBMITTED', marks: 10 }),
        handIn({ studentId: 's2', status: 'MISSING', fileKey: null, marks: null }),
        handIn({ studentId: 's4', status: 'SUBMITTED' }), // suspended: not on the roster
      ],
      views: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          firstViewedAt: new Date(),
          lastViewedAt: new Date(),
          viewCount: 1,
        },
        {
          assignmentId: 'a_math',
          studentId: 's3',
          firstViewedAt: new Date(),
          lastViewedAt: new Date(),
          viewCount: 1,
        },
      ],
    })
    const stats = (await svc.getRoster('A', 'a_math', MATH_TEACHER)).stats
    expect(stats).toEqual({
      totalStudents: 2,
      viewed: 1,
      submitted: 1,
      late: 0,
      notSubmitted: 1,
      marked: 1,
    })
  })
  it("the student's state and the tab-badge input come from the shared rule", async () => {
    use({ submissions: [handIn({ assignmentId: 'a_eng', status: 'MISSING', fileKey: null })] })
    const list = await svc.listForViewer('A', STUDENT_A)
    expect(list.find((a) => a.id === 'a_math')!.myState).toBe('PENDING') // due tomorrow, nothing handed in
    expect(list.find((a) => a.id === 'a_eng')!.myState).toBe('OVERDUE') // due 2 days ago; a MISSING marker is not a hand-in
  })
  it('"New" until opened: viewedAt comes from the student\'s own view row', async () => {
    use({
      views: [
        {
          assignmentId: 'a_math',
          studentId: 's1',
          firstViewedAt: new Date('2026-10-02T09:00:00Z'),
        },
      ],
    })
    const list = await svc.listForViewer('A', STUDENT_A)
    expect(list.find((a) => a.id === 'a_math')!.viewedAt).toBe('2026-10-02T09:00:00.000Z')
    expect(list.find((a) => a.id === 'a_eng')!.viewedAt).toBeNull()
  })
  it('legacy plain-text content is shown as escaped paragraphs, never as raw markup', async () => {
    const detail = await svc.getDetail('A', 'a_eng', STUDENT_A)
    expect(detail.description).toBe('<p>Plain text<br>with 5 &lt; 6 &amp; more</p>')
  })
  it('the list is bounded and staff see canManage only where they may', async () => {
    const list = await svc.listForViewer('A', MATH_TEACHER)
    expect(list.every((a) => a.canManage === (a.subject === 'Mathematics'))).toBe(true)
    const ro = await svc.listForViewer('A', EXAM_OFFICER)
    expect(ro.every((a) => a.canManage === false)).toBe(true)
  })
})
