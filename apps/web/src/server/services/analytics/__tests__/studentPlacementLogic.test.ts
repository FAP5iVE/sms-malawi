import { describe, it, expect } from 'vitest'
import { buildStudentPlacement, cleanText, destinationNames, placementState, toOwnPlacementRecord } from '../studentPlacementLogic'

const row = (over: Record<string, unknown> = {}) => ({
  status: 'CONFIRMED', entrySource: 'STAFF_OFFICIAL', admissionYear: '2026',
  placedUniversityId: null, placedProgrammeId: null, placedUniversityName: 'Uni', placedProgrammeName: 'Prog',
  ncheBatchRef: null, claimProofNote: null, rejectionReason: null, verifiedAt: null, createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
}) as never

describe('placementState', () => {
  it('maps a record status first, then eligibility', () => {
    expect(placementState({ studentStatus: 'GRADUATED', hasCertifiedMsce: true, record: row() })).toBe('published')
    expect(placementState({ studentStatus: 'GRADUATED', hasCertifiedMsce: true, record: row({ status: 'PENDING_APPROVAL' }) })).toBe('pending')
    expect(placementState({ studentStatus: 'GRADUATED', hasCertifiedMsce: true, record: row({ status: 'REJECTED' }) })).toBe('not_approved')
    expect(placementState({ studentStatus: 'GRADUATED', hasCertifiedMsce: true, record: null })).toBe('none')
    expect(placementState({ studentStatus: 'GRADUATED', hasCertifiedMsce: false, record: null })).toBe('awaiting_results')
    expect(placementState({ studentStatus: 'ACTIVE', hasCertifiedMsce: false, record: null })).toBe('not_yet_eligible')
  })

  it('does not publish an unknown status', () => {
    expect(placementState({ studentStatus: 'GRADUATED', hasCertifiedMsce: true, record: row({ status: 'DRAFT' }) })).toBe('none')
  })
})

describe('destinationNames / cleanText', () => {
  it('falls back to the recorded free text and trims it', () => {
    expect(destinationNames({ placedUniversityId: null, placedProgrammeId: null, placedUniversityName: '  X Uni ', placedProgrammeName: null })).toEqual({ university: 'X Uni', programme: null })
  })
  it('caps long free text and drops blanks', () => {
    expect(cleanText('   ')).toBeNull()
    expect(cleanText(undefined)).toBeNull()
    expect(cleanText('a'.repeat(900))).toHaveLength(500)
  })
})

describe('buildStudentPlacement', () => {
  it('never carries a rejection reason unless the claim was rejected', () => {
    const out = buildStudentPlacement({ studentStatus: 'GRADUATED', hasCertifiedMsce: true, record: row({ status: 'PENDING_APPROVAL', rejectionReason: 'stale' }) })
    expect(out.claim?.rejectionReason).toBeNull()
  })
  it('handles special characters in free text without altering them', () => {
    const out = buildStudentPlacement({ studentStatus: 'GRADUATED', hasCertifiedMsce: true, record: row({ placedUniversityName: 'Univ. of "Malawi" & <Co>' }) })
    expect(out.placement?.university).toBe('Univ. of "Malawi" & <Co>')
  })
})

describe('toOwnPlacementRecord', () => {
  it('removes staff-internal fields and the aggregate but keeps the rest', () => {
    const out = toOwnPlacementRecord({
      id: 'p1', status: 'PENDING_APPROVAL', notes: 'secret', recordedByUid: 'u1', verifiedByUid: 'u2', recordedByName: 'A B', verifiedByName: 'C D',
      student: { id: 's', candidateNo: 'M1/001', aggregatePoints: 9 },
    })
    expect(out).toEqual({ id: 'p1', status: 'PENDING_APPROVAL', verifiedByName: 'C D', student: { id: 's', candidateNo: 'M1/001' } })
  })
  it('works when there is no student object', () => {
    expect(toOwnPlacementRecord({ id: 'p', notes: 'x' })).toEqual({ id: 'p' })
  })
})
