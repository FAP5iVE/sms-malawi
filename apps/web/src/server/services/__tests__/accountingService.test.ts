/**
 * accountingService.test.ts
 * [CHANGE TYPE]: TARGETED EDIT (R19 — unit-test suite repair).
 *
 * The nonexistent `postJournalEntry` is replaced by the real
 * `createJournalEntry` (which validates that debits equal credits, resolves
 * account codes, and returns the new entry id string). The former
 * "empty lines throws" case is dropped because the real function treats an
 * empty line set as trivially balanced; it is replaced by the real
 * unknown-account-code rejection path.
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
