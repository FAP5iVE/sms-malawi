/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/pendingActionAdapter.ts
 * [PURPOSE]: Hub adapter for the generic PendingAction table — the
 *   "lower_rank edits a student / class, a reviewer signs it off" workflow.
 *   Approving goes through pendingActionService.approve(), which now applies
 *   the stored change (see pendingActionExecutor.ts).
 */

import 'server-only'
import type { Prisma, PendingActionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PENDING_ACTION_LABELS } from '@shared/constants/pendingActions'
import type { ApprovalModule, ApprovalStatus } from '@shared/constants/approvals'
import * as pendingActionService from '@/server/services/pendingActionService'
import { appliesChange } from '@/server/services/pendingActionExecutor'
import type { ApprovalAdapter, AdapterItem } from './types'
import { dateFilter, detailList, emptyCounts, expandStatuses, humanize, lookupNames, makeItem, person, tally } from './helpers'

const STATUS_TABLE: Record<ApprovalStatus, readonly PendingActionStatus[]> = {
  PENDING: ['PENDING'],
  APPROVED: ['APPROVED'],
  REJECTED: ['REJECTED'],
  CANCELLED: ['CANCELLED'],
  EXPIRED: ['EXPIRED'],
}

function moduleFor(action: string): ApprovalModule {
  if (action.startsWith('class.')) return 'classes'
  if (action.startsWith('timetable.')) return 'academics'
  if (action.startsWith('announcement.')) return 'announcements'
  if (action.startsWith('hr.')) return 'hr'
  if (action.startsWith('application.')) return 'admissions'
  return 'students'
}

function hrefFor(action: string, entityType: string, entityId: string): string {
  const isNew = entityId.startsWith('new:')
  if (entityType === 'Student') return isNew ? '/students' : `/students/${entityId}`
  if (entityType === 'Class') return isNew ? '/classes' : `/classes/${entityId}`
  return moduleFor(action) === 'academics' ? '/timetable' : '/approvals'
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function scalarDetails(state: Record<string, unknown>): Array<readonly [string, string]> {
  const rows: Array<readonly [string, string]> = []
  for (const [key, value] of Object.entries(state)) {
    if (rows.length >= 10) break
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      rows.push([humanize(key.replace(/([a-z])([A-Z])/g, '$1_$2')), String(value)])
    }
  }
  return rows
}

type Row = Prisma.PendingActionGetPayload<Record<string, never>>

function toItem(r: Row, names: Map<string, string>): AdapterItem {
  const state = isPlainObject(r.targetState) ? r.targetState : null
  const label = PENDING_ACTION_LABELS[r.action] ?? humanize(r.action.replace('.', '_'))
  return makeItem('pending_action', {
    sourceId: r.id,
    module: moduleFor(r.action),
    title: label,
    summary: r.description,
    status: r.status,
    sourceStatus: r.status,
    requester: person(r.requestedByUid, names.get(r.requestedByUid) ?? '', r.requestedByRole),
    details: detailList([
      ['Request type', label],
      ['Applies to', r.entityType],
      ['On approval', appliesChange(r.action) ? 'Change is applied automatically' : 'Decision is recorded only'],
      ...(state ? scalarDetails(state) : []),
    ]),
    payload: state,
    createdAt: r.createdAt,
    decidedAt: r.reviewedAt,
    decidedBy: r.reviewedByUid ? person(r.reviewedByUid, names.get(r.reviewedByUid) ?? '') : null,
    decisionNotes: r.reviewNotes,
    expiresAt: r.expiresAt,
    href: hrefFor(r.action, r.entityType, r.entityId),
  })
}

export const pendingActionAdapter: ApprovalAdapter = {
  source: 'pending_action',

  async list(q) {
    const statuses = expandStatuses(q.statuses, STATUS_TABLE)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.pendingAction.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { requestedByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.flatMap((r) => [r.requestedByUid, r.reviewedByUid]))
    return rows.map((r) => toItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.pendingAction.groupBy({
      by: ['status'],
      where: requesterUid ? { requestedByUid: requesterUid } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, STATUS_TABLE) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.pendingAction.findUnique({ where: { id } })
    if (!r) return null
    const names = await lookupNames([r.requestedByUid, r.reviewedByUid])
    return toItem(r, names)
  },

  async approve(id, actor, input) {
    await pendingActionService.approve({
      id,
      reviewedByUid: actor.uid,
      reviewedByRole: actor.role,
      ...(input.notes ? { notes: input.notes } : {}),
    })
  },

  async reject(id, actor, input) {
    await pendingActionService.reject({
      id,
      reviewedByUid: actor.uid,
      reviewedByRole: actor.role,
      notes: input.notes,
    })
  },

  async cancel(id, actor) {
    await pendingActionService.cancel(id, actor.uid, actor.role)
  },
}
