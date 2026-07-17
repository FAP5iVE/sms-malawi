/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(auth)/my-placement/page.tsx
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: The student's own university-placement home. Shows their computed
 *   eligibility recommendations against the Malawi public-university
 *   catalogue, lets them record their ranked programme choices, and lets them
 *   self-report their eventual outcome. Everything is scoped to the signed-in
 *   student server-side (GET /placements/me resolves the Firebase UID to the
 *   student record — this page never sends a studentId), and the page is
 *   student-gated by RoleGuard. When no placement exists yet (the school has
 *   not generated eligibility, or the student has no certified MSCE record),
 *   the page explains that plainly rather than showing an empty shell.
 * [DEPENDS ON]: @/hooks/usePlacements, @/store/authStore,
 *   @/components/placements/*, @/components/shared/RoleGuard
 */
'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { RoleGuard } from '@/components/shared/RoleGuard'
import {
  useMyPlacement,
  useSetMyChoices,
  useRecordMyOutcome,
} from '@/hooks/usePlacements'
import { PlacementStatusBadge } from '@/components/placements/PlacementStatusBadge'
import { PlacementRecommendationCard } from '@/components/placements/PlacementRecommendationCard'
import { PlacementChoiceForm } from '@/components/placements/PlacementChoiceForm'
import { PlacementOutcomeForm } from '@/components/placements/PlacementOutcomeForm'
import { GraduationCap, ListChecks, Award, Info } from 'lucide-react'

function MyPlacementContent() {
  const { setTitle, setSubtitle } = useAuthStore()
  const { data, isLoading } = useMyPlacement()
  const setChoices = useSetMyChoices()
  const recordOutcome = useRecordMyOutcome()

  const [editingChoices, setEditingChoices] = useState(false)
  const [editingOutcome, setEditingOutcome] = useState(false)

  useEffect(() => {
    setTitle('My University Placement')
    setSubtitle('Eligibility, choices & outcome')
    return () => {
      setTitle(null)
      setSubtitle(null)
    }
  }, [setTitle, setSubtitle])

  if (isLoading) {
    return <div className="text-center py-16 text-muted text-sm animate-pulse">Loading your placement…</div>
  }

  const placement = data?.placement ?? null
  const recommendations = data?.recommendations ?? []

  if (!placement) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 px-4">
        <GraduationCap className="w-10 h-10 mx-auto text-muted mb-3" />
        <h2 className="font-heading font-semibold text-lg mb-1">No placement yet</h2>
        <p className="text-sm text-muted">
          Your university-placement eligibility hasn&apos;t been generated yet. It becomes available once your
          certified MSCE results have been received and the school runs eligibility for your year. Check back after your
          MSCE results are in.
        </p>
      </div>
    )
  }

  const eligibleCount = recommendations.filter((r) => r.eligible).length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Status summary */}
      <section className="rounded-xl border border-base p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted mb-1">Placement status</p>
          <PlacementStatusBadge status={placement.status} />
        </div>
        <div className="text-sm text-muted">
          <span className="font-semibold text-brand-teal">{eligibleCount}</span> of {recommendations.length} programmes
          meet your minimums
        </div>
      </section>

      {/* Advisory note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          These recommendations show which programmes your MSCE grades meet the <strong>published minimum
          requirements</strong> for. They are guidance only — actual admission also depends on available places,
          cut-off points, and each university&apos;s own selection.
        </span>
      </div>

      {/* Recommendations */}
      <section>
        <h3 className="font-heading font-semibold text-sm flex items-center gap-1.5 mb-3">
          <Award className="w-4 h-4 text-brand-navy" /> Programmes you qualify for
        </h3>
        {recommendations.length === 0 ? (
          <p className="text-sm text-muted">No recommendations available.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recommendations
              .filter((r) => r.eligible)
              .map((r) => (
                <PlacementRecommendationCard key={`${r.universityId}-${r.programmeId}`} recommendation={r} />
              ))}
          </div>
        )}
      </section>

      {/* Choices */}
      <section className="rounded-xl border border-base p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-sm flex items-center gap-1.5">
            <ListChecks className="w-4 h-4 text-brand-navy" /> My ranked choices
          </h3>
          {!editingChoices && (
            <button
              onClick={() => setEditingChoices(true)}
              className="text-sm text-brand-teal font-semibold hover:underline"
            >
              {placement.choices.length > 0 ? 'Edit' : 'Add choices'}
            </button>
          )}
        </div>

        {editingChoices ? (
          <PlacementChoiceForm
            initial={placement.choices}
            isSubmitting={setChoices.isPending}
            onSubmit={(input) =>
              setChoices.mutate(input, { onSuccess: () => setEditingChoices(false) })
            }
            onCancel={() => setEditingChoices(false)}
          />
        ) : placement.choices.length === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t recorded any choices yet.</p>
        ) : (
          <ol className="space-y-2">
            {[...placement.choices]
              .sort((a, b) => a.rank - b.rank)
              .map((c) => (
                <li key={c.id} className="flex items-center gap-3 text-sm">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-navy text-white text-xs font-bold shrink-0">
                    {c.rank}
                  </span>
                  <span>
                    {c.programmeNameFreeText ?? c.programmeId}{' '}
                    <span className="text-muted">
                      — {c.universityNameFreeText ?? c.universityId}
                    </span>
                    {c.universityId && !c.isEligible && (
                      <span className="ml-2 text-xs text-rose-600">(below minimums)</span>
                    )}
                  </span>
                </li>
              ))}
          </ol>
        )}
      </section>

      {/* Outcome self-report */}
      <section className="rounded-xl border border-base p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-sm flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-brand-navy" /> My outcome
          </h3>
          {!editingOutcome && (
            <button
              onClick={() => setEditingOutcome(true)}
              className="text-sm text-brand-teal font-semibold hover:underline"
            >
              Update
            </button>
          )}
        </div>

        {editingOutcome ? (
          <PlacementOutcomeForm
            initial={{
              status:
                placement.status === 'PLACED' ||
                placement.status === 'CONFIRMED' ||
                placement.status === 'DECLINED' ||
                placement.status === 'NOT_PLACED'
                  ? placement.status
                  : 'PLACED',
              placedUniversityId: placement.placedUniversityId ?? undefined,
              placedProgrammeId: placement.placedProgrammeId ?? undefined,
              placedUniversityName: placement.placedUniversityName ?? undefined,
              placedProgrammeName: placement.placedProgrammeName ?? undefined,
              notes: placement.notes ?? undefined,
            }}
            isSubmitting={recordOutcome.isPending}
            onSubmit={(input) =>
              recordOutcome.mutate(input, { onSuccess: () => setEditingOutcome(false) })
            }
            onCancel={() => setEditingOutcome(false)}
          />
        ) : placement.placedProgrammeId || placement.placedProgrammeName ? (
          <p className="text-sm">
            {placement.placedProgrammeName ?? placement.placedProgrammeId}{' '}
            <span className="text-muted">— {placement.placedUniversityName ?? placement.placedUniversityId}</span>
            {placement.isVerified && <span className="ml-2 text-xs text-green-700">✓ verified by school</span>}
          </p>
        ) : (
          <p className="text-sm text-muted">No outcome recorded yet.</p>
        )}
      </section>
    </div>
  )
}

export default function MyPlacementPage() {
  return (
    <RoleGuard allowed={['student']}>
      <MyPlacementContent />
    </RoleGuard>
  )
}
