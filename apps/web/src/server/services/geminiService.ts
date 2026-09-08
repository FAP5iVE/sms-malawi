/**
 * apps/web/src/server/services/geminiService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT (rewritten — SDK dependency removed)
 * [R-PHASE]: R18 — MSCE Advisory "explain this" layer (optional, additive).
 * [PURPOSE]: The ONLY file in this codebase that talks to the Gemini API.
 *   Deliberately thin and boring:
 *     - Reads GEMINI_API_KEY from the environment. If it's missing, the
 *       feature silently disables itself (isGeminiConfigured() === false) —
 *       nothing breaks, callers just don't offer the AI explanation.
 *     - generateGroundedText() NEVER throws. It always resolves to a
 *       {ok:true, text} or {ok:false, reason} result, so every caller can
 *       degrade to its own plain-text fallback without try/catch
 *       boilerplate scattered everywhere.
 *     - A strict timeout (default 7s) leaves headroom inside Vercel's
 *       10-second classic Hobby function limit for the rest of the request
 *       (auth check, DB lookups, response serialization). If your project
 *       has Fluid Compute enabled (check vercel.com project settings →
 *       Functions), you have up to 300s and can raise this, but 7s is a
 *       reasonable UX ceiling regardless.
 *     - No retry loop. Free-tier 429s rarely clear within a single
 *       request's time budget, so retrying just burns the timeout for no
 *       benefit — fail fast and let the caller's fallback take over.
 *   This module NEVER decides eligibility, NEVER invents catalogue facts,
 *   and NEVER is the source of truth for anything — it only turns
 *   already-computed facts, handed to it by the caller, into prose. See
 *   placementAdvisoryAIService.ts for how those facts are grounded.
 *
 * [FIX 2026-09-08, second pass] The `@google/genai` SDK (v2.21.0, published
 * only 5 days before install) threw an UNCAUGHT exception from deep inside
 * its internal HTTP/stream handling ("The 'stream' argument must be an
 * instance of ReadableStream... Received an instance of Object", at
 * node:internal/streams/end-of-stream) — outside the promise chain
 * entirely, so no try/catch here could ever catch it, and it crashed the
 * whole serverless function process. Rather than chase a bug inside a
 * days-old SDK release, this now calls the plain REST endpoint directly
 * with the platform's native fetch() — no SDK, no internal stream
 * machinery to break, and fetch's AbortSignal is a guaranteed, spec-level
 * cancellation mechanism (unlike hoping an SDK honors one internally).
 * `@google/genai` is no longer a dependency of this feature — safe to
 * `pnpm --filter web remove @google/genai` if nothing else in the repo
 * uses it.
 * [DEPENDS ON]: nothing beyond the platform fetch() — no npm package
 */
import 'server-only'
import { logger } from '@/lib/logger'

// gemini-3.8-flash: the model demonstrated against this exact REST endpoint
// in every official example at
// ai.google.dev/gemini-api/docs/migrate-to-interactions, and confirmed
// free-tier at ai.google.dev/gemini-api/docs/pricing.
const MODEL = 'gemini-3.8-flash'
const TIMEOUT_MS = 7_000
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta2/interactions'

/** True once GEMINI_API_KEY is set. Check this before showing any "AI
 *  explanation" UI at all, so the feature just doesn't appear rather than
 *  appearing and always failing. */
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

interface InteractionStepContent {
  type: string
  text?: string
}
interface InteractionStep {
  type: string
  status?: string
  content?: InteractionStepContent[]
}
interface InteractionResponse {
  id?: string
  status?: string
  steps?: InteractionStep[]
}

/** Mirrors the SDK's own `.output_text` convenience property: joins
 *  consecutive text content blocks from the LAST model_output step. */
function extractOutputText(response: InteractionResponse): string | null {
  const steps = response.steps ?? []
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (!step) continue
    if (step.type === 'model_output' && step.content) {
      const text = step.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('')
      if (text) return text
    }
  }
  return null
}

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'not_configured' | 'timeout' | 'rate_limited' | 'error' }

/**
 * Ask Gemini to produce text, grounded by whatever facts the caller put in
 * `prompt` / `systemInstruction`. Never throws. `systemInstruction` should
 * always include an explicit instruction not to state any number, cutoff,
 * or eligibility verdict that wasn't handed to it — see
 * placementAdvisoryAIService.ts for the pattern. The instruction is folded
 * into a single `input` string — the Interactions API's create() call
 * doesn't have a separate system-instruction field (see the FIX note
 * above the file for the previous bug this avoids).
 */
export async function generateGroundedText(params: {
  systemInstruction: string
  prompt: string
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { ok: false, reason: 'not_configured' }

  const input = `${params.systemInstruction}\n\n---\n\n${params.prompt}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ model: MODEL, input }),
      signal: controller.signal,
    })

    if (res.status === 429) {
      logger.warn(
        { event: 'gemini.rate_limited', model: MODEL },
        '[geminiService] 429 from Gemini API'
      )
      return { ok: false, reason: 'rate_limited' }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error(
        { event: 'gemini.error', status: res.status, body, model: MODEL },
        '[geminiService] non-OK response'
      )
      return { ok: false, reason: 'error' }
    }

    const data = (await res.json()) as InteractionResponse
    const text = extractOutputText(data)?.trim()
    if (!text) {
      logger.warn(
        { event: 'gemini.empty_response', model: MODEL, status: data.status },
        '[geminiService] response had no usable text'
      )
      return { ok: false, reason: 'error' }
    }
    return { ok: true, text }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') {
      logger.warn({ event: 'gemini.timeout', model: MODEL }, '[geminiService] request timed out')
      return { ok: false, reason: 'timeout' }
    }
    // Log the FULL error, not just a status code — check Vercel function
    // logs (or your terminal in dev) for 'gemini.error' if this ever fails
    // again; it will show exactly what went wrong.
    logger.error({ err, event: 'gemini.error', model: MODEL }, '[geminiService] request failed')
    return { ok: false, reason: 'error' }
  } finally {
    clearTimeout(timer)
  }
}
