/**
 * apps/web/tools/hills/__tests__/emails.test.mts
 *
 * [PURPOSE]: Phase 8f guard for RULEBOOK section 11 (R11.1 to R11.4). Renders every email template
 *   with sample data and checks the rules a machine can check. Run with
 *   `--conditions=react-server` because the templates import 'server-only' (hills:test does).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderAll } from '../email-fixtures.mjs'

const emails = await renderAll()
const EMOJI = /\p{Extended_Pictographic}/u
const visible = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')

test('all 10 templates are rendered, 19 samples', () => {
  assert.equal(emails.length, 19)
})

for (const e of emails) {
  test(`${e.name}: size, structure and shell (R11.1 to R11.3)`, () => {
    assert.ok(Buffer.byteLength(e.html) < 100 * 1024, 'HTML under 100KB')
    assert.match(e.html, /max-width:600px/)
    assert.match(e.html, /<table role="presentation"/)
    assert.match(e.html, /<meta name="color-scheme" content="light dark"/)
    assert.match(e.html, /<meta name="supported-color-schemes" content="light dark"/)
    assert.match(e.html, /<img src="https:\/\/[^"]+\/email-crest\.png" width="56" height="56" alt="Chikangawa Hills Academy"/)
    assert.doesNotMatch(e.html, /data:image|cid:/)
    assert.match(e.html, /background-color:#1e3a5f;border-radius:8px 8px 0 0/, 'solid navy band')
    assert.match(e.html, /font-size:20px;font-weight:bold;color:#ffffff[^>]*>\s*Chikangawa Hills Academy/, 'school name is live text')
  })

  test(`${e.name}: text size and button size (R11.1)`, () => {
    const sizes = [...e.html.matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1]))
    const small = sizes.filter((s) => s < 14)
    // 1px is the hidden preview line, 12px is only the alt text style on the crest image.
    assert.deepEqual(small.filter((s) => s !== 12 && s !== 1), [], 'no text under 14px')
    assert.ok(!/line-height:1\.[6-9]/.test(e.html), 'line height 1.5 or tighter')
    if (e.html.includes('class="em-btn"')) {
      assert.match(e.html, /line-height:44px;min-width:200px/)
      assert.match(e.html, /\.em-btn \{ display: block !important; width: 100% !important; \}/, 'full width on phones')
    }
  })

  test(`${e.name}: wording rules (R4, R2.4, R11.4)`, () => {
    const seen = visible(e.html)
    assert.doesNotMatch(e.html, /text-transform:\s*uppercase|letter-spacing/, 'no uppercase tracking labels')
    assert.ok(!EMOJI.test(e.subject + seen + e.text), 'no emoji')
    assert.ok(!(e.subject + seen + e.text).includes('—'), 'no em dashes')
    assert.doesNotMatch(e.subject + seen, /\b(hub|module|e\.g\.|i\.e\.|etc\.)\b/i)
    assert.ok(e.subject.length <= 60, `subject about 50 characters, got ${e.subject.length}`)
    assert.ok(!e.subject.includes('Chikangawa Hills Academy'), 'sender name not repeated in the subject')
    assert.doesNotMatch(e.subject, /noreply/i)
    const outsideBandAndButton = e.html
      .replace(/<!-- Header band[\s\S]*?<!-- Content card/, '')
      .replace(/<a href[^>]*class="em-btn"[\s\S]*?<\/a>/, '')
      .replace(/<v:roundrect[\s\S]*?<\/v:roundrect>/, '')
    assert.ok(!/(?<!background-)color:#ffffff/.test(outsideBandAndButton), 'white text only on navy')
  })

  test(`${e.name}: plain text mirrors the HTML (R11.4)`, () => {
    assert.ok(e.text.length > 80)
    assert.match(e.text, /^Chikangawa Hills Academy\n/, 'school name in normal case')
    assert.match(e.text, /info@chikangawahills\.ac\.mw/)
    const urls = [...e.html.matchAll(/href="(https:\/\/[^"]+)"/g)].map((m) => m[1] as string)
    for (const u of new Set(urls)) assert.ok(e.text.includes(u), `plain text carries ${u}`)
  })
}

test('subjects are about 50 characters and start with the key fact', () => {
  const by = Object.fromEntries(emails.map((e) => [e.name, e.subject.replace(/\u00a0/g, ' ')]))
  assert.equal(by['fee-due'], 'MK 120,000 due 5 Dec 2026 for Chimwemwe Banda')
  assert.equal(by['fee-overdue'], 'MK 120,000 overdue for Chimwemwe Banda')
  assert.equal(by['password-reset'], 'Reset your password (link works for 1 hour)')
  assert.equal(by['contract-soon'], 'Contract expires 20 Dec 2026: Mr John Chirwa')
  assert.ok(by['announcement-urgent']!.endsWith('…'), 'long titles are cut at a word')
})

test('every status banner has a mark and a word, not only a colour (R2.4)', () => {
  for (const e of emails.filter((x) => /fee-|leave-|contract-|licence-|library-|placement-|result-/.test(x.name))) {
    assert.match(e.html, /<span aria-hidden="true">(&#10005;|&#10003;|!|i|&#8226;)&nbsp;<\/span>[A-Z]/, e.name)
  }
})
