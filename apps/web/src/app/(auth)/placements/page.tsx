/**
 * [CHANGE TYPE]: MAJOR REWRITE (OVERHAUL)
 * [FILE]: apps/web/src/app/(auth)/placements/page.tsx
 * [R-PHASE]: R18 — University Placement Module, redesigned against the
 *   "Malawi Higher Education Placement & Advisory" reference module.
 * [PURPOSE]: ONE merged University Placement page replacing the old
 *   two-page split (this universal cohort console + the student-only
 *   /my-placement page, now deleted). Internal tabs mirror the reference
 *   module's five functional sections, each independently gated:
 *
 *     Registry & Analytics  — every role (placement.view is universal)
 *     MSCE Advisory          — every role (placement.view is universal;
 *                              a pure calculator, not tied to any record)
 *     Staff Entry            — placement.manage OR placement.recordOutcome
 *                              (admin, high_rank, lower_rank)
 *     Verify Claims          — placement.verifyOutcome (admin, high_rank)
 *     My Claim               — placement.recordOwnChoice AND the signed-in
 *                              student has graduated (Student.status ===
 *                              'GRADUATED', confirmed server-side via
 *                              GET /placements/me's isGraduated flag — a
 *                              below-MSCE or still-enrolled student never
 *                              sees this tab, not even disabled).
 * [DEPENDS ON]: @/hooks/usePermissions, @/hooks/usePlacements (useMyPlacement),
 *   @/store/authStore, @/components/shared/ModuleTabs,
 *   @/components/placements/*
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useMyPlacement, usePlacementsQueue } from '@/hooks/usePlacements'
import { ModuleTabs, type TabItem } from '@/components/shared/ModuleTabs'
import { PlacementRegistryPanel } from '@/components/placements/PlacementRegistryPanel'
import { PlacementAdvisoryChecker } from '@/components/placements/PlacementAdvisoryChecker'
import { StaffPlacementEntryPanel } from '@/components/placements/StaffPlacementEntryPanel'
import { ClaimsVerificationPanel } from '@/components/placements/ClaimsVerificationPanel'
import { StudentClaimPanel } from '@/components/placements/StudentClaimPanel'
import { ListChecks, Calculator, ClipboardEdit, ShieldCheck, GraduationCap } from 'lucide-react'

type PlacementTab = 'registry' | 'advisory' | 'staffEntry' | 'verify' | 'myClaim'

function PlacementsContent() {
  const { setTitle, setSubtitle } = useAuthStore()
  const { can, canAny, isInitialized } = usePermissions()

  const canViewOwn    = can('placement.viewOwn')
  const canClaim      = can('placement.recordOwnChoice')
  const canStaffEnter = canAny(['placement.manage', 'placement.recordOutcome'])
  const canVerify     = can('placement.verifyOutcome')

  const { data: myPlacement } = useMyPlacement(isInitialized && canViewOwn)
  const showMyClaimTab = canClaim && Boolean(myPlacement?.isGraduated)

  const { data: queue = [] } = usePlacementsQueue(undefined, isInitialized && canVerify)
  const pendingCount = canVerify ? queue.filter((p) => p.status === 'PENDING_APPROVAL').length : 0

  const tabs = useMemo<TabItem<PlacementTab>[]>(() => {
    const list: TabItem<PlacementTab>[] = [
      { id: 'registry', label: 'Registry & Analytics', icon: ListChecks },
      { id: 'advisory', label: 'MSCE Advisory', icon: Calculator },
    ]
    if (canStaffEnter) list.push({ id: 'staffEntry', label: 'Staff Entry', icon: ClipboardEdit })
    if (canVerify) list.push({ id: 'verify', label: 'Verify Claims', icon: ShieldCheck, badge: pendingCount })
    if (showMyClaimTab) list.push({ id: 'myClaim', label: 'My Claim', icon: GraduationCap })
    return list
  }, [canStaffEnter, canVerify, pendingCount, showMyClaimTab])

  // Raw selection state. This can transiently point at a tab id that no
  // longer exists in `tabs` (e.g. right after a role/graduation status
  // resolves) — that's fine, `activeTab` below derives the safe value
  // during render instead of "fixing" it in a follow-up effect + re-render.
  const [active, setActive] = useState<PlacementTab>('registry')
  const activeTab = tabs.some((t) => t.id === active) ? active : 'registry'

  useEffect(() => {
    setTitle('University Placement')
    setSubtitle('Registry, advisory & admissions')
    return () => {
      setTitle(null)
      setSubtitle(null)
    }
  }, [setTitle, setSubtitle])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <ModuleTabs tabs={tabs} active={activeTab} onChange={setActive} id="placements" />

      {activeTab === 'registry' && <PlacementRegistryPanel />}
      {activeTab === 'advisory' && <PlacementAdvisoryChecker />}
      {activeTab === 'staffEntry' && canStaffEnter && <StaffPlacementEntryPanel />}
      {activeTab === 'verify' && canVerify && <ClaimsVerificationPanel />}
      {activeTab === 'myClaim' && showMyClaimTab && <StudentClaimPanel />}
    </div>
  )
}

export default function PlacementsPage() {
  return <PlacementsContent />
}