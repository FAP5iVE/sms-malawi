/**
 * Guards the dashboard information hierarchy (Gap 8) at the source level — the
 * test runner has no DOM. Every role dashboard must:
 *   - lead with a bounded set of headline KPIs (no wall of equal cards),
 *   - show its attention queue capped, with the rest behind a button,
 *   - keep secondary figures reachable (SecondaryKpis / DashboardSection),
 *   - use compact quick actions and link to the detailed reports,
 *   - distinguish a failed request from an empty one.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'src/components/dashboards')
const read = (f: string) => readFileSync(join(dir, f), 'utf8')

const ROLE_DASHBOARDS = [
  'HighRankDashboard.tsx', 'FinanceDashboard.tsx', 'AdminDashboard.tsx', 'AcademicDashboard.tsx',
  'ExamOfficerDashboard.tsx', 'HRDashboard.tsx', 'LibraryDashboard.tsx', 'LowerRankDashboard.tsx', 'StudentDashboard.tsx',
]

describe('role dashboards follow the hierarchy', () => {
  for (const f of ROLE_DASHBOARDS) {
    describe(f, () => {
      const src = read(f)
      it('has a bounded primary KPI block, not the old full KPI wall', () => {
        expect(src).not.toMatch(/<DashboardKpis\b/)
        expect(src).not.toMatch(/<ExecutiveKpiGroups\b/)
        expect(/<PrimaryKpis\b/.test(src) || /<PrimaryOverviewKpis\b/.test(src)).toBe(true)
      })
      it('caps its attention queue', () => {
        const queues = src.match(/<DashboardAttention\b[^>]*>/g) ?? []
        expect(queues.length).toBeGreaterThan(0)
        for (const q of queues) expect(q, q).toMatch(/limit=\{\d+\}/)
      })
      it('keeps secondary figures reachable', () => {
        expect(/<SecondaryKpis\b/.test(src) || /<DashboardSection\b/.test(src)).toBe(true)
      })
      it('uses compact quick actions and links to the detailed reports', () => {
        expect(src).toMatch(/<QuickActions\b[^>]*\bcompact\b/)
        expect(src).toMatch(/<ReportLinks\b/)
      })
      it('does not render a chart card without a failure state', () => {
        expect(src).not.toMatch(/<ChartCard\b/)
      })
    })
  }

  it('lead KPIs are capped at four everywhere', () => {
    const sections = readFileSync(join(dir, 'DashboardSections.tsx'), 'utf8')
    expect(sections).toMatch(/max = 4/)
    for (const f of ROLE_DASHBOARDS) {
      const m = read(f).match(/\bmax=\{(\d+)\}/)
      if (m) expect(Number(m[1])).toBeLessThanOrEqual(4)
    }
  })

  it('the Headteacher dashboard has exactly the prescribed order: headlines, two trends, attention, details, actions, reports', () => {
    const src = read('HighRankDashboard.tsx')
    const order = ['<PrimaryKpis', '<PerformanceTrend', '<AttendanceTrend', '<DashboardAttention', 'Details by area', '<QuickActions', '<ReportLinks']
    const at = order.map((t) => src.lastIndexOf(t))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // The four areas are collapsible sections, closed by default.
    for (const area of ['Academic', 'Students', 'Finance', 'People & operations']) expect(src).toContain(`title="${area}"`)
    expect((src.match(/<DashboardSection\b/g) ?? []).length).toBe(4)
    expect(src).not.toMatch(/defaultOpen/)
  })
})
