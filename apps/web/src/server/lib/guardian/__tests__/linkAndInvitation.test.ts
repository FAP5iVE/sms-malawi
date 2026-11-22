// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { LINK_TRANSITIONS, evaluateApproval, evaluateReinstatement, grantsAccess, nextStatus, permissionFor, type LinkAction } from '../linkStateMachine'
import {
  MIN_PEPPER_LENGTH, formatInvitationCode, generateInvitationCode, hashInvitationSecret, parseInvitationCode, verifyInvitationSecret,
} from '../invitationCode'
import { GUARDIAN_LINK_STATUSES, INVITATION_CODE_ALPHABET, INVITATION_REF_LENGTH, INVITATION_SECRET_LENGTH } from '@shared/constants/guardianPortal'
import { hasPermission } from '@shared/types/permissions'

const ACTIONS = Object.keys(LINK_TRANSITIONS) as LinkAction[]

describe('link state machine', () => {
  it('encodes exactly the intended transitions', () => {
    const table = Object.fromEntries(ACTIONS.flatMap((a) => GUARDIAN_LINK_STATUSES.map((s) => [`${a}:${s}`, nextStatus(a, s)])))
    const allowed = Object.entries(table).filter(([, v]) => v !== null)
    expect(Object.fromEntries(allowed)).toEqual({
      'approve:PENDING': 'ACTIVE', 'reject:PENDING': 'REJECTED', 'suspend:ACTIVE': 'SUSPENDED',
      'reinstate:SUSPENDED': 'ACTIVE', 'revoke:ACTIVE': 'REVOKED', 'revoke:SUSPENDED': 'REVOKED',
      'reopen:REJECTED': 'PENDING', 'reopen:REVOKED': 'PENDING',
    })
  })

  it('only ACTIVE confers access, and ACTIVE is reachable only through approve or reinstate', () => {
    for (const s of GUARDIAN_LINK_STATUSES) expect(grantsAccess(s)).toBe(s === 'ACTIVE')
    expect(grantsAccess(undefined)).toBe(false)
    expect(grantsAccess('active')).toBe(false)
    const toActive = ACTIONS.filter((a) => LINK_TRANSITIONS[a].to === 'ACTIVE')
    expect(toActive.sort()).toEqual(['approve', 'reinstate'])
  })

  it('REVOKED and REJECTED can never become ACTIVE directly: re-verification (reopen -> PENDING) comes first', () => {
    for (const a of ACTIONS) for (const s of ['REVOKED', 'REJECTED']) {
      if (nextStatus(a, s) === 'ACTIVE') throw new Error(`${a} from ${s} reaches ACTIVE`)
    }
  })

  it('unknown statuses and non-strings never transition', () => {
    for (const a of ACTIONS) for (const s of [undefined, null, 5, '', 'active', 'ARCHIVED']) expect(nextStatus(a, s)).toBeNull()
  })

  it('easing access needs guardian.approve; tightening it needs guardian.restrict', () => {
    for (const a of ['approve', 'reject', 'reinstate', 'reopen'] as const) expect(permissionFor(a)).toBe('guardian.approve')
    for (const a of ['suspend', 'revoke'] as const) expect(permissionFor(a)).toBe('guardian.restrict')
  })

  it('a registrar (lower_rank) cannot perform any status transition', () => {
    for (const a of ACTIONS) expect(hasPermission('lower_rank', permissionFor(a)), a).toBe(false)
    for (const a of ACTIONS) expect(hasPermission('admin', permissionFor(a)), a).toBe(true)
  })
})

describe('evaluateApproval', () => {
  const ok = {
    link: { status: 'PENDING', evidence: 'IN_PERSON_VERIFIED', reverifyRequired: false, suggestedProfileId: null, suggestedMethod: null },
    profile: { status: 'ACTIVE' }, capabilities: ['results', 'profile'],
  }
  const codes = (over: object) => evaluateApproval({ ...ok, ...over } as never).map((p) => p.code)

  it('a verified, pending link with capabilities and an active person is approvable', () => {
    expect(evaluateApproval(ok)).toEqual([])
  })
  it('requires recorded evidence', () => {
    expect(codes({ link: { ...ok.link, evidence: 'NONE' } })).toEqual(['NO_EVIDENCE'])
    expect(codes({ link: { ...ok.link, evidence: 'DOCUMENT_SEEN' } })).toEqual([])
  })
  it('refuses anything that is not pending', () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'REVOKED', 'REJECTED']) expect(codes({ link: { ...ok.link, status } })).toContain('NOT_PENDING')
  })
  it('refuses a suspended or merged person', () => {
    for (const status of ['SUSPENDED', 'MERGED']) expect(codes({ profile: { status } })).toEqual(['PROFILE_NOT_ACTIVE'])
  })
  it('refuses empty or junk capabilities', () => {
    for (const capabilities of [[], ['admin'], undefined, 'results', null]) expect(codes({ capabilities })).toEqual(['NO_CAPABILITIES'])
  })
  it('a strong match to an existing profile must be resolved or explicitly acknowledged; a weak one need not be', () => {
    const strong = { link: { ...ok.link, suggestedProfileId: 'p9', suggestedMethod: 'PHONE_NAME' } }
    expect(codes(strong)).toEqual(['UNRESOLVED_MATCH'])
    expect(evaluateApproval({ ...ok, ...strong, acknowledgeSuggestion: true } as never)).toEqual([])
    expect(codes({ link: { ...ok.link, suggestedProfileId: 'p9', suggestedMethod: 'PHONE_SHARED' } })).toEqual([])
  })
  it('reports every problem at once so staff can fix them in one pass', () => {
    expect(codes({ link: { ...ok.link, status: 'ACTIVE', evidence: 'NONE' }, profile: { status: 'MERGED' }, capabilities: [] }).sort())
      .toEqual(['NOT_PENDING', 'NO_CAPABILITIES', 'NO_EVIDENCE', 'PROFILE_NOT_ACTIVE'])
  })
})

describe('evaluateReinstatement', () => {
  it('needs a suspended link, a good-standing person and evidence', () => {
    expect(evaluateReinstatement({ link: { status: 'SUSPENDED', evidence: 'DOCUMENT_SEEN' }, profile: { status: 'ACTIVE' } })).toEqual([])
    expect(evaluateReinstatement({ link: { status: 'ACTIVE', evidence: 'NONE' }, profile: { status: 'SUSPENDED' } }).map((p) => p.code).sort())
      .toEqual(['NOT_SUSPENDED', 'NO_EVIDENCE', 'PROFILE_NOT_ACTIVE'])
  })
})

describe('invitation codes', () => {
  const PEPPER = 'p'.repeat(MIN_PEPPER_LENGTH)

  it('generates a ref and secret of the right length from the unambiguous alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const c = generateInvitationCode()
      expect(c.ref).toHaveLength(INVITATION_REF_LENGTH)
      expect(c.secret).toHaveLength(INVITATION_SECRET_LENGTH)
      for (const ch of c.ref + c.secret) expect(INVITATION_CODE_ALPHABET.includes(ch)).toBe(true)
      expect(c.display).toMatch(/^[A-Z2-9]{6}-[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    }
  })

  it('does not repeat: 5000 codes, no duplicate secrets', () => {
    const secrets = new Set(Array.from({ length: 5000 }, () => generateInvitationCode().secret))
    expect(secrets.size).toBe(5000)
  })

  it('uses every character of the alphabet roughly evenly (no modulo bias toward the start)', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 3000; i++) for (const ch of generateInvitationCode().secret) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    expect(counts.size).toBe(INVITATION_CODE_ALPHABET.length)
    const vals = [...counts.values()]
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    for (const v of vals) expect(Math.abs(v - mean) / mean).toBeLessThan(0.15)
  })

  it('parse round-trips and is forgiving about case, spaces and dashes', () => {
    const c = generateInvitationCode()
    expect(parseInvitationCode(c.display)).toEqual({ ref: c.ref, secret: c.secret })
    expect(parseInvitationCode(c.display.toLowerCase())).toEqual({ ref: c.ref, secret: c.secret })
    expect(parseInvitationCode(` ${c.ref} ${c.secret.slice(0, 5)}  ${c.secret.slice(5)} `)).toEqual({ ref: c.ref, secret: c.secret })
    expect(parseInvitationCode(c.ref + c.secret)).toEqual({ ref: c.ref, secret: c.secret })
    expect(formatInvitationCode('ABCDEF', 'GHJKMNPQRS')).toBe('ABCDEF-GHJKM-NPQRS')
  })

  it('rejects look-alike characters, wrong lengths and non-strings', () => {
    for (const bad of ['ABCDEF-GHJKM-NPQR0', 'ABCDEF-GHJKM-NPQRO', 'ABCDEF-GHJKM-NPQR1', 'ABCDEF-GHJKM-NPQRI', 'ABCDEF-GHJKM-NPQRL',
      'ABCDEF-GHJKM-NPQR', 'ABCDEF-GHJKM-NPQRSS', '', '   ', 'x'.repeat(65), null, undefined, 123456, {}, ['ABCDEF']]) {
      expect(parseInvitationCode(bad as never), String(bad)).toBeNull()
    }
  })

  it('the hash is keyed, deterministic, and bound to the ref', () => {
    const h = hashInvitationSecret('ABCDEF', 'GHJKMNPQRS', PEPPER)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashInvitationSecret('ABCDEF', 'GHJKMNPQRS', PEPPER)).toBe(h)
    expect(hashInvitationSecret('ABCDEG', 'GHJKMNPQRS', PEPPER)).not.toBe(h)       // another row, same secret
    expect(hashInvitationSecret('ABCDEF', 'GHJKMNPQRT', PEPPER)).not.toBe(h)
    expect(hashInvitationSecret('ABCDEF', 'GHJKMNPQRS', 'q'.repeat(MIN_PEPPER_LENGTH))).not.toBe(h) // no pepper, no verify
    expect(h).not.toContain('GHJKMNPQRS')
  })

  it('verifies the right secret and refuses wrong ones, wrong rows and malformed stored values', () => {
    const stored = hashInvitationSecret('ABCDEF', 'GHJKMNPQRS', PEPPER)
    expect(verifyInvitationSecret('ABCDEF', 'GHJKMNPQRS', stored, PEPPER)).toBe(true)
    expect(verifyInvitationSecret('ABCDEF', 'GHJKMNPQRT', stored, PEPPER)).toBe(false)
    expect(verifyInvitationSecret('ZZZZZZ', 'GHJKMNPQRS', stored, PEPPER)).toBe(false)
    for (const bad of [null, undefined, '', 'abc', 'zz'.repeat(32), stored.slice(0, 62), stored + '00', 5]) {
      expect(verifyInvitationSecret('ABCDEF', 'GHJKMNPQRS', bad, PEPPER), String(bad)).toBe(false)
    }
  })

  it('refuses to hash or verify without a strong pepper (a missing secret must never mean "no protection")', () => {
    for (const bad of [undefined, null, '', 'short', 'x'.repeat(MIN_PEPPER_LENGTH - 1), 12345]) {
      expect(() => hashInvitationSecret('ABCDEF', 'GHJKMNPQRS', bad as never)).toThrow('GUARDIAN_INVITATION_PEPPER')
      expect(() => verifyInvitationSecret('ABCDEF', 'GHJKMNPQRS', 'a'.repeat(64), bad as never)).toThrow('GUARDIAN_INVITATION_PEPPER')
    }
  })
})

import { buildInvitationEmail } from '../invitationEmail'

describe('invitation email', () => {
  const input = { schoolName: 'St <b>Mary\'s</b> & Co', code: 'ABCDEF-GHJKM-NPQRS', claimUrl: 'https://x.test/login?claim=1', expiresAt: new Date('2026-11-08T10:00:00Z') }
  it('contains the code, the link and the expiry in both parts, and escapes the school name in HTML', () => {
    const m = buildInvitationEmail(input)
    for (const part of [m.html, m.text]) {
      expect(part).toContain('ABCDEF-GHJKM-NPQRS')
      expect(part).toContain('https://x.test/login?claim=1')
      expect(part).toContain('Sun, 08 Nov 2026 10:00:00 GMT')
    }
    expect(m.html).not.toContain('<b>Mary')
    expect(m.html).toContain('&lt;b&gt;')
    expect(m.subject).toContain('parent portal')
  })
  it('warns the reader never to share the code', () => {
    expect(buildInvitationEmail(input).text.toLowerCase()).toContain('never share')
  })
})
