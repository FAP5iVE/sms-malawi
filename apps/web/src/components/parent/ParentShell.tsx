/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/parent/ParentShell.tsx
 * [PHASE]: Chikangawa Hills, Phase 10c (guardian shell)
 * [PURPOSE]: The guardian's frame, built to look like the staff frame: the same calm
 *   backdrop, a sidebar on tablets and desktops, a header with the page title, theme
 *   switch and account menu, and a bottom bar on phones. It lists only the pages a
 *   guardian already has: Dashboard (/parent) and one page per child (/parent/<id>).
 *
 *   It deliberately does NOT reuse the staff Sidebar, PageHeader or MobileBottomNav:
 *   those load staff data (global search, announcements, approvals) that a guardian
 *   has no access to, and would fire requests the server refuses. Same classes and
 *   proportions, guardian data only. No new route, no new request: the child list
 *   comes from the same query the pages already use (useParentChildren).
 *
 *   Access is unchanged. RoleGuard (in the layout) still admits only the parent role,
 *   the proxy still confines that role to /parent, and the server still decides what
 *   each child's tabs may show.
 * [DEPENDS ON]: @/hooks/useParentPortal, @/lib/hills/parentNav, @/components/shared/*
 */
'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, GraduationCap, LayoutDashboard, LogOut, MessageSquareWarning, UserRound } from 'lucide-react'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { ReportProblemModal } from '@/components/shared/ReportProblemModal'
import { SchoolMark } from '@/components/shared/SchoolMark'
import { logout } from '@/components/providers/AuthProvider'
import { useParentChildren, useParentMe } from '@/hooks/useParentPortal'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { useAuthStore } from '@/store/authStore'
import { buildParentNav, parentBarItems, parentPageTitle, PARENT_HOME_HREF, type ParentNavItem } from '@/lib/hills/parentNav'

function useGuardianNav() {
  const pathname = usePathname()
  const kids = useParentChildren()
  const children = kids.data?.children ?? []
  const items = buildParentNav(children, pathname)
  return { items, title: parentPageTitle(children, pathname), pathname }
}

function iconFor(item: ParentNavItem) {
  return item.kind === 'dashboard' ? LayoutDashboard : UserRound
}

// ── Sidebar (md and up) ─────────────────────────────────────────────────────
// An icon rail on tablets and a full panel on desktops, like the staff sidebar.

function ParentSidebar({ items }: { items: ParentNavItem[] }) {
  const { data: schoolInfo } = usePublicSchoolInfo()
  const top = items.filter((i) => i.kind === 'dashboard')
  const kids = items.filter((i) => i.kind === 'child')

  const link = (item: ParentNavItem) => {
    const Icon = iconFor(item)
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        aria-current={item.active ? 'page' : undefined}
        className={[
          'relative flex items-center gap-3 transition-colors',
          'mx-2 justify-center rounded-xl py-3 lg:mx-0 lg:justify-start lg:rounded-none lg:border-l-2 lg:px-5 lg:py-2.5',
          item.active
            ? 'bg-brand-teal/10 text-tone-teal lg:border-brand-teal lg:bg-brand-teal/8 lg:font-semibold'
            : 'text-muted hover:bg-page hover:text-body lg:border-transparent',
        ].join(' ')}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden min-w-0 flex-1 truncate text-sm lg:block">{item.label}</span>
      </Link>
    )
  }

  return (
    <aside className="flex h-full w-[60px] shrink-0 flex-col overflow-hidden border-r border-base bg-surface lg:w-60" aria-label="Main navigation">
      <div className="flex h-16 shrink-0 items-center justify-center border-b border-base lg:justify-start lg:px-3">
        <Link href={PARENT_HOME_HREF} className="flex h-14 w-14 shrink-0 items-center justify-center" aria-label="Go to Dashboard">
          <SchoolMark kind="emblem" width={40} height={40} className="h-14 w-14 object-contain" />
        </Link>
        <span className="ml-2.5 hidden min-w-0 flex-1 truncate font-heading text-sm font-bold text-brand-navy lg:block">
          {schoolInfo?.schoolName ?? ''}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3" aria-label="Page navigation">
        <div>{top.map(link)}</div>
        {kids.length > 0 && (
          <div role="group" aria-label="Children">
            <div className="mx-4 my-2 border-t border-base lg:hidden" aria-hidden />
            <p className="hidden px-5 pb-1 pt-4 font-heading text-xs font-semibold text-muted lg:block">Children</p>
            {kids.map(link)}
          </div>
        )}
      </nav>

      <div className="hidden shrink-0 border-t border-base px-4 py-4 lg:block">
        <div className="rounded-xl bg-page px-3 py-2.5">
          <p className="mb-0.5 font-heading text-xs font-semibold text-muted">Signed in as</p>
          <p className="truncate font-heading text-xs font-semibold text-body">Parent or guardian</p>
        </div>
      </div>
    </aside>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────

function ParentHeader({ title }: { title: string }) {
  const router = useRouter()
  const me = useParentMe()
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const displayName = me.data?.displayName ?? user?.displayName ?? user?.email?.split('@')[0] ?? 'Guardian'
  const initials = displayName.slice(0, 2).toUpperCase()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const signOut = async () => {
    await logout()
    router.replace('/login')
  }

  return (
    <>
      <header data-page-header="" className="relative z-30 shrink-0 border-b border-base bg-surface">
        <div className="flex h-14 items-center gap-2 px-4 md:h-16 md:px-6 lg:px-8">
          <Link href={PARENT_HOME_HREF} className="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl md:hidden" aria-label="Go to Dashboard">
            <SchoolMark kind="emblem" width={40} height={40} priority className="h-10 w-10 object-contain" />
          </Link>

          <h2 className="min-w-0 flex-1 truncate px-2 text-center font-heading text-base font-semibold text-body md:px-0 md:text-left md:text-lg">
            {title}
          </h2>

          <div className="flex shrink-0 items-center gap-1.5">
            <ModeToggle />
            <div ref={ref} className="relative">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex min-h-11 items-center gap-2.5 rounded-xl px-1.5 transition-colors hover:bg-page md:px-2.5"
                aria-expanded={open}
                aria-haspopup="true"
                aria-label={`Account menu, ${displayName}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-deep">
                  <span className="font-heading text-xs font-bold text-white">{initials}</span>
                </span>
                <span className="hidden text-left xl:block">
                  <span className="block font-heading text-sm font-semibold leading-none text-body">{displayName}</span>
                  <span className="mt-0.5 block text-xs text-muted">Parent or guardian</span>
                </span>
                <ChevronDown className={`hidden h-3.5 w-3.5 text-muted transition-transform duration-200 xl:block ${open ? 'rotate-180' : ''}`} aria-hidden />
              </button>

              {open && (
                <div role="menu" aria-label="Account options" className="absolute right-0 top-full mt-2 w-56 origin-top-right overflow-hidden rounded-2xl border border-base bg-surface shadow-lg">
                  <div className="border-b border-base px-4 py-3">
                    <p className="font-heading text-sm font-semibold text-body [overflow-wrap:anywhere]">{displayName}</p>
                    {user?.email && <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>}
                  </div>
                  <div className="py-1.5">
                    <button
                      type="button" role="menuitem"
                      onClick={() => { setOpen(false); setReportOpen(true) }}
                      className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-sm text-muted transition-colors hover:bg-page hover:text-body"
                    >
                      <MessageSquareWarning className="h-4 w-4 shrink-0" aria-hidden />Report a problem
                    </button>
                  </div>
                  <div className="border-t border-base py-1.5">
                    <button
                      type="button" role="menuitem" onClick={signOut}
                      className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-sm text-tone-coral transition-colors hover:bg-brand-coral/5"
                    >
                      <LogOut className="h-4 w-4 shrink-0" aria-hidden />Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      {reportOpen && <ReportProblemModal onClose={() => setReportOpen(false)} />}
    </>
  )
}

// ── Phone bottom bar ────────────────────────────────────────────────────────

function ParentBottomNav({ items }: { items: ParentNavItem[] }) {
  const bar = parentBarItems(items)
  return (
    <nav
      aria-label="Mobile navigation"
      data-mobile-nav=""
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t border-base bg-surface md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {bar.map((item) => {
        const Icon = item.kind === 'dashboard' ? LayoutDashboard : GraduationCap
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={[
              'relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 pb-2 pt-2 transition-colors duration-150',
              item.active ? 'text-tone-teal' : 'text-muted hover:text-body',
            ].join(' ')}
          >
            <span className={`relative flex h-8 w-14 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${item.active ? 'app-tint' : ''}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className={`max-w-full truncate px-0.5 text-center text-xs leading-none ${item.active ? 'font-semibold' : 'font-medium'}`}>
              {item.mobileLabel}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

// ── Shell ───────────────────────────────────────────────────────────────────

export function ParentShell({ children }: { children: ReactNode }) {
  const { items, title, pathname } = useGuardianNav()
  return (
    <>
      <div className="flex h-dvh overflow-hidden bg-page pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        <PublicAmbientBackground variant="calm" />
        <div className="relative z-10 hidden shrink-0 md:flex">
          <ParentSidebar items={items} />
        </div>
        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <ParentHeader title={title} />
          <main className="main-scroll-pad relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pt-3 md:px-6 md:pt-6 lg:px-8">
            <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
          </main>
        </div>
      </div>
      <ParentBottomNav items={items} />
    </>
  )
}
