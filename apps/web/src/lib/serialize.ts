// apps/web/src/lib/serialize.ts
//
// [CHANGE TYPE]: NEW FILE, [BUG FIX 2026-09-06]: rewritten same-day after a
//   second live bug report — see below.
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
//   [BUG FIX 2026-09-06] The first version of this fix used `value
//   instanceof Decimal` to detect a Decimal field, importing Decimal from
//   @prisma/client/runtime/library. That broke EVERY money field on the
//   Invoice Entry screen a different way: "MK NaN" everywhere. In a pnpm
//   workspace, the Decimal class this file imports and the Decimal class
//   Prisma's generated client actually constructs query results with can
//   end up as two different physical module instances (pnpm's strict,
//   symlinked node_modules makes this a known, common pitfall for
//   instanceof checks specifically) -- so `instanceof Decimal` silently
//   returned false for genuinely-Decimal values. Every one of those values
//   then fell through to the generic object-recursion branch below, which
//   enumerated a Decimal's own INTERNAL decimal.js fields (`s` the sign,
//   `e` the exponent, `d` the digit array) as if they were ordinary
//   object properties -- producing garbage in place of the real number,
//   which is exactly what turns into NaN the moment the frontend does
//   arithmetic on it or formats it.
//
//   The fix: detect "this is a Decimal" by shape (duck typing — does it
//   have a toNumber() method and decimal.js's characteristic internal
//   fields?) instead of by class identity. This is immune to the
//   module-instance mismatch, because it never depends on which physical
//   copy of the Decimal class constructed the value.
// [DEPENDS ON]: nothing external -- deliberately dependency-free so there
//   is no class-identity assumption left to break a second time.
import 'server-only'

interface DecimalLike {
  toNumber: () => number
  // decimal.js's own internal shape -- sign / exponent / digits. Checking
  // for these (rather than toNumber alone) avoids false-matching some
  // unrelated object that happens to also expose a toNumber() method.
  s: number
  e: number
  d: number[]
}

function isDecimalLike(value: unknown): value is DecimalLike {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.toNumber === 'function' &&
    typeof v.s === 'number' &&
    typeof v.e === 'number' &&
    Array.isArray(v.d)
  )
}

export function serializeDecimals<T>(value: T): T {
  if (isDecimalLike(value)) {
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