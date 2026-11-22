/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianStudentBrowser.tsx
 * [PURPOSE]: The Student tab's way in. Shows a list straight away instead of an empty search box:
 *   current students, newest first (the ones whose guardian contacts most often still need
 *   reading) or A to Z, a page at a time. Typing searches EVERY student in the school, including
 *   those who have left, so nobody is unreachable. Each row says where the student stands, so
 *   staff can see who needs work before opening anyone.
 * [DEPENDS ON]: @/hooks/useGuardians, ./GuardianSearchBox
 */
'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { STUDENT_LIST_PAGE_SIZE, useGuardianStudentList, type GuardianStudentListRow } from '@/hooks/useGuardians'
import { StatusText } from '@/components/shared/StatusText'
import { CHIP, CHIP_ON, CHIP_OFF } from '@/lib/hills/chip'
import { GuardianSearchBox, useDebouncedValue } from './GuardianSearchBox'
import type { PickedStudent } from './GuardianStudentPicker'

const MIN_SEARCH = 2
const NOT_CURRENT: Record<string, string> = { GRADUATED: 'Graduated', ARCHIVED: 'Archived' }
const PAGER_BTN =
  'inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-xl text-sm font-medium border border-base text-body hover:bg-page disabled:opacity-40'

/** Where this student stands with the guardian portal, most urgent first. */
function Standing({ row }: { row: GuardianStudentListRow }) {
  if (row.links.pending > 0) return <StatusText tone="warning">{row.links.pending} waiting for review</StatusText>
  if (row.links.active > 0) return <StatusText tone="success">{row.links.active} approved</StatusText>
  if (row.cards > 0) return <StatusText tone="info">Contacts not read yet</StatusText>
  return <StatusText tone="neutral">No contacts recorded</StatusText>
}

export function GuardianStudentBrowser({ onSelect, inputId = 'guardian-student-search' }: {
  onSelect: (s: PickedStudent) => void
  inputId?: string
}) {
  const [text, setText] = useState('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const [skip, setSkip] = useState(0)
  const settled = useDebouncedValue(text.trim(), 300)
  const term = settled.length >= MIN_SEARCH ? settled : ''

  const list = useGuardianStudentList({ search: term, sort, skip })
  const items = list.data?.items ?? []
  const searching = term !== ''

  const change = (next: string) => { setText(next); setSkip(0) }
  const pickSort = (s: 'recent' | 'name') => { setSort(s); setSkip(0) }

  return (
    <div className="space-y-3">
      <GuardianSearchBox
        id={inputId} label="Find a student" value={text} onChange={change}
        placeholder="Name, registration number or guardian"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-body" role="status">
          {searching ? `Results for “${term}”, whole school` : 'Current students'}
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Order students">
          <button type="button" aria-pressed={sort === 'recent'} onClick={() => pickSort('recent')} className={`${CHIP} ${sort === 'recent' ? CHIP_ON : CHIP_OFF}`}>Recently added</button>
          <button type="button" aria-pressed={sort === 'name'} onClick={() => pickSort('name')} className={`${CHIP} ${sort === 'name' ? CHIP_ON : CHIP_OFF}`}>A to Z</button>
        </div>
      </div>

      {list.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading students…</div>
      )}
      {list.isError && (
        <div role="alert" className="rounded-xl bg-brand-coral/10 p-3 text-sm text-body">
          Could not load students.{' '}
          <button type="button" className="font-medium underline" onClick={() => list.refetch()}>Try again</button>
        </div>
      )}
      {list.data && items.length === 0 && (
        <p className="text-sm text-muted" role="status">
          {skip > 0 ? 'No more students.' : searching ? `No student matches “${term}”.` : 'No current students yet.'}
        </p>
      )}

      {items.length > 0 && (
        <ul className="app-tint rounded-xl divide-y divide-[var(--border-base,rgba(0,0,0,0.08))] overflow-hidden">
          {items.map((s) => (
            <li key={s.id}>
              <button
                type="button" className="w-full text-left px-4 py-3 min-h-11 hover:bg-page flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
                onClick={() => onSelect({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), registrationNo: s.registrationNo })}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-body">{s.firstName} {s.lastName}</span>
                  <span className="block text-xs text-muted">
                    {s.registrationNo}{s.className ? ` · ${s.className}` : ''}{NOT_CURRENT[s.status] ? ` · ${NOT_CURRENT[s.status]}` : ''}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 text-xs">
                  <Standing row={s} />
                  <span className="text-muted">{s.cards} contact{s.cards === 1 ? '' : 's'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(skip > 0 || list.data?.hasMore) && (
        <nav className="flex items-center justify-between pt-1" aria-label="Pages">
          <button type="button" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - STUDENT_LIST_PAGE_SIZE))} className={PAGER_BTN}>
            <ChevronLeft className="w-4 h-4" aria-hidden />Previous
          </button>
          <span className="text-sm text-muted">Showing {skip + 1} to {skip + items.length}</span>
          <button type="button" disabled={!list.data?.hasMore} onClick={() => setSkip(skip + STUDENT_LIST_PAGE_SIZE)} className={PAGER_BTN}>
            Next<ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        </nav>
      )}
    </div>
  )
}
