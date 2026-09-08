/**
 * apps/web/src/server/services/geminiService.ts
 *
 * [CHANGE TYPE]: NEW FILE
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
 *       reasonable UX ceiling regardless — nobody should wait longer than
 *       that for a page-level "explain this" button.
 *     - No retry loop. Free-tier 429s (rate limited) rarely clear within a
 *       single request's time budget, so retrying just burns the timeout
 *       for no benefit — fail fast and let the caller's fallback take over
 *       immediately instead.
 *   This module NEVER decides eligibility, NEVER invents catalogue facts,
 *   and NEVER is the source of truth for anything — it only turns
 *   already-computed facts, handed to it by the caller, into prose. See
 *   placementAdvisoryAIService.ts for how those facts are grounded.
 * [DEPENDS ON]: @google/genai (run `pnpm --filter web add @google/genai`
 *   before this file will build — see the setup steps in chat)
 */
import 'server-only'
import { GoogleGenAI } from '@google/genai'
import { logger } from '@/lib/logger'

// gemini-3.8-flash: the model used in every single official Interactions
// API example (ai.google.dev/gemini-api/docs/migrate-to-interactions) and
// confirmed free-tier at ai.google.dev/gemini-api/docs/pricing. Flash-Lite
// variants are cheaper/higher-throughput but weren't demonstrated against
// this specific endpoint in the docs at time of writing — once this is
// confirmed working end-to-end, it's worth trying a Lite model here for
// lower latency/cost, but start with what's proven to work.
const MODEL = 'gemini-3.8-flash'
const TIMEOUT_MS = 7_000

let client: GoogleGenAI | null = null

/** True once GEMINI_API_KEY is set. Check this before showing any "AI
 *  explanation" UI at all, so the feature just doesn't appear rather than
 *  appearing and always failing. */
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  }
  return client
}

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'not_configured' | 'timeout' | 'rate_limited' | 'error' }

/**
 * Ask Gemini to produce text, grounded by whatever facts the caller put in
 * `prompt` / `systemInstruction`. Never throws. `systemInstruction` should
 * always include an explicit instruction not to state any number, cutoff,
 * or eligibility verdict that wasn't handed to it — see
 * placementAdvisoryAIService.ts for the pattern.
 *
 * [FIX 2026-09-08] The Interactions API's create() call (per every official
 * JS example at ai.google.dev/gemini-api/docs/migrate-to-interactions) only
 * accepts { model, input, previous_interaction_id, tools, response_format,
 * stream } — there is no separate system_instruction or generation_config
 * parameter on this endpoint (those belong to the older models.generateContent
 * call). Passing them was silently rejected by the API on every single call,
 * which is why the feature never worked. Fixed by folding the system
 * instruction directly into the single `input` string instead, which is
 * guaranteed to match the documented shape.
 *
 * Races the API call against a plain timer rather than relying on the SDK
 * to honor an AbortSignal (not guaranteed across SDK versions) — whichever
 * settles first wins; if the timer wins, the in-flight request is simply
 * abandoned (ignored, not actually canceled), which is wasted work but
 * never blocks the caller past TIMEOUT_MS.
 */
export async function generateGroundedText(params: {
  systemInstruction: string
  prompt: string
}): Promise<GeminiResult> {
  if (!isGeminiConfigured()) return { ok: false, reason: 'not_configured' }

  const input = `${params.systemInstruction}\n\n---\n\n${params.prompt}`

  const apiCall = getClient().interactions.create({ model: MODEL, input })

  const timeout = new Promise<'TIMEOUT'>((resolve) => setTimeout(() => resolve('TIMEOUT'), TIMEOUT_MS))

  try {
    const result = await Promise.race([apiCall, timeout])
    if (result === 'TIMEOUT') {
      logger.warn({ event: 'gemini.timeout', model: MODEL }, '[geminiService] request timed out')
      return { ok: false, reason: 'timeout' }
    }
    const text = result.output_text?.trim()
    if (!text) {
      logger.warn({ event: 'gemini.empty_response', model: MODEL, raw: result }, '[geminiService] response had no output_text')
      return { ok: false, reason: 'error' }
    }
    return { ok: true, text }
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 429) {
      logger.warn({ event: 'gemini.rate_limited', model: MODEL }, '[geminiService] 429 from Gemini API')
      return { ok: false, reason: 'rate_limited' }
    }
    // Log the FULL error, not just a status code — this is the one place
    // that will actually tell you what Google's API rejected and why, if
    // this ever fails again. Check Vercel function logs (or your terminal
    // in dev) for 'gemini.error' after a failed attempt.
    logger.error({ err, event: 'gemini.error', model: MODEL }, '[geminiService] request failed')
    return { ok: false, reason: 'error' }
  }
}
