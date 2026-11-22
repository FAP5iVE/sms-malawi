/**
 * apps/web/test/fakePrisma.ts — a tiny in-memory stand-in for the slice of the
 * Prisma client the reporting services use, so a service can be run end to end
 * against a controlled dataset with independently calculated expected values.
 *
 * Supports: create (appends the row) / groupBy (by, where, _count, _sum, _min, _max) / findMany / findFirst + findUnique (orderBy, take) / count / aggregate(_sum, _count) with where-clauses made
 * of equality, in, notIn, gt, gte, lt, lte, not, OR, AND and nested relation objects.
 * `select` / `include` are ignored: rows are returned whole, so fixtures carry
 * any nested relation (e.g. an invoice's `student`) directly.
 */
type Row = Record<string, unknown>

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v)

const cmp = (a: unknown, b: unknown): number => {
  const x = a instanceof Date ? a.getTime() : Number(a)
  const y = b instanceof Date ? b.getTime() : Number(b)
  return x - y
}

function matchValue(actual: unknown, cond: unknown): boolean {
  if (isPlainObject(cond)) {
    const keys = Object.keys(cond)
    const operators = ['in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'not', 'equals']
    if (keys.length > 0 && keys.every((k) => operators.includes(k))) {
      return keys.every((k) => {
        const c = cond[k]
        switch (k) {
          case 'in': return (c as unknown[]).includes(actual)
          case 'notIn': return !(c as unknown[]).includes(actual)
          case 'gt': return actual !== null && actual !== undefined && cmp(actual, c) > 0
          case 'gte': return actual !== null && actual !== undefined && cmp(actual, c) >= 0
          case 'lt': return actual !== null && actual !== undefined && cmp(actual, c) < 0
          case 'lte': return actual !== null && actual !== undefined && cmp(actual, c) <= 0
          case 'not': return !matchValue(actual, c)
          default: return actual === c
        }
      })
    }
    // Nested relation filter.
    return isPlainObject(actual) && matches(actual, cond)
  }
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime()
  return actual === cond
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w))
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w))
    return matchValue(row[key], cond)
  })
}

type OrderBy = Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[]

interface Args {
  where?: Row
  orderBy?: OrderBy
  take?: number
  _sum?: Record<string, boolean>
  _max?: Record<string, boolean>
  _min?: Record<string, boolean>
  _count?: { _all?: boolean } | boolean
  by?: string[]
}

function select(rows: Row[], args: Args): Row[] {
  let hit = rows.filter((r) => matches(r, args.where))
  if (args.orderBy) {
    const keys = (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]).flatMap((o) => Object.entries(o))
    hit = [...hit].sort((a, b) => {
      for (const [k, dir] of keys) {
        const c = cmp(a[k], b[k])
        if (c !== 0) return dir === 'desc' ? -c : c
      }
      return 0
    })
  }
  return args.take === undefined ? hit : hit.slice(0, args.take)
}

export function makeTable(rows: Row[]) {
  return {
    findMany: async (args: Args = {}) => select(rows, args),
    findFirst: async (args: Args = {}) => select(rows, args)[0] ?? null,
    findUnique: async (args: Args = {}) => select(rows, args)[0] ?? null,
    groupBy: async (args: Args) => {
      const by = args.by ?? []
      const groups = new Map<string, Row[]>()
      for (const r of rows.filter((x) => matches(x, args.where))) {
        const key = JSON.stringify(by.map((k) => (r[k] instanceof Date ? (r[k] as Date).toISOString() : r[k] ?? null)))
        groups.set(key, [...(groups.get(key) ?? []), r])
      }
      return [...groups.values()].map((g) => {
        const out: Row = {}
        for (const k of by) out[k] = g[0]?.[k]
        if (args._count) out._count = args._count === true ? g.length : { _all: g.length }
        const agg = (name: '_sum' | '_max' | '_min') => {
          const spec = args[name]
          if (!spec) return
          const res: Record<string, unknown> = {}
          for (const k of Object.keys(spec)) {
            const vals = g.map((r) => r[k]).filter((v) => v !== null && v !== undefined)
            if (vals.length === 0) res[k] = null
            else if (name === '_sum') res[k] = vals.reduce<number>((t, v) => t + Number(v), 0)
            else res[k] = vals.reduce((m, v) => ((name === '_max' ? cmp(v, m) > 0 : cmp(v, m) < 0) ? v : m))
          }
          out[name] = res
        }
        agg('_sum'); agg('_max'); agg('_min')
        return out
      })
    },
    create: async (args: { data: Row }) => {
      const row = { id: `new-${rows.length + 1}`, ...args.data }
      rows.push(row)
      return row
    },
    count: async (args: Args = {}) => rows.filter((r) => matches(r, args.where)).length,
    aggregate: async (args: Args = {}) => {
      const hit = rows.filter((r) => matches(r, args.where))
      const _sum: Record<string, number | null> = {}
      for (const k of Object.keys(args._sum ?? {})) {
        _sum[k] = hit.length === 0 ? null : hit.reduce((s, r) => s + Number(r[k] ?? 0), 0)
      }
      return { _sum, _count: { _all: hit.length } }
    },
  }
}

export type FakeTables = Record<string, Row[]>

export function makeFakePrisma(tables: FakeTables) {
  return Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, makeTable(rows)]))
}
