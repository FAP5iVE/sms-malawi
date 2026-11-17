/**
 * apps/web/src/lib/hills/statusWord.ts
 *
 * [PURPOSE]: Looks only (RULEBOOK R2, R4). Turns a raw status code from the API
 *   ("PENDING_APPROVAL", "AWAITING_MANEB_RESULTS", "ok") into a sentence-case word for
 *   display, and picks the StatusText tone for the common codes. It never changes the
 *   value that is read, sent or compared; callers keep using the raw code for logic.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

// Words that stay in capitals when a code is turned into a sentence.
const ACRONYMS = new Set(['CA', 'MANEB', 'JCE', 'MSCE', 'PSLCE', 'MWK', 'MK', 'PIN', 'ID'])

export function statusWord(code: string | null | undefined): string {
  if (code == null || code === '') return ''
  const w = String(code)
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ')
    .map((word) => (ACRONYMS.has(word.toUpperCase()) ? word.toUpperCase() : word))
    .join(' ')
  return w.charAt(0).toUpperCase() + w.slice(1)
}

const SUCCESS = new Set(['PAID', 'APPROVED', 'ACTIVE', 'OK', 'COMPLETED', 'RESULTS_RELEASED', 'RESULTS_APPROVED', 'OPEN', 'PUBLISHED', 'RECEIVED', 'RESOLVED', 'VERIFIED', 'RELEASED', 'CLOSED_OK'])
const WARNING = new Set(['PENDING', 'UNPAID', 'DEGRADED', 'REVIEW', 'MARKS_PENDING', 'MARKS_DRAFT', 'PENDING_APPROVAL', 'DUE', 'EXPIRING', 'WARNING'])
const DANGER = new Set(['REJECTED', 'OVERDUE', 'FAILED', 'ERROR', 'DOWN', 'CLOSED', 'CANCELLED', 'WRITTEN_OFF', 'EXPIRED'])
const INFO = new Set(['PARTIAL', 'IN_PROGRESS', 'MARKS_FINAL', 'SCHEDULED', 'AWAITING_MANEB_RESULTS', 'GRADUATED', 'DRAFT_SENT'])

export function statusTone(code: string): StatusTone {
  const k = String(code).trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (SUCCESS.has(k)) return 'success'
  if (WARNING.has(k)) return 'warning'
  if (DANGER.has(k)) return 'danger'
  if (INFO.has(k)) return 'info'
  return 'neutral'
}
