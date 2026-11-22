/**
 * apps/web/src/lib/hills/parentNav.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 10c: guardian shell)
 * [PURPOSE]: What a guardian's sidebar, header and phone bottom bar list.
 *   Pure and apart from React so the plain node test runner can check it
 *   (tools/hills/__tests__/parentNav.test.mts).
 *
 *   A guardian gets the same kind of shell as staff, but only two kinds of page,
 *   and both already exist: the Dashboard (/parent) and one page per child
 *   (/parent/<link id>). Nothing here grants or hides access; the server and the
 *   proxy still decide that. This only lists what the guardian was already given.
 */

export interface ParentNavChild {
  id: string
  firstName: string | null
  lastName: string | null
}

export interface ParentNavItem {
  href: string
  label: string
  /** Short label for the phone bar (at most 9 characters). */
  mobileLabel: string
  kind: 'dashboard' | 'child'
  active: boolean
}

export const PARENT_HOME_HREF = '/parent'
/** The phone bar has five slots: Dashboard and up to four children. */
export const PARENT_BAR_CHILD_SLOTS = 4

function fullName(c: ParentNavChild): string {
  return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Student'
}

function shortName(c: ParentNavChild): string {
  const first = (c.firstName ?? '').trim() || fullName(c)
  return first.length > 9 ? `${first.slice(0, 8)}…` : first
}

export function childHref(id: string): string {
  return `${PARENT_HOME_HREF}/${encodeURIComponent(id)}`
}

export function buildParentNav(children: readonly ParentNavChild[], pathname: string): ParentNavItem[] {
  const home: ParentNavItem = {
    href: PARENT_HOME_HREF,
    label: 'Dashboard',
    mobileLabel: 'Home',
    kind: 'dashboard',
    active: pathname === PARENT_HOME_HREF,
  }
  const kids = children.map<ParentNavItem>((c) => {
    const href = childHref(c.id)
    return { href, label: fullName(c), mobileLabel: shortName(c), kind: 'child', active: pathname === href || pathname.startsWith(`${href}/`) }
  })
  return [home, ...kids]
}

/** The title the header shows for the page the guardian is on. */
export function parentPageTitle(children: readonly ParentNavChild[], pathname: string): string {
  const item = buildParentNav(children, pathname).find((i) => i.active)
  return item ? item.label : 'Dashboard'
}

/** Items for the phone bar: Dashboard plus the first four children. */
export function parentBarItems(items: readonly ParentNavItem[]): ParentNavItem[] {
  return items.slice(0, 1 + PARENT_BAR_CHILD_SLOTS)
}
