import 'server-only'

import { Resend } from 'resend'
import { logger } from '@/lib/logger'

// ─────────────────────────────────────────────────────────
//  CLIENT INITIALISATION
//  Lazy singleton — the Resend client is created once on first
//  use and reused within a warm Lambda instance. If RESEND_API_KEY
//  is absent we enter dev-log mode rather than crashing cold starts.
// ─────────────────────────────────────────────────────────

let _client: Resend | null = null

function getResendClient(): Resend | null {
  if (_client) return _client
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[email] RESEND_API_KEY is not set — email sending is disabled')
    }
    return null
  }
  _client = new Resend(apiKey)
  return _client
}

// ─────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────

/** From address used for all outgoing mail. Must be a verified Resend domain. */
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS ?? 'noreply@school.mw'
const FROM_NAME    = process.env.EMAIL_FROM_NAME    ?? 'SMS Malawi'
const FROM         = `${FROM_NAME} <${FROM_ADDRESS}>`

/** Reply-to address for mail that users may respond to. */
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? FROM_ADDRESS

/**
 * Resend's free tier rate limit is 2 emails/second with a daily cap of
 * 100 emails. Pro tier: 10 emails/second. We add inter-request jitter
 * in batch sends to stay within these limits on the free tier.
 */
const BATCH_INTER_EMAIL_DELAY_MS = 600   // ~1.6 emails/sec — safe for free tier

/**
 * Maximum number of times we retry a failed Resend API call before
 * giving up. Only retried for transient errors (5xx, network timeouts).
 */
const MAX_RETRIES = 2

// ─────────────────────────────────────────────────────────
//  EMAIL RESULT TYPES
// ─────────────────────────────────────────────────────────

export interface EmailSuccess {
  ok:      true
  emailId: string
  to:      string
}

export interface EmailFailure {
  ok:      false
  to:      string
  error:   string
  code:    EmailErrorCode
  retryable: boolean
}

export type EmailResult = EmailSuccess | EmailFailure

export type EmailErrorCode =
  | 'MISSING_API_KEY'         // RESEND_API_KEY not configured
  | 'INVALID_RECIPIENT'       // Malformed email address
  | 'RATE_LIMITED'            // Resend rate limit hit
  | 'UNVERIFIED_DOMAIN'       // From domain not verified on Resend
  | 'RECIPIENT_BLOCKED'       // Resend suppression list / bounced address
  | 'RESEND_API_ERROR'        // 4xx from Resend (bad payload)
  | 'RESEND_SERVER_ERROR'     // 5xx from Resend (transient)
  | 'NETWORK_ERROR'           // Fetch-level failure
  | 'SEND_DISABLED'           // Dev mode — email sending intentionally off
  | 'UNKNOWN_ERROR'

// ─────────────────────────────────────────────────────────
//  INPUT TYPES
// ─────────────────────────────────────────────────────────

export interface EmailAttachment {
  /** File name shown in the email client. */
  filename: string
  /** Raw file content as a Buffer or base64-encoded string. */
  content:  Buffer | string
  /** MIME type, e.g. 'application/pdf'. */
  contentType?: string
}

export interface SendEmailInput {
  /** Recipient email address or addresses (max 50 per Resend). */
  to: string | string[]
  /** Email subject line. */
  subject: string
  /**
   * HTML body. If both html and text are provided, Resend sends a
   * multipart/alternative email (HTML preferred, text fallback).
   */
  html?: string
  /**
   * Plain-text body. Used as the text part of a multipart email
   * or as the sole body when html is omitted.
   */
  text?: string
  /** Override the From address for this specific email. */
  from?: string
  /** Reply-To address override. */
  replyTo?: string
  /** CC addresses. */
  cc?: string | string[]
  /** BCC addresses. */
  bcc?: string | string[]
  /** File attachments (keep small — Vercel's 4.5 MB payload limit applies). */
  attachments?: EmailAttachment[]
  /**
   * Resend tags for analytics / filtering in the Resend dashboard.
   * Max 10 tags per email.
   */
  tags?: Array<{ name: string; value: string }>
  /**
   * Custom headers to include in the email.
   * Useful for setting X-Entity-Ref-ID for deduplication.
   */
  headers?: Record<string, string>
}

export interface BatchSendEmailInput {
  emails: SendEmailInput[]
  /**
   * If true, continue sending remaining emails when one fails.
   * If false (default), stop on first failure.
   */
  continueOnError?: boolean
}

export interface BatchEmailResult {
  results:      EmailResult[]
  successCount: number
  failureCount: number
  totalCount:   number
}

// ─────────────────────────────────────────────────────────
//  VALIDATION HELPERS
// ─────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function isValidEmail(address: string): boolean {
  return EMAIL_REGEX.test(address.trim())
}

function normaliseRecipients(to: string | string[]): string[] {
  const arr = Array.isArray(to) ? to : [to]
  return arr.map((a) => a.trim()).filter((a) => a.length > 0)
}

function validateRecipients(recipients: string[]): string | null {
  if (recipients.length === 0) {
    return 'At least one recipient is required.'
  }
  if (recipients.length > 50) {
    return `Too many recipients: ${recipients.length}. Resend supports a max of 50 per request.`
  }
  const invalid = recipients.filter((r) => !isValidEmail(r))
  if (invalid.length > 0) {
    return `Invalid email address${invalid.length > 1 ? 'es' : ''}: ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`
  }
  return null
}

// ─────────────────────────────────────────────────────────
//  ERROR CLASSIFICATION
// ─────────────────────────────────────────────────────────

interface ResendApiError {
  name:       string
  message:    string
  statusCode: number
}

function classifyResendError(err: unknown): {
  message:  string
  code:     EmailErrorCode
  retryable: boolean
} {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()

    // Network / fetch errors
    if (
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('timeout')
    ) {
      return { message: err.message, code: 'NETWORK_ERROR', retryable: true }
    }
  }

  // Resend returns structured error objects
  if (typeof err === 'object' && err !== null) {
    const e = err as ResendApiError
    const statusCode = e.statusCode ?? 0

    if (statusCode === 429) {
      return {
        message:   'Resend rate limit exceeded.',
        code:      'RATE_LIMITED',
        retryable: true,
      }
    }
    if (statusCode === 422) {
      const msg = e.message?.toLowerCase() ?? ''
      if (msg.includes('domain') || msg.includes('from')) {
        return {
          message:   'From domain is not verified on Resend.',
          code:      'UNVERIFIED_DOMAIN',
          retryable: false,
        }
      }
      if (msg.includes('suppress') || msg.includes('bounce') || msg.includes('complaint')) {
        return {
          message:   'Recipient address is on Resend suppression list.',
          code:      'RECIPIENT_BLOCKED',
          retryable: false,
        }
      }
      return {
        message:   e.message ?? 'Resend rejected the request payload.',
        code:      'RESEND_API_ERROR',
        retryable: false,
      }
    }
    if (statusCode >= 400 && statusCode < 500) {
      return {
        message:   e.message ?? `Resend API error (${statusCode}).`,
        code:      'RESEND_API_ERROR',
        retryable: false,
      }
    }
    if (statusCode >= 500) {
      return {
        message:   'Resend server error — will retry.',
        code:      'RESEND_SERVER_ERROR',
        retryable: true,
      }
    }
  }

  return {
    message:   err instanceof Error ? err.message : 'Unknown email error.',
    code:      'UNKNOWN_ERROR',
    retryable: false,
  }
}

// ─────────────────────────────────────────────────────────
//  SLEEP HELPER (for retry back-off and batch pacing)
// ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─────────────────────────────────────────────────────────
//  DEV-MODE LOGGING
//  When RESEND_API_KEY is absent (local dev without email),
//  log the email payload to the console instead of sending.
// ─────────────────────────────────────────────────────────

function devLogEmail(input: SendEmailInput): EmailResult {
  const to = normaliseRecipients(input.to)
  logger.info(
    {
      mode:    'DEV_LOG',
      to,
      subject: input.subject,
      from:    input.from ?? FROM,
      hasHtml: Boolean(input.html),
      hasText: Boolean(input.text),
    },
    '[email] DEV MODE — email not sent, logged instead'
  )
  return {
    ok:      false,
    to:      to[0] ?? '',
    error:   'Email sending is disabled (RESEND_API_KEY not configured).',
    code:    'SEND_DISABLED',
    retryable: false,
  }
}

// ─────────────────────────────────────────────────────────
//  CORE SEND FUNCTION
// ─────────────────────────────────────────────────────────

/**
 * Send a single transactional email via Resend.
 *
 * Returns an EmailResult — never throws.  All errors are caught and
 * returned as EmailFailure so calling code can decide whether to
 * surface them to the user or swallow them silently.
 *
 * Retries up to MAX_RETRIES times for retryable errors (5xx, network)
 * with exponential back-off: 1s, 2s.
 *
 * @example
 *   const result = await sendEmail({
 *     to:      'guardian@example.mw',
 *     subject: 'Fee reminder — Term 2 2025/2026',
 *     html:    feeReminderHtml,
 *     text:    feeReminderText,
 *     tags:    [{ name: 'type', value: 'fee_reminder' }],
 *   })
 *   if (!result.ok) {
 *     logger.warn({ result }, 'Email failed')
 *   }
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<EmailResult> {
  const recipients = normaliseRecipients(input.to)
  const primaryTo  = recipients[0] ?? ''

  // ── Validation
  const validationError = validateRecipients(recipients)
  if (validationError) {
    logger.warn({ to: recipients, error: validationError }, '[email] Invalid recipient')
    return {
      ok:        false,
      to:        primaryTo,
      error:     validationError,
      code:      'INVALID_RECIPIENT',
      retryable: false,
    }
  }

  // ── Client availability
  const client = getResendClient()
  if (!client) {
    return devLogEmail(input)
  }

  // ── Require at least one body
  if (!input.html && !input.text) {
    return {
      ok:        false,
      to:        primaryTo,
      error:     'Email must have either an html or text body.',
      code:      'RESEND_API_ERROR',
      retryable: false,
    }
  }

  // ── Build Resend payload
const base = {
  from:     input.from    ?? FROM,
  to:       recipients,
  subject:  input.subject,
  reply_to: input.replyTo ?? REPLY_TO,
  ...(input.cc      ? { cc:      normaliseRecipients(input.cc)  } : {}),
  ...(input.bcc     ? { bcc:     normaliseRecipients(input.bcc) } : {}),
  ...(input.tags    ? { tags:    input.tags                     } : {}),
  ...(input.headers ? { headers: input.headers                  } : {}),
  ...(input.attachments ? {
    attachments: input.attachments.map((a) => ({
      filename:     a.filename,
      content:      a.content,
      content_type: a.contentType,
    })),
  } : {}),
}

// Satisfy the discriminated union — provide html, text, or both
const payload: Parameters<typeof client.emails.send>[0] = input.html
  ? { ...base, html: input.html, ...(input.text ? { text: input.text } : {}) }
  : { ...base, text: input.text! }

  // ── Send with retry loop
  let lastError: unknown = null
  let attempt = 0

  while (attempt <= MAX_RETRIES) {
    attempt++

    try {
      const { data, error } = await client.emails.send(payload)

      if (error) {
        // Resend returned an API-level error
        const classified = classifyResendError(error)
        logger.warn(
          { to: primaryTo, attempt, error: classified.message, code: classified.code },
          '[email] Resend API error'
        )

        if (!classified.retryable || attempt > MAX_RETRIES) {
          return { ok: false, to: primaryTo, error: classified.message, code: classified.code, retryable: classified.retryable }
        }

        lastError = error
        await sleep(attempt * 1000)
        continue
      }

      if (!data?.id) {
        // Unexpected empty response from Resend
        logger.warn({ to: primaryTo, attempt }, '[email] Resend returned no email ID')
        if (attempt > MAX_RETRIES) {
          return { ok: false, to: primaryTo, error: 'No email ID returned by Resend.', code: 'RESEND_SERVER_ERROR', retryable: false }
        }
        await sleep(attempt * 1000)
        continue
      }

      // ── Success
      logger.info(
        { emailId: data.id, to: primaryTo, subject: input.subject },
        '[email] Email sent'
      )
      return { ok: true, emailId: data.id, to: primaryTo }

    } catch (err: unknown) {
      const classified = classifyResendError(err)
      logger.warn(
        { to: primaryTo, attempt, error: classified.message, code: classified.code },
        '[email] Send threw an exception'
      )

      if (!classified.retryable || attempt > MAX_RETRIES) {
        return { ok: false, to: primaryTo, error: classified.message, code: classified.code, retryable: classified.retryable }
      }

      lastError = err
      await sleep(attempt * 1000)
    }
  }

  // ── Exhausted all retries
  const classified = classifyResendError(lastError)
  return {
    ok:        false,
    to:        primaryTo,
    error:     `Failed after ${MAX_RETRIES} retries: ${classified.message}`,
    code:      classified.code,
    retryable: false,
  }
}

// ─────────────────────────────────────────────────────────
//  BATCH SEND
//  Sends emails sequentially with pacing to stay within Resend
//  rate limits. Sequential (not parallel) because:
//    1. Resend free tier: 2 req/s — parallel bursts would exceed it
//    2. Vercel serverless: concurrent fetch calls all counted against
//       the same Lambda's memory and CPU budget
//    3. Partial failure is easier to handle sequentially
// ─────────────────────────────────────────────────────────

/**
 * Send multiple emails sequentially, with pacing between each send.
 * Returns a BatchEmailResult with individual EmailResult per email.
 *
 * Set continueOnError: true (default: false) to attempt all emails
 * even when some fail.
 *
 * For very large batches (50+ emails) consider queuing via a Vercel
 * Cron job rather than calling this in a single request handler.
 */
export async function sendBatchEmails(
  input: BatchSendEmailInput
): Promise<BatchEmailResult> {
  const { emails, continueOnError = false } = input

  if (emails.length === 0) {
    return { results: [], successCount: 0, failureCount: 0, totalCount: 0 }
  }

  const results: EmailResult[] = []
  let successCount = 0
  let failureCount = 0

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]

    if (!email) continue

    const result = await sendEmail(email)
    results.push(result)

    if (result.ok) {
      successCount++
    } else {
      failureCount++
      logger.warn(
        { index: i, to: result.to, error: result.error, code: result.code },
        '[email] Batch item failed'
      )
      if (!continueOnError && result.retryable === false) {
        // Hard failure — stop the batch
        logger.warn(
          { failedAt: i, totalEmails: emails.length },
          '[email] Batch halted due to non-retryable error'
        )
        break
      }
    }

    // Pace between sends — only needed if there are more to send
    if (i < emails.length - 1) {
      await sleep(BATCH_INTER_EMAIL_DELAY_MS)
    }
  }

  logger.info(
    { successCount, failureCount, totalCount: emails.length },
    '[email] Batch send complete'
  )

  return { results, successCount, failureCount, totalCount: emails.length }
}

// ─────────────────────────────────────────────────────────
//  RESEND WEBHOOK SIGNATURE VERIFICATION
//  Used by a POST /api/webhooks/resend route to verify that
//  delivery status callbacks are genuinely from Resend.
//  The RESEND_WEBHOOK_SECRET env var must be set to the signing
//  secret from the Resend dashboard.
// ─────────────────────────────────────────────────────────

export interface ResendWebhookEmailEvent {
  type:   'email.sent' | 'email.delivered' | 'email.delivery_delayed' |
          'email.bounced' | 'email.complained' | 'email.opened' | 'email.clicked'
  data: {
    email_id:   string
    from:       string
    to:         string[]
    subject:    string
    created_at: string
    /** Only present on email.bounced events */
    bounce_type?:  'hard' | 'soft'
    bounce_code?:  string
    bounce_description?: string
  }
}

/**
 * Verify a Resend webhook signature using the Web Crypto API.
 * Safe to call in Edge Runtime (no Node.js crypto dependency).
 *
 * Returns true if the signature is valid, false otherwise.
 *
 * @param body    Raw request body as a string
 * @param svixId          Value of the svix-id header
 * @param svixTimestamp   Value of the svix-timestamp header
 * @param svixSignature   Value of the svix-signature header
 */
export async function verifyResendWebhook(
  body: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string
): Promise<boolean> {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    logger.error('[email] RESEND_WEBHOOK_SECRET is not set — webhook verification disabled')
    return false
  }

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false
  }

  // Reject timestamps older than 5 minutes (replay attack prevention)
  const timestampMs = parseInt(svixTimestamp, 10) * 1000
  if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    logger.warn(
      { svixTimestamp, ageMs: Date.now() - timestampMs },
      '[email] Webhook timestamp too old — possible replay attack'
    )
    return false
  }

  try {
    // Svix uses HMAC-SHA256 over `${svixId}.${svixTimestamp}.${body}`
    const toSign = `${svixId}.${svixTimestamp}.${body}`

    // The secret is prefixed with "whsec_" and base64-encoded
    const rawSecret = secret.startsWith('whsec_')
      ? secret.slice('whsec_'.length)
      : secret

    const secretBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0))

    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    // svix-signature may contain multiple signatures (v1,<sig> v1a,<sig>)
    // We check all of them — any valid one is sufficient
    const signatures = svixSignature
      .split(' ')
      .filter((s) => s.startsWith('v1,'))
      .map((s) => {
        const b64 = s.slice('v1,'.length)
        return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      })

    if (signatures.length === 0) return false

    const messageBytes = new TextEncoder().encode(toSign)

    for (const sig of signatures) {
      const valid = await crypto.subtle.verify('HMAC', key, sig, messageBytes)
      if (valid) return true
    }

    return false
  } catch (err) {
    logger.error({ err }, '[email] Webhook signature verification threw')
    return false
  }
}

// ─────────────────────────────────────────────────────────
//  EMAIL ADDRESS UTILITIES
// ─────────────────────────────────────────────────────────

/**
 * Validate a single email address.
 * Returns true if the address looks like a valid RFC 5321 address.
 * Does not perform DNS lookup or mailbox verification.
 */
export function isValidEmailAddress(address: string): boolean {
  return isValidEmail(address)
}

/**
 * Strip display name from a combined "Name <email>" string.
 * e.g. "John Doe <john@example.mw>" → "john@example.mw"
 */
export function extractEmailAddress(combined: string): string {
  const match = combined.match(/<(.+)>/)
  return match ? (match[1] ?? combined).trim() : combined.trim()
}

/**
 * Build a "From" string combining display name and address.
 * e.g. buildFromAddress('SMS Malawi', 'noreply@school.mw') → "SMS Malawi <noreply@school.mw>"
 */
export function buildFromAddress(name: string, address: string): string {
  return `${name} <${address}>`
}

// ─────────────────────────────────────────────────────────
//  HEALTH CHECK
//  Used by systemHealthService to verify the email configuration
//  is present without actually sending an email.
// ─────────────────────────────────────────────────────────

export interface EmailHealthStatus {
  configured: boolean
  apiKeyPresent: boolean
  fromAddress:   string
  replyTo:       string
  webhookSecretPresent: boolean
  mode: 'live' | 'dev-log'
}

export function getEmailHealthStatus(): EmailHealthStatus {
  const apiKeyPresent         = Boolean(process.env.RESEND_API_KEY)
  const webhookSecretPresent  = Boolean(process.env.RESEND_WEBHOOK_SECRET)

  return {
    configured:           apiKeyPresent,
    apiKeyPresent,
    fromAddress:          FROM_ADDRESS,
    replyTo:              REPLY_TO,
    webhookSecretPresent,
    mode:                 apiKeyPresent ? 'live' : 'dev-log',
  }
}