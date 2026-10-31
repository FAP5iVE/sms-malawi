// @vitest-environment node
/**
 * Regression tests for the P0 "Server Actions trust forgeable cookies" issue.
 *
 * Mocks sit at the Firebase Admin / service boundary only, so the real
 * requireCurrentUser() + real zod schemas + real hasPermission() all run.
 * The table below covers EVERY exported action; a guard test fails if a new
 * export is added without a row here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
  setMany: vi.fn(),
  set: vi.fn(),
  cookies: vi.fn(),
}))

vi.mock('firebase-admin', () => ({
  auth: () => ({ verifyIdToken: mocks.verifyIdToken, getUser: mocks.getUser }),
}))
vi.mock('@/lib/verifyAuth', () => ({ getAdminApp: () => ({}) }))
vi.mock('@/server/services/settingsService', () => ({ setMany: mocks.setMany, set: mocks.set }))
// If anyone reintroduces cookie-derived identity, these tests catch it.
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))

import * as actions from '../settings.actions'
import { hasPermission, type Permission } from '@shared/types/permissions'
import { USER_ROLES, type UserRole } from '@shared/types/roles'

// ─── fixtures ─────────────────────────────────────────────

const TOKEN = 'header.payload.signature'
const CALLER_UID = 'verified-caller-uid'

const VALID = {
  academic: {
    currentAcademicYear: '2026/2027', currentTerm: 1,
    term1Start: '2026-09-01', term1End: '2026-12-15',
    term2Start: '2027-01-10', term2End: '2027-04-10',
    term3Start: '2027-05-01', term3End: '2027-07-31',
  },
  school: {
    schoolName: 'Test Academy', schoolSlogan: 'Learn', schoolVision: 'Vision',
    schoolMission: 'Mission', schoolCoreValues: ['Integrity'], schoolAddress: 'Lilongwe',
    schoolPhone: '+265999000000', schoolEmail: 'office@test.mw', schoolWebsite: '',
    schoolFoundedYear: 1990,
  },
  exam: {
    passMarkThreshold: 50, manebCentreNumber: '1234', manebCentreName: 'Centre',
    manebRegDeadline: '2026-12-01', promotionMinAverage: 50, promotionRequiredPasses: 5,
  },
  finance: {
    latePenaltyPerDay: 100, latePenaltyGraceDays: 7, installmentOptions: [2, 3],
    payrollRunDay: 25, pensionPercent: 10,
    payeBrackets: [
      { minAnnualMwk: 0, maxAnnualMwk: 1_200_000, ratePercent: 0, label: 'Band 1' },
      { minAnnualMwk: 1_200_001, maxAnnualMwk: null, ratePercent: 30, label: 'Band 2' },
    ],
  },
  library: {
    loanPeriodStudent: 14, loanPeriodStaff: 30, maxBooksStudent: 3, maxBooksStaff: 10,
    finePerDay: 50, fineGraceDays: 2, reminderDaysBefore: 2,
  },
  hr: {
    maxConcurrentLeavePct: 20, annualLeaveDays: 21, sickLeaveDays: 14,
    maternityLeaveDays: 90, paternityLeaveDays: 7, studyLeaveDays: 30, emergencyLeaveDays: 5,
  },
}

interface ActionCase {
  name: string
  /** Permission gating the action; null = "admin only" (setMaintenanceMode). */
  permission: Permission | null
  mutation: typeof mocks.setMany
  valid: unknown
  invalid: unknown
  run: (token: unknown, input: unknown) => Promise<{ success: boolean; code?: string; error?: string }>
}

const ACTIONS: ActionCase[] = [
  { name: 'updateAcademicSettings', permission: 'settings.manageAcademicPolicy', mutation: mocks.setMany,
    valid: VALID.academic, invalid: {}, run: (t, i) => actions.updateAcademicSettings(t as string, i as never) },
  { name: 'updateSchoolIdentity', permission: 'settings.manageAcademicPolicy', mutation: mocks.setMany,
    valid: VALID.school, invalid: {}, run: (t, i) => actions.updateSchoolIdentity(t as string, i as never) },
  { name: 'updateExamSettings', permission: 'settings.manageExamConfig', mutation: mocks.setMany,
    valid: VALID.exam, invalid: {}, run: (t, i) => actions.updateExamSettings(t as string, i as never) },
  { name: 'updateFinanceSettings', permission: 'settings.manageFinanceConfig', mutation: mocks.setMany,
    valid: VALID.finance, invalid: {}, run: (t, i) => actions.updateFinanceSettings(t as string, i as never) },
  { name: 'updateLibrarySettings', permission: 'settings.manageLibraryConfig', mutation: mocks.setMany,
    valid: VALID.library, invalid: {}, run: (t, i) => actions.updateLibrarySettings(t as string, i as never) },
  { name: 'updateHRSettings', permission: 'settings.manageHRConfig', mutation: mocks.setMany,
    valid: VALID.hr, invalid: {}, run: (t, i) => actions.updateHRSettings(t as string, i as never) },
  { name: 'setMaintenanceMode', permission: null, mutation: mocks.set,
    valid: true, invalid: 'yes', run: (t, i) => actions.setMaintenanceMode(t as string, i as never) },
]

function roleThatMay(c: ActionCase): UserRole {
  if (c.permission === null) return 'admin'
  const role = USER_ROLES.find((r) => hasPermission(r, c.permission as Permission))
  if (!role) throw new Error(`no role holds ${c.permission}`)
  return role
}

/** Stand-in for "a genuinely signed-in Firebase user with these claims". */
function signInAs(claims: Record<string, unknown>, extra: { disabled?: boolean } = {}) {
  mocks.verifyIdToken.mockResolvedValue({ uid: CALLER_UID })
  mocks.getUser.mockResolvedValue({
    uid: CALLER_UID, disabled: extra.disabled ?? false, customClaims: claims,
  })
}

function firebaseError(code: string) {
  return Object.assign(new Error('SECRET internal firebase detail'), { code })
}

function expectNoMutation() {
  expect(mocks.setMany).not.toHaveBeenCalled()
  expect(mocks.set).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()
  // Attacker-controlled cookie jar: a real-looking privileged UID + admin role.
  const jar: Record<string, { value: string }> = {
    sms_session: { value: 'existing-admin-uid' },
    sms_role: { value: 'admin' },
  }
  mocks.cookies.mockResolvedValue({ get: (name: string) => jar[name] })
  // Default: Firebase rejects everything. Tests opt in to a valid session.
  mocks.verifyIdToken.mockRejectedValue(firebaseError('auth/argument-error'))
  mocks.getUser.mockResolvedValue({ uid: 'existing-admin-uid', disabled: false, customClaims: { role: 'admin', superUser: true } })
})

// ─── coverage guard ───────────────────────────────────────

describe('settings.actions coverage guard', () => {
  it('has a test case for every exported Server Action (and nothing else is exported)', () => {
    expect(Object.keys(actions).sort()).toEqual(ACTIONS.map((a) => a.name).sort())
  })
})

// ─── per-action acceptance tests ──────────────────────────

describe.each(ACTIONS)('$name', (c) => {
  it('no token → UNAUTHENTICATED, no mutation, Firebase never consulted', async () => {
    for (const bad of [undefined, null, '', 42, {}]) {
      const res = await c.run(bad, c.valid)
      expect(res).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    }
    expectNoMutation()
    expect(mocks.verifyIdToken).not.toHaveBeenCalled()
  })

  it('forged sms_session=<existing admin UID> + sms_role=admin, no valid token → rejected; cookies and that UID are never used', async () => {
    const res = await c.run(undefined, c.valid)
    expect(res).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expect(mocks.cookies).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()
    expectNoMutation()
  })

  it('forged cookies + garbage/unsigned token → rejected before any user lookup', async () => {
    // beforeEach default: verifyIdToken rejects with auth/argument-error.
    const res = await c.run('not-a-real-token', c.valid)
    expect(res).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expect(mocks.getUser).not.toHaveBeenCalled()
    expectNoMutation()
  })

  it.each(['auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled'])(
    'token failing with %s → UNAUTHENTICATED, no mutation, no Firebase detail leaked',
    async (code) => {
      mocks.verifyIdToken.mockRejectedValue(firebaseError(code))
      const res = await c.run(TOKEN, c.valid)
      expect(res).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
      expect(res.error).not.toMatch(/SECRET|firebase/i)
      expectNoMutation()
    }
  )

  it('verifies the token with checkRevoked = true', async () => {
    signInAs({ role: roleThatMay(c) })
    await c.run(TOKEN, c.valid)
    expect(mocks.verifyIdToken).toHaveBeenCalledWith(TOKEN, true)
  })

  it('disabled account → UNAUTHENTICATED, no mutation', async () => {
    signInAs({ role: roleThatMay(c) }, { disabled: true })
    expect(await c.run(TOKEN, c.valid)).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expectNoMutation()
  })

  it('valid student session → FORBIDDEN, no mutation', async () => {
    signInAs({ role: 'student' })
    expect(await c.run(TOKEN, c.valid)).toMatchObject({ success: false, code: 'FORBIDDEN' })
    expectNoMutation()
  })

  it('role downgraded after login (stale token, current record is student) → FORBIDDEN', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: CALLER_UID, role: roleThatMay(c), superUser: true })
    mocks.getUser.mockResolvedValue({ uid: CALLER_UID, disabled: false, customClaims: { role: 'student' } })
    expect(await c.run(TOKEN, c.valid)).toMatchObject({ success: false, code: 'FORBIDDEN' })
    expectNoMutation()
  })

  it('authorized session + valid data → succeeds and records the VERIFIED caller uid', async () => {
    signInAs({ role: roleThatMay(c) })
    expect(await c.run(TOKEN, c.valid)).toEqual({ success: true })
    expect(c.mutation).toHaveBeenCalledTimes(1)
    const args = c.mutation.mock.calls[0] as unknown[]
    expect(args[args.length - 1]).toBe(CALLER_UID)
    expect(mocks.cookies).not.toHaveBeenCalled()
  })

  it('authorized session + invalid data → VALIDATION, no mutation', async () => {
    signInAs({ role: roleThatMay(c) })
    expect(await c.run(TOKEN, c.invalid)).toMatchObject({ success: false, code: 'VALIDATION' })
    expectNoMutation()
  })

  it('unauthenticated + invalid data → UNAUTHENTICATED (schema details not leaked to anonymous callers)', async () => {
    const res = await c.run(undefined, c.invalid)
    expect(res).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expectNoMutation()
  })

  it('superUser claim on the verified record passes the gate even for a non-privileged role', async () => {
    signInAs({ role: 'student', superUser: true })
    expect(await c.run(TOKEN, c.valid)).toMatchObject({ success: true })
    expect(c.mutation).toHaveBeenCalledTimes(1)
  })

  it('superUser must be boolean true — string "true" is not honoured', async () => {
    signInAs({ role: 'student', superUser: 'true' })
    expect(await c.run(TOKEN, c.valid)).toMatchObject({ success: false, code: 'FORBIDDEN' })
    expectNoMutation()
  })
})

// ─── permission matrix (derived from the real permission table) ──

describe('permission matrix', () => {
  const scoped = ACTIONS.filter((a): a is ActionCase & { permission: Permission } => a.permission !== null)

  describe.each(scoped)('$name', (c) => {
    it.each(USER_ROLES)('role %s is allowed iff it holds the permission', async (role) => {
      signInAs({ role })
      const res = await c.run(TOKEN, c.valid)
      if (hasPermission(role, c.permission)) {
        expect(res).toMatchObject({ success: true })
      } else {
        expect(res).toMatchObject({ success: false, code: 'FORBIDDEN' })
      }
    })
  })

  it.each(USER_ROLES)('setMaintenanceMode: role %s is allowed iff admin', async (role) => {
    signInAs({ role })
    const res = await actions.setMaintenanceMode(TOKEN, true)
    expect(res.success).toBe(role === 'admin')
    if (role !== 'admin') expect(res.code).toBe('FORBIDDEN')
  })
})
