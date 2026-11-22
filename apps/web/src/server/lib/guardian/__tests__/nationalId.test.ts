// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { maskNationalId, nationalIdsConflict, normalizeNationalId } from '../nationalId'
import { isStrongMatch, suggestMatches, type ExistingProfile } from '../matching'

describe('normalizeNationalId', () => {
  it('compares equal however it was typed', () => {
    expect(normalizeNationalId('ab 12-cd34')).toBe('AB12CD34')
    expect(normalizeNationalId(' AB12CD34 ')).toBe('AB12CD34')
  })
  it.each(['', 'N/A', 'none', 'Not available', '00000000', 'AAAAAAAA', '12345678', '98765432', 'abc', 'x'.repeat(30)])(
    'refuses %j: a placeholder shared by many cards must never look like one person', (raw) => {
      expect(normalizeNationalId(raw)).toBeNull()
    })
  it('refuses non-strings', () => {
    expect(normalizeNationalId(null)).toBeNull()
    expect(normalizeNationalId(12345678)).toBeNull()
  })
})

describe('maskNationalId / nationalIdsConflict', () => {
  it('shows only the last three characters', () => {
    expect(maskNationalId('AB12CD34')).toBe('•••••D34')
    expect(maskNationalId(null)).toBeNull()
    expect(maskNationalId('AB12CD34')).not.toContain('AB12')
  })
  it('conflicts only when both are present and different', () => {
    expect(nationalIdsConflict('A1', 'B2')).toBe(true)
    expect(nationalIdsConflict('A1', 'A1')).toBe(false)
    expect(nationalIdsConflict(null, 'A1')).toBe(false)
  })
})

const profile = (id: string, fullName: string, extra: Partial<ExistingProfile> = {}): ExistingProfile =>
  ({ id, fullName, status: 'ACTIVE', contacts: [], ...extra })

describe('suggestMatches with a national ID', () => {
  const cand = { name: 'Mary Banda', phones: [] as string[], nationalId: 'AB12CD34' }

  it('same ID and similar name is the strongest match', () => {
    const [m] = suggestMatches(cand, [profile('p1', 'Mrs Mary Banda', { nationalId: 'AB12CD34' })])
    expect(m).toMatchObject({ profileId: 'p1', method: 'NATIONAL_ID_NAME' })
    expect(isStrongMatch(m!)).toBe(true)
  })

  it('same ID but a very different name is still flagged, and labelled as not certain', () => {
    const [m] = suggestMatches(cand, [profile('p1', 'Grace Mwale', { nationalId: 'AB12CD34' })])
    expect(m).toMatchObject({ profileId: 'p1', method: 'NATIONAL_ID' })
    expect(isStrongMatch(m!)).toBe(true)          // blocks approval until staff decide
  })

  it('an ID match outranks an e-mail-and-name match on another profile', () => {
    const emailProfile = profile('p-email', 'Mary Banda', { contacts: [{ kind: 'EMAIL', normalizedValue: 'm@x.com' }] })
    const idProfile = profile('p-id', 'Grace Mwale', { nationalId: 'AB12CD34' })
    const out = suggestMatches({ ...cand, email: 'm@x.com' }, [emailProfile, idProfile])
    expect(out.map((m) => m.profileId)).toEqual(['p-id', 'p-email'])
  })

  it('different IDs and nothing else in common is not a match', () => {
    expect(suggestMatches(cand, [profile('p1', 'Mary Banda', { nationalId: 'ZZ99YY88' })])).toEqual([])
  })

  it('a profile with no ID is never matched by ID', () => {
    expect(suggestMatches(cand, [profile('p1', 'Mary Banda')])).toEqual([])
  })

  it('an ID never matches a merged profile', () => {
    expect(suggestMatches(cand, [profile('p1', 'Mary Banda', { nationalId: 'AB12CD34', status: 'MERGED' })])).toEqual([])
  })
})
