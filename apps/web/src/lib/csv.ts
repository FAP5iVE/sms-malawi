/**
 * apps/web/src/lib/csv.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R14 — Analytics & Reports Domain
 * [PURPOSE]: `report.export` is the only permission in the entire report
 *   domain granted to all nine roles — and it had zero implementation at any
 *   layer. The Reports page imported a `Download` icon and never rendered it.
 *
 *   This is the client-side half of that implementation: turn the rows a
 *   report panel is currently displaying into a real, downloadable CSV file.
 *   CSV rather than PDF is deliberate and sufficient for the permission's
 *   grant — every report in this module is fundamentally tabular, a CSV opens
 *   directly in the spreadsheet software a Malawian school office actually
 *   runs, and it needs no server round-trip, no headless-Chromium invocation,
 *   and therefore no exposure to Vercel's serverless function timeout (which
 *   a bulk PDF pipeline genuinely would have — see sms-erp-constraints on
 *   puppeteer-core/@sparticuz/chromium).
 *
 *   Escaping is not optional here: Malawian school data routinely contains
 *   commas (a full address), quotation marks (a school's motto), and newlines
 *   (a free-text note), and any one of them silently corrupts an unescaped
 *   CSV into a file with the wrong number of columns.
 * [DEPENDS ON]: none
 */
'use client'

/** A value a report cell can hold before it is rendered into CSV text. */
export type CsvCell = string | number | boolean | null | undefined

/** One column of a CSV export: a header label, and how to pull that column's
 *  value out of a row. Mirrors the shape of DataTable's DataColumn on purpose
 *  — a panel that already knows how to render a column knows how to export it. */
export interface CsvColumn<T> {
  /** The header text written as the column's first cell. */
  label: string
  /** Extracts this column's value from a row. */
  value: (row: T) => CsvCell
}

/**
 * Renders one cell as an RFC 4180-conformant CSV field.
 *
 * A field is quoted when — and only when — it contains a comma, a double
 * quote, or a line break; inside a quoted field, each embedded double quote is
 * doubled. Anything else is emitted bare, which keeps the common case
 * (numbers, plain names) readable.
 */
function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return ''

  const text = String(cell)
  if (!/[",\r\n]/.test(text)) return text

  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Renders rows into a complete CSV document.
 *
 * The leading U+FEFF byte-order mark is what makes Excel open the file as
 * UTF-8 rather than guessing a legacy codepage — without it, a staff member's
 * name carrying a non-ASCII character renders as mojibake in the one program
 * most likely to open this file.
 */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',')
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(c.value(row))).join(','),
  )
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`
}

/**
 * Builds a safe, descriptive download filename.
 *
 * Slugs the caller's label (a report/tab name, which may contain spaces,
 * slashes from an academic year, or an ampersand) and stamps it with today's
 * date, so a user exporting the same report across a term ends up with
 * distinguishable files rather than `report (3).csv`.
 */
export function csvFilename(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const stamp = new Date().toISOString().slice(0, 10)
  return `${slug || 'report'}-${stamp}.csv`
}

/**
 * Triggers a browser download of `rows` as a CSV file.
 *
 * Returns false — rather than downloading an empty file, or throwing — when
 * there is nothing to export, so the caller can surface that as a real message
 * to the user instead of handing them a file containing only headers.
 */
export function downloadCsv<T>(
  filename: string,
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
): boolean {
  if (rows.length === 0 || columns.length === 0) return false

  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  // Revoking synchronously can race the download in some browsers; the next
  // task is late enough for the click to have been consumed and early enough
  // to not leak the object URL for the life of the page.
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}
