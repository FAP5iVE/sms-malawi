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
