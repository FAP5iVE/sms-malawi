/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(parent)/parent/page.tsx
 * [PHASE]: Guardian Portal — parent UI (T7c)
 * [PURPOSE]: A guardian's home: their children, each linking to that child's page. A guardian
 *   with no approved link sees a plain explanation rather than an empty screen, because that is
 *   the normal state between claiming an invitation and the school granting access.
 * [DEPENDS ON]: @/hooks/useParentPortal, @/lib/parentPortalFormat
 */
'use client'

import Link from 'next/link'
import { ChevronRight, GraduationCap, Loader2 } from 'lucide-react'
import { useParentChildren, useParentMe } from '@/hooks/useParentPortal'
import { childName } from '@/lib/parentPortalFormat'

export default function ParentHomePage() {
  const me = useParentMe()
  const kids = useParentChildren()
  const children = kids.data?.children ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-heading font-bold text-body">{me.data?.displayName ? `Hello, ${me.data.displayName}` : 'Hello'}</h1>
        <p className="text-sm text-muted mt-1">Choose a child to see their results, fees and attendance.</p>
      </div>

      {kids.isLoading && <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading…</div>}
      {kids.isError && (
        <div role="alert" className="rounded-xl border border-brand-coral/40 bg-brand-coral/10 p-3 text-sm text-body">
          We could not load your children just now.{' '}
          <button type="button" className="font-medium underline" onClick={() => kids.refetch()}>Try again</button>
        </div>
      )}

      {kids.data && children.length === 0 && (
        <div className="rounded-2xl border border-dashed border-base p-8 text-center">
          <GraduationCap className="w-8 h-8 mx-auto text-muted mb-2" aria-hidden />
          <p className="font-medium text-body">No children to show yet</p>
          <p className="text-sm text-muted mt-1">The school needs to approve access for each child. If you were told to expect this, please contact the school office.</p>
        </div>
      )}

      {children.length > 0 && (
        <ul className="space-y-3">
          {children.map((c) => (
            <li key={c.id}>
              <Link
                href={`/parent/${encodeURIComponent(c.id)}`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-base bg-surface p-4 hover:bg-page"
              >
                <span className="min-w-0">
                  <span className="block font-heading font-semibold text-body truncate">{childName(c)}</span>
                  <span className="block text-sm text-muted truncate">
                    {c.enrolled ? (c.className ?? 'Class not set') : 'No longer enrolled'}
                    {c.admissionNumber ? ` · ${c.admissionNumber}` : ''} · {c.relationship}
                  </span>
                </span>
                <ChevronRight className="w-5 h-5 shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
