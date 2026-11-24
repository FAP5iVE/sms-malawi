/**
 * apps/web/tools/finance-baseline/run.mts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PLAN]: Finance Hardening Plan — P0-02 "Read-only baseline reconciliation".
 * [PURPOSE]: Runs every check in checks.mts against a database and writes the
 *   Markdown summary and the CSV of exceptions.
 *
 * SAFETY
 *   • READ ONLY. Every query runs inside one transaction opened as
 *     `REPEATABLE READ, READ ONLY`: the database itself refuses any write, and
 *     every check sees the same snapshot.
 *   • Point it at a COPY of production (a Neon branch), never at the live
 *     database: set BASELINE_DATABASE_URL. It refuses to run if that is the
 *     same database as DATABASE_URL.
 *   • Output holds record ids and amounts only — no names or contact details.
 *
 * USAGE (from apps/web)
 *   BASELINE_DATABASE_URL=postgresql://… pnpm finance:baseline
 *   Options:  --out <dir>        default docs/finance-hardening/baseline
 *             --only RC-01,LG-01 run just these checks
 *             --list             print the checks and exit
 *             --row-cap <n>      rows kept per check (default 5000)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { BASELINE_CHECKS, FORBIDDEN_SQL_WORDS } from './checks.mjs'
import { renderCsv, renderMarkdown, type CheckResult, type ResultRow } from './report.mjs'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function sameDatabase(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    return ua.hostname === ub.hostname && (ua.port || '5432') === (ub.port || '5432') && ua.pathname === ub.pathname
  } catch {
    return a === b
  }
}

/** Last line of defence: refuse to run any statement that is not a plain SELECT/WITH. */
function assertReadOnlySql(id: string, sql: string): void {
  const text = sql.replace(/'(?:[^']|'')*'/g, "''") // ignore string literals
  if (!/^\s*(select|with)\b/i.test(text)) throw new Error(`${id}: baseline queries must start with SELECT or WITH`)
  for (const w of FORBIDDEN_SQL_WORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(text)) throw new Error(`${id}: forbidden word "${w}" in a baseline query`)
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--list')) {
    for (const c of BASELINE_CHECKS) console.log(`${c.id}  [${c.group}]  ${c.title}`)
    return
  }

  const url = process.env.BASELINE_DATABASE_URL
  if (!url) {
    throw new Error('Set BASELINE_DATABASE_URL to a COPY of the production database (for example a Neon branch).')
  }
  if (process.env.DATABASE_URL && sameDatabase(url, process.env.DATABASE_URL)) {
    throw new Error('BASELINE_DATABASE_URL is the same database as DATABASE_URL. Use a copy, not the live database.')
  }

  const only = arg('--only')?.split(',').map((s) => s.trim()).filter(Boolean)
  const checks = only ? BASELINE_CHECKS.filter((c) => only.includes(c.id)) : BASELINE_CHECKS
  if (only) {
    const unknown = only.filter((id) => !BASELINE_CHECKS.some((c) => c.id === id))
    if (unknown.length) throw new Error(`Unknown check id(s): ${unknown.join(', ')}`)
  }
  for (const c of checks) assertReadOnlySql(c.id, c.sql)

  const rowCap = Number(arg('--row-cap') ?? 5000)
  const outDir = path.resolve(process.cwd(), arg('--out') ?? 'docs/finance-hardening/baseline')

  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] })
  const startedAt = new Date()
  const results: CheckResult[] = []
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        for (const check of checks) {
          const raw = await tx.$queryRawUnsafe<Array<{ ref_id: unknown; amount: unknown; detail: unknown }>>(check.sql)
          const rows: ResultRow[] = raw.slice(0, rowCap).map((r) => ({
            ref_id: String(r.ref_id),
            amount: r.amount === null || r.amount === undefined ? null : String(r.amount),
            detail: String(r.detail ?? ''),
          }))
          results.push({ check, rows, rowCount: raw.length })
          console.log(`${check.id}  ${String(raw.length).padStart(6)}  ${check.title}`)
        }
      },
      { isolationLevel: 'RepeatableRead', timeout: 15 * 60_000, maxWait: 30_000 },
    )
  } finally {
    await prisma.$disconnect()
  }

  let commit: string | undefined
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch { /* not a git checkout */ }

  const stamp = startedAt.toISOString().slice(0, 10)
  fs.mkdirSync(outDir, { recursive: true })
  const mdPath = path.join(outDir, `${stamp}-baseline.md`)
  const csvPath = path.join(outDir, `${stamp}-baseline-exceptions.csv`)
  fs.writeFileSync(mdPath, renderMarkdown(results, { generatedAt: startedAt.toISOString(), rowCap, commit }))
  fs.writeFileSync(csvPath, renderCsv(results))
  console.log(`\nWrote ${path.relative(process.cwd(), mdPath)}\nWrote ${path.relative(process.cwd(), csvPath)}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
