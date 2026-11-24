/**
 * apps/web/tools/finance-baseline/report.mts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PLAN]: Finance Hardening Plan — P0-02.
 * [PURPOSE]: Pure formatting for the baseline report — no database, no files.
 *   Turns each check's rows into the Markdown summary and the CSV of
 *   exceptions that go under docs/finance-hardening/baseline/. Money is summed
 *   in whole cents as BigInt, never as floating point.
 */
import type { BaselineCheck, CheckGroup } from './checks.mjs'

export interface ResultRow {
  ref_id: string
  /** Decimal string such as "599.00", or null. */
  amount: string | null
  detail: string
}

export interface CheckResult {
  check: BaselineCheck
  /** Every row found (the runner may cap how many it keeps). */
  rows: ResultRow[]
  /** True number of rows found, even if `rows` was capped. */
  rowCount: number
}

/** "-12.50" → -1250n. Returns null for null / non-numeric. */
export function toCents(value: string | null): bigint | null {
  if (value === null) return null
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!m) return null
  const frac = ((m[3] ?? '') + '00').slice(0, 2)
  const cents = BigInt(m[2]!) * 100n + BigInt(frac)
  return m[1] === '-' ? -cents : cents
}

export function formatCents(cents: bigint): string {
  const neg = cents < 0n
  const abs = neg ? -cents : cents
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (abs % 100n).toString().padStart(2, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

export interface Totals { net: bigint; gross: bigint }

/** Σ amount and Σ |amount| across ALL kept rows (rows with no amount are skipped). */
export function totalsOf(rows: ResultRow[]): Totals {
  let net = 0n
  let gross = 0n
  for (const r of rows) {
    const c = toCents(r.amount)
    if (c === null) continue
    net += c
    gross += c < 0n ? -c : c
  }
  return { net, gross }
}

/** RFC 4180 field quoting. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function renderCsv(results: CheckResult[]): string {
  const lines = ['check_id,ref_id,amount,detail']
  for (const { check, rows } of results) {
    for (const r of rows) {
      lines.push([check.id, r.ref_id, r.amount ?? '', r.detail].map(csvField).join(','))
    }
  }
  return lines.join('\n') + '\n'
}

const GROUP_ORDER: CheckGroup[] = [
  'Ledger integrity', 'Journal references', 'Receivables', 'Expenses and budgets',
  'Procurement', 'Library fines', 'Payroll and loans', 'Orphan references',
]

const CLASS_TEXT: Record<BaselineCheck['repairClass'], string> = {
  A: 'A (mechanical repair)',
  B: 'B (adjusting entry)',
  C: 'C (manual review)',
  info: 'Information',
}

const cell = (s: string): string => s.replace(/\|/g, '\\|')

export interface ReportMeta {
  /** ISO date-time the run started. */
  generatedAt: string
  /** Largest number of sample ids shown per check in the Markdown. */
  sampleSize?: number
  /** Cap applied to rows kept per check (so the reader knows the CSV may be partial). */
  rowCap?: number
  /** Git commit the checks were run from, if known. */
  commit?: string
}

export function renderMarkdown(results: CheckResult[], meta: ReportMeta): string {
  const sample = meta.sampleSize ?? 10
  const out: string[] = []
  const flagged = results.filter((r) => r.rowCount > 0)

  out.push('# Finance baseline reconciliation', '')
  out.push(`Generated: ${meta.generatedAt}${meta.commit ? `  ·  checks from commit ${meta.commit}` : ''}`, '')
  out.push(
    'Plan task P0-02. This report **measures**; it corrects nothing. A row means "a record that looks inconsistent with the rule the check states". ' +
    'Whether it is wrong, and how to repair it, is decided in the repair phase (P9) with evidence and approval. Records are identified by id only.', '',
  )
  out.push(`Checks run: ${results.length}  ·  with exceptions: ${flagged.length}  ·  clean: ${results.length - flagged.length}`, '')

  out.push('## Summary', '')
  out.push('| Check | What it looks for | Rows | Σ amount (MWK) | Σ absolute (MWK) | Repair class |')
  out.push('|---|---|---:|---:|---:|---|')
  for (const group of GROUP_ORDER) {
    const inGroup = results.filter((r) => r.check.group === group)
    if (inGroup.length === 0) continue
    out.push(`| **${group}** | | | | | |`)
    for (const r of inGroup) {
      const t = totalsOf(r.rows)
      const partial = r.rowCount > r.rows.length
      out.push(
        `| ${r.check.id} | ${cell(r.check.title)} | ${r.rowCount}${partial ? '+' : ''} | ` +
        `${r.rowCount === 0 ? '' : formatCents(t.net) + (partial ? '*' : '')} | ` +
        `${r.rowCount === 0 ? '' : formatCents(t.gross) + (partial ? '*' : '')} | ${CLASS_TEXT[r.check.repairClass]} |`,
      )
    }
  }
  out.push('')
  if (results.some((r) => r.rowCount > r.rows.length)) {
    out.push(
      `\\* Amounts for these checks cover only the first ${meta.rowCap ?? 'N'} rows kept; the row count is the true total.`, '',
    )
  }

  out.push('## Exceptions', '')
  if (flagged.length === 0) out.push('No check reported an exception.', '')
  for (const r of flagged) {
    const t = totalsOf(r.rows)
    out.push(`### ${r.check.id} — ${r.check.title}`, '')
    out.push(`Rows: **${r.rowCount}**  ·  Σ amount: ${formatCents(t.net)}  ·  Σ absolute: ${formatCents(t.gross)}  ·  Repair class: ${CLASS_TEXT[r.check.repairClass]}`, '')
    out.push(`Why it matters: ${r.check.why}`, '')
    out.push('| Record | Amount | Note |', '|---|---:|---|')
    for (const row of r.rows.slice(0, sample)) {
      out.push(`| \`${cell(row.ref_id)}\` | ${row.amount ?? ''} | ${cell(row.detail)} |`)
    }
    if (r.rowCount > sample) out.push('', `…and ${r.rowCount - sample} more in the CSV.`)
    out.push('')
  }

  out.push('## Reading this report', '')
  out.push(
    '- Journal entries are matched to records by the **reference string** the code builds today (for example `PAY-<last 8 of invoice id>`); reversals are matched by `VOID-<reference>`. The code stores no direct link (plan X-13), so these matches are the best evidence available and can be wrong where two ids share the same last 8 characters.',
    '- "Repair class" is the bucket in plan Part 6 §5.3: **A** can be rebuilt mechanically, **B** needs an approved adjusting entry, **C** needs a person to look and decide.',
    '- Zero rows means the check found nothing, not that the area is correct: the checks only cover what the plan lists.',
    '',
  )
  return out.join('\n')
}
