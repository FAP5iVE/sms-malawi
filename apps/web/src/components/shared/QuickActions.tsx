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
}

export function QuickActions({ actions }: QuickActionsProps) {
  return (
    <div className="bg-surface border border-base rounded-xl p-5">
      <h3 className="font-heading font-semibold text-sm text-brand-navy mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-page border border-transparent hover:border-base transition-all group text-center"
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
