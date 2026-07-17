/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/PlacementStatusBadge.tsx
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: A single, shared status pill for a UniversityPlacement.status
 *   value, so every placement surface (student view, cohort table, outcome
 *   form) renders the seven statuses identically. Colours follow the project's
 *   token palette (brand-navy/teal, amber for in-progress, muted for inert).
 * [DEPENDS ON]: none
 */
'use client'

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  NOT_STARTED:          { label: 'Not started',          className: 'bg-base text-muted' },
  ELIGIBILITY_COMPUTED: { label: 'Eligibility ready',    className: 'bg-brand-teal/15 text-brand-teal' },
  CHOICES_RECORDED:     { label: 'Choices recorded',     className: 'bg-amber-100 text-amber-800' },
  PLACED:               { label: 'Placed',               className: 'bg-brand-navy/15 text-brand-navy' },
  CONFIRMED:            { label: 'Confirmed',            className: 'bg-green-100 text-green-800' },
  DECLINED:             { label: 'Declined',             className: 'bg-rose-100 text-rose-700' },
  NOT_PLACED:           { label: 'Not placed',           className: 'bg-base text-muted' },
}

export function PlacementStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: 'bg-base text-muted' }
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${style.className}`}>
      {style.label}
    </span>
  )
}
