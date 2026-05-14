import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  iconColor?: string // tailwind bg class e.g. "bg-brand-teal/10"
  iconText?: string // tailwind text class e.g. "text-brand-teal"
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string // e.g. "+12 this month"
  subLabel?: string // secondary line below value
}

export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = 'bg-brand-teal/10',
  iconText = 'text-brand-teal',
  trend,
  trendLabel,
  subLabel,
}: StatCardProps) {
  const TrendIcon =
    trend === 'up'
      ? TrendingUp
      : trend === 'down'
        ? TrendingDown
        : trend === 'neutral'
          ? Minus
          : null

  const trendColor =
    trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-brand-coral' : 'text-muted'

  return (
    <div className="bg-surface border border-base rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon className={`w-5 h-5 ${iconText}`} />
        </div>
        {TrendIcon && trendLabel && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {trendLabel}
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold font-heading text-brand-navy tabular">{value}</p>
        {subLabel && <p className="text-xs text-muted mt-0.5">{subLabel}</p>}
        <p className="text-sm text-muted mt-1">{label}</p>
      </div>
    </div>
  )
}
