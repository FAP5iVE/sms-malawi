/**
 * examService.lifecycle.test.ts
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Pins the rules for WHO may edit/delete an exam and UNTIL WHEN,
 *   and the atomic "save + finalize" step:
 *     - an exam can be edited/deleted until the teacher confirms (finalizes)
 *       its marks; unconfirmed draft marks are discarded with a deleted exam
 *     - once confirmed - even if an officer later unlocks it - it can't be
 *       deleted, and a teacher who isn't assigned can never touch it
 *     - finalize validates the WHOLE resulting sheet before writing anything
 *     - rule violations carry a 4xx status so their message reaches the UI
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = vi.hoisted(() => ({
  exam: {
    findUniqueOrThrow: vi.fn(), update: vi.fn(), delete: vi.fn(),
  },
  examMark: {
    count: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(),
    upsert: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn(),
  },
  student: { findMany: vi.fn() },
  class: { findUniqueOrThrow: vi.fn() },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: tx }))
vi.mock('@prisma/client', () => ({ Prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/server/services/feeService', () => ({ checkBalanceGate: vi.fn() }))
vi.mock('@/server/services/settingsService', () => ({ getMany: vi.fn() }))
vi.mock('@/server/services/announcementService', () => ({}))
vi.mock('@/server/services/auditService', () => ({ log: vi.fn() }))
vi.mock('@/server/services/classService', () => ({
  isTeacherAssignedToSubject: vi.fn(),
  assertSubjectOfferedByClass: vi.fn(),
}))

import * as examService from '../examService'
import * as classService from '@/server/services/classService'

const owner   = { uid: 't1', role: 'academic' as const }
const officer = { uid: 'o1', role: 'exam_officer' as const }
const examRow = (over: Record<string, unknown> = {}) => ({
  id: 'e1', classId: 'c1', subject: 'Biology', academicYear: '2026', term: 1, type: 'TEST', caSlot: null,
  title: 'Week 3 Test', status: 'SCHEDULED', maxMark: 100, _count: { marks: 0 }, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(classService.isTeacherAssignedToSubject).mockResolvedValue(true)
  tx.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops))
  tx.examMark.count.mockResolvedValue(0)
})

describe('examService.deleteExam', () => {
  it('deletes a scheduled exam that has no marks', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(examRow())
    const res = await examService.deleteExam('e1', owner)
    expect(res).toEqual({ success: true, discardedDraftMarks: 0 })
    expect(tx.exam.delete).toHaveBeenCalledWith({ where: { id: 'e1' } })
  })

  it('still deletes while marks are only drafts, discarding them with the exam', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(examRow({ status: 'MARKS_DRAFT', _count: { marks: 3 } }))
    const res = await examService.deleteExam('e1', owner)
    expect(res.discardedDraftMarks).toBe(3)
    expect(tx.examMark.deleteMany).toHaveBeenCalledWith({ where: { examId: 'e1' } })
    expect(tx.exam.delete).toHaveBeenCalled()
  })

  it.each(['MARKS_FINAL', 'RESULTS_APPROVED', 'RESULTS_RELEASED'])('refuses once marks are confirmed (%s)', async (status) => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(examRow({ status, _count: { marks: 30 } }))
    await expect(examService.deleteExam('e1', owner)).rejects.toMatchObject({ status: 409 })
    expect(tx.exam.delete).not.toHaveBeenCalled()
  })

  it('refuses an exam that was confirmed earlier and later unlocked', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(examRow({ status: 'MARKS_PENDING', _count: { marks: 30 } }))
    tx.examMark.count.mockResolvedValue(30)
    await expect(examService.deleteExam('e1', officer)).rejects.toMatchObject({ status: 409 })
    expect(tx.exam.delete).not.toHaveBeenCalled()
  })

  it("never lets a teacher delete another teacher's exam", async () => {
    vi.mocked(classService.isTeacherAssignedToSubject).mockResolvedValue(false)
    tx.exam.findUniqueOrThrow.mockResolvedValue(examRow())
    await expect(examService.deleteExam('e1', owner)).rejects.toMatchObject({ status: 403 })
    expect(tx.exam.delete).not.toHaveBeenCalled()
  })
})

describe('examService.updateExam guards', () => {
  it('refuses any edit once marks are confirmed', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(examRow({ status: 'MARKS_FINAL' }))
    await expect(examService.updateExam('e1', { title: 'New' }, owner)).rejects.toMatchObject({ status: 409 })
    expect(tx.exam.update).not.toHaveBeenCalled()
  })

  it('refuses moving an exam to another class after marks were entered', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(examRow({ status: 'MARKS_DRAFT', _count: { marks: 5 } }))
    await expect(examService.updateExam('e1', { classId: 'c2' }, officer)).rejects.toMatchObject({ status: 409 })
    expect(tx.exam.update).not.toHaveBeenCalled()
  })

  it('refuses lowering the maximum below a mark already entered', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(examRow({ status: 'MARKS_DRAFT', _count: { marks: 5 } }))
    tx.examMark.aggregate.mockResolvedValue({ _max: { mark: '85' } })
    await expect(examService.updateExam('e1', { maxMark: 80 }, owner)).rejects.toMatchObject({ status: 409 })
    expect(tx.exam.update).not.toHaveBeenCalled()
  })
})

describe('examService.finalizeMarks', () => {
  const students = [{ id: 's1' }, { id: 's2' }]
  const entry = (studentId: string, mark?: number, absent = false) => ({ examId: 'e1', studentId, mark, absent })
  const withClass = (over: Record<string, unknown> = {}) =>
    examRow({ status: 'MARKS_DRAFT', class: { students }, ...over })

  it('saves the submitted sheet and confirms it in one atomic batch', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(withClass())
    tx.examMark.findMany.mockResolvedValue([])
    await examService.finalizeMarks('e1', owner, [entry('s1', 70), entry('s2', undefined, true)])
    expect(tx.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.examMark.upsert).toHaveBeenCalledTimes(2)
    expect(tx.examMark.updateMany).toHaveBeenCalled()
    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { status: 'MARKS_FINAL' } })
  })

  it('counts marks already saved as a draft (Decimal strings from the DB)', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(withClass())
    tx.examMark.findMany.mockResolvedValue([
      { studentId: 's1', mark: '45', absent: false }, { studentId: 's2', mark: '60', absent: false },
    ])
    await expect(examService.finalizeMarks('e1', owner)).resolves.toMatchObject({ finalized: true })
  })

  it('reports who is missing, and writes nothing', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(withClass())
    tx.examMark.findMany.mockResolvedValue([])
    await expect(examService.finalizeMarks('e1', owner, [entry('s1', 70)]))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('Missing marks for 1') })
    expect(tx.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a blank, non-absent student', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(withClass())
    tx.examMark.findMany.mockResolvedValue([])
    await expect(examService.finalizeMarks('e1', owner, [entry('s1', 70), entry('s2')]))
      .rejects.toMatchObject({ status: 409 })
    expect(tx.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a mark above the exam maximum', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(withClass())
    await expect(examService.finalizeMarks('e1', owner, [entry('s1', 101), entry('s2', 5)]))
      .rejects.toMatchObject({ status: 400 })
  })

  it('rejects entries for students outside the exam class', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(withClass())
    tx.examMark.findMany.mockResolvedValue([])
    await expect(examService.finalizeMarks('e1', owner, [entry('s1', 1), entry('s2', 2), entry('stranger', 3)]))
      .rejects.toMatchObject({ status: 400 })
    expect(tx.$transaction).not.toHaveBeenCalled()
  })

  it('refuses an exam that is already finalized', async () => {
    tx.exam.findUniqueOrThrow.mockResolvedValue(withClass({ status: 'MARKS_FINAL' }))
    await expect(examService.finalizeMarks('e1', owner)).rejects.toMatchObject({ status: 409 })
  })
})
