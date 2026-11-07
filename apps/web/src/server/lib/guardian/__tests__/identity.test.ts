// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { extractPhones, maskPhone, normalizeEmail, normalizePhone } from '../phone'
import { isPlaceholderName, nameSimilarity, normalizeName, tokenizeName } from '../names'
import { mapRelationship } from '../relationship'
import { buildGuardianProposal, detectDirectoryDrift } from '../proposal'
import { isStrongMatch, suggestMatches, type ExistingProfile } from '../matching'

describe('normalizePhone: Malawi formats the school actually has', () => {
  const MOBILE = '+265999123456'
  it.each([
    ['0999123456', MOBILE], ['0999 123 456', MOBILE], ['+265 999 123 456', MOBILE], ['+265-999-123-456', MOBILE],
    ['265999123456', MOBILE], ['00265999123456', MOBILE], ['+265 (0) 999 123 456', MOBILE],
    ['999123456', MOBILE], ['(0999) 123.456', MOBILE], ['+2650999123456', MOBILE], ['2650999123456', MOBILE],
    ['  0999123456  ', MOBILE], ['0888111222', '+265888111222'], ['0881234567', '+265881234567'],
  ])('%s -> %s', (raw, e164) => {
    expect(normalizePhone(raw)).toEqual({ e164, kind: 'MOBILE' })
  })

  it('recognises landlines', () => {
    expect(normalizePhone('01 755 123')).toEqual({ e164: '+2651755123', kind: 'LANDLINE' })
    expect(normalizePhone('+265 1 755 1234')).toEqual({ e164: '+26517551234', kind: 'LANDLINE' })
  })

  it('accepts a plausible foreign number but never invents a Malawian one', () => {
    expect(normalizePhone('+260 97 1234567')).toEqual({ e164: '+260971234567', kind: 'INTERNATIONAL' })
    expect(normalizePhone('+1 202 555 0143')).toEqual({ e164: '+12025550143', kind: 'INTERNATIONAL' })
    expect(normalizePhone('0027 82 123 4567')).toEqual({ e164: '+27821234567', kind: 'INTERNATIONAL' })
  })

  it.each([
    '', '   ', 'abc', 'N/A', 'unknown', '0999 12', '12345', '0999123456789', '0799123456', '+265 799123456',
    '++265999123456', '265+999123456', '0999-123-456 ext 5', '+265 99 12', '0000000000', '+0999123456',
  ])('rejects %j', (raw) => {
    expect(normalizePhone(raw)).toBeNull()
  })

  it('rejects non-strings and absurd lengths', () => {
    for (const v of [null, undefined, 999123456, {}, [], true]) expect(normalizePhone(v)).toBeNull()
    expect(normalizePhone('0'.repeat(41))).toBeNull()
  })

  it('is idempotent: normalising an E.164 result returns the same number', () => {
    for (const raw of ['0999123456', '01 755 123', '+260 97 1234567']) {
      const once = normalizePhone(raw)!
      expect(normalizePhone(once.e164)).toEqual(once)
    }
  })
})

describe('extractPhones: several numbers in one free-text field', () => {
  it('splits on slash, comma, semicolon, "or", "and" and "na"', () => {
    for (const raw of ['0999123456 / 0888111222', '0999123456, 0888111222', '0999123456;0888111222',
      '0999123456 or 0888111222', '0999123456 and 0888111222', '0999123456 na 0888111222', '0999123456\n0888111222']) {
      expect(extractPhones(raw).map((p) => p.e164), raw).toEqual(['+265999123456', '+265888111222'])
    }
  })
  it('splits two space-separated numbers and de-duplicates formatting variants', () => {
    expect(extractPhones('0999 123 456 0888 111 222').map((p) => p.e164)).toEqual(['+265999123456', '+265888111222'])
    expect(extractPhones('0999123456, +265 999 123 456').map((p) => p.e164)).toEqual(['+265999123456'])
  })
  it('keeps order (first = what the clerk considered primary) and returns [] for junk', () => {
    expect(extractPhones('0888111222 / 0999123456')[0]!.e164).toBe('+265888111222')
    for (const raw of ['', 'N/A', 'none', null, undefined, 5]) expect(extractPhones(raw)).toEqual([])
  })
  it('maskPhone shows only the last four digits', () => {
    expect(maskPhone('+265999123456')).toBe('********3456')
    expect(maskPhone('123')).toBe('****')
    expect(maskPhone('+265999123456')).not.toContain('99912')
  })
})

describe('normalizeEmail', () => {
  it('lower-cases and trims; rejects malformed', () => {
    expect(normalizeEmail('  Jane@Mail.COM ')).toBe('jane@mail.com')
    for (const bad of ['', 'jane@', 'jane@mail', 'a b@c.com', '@x.com', 'x@.com', null, undefined, 4]) expect(normalizeEmail(bad)).toBeNull()
  })
})

describe('names', () => {
  it('drops titles, punctuation, diacritics and casing; keeps apostrophes in surnames', () => {
    expect(normalizeName('  REV. John  Banda ')).toBe('john banda')
    expect(normalizeName('Mrs. Mary Ng\u2019oma')).toBe("mary ng'oma")
    expect(normalizeName('Jos\u00e9 Phiri')).toBe('jose phiri')
    expect(normalizeName('J.Banda')).toBe('j banda')
    expect(tokenizeName(undefined)).toEqual([])
  })

  it('flags placeholders and unusable names', () => {
    for (const v of ['', ' ', 'N/A', 'n/a', 'none', 'Unknown', 'x', '-', '12345', 'Guardian', 'Mr', 'TBC', null, undefined]) {
      expect(isPlaceholderName(v), String(v)).toBe(true)
    }
    for (const v of ['John Banda', 'Li', 'Ng\u2019oma', 'Mary']) expect(isPlaceholderName(v), v).toBe(false)
  })

  it('similarity: order, initials, typos, strangers', () => {
    expect(nameSimilarity('John Banda', 'Banda John')).toBe(1)
    expect(nameSimilarity('Mrs Mary Banda', 'mary banda')).toBe(1)
    expect(nameSimilarity('J. Banda', 'John Banda')).toBeGreaterThanOrEqual(0.8)
    expect(nameSimilarity('Mary Banda', 'Mary Bandaa')).toBeGreaterThanOrEqual(0.8)
    expect(nameSimilarity("Mary Ng'oma", 'Mary Ngoma')).toBeGreaterThanOrEqual(0.8)
    expect(nameSimilarity('John Banda', 'John Phiri')).toBeLessThan(0.8)
    expect(nameSimilarity('Peter Moyo', 'Anna Phiri')).toBe(0)
    expect(nameSimilarity('', 'John')).toBe(0)
    expect(nameSimilarity('Chikondi Banda', 'Chikondi Mwale Banda')).toBeLessThan(0.8)
  })
})

describe('mapRelationship', () => {
  it('exact values (any case) map without a note', () => {
    for (const r of ['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Elder Sibling', 'Other Relative', 'Other']) {
      expect(mapRelationship(r)).toEqual({ relationship: r, note: null })
      expect(mapRelationship(r.toUpperCase()).relationship).toBe(r)
    }
  })
  it('common synonyms map; lossy ones keep the original wording', () => {
    expect(mapRelationship('MUM')).toEqual({ relationship: 'Mother', note: null })
    expect(mapRelationship('dad')).toEqual({ relationship: 'Father', note: null })
    expect(mapRelationship('Auntie')).toEqual({ relationship: 'Aunt', note: null })
    expect(mapRelationship('Gogo')).toEqual({ relationship: 'Grandparent', note: 'Gogo' })
    expect(mapRelationship('Big sister')).toEqual({ relationship: 'Elder Sibling', note: 'Big sister' })
    expect(mapRelationship('Stepmother')).toEqual({ relationship: 'Other Relative', note: 'Stepmother' })
  })
  it('unknown or empty become Other without losing the text, and are length-capped', () => {
    expect(mapRelationship('Neighbour')).toEqual({ relationship: 'Other', note: 'Neighbour' })
    expect(mapRelationship('')).toEqual({ relationship: 'Other', note: null })
    expect(mapRelationship(undefined)).toEqual({ relationship: 'Other', note: null })
    expect(mapRelationship('x'.repeat(500)).note!.length).toBe(120)
  })
})

describe('buildGuardianProposal', () => {
  const good = { fullName: 'Mrs Mary Banda', relation: 'Mother', phone: '0999 123 456', altPhone: '0888111222', email: 'Mary@Mail.com', isPrimary: true, isFeePayer: true }

  it('a clean card yields a usable proposal with ordered contacts and sensible defaults', () => {
    const p = buildGuardianProposal(good)
    expect(p.usable).toBe(true)
    expect(p.flags).toEqual([])
    expect(p.normalizedName).toBe('mary banda')
    expect(p.contacts.map((c) => [c.kind, c.normalizedValue, c.isPreferred])).toEqual([
      ['PHONE', '+265999123456', true], ['PHONE', '+265888111222', false], ['EMAIL', 'mary@mail.com', false],
    ])
    expect(p.isPrimaryContact).toBe(true)
    expect(p.isFinancialResponsible).toBe(true)
    expect(p.suggestedCapabilities).toContain('fees')
  })

  it('a guardian who is not the fee payer is not offered the fees capability', () => {
    expect(buildGuardianProposal({ ...good, isFeePayer: false }).suggestedCapabilities).not.toContain('fees')
  })

  it('reports every data problem as a flag instead of guessing', () => {
    expect(buildGuardianProposal({ ...good, fullName: 'N/A' })).toMatchObject({ usable: false, flags: expect.arrayContaining(['NAME_PLACEHOLDER']) })
    expect(buildGuardianProposal({ ...good, phone: 'unknown', altPhone: null }).flags).toContain('PHONE_UNUSABLE')
    expect(buildGuardianProposal({ ...good, phone: '0999123456 / 0888111222' }).flags).toContain('PHONE_MULTIPLE')
    expect(buildGuardianProposal({ ...good, email: 'jane@' }).flags).toContain('EMAIL_INVALID')
    const odd = buildGuardianProposal({ ...good, relation: 'Neighbour' })
    expect(odd.flags).toContain('RELATION_MAPPED')
    expect(odd).toMatchObject({ relationship: 'Other', relationshipNote: 'Neighbour' })
  })

  it('an email-only guardian makes the email the preferred contact', () => {
    const p = buildGuardianProposal({ ...good, phone: 'none', altPhone: null })
    expect(p.contacts).toEqual([{ kind: 'EMAIL', value: 'Mary@Mail.com', normalizedValue: 'mary@mail.com', isPreferred: true }])
  })
})

describe('detectDirectoryDrift', () => {
  const base = { fullName: 'Mary Banda', relation: 'Mother', phone: '0999123456', altPhone: null, email: 'mary@mail.com' }

  it('formatting-only edits never raise a flag', () => {
    const d = detectDirectoryDrift(base, { ...base, fullName: 'MRS  mary banda', relation: 'mum', phone: '+265 999 123 456', email: ' Mary@Mail.com ' })
    expect(d.requiresReverify).toBe(false)
    expect(d.changed).toEqual([])
  })
  it('a different person, relationship, number or email does', () => {
    expect(detectDirectoryDrift(base, { ...base, fullName: 'Grace Banda' }).changed).toEqual(['name'])
    expect(detectDirectoryDrift(base, { ...base, relation: 'Aunt' }).changed).toEqual(['relationship'])
    expect(detectDirectoryDrift(base, { ...base, phone: '0888111222' }).changed).toEqual(['phone'])
    expect(detectDirectoryDrift(base, { ...base, email: 'other@mail.com' }).changed).toEqual(['email'])
    expect(detectDirectoryDrift(base, { ...base, fullName: 'Grace Banda', phone: '0888111222' }).requiresReverify).toBe(true)
  })
  it('adding an extra number is not drift, removing the original is', () => {
    expect(detectDirectoryDrift(base, { ...base, altPhone: '0888111222' }).requiresReverify).toBe(false)
    expect(detectDirectoryDrift({ ...base, altPhone: '0888111222' }, { ...base, altPhone: null }).phoneChanged).toBe(true)
  })
})

describe('suggestMatches: suggestions only, never automatic', () => {
  const profile = (id: string, fullName: string, phones: string[], emails: string[] = [], status = 'ACTIVE'): ExistingProfile => ({
    id, fullName, status,
    contacts: [...phones.map((v) => ({ kind: 'PHONE' as const, normalizedValue: v })), ...emails.map((v) => ({ kind: 'EMAIL' as const, normalizedValue: v }))],
  })
  const cand = { name: 'Mary Banda', phones: ['+265999123456'], email: 'mary@mail.com' }

  it('same phone and same name is a strong match', () => {
    const [m] = suggestMatches(cand, [profile('p1', 'Mrs Mary Banda', ['+265999123456'])])
    expect(m).toMatchObject({ profileId: 'p1', method: 'PHONE_NAME', score: 0.95 })
    expect(isStrongMatch(m!)).toBe(true)
  })
  it('same phone but a different name is only a weak "shared phone" hint, never strong', () => {
    const [m] = suggestMatches(cand, [profile('p2', 'Peter Moyo', ['+265999123456'])])
    expect(m!.method).toBe('PHONE_SHARED')
    expect(m!.score).toBeGreaterThanOrEqual(0.4)
    expect(m!.score).toBeLessThan(0.8)
    expect(isStrongMatch(m!)).toBe(false)
  })
  it('email + name is the strongest; email alone is still a good hint', () => {
    expect(suggestMatches(cand, [profile('p3', 'Mary Banda', [], ['mary@mail.com'])])[0]).toMatchObject({ method: 'EMAIL_NAME', score: 1 })
    expect(suggestMatches(cand, [profile('p4', 'Someone Else', [], ['mary@mail.com'])])[0]).toMatchObject({ method: 'EMAIL', score: 0.85 })
  })
  it('a matching NAME alone never produces a suggestion', () => {
    expect(suggestMatches(cand, [profile('p5', 'Mary Banda', ['+265777000111'], ['x@y.com'])])).toEqual([])
  })
  it('merged profiles are never a target; suspended ones are shown with their status', () => {
    const res = suggestMatches(cand, [
      profile('m', 'Mary Banda', ['+265999123456'], [], 'MERGED'),
      profile('s', 'Mary Banda', ['+265999123456'], [], 'SUSPENDED'),
    ])
    expect(res.map((r) => r.profileId)).toEqual(['s'])
    expect(res[0]!.profileStatus).toBe('SUSPENDED')
  })
  it('ranks best first with a stable tie-break, and handles a candidate with no contacts', () => {
    const res = suggestMatches(cand, [
      profile('b', 'Peter Moyo', ['+265999123456']),
      profile('a', 'Mary Banda', [], ['mary@mail.com']),
      profile('c', 'Mary Banda', ['+265999123456']),
    ])
    expect(res.map((r) => r.profileId)).toEqual(['a', 'c', 'b'])
    expect(suggestMatches({ name: 'Mary Banda', phones: [], email: null }, [profile('x', 'Mary Banda', ['+265999123456'])])).toEqual([])
  })
})
