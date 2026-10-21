/**
 * Exam workflow reporting, run end to end against a controlled dataset.
 *
 * Term 2, two classes (Form 1A: 4 active students, Form 3B: 2):
 *   e1 Maths WEEKLY_TEST   1A  MARKS_DRAFT       2 entered + 1 absent of 4 → 1 missing; first mark 18 days ago → delayed
 *   e2 English END_TERM    1A  MARKS_FINAL       all 4 final; unlocked 20 d ago, re-finalised 6 d ago → not delayed
 *   e3 Maths END_TERM      3B  RESULTS_APPROVED  approved 10 days ago → delayed, high_rank must release
 *   e4 Science QUIZ        3B  RESULTS_RELEASED  released 3 days ago
 *   e5 Biology MIDTERM     1A  SCHEDULED         exam date 5 days ago, no teacher → stalled
 *   e6 MANEB_MSCE exam type (never listed) and e7 in term 3 (other period)
 */
import { describe, it, expect, vi } from 'vitest'
import { makeFakePrisma } from '../../../../../test/fakePrisma'

// The pipeline report reads the clock itself, so the fixtures are relative to the real now.
const NOW = new Date()
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

const c1 = { name: 'Form 1A', form: 1 }
const c3 = { name: 'Form 3B', form: 3 }
const exam = (id: string, over: Record<string, unknown>) => ({
  id, title: `Exam ${id}`, subject: 'Maths', type: 'WEEKLY_TEST', classId: 'c1', class: c1, status: 'SCHEDULED',
  date: ago(20), updatedAt: ago(1), academicYear: '2025/2026', term: 2, ...over,
})
const exams = [
  exam('e1', { subject: 'Maths', status: 'MARKS_DRAFT', date: ago(20) }),
  exam('e2', { subject: 'English', type: 'END_TERM', status: 'MARKS_FINAL', date: ago(15) }),
  exam('e3', { subject: 'Maths', type: 'END_TERM', classId: 'c3', class: c3, status: 'RESULTS_APPROVED', date: ago(30) }),
  exam('e4', { subject: 'Science', type: 'QUIZ', classId: 'c3', class: c3, status: 'RESULTS_RELEASED', date: ago(25) }),
  exam('e5', { subject: 'Biology', type: 'MIDTERM', status: 'SCHEDULED', date: ago(5) }),
  exam('e6', { subject: 'English', type: 'MANEB_MSCE', classId: 'c3', class: c3, status: 'SCHEDULED' }),
  exam('e7', { subject: 'Maths', term: 3 }),
]

const students = [
  ...['s1', 's2', 's3', 's4'].map((id) => ({ id, classId: 'c1', class: c1, status: 'ACTIVE' })),
  ...['s5', 's6'].map((id) => ({ id, classId: 'c3', class: c3, status: 'ACTIVE' })),
  { id: 's7', classId: 'c1', class: c1, status: 'ARCHIVED' },
  // Form 2 and Form 4 candidates (not on any exam above)
  ...['s8', 's9', 's10'].map((id) => ({ id, classId: 'c2', class: { name: 'Form 2A', form: 2 }, status: 'ACTIVE' })),
  { id: 's11', classId: 'c4', class: { name: 'Form 4A', form: 4 }, status: 'ACTIVE' },
]

const mark = (examId: string, studentId: string, over: Record<string, unknown> = {}) => ({
  examId, studentId, mark: 50, absent: false, isDraft: false, createdAt: ago(18), finalizedAt: null, ...over,
})
const marks = [
  mark('e1', 's1', { isDraft: true }), mark('e1', 's2', { isDraft: true }), mark('e1', 's3', { mark: null, absent: true, isDraft: true }),
  ...['s1', 's2', 's3', 's4'].map((s) => mark('e2', s, { finalizedAt: ago(6), createdAt: ago(14) })),
  ...['s5', 's6'].map((s) => mark('e3', s, { finalizedAt: ago(12), createdAt: ago(29) })),
  ...['s5', 's6'].map((s) => mark('e4', s, { finalizedAt: ago(8), createdAt: ago(24) })),
]

const audit = (action: string, entityId: string, daysAgo: number, actorUid: string, actorRole: string) => ({
  action, entityType: 'Exam', entityId, createdAt: ago(daysAgo), actorUid, actorRole,
})
const auditLogs = [
  audit('exam.marks_finalized', 'e2', 20, 't2', 'academic'),
  audit('exam.marks_unlocked', 'e2', 18, 'eo', 'exam_officer'),
  audit('exam.marks_finalized', 'e2', 6, 't2', 'academic'),
  audit('exam.marks_finalized', 'e3', 12, 't2', 'academic'),
  audit('exam.results_approved', 'e3', 10, 'eo', 'exam_officer'),
  audit('exam.marks_finalized', 'e4', 8, 't1', 'academic'),
  audit('exam.results_approved', 'e4', 5, 'eo', 'exam_officer'),
  audit('exam.results_released', 'e4', 3, 'hr1', 'high_rank'),
  { ...audit('exam.results_released', 'e1', 1, 'x', 'admin'), entityType: 'Student' }, // not an Exam entity — ignored
]

const assignments = [
  { classId: 'c1', subject: 'Maths', teacherUid: 't1', academicYear: '2025/2026' },
  { classId: 'c1', subject: 'English', teacherUid: 't2', academicYear: '2025/2026' },
  { classId: 'c3', subject: 'Maths', teacherUid: 't2', academicYear: '2025/2026' },
  { classId: 'c3', subject: 'Science', teacherUid: 't1', academicYear: '2025/2026' },
]

vi.mock('@/lib/prisma', () => ({
  prisma: makeFakePrisma({
    exam: exams,
    student: students,
    examMark: marks,
    classSubjectAssignment: assignments,
    staffProfile: [
      { uid: 't1', firstName: 'Tiyamike', lastName: 'Banda' },
      { uid: 't2', firstName: 'Mary', lastName: 'Phiri' },
      { uid: 'eo', firstName: 'Esther', lastName: 'Mwale' },
      { uid: 'hr1', firstName: 'Head', lastName: 'Teacher' },
    ],
    auditLog: auditLogs,
    manebRecord: [
      { academicYear: '2025/2026', examType: 'MSCE', status: 'REGISTERED', overallGrade: null },
      { academicYear: '2025/2026', examType: 'MSCE', status: 'RESULTS_RECEIVED', overallGrade: 'MSCE Awarded — Option A' },
      { academicYear: '2024/2025', examType: 'JCE', status: 'CERTIFIED', overallGrade: 'PASS' },
    ],
  }),
}))

vi.mock('@/server/services/classService', () => ({
  getTeacherSubjectAssignments: async (uid: string) =>
    new Set(assignments.filter((a) => a.teacherUid === uid).map((a) => `${a.classId}|${a.subject}`)),
}))

import { getExamPipeline, getExamWorkflow, getManebStatus, getMarkCompletion } from '../examAnalytics'
import { examsAwaitingMarks, examsAwaitingRelease, examsReleased } from '@/lib/examFilters'

const school = { kind: 'school' } as const
const Y = '2025/2026'

describe('exam workflow report', () => {
  it('lists exactly the term’s internal exams, never MANEB national exams', async () => {
    const w = await getExamWorkflow(Y, 2, school, {}, { audit: false }, NOW)
    expect(w.rows.map((r) => r.examId).sort()).toEqual(['e1', 'e2', 'e3', 'e4', 'e5'])
    expect(w.excludesManeb).toBe(true)
  })

  it('measures time in stage from the best record of the transition', async () => {
    const w = await getExamWorkflow(Y, 2, school, {}, { audit: false }, NOW)
    const r = (id: string) => w.rows.find((x) => x.examId === id)!
    expect(r('e1')).toMatchObject({ stageSource: 'marks', daysInStage: 18, delayed: true, owner: 'teacher' })
    expect(r('e2')).toMatchObject({ stageSource: 'audit', daysInStage: 6, delayed: false, owner: 'exam_officer', unlockCount: 1 })
    expect(r('e3')).toMatchObject({ stageSource: 'audit', daysInStage: 10, delayed: true, owner: 'high_rank', approvedAt: ago(10).toISOString() })
    expect(r('e4')).toMatchObject({ daysInStage: 3, delayed: false, owner: null, releasedAt: ago(3).toISOString() })
    expect(r('e5')).toMatchObject({ stageSource: 'exam_date', daysInStage: 5, delayed: true, owner: 'exam_officer', teacher: null })
    expect(w.approximateStageTimes).toBe(0)
  })

  it('reconciles with the mark-completion and pipeline reports', async () => {
    const w = await getExamWorkflow(Y, 2, school, {}, { audit: false }, NOW)
    const completion = await getMarkCompletion(Y, 2, school)
    const pipeline = await getExamPipeline(Y, 2, school)
    expect(w.totals).toMatchObject({ exams: completion.totals.exams, expected: completion.totals.expected, entered: completion.totals.entered, absent: completion.totals.absent, missing: completion.totals.missing, completionRate: completion.totals.completionRate })
    expect(w.stages.map((s) => [s.key, s.count])).toEqual(pipeline.stages.map((s) => [s.key, s.count]))
    expect(w.stages.reduce((t, s) => t + s.count, 0)).toBe(w.totals.exams)
    expect(w.totals.released).toBe(pipeline.stages.find((s) => s.key === 'RESULTS_RELEASED')!.count)
    // Hand-checked: expected 4+4+2+2+4 = 16, entered 2+4+2+2+0 = 10 (+1 absent), missing 5 (1 + 4 for e5)
    expect(w.totals).toMatchObject({ expected: 16, entered: 10, absent: 1, missing: 5 })
  })

  it('the pipeline’s days waiting come from the audit trail, not Exam.updatedAt', async () => {
    const pipeline = await getExamPipeline(Y, 2, school)
    const wait = (id: string) => pipeline.blockers.find((b) => b.examId === id)?.daysWaiting
    expect(wait('e3')).toBe(10)
    expect(wait('e2')).toBe(6)
  })

  it('groups outstanding work by owner, class, subject and teacher', async () => {
    const w = await getExamWorkflow(Y, 2, school, {}, { audit: false }, NOW)
    expect(w.byOwner).toEqual([
      { owner: 'teacher', exams: 1, delayed: 1, marksMissing: 1, oldestDays: 18 },
      { owner: 'exam_officer', exams: 2, delayed: 1, marksMissing: 0, oldestDays: 6 },
      { owner: 'high_rank', exams: 1, delayed: 1, marksMissing: 0, oldestDays: 10 },
    ])
    expect(w.byClass.map((g) => [g.label, g.exams, g.missing])).toEqual([['Form 1A', 3, 5], ['Form 3B', 2, 0]])
    expect(w.byTeacher.find((g) => g.key === 'unassigned')).toMatchObject({ exams: 1, missing: 4 })
    expect(w.bySubject.reduce((t, g) => t + g.missing, 0)).toBe(w.totals.missing)
  })

  it('filters narrow the rows and totals but not the filter choices', async () => {
    const all = await getExamWorkflow(Y, 2, school, {}, { audit: false }, NOW)
    const byClass = await getExamWorkflow(Y, 2, school, { classId: 'c1' }, { audit: false }, NOW)
    expect(byClass.rows.map((r) => r.examId).sort()).toEqual(['e1', 'e2', 'e5'])
    expect(byClass.totals.expected).toBe(12)
    expect(byClass.options).toEqual(all.options)
    expect((await getExamWorkflow(Y, 2, school, { teacherUid: 't1' }, { audit: false }, NOW)).rows.map((r) => r.examId).sort()).toEqual(['e1', 'e4'])
    expect((await getExamWorkflow(Y, 2, school, { teacherUid: 'unassigned' }, { audit: false }, NOW)).rows.map((r) => r.examId)).toEqual(['e5'])
    expect((await getExamWorkflow(Y, 2, school, { subject: 'Maths', status: 'RESULTS_APPROVED' }, { audit: false }, NOW)).rows.map((r) => r.examId)).toEqual(['e3'])
    expect((await getExamWorkflow(Y, 2, school, { classId: 'nope' }, { audit: false }, NOW)).rows).toEqual([])
  })

  it('puts delayed and longest-waiting exams first', async () => {
    const w = await getExamWorkflow(Y, 2, school, {}, { audit: false }, NOW)
    expect(w.rows.map((r) => r.examId).slice(0, 3)).toEqual(['e1', 'e3', 'e5'])
  })

  it('reports end-of-term release readiness with the same rule the release action uses', async () => {
    const w = await getExamWorkflow(Y, 2, school, {}, { audit: false }, NOW)
    expect(w.termRelease).toEqual({ endTermExams: 2, approved: 1, released: 0, notReady: [{ className: 'Form 1A', status: 'MARKS_FINAL' }], readyToRelease: false, allReleased: false })
    const filtered = await getExamWorkflow(Y, 2, school, { classId: 'c3' }, { audit: false }, NOW)
    expect(filtered.termRelease).toEqual(w.termRelease)
  })

  it('exposes the audit trail only with permission, newest first, flagging sensitive actions', async () => {
    expect((await getExamWorkflow(Y, 2, school, {}, { audit: false }, NOW)).audit).toBeNull()
    const w = await getExamWorkflow(Y, 2, school, {}, { audit: true }, NOW)
    expect(w.audit!.map((a) => a.action)).toEqual([
      'exam.results_released', 'exam.results_approved', 'exam.marks_finalized', 'exam.marks_finalized', 'exam.results_approved', 'exam.marks_finalized', 'exam.marks_unlocked', 'exam.marks_finalized',
    ])
    expect(w.audit![0]).toMatchObject({ label: 'Results released', sensitive: true, actor: 'Head Teacher', actorRole: 'high_rank', exam: 'Exam e4', className: 'Form 3B' })
    expect(w.audit!.find((a) => a.action === 'exam.marks_unlocked')).toMatchObject({ sensitive: true, actor: 'Esther Mwale' })
    expect(w.audit!.find((a) => a.action === 'exam.marks_finalized')!.sensitive).toBe(false)
    const filtered = await getExamWorkflow(Y, 2, school, { classId: 'c1' }, { audit: true }, NOW)
    expect(new Set(filtered.audit!.map((a) => a.exam))).toEqual(new Set(['Exam e2']))
  })

  it('scopes a teacher to the classes and subjects they are assigned, with no audit or release view', async () => {
    const w = await getExamWorkflow(Y, 2, { kind: 'teacher', teacherUid: 't1' }, {}, { audit: false }, NOW)
    expect(w.rows.map((r) => r.examId).sort()).toEqual(['e1', 'e4'])
    expect(w.termRelease).toBeNull()
    expect(w.options.teachers.map((t) => t.uid).sort()).toEqual(['t1'])
    const nobody = await getExamWorkflow(Y, 2, { kind: 'teacher', teacherUid: 'ghost' }, {}, { audit: false }, NOW)
    expect(nobody.rows).toEqual([])
    expect(nobody.totals).toMatchObject({ exams: 0, expected: 0, completionRate: null })
  })

  it('shows no completion rate rather than 0% when there are no exams', async () => {
    const w = await getExamWorkflow(Y, 1, school, {}, { audit: false }, NOW)
    expect(w.rows).toEqual([])
    expect(w.totals.completionRate).toBeNull()
    expect(w.stages.every((s) => s.count === 0 && s.avgDaysInStage === null)).toBe(true)
  })
})

describe('dashboard and report agree', () => {
  it('the exam dashboards’ status counts equal the workflow report’s stage counts', async () => {
    const w = await getExamWorkflow(Y, 2, school, {}, { audit: false }, NOW)
    // The dashboards list the term's exams and count them with lib/examFilters.
    const listed = exams.filter((e) => e.term === 2 && !String(e.type).startsWith('MANEB')) as unknown as Parameters<typeof examsAwaitingMarks>[0]
    const stage = (k: string) => w.stages.find((s) => s.key === k)!.count
    expect(examsAwaitingMarks(listed)).toHaveLength(stage('MARKS_PENDING') + stage('MARKS_DRAFT'))
    expect(examsAwaitingRelease(listed)).toHaveLength(stage('RESULTS_APPROVED'))
    expect(examsReleased(listed)).toHaveLength(stage('RESULTS_RELEASED'))
    expect(listed).toHaveLength(w.totals.exams)
  })
})

describe('MANEB status', () => {
  it('reports MANEB records for the year as external data', async () => {
    const m = await getManebStatus(Y)
    expect(m.source).toBe('external')
    expect(m.types.map((t) => [t.examType, t.candidates, t.form])).toEqual([['JCE', 0, 2], ['MSCE', 2, 4]])
    expect(m.types[1]).toMatchObject({ awaitingResults: 1, resultsReceived: 1, resultsWithoutGrade: 0 })
    expect((await getManebStatus('2024/2025')).types.map((t) => [t.examType, t.candidates])).toEqual([['JCE', 1], ['MSCE', 0]])
  })

  it('compares MANEB registrations with the students who could sit, for the current year only', async () => {
    const current = await getManebStatus(Y, { isCurrentYear: true })
    expect(current.types.map((t) => [t.examType, t.eligible, t.notRegistered])).toEqual([['JCE', 3, 3], ['MSCE', 1, 0]])
    const past = await getManebStatus('2024/2025', { isCurrentYear: false })
    expect(past.types.every((t) => t.eligible === null && t.notRegistered === null)).toBe(true)
  })
})
