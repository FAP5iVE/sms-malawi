'use client'

/**
 * ReportHeatmap — generic row × column matrix (class × subject, hour × day,
 * form × month …). Colour intensity encodes the value between `min` and `max`
 * on a single sequential ramp; `invert` flips it when low is the alarming
 * direction (pass rates). Cells with null values render as an empty, labelled
 * "no data" cell rather than as zero.
 */
import { cn } from '@/lib/utils'

export interface HeatmapCell {
  row: string
  column: string
  value: number | null
  /** Optional detail for the tooltip (e.g. "12 students"). */
  detail?: string
}

function ramp(t: number, invert: boolean): string {
  // 0..1 → transparent teal → solid teal; inverted uses coral for the low end.
  const x = Math.min(1, Math.max(0, t))
  if (!invert) return `hsl(var(--brand-teal) / ${0.12 + x * 0.75})`
  return x < 0.5
    ? `hsl(var(--brand-coral) / ${0.12 + (0.5 - x) * 1.5})`
    : `hsl(var(--brand-teal) / ${0.12 + (x - 0.5) * 1.5})`
}

export function ReportHeatmap({
  cells,
  rows,
  columns,
  min = 0,
  max,
  invert = false,
  format = (v) => String(Math.round(v * 10) / 10),
  caption,
  className,
}: {
  cells: readonly HeatmapCell[]
  rows: readonly string[]
  columns: readonly string[]
  min?: number
  max?: number
  invert?: boolean
  format?: (v: number) => string
  caption: string
  className?: string
}) {
  const lookup = new Map(cells.map((c) => [`${c.row}\u0000${c.column}`, c]))
  const values = cells.map((c) => c.value).filter((v): v is number => v !== null)
  const hi = max ?? Math.max(...values, min + 1)

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="min-w-full border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface" />
            {columns.map((c) => (
              <th key={c} scope="col" className="px-1 pb-1 text-center font-medium text-muted">
                <span className="block max-w-20 truncate" title={c}>
                  {c}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row" className="sticky left-0 whitespace-nowrap bg-surface pr-2 text-right font-medium text-muted">
                {r}
              </th>
              {columns.map((c) => {
                const cell = lookup.get(`${r}\u0000${c}`)
                const v = cell?.value ?? null
                return (
                  <td
                    key={c}
                    className="h-8 min-w-10 rounded text-center tabular-nums text-brand-navy"
                    style={v === null ? undefined : { backgroundColor: ramp((v - min) / (hi - min || 1), invert) }}
                    title={`${r} · ${c}: ${v === null ? 'no data' : format(v)}${cell?.detail ? ` (${cell.detail})` : ''}`}
                  >
                    {v === null ? <span className="text-muted/50">·</span> : format(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
