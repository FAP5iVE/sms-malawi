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
 *
 * [REVISION (2026-11-13), Hills theme Phase 7]: Class names and markup only. Fields, hints, errors,
 *   the alert, the button and the success screen use the sign-in card's pieces (.hills-field,
 *   .hills-input, .hills-go, .hills-alert, .hills-hint, .hills-field-err, .hills-status). The inline
 *   spinner is gone (same busy sweep as sign-in). Ids, aria-invalid / aria-describedby wiring, types,
 *   autocomplete, labels, hint wording, button text, links and the submit logic are unchanged.
 */
'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { validateClaimForm, type ClaimFormErrors, type ClaimFormValues } from '@shared/constants/guardianPortal'
import { apiFetch } from '@/lib/api-client'
import { AuthShell } from '@/components/shared/AuthShell'

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
        <div className="hills-status" role="status">
          <div className="hills-status__icon hills-status__icon--ok">
            <CheckCircle2 aria-hidden />
          </div>
          <h1 className="hills-auth__title">Your account is ready</h1>
          <p className="hills-auth__lede">
            Sign in with the email address and password you just chose to see your child’s information.
          </p>
          <Link href="/login" className="hills-go hills-go--link">
            Go to sign in<ArrowRight className="hills-go__arrow" aria-hidden />
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
    errors[id] ? <p id={`claim-${id}-err`} role="alert" className="hills-field-err">{errors[id]}</p> : null

  return (
    <AuthShell>
      <div className="mb-6 text-left">
        <h1 className="hills-auth__title">Set up your parent account</h1>
        <p className="hills-auth__lede">
          Enter the code the school gave you, then choose how you will sign in.
        </p>
      </div>

      {serverError && (
        <div role="alert" className="hills-alert hills-alert--danger">
          <AlertCircle aria-hidden />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={submit} noValidate className="text-left">
        <div className="hills-field">
          <div className="hills-field__row">
            <label htmlFor="claim-code" className="hills-label">Invitation code</label>
          </div>
          <div className="hills-input">
            <input
              id="claim-code" value={values.code} onChange={(e) => set('code')(e.target.value)} {...field('code')}
              autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCDEF-GHJKMN-PQRSTU"
              className="hills-mono"
            />
          </div>
          {fieldError('code')}
        </div>

        <div className="hills-field">
          <div className="hills-field__row">
            <label htmlFor="claim-email" className="hills-label">Email address</label>
          </div>
          <div className="hills-input">
            <input
              id="claim-email" type="email" autoComplete="email" value={values.email} onChange={(e) => set('email')(e.target.value)} {...field('email')}
              placeholder="you@example.com"
            />
          </div>
          <p className="hills-hint">If the code came by email, use that same address.</p>
          {fieldError('email')}
        </div>

        <div className="hills-field">
          <div className="hills-field__row">
            <label htmlFor="claim-password" className="hills-label">Choose a password</label>
          </div>
          <div className="hills-input">
            <input
              id="claim-password" type={showPass ? 'text' : 'password'} autoComplete="new-password"
              value={values.password} onChange={(e) => set('password')(e.target.value)} {...field('password')}
              className="hills-pw"
            />
            <button
              type="button" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}
              className="hills-eye"
            >
              {showPass ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </button>
          </div>
          {fieldError('password')}
        </div>

        <div className="hills-field">
          <div className="hills-field__row">
            <label htmlFor="claim-confirm" className="hills-label">Type the password again</label>
          </div>
          <div className="hills-input">
            <input
              id="claim-confirm" type={showPass ? 'text' : 'password'} autoComplete="new-password"
              value={values.confirm} onChange={(e) => set('confirm')(e.target.value)} {...field('confirm')}
            />
          </div>
          {fieldError('confirm')}
        </div>

        <div className="hills-field">
          <div className="hills-field__row">
            <label htmlFor="claim-dob" className="hills-label">Your child’s date of birth <small>(printed slip only)</small></label>
          </div>
          <div className="hills-input">
            <input
              id="claim-dob" type="date" max={today()} value={values.childDateOfBirth} onChange={(e) => set('childDateOfBirth')(e.target.value)}
              {...field('childDateOfBirth')}
            />
          </div>
          <p className="hills-hint">Only needed if you were handed a printed slip. Leave it empty if the code came by email.</p>
          {fieldError('childDateOfBirth')}
        </div>

        <button type="submit" disabled={busy} className="hills-go">
          <span>{busy ? 'Creating your account…' : 'Create account'}</span>
          <ArrowRight className="hills-go__arrow" aria-hidden />
        </button>
      </form>

      <p className="hills-alt">
        <span>Already set up?</span>
        <Link href="/login" className="hills-link">Sign in</Link>
      </p>
    </AuthShell>
  )
}
