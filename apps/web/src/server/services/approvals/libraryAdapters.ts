/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/libraryAdapters.ts
 * [PURPOSE]: Hub adapters for the Library — fine-waiver requests, book /
 *   resource recommendations, and digital-resource uploads awaiting
 *   approval. Decisions delegate to libraryWorkflowService / libraryService.
 *
 *   Digital resources only surface while pending: DigitalResource has a plain
 *   `approved` flag with no reject state, and every already-approved upload
 *   would otherwise flood the Approved tab with rows that never needed review.
 */

import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { APPROVAL_STATUSES, type ApprovalStatus } from '@shared/constants/approvals'
import * as libraryWorkflowService from '@/server/services/libraryWorkflowService'
import * as libraryService from '@/server/services/libraryService'
import type { AdapterItem, ApprovalAdapter } from './types'
import {
  dateFilter, detailList, emptyCounts, expandStatuses, fullName, humanize,
  lookupNames, makeItem, money, person, tally,
} from './helpers'

function toStatus(raw: string): ApprovalStatus {
  return (APPROVAL_STATUSES as readonly string[]).includes(raw) ? (raw as ApprovalStatus) : 'PENDING'
}

const STRING_STATUS: Record<ApprovalStatus, readonly string[]> = {
  PENDING: ['PENDING'],
  APPROVED: ['APPROVED'],
  REJECTED: ['REJECTED'],
  CANCELLED: [],
  EXPIRED: [],
}

// ─── FINE WAIVERS ─────────────────────────────────────────

const waiverInclude = {
  fine: { select: { bookTitle: true, studentId: true, staffId: true, amount: true, reason: true } },
} satisfies Prisma.FineWaiverRequestInclude

type WaiverRow = Prisma.FineWaiverRequestGetPayload<{ include: typeof waiverInclude }>

async function waiverItems(rows: WaiverRow[]): Promise<AdapterItem[]> {
  const studentIds = Array.from(new Set(rows.map((r) => r.fine.studentId).filter((v): v is string => !!v)))
  const [students, names] = await Promise.all([
    studentIds.length
      ? prisma.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, firstName: true, lastName: true, registrationNo: true },
        })
      : Promise.resolve([]),
    lookupNames(rows.flatMap((r) => [r.requestedByUid, r.reviewedByUid])),
  ])
  const studentById = new Map(students.map((s) => [s.id, s]))

  return rows.map((r) => {
    const student = r.fine.studentId ? studentById.get(r.fine.studentId) : undefined
    const borrower = student
      ? `${fullName(student.firstName, student.lastName)} (${student.registrationNo})`
      : r.fine.staffId
        ? 'Staff borrower'
        : 'Unknown borrower'
    return makeItem('fine_waiver', {
      sourceId: r.id,
      title: `Waive fine — ${r.fine.bookTitle}`,
      summary: r.reason,
      status: toStatus(r.status),
      sourceStatus: r.status,
      requester: person(r.requestedByUid, names.get(r.requestedByUid) ?? ''),
      amount: Number(r.amount),
      details: detailList([
        ['Borrower', borrower],
        ['Book', r.fine.bookTitle],
        ['Fine amount', money(r.fine.amount)],
        ['Why the fine was raised', r.fine.reason],
        ['Amount to waive', money(r.amount)],
        ['Reason for waiver', r.reason],
      ]),
      createdAt: r.createdAt,
      decidedAt: r.reviewedAt,
      decidedBy: r.reviewedByUid ? person(r.reviewedByUid, names.get(r.reviewedByUid) ?? '') : null,
      decisionNotes: r.reviewNotes,
    })
  })
}

export const fineWaiverAdapter: ApprovalAdapter = {
  source: 'fine_waiver',

  async list(q) {
    const statuses = expandStatuses(q.statuses, STRING_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.fineWaiverRequest.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { requestedByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: waiverInclude,
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    return waiverItems(rows)
  },

  async counts(requesterUid) {
    const rows = await prisma.fineWaiverRequest.groupBy({
      by: ['status'],
      where: requesterUid ? { requestedByUid: requesterUid } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, STRING_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.fineWaiverRequest.findUnique({ where: { id }, include: waiverInclude })
    if (!r) return null
    const [item] = await waiverItems([r])
    return item ?? null
  },

  async approve(id, actor) {
    await libraryWorkflowService.approveFineWaiver(id, actor.uid)
  },

  async reject(id, actor, input) {
    await libraryWorkflowService.rejectFineWaiver(id, input.notes, actor.uid)
  },
}

// ─── BOOK / RESOURCE RECOMMENDATIONS ──────────────────────

type RecommendationRow = Prisma.ResourceRecommendationGetPayload<Record<string, never>>

function recommendationItem(r: RecommendationRow, names: Map<string, string>): AdapterItem {
  const requesterName = r.requesterName?.trim() || names.get(r.requestedByUid) || ''
  return makeItem('book_recommendation', {
    sourceId: r.id,
    title: `Recommend: ${r.title}`,
    summary: r.reason,
    status: toStatus(r.status),
    sourceStatus: r.status,
    requester: person(r.requestedByUid, requesterName, r.requesterRole),
    details: detailList([
      ['Title', r.title],
      ['Author', r.author],
      ['ISBN', r.isbn],
      ['Type', humanize(r.type)],
      ['Subject', r.subject],
      ['Submitted by', [requesterName, r.requesterRole, r.requesterClass].filter(Boolean).join(' · ')],
      ['Why it is recommended', r.reason],
    ]),
    createdAt: r.createdAt,
    decidedAt: r.reviewedAt,
    decidedBy: r.reviewedByUid ? person(r.reviewedByUid, names.get(r.reviewedByUid) ?? '') : null,
    decisionNotes: r.reviewNotes,
  })
}

export const bookRecommendationAdapter: ApprovalAdapter = {
  source: 'book_recommendation',

  async list(q) {
    const statuses = expandStatuses(q.statuses, STRING_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.resourceRecommendation.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { requestedByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.flatMap((r) => [r.requestedByUid, r.reviewedByUid]))
    return rows.map((r) => recommendationItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.resourceRecommendation.groupBy({
      by: ['status'],
      where: requesterUid ? { requestedByUid: requesterUid } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, STRING_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.resourceRecommendation.findUnique({ where: { id } })
    if (!r) return null
    return recommendationItem(r, await lookupNames([r.requestedByUid, r.reviewedByUid]))
  },

  async approve(id, actor, input) {
    await libraryWorkflowService.approveRecommendation(id, actor.uid, input.notes)
  },

  async reject(id, actor, input) {
    await libraryWorkflowService.rejectRecommendation(id, actor.uid, input.notes)
  },
}

// ─── DIGITAL RESOURCES (pending only) ─────────────────────

type ResourceRow = Prisma.DigitalResourceGetPayload<Record<string, never>>

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function resourceItem(r: ResourceRow, names: Map<string, string>): AdapterItem {
  return makeItem('digital_resource', {
    sourceId: r.id,
    title: `Digital resource — ${r.title}`,
    summary: [humanize(r.type), r.subject].filter(Boolean).join(' · '),
    status: r.approved ? 'APPROVED' : 'PENDING',
    sourceStatus: r.approved ? 'APPROVED' : 'AWAITING_APPROVAL',
    requester: person(r.uploadedByUid, names.get(r.uploadedByUid) ?? ''),
    details: detailList([
      ['Title', r.title],
      ['Type', humanize(r.type)],
      ['Subject', r.subject],
      ['Form', r.form ? `Form ${r.form}` : 'All forms'],
      ['Academic year', r.academicYear],
      ['File size', formatBytes(r.fileSize)],
      ['Format', r.mimeType],
    ]),
    createdAt: r.createdAt,
    decidedAt: r.approvedAt,
    decidedBy: r.approvedByUid ? person(r.approvedByUid, names.get(r.approvedByUid) ?? '') : null,
  })
}

export const digitalResourceAdapter: ApprovalAdapter = {
  source: 'digital_resource',

  async list(q) {
    if (q.statuses && !q.statuses.includes('PENDING')) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.digitalResource.findMany({
      where: {
        approved: false,
        ...(q.requesterUid ? { uploadedByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.map((r) => r.uploadedByUid))
    return rows.map((r) => resourceItem(r, names))
  },

  async counts(requesterUid) {
    const pending = await prisma.digitalResource.count({
      where: { approved: false, ...(requesterUid ? { uploadedByUid: requesterUid } : {}) },
    })
    return { ...emptyCounts(), PENDING: pending }
  },

  async get(id) {
    const r = await prisma.digitalResource.findUnique({ where: { id } })
    if (!r) return null
    return resourceItem(r, await lookupNames([r.uploadedByUid, r.approvedByUid]))
  },

  async approve(id, actor) {
    await libraryService.approveDigitalResource(id, actor.uid)
  },
}
