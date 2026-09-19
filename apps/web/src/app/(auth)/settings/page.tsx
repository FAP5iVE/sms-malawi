'use client'

/*
 * apps/web/src/app/(auth)/settings/page.tsx — Phase D15
 *
 * Role-contextual settings hub. The sidebar and available sections are
 * generated from the SETTINGS_SECTIONS map filtered by the user's role.
 *
 * Section routing:
 *   The active section is controlled by local state (no URL params) to keep
 *   the settings experience as a single-page shell.
 *
 * Role → available sections:
 *   admin        : Profile, System Config, Security, Academic Year, Notifications
 *   high_rank    : Profile, Academic Policy, Exam & Grading, Report Cards, Notifications
 *   finance      : Profile, Finance Preferences, Payroll Preferences, Notifications
 *   library      : Profile, Library Rules, Notifications
 *   hr           : Profile, HR Workflow, Notifications
 *   academic     : Profile, Classroom Preferences, Notifications
 *   exam_officer : Profile, Exam Configuration, Notifications
 *   lower_rank   : Profile, Communication, Notifications
 *   student      : Profile, Notifications
 */
/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Initialises the active section from ?section= (validated
 *   against the role-visible list) so PageHeader's Profile menu item
 *   (/settings?section=profile — /profile never existed as a route) and
 *   ExamOfficerDashboard's Exam Settings quick action can deep-link.
 *   Also clears this touched file's pre-existing (baseline-confirmed)
 *   type errors: the SectionId union was missing the 'holidays' and
 *   'search-index' members SECTIONS already declared; HolidaysManager was
 *   imported from '@/components/settings/…' though it lives at
 *   settings/_components/; and a full local duplicate of AlgoliaSeedPanel
 *   conflicted with the identically-named import from
 *   '@/components/settings/AlgoliaSeedPanel' — the local copy (and the
 *   getAuth import only it used) is deleted in favour of the imported
 *   component, which the 'search-index' section already rendered.
 */

import { useState, Suspense }   from 'react'
import { useSearchParams }      from 'next/navigation'
import {
  User,
  Settings,
  BookOpen,
  GraduationCap,
  Banknote,
  Library,
  Bell,
  LayoutList,
  CalendarDays, 
  Search,
  Building2,
}                               from 'lucide-react'
import { useAuthStore }         from '@/store/authStore'
import { ModuleSurface }        from '@/components/shared/ModuleSurface'
import { ModuleTabs }           from '@/components/shared/ModuleTabs'
import { ProfileSettings }      from '@/components/settings/ProfileSettings'
import { SystemConfigSettings } from '@/components/settings/SystemConfigSettings'
import { AcademicPolicySettings } from '@/components/settings/AcademicPolicySettings'
import { ExamGradingSettings }  from '@/components/settings/ExamGradingSettings'
import { FinanceSettings }      from '@/components/settings/FinanceSettings'
import { LibrarySettings }      from '@/components/settings/LibrarySettings'
import { HRDepartmentsSettings } from '@/components/settings/HRDepartmentsSettings'
import { SchoolIdentitySettings } from '@/components/settings/SchoolIdentitySettings'
import { ClassroomSettings }    from '@/components/settings/ClassroomSettings'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
import type { UserRole }        from '@shared/types/roles'
import { HolidaysManager }      from '@/app/(auth)/settings/_components/HolidaysManager'
import { AlgoliaSeedPanel }     from '@/components/settings/AlgoliaSeedPanel'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

type SectionId =
  | 'profile'
  | 'system'
  | 'holidays'
  | 'search-index'
  | 'academic-policy'
  | 'exam-grading'
  | 'finance'
  | 'library'
  | 'hr-departments'
  | 'school-identity'
  | 'classroom'
  | 'notifications'

interface Section {
  id:    SectionId
  label: string
  icon:  React.ElementType
  roles: UserRole[]
}

const SECTIONS: Section[] = [
  {
    id:    'profile',
    label: 'Profile & Account',
    icon:  User,
    roles: ['admin','high_rank','finance','library','hr','academic','exam_officer','lower_rank','student'],
  },
  {
    id:    'system',
    label: 'System Configuration',
    icon:  Settings,
    roles: ['admin'],
  },
  {
    id:    'holidays',
    label: 'Public Holidays',
    icon:  CalendarDays,
    roles: ['admin'],
  },
  {
    id:    'search-index',
    label: 'Search Index',
    icon:  Search,
    roles: ['admin'],
  },
  {
    id:    'academic-policy',
    label: 'Academic Policy',
    icon:  BookOpen,
    roles: ['admin', 'high_rank'],
  },
  {
    id:    'exam-grading',
    label: 'Exam & Grading',
    icon:  GraduationCap,
    roles: ['admin', 'high_rank', 'exam_officer'],
  },
  {
    id:    'finance',
    label: 'Finance Preferences',
    icon:  Banknote,
    roles: ['admin', 'finance'],
  },
  {
    id:    'library',
    label: 'Library Rules',
    icon:  Library,
    roles: ['admin', 'library'],
  },
  {
    id:    'hr-departments',
    label: 'Departments & Titles',
    icon:  Building2,
    roles: ['admin', 'hr', 'high_rank'],
  },
  {
    id:    'school-identity',
    label: 'School Identity',
    icon:  GraduationCap,
    roles: ['admin', 'hr', 'high_rank'],
  },
  {
    id:    'classroom',
    label: 'Classroom Preferences',
    icon:  LayoutList,
    roles: ['academic'],
  },
  {
    id:    'notifications',
    label: 'Notifications',
    icon:  Bell,
    roles: ['admin','high_rank','finance','library','hr','academic','exam_officer','lower_rank','student'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// SECTION RENDERER
// ─────────────────────────────────────────────────────────────────────────────

function SectionContent({ sectionId }: { sectionId: SectionId }) {
  switch (sectionId) {
    case 'profile':          return <ProfileSettings />
    case 'system':           return <SystemConfigSettings />
    case 'academic-policy':  return <AcademicPolicySettings />
    case 'exam-grading':     return <ExamGradingSettings />
    case 'finance':          return <FinanceSettings />
    case 'library':          return <LibrarySettings />
    case 'hr-departments':   return <HRDepartmentsSettings />
    case 'school-identity':  return <SchoolIdentitySettings />
    case 'classroom':        return <ClassroomSettings />
    case 'notifications':    return <NotificationSettings />
    case 'holidays':         return <HolidaysManager />
    case 'search-index':     return <AlgoliaSeedPanel />
    default:                 return null
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PAGE
// ─────────────────────────────────────────────────────────────────────────────

function SettingsPageInner() {
  const { role }  = useAuthStore()
  const [manualSection, setManualSection] = useState<SectionId | null>(null)

  const visibleSections = SECTIONS.filter(
    (s) => role && s.roles.includes(role),
  )

  // R19 — the active section is derived during render via Next's
  // useSearchParams() (the codebase's established pattern — see
  // (public)/login/page.tsx, (auth)/exams/page.tsx, (auth)/finances/page.tsx,
  // (auth)/hr/page.tsx, (auth)/library/page.tsx) instead of a useEffect that
  // read window.location.search and called setActive. `role` — and
  // therefore `visibleSections` — resolves asynchronously after mount, so
  // rather than a one-time lazy initializer, `active` is split into a
  // manual override (set only by an explicit tab click) and a derived
  // fallback: `?section=` is re-validated against `visibleSections` on
  // every render, so it still takes effect once role resolves post-mount,
  // but a manual pick — once made — is never clobbered by the URL param
  // again, exactly mirroring the old effect's behavior.
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get('section')
  const urlSection: SectionId | null =
    sectionParam && visibleSections.some((s) => s.id === sectionParam) ? (sectionParam as SectionId) : null

  const active: SectionId = manualSection ?? urlSection ?? 'profile'
  const setActive = setManualSection

  return (
    <div className="space-y-5">
      {/* Page title */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Settings</h1>
        <p className="text-sm text-muted mt-0.5">
          Manage your account preferences and system configuration.
        </p>
      </div>

      <ModuleSurface>
      {/* [PRODUCTION FIX] Was a vertical section list (desktop: a left
         sidebar of stacked buttons; mobile: a dropdown accordion) —
         replaced with the same horizontal ModuleTabs bar every other
         module page uses (Exams, Finance, HR, etc.), which already
         handles small-screen horizontal scrolling on its own, so the
         separate mobile dropdown markup is no longer needed. */}
      <ModuleTabs<SectionId>
        id="settings-sections"
        tabs={visibleSections}
        active={active}
        onChange={setActive}
      />

      {/* ── Content panel ─────────────────────────────────────────────── */}
      <div className="bg-surface border border-base rounded-2xl p-6 space-y-6">
        <SectionContent sectionId={active} />
      </div>
      </ModuleSurface>
    </div>
  )
}

// `useSearchParams()` requires a Suspense boundary or `next build` fails —
// same convention as (public)/login/page.tsx and (auth)/exams/page.tsx.
export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 space-y-3"><div className="h-8 w-40 rounded-lg bg-surface animate-pulse" /><div className="h-48 rounded-xl bg-surface animate-pulse" /></div>}>
      <SettingsPageInner />
    </Suspense>
  )
}