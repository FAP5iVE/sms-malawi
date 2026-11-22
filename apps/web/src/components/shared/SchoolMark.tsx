/**
 * apps/web/src/components/shared/SchoolMark.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, logo step)
 * [PURPOSE]: The one place that draws the school's own artwork (the Chikangawa
 *   Hills Academy crest), replacing the old "5 LABS" placeholder that used to be
 *   read from /favicon.png.
 *
 *   kind="emblem"  the round mark without lettering (headers, sidebar, footers)
 *   kind="logo"    the full crest with the school name (login, large areas)
 *
 *   tone="auto"     both versions are rendered and CSS shows the right one for
 *                   the site's own Light/Dark toggle (`.dark` class), so there
 *                   is no flash and no script. This is the default.
 *   tone="onDark"   always the light artwork, for surfaces that are dark in both
 *                   themes (the landing hero photo, the footer).
 *   tone="onLight"  always the navy artwork.
 *
 * Files (public/): emblem-light.svg, emblem-dark.svg, logo-light.svg,
 *   logo-dark.svg. "light" means navy artwork for light pages, "dark" means
 *   light artwork for dark pages (the same naming as the supplied logo pack).
 *   logo-adaptive.svg and favicon-adaptive.svg follow the visitor's OS theme
 *   instead and are meant for places the site toggle cannot reach (browser tab
 *   icon, shared links).
 *
 * Decorative by default (alt=""); pass `alt` where the mark stands alone.
 */

import Image from 'next/image'
import { cn } from '@/lib/utils'

interface SchoolMarkProps {
  kind?: 'emblem' | 'logo'
  tone?: 'auto' | 'onDark' | 'onLight'
  width: number
  height: number
  className?: string
  priority?: boolean
  alt?: string
}

export function SchoolMark({
  kind = 'emblem',
  tone = 'auto',
  width,
  height,
  className,
  priority = false,
  alt = '',
}: SchoolMarkProps) {
  const onLightSrc = `/${kind}-light.svg`
  const onDarkSrc = `/${kind}-dark.svg`

  if (tone === 'onDark') {
    return <Image src={onDarkSrc} alt={alt} width={width} height={height} priority={priority} className={className} />
  }
  if (tone === 'onLight') {
    return <Image src={onLightSrc} alt={alt} width={width} height={height} priority={priority} className={className} />
  }
  return (
    <>
      <Image src={onLightSrc} alt={alt} width={width} height={height} priority={priority} className={cn(className, 'dark:hidden')} />
      <Image
        src={onDarkSrc}
        alt=""
        aria-hidden
        width={width}
        height={height}
        priority={priority}
        className={cn(className, 'hidden dark:block')}
      />
    </>
  )
}
