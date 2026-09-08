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

// Flash-Lite: the cheapest, highest-throughput free-tier model — plenty for
// short, grounded explanations. Swap the string below to any current model
// id from https://ai.google.dev/gemini-api/docs/pricing if you want a
// different free-tier model; nothing else in this file needs to change.
const MODEL = 'gemini-2.5-flash-lite'
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
 * Races the API call against a plain timer rather than relying on the SDK
 * to honor an AbortSignal (not guaranteed across SDK versions) — whichever
 * settles first wins; if the timer wins, the in-flight request is simply
 * abandoned (ignored, not actually canceled), which is wasted work but
 * never blocks the caller past TIMEOUT_MS.
 */
export async function generateGroundedText(params: {
  systemInstruction: string
  prompt: string
  temperature?: number
}): Promise<GeminiResult> {
  if (!isGeminiConfigured()) return { ok: false, reason: 'not_configured' }

  const apiCall = getClient().models.generateContent({
    model: MODEL,
    contents: params.prompt,
    config: {
      systemInstruction: params.systemInstruction,
      temperature: params.temperature ?? 0.3, // low temperature: we want faithful phrasing, not creative writing
    },
  })

  const timeout = new Promise<'TIMEOUT'>((resolve) =>
    setTimeout(() => resolve('TIMEOUT'), TIMEOUT_MS)
  )

  try {
    const result = await Promise.race([apiCall, timeout])
    if (result === 'TIMEOUT') {
      logger.warn({ event: 'gemini.timeout', model: MODEL }, '[geminiService] request timed out')
      return { ok: false, reason: 'timeout' }
    }
    const text = result.text?.trim()
    if (!text) return { ok: false, reason: 'error' }
    return { ok: true, text }
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 429) {
      logger.warn(
        { event: 'gemini.rate_limited', model: MODEL },
        '[geminiService] 429 from Gemini API'
      )
      return { ok: false, reason: 'rate_limited' }
    }
    logger.error({ err, event: 'gemini.error', model: MODEL }, '[geminiService] request failed')
    return { ok: false, reason: 'error' }
  }
}
