/**
 * apps/web/src/server/services/placementAdvisoryAIService.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R18 — MSCE Advisory "explain this" layer (optional, additive).
 * [PURPOSE]: The ONE place that builds a Gemini prompt for the placement
 *   module. Two hard rules enforced here, not left to prompt wording alone:
 *
 *   1. NEVER TRUST CLIENT-SUPPLIED FACTS. The route handler only ever
 *      passes this service raw inputs (grades, a university/programme
 *      reference, an optional question) — never a client's copy of a
 *      computed eligibility verdict. This function recomputes the verdict
 *      itself via computeEligibility(), fresh, every time. If a client sent
 *      a tampered "eligible: true" alongside real grades that say
 *      otherwise, it is silently ignored — the model only ever sees what
 *      this server just calculated.
 *
 *   2. THE MODEL NEVER DECIDES ELIGIBILITY OR INVENTS A NUMBER. The system
 *      instruction hands it the full computed verdict as the one and only
 *      source of truth and explicitly forbids stating any cutoff, grade,
 *      or eligibility status beyond what's given. Its job is narration and
 *      bounded Q&A, never computation — see the constitution notes in
 *      geminiService.ts for why.
 *
 *   Degrades to `{ explanation: null }` on any failure (unconfigured,
 *   timeout, rate-limited, or model error) — the caller always has its own
 *   plain-text template to fall back to; this is a pure enhancement.
 * [DEPENDS ON]: ./geminiService, ./placementMatchingService,
 *   @shared/constants/universities
 */
import 'server-only'

import { computeEligibility } from '@/server/services/placementMatchingService'
import { generateGroundedText, isGeminiConfigured } from '@/server/services/geminiService'
import { findUniversity, findProgram } from '@shared/constants/universities'

const SYSTEM_INSTRUCTION = `You are a calm, encouraging academic advisor helping a Malawian secondary school student (or the staff member helping them) understand a university placement eligibility result.

STRICT RULES — follow these exactly:
- You will be given a computed eligibility verdict as a block of facts below. This is the ONLY source of truth. Use nothing else.
- NEVER state a cutoff point, required grade, aggregate, or eligibility status that is not explicitly present in the facts given to you. If you are unsure of a number, do not guess it — say you don't have that detail.
- NEVER contradict the "eligible" value given to you. If it says not eligible, do not imply otherwise, even gently.
- If asked something the facts don't cover (a different programme, admissions dates, application fees, anything outside the facts block), say plainly that you don't have that information here and suggest checking with the school's admissions office.
- Keep it short: 2-4 sentences for an explanation, similarly brief for a follow-up answer.
- Warm and plain language, no jargon, appropriate for a teenager. No emoji.`

interface ExplainInput {
  grades: Record<string, number>
  universityId: string
  programmeId: string
  question?: string
}

export interface ExplainResult {
  explanation: string | null
}

function buildFactsBlock(input: ExplainInput): { facts: string; label: string } | null {
  const university = findUniversity(input.universityId)
  const program = university ? findProgram(input.universityId, input.programmeId) : undefined
  if (!university || !program) return null

  // Recomputed fresh, server-side, from the raw grades — never from
  // anything the client claims the verdict already is.
  const result = computeEligibility(input.grades, program)

  const auditLines = result.prerequisiteAudit
    .map((row) => {
      if (row.requiredGrade !== null) {
        return `  - ${row.label}: requires grade ${row.requiredGrade} or better; candidate has ${row.yourGrade ?? 'not sat'}; ${row.satisfied ? 'SATISFIED' : 'NOT SATISFIED'}`
      }
      return `  - ${row.label}: ${row.note ?? ''}; ${row.satisfied ? 'SATISFIED' : 'NOT SATISFIED'}`
    })
    .join('\n')

  const facts = [
    `Programme: ${program.name}`,
    `University: ${university.name}${program.faculty ? ` (${program.faculty})` : ''}`,
    program.durationYears ? `Duration: ${program.durationYears} years` : null,
    program.cutOffPoints ? `Typical cutoff: ${program.cutOffPoints} points` : 'Typical cutoff: not published',
    `Candidate's own best-6 aggregate: ${result.aggregate} points`,
    `Overall eligible: ${result.eligible ? 'YES' : 'NO'}`,
    result.meetsCutOff !== null ? `Meets typical cutoff: ${result.meetsCutOff ? 'YES' : 'NO (aggregate is above the typical competitive cutoff)'}` : null,
    'Prerequisite checks:',
    auditLines,
  ].filter(Boolean).join('\n')

  return { facts, label: `${program.name} at ${university.name}` }
}

/**
 * One-shot explanation of an already-computed eligibility result, OR a
 * bounded follow-up answer when `question` is set — same grounding either
 * way. Returns { explanation: null } on any failure; callers show their
 * own plain-text fallback in that case.
 */
export async function explainRecommendation(input: ExplainInput): Promise<ExplainResult> {
  if (!isGeminiConfigured()) return { explanation: null }

  const built = buildFactsBlock(input)
  if (!built) return { explanation: null }

  const prompt = input.question
    ? `Facts:\n${built.facts}\n\nThe student asks: "${input.question.slice(0, 300)}"\n\nAnswer using only the facts above.`
    : `Facts:\n${built.facts}\n\nExplain this result in plain language.`

  const result = await generateGroundedText({ systemInstruction: SYSTEM_INSTRUCTION, prompt })
  if (!result.ok) return { explanation: null }
  return { explanation: result.text }
}
