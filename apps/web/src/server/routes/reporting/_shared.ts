/**
 * Query-parameter helpers shared by the analytics and reporting routers.
 * Extracted from routes/analytics.ts (behaviour unchanged) so the new domain
 * reporting routers resolve the viewing period, optional term and window
 * sizes exactly the same way — never with a hardcoded academic year.
 */
import type { Request } from 'express'
import { SETTING_KEYS } from '@shared/types/settings'
import * as settingsService from '@/server/services/settingsService'

/**
 * Resolves the academicYear/term a request is asking about.
 *
 * When the caller supplies neither, the answer is whatever the school's
 * SystemSettings say the CURRENT period is — never a hardcoded literal, which
 * would silently keep reporting a stale year forever once the school rolled over.
 */
export async function resolvePeriod(req: Request): Promise<{ academicYear: string; term: number }> {
  const settings = await settingsService.getMany([
    SETTING_KEYS.CURRENT_ACADEMIC_YEAR,
    SETTING_KEYS.CURRENT_TERM,
  ])

  const queryYear = typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined
  const queryTerm = typeof req.query.term === 'string' ? Number(req.query.term) : undefined

  return {
    academicYear: queryYear ?? settings[SETTING_KEYS.CURRENT_ACADEMIC_YEAR],
    term:
      queryTerm !== undefined && Number.isInteger(queryTerm) && queryTerm >= 1 && queryTerm <= 3
        ? queryTerm
        : settings[SETTING_KEYS.CURRENT_TERM],
  }
}

/** Optional term filter — omitting `term` here means "all terms", not "the current term". */
export function optionalTerm(req: Request): number | undefined {
  const raw = req.query.term
  if (typeof raw !== 'string') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : undefined
}

/** A positive-integer window parameter (days / months / weeks / limit). */
export function positiveInt(raw: unknown, fallback: number): number {
  if (typeof raw !== 'string') return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/** An optional non-empty string query parameter. */
export function optionalString(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined
}

/** An optional calendar date (YYYY-MM-DD). Returns null when present but invalid. */
export function optionalDate(raw: unknown): string | undefined | null {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const v = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) ? null : v
}

/** An optional enum-like parameter. Returns null when present but not one of `allowed`. */
export function optionalEnum(raw: unknown, allowed: readonly string[]): string | undefined | null {
  const v = optionalString(raw)
  if (v === undefined) return undefined
  return allowed.includes(v) ? v : null
}
