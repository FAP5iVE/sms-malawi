/**
 * apps/web/src/lib/sentry-scrub.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Single source of truth for what personal data is allowed to
 *   reach Sentry. Imported by instrumentation-client.ts,
 *   sentry.server.config.ts, and sentry.edge.config.ts — do not duplicate
 *   this logic elsewhere. Directly implements the Data Protection Act 2024
 *   data-minimisation posture already established in this project's
 *   Privacy Policy.
 *
 *   TYPING NOTE: scrubEvent is typed against Sentry's `ErrorEvent` (the
 *   type `beforeSend` actually expects), NOT the broad `Event` union
 *   (`Event` also covers transaction/feedback/etc. event shapes, e.g.
 *   `type: 'feedback'`, which is NOT assignable to `ErrorEvent`'s
 *   `type: undefined`). Using the general `Event` type here is a real,
 *   confirmed TypeScript compile error (TS2322) against
 *   `beforeSend(event: ErrorEvent, hint: EventHint) => ErrorEvent | ...` —
 *   ErrorEvent is correct because beforeSend is only ever invoked with
 *   error events in the first place.
 * [DEPENDS ON]: @sentry/nextjs types only
 */
import type { ErrorEvent as SentryErrorEvent, Log as SentryLog } from '@sentry/nextjs'

const SENSITIVE_KEYS = new Set([
  'firstname', 'lastname', 'othernames', 'name', 'fullname',
  'email', 'phone', 'guardianname', 'guardianphone', 'guardianrelation',
  'dateofbirth', 'dob', 'address', 'village', 'nationalid',
  'healthnote', 'medicalnote', 'welfarenote', 'registrationno',
  'password', 'token', 'authorization', 'cookie',
  // Demographic fields (gap-analysis plan). Identity numbers and welfare data
  // about children must never reach Sentry, including in request bodies.
  'nrbnumber', 'tpin', 'traditionalauthority', 'guardianemail', 'guardianaddress',
  'nextofkinname', 'nextofkinphone', 'nextofkinrelation',
  'orphanstatus', 'vulnerabilitytags', 'supportneeds', 'supportneedtypes',
  'supportnotes', 'specialneeds', 'disabilitytype', 'welfaredata',
  'exitreason', 'exitnotes', 'exitnote',
  'licencenumber', 'tcmlicencenumber', 'qualifications', 'qualificationlevel',
  // Guardian portal: claim codes are single-use credentials, contact values are
  // PII, and the parent API handles id tokens and passwords during claim.
  'invitationcode', 'claimcode', 'secret', 'secrethash', 'otp',
  'normalizedvalue', 'contactvalue', 'normalizedname', 'altphone',
  'idtoken', 'newpassword', 'currentpassword',
])

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value == null) return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(val, depth + 1)
    }
    return out
  }
  return value
}

/** Call this FIRST inside an existing beforeSend, before any other logic runs on `event`. */
export function scrubEvent(event: SentryErrorEvent): SentryErrorEvent {
  if (event.user) event.user = { id: event.user.id }   // ID only — never name/email
  if (event.extra) event.extra = redact(event.extra) as typeof event.extra
  if (event.contexts) event.contexts = redact(event.contexts) as typeof event.contexts
  if (event.request?.query_string) event.request.query_string = '[redacted]'
  return event
}

export function scrubLog(log: SentryLog): SentryLog | null {
  if (process.env.NODE_ENV !== 'development' && log.level === 'debug') return null
  if (log.attributes) log.attributes = redact(log.attributes) as typeof log.attributes
  return log
}