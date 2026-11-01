/**
 * apps/web/test/security/docGen.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Renders the two GENERATED security documents (Issue 7):
 *     docs/security/endpoint-inventory.md   every server entry point + how it is protected
 *     docs/security/role-resource-matrix.md which role may read / create / update /
 *                                           approve / delete / export which resource
 *   Both are derived from source (the route files and ROLE_PERMISSIONS), never
 *   typed by hand, so they cannot drift. `pnpm --filter web docs:security`
 *   rewrites them; securityDocs.test.ts fails CI when they are stale.
 *
 *   Output is deterministic (sorted, no timestamps) and uses LF line endings.
 */
import {
  collectAll,
  collectUnmountedRouters,
  type ExpressEndpoint,
} from './endpointInventory'
import {
  ENDPOINT_POLICY,
  ROUTE_HANDLER_POLICY,
  SERVER_ACTION_FILES,
  STUDENT_REACHABLE_MUTATIONS,
} from './accessPolicy'
import { ROLE_PERMISSIONS } from '../../../../packages/shared/types/permissions'

const ROLES = [
  'admin',
  'high_rank',
  'finance',
  'library',
  'lower_rank',
  'academic',
  'hr',
  'exam_officer',
  'student',
] as const

const HEADER_NOTE =
  '<!-- GENERATED FILE — do not edit by hand. Run `pnpm --filter web docs:security` to regenerate. -->'

// ─── helpers ──────────────────────────────────────────────────────────────

const GATE_NAMES = [
  'requirePermission',
  'requireAnyPermission',
  'requireAllPermissions',
  'requireRole',
  'requireAssignmentViewAccess',
  'requireClassOwnership',
  'verifyCronOrAdmin',
] as const

/** Extracts `name(args)` for every gate call in a middleware text (balanced parens). */
export function gateCalls(mw: string): string[] {
  const out: string[] = []
  const re = new RegExp(`\\b(${GATE_NAMES.join('|')})\\s*\\(`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(mw))) {
    let depth = 1
    let i = re.lastIndex
    while (i < mw.length && depth > 0) {
      if (mw[i] === '(') depth++
      else if (mw[i] === ')') depth--
      i++
    }
    out.push(
      `${m[1]}(${mw
        .slice(re.lastIndex, i - 1)
        .replace(/\s+/g, ' ')
        .replace(/'/g, '')
        .replace(/\[ /g, '[')
        .replace(/ \]/g, ']')
        .trim()})`,
    )
  }
  return out
}

const esc = (s: string) => s.replace(/\|/g, '\\|')

function clientIds(e: ExpressEndpoint): string {
  const parts = [...e.fullPath.matchAll(/:(\w+)/g)].map((m) => `:${m[1]}`)
  if (/req\.body/.test(e.handlerText)) parts.push('body')
  if (/req\.query/.test(e.handlerText)) parts.push('query')
  return parts.length ? parts.join(', ') : '—'
}

function accessCell(e: ExpressEndpoint): string {
  if (!e.authenticated) return '**none (public)**'
  const gates = e.middleware.flatMap(gateCalls)
  return gates.length ? gates.map((g) => `\`${esc(g)}\``).join(' + ') : 'signed-in user'
}

function areaOf(file: string): string {
  return file.replace(/^src\/server\/routes\//, '').replace(/\.ts$/, '')
}

// ─── endpoint inventory ───────────────────────────────────────────────────

export function renderEndpointInventory(webRoot: string): string {
  const { express, routeHandlers, serverActions } = collectAll(webRoot)
  const unmounted = collectUnmountedRouters(webRoot)
  const sorted = [...express].sort(
    (a, b) =>
      areaOf(a.file).localeCompare(areaOf(b.file)) ||
      a.fullPath.localeCompare(b.fullPath) ||
      a.method.localeCompare(b.method),
  )

  const total = sorted.length
  const mutations = sorted.filter((e) => e.method !== 'GET')
  const publicEps = sorted.filter((e) => !e.authenticated)
  const gated = sorted.filter((e) => e.authenticated && e.hasGate)
  const authOnly = sorted.filter((e) => e.authenticated && !e.hasGate)
  const gatedMutations = mutations.filter((e) => e.authenticated && e.hasGate)
  const catCount = new Map<string, number>()
  for (const e of sorted) {
    const p = ENDPOINT_POLICY[`${e.method} ${e.fullPath}`]
    if (p) catCount.set(p.category, (catCount.get(p.category) ?? 0) + 1)
  }

  const L: string[] = []
  L.push(HEADER_NOTE, '')
  L.push('# Server endpoint inventory', '')
  L.push(
    'Every server entry point, extracted from source by `test/security/endpointInventory.ts` ' +
      '(the same extractor `routeContract.test.ts` uses to fail CI on an unprotected endpoint). ' +
      '**Auth** is enforced by `verifyAuth` (Firebase ID token, revocation checked). ' +
      '**Gate** is the role/permission middleware that runs *before* the handler. ' +
      '**Declared policy** is the explicit decision recorded in `test/security/accessPolicy.ts` ' +
      'for endpoints whose protection is not simply "auth + gate".',
    '',
  )
  L.push('## Summary', '')
  L.push('| Measure | Count |', '|---|---:|')
  L.push(`| Express endpoints (mounted under \`/api\`) | ${total} |`)
  L.push(`| — mutations (non-GET) | ${mutations.length} |`)
  L.push(`| — with a role/permission gate | ${gated.length} (${gatedMutations.length} mutations) |`)
  L.push(`| — signed-in only, with a declared policy | ${authOnly.length} |`)
  L.push(`| — public (no identity) | ${publicEps.length} |`)
  for (const [c, n] of [...catCount].sort()) L.push(`| — declared \`${c}\` | ${n} |`)
  L.push(`| Next.js route handlers | ${routeHandlers.length} |`)
  L.push(`| Server Actions | ${serverActions.length} |`)
  L.push(`| Routers declared but never mounted | ${unmounted.length} |`, '')

  L.push('## Next.js route handlers', '')
  L.push('| Path | Methods | Declared policy | Source |', '|---|---|---|---|')
  for (const r of [...routeHandlers].sort((a, b) => a.fullPath.localeCompare(b.fullPath))) {
    L.push(
      `| \`${r.fullPath}\` | ${r.methods.join(', ')} | ${ROUTE_HANDLER_POLICY[r.fullPath] ?? '**UNDECLARED**'} | \`${r.file}\` |`,
    )
  }
  L.push('')

  L.push('## Server Actions', '')
  L.push('Every exported action must authenticate (`requireCurrentUser`) before any side effect — enforced by `routeContract.test.ts`.', '')
  L.push('| Action | Source |', '|---|---|')
  for (const a of [...serverActions].sort((x, y) => x.name.localeCompare(y.name))) {
    L.push(`| \`${a.name}\` | \`${a.file}\` |`)
  }
  L.push('', `Server Action files in scope: ${SERVER_ACTION_FILES.map((f) => `\`${f}\``).join(', ')}.`, '')

  L.push('## Self-service mutations reachable by students', '')
  L.push(
    'A student token passes `verifyAuth`; any mutation that is reachable without a gate must be listed here with the reason it is safe (own data only). The contract test fails for any other.',
    '',
  )
  L.push('| Endpoint | Why a student may call it |', '|---|---|')
  for (const [k, v] of Object.entries(STUDENT_REACHABLE_MUTATIONS).sort()) L.push(`| \`${k}\` | ${esc(v)} |`)
  L.push('')

  L.push('## Express endpoints', '')
  L.push(
    'Columns: **Client IDs** = path params plus `body` / `query` when the handler reads them (each is untrusted input); **M** = mutation.',
    '',
  )
  let current = ''
  for (const e of sorted) {
    const area = areaOf(e.file)
    if (area !== current) {
      current = area
      L.push('', `### ${area}`, '')
      L.push('| M | Method | Path | Access | Declared policy | Client IDs |', '|:-:|---|---|---|---|---|')
    }
    const key = `${e.method} ${e.fullPath}`
    const pol = ENDPOINT_POLICY[key]
    L.push(
      `| ${e.method === 'GET' ? '' : '●'} | ${e.method} | \`${e.fullPath}\` | ${accessCell(e)} | ${pol ? pol.category : ''} | ${clientIds(e)} |`,
    )
  }
  L.push('')
  return L.join('\n')
}

// ─── role / resource matrix ───────────────────────────────────────────────

type Cat = 'readOwn' | 'readAssigned' | 'readAll' | 'create' | 'update' | 'approve' | 'delete' | 'export'

const CAT_LABEL: Record<Cat, string> = {
  readOwn: 'Read own',
  readAssigned: 'Read assigned',
  readAll: 'Read all',
  create: 'Create',
  update: 'Update',
  approve: 'Approve / release',
  delete: 'Delete / void',
  export: 'Export',
}
const CAT_ORDER: Cat[] = ['readOwn', 'readAssigned', 'readAll', 'create', 'update', 'approve', 'delete', 'export']

/** Permissions whose scope is "the records assigned to me" rather than own / all. */
const ASSIGNED = new Set<string>(['assets.viewOwnAssigned', 'exam.enterOwnClassMarks'])
/** Explicit placements where the verb alone is ambiguous. */
const OVERRIDE: Record<string, Cat> = {
  'student.printProfile': 'export',
  'search.globalSearch': 'readAll',
  'announcement.editOwn': 'update',
  'announcement.deleteOwn': 'delete',
  'exam.enterOwnClassMarks': 'update',
  'exam.correctMarksInReview': 'update',
  'exam.runPromotionEngine': 'approve',
  'exam.computeResults': 'update',
  'exam.generateReportCard': 'create',
  'finance.lockPayroll': 'approve',
  'finance.rollbackPayroll': 'delete',
  'finance.runPayroll': 'approve',
  'finance.clearLibraryFine': 'delete',
  'finance.waiveFine': 'delete',
  'library.clearFine': 'delete',
  'library.waiveFine': 'delete',
  'library.markLost': 'delete',
  'library.markDamaged': 'update',
  'userMgmt.terminateSession': 'delete',
  'userMgmt.suspendUser': 'update',
  'userMgmt.archiveUser': 'delete',
  'hr.terminateStaff': 'delete',
  'application.convertToStudent': 'approve',
  'timetable.editDirect': 'update',
  'timetable.editWithApproval': 'create',
  'class.approvePendingAction': 'approve',
  'student.approvePendingAction': 'approve',
}

export function classifyPermission(perm: string): Cat {
  if (OVERRIDE[perm]) return OVERRIDE[perm]
  if (ASSIGNED.has(perm)) return 'readAssigned'
  const action = perm.split('.').slice(1).join('.')
  if (/^export/.test(action)) return 'export'
  if (/^view(Own|Personal)/.test(action) || action === 'viewOwn' || /^recordOwn/.test(action)) return 'readOwn'
  if (/^(approve|reject|authorize|authorise|finalize|unlock|publish|review|lock|rollback|run|deny|resolve|verify|convert)/.test(action)) return 'approve'
  if (/^(delete|softDelete|hardDelete|terminate|archive|dispose|waive|clear|cancel|void)/.test(action)) return 'delete'
  if (/^(create|add|generate|bulkGenerate|record|issue|register|apply|request|submit|upload|receive|define|assign|schedule|book|give|make|perform|transfer|allocate|recommend|link)/.test(action)) return 'create'
  if (/^(edit|update|manage|adjust|promote|change|configure|correct|reset|suspend|mark|enter|set|compute|print)/.test(action)) return 'update'
  if (/^view|^globalSearch/.test(action) || action === 'view') return 'readAll'
  return 'update'
}

export function renderRoleMatrix(): string {
  const byResource = new Map<string, string[]>()
  const allPerms = new Set<string>()
  for (const set of Object.values(ROLE_PERMISSIONS)) for (const p of set) allPerms.add(p)
  for (const p of [...allPerms].sort()) {
    const r = p.split('.')[0]!
    byResource.set(r, [...(byResource.get(r) ?? []), p])
  }
  const holds = (role: string, p: string) =>
    (ROLE_PERMISSIONS as Record<string, ReadonlySet<string>>)[role]!.has(p)

  const L: string[] = []
  L.push(HEADER_NOTE, '')
  L.push('# Role / resource authorization matrix', '')
  L.push(
    'Derived from `ROLE_PERMISSIONS` in `packages/shared/types/permissions.ts` — the single source the server middleware ' +
      '(`requirePermission*`) and the UI both read. It lists what each of the nine roles **holds**. ' +
      'Where a permission only grants access to *own* or *assigned* records, the service layer narrows it further ' +
      '(ownership / class-membership / subject-teacher checks); `endpoint-inventory.md` shows where each rule is enforced.',
    '',
  )
  L.push('**Super user.** The `superUser` Firebase custom claim (strict boolean `true`, set only by the seed / ops tooling) passes ' +
    'every permission check (`hasPermission(role, perm, true)`). It does **not** bypass self-review blocking on approvals. ' +
    'A role string alone can never confer it (verified by the contract test).', '')
  L.push('**Legend.** `●` the role holds every permission in the cell · `◐ n/m` holds n of m · `·` holds none.', '')
  L.push('**Roles.** ' + ROLES.map((r) => `\`${r}\``).join(', ') + '. Column headers use the first letters: ' +
    'AD admin · HR high_rank · FI finance · LI library · LR lower_rank · AC academic · HM hr · EO exam_officer · ST student.', '')

  const short = ['AD', 'HR', 'FI', 'LI', 'LR', 'AC', 'HM', 'EO', 'ST']

  // Cross-resource overview first.
  L.push('## Overview — permissions held per role', '')
  L.push('| Resource | ' + short.join(' | ') + ' |', '|---|' + short.map(() => ':-:').join('|') + '|')
  for (const [res, perms] of byResource) {
    const cells = ROLES.map((r) => {
      const n = perms.filter((p) => holds(r, p)).length
      return n === 0 ? '·' : n === perms.length ? '●' : `${n}/${perms.length}`
    })
    L.push(`| ${res} | ${cells.join(' | ')} |`)
  }
  L.push('')

  for (const [res, perms] of byResource) {
    L.push(`## ${res}`, '')
    const cats = new Map<Cat, string[]>()
    for (const p of perms) cats.set(classifyPermission(p), [...(cats.get(classifyPermission(p)) ?? []), p])
    L.push('| Operation | ' + short.join(' | ') + ' | Permissions |', '|---|' + short.map(() => ':-:').join('|') + '|---|')
    for (const c of CAT_ORDER) {
      const ps = cats.get(c)
      if (!ps) continue
      const cells = ROLES.map((r) => {
        const n = ps.filter((p) => holds(r, p)).length
        return n === 0 ? '·' : n === ps.length ? '●' : `◐ ${n}/${ps.length}`
      })
      L.push(`| ${CAT_LABEL[c]} | ${cells.join(' | ')} | ${ps.map((p) => `\`${p.split('.').slice(1).join('.')}\``).join(', ')} |`)
    }
    L.push('', '<details><summary>Who holds each permission</summary>', '')
    L.push('| Permission | Operation | Roles |', '|---|---|---|')
    for (const p of perms) {
      const rs = ROLES.filter((r) => holds(r, p))
      L.push(`| \`${p}\` | ${CAT_LABEL[classifyPermission(p)]} | ${rs.length ? rs.map((r) => `\`${r}\``).join(', ') : '_none (super user only)_'} |`)
    }
    L.push('', '</details>', '')
  }
  return L.join('\n')
}
