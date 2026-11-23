// @vitest-environment node
/**
 * MANEB candidate registration: who may be registered, what closes the list, and that marks
 * entry only accepts a student who is on it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(),
    update: vi.fn(async (a: { data: object }) => ({ id: 'reg1', ...a.data })), updateMany: vi.fn(),
    upsert: vi.fn(), delete: vi.fn(), count: vi.fn(), groupBy: vi.fn(),
  })
  const prisma = {
    student: model(), manebRegistration: model(), manebListLock: model(), manebRecord: model(),
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(prisma)),
  }
  return { prisma }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error { code = 'P2002' } },
}))
vi.mock('@/server/services/auditService', () => ({ log: vi.fn(), logAsync: vi.fn() }))
vi.mock('@/server/services/settingsService', () => ({ get: vi.fn(async () => 'C0123') }))

import * as svc from '../manebRegistrationService'

const actor = { uid: 'u1', role: 'exam_officer' as never }
const form4 = { id: 's1', firstName: 'Chikondi', lastName: 'Phiri', status: 'ACTIVE', class: { form: 4, academicYear: '2026/2027', name: 'Form 4 A' } }

beforeEach(() => {
  vi.clearAllMocks()
  m.prisma.manebListLock.findUnique.mockResolvedValue(null)
})

describe('register', () => {
  it('registers a Form 4 student for MSCE', async () => {
    m.prisma.student.findUnique.mockResolvedValue(form4)
    m.prisma.manebRegistration.findUnique.mockResolvedValue(null)
    m.prisma.manebRegistration.create.mockResolvedValue({ id: 'reg1', registeredVia: 'SELF', candidateNo: null })
    const row = await svc.register({ studentId: 's1', examType: 'MSCE', academicYear: '2026/2027', registeredVia: 'SELF', feePaid: true, subjects: ['English'] } as never, actor)
    expect(row.id).toBe('reg1')
    const data = m.prisma.manebRegistration.create.mock.calls[0]![0].data
    expect(data.feePaidAt).toBeInstanceOf(Date)
    expect(data.createdById).toBe('u1')
  })

  it('refuses a Form 3 student, and JCE for a Form 4 student', async () => {
    m.prisma.student.findUnique.mockResolvedValue({ ...form4, class: { form: 3, academicYear: '2026/2027', name: 'Form 3 A' } })
    await expect(svc.register({ studentId: 's1', examType: 'MSCE', academicYear: '2026/2027' } as never, actor)).rejects.toMatchObject({ status: 400 })
    m.prisma.student.findUnique.mockResolvedValue(form4)
    await expect(svc.register({ studentId: 's1', examType: 'JCE', academicYear: '2026/2027' } as never, actor)).rejects.toMatchObject({ status: 400 })
  })

  it('refuses when the list is closed, and a second registration', async () => {
    m.prisma.manebListLock.findUnique.mockResolvedValue({ id: 'l1' })
    await expect(svc.register({ studentId: 's1', examType: 'MSCE', academicYear: '2026/2027' } as never, actor)).rejects.toMatchObject({ status: 409 })
    m.prisma.manebListLock.findUnique.mockResolvedValue(null)
    m.prisma.student.findUnique.mockResolvedValue(form4)
    m.prisma.manebRegistration.findUnique.mockResolvedValue({ id: 'reg1', status: 'REGISTERED' })
    await expect(svc.register({ studentId: 's1', examType: 'MSCE', academicYear: '2026/2027' } as never, actor)).rejects.toMatchObject({ status: 409 })
  })

  it('registers a withdrawn candidate again on the same row', async () => {
    m.prisma.student.findUnique.mockResolvedValue(form4)
    m.prisma.manebRegistration.findUnique.mockResolvedValue({ id: 'reg1', status: 'WITHDRAWN' })
    m.prisma.manebRegistration.update.mockResolvedValue({ id: 'reg1', registeredVia: 'SCHOOL', candidateNo: null })
    await svc.register({ studentId: 's1', examType: 'MSCE', academicYear: '2026/2027', registeredVia: 'SCHOOL', feePaid: false, subjects: [] } as never, actor)
    expect(m.prisma.manebRegistration.create).not.toHaveBeenCalled()
    expect(m.prisma.manebRegistration.update.mock.calls[0]![0].data).toMatchObject({ status: 'REGISTERED', withdrawnAt: null })
  })
})

describe('withdraw and lock', () => {
  it('cannot withdraw a candidate who already has marks', async () => {
    m.prisma.manebRegistration.findUnique.mockResolvedValue({ id: 'reg1', status: 'REGISTERED', studentId: 's1', academicYear: '2026/2027', examType: 'MSCE' })
    m.prisma.manebRecord.findFirst.mockResolvedValue({ id: 'r1' })
    await expect(svc.withdraw('reg1', 'Left school', actor)).rejects.toMatchObject({ status: 409 })
  })

  it('withdraws with a reason when there are no marks', async () => {
    m.prisma.manebRegistration.findUnique.mockResolvedValue({ id: 'reg1', status: 'REGISTERED', studentId: 's1', academicYear: '2026/2027', examType: 'MSCE' })
    m.prisma.manebRecord.findFirst.mockResolvedValue(null)
    await svc.withdraw('reg1', ' Left school ', actor)
    expect(m.prisma.manebRegistration.update.mock.calls[0]![0].data).toMatchObject({ status: 'WITHDRAWN', withdrawnReason: 'Left school' })
  })

  it('will not close an empty list', async () => {
    m.prisma.manebRegistration.count.mockResolvedValue(0)
    await expect(svc.lockList('2026/2027', 'MSCE', actor)).rejects.toMatchObject({ status: 400 })
  })
})

describe('board and summary', () => {
  it('marks students Registered or Not registered and totals them', async () => {
    m.prisma.student.findMany.mockResolvedValue([
      { id: 's1', registrationNo: 'SMS-2026-0001', firstName: 'A', lastName: 'One', sex: 'MALE', class: { name: 'Form 4 A' } },
      { id: 's2', registrationNo: 'SMS-2026-0002', firstName: 'B', lastName: 'Two', sex: 'FEMALE', class: { name: 'Form 4 A' } },
      { id: 's3', registrationNo: 'SMS-2026-0003', firstName: 'C', lastName: 'Three', sex: 'FEMALE', class: { name: 'Form 4 B' } },
    ])
    m.prisma.manebRegistration.findMany.mockResolvedValue([
      { id: 'g1', studentId: 's1', status: 'REGISTERED', candidateNo: 'M1/001', feePaidAt: new Date(), subjects: ['English'], registeredVia: 'SELF' },
      { id: 'g3', studentId: 's3', status: 'WITHDRAWN', withdrawnReason: 'Moved', subjects: [], registeredVia: 'SCHOOL' },
    ])
    m.prisma.manebRecord.findMany.mockResolvedValue([])
    const board = await svc.getBoard('2026/2027', 'MSCE')
    expect(board.form).toBe(4)
    expect(board.rows.map((r) => r.registered)).toEqual([true, false, false])
    expect(board.rows[2]!.withdrawn).toBe(true)
    expect(board.totals).toMatchObject({ students: 3, registered: 1, notRegistered: 2, withNumber: 1, feePaid: 1 })
  })

  it('summary exists only for Form 2 and Form 4', async () => {
    expect(await svc.registrationSummaryForStudent('s1', { form: 3, academicYear: '2026/2027' })).toBeNull()
    m.prisma.manebRegistration.findFirst.mockResolvedValue({ candidateNo: 'M1/001' })
    expect(await svc.registrationSummaryForStudent('s1', { form: 4, academicYear: '2026/2027' }))
      .toEqual({ examType: 'MSCE', academicYear: '2026/2027', registered: true, candidateNo: 'M1/001' })
    m.prisma.manebRegistration.findFirst.mockResolvedValue(null)
    expect((await svc.registrationSummaryForStudent('s1', { form: 2, academicYear: '2026/2027' }))?.registered).toBe(false)
  })
})
