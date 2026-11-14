/**
 * passwordResetService.test.ts
 * [CHANGE TYPE]: NEW FILE
 * Pins the password-reset email behaviour:
 *   - the emailed link opens the APP's /reset-password page (never Firebase's hosted page)
 *     and carries only the one-time code;
 *   - the public request never reveals whether an address has an account;
 *   - `delivered: false` appears only when a real account exists and sending failed.
 * Firebase Admin, the mailer and school branding are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserByEmail = vi.fn()
const generatePasswordResetLink = vi.fn()
vi.mock('firebase-admin', () => ({
  auth: () => ({ getUserByEmail, generatePasswordResetLink }),
}))
const sendEmail = vi.fn()
vi.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/server/services/notificationService', () => ({
  getSchoolBranding: async () => ({
    schoolName: 'Test School', schoolAddress: 'Lilongwe', schoolEmail: 'office@test.mw', schoolPhone: '', loginUrl: 'https://app.test',
  }),
}))

import { renderPasswordReset } from '../../templates/emails/password-reset'
import { buildInAppResetLink, requestPasswordReset, sendResetEmail } from '../passwordResetService'

const FIREBASE_LINK =
  'https://proj.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=abc123XYZ&apiKey=k&lang=en'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test/'
  generatePasswordResetLink.mockResolvedValue(FIREBASE_LINK)
  sendEmail.mockResolvedValue({ ok: true, emailId: 'e1', to: 'a@b.com' })
})

describe('buildInAppResetLink', () => {
  it('points at the app reset page and keeps only the one-time code', async () => {
    const link = await buildInAppResetLink('a@b.com')
    expect(link).toBe('https://app.test/reset-password?oobCode=abc123XYZ')
    expect(link).not.toContain('firebaseapp.com')
    expect(link).not.toContain('apiKey')
  })

  it('throws when Firebase returns no code', async () => {
    generatePasswordResetLink.mockResolvedValue('https://proj.firebaseapp.com/__/auth/action?mode=resetPassword')
    await expect(buildInAppResetLink('a@b.com')).rejects.toThrow(/reset code/i)
  })
})

describe('sendResetEmail', () => {
  it('sends the branded email with the in-app link in html and text', async () => {
    expect(await sendResetEmail('a@b.com', 'Ada')).toBe(true)
    const arg = sendEmail.mock.calls[0]![0] as { to: string; subject: string; html: string; text: string }
    expect(arg.to).toBe('a@b.com')
    expect(arg.subject).toMatch(/reset your password/i)
    expect(arg.html).toContain('https://app.test/reset-password?oobCode=abc123XYZ')
    expect(arg.text).toContain('https://app.test/reset-password?oobCode=abc123XYZ')
    expect(arg.html).toContain('Hello Ada,')
    expect(arg.html + arg.text).not.toContain('firebaseapp.com')
  })

  it('reports false when the mailer rejects it', async () => {
    sendEmail.mockResolvedValue({ ok: false, to: 'a@b.com', error: 'x', code: 'UNKNOWN', retryable: false })
    expect(await sendResetEmail('a@b.com')).toBe(false)
  })
})

describe('requestPasswordReset (public)', () => {
  it('sends for a real account and says delivered', async () => {
    getUserByEmail.mockResolvedValue({ uid: 'u1', displayName: 'Ada', disabled: false })
    expect(await requestPasswordReset('a@b.com')).toEqual({ delivered: true })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('looks the same for an unknown address and sends nothing', async () => {
    getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' })
    expect(await requestPasswordReset('nobody@b.com')).toEqual({ delivered: true })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends nothing for a disabled account but looks the same', async () => {
    getUserByEmail.mockResolvedValue({ uid: 'u2', displayName: null, disabled: true })
    expect(await requestPasswordReset('a@b.com')).toEqual({ delivered: true })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('says delivered:false when a real account exists but the email could not be sent', async () => {
    getUserByEmail.mockResolvedValue({ uid: 'u1', displayName: 'Ada', disabled: false })
    sendEmail.mockResolvedValue({ ok: false, to: 'a@b.com', error: 'down', code: 'UNKNOWN', retryable: true })
    expect(await requestPasswordReset('a@b.com')).toEqual({ delivered: false })
  })

  it('says delivered:false when Firebase cannot make a code', async () => {
    getUserByEmail.mockResolvedValue({ uid: 'u1', displayName: 'Ada', disabled: false })
    generatePasswordResetLink.mockRejectedValue(new Error('boom'))
    expect(await requestPasswordReset('a@b.com')).toEqual({ delivered: false })
  })

  it('says delivered:false when the user lookup itself fails (not a missing user)', async () => {
    getUserByEmail.mockRejectedValue({ code: 'auth/internal-error' })
    expect(await requestPasswordReset('a@b.com')).toEqual({ delivered: false })
  })
})

describe('reset email template', () => {
  const school = { schoolName: 'Test School', schoolAddress: 'Lilongwe', schoolEmail: 'o@t.mw', schoolPhone: '1', loginUrl: 'https://app.test' }

  it('keeps every style attribute intact (a double quote inside style="" cut the header colour off)', () => {
    const { html } = renderPasswordReset({ resetUrl: 'https://app.test/reset-password?oobCode=x' }, school)
    // No style attribute value may contain a double quote: the browser would end it there.
    for (const m of html.matchAll(/style="([^"]*)"/g)) expect(m[1]).not.toMatch(/[<>]/)
    expect(html).not.toContain('"Times New Roman"')
    expect(html).toMatch(/font-family:Georgia, 'Times New Roman', serif;font-size:22px;font-weight:bold;color:#ffffff/)
  })

  it('greets without a name and states the lifetime', () => {
    const { html, text } = renderPasswordReset({ resetUrl: 'https://app.test/r', expiresInMinutes: 30 }, school)
    expect(html).toContain('Hello,')
    expect(text).toContain('30 minutes')
  })
})
