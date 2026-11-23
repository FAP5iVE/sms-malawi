import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import { AlertCircle, ArrowRight, Eye, ShieldCheck } from 'lucide-react'

import '@/app/globals.css'
import { AuthShell } from '@/components/shared/AuthShell'
import { AuthShellSkeleton } from '@/components/shared/AuthShellSkeleton'

/**
 * Chikangawa Hills theme, Phase 3 review pack.
 *
 * The sign-in family frame (`AuthShell`): crest, time-aware headline and the
 * authorised-access notice on the sky; the form on a surface. These stories use a
 * static copy of the login card's markup and classes, because the real page signs
 * in through Firebase. Use the `sky` and `theme` controls, or in the browser:
 *   document.documentElement.dataset.sky = 'dusk'
 *   document.documentElement.classList.toggle('dark')
 *
 * Stories:
 *  - SignIn              the default login look
 *  - SigningIn           submit button disabled: skeleton scene replaces the headline
 *  - WithError           alert shown, button enabled again
 *  - ClaimInterim        a form still styled the old way (Phase 7), inside the new card
 *  - LoadingFallback     the Suspense skeleton for /login
 */

type Sky = 'dawn' | 'day' | 'dusk' | 'night'
interface Args {
  sky: Sky
  theme: 'light' | 'dark'
}

function SkyAndTheme({ sky, theme }: Args) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.sky = sky
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
  }, [sky, theme])
  return null
}

function LoginCard({ busy = false, error }: { busy?: boolean; error?: string }) {
  return (
    <>
      <div className="mb-6 text-left">
        <h1 className="hills-auth__title">Sign in</h1>
        <p className="hills-auth__lede">Use the email your school registered for you.</p>
      </div>
      {error && (
        <div role="alert" className="hills-alert hills-alert--danger">
          <AlertCircle aria-hidden />
          <span>{error}</span>
        </div>
      )}
      <form className="text-left" onSubmit={(e) => e.preventDefault()}>
        <div className="hills-field">
          <div className="hills-field__row">
            <label htmlFor="email" className="hills-label">Email address</label>
          </div>
          <div className="hills-input">
            <input id="email" type="email" autoComplete="email" placeholder="you@school.edu.mw" />
          </div>
        </div>
        <div className="hills-field">
          <div className="hills-field__row">
            <label htmlFor="password" className="hills-label">Password</label>
            <a href="#" className="hills-link">Forgot password?</a>
          </div>
          <div className="hills-input">
            <input id="password" type="password" autoComplete="current-password" placeholder="••••••••" className="hills-pw" />
            <button type="button" className="hills-eye" aria-label="Show password"><Eye aria-hidden /></button>
          </div>
        </div>
        <button type="submit" disabled={busy} className="hills-go">
          <span>{busy ? 'Signing in…' : 'Sign in'}</span>
          <ArrowRight className="hills-go__arrow" aria-hidden />
        </button>
      </form>
      <p className="hills-alt">
        <span>Ready to apply?</span>
        <a href="#" className="hills-link">Start your application</a>
      </p>
    </>
  )
}

const notice = (
  <>
    <ShieldCheck aria-hidden />
    <div>
      <p className="hills-auth__notice-title">Authorised access</p>
      <p>Sign in is for authorised students and staff only.</p>
      <p>Contact your school administrator if you need access.</p>
    </div>
  </>
)

function Page({ sky, theme, children }: Args & { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <SkyAndTheme sky={sky} theme={theme} />
      {children}
    </div>
  )
}

const meta: Meta<Args> = {
  title: 'Hills/Auth shell',
  parameters: { layout: 'fullscreen' },
  args: { sky: 'day', theme: 'light' },
  argTypes: {
    sky: { control: 'inline-radio', options: ['dawn', 'day', 'dusk', 'night'] },
    theme: { control: 'inline-radio', options: ['light', 'dark'] },
  },
}
export default meta
type Story = StoryObj<Args>

export const SignIn: Story = {
  render: (a) => (
    <Page {...a}>
      <AuthShell skeletonOnBusy footer={notice}><LoginCard /></AuthShell>
    </Page>
  ),
}

export const SigningIn: Story = {
  render: (a) => (
    <Page {...a}>
      <AuthShell skeletonOnBusy footer={notice}><LoginCard busy /></AuthShell>
    </Page>
  ),
}

export const WithError: Story = {
  render: (a) => (
    <Page {...a}>
      <AuthShell skeletonOnBusy footer={notice}>
        <LoginCard error="Incorrect email or password. Please try again." />
      </AuthShell>
    </Page>
  ),
}

/** A page that has not moved yet (Phase 7): old field styling inside the new card. */
export const ClaimInterim: Story = {
  render: (a) => (
    <Page {...a}>
      <AuthShell>
        <h1 className="text-xl font-extrabold text-brand-navy dark:text-white">Set up your parent account</h1>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">Enter the code the school gave you, then choose how you will sign in.</p>
        <label htmlFor="code" className="mb-1 block text-sm font-medium">Invitation code</label>
        <input id="code" className="mb-3 w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm" placeholder="ABCDEF-GHJKMN-PQRSTU" />
        <label htmlFor="mail" className="mb-1 block text-sm font-medium">Email address</label>
        <input id="mail" className="mb-4 w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm" placeholder="you@example.com" />
        <button type="button" className="w-full rounded-xl bg-brand-navy px-4 py-3 text-sm font-semibold text-white dark:bg-brand-blue">Create account</button>
      </AuthShell>
    </Page>
  ),
}

export const LoadingFallback: Story = {
  render: (a) => (
    <Page {...a}>
      <AuthShellSkeleton />
    </Page>
  ),
}
