/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/passwordResetRequest.ts
 * [PURPOSE]: Client side of "email me a password reset link". Asks the server
 *   (POST /public/password-reset) to send a link to the app's own /reset-password
 *   page. Only if the server says it could not send (`delivered: false`, for example
 *   the e-mail service is down) does it fall back to Firebase's own reset email, so a
 *   person is never left without a way to reset. Unknown addresses look like sent ones.
 *   Used by /forgot-password and Settings > Profile.
 * [DEPENDS ON]: @/lib/api-client, @/lib/firebase, firebase/auth
 */
import { sendPasswordResetEmail } from 'firebase/auth'
import { apiFetch } from '@/lib/api-client'
import { auth } from '@/lib/firebase'

export async function requestPasswordResetEmail(email: string): Promise<void> {
  const res = await apiFetch<{ ok: boolean; delivered: boolean }>('/public/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
  if (res.delivered || !auth) return
  try {
    await sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/reset-password`,
      handleCodeInApp: true,
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') return
    throw err
  }
}
