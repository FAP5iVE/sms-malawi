/**
 * In-memory GuardianDb for tests: Prisma-like semantics for exactly the operations
 * the guardian services use (defaults, unique constraints, where operators,
 * `updateMany` counts, `include`, and transaction rollback). Delegate bodies are
 * synchronous between check and write, so a single statement is atomic, which is
 * the guarantee the claim race test relies on (a conditional UPDATE is atomic in
 * Postgres).
 */
import type { Delegate, GuardianDb } from '../../db'

// Rows are schemaless on purpose: tests read arbitrary columns (`mem.all('x')[0]!.status`), and
// `unknown` would force a cast at every one of those call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
type RelSpec = { model: string; fk: string; many: boolean; fkOnParent?: boolean }

const DEFAULTS: Record<string, () => Row> = {
  guardianProfile: () => ({ status: 'ACTIVE', createdSource: 'ADMISSION', firebaseUid: null, claimedAt: null, mergedIntoId: null, createdByUid: null }),
  guardianContact: () => ({ verification: 'UNVERIFIED', verifiedAt: null, isPreferred: false }),
  guardianLink: () => ({
    status: 'PENDING', source: 'ADMISSION', evidence: 'NONE', capabilities: [], isPrimaryContact: false,
    isFinancialResponsible: false, directoryEntryId: null, reverifyRequired: false, reverifyReason: null,
    verifiedSnapshot: null, suggestedProfileId: null, suggestedMethod: null, statusReason: null, createdByUid: null,
    approvedByUid: null, approvedAt: null, statusChangedByUid: null, statusChangedAt: null, relationshipNote: null,
  }),
  guardianInvitation: () => ({ status: 'ACTIVE', failedAttempts: 0, lockedAt: null, sentAt: null, claimedAt: null, claimedByUid: null, revokedAt: null, revokedByUid: null, contactId: null }),
  guardianLinkRequest: () => ({ status: 'PENDING', studentId: null, admissionNumber: null, note: null, reviewedByUid: null, reviewedAt: null, reviewNote: null, resultingLinkId: null }),
  guardianOnboardingBatch: () => ({ status: 'DRY_RUN', scope: null, summary: null, appliedAt: null, appliedByUid: null, rolledBackAt: null, rolledBackByUid: null }),
  guardianOnboardingItem: () => ({ reason: null, flags: null, createdProfileId: null, createdLinkId: null, createdContactIds: [] }),
  guardianAccessLog: () => ({ linkId: null, studentId: null, reason: null }),
  studentGuardian: () => ({}),
  student: () => ({}),
  class: () => ({}),
  termResult: () => ({}),
  exam: () => ({}),
  examMark: () => ({}),
  invoice: () => ({}),
  payment: () => ({}),
  attendance: () => ({}),
}

const UNIQUES: Record<string, string[][]> = {
  guardianProfile: [['firebaseUid']],
  guardianContact: [['profileId', 'kind', 'normalizedValue']],
  guardianLink: [['profileId', 'studentId'], ['directoryEntryId']],
  guardianInvitation: [['ref']],
}

const RELS: Record<string, Record<string, RelSpec>> = {
  guardianProfile: {
    contacts: { model: 'guardianContact', fk: 'profileId', many: true },
    links: { model: 'guardianLink', fk: 'profileId', many: true },
  },
  guardianContact: { profile: { model: 'guardianProfile', fk: 'profileId', many: false, fkOnParent: true } },
  guardianLink: {
    profile: { model: 'guardianProfile', fk: 'profileId', many: false, fkOnParent: true },
    student: { model: 'student', fk: 'studentId', many: false, fkOnParent: true },
    directoryEntry: { model: 'studentGuardian', fk: 'directoryEntryId', many: false, fkOnParent: true },
    invitations: { model: 'guardianInvitation', fk: 'linkId', many: true },
  },
  guardianInvitation: {
    link: { model: 'guardianLink', fk: 'linkId', many: false, fkOnParent: true },
    contact: { model: 'guardianContact', fk: 'contactId', many: false, fkOnParent: true },
  },
  guardianOnboardingBatch: { items: { model: 'guardianOnboardingItem', fk: 'batchId', many: true } },
  studentGuardian: {},
  student: {},
  class: {},
  termResult: {},
  exam: {},
  examMark: {},
  invoice: {},
  payment: {},
  attendance: {},
}

const asArray = <T,>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v])

/** Applies a Prisma `data` object to a row, understanding `{ increment: n }`. */
function applyData(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && Object.keys(v).length === 1 && 'increment' in v) {
      row[k] = (Number(row[k]) || 0) + Number((v as Row).increment)
    } else row[k] = v
  }
}

function fieldMatches(val: unknown, cond: unknown): boolean {
  if (cond === null) return val === null || val === undefined
  if (cond instanceof Date) return val instanceof Date && +val === +cond
  if (typeof cond === 'object' && cond !== null && !Array.isArray(cond)) {
    for (const [op, arg] of Object.entries(cond)) {
      switch (op) {
        case 'equals': if (!fieldMatches(val, arg)) return false; break
        case 'in': if (!(arg as unknown[]).some((a) => fieldMatches(val, a))) return false; break
        case 'notIn': if ((arg as unknown[]).some((a) => fieldMatches(val, a))) return false; break
        case 'not': if (fieldMatches(val, arg)) return false; break
        // JS relational operators order numbers, strings and Dates alike; the casts only satisfy the checker
        case 'gt': if (!((val as number) > (arg as number))) return false; break
        case 'gte': if (!((val as number) >= (arg as number))) return false; break
        case 'lt': if (!((val as number) < (arg as number))) return false; break
        case 'lte': if (!((val as number) <= (arg as number))) return false; break
        case 'contains': if (typeof val !== 'string' || !val.toLowerCase().includes(String(arg).toLowerCase())) return false; break
        case 'startsWith': if (typeof val !== 'string' || !val.startsWith(String(arg))) return false; break
        case 'has': if (!Array.isArray(val) || !val.includes(arg)) return false; break
        case 'hasSome': if (!Array.isArray(val) || !(arg as unknown[]).some((a) => val.includes(a))) return false; break
        case 'isEmpty': if (!(Array.isArray(val) && (val.length === 0) === arg)) return false; break
        case 'mode': break
        default: throw new Error(`memoryDb: unsupported operator ${op}`)
      }
    }
    return true
  }
  return val === cond
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND') { if (!asArray(v).every((w: Row) => matches(row, w))) return false; continue }
    if (k === 'OR') { if (!asArray(v).some((w: Row) => matches(row, w))) return false; continue }
    if (k === 'NOT') { if (asArray(v).some((w: Row) => matches(row, w))) return false; continue }
    if (v === undefined) continue          // Prisma: `where: { x: undefined }` is NO FILTER (a classic footgun)
    if (!fieldMatches(row[k], v)) return false
  }
  return true
}

type Undo = () => void

export class MemoryGuardianDb {
  tables: Record<string, Row[]> = {}
  private counter = 0
  private clock = () => new Date()
  /** statements executed, for "no DB work happened" assertions */
  ops: string[] = []

  setClock(fn: () => Date) { this.clock = fn }
  seed(model: string, rows: Row[]) { (this.tables[model] ??= []).push(...rows.map((r) => ({ ...(DEFAULTS[model]?.() ?? {}), ...r }))) }
  all(model: string): Row[] { return this.tables[model] ?? [] }

  private nextId() { return `id${++this.counter}` }

  private uniqueCheck(model: string, candidate: Row, ignoreId?: string) {
    for (const cols of UNIQUES[model] ?? []) {
      if (cols.some((c) => candidate[c] === null || candidate[c] === undefined)) continue
      const clash = this.all(model).find((r) => r.id !== ignoreId && cols.every((c) => r[c] === candidate[c]))
      if (clash) throw Object.assign(new Error(`Unique constraint failed on ${model}(${cols.join(',')})`), { code: 'P2002' })
    }
  }

  private withIncludes(model: string, row: Row, include: Row | undefined): Row {
    const out: Row = { ...row }
    if (!include) return out
    for (const [name, spec] of Object.entries(include)) {
      if (!spec) continue
      const rel = RELS[model]?.[name]
      if (!rel) throw new Error(`memoryDb: unknown relation ${model}.${name}`)
      const nested = typeof spec === 'object' ? (spec as Row).include : undefined
      const where = typeof spec === 'object' ? (spec as Row).where : undefined
      if (rel.many) {
        let list = this.all(rel.model).filter((r) => r[rel.fk] === row.id && matches(r, where))
        list = list.map((r) => this.withIncludes(rel.model, r, nested))
        out[name] = list
      } else {
        const target = this.all(rel.model).find((r) => r.id === row[rel.fk])
        out[name] = target ? this.withIncludes(rel.model, target, nested) : null
      }
    }
    return out
  }

  private order(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
    if (!orderBy) return rows
    const specs = asArray<Row>(orderBy).flatMap((o) => Object.entries(o))
    return [...rows].sort((a, b) => {
      for (const [k, dir] of specs) {
        if (a[k] === b[k]) continue
        const cmp = a[k] < b[k] ? -1 : 1
        return dir === 'desc' ? -cmp : cmp
      }
      return 0
    })
  }

  /** `log` is the owning transaction's undo log (null outside a transaction). */
  private delegate(model: string, log: Undo[] | null): Delegate {
    const stamp = (op: string) => this.ops.push(`${model}.${op}`)
    const d: Delegate = {
      findUnique: async (args) => {
        stamp('findUnique')
        const w = args.where
        const row = this.all(model).find((r) => matches(r, w))
        return row ? this.withIncludes(model, row, args.include) : null
      },
      findFirst: async (args = {}) => {
        stamp('findFirst')
        const rows = this.order(this.all(model).filter((r) => matches(r, args.where)), args.orderBy)
        return rows[0] ? this.withIncludes(model, rows[0], args.include) : null
      },
      findMany: async (args = {}) => {
        stamp('findMany')
        let rows = this.order(this.all(model).filter((r) => matches(r, args.where)), args.orderBy)
        if (args.skip) rows = rows.slice(args.skip)
        if (args.take !== undefined) rows = rows.slice(0, args.take)
        return rows.map((r) => this.withIncludes(model, r, args.include))
      },
      create: async (args) => {
        stamp('create')
        const now = this.clock()
        const row: Row = { ...(DEFAULTS[model]?.() ?? {}), id: args.data.id ?? this.nextId(), createdAt: now, updatedAt: now, ...args.data }
        this.uniqueCheck(model, row)
        ;(this.tables[model] ??= []).push(row)
        log?.push(() => { this.tables[model] = this.all(model).filter((r) => r !== row) })
        return this.withIncludes(model, row, args.include)
      },
      createMany: async (args) => {
        stamp('createMany')
        let count = 0
        for (const data of args.data) { await d.create({ data }); count++ }
        return { count }
      },
      update: async (args) => {
        stamp('update')
        const row = this.all(model).find((r) => matches(r, args.where))
        if (!row) throw Object.assign(new Error(`${model}: record to update not found`), { code: 'P2025' })
        const next: Row = { ...row }
        applyData(next, args.data)
        next.updatedAt = this.clock()
        this.uniqueCheck(model, next, row.id)
        const prev = { ...row }
        log?.push(() => { for (const k of Object.keys(row)) delete row[k]; Object.assign(row, prev) })
        Object.assign(row, next)
        return this.withIncludes(model, row, args.include)
      },
      updateMany: async (args) => {
        stamp('updateMany')
        const rows = this.all(model).filter((r) => matches(r, args.where))
        for (const r of rows) {
          const prev = { ...r }
          log?.push(() => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, prev) })
          applyData(r, args.data)
          r.updatedAt = this.clock()
        }
        return { count: rows.length }
      },
      delete: async (args) => {
        stamp('delete')
        const i = this.all(model).findIndex((r) => matches(r, args.where))
        if (i < 0) throw Object.assign(new Error(`${model}: record to delete not found`), { code: 'P2025' })
        const removed = this.tables[model]!.splice(i, 1)[0]!
        log?.push(() => { this.all(model).push(removed) })
        return removed
      },
      deleteMany: async (args) => {
        stamp('deleteMany')
        const keep: Row[] = []; const removed: Row[] = []
        for (const r of this.all(model)) { if (matches(r, args.where)) removed.push(r); else keep.push(r) }
        this.tables[model] = keep
        log?.push(() => { this.all(model).push(...removed) })
        return { count: removed.length }
      },
      count: async (args = {}) => {
        stamp('count')
        return this.all(model).filter((r) => matches(r, args.where)).length
      },
    }
    return d
  }

  /**
   * Build the GuardianDb facade. `$transaction` keeps a per-transaction UNDO LOG and replays
   * it (newest first) if the callback throws, so a failed transaction rolls back only ITS
   * writes: a concurrent transaction that already committed is untouched, as in a real database.
   */
  asDb(): GuardianDb {
    return this.buildDb(null)
  }

  private buildDb(log: Undo[] | null): GuardianDb {
    const d = (model: string) => this.delegate(model, log)
    const db: GuardianDb = {
      guardianProfile: d('guardianProfile'),
      guardianContact: d('guardianContact'),
      guardianLink: d('guardianLink'),
      guardianInvitation: d('guardianInvitation'),
      guardianLinkRequest: d('guardianLinkRequest'),
      guardianOnboardingBatch: d('guardianOnboardingBatch'),
      guardianOnboardingItem: d('guardianOnboardingItem'),
      guardianAccessLog: d('guardianAccessLog'),
      studentGuardian: d('studentGuardian'),
      student: d('student'),
      class: d('class'),
      termResult: d('termResult'),
      exam: d('exam'),
      examMark: d('examMark'),
      invoice: d('invoice'),
      payment: d('payment'),
      attendance: d('attendance'),
      $transaction: async <T,>(fn: (tx: GuardianDb) => Promise<T>): Promise<T> => {
        if (log) return fn(db)                       // nested: joins the outer transaction
        const txLog: Undo[] = []
        const tx = this.buildDb(txLog)
        try { return await fn(tx) }
        catch (e) { for (const undo of txLog.reverse()) undo(); throw e }
      },
    }
    return db
  }
}

export function makeDb() {
  const mem = new MemoryGuardianDb()
  return { mem, db: mem.asDb() }
}
