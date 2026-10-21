import { describe, it, expect } from 'vitest'
import { filterLinesFromParams } from '../exportFilters'
import { aboutMatrix } from '../reportExport'

const params = (qs: string) => new URLSearchParams(qs).entries()

describe('filterLinesFromParams', () => {
  it('lists each active filter, not the tab, with readable labels', () => {
    expect(filterLinesFromParams(params('tab=aging&bucket=d90_plus&status=OPEN'))).toEqual(['Ageing bucket: d90_plus', 'Status: OPEN'])
  })
  it('marks id-valued filters as ids and keeps unknown keys visible', () => {
    expect(filterLinesFromParams(params('tab=pipeline&classId=c1&teacherUid=u9&weird=1'))).toEqual(['Class (id): c1', 'Teacher (id): u9', 'weird: 1'])
  })
  it('skips empty values and repeated keys', () => {
    expect(filterLinesFromParams(params('tab=x&bucket=&status=A&status=B'))).toEqual(['Status: A'])
  })
  it('keeps special characters and dates as typed', () => {
    expect(filterLinesFromParams(params('tab=x&q=O%27Brien%20%26%20Sons&from=2026-01-31&to=2026-02-28'))).toEqual(["Search: O'Brien & Sons", 'From: 2026-01-31', 'To: 2026-02-28'])
  })
  it('returns nothing when only the tab is set', () => {
    expect(filterLinesFromParams(params('tab=overview'))).toEqual([])
  })
})

describe('aboutMatrix (the workbook\'s "About this export" sheet)', () => {
  const when = new Date('2026-10-20T08:00:00Z')
  const col = { label: 'A', value: () => 1 }
  it('states the filters, row counts and any note that a table is not the whole result', () => {
    const m = aboutMatrix(
      { title: 'Reports — finance — Receivables', schoolName: 'Demo Secondary', filters: ['Academic year: 2025/2026', 'Ageing bucket: d90_plus'], generatedAt: when },
      [
        { name: 'Debtors', columns: [col as never], rows: [1, 2, 3], note: 'First 300 largest balances only' },
        { name: 'By form', columns: [col as never], rows: [1] },
      ],
    )
    expect(m[0]).toEqual(['Report', 'Reports — finance — Receivables'])
    expect(m[3]).toEqual(['Filters', 'Academic year: 2025/2026; Ageing bucket: d90_plus'])
    expect(m.slice(5)).toEqual([
      ['Table', 'Rows', 'Note'],
      ['Debtors', 3, 'First 300 largest balances only'],
      ['By form', 1, 'Complete for the filters above'],
    ])
  })
  it('says "None" when no filter is applied', () => {
    const m = aboutMatrix({ title: 't', schoolName: 's', filters: [], generatedAt: when }, [])
    expect(m[3]).toEqual(['Filters', 'None'])
  })
})
