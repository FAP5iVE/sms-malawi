/**
 * [FILE]: apps/web/src/server/services/guardian/guardianNationalIdService.ts
 * [PURPOSE]: One-off (and safely repeatable) catch-up for guardians that were created before
 *   national IDs were part of matching. Two steps, both previewable:
 *
 *   1. FILL     give each guardian profile the national ID written on its contact card(s).
 *   2. FLAG     where two or more profiles now share an ID, flag the waiting entries as possible
 *               duplicates of the person already on file, so staff can merge them in the queue.
 *
 *   It decides nothing about people: it never merges, never links, never approves, and never
 *   touches a link that staff have already decided. It only fills a blank ID and adds a suggestion.
 *
 * [SAFETY RULES]
 *   - Fill only. A profile that already has an ID is never changed.
 *   - A profile whose cards disagree (two different valid IDs) is left blank and counted as a
 *     conflict: guessing which card is right is exactly the mistake a national ID should prevent.
 *   - IDs go through normalizeNationalId first, so "N/A", "00000000" and the like are ignored.
 *   - The anchor ("the person on file") of a group is an ACTIVE profile, preferring one with a
 *     portal account, then the oldest. Only PENDING links on the other profiles are flagged.
 *   - A flag is skipped when the anchor already has a link to the same student (a repoint
 *     could not succeed) and never replaces a stronger or equal national-ID suggestion.
 *   - Idempotent: running it again finds nothing new.
 */
import { SAME_PERSON_THRESHOLD, nameSimilarity } from '@/server/lib/guardian/names'
import { maskNationalId, normalizeNationalId } from '@/server/lib/guardian/nationalId'
import type { GuardianDb } from './db'
import { assertCan, type StaffCtx } from './guardianLinkService'

const PAGE = 500

export interface NationalIdBackfillReport {
  applied: boolean
  profilesScanned: number
  /** Profiles that have (apply) or would get (preview) the ID from their contact cards. */
  idsFilled: number
  /** Profiles whose cards carry two different valid IDs: left blank for staff. */
  conflicts: number
  /** National IDs now held by two or more profiles. */
  sharedIds: number
  /** Waiting entries flagged (or that would be) as a possible duplicate. */
  entriesFlagged: number
  samples: Array<{ nationalIdMasked: string | null; names: string[] }>
}

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Every row of a table, by id order in pages, so a large school never loads one giant query. */
async function scan(find: (args: Row) => Promise<Row[]>, where: Row, select?: Row): Promise<Row[]> {
  const out: Row[] = []
  let last: string | null = null
  for (;;) {
    const rows: Row[] = await find({ where: { ...where, ...(last ? { id: { gt: last } } : {}) }, orderBy: { id: 'asc' }, take: PAGE, ...(select ? { select } : {}) })
    out.push(...rows)
    if (rows.length < PAGE) return out
    last = rows[rows.length - 1]!.id as string
  }
}

const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

export async function backfillNationalIds(db: GuardianDb, opts: { apply: boolean }, ctx: StaffCtx): Promise<NationalIdBackfillReport> {
  assertCan(ctx, 'guardian.backfill')
  const apply = opts.apply === true

  // ── 1. FILL ────────────────────────────────────────────────────────────
  const blank = await scan((a) => db.guardianProfile.findMany(a), { nationalId: null, status: { in: ['ACTIVE', 'SUSPENDED'] } }, { id: true })
  const planned = new Map<string, string>()          // profileId -> normalised ID it will hold
  let conflicts = 0
  for (const ids of chunk(blank.map((p) => p.id as string), PAGE)) {
    const links = await db.guardianLink.findMany({ where: { profileId: { in: ids }, directoryEntryId: { not: null } }, select: { profileId: true, directoryEntryId: true } })
    const cards = links.length ? await db.studentGuardian.findMany({ where: { id: { in: [...new Set(links.map((l) => l.directoryEntryId as string))] } }, select: { id: true, nrbNumber: true } }) : []
    const idOfCard = new Map(cards.map((c) => [c.id as string, normalizeNationalId(c.nrbNumber)]))
    const found = new Map<string, Set<string>>()
    for (const l of links) {
      const v = idOfCard.get(l.directoryEntryId as string)
      if (v) found.set(l.profileId as string, (found.get(l.profileId as string) ?? new Set()).add(v))
    }
    for (const [profileId, set] of found) {
      if (set.size > 1) { conflicts++; continue }
      planned.set(profileId, [...set][0]!)
    }
  }
  if (apply) {
    for (const [profileId, nationalId] of planned) {
      await db.guardianProfile.updateMany({ where: { id: profileId, nationalId: null }, data: { nationalId } })
    }
  }

  // ── 2. FLAG ────────────────────────────────────────────────────────────
  const holders = await scan((a) => db.guardianProfile.findMany(a), { nationalId: { not: null }, status: { in: ['ACTIVE', 'SUSPENDED'] } },
    { id: true, fullName: true, status: true, firebaseUid: true, createdAt: true, nationalId: true })
  const withId = new Map<string, Row & { nid: string }>()
  for (const h of holders) withId.set(h.id as string, { ...h, nid: h.nationalId as string })
  for (const [profileId, nid] of planned) {
    if (withId.has(profileId)) continue
    const row = (await db.guardianProfile.findUnique({ where: { id: profileId } })) as Row | null
    if (row) withId.set(profileId, { ...row, nid })
  }
  const groups = new Map<string, Array<Row & { nid: string }>>()
  for (const p of withId.values()) groups.set(p.nid, [...(groups.get(p.nid) ?? []), p])

  let sharedIds = 0
  let entriesFlagged = 0
  const samples: NationalIdBackfillReport['samples'] = []
  for (const [nid, members] of groups) {
    if (members.length < 2) continue
    sharedIds++
    const ranked = [...members].sort((a, b) =>
      Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') ||
      Number(Boolean(b.firebaseUid)) - Number(Boolean(a.firebaseUid)) ||
      +new Date(a.createdAt as string) - +new Date(b.createdAt as string) ||
      String(a.id).localeCompare(String(b.id)))
    const anchor = ranked[0]!
    if (anchor.status !== 'ACTIVE') continue          // nobody a link could be moved to
    if (samples.length < 10) samples.push({ nationalIdMasked: maskNationalId(nid), names: members.map((m) => String(m.fullName)) })

    const anchorStudents = new Set((await db.guardianLink.findMany({ where: { profileId: anchor.id }, select: { studentId: true } })).map((l) => l.studentId as string))
    for (const other of ranked.slice(1)) {
      const pending = await db.guardianLink.findMany({ where: { profileId: other.id, status: 'PENDING' }, select: { id: true, studentId: true, suggestedMethod: true } })
      for (const l of pending) {
        if (anchorStudents.has(l.studentId as string)) continue          // repoint would be refused
        if (typeof l.suggestedMethod === 'string' && l.suggestedMethod.startsWith('NATIONAL_ID')) continue
        entriesFlagged++
        if (!apply) continue
        const method = nameSimilarity(other.fullName, anchor.fullName) >= SAME_PERSON_THRESHOLD ? 'NATIONAL_ID_NAME' : 'NATIONAL_ID'
        await db.guardianLink.updateMany({
          where: { id: l.id, status: 'PENDING', suggestedMethod: l.suggestedMethod ?? null },
          data: { suggestedProfileId: anchor.id, suggestedMethod: method },
        })
      }
    }
  }

  const report: NationalIdBackfillReport = {
    applied: apply, profilesScanned: blank.length, idsFilled: planned.size, conflicts, sharedIds, entriesFlagged, samples,
  }
  if (apply) {
    await ctx.audit({
      action: 'guardian.national_ids_backfilled', entityType: 'GuardianProfile', entityId: 'bulk',
      actorUid: ctx.actor.uid, actorRole: ctx.actor.role,
      metadata: { context: { idsFilled: report.idsFilled, conflicts, sharedIds, entriesFlagged } },
    })
  }
  return report
}
