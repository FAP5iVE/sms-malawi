'use client'

/*
 * apps/web/src/components/shared/StudentRiskBadge.tsx — Phase D7
 *
 * [CHANGE TYPE]: TARGETED EDIT (integration only — the component's own
 *   rendering logic/variants are unaffected)
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion &
 *   Risk Assessment
 * [PURPOSE]: Wired into the four locations this file's header already
 *   claimed it was used at, before any of them were real: the Students
 *   list DataTable cells (students/page.tsx, badge variant), the Student
 *   profile header (students/[id]/page.tsx, R5, card variant — already
 *   wired), class dashboard cards (classes/[id]/page.tsx, R6, dot
 *   variant), and the academic-staff dashboard (AcademicDashboard.tsx,
 *   dot variant, in a new "Students Needing Attention" widget). The
 *   header comment below is corrected only now that all four are real.
 * [DEPENDS ON]: none
 *
 * [UNIFIED RISK ENGINE] The data behind every variant now comes from
 *   riskService.assessStudents() (fees + results + attendance + library). The
 *   card variant shows the 0-100 score, each contributing factor with a link
 *   to the module that owns it (only when the viewer's role can open that
 *   module), and the engine's cross-module insights. It previously rendered
 *   "No risk factors identified" for every student because the profile page
 *   never passed factors in.
 *
 * Compact coloured badge indicating a students computed risk level.
 * Used in: student list DataTable cells, student profile header,
 * class dashboard cards, and academic staff dashboard widgets.
 *
 * [NO COLOUR BLOCKS] The badge variant was a filled pill
 * (bg-red-50/bg-amber-50/bg-blue-50/bg-emerald-50 plus dark: overrides and a
 * matching border). Status is now carried by FONT COLOUR alone, using the
 * theme-aware brand tokens, which resolve to appropriate values under both
 * :root and .dark — so a single token works in light and dark mode with no
 * dark: variant to keep in sync. The dot and card variants keep their fills:
 * a dot IS its colour, and the card is a panel rather than a status word.
 *
 * Variants:
 *   'badge'   — icon + coloured label text        (default, DataTable use)
 *   'dot'     — small coloured circle only        (compact list rows)
 *   'card'    — full card with contributing factors list (student detail page)
 *
 * Risk colours map to CSS custom properties so dark mode works correctly.
 */

import Link from 'next/link'
import { AlertTriangle, ShieldCheck, Info, AlertCircle, ArrowUpRight, Lightbulb } from 'lucide-react'
import type { ApiRiskFactor, ApiRiskDomain } from '@shared/types/api'
import { getAllowedRolesForPath } from '@shared/constants/pageAccess'
import { useAuthStore } from '@/store/authStore'

type RiskLevel  = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
type RiskFactor = ApiRiskFactor

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<RiskLevel, {
  label:     string
  icon:      React.ElementType
  badge:     string
  dot:       string
  card:      string
  cardTitle: string
}> = {
  HIGH: {
    label:     'High risk',
    icon:      AlertTriangle,
    badge:     'text-brand-coral',
    dot:       'bg-red-500',
    card:      'border-red-200 bg-red-50/50 dark:border-red-800/40 dark:bg-red-950/15',
    cardTitle: 'text-red-700 dark:text-red-400',
  },
  MEDIUM: {
    label:     'Medium risk',
    icon:      AlertCircle,
    // [PRODUCTION FIX 2026-07-27] Was the one risk level using the custom
    // brand-amber CSS variable with an opacity modifier (bg-brand-amber/10)
    // and no dark: override at all — unlike HIGH/LOW/NONE, which all use
    // literal Tailwind palette colours (red-50/blue-50/emerald-50) with
    // explicit dark: variants. A CSS-custom-property colour combined with
    // Tailwind's opacity-modifier syntax is exactly the setup that can
    // silently fail to adapt in dark mode, rendering as a stuck-light
    // (near-white) pill with unreadable text once the page goes dark.
    // Switched to the same literal-palette + explicit dark: pattern that
    // already works correctly for every other risk level.
    badge:     'text-brand-amber',
    dot:       'bg-amber-500',
    card:      'border-amber-200 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/15',
    cardTitle: 'text-amber-700 dark:text-amber-400',
  },
  LOW: {
    label:     'Low risk',
    icon:      Info,
    badge:     'text-brand-navy',
    dot:       'bg-blue-400',
    card:      'border-blue-200 bg-blue-50/50 dark:border-blue-800/40',
    cardTitle: 'text-blue-600 dark:text-blue-400',
  },
  NONE: {
    label:     'On track',
    icon:      ShieldCheck,
    badge:     'text-brand-teal',
    dot:       'bg-emerald-500',
    card:      'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40',
    cardTitle: 'text-emerald-700 dark:text-emerald-400',
  },
}

const FACTOR_LABELS: Record<string, string> = {
  FEE_DEBT:        'Outstanding fees',
  POOR_GRADES:     'Academic performance',
  SUBJECT_FAILS:   'Subject failures',
  GRADE_DECLINE:   'Declining results',
  MISSED_EXAMS:    'Missed exams',
  HIGH_ABSENCE:    'Attendance concern',
  ABSENCE_STREAK:  'Consecutive absences',
  LIBRARY_OVERDUE: 'Overdue library books',
  LIBRARY_FINES:   'Library fines',
}

const DOMAIN_LABELS: Record<ApiRiskDomain, string> = {
  FEES: 'Finances', ACADEMICS: 'Exams', ATTENDANCE: 'Attendance', LIBRARY: 'Library',
}

/**
 * The module that owns each kind of factor. Attendance is marked on the class
 * page for staff, while /attendance is the student-facing view — so that link
 * depends on whether a class is known.
 */
function domainHref(domain: ApiRiskDomain, classId?: string | null): string {
  switch (domain) {
    case 'FEES':       return '/finances'
    case 'ACADEMICS':  return '/exams'
    case 'ATTENDANCE': return classId ? `/classes/${classId}` : '/classes'
    case 'LIBRARY':    return '/library'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE VARIANT
// ─────────────────────────────────────────────────────────────────────────────

interface BadgeProps {
  riskLevel: RiskLevel
  variant?:  'badge' | 'dot' | 'card'
  factors?:  RiskFactor[]
  /** Card only: 0-100 composite score from the engine. */
  score?:    number
  /** Card only: cross-module observations from the engine. */
  insights?: string[]
  /** Card only: lets the attendance factor link to the student's class page. */
  classId?:  string | null
  /** Badge/dot: hover text, typically the headline factor's detail. */
  hint?:     string
  className?: string
}

function BadgeVariant({ riskLevel, className = '', hint }: { riskLevel: RiskLevel; className?: string; hint?: string }) {
  const { label, icon: Icon, badge } = RISK_CONFIG[riskLevel]
  return (
    <span
      className={`
        inline-flex items-center gap-1
        text-xs font-heading font-semibold
        ${badge} ${className}
      `}
      aria-label={`Risk level: ${label}`}
      title={hint}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DOT VARIANT
// ─────────────────────────────────────────────────────────────────────────────

function DotVariant({ riskLevel, hint }: { riskLevel: RiskLevel; hint?: string }) {
  const { label, dot } = RISK_CONFIG[riskLevel]
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${dot} shrink-0`}
      aria-label={`Risk: ${label}`}
      title={hint ? `${label}: ${hint}` : label}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD VARIANT — full detail with contributing factors
// ─────────────────────────────────────────────────────────────────────────────

function CardVariant({
  riskLevel, factors = [], score, insights = [], classId,
}: { riskLevel: RiskLevel; factors?: RiskFactor[]; score?: number; insights?: string[]; classId?: string | null }) {
  const { label, icon: Icon, card, cardTitle } = RISK_CONFIG[riskLevel]
  const role      = useAuthStore((s) => s.role)
  const superUser = useAuthStore((s) => s.superUser)

  // Only link to a module this viewer can actually open.
  const canOpen = (href: string) =>
    superUser || (role != null && (getAllowedRolesForPath(href)?.includes(role) ?? false))

  return (
    <div className={`rounded-xl border p-4 ${card}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 shrink-0 ${cardTitle}`} aria-hidden />
        <span className={`font-heading font-bold text-sm ${cardTitle}`}>
          {label}
        </span>
        {score != null && riskLevel !== 'NONE' && (
          <span className="ml-auto text-xs text-muted tabular-nums" title="Composite of fees, results, attendance and library">
            Score {score}/100
          </span>
        )}
      </div>

      {factors.length === 0 ? (
        <p className="text-xs text-muted">
          {riskLevel === 'NONE'
            ? 'No risk factors identified. Student is on track.'
            : 'Flagged by the risk engine — no further detail is available to your role.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {factors.map((f) => {
            const href = domainHref(f.domain, classId)
            return (
              <li key={f.id} className="text-xs flex items-start gap-2">
                <span
                  className={`
                    shrink-0 mt-0.5 text-[9px] font-bold uppercase tracking-wide
                    ${f.severity === 'HIGH'   ? 'text-status-danger'
                    : f.severity === 'MEDIUM' ? 'text-status-warning'
                    :                           'text-status-info'}
                  `}
                >
                  {f.severity}
                </span>
                <span className="text-body leading-relaxed flex-1">
                  <strong>{FACTOR_LABELS[f.id] ?? f.id}:</strong>{' '}
                  {f.detail}
                </span>
                {canOpen(href) && (
                  <Link
                    href={href}
                    className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-brand-teal hover:underline"
                    aria-label={`Open ${DOMAIN_LABELS[f.domain]}`}
                  >
                    {DOMAIN_LABELS[f.domain]}
                    <ArrowUpRight className="w-3 h-3" aria-hidden />
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {insights.length > 0 && (
        <div className="mt-3 pt-3 border-t border-base space-y-1.5">
          {insights.map((text) => (
            <p key={text} className="text-xs text-muted flex items-start gap-1.5 leading-relaxed">
              <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
              {text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export function StudentRiskBadge({
  riskLevel,
  variant   = 'badge',
  factors,
  score,
  insights,
  classId,
  hint,
  className,
}: BadgeProps) {
  if (variant === 'dot')  return <DotVariant  riskLevel={riskLevel} hint={hint} />
  if (variant === 'card') return <CardVariant riskLevel={riskLevel} factors={factors} score={score} insights={insights} classId={classId} />
  return <BadgeVariant riskLevel={riskLevel} className={className} hint={hint} />
}