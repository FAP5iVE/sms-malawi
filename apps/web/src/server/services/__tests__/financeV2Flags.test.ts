/**
 * financeV2Flags.test.ts
 * [PLAN]: Finance Hardening Plan P0-03 — "flags toggle code paths in a stub test".
 *
 * Exercises the rollout flags in settingsService against an in-memory stand-in
 * for the SystemSettings table: default OFF, isFinanceV2 reads once from a
 * snapshot, Finance proposes, High Rank decides, the proposer can never
 * decide their own proposal, and every step is audited.
 * (Row-level locking is verified against real Postgres in the integration
 * project — see src/server/__integration__/.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = { key: string; value: unknown; updatedByUid: string | null; updatedAt: Date }

const { table, reads, db, audit } = vi.hoisted(() => {
  const table = new Map<string, Row>()
  const profiles = [
    { uid: 'fin-1', firstName: 'Fiona', lastName: 'Finance' },
    { uid: 'hr-1', firstName: 'Hank', lastName: 'Rank' },
  ]
  const reads = { findMany: 0 }
  const systemSettings = {
    findMany: async ({ where }: { where: { key: { in: string[] } } }) => {
      reads.findMany++
      return where.key.in.flatMap((k) => (table.has(k) ? [table.get(k)!] : []))
    },
    upsert: async ({ where, update, create }: { where: { key: string }; update: Partial<Row>; create: Row }) => {
      const existing = table.get(where.key)
      if (existing) table.set(where.key, { ...existing, ...update, updatedAt: new Date() })
      else table.set(where.key, { ...create, updatedAt: new Date() })
      return table.get(where.key)
    },
    update: async ({ where, data }: { where: { key: string }; data: Partial<Row> }) => {
      const existing = table.get(where.key)!
      table.set(where.key, { ...existing, ...data, updatedAt: new Date() })
      return table.get(where.key)
    },
  }
  const db: Record<string, unknown> = {
    systemSettings,
    staffProfile: {
      findMany: async ({ where }: { where: { uid: { in: string[] } } }) =>
        profiles.filter((p) => where.uid.in.includes(p.uid)),
    },
    // Tagged-template raw query: SELECT "value" ... FOR UPDATE
    $queryRaw: async (_strings: TemplateStringsArray, key: string) =>
      table.has(key) ? [{ value: table.get(key)!.value }] : [],
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  }
  const audit = vi.fn(async (_entry: unknown) => undefined)
  return { table, reads, db, audit }
})

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/redis', () => ({ getRedis: () => null }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/server/services/auditService', () => ({ log: (e: unknown) => audit(e) }))

import * as settings from '../settingsService'
import { FINANCE_V2_FLAG_KEYS, FINANCE_V2_MODULES, SETTING_KEYS, SETTING_META } from '@shared/types/settings'
import { SETTING_VALUE_SCHEMAS } from '@shared/schemas/settings'

const FIN = { uid: 'fin-1', role: 'finance' as const }
const HR = { uid: 'hr-1', role: 'high_rank' as const }

beforeEach(async () => {
  table.clear()
  reads.findMany = 0
  vi.clearAllMocks()
  await settings.invalidateAll()
})

describe('definitions', () => {
  it('has all ten flags, boolean, default OFF, with a schema each', () => {
    expect(FINANCE_V2_MODULES).toHaveLength(10)
    for (const m of FINANCE_V2_MODULES) {
      const key = FINANCE_V2_FLAG_KEYS[m]
      expect(key).toBe(`finance.v2.${m}`)
      expect(SETTING_META[key].defaultValue).toBe(false)
      expect(SETTING_VALUE_SCHEMAS[key].safeParse(true).success).toBe(true)
      expect(SETTING_VALUE_SCHEMAS[key].safeParse('yes').success).toBe(false)
    }
  })

  it('rejects a proposals record stored under the wrong module name', () => {
    const bad = { payroll: { module: 'loans', enabled: true, reason: 'x', proposedByUid: 'u', proposedAt: 'now' } }
    expect(SETTING_VALUE_SCHEMAS[SETTING_KEYS.FINANCE_V2_PROPOSALS].safeParse(bad).success).toBe(false)
  })
})

describe('reading flags', () => {
  it('every flag is OFF when nothing is stored', async () => {
    const flags = await settings.getFinanceV2Flags()
    expect(Object.values(flags).every((v) => v === false)).toBe(true)
    expect(await settings.isFinanceV2('payroll')).toBe(false)
  })

  it('reflects a stored ON flag and treats a malformed value as OFF', async () => {
    table.set('finance.v2.fines', { key: 'finance.v2.fines', value: true, updatedByUid: 'hr-1', updatedAt: new Date() })
    table.set('finance.v2.loans', { key: 'finance.v2.loans', value: 'true', updatedByUid: 'hr-1', updatedAt: new Date() })
    const flags = await settings.getFinanceV2Flags()
    expect(flags.fines).toBe(true)
    expect(flags.loans).toBe(false)
    expect(flags.payroll).toBe(false)
  })

  it('isFinanceV2 uses the snapshot and does not read again', async () => {
    const snapshot = await settings.getFinanceV2Flags()
    const before = reads.findMany
    await settings.isFinanceV2('ledgerEngine', snapshot)
    await settings.isFinanceV2('reports', snapshot)
    expect(reads.findMany).toBe(before)
  })

  it('a code path can branch on the flag (v1 until approved, then v2)', async () => {
    const run = async () => ((await settings.isFinanceV2('fines')) ? 'v2' : 'v1')
    expect(await run()).toBe('v1')
    await settings.proposeFinanceV2Change({ module: 'fines', enabled: true, reason: 'UAT signed' }, FIN)
    expect(await run()).toBe('v1') // a proposal alone changes nothing
    await settings.decideFinanceV2Proposal({ module: 'fines', decision: 'APPROVE' }, HR)
    expect(await run()).toBe('v2')
  })
})

describe('propose', () => {
  it('requires a reason and a known module', async () => {
    await expect(settings.proposeFinanceV2Change({ module: 'payroll', enabled: true, reason: '   ' }, FIN))
      .rejects.toMatchObject({ status: 400 })
    await expect(settings.proposeFinanceV2Change({ module: 'nope' as never, enabled: true, reason: 'x' }, FIN))
      .rejects.toMatchObject({ status: 400 })
    await expect(settings.proposeFinanceV2Change({ module: 'payroll', enabled: true, reason: 'x'.repeat(501) }, FIN))
      .rejects.toMatchObject({ status: 400 })
  })

  it('refuses a proposal that would not change the state', async () => {
    await expect(settings.proposeFinanceV2Change({ module: 'payroll', enabled: false, reason: 'x' }, FIN))
      .rejects.toMatchObject({ status: 409 })
  })

  it('stores one pending proposal per module and audits it', async () => {
    const p = await settings.proposeFinanceV2Change({ module: 'payroll', enabled: true, reason: 'Ready' }, FIN)
    expect(p).toMatchObject({ module: 'payroll', enabled: true, reason: 'Ready', proposedByUid: 'fin-1' })
    await expect(settings.proposeFinanceV2Change({ module: 'payroll', enabled: true, reason: 'Again' }, FIN))
      .rejects.toMatchObject({ status: 409 })
    // a different module is independent
    await settings.proposeFinanceV2Change({ module: 'loans', enabled: true, reason: 'Ready' }, FIN)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'finance.flag_proposed', entityId: 'finance.v2.payroll', actorUid: 'fin-1', actorRole: 'finance',
    }))
  })

  it('shows the pending proposal with names in the rollout state', async () => {
    await settings.proposeFinanceV2Change({ module: 'expenses', enabled: true, reason: 'Ready' }, FIN)
    const rows = await settings.getFinanceV2Rollout()
    expect(rows).toHaveLength(10)
    const row = rows.find((r) => r.module === 'expenses')!
    expect(row.enabled).toBe(false)
    expect(row.pending).toMatchObject({ enabled: true, proposedByName: 'Fiona Finance' })
    expect(rows.find((r) => r.module === 'payroll')!.pending).toBeNull()
    expect(rows.find((r) => r.module === 'payroll')!.lastChangedAt).toBeNull()
  })
})

describe('decide', () => {
  it('the proposer cannot decide their own proposal', async () => {
    await settings.proposeFinanceV2Change({ module: 'payroll', enabled: true, reason: 'Ready' }, HR)
    await expect(settings.decideFinanceV2Proposal({ module: 'payroll', decision: 'APPROVE' }, HR))
      .rejects.toMatchObject({ status: 403 })
    expect(await settings.isFinanceV2('payroll')).toBe(false)
    // proposal is still pending (the failed decision rolled back / changed nothing)
    expect((await settings.getFinanceV2Rollout()).find((r) => r.module === 'payroll')!.pending).not.toBeNull()
  })

  it('approve flips the flag, clears the proposal, records who and when, and audits', async () => {
    await settings.proposeFinanceV2Change({ module: 'payroll', enabled: true, reason: 'Ready' }, FIN)
    const res = await settings.decideFinanceV2Proposal({ module: 'payroll', decision: 'APPROVE', note: 'ok' }, HR)
    expect(res).toEqual({ module: 'payroll', enabled: true, decision: 'APPROVE' })
    const row = (await settings.getFinanceV2Rollout()).find((r) => r.module === 'payroll')!
    expect(row).toMatchObject({ enabled: true, pending: null, lastChangedByUid: 'hr-1', lastChangedByName: 'Hank Rank' })
    expect(row.lastChangedAt).not.toBeNull()
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'finance.flag_approved', actorUid: 'hr-1', actorRole: 'high_rank',
      metadata: { context: expect.objectContaining({ module: 'payroll', requestedState: true, proposedByUid: 'fin-1', decisionNote: 'ok' }) },
    }))
  })

  it('reject clears the proposal and leaves the flag unchanged', async () => {
    await settings.proposeFinanceV2Change({ module: 'loans', enabled: true, reason: 'Ready' }, FIN)
    await settings.decideFinanceV2Proposal({ module: 'loans', decision: 'REJECT' }, HR)
    expect(await settings.isFinanceV2('loans')).toBe(false)
    expect((await settings.getFinanceV2Rollout()).find((r) => r.module === 'loans')!.pending).toBeNull()
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'finance.flag_rejected' }))
  })

  it('a second decision on the same proposal is refused (already decided)', async () => {
    await settings.proposeFinanceV2Change({ module: 'reports', enabled: true, reason: 'Ready' }, FIN)
    await settings.decideFinanceV2Proposal({ module: 'reports', decision: 'APPROVE' }, HR)
    await expect(settings.decideFinanceV2Proposal({ module: 'reports', decision: 'APPROVE' }, { uid: 'hr-2', role: 'high_rank' }))
      .rejects.toMatchObject({ status: 409 })
  })

  it('can switch a module back off through the same workflow', async () => {
    await settings.proposeFinanceV2Change({ module: 'fines', enabled: true, reason: 'On' }, FIN)
    await settings.decideFinanceV2Proposal({ module: 'fines', decision: 'APPROVE' }, HR)
    await settings.proposeFinanceV2Change({ module: 'fines', enabled: false, reason: 'Rollback' }, FIN)
    await settings.decideFinanceV2Proposal({ module: 'fines', decision: 'APPROVE' }, HR)
    expect(await settings.isFinanceV2('fines')).toBe(false)
  })
})
