/**
 * [FILE]: apps/web/src/server/lib/guardian/proposal.ts
 * [PURPOSE]: Turn a school contact card (StudentGuardian) into a normalised portal
 *   PROPOSAL, and decide whether a later edit to the card needs staff to look again.
 *
 *   A proposal grants nothing. It only describes who the card appears to be, what
 *   contact methods could be used, and what is wrong with the data (flags), so the
 *   review queue can show staff exactly what needs checking.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */
import { defaultCapabilitiesFor, type GuardianCapability } from '@shared/constants/guardianPortal'
import type { GuardianRelationship } from '@shared/constants/admissions'
import { extractPhones, normalizeEmail } from './phone'
import { isPlaceholderName, normalizeName } from './names'
import { mapRelationship } from './relationship'

export interface DirectoryEntryInput {
  id?: string
  fullName: string
  relation: string
  phone: string
  altPhone?: string | null
  email?: string | null
  isPrimary?: boolean
  isFeePayer?: boolean
}

export type ProposalFlag =
  | 'NAME_PLACEHOLDER'   // no usable name: not proposed
  | 'PHONE_UNUSABLE'     // no number could be parsed from the phone field
  | 'PHONE_MULTIPLE'     // several numbers in one field: first taken as primary
  | 'EMAIL_INVALID'      // an email was recorded but is not valid
  | 'RELATION_MAPPED'    // relation was not in the school's list; original kept as a note

export interface ProposedContact {
  kind: 'PHONE' | 'EMAIL'
  value: string
  normalizedValue: string
  isPreferred: boolean
}

export interface GuardianProposal {
  /** False only when there is nothing to propose (placeholder name). */
  usable: boolean
  flags: ProposalFlag[]
  fullName: string
  normalizedName: string
  relationship: GuardianRelationship
  relationshipNote: string | null
  contacts: ProposedContact[]
  isPrimaryContact: boolean
  isFinancialResponsible: boolean
  /** What staff would grant by default if they approve as-is. */
  suggestedCapabilities: GuardianCapability[]
}

export function buildGuardianProposal(entry: DirectoryEntryInput): GuardianProposal {
  const flags: ProposalFlag[] = []
  const fullName = (entry.fullName ?? '').trim().replace(/\s+/g, ' ')
  const placeholder = isPlaceholderName(fullName)
  if (placeholder) flags.push('NAME_PLACEHOLDER')

  const phones = extractPhones(entry.phone)
  const alt = extractPhones(entry.altPhone ?? '')
  if (phones.length === 0) flags.push('PHONE_UNUSABLE')
  if (phones.length > 1) flags.push('PHONE_MULTIPLE')

  const contacts: ProposedContact[] = []
  const seen = new Set<string>()
  for (const p of [...phones, ...alt]) {
    if (seen.has(p.e164)) continue
    seen.add(p.e164)
    contacts.push({
      kind: 'PHONE',
      value: p.e164,
      normalizedValue: p.e164,
      isPreferred: contacts.length === 0,
    })
  }
  const rawEmail = typeof entry.email === 'string' ? entry.email.trim() : ''
  const email = normalizeEmail(rawEmail)
  if (rawEmail && !email) flags.push('EMAIL_INVALID')
  if (email) contacts.push({ kind: 'EMAIL', value: rawEmail, normalizedValue: email, isPreferred: contacts.length === 0 })

  const rel = mapRelationship(entry.relation)
  if (rel.note) flags.push('RELATION_MAPPED')

  const isFinancialResponsible = entry.isFeePayer === true
  return {
    usable: !placeholder,
    flags,
    fullName,
    normalizedName: normalizeName(fullName),
    relationship: rel.relationship,
    relationshipNote: rel.note,
    contacts,
    isPrimaryContact: entry.isPrimary === true,
    isFinancialResponsible,
    suggestedCapabilities: defaultCapabilitiesFor({ isFinancialResponsible }),
  }
}

export interface DirectoryDrift {
  nameChanged: boolean
  relationChanged: boolean
  phoneChanged: boolean
  emailChanged: boolean
  changed: string[]
  /** True when the portal link made from this card must be looked at again. */
  requiresReverify: boolean
}

/**
 * Compares two versions of a contact card AFTER normalisation, so formatting-only
 * edits ("0999123456" -> "0999 123 456", "mrs" casing) never raise a flag.
 * Adding an extra number does not flag; replacing or removing one does.
 */
export function detectDirectoryDrift(before: DirectoryEntryInput, after: DirectoryEntryInput): DirectoryDrift {
  const nameChanged = normalizeName(before.fullName) !== normalizeName(after.fullName)
  const relationChanged = mapRelationship(before.relation).relationship !== mapRelationship(after.relation).relationship
  const oldPhones = [...extractPhones(before.phone), ...extractPhones(before.altPhone ?? '')].map((p) => p.e164)
  const newPhones = new Set([...extractPhones(after.phone), ...extractPhones(after.altPhone ?? '')].map((p) => p.e164))
  const phoneChanged = oldPhones.some((p) => !newPhones.has(p))
  const emailChanged = (normalizeEmail(before.email ?? '') ?? '') !== (normalizeEmail(after.email ?? '') ?? '')
  const changed: string[] = []
  if (nameChanged) changed.push('name')
  if (relationChanged) changed.push('relationship')
  if (phoneChanged) changed.push('phone')
  if (emailChanged) changed.push('email')
  return { nameChanged, relationChanged, phoneChanged, emailChanged, changed, requiresReverify: changed.length > 0 }
}
