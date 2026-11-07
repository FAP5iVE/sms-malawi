// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { resolveFileCaller, tokenSourceOf } from '../fileCaller'
import { canReadFile, FILE_PREFIX } from '../storage'
import { USER_ROLES } from '@shared/types/roles'

const webRoot = path.resolve(__dirname, '../../..')
const routeSrc = fs
  .readFileSync(path.join(webRoot, 'src/app/api/files/[fileId]/route.ts'), 'utf8')
  .replace(/\r\n/g, '\n')
const code = routeSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('tokenSourceOf mirrors getIdTokenFromRequest (header wins, then query)', () => {
  it('header, query, both, neither, malformed', () => {
    expect(tokenSourceOf('Bearer abc', null)).toBe('header')
    expect(tokenSourceOf('Bearer abc', 'q')).toBe('header')
    expect(tokenSourceOf(null, 'q')).toBe('query')
    expect(tokenSourceOf('', 'q')).toBe('query')
    expect(tokenSourceOf('Basic abc', 'q')).toBe('query')
    expect(tokenSourceOf('Bearer ', 'q')).toBe('query')
    expect(tokenSourceOf(undefined, undefined)).toBe('none')
    expect(tokenSourceOf('Bearer ', '')).toBe('none')
  })
})

describe('resolveFileCaller', () => {
  it('accepts every real role with a header token', () => {
    for (const role of USER_ROLES) {
      expect(resolveFileCaller({ uid: 'u1', roleClaim: role, source: 'header' })).toEqual({ ok: true, uid: 'u1', role })
    }
  })

  it('keeps ?token= working for every role EXCEPT parent (existing PDF preview must not break)', () => {
    for (const role of USER_ROLES.filter((r) => r !== 'parent')) {
      expect(resolveFileCaller({ uid: 'u1', roleClaim: role, source: 'query' }).ok).toBe(true)
    }
    const parent = resolveFileCaller({ uid: 'u1', roleClaim: 'parent', source: 'query' })
    expect(parent).toEqual({ ok: false, status: 403, error: 'Forbidden' })
  })

  it('refuses a missing or unknown role instead of defaulting it to student', () => {
    for (const roleClaim of [undefined, null, '', 'Student', 'teacher', 'ADMIN', 7, {}, ['admin']]) {
      expect(resolveFileCaller({ uid: 'u1', roleClaim, source: 'header' })).toEqual({ ok: false, status: 403, error: 'Forbidden' })
    }
  })

  it('refuses a token without a uid with 401', () => {
    for (const uid of [undefined, null, '', 5]) {
      expect(resolveFileCaller({ uid, roleClaim: 'admin', source: 'header' })).toEqual({ ok: false, status: 401, error: 'Unauthorised' })
    }
  })
})

describe('file proxy route wiring', () => {
  it('no longer defaults a missing role to student', () => {
    expect(code).not.toMatch(/\?\?\s*'student'/)
  })

  it('decides the caller before the owner lookup, canReadFile and the stream', () => {
    const caller = code.indexOf('resolveFileCaller(')
    const lookup = code.indexOf('prisma.payslip.findFirst')
    const read = code.indexOf('if (!canReadFile(')
    const stream = code.indexOf('await streamFile(fileId)')
    expect(caller).toBeGreaterThan(code.indexOf('await getIdTokenFromRequest(request)'))
    expect(lookup).toBeGreaterThan(caller)
    expect(read).toBeGreaterThan(lookup)
    expect(stream).toBeGreaterThan(read)
  })

  it('an owner-lookup error fails closed (503) instead of falling through to canReadFile', () => {
    const catchAt = code.indexOf('} catch (err) {')
    const read = code.indexOf('if (!canReadFile(')
    expect(catchAt).toBeGreaterThan(-1)
    expect(catchAt).toBeLessThan(read)
    expect(code.slice(catchAt, read)).toMatch(/status:\s*503/)
    expect(code).not.toMatch(/catch\s*\{\s*\n?\s*(\/\/.*)?\s*\}\s*\n\s*\/\/ ── 3\./)
  })
})

describe('canReadFile: the parent role (before any guardian-link branch exists)', () => {
  const prefixes = Object.values(FILE_PREFIX) as string[]

  it('denies a parent every known file prefix, even as the "owner" uid', () => {
    for (const p of prefixes) {
      expect(canReadFile(`${p}_x1`, 'parent', 'guardian-uid'), p).toBe(false)
      expect(canReadFile(`${p}_x1`, 'parent', 'same', 'same'), `${p} as self`).toBe(false)
    }
  })

  it('denies a parent an unknown prefix (only admin reads those)', () => {
    expect(canReadFile('mystery_x1', 'parent', 'u')).toBe(false)
    expect(canReadFile('mystery_x1', 'admin', 'u')).toBe(true)
  })
})
