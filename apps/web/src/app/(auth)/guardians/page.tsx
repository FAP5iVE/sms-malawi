/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(auth)/guardians/page.tsx
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: Staff home for the parent portal. Four tabs, each shown only if the signed-in staff
 *   member holds the permission it needs:
 *     Review queue  guardian.view          decide on guardian links across the school
 *     Student       guardian.view          one child's contacts and guardians
 *     Onboarding    guardian.backfill      bring existing guardians in, in bulk (admin, high_rank)
 *     Access log    guardian.viewAccessLog who looked at a child's information (admin, high_rank)
 *   The RoleGuard is the same coarse gate the proxy applies to /guardians; the per-tab and
 *   per-button checks are the fine-grained ones, and the server enforces all of them again.
 * [DEPENDS ON]: @/components/guardians/*, @/hooks/usePermissions
 */
'use client'

import { useState } from 'react'
import { ClipboardList, ScrollText, Search, Users } from 'lucide-react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { ModuleSurface } from '@/components/shared/ModuleSurface'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import type { TabItem } from '@/components/shared/ModuleTabs'
import { usePermissions } from '@/hooks/usePermissions'
import { GuardianQueueTab } from '@/components/guardians/GuardianQueueTab'
import { GuardianStudentTab } from '@/components/guardians/GuardianStudentTab'
import { GuardianOnboardingTab } from '@/components/guardians/GuardianOnboardingTab'
import { GuardianAccessLogTab } from '@/components/guardians/GuardianAccessLogTab'

type TabId = 'queue' | 'student' | 'onboarding' | 'log'

export default function GuardiansPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'lower_rank']}>
      <GuardiansContent />
    </RoleGuard>
  )
}

function GuardiansContent() {
  const { can } = usePermissions()
  const [active, setActive] = useState<TabId>('queue')

  const tabs: TabItem<TabId>[] = [
    { id: 'queue', label: 'Review queue', icon: ClipboardList },
    { id: 'student', label: 'Student', icon: Search },
    ...(can('guardian.backfill') ? [{ id: 'onboarding' as const, label: 'Onboarding', icon: Users }] : []),
    ...(can('guardian.viewAccessLog') ? [{ id: 'log' as const, label: 'Access log', icon: ScrollText }] : []),
  ]

  return (
    <ModuleSurface>
      <ModuleTabs tabs={tabs} active={active} onChange={setActive} id="guardians-tabs" />
      {active === 'queue' && <GuardianQueueTab />}
      {active === 'student' && <GuardianStudentTab />}
      {active === 'onboarding' && can('guardian.backfill') && <GuardianOnboardingTab />}
      {active === 'log' && can('guardian.viewAccessLog') && <GuardianAccessLogTab />}
    </ModuleSurface>
  )
}
