// @vitest-environment node
/**
 * Issue 7 — the generated security docs must match the code.
 * Fails CI when a route / permission changed but the docs were not regenerated
 * (`pnpm --filter web docs:security`), so the inventory and role matrix can
 * never silently describe an older version of the system.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderEndpointInventory, renderRoleMatrix, classifyPermission } from '../../../../test/security/docGen'

const webRoot = path.resolve(__dirname, '../../../..')
const read = (n: string) =>
  fs.readFileSync(path.join(webRoot, 'docs/security', n), 'utf8').replace(/\r\n/g, '\n').trimEnd()

describe('generated security docs are current', () => {
  it('endpoint-inventory.md matches the source', () => {
    expect(read('endpoint-inventory.md')).toBe(renderEndpointInventory(webRoot).trimEnd())
  })
  it('role-resource-matrix.md matches ROLE_PERMISSIONS', () => {
    expect(read('role-resource-matrix.md')).toBe(renderRoleMatrix().trimEnd())
  })
})

describe('permission → operation classification', () => {
  it.each([
    ['student.viewOwn', 'readOwn'],
    ['exam.viewOwnResults', 'readOwn'],
    ['assets.viewOwnAssigned', 'readAssigned'],
    ['student.view', 'readAll'],
    ['student.create', 'create'],
    ['student.edit', 'update'],
    ['exam.authorizeRelease', 'approve'],
    ['finance.approvePayroll', 'approve'],
    ['student.hardDelete', 'delete'],
    ['finance.waiveFine', 'delete'],
    ['report.export', 'export'],
    ['student.printProfile', 'export'],
  ])('%s → %s', (perm, cat) => {
    expect(classifyPermission(perm)).toBe(cat)
  })
})
