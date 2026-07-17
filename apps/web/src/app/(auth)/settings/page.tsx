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

import { useState, useEffect }  from 'react'
import {
  User,
  Settings,
  Shield,
  BookOpen,
  GraduationCap,
  Banknote,
  Library,
  Users,
  Bell,
  ChevronRight,
  LayoutList,
  CalendarDays, 
  Search,
}                               from 'lucide-react'
import { useAuthStore }         from '@/store/authStore'
import { ProfileSettings }      from '@/components/settings/ProfileSettings'
import { SystemConfigSettings } from '@/components/settings/SystemConfigSettings'
import { AcademicPolicySettings } from '@/components/settings/AcademicPolicySettings'
import { ExamGradingSettings }  from '@/components/settings/ExamGradingSettings'
import { FinanceSettings }      from '@/components/settings/FinanceSettings'
import { LibrarySettings }      from '@/components/settings/LibrarySettings'
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

export default function SettingsPage() {
  const { role }  = useAuthStore()
  const [active, setActive] = useState<SectionId>('profile')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const visibleSections = SECTIONS.filter(
    (s) => role && s.roles.includes(role),
  )

  // R15 — initialise the active section from ?section= so the header user
  // menu (/settings?section=profile) and ExamOfficerDashboard's Exam
  // Settings quick action (/settings?section=exam-grading) can deep-link.
  // Runs once per role resolution; only accepts a section this role can see.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('section')
    if (q && visibleSections.some((s) => s.id === q)) setActive(q as SectionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-validate only when role resolves
  }, [role])

  const activeSection = visibleSections.find((s) => s.id === active) ?? visibleSections[0]

  return (
    <div className="space-y-5">
      {/* Page title */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Settings</h1>
        <p className="text-sm text-muted mt-0.5">
          Manage your account preferences and system configuration.
        </p>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Sidebar (desktop) ─────────────────────────────────────────── */}
        <aside className="hidden md:flex flex-col w-52 shrink-0 bg-surface border border-base rounded-2xl overflow-hidden">
          {visibleSections.map((section) => {
            const Icon     = section.icon
            const isActive = section.id === active
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActive(section.id)}
                className={[
                  'flex items-center gap-3 px-4 py-3 text-sm font-medium text-left transition-colors border-l-2',
                  isActive
                    ? 'border-brand-teal bg-brand-teal/6 text-brand-teal font-semibold'
                    : 'border-transparent text-muted hover:bg-page hover:text-body',
                ].join(' ')}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden />
                <span className="truncate">{section.label}</span>
              </button>
            )
          })}
        </aside>

        {/* ── Mobile section select ─────────────────────────────────────── */}
        <div className="md:hidden w-full">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-full flex items-center justify-between gap-3 bg-surface border border-base rounded-xl px-4 py-3 min-h-[44px]"
          >
            <div className="flex items-center gap-3">
              {activeSection && (
                <>
                  <activeSection.icon className="w-4 h-4 text-brand-teal" aria-hidden />
                  <span className="text-sm font-heading font-semibold text-body">
                    {activeSection.label}
                  </span>
                </>
              )}
            </div>
            <ChevronRight
              className={`w-4 h-4 text-muted transition-transform ${mobileMenuOpen ? 'rotate-90' : ''}`}
              aria-hidden
            />
          </button>

          {mobileMenuOpen && (
            <div className="mt-2 bg-surface border border-base rounded-xl overflow-hidden shadow-lg">
              {visibleSections.map((section) => {
                const Icon     = section.icon
                const isActive = section.id === active
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => { setActive(section.id); setMobileMenuOpen(false) }}
                    className={[
                      'flex items-center gap-3 w-full px-4 py-3 text-sm text-left transition-colors border-b border-base last:border-0',
                      isActive
                        ? 'bg-brand-teal/8 text-brand-teal font-semibold'
                        : 'text-muted hover:bg-page hover:text-body',
                    ].join(' ')}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden />
                    {section.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

       {/* ── Content panel ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 bg-surface border border-base rounded-2xl p-6 space-y-6">
          <SectionContent sectionId={active} />
          {role === 'admin' && (
            <AlgoliaSeedPanel />
          )}
        </div>
      </div>
    </div>
  )
}