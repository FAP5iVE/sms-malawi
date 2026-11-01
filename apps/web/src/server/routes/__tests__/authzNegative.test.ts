// @vitest-environment node
/**
 * HTTP-level negative authorization tests (Issue 7). The REAL routers and the
 * REAL permission middleware run behind a real Express app; only identity
 * (verifyAuth reads an `x-test-user` header instead of a Firebase token) and
 * the data layer are faked. Each group pairs an allowed case with the denied
 * cases the audit asked for: unauthenticated, lower role, wrong owner, forged id.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

const m = vi.hoisted(() => ({
  prisma: {
    student: { findUnique: vi.fn(), findFirst: vi.fn() },
    termResult: { findFirst: vi.fn() },
  },
  examService: {
    getStudentResults: vi.fn(async () => ({ ok: true })),
    getStudentClassStanding: vi.fn(async () => ({ ok: true })),
  },
  pending: {
    getPendingForEntity: vi.fn(),
    canReview: vi.fn(),
    hasPendingAction: vi.fn(async () => false),
    create: vi.fn(async (x: unknown) => ({ id: 'p1', ...(x as object) })),
    PENDING_ACTION_TYPES: ['student.create', 'student.edit'],
  },
  userSvc: { toggleUserDisabled: vi.fn(async () => undefined) },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: () => (_q: unknown, _s: unknown, n: () => void) => n() }))
vi.mock('@/server/middleware/idempotency', () => ({ idempotent: () => (_q: unknown, _s: unknown, n: () => void) => n() }))
vi.mock('@/lib/storage', () => ({ getSignedViewUrl: vi.fn(), canReadFile: vi.fn(() => false) }))
vi.mock('@/lib/serialize', () => ({ serializeDecimals: (x: unknown) => x }))
vi.mock('@/server/services/examService', () => m.examService)
vi.mock('@/server/services/reportCardService', () => ({}))
vi.mock('@/server/services/pendingActionService', () => m.pending)
vi.mock('@/server/services/userManagementService', () => m.userSvc)
vi.mock('@/lib/verifyAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/verifyAuth')>('@/lib/verifyAuth')
  return {
    ...actual,
    verifyAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const raw = req.headers['x-test-user']
      if (!raw || typeof raw !== 'string') return res.status(401).json({ error: 'No token provided' })
      req.user = JSON.parse(raw)
      next()
    },
  }
})

import { examsRouter } from '@/server/routes/exams'
import { pendingActionsRouter } from '@/server/routes/pendingActions'
import { usersRouter } from '@/server/routes/users'

let server: Server
let base = ''

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/exams', examsRouter)
  app.use('/pending-actions', pendingActionsRouter)
  app.use('/users', usersRouter)
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => { server.close(() => resolve()) }))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllEnvs())

const as = (role: string, uid = `${role}-uid`, extra: object = {}) => ({ 'x-test-user': JSON.stringify({ uid, role, email: '', ...extra }) })
async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// ─── GET /exams/results/:studentId ──────────────────────────────────────────

describe('GET /exams/results/:studentId — object-level + permission', () => {
  const url = '/exams/results/stu-1?academicYear=2026/2027&term=1'

  it('denies an unauthenticated caller (401)', async () => {
    expect((await call('GET', url)).status).toBe(401)
    expect(m.examService.getStudentResults).not.toHaveBeenCalled()
  })

  it.each(['library', 'hr', 'finance', 'lower_rank', 'academic'])('denies %s staff (no exam.viewAllResults) — was readable by every staff role', async (role) => {
    expect((await call('GET', url, as(role))).status).toBe(403)
    expect(m.examService.getStudentResults).not.toHaveBeenCalled()
  })

  it.each(['admin', 'high_rank', 'exam_officer'])('allows %s (holds exam.viewAllResults)', async (role) => {
    expect((await call('GET', url, as(role))).status).toBe(200)
    expect(m.examService.getStudentResults).toHaveBeenCalledWith('stu-1', '2026/2027', 1)
  })

  it('allows a student their OWN record', async () => {
    m.prisma.student.findUnique.mockResolvedValue({ id: 'stu-1' })
    expect((await call('GET', url, as('student', 'fb-uid-1'))).status).toBe(200)
  })

  it('denies a student a DIFFERENT student id (forged id swap)', async () => {
    m.prisma.student.findUnique.mockResolvedValue({ id: 'stu-1' })
    const r = await call('GET', '/exams/results/stu-2?academicYear=2026/2027&term=1', as('student', 'fb-uid-1'))
    expect(r.status).toBe(403)
    expect(m.examService.getStudentResults).not.toHaveBeenCalled()
  })

  it('denies a student with no linked record', async () => {
    m.prisma.student.findUnique.mockResolvedValue(null)
    expect((await call('GET', url, as('student'))).status).toBe(403)
  })

  it.each([
    ['year', '?academicYear=2026-2027&term=1'],
    ['year injection', '?academicYear=2026/2027%27%3B--&term=1'],
    ['term', '?academicYear=2026/2027&term=9'],
    ['term text', '?academicYear=2026/2027&term=abc'],
  ])('rejects a malformed %s with 400 before any query', async (_n, qs) => {
    expect((await call('GET', `/exams/results/stu-1${qs}`, as('admin'))).status).toBe(400)
    expect(m.examService.getStudentResults).not.toHaveBeenCalled()
  })

  it('class-standing applies the same gate (staff denied, other student denied)', async () => {
    const u = '/exams/results/stu-1/class-standing?academicYear=2026/2027&term=1'
    expect((await call('GET', u, as('library'))).status).toBe(403)
    m.prisma.student.findUnique.mockResolvedValue({ id: 'stu-9' })
    expect((await call('GET', u, as('student', 'fb'))).status).toBe(403)
    expect((await call('GET', u, as('exam_officer'))).status).toBe(200)
  })

  it('a service failure never leaks its text to the client (outside local development)', async () => {
    // sendError deliberately shows 5xx text under NODE_ENV=development, and
    // vitest inherits that locally — pin the environment so the test is stable.
    vi.stubEnv('NODE_ENV', 'production')
    m.examService.getStudentResults.mockRejectedValueOnce(new Error('connection to db-internal.neon.tech:5432 refused'))
    const r = await call('GET', url, as('admin'))
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.body)).not.toContain('neon.tech')
    vi.unstubAllEnvs()
  })
})

// ─── pending actions ────────────────────────────────────────────────────────

describe('GET /pending-actions/entity/:type/:id — scoped to the requester', () => {
  const rows = [
    { id: 'a', requestedByUid: 'lower_rank-uid', targetState: { secret: 1 } },
    { id: 'b', requestedByUid: 'someone-else', targetState: { secret: 2 } },
  ]
  beforeEach(() => {
    m.pending.getPendingForEntity.mockResolvedValue(rows)
    m.pending.canReview.mockImplementation((role: string) => ['admin', 'high_rank'].includes(role))
  })

  it('denies an unauthenticated caller', async () => {
    expect((await call('GET', '/pending-actions/entity/student/s1')).status).toBe(401)
  })
  it('reviewers see every pending change for the entity', async () => {
    const r = await call('GET', '/pending-actions/entity/student/s1', as('high_rank'))
    expect(r.body.count).toBe(2)
  })
  it('a requester sees only their own', async () => {
    const r = await call('GET', '/pending-actions/entity/student/s1', as('lower_rank'))
    expect(r.body.actions.map((a: { id: string }) => a.id)).toEqual(['a'])
  })
  it('a student or library clerk sees nothing — and no targetState of other people', async () => {
    for (const role of ['student', 'library']) {
      const r = await call('GET', '/pending-actions/entity/student/s1', as(role))
      expect(r.body.count, role).toBe(0)
      expect(JSON.stringify(r.body)).not.toContain('secret')
    }
  })
})

describe('POST /pending-actions — body validation', () => {
  beforeEach(() => m.pending.canReview.mockReturnValue(false))
  const good = { entityType: 'Student', entityId: 's1', action: 'student.create', description: 'Add a student' }

  it('denies an unauthenticated caller', async () => {
    expect((await call('POST', '/pending-actions', {}, good)).status).toBe(401)
  })
  it('accepts a valid body from a permitted role', async () => {
    const r = await call('POST', '/pending-actions', as('lower_rank'), good)
    expect(r.status).toBe(201)
  })
  it('refuses a role without the underlying permission (student)', async () => {
    expect((await call('POST', '/pending-actions', as('student'), good)).status).toBe(403)
    expect(m.pending.create).not.toHaveBeenCalled()
  })
  it.each([
    ['non-string entityId', { ...good, entityId: { $ne: 1 } }],
    ['oversized description', { ...good, description: 'x'.repeat(1001) }],
    ['oversized targetState', { ...good, targetState: { blob: 'x'.repeat(25_000) } }],
    ['array targetState', { ...good, targetState: [1, 2] }],
    ['bad expiresAt', { ...good, expiresAt: 'not-a-date' }],
    ['missing action', { ...good, action: undefined }],
  ])('rejects %s with 400 and queues nothing', async (_n, body) => {
    const r = await call('POST', '/pending-actions', as('lower_rank'), body)
    expect(r.status).toBe(400)
    expect(m.pending.create).not.toHaveBeenCalled()
  })
})

// ─── users ──────────────────────────────────────────────────────────────────

describe('PATCH /users/:uid/disable', () => {
  it('denies unauthenticated and every non-admin role', async () => {
    expect((await call('PATCH', '/users/x/disable', {}, { disabled: true })).status).toBe(401)
    for (const role of ['student', 'library', 'hr', 'finance', 'high_rank', 'lower_rank', 'academic', 'exam_officer']) {
      expect((await call('PATCH', '/users/x/disable', as(role), { disabled: true })).status, role).toBe(403)
    }
    expect(m.userSvc.toggleUserDisabled).not.toHaveBeenCalled()
  })
  it('requires a real boolean (the string "false" is truthy)', async () => {
    for (const body of [{ disabled: 'false' }, { disabled: 1 }, {}, { disabled: true, extra: 1 }]) {
      expect((await call('PATCH', '/users/x/disable', as('admin'), body)).status).toBe(400)
    }
    expect(m.userSvc.toggleUserDisabled).not.toHaveBeenCalled()
  })
  it('an admin disables once, with the verified actor', async () => {
    expect((await call('PATCH', '/users/target/disable', as('admin', 'adm-1'), { disabled: true })).status).toBe(200)
    expect(m.userSvc.toggleUserDisabled).toHaveBeenCalledTimes(1)
    expect(m.userSvc.toggleUserDisabled).toHaveBeenCalledWith('target', true, 'adm-1', false)
  })
})
