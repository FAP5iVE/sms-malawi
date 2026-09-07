// apps/web/src/server/services/invoiceNumberService.ts
//
// [CHANGE TYPE]: NEW FILE
// [PURPOSE]: Sequential, human-readable Invoice.invoiceNumber generation
//   (e.g. "INV-2026-0042"), used by feeService.generateInvoice(). Mirrors
//   studentService.ts's nextRegistrationNo()/isUniqueConstraintError()
//   pattern exactly: read the current max sequence for the prefix, then
//   let the invoiceNumber @unique constraint (see schema.prisma) be the
//   real source of truth under concurrency -- a P2002 on that column means
//   two invoices raced for the same sequence, so the caller recomputes and
//   retries rather than trusting the read.
// [DEPENDS ON]: @shared/constants/malawi (generateInvoiceNumber -- pure
//   formatter, see finance.ts's 2026-09-05 addition), studentService.ts's
//   established retry pattern (not imported -- reproduced here, since
//   isUniqueConstraintError is a small, file-local helper there too)
import 'server-only'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { generateInvoiceNumber } from '@shared/constants/malawi'

export const INVOICE_NUMBER_MAX_ATTEMPTS = 5

/** Academic years are stored as "2025/2026" — the invoice number uses the
 *  first (opening) year, matching how the migration backfilled existing
 *  rows. */
function openingYear(academicYear: string): number {
  const year = parseInt(academicYear.slice(0, 4), 10)
  return Number.isFinite(year) ? year : new Date().getFullYear()
}

export async function nextInvoiceNumber(academicYear: string): Promise<string> {
  const year = openingYear(academicYear)
  const prefix = `INV-${year}-`

  const last = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  })

  const lastSeq = last ? parseInt(last.invoiceNumber.replace(prefix, ''), 10) : 0
  const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1
  return generateInvoiceNumber(year, nextSeq)
}

export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

/** True only when the P2002 is specifically on the invoiceNumber unique
 *  constraint -- distinguishes "two requests raced for the same sequence
 *  number" (retryable, by computing a fresh one) from a genuine duplicate
 *  invoice on the (studentId, academicYear, term) constraint, which is a
 *  real conflict that a new invoice number can never fix and must
 *  propagate immediately instead of burning through retry attempts on. */
function isInvoiceNumberCollision(err: unknown): boolean {
  if (!isUniqueConstraintError(err)) return false
  const target = (err as Prisma.PrismaClientKnownRequestError).meta?.target
  const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : []
  return fields.some((f) => String(f).toLowerCase().includes('invoicenumber'))
}

/** Runs `createWithNumber` up to INVOICE_NUMBER_MAX_ATTEMPTS times, handing
 *  it a freshly-computed invoice number each attempt and retrying only on
 *  an invoiceNumber collision. Any other error -- including a genuine
 *  duplicate-invoice conflict -- propagates immediately on the first
 *  attempt, and the attempt ceiling itself also propagates. */
export async function withInvoiceNumber<T>(
  academicYear: string,
  createWithNumber: (invoiceNumber: string) => Promise<T>
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < INVOICE_NUMBER_MAX_ATTEMPTS; attempt++) {
    const invoiceNumber = await nextInvoiceNumber(academicYear)
    try {
      return await createWithNumber(invoiceNumber)
    } catch (err) {
      if (!isInvoiceNumberCollision(err)) throw err
      lastErr = err
      logger.warn(
        { event: 'invoiceNumberService.collision', attempt: attempt + 1, invoiceNumber, academicYear },
        '[invoiceNumberService] Invoice number collision — retrying'
      )
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Failed to generate a unique invoice number after multiple attempts.')
}
