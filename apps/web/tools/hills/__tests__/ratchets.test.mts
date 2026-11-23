/**
 * apps/web/tools/hills/__tests__/ratchets.test.mts
 *
 * [PURPOSE]: Phase 9. The ratchet detectors (tools/hills/lib/ratchets.mts) find what they should and
 *   leave comments, class lists and code alone.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findLegacyPairs, findPills, findTells, looksLikeProse } from '../lib/ratchets.mjs'
import { findDeadCss } from '../lib/deadCss.mjs'

test('pills: rounded-full with side padding is found, a plain round dot is not', () => {
  assert.equal(findPills('a.tsx', `const a = <span className="rounded-full bg-x px-2 text-xs">New</span>`).length, 1)
  assert.equal(findPills('a.tsx', 'const a = `inline rounded-full px-3 py-1 ${x}`').length, 1)
  assert.equal(findPills('a.tsx', `const a = <span className="h-2 w-2 rounded-full bg-x" />`).length, 0)
  assert.equal(findPills('a.tsx', `const a = <span className="rounded-xl px-3" />`).length, 0)
  assert.equal(findPills('a.tsx', `// rounded-full px-2 in a comment\nconst a = 1`).length, 0)
})

test('legacy pairs: teal or coral fill with white text, whole classes only', () => {
  assert.equal(findLegacyPairs('a.tsx', `const a = "bg-brand-teal px-4 text-white"`).length, 1)
  assert.equal(findLegacyPairs('a.tsx', `const a = "text-white bg-brand-coral"`).length, 1)
  assert.equal(findLegacyPairs('a.tsx', `const a = "bg-brand-teal/10 text-white"`).length, 0)
  assert.equal(findLegacyPairs('a.tsx', `const a = "bg-btn-brand text-btn-brand-fg"`).length, 0)
  assert.equal(findLegacyPairs('a.tsx', `const a = "hover:bg-brand-teal text-white"`).length, 0)
})

test('tells: user text is counted, comments and class lists are not', () => {
  const rules = (src: string): string[] => findTells('a.tsx', src).map((h) => h.rule)
  assert.deepEqual(rules(`const a = <p>Saved — all done</p>`), ['em-dash'])
  assert.deepEqual(rules(`const a = <p>Welcome back!</p>`), ['exclamation'])
  assert.deepEqual(rules(`const a = <p>Click Save to continue.</p>`), ['click'])
  assert.deepEqual(rules(`const a = <p>Your insights, all in one place.</p>`).sort(), ['at-a-glance', 'internal-word'])
  assert.deepEqual(rules(`// Saved — note\nconst a = 1`), [])
  assert.deepEqual(rules(`const a = "rounded-xl! flex-col data-[x=y]:p-0!"`), [])
  assert.deepEqual(rules(`const a = a !== b ? 1 : 2`), [])
})

test('looksLikeProse separates sentences from tokens', () => {
  assert.equal(looksLikeProse('Saved. Nothing else to do.'), true)
  assert.equal(looksLikeProse('/api/files/abc'), false)
  assert.equal(looksLikeProse('flex items-center gap-2 text-xs'), false)
})

test('dead css: a class or token nothing uses is found, used and built names are kept', () => {
  const css = `
    .used { color: red; }
    .dead { color: blue; }
    .app-modal-panel--md { color: red; }
    .recharts-wrapper { display: none; }
    :root { --read: 1; --unread: 2; --color-brand-navy: red; --color-brand-gold: gold; --shadow: none; }
    .x { width: var(--read); }
    /* .in-a-comment { } */
  `
  const code = 'const a = "used x bg-brand-navy"'
  const dead = findDeadCss(css, code)
  assert.deepEqual(dead.classes, ['dead'])
  assert.deepEqual(dead.properties, ['--color-brand-gold', '--unread'])
})
