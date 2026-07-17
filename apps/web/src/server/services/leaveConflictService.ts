/*
 * apps/web/src/server/services/leaveConflictService.ts — Phase D9
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R11 — HR Domain: Loans UI, Leave-Conflict Wiring & Directory
 *   Access Correction
 * [PURPOSE]: This file is not named in R11's change list — the roadmap
 *   describes HR as "confirmed uniformly correct — zero schema
 *   field-name mismatches" and instructs only that hrService.reviewLeave()
 *   call checkLeaveConflicts() before an APPROVED transition. Reading
 *   this file in full (required to wire that call correctly) surfaced
 *   that it does not match the real schema at all:
 *   1. `import { settingsService } from '...'` — settingsService.ts has
 *      no such named export; it exports individual functions
 *      (get/getMany/set/...). Corrected to `import * as settingsService`.
 *   2. `settingsService.get<number>('leave_max_concurrent_pct')` — no
 *      such setting key exists anywhere in SETTING_KEYS. The real,
 *      already-seeded key for exactly this purpose is
 *      SETTING_KEYS.HR_MAX_CONCURRENT_LEAVE_PCT (default 30, matching
 *      the `.catch(() => 30)` fallback this file already assumed) — the
 *      same "correctly-built settings infrastructure referenced by the
 *      wrong key" pattern R10 fixed for PAYE brackets and pension
 *      percent.
 *   3. `prisma.staffProfile.findUnique({ where: { staffId: ... } })` —
 *      StaffProfile has no `staffId` field; its primary key is `id`
 *      (LeaveRequest.staffId is a FK to StaffProfile.id, not the other
 *      way around). Corrected to `where: { id: ... }`.
 *   4. Three separate queries filtered `staff: { staffProfile: { ... } }`
 *      — a double-nested relation that does not exist.
 *      LeaveRequest.staff is a direct, one-hop relation to StaffProfile
 *      (`fields: [staffId], references: [id]`); StaffProfile has no
 *      `staffProfile` field on itself. Corrected to the direct
 *      `staff: { ... }` shape in getTeamLeaveSnapshot() and both
 *      department/critical-role checks in checkLeaveConflicts().
 *   Had this function been wired in as R11 instructs without these
 *   fixes, every leave approval would have thrown (Prisma rejects an
 *   unknown field at query time) — this phase's own headline deliverable
 *   would have been non-functional, not merely unwired.
 *   No behavioral logic is changed beyond these corrections — the
 *   conflict-detection rules (date overlap, team threshold, critical-role
 *   coverage) are exactly as originally designed.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (StaffProfile.role is now
 *   a StaffRole enum, same phase — CRITICAL_ROLES is typed against it)
 */

import 'server-only'
import { prisma }            from '@/lib/prisma'
import * as settingsService  from '@/server/services/settingsService'
import { SETTING_KEYS }      from '@shared/types/settings'
import type { StaffRole }    from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ConflictType = 'DATE_OVERLAP' | 'TEAM_THRESHOLD' | 'CRITICAL_ROLE'

export interface LeaveConflict {
  type:     ConflictType
  severity: 'BLOCKING' | 'WARNING'
  message:  string
  detail?:  string
}

export interface ConflictCheckResult {
  hasBlockingConflicts: boolean
  hasWarnings:          boolean
  conflicts:            LeaveConflict[]
}

// Roles considered critical — absence requires explicit sign-off
const CRITICAL_ROLES: StaffRole[] = ['exam_officer', 'high_rank', 'admin']

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT CHECK
// ─────────────────────────────────────────────────────────────────────────────

export async function checkLeaveConflicts(opts: {
  staffId:     string
  startDate:   Date
  endDate:     Date
  leaveType:   string
  requestId?:  string   // exclude the current request from overlap check
}): Promise<ConflictCheckResult> {
  const conflicts: LeaveConflict[] = []

  // ── 1. Personal date overlap ──────────────────────────────────────────────
  const overlappingLeave = await prisma.leaveRequest.findFirst({
    where: {
      staffId: opts.staffId,
      id:      opts.requestId ? { not: opts.requestId } : undefined,
      status:  { in: ['APPROVED', 'PENDING'] },
      AND: [
        { startDate: { lte: opts.endDate   } },
        { endDate:   { gte: opts.startDate } },
      ],
    },
    select: { id: true, leaveType: true, startDate: true, endDate: true, status: true },
  })

  if (overlappingLeave) {
    conflicts.push({
      type:     'DATE_OVERLAP',
      severity: 'BLOCKING',
      message:  'Staff already has an overlapping leave request.',
      detail:   `${overlappingLeave.status} ${overlappingLeave.leaveType} leave from ${overlappingLeave.startDate.toLocaleDateString('en-GB')} to ${overlappingLeave.endDate.toLocaleDateString('en-GB')}`,
    })
  }

  // ── 2. Department headcount threshold ────────────────────────────────────
  const threshold = await settingsService.get(SETTING_KEYS.HR_MAX_CONCURRENT_LEAVE_PCT)

  const staffProfile = await prisma.staffProfile.findUnique({
    where:  { id: opts.staffId },
    select: { department: true, role: true },
  })

  if (staffProfile?.department) {
    const deptTotal = await prisma.staffProfile.count({
      where: { department: staffProfile.department, status: 'ACTIVE' },
    })

    const concurrentLeaves = await prisma.leaveRequest.count({
      where: {
        status: 'APPROVED',
        staff:  { department: staffProfile.department },
        AND: [
          { startDate: { lte: opts.endDate   } },
          { endDate:   { gte: opts.startDate } },
        ],
      },
    })

    const concurrentPct = deptTotal > 0
      ? Math.round(((concurrentLeaves + 1) / deptTotal) * 100)
      : 0

    if (concurrentPct > threshold) {
      conflicts.push({
        type:     'TEAM_THRESHOLD',
        severity: 'WARNING',
        message:  `Approving this leave would result in ${concurrentPct}% of the ${staffProfile.department} department being absent simultaneously (threshold: ${threshold}%).`,
        detail:   `${concurrentLeaves} other staff member(s) already approved for overlapping dates out of ${deptTotal} total.`,
      })
    }
  }

  // ── 3. Critical role check ────────────────────────────────────────────────
  if (staffProfile?.role && CRITICAL_ROLES.includes(staffProfile.role)) {
    // Check if another staff member of the same role is covering
    const coverExists = await prisma.leaveRequest.findFirst({
      where: {
        staffId: { not: opts.staffId },
        status:  'APPROVED',
        AND: [
          { startDate: { lte: opts.endDate   } },
          { endDate:   { gte: opts.startDate } },
        ],
        staff: { role: staffProfile.role },
      },
    })

    if (!coverExists) {
      conflicts.push({
        type:     'CRITICAL_ROLE',
        severity: 'WARNING',
        message:  `This staff member holds a critical role (${staffProfile.role}). Ensure cover is arranged before approving.`,
      })
    }
  }

  return {
    hasBlockingConflicts: conflicts.some((c) => c.severity === 'BLOCKING'),
    hasWarnings:          conflicts.some((c) => c.severity === 'WARNING'),
    conflicts,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM LEAVE SNAPSHOT
// Returns all approved leave for a department in a date range.
// Used by the LeaveConflictWarning component to show a visual calendar.
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamLeaveEntry {
  staffId:   string
  fullName:  string
  leaveType: string
  startDate: Date
  endDate:   Date
  days:      number
}

export async function getTeamLeaveSnapshot(
  department: string,
  from:        Date,
  to:          Date,
): Promise<TeamLeaveEntry[]> {
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      status: 'APPROVED',
      staff:  { department },
      AND: [
        { startDate: { lte: to   } },
        { endDate:   { gte: from } },
      ],
    },
    include: {
      staff: { select: { firstName: true, lastName: true, id: true } },
    },
    orderBy: { startDate: 'asc' },
  })

  return leaves.map((l) => {
    const diffMs = l.endDate.getTime() - l.startDate.getTime()
    const days   = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1
    return {
      staffId:   l.staffId,
      fullName:  `${l.staff.firstName} ${l.staff.lastName}`,
      leaveType: l.leaveType,
      startDate: l.startDate,
      endDate:   l.endDate,
      days,
    }
  })
}
