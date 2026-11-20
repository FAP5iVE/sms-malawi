/**
 * apps/web/tools/hills/ratchets.mts
 *
 * [PURPOSE]: Chikangawa Hills theme, Phase 9. The ratchets that keep the look from sliding back.
 *
 *     pnpm hills:ratchets           check; exit 1 on a breach
 *     pnpm hills:ratchets --write   lower the saved AI-tell numbers (never raises them)
 *     pnpm hills:ratchets --print   list every hit
 *
 *   pills         must be 0 (count badges are allowed: COUNT_BADGES below, RULEBOOK R2.2)
 *   legacy pairs  must be 0
 *   AI tells      may only go down: tools/hills/ai-tells/baseline.json holds the total and the count per rule
 *   Contrast 100 percent and handler drift are checked by hills:contrast and hills:inventory:check.
 *   Scope: src/app (not api/), src/components, src/hooks; stories and tests are skipped.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { walk } from './lib/paths.mjs'
import { findLegacyPairs, findPills, findTells, type Hit } from './lib/ratchets.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '..', '..')
const BASELINE = path.join(here, 'ai-tells', 'baseline.json')

/** Files where a `rounded-full` with side padding is a count badge, which R2.2 allows. */
const COUNT_BADGES = new Set(['src/components/shared/PendingActionsPanel.tsx'])

const accept = (rel: string): boolean =>
  /\.(?:ts|tsx)$/.test(rel) &&
  !/\.(?:test|spec|stories)\./.test(rel) &&
  !rel.includes('__tests__') &&
  (rel.startsWith('src/components/') || rel.startsWith('src/hooks/') || (rel.startsWith('src/app/') && !rel.startsWith('src/app/api/')))

interface Found { file: string; hit: Hit }

export function scan(): { pills: Found[]; legacy: Found[]; tells: Found[]; files: number } {
  const files = walk(path.join(webRoot, 'src'), (rel) => accept(`src/${rel}`), path.join(webRoot, 'src')).map((r) => `src/${r}`.replace(/\\/g, '/'))
  const out = { pills: [] as Found[], legacy: [] as Found[], tells: [] as Found[], files: files.length }
  for (const file of files) {
    const source = readFileSync(path.join(webRoot, file), 'utf8')
    if (!COUNT_BADGES.has(file)) for (const hit of findPills(file, source)) out.pills.push({ file, hit })
    for (const hit of findLegacyPairs(file, source)) out.legacy.push({ file, hit })
    for (const hit of findTells(file, source)) out.tells.push({ file, hit })
  }
  return out
}

function countBy(found: Found[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const f of found) c[f.hit.rule] = (c[f.hit.rule] ?? 0) + 1
  return Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)))
}

function main(): void {
  const args = new Set(process.argv.slice(2))
  const r = scan()
  const byRule = countBy(r.tells)
  const total = r.tells.length
  const filesWithTells = new Set(r.tells.map((t) => t.file)).size

  if (args.has('--print')) {
    for (const f of [...r.pills, ...r.legacy, ...r.tells]) console.log(`${f.file}:${f.hit.line}  [${f.hit.rule}]  ${f.hit.text}`)
  }

  let base: { total: number; byRule: Record<string, number> } | null = null
  try { base = JSON.parse(readFileSync(BASELINE, 'utf8')) as { total: number; byRule: Record<string, number> } } catch { base = null }

  if (args.has('--write')) {
    const next = base
      ? { total: Math.min(base.total, total), byRule: Object.fromEntries(Object.entries(byRule).map(([k, v]) => [k, Math.min(base.byRule[k] ?? v, v)])) }
      : { total, byRule }
    writeFileSync(BASELINE, JSON.stringify({ note: 'AI-tell ratchet (RULEBOOK section 4). The numbers may only go down. Written by pnpm hills:ratchets --write.', ...next }, null, 2) + '\n')
    console.log(`Baseline written: ${next.total} AI-tell hits.`)
    return
  }

  const problems: string[] = []
  if (r.pills.length) problems.push(`pills: ${r.pills.length} (must be 0)\n` + r.pills.map((f) => `    ${f.file}:${f.hit.line}  ${f.hit.text}`).join('\n'))
  if (r.legacy.length) problems.push(`legacy button pairs: ${r.legacy.length} (must be 0)\n` + r.legacy.map((f) => `    ${f.file}:${f.hit.line}  ${f.hit.text}`).join('\n'))
  if (!base) problems.push('AI-tell baseline missing: run pnpm hills:ratchets --write')
  else {
    if (total > base.total) problems.push(`AI tells: ${total} (limit ${base.total}); the number may only go down`)
    for (const [rule, n] of Object.entries(byRule)) {
      const limit = base.byRule[rule] ?? 0
      if (n > limit) problems.push(`AI tell "${rule}": ${n} (limit ${limit})`)
    }
  }

  console.log(`Ratchets over ${r.files} files: pills ${r.pills.length}, legacy button pairs ${r.legacy.length}, AI tells ${total} in ${filesWithTells} files (limit ${base?.total ?? 'none'}).`)
  console.log(`  by rule: ${JSON.stringify(byRule)}`)
  if (base && total < base.total) console.log(`  below the limit by ${base.total - total}: run pnpm hills:ratchets --write to lock the lower number in.`)
  if (problems.length) {
    console.log('\nRESULT: breach\n' + problems.map((p) => `  - ${p}`).join('\n'))
    process.exit(1)
  }
  console.log('RESULT: all ratchets hold.')
}

main()
