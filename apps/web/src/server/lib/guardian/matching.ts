/**
 * [FILE]: apps/web/src/server/lib/guardian/matching.ts
 * [PURPOSE]: Suggest which EXISTING guardian profile a new proposal may be the same
 *   person as (one parent with several children).
 *
 *   Suggestions only. Nothing here merges, links or grants anything: families share
 *   phones (one household handset, an uncle's number for three nieces), so a phone
 *   match alone is a weak hint, and names are not unique. Staff decide.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */
import { SAME_PERSON_THRESHOLD, nameSimilarity } from './names'

export interface MatchCandidate {
  name: string
  /** Normalised E.164 numbers. */
  phones: readonly string[]
  /** Normalised (lower-case) email. */
  email?: string | null
  /** Normalised national ID (see nationalId.ts); null when absent or not a plausible ID. */
  nationalId?: string | null
}

export interface ExistingProfile {
  id: string
  fullName: string
  status: string
  contacts: ReadonlyArray<{ kind: 'PHONE' | 'EMAIL'; normalizedValue: string }>
  nationalId?: string | null
}

/**
 * NATIONAL_ID_NAME  same national ID and a similar name: the same person, as near as data can say.
 * NATIONAL_ID       same national ID but the names differ a lot. Still ranked first (an ID is unique
 *                   to a person) but never presented as certain: a married name, a nickname or a typo
 *                   can explain it, and so can a wrongly typed ID, so staff look before deciding.
 */
export type MatchMethod = 'NATIONAL_ID_NAME' | 'NATIONAL_ID' | 'EMAIL_NAME' | 'EMAIL' | 'PHONE_NAME' | 'PHONE_SHARED'

/** Higher wins. An ID outranks every other signal; the rest keep their long-standing order. */
const PRIORITY: Record<MatchMethod, number> = {
  NATIONAL_ID_NAME: 6, NATIONAL_ID: 5, EMAIL_NAME: 4, PHONE_NAME: 3, EMAIL: 2, PHONE_SHARED: 1,
}

export interface MatchSuggestion {
  profileId: string
  method: MatchMethod
  score: number
  profileStatus: string
}

/** Strong = both a contact method and the name agree. Weak hints are shown with less weight. */
export function isStrongMatch(m: Pick<MatchSuggestion, 'method'>): boolean {
  return m.method === 'NATIONAL_ID_NAME' || m.method === 'NATIONAL_ID' || m.method === 'EMAIL_NAME' || m.method === 'PHONE_NAME'
}

export function suggestMatches(candidate: MatchCandidate, profiles: readonly ExistingProfile[]): MatchSuggestion[] {
  const out: MatchSuggestion[] = []
  const cPhones = new Set(candidate.phones)
  for (const p of profiles) {
    if (p.status === 'MERGED') continue // folded into another profile: never a target
    const idHit = !!candidate.nationalId && !!p.nationalId && p.nationalId === candidate.nationalId
    const emailHit = !!candidate.email && p.contacts.some((c) => c.kind === 'EMAIL' && c.normalizedValue === candidate.email)
    const phoneHit = p.contacts.some((c) => c.kind === 'PHONE' && cPhones.has(c.normalizedValue))
    if (!idHit && !emailHit && !phoneHit) continue // a name on its own is never enough
    const sim = nameSimilarity(candidate.name, p.fullName)
    let method: MatchMethod
    let score: number
    if (idHit && sim >= SAME_PERSON_THRESHOLD) { method = 'NATIONAL_ID_NAME'; score = 1 }
    else if (idHit) { method = 'NATIONAL_ID'; score = 0.9 }
    else if (emailHit && sim >= SAME_PERSON_THRESHOLD) { method = 'EMAIL_NAME'; score = 1 }
    else if (phoneHit && sim >= SAME_PERSON_THRESHOLD) { method = 'PHONE_NAME'; score = 0.95 }
    else if (emailHit) { method = 'EMAIL'; score = 0.85 }
    else { method = 'PHONE_SHARED'; score = 0.4 + Math.min(sim, 0.39) } // 0.4 .. <0.8
    out.push({ profileId: p.id, method, score: Math.round(score * 1000) / 1000, profileStatus: p.status })
  }
  return out.sort((a, b) => PRIORITY[b.method] - PRIORITY[a.method] || b.score - a.score || a.profileId.localeCompare(b.profileId))
}
