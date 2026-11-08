/**
 * [CHANGE TYPE]: REWRITE
 * [FILE]: apps/web/src/app/(parent)/parent/[linkId]/page.tsx
 * [PHASE]: Guardian Portal — parent UI (T7c)
 * [PURPOSE]: One child: the title above, then a ModuleSurface holding a tab per section the
 *   guardian was granted (Results, Fees, Attendance), like every other module page. The child is
 *   found in the already-loaded list, so opening it costs no extra request. Sections come from
 *   availableSections(), which offers only what the server will serve, so a tab never leads to
 *   an error the guardian cannot act on.
 * [DEPENDS ON]: @/hooks/useParentPortal, @/lib/parentPortalFormat, @/components/parent/ParentPanels
 */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { ModuleSurface } from '@/components/shared/ModuleSurface'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import type { TabItem } from '@/components/shared/ModuleTabs'
import { AttendancePanel, FeesPanel, ResultsPanel } from '@/components/parent/ParentPanels'
import { useParentChildren } from '@/hooks/useParentPortal'
import { PARENT_SECTION_LABELS, availableSections, childName, type ParentSection } from '@/lib/parentPortalFormat'

export default function ParentChildPage() {
  const params = useParams<{ linkId: string }>()
  const linkId = decodeURIComponent(params.linkId)
  const kids = useParentChildren()
  const [picked, setPicked] = useState<ParentSection | null>(null)

  const back = (
    <Link href="/parent" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted hover:text-body">
      <ChevronLeft className="w-4 h-4" aria-hidden />All children
    </Link>
  )

  if (kids.isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />Loading…</div>
  }
  if (kids.isError) {
    return (
      <div className="space-y-3">
        {back}
        <ModuleSurface>
          <div role="alert" className="text-sm text-body">
            We could not load this just now.{' '}
            <button type="button" className="font-medium underline" onClick={() => kids.refetch()}>Try again</button>
          </div>
        </ModuleSurface>
      </div>
    )
  }

  const child = kids.data?.children.find((c) => c.id === linkId)
  if (!child) {
    return (
      <div className="space-y-3">
        {back}
        <ModuleSurface>
          <div className="py-10 text-center">
            <p className="font-medium text-body">We could not find that child</p>
            <p className="text-sm text-muted mt-1">Go back and choose from your list.</p>
          </div>
        </ModuleSurface>
      </div>
    )
  }

  const sections = availableSections(child.capabilities, child.enrolled)
  const current: ParentSection | null = picked && sections.includes(picked) ? picked : (sections[0] ?? null)
  const tabs: TabItem<ParentSection>[] = sections.map((s) => ({ id: s, label: PARENT_SECTION_LABELS[s] }))

  return (
    <div className="space-y-4">
      {back}
      <header>
        <h1 className="font-heading text-2xl font-bold text-brand-navy dark:text-white">{childName(child)}</h1>
        <p className="text-sm text-muted mt-0.5">
          {child.enrolled ? (child.className ?? 'Class not set') : 'No longer enrolled'}
          {child.admissionNumber ? ` · ${child.admissionNumber}` : ''} · {child.relationship}
        </p>
      </header>

      <ModuleSurface>
        {!child.enrolled && (
          <p role="note" className="text-sm text-body">This student is no longer enrolled, so their information is not available here.</p>
        )}
        {child.enrolled && sections.length === 0 && (
          <p role="note" className="text-sm text-body">The school has not turned on any sections for you yet. Please contact the school office.</p>
        )}

        {current && (
          <>
            <ModuleTabs tabs={tabs} active={current} onChange={setPicked} id="parent-child-tabs" />
            {current === 'results' && <ResultsPanel linkId={child.id} />}
            {current === 'fees' && <FeesPanel linkId={child.id} />}
            {current === 'attendance' && <AttendancePanel linkId={child.id} />}
          </>
        )}
      </ModuleSurface>
    </div>
  )
}
