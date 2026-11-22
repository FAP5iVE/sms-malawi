import { describe, expect, it } from 'vitest'

import { renderStaticChartSVG } from '../chartUtils'

const terms = [
  { x: 'Term 1', revenue: 4_200_000, expenses: 2_100_000 },
  { x: 'Term 2', revenue: 3_900_000, expenses: 2_500_000 },
]
const labels = { revenue: 'Fees collected', expenses: 'Expenses' }

describe('renderStaticChartSVG labelling', () => {
  it('names every series in a key', () => {
    for (const type of ['bar', 'stackedBar', 'line', 'area'] as const) {
      const svg = renderStaticChartSVG(terms, type, 400, 240, labels)
      expect(svg).toContain('Fees collected')
      expect(svg).toContain('Expenses')
    }
  })

  it('falls back to the data key when no label is given', () => {
    expect(renderStaticChartSVG(terms, 'bar', 400, 240)).toContain('>revenue<')
  })

  it('prints the value of every bar', () => {
    const svg = renderStaticChartSVG(terms, 'bar', 400, 240, labels)
    for (const v of ['4.2M', '2.1M', '3.9M', '2.5M']) expect(svg).toContain(`>${v}<`)
  })

  it('prints the value of every line point', () => {
    const svg = renderStaticChartSVG(terms, 'line', 400, 240, labels)
    for (const v of ['4.2M', '2.1M', '3.9M', '2.5M']) expect(svg).toContain(`>${v}<`)
  })

  it('names every pie slice with its share, and lists it in the key with its value', () => {
    const pie = [
      { x: 'Form 1', count: 75 },
      { x: 'Form 2', count: 25 },
    ]
    for (const type of ['pie', 'donut'] as const) {
      const svg = renderStaticChartSVG(pie, type, 400, 260, { count: 'Students' })
      expect(svg).toContain('Form 1 75%')
      expect(svg).toContain('Form 2 25%')
      expect(svg).toContain('Form 1 — 75')
      expect(svg).toContain('Form 2 — 25')
    }
  })

  it('shows the total in the donut hole', () => {
    const svg = renderStaticChartSVG([{ x: 'A', n: 60 }, { x: 'B', n: 40 }], 'donut', 400, 260)
    expect(svg).toContain('>100<')
    expect(svg).toContain('>Total<')
  })

  it('labels a radial gauge with its value and what it measures', () => {
    const svg = renderStaticChartSVG([{ x: 'c', collection: 72 }], 'radial', 220, 200, {
      collection: 'Collection %',
    })
    expect(svg).toContain('72%')
    expect(svg).toContain('Collection %')
  })

  it('escapes names so they cannot break the markup', () => {
    const svg = renderStaticChartSVG([{ x: 'A<b>', n: 1 }], 'bar', 300, 200, { n: 'R&D' })
    expect(svg).toContain('R&amp;D')
    expect(svg).toContain('A&lt;b&gt;')
    expect(svg).not.toContain('A<b>')
  })

  it('still renders the empty state for no data', () => {
    expect(renderStaticChartSVG([], 'bar', 300, 200)).toContain('No data to display.')
  })
})
