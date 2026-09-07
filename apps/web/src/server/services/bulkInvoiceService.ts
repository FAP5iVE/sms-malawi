// apps/web/src/server/services/bulkInvoiceService.ts
//
// [CHANGE TYPE]: MAJOR REWRITE
// [PURPOSE]: Fixes the confirmed defect flagged in the project's own audit:
//   bulkGenerateInvoices() built Invoice rows directly with
//   `prisma.invoice.create()` and NEVER created any InvoiceLineItem rows --
//   every bulk-generated invoice had zero line items under the per-fee-type
//   line-item architecture feeService.generateInvoice() already uses (see
//   InvoiceLineItem/PaymentAllocation/StudentCredit in schema.prisma), so
//   recordPayment() had nothing to allocate a payment against. It also
//   picked applicable fees by manually filtering ALL active FeeStructure
//   rows on classId only -- ignoring the mandatory/optional distinction
//   entirely, so a student who never enrolled in Transport or Boarding
//   would still have been billed for it the moment those fee types
//   existed in the catalog.
//
//   This rewrite does not reimplement invoice creation: it calls
//   feeService.generateInvoice() per eligible student -- the exact same
//   function the Invoice Entry & Allocation screen uses -- so a
//   bulk-generated invoice and a manually-generated one are, correctly,
//   indistinguishable. What this file adds on top is pure orchestration:
//     1. getEligibleFeeStructuresForStudent() (feeService) resolves the
//        real per-student fee set -- mandatory-by-class/term, plus any
//        actively COMMITTED optional add-on (see StudentFeeCommitment) --
//        replacing the old manual classId-only filter.
//     2. The four "Accounting Rules & Fee Automation" checkboxes map
//        directly onto real options: includeMandatory/
//        includeEnrolledOptional narrow which fee types are eligible;
//        applyScholarships/consumeAdvanceCredit are passed straight
//        through to feeService's chargeOptions, which already supported
//        toggling both.
//     3. dryRun: true computes the exact same figures via
//        feeService.computeInvoiceCharges() (the same accounting engine
//        generateInvoice() itself calls) without persisting anything --
//        this is the "PRE-EXECUTION DRY RUN ROSTER" preview. dryRun:
//        false (or omitted) actually calls generateInvoice() and commits.
//     4. "Carry Forward Prior Arrears" is not a checkbox that changes what
//        gets billed -- each term's Invoice is intentionally its own row
//        (see schema.prisma's @@unique([studentId, academicYear, term])).
//        It is a report-only figure: sumPriorArrears() adds up whatever
//        balance is still outstanding on this student's OTHER invoices
//        this academic year, so the roster shows the family's real total
//        exposure without silently merging past-term debt into a new
//        term's invoice total.
//     5. "Double-Billing Safe": a student who already has an invoice for
//        this exact (academicYear, term) is never billed again --
//        reported as EXISTING (still UNPAID -- safe to leave alone) or
//        SKIPPED (already PARTIAL/PAID/OVERDUE -- must not be touched),
//        exactly as the original file's semantics already were; this
//        rewrite keeps that distinction, it just fixes what happens on an
//        actual CREATED row.
import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as feeService from '@/server/services/feeService'
import type { BulkGenerateInvoicesInput } from '@shared/schemas/finance'

// ─────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────

export type InvoiceOutcome = 'CREATED' | 'EXISTING' | 'SKIPPED' | 'ERROR'

export interface StudentInvoiceResult {
  studentId: string
  registrationNo: string
  fullName: string
  classId: string
  className: string
  outcome: InvoiceOutcome
  invoiceId?: string
  totalAmount?: number
  discount?: number
  scholarshipAbsorbed?: number
  advanceCreditConsumed?: number
  priorArrears?: number
  lineItemCount?: number
  error?: string
}

export interface BulkInvoiceResult {
  academicYear: string
  term: number
  created: number
  existing: number
  skipped: number
  errors: number
  totalRevenue: number
  students: StudentInvoiceResult[]
}

// ─────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────

/** Report-only figure -- see header note 4. Never merged into the new
 *  invoice's own total; the roster shows it alongside so the bursar sees
 *  the family's full picture. */
async function sumPriorArrears(studentId: string, academicYear: string, term: number): Promise<number> {
  const priorInvoices = await prisma.invoice.findMany({
    where: { studentId, academicYear, term: { not: term }, balance: { gt: 0 } },
    select: { balance: true },
  })
  return priorInvoices.reduce((sum, inv) => sum + Number(inv.balance), 0)
}

// ─────────────────────────────────────────────────────────────────────────
// CORE
// ─────────────────────────────────────────────────────────────────────────

export async function bulkGenerateInvoices(
  input: BulkGenerateInvoicesInput,
  actorUid: string,
  actorRole: string
): Promise<BulkInvoiceResult> {
  const {
    classId, academicYear, term,
    includeMandatory, includeEnrolledOptional,
    applyScholarships, consumeAdvanceCredit,
    studentIds, dryRun,
  } = input

  // An explicit studentIds list (the roster rows still checked after a
  // dry-run preview) always narrows the run to exactly those students,
  // regardless of the cohort classId that produced that preview.
  const students = await prisma.student.findMany({
    where: {
      status: 'ACTIVE',
      ...(studentIds?.length ? { id: { in: studentIds } } : classId !== 'ALL' ? { classId } : {}),
    },
    include: { class: { select: { id: true, name: true } } },
  })

  const results: StudentInvoiceResult[] = []
  let created = 0
  let existing = 0
  let skipped = 0
  let errors = 0
  let totalRevenue = 0

  for (const student of students) {
    const base = {
      studentId: student.id,
      registrationNo: student.registrationNo,
      fullName: `${student.firstName} ${student.lastName}`,
      classId: student.classId ?? '',
      className: student.class?.name ?? '—',
    }

    try {
      if (!student.class) {
        results.push({ ...base, outcome: 'SKIPPED', error: 'No class assigned' })
        skipped++
        continue
      }

      const priorArrears = await sumPriorArrears(student.id, academicYear, term)

      // Double-billing guard -- see header note 5.
      const existingInvoice = await prisma.invoice.findUnique({
        where: { studentId_academicYear_term: { studentId: student.id, academicYear, term } },
      })
      if (existingInvoice) {
        const outcome: InvoiceOutcome = existingInvoice.status !== 'UNPAID' ? 'SKIPPED' : 'EXISTING'
        results.push({
          ...base,
          outcome,
          invoiceId: existingInvoice.id,
          totalAmount: Number(existingInvoice.totalAmount),
          priorArrears,
        })
        if (outcome === 'SKIPPED') skipped++
        else existing++
        continue
      }

      const eligibleFees = await feeService.getEligibleFeeStructuresForStudent(student.id, academicYear, term, {
        includeMandatory,
        includeOptionalCommitted: includeEnrolledOptional,
      })
      if (eligibleFees.length === 0) {
        results.push({ ...base, outcome: 'SKIPPED', error: 'No applicable fees for this student', priorArrears })
        skipped++
        continue
      }
      const feeStructureIds = eligibleFees.map((f) => f.id)

      if (dryRun) {
        // Preview only -- the exact same accounting engine
        // (feeService.computeInvoiceCharges()) generateInvoice() itself
        // calls below, just without the persistence step.
        const charges = await feeService.computeInvoiceCharges(student.id, academicYear, feeStructureIds, {
          applyScholarship: applyScholarships,
          consumeCredit: consumeAdvanceCredit,
        })
        results.push({
          ...base,
          outcome: 'CREATED',
          totalAmount: charges.totalAmount,
          discount: charges.discount,
          scholarshipAbsorbed: charges.discount,
          advanceCreditConsumed: charges.creditApplied,
          priorArrears,
          lineItemCount: eligibleFees.length,
        })
        created++
        totalRevenue += charges.totalAmount
        continue
      }

      const invoice = await feeService.generateInvoice(
        { studentId: student.id, academicYear, term, feeStructureIds },
        actorUid,
        actorRole,
        { applyScholarship: applyScholarships, consumeCredit: consumeAdvanceCredit }
      )

      const scholarshipAbsorbed = Number(invoice.discount)
      // subtotal - discount is "net fees due before credit"; the gap
      // between that and the invoice's actual totalAmount is exactly how
      // much StudentCredit was consumed (see feeService.generateInvoice()).
      const advanceCreditConsumed = Math.max(
        0,
        Math.round((Number(invoice.subtotal) - Number(invoice.discount) - Number(invoice.totalAmount)) * 100) / 100
      )

      results.push({
        ...base,
        outcome: 'CREATED',
        invoiceId: invoice.id,
        totalAmount: Number(invoice.totalAmount),
        discount: scholarshipAbsorbed,
        scholarshipAbsorbed,
        advanceCreditConsumed,
        priorArrears,
        lineItemCount: invoice.lineItems.length,
      })
      created++
      totalRevenue += Number(invoice.totalAmount)
    } catch (err) {
      results.push({ ...base, outcome: 'ERROR', error: err instanceof Error ? err.message : 'Unknown error' })
      errors++
      logger.error({ event: 'bulk-invoice.student-error', studentId: student.id, err })
    }
  }

  logger.info(
    {
      event: dryRun ? 'bulk-invoice.preview' : 'bulk-invoice.done',
      academicYear, term, classId, created, existing, skipped, errors, totalRevenue, actorUid,
    },
    dryRun ? 'Bulk invoice dry-run preview complete' : 'Bulk invoice generation complete'
  )

  return { academicYear, term, created, existing, skipped, errors, totalRevenue, students: results }
}
