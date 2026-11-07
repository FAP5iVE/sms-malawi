// @vitest-environment node
/**
 * Pins how studentService is wired to the guardian portal (source-level, like the
 * repo's other wiring guards, because studentService cannot be imported without the
 * whole server stack). The behaviour of each hook is tested in
 * guardianIdentityService.test.ts against the in-memory db.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const webRoot = path.resolve(__dirname, '../../../../..')
const read = (p: string) => fs.readFileSync(path.join(webRoot, p), 'utf8').replace(/\r\n/g, '\n')
const svc = read('src/server/services/studentService.ts')
const sync = read('src/server/services/guardian/guardianDirectorySync.ts')

/** Source text of one exported function, up to the next top-level export/section rule. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  const rest = src.slice(start + 10)
  const end = rest.search(/\nexport (async )?function |\n\/\/ ═{10,}|\n\/\/ ─{10,}/)
  return src.slice(start, end === -1 ? undefined : start + 10 + end)
}

describe('studentService -> guardian portal wiring', () => {
  it('imports the sync hooks', () => {
    expect(svc).toContain("import * as guardianDirectorySync from '@/server/services/guardian/guardianDirectorySync'")
  })

  it('uses exactly five best-effort syncs and one fail-closed removal guard', () => {
    expect(svc.match(/guardianDirectorySync\.syncAfterWrite\(/g)).toHaveLength(5)
    expect(svc.match(/guardianDirectorySync\.guardRemovalInTx\(/g)).toHaveLength(1)
  })

  it('create(): proposes the primary card after the student exists, before the welcome email', () => {
    const body = fnBody(svc, 'create')
    const exists = body.indexOf('if (!student) {')
    const hook = body.indexOf('syncAfterWrite(student.id')
    const email = body.indexOf('sendStudentWelcomeEmail(')
    expect(exists).toBeGreaterThan(-1)
    expect(hook).toBeGreaterThan(exists)
    expect(email).toBeGreaterThan(hook)
    expect(body).toMatch(/syncAfterWrite\(student\.id, \{ uid: actorUid, role: actorRole \}, 'ADMISSION'\)/)
  })

  it('createFromApplication(): proposes after the student is committed and linked to the application', () => {
    const body = fnBody(svc, 'createFromApplication')
    const link = body.indexOf('convertedStudentId: student.id')
    const hook = body.indexOf('syncAfterWrite(student.id')
    expect(link).toBeGreaterThan(-1)
    expect(hook).toBeGreaterThan(link)
    expect(body).toMatch(/'ADMISSION'\)/)
  })

  it('update(): syncs only when a legacy guardian column was touched, after the transaction', () => {
    const body = fnBody(svc, 'update')
    const declared = body.indexOf('const guardianTouched')
    const tryAt = body.indexOf('  try {\n    await prisma.$transaction')
    const hook = body.indexOf('syncAfterWrite(id')
    expect(declared).toBeGreaterThan(-1)
    expect(declared).toBeLessThan(tryAt)             // in scope for the hook below
    expect(hook).toBeGreaterThan(body.indexOf('guardianTouched', tryAt))
    expect(body).toMatch(/if \(guardianTouched\) \{\s*await guardianDirectorySync\.syncAfterWrite\(id/)
  })

  it('addGuardian / updateGuardian: sync runs AFTER the staff transaction commits (never inside it)', () => {
    for (const name of ['addGuardian', 'updateGuardian']) {
      const body = fnBody(svc, name)
      const txEnd = body.indexOf('\n  })\n')
      const hook = body.indexOf('syncAfterWrite(studentId')
      expect(txEnd, name).toBeGreaterThan(-1)
      expect(hook, name).toBeGreaterThan(txEnd)
      expect(body.indexOf('student.guardian_changed'), name).toBeGreaterThan(hook)
    }
  })

  it('deleteGuardian: suspends portal access INSIDE the transaction and BEFORE the delete; audit after commit', () => {
    const body = fnBody(svc, 'deleteGuardian')
    const guard = body.indexOf('guardRemovalInTx(tx, guardianId')
    const del = body.indexOf('tx.studentGuardian.delete(')
    const txClose = body.indexOf('\n  })\n')
    const emit = body.indexOf('emitAudit(portalAudit)')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(del)
    expect(del).toBeLessThan(txClose)
    expect(emit).toBeGreaterThan(txClose)
    expect(body).toMatch(/const portalAudit = await prisma\.\$transaction/)
  })
})

describe('guardianDirectorySync failure policies', () => {
  it('syncAfterWrite is best effort: it catches everything and never throws', () => {
    const body = fnBody(sync, 'syncAfterWrite')
    expect(body).toContain('try {')
    expect(body).toMatch(/catch \(err\)/)
    expect(body).not.toMatch(/\bthrow\b/)
    expect(body).toContain('logger.error')
  })

  it('guardRemovalInTx is FAIL CLOSED: no try/catch, so a failure aborts the delete', () => {
    const body = fnBody(sync, 'guardRemovalInTx')
    expect(body).not.toMatch(/\btry\b|\bcatch\b/)
    expect(body).toContain('suspendLinksForRemovedCard(')
  })

  it('audit emission never throws after a commit', () => {
    const body = fnBody(sync, 'emitAudit')
    expect(body).toMatch(/try \{[\s\S]*auditService\.log\(r\)[\s\S]*\} catch/)
  })

  it('imports server-only like the other services', () => {
    expect(sync).toContain("import 'server-only'")
  })
})
