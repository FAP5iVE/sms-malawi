/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/academicAdapters.ts
 * [PURPOSE]: Hub adapters for the academic side — timetable slots created
 *   by an exam officer (awaiting approval) and exam results whose marks have
 *   been finalised (awaiting exam-officer approval).
 *
 *   Both surface while pending only. Admin/high_rank timetable slots are
 *   stamped approved on creation, so "approved" slot rows are mostly
 *   never-reviewed ones, and an Exam moves through many statuses that are
 *   not approval decisions.
 *
 *   The later High-Rank "authorise release" step is deliberately NOT here:
 *   end-of-term results are released for the whole term in unison (RW-4),
 *   which one-exam-at-a-time approvals would bypass — it stays in the
 *   Exams module's Results Release workflow.
 */

import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import * as classService from '@/server/services/classService'
import * as examService from '@/server/services/examService'
import type { AdapterItem, ApprovalAdapter } from './types'
import { dateFilter, detailList, emptyCounts, humanize, lookupNames, makeItem, person, shortDate } from './helpers'

// ─── TIMETABLE SLOTS ──────────────────────────────────────

const slotInclude = {
  class: { select: { name: true } },
} satisfies Prisma.TimetableSlotInclude

type SlotRow = Prisma.TimetableSlotGetPayload<{ include: typeof slotInclude }>

interface SlotOrigin {
  actorUid: string
  actorRole: string
  createdAt: Date
}

/**
 * TimetableSlot has no created-by / created-at columns, but classService
 * writes a `timetable.slot_created` audit entry for every slot. That entry
 * is the only record of who proposed the slot and when, so the hub reads it
 * (this also makes a slot show up under its creator's "My requests").
 */
async function slotOrigins(slotIds: string[]): Promise<Map<string, SlotOrigin>> {
  const out = new Map<string, SlotOrigin>()
  if (slotIds.length === 0) return out
  const rows = await prisma.auditLog.findMany({
    where: { action: 'timetable.slot_created', entityType: 'TimetableSlot', entityId: { in: slotIds } },
    select: { entityId: true, actorUid: true, actorRole: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const r of rows) {
    if (!out.has(r.entityId)) out.set(r.entityId, { actorUid: r.actorUid, actorRole: r.actorRole, createdAt: r.createdAt })
  }
  return out
}

function slotItem(r: SlotRow, teacher: string, origin: SlotOrigin | undefined, requesterName: string): AdapterItem {
  const when = `${humanize(r.day)} ${r.periodStart}–${r.periodEnd}`
  return makeItem('timetable_slot', {
    sourceId: r.id,
    title: `${r.subject} — ${r.class.name}`,
    summary: `${when}, Term ${r.term} ${r.academicYear}`,
    status: r.approvedAt ? 'APPROVED' : 'PENDING',
    sourceStatus: r.approvedAt ? 'APPROVED' : 'AWAITING_APPROVAL',
    requester: person(origin?.actorUid ?? null, requesterName, origin?.actorRole ?? 'exam_officer'),
    details: detailList([
      ['Class', r.class.name],
      ['Subject', r.subject],
      ['Day & period', when],
      ['Teacher', teacher],
      ['Room', r.room],
      ['Slot type', humanize(r.type)],
      ['Term', `Term ${r.term}, ${r.academicYear}`],
    ]),
    createdAt: origin?.createdAt ?? r.approvedAt ?? new Date(),
    decidedAt: r.approvedAt,
    decidedBy: r.approvedByUid ? person(r.approvedByUid, '') : null,
  })
}

async function pendingSlotItems(requesterUid: string | null, take: number): Promise<AdapterItem[]> {
  let idFilter: string[] | null = null
  if (requesterUid) {
    const mine = await prisma.auditLog.findMany({
      where: { action: 'timetable.slot_created', entityType: 'TimetableSlot', actorUid: requesterUid },
      select: { entityId: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    idFilter = mine.map((m) => m.entityId)
    if (idFilter.length === 0) return []
  }
  const rows = await prisma.timetableSlot.findMany({
    where: { approvedAt: null, ...(idFilter ? { id: { in: idFilter } } : {}) },
    include: slotInclude,
    orderBy: [{ academicYear: 'desc' }, { term: 'desc' }, { day: 'asc' }, { periodStart: 'asc' }],
    take,
  })
  const origins = await slotOrigins(rows.map((r) => r.id))
  const names = await lookupNames([
    ...rows.map((r) => r.teacherUid),
    ...Array.from(origins.values()).map((o) => o.actorUid),
  ])
  return rows.map((r) => {
    const origin = origins.get(r.id)
    return slotItem(r, names.get(r.teacherUid) ?? '', origin, origin ? (names.get(origin.actorUid) ?? '') : 'Exam officer')
  })
}

export const timetableSlotAdapter: ApprovalAdapter = {
  source: 'timetable_slot',

  async list(q) {
    if (q.statuses && !q.statuses.includes('PENDING')) return []
    const items = await pendingSlotItems(q.requesterUid, q.take)
    const from = q.dateFrom?.getTime() ?? null
    const to = q.dateTo?.getTime() ?? null
    return items
      .filter((i) => {
        const t = Date.parse(i.createdAt)
        return (from === null || t >= from) && (to === null || t <= to)
      })
      .sort((a, b) => (q.order === 'asc' ? 1 : -1) * (Date.parse(a.createdAt) - Date.parse(b.createdAt)))
  },

  async counts(requesterUid) {
    if (requesterUid) {
      const mine = await pendingSlotItems(requesterUid, 500)
      return { ...emptyCounts(), PENDING: mine.length }
    }
    const pending = await prisma.timetableSlot.count({ where: { approvedAt: null } })
    return { ...emptyCounts(), PENDING: pending }
  },

  async get(id) {
    const r = await prisma.timetableSlot.findUnique({ where: { id }, include: slotInclude })
    if (!r) return null
    const origins = await slotOrigins([id])
    const origin = origins.get(id)
    const names = await lookupNames([r.teacherUid, origin?.actorUid])
    return slotItem(r, names.get(r.teacherUid) ?? '', origin, origin ? (names.get(origin.actorUid) ?? '') : 'Exam officer')
  },

  async approve(id, actor) {
    await classService.approveTimetableSlot(id, actor.uid, actor.role)
  },

  async reject(id, actor, input) {
    await classService.rejectTimetableSlot(id, input.notes, actor.uid, actor.role)
  },
}

// ─── EXAM RESULTS ─────────────────────────────────────────

const examInclude = {
  class: { select: { name: true } },
} satisfies Prisma.ExamInclude

type ExamRow = Prisma.ExamGetPayload<{ include: typeof examInclude }>

function examItem(r: ExamRow, names: Map<string, string>): AdapterItem | null {
  if (r.status !== 'MARKS_FINAL' && r.status !== 'RESULTS_APPROVED' && r.status !== 'RESULTS_RELEASED') return null
  const pending = r.status === 'MARKS_FINAL'
  return makeItem('exam_results', {
    sourceId: r.id,
    title: `${r.title} — ${r.class.name}`,
    summary: `${r.subject} · marks finalised and waiting for approval`,
    status: pending ? 'PENDING' : 'APPROVED',
    sourceStatus: r.status,
    requester: person(r.createdByUid, names.get(r.createdByUid) ?? '', 'academic'),
    details: detailList([
      ['Exam', r.title],
      ['Type', humanize(r.type)],
      ['Subject', r.subject],
      ['Class', r.class.name],
      ['Date', shortDate(r.date)],
      ['Term', `Term ${r.term}, ${r.academicYear}`],
      ['Marked out of', Number(r.maxMark)],
    ]),
    createdAt: r.updatedAt,
  })
}

export const examResultsAdapter: ApprovalAdapter = {
  source: 'exam_results',

  async list(q) {
    if (q.statuses && !q.statuses.includes('PENDING')) return []
    const updatedAt = dateFilter(q)
    const rows = await prisma.exam.findMany({
      where: {
        status: 'MARKS_FINAL',
        ...(q.requesterUid ? { createdByUid: q.requesterUid } : {}),
        ...(updatedAt ? { updatedAt } : {}),
      },
      include: examInclude,
      orderBy: { updatedAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.map((r) => r.createdByUid))
    return rows.flatMap((r) => {
      const item = examItem(r, names)
      return item ? [item] : []
    })
  },

  async counts(requesterUid) {
    const pending = await prisma.exam.count({
      where: { status: 'MARKS_FINAL', ...(requesterUid ? { createdByUid: requesterUid } : {}) },
    })
    return { ...emptyCounts(), PENDING: pending }
  },

  async get(id) {
    const r = await prisma.exam.findUnique({ where: { id }, include: examInclude })
    if (!r) return null
    return examItem(r, await lookupNames([r.createdByUid]))
  },

  async approve(id, actor) {
    await examService.approveResults(id, { uid: actor.uid, role: actor.role })
  },

  // "Send back" rewinds the exam to MARKS_PENDING so the teacher can correct
  // and re-finalise — the existing unlock action, with the reason kept in the
  // hub's audit entry.
  async return(id, actor) {
    await examService.unlockMarks(id, { uid: actor.uid, role: actor.role })
  },
}
