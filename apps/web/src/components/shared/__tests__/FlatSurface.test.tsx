/**
 * Report cards draw their own bordered card everywhere (dashboards sit on the page
 * background), but sit flat on the module panel when wrapped in <FlatSurface> (Reports page).
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { FlatSurface } from '../FlatSurface'
import { ChartCard } from '../ChartCard'
import { ReportCard } from '@/components/reports/ui/ReportCard'
import { FilterBar } from '@/components/reports/ui/ReportFilters'
import { StatCard } from '../StatCard'
import { ListCard } from '../ListCard'
import { ModuleSurface } from '../ModuleSurface'
import { DataTable } from '../DataTable'
import { ModuleTabs } from '../ModuleTabs'
import { Users } from 'lucide-react'

const CARD = ['border-base', 'bg-surface']
const hasCard = (el: Element | null) => !!el && CARD.every((c) => el.className.includes(c))

describe('FlatSurface', () => {
  it('ReportCard is a card by default and flat inside <FlatSurface>', () => {
    const a = render(<ReportCard title="T"><p>x</p></ReportCard>)
    expect(hasCard(a.container.querySelector('section'))).toBe(true)
    a.unmount()
    const b = render(<FlatSurface><ReportCard title="T" className="lg:col-span-2"><p>x</p></ReportCard></FlatSurface>)
    const s = b.container.querySelector('section')
    expect(hasCard(s)).toBe(false)
    expect(s?.className).toContain('lg:col-span-2')           // layout classes survive
    expect(b.container.textContent).toContain('T')            // title and content still render
    expect(b.container.textContent).toContain('x')
  })

  it('ChartCard is a card by default and flat inside <FlatSurface>', () => {
    const a = render(<ChartCard title="C" isLoading={false}><p>x</p></ChartCard>)
    expect(hasCard(a.container.firstElementChild)).toBe(true)
    a.unmount()
    const b = render(<FlatSurface><ChartCard title="C" isLoading={false}><p>x</p></ChartCard></FlatSurface>)
    expect(hasCard(b.container.firstElementChild)).toBe(false)
    expect(b.container.textContent).toContain('C')
  })

  it('FilterBar loses its box inside <FlatSurface> but keeps its controls', () => {
    const a = render(<FilterBar><span>f</span></FilterBar>)
    expect(hasCard(a.container.firstElementChild)).toBe(true)
    a.unmount()
    const b = render(<FlatSurface><FilterBar><span>f</span></FilterBar></FlatSurface>)
    expect(hasCard(b.container.firstElementChild)).toBe(false)
    expect(b.container.textContent).toBe('f')
  })
})

describe('Phase 8a: ModuleSurface provides the flat look', () => {
  it('ModuleTabs uses sky ink only when onSky, and still reports clicks', () => {
    // jsdom has no scrollIntoView; the tab strip calls it to keep the active tab in view.
    Element.prototype.scrollIntoView = () => {}
    const seen: string[] = []
    const tabs = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
    const a = render(<ModuleTabs tabs={tabs} active="a" onChange={(id) => seen.push(id)} />)
    expect(a.container.innerHTML).toContain('text-muted')
    expect(a.container.innerHTML).not.toContain('app-sky-idle')
    a.unmount()
    const b = render(<ModuleTabs tabs={tabs} active="a" onChange={(id) => seen.push(id)} onSky />)
    expect(b.container.innerHTML).toContain('app-sky-idle')
    expect(b.container.innerHTML).not.toContain('text-brand-teal"')
    const idle = Array.from(b.container.querySelectorAll('button')).find((x) => x.textContent === 'B') as HTMLButtonElement
    idle.click()
    expect(seen).toEqual(['b'])
  })

  it('ModuleSurface is one bordered surface with no line-art', () => {
    const { container } = render(<ModuleSurface><p>x</p></ModuleSurface>)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('app-surface')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toBe('x')
  })

  it('StatCard is a card alone, a tint tile on a ModuleSurface, and keeps its border as a link', () => {
    const a = render(<StatCard label="L" value="1" icon={Users} />)
    expect(a.container.querySelector('.app-tint')).toBeNull()
    expect(a.container.innerHTML).toContain('border-base')
    a.unmount()
    const b = render(<ModuleSurface><StatCard label="L" value="1" icon={Users} /></ModuleSurface>)
    expect(b.container.querySelector('.app-tint')).not.toBeNull()
    expect(b.container.querySelector('.app-tint')?.className).not.toContain('border-base')
    expect(b.container.textContent).toContain('L')
    b.unmount()
    const c = render(<ModuleSurface><StatCard label="L" value="1" icon={Users} href="/x" /></ModuleSurface>)
    expect(c.container.querySelector('.app-tint')).toBeNull()
    expect(c.container.querySelector('a')?.getAttribute('href')).toBe('/x')
  })

  it('ListCard is flat on a ModuleSurface and still renders title and content', () => {
    const a = render(<ListCard title="T" isLoading={false} isEmpty={false}><p>row</p></ListCard>)
    expect(hasCard(a.container.firstElementChild)).toBe(true)
    a.unmount()
    const b = render(<ModuleSurface><ListCard title="T" isLoading={false} isEmpty={false}><p>row</p></ListCard></ModuleSurface>)
    expect(b.container.querySelector('.app-surface')?.querySelector('.bg-surface')).toBeNull()
    expect(b.container.textContent).toContain('row')
  })

  it('DataTable draws its own card alone, none on a ModuleSurface, and an explicit prop still wins', () => {
    const cols = [{ key: 'n', label: 'Name', priority: 'critical' as const }]
    const rows = [{ id: '1', n: 'Ann' }]
    const t = (props: object = {}) => <DataTable data={rows} isLoading={false} columns={cols} rowKey="id" {...props} />
    const a = render(t())
    expect(a.container.innerHTML).toContain('border border-base rounded-xl overflow-hidden bg-surface')
    a.unmount()
    const b = render(<ModuleSurface>{t()}</ModuleSurface>)
    expect(b.container.innerHTML).not.toContain('border border-base rounded-xl overflow-hidden bg-surface')
    expect(b.container.textContent).toContain('Ann')
    b.unmount()
    const c = render(<ModuleSurface>{t({ bordered: true })}</ModuleSurface>)
    expect(c.container.innerHTML).toContain('border border-base rounded-xl overflow-hidden bg-surface')
  })
})
