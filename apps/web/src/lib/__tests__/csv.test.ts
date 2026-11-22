import { describe, it, expect } from 'vitest'
import { csvFilename, escapeCell, neutraliseFormula, toCsv } from '../csv'

describe('escapeCell', () => {
  it('leaves plain values bare and writes null/undefined as empty', () => {
    expect(escapeCell('Chikondi Banda')).toBe('Chikondi Banda')
    expect(escapeCell(42)).toBe('42')
    expect(escapeCell(0)).toBe('0')
    expect(escapeCell(false)).toBe('false')
    expect(escapeCell(null)).toBe('')
    expect(escapeCell(undefined)).toBe('')
  })
  it('quotes commas, quotes and line breaks, doubling embedded quotes', () => {
    expect(escapeCell('Lilongwe, Area 3')).toBe('"Lilongwe, Area 3"')
    expect(escapeCell('The "best" school')).toBe('"The ""best"" school"')
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeCell('a\r\nb')).toBe('"a\r\nb"')
  })
  it('keeps non-ASCII text intact', () => {
    expect(escapeCell('Mwále — Chímwemwe ✓')).toBe('Mwále — Chímwemwe ✓')
  })
})

describe('formula neutralisation (CSV injection)', () => {
  it('prefixes text that a spreadsheet would run as a formula', () => {
    expect(neutraliseFormula('=HYPERLINK("http://evil","click")')).toBe(`'=HYPERLINK("http://evil","click")`)
    expect(neutraliseFormula('+cmd|calc')).toBe("'+cmd|calc")
    expect(neutraliseFormula('-2+3')).toBe("'-2+3")
    expect(neutraliseFormula('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(neutraliseFormula('\t=1+1')).toBe("'\t=1+1")
    expect(neutraliseFormula('\r=1+1')).toBe("'\r=1+1")
  })
  it('does not touch ordinary text, numbers-as-text, dashes or phone numbers', () => {
    expect(neutraliseFormula('Maths')).toBe('Maths')
    expect(neutraliseFormula('-5')).toBe('-5')
    expect(neutraliseFormula('-12.5')).toBe('-12.5')
    expect(neutraliseFormula('+265999123456')).toBe('+265999123456')
    expect(neutraliseFormula('—')).toBe('—')
    expect(neutraliseFormula('')).toBe('')
    expect(neutraliseFormula('a=b')).toBe('a=b')
  })
  it('applies inside escapeCell and still quotes afterwards', () => {
    expect(escapeCell('=1+1,2')).toBe(`"'=1+1,2"`)
  })
  it('never alters real numbers, including negatives', () => {
    expect(escapeCell(-5)).toBe('-5')
    expect(escapeCell(-0.25)).toBe('-0.25')
  })
})

describe('toCsv', () => {
  type Row = { name: string; amount: number | null; note?: string }
  const cols = [
    { label: 'Name', value: (r: Row) => r.name },
    { label: 'Amount (MWK)', value: (r: Row) => r.amount },
    { label: 'Note', value: (r: Row) => r.note },
  ]
  it('writes a BOM, CRLF rows, a header, and one line per row', () => {
    const out = toCsv<Row>([{ name: 'A', amount: 1200 }, { name: 'B', amount: null, note: 'x,y' }], cols)
    expect(out.startsWith('﻿')).toBe(true)
    expect(out.split('\r\n')).toEqual(['﻿Name,Amount (MWK),Note', 'A,1200,', 'B,,"x,y"', ''])
  })
  it('exports an empty list as a header only (the caller refuses to download it)', () => {
    expect(toCsv<Row>([], cols)).toBe('﻿Name,Amount (MWK),Note\r\n')
  })
  it('handles a large export without losing rows', () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => ({ name: `Student ${i}`, amount: i }))
    const out = toCsv(rows, cols.slice(0, 2) as never)
    expect(out.split('\r\n')).toHaveLength(20_000 + 2)
  })
  it('does not let a hostile name become a formula', () => {
    const out = toCsv<Row>([{ name: '=cmd|"/c calc"!A1', amount: 1 }], cols)
    expect(out).toContain(`"'=cmd|""/c calc""!A1"`)
  })
})

describe('csvFilename', () => {
  it('slugs the label and stamps the date', () => {
    expect(csvFilename('Debtors — 2025/2026 (Term 2)')).toMatch(/^debtors-2025-2026-term-2-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csvFilename('???')).toMatch(/^report-\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
