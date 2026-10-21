/**
 * studentPlacementLogic.ts — pure rules for what a student may read about their
 * OWN university placement. No database access.
 *
 * What a student can see (and nothing else):
 *   - CONFIRMED  → published. University, programme and intake year. Confirmed
 *                  means either staff recorded the official NCHE list entry or a
 *                  staff member approved the student's own claim; either way it
 *                  is the school's published outcome.
 *   - PENDING_APPROVAL → their own claim exists but is NOT published. They see
 *                  that it is under review and what they claimed, never a
 *                  placement.
 *   - REJECTED   → their own claim was not approved. They see the reason staff
 *                  gave (it is addressed to them) and may submit again.
 *   - no record  → a clear "none" state, worded by eligibility.
 *
 * Never returned: staff internal notes, staff uids or names, other students,
 * candidate numbers, MSCE points, cohort figures.
 */
import { findProgram, findUniversity } from '@shared/constants/universities'
import type { ApiStudentPlacement, ApiStudentPlacementState } from '@shared/types/reporting-student'

export interface OwnPlacementRow {
  status: string
  entrySource: string
  admissionYear: string | null
  placedUniversityId: string | null
  placedProgrammeId: string | null
  placedUniversityName: string | null
  placedProgrammeName: string | null
  ncheBatchRef: string | null
  claimProofNote: string | null
  rejectionReason: string | null
  verifiedAt: Date | null
  createdAt: Date
}

export interface OwnPlacementInput {
  studentStatus: string
  hasCertifiedMsce: boolean
  /** The student's most recent placement row, already scoped to them. */
  record: OwnPlacementRow | null
}

/** Free text a student typed or staff typed to them is trimmed and capped before it leaves the server. */
export function cleanText(value: string | null | undefined, max = 500): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t === '' ? null : t.slice(0, max)
}

/** Catalogue name first (canonical), then the free-text name the entry was recorded with. */
export function destinationNames(r: Pick<OwnPlacementRow, 'placedUniversityId' | 'placedProgrammeId' | 'placedUniversityName' | 'placedProgrammeName'>): {
  university: string | null
  programme: string | null
} {
  const uni = r.placedUniversityId ? findUniversity(r.placedUniversityId) : undefined
  const prog = r.placedUniversityId && r.placedProgrammeId ? findProgram(r.placedUniversityId, r.placedProgrammeId) : undefined
  return {
    university: uni?.name ?? cleanText(r.placedUniversityName, 200),
    programme: prog?.name ?? cleanText(r.placedProgrammeName, 200),
  }
}

export function placementState(input: OwnPlacementInput): ApiStudentPlacementState {
  const { record } = input
  if (record) {
    if (record.status === 'CONFIRMED') return 'published'
    if (record.status === 'PENDING_APPROVAL') return 'pending'
    if (record.status === 'REJECTED') return 'not_approved'
  }
  if (input.studentStatus !== 'GRADUATED') return 'not_yet_eligible'
  if (!input.hasCertifiedMsce) return 'awaiting_results'
  return 'none'
}

const HEADLINE: Record<ApiStudentPlacementState, { headline: string; detail: string }> = {
  published: {
    headline: 'Your placement is confirmed',
    detail: 'This is the published outcome on the school’s placement list.',
  },
  pending: {
    headline: 'Your claim is under review',
    detail: 'You have told the school where you were selected. It is not published until a staff member verifies it against the official list.',
  },
  not_approved: {
    headline: 'Your claim was not approved',
    detail: 'The school could not match your claim to the official list. You can submit it again with the correct details.',
  },
  none: {
    headline: 'No placement recorded yet',
    detail: 'Nothing has been published for you. When your name appears on the official selection list, tell the school through the claim form so staff can confirm it.',
  },
  awaiting_results: {
    headline: 'Waiting for your certified MSCE results',
    detail: 'Placement opens once your MSCE results have been certified. Nothing is recorded for you yet.',
  },
  not_yet_eligible: {
    headline: 'Placement is not open to you yet',
    detail: 'University placement opens after you graduate and your MSCE results are certified. Until then no placement information exists for you.',
  },
}

export function buildStudentPlacement(input: OwnPlacementInput): ApiStudentPlacement {
  const state = placementState(input)
  const { record } = input
  const text = HEADLINE[state]
  const dest = record ? destinationNames(record) : { university: null, programme: null }

  const out: ApiStudentPlacement = {
    state,
    headline: text.headline,
    detail: text.detail,
    eligibility: { graduated: input.studentStatus === 'GRADUATED', certifiedMsce: input.hasCertifiedMsce },
    // Published outcome only — a pending or rejected claim is never presented as a placement.
    placement: state === 'published' && record
      ? {
          university: dest.university,
          programme: dest.programme,
          admissionYear: cleanText(record.admissionYear, 20),
          confirmedOn: record.verifiedAt ? record.verifiedAt.toISOString() : null,
          source: record.entrySource === 'STAFF_OFFICIAL' ? 'school_list' : 'verified_claim',
        }
      : null,
    // The student's own submission, shown back to them while it is pending or after a rejection.
    claim: (state === 'pending' || state === 'not_approved') && record
      ? {
          university: dest.university,
          programme: dest.programme,
          admissionYear: cleanText(record.admissionYear, 20),
          reference: cleanText(record.ncheBatchRef, 120),
          evidenceNote: cleanText(record.claimProofNote),
          submittedOn: record.createdAt.toISOString(),
          reviewedOn: state === 'not_approved' && record.verifiedAt ? record.verifiedAt.toISOString() : null,
          rejectionReason: state === 'not_approved' ? cleanText(record.rejectionReason) : null,
        }
      : null,
    canClaim: (state === 'none' || state === 'not_approved') && input.studentStatus === 'GRADUATED' && input.hasCertifiedMsce,
  }
  return out
}

/**
 * Fields of a placement row that are staff-internal and never go to the student,
 * even on their own record: free-form staff notes, who recorded / verified it by
 * uid, who recorded it by name, and the MSCE aggregate. (The verifier's NAME is kept —
 * the claim tracker shows "Verified by … on …".)
 */
export function toOwnPlacementRecord<T extends {
  notes?: unknown; recordedByUid?: unknown; verifiedByUid?: unknown; recordedByName?: unknown
  student?: { aggregatePoints?: unknown } & Record<string, unknown>
}>(record: T): Omit<T, 'notes' | 'recordedByUid' | 'verifiedByUid' | 'recordedByName'> {
  const { notes: _n, recordedByUid: _r, verifiedByUid: _v, recordedByName: _rn, ...rest } = record
  void _n; void _r; void _v; void _rn
  if (rest.student) {
    const { aggregatePoints: _a, ...student } = rest.student
    void _a
    return { ...rest, student } as typeof rest
  }
  return rest
}
