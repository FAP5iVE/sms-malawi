/**
 * Self-tests for the Hills logic fingerprint. Run with:
 *   pnpm --filter web hills:test
 * Uses node:test through tsx, so it needs no extra dependency and does not go
 * through vitest (whose unit setup currently fails on a clean install, see
 * docs/hills/README.md "Known issues").
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { diffTokens, fingerprint } from '../lib/fingerprint.mjs'

const FORM_BEFORE = `
'use client'
import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { Loader2 } from 'lucide-react'

export default function Login() {
  const [busy, setBusy] = useState(false)
  // sign in
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    await signInWithEmailAndPassword(auth, email, password)
  }
  return (
    <form onSubmit={onSubmit} className="p-4">
      <label htmlFor="email" className="text-sm">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required className="border" />
      {error && <p role="alert" className="text-red-500">{error}</p>}
      <button type="submit" disabled={busy} className="btn">
        {busy ? <Loader2 className="animate-spin" /> : null}
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
`

const diff = (after: string, before = FORM_BEFORE) =>
  diffTokens(fingerprint(before, 'a.tsx'), fingerprint(after, 'a.tsx'))

test('identical file: no difference', () => {
  const d = diff(FORM_BEFORE)
  assert.equal(d.added.length + d.removed.length, 0)
})

test('className, visible copy, comments and wrappers are not logic', () => {
  const after = FORM_BEFORE
    .replace('className="p-4"', 'className="hills-card grid gap-6 md:p-8"')
    .replace('className="text-sm"', 'className="font-medium tracking-wide"')
    .replace('// sign in', '// new comment\n  /* and another */')
    .replace('<form onSubmit={onSubmit}', '<div className="hills-split"><section className="hills-panel"><form onSubmit={onSubmit}')
    .replace('</form>', '</form></section></div>')
    .replace('<p role="alert" className="text-red-500">', '<p role="alert" className="text-danger">')
  const d = diff(after)
  assert.deepEqual(d, { added: [], removed: [] })
})

test('moving a block is not a logic change', () => {
  const after = FORM_BEFORE.replace(
    '{error && <p role="alert" className="text-red-500">{error}</p>}',
    '',
  ).replace(
    '<button type="submit"',
    '{error && <p role="alert" className="text-red-500">{error}</p>}\n<button type="submit"',
  )
  assert.deepEqual(diff(after), { added: [], removed: [] })
})

test('adding or removing a UI-only import is allowed', () => {
  const after = FORM_BEFORE
    .replace("import { Loader2 } from 'lucide-react'", "import { Eye } from 'lucide-react'\nimport { AuthField } from '@/components/shared/AuthField'")
  assert.deepEqual(diff(after), { added: [], removed: [] })
})

test('a new non-UI import is flagged', () => {
  const after = FORM_BEFORE.replace(
    "import { useState } from 'react'",
    "import { useState } from 'react'\nimport { somethingElse } from '@/lib/other'",
  )
  const d = diff(after)
  assert.equal(d.added.length, 1)
  assert.equal(d.added[0]?.kind, 'import')
})

test('editing a handler body is flagged at the exact statement', () => {
  const after = FORM_BEFORE.replace('setBusy(true)', 'setBusy(false)')
  const d = diff(after)
  assert.equal(d.removed.length, 1)
  assert.equal(d.added.length, 1)
  assert.match(d.removed[0]?.text ?? '', /setBusy \( true \)/)
  assert.match(d.added[0]?.text ?? '', /setBusy \( false \)/)
})

test('rewiring onSubmit is flagged', () => {
  const d = diff(FORM_BEFORE.replace('onSubmit={onSubmit}', 'onSubmit={() => {}}'))
  assert.ok(d.added.some((t) => t.kind === 'logic' && t.text.startsWith('onSubmit=')))
  assert.ok(d.removed.some((t) => t.kind === 'logic' && t.text === 'onSubmit={ onSubmit }'))
})

test('a new useEffect is flagged', () => {
  const after = FORM_BEFORE.replace(
    'async function onSubmit',
    'useEffect(() => { track() }, [])\n  async function onSubmit',
  )
  const d = diff(after)
  assert.ok(d.added.some((t) => t.text.startsWith('useEffect')))
  assert.ok(d.added.some((t) => t.text === 'track ( )'))
})

test('changing a condition inside {…} is flagged', () => {
  const d = diff(FORM_BEFORE.replace('{error && <p', '{error && busy && <p'))
  assert.equal(d.added.length, 1)
  assert.equal(d.removed.length, 1)
})

test('selectors: id, name, type, role and autoComplete are frozen', () => {
  for (const [from, to] of [
    ['id="email"', 'id="mail"'],
    ['name="email"', 'name="username"'],
    ['type="email"', 'type="text"'],
    ['role="alert"', 'role="status"'],
    ['autoComplete="email"', 'autoComplete="off"'],
  ] as const) {
    const d = diff(FORM_BEFORE.replace(from, to))
    assert.ok(d.added.some((t) => t.kind === 'selector'), `added selector for ${from}`)
    assert.ok(d.removed.some((t) => t.kind === 'selector'), `removed selector for ${from}`)
  }
})

test('selectors: label text and button text are frozen', () => {
  const label = diff(FORM_BEFORE.replace('Email address', 'Your email'))
  assert.ok(label.removed.some((t) => t.kind === 'selector' && t.text.includes('Email address')))
  const button = diff(FORM_BEFORE.replace("'Sign in'", "'Log in'"))
  assert.ok(button.removed.some((t) => t.kind === 'selector' && t.text.includes('Sign in')))
  assert.ok(button.added.some((t) => t.kind === 'selector' && t.text.includes('Log in')))
})

test('plain JSX text outside labels and buttons is free to change', () => {
  const before = `export const A = () => <div className="a"><h1>Welcome</h1><p>Hello there</p></div>`
  const after = `export const A = () => <div className="b"><h1>Rise to the hills</h1><p>Hi</p></div>`
  assert.deepEqual(diffTokens(fingerprint(before, 'a.tsx'), fingerprint(after, 'a.tsx')), {
    added: [],
    removed: [],
  })
})

test('line numbers point at the changed statement', () => {
  const d = diff(FORM_BEFORE.replace('setBusy(true)', 'setBusy(false)'))
  const line = d.added[0]?.line ?? 0
  const lines = FORM_BEFORE.replace('setBusy(true)', 'setBusy(false)').split('\n')
  assert.match(lines[line - 1] ?? '', /setBusy\(false\)/)
})

test('works on plain .ts files', () => {
  const before = `export const x = (a: number) => a + 1\nexport const y = 2`
  const after = `export const x = (a: number) => a + 2\nexport const y = 2`
  const d = diffTokens(fingerprint(before, 'a.ts'), fingerprint(after, 'a.ts'))
  assert.equal(d.added.length, 1)
  assert.equal(d.removed.length, 1)
})
