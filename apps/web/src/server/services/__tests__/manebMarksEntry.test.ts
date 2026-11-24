// @vitest-environment node
/**
 * MANEB marks entry only accepts a student on the registered list, and takes the examination
 * number and centre from the registration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  prisma: {
    student: { findUnique: vi.fn() },
    manebRecord: { create: vi.fn(async (a: { data: object }) => ({ id: 'r1', ...a.data })) },
    manebRegistration: { update: vi.fn() },
  },
  live: vi.fn(),
  setting: vi.fn(),
  autoClose: vi.fn(async () => false),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }))
vi.mock('@prisma/client', () => ({ Prisma: {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/server/services/feeService', () => ({ checkBalanceGate: vi.fn() }))
vi.mock('@/server/services/settingsService', () => ({ get: m.setting, getMany: vi.fn() }))
vi.mock('@/server/services/announcementService', () => ({}))
vi.mock('@/server/services/classService', () => ({}))
vi.mock('@/server/services/auditService', () => ({ log: vi.fn() }))
vi.mock('@/server/services/manebRegistrationService', () => ({ findLiveRegistration: m.live, closeListWhenComplete: m.autoClose }))
vi.mock('@/server/services/gradeService', () => ({
  calcGrade: vi.fn(), computeInternalTermOutcome: vi.fn(),
  computeManebAggregate: vi.fn(async () => ({ classification: 'MSCE Awarded — Option A', points: 20 })),
}))

import { createManebRecord } from '../examService'

const actor = { uid: 'u1', role: 'exam_officer' as never }
const base = { studentId: 's1', examType: 'MSCE' as const, academicYear: '2026/2027', subjectGrades: { English: '2' }, status: 'REGISTERED' as const }

beforeEach(() => {
  vi.clearAllMocks()
  m.prisma.student.findUnique.mockResolvedValue({ id: 's1', firstName: 'Chikondi', lastName: 'Phiri' })
  m.setting.mockImplementation(async (k: string) => (k.includes('number') ? 'C0123' : 'Chikangawa Hills Academy'))
})

describe('createManebRecord', () => {
  it('refuses a student who is not on the registered list', async () => {
    m.live.mockResolvedValue(null)
    await expect(createManebRecord(base as never, actor)).rejects.toMatchObject({ status: 400 })
    expect(m.prisma.manebRecord.create).not.toHaveBeenCalled()
  })

  it('needs an examination number from somewhere', async () => {
    m.live.mockResolvedValue({ id: 'g1', candidateNo: null, centerNo: null })
    await expect(createManebRecord(base as never, actor)).rejects.toMatchObject({ status: 400 })
  })

  it('takes number and centre from the registration and links the result to it', async () => {
    m.live.mockResolvedValue({ id: 'g1', candidateNo: 'M1042/009', centerNo: null })
    const rec = await createManebRecord(base as never, actor) as { candidateNo: string; centerNo: string; centerName: string; registrationId: string }
    expect(rec).toMatchObject({ candidateNo: 'M1042/009', centerNo: 'C0123', centerName: 'Chikangawa Hills Academy', registrationId: 'g1' })
    expect(m.prisma.manebRegistration.update).not.toHaveBeenCalled()
  })

  it('rejects a typed number that disagrees with the registered one', async () => {
    m.live.mockResolvedValue({ id: 'g1', candidateNo: 'M1042/009', centerNo: null })
    await expect(createManebRecord({ ...base, candidateNo: 'M9999/001' } as never, actor)).rejects.toMatchObject({ status: 400 })
  })

  it('asks the list to close after a result is saved, and does not after a refusal', async () => {
    m.live.mockResolvedValue({ id: 'g1', candidateNo: 'M1042/009', centerNo: 'C77' })
    await createManebRecord(base as never, actor)
    expect(m.autoClose).toHaveBeenCalledWith(base.academicYear, base.examType, actor)
    m.autoClose.mockClear()
    m.live.mockResolvedValue(null)
    await expect(createManebRecord(base as never, actor)).rejects.toMatchObject({ status: 400 })
    expect(m.autoClose).not.toHaveBeenCalled()
  })

  it('stores a number typed at marks entry on the registration for the first time', async () => {
    m.live.mockResolvedValue({ id: 'g1', candidateNo: null, centerNo: 'C77' })
    await createManebRecord({ ...base, candidateNo: ' M1042/009 ' } as never, actor)
    expect(m.prisma.manebRegistration.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { candidateNo: 'M1042/009' } })
  })
})
