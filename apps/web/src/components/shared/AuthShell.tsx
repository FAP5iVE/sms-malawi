'use client'

/**
 * apps/web/src/components/shared/AuthShell.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The frosted-glass frame shared by the whole sign-in family:
 *   /login, /forgot-password, /change-password and /reset-password. Login's
 *   "wide frosted plate -> inner glass card" recipe was copy-pasted into
 *   forgot-password at a smaller size while change-password and
 *   reset-password used two further, unrelated layouts, so the four pages
 *   didn't look like one product. They now all render through this shell and
 *   therefore always share the same size, glass treatment and background.
 *
 * [SIZING DECISION]: The frame is deliberately NOT stretched to the page's
 *   edges. A sign-in form stretched across a 1920px screen would produce
 *   input fields 1,000px+ wide, which is harder to scan and to aim at, not
 *   easier. Instead the frame is wide (max-w-5xl) and the extra width is put
 *   to work as a two-pane card on desktop:
 *     left pane  = brand (logo + system name) and, optionally, a footer note;
 *     right pane = the page's own form (`children`), capped at a comfortable
 *                  reading width by the half-width column.
 *   Below `lg` it collapses to a single column (brand on top, form beneath,
 *   note last) so phones and tablets get a compact card that fits the
 *   viewport with the frame's own padding trimmed to a few pixels.
 *
 * [DARK-MODE LEGIBILITY]: In dark mode the card is the theme's own
 *   `--background` at 55% alpha rather than 7% white. The vivid artwork's big
 *   rings (bright blue/green/orange) otherwise bleed straight through a
 *   near-clear card and sit directly behind headings and links, where
 *   blue-on-blue headings and the teal "Forgot password?" link were close to
 *   unreadable. The card is still translucent and blurred, so the artwork
 *   still shows through, just dimmed to a level text can sit on.
 *
 * [VERTICAL POSITION]: Top-aligned, as login's revision 3 requested (card
 *   close to the header rather than floating in a large empty gap above).
 *
 * [DEPENDS ON]: PublicAmbientBackground (`vivid`), next-themes (logo variant).
 *   The header bar itself comes from (public)/layout.tsx via <PublicHeader />.
 */

import Image from 'next/image'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import type { ReactNode } from 'react'
import { useHasMounted } from '@/hooks/useHasMounted'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'

/** 5iveStack Labs mark + system name. BVO (dark-on-light) in light mode, WVO
 *  (light-on-dark) in dark mode, so the mark always contrasts with the card. */
function AuthBrand() {
  const { resolvedTheme } = useTheme()
  const mounted = useHasMounted()

  return (
    <div className="flex flex-col items-center text-center">
      <Link href="/" title="Home" className="flex items-center justify-center transition-transform hover:scale-105">
        <Image
          src={
            mounted && resolvedTheme === 'dark'
              ? '/images/5ivestacks-labs-logo-wvo.svg'
              : '/images/5ivestacks-labs-logo-bvo.svg'
          }
          alt="5iveStack Labs logo"
          width={380}
          height={150}
          loading="eager"
          className="h-auto w-52 object-contain drop-shadow-lg sm:w-60 lg:w-72"
        />
      </Link>
      <span className="mt-2.5 font-heading text-sm font-bold tracking-tight text-body sm:text-base">
        SMS Malawi
      </span>
    </div>
  )
}

interface AuthShellProps {
  /** The page's own content, rendered in the form pane (right on desktop). */
  children: ReactNode
  /** Optional note placed under the brand on desktop and after the form on
   *  smaller screens (e.g. login's "Authorised access" notice). */
  footer?: ReactNode
}

export function AuthShell({ children, footer }: AuthShellProps) {
  return (
    <div className="relative flex flex-1 flex-col font-sans">
      <PublicAmbientBackground vivid />

      <main className="relative z-10 flex flex-1 items-start justify-center px-3 pb-6 pt-4 sm:px-6 sm:pb-10 sm:pt-6">
        {/* Wide frosted plate */}
        <div className="w-full max-w-md rounded-[28px] border border-black/5 bg-black/[0.02] p-2.5 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03] sm:max-w-2xl sm:rounded-[36px] sm:p-4 lg:max-w-5xl">
          {/* Glass card, translucent + blurred in BOTH themes. Single column
              by default; from lg it is a 2-column grid whose left column is
              brand (row 1) + footer (row 2) and whose right column spans both
              rows for the form. Source order is brand, form, footer so the
              mobile stack reads in the right order without duplicating any
              markup. */}
          <div className="relative grid gap-y-5 overflow-hidden rounded-[24px] border border-black/5 bg-white/80 p-6 shadow-2xl backdrop-blur-2xl dark:border-white/15 dark:bg-[hsl(var(--background)/0.55)] sm:rounded-[30px] sm:p-8 lg:grid-cols-2 lg:grid-rows-[1fr_auto] lg:gap-y-0 lg:p-0">
            {/* Tinted backing for the desktop brand pane */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 border-r border-black/5 bg-black/[0.03] dark:border-white/10 dark:bg-black/25 lg:block"
              aria-hidden
            />

            <div className="relative lg:col-start-1 lg:row-start-1 lg:flex lg:items-center lg:justify-center lg:px-10 lg:pt-10">
              <AuthBrand />
            </div>

            <div className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex lg:flex-col lg:justify-center lg:p-10">
              {children}
            </div>

            {footer && (
              <div className="relative lg:col-start-1 lg:row-start-2 lg:px-10 lg:pb-10">{footer}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
