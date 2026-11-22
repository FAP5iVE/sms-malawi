/**
 * [FILE]: apps/web/src/server/lib/guardian/relationship.ts
 * [PURPOSE]: Map the free-text `relation` on a contact card to the school's
 *   GUARDIAN_RELATIONSHIPS vocabulary. Values outside it become 'Other' and the
 *   original wording is kept in a note, so nothing the clerk typed is lost.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */
import { GUARDIAN_RELATIONSHIPS, type GuardianRelationship } from '@shared/constants/admissions'

const SYNONYMS: Record<string, GuardianRelationship> = {
  mum: 'Mother', mom: 'Mother', mama: 'Mother', mother: 'Mother', mommy: 'Mother', mummy: 'Mother', mayi: 'Mother',
  dad: 'Father', daddy: 'Father', papa: 'Father', father: 'Father', bambo: 'Father',
  guardian: 'Guardian', 'legal guardian': 'Guardian', 'foster parent': 'Guardian', sponsor: 'Guardian',
  uncle: 'Uncle', 'maternal uncle': 'Uncle', 'paternal uncle': 'Uncle', 'mother\'s brother': 'Uncle',
  aunt: 'Aunt', aunty: 'Aunt', auntie: 'Aunt', 'maternal aunt': 'Aunt', 'paternal aunt': 'Aunt',
  grandparent: 'Grandparent', grandmother: 'Grandparent', grandfather: 'Grandparent',
  grandma: 'Grandparent', grandpa: 'Grandparent', granny: 'Grandparent', gogo: 'Grandparent', agogo: 'Grandparent',
  brother: 'Elder Sibling', sister: 'Elder Sibling', sibling: 'Elder Sibling',
  'elder brother': 'Elder Sibling', 'elder sister': 'Elder Sibling', 'older brother': 'Elder Sibling',
  'older sister': 'Elder Sibling', 'big brother': 'Elder Sibling', 'big sister': 'Elder Sibling',
  'elder sibling': 'Elder Sibling',
  relative: 'Other Relative', 'other relative': 'Other Relative', cousin: 'Other Relative',
  nephew: 'Other Relative', niece: 'Other Relative', stepfather: 'Other Relative', stepmother: 'Other Relative',
  'step father': 'Other Relative', 'step mother': 'Other Relative', 'step parent': 'Other Relative',
  other: 'Other',
}

export interface MappedRelationship {
  relationship: GuardianRelationship
  /** Original wording, kept only when the mapping was not exact. */
  note: string | null
}

export function mapRelationship(raw: unknown): MappedRelationship {
  const original = typeof raw === 'string' ? raw.trim() : ''
  const key = original.toLowerCase().replace(/\s+/g, ' ')
  if (!key) return { relationship: 'Other', note: null }
  const exact = GUARDIAN_RELATIONSHIPS.find((r) => r.toLowerCase() === key)
  if (exact) return { relationship: exact, note: null }
  const mapped = SYNONYMS[key]
  if (mapped) {
    // Keep the wording when the vocabulary lost information (e.g. "Stepmother" -> Other Relative).
    const lossy = mapped === 'Other Relative' || mapped === 'Other' || mapped === 'Elder Sibling' || mapped === 'Grandparent'
    return { relationship: mapped, note: lossy ? original.slice(0, 120) : null }
  }
  return { relationship: 'Other', note: original.slice(0, 120) }
}
