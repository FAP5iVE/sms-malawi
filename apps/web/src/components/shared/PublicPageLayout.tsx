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
 *   inside a <section>. A section without an id gets one from its heading, so
 *   the footer links that already point at ids (#curriculum, #fees, ...) keep
 *   working. Fewer than two headings = no list. Nothing here touches page data.
 * [BACKGROUND]: renders <PublicAmbientBackground /> itself and switches the
 *   interim readability scrim off (`hills-open`); pages must not render their own.
 * [NO LOGIC]: presentational. No data, no routing, no form handling.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'

interface PublicPageLayoutProps {
  title: string
  intro?: ReactNode
  wide?: boolean
  surface?: boolean
  contents?: boolean
  children: ReactNode
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
  children,
}: PublicPageLayoutProps) {
  const mainRef = useRef<HTMLElement>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [active, setActive] = useState('')

  useEffect(() => {
    const root = mainRef.current
    if (!contents || !root) return

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
    setToc(items)
    if (items.length < 2) return

    // Highlight the section under the header (scroll-spy).
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
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
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [contents])

  return (
    <div className={`hills hills-open hills-page relative flex-1${wide ? ' hills-page--wide' : ''}`}>
      <PublicAmbientBackground />
      <div className="relative z-10 hills-container hills-page__wrap">
        <div className="hills-split hills-page__grid">
          <div className="hills-page__side">
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
          </div>
          <main ref={mainRef} className="hills-page__main">
            {surface ? <div className="hills-page__surface">{children}</div> : children}
          </main>
        </div>
      </div>
    </div>
  )
}
