/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(auth)/placements/page.tsx
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: The staff / cohort placement console. Every role can view the
 *   cohort and its analytics (placement outcomes are culturally public at
 *   Malawian schools — placement.view / placement.viewAnalytics are held by
 *   all nine roles); the management controls are gated to the roles that hold
 *   the matching permission:
 *     • generate eligibility (per-student and batch) → placement.manage
 *     • set a student's choices                      → placement.manage
 *     • record an outcome                            → placement.recordOutcome
 *     • verify an outcome                            → placement.verifyOutcome
 *   The page is a two-panel workflow: the cohort table on the left/top, and a
 *   bottom-sheet detail view for a selected placement with the gated actions.
 *   The eligible-students list drives per-student and batch generation for the
 *   current academic year (Form 4 + certified MSCE only, resolved server-side).
 * [DEPENDS ON]: @/hooks/usePlacements, @/hooks/usePermissions,
 *   @/hooks/usePublic (current year), @/store/authStore,
 *   @/components/placements/*, @/components/shared/*
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import {
  usePlacementCohort,
  usePlacementEligible,
  useStudentPlacement,
  useGeneratePlacement,
  useBatchGeneratePlacements,
  useSetPlacementChoices,
  useRecordPlacementOutcome,
  useVerifyPlacementOutcome,
} from '@/hooks/usePlacements'
import { PlacementCohortTable } from '@/components/placements/PlacementCohortTable'
import { PlacementStatusBadge } from '@/components/placements/PlacementStatusBadge'
import { PlacementRecommendationCard } from '@/components/placements/PlacementRecommendationCard'
import { PlacementChoiceForm } from '@/components/placements/PlacementChoiceForm'
import { PlacementOutcomeForm } from '@/components/placements/PlacementOutcomeForm'
import { MotionBottomSheet } from '@/components/shared/MotionBottomSheet'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { Users, Sparkles, ShieldCheck, Loader2 } from 'lucide-react'

const FALLBACK_YEAR = '2025/2026'

function PlacementsContent() {
  const { setTitle, setSubtitle } = useAuthStore()
  const { can } = usePermissions()
  const { data: schoolInfo } = usePublicSchoolInfo()
  const academicYear = schoolInfo?.currentYear ?? FALLBACK_YEAR

  const canManage = can('placement.manage')
  const canRecordOutcome = can('placement.recordOutcome')
  const canVerify = can('placement.verifyOutcome')

  const [statusFilter, setStatusFilter] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  const [detailMode, setDetailMode] = useState<'view' | 'choices' | 'outcome'>('view')

  const { data: cohort = [], isLoading: cohortLoading } = usePlacementCohort(statusFilter || undefined)
  const { data: eligible = [] } = usePlacementEligible(canManage ? academicYear : undefined)

  const batchGenerate = useBatchGeneratePlacements()

  useEffect(() => {
    setTitle('University Placements')
    setSubtitle(`${academicYear} cohort`)
    return () => {
      setTitle(null)
      setSubtitle(null)
    }
  }, [academicYear, setTitle, setSubtitle])

  // Resolve display names from the eligible list where we have them.
  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of eligible) map.set(s.studentId, `${s.firstName} ${s.lastName}`)
    return map
  }, [eligible])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Management bar */}
      {canManage && (
        <section className="rounded-xl border border-base p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Users className="w-4 h-4" />
            <span>
              <span className="font-semibold text-brand-navy">{eligible.length}</span> Form 4 students with certified
              MSCE results are eligible for placement this year.
            </span>
          </div>
          <button
            onClick={() => setBatchConfirmOpen(true)}
            disabled={batchGenerate.isPending || eligible.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60"
          >
            {batchGenerate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate eligibility for cohort
          </button>
        </section>
      )}

      {batchGenerate.isSuccess && batchGenerate.data && (
        <div className="bg-brand-teal/10 border border-brand-teal/30 rounded-xl px-4 py-3 text-sm text-brand-teal">
          Generated eligibility for {batchGenerate.data.generated} of {batchGenerate.data.cohortSize} students
          {batchGenerate.data.errors.length > 0 && ` (${batchGenerate.data.errors.length} skipped)`}.
        </div>
      )}

      {/* Cohort table */}
      <PlacementCohortTable
        placements={cohort}
        isLoading={cohortLoading}
        activeStatus={statusFilter}
        onStatusFilter={setStatusFilter}
        onOpen={(p) => {
          setSelectedStudentId(p.studentId)
          setDetailMode('view')
        }}
        nameFor={(id) => nameById.get(id)}
      />

      {/* Detail sheet */}
      <PlacementDetailSheet
        studentId={selectedStudentId}
        displayName={selectedStudentId ? nameById.get(selectedStudentId) : undefined}
        mode={detailMode}
        setMode={setDetailMode}
        onClose={() => setSelectedStudentId(null)}
        canManage={canManage}
        canRecordOutcome={canRecordOutcome}
        canVerify={canVerify}
        academicYear={academicYear}
      />

      <ConfirmDialog
        open={batchConfirmOpen}
        title="Generate eligibility for the whole cohort?"
        description={`This computes placement eligibility for all ${eligible.length} Form 4 students with certified MSCE results for ${academicYear}. It is safe to re-run; existing choices and outcomes are preserved.`}
        confirmLabel="Generate"
        onConfirm={() => {
          setBatchConfirmOpen(false)
          batchGenerate.mutate(academicYear)
        }}
        onCancel={() => setBatchConfirmOpen(false)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  DETAIL SHEET
// ─────────────────────────────────────────────────────────

interface DetailProps {
  studentId: string | null
  displayName?: string
  mode: 'view' | 'choices' | 'outcome'
  setMode: (m: 'view' | 'choices' | 'outcome') => void
  onClose: () => void
  canManage: boolean
  canRecordOutcome: boolean
  canVerify: boolean
  academicYear: string
}

function PlacementDetailSheet({
  studentId,
  displayName,
  mode,
  setMode,
  onClose,
  canManage,
  canRecordOutcome,
  canVerify,
  academicYear,
}: DetailProps) {
  const { data, isLoading } = useStudentPlacement(studentId ?? undefined)
  const generateOne = useGeneratePlacement()
  const setChoices = useSetPlacementChoices()
  const recordOutcome = useRecordPlacementOutcome()
  const verifyOutcome = useVerifyPlacementOutcome()

  const placement = data?.placement ?? null
  const recommendations = data?.recommendations ?? []
  const eligibleRecs = recommendations.filter((r) => r.eligible)

  return (
    <MotionBottomSheet open={studentId !== null} onClose={onClose} title={displayName ?? 'Placement detail'}>
      {isLoading ? (
        <div className="text-center py-12 text-muted text-sm animate-pulse">Loading…</div>
      ) : !placement ? (
        <div className="text-center py-10 px-4">
          <p className="text-sm text-muted mb-4">
            No placement has been generated for this student yet.
          </p>
          {canManage && studentId && (
            <button
              onClick={() => generateOne.mutate({ studentId, academicYear })}
              disabled={generateOne.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60"
            >
              {generateOne.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate eligibility
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <PlacementStatusBadge status={placement.status} />
            {placement.isVerified && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                <ShieldCheck className="w-3.5 h-3.5" /> Verified
              </span>
            )}
          </div>

          {mode === 'view' && (
            <>
              {/* Eligible programmes */}
              <div>
                <h4 className="font-heading font-semibold text-sm mb-2">Qualifies for ({eligibleRecs.length})</h4>
                {eligibleRecs.length === 0 ? (
                  <p className="text-sm text-muted">No programmes meet this student&apos;s minimums.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {eligibleRecs.slice(0, 6).map((r) => (
                      <PlacementRecommendationCard key={`${r.universityId}-${r.programmeId}`} recommendation={r} />
                    ))}
                  </div>
                )}
              </div>

              {/* Recorded choices */}
              <div>
                <h4 className="font-heading font-semibold text-sm mb-2">Ranked choices</h4>
                {placement.choices.length === 0 ? (
                  <p className="text-sm text-muted">None recorded.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {[...placement.choices]
                      .sort((a, b) => a.rank - b.rank)
                      .map((c) => (
                        <li key={c.id} className="text-sm flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-navy text-white text-[10px] font-bold shrink-0">
                            {c.rank}
                          </span>
                          {c.programmeNameFreeText ?? c.programmeId}{' '}
                          <span className="text-muted">— {c.universityNameFreeText ?? c.universityId}</span>
                        </li>
                      ))}
                  </ol>
                )}
              </div>

              {/* Recorded outcome */}
              {(placement.placedProgrammeId || placement.placedProgrammeName) && (
                <div>
                  <h4 className="font-heading font-semibold text-sm mb-1">Outcome</h4>
                  <p className="text-sm">
                    {placement.placedProgrammeName ?? placement.placedProgrammeId}{' '}
                    <span className="text-muted">— {placement.placedUniversityName ?? placement.placedUniversityId}</span>
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                {canManage && (
                  <button onClick={() => setMode('choices')} className="px-3 py-1.5 rounded-lg border border-base text-sm font-semibold">
                    Edit choices
                  </button>
                )}
                {canRecordOutcome && (
                  <button onClick={() => setMode('outcome')} className="px-3 py-1.5 rounded-lg border border-base text-sm font-semibold">
                    Record outcome
                  </button>
                )}
                {canVerify && (placement.placedProgrammeId || placement.placedProgrammeName) && (
                  <button
                    onClick={() => verifyOutcome.mutate({ id: placement.id, input: { isVerified: !placement.isVerified } })}
                    disabled={verifyOutcome.isPending}
                    className="px-3 py-1.5 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {placement.isVerified ? 'Unverify' : 'Verify outcome'}
                  </button>
                )}
              </div>
            </>
          )}

          {mode === 'choices' && canManage && (
            <PlacementChoiceForm
              initial={placement.choices}
              isSubmitting={setChoices.isPending}
              onSubmit={(input) => setChoices.mutate({ id: placement.id, input }, { onSuccess: () => setMode('view') })}
              onCancel={() => setMode('view')}
            />
          )}

          {mode === 'outcome' && canRecordOutcome && (
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
              onSubmit={(input) => recordOutcome.mutate({ id: placement.id, input }, { onSuccess: () => setMode('view') })}
              onCancel={() => setMode('view')}
            />
          )}
        </div>
      )}
    </MotionBottomSheet>
  )
}

export default function PlacementsPage() {
  return <PlacementsContent />
}