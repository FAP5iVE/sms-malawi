'use client'

/**
 * apps/web/src/components/shared/CookieNotice.tsx
 *
 * [PURPOSE]: A small, non-blocking cookie notice for the public site.
 *
 * [WHY IT IS A NOTICE AND NOT AN ACCEPT/REJECT FORM]: The Privacy Policy
 *   (section "Cookies") states the site uses only strictly necessary
 *   cookies, such as the one that keeps a user signed in. Consent is not the
 *   lawful basis for those, so a consent form with a "reject" switch would
 *   not control anything. This notice tells visitors what is set and links
 *   to the policy. If non-essential cookies (advertising, third-party
 *   analytics) are ever added, replace this with a real consent manager that
 *   blocks those scripts until the visitor opts in.
 *
 * Dismissal is remembered in localStorage; every read and write is wrapped
 * because storage can be blocked (private windows, strict browser settings).
 */

import { useSyncExternalStore } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'sms_cookie_notice_dismissed'

// [HYDRATION FIX 2026-10-08]: This used to read localStorage inside a useState
// initializer, so the server rendered nothing while the browser's first render
// (on a first visit) rendered the notice, React flagged a hydration mismatch
// on every first visit to every public page and threw away the server HTML.
// useSyncExternalStore is React's tool for exactly this: during hydration it
// uses getServerSnapshot (treated as "already dismissed", so nothing renders,
// matching the server), then immediately re-renders with the real stored
// value. No mismatch, no setState-in-an-effect.
//
// `dismissedInMemory` covers blocked storage: setItem throws, so the choice is
// kept for this page session only and the notice returns next visit, as before.
let dismissedInMemory = false
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getDismissed(): boolean {
  if (dismissedInMemory) return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Server render + hydration: pretend it's dismissed so both sides render null.
const getServerDismissed = () => true

export function CookieNotice() {
  const dismissed = useSyncExternalStore(subscribe, getDismissed, getServerDismissed)

  if (dismissed) return null

  function dismiss() {
    dismissedInMemory = true
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* storage blocked: the notice simply returns next visit */
    }
    listeners.forEach((notify) => notify())
  }

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-4 bottom-4 z-[60] sm:left-6 sm:right-auto sm:max-w-sm rounded-xl border border-base bg-surface p-4 shadow-lg"
    >
      <p className="text-[13.5px] leading-relaxed text-body">
        This site uses only essential cookies, such as the one that keeps you signed in to the
        portal. We do not use advertising or tracking cookies.{' '}
        <Link
          href="/privacy#your-choices"
          className="text-brand-teal underline underline-offset-2 hover:no-underline"
        >
          Read the privacy policy
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="mt-3 min-h-11 rounded-xl bg-brand-deep px-5 font-heading text-[13px] font-bold text-white transition-colors hover:brightness-125"
      >
        Got it
      </button>
    </div>
  )
}
