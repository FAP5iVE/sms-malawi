'use client'

/**
 * apps/web/src/components/shared/CopyableId.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Standard "copy the real ID without cluttering the table with
 *   it" pattern (same idea as GitHub's commit-SHA copy icon) — shows a
 *   short/friendly label with the full value one click away, rather than
 *   forcing a choice between an unreadable full ID and an unusable
 *   truncated one. First used by AdminAuditPanel's Audit Log table for
 *   Entity ID and the actor's underlying UID.
 */

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyableId({ value, display }: { value: string; display?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation() // rows this sits in are often clickable (e.g. session drill-down)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard permission denied or unavailable (some embedded/older
      // browsers) — nothing safe to fall back to, so this silently no-ops
      // rather than throwing.
    }
  }

  return (
    <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
      <span className="truncate" title={value}>{display ?? value}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied to clipboard' : 'Copy full ID to clipboard'}
        title={copied ? 'Copied!' : 'Copy full ID'}
        className="shrink-0 p-0.5 rounded text-muted/70 hover:text-brand-teal hover:bg-page transition-colors"
      >
        {copied ? <Check className="w-3 h-3 text-brand-teal" /> : <Copy className="w-3 h-3" />}
      </button>
    </span>
  )
}
