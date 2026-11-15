/**
 * apps/web/src/lib/hills/navGroups.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8d: shell)
 * [PURPOSE]: How the sidebar groups the pages it already lists (RULEBOOK R5,
 *   owner decision 4: "layout and grouping change, no link target changes").
 *
 *   Pure and apart from React so the plain node test runner can check it
 *   (tools/hills/__tests__/navGroups.test.mts).
 *
 *   • Grouping only decides the ORDER the sidebar draws and the small heading
 *     above each run of items. It never adds, removes, renames or re-links an
 *     item: the same items in, the same items out (tested).
 *   • An href this file does not know about goes to a last group called
 *     "More", so a page added to config/navigation.ts later is never lost.
 *   • Dashboard stays first with no heading.
 *   • The phone bottom bar and its "More" sheet do NOT use this: they keep the
 *     order from useNavigation (R5.1: the bar is fixed per role).
 */

export interface NavGroupDef {
  id: string
  /** Heading shown above the group when the sidebar is wide. */
  label: string
  hrefs: readonly string[]
}

/** Dashboard is drawn first, with no heading. */
export const NAV_TOP_HREF = '/dashboard'

export const NAV_GROUPS: readonly NavGroupDef[] = [
  {
    id: 'learning',
    label: 'Learning',
    hrefs: ['/classes', '/attendance', '/timetable', '/exams', '/calendar', '/library'],
  },
  {
    id: 'people',
    label: 'People',
    hrefs: ['/students', '/guardians', '/applications', '/placements', '/hr', '/user-management'],
  },
  {
    id: 'school',
    label: 'School',
    hrefs: ['/announcements', '/gallery-admin', '/finances', '/assets', '/reports'],
  },
  {
    id: 'admin',
    label: 'Admin',
    hrefs: ['/approvals', '/monitoring', '/settings'],
  },
]

/** Heading for items no group lists (new pages added later). */
export const NAV_FALLBACK_LABEL = 'More'

export interface GroupedNav<T> {
  /** Heading text, or null for the top run (Dashboard) which has none. */
  label: string | null
  items: T[]
}

/**
 * Splits the already role-filtered items into runs. Items keep their relative
 * order inside a group (the order from config/navigation.ts). Empty groups are
 * dropped, so a role that sees two pages in "Admin" only gets that heading.
 */
export function groupNavItems<T extends { href: string }>(items: readonly T[]): GroupedNav<T>[] {
  const out: GroupedNav<T>[] = []
  const placed = new Set<string>()

  const top = items.filter((i) => i.href === NAV_TOP_HREF)
  if (top.length > 0) {
    out.push({ label: null, items: top })
    top.forEach((i) => placed.add(i.href))
  }

  for (const group of NAV_GROUPS) {
    const inGroup = items.filter((i) => group.hrefs.includes(i.href) && !placed.has(i.href))
    if (inGroup.length > 0) {
      out.push({ label: group.label, items: inGroup })
      inGroup.forEach((i) => placed.add(i.href))
    }
  }

  const rest = items.filter((i) => !placed.has(i.href))
  if (rest.length > 0) out.push({ label: NAV_FALLBACK_LABEL, items: rest })

  return out
}

/** Every href any group lists (used by the test to compare against the real nav config). */
export function allGroupedHrefs(): string[] {
  return [NAV_TOP_HREF, ...NAV_GROUPS.flatMap((g) => [...g.hrefs])]
}
