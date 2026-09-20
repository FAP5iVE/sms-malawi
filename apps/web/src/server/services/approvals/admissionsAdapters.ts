/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/admissionsAdapters.ts
 * [PURPOSE]: Hub adapters for admissions and placements — public admission
 *   applications, and student-submitted university placement claims that a
 *   staff verifier must confirm or reject. Both delegate to the modules'
 *   own services.
 */

import 'server-only'
import type { ApplicationStatus, PlacementStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ApprovalStatus } from '@shared/constants/approvals'
import { findProgram, findUniversity } from '@shared/constants/universities'
import * as applicationService from '@/server/services/applicationService'
import * as placementService from '@/server/services/placementService'
import type { AdapterItem, ApprovalAdapter } from './types'
import {
  dateFilter, detailList, emptyCounts, expandStatuses, fullName, humanize,
  lookupNames, makeItem, person, shortDate, tally,
} from './helpers'

// ─── ADMISSION APPLICATIONS ───────────────────────────────

const APPLICATION_STATUS: Record<ApprovalStatus, readonly ApplicationStatus[]> = {
  PENDING: ['PENDING'],
  APPROVED: ['APPROVED', 'AWAITING_ADMISSION', 'ADMITTED'],
  REJECTED: ['DENIED'],
  CANCELLED: [],
  EXPIRED: [],
}

type ApplicationRow = Prisma.ApplicationGetPayload<Record<string, never>>

function applicationItem(r: ApplicationRow, names: Map<string, string>): AdapterItem {
  const applicant = fullName(r.firstName, r.lastName)
  return makeItem('application', {
    sourceId: r.id,
    title: `${applicant} — Form ${r.applyingForForm}`,
    summary: r.previousSchool ? `Previously at ${r.previousSchool}` : 'New applicant',
    status: r.status === 'PENDING' ? 'PENDING' : r.status === 'DENIED' ? 'REJECTED' : 'APPROVED',
    sourceStatus: r.status,
    // Applications come from the public form — there is no account to attribute to.
    requester: person(null, applicant, 'Applicant'),
    details: detailList([
      ['Applicant', applicant],
      ['Date of birth', shortDate(r.dateOfBirth)],
      ['Sex', humanize(r.sex)],
      ['District', r.district],
      ['Applying for', `Form ${r.applyingForForm}`],
      ['Academic year', r.academicYear],
      ['Previous school', r.previousSchool],
      ['Reason for transfer', r.reasonForTransfer],
      ['Guardian', `${r.guardianName} (${humanize(r.guardianRelation)})`],
      ['Guardian phone', r.guardianPhone],
    ]),
    createdAt: r.createdAt,
    decidedAt: r.reviewedAt,
    decidedBy: r.reviewedByUid ? person(r.reviewedByUid, names.get(r.reviewedByUid) ?? '') : null,
    decisionNotes: r.notes,
  })
}

export const applicationAdapter: ApprovalAdapter = {
  source: 'application',

  async list(q) {
    // Public applicants have no account, so "my requests" can never match.
    if (q.requesterUid) return []
    const statuses = expandStatuses(q.statuses, APPLICATION_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.application.findMany({
      where: { status: { in: statuses }, ...(createdAt ? { createdAt } : {}) },
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.map((r) => r.reviewedByUid))
    return rows.map((r) => applicationItem(r, names))
  },

  async counts(requesterUid) {
    if (requesterUid) return emptyCounts()
    const rows = await prisma.application.groupBy({ by: ['status'], _count: { _all: true } })
    return rows.length ? tally(rows, APPLICATION_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.application.findUnique({ where: { id } })
    if (!r) return null
    return applicationItem(r, await lookupNames([r.reviewedByUid]))
  },

  async approve(id, actor, input) {
    await applicationService.updateApplicationStatus(id, 'APPROVED', actor.uid, actor.role, input.notes)
  },

  async reject(id, actor, input) {
    await applicationService.updateApplicationStatus(id, 'DENIED', actor.uid, actor.role, input.notes)
  },
}

// ─── PLACEMENT CLAIMS ─────────────────────────────────────

const PLACEMENT_STATUS: Record<ApprovalStatus, readonly PlacementStatus[]> = {
  PENDING: ['PENDING_APPROVAL'],
  APPROVED: ['CONFIRMED'],
  REJECTED: ['REJECTED'],
  CANCELLED: [],
  EXPIRED: [],
}

const placementInclude = {
  student: { select: { firstName: true, lastName: true, registrationNo: true } },
} satisfies Prisma.UniversityPlacementInclude

type PlacementRow = Prisma.UniversityPlacementGetPayload<{ include: typeof placementInclude }>

function placementItem(r: PlacementRow, names: Map<string, string>): AdapterItem {
  const student = fullName(r.student.firstName, r.student.lastName)
  const university =
    r.placedUniversityName ?? (r.placedUniversityId ? findUniversity(r.placedUniversityId)?.name : undefined) ?? null
  const programme =
    r.placedProgrammeName ??
    (r.placedUniversityId && r.placedProgrammeId ? findProgram(r.placedUniversityId, r.placedProgrammeId)?.name : undefined) ??
    null
  return makeItem('placement_claim', {
    sourceId: r.id,
    title: `Placement claim — ${student}`,
    summary: [university, programme].filter(Boolean).join(' · ') || null,
    status: r.status === 'PENDING_APPROVAL' ? 'PENDING' : r.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
    sourceStatus: r.status,
    requester: person(r.recordedByUid, student, 'student'),
    details: detailList([
      ['Student', `${student} (${r.student.registrationNo})`],
      ['University', university],
      ['Programme', programme],
      ['Admission year', r.admissionYear],
      ['NCHE batch reference', r.ncheBatchRef],
      ['Evidence cited', r.claimProofNote],
    ]),
    createdAt: r.createdAt,
    decidedAt: r.verifiedAt,
    decidedBy: r.verifiedByUid ? person(r.verifiedByUid, names.get(r.verifiedByUid) ?? '') : null,
    decisionNotes: r.rejectionReason,
  })
}

export const placementClaimAdapter: ApprovalAdapter = {
  source: 'placement_claim',
  // placementService.approveClaim/rejectClaim already send the student a
  // placement-update notification.
  notifiesRequester: true,

  async list(q) {
    const statuses = expandStatuses(q.statuses, PLACEMENT_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.universityPlacement.findMany({
      where: {
        entrySource: 'STUDENT_CLAIM',
        status: { in: statuses },
        ...(q.requesterUid ? { recordedByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: placementInclude,
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.map((r) => r.verifiedByUid))
    return rows.map((r) => placementItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.universityPlacement.groupBy({
      by: ['status'],
      where: {
        entrySource: 'STUDENT_CLAIM',
        ...(requesterUid ? { recordedByUid: requesterUid } : {}),
      },
      _count: { _all: true },
    })
    return rows.length ? tally(rows, PLACEMENT_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.universityPlacement.findUnique({ where: { id }, include: placementInclude })
    if (!r || r.entrySource !== 'STUDENT_CLAIM') return null
    return placementItem(r, await lookupNames([r.verifiedByUid]))
  },

  async approve(id, actor) {
    await placementService.approveClaim(id, actor.uid, actor.role)
  },

  async reject(id, actor, input) {
    await placementService.rejectClaim(id, { reason: input.notes }, actor.uid, actor.role)
  },
}
