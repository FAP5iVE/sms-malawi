'use client'

/**
 * apps/web/src/components/motion/Reveal.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 4b: home polish)
 * [PURPOSE]: Fade and rise once as the element scrolls into view.
 *
 *   The server renders the element visible. After hydration, an element that
 *   starts below the fold is hidden (data-reveal="hidden") and shown
 *   (data-reveal="shown") when it enters the viewport; elements already on
 *   screen are never touched, so nothing flashes. Nothing is hidden when the
 *   visitor prefers reduced motion or the app's motion setting is off.
 *   The look (distance, duration, easing) is in globals.css under "HILLS MOTION".
 *
 *   Renders the element given by `as` (default div) and passes every other prop
 *   through, so it can stand in for the element it wraps (article, li, Link).
 */

import { useEffect, useRef, type ComponentPropsWithoutRef, type CSSProperties, type ElementType } from 'react'
import { useMotionEnabled } from '@/store/motionStore'
import { revealPlan } from '@/lib/hills/motion'

type RevealProps<T extends ElementType> = {
  as?: T
  /** Extra delay in ms for lists (use staggerDelay(index)). */
  delay?: number
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'delay'>

export function Reveal<T extends ElementType = 'div'>({ as, delay = 0, style, ...rest }: RevealProps<T>) {
  const Tag: ElementType = as ?? 'div'
  const ref = useRef<HTMLElement | null>(null)
  const motionEnabled = useMotionEnabled()

  useEffect(() => {
    const el = ref.current
    if (!el || el.dataset.reveal === 'shown') return undefined
    const plan = revealPlan({
      top: el.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      motionEnabled,
      prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    if (plan === 'skip') return undefined

    el.dataset.reveal = 'hidden'
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.dataset.reveal = 'shown'
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      // Never leave an element hidden if the effect re-runs (for example the
      // motion setting is switched off while it is waiting).
      if (el.dataset.reveal === 'hidden') delete el.dataset.reveal
    }
  }, [motionEnabled])

  const merged = delay ? ({ ...(style as CSSProperties | undefined), '--reveal-delay': `${delay}ms` } as CSSProperties) : style
  return <Tag ref={ref} style={merged} {...rest} />
}
