import { describe, it, expect } from 'vitest'
import { DELAY_AFTER_DAYS, assessDelay, buildTimeline, summariseManeb, summariseStages, termReleaseReadiness, workByOwner } from '../examWorkflowLogic'

const NOW = new Date('2026-06-30T12:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000)
const ev = (action: string, daysAgo: number) => ({ action, entityId: 'e', at: ago(daysAgo), actorUid: 'u', actorRole: 'exam_officer' })
const none = { firstMarkAt: null, lastFinalisedAt: null }

describe('buildTimeline', () => {
  it('uses the audit entry for the transition', () => {
    const t = buildTimeline({ exam: { type: 'QUIZ', status: 'MARKS_FINAL', date: ago(30), updatedAt: ago(1) }, events: [ev('exam.marks_finalized', 6)], termReleaseAt: null, marks: none })
    expect(t.stageEnteredAt).toEqual(ago(6))
    expect(t.stageSource).toBe('audit')
    expect(t.finalisedAt).toEqual(ago(6))
  })

  it('falls back to mark timestamps, then the exam date, and only last to updatedAt', () => {
    const draft = buildTimeline({ exam: { type: 'QUIZ', status: 'MARKS_DRAFT', date: ago(30), updatedAt: ago(1) }, events: [], termReleaseAt: null, marks: { firstMarkAt: ago(18), lastFinalisedAt: null } })
    expect(draft).toMatchObject({ stageSource: 'marks' })
    expect(draft.stageEnteredAt).toEqual(ago(18))
    const sched = buildTimeline({ exam: { type: 'QUIZ', status: 'SCHEDULED', date: ago(5), updatedAt: ago(1) }, events: [], termReleaseAt: null, marks: none })
    expect(sched.stageSource).toBe('exam_date')
    const approved = buildTimeline({ exam: { type: 'QUIZ', status: 'RESULTS_APPROVED', date: ago(30), updatedAt: ago(2) }, events: [], termReleaseAt: null, marks: none })
    expect(approved.stageSource).toBe('updated_at')
    expect(approved.stageEnteredAt).toEqual(ago(2))
  })

  it('an unlock restarts the marks stage and is counted', () => {
    const t = buildTimeline({ exam: { type: 'QUIZ', status: 'MARKS_PENDING', date: ago(40), updatedAt: ago(1) }, events: [ev('exam.marks_finalized', 20), ev('exam.marks_unlocked', 4), ev('exam.marks_corrected_in_review', 10)], termReleaseAt: null, marks: none })
    expect(t.stageEnteredAt).toEqual(ago(4))
    expect(t).toMatchObject({ unlockCount: 1, correctionCount: 1, stageSource: 'audit' })
  })

  it('an end-of-term exam released together takes the term release time', () => {
    const t = buildTimeline({ exam: { type: 'END_TERM', status: 'RESULTS_RELEASED', date: ago(40), updatedAt: ago(1) }, events: [], termReleaseAt: ago(3), marks: none })
    expect(t.releasedAt).toEqual(ago(3))
    expect(t.stageEnteredAt).toEqual(ago(3))
  })

  it('uses the latest of repeated transitions', () => {
    const t = buildTimeline({ exam: { type: 'QUIZ', status: 'MARKS_FINAL', date: ago(40), updatedAt: ago(1) }, events: [ev('exam.marks_finalized', 20), ev('exam.marks_finalized', 2)], termReleaseAt: null, marks: none })
    expect(t.finalisedAt).toEqual(ago(2))
  })
})

describe('assessDelay', () => {
  it('flags a stage only past its threshold', () => {
    expect(assessDelay('MARKS_FINAL', ago(7), NOW)).toEqual({ daysInStage: 7, delayed: false, thresholdDays: DELAY_AFTER_DAYS.approval })
    expect(assessDelay('MARKS_FINAL', ago(8), NOW).delayed).toBe(true)
    expect(assessDelay('MARKS_DRAFT', ago(15), NOW).delayed).toBe(true)
    expect(assessDelay('RESULTS_APPROVED', ago(9), NOW).delayed).toBe(true)
  })
  it('never flags released exams, and never goes negative for future exams', () => {
    expect(assessDelay('RESULTS_RELEASED', ago(400), NOW)).toEqual({ daysInStage: 400, delayed: false, thresholdDays: null })
    expect(assessDelay('SCHEDULED', new Date(NOW.getTime() + 5 * 86_400_000), NOW)).toMatchObject({ daysInStage: 0, delayed: false })
  })
  it('has no days when the time is unknown', () => {
    expect(assessDelay('MARKS_FINAL', null, NOW)).toEqual({ daysInStage: null, delayed: false, thresholdDays: DELAY_AFTER_DAYS.approval })
  })
})

describe('summaries', () => {
  const rows = [
    { status: 'MARKS_FINAL', daysInStage: 3, delayed: false },
    { status: 'MARKS_FINAL', daysInStage: 9, delayed: true },
    { status: 'RESULTS_RELEASED', daysInStage: 100, delayed: false },
  ]
  it('summarises each stage, leaving released exams without an age', () => {
    const s = summariseStages(['MARKS_FINAL', 'RESULTS_RELEASED', 'SCHEDULED'], rows)
    expect(s[0]).toEqual({ key: 'MARKS_FINAL', count: 2, delayed: 1, avgDaysInStage: 6, oldestDaysInStage: 9 })
    expect(s[1]).toEqual({ key: 'RESULTS_RELEASED', count: 1, delayed: 0, avgDaysInStage: null, oldestDaysInStage: null })
    expect(s[2]).toEqual({ key: 'SCHEDULED', count: 0, delayed: 0, avgDaysInStage: null, oldestDaysInStage: null })
  })
  it('groups outstanding work by owner, counting missing marks for teachers only', () => {
    const w = workByOwner([
      { owner: 'teacher', missing: 5, delayed: true, daysInStage: 20 },
      { owner: 'teacher', missing: 2, delayed: false, daysInStage: 3 },
      { owner: 'exam_officer', missing: 0, delayed: false, daysInStage: 1 },
      { owner: null, missing: 0, delayed: false, daysInStage: null },
    ])
    expect(w).toEqual([
      { owner: 'teacher', exams: 2, delayed: 1, marksMissing: 7, oldestDays: 20 },
      { owner: 'exam_officer', exams: 1, delayed: 0, marksMissing: 0, oldestDays: 1 },
      { owner: 'high_rank', exams: 0, delayed: 0, marksMissing: 0, oldestDays: null },
    ])
  })
})

describe('termReleaseReadiness', () => {
  it('follows the release rule: every end-of-term exam must be approved first', () => {
    expect(termReleaseReadiness([{ className: 'A', status: 'RESULTS_APPROVED' }, { className: 'B', status: 'RESULTS_APPROVED' }])).toMatchObject({ readyToRelease: true, notReady: [] })
    const blocked = termReleaseReadiness([{ className: 'A', status: 'RESULTS_APPROVED' }, { className: 'B', status: 'MARKS_FINAL' }])
    expect(blocked.readyToRelease).toBe(false)
    expect(blocked.notReady).toEqual([{ className: 'B', status: 'MARKS_FINAL' }])
  })
  it('reports all released, and nothing ready when there are no exams', () => {
    expect(termReleaseReadiness([{ className: 'A', status: 'RESULTS_RELEASED' }])).toMatchObject({ allReleased: true, readyToRelease: false })
    expect(termReleaseReadiness([])).toMatchObject({ readyToRelease: false, allReleased: false })
  })
})

describe('summariseManeb', () => {
  it('always lists JCE and MSCE, even with no records', () => {
    expect(summariseManeb([]).map((t) => [t.examType, t.candidates])).toEqual([['JCE', 0], ['MSCE', 0]])
  })
  it('counts MANEB records by status, apart from school marks', () => {
    const s = summariseManeb([
      { examType: 'MSCE', status: 'REGISTERED', overallGrade: null },
      { examType: 'MSCE', status: 'RESULTS_RECEIVED', overallGrade: 'MSCE Awarded — Option A' },
      { examType: 'MSCE', status: 'CERTIFIED', overallGrade: null },
      { examType: 'JCE', status: 'SITTING', overallGrade: null },
    ])
    expect(s.map((t) => t.examType)).toEqual(['JCE', 'MSCE'])
    expect(s[1]).toMatchObject({ candidates: 3, awaitingResults: 1, resultsReceived: 2, resultsWithoutGrade: 1 })
    expect(s[1]!.byStatus.reduce((t, x) => t + x.count, 0)).toBe(3)
  })
})
