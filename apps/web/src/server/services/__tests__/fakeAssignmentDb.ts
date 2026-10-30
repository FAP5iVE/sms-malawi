/**
 * fakeAssignmentDb.ts - an in-memory stand-in for the slice of Prisma that
 * assignmentService uses, for unit tests.
 *
 * It does NOT hand-feed answers: it EVALUATES the `where` clauses the service
 * generates (AND / OR / in / not / gt / contains / `attachments.some` / `assignment.is`)
 * against the fixture rows, so the service's real visibility scoping is what decides
 * what a test viewer can see. It also enforces the one-file-one-record unique
 * constraint (throwing a P2002-coded error like Prisma does). An unsupported
 * operator throws, so a test can never silently pass on a clause it did not evaluate.
 */
import { vi } from 'vitest'

// A database row is arbitrary by nature here (any model, any column): deliberately loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export interface Seed {
  classes: Row[]
  csa: Row[]            // class-subject-teacher rows
  students: Row[]
  assignments: Row[]
  submissions?: Row[]
  views?: Row[]
  attachments?: Row[]
  staff?: Row[]
}

function matches(rec: Row, where: Row | undefined, db: Seed): boolean {
  if (!where) return true
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND') { if (!(v as Row[]).every((w) => matches(rec, w, db))) return false; continue }
    if (k === 'OR') { if (!(v as Row[]).some((w) => matches(rec, w, db))) return false; continue }
    if (k === 'attachments') {
      const some = (v as Row).some
      if (!(db.attachments ?? []).some((a) => a.assignmentId === rec.id && matches(a, some, db))) return false
      continue
    }
    if (k === 'assignment') {
      const parent = db.assignments.find((a) => a.id === rec.assignmentId)
      if (!parent || !matches(parent, (v as Row).is ?? v, db)) return false
      continue
    }
    const val = rec[k]
    if (v === null) { if (val != null) return false; continue }
    if (v instanceof Date) { if (!(val instanceof Date) || val.getTime() !== v.getTime()) return false; continue }
    if (typeof v === 'object') {
      const op = v as Row
      if ('in' in op) { if (!op.in.includes(val)) return false; continue }
      if ('not' in op) { if (op.not === null ? val == null : val === op.not) return false; continue }
      if ('gt' in op) { if (!(val > op.gt)) return false; continue }
      if ('gte' in op) { if (!(val >= op.gte)) return false; continue }
      if ('lt' in op) { if (!(val < op.lt)) return false; continue }
      if ('contains' in op) { if (!String(val ?? '').includes(op.contains)) return false; continue }
      throw new Error(`fake db: unsupported where operator on "${k}": ${JSON.stringify(op)}`)
    }
    if (val !== v) return false
  }
  return true
}

// A real client hands back COPIES: mutating a returned row must not change the stored one.
const copy = <T>(v: T): T => (Array.isArray(v) ? (v.map((x) => copy(x)) as unknown as T) : v && typeof v === 'object' && !(v instanceof Date) ? ({ ...(v as object) } as T) : v)

const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
let idCounter = 0
const nextId = (p: string) => `${p}_${++idCounter}`

export function createFakeDb(seed: Seed) {
  const db: Seed = {
    ...seed,
    submissions: seed.submissions ?? [], views: seed.views ?? [], attachments: seed.attachments ?? [], staff: seed.staff ?? [],
  }
  const find = (rows: Row[], where?: Row) => rows.filter((r) => matches(r, where, db))

  const withRelations = (a: Row, args: Row = {}) => {
    const subWhere = args.select?.submissions?.where ?? args.include?.submissions?.where
    const viewWhere = args.select?.views?.where ?? args.include?.views?.where
    return {
      ...a,
      _count: { attachments: db.attachments!.filter((x) => x.assignmentId === a.id).length },
      attachments: db.attachments!.filter((x) => x.assignmentId === a.id),
      submissions: db.submissions!.filter((s) => s.assignmentId === a.id && matches(s, subWhere, db)),
      views: db.views!.filter((v) => v.assignmentId === a.id && matches(v, viewWhere, db)),
    }
  }

  const prisma: Row = {
    class: {
      findUnique: vi.fn(async ({ where }: Row) => copy(db.classes.find((c) => c.id === where.id) ?? null)),
      findMany: vi.fn(async ({ where }: Row) => copy(find(db.classes, where))),
    },
    classSubjectAssignment: {
      findMany: vi.fn(async ({ where }: Row) => copy(find(db.csa, where))),
      findUnique: vi.fn(async ({ where }: Row) => {
        const w = where.classId_subject_academicYear
        return db.csa.find((r) => r.classId === w.classId && r.subject === w.subject && r.academicYear === w.academicYear) ?? null
      }),
    },
    student: {
      findFirst: vi.fn(async ({ where }: Row) => copy(find(db.students, where)[0] ?? null)),
      findMany: vi.fn(async ({ where }: Row) => copy(find(db.students, where))),
      findUnique: vi.fn(async ({ where }: Row) => copy(db.students.find((s) => s.id === where.id) ?? null)),
    },
    staffProfile: { findMany: vi.fn(async () => db.staff!) },
    assignment: {
      findFirst: vi.fn(async (args: Row) => { const a = find(db.assignments, args.where)[0]; return a ? copy(withRelations(a, args)) : null }),
      findMany: vi.fn(async (args: Row) => find(db.assignments, args.where).map((a) => copy(withRelations(a, args)))),
      findUnique: vi.fn(async ({ where }: Row) => copy(db.assignments.find((a) => a.id === where.id) ?? null)),
      count: vi.fn(async ({ where }: Row) => find(db.assignments, where).length),
      create: vi.fn(async ({ data }: Row) => {
        const { attachments, ...rest } = data
        const created: Row = { id: nextId('asg'), createdAt: new Date(), updatedAt: new Date(), ...rest }
        for (const a of attachments?.create ?? []) {
          if (db.attachments!.some((x) => x.fileKey === a.fileKey)) throw uniqueViolation()
          db.attachments!.push({ id: nextId('att'), assignmentId: created.id, createdAt: new Date(), ...a })
        }
        db.assignments.push(created)
        return copy(created)
      }),
      update: vi.fn(async ({ where, data }: Row) => {
        const rec = db.assignments.find((a) => a.id === where.id)!
        const { attachments, ...rest } = data
        Object.assign(rec, rest, { updatedAt: new Date(rec.updatedAt.getTime() + 1000) })
        if (attachments?.deleteMany) db.attachments = db.attachments!.filter((x) => !(x.assignmentId === rec.id && attachments.deleteMany.id.in.includes(x.id)))
        for (const a of attachments?.create ?? []) {
          if (db.attachments!.some((x) => x.fileKey === a.fileKey)) throw uniqueViolation()
          db.attachments!.push({ id: nextId('att'), assignmentId: rec.id, createdAt: new Date(), ...a })
        }
        return copy(rec)
      }),
      delete: vi.fn(async ({ where }: Row) => {
        db.assignments = db.assignments.filter((a) => a.id !== where.id)
        db.attachments = db.attachments!.filter((x) => x.assignmentId !== where.id)
      }),
    },
    assignmentAttachment: {
      findFirst: vi.fn(async ({ where }: Row) => copy(find(db.attachments!, where)[0] ?? null)),
    },
    assignmentSubmission: {
      findUnique: vi.fn(async ({ where }: Row) => {
        const w = where.assignmentId_studentId
        return copy(db.submissions!.find((s) => s.assignmentId === w.assignmentId && s.studentId === w.studentId) ?? null)
      }),
      findFirst: vi.fn(async ({ where }: Row) => copy(find(db.submissions!, where)[0] ?? null)),
      count: vi.fn(async ({ where }: Row) => find(db.submissions!, where).length),
      deleteMany: vi.fn(async ({ where }: Row) => { const n = find(db.submissions!, where); db.submissions = db.submissions!.filter((s) => !n.includes(s)); return { count: n.length } }),
      upsert: vi.fn(async ({ where, create, update }: Row) => {
        const w = where.assignmentId_studentId
        const existing = db.submissions!.find((s) => s.assignmentId === w.assignmentId && s.studentId === w.studentId)
        const fileKey = (existing ? update : create).fileKey
        if (fileKey && db.submissions!.some((s) => s !== existing && s.fileKey === fileKey)) throw uniqueViolation()
        if (existing) { Object.assign(existing, update, { updatedAt: new Date((existing.updatedAt?.getTime() ?? Date.now()) + 1000) }); return copy(existing) }
        const row: Row = { id: nextId('sub'), submittedAt: new Date(), fileKey: null, fileName: null, note: null, recordedByUid: null,
          marks: null, feedback: null, markedAt: null, markedByUid: null, updatedAt: new Date(), ...create }
        db.submissions!.push(row)
        return copy(row)
      }),
    },
    assignmentView: {
      findUnique: vi.fn(async ({ where }: Row) => {
        const w = where.assignmentId_studentId
        return copy(db.views!.find((v) => v.assignmentId === w.assignmentId && v.studentId === w.studentId) ?? null)
      }),
    },
    $queryRaw: vi.fn(async () => [{ firstViewedAt: new Date('2026-10-01T08:00:00.000Z') }]),
  }
  prisma.$transaction = vi.fn(async (arg: ((tx: typeof prisma) => unknown) | Array<Promise<unknown>>) =>
    (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)))
  return { prisma, db }
}
