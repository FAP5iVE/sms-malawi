/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/PlacementDestinationFields.tsx
 * [PURPOSE]: The one place a placement destination (university + programme)
 *   is entered — shared by the Staff Placement Entry form and the Student
 *   Claim Portal form so the catalogue-vs-free-text rule can never drift
 *   between the two. Defaults to picking from the curated catalogue
 *   (@shared/constants/universities); a toggle switches to two free-text
 *   inputs for a destination that isn't in the catalogue (private, foreign,
 *   or simply missing). Exactly one of the two shapes is ever populated —
 *   switching modes clears the other shape's fields.
 * [DEPENDS ON]: @shared/constants/universities (University)
 */
'use client'

import type { University } from '@shared/constants/universities'

export interface DestinationValue {
  placedUniversityId?:   string
  placedProgrammeId?:    string
  placedUniversityName?: string
  placedProgrammeName?:  string
}

interface Props {
  universities: University[]
  value: DestinationValue
  onChange: (value: DestinationValue) => void
}

export function PlacementDestinationFields({ universities, value, onChange }: Props) {
  const isFreeText = Boolean(value.placedUniversityName || value.placedProgrammeName)
  const selectedUni = universities.find((u) => u.id === value.placedUniversityId)

  function toggleMode(freeText: boolean) {
    onChange(
      freeText
        ? { placedUniversityName: '', placedProgrammeName: '' }
        : { placedUniversityId: '', placedProgrammeId: '' },
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={!isFreeText} onChange={() => toggleMode(false)} className="accent-brand-teal" />
          Catalogue programme
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" checked={isFreeText} onChange={() => toggleMode(true)} className="accent-brand-teal" />
          Not in the list (enter manually)
        </label>
      </div>

      {!isFreeText ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={value.placedUniversityId ?? ''}
            onChange={(e) => onChange({ placedUniversityId: e.target.value, placedProgrammeId: '' })}
            aria-label="University"
            className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
          >
            <option value="">University…</option>
            {universities.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select
            value={value.placedProgrammeId ?? ''}
            onChange={(e) => onChange({ ...value, placedProgrammeId: e.target.value })}
            disabled={!selectedUni}
            aria-label="Programme"
            className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none disabled:opacity-50"
          >
            <option value="">Programme…</option>
            {selectedUni?.programs.filter((p) => p.isActive !== false).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={value.placedUniversityName ?? ''}
            onChange={(e) => onChange({ ...value, placedUniversityName: e.target.value })}
            placeholder="University name"
            className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
          />
          <input
            type="text"
            value={value.placedProgrammeName ?? ''}
            onChange={(e) => onChange({ ...value, placedProgrammeName: e.target.value })}
            placeholder="Programme name"
            className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
          />
        </div>
      )}
    </div>
  )
}
