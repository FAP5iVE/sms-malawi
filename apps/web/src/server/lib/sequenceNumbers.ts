/*
 * apps/web/src/server/lib/sequenceNumbers.ts
 *
 * [CHANGE TYPE]: NEW FILE (R22)
 * [PURPOSE]: Generalizes studentService.ts's existing nextRegistrationNo()
 *   pattern (PREFIX-YYYY-NNNN, per-year sequence, read-then-retry-on-P2002)
 *   for every new human-readable number in R22: requisitionNumber,
 *   poNumber, rfqNumber, quotationNumber, receiptNumber, stocktakeNumber.
 *   Same approach, same caveat: two concurrent creates can both read the
 *   same "last" sequence before either writes; the actual duplicate is
 *   only caught by the field's own @unique constraint (P2002), at which
 *   point the caller should recompute and retry.
 * [DEPENDS ON]: apps/web/src/lib/prisma
 */
import 'server-only'
import { Prisma } from '@prisma/client'

export const SEQUENCE_MAX_ATTEMPTS = 5

export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

/**
 * @param prefix e.g. "PR" -> produces "PR-2026-0001"
 * @param findLast a query returning the current year's highest-numbered value's
 *   full string field (e.g. `(p) => prisma.purchaseRequisition.findFirst({ where: { requisitionNumber: { startsWith: p } }, orderBy: { requisitionNumber: 'desc' }, select: { requisitionNumber: true } })`)
 */
export async function nextSequenceNumber(
  prefix: string,
  findLast: (yearPrefix: string) => Promise<{ [key: string]: string } | null>,
  field: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const yearPrefix = `${prefix}-${year}-`

  const last = await findLast(yearPrefix)
  const lastSeq = last ? parseInt(String(last[field]).replace(yearPrefix, ''), 10) : 0
  const nextSeq = lastSeq + 1
  return `${yearPrefix}${String(nextSeq).padStart(4, '0')}`
}
