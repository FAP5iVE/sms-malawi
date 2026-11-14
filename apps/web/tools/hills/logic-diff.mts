/**
 * apps/web/tools/hills/logic-diff.mts
 *
 * [PURPOSE]: Chikangawa Hills theme guardrail. Compares the working tree with
 *   a baseline git ref and fails if anything besides looks changed:
 *     1. a frozen file was touched at all (API routes, server, Prisma, proxy,
 *        AuthProvider, Firestore rules, ...);
 *     2. a .ts/.tsx file gained, lost or edited a logic token (handlers, hooks,
 *        effects, conditions, props, non-UI imports) that is not declared in
 *        logic-allowlist.json;
 *     3. a stable selector changed (id, name, type, role, autoComplete,
 *        label/button text, link target);
 *     4. a file was added or deleted without being declared.
 *   className, JSX text, markup wrappers, comments and UI imports are free.
 *
 * Usage (from apps/web):
 *   pnpm hills:logic-diff                 # against the base in the allowlist
 *   pnpm hills:logic-diff --base hills/phase-0-baseline
 *   pnpm hills:logic-diff --json out.json # also write a machine-readable report
 *   pnpm hills:logic-diff --verbose       # also list declared (allowed) changes
 *
 * Exit code 0 = clean, 1 = something needs a human decision.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { diffTokens, fingerprint, type Token } from './lib/fingerprint.mjs'
import { git, gitTopLevel, matchesAny } from './lib/paths.mjs'

interface Entry {
  file: string
  side: 'added' | 'removed'
  kind?: Token['kind']
  /** Regular expression tested against the token text. */
  pattern: string
  reason: string
}

interface Config {
  base: string
  frozen: string[]
  /**
   * Frozen files the USER has explicitly allowed to change (one-time, in writing). The frozen
   * stop is lifted for these files only: every token must still be declared in `entries` /
   * `newFiles`, and the files are listed in the report as approved exceptions.
   */
  approvedFrozen?: { file: string; reason: string; approvedOn: string }[]
  ignore: string[]
  presentationalAttrs: string[]
  newFiles: { file: string; reason: string }[]
  deletedFiles: { file: string; reason: string }[]
  entries: Entry[]
}

interface Finding {
  file: string
  status: 'M' | 'A' | 'D'
  side: 'added' | 'removed'
  token: Token
  allowed: string | null
}

const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, '../..')

function parseArgs(argv: string[]) {
  const out: { base?: string; json?: string; verbose: boolean; config?: string } = { verbose: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--base') out.base = argv[++i]
    else if (a === '--json') out.json = argv[++i]
    else if (a === '--config') out.config = argv[++i]
    else if (a === '--verbose') out.verbose = true
    else if (a === '--help' || a === '-h') {
      console.log('Usage: hills:logic-diff [--base <git-ref>] [--json <file>] [--config <file>] [--verbose]')
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${a}`)
      process.exit(2)
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const config = JSON.parse(
  readFileSync(args.config ?? path.join(here, 'logic-allowlist.json'), 'utf8'),
) as Config
const base = args.base ?? config.base
const repo = gitTopLevel(webRoot)
const webPrefix = path.relative(repo, webRoot).split(path.sep).join('/') // "apps/web"

/** Repo-relative -> apps/web-relative when inside the app, else unchanged. */
const toWeb = (repoRel: string): string =>
  repoRel.startsWith(`${webPrefix}/`) ? repoRel.slice(webPrefix.length + 1) : repoRel

// --- collect changes -------------------------------------------------------
const changes = new Map<string, 'M' | 'A' | 'D'>()
for (const line of git(['diff', '--name-status', '--no-renames', base], repo).split('\n')) {
  if (!line.trim()) continue
  const [st, ...rest] = line.split('\t')
  const file = rest.join('\t')
  changes.set(file, st === 'A' ? 'A' : st === 'D' ? 'D' : 'M')
}
for (const f of git(['ls-files', '--others', '--exclude-standard'], repo).split('\n')) {
  if (f.trim()) changes.set(f, 'A')
}

const problems: string[] = []
const findings: Finding[] = []
const frozenTouched: string[] = []
const approvedFrozenSeen: string[] = []
const nonCode: string[] = []
const newFilesSeen: string[] = []
const deletedFilesSeen: string[] = []

const isCode = (f: string) => /\.(tsx?|mts)$/.test(f)

for (const [repoRel, status] of [...changes].sort(([a], [b]) => a.localeCompare(b))) {
  const rel = toWeb(repoRel)

  if (matchesAny(rel, config.frozen)) {
    const approved = (config.approvedFrozen ?? []).find((a) => a.file === rel)
    if (!approved) {
      frozenTouched.push(`${status} ${rel}`)
      continue
    }
    approvedFrozenSeen.push(`${status} ${rel}   <= approved ${approved.approvedOn}: ${approved.reason}`)
  }
  if (matchesAny(rel, config.ignore) || !isCode(rel)) {
    nonCode.push(`${status} ${rel}`)
    continue
  }

  if (status === 'D') {
    deletedFilesSeen.push(rel)
    if (!config.deletedFiles.some((d) => d.file === rel)) {
      problems.push(`Deleted file not declared in deletedFiles: ${rel}`)
    }
    continue
  }

  const after = readFileSync(path.join(repo, repoRel), 'utf8')
  const opts = { presentationalAttrs: config.presentationalAttrs }
  let beforeTokens: Token[] = []
  if (status === 'M') {
    const before = git(['show', `${base}:${repoRel}`], repo)
    beforeTokens = fingerprint(before, rel, opts)
  } else {
    newFilesSeen.push(rel)
    if (!config.newFiles.some((n) => n.file === rel)) {
      problems.push(`New code file not declared in newFiles: ${rel}`)
    }
  }
  const { added, removed } = diffTokens(beforeTokens, fingerprint(after, rel, opts))

  const classify = (side: 'added' | 'removed', token: Token): Finding => {
    const entry = config.entries.find(
      (e) =>
        e.file === rel &&
        e.side === side &&
        (e.kind === undefined || e.kind === token.kind) &&
        new RegExp(e.pattern).test(token.text),
    )
    return { file: rel, status, side, token, allowed: entry ? entry.reason : null }
  }
  // A brand-new file is declared as a whole; its tokens are informational.
  const declaredNew = status === 'A' && config.newFiles.some((n) => n.file === rel)
  for (const t of removed) findings.push(classify('removed', t))
  for (const t of added) {
    const f = classify('added', t)
    if (declaredNew && f.allowed === null) {
      f.allowed = `new file: ${config.newFiles.find((n) => n.file === rel)?.reason ?? ''}`
    }
    findings.push(f)
  }
}

// --- report ---------------------------------------------------------------
const unexplained = findings.filter((f) => f.allowed === null)
const allowed = findings.filter((f) => f.allowed !== null)

const out: string[] = []
out.push(`Hills logic-diff  base=${base}  files changed=${changes.size}`)
out.push('')

if (frozenTouched.length > 0) {
  out.push(`FROZEN files touched (${frozenTouched.length}), these must never change in the theme work:`)
  for (const f of frozenTouched) out.push(`  ${f}`)
  out.push('')
}
if (approvedFrozenSeen.length > 0) {
  out.push(`APPROVED exceptions to the frozen list (${approvedFrozenSeen.length}), user-approved, every token still declared below:`)
  for (const f of approvedFrozenSeen) out.push(`  ${f}`)
  out.push('')
}
if (problems.length > 0) {
  out.push('UNDECLARED structure changes:')
  for (const p of problems) out.push(`  ${p}`)
  out.push('')
}

const group = (list: Finding[]) => {
  const byFile = new Map<string, Finding[]>()
  for (const f of list) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f])
  return byFile
}
const printGroup = (list: Finding[], withReason: boolean) => {
  for (const [file, fs] of group(list)) {
    out.push(`  ${file}`)
    for (const f of fs.sort((a, b) => a.token.line - b.token.line)) {
      const sign = f.side === 'added' ? '+' : '-'
      const txt = f.token.text.length > 140 ? `${f.token.text.slice(0, 137)}...` : f.token.text
      out.push(`    ${sign} L${f.token.line} [${f.token.kind}] ${txt}${withReason ? `   <= ${f.allowed}` : ''}`)
    }
  }
}

if (unexplained.length > 0) {
  out.push(`LOGIC / SELECTOR changes not declared (${unexplained.length}):`)
  printGroup(unexplained, false)
  out.push('')
}
if (args.verbose && allowed.length > 0) {
  out.push(`Declared (allowed) changes (${allowed.length}):`)
  printGroup(allowed, true)
  out.push('')
}

out.push(
  `Summary: frozen touched=${frozenTouched.length}, undeclared structure=${problems.length}, ` +
    `undeclared logic/selector tokens=${unexplained.length}, declared=${allowed.length}, ` +
    `new files=${newFilesSeen.length}, deleted=${deletedFilesSeen.length}, non-code/ignored=${nonCode.length}, approved frozen exceptions=${approvedFrozenSeen.length}`,
)
const ok = frozenTouched.length === 0 && problems.length === 0 && unexplained.length === 0
out.push(ok ? 'RESULT: clean. Only looks changed.' : 'RESULT: needs review.')
console.log(out.join('\n'))

if (args.json) {
  writeFileSync(
    args.json,
    JSON.stringify({ base, ok, frozenTouched, approvedFrozenSeen, problems, unexplained, allowed, newFilesSeen, deletedFilesSeen, nonCode }, null, 2),
  )
}
process.exit(ok ? 0 : 1)
