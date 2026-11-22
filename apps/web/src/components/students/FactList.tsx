/**
 * apps/web/src/components/students/FactList.tsx
 *
 * [PURPOSE]: Chikangawa Hills theme, looks only. A list of label and value rows for a record
 *   page (student profile, welfare). On a phone the label sits above its value, so a long
 *   email or address wraps inside the screen instead of running off the edge; from the
 *   `sm` width up the label is a fixed column and the value reads straight across from it,
 *   left aligned. An empty value reads "Not recorded" instead of a dash.
 *
 * [USAGE]: <FactList rows={[['Phone', student.phone], ['Email', student.email]]} />
 *   Rows with `undefined` or `null` or an empty string show "Not recorded".
 */
import type { ReactNode } from 'react'

export type FactRow = readonly [label: string, value: ReactNode | null | undefined]

export function FactList({ rows }: { rows: ReadonlyArray<FactRow> }) {
  return (
    <dl className="divide-y divide-base">
      {rows.map(([label, value]) => {
        const empty = value == null || value === ''
        return (
          <div key={label} className="grid gap-0.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)] sm:gap-4">
            <dt className="text-xs text-muted sm:pt-px sm:text-sm">{label}</dt>
            <dd className={`min-w-0 whitespace-pre-line text-sm [overflow-wrap:anywhere] ${empty ? 'text-muted' : 'font-medium text-body'}`}>
              {empty ? 'Not recorded' : value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
