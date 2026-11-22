/**
 * [FILE]: apps/web/src/server/lib/guardian/phone.ts
 * [PURPOSE]: Normalise free-text phone numbers (as the school recorded them) to
 *   E.164 so guardians can be matched and contacted consistently.
 *
 *   The directory stores whatever a clerk typed: "0999 123 456", "+265-999-123-456",
 *   "265999123456", "+265 (0) 999 123 456", "0999123456 / 0888111222". Malawi is the
 *   default country. Anything unusable returns null: callers record a flag, they
 *   never invent a number.
 *
 *   Malawi numbering: mobile = 9 digits starting 8 or 9 (e.g. 0999..., 0888...);
 *   landline = trunk 0 + 1 + 6-7 digits (e.g. 01 755 123).
 *
 * Pure (no I/O) so it is unit-tested directly.
 */

export type PhoneKind = 'MOBILE' | 'LANDLINE' | 'INTERNATIONAL'
export interface NormalizedPhone { e164: string; kind: PhoneKind }

const ONLY_PHONE_CHARS = /^[\d\s\-.()+]+$/

function classifyMalawi(national: string): NormalizedPhone | null {
  if (/^[89]\d{8}$/.test(national)) return { e164: `+265${national}`, kind: 'MOBILE' }
  if (/^1\d{6,7}$/.test(national)) return { e164: `+265${national}`, kind: 'LANDLINE' }
  return null
}

export function normalizePhone(raw: unknown): NormalizedPhone | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (s.length === 0 || s.length > 40 || !ONLY_PHONE_CHARS.test(s)) return null

  s = s.replace(/\(\s*0\s*\)/g, '') // "+265 (0) 999..." trunk digit
  const plusCount = (s.match(/\+/g) ?? []).length
  const leadingPlus = s.startsWith('+')
  if (plusCount > (leadingPlus ? 1 : 0)) return null // a "+" anywhere but the start

  let digits = s.replace(/\D/g, '')
  if (digits.length === 0) return null

  let international = leadingPlus
  if (!international && digits.startsWith('00')) {
    international = true
    digits = digits.slice(2)
  }

  if (international) {
    if (digits.startsWith('265')) {
      let national = digits.slice(3)
      if (national.length === 10 && national.startsWith('0')) national = national.slice(1)
      return classifyMalawi(national)
    }
    // Another country: plausible E.164 only (8-15 digits, no leading 0).
    if (digits.length >= 8 && digits.length <= 15 && digits[0] !== '0') {
      return { e164: `+${digits}`, kind: 'INTERNATIONAL' }
    }
    return null
  }

  // No explicit international prefix.
  if (digits.startsWith('265') && (digits.length === 12 || digits.length === 13)) {
    let national = digits.slice(3)
    if (national.length === 10 && national.startsWith('0')) national = national.slice(1)
    return classifyMalawi(national)
  }
  if (digits.startsWith('0')) return classifyMalawi(digits.slice(1))
  return classifyMalawi(digits) // 9-digit mobile typed without the trunk 0
}

/**
 * Every usable number in a free-text field, normalised, de-duplicated, in the order
 * written (the first is the one the clerk considered primary).
 */
export function extractPhones(raw: unknown): NormalizedPhone[] {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  const segments = raw.split(/[\/,;&|\n]+|\s+(?:or|and|na)\s+/i).map((x) => x.trim()).filter(Boolean)
  const out: NormalizedPhone[] = []
  const seen = new Set<string>()
  const push = (p: NormalizedPhone | null) => {
    if (p && !seen.has(p.e164)) { seen.add(p.e164); out.push(p) }
  }
  for (const seg of segments) {
    const whole = normalizePhone(seg)
    if (whole) { push(whole); continue }
    // "0999 123 456 0888 111 222": two numbers separated only by spaces.
    const digits = seg.replace(/\D/g, '')
    if (ONLY_PHONE_CHARS.test(seg) && !seg.includes('+') && digits.length >= 20 && digits.length % 10 === 0) {
      for (let i = 0; i < digits.length; i += 10) push(normalizePhone(digits.slice(i, i + 10)))
    }
  }
  return out
}

/** Last four digits only, for display and logs. Never log a full number. */
export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, '')
  return d.length <= 4 ? '****' : `${'*'.repeat(Math.max(d.length - 4, 0))}${d.slice(-4)}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const e = raw.trim().toLowerCase()
  if (e.length === 0 || e.length > 254 || !EMAIL_RE.test(e)) return null
  return e
}
