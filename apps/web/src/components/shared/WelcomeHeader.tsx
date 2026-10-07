'use client'

/**
 * apps/web/src/components/shared/WelcomeHeader.tsx
 *
 * [PURPOSE]: The greeting block at the top of the dashboard: a profile
 *   picture on the left, then the time-of-day greeting with the user's name,
 *   then their job title and role underneath.
 *
 * [PICTURE]: The male or female illustration according to the signed-in
 *   user's recorded sex (Student.sex for students, StaffProfile.sex for
 *   staff, via useMySex / GET /users/me/sex). When none is recorded (an
 *   account with no linked record, or staff whose sex HR has not entered
 *   yet) a neutral initials badge is shown instead of a guessed picture.
 *
 * [SIZE]: The picture is a square whose side equals the height of the text
 *   block beside it, so it runs from the top of the greeting to the bottom of
 *   the title and keeps its proportions (never stretched or squashed). It is
 *   measured with a ResizeObserver, so it also follows the text when a long
 *   name or title wraps on a phone. Clamped to MIN..MAX to stay sensible.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { useMySex } from '@/hooks/useMySex'

const MIN_SIZE = 44
const MAX_SIZE = 88
const FIRST_PAINT_SIZE = 56 // text height at the default type scale

type Sex = 'MALE' | 'FEMALE'

const PICTURES: Record<Sex, string> = {
  MALE: '/images/avatars/profile-male.svg',
  FEMALE: '/images/avatars/profile-female.svg',
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

interface WelcomeHeaderProps {
  greeting: string
  name: string
  /** The line under the greeting (job title and role). */
  detail: React.ReactNode
}

export function WelcomeHeader({ greeting, name, detail }: WelcomeHeaderProps) {
  const textRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(FIRST_PAINT_SIZE)

  const mySex = useMySex()
  const sex: Sex | null = mySex.data === 'MALE' || mySex.data === 'FEMALE' ? mySex.data : null

  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height)
      if (h > 0) setSize(Math.min(MAX_SIZE, Math.max(MIN_SIZE, h)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div
        // The avatar is sized from the text block's height (JS, below). On a phone a
        // two-line greeting made it ~88px — a quarter of the viewport width for
        // decoration. max-w/max-h clamp it to 48px below `sm`; no effect at sm+.
        className="shrink-0 overflow-hidden rounded-full bg-[#e4e9f7] max-w-12 max-h-12 sm:max-w-none sm:max-h-none"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {sex ? (
          // eslint-disable-next-line @next/next/no-img-element -- local SVG, next/image does not optimise SVG
          <img src={PICTURES[sex]} alt="" width={size} height={size} className="block h-full w-full" />
        ) : mySex.isLoading ? (
          <div className="h-full w-full animate-pulse bg-black/5 dark:bg-black/10" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-brand-deep font-heading font-bold text-white"
            style={{ fontSize: Math.round(size * 0.36) }}
          >
            {initialsOf(name)}
          </div>
        )}
      </div>

      <div ref={textRef} className="min-w-0">
        <h1 className="font-heading text-2xl font-bold text-brand-navy">
          {greeting}, {name}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{detail}</p>
      </div>
    </div>
  )
}
