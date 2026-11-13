'use client'

/**
 * apps/web/src/components/shared/PublicPageLayout.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 6a, 2026-11-12)
 * [PURPOSE]: The one frame for the public content pages (admissions, academics,
 *   student life, leadership, privacy, terms; list, detail and 404 pages follow
 *   in 6b). It replaces each page's own `max-w-*` wrapper, background import and
 *   heading block, so every page gets the same two columns:
 *     - from 900px: the title, a short intro and an "On this page" list on the
 *       sky (left, sticky); the content on ONE opaque surface (right);
 *     - below 900px: one column, and the "On this page" list becomes a row of
 *       pills that scrolls sideways inside itself.
 * [PROPS]:
 *   title     the page's <h1>.
 *   intro     the line under the title (text on the sky, full-strength ink).
 *   wide      the content column takes the rest of the width instead of ~860px
 *             (card grids such as leadership).
 *   surface   false = no surface behind the content; the children bring their
 *             own opaque cards. Never leave text on the bare sky.
 *   contents  false = no "On this page" list.
 * [CONTENTS LIST]: built on the client from the page's own headings: every <h2>
 *   inside a <section> (re-scanned when the page's markup changes, so content that
 *   loads later is included). A section without an id gets one from its heading, so
 *   the footer links that already point at ids (#curriculum, #fees, ...) keep
 *   working. Fewer than two headings = no list. Nothing here touches page data.
 * [BACKGROUND]: renders <PublicAmbientBackground /> itself and switches the
 *   interim readability scrim off (`hills-open`); pages must not render their own.
 * [NO LOGIC]: presentational. No data, no routing, no form handling.
 *
 * [PHASE 6b ADDITIONS (2026-11-13)]:
 *   above     node above the title in the left column (a back link, an eyebrow).
 *   below     node under the contents list (sibling links, quick links, a button).
 *   compact   smaller title, for pages whose title is a post headline (details).
 *   <PublicSiblingNav current="/news" />  the "More from the school" links used
 *             by the list pages; the current page is marked with aria-current.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'

interface PublicPageLayoutProps {
  title: string
  intro?: ReactNode
  wide?: boolean
  surface?: boolean
  contents?: boolean
  compact?: boolean
  above?: ReactNode
  below?: ReactNode
  children: ReactNode
}

const SIBLINGS = [
  { href: '/news', label: 'Latest News' },
  { href: '/notices', label: 'Announcements' },
  { href: '/academic-advertisements', label: 'Academic Advertisements' },
  { href: '/events', label: 'School Events' },
  { href: '/gallery', label: 'School Gallery' },
  { href: '/placement-results', label: 'University Placements' },
]

/** "More from the school": links between the list pages (desktop: a list under
 *  the intro; phones: a row of pills). `current` is the page's own path. */
export function PublicSiblingNav({ current }: { current: string }) {
  return (
    <nav className="hills-page__toc" aria-label="More from the school">
      <p className="hills-page__toc-title">More from the school</p>
      <ol>
        {SIBLINGS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className={s.href === current ? 'is-active' : undefined}
              aria-current={s.href === current ? 'page' : undefined}
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}

interface TocItem {
  id: string
  label: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function PublicPageLayout({
  title,
  intro,
  wide = false,
  surface = true,
  contents = true,
  compact = false,
  above,
  below,
  children,
}: PublicPageLayoutProps) {
  const mainRef = useRef<HTMLElement>(null)
  const sideRef = useRef<HTMLDivElement>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [active, setActive] = useState('')

  useEffect(() => {
    const root = mainRef.current
    if (!contents || !root) return

    // Content that loads later (placement results, say) adds its sections after
    // the first scan, so the page is re-scanned whenever its markup changes. The
    // list is only replaced when the headings really differ.
    let signature = ''
    let observer: IntersectionObserver | null = null
    const visible = new Set<string>()

    const scan = () => {
      const items: TocItem[] = []
      const sections: HTMLElement[] = []
      const taken = new Set<string>()
      root.querySelectorAll('h2').forEach((h2) => {
        const section = h2.closest('section')
        if (!section || !root.contains(section)) return
        const label = (h2.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (!label) return
        if (!section.id) {
          const base = slugify(label) || 'section'
          let id = base
          for (let n = 2; document.getElementById(id) || taken.has(id); n += 1) id = `${base}-${n}`
          section.id = id
        }
        taken.add(section.id)
        items.push({ id: section.id, label })
        sections.push(section)
      })
      const next = items.map((item) => `${item.id}|${item.label}`).join('\n')
      if (next === signature) return
      signature = next
      setToc(items)

      // Highlight the section under the header (scroll-spy).
      observer?.disconnect()
      visible.clear()
      if (items.length < 2) return
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target.id)
            else visible.delete(entry.target.id)
          }
          const first = items.find((item) => visible.has(item.id))
          if (first) setActive(first.id)
        },
        { rootMargin: '-96px 0px -55% 0px' },
      )
      sections.forEach((section) => observer?.observe(section))
    }

    scan()
    const mutations = new MutationObserver(scan)
    mutations.observe(root, { childList: true, subtree: true })
    return () => {
      mutations.disconnect()
      observer?.disconnect()
    }
  }, [contents])

  // The left column is pinned and can scroll inside itself on short windows:
  // keep the highlighted contents entry in view as the reader moves down.
  useEffect(() => {
    const side = sideRef.current
    const el = side?.querySelector<HTMLElement>('.hills-page__toc a.is-active')
    if (!side || !el || side.scrollHeight <= side.clientHeight) return
    const s = side.getBoundingClientRect()
    const e = el.getBoundingClientRect()
    if (e.bottom > s.bottom) side.scrollTop += e.bottom - s.bottom + 16
    else if (e.top < s.top) side.scrollTop -= s.top - e.top + 16
  }, [active])

  return (
    <div
      className={`hills hills-open hills-page relative flex-1${wide ? ' hills-page--wide' : ''}${compact ? ' hills-page--compact' : ''}`}
    >
      <PublicAmbientBackground />
      <div className="relative z-10 hills-container hills-page__wrap">
        <div className="hills-split hills-page__grid">
          <div ref={sideRef} className="hills-page__side">
            {above}
            <h1 className="hills-page__title">{title}</h1>
            {intro && <p className="hills-page__intro">{intro}</p>}
            {toc.length > 1 && (
              <nav className="hills-page__toc" aria-label="On this page">
                <p className="hills-page__toc-title">On this page</p>
                <ol>
                  {toc.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className={active === item.id ? 'is-active' : undefined}
                        aria-current={active === item.id ? 'location' : undefined}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            {below}
          </div>
          <main ref={mainRef} className="hills-page__main">
            {surface ? <div className="hills-page__surface">{children}</div> : children}
          </main>
        </div>
      </div>
    </div>
  )
}
