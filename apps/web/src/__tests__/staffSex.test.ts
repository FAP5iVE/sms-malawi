// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { classifyFirstName, fnv1a, stableSexFor } from '../../scripts/seed/lib/staffSex'
import { MALAWIAN_MALE_FIRST_NAMES, MALAWIAN_FEMALE_FIRST_NAMES } from '../../scripts/seed/lib/kernel'

describe('classifyFirstName', () => {
  it('recovers the sex for names that belong to one pool', () => {
    expect(classifyFirstName('James')).toBe('MALE')
    expect(classifyFirstName('Grace')).toBe('FEMALE')
    expect(classifyFirstName('  grace ')).toBe('FEMALE')
  })

  it('flags names present in both pools as ambiguous', () => {
    expect(classifyFirstName('Chikondi')).toBe('AMBIGUOUS')
    expect(classifyFirstName('Precious')).toBe('AMBIGUOUS')
  })

  it('never guesses an unknown name', () => {
    expect(classifyFirstName('Zaphod')).toBe('UNKNOWN')
  })

  it('every seeded name gets a definite verdict that agrees with its pool', () => {
    for (const n of MALAWIAN_MALE_FIRST_NAMES) expect(['MALE', 'AMBIGUOUS']).toContain(classifyFirstName(n))
    for (const n of MALAWIAN_FEMALE_FIRST_NAMES) expect(['FEMALE', 'AMBIGUOUS']).toContain(classifyFirstName(n))
  })
})

describe('stableSexFor', () => {
  it('is deterministic', () => {
    expect(stableSexFor('EMP-2024-0007')).toBe(stableSexFor('EMP-2024-0007'))
    expect(fnv1a('a')).toBe(fnv1a('a'))
  })

  it('roughly follows the seed\'s 55% female split', () => {
    let female = 0
    for (let i = 0; i < 2000; i++) if (stableSexFor(`EMP-2024-${i}`) === 'FEMALE') female++
    expect(female / 2000).toBeGreaterThan(0.5)
    expect(female / 2000).toBeLessThan(0.6)
  })
})
