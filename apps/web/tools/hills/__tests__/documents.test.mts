/**
 * apps/web/tools/hills/__tests__/documents.test.mts
 *
 * [PURPOSE]: Phase 8g guard for RULEBOOK R11.7 and R11.8. Builds every PDF document with sample
 *   data, records the text each page draws, and checks that every page of every document carries
 *   its reference and "Page x of y", and that no sentence uses an em dash. Also checks the CSV and
 *   report-table rules. Run with `--conditions=react-server --import ./tools/hills/stub-prisma.mjs`
 *   (hills:test does).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import type { jsPDF as JsPdf } from 'jspdf'
import { pdfDocs } from '../pdf-fixtures.mjs'
import { tableToMatrix } from '../../../src/lib/reportExport.js'
import { toCsv } from '../../../src/lib/csv.js'

// text() is assigned per document (not on the prototype), so hook document creation and wrap it there.
// The services load jsPDF through require(), so use that same copy rather than an ESM import.
const { jsPDF } = createRequire(import.meta.url)('jspdf') as { jsPDF: typeof JsPdf & { API: { events: unknown[] } } }
let current: Map<number, string[]> | null = null
jsPDF.API.events.push([
  'initialized',
  function hook(this: JsPdf & { text: (...a: unknown[]) => unknown }) {
    const original = this.text.bind(this)
    this.text = (...args: unknown[]) => {
      const t = args[0]
      const page = this.internal.getCurrentPageInfo().pageNumber
      if (current) current.set(page, [...(current.get(page) ?? []), ...(Array.isArray(t) ? t.map(String) : [String(t)])])
      return original(...args)
    }
  },
])

const REFERENCE: Record<string, string> = {
  receipt: 'RCP-1A2B3C4D',
  payslip: 'EMP-0042 · November 2026',
  transcript: 'CHA/2026/0418',
  'transcript-long': 'CHA/2026/0418',
  'report-card': 'CHA/2026/0418',
}

const built: Array<{ name: string; pages: Map<number, string[]> }> = []
for (const d of await pdfDocs()) {
  current = new Map()
  d.build()
  built.push({ name: d.name, pages: current })
  current = null
}

for (const doc of built) {
  test(`${doc.name}: reference and "Page x of y" on every page (R11.7)`, () => {
    const total = doc.pages.size
    assert.ok(total >= 1)
    for (let p = 1; p <= total; p++) {
      const lines = (doc.pages.get(p) ?? []).map((l) => l.trim())
      assert.ok(lines.some((l) => l === `Page ${p} of ${total}` || l.endsWith(`Page ${p} of ${total}`)), `page ${p} says Page ${p} of ${total}`)
      assert.ok(lines.some((l) => REFERENCE[doc.name] && l.includes(REFERENCE[doc.name] as string)), `page ${p} carries the reference`)
    }
  })

  test(`${doc.name}: letterhead on the first page, no em dash in sentences (R11.7, R4)`, () => {
    const first = (doc.pages.get(1) ?? []).join('\n')
    assert.match(first, /CHIKANGAWA HILLS ACADEMY/)
    for (const lines of doc.pages.values()) {
      for (const l of lines) assert.ok(!l.includes('—') || l.trim() === '—', `em dash in "${l}"`)
    }
  })
}

test('the long transcript runs over several pages', () => {
  const long = built.find((b) => b.name === 'transcript-long')
  assert.ok((long?.pages.size ?? 0) >= 2)
})

test('receipt and payslip say they are computer-generated; the generated date is drawn (R11.7)', () => {
  for (const n of ['receipt', 'payslip', 'transcript']) {
    const text = [...(built.find((b) => b.name === n)?.pages.values() ?? [])].flat().join('\n')
    assert.match(text, /Generated on \d{2} \w+ \d{4}\. This is a computer-generated document\./)
  }
})

test('report tables export the same column titles as the screen, and text never runs as a formula (R11.8)', () => {
  const table = {
    name: 'Fee balances',
    columns: [{ label: 'Student', value: (r: { n: string }) => r.n }, { label: 'Balance (MWK)', value: () => 5 }] as never,
    rows: [{ n: '=HYPERLINK("http://x")' }],
  }
  assert.deepEqual(tableToMatrix(table)[0], ['Student', 'Balance (MWK)'])
  const csv = toCsv(table.rows, table.columns as never)
  assert.ok(csv.includes("'=HYPERLINK"), 'formula text is neutralised')
  assert.ok(csv.split('\r\n')[0]?.endsWith('Student,Balance (MWK)'))
})
