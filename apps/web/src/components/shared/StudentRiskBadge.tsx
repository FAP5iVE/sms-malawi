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
 * Compact coloured badge indicating a students computed risk level.
 * Used in: student list DataTable cells, student profile header,
 * class dashboard cards, and academic staff dashboard widgets.
 *
 * Variants:
 *   'badge'   — coloured pill with icon + label  (default, DataTable use)
 *   'dot'     — small coloured circle only        (compact list rows)
 *   'card'    — full card with contributing factors list (student detail page)
 *
 * Risk colours map to CSS custom properties so dark mode works correctly.
 */

import { AlertTriangle, ShieldCheck, Info, AlertCircle } from 'lucide-react'
import type { RiskLevel, RiskFactor } from '@/server/services/riskService'

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
    label:     'High Risk',
    icon:      AlertTriangle,
    badge:     'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/25 dark:text-red-400 dark:border-red-800/50',
    dot:       'bg-red-500',
    card:      'border-red-200 bg-red-50/50 dark:border-red-800/40 dark:bg-red-950/15',
    cardTitle: 'text-red-700 dark:text-red-400',
  },
  MEDIUM: {
    label:     'Medium Risk',
    icon:      AlertCircle,
    badge:     'bg-brand-amber/10 text-brand-amber border-brand-amber/30',
    dot:       'bg-brand-amber',
    card:      'border-brand-amber/25 bg-brand-amber/8',
    cardTitle: 'text-brand-amber',
  },
  LOW: {
    label:     'Low Risk',
    icon:      Info,
    badge:     'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/25 dark:text-blue-400',
    dot:       'bg-blue-400',
    card:      'border-blue-200 bg-blue-50/50 dark:border-blue-800/40',
    cardTitle: 'text-blue-600 dark:text-blue-400',
  },
  NONE: {
    label:     'On Track',
    icon:      ShieldCheck,
    badge:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-400',
    dot:       'bg-emerald-500',
    card:      'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40',
    cardTitle: 'text-emerald-700 dark:text-emerald-400',
  },
}

const FACTOR_LABELS: Record<string, string> = {
  FEE_DEBT:      'Outstanding fees',
  POOR_GRADES:   'Academic performance',
  HIGH_ABSENCE:  'Attendance concern',
  SUBJECT_FAILS: 'Subject failures',
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE VARIANT
// ─────────────────────────────────────────────────────────────────────────────

interface BadgeProps {
  riskLevel: RiskLevel
  variant?:  'badge' | 'dot' | 'card'
  factors?:  RiskFactor[]
  className?: string
}

function BadgeVariant({ riskLevel, className = '' }: { riskLevel: RiskLevel; className?: string }) {
  const { label, icon: Icon, badge } = RISK_CONFIG[riskLevel]
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-0.5
        rounded-full text-xs font-heading font-semibold
        border ${badge} ${className}
      `}
      aria-label={`Risk level: ${label}`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DOT VARIANT
// ─────────────────────────────────────────────────────────────────────────────

function DotVariant({ riskLevel }: { riskLevel: RiskLevel }) {
  const { label, dot } = RISK_CONFIG[riskLevel]
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${dot} shrink-0`}
      aria-label={`Risk: ${label}`}
      title={label}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD VARIANT — full detail with contributing factors
// ─────────────────────────────────────────────────────────────────────────────

function CardVariant({ riskLevel, factors = [] }: { riskLevel: RiskLevel; factors?: RiskFactor[] }) {
  const { label, icon: Icon, card, cardTitle } = RISK_CONFIG[riskLevel]

  return (
    <div className={`rounded-xl border p-4 ${card}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 shrink-0 ${cardTitle}`} aria-hidden />
        <span className={`font-heading font-bold text-sm ${cardTitle}`}>
          {label}
        </span>
      </div>

      {factors.length === 0 ? (
        <p className="text-xs text-muted">No risk factors identified. Student is on track.</p>
      ) : (
        <ul className="space-y-2">
          {factors.map((f) => (
            <li key={f.id} className="text-xs flex items-start gap-2">
              <span
                className={`
                  shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide
                  ${f.severity === 'HIGH'   ? 'bg-red-100 text-red-700 dark:bg-red-900/30'
                  : f.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30'
                  :                           'bg-blue-100 text-blue-700 dark:bg-blue-900/30'}
                `}
              >
                {f.severity}
              </span>
              <span className="text-body leading-relaxed">
                <strong>{FACTOR_LABELS[f.id] ?? f.id}:</strong>{' '}
                {f.detail}
              </span>
            </li>
          ))}
        </ul>
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
  className,
}: BadgeProps) {
  if (variant === 'dot')  return <DotVariant  riskLevel={riskLevel} />
  if (variant === 'card') return <CardVariant riskLevel={riskLevel} factors={factors} />
  return <BadgeVariant riskLevel={riskLevel} className={className} />
}