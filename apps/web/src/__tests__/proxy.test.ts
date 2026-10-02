// @vitest-environment node
/**
 * Guards the public/portal split in proxy.ts.
 *
 * Why this exists: an anonymous visitor used to be redirected to /login for
 * ANY path that was not on the public allow-list. That silently broke every
 * public page that was forgotten from the list (/placement-results,
 * /reset-password) and made a custom 404 page unreachable. The proxy now only
 * redirects portal paths, so the portal list (PAGE_ACCESS) must stay complete.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { PAGE_ACCESS } from '@shared/constants/pageAccess'
import { proxy } from '../proxy'

const appDir = path.join(__dirname, '..', 'app')

function routeFolders(group: string): string[] {
  return fs
    .readdirSync(path.join(appDir, group), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}

function call(pathname: string) {
  return proxy(new NextRequest(`http://localhost${pathname}`))
}

const passesThrough = (res: Response) => res.headers.get('x-middleware-next') === '1'
const redirectsTo = (res: Response, to: string) =>
  res.status >= 300 && res.status < 400 && new URL(res.headers.get('location') ?? '', 'http://localhost').pathname === to

describe('proxy: anonymous visitors', () => {
  it.each([
    '/', '/admissions', '/apply', '/news', '/news/abc123', '/placement-results',
    '/reset-password', '/privacy', '/terms', '/login',
    '/sitemap.xml', '/robots.txt', '/llms.txt', '/manifest.webmanifest',
  ])('can open %s', (p) => {
    expect(passesThrough(call(p))).toBe(true)
  })

  it('reaches the 404 page for an unknown URL instead of being sent to /login', () => {
    expect(passesThrough(call('/this-page-does-not-exist'))).toBe(true)
  })

  it.each(['/dashboard', '/students', '/students/123', '/finances', '/user-management'])(
    'is sent to /login from the portal page %s',
    (p) => {
      expect(redirectsTo(call(p), '/login')).toBe(true)
    },
  )
})

describe('route registry', () => {
  it('lists every app/(auth) folder in PAGE_ACCESS, so the proxy keeps it private', () => {
    const missing = routeFolders('(auth)').filter((dir) => !(`/${dir}` in PAGE_ACCESS))
    expect(missing).toEqual([])
  })

  it('never lists a public page as a portal page', () => {
    const publicDirs = routeFolders('(public)').map((d) => `/${d}`)
    const clash = publicDirs.filter((d) => d in PAGE_ACCESS)
    expect(clash).toEqual([])
  })
})
