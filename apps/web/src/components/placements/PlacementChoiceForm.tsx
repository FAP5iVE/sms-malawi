/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/PlacementChoiceForm.tsx
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: Lets a student (or staff) record an ordered list of programme
 *   choices. Ranking is by explicit numbered rows (choice 1, 2, 3 …) rather
 *   than drag-and-drop — deliberately, per the phase blueprint, because a
 *   numbered list is unambiguous, keyboard-accessible, and works on the mobile
 *   viewport this school's students actually use. Each row is EITHER a
 *   catalogue programme (university + programme selects) OR a free-text pair,
 *   matching PlacementChoiceInputSchema's exclusive-or rule; ranks are the row
 *   positions, kept unique by construction.
 * [DEPENDS ON]: @/hooks/usePlacements (catalogue), @shared/schemas/placement
 *   (SetChoicesInput), @shared/types/api
 */
'use client'

import { useState } from 'react'
import { usePlacementCatalogue } from '@/hooks/usePlacements'
import { Plus, Trash2 } from 'lucide-react'
import type { SetChoicesInput, PlacementChoiceInput } from '@shared/schemas/placement'
import type { University } from '@shared/constants/universities'
import type { ApiPlacementChoice } from '@shared/types/api'

interface EditableChoice {
  useFreeText: boolean
  universityId: string
  programmeId: string
  universityNameFreeText: string
  programmeNameFreeText: string
}

function emptyChoice(): EditableChoice {
  return { useFreeText: false, universityId: '', programmeId: '', universityNameFreeText: '', programmeNameFreeText: '' }
}

function fromApi(choices: ApiPlacementChoice[]): EditableChoice[] {
  return [...choices]
    .sort((a, b) => a.rank - b.rank)
    .map((c) => ({
      useFreeText: Boolean(c.universityNameFreeText || c.programmeNameFreeText),
      universityId: c.universityId ?? '',
      programmeId: c.programmeId ?? '',
      universityNameFreeText: c.universityNameFreeText ?? '',
      programmeNameFreeText: c.programmeNameFreeText ?? '',
    }))
}

interface Props {
  initial?: ApiPlacementChoice[]
  isSubmitting?: boolean
  onSubmit: (input: SetChoicesInput) => void
  onCancel?: () => void
}

export function PlacementChoiceForm({ initial, isSubmitting, onSubmit, onCancel }: Props) {
  const { data: catalogue = [] } = usePlacementCatalogue()
  const universities = catalogue as University[]

  const [rows, setRows] = useState<EditableChoice[]>(
    initial && initial.length > 0 ? fromApi(initial) : [emptyChoice()],
  )
  const [error, setError] = useState<string | null>(null)

  function update(index: number, patch: Partial<EditableChoice>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    if (rows.length >= 20) return
    setRows((prev) => [...prev, emptyChoice()])
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function handleSubmit() {
    setError(null)
    const choices: PlacementChoiceInput[] = []
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!
      const rank = i + 1
      if (row.useFreeText) {
        if (!row.universityNameFreeText.trim() || !row.programmeNameFreeText.trim()) {
          setError(`Choice ${rank}: enter both the university and programme names.`)
          return
        }
        choices.push({
          rank,
          universityNameFreeText: row.universityNameFreeText.trim(),
          programmeNameFreeText: row.programmeNameFreeText.trim(),
        })
      } else {
        if (!row.universityId || !row.programmeId) {
          setError(`Choice ${rank}: choose both a university and a programme.`)
          return
        }
        choices.push({ rank, universityId: row.universityId, programmeId: row.programmeId })
      }
    }
    onSubmit({ choices })
  }

  const fieldClass =
    'w-full rounded-lg border border-base bg-page px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/40'

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {rows.map((row, i) => {
          const selectedUni = universities.find((u) => u.id === row.universityId)
          return (
            <div key={i} className="rounded-xl border border-base p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-navy text-white text-xs font-bold">
                  {i + 1}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => update(i, { useFreeText: !row.useFreeText })}
                    className="text-xs text-brand-teal hover:underline"
                  >
                    {row.useFreeText ? 'Use catalogue' : 'Other institution'}
                  </button>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-muted hover:text-rose-600"
                      aria-label={`Remove choice ${i + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {!row.useFreeText ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    className={fieldClass}
                    value={row.universityId}
                    onChange={(e) => update(i, { universityId: e.target.value, programmeId: '' })}
                    aria-label={`Choice ${i + 1} university`}
                  >
                    <option value="">University…</option>
                    {universities.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <select
                    className={fieldClass}
                    value={row.programmeId}
                    onChange={(e) => update(i, { programmeId: e.target.value })}
                    disabled={!selectedUni}
                    aria-label={`Choice ${i + 1} programme`}
                  >
                    <option value="">Programme…</option>
                    {selectedUni?.programs.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className={fieldClass}
                    value={row.universityNameFreeText}
                    onChange={(e) => update(i, { universityNameFreeText: e.target.value })}
                    placeholder="University name"
                    aria-label={`Choice ${i + 1} university name`}
                  />
                  <input
                    className={fieldClass}
                    value={row.programmeNameFreeText}
                    onChange={(e) => update(i, { programmeNameFreeText: e.target.value })}
                    placeholder="Programme name"
                    aria-label={`Choice ${i + 1} programme name`}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {rows.length < 20 && (
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-sm text-brand-teal font-semibold hover:underline">
          <Plus className="w-4 h-4" /> Add another choice
        </button>
      )}

      {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60"
        >
          {isSubmitting ? 'Saving…' : 'Save choices'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-base text-sm text-muted">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
