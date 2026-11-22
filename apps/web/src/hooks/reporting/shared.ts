'use client'

/**
 * Shared option/param types for the typed domain reporting hooks.
 * `enabled` is how a caller holds a request until the viewing period (and the
 * user's permission) are known — no hook ever guesses an academic year.
 */
import type { AttentionItem, ReportSectionData } from '@shared/types/reporting'

export interface PeriodParams {
  academicYear: string | undefined
  term?: number | undefined
}

export interface HookOptions {
  enabled?: boolean
}

export type { AttentionItem, ReportSectionData }
