/**
 * taxonomy.test.ts
 * [CHANGE TYPE]: NEW FILE
 *
 * Runs every real catalogue programme (all ~180, across all 8 universities)
 * through getFieldCategory()/deriveCareerTags() — this is a regression test
 * for the taxonomy rules themselves, not fixture data, because the whole
 * point of deriving instead of hand-annotating is that a bad regex quietly
 * stops matching real titles. Several rules in this file were fixed
 * specifically because this test caught them matching zero real programmes
 * despite looking correct (a `\b` boundary after a word stem silently
 * broke matching against inflected forms like "Agriculture", "Architectural",
 * "Environmental", "Surveying" — see the FIX comment in taxonomy.ts).
 */
import { describe, it, expect } from 'vitest'
import { UNIVERSITIES } from '@shared/constants/universities'
import { getFieldCategory, deriveCareerTags, CAREER_FIELDS, FIELD_CATEGORIES } from '../taxonomy'

const ALL_PROGRAMS = UNIVERSITIES.flatMap((u) => u.programs.map((p) => ({ university: u.shortName ?? u.id, program: p })))

describe('taxonomy — getFieldCategory', () => {
  it('resolves every real programme in the catalogue to a known field category', () => {
    const unmapped = ALL_PROGRAMS.filter(({ program }) => getFieldCategory(program) === null)
    expect(unmapped.map((x) => `${x.university} :: ${x.program.name} (faculty: ${x.program.faculty})`)).toEqual([])
  })

  it('only ever returns a value from the fixed FIELD_CATEGORIES set', () => {
    for (const { program } of ALL_PROGRAMS) {
      const fc = getFieldCategory(program)
      if (fc !== null) expect(FIELD_CATEGORIES).toContain(fc)
    }
  })

  it('is null for a programme with no faculty set', () => {
    expect(getFieldCategory({ id: 'x', name: 'Unknown', isActive: true } as never)).toBeNull()
  })
})

describe('taxonomy — deriveCareerTags', () => {
  it('tags a well-known, unambiguous programme correctly', () => {
    const mbbs = ALL_PROGRAMS.find(({ program }) => /MBBS/.test(program.name))
    expect(mbbs).toBeTruthy()
    expect(deriveCareerTags(mbbs!.program)).toContain('Medicine')
  })

  it('a programme can carry more than one tag when it genuinely spans fields', () => {
    const agriEng = ALL_PROGRAMS.find(({ program }) => /Agricultural Engineering/i.test(program.name))
    if (agriEng) {
      const tags = deriveCareerTags(agriEng.program)
      expect(tags).toContain('Engineering')
      expect(tags).toContain('Agriculture')
    }
  })

  it('every derived tag is one of the published CAREER_FIELDS options', () => {
    for (const { program } of ALL_PROGRAMS) {
      for (const tag of deriveCareerTags(program)) {
        expect(CAREER_FIELDS).toContain(tag)
      }
    }
  })

  // Genuinely generic titles ("Bachelor of Science (Generic)", "... in
  // Applied Sciences", "... in Biological Sciences", etc.) legitimately
  // carry no specific career tag — that's an honest reflection of an
  // unspecified degree, not a gap to force-fill. This test only guards
  // against the count silently growing (i.e. a real, specific programme
  // losing its tag due to a future regex regression) — it is not a
  // requirement that this number ever reaches zero.
  it('the number of untagged programmes does not silently grow', () => {
    const untagged = ALL_PROGRAMS.filter(({ program }) => deriveCareerTags(program).length === 0)
    expect(untagged.length).toBeLessThanOrEqual(8)
  })

  it('inflected forms match via their stem, not just the exact dictionary word', () => {
    const cases: Array<[string, string]> = [
      ['Bachelor of Science in Agriculture', 'Agriculture'],
      ['Bachelor of Science in Architectural Studies', 'Architecture & Built Environment'],
      ['Bachelor of Science in Environmental Science', 'Environment & Natural Resources'],
      ['Bachelor of Science in Land Surveying (Honours)', 'Architecture & Built Environment'],
      ['Bachelor of Science in Horticultural Sciences', 'Agriculture'],
    ]
    for (const [name, expectedTag] of cases) {
      const tags = deriveCareerTags({ id: 'x', name, isActive: true } as never)
      expect(tags, `expected "${name}" to include "${expectedTag}"`).toContain(expectedTag)
    }
  })
})
