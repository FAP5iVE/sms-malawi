/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/PlacementRecommendationCard.tsx
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: Presents one programme recommendation for a student — the
 *   university/programme, whether they meet the published minimums, the
 *   advisory cut-off comparison, and (when blocked) the exact subjects that
 *   stand in the way. Advisory-only framing is deliberate: an eligible card
 *   says "meets minimum requirements", never "you will be admitted".
 * [DEPENDS ON]: @shared/types/api (ApiPlacementRecommendation)
 */
'use client'

import { CheckCircle2, XCircle, Info } from 'lucide-react'
import type { ApiPlacementRecommendation } from '@shared/types/api'

interface Props {
  recommendation: ApiPlacementRecommendation
  /** Optional action slot, e.g. an "Add to my choices" button. */
  action?: React.ReactNode
}

export function PlacementRecommendationCard({ recommendation: r, action }: Props) {
  const eligible = r.eligible
  return (
    <div className={`rounded-xl border p-4 ${eligible ? 'border-brand-teal/40 bg-brand-teal/5' : 'border-base bg-page'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading font-semibold text-sm leading-snug">{r.programmeName}</p>
          <p className="text-xs text-muted mt-0.5">{r.universityName}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
            eligible ? 'text-brand-teal' : 'text-muted'
          }`}
        >
          {eligible ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {eligible ? 'Meets minimums' : 'Not yet met'}
        </span>
      </div>

      {r.meetsCutOff !== null && (
        <p className="mt-2 text-xs flex items-center gap-1.5 text-muted">
          <Info className="w-3.5 h-3.5 shrink-0" />
          {r.meetsCutOff
            ? 'Within the published cut-off points (advisory).'
            : 'Above the published cut-off points — entry may be competitive (advisory).'}
        </p>
      )}

      {!eligible && r.missingSubjects.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-muted mb-1">Still needs:</p>
          <div className="flex flex-wrap gap-1">
            {r.missingSubjects.map((s) => (
              <span key={s} className="inline-flex items-center bg-rose-50 text-rose-700 text-xs rounded px-1.5 py-0.5">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
