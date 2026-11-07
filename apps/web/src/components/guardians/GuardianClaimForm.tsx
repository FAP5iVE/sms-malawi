/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianClaimForm.tsx
 * [PHASE]: Guardian Portal — claim UI (T7b)
 * [PURPOSE]: The public form where an invited guardian turns a one-time code into an account.
 *   Rendered by the login page when the URL carries ?claim=1 (the invitation e-mail links there).
 *
 *   Deliberately plain about failure: the server answers every bad-code case identically so a
 *   stranger learns nothing, and this form shows that answer as given rather than guessing why.
 *   A printed-slip guardian also gives their child's date of birth; an e-mailed one leaves it
 *   blank and must use the address the invitation was sent to.
 *
 *   Success does not sign the guardian in. They sign in on the normal page, which routes a
 *   parent to /parent like any other role.
 * [DEPENDS ON]: @/lib/api-client (apiFetch), @shared/constants/guardianPortal (validateClaimForm)
 */
'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { validateClaimForm, type ClaimFormErrors, type ClaimFormValues } from '@shared/constants/guardianPortal'
import { apiFetch } from '@/lib/api-client'
import { AuthShell } from '@/components/shared/AuthShell'

const FIELD =
  'w-full px-3.5 py-2.5 sm:py-3 bg-page text-body placeholder:text-muted-foreground rounded-xl text-sm font-sans border border-base ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all'
const LABEL = 'block text-xs sm:text-sm font-heading font-medium text-body mb-1.5'

const EMPTY: ClaimFormValues = { code: '', email: '', password: '', confirm: '', childDateOfBirth: '' }

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function GuardianClaimForm() {
  const [values, setValues] = useState<ClaimFormValues>(EMPTY)
  const [showErrors, setShowErrors] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const errors: ClaimFormErrors = showErrors ? validateClaimForm(values) : {}
  const set = (k: keyof ClaimFormValues) => (v: string) => setValues((prev) => ({ ...prev, [k]: v }))

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setServerError(null)
    if (Object.keys(validateClaimForm(values)).length > 0) { setShowErrors(true); return }
    setBusy(true)
    try {
      await apiFetch<{ ok: true }>('/guardian-claim', {
        method: 'POST',
        body: JSON.stringify({
          code: values.code.trim(),
          email: values.email.trim(),
          password: values.password,
          ...(values.childDateOfBirth ? { childDateOfBirth: values.childDateOfBirth } : {}),
        }),
      })
      setValues(EMPTY)
      setDone(true)
    } catch (err) {
      // The server's own wording is already safe to show and already carries any retry hint.
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-left space-y-4" role="status">
          <CheckCircle2 className="w-10 h-10 text-status-success" aria-hidden />
          <h1 className="text-2xl font-heading font-bold text-body tracking-tight">Your account is ready</h1>
          <p className="text-sm text-muted-foreground dark:text-foreground">
            Sign in with the email address and password you just chose to see your child’s information.
          </p>
          <Link
            href="/login"
            className="w-full py-3 bg-brand-deep hover:brightness-125 text-white font-heading font-semibold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            Go to sign in<ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>
      </AuthShell>
    )
  }

  const field = (id: keyof ClaimFormValues) => ({
    'aria-invalid': errors[id] ? true : undefined,
    'aria-describedby': errors[id] ? `claim-${id}-err` : undefined,
  })
  const fieldError = (id: keyof ClaimFormValues) =>
    errors[id] ? <p id={`claim-${id}-err`} role="alert" className="text-xs text-brand-coral mt-1">{errors[id]}</p> : null

  return (
    <AuthShell>
      <div className="mb-4 text-left">
        <h1 className="text-2xl sm:text-[26px] font-heading font-bold text-body tracking-tight">Set up your parent account</h1>
        <p className="text-muted-foreground dark:text-foreground text-sm mt-1">
          Enter the code the school gave you, then choose how you will sign in.
        </p>
      </div>

      {serverError && (
        <div role="alert" className="mb-4 p-3 rounded-xl bg-brand-coral/10 border border-brand-coral/30 text-brand-coral text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-4 text-left">
        <div>
          <label htmlFor="claim-code" className={LABEL}>Invitation code</label>
          <input
            id="claim-code" value={values.code} onChange={(e) => set('code')(e.target.value)} {...field('code')}
            autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCDEF-GHJKMN-PQRSTU"
            className={`${FIELD} font-mono tracking-wider`}
          />
          {fieldError('code')}
        </div>

        <div>
          <label htmlFor="claim-email" className={LABEL}>Email address</label>
          <input
            id="claim-email" type="email" autoComplete="email" value={values.email} onChange={(e) => set('email')(e.target.value)} {...field('email')}
            placeholder="you@example.com" className={FIELD}
          />
          <p className="text-xs text-muted mt-1">If the code came by email, use that same address.</p>
          {fieldError('email')}
        </div>

        <div>
          <label htmlFor="claim-password" className={LABEL}>Choose a password</label>
          <div className="relative">
            <input
              id="claim-password" type={showPass ? 'text' : 'password'} autoComplete="new-password"
              value={values.password} onChange={(e) => set('password')(e.target.value)} {...field('password')}
              className={`${FIELD} pr-11`}
            />
            <button
              type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-foreground focus:outline-none cursor-pointer"
            >
              {showPass ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
            </button>
          </div>
          {fieldError('password')}
        </div>

        <div>
          <label htmlFor="claim-confirm" className={LABEL}>Type the password again</label>
          <input
            id="claim-confirm" type={showPass ? 'text' : 'password'} autoComplete="new-password"
            value={values.confirm} onChange={(e) => set('confirm')(e.target.value)} {...field('confirm')} className={FIELD}
          />
          {fieldError('confirm')}
        </div>

        <div>
          <label htmlFor="claim-dob" className={LABEL}>Your child’s date of birth <span className="font-normal text-muted">(printed slip only)</span></label>
          <input
            id="claim-dob" type="date" max={today()} value={values.childDateOfBirth} onChange={(e) => set('childDateOfBirth')(e.target.value)}
            {...field('childDateOfBirth')} className={FIELD}
          />
          <p className="text-xs text-muted mt-1">Only needed if you were handed a printed slip. Leave it empty if the code came by email.</p>
          {fieldError('childDateOfBirth')}
        </div>

        <button
          type="submit" disabled={busy}
          className="w-full py-3 bg-brand-deep hover:brightness-125 active:brightness-90 text-white font-heading font-semibold text-sm rounded-xl transition-all shadow-md mt-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-muted-foreground dark:text-foreground">
        Already set up?{' '}
        <Link href="/login" className="font-bold text-brand-teal hover:text-brand-teal-light underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  )
}
