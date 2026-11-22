/**
 * Static audit of report deep links (Gap 9). Dashboards and analytics services
 * link to `/reports?tab=<id>`; a link to a tab the viewing role does not have
 * silently lands on that role's first tab. This reads the source (the runner has
 * no DOM) and checks every link resolves.
 *   - Dashboard files are checked against the role they render for.
 *   - Analytics services serve several roles, so each link must resolve for at
 *     least one role (directly or through TAB_ALIASES).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'src')
const page = readFileSync(join(root, 'app/(auth)/reports/page.tsx'), 'utf8')

function block(src: string, startMarker: string): string {
  const start = src.indexOf(startMarker)
  if (start < 0) throw new Error(`marker not found: ${startMarker}`)
  const open = src.indexOf('{', src.indexOf('=', start))
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1)
  }
  throw new Error('unbalanced block')
}

/** role -> tab ids, read from ROLE_TABS. */
function roleTabs(): Record<string, Set<string>> {
  const body = block(page, 'const ROLE_TABS')
  const out: Record<string, Set<string>> = {}
  const re = /^\s{2}([a-z_]+): \[([\s\S]*?)^\s{2}\],/gm
  for (const m of body.matchAll(re)) {
    out[m[1] as string] = new Set([...(m[2] as string).matchAll(/id: '([a-z_]+)'/g)].map((x) => x[1] as string))
  }
  return out
}

function aliases(): Record<string, Record<string, string>> {
  const body = block(page, 'const TAB_ALIASES')
  const out: Record<string, Record<string, string>> = {}
  for (const m of body.matchAll(/^\s{2}([a-z_]+): \{([\s\S]*?)^\s{2}\},/gm)) {
    out[m[1] as string] = Object.fromEntries(
      [...(m[2] as string).matchAll(/([a-z_]+): '([a-z_]+)'/g)].map((x) => [x[1] as string, x[2] as string]),
    )
  }
  return out
}

const TABS = roleTabs()
const ALIASES = aliases()
const resolves = (role: string, id: string) =>
  TABS[role]?.has(id) === true || TABS[role]?.has(ALIASES[role]?.[id] ?? '') === true

const tabsIn = (src: string) => [...src.matchAll(/\/reports\?tab=([a-z_]+)/g)].map((m) => m[1] as string)

const DASHBOARDS: Record<string, string> = {
  'HighRankDashboard.tsx': 'high_rank',
  'FinanceDashboard.tsx': 'finance',
  'AdminDashboard.tsx': 'admin',
  'AcademicDashboard.tsx': 'academic',
  'ExamOfficerDashboard.tsx': 'exam_officer',
  'HRDashboard.tsx': 'hr',
  'LibraryDashboard.tsx': 'library',
  'LowerRankDashboard.tsx': 'lower_rank',
  'StudentDashboard.tsx': 'student',
}

describe('report tab table', () => {
  it('reads all nine roles', () => {
    expect(Object.keys(TABS).sort()).toEqual(
      ['academic', 'admin', 'exam_officer', 'finance', 'high_rank', 'hr', 'library', 'lower_rank', 'student'],
    )
  })
})

describe('dashboard links resolve for the role that sees them', () => {
  for (const [file, role] of Object.entries(DASHBOARDS)) {
    it(`${file} → ${role}`, () => {
      const src = readFileSync(join(root, 'components/dashboards', file), 'utf8')
      const bad = tabsIn(src).filter((id) => !resolves(role, id))
      expect(bad).toEqual([])
    })
  }
})

describe('analytics service links point at a real tab', () => {
  const dir = join(root, 'server/services/analytics')
  const anyRole = (id: string) => Object.keys(TABS).some((r) => resolves(r, id))
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
    const ids = tabsIn(readFileSync(join(dir, f), 'utf8'))
    if (ids.length === 0) continue
    it(f, () => {
      expect(ids.filter((id) => !anyRole(id))).toEqual([])
    })
  }
})
