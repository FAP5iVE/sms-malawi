// @vitest-environment node
/**
 * Guardian portal: schema <-> migration agreement.
 *
 * The migration is hand-maintained SQL (no `prisma migrate dev` in CI here), so this
 * test parses prisma/schema.prisma and the migration with SEPARATE code and proves
 * they describe the same tables, columns, nullability, types, enum values, uniques,
 * indexes and foreign-key delete rules. It also proves the migration is additive
 * only, that Prisma relation pairs are symmetric, and that no plaintext secret column
 * exists. Run `prisma migrate diff` as well when a database is available.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const webRoot = path.resolve(__dirname, '../../../..')
const read = (p: string) => fs.readFileSync(path.join(webRoot, p), 'utf8').replace(/\r\n/g, '\n')

const MIGRATION_DIR = 'prisma/migrations/20261104120000_guardian_portal'
const schemaAll = read('prisma/schema.prisma')
const sql = read(`${MIGRATION_DIR}/migration.sql`)
const schema = schemaAll.slice(schemaAll.indexOf('// GUARDIAN PORTAL'))

// ── schema parsing ───────────────────────────────────────────────────────────
interface Field { name: string; type: string; list: boolean; optional: boolean; attrs: string }
interface Model { name: string; table: string; fields: Field[]; attrs: string[] }
const SCALARS = new Set(['String', 'Int', 'Boolean', 'DateTime', 'Json'])

function parseEnums(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const m of src.matchAll(/^enum (\w+) \{\n([\s\S]*?)\n\}/gm)) {
    out[m[1]!] = m[2]!.split('\n').map((l) => l.split('//')[0]!.trim()).filter(Boolean)
  }
  return out
}
function parseModels(src: string): Model[] {
  const models: Model[] = []
  for (const m of src.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)) {
    const fields: Field[] = []
    const attrs: string[] = []
    for (const raw of m[2]!.split('\n')) {
      const line = raw.split('//')[0]!.trim()
      if (!line) continue
      if (line.startsWith('@@')) { attrs.push(line); continue }
      const f = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line)
      if (f) fields.push({ name: f[1]!, type: f[2]!, list: !!f[3], optional: !!f[4], attrs: f[5] ?? '' })
    }
    const table = /@@map\("([^"]+)"\)/.exec(attrs.join(' '))?.[1] ?? m[1]!
    models.push({ name: m[1]!, table, fields, attrs })
  }
  return models
}

const enums = parseEnums(schema)
const models = parseModels(schema)
const allModels = parseModels(schemaAll)
const modelNames = new Set(allModels.map((m) => m.name))

// ── SQL parsing ──────────────────────────────────────────────────────────────
function sqlEnums(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const m of sql.matchAll(/CREATE TYPE "(\w+)" AS ENUM \(([^)]*)\)/g)) {
    out[m[1]!] = [...m[2]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!)
  }
  return out
}
interface Col { name: string; type: string; notNull: boolean; def: string | null }
function sqlTable(table: string): Col[] {
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS "${table}" \\(\\n([\\s\\S]*?)\\n\\);`).exec(sql)
  if (!m) throw new Error(`no CREATE TABLE for ${table}`)
  const cols: Col[] = []
  for (const line of m[1]!.split('\n')) {
    const t = line.trim().replace(/,$/, '')
    if (t.startsWith('CONSTRAINT')) continue
    const c = /^"(\w+)"\s+("?[\w()\[\]]+"?)(\s+NOT NULL)?(?:\s+DEFAULT\s+(.+))?$/.exec(t)
    if (!c) throw new Error(`cannot parse column line: ${t}`)
    cols.push({ name: c[1]!, type: c[2]!, notNull: !!c[3], def: c[4] ?? null })
  }
  return cols
}
const SQL_TYPE: Record<string, string> = { String: 'TEXT', Int: 'INTEGER', Boolean: 'BOOLEAN', DateTime: 'TIMESTAMP(3)', Json: 'JSONB' }

describe('guardian migration: enums', () => {
  const se = sqlEnums()
  it('every schema enum exists in the migration with identical ordered values', () => {
    for (const [name, vals] of Object.entries(enums)) expect(se[name], name).toEqual(vals)
  })
  it('the migration creates no enum the schema does not declare', () => {
    expect(Object.keys(se).sort()).toEqual(Object.keys(enums).sort())
  })
  it('enum creation is guarded so the migration can be re-run', () => {
    for (const name of Object.keys(enums)) expect(sql).toContain(`typname = '${name}'`)
  })
})

describe('guardian migration: tables and columns', () => {
  it('declares the expected eight tables', () => {
    expect(models.map((m) => m.table).sort()).toEqual([
      'guardian_access_logs', 'guardian_contacts', 'guardian_invitations', 'guardian_link_requests',
      'guardian_links', 'guardian_onboarding_batches', 'guardian_onboarding_items', 'guardian_profiles',
    ])
  })

  for (const model of models) {
    it(`${model.table}: columns, types, nullability and defaults match the schema`, () => {
      const cols = sqlTable(model.table)
      const scalar = model.fields.filter((f) => SCALARS.has(f.type) || f.type in enums)
      expect(cols.map((c) => c.name).sort()).toEqual(scalar.map((f) => f.name).sort())
      for (const f of scalar) {
        const col = cols.find((c) => c.name === f.name)!
        const base = SCALARS.has(f.type) ? SQL_TYPE[f.type]! : `"${f.type}"`
        expect(col.type, `${model.table}.${f.name} type`).toBe(f.list ? `${base}[]` : base)
        // Prisma: a scalar list is NOT NULL; otherwise NOT NULL iff not optional.
        expect(col.notNull, `${model.table}.${f.name} not null`).toBe(f.list ? true : !f.optional)
        const d = /@default\(([\w\-]+(?:\(\))?|\[\])\)/.exec(f.attrs)
        if (d && d[1] !== 'cuid()') {
          const want = d[1] === 'now()' ? 'CURRENT_TIMESTAMP' : d[1] === '[]' ? 'ARRAY[]::TEXT[]'
            : /^(true|false|-?\d+)$/.test(d[1]!) ? d[1] : `'${d[1]}'`
          expect(col.def, `${model.table}.${f.name} default`).toBe(want)
        } else {
          expect(col.def, `${model.table}.${f.name} should have no default`).toBeNull()
        }
      }
    })

    it(`${model.table}: primary key, uniques and indexes use Prisma's names`, () => {
      expect(sql).toContain(`CONSTRAINT "${model.table}_pkey" PRIMARY KEY ("id")`)
      for (const f of model.fields.filter((x) => /@unique\b/.test(x.attrs))) {
        expect(sql).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS "${model.table}_${f.name}_key" ON "${model.table}"("${f.name}")`)
      }
      for (const a of model.attrs) {
        const m = /^@@(unique|index)\(\[([^\]]+)\]\)/.exec(a)
        if (!m) continue
        const cols = m[2]!.split(',').map((c) => c.trim())
        const name = `${model.table}_${cols.join('_')}${m[1] === 'unique' ? '_key' : '_idx'}`
        expect(name.length).toBeLessThanOrEqual(63)
        expect(sql).toContain(
          `CREATE ${m[1] === 'unique' ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS "${name}" ON "${model.table}"(${cols.map((c) => `"${c}"`).join(', ')})`,
        )
      }
    })
  }

  it('creates no index the schema does not declare', () => {
    const declared = new Set<string>()
    for (const model of models) {
      for (const f of model.fields.filter((x) => /@unique\b/.test(x.attrs))) declared.add(`${model.table}_${f.name}_key`)
      for (const a of model.attrs) {
        const m = /^@@(unique|index)\(\[([^\]]+)\]\)/.exec(a)
        if (m) declared.add(`${model.table}_${m[2]!.split(',').map((c) => c.trim()).join('_')}${m[1] === 'unique' ? '_key' : '_idx'}`)
      }
    }
    const actual = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "([^"]+)"/g)].map((m) => m[1]!)
    expect(actual.sort()).toEqual([...declared].sort())
  })
})

describe('guardian migration: foreign keys', () => {
  const DELETE_SQL: Record<string, string> = { Cascade: 'CASCADE', Restrict: 'RESTRICT', SetNull: 'SET NULL' }
  const expected: { table: string; field: string; refTable: string; onDelete: string }[] = []
  for (const model of models) {
    for (const f of model.fields.filter((x) => modelNames.has(x.type) && !x.list)) {
      const r = /@relation\((?:"[^"]*",\s*)?fields:\s*\[(\w+)\],\s*references:\s*\[(\w+)\](?:,\s*onDelete:\s*(\w+))?/.exec(f.attrs)
      if (!r) continue
      const target = allModels.find((m) => m.name === f.type)!
      expected.push({ table: model.table, field: r[1]!, refTable: target.table, onDelete: r[3] ?? 'MISSING' })
    }
  }

  it('finds the 12 relations the design calls for, each with an explicit delete rule', () => {
    expect(expected).toHaveLength(12)
    for (const e of expected) expect(e.onDelete, `${e.table}.${e.field}`).not.toBe('MISSING')
  })

  it('every relation has a guarded FK with the same delete rule and ON UPDATE CASCADE', () => {
    for (const e of expected) {
      const name = `${e.table}_${e.field}_fkey`
      const block = new RegExp(`conname = '${name}'[\\s\\S]*?ADD CONSTRAINT "${name}"\\s+FOREIGN KEY \\("${e.field}"\\) REFERENCES "${e.refTable}"\\("id"\\)\\s+ON DELETE ${DELETE_SQL[e.onDelete]} ON UPDATE CASCADE`)
      expect(block.test(sql), name).toBe(true)
    }
    expect([...sql.matchAll(/ADD CONSTRAINT "([^"]+)"/g)]).toHaveLength(expected.length)
  })

  it('a link is never silently orphaned: student and profile are RESTRICT, the contact card is SET NULL', () => {
    const byField = (t: string, f: string) => expected.find((e) => e.table === t && e.field === f)!.onDelete
    expect(byField('guardian_links', 'studentId')).toBe('Restrict')
    expect(byField('guardian_links', 'profileId')).toBe('Restrict')
    expect(byField('guardian_links', 'directoryEntryId')).toBe('SetNull')
  })
})

describe('guardian migration: safety properties', () => {
  const stripped = sql.replace(/--.*$/gm, '')

  it('is additive only: no DROP, no data statements, and ALTER TABLE only adds FKs to new tables', () => {
    expect(stripped).not.toMatch(/\bDROP\b/i)
    // Statements only (line-leading): `ON DELETE` / `ON UPDATE` in FK clauses are fine.
    expect(stripped).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/im)
    for (const m of stripped.matchAll(/ALTER TABLE "(\w+)"\s+(\w+ \w+)/g)) {
      expect(m[1]!.startsWith('guardian_'), m[1]).toBe(true)
      expect(m[2]).toBe('ADD CONSTRAINT')
    }
    // Existing tables may be REFERENCED by a new FK, but never created or altered here.
    expect(stripped).not.toMatch(/(CREATE TABLE( IF NOT EXISTS)?|ALTER TABLE)\s+"(students|student_guardians)"/)
  })

  it('every statement that could fail on re-run is guarded', () => {
    expect(stripped.match(/CREATE TABLE/g)!.length).toBe(stripped.match(/CREATE TABLE IF NOT EXISTS/g)!.length)
    expect(stripped.match(/CREATE (UNIQUE )?INDEX/g)!.length).toBe(stripped.match(/CREATE (UNIQUE )?INDEX IF NOT EXISTS/g)!.length)
  })

  it('stores only a hash of invitation secrets: no plaintext code/secret/token/otp column anywhere', () => {
    for (const model of models) {
      for (const f of model.fields) {
        expect(f.name, `${model.table}.${f.name}`).not.toMatch(/^(code|secret|token|otp|password|pin)$/i)
      }
    }
    expect(models.find((m) => m.table === 'guardian_invitations')!.fields.map((f) => f.name)).toContain('secretHash')
  })

  it('sorts after every migration that existed when it was written', () => {
    // Later migrations may follow it; what matters is that nothing sorts between the
    // last pre-guardian migration and this one, so it applies on top of them.
    const dirs = fs.readdirSync(path.join(webRoot, 'prisma/migrations')).filter((d) => /^\d{14}_/.test(d)).sort()
    const at = dirs.indexOf('20261104120000_guardian_portal')
    expect(at).toBeGreaterThan(0)
    expect(dirs[at - 1]).toBe('20261104010000_application_welfare_home')
  })
})

describe('guardian schema: Prisma relation validity', () => {
  it('every relation field has a counterpart on the target model (Prisma requires both sides)', () => {
    for (const model of allModels) {
      for (const f of model.fields.filter((x) => modelNames.has(x.type))) {
        const target = allModels.find((m) => m.name === f.type)!
        const nameMatch = /@relation\("([^"]+)"/.exec(f.attrs)
        const counterparts = target.fields.filter((t) => t.type === model.name && (nameMatch ? new RegExp(`@relation\\("${nameMatch[1]}"`).test(t.attrs) : true))
        const guardianTouch = model.name.startsWith('Guardian') || f.type.startsWith('Guardian') || f.name === 'portalLinks' || f.name === 'guardianLinks'
        if (!guardianTouch) continue
        expect(counterparts.length, `${model.name}.${f.name} -> ${f.type}`).toBeGreaterThan(0)
      }
    }
  })

  it('a self-relation with SetNull is optional (Prisma rejects SetNull on a required field)', () => {
    for (const model of allModels.filter((m) => m.name.startsWith('Guardian') || m.name === 'StudentGuardian')) {
      for (const f of model.fields) {
        const r = /fields:\s*\[(\w+)\].*onDelete:\s*SetNull/.exec(f.attrs)
        if (!r) continue
        expect(model.fields.find((x) => x.name === r[1])!.optional, `${model.name}.${r[1]}`).toBe(true)
      }
    }
  })

  it('leaves the existing student_guardians contact-card table untouched', () => {
    const sg = allModels.find((m) => m.name === 'StudentGuardian')!
    expect(sg.table).toBe('student_guardians')
    expect(sg.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['fullName', 'relation', 'phone', 'isPrimary', 'isFeePayer', 'isEmergencyContact']))
  })
})
