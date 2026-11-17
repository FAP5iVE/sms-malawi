/**
 * [CHANGE TYPE]: REWRITE
 * [FILE]: apps/web/src/app/(parent)/parent/page.tsx
 * [PHASE]: Guardian Portal — parent UI (T7c)
 * [PURPOSE]: A guardian's home: their children, each linking to that child's page. Composed like
 *   every other page in the system: the title sits above, the content sits on the page's
 *   ModuleSurface, and the list is flat rows with dividers (no cards inside the surface).
 *   A guardian with no approved link sees a plain explanation rather than an empty screen,
 *   because that is the normal state between claiming an invitation and the school granting access.
 * [DEPENDS ON]: @/hooks/useParentPortal, @/lib/parentPortalFormat, @/components/shared/ModuleSurface
 */
'use client'

import Link from 'next/link'
import { ChevronRight, GraduationCap, Loader2 } from 'lucide-react'
import { ModuleSurface } from '@/components/shared/ModuleSurface'
import { useParentChildren, useParentMe } from '@/hooks/useParentPortal'
import { childName } from '@/lib/parentPortalFormat'

export default function ParentHomePage() {
  const me = useParentMe()
  const kids = useParentChildren()
  const children = kids.data?.children ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy dark:text-white flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-tone-teal" aria-hidden />
          {me.data?.displayName ? `Hello, ${me.data.displayName}` : 'Hello'}
        </h1>
        <p className="text-sm text-muted mt-0.5">Choose a child to see their results, fees and attendance.</p>
      </div>

      <ModuleSurface>
        {kids.isLoading && <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading…</div>}
        {kids.isError && (
          <div role="alert" className="text-sm text-body">
            We could not load your children just now.{' '}
            <button type="button" className="font-medium underline" onClick={() => kids.refetch()}>Try again</button>
          </div>
        )}

        {kids.data && children.length === 0 && (
          <div className="py-10 text-center">
            <p className="font-medium text-body">No children to show yet</p>
            <p className="text-sm text-muted mt-1">The school needs to approve access for each child. If you were told to expect this, please contact the school office.</p>
          </div>
        )}

        {children.length > 0 && (
          <ul className="divide-y divide-[var(--border-base,rgba(0,0,0,0.08))]">
            {children.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/parent/${encodeURIComponent(c.id)}`}
                  className="flex min-h-16 items-center justify-between gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-page"
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
      </ModuleSurface>
    </div>
  )
}
