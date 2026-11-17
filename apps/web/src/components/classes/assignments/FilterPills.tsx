/**
 * [FILE]: apps/web/src/components/classes/assignments/FilterPills.tsx
 * [PURPOSE]: Small single-select filter group shared by the assignment list and the
 *   class list. Buttons (not links): each is a toggle, so aria-pressed is used and
 *   every target is at least 44px tall for touch.
 */
import { CHIP, CHIP_ON, CHIP_OFF } from '@/lib/hills/chip'

interface FilterPillsProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: Array<{ id: T; label: string; count?: number }>
  label: string
}

export function FilterPills<T extends string>({ value, onChange, options, label }: FilterPillsProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`${CHIP} ${value === o.id ? CHIP_ON : CHIP_OFF}`}
        >
          {o.label}{o.count !== undefined ? ` (${o.count})` : ''}
        </button>
      ))}
    </div>
  )
}
