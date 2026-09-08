/**
 * [CHANGE TYPE]: TARGETED EDIT (OVERHAUL — richer detail)
 * [FILE]: apps/web/src/components/placements/PlacementRecommendationCard.tsx
 * [PURPOSE]: Presents one programme recommendation, redesigned to match the
 *   "Malawi Higher Education Placement & Advisory" reference module's card:
 *   university badge + eligibility pill, duration/cutoff line, a synthesized
 *   "Analysis Verdict" paragraph, the full mandatory-prerequisite compliance
 *   table (Prerequisite | Required Grade | Your Grade | Status), and an NCHE
 *   Application Strategy tip. Every figure shown is real, already-computed
 *   catalogue/engine data (@shared/constants/universities +
 *   placementMatchingService) — nothing here is invented placeholder copy;
 *   where the reference module shows marketing-style programme descriptions
 *   that don't exist in our catalogue, this shows the real published
 *   `minimumRequirements` text instead.
 * [DEPENDS ON]: @shared/types/api (ApiPlacementRecommendation)
 */
'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Info, Lightbulb, Sparkles, Loader2, Send } from 'lucide-react'
import type { ApiPlacementRecommendation } from '@shared/types/api'
import { useExplainRecommendation } from '@/hooks/usePlacements'

interface Props {
  recommendation: ApiPlacementRecommendation
  /** Optional action slot, e.g. an "Add to my choices" button. */
  action?: React.ReactNode
  /** 1-based rank badge, shown for "Evaluate 3 Target Programs" results. */
  rank?: number
  /** The exact grades this recommendation was computed from — required for
   *  the optional "Ask AI to explain" feature, which recomputes the verdict
   *  fresh server-side from these before ever touching the model. Omit to
   *  hide the AI button entirely (e.g. if you don't want it in some context). */
  grades?: { subject: string; grade: number }[]
}

function buildVerdict(r: ApiPlacementRecommendation): string {
  if (!r.eligible) {
    return `You do not meet the mandatory subject prerequisite(s) for ${r.programmeName}: missing credit in ${r.missingSubjects.join(', ')}.`
  }
  if (r.meetsCutOff === true) {
    return `Fully eligible! Your MSCE aggregate (${r.aggregate} points) comfortably meets or surpasses the typical cutoff (${r.cutOffPoints} points).`
  }
  if (r.meetsCutOff === false) {
    return `Prerequisites are met, but your aggregate (${r.aggregate} points) is above the typical competitive cutoff (${r.cutOffPoints} points).`
  }
  return 'You meet the published minimum entry requirements for this programme.'
}

function buildStrategy(r: ApiPlacementRecommendation): string {
  if (!r.eligible) {
    return `Consider applying for related programmes that do not strictly require ${r.missingSubjects.join(', ')}, or register for an MSCE subject resit if aiming for the next NCHE cycle.`
  }
  if (r.meetsCutOff === false) {
    return 'You qualify for placement consideration depending on quota and annual cohort performance, but pairing this with a safer alternative programme is recommended.'
  }
  return 'You have strong prospects of admission during NCHE harmonization. Consider placing this among your priority choices.'
}

export function PlacementRecommendationCard({ recommendation: r, action, rank, grades }: Props) {
  const eligible = r.eligible
  const cutOffLabel = r.meetsCutOff === true ? 'Eligible \u2014 within cutoff'
    : r.meetsCutOff === false ? 'Eligible \u2014 competitive cutoff'
    : eligible ? 'Meets minimums' : 'Not eligible \u2014 missing prerequisites'

  const explain = useExplainRecommendation()
  const [aiOpen, setAiOpen] = useState(false)
  const [question, setQuestion] = useState('')

  function askAI(q?: string) {
    if (!grades || grades.length === 0) return
    setAiOpen(true)
    explain.mutate({ grades, universityId: r.universityId, programmeId: r.programmeId, question: q })
    if (q) setQuestion('')
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${eligible ? 'border-brand-teal/40 bg-brand-teal/5' : 'border-brand-coral/30 bg-page'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2">
          {rank !== undefined && (
            <span className="shrink-0 w-6 h-6 rounded-full bg-brand-navy text-white text-xs font-bold flex items-center justify-center mt-0.5">
              {rank}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center rounded bg-brand-navy/10 text-brand-navy text-[11px] font-bold px-1.5 py-0.5 uppercase tracking-wide">
                {r.universityId}
              </span>
              <span className="text-xs text-muted">{r.universityName}</span>
            </div>
            <p className="font-heading font-semibold text-sm leading-snug mt-1">{r.programmeName}</p>
            {(r.durationYears || r.cutOffPoints) && (
              <p className="text-xs text-muted mt-0.5">
                {r.durationYears ? `Duration: ${r.durationYears} Years` : null}
                {r.durationYears && r.cutOffPoints ? ' \u00b7 ' : null}
                {r.cutOffPoints ? `Typical Cutoff: ~${r.cutOffPoints} pts` : null}
              </p>
            )}
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 rounded-full px-2.5 py-1 ${
            eligible
              ? r.meetsCutOff === false ? 'bg-brand-amber/10 text-brand-amber' : 'bg-brand-teal/10 text-brand-teal'
              : 'bg-brand-coral/10 text-brand-coral'
          }`}
        >
          {eligible ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {cutOffLabel}
        </span>
      </div>

      <div className="bg-surface border border-base rounded-lg p-3">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Analysis Verdict</p>
        <p className="text-sm text-body">{buildVerdict(r)}</p>
      </div>

      {r.prerequisiteAudit.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5">Mandatory Prerequisite Audit</p>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="font-medium px-1 py-1">Prerequisite</th>
                  <th className="font-medium px-1 py-1">Required</th>
                  <th className="font-medium px-1 py-1">Your Grade</th>
                  <th className="font-medium px-1 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {r.prerequisiteAudit.map((row) => (
                  <tr key={row.label} className="border-t border-base">
                    <td className="px-1 py-1.5">{row.label}</td>
                    <td className="px-1 py-1.5 text-muted">{row.requiredGrade !== null ? `\u2264 ${row.requiredGrade}` : (row.note ?? '\u2014')}</td>
                    <td className="px-1 py-1.5 font-medium">{row.yourGrade !== null ? row.yourGrade : '\u2014'}</td>
                    <td className={`px-1 py-1.5 font-medium ${row.satisfied ? 'text-brand-teal' : 'text-brand-coral'}`}>
                      {row.satisfied ? 'Satisfied' : 'Deficient'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {r.minimumRequirements.length > 0 && (
        <p className="text-xs text-muted flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {r.minimumRequirements[0]}
        </p>
      )}

      <div className="bg-brand-navy/5 border border-brand-navy/15 rounded-lg p-3 flex items-start gap-2">
        <Lightbulb className="w-4 h-4 text-brand-navy mt-0.5 shrink-0" />
        <div>
          <p className="text-[11px] font-semibold text-brand-navy uppercase tracking-wide mb-0.5">NCHE Application Strategy</p>
          <p className="text-xs text-body">{buildStrategy(r)}</p>
        </div>
      </div>

      {/* Optional, additive Gemini layer. The verdict/table/strategy above
          are always the deterministic, authoritative content — this only
          ever adds a plain-language narration or answers a follow-up
          within those same facts (see placementAdvisoryAIService.ts). It
          never appears at all if `grades` wasn't passed in (i.e. the
          caller chose not to offer it), and it degrades to a small note if
          the API is unconfigured, rate-limited, or times out — the card
          above still works exactly the same either way. */}
      {grades && grades.length > 0 && (
        <div className="border-t border-base pt-3">
          {!aiOpen ? (
            <button
              type="button"
              onClick={() => askAI()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5" /> Ask AI to explain this
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-brand-navy uppercase tracking-wide flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> AI Explanation
              </p>
              {explain.isPending ? (
                <p className="text-xs text-muted flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</p>
              ) : explain.data?.explanation ? (
                <p className="text-xs text-body bg-page border border-base rounded-lg p-2.5">{explain.data.explanation}</p>
              ) : (
                <p className="text-xs text-muted italic">
                  AI explanation is not available right now — the standard explanation above still applies.
                </p>
              )}

              {explain.data?.explanation && !explain.isPending && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && question.trim()) askAI(question.trim()) }}
                    placeholder="Ask a follow-up about this result…"
                    maxLength={300}
                    className="flex-1 min-w-0 border border-base rounded-lg px-2.5 py-1.5 text-xs bg-surface focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => question.trim() && askAI(question.trim())}
                    disabled={!question.trim()}
                    className="shrink-0 p-1.5 rounded-lg bg-brand-navy text-white disabled:opacity-40"
                    aria-label="Ask"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {action && <div>{action}</div>}
    </div>
  )
}
