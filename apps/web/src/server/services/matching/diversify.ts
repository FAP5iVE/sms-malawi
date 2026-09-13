/**
 * apps/web/src/server/services/matching/diversify.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Stage C — takes a globally-ranked list of eligible, scored
 *   programmes and re-ranks it so no single university can dominate the
 *   head of the result list, while preserving each university's own
 *   internal relevance order. Same technique as provider/source
 *   diversification in ranked-list systems generally (build per-group
 *   sorted sub-lists, then round-robin interleave them, capping how many
 *   any one group ever contributes).
 *
 *   This is the direct fix for the reported bug: a student eligible for
 *   many strong programmes at one university (very plausible — MUST alone
 *   carries ~24 programmes) would otherwise see a top-10 dominated by that
 *   one institution even with correct scoring, because nothing previously
 *   accounted for source diversity at all.
 *
 *   Generic over any item shape that carries a `universityId` and a
 *   `score` — works the same whether called with plain
 *   ProgramRecommendation or the richer MatchedProgramme wrapper, so
 *   Stage D can call it after attaching explanations without this file
 *   needing to know about that shape.
 */

export const MAX_PROGRAMMES_PER_UNIVERSITY = 2

interface Diversifiable {
  universityId: string
  score: number
}

/**
 * Round-robin re-rank: group by university, sort each group by score
 * descending, then repeatedly take the next-best not-yet-picked programme
 * from each university in turn (in the order universities first appear in
 * the input, which — since the input is already globally score-sorted —
 * means the strongest university overall goes first each round, but never
 * more than `cap` times total). Stops once `limit` results are collected or
 * every university's list is exhausted, whichever comes first.
 */
export function diversify<T extends Diversifiable>(
  rankedList: T[],
  opts: { cap?: number; limit?: number } = {},
): T[] {
  const cap = opts.cap ?? MAX_PROGRAMMES_PER_UNIVERSITY
  const limit = opts.limit ?? Infinity

  const byUniversity = new Map<string, T[]>()
  const universityOrder: string[] = [] // first-seen order in the (already-ranked) input
  for (const item of rankedList) {
    if (!byUniversity.has(item.universityId)) {
      byUniversity.set(item.universityId, [])
      universityOrder.push(item.universityId)
    }
    byUniversity.get(item.universityId)!.push(item)
  }
  // Each group already inherits the input's overall score order; re-sort
  // defensively so this function's correctness never depends on the
  // caller having sorted first.
  for (const group of byUniversity.values()) {
    group.sort((a, b) => b.score - a.score)
  }

  const takenCount = new Map<string, number>()
  const result: T[] = []
  let anyTakenThisPass = true

  while (result.length < limit && anyTakenThisPass) {
    anyTakenThisPass = false
    for (const uniId of universityOrder) {
      if (result.length >= limit) break
      const taken = takenCount.get(uniId) ?? 0
      if (taken >= cap) continue
      const group = byUniversity.get(uniId)!
      const next = group[taken]
      if (!next) continue
      result.push(next)
      takenCount.set(uniId, taken + 1)
      anyTakenThisPass = true
    }
  }

  return result
}
