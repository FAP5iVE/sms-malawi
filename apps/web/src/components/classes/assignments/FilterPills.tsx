/**
 * [FILE]: apps/web/src/components/classes/assignments/FilterPills.tsx
 * [PURPOSE]: Small single-select filter group shared by the assignment list and the
 *   class list. Buttons (not links): each is a toggle, so aria-pressed is used and
 *   every target is at least 36px tall for touch.
 */
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
          className={`min-h-9 rounded-full border px-3 text-xs font-heading font-semibold transition-colors ${
            value === o.id ? 'border-brand-teal bg-brand-teal/10 text-brand-teal' : 'border-base text-muted hover:bg-page'
          }`}
        >
          {o.label}{o.count !== undefined ? ` (${o.count})` : ''}
        </button>
      ))}
    </div>
  )
}
