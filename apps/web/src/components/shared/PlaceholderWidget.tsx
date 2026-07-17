/**
 * apps/web/src/components/shared/PlaceholderWidget.tsx
 *
 * [CHANGE TYPE]: NEW FILE (relocation)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: PlaceholderWidget was defined inside — and re-exported from —
 *   AdminDashboard.tsx, with all eight other role dashboards importing a
 *   shared component from a sibling domain file (a tier violation per
 *   sms-erp-frontend Rule 1: shared components never live inside a domain
 *   component). Moved verbatim to W/components/shared/ where its consumers
 *   already believed it lived. Every dashboard's import is updated in the
 *   same phase; AdminDashboard.tsx no longer defines or re-exports it.
 *
 *   `h` accepts a full Tailwind responsive class string, e.g.
 *   "h-36 md:h-48". Default is "h-32 md:h-40" — shorter on mobile,
 *   standard height on desktop. The full class string is passed as-is so
 *   the Tailwind JIT compiles both breakpoint variants.
 *
 *   The skeleton lines carry role="status" + an aria-label naming the
 *   widget (CROSS_a11y: loading elements must be announced), since this
 *   component's entire body is a loading affordance for a chart/list that
 *   a later phase (R17) wires in.
 * [DEPENDS ON]: none
 */

export function PlaceholderWidget({
  title,
  sub,
  h = 'h-32 md:h-40',
}: {
  title: string
  sub: string
  h?: string
}) {
  return (
    <div
      className={`bg-surface border border-base rounded-xl p-5 ${h} flex flex-col justify-between`}
    >
      <div>
        <p className="font-heading font-semibold text-sm text-brand-navy">{title}</p>
        <p className="text-xs text-muted mt-1">{sub}</p>
      </div>
      <div className="space-y-2" role="status" aria-label={`${title} — loading`}>
        <div className="skeleton h-3 w-full rounded" aria-hidden />
        <div className="skeleton h-3 w-4/5 rounded" aria-hidden />
        <div className="skeleton h-3 w-3/5 rounded" aria-hidden />
      </div>
    </div>
  )
}
