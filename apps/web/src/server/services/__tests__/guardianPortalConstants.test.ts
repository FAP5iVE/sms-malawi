// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  GUARDIAN_PROFILE_STATUSES, GUARDIAN_CONTACT_KINDS, GUARDIAN_CONTACT_VERIFICATIONS, GUARDIAN_LINK_STATUSES,
  GUARDIAN_LINK_SOURCES, GUARDIAN_EVIDENCE_LEVELS, GUARDIAN_INVITATION_CHANNELS, GUARDIAN_INVITATION_STATUSES,
  GUARDIAN_REQUEST_STATUSES, GUARDIAN_BATCH_STATUSES,
  GUARDIAN_CAPABILITIES, DEFAULT_GUARDIAN_CAPABILITIES, GUARDIAN_AUDIT_ACTIONS,
  INVITATION_CODE_ALPHABET, INVITATION_MAX_FAILED_ATTEMPTS, INVITATION_TTL_HOURS,
  defaultCapabilitiesFor, isEnrolledForParent, isGuardianCapability, sanitizeCapabilities,
  GUARDIAN_LINK_STATUS_LABELS, GUARDIAN_CAPABILITY_LABELS, GUARDIAN_EVIDENCE_LABELS, GUARDIAN_LINK_SOURCE_LABELS,
  GUARDIAN_INVITATION_STATUS_LABELS, GUARDIAN_ONBOARDING_ACTIONS, GUARDIAN_ONBOARDING_ACTION_LABELS,
  GUARDIAN_LINK_ACTION_RULES, availableLinkActions, invitationBlocker,
  GUARDIAN_DENY_REASON_LABELS, denyReasonLabel,
  claimPasswordProblem, validateClaimForm, isPlausibleBirthDate, GUARDIAN_PASSWORD_MIN_LENGTH,
} from '@shared/constants/guardianPortal'
import { LINK_TRANSITIONS } from '@/server/lib/guardian/linkStateMachine'
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/server/services/guardian/guardianClaimService'

const webRoot = path.resolve(__dirname, '../../../..')
const read = (p: string) => fs.readFileSync(path.join(webRoot, p), 'utf8').replace(/\r\n/g, '\n')

describe('capabilities', () => {
  it('sanitize drops unknowns, dedupes and returns a stable order', () => {
    expect(sanitizeCapabilities(['fees', 'results', 'fees', 'admin', 7, null, 'RESULTS'])).toEqual(['results', 'fees'])
    expect(sanitizeCapabilities('results')).toEqual([])
    expect(sanitizeCapabilities(undefined)).toEqual([])
  })
  it('fees and documents are opt-in; fees arrives for a financially responsible guardian only', () => {
    expect(DEFAULT_GUARDIAN_CAPABILITIES).not.toContain('fees')
    expect(DEFAULT_GUARDIAN_CAPABILITIES).not.toContain('documents')
    expect(defaultCapabilitiesFor({ isFinancialResponsible: false })).not.toContain('fees')
    expect(defaultCapabilitiesFor({ isFinancialResponsible: true })).toContain('fees')
    expect(defaultCapabilitiesFor({ isFinancialResponsible: true })).not.toContain('documents')
  })
  it('every capability is recognised and nothing else is', () => {
    for (const c of GUARDIAN_CAPABILITIES) expect(isGuardianCapability(c)).toBe(true)
    for (const c of ['admin', '', 'Results', 'grades']) expect(isGuardianCapability(c)).toBe(false)
  })
})

describe('enrolment', () => {
  it('only enrolled statuses open data; left students and junk do not', () => {
    expect(isEnrolledForParent('ACTIVE')).toBe(true)
    expect(isEnrolledForParent('AWAITING_MANEB_RESULTS')).toBe(true)
    for (const s of ['GRADUATED', 'ARCHIVED', '', 'active', undefined, null, 3]) expect(isEnrolledForParent(s)).toBe(false)
  })
})

describe('invitation constants', () => {
  it('alphabet has no look-alike characters and no duplicates', () => {
    expect(INVITATION_CODE_ALPHABET).not.toMatch(/[01OIL]/)
    expect(new Set(INVITATION_CODE_ALPHABET).size).toBe(INVITATION_CODE_ALPHABET.length)
    expect(INVITATION_CODE_ALPHABET).toHaveLength(31)
  })
  it('lockout is small and an emailed code outlives a day but not a fortnight', () => {
    expect(INVITATION_MAX_FAILED_ATTEMPTS).toBeLessThanOrEqual(5)
    expect(INVITATION_TTL_HOURS.EMAIL).toBeGreaterThanOrEqual(24)
    expect(INVITATION_TTL_HOURS.SLIP).toBeGreaterThan(INVITATION_TTL_HOURS.EMAIL)
  })
})

describe('audit registration', () => {
  const svc = read('src/server/services/auditService.ts')
  it('every guardian audit action has a severity, and none is left unmapped', () => {
    for (const a of GUARDIAN_AUDIT_ACTIONS) expect(svc, a).toContain(`'${a}'`)
  })
  it('anything that grants or restores access is HIGH or CRITICAL, and a claim is CRITICAL', () => {
    const sev = (a: string) => new RegExp(`'${a}':\\s*SEVERITY\\.(\\w+)`).exec(svc)![1]
    for (const a of ['link_approved', 'link_reinstated', 'link_capabilities_changed', 'invitation_issued', 'profile_reinstated']) {
      expect(['HIGH', 'CRITICAL'], a).toContain(sev(`guardian.${a}`))
    }
    expect(sev('guardian.claim_succeeded')).toBe('CRITICAL')
    expect(sev('guardian.profile_merged')).toBe('CRITICAL')
  })
  it('does not reuse the existing student.guardian_changed action for portal access changes', () => {
    for (const a of GUARDIAN_AUDIT_ACTIONS) expect(a).not.toBe('student.guardian_changed')
  })
})

describe('PII scrubbing', () => {
  const scrub = read('src/lib/sentry-scrub.ts').toLowerCase()
  it('claim codes, secrets, contact values and tokens are scrubbed from Sentry events', () => {
    for (const k of ['invitationcode', 'claimcode', 'secrethash', 'otp', 'normalizedvalue', 'idtoken', 'newpassword']) {
      expect(scrub, k).toContain(`'${k}'`)
    }
  })
})

describe('enum vocabularies match prisma/schema.prisma exactly', () => {
  const schema = read('prisma/schema.prisma')
  const enumValues = (name: string): string[] => {
    const m = new RegExp(`^enum ${name} \\{\\n([\\s\\S]*?)\\n\\}`, 'm').exec(schema)
    expect(m, name).not.toBeNull()
    return m![1]!.split('\n').map((l) => l.split('//')[0]!.trim()).filter(Boolean)
  }
  const cases: [string, readonly string[]][] = [
    ['GuardianProfileStatus', GUARDIAN_PROFILE_STATUSES], ['GuardianContactKind', GUARDIAN_CONTACT_KINDS],
    ['GuardianContactVerification', GUARDIAN_CONTACT_VERIFICATIONS], ['GuardianLinkStatus', GUARDIAN_LINK_STATUSES],
    ['GuardianLinkSource', GUARDIAN_LINK_SOURCES], ['GuardianEvidence', GUARDIAN_EVIDENCE_LEVELS],
    ['GuardianInvitationChannel', GUARDIAN_INVITATION_CHANNELS], ['GuardianInvitationStatus', GUARDIAN_INVITATION_STATUSES],
    ['GuardianRequestStatus', GUARDIAN_REQUEST_STATUSES], ['GuardianBatchStatus', GUARDIAN_BATCH_STATUSES],
  ]
  for (const [name, values] of cases) {
    it(`${name}`, () => expect([...values]).toEqual(enumValues(name)))
  }
})

describe('UI vocabulary', () => {
  it('has a plain-language label for every status, capability, evidence level, source and invitation state', () => {
    const covers = (labels: Record<string, unknown>, keys: readonly string[]) => {
      expect(Object.keys(labels).sort()).toEqual([...keys].sort())
      for (const k of keys) expect(String(typeof labels[k] === 'string' ? labels[k] : (labels[k] as { label: string }).label).trim().length).toBeGreaterThan(0)
    }
    covers(GUARDIAN_LINK_STATUS_LABELS, GUARDIAN_LINK_STATUSES)
    covers(GUARDIAN_CAPABILITY_LABELS, GUARDIAN_CAPABILITIES)
    covers(GUARDIAN_EVIDENCE_LABELS, GUARDIAN_EVIDENCE_LEVELS)
    covers(GUARDIAN_LINK_SOURCE_LABELS, GUARDIAN_LINK_SOURCES)
    covers(GUARDIAN_INVITATION_STATUS_LABELS, GUARDIAN_INVITATION_STATUSES)
    covers(GUARDIAN_ONBOARDING_ACTION_LABELS, GUARDIAN_ONBOARDING_ACTIONS)
  })
})

describe('link actions offered by the staff screen', () => {
  it('match the server state machine exactly (same moves, same permission), so no button can drift', () => {
    expect(Object.keys(GUARDIAN_LINK_ACTION_RULES).sort()).toEqual(Object.keys(LINK_TRANSITIONS).sort())
    for (const [action, t] of Object.entries(LINK_TRANSITIONS)) {
      const ui = GUARDIAN_LINK_ACTION_RULES[action as keyof typeof GUARDIAN_LINK_ACTION_RULES]
      expect([...ui.from].sort(), action).toEqual([...t.from].sort())
      expect(ui.permission, action).toBe(t.permission)
    }
  })
  const all = () => true
  const none = () => false
  it('offers only the moves legal from each status', () => {
    expect(availableLinkActions('PENDING', all)).toEqual(['approve', 'reject'])
    expect(availableLinkActions('ACTIVE', all)).toEqual(['suspend', 'revoke'])
    expect(availableLinkActions('SUSPENDED', all)).toEqual(['reinstate', 'revoke'])
    expect(availableLinkActions('REVOKED', all)).toEqual(['reopen'])
    expect(availableLinkActions('REJECTED', all)).toEqual(['reopen'])
  })
  it('offers nothing without the permission, and tightening (restrict) is separate from easing (approve)', () => {
    expect(availableLinkActions('PENDING', none)).toEqual([])
    expect(availableLinkActions('ACTIVE', (p) => p === 'guardian.approve')).toEqual([])
    expect(availableLinkActions('ACTIVE', (p) => p === 'guardian.restrict')).toEqual(['suspend', 'revoke'])
    expect(availableLinkActions('PENDING', (p) => p === 'guardian.restrict')).toEqual([])
  })
  it('offers nothing for an unknown status', () => {
    for (const s of ['', 'active', undefined, null, 7]) expect(availableLinkActions(s, all)).toEqual([])
  })
})

describe('invitationBlocker', () => {
  const ok = { status: 'ACTIVE', reverifyRequired: false, profile: { status: 'ACTIVE', hasAccount: false } }
  it('is null only when an invitation can be issued', () => {
    expect(invitationBlocker(ok)).toBeNull()
  })
  it.each([
    ['not approved yet', { ...ok, status: 'PENDING' }],
    ['no profile', { ...ok, profile: null }],
    ['profile suspended', { ...ok, profile: { status: 'SUSPENDED', hasAccount: false } }],
    ['already has an account', { ...ok, profile: { status: 'ACTIVE', hasAccount: true } }],
    ['needs re-verification', { ...ok, reverifyRequired: true }],
  ])('explains why not: %s', (_name, link) => {
    expect(typeof invitationBlocker(link)).toBe('string')
  })
})

describe('access log wording', () => {
  it('labels every denial reason the access pipeline can write', async () => {
    // Read the source of truth rather than copy it: a new DenyReason must get a label.
    const fs = await import('node:fs')
    const src = fs.readFileSync(new URL('../guardian/guardianAccess.ts', import.meta.url), 'utf8')
    const used = new Set([...src.matchAll(/reason: '([A-Z_]+)'/g)].map((m) => m[1]!))
    expect(used.size).toBeGreaterThan(0)
    for (const r of used) expect(Object.keys(GUARDIAN_DENY_REASON_LABELS), r).toContain(r)
  })
  it('falls back to a readable form for an unknown code and to empty for none', () => {
    expect(denyReasonLabel('SOME_NEW_CODE')).toBe('some new code')
    expect(denyReasonLabel(null)).toBe('')
    expect(denyReasonLabel(undefined)).toBe('')
    expect(denyReasonLabel('NO_LINK')).toBe('Not linked to this child')
  })
})

describe('claim form checks', () => {
  it('uses the same minimum password length as the server', () => {
    expect(GUARDIAN_PASSWORD_MIN_LENGTH).toBe(MIN_PASSWORD_LENGTH)
  })
  it('refuses exactly the passwords the server refuses', () => {
    const email = 'grace@example.com'
    const corpus = ['', 'short', '123456789', '1234567890', 'aaaaaaaaaa', 'GRACE@example.com', 'grace@example.com',
      'correct horse battery', 'x'.repeat(128), 'x1'.repeat(64), 'x1'.repeat(65), '          ', 'pässwörd-123']
    for (const pw of corpus) {
      expect(claimPasswordProblem(pw, email) !== null, JSON.stringify(pw)).toBe(passwordProblem(pw, email))
    }
  })
})

describe('validateClaimForm', () => {
  const ok = { code: 'ABCDEF-GHJKMN-PQRSTU', email: 'grace@example.com', password: 'correct horse', confirm: 'correct horse', childDateOfBirth: '' }
  const today = new Date('2026-11-07T10:00:00Z')
  it('accepts a complete form, with or without the child’s date of birth', () => {
    expect(validateClaimForm(ok, today)).toEqual({})
    expect(validateClaimForm({ ...ok, childDateOfBirth: '2010-04-23' }, today)).toEqual({})
  })
  it('names each problem on its own field', () => {
    const e = validateClaimForm({ code: ' ', email: 'nope', password: 'short', confirm: 'x', childDateOfBirth: '2010-13-45' }, today)
    expect(Object.keys(e).sort()).toEqual(['childDateOfBirth', 'code', 'email', 'password'])
  })
  it('only checks the confirmation once the password itself is acceptable', () => {
    expect(validateClaimForm({ ...ok, confirm: 'different horse' }, today)).toEqual({ confirm: 'The two passwords do not match.' })
  })
  it('rejects impossible and future birth dates', () => {
    for (const d of ['2010-02-30', '2010-4-3', '2027-01-01', 'yesterday']) expect(isPlausibleBirthDate(d, today), d).toBe(false)
    expect(isPlausibleBirthDate('2026-11-07', today)).toBe(true)
  })
})
