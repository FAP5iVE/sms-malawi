/**
 * apps/web/src/components/shared/QuickActions.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: React key switched from `action.href` to `action.label` —
 *   several dashboards legitimately point two differently-labelled actions
 *   at the same page (e.g. Finance's Record Payment / Generate Receipt both
 *   living under /finances), which produced duplicate-key warnings and
 *   unstable reconciliation. Labels are unique within any one dashboard's
 *   action set; hrefs are not.
 * [DEPENDS ON]: none
 */
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

export interface QuickAction {
  label: string
  href: string
  icon: LucideIcon
  color?: string // tailwind bg class for the icon circle
  text?: string // tailwind text class
}

interface QuickActionsProps {
  actions: QuickAction[]
  /** One wrapping row of small labelled links instead of a grid of tiles (saves a screen on phones). */
  compact?: boolean
}

export function QuickActions({ actions, compact = false }: QuickActionsProps) {
  if (compact) {
    return (
      <section aria-label="Quick actions" className="app-tint rounded-xl p-3 sm:p-4">
        <h3 className="font-heading font-semibold text-sm text-brand-navy mb-2">Quick actions</h3>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.label}
                href={action.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-surface px-3 text-xs font-medium text-body transition-colors hover:bg-brand-teal/10 focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
              >
                <Icon className={`w-4 h-4 ${action.text ?? 'text-brand-navy'}`} aria-hidden />
                {action.label}
              </Link>
            )
          })}
        </div>
      </section>
    )
  }
  return (
    <div className="app-tint rounded-xl p-3 sm:p-5">
      <h3 className="font-heading font-semibold text-sm text-brand-navy mb-3 sm:mb-4">Quick actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-1.5 sm:gap-2 p-2 sm:p-3 min-h-11 rounded-lg hover:bg-brand-teal/10 transition-colors group text-center"
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${action.color ?? 'bg-brand-navy/8'}`}
              >
                <Icon className={`w-5 h-5 ${action.text ?? 'text-brand-navy'}`} />
              </div>
              <span className="text-xs font-medium text-muted group-hover:text-body leading-tight">
                {action.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
