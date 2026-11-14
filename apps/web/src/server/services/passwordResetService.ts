/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/passwordResetService.ts
 * [PURPOSE]: Password-reset emails that open the app's own /reset-password page.
 *
 *   Why: Firebase's own reset email (sendPasswordResetEmail on the client, and
 *   generatePasswordResetLink's raw output) always points at Firebase's hosted
 *   action page (*.firebaseapp.com/__/auth/action), a plain unstyled page. The
 *   `continueUrl` / handleCodeInApp settings do not change where the link opens.
 *   So we ask the Admin SDK for the one-time code, keep only the `oobCode`, and
 *   email a link to our own page with Resend, using the school's email template.
 *   The page (reset-password/page.tsx) already verifies and confirms the code with
 *   the Firebase client SDK, so no Firebase setting has to change.
 *
 *   requestPasswordReset() is for the public "forgot password" form. It never says
 *   whether an address has an account: an unknown (or disabled) address looks the
 *   same as a sent one. `delivered: false` is returned only when the email
 *   service itself could not send, so the page can fall back to Firebase's own email.
 * [DEPENDS ON]: firebase-admin, lib/email, templates/emails/password-reset,
 *   notificationService.getSchoolBranding
 */
import * as admin from 'firebase-admin'
import { logger } from '@/lib/logger'
import { sendEmail } from '@/lib/email'
import { getSchoolBranding } from '@/server/services/notificationService'
import { renderPasswordReset } from '@/server/templates/emails/password-reset'

const FALLBACK_APP_URL = 'https://sms-malawi.vercel.app'

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? FALLBACK_APP_URL).replace(/\/+$/, '')
}

/**
 * A link to the app's own reset page for this address. Throws when Firebase has no
 * such user or cannot make a code (callers decide how much to reveal).
 */
export async function buildInAppResetLink(email: string): Promise<string> {
  const firebaseLink = await admin.auth().generatePasswordResetLink(email)
  const code = new URL(firebaseLink).searchParams.get('oobCode')
  if (!code) throw new Error('Firebase did not return a reset code.')
  return `${appBaseUrl()}/reset-password?oobCode=${encodeURIComponent(code)}`
}

/** Sends the reset email for a known account. Returns whether Resend accepted it. */
export async function sendResetEmail(email: string, name?: string | null): Promise<boolean> {
  const resetUrl = await buildInAppResetLink(email)
  const school = await getSchoolBranding()
  const result = await sendEmail({
    to: email,
    ...renderPasswordReset({ name, resetUrl }, school),
    tags: [{ name: 'type', value: 'password-reset' }],
  })
  if (!result.ok) {
    logger.warn({ email, reason: result.error }, '[passwordResetService] reset email failed to send')
  }
  return result.ok
}

/**
 * Public "forgot password". Same answer for known and unknown addresses; `delivered`
 * is false only when a real account exists and the email could not be sent.
 */
export async function requestPasswordReset(email: string): Promise<{ delivered: boolean }> {
  let user: admin.auth.UserRecord
  try {
    user = await admin.auth().getUserByEmail(email)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code !== 'auth/user-not-found') {
      logger.error({ err }, '[passwordResetService] user lookup failed')
      return { delivered: false }
    }
    return { delivered: true } // unknown address: look the same as a sent one
  }
  if (user.disabled) return { delivered: true } // no reset for a disabled account; say nothing

  try {
    return { delivered: await sendResetEmail(email, user.displayName) }
  } catch (err) {
    logger.error({ err, uid: user.uid }, '[passwordResetService] could not build or send the reset email')
    return { delivered: false }
  }
}
