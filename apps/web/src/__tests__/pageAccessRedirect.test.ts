// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  PAGE_ACCESS, getAllowedRolesForPath, homePathForRole, pageAccessRedirect, postLoginPath,
} from '@shared/constants/pageAccess'
import { USER_ROLES } from '@shared/types/roles'

const staffAndStudent = USER_ROLES.filter((r) => r !== 'parent')

describe('homePathForRole', () => {
  it('parent -> /parent; every other role (and unknown) -> /dashboard', () => {
    expect(homePathForRole('parent')).toBe('/parent')
    for (const r of staffAndStudent) expect(homePathForRole(r)).toBe('/dashboard')
    for (const r of [null, undefined, '', 'Parent', 'teacher']) expect(homePathForRole(r)).toBe('/dashboard')
  })
})

describe('/parent page access', () => {
  it('is open to the parent role only', () => {
    expect(getAllowedRolesForPath('/parent')).toEqual(['parent'])
    expect(getAllowedRolesForPath('/parent/children/abc/results')).toEqual(['parent'])
  })

  it('every existing portal page excludes the parent role', () => {
    for (const [p, roles] of Object.entries(PAGE_ACCESS)) {
      if (p === '/parent') continue
      expect((roles as readonly string[]).includes('parent'), p).toBe(false)
    }
  })

  it('no staff or student role may open /parent (unless super user)', () => {
    for (const r of staffAndStudent) expect(pageAccessRedirect('/parent/children', r, false), r).toBe('/dashboard')
  })
})

describe('pageAccessRedirect never loops', () => {
  it('a parent on any non-parent portal page is sent to /parent, which allows them', () => {
    for (const p of Object.keys(PAGE_ACCESS).filter((x) => x !== '/parent')) {
      const dest = pageAccessRedirect(p, 'parent', false)
      expect(dest, p).toBe('/parent')
      expect(pageAccessRedirect(dest!, 'parent', false), `${p} -> ${dest}`).toBeNull()
    }
  })

  it('a parent is never redirected to a page that redirects again, for any path', () => {
    for (const p of ['/dashboard', '/students', '/finances/x', '/exams/results', '/reports', '/anything-unlisted']) {
      const first = pageAccessRedirect(p, 'parent', false)
      if (first !== null) expect(pageAccessRedirect(first, 'parent', false)).toBeNull()
    }
  })

  it('every staff/student role lands somewhere that allows it', () => {
    for (const r of staffAndStudent) {
      for (const p of Object.keys(PAGE_ACCESS)) {
        const dest = pageAccessRedirect(p, r, false)
        if (dest !== null) expect(pageAccessRedirect(dest, r, false), `${r} ${p}`).toBeNull()
      }
    }
  })

  it('the super user shortcut still bypasses role lists; a tampered/missing cookie role does not', () => {
    expect(pageAccessRedirect('/finances', 'student', true)).toBeNull()
    expect(pageAccessRedirect('/finances', undefined, false)).toBe('/dashboard')
    expect(pageAccessRedirect('/finances', 'not-a-role', false)).toBe('/dashboard')
  })

  it('unlisted paths impose no role restriction (unchanged behaviour)', () => {
    expect(pageAccessRedirect('/some/unlisted/page', 'student', false)).toBeNull()
  })
})

describe('postLoginPath', () => {
  it('honours `from` only when the role may open it', () => {
    // Pick real pages from the map instead of guessing which roles may open what.
    const studentBlocked = Object.keys(PAGE_ACCESS).find((p) => p !== '/parent' && !(PAGE_ACCESS[p as keyof typeof PAGE_ACCESS] as readonly string[]).includes('student'))!
    const studentAllowed = Object.keys(PAGE_ACCESS).find((p) => (PAGE_ACCESS[p as keyof typeof PAGE_ACCESS] as readonly string[]).includes('student'))!
    expect(postLoginPath('student', studentAllowed)).toBe(studentAllowed)
    expect(postLoginPath('student', studentBlocked)).toBe('/dashboard')
    expect(postLoginPath('admin', '/some/unlisted')).toBe('/some/unlisted')
    expect(postLoginPath('parent', '/parent/children/abc')).toBe('/parent/children/abc')
    expect(postLoginPath('parent', '/students')).toBe('/parent')
    expect(postLoginPath('parent', '/dashboard')).toBe('/parent')
    expect(postLoginPath('parent', null)).toBe('/parent')
    expect(postLoginPath('admin', null)).toBe('/dashboard')
    expect(postLoginPath('admin', '/parent')).toBe('/dashboard')
  })
})
