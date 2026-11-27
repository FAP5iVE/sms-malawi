/**
 * accountingService.test.ts
 * [CHANGE TYPE]: TARGETED EDIT (R19 — unit-test suite repair).
 *
 * The nonexistent `postJournalEntry` is replaced by the real
 * `createJournalEntry` (which validates that debits equal credits, resolves
 * account codes, and returns the new entry id string). The former
 * "empty lines throws" case was replaced by the unknown-account-code
 * rejection path.
 *
 * [P1-05] An entry now needs at least two lines, each with an amount above zero
 * on exactly one side (CHK-01), and is created as a draft that records who
 * created it, its kind, its source document, line numbers and line dimensions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chartOfAccount: { findMany: vi.fn() },
    journalEntry:   { create: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import * as accounting from '../accountingService'

const mp = prisma as unknown as {
  chartOfAccount: { findMany: ReturnType<typeof vi.fn> }
  journalEntry:   { create: ReturnType<typeof vi.fn> }
}

const entryDate = new Date('2025-10-01')

describe('accountingService.createJournalEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mp.chartOfAccount.findMany.mockResolvedValue([
      { id: 'acc-1001', code: '1001' },
      { id: 'acc-4001', code: '4001' },
    ])
    mp.journalEntry.create.mockResolvedValue({ id: 'je-1' })
  })

  it('creates a balanced journal entry (debits = credits) and returns its id', async () => {
    const id = await accounting.createJournalEntry({
      reference:   'PAY-001',
      description: 'Fee payment received',
      entryDate,
      actorUid:    'uid-1',
      lines: [
        { accountCode: '1001', debit: 10000, credit: 0,     description: 'Cash received' },
        { accountCode: '4001', debit: 0,     credit: 10000, description: 'Fee revenue' },
      ],
    })
    expect(id).toBe('je-1')
  })

  it('throws when debits do not equal credits', async () => {
    await expect(
      accounting.createJournalEntry({
        reference:   'BAD-001',
        description: 'Unbalanced entry',
        entryDate,
        actorUid:    'uid-1',
        lines: [
          { accountCode: '1001', debit: 500, credit: 0,   description: 'Debit' },
          { accountCode: '4001', debit: 0,   credit: 400, description: 'Credit' },
        ],
      }),
    ).rejects.toThrow(/balanced/)
  })

  it('throws for an unknown account code', async () => {
    mp.chartOfAccount.findMany.mockResolvedValueOnce([{ id: 'acc-1001', code: '1001' }])
    await expect(
      accounting.createJournalEntry({
        reference:   'UNK-001',
        description: 'Unknown account',
        entryDate,
        actorUid:    'uid-1',
        lines: [
          { accountCode: '1001', debit: 100, credit: 0,   description: 'Debit' },
          { accountCode: '9999', debit: 0,   credit: 100, description: 'Credit' },
        ],
      }),
    ).rejects.toThrow(/Unknown account code/)
  })
})

describe('accountingService.createJournalEntry [P1-05]', () => {
  const header = { reference: 'P105', description: 'rules', entryDate, actorUid: 'uid-1' }
  const good = [{ accountCode: '1001', debit: 100 }, { accountCode: '4001', credit: 100 }]

  beforeEach(() => {
    vi.clearAllMocks()
    mp.chartOfAccount.findMany.mockResolvedValue([
      { id: 'acc-1001', code: '1001' },
      { id: 'acc-4001', code: '4001' },
    ])
    mp.journalEntry.create.mockResolvedValue({ id: 'je-1' })
  })

  const refused = async (lines: accounting.JournalLineInput[], message: RegExp) => {
    const err = await accounting.createJournalEntry({ ...header, lines }).catch((e) => e)
    expect(err).toBeInstanceOf(accounting.LedgerError)
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
    expect(err.message).toMatch(message)
    expect(mp.journalEntry.create).not.toHaveBeenCalled()
  }

  it('refuses an entry with no lines', async () => {
    await refused([], /at least two lines/)
  })

  it('refuses an entry with one line', async () => {
    await refused([{ accountCode: '1001', debit: 100 }], /at least two lines/)
  })

  it.each<[string, accounting.JournalLineInput]>([
    ['both sides filled', { accountCode: '1001', debit: 5, credit: 5 }],
    ['both sides zero', { accountCode: '1001', debit: 0, credit: 0 }],
    ['an amount that rounds to zero', { accountCode: '1001', debit: 0.001 }],
  ])('refuses a line with %s, although the entry balances', async (_n, bad) => {
    await refused([...good, bad], /Journal line 3 \(account 1001\)/)
  })

  it('refuses negative amounts, although the entry balances', async () => {
    await refused([{ accountCode: '1001', debit: -100 }, { accountCode: '4001', credit: -100 }], /Journal line 1/)
  })

  it('creates a DRAFT that records the creator, the kind and the line numbers', async () => {
    await accounting.createJournalEntry({ ...header, lines: good })
    const data = mp.journalEntry.create.mock.calls[0]![0].data
    expect(data).toMatchObject({ status: 'DRAFT', isPosted: false, entryKind: 'NORMAL', createdByUid: 'uid-1' })
    expect(data.lines.create.map((l: { lineNumber: number }) => l.lineNumber)).toEqual([1, 2])
    // The entry number is the database's job: the service never sends one.
    expect(data).not.toHaveProperty('entryNumber')
  })

  it('stores the kind, the source document and the line dimensions it is given', async () => {
    const dims = {
      memo: 'term 3', financialAccountId: 'fa1', partyType: 'SUPPLIER' as const,
      partyId: 'sup1', budgetId: 'b1', departmentId: 'd1',
    }
    await accounting.createJournalEntry({
      ...header, entryKind: 'ADJUSTMENT', sourceType: 'EXPENSE', sourceId: 'exp1',
      lines: [{ ...good[0]!, ...dims }, good[1]!],
    })
    const data = mp.journalEntry.create.mock.calls[0]![0].data
    expect(data).toMatchObject({ entryKind: 'ADJUSTMENT', sourceType: 'EXPENSE', sourceId: 'exp1' })
    expect(data.lines.create[0]).toMatchObject(dims)
  })

  it('an entry that names the entry it reverses is a REVERSAL unless told otherwise', async () => {
    await accounting.createJournalEntry({ ...header, reversalOfId: 'je-0', lines: good })
    expect(mp.journalEntry.create.mock.calls[0]![0].data.entryKind).toBe('REVERSAL')
  })
})
