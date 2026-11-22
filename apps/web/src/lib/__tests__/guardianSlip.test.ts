/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/__tests__/guardianSlip.test.ts
 * [PURPOSE]: The printed invitation slip carries staff-typed names and a one-time code. Pins that
 *   markup in a name cannot reach the page, and that the code and expiry are printed as given.
 */
import { describe, it, expect } from 'vitest'
import { buildSlipHtml, escapeHtml, formatSlipDate } from '../guardianSlip'

const base = {
  guardianName: 'Grace Banda', studentName: 'Chikondi Phiri',
  code: 'ABCDEF-GHJKMN-PQRSTU', expiresAt: '2026-11-21T10:00:00.000Z', claimUrl: 'https://school.example/login?claim=1',
}

describe('escapeHtml', () => {
  it('escapes every character that can open or close markup', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  })
  it('escapes & first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('buildSlipHtml', () => {
  it('prints the code, both names, the link and the expiry date', () => {
    const html = buildSlipHtml(base)
    for (const s of ['ABCDEF-GHJKMN-PQRSTU', 'Grace Banda', 'Chikondi Phiri', 'https://school.example/login?claim=1', '21 Nov 2026']) {
      expect(html).toContain(s)
    }
  })
  it('cannot be made to inject markup through a name', () => {
    const html = buildSlipHtml({ ...base, guardianName: '<script>alert(1)</script>', studentName: '"><img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
  it('prints exactly one script: its own print call', () => {
    expect(buildSlipHtml(base).match(/<script>/g)).toHaveLength(1)
  })
})

describe('formatSlipDate', () => {
  it('uses UTC so the date does not move with the machine timezone', () => {
    expect(formatSlipDate('2026-11-21T23:59:00.000Z')).toBe('21 Nov 2026')
  })
  it('is empty rather than "Invalid Date" for garbage', () => {
    expect(formatSlipDate('not a date')).toBe('')
  })
})
