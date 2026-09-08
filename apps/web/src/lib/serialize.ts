// apps/web/src/lib/serialize.ts
//
// [CHANGE TYPE]: NEW FILE
// [PURPOSE]: Fixes a real, live bug reported against the Invoice Entry &
//   Allocation screen: "Total Fixed Fees" (and every other client-side
//   sum) showed an enormous, garbled figure like "MK
//   3,000,020,000,020,000.00" instead of the correct total.
//
//   Root cause: Prisma's Decimal type (FeeStructure.amount,
//   InvoiceLineItem.amount/balance, Invoice.totalAmount/balance, etc.)
//   defines a toJSON() that returns a STRING (its decimal.js base class's
//   default). Every route in finances.ts that did `res.json(prismaResult)`
//   directly therefore sent those fields to the client as strings, even
//   though every Api* type in @shared/types/api declares them `number`.
//   Reading and *displaying* a string amount through formatMWK() still
//   worked (Intl.NumberFormat coerces its input), which is why individual
//   fee-line amounts looked correct — but summing them client-side with
//   `+` / .reduce() does JS string concatenation instead of addition the
//   moment either operand is a string, producing exactly this kind of
//   nonsense figure.
//
//   The fix belongs here, not scattered as Number(...) calls across every
//   frontend arithmetic site: a number-typed API field should actually BE
//   a number. serializeDecimals() walks a response body and converts any
//   Decimal instance (at any nesting depth — line items nested inside an
//   invoice, an invoice nested inside a balance response, etc.) to a real
//   number via toNumber() before res.json() sends it.
// [DEPENDS ON]: @prisma/client/runtime/library (Decimal — the same import
//   this repo's bulkInvoiceService.ts already used for the same class)
import 'server-only'

import { Decimal } from '@prisma/client/runtime/library'

export function serializeDecimals<T>(value: T): T {
  if (value instanceof Decimal) {
    return value.toNumber() as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => serializeDecimals(v)) as unknown as T
  }
  if (value instanceof Date) {
    return value
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = serializeDecimals(v)
    }
    return result as T
  }
  return value
}
