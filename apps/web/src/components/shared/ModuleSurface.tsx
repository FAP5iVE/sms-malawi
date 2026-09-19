'use client'

/**
 * apps/web/src/components/shared/ModuleSurface.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The "darker panel" background every module's tab strip +
 *   tab content sits inside — requested as "a standard truth design for
 *   all the backgrounds in this system," modelled on how Exams already
 *   looks. Renders a bordered, elevated `bg-surface` panel (the same
 *   token Exams' own metric cards already use) with a faint decorative
 *   line-art pattern behind the content, matching the ambient artwork
 *   style already established by PublicAmbientBackground.tsx but scaled
 *   down, contained, and much lower-opacity so it reads as texture behind
 *   a panel rather than a full-page backdrop.
 *
 *   Deliberately NOT a change to ModuleTabs' `pill` variant — that
 *   variant was already tried for this "darker tab" look and removed
 *   from Exams for a documented reason (see exams/page.tsx's own
 *   [PRODUCTION FIX] comment: the pill's filled background painted white
 *   text on a white page in light mode). This component is a page-level
 *   wrapper around the tab strip + content, not a tab-strip style, so it
 *   doesn't reintroduce that bug — `variant="underline"`/`"pill"` choices
 *   on the ModuleTabs inside are untouched.
 *
 * [USAGE]: Wrap a module page's <ModuleTabs /> + its active-tab content
 *   (everything below the page's H1 header/top controls) in
 *   <ModuleSurface>...</ModuleSurface>. Do not wrap the H1 header itself
 *   or page-level primary actions that sit above the tabs — those stay
 *   outside, matching Exams' own header placement. Not used on
 *   /dashboard (excluded by request).
 * [DEPENDS ON]: none (pure presentational shell)
 */

import type { ReactNode } from 'react'

interface ModuleSurfaceProps {
  children: ReactNode
  className?: string
  /**
   * Class list for the inner content wrapper (the `relative z-10` div
   * around `children`). Defaults to `space-y-5` — every page this wraps
   * stacks a tab strip plus one or more content blocks, so vertical
   * rhythm between them is the sane default rather than something every
   * call site has to repeat. Override when a page needs different
   * spacing (or none) between its direct children.
   */
  contentClassName?: string
}

export function ModuleSurface({ children, className = '', contentClassName = 'space-y-5' }: ModuleSurfaceProps) {
  return (
    <div className={`relative rounded-3xl border border-base bg-surface p-4 sm:p-6 ${className}`}>
      {/* Decorative line-art — same family as PublicAmbientBackground's
          artwork, redrawn small enough to sit inside a panel rather than
          behind a whole page. Muted opacity in both modes so it reads as
          texture, never competes with foreground text/numbers.

          [SAFETY] This layer — and its `overflow-hidden` clip — lives in
          its own sibling div, never as an ancestor of `children`. A module
          page can render a modal/dialog inside its tab content; if
          `overflow-hidden` sat on the div wrapping `children` instead, an
          `absolute`-positioned modal anchored to a non-`fixed` ancestor
          could get silently clipped. Keeping the clip confined to a
          sibling that contains only decoration removes that risk
          entirely, regardless of how any given page's modals position
          themselves. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
        <svg
          className="absolute -right-10 -top-10 h-64 w-64 opacity-[0.05] dark:opacity-[0.08]"
          viewBox="0 0 400 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="260" cy="140" r="120" stroke="var(--color-brand-teal)" strokeWidth="26" />
          <path
            d="M 40 260 C 40 210 85 175 135 175 C 185 175 220 210 220 260 C 220 310 180 345 130 345"
            stroke="var(--color-brand-navy)"
            strokeWidth="22"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="90" cy="90" r="34" stroke="var(--color-brand-amber)" strokeWidth="18" />
        </svg>
        <svg
          className="absolute -bottom-16 -left-16 h-56 w-56 opacity-[0.05] dark:opacity-[0.08]"
          viewBox="0 0 400 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M 30 200 C 30 120 100 60 190 60 C 280 60 350 120 350 200"
            stroke="var(--color-brand-purple)"
            strokeWidth="24"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="330" cy="300" r="46" stroke="var(--color-brand-coral)" strokeWidth="20" />
        </svg>
      </div>

      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </div>
  )
}
