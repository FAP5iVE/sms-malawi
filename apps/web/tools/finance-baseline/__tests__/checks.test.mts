/**
 * apps/web/tools/finance-baseline/__tests__/checks.test.mts
 *
 * P0-02 guard rails that need no database: the checks are read-only, uniquely
 * named and documented; the fixture's expectations refer to real checks; the
 * report maths is exact. (The checks are run against real Postgres, with the
 * planted-defect fixture, by src/server/__integration__/baseline.itest.ts.)
 * Run with: pnpm finance:baseline:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BASELINE_CHECKS, FORBIDDEN_SQL_WORDS } from '../checks.mjs'
import { EXPECTED_ROWS, FIXTURE_STATEMENTS } from '../fixture.mjs'
import { csvField, formatCents, renderCsv, renderMarkdown, toCents, totalsOf } from '../report.mjs'

test('check ids are unique and well formed', () => {
  const ids = BASELINE_CHECKS.map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[A-Z]{2}-\d{2}$/)
})

test('every check is documented', () => {
  for (const c of BASELINE_CHECKS) {
    assert.ok(c.title.length > 10, `${c.id} title`)
    assert.ok(c.why.length > 20, `${c.id} why`)
    assert.ok(/[A-Z]\d|INV-|RA-|RB-|OP-|C-\d|X-\d|D-\d|V-\d|A\d/.test(c.why), `${c.id} cites a plan reference`)
  }
})

test('every query is a plain read-only SELECT or WITH', () => {
  for (const c of BASELINE_CHECKS) {
    const text = c.sql.replace(/'(?:[^']|'')*'/g, "''")
    assert.match(text, /^\s*(select|with)\b/i, `${c.id} starts with select/with`)
    for (const w of FORBIDDEN_SQL_WORDS) {
      assert.doesNotMatch(text, new RegExp(`\\b${w}\\b`, 'i'), `${c.id} must not contain "${w}"`)
    }
  }
})

test('every query exposes ref_id, amount and detail', () => {
  for (const c of BASELINE_CHECKS) {
    for (const col of ['ref_id', 'amount', 'detail']) {
      assert.match(c.sql, new RegExp(`\\bAS ${col}\\b`), `${c.id} missing ${col}`)
    }
  }
})

test('no query selects a name, email or phone column', () => {
  for (const c of BASELINE_CHECKS) {
    assert.doesNotMatch(c.sql, /\b(firstName|lastName|staffName|email|guardianName|guardianPhone|phone)\b/, c.id)
  }
})

test('fixture expectations refer to real checks, and cover every check that is not expected clean', () => {
  const ids = new Set(BASELINE_CHECKS.map((c) => c.id))
  for (const id of Object.keys(EXPECTED_ROWS)) assert.ok(ids.has(id), `${id} is not a check`)
  for (const id of ids) assert.ok(id in EXPECTED_ROWS, `${id} has no expectation (use 0 if it must stay clean)`)
})

test('the fixture only inserts into a throwaway database (no DROP/TRUNCATE/DELETE)', () => {
  for (const s of FIXTURE_STATEMENTS) assert.doesNotMatch(s, /\b(drop|truncate|delete)\b/i)
})

test('toCents and formatCents are exact', () => {
  assert.equal(toCents('599.00'), 59900n)
  assert.equal(toCents('-12.5'), -1250n)
  assert.equal(toCents('7'), 700n)
  assert.equal(toCents('0.01'), 1n)
  assert.equal(toCents(null), null)
  assert.equal(toCents('abc'), null)
  assert.equal(formatCents(123456789n), '1,234,567.89')
  assert.equal(formatCents(-5n), '-0.05')
})

test('totals add in cents with no floating point drift', () => {
  const rows = Array.from({ length: 10 }, () => ({ ref_id: 'x', amount: '0.10', detail: '' }))
  assert.equal(formatCents(totalsOf(rows).net), '1.00')
  const mixed = [{ ref_id: 'a', amount: '5.00', detail: '' }, { ref_id: 'b', amount: '-2.00', detail: '' }, { ref_id: 'c', amount: null, detail: '' }]
  const t = totalsOf(mixed)
  assert.equal(formatCents(t.net), '3.00')
  assert.equal(formatCents(t.gross), '7.00')
})

test('CSV quoting follows RFC 4180', () => {
  assert.equal(csvField('plain'), 'plain')
  assert.equal(csvField('a,b'), '"a,b"')
  assert.equal(csvField('say "hi"'), '"say ""hi"""')
})

test('report shows counts, partial markers and sample limits', () => {
  const check = BASELINE_CHECKS[0]!
  const rows = Array.from({ length: 3 }, (_, i) => ({ ref_id: `id${i}`, amount: '1.00', detail: 'd' }))
  const md = renderMarkdown([{ check, rows, rowCount: 7 }], { generatedAt: '2026-01-01T00:00:00Z', sampleSize: 2, rowCap: 3 })
  assert.match(md, /7\+/)           // partial marker
  assert.match(md, /…and 5 more/)  // 7 found, 2 shown
  assert.match(md, /cover only the first 3 rows/)
  const csv = renderCsv([{ check, rows, rowCount: 7 }])
  assert.equal(csv.trim().split('\n').length, 4) // header + 3 kept rows
})
