/**
 * apps/web/tools/finance-baseline/checks.mts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PLAN]: Finance Hardening Plan — P0-02 "Read-only baseline reconciliation
 *   (measure the real damage)". Part 6 §5.3 (classes), Part 1 §3.3/§4/§5.
 * [PURPOSE]: The exception inventory. Each check is ONE read-only SELECT that
 *   lists the records the plan says are (or may be) wrong TODAY, before any
 *   hardening code runs. The counts and amounts size the repair work (P9)
 *   and set priorities for P1.
 *
 * Rules every check obeys:
 *   • SELECT / WITH only — nothing here can write (a test enforces it, and
 *     the runner also opens a READ ONLY transaction).
 *   • Each row returns exactly three columns:
 *       ref_id  — the record id (or a reference string) to look at
 *       amount  — the MWK amount involved, or NULL when not applicable
 *       detail  — a short note made of ids and numbers only. No names, emails,
 *                 phone numbers or any other personal data (plan P0-02).
 *   • A check REPORTS; it never decides what the correct figure is. Deciding
 *     is P9 (classes A/B/C), done with evidence and approval.
 *
 * Journal references as the code writes them today (Part 1 §3.3):
 *   student payment   PAY-<last 8 of invoice id, upper>   (shared by every payment on the invoice, X-13)
 *   expense approval  EXP-<last 8 of expense id, upper>
 *   expense paid      EXP-PAY-<last 8 of expense id, upper>
 *   library fine      LIB-<last 8 of fine id, upper>
 *   payroll lock      PAY-<yyyy>-<mm>
 *   reversal          VOID-<original reference>            (no link to the original entry, X-13)
 * Because a reversal carries no link, "net postings" for a reference are
 * counted as (entries with the reference) − (entries with VOID-<reference>).
 */

export type CheckGroup =
  | 'Ledger integrity'
  | 'Journal references'
  | 'Receivables'
  | 'Expenses and budgets'
  | 'Procurement'
  | 'Library fines'
  | 'Payroll and loans'
  | 'Orphan references'

export interface BaselineCheck {
  /** Stable id used in the report and CSV, e.g. "RC-03". */
  id: string
  group: CheckGroup
  title: string
  /** Plain-language reason it matters, with the plan IDs it comes from. */
  why: string
  /** The repair class this feeds in Part 6 §5.3 (A mechanical, B adjusting entry, C manual review). */
  repairClass: 'A' | 'B' | 'C' | 'info'
  /** Read-only SELECT returning ref_id, amount, detail. */
  sql: string
}

// SQL fragments ------------------------------------------------------------

/** Posted journal entries joined to their lines and account (one row per line). */
const POSTED_LINES = `
  journal_entries je
  JOIN journal_lines jl ON jl."journalEntryId" = je.id
  JOIN chart_of_accounts ca ON ca.id = jl."accountId"
  WHERE je."isPosted" = true`

/** Net posting count per reference: entries(ref) − entries(VOID-ref), posted only. */
const NET_BY_REF = `
  SELECT ref, SUM(sign)::int AS net, SUM(CASE WHEN sign = 1 THEN 1 ELSE 0 END)::int AS originals,
         SUM(CASE WHEN sign = -1 THEN 1 ELSE 0 END)::int AS reversals
  FROM (
    SELECT CASE WHEN je.reference LIKE 'VOID-%' THEN substr(je.reference, 6) ELSE je.reference END AS ref,
           CASE WHEN je.reference LIKE 'VOID-%' THEN -1 ELSE 1 END AS sign
    FROM journal_entries je
    WHERE je."isPosted" = true
  ) x
  GROUP BY ref`

const PAY_REF = `('PAY-' || upper(right(p."invoiceId", 8)))`
const EXP_REF = `('EXP-' || upper(right(e.id, 8)))`
const EXPPAY_REF = `('EXP-PAY-' || upper(right(e.id, 8)))`
const LIB_REF = `('LIB-' || upper(right(f.id, 8)))`
const PAYROLL_REF = `('PAY-' || r.year::text || '-' || lpad(r.month::text, 2, '0'))`

const PAYMENT_ENTRY_REF_RE = `'^PAY-[0-9A-Z]{8}$'`
const UNIQUE_KIND_RE = `'^(EXP-[0-9A-Z]{8}|EXP-PAY-[0-9A-Z]{8}|LIB-[0-9A-Z]{8}|PAY-[0-9]{4}-[0-9]{2})$'`

export const BASELINE_CHECKS: BaselineCheck[] = [
  // ───────────────────────────── Ledger integrity ─────────────────────────────
  {
    id: 'LG-01', group: 'Ledger integrity', repairClass: 'B',
    title: 'Posted journal entries that do not balance',
    why: 'A1-F1/X-10: the engine tolerates a 0.01 imbalance. Under the new exact rule any difference is a divergence (INV-01).',
    sql: `
      SELECT je.id AS ref_id, SUM(jl.debit) - SUM(jl.credit) AS amount,
             'ref ' || je.reference || ' debit ' || SUM(jl.debit) || ' credit ' || SUM(jl.credit) AS detail
      FROM journal_entries je JOIN journal_lines jl ON jl."journalEntryId" = je.id
      WHERE je."isPosted" = true
      GROUP BY je.id, je.reference
      HAVING SUM(jl.debit) <> SUM(jl.credit)`,
  },
  {
    id: 'LG-02', group: 'Ledger integrity', repairClass: 'C',
    title: 'Posted journal entries with no lines',
    why: 'A1-F3: a posted entry that moves nothing, left by a failure between create and post, or hand-edited.',
    sql: `
      SELECT je.id AS ref_id, NULL::numeric AS amount, 'ref ' || je.reference AS detail
      FROM journal_entries je
      WHERE je."isPosted" = true
        AND NOT EXISTS (SELECT 1 FROM journal_lines jl WHERE jl."journalEntryId" = je.id)`,
  },
  {
    id: 'LG-03', group: 'Ledger integrity', repairClass: 'C',
    title: 'Draft (never posted) journal entries older than one hour',
    why: 'A1-F3/F1: create and post are separate steps; a failure between them leaves a draft behind. Money may be missing from the ledger.',
    sql: `
      SELECT je.id AS ref_id, COALESCE(SUM(jl.debit), 0) AS amount,
             'ref ' || je.reference || ' created ' || to_char(je."createdAt", 'YYYY-MM-DD') AS detail
      FROM journal_entries je LEFT JOIN journal_lines jl ON jl."journalEntryId" = je.id
      WHERE je."isPosted" = false AND je."createdAt" < now() - interval '1 hour'
      GROUP BY je.id, je.reference, je."createdAt"`,
  },
  {
    id: 'LG-04', group: 'Ledger integrity', repairClass: 'B',
    title: 'Account balance does not equal the sum of its posted lines',
    why: 'D-12/INV-02: ChartOfAccount.balance is a cache updated with JS numbers outside the posting transaction (X-11). amount = cached − derived.',
    sql: `
      SELECT ca.id AS ref_id,
             ca.balance - COALESCE(d.derived, 0) AS amount,
             'code ' || ca.code || ' cached ' || ca.balance || ' derived ' || COALESCE(d.derived, 0) AS detail
      FROM chart_of_accounts ca
      LEFT JOIN (
        SELECT a.id,
               SUM(CASE WHEN a.type IN ('ASSET', 'EXPENSE') THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END) AS derived
        FROM chart_of_accounts a
        JOIN journal_lines jl ON jl."accountId" = a.id
        JOIN journal_entries je ON je.id = jl."journalEntryId" AND je."isPosted" = true
        GROUP BY a.id
      ) d ON d.id = ca.id
      WHERE ABS(ca.balance - COALESCE(d.derived, 0)) > 0.005`,
  },
  {
    id: 'LG-05', group: 'Ledger integrity', repairClass: 'info',
    title: 'Accounts with a negative balance',
    why: 'Negative balances (A2): an asset or expense below zero, or a liability/revenue/equity account in debit. Needs explaining, not necessarily wrong.',
    sql: `
      SELECT ca.id AS ref_id, ca.balance AS amount, 'code ' || ca.code || ' type ' || ca.type AS detail
      FROM chart_of_accounts ca WHERE ca.balance < 0`,
  },

  // ───────────────────────────── Journal references ───────────────────────────
  {
    id: 'JR-01', group: 'Journal references', repairClass: 'B',
    title: 'References reversed more times than they were posted',
    why: 'A1-F2/A2-F3: voidEntry has no one-time guard, so an entry can be reversed repeatedly. Counted by reference (reversals carry no link to the original).',
    sql: `
      SELECT n.ref AS ref_id, NULL::numeric AS amount,
             'posted ' || n.originals || ' reversed ' || n.reversals AS detail
      FROM (${NET_BY_REF}) n
      WHERE n.reversals > n.originals`,
  },
  {
    id: 'JR-02', group: 'Journal references', repairClass: 'B',
    title: 'Expense, fine and payroll references posted more than once (net of reversals)',
    why: 'A1-F1: posting is claimed with a read-then-update, so a double click or retry can post twice. Payment references (PAY-xxxxxxxx) repeat legitimately and are checked in RC-01/RC-02.',
    sql: `
      SELECT n.ref AS ref_id,
             (SELECT SUM(jl.debit) FROM journal_entries je JOIN journal_lines jl ON jl."journalEntryId" = je.id
               WHERE je."isPosted" = true AND je.reference = n.ref) AS amount,
             'net postings ' || n.net || ' (posted ' || n.originals || ', reversed ' || n.reversals || ')' AS detail
      FROM (${NET_BY_REF}) n
      WHERE n.ref ~ ${UNIQUE_KIND_RE} AND n.net > 1`,
  },

  // ───────────────────────────── Receivables ──────────────────────────────────
  {
    id: 'RC-01', group: 'Receivables', repairClass: 'B',
    title: 'Payments with no matching posted journal entry',
    why: 'A1-F3: posting runs after the payment commits and a failure is only logged (RB-1). Per invoice: payments recorded vs posted entries; amount = payments − cash debited.',
    sql: `
      WITH pay AS (
        SELECT p."invoiceId", ${PAY_REF} AS ref, COUNT(*) AS n, SUM(p.amount) AS amt
        FROM payments p GROUP BY p."invoiceId", ${PAY_REF}
      ), led AS (
        SELECT je.reference AS ref, COUNT(DISTINCT je.id) AS n,
               COALESCE(SUM(jl.debit) FILTER (WHERE ca.code = '1000'), 0) AS cash
        FROM ${POSTED_LINES} AND je.reference ~ ${PAYMENT_ENTRY_REF_RE}
        GROUP BY je.reference
      )
      SELECT pay."invoiceId" AS ref_id, pay.amt - COALESCE(led.cash, 0) AS amount,
             'payments ' || pay.n || ' entries ' || COALESCE(led.n, 0) AS detail
      FROM pay LEFT JOIN led ON led.ref = pay.ref
      WHERE COALESCE(led.n, 0) < pay.n`,
  },
  {
    id: 'RC-02', group: 'Receivables', repairClass: 'B',
    title: 'Payment journal entries posted more often than payments exist',
    why: 'A1-F1/X-13: duplicate posting of a payment (RB-2). Includes entries whose invoice has no payment at all.',
    sql: `
      WITH pay AS (
        SELECT ${PAY_REF} AS ref, COUNT(*) AS n FROM payments p GROUP BY ${PAY_REF}
      ), led AS (
        SELECT je.reference AS ref, COUNT(DISTINCT je.id) AS n,
               COALESCE(SUM(jl.debit) FILTER (WHERE ca.code = '1000'), 0) AS cash
        FROM ${POSTED_LINES} AND je.reference ~ ${PAYMENT_ENTRY_REF_RE}
        GROUP BY je.reference
      )
      SELECT led.ref AS ref_id, led.cash AS amount,
             'entries ' || led.n || ' payments ' || COALESCE(pay.n, 0) AS detail
      FROM led LEFT JOIN pay ON pay.ref = led.ref
      WHERE led.n > COALESCE(pay.n, 0)`,
  },
  {
    id: 'RC-03', group: 'Receivables', repairClass: 'B',
    title: 'Advance credit that was booked as revenue',
    why: 'C-01/C-07: the whole payment is credited to 4000 even when part became a StudentCredit (a liability). amount = credit created from that payment.',
    sql: `
      SELECT c."sourcePaymentId" AS ref_id, SUM(c."originalAmount") AS amount,
             'payment amount ' || p.amount || ' credit ' || SUM(c."originalAmount") AS detail
      FROM student_credits c JOIN payments p ON p.id = c."sourcePaymentId"
      GROUP BY c."sourcePaymentId", p.amount
      HAVING SUM(c."originalAmount") > 0`,
  },
  {
    id: 'RC-04', group: 'Receivables', repairClass: 'C',
    title: 'Invoice total differs from the sum of its line items',
    why: 'X-19: credit applied at invoicing reduces totalAmount but not the lines. amount = lines − total. Invoices with no lines are included.',
    sql: `
      SELECT i.id AS ref_id, COALESCE(SUM(li.amount), 0) - i."totalAmount" AS amount,
             'lines ' || COUNT(li.id) || ' total ' || i."totalAmount" AS detail
      FROM invoices i LEFT JOIN invoice_line_items li ON li."invoiceId" = i.id
      GROUP BY i.id, i."totalAmount"
      HAVING ABS(COALESCE(SUM(li.amount), 0) - i."totalAmount") > 0.005`,
  },
  {
    id: 'RC-05', group: 'Receivables', repairClass: 'C',
    title: 'Invoice paid amount differs from payments received minus the credit they created',
    why: 'A1-OP-03/04: stale absolute writes can lose an update. Expected paid = Σ payments − Σ credit created from those payments (an overpayment becomes a credit, not "paid"). amount = invoice paidAmount − expected.',
    sql: `
      WITH pay AS (
        SELECT p."invoiceId", SUM(p.amount) AS received
        FROM payments p GROUP BY p."invoiceId"
      ), cr AS (
        SELECT p."invoiceId", SUM(c."originalAmount") AS credited
        FROM student_credits c JOIN payments p ON p.id = c."sourcePaymentId" GROUP BY p."invoiceId"
      )
      SELECT i.id AS ref_id,
             i."paidAmount" - (COALESCE(pay.received, 0) - COALESCE(cr.credited, 0)) AS amount,
             'paidAmount ' || i."paidAmount" || ' received ' || COALESCE(pay.received, 0) || ' credited ' || COALESCE(cr.credited, 0) AS detail
      FROM invoices i
      LEFT JOIN pay ON pay."invoiceId" = i.id
      LEFT JOIN cr ON cr."invoiceId" = i.id
      WHERE ABS(i."paidAmount" - (COALESCE(pay.received, 0) - COALESCE(cr.credited, 0))) > 0.005`,
  },
  {
    id: 'RC-06', group: 'Receivables', repairClass: 'C',
    title: 'Invoice balance is not total minus paid',
    why: 'Invoice arithmetic drift (X-20). amount = balance − (total − paid).',
    sql: `
      SELECT i.id AS ref_id, i.balance - (i."totalAmount" - i."paidAmount") AS amount,
             'balance ' || i.balance || ' total ' || i."totalAmount" || ' paid ' || i."paidAmount" AS detail
      FROM invoices i
      WHERE ABS(i.balance - (i."totalAmount" - i."paidAmount")) > 0.005`,
  },
  {
    id: 'RC-07', group: 'Receivables', repairClass: 'C',
    title: 'Sum of line balances differs from the invoice balance',
    why: 'X-19/X-20: a line can show a balance on a PAID invoice, or the reverse. amount = Σ line balance − invoice balance.',
    sql: `
      SELECT i.id AS ref_id, SUM(li.balance) - i.balance AS amount,
             'lines ' || SUM(li.balance) || ' invoice ' || i.balance AS detail
      FROM invoices i JOIN invoice_line_items li ON li."invoiceId" = i.id
      GROUP BY i.id, i.balance
      HAVING ABS(SUM(li.balance) - i.balance) > 0.005`,
  },
  {
    id: 'RC-08', group: 'Receivables', repairClass: 'A',
    title: 'Allocation rows that do not match what was applied to the line',
    why: 'C-01: PaymentAllocation.amount stores the requested amount even when part was excess. amount = Σ allocations − line paidAmount (positive = excess stored; negative = applied more than allocated). Feeds rule RA-1.',
    sql: `
      SELECT li.id AS ref_id, COALESCE(SUM(pa.amount), 0) - li."paidAmount" AS amount,
             CASE WHEN COALESCE(SUM(pa.amount), 0) > li."paidAmount" THEN 'allocated above applied' ELSE 'allocated below applied' END
             || ' (line paid ' || li."paidAmount" || ')' AS detail
      FROM invoice_line_items li LEFT JOIN payment_allocations pa ON pa."lineItemId" = li.id
      GROUP BY li.id, li."paidAmount"
      HAVING ABS(COALESCE(SUM(pa.amount), 0) - li."paidAmount") > 0.005`,
  },
  {
    id: 'RC-09', group: 'Receivables', repairClass: 'info',
    title: 'Negative invoice, line or credit balances',
    why: 'A2 negative balances: an overpayment recorded as a negative balance instead of a credit.',
    sql: `
      SELECT i.id AS ref_id, i.balance AS amount, 'invoice balance' AS detail FROM invoices i WHERE i.balance < 0
      UNION ALL
      SELECT li.id, li.balance, 'line balance' FROM invoice_line_items li WHERE li.balance < 0
      UNION ALL
      SELECT c.id, c.amount, 'student credit' FROM student_credits c WHERE c.amount < 0`,
  },
  {
    id: 'RC-10', group: 'Receivables', repairClass: 'B',
    title: 'Invoices with more than one late-penalty line, or a penalty total that does not match its lines',
    why: 'A1-OP-04/F14, X-21/X-22: the penalty job claims nothing, so overlapping runs can charge twice. amount = latePenalty − Σ penalty lines.',
    sql: `
      SELECT i.id AS ref_id, i."latePenalty" - COALESCE(SUM(li.amount) FILTER (WHERE li."feeName" = 'Late Payment Penalty'), 0) AS amount,
             'penalty lines ' || COUNT(li.id) FILTER (WHERE li."feeName" = 'Late Payment Penalty') || ' latePenalty ' || i."latePenalty" AS detail
      FROM invoices i LEFT JOIN invoice_line_items li ON li."invoiceId" = i.id
      GROUP BY i.id, i."latePenalty"
      HAVING COUNT(li.id) FILTER (WHERE li."feeName" = 'Late Payment Penalty') > 1
          OR ABS(i."latePenalty" - COALESCE(SUM(li.amount) FILTER (WHERE li."feeName" = 'Late Payment Penalty'), 0)) > 0.005`,
  },
  {
    id: 'RC-11', group: 'Receivables', repairClass: 'C',
    title: 'The same provider reference used on more than one payment',
    why: 'A1-§10A/X-25: no duplicate-reference guard. Cash payments excluded. ref_id is the normalised reference; amount = total of those payments.',
    sql: `
      SELECT lower(btrim(p.reference)) AS ref_id, SUM(p.amount) AS amount,
             'payments ' || COUNT(*) || ' invoices ' || COUNT(DISTINCT p."invoiceId") AS detail
      FROM payments p
      WHERE p.reference IS NOT NULL AND btrim(p.reference) <> '' AND p.method <> 'CASH'
      GROUP BY lower(btrim(p.reference))
      HAVING COUNT(*) > 1`,
  },
  {
    id: 'RC-12', group: 'Receivables', repairClass: 'C',
    title: 'Probable double-submitted payments (same invoice, amount and method within two minutes)',
    why: 'A1-§10A/T-02: no idempotency on POST /payments. Each pair is listed once, by the later payment.',
    sql: `
      SELECT p2.id AS ref_id, p2.amount AS amount,
             'duplicates payment ' || p1.id || ' on invoice ' || p1."invoiceId" AS detail
      FROM payments p1 JOIN payments p2
        ON p1."invoiceId" = p2."invoiceId" AND p1.id < p2.id AND p1.amount = p2.amount
       AND p1.method = p2.method AND ABS(EXTRACT(EPOCH FROM (p1."paidAt" - p2."paidAt"))) <= 120`,
  },
  {
    id: 'RC-13', group: 'Receivables', repairClass: 'info',
    title: 'Payments recorded with the legacy MOBILE_MONEY method',
    why: 'C-08: the legacy value cannot say which wallet received the money; new payments will reject it.',
    sql: `
      SELECT p.id AS ref_id, p.amount AS amount, 'invoice ' || p."invoiceId" AS detail
      FROM payments p WHERE p.method = 'MOBILE_MONEY'`,
  },
  {
    id: 'RC-14', group: 'Receivables', repairClass: 'C',
    title: 'Scholarships above 100 percent, or more than one active per student and year',
    why: 'X-24/D-16: no upper bound on percentage and no uniqueness. amount = the scholarship value for fixed awards.',
    sql: `
      SELECT s.id AS ref_id, CASE WHEN s."discountType" = 'FIXED_AMOUNT' THEN s.value END AS amount,
             'over 100 percent' AS detail
      FROM scholarships s WHERE s."discountType" = 'PERCENTAGE' AND s.value > 100
      UNION ALL
      SELECT s.id, CASE WHEN s."discountType" = 'FIXED_AMOUNT' THEN s.value END,
             'active scholarships for student ' || s."studentId" || ' in ' || s."academicYear" || ': ' || g.n
      FROM scholarships s
      JOIN (SELECT "studentId", "academicYear", COUNT(*) AS n FROM scholarships WHERE "isActive" = true GROUP BY 1, 2 HAVING COUNT(*) > 1) g
        ON g."studentId" = s."studentId" AND g."academicYear" = s."academicYear"
      WHERE s."isActive" = true`,
  },

  // ───────────────────────────── Expenses and budgets ─────────────────────────
  {
    id: 'EX-01', group: 'Expenses and budgets', repairClass: 'B',
    title: 'Approved expenses with no posted journal entry',
    why: 'A1-F3: posting after the status claim, failure only logged.',
    sql: `
      SELECT e.id AS ref_id, e.amount AS amount, 'category ' || e.category AS detail
      FROM expenses e
      WHERE e.status = 'APPROVED'
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je."isPosted" = true AND je.reference = ${EXP_REF})`,
  },
  {
    id: 'EX-02', group: 'Expenses and budgets', repairClass: 'B',
    title: 'Expense posted amount differs from the expense amount',
    why: 'Part 1 §3.3/X-15: the journal debit for the expense reference is compared with Expense.amount; amounts are rounded with JS numbers. amount = journal − expense.',
    sql: `
      SELECT e.id AS ref_id, led.debits - e.amount AS amount,
             'expense ' || e.amount || ' journal debit ' || led.debits AS detail
      FROM expenses e
      JOIN (
        SELECT je.reference AS ref, SUM(jl.debit) AS debits
        FROM journal_entries je JOIN journal_lines jl ON jl."journalEntryId" = je.id
        WHERE je."isPosted" = true AND je.reference ~ '^EXP-[0-9A-Z]{8}$'
        GROUP BY je.reference
      ) led ON led.ref = ${EXP_REF}
      WHERE e.status = 'APPROVED' AND ABS(led.debits - e.amount) > 0.005`,
  },
  {
    id: 'EX-03', group: 'Expenses and budgets', repairClass: 'B',
    title: 'Expenses whose cash was credited at approval and again when marked paid',
    why: 'X-27/A1-F9: approval defaults to paid-immediately (Cr 1000); mark-paid then posts Dr 2000 / Cr 1000 as well. Expenses paid twice through mark-paid are included.',
    sql: `
      SELECT e.id AS ref_id, e.amount AS amount, 'settlement entries ' || s.n || ' approval credited cash ' || (a.cash_credit > 0) AS detail
      FROM expenses e
      JOIN (SELECT je.reference AS ref, COUNT(DISTINCT je.id) AS n
            FROM journal_entries je WHERE je."isPosted" = true AND je.reference LIKE 'EXP-PAY-%' GROUP BY je.reference) s
        ON s.ref = ${EXPPAY_REF}
      LEFT JOIN (SELECT je.reference AS ref, COALESCE(SUM(jl.credit) FILTER (WHERE ca.code = '1000'), 0) AS cash_credit
                 FROM ${POSTED_LINES} AND je.reference ~ '^EXP-[0-9A-Z]{8}$' GROUP BY je.reference) a
        ON a.ref = ${EXP_REF}
      WHERE s.n > 1 OR COALESCE(a.cash_credit, 0) > 0`,
  },
  {
    id: 'EX-04', group: 'Expenses and budgets', repairClass: 'info',
    title: 'Approved expenses in the SALARIES category',
    why: 'X-32: SALARIES maps to account 5000, so a manual expense can double count payroll.',
    sql: `
      SELECT e.id AS ref_id, e.amount AS amount, 'year ' || e."academicYear" || ' term ' || e.term AS detail
      FROM expenses e WHERE e.status = 'APPROVED' AND e.category = 'SALARIES'`,
  },
  {
    id: 'EX-05', group: 'Expenses and budgets', repairClass: 'C',
    title: 'Budgets that repeat the same year, term, department and category',
    why: 'X-33/A1-F6: no uniqueness, so spending is smeared across the duplicates. amount = total allocated in the group.',
    sql: `
      SELECT b.id AS ref_id, g.allocated AS amount,
             'group ' || b."academicYear" || ' term ' || COALESCE(b.term::text, 'annual') || ' ' || b.category || ' budgets ' || g.n AS detail
      FROM budgets b
      JOIN (SELECT "academicYear", term, department, category, COUNT(*) AS n, SUM(allocated) AS allocated
            FROM budgets GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1) g
        ON g."academicYear" = b."academicYear" AND g.term IS NOT DISTINCT FROM b.term
       AND g.department = b.department AND g.category = b.category`,
  },
  {
    id: 'EX-06', group: 'Expenses and budgets', repairClass: 'C',
    title: 'Approved expenses that match no budget, or more than one',
    why: 'A1-F6/X-28: updateBudgetSpent matches on year and category only, silently doing nothing for none and adding the FULL amount to every match. amount = expense amount.',
    sql: `
      SELECT e.id AS ref_id, e.amount AS amount,
             CASE WHEN m.n = 0 THEN 'no matching budget' ELSE 'matches ' || m.n || ' budgets (full amount added to each)' END AS detail
      FROM expenses e
      JOIN LATERAL (SELECT COUNT(*) AS n FROM budgets b WHERE b."academicYear" = e."academicYear" AND b.category = e.category) m ON true
      WHERE e.status = 'APPROVED' AND m.n <> 1`,
  },
  {
    id: 'EX-07', group: 'Expenses and budgets', repairClass: 'A',
    title: 'Budget "spent" differs from approved expenses, or exceeds the allocation',
    why: 'X-31/RA-7: Budget.spent is an incremented counter. Compared only where exactly one budget matches the year and category. amount = spent − Σ approved expenses, or the overspend when only that is wrong.',
    sql: `
      SELECT b.id AS ref_id,
             CASE WHEN ABS(b.spent - COALESCE(x.total, 0)) > 0.005 THEN b.spent - COALESCE(x.total, 0) ELSE b.spent - b.allocated END AS amount,
             'spent ' || b.spent || ' approved expenses ' || COALESCE(x.total, 0) || ' allocated ' || b.allocated AS detail
      FROM budgets b
      JOIN (SELECT "academicYear", category, COUNT(*) AS n FROM budgets GROUP BY 1, 2) c
        ON c."academicYear" = b."academicYear" AND c.category = b.category AND c.n = 1
      LEFT JOIN (SELECT "academicYear", category, SUM(amount) AS total FROM expenses WHERE status = 'APPROVED' GROUP BY 1, 2) x
        ON x."academicYear" = b."academicYear" AND x.category = b.category
      WHERE ABS(b.spent - COALESCE(x.total, 0)) > 0.005 OR b.spent > b.allocated`,
  },

  // ───────────────────────────── Procurement ──────────────────────────────────
  {
    id: 'PO-01', group: 'Procurement', repairClass: 'C',
    title: 'More than one live purchase order for one requisition',
    why: 'A1-§10B/X-34/D-15: nothing prevents a second PO re-pointing the commitment. amount = total of the live POs.',
    sql: `
      SELECT po.id AS ref_id, g.total AS amount, 'requisition ' || po."purchaseRequisitionId" || ' live POs ' || g.n AS detail
      FROM purchase_orders po
      JOIN (SELECT "purchaseRequisitionId", COUNT(*) AS n, SUM(total) AS total
            FROM purchase_orders WHERE status <> 'CANCELLED' GROUP BY 1 HAVING COUNT(*) > 1) g
        ON g."purchaseRequisitionId" = po."purchaseRequisitionId"
      WHERE po.status <> 'CANCELLED'`,
  },
  {
    id: 'PO-02', group: 'Procurement', repairClass: 'C',
    title: 'Approved purchase orders with no active budget commitment',
    why: 'A1-F7/X-29: a PO can be approved with the commitment silently skipped.',
    sql: `
      SELECT po.id AS ref_id, po.total AS amount, 'status ' || po.status AS detail
      FROM purchase_orders po
      WHERE po.status IN ('APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED')
        AND NOT EXISTS (
          SELECT 1 FROM budget_commitments c
          WHERE c.status IN ('RESERVED', 'COMMITTED', 'CONSUMED')
            AND (c."purchaseOrderId" = po.id OR c."purchaseRequisitionId" = po."purchaseRequisitionId"))`,
  },
  {
    id: 'PO-03', group: 'Procurement', repairClass: 'C',
    title: 'Stale or duplicated budget commitments',
    why: 'A1-§3/X-29/X-30: releaseCommitment has no caller; active commitments for a cancelled or closed PO keep money reserved, and a requisition can hold two.',
    sql: `
      SELECT c.id AS ref_id, c.amount AS amount, 'active commitment on ' || po.status || ' PO ' || po.id AS detail
      FROM budget_commitments c JOIN purchase_orders po ON po.id = c."purchaseOrderId"
      WHERE c.status IN ('RESERVED', 'COMMITTED') AND po.status IN ('CANCELLED', 'CLOSED', 'CLOSED_WITH_VARIANCE')
      UNION ALL
      SELECT c.id, c.amount, 'requisition ' || c."purchaseRequisitionId" || ' has ' || g.n || ' active commitments'
      FROM budget_commitments c
      JOIN (SELECT "purchaseRequisitionId", COUNT(*) AS n FROM budget_commitments
            WHERE status IN ('RESERVED', 'COMMITTED') AND "purchaseRequisitionId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) g
        ON g."purchaseRequisitionId" = c."purchaseRequisitionId"
      WHERE c.status IN ('RESERVED', 'COMMITTED')`,
  },

  // ───────────────────────────── Library fines ────────────────────────────────
  {
    id: 'LF-01', group: 'Library fines', repairClass: 'C',
    title: 'Fines marked PAID with no journal entry (the ledger-less clear route)',
    why: 'C-04/X-03/A1-F11: PATCH /library/fines/:id/clear marks a fine PAID and posts nothing; the cash receipt is unknown. Finance must confirm receipt or reopen the fine.',
    sql: `
      SELECT f.id AS ref_id, f.amount AS amount, 'paid ' || COALESCE(to_char(f."paidAt", 'YYYY-MM-DD'), 'no date') AS detail
      FROM library_fines f
      WHERE f.status = 'PAID'
        AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je."isPosted" = true AND je.reference = ${LIB_REF})`,
  },
  {
    id: 'LF-02', group: 'Library fines', repairClass: 'B',
    title: 'Fines that are WAIVED (or still PENDING) although cash was posted',
    why: 'X-04/X-05: waive-after-pay and pay-after-waive are not guarded. Also lists fines paid twice (more than one posted entry net of reversals).',
    sql: `
      SELECT f.id AS ref_id, f.amount AS amount, 'status ' || f.status || ' entries ' || n.net AS detail
      FROM library_fines f
      JOIN (${NET_BY_REF}) n ON n.ref = ${LIB_REF}
      WHERE (n.net >= 1 AND f.status <> 'PAID') OR n.net > 1`,
  },
  {
    id: 'LF-03', group: 'Library fines', repairClass: 'C',
    title: 'Fines with contradictory status fields',
    why: 'X-04/X-05: a fine WAIVED with a paid date, or PAID with a waiver date, shows the status guards were bypassed.',
    sql: `
      SELECT f.id AS ref_id, f.amount AS amount, 'status ' || f.status AS detail
      FROM library_fines f
      WHERE (f.status = 'WAIVED' AND f."paidAt" IS NOT NULL) OR (f.status = 'PAID' AND f."waivedAt" IS NOT NULL)`,
  },
  {
    id: 'LF-04', group: 'Library fines', repairClass: 'info',
    title: 'Several fines of the same kind on one borrowing',
    why: 'V-08: decides whether a (borrowingId, kind) unique index is safe. Listed for the second and later fines.',
    sql: `
      SELECT f.id AS ref_id, f.amount AS amount, 'borrowing ' || f."borrowingId" || ' kind ' || f.kind AS detail
      FROM library_fines f
      JOIN (SELECT "borrowingId", kind, MIN("createdAt") AS first_at FROM library_fines
            WHERE "borrowingId" IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1) g
        ON g."borrowingId" = f."borrowingId" AND g.kind = f.kind
      WHERE f."createdAt" > g.first_at`,
  },

  // ───────────────────────────── Payroll and loans ────────────────────────────
  {
    id: 'PR-01', group: 'Payroll and loans', repairClass: 'B',
    title: 'Locked payroll runs with no net payroll journal entry',
    why: 'A1-F13/C-13: the journal is found by reference only. amount = run gross.',
    sql: `
      SELECT r.id AS ref_id, r."totalGross" AS amount, 'run ' || r.year || '-' || lpad(r.month::text, 2, '0') AS detail
      FROM payroll_runs r
      LEFT JOIN (${NET_BY_REF}) n ON n.ref = ${PAYROLL_REF}
      WHERE r.status = 'LOCKED' AND COALESCE(n.net, 0) < 1`,
  },
  {
    id: 'PR-02', group: 'Payroll and loans', repairClass: 'B',
    title: 'Payroll journal posted for a run that is not locked, or posted more than once',
    why: 'A1-F13/OP-13: lock posts before an unconditional status update, so a failure or a double click leaves a journal without a lock, or two journals.',
    sql: `
      SELECT r.id AS ref_id, r."totalGross" AS amount,
             'status ' || r.status || ' net postings ' || n.net AS detail
      FROM payroll_runs r JOIN (${NET_BY_REF}) n ON n.ref = ${PAYROLL_REF}
      WHERE (n.net >= 1 AND r.status <> 'LOCKED') OR n.net > 1`,
  },
  {
    id: 'PR-03', group: 'Payroll and loans', repairClass: 'B',
    title: 'Locked run: journal expense differs from the run gross',
    why: 'C-12/X-40: the journal deductions line is derived as gross − net from unrounded totals. amount = net journal debit to 5000 − run gross.',
    sql: `
      SELECT r.id AS ref_id, led.expense - r."totalGross" AS amount,
             'journal ' || led.expense || ' run gross ' || r."totalGross" AS detail
      FROM payroll_runs r
      JOIN (
        SELECT CASE WHEN je.reference LIKE 'VOID-%' THEN substr(je.reference, 6) ELSE je.reference END AS ref,
               SUM(jl.debit - jl.credit) AS expense
        FROM ${POSTED_LINES} AND ca.code = '5000'
        GROUP BY 1
      ) led ON led.ref = ${PAYROLL_REF}
      WHERE r.status = 'LOCKED' AND ABS(led.expense - r."totalGross") > 0.005`,
  },
  {
    id: 'PR-04', group: 'Payroll and loans', repairClass: 'C',
    title: 'Payslip where gross − PAYE − pension − loan deduction ≠ net',
    why: 'C-09/INV-10 (grossSalary is already net of leave deductions). amount = net − (gross − paye − pension − loan).',
    sql: `
      SELECT s.id AS ref_id, s."netSalary" - (s."grossSalary" - s.paye - s.pension - s."loanDeduction") AS amount,
             'run ' || s."payrollRunId" AS detail
      FROM payslips s
      WHERE ABS(s."netSalary" - (s."grossSalary" - s.paye - s.pension - s."loanDeduction")) > 0.01`,
  },
  {
    id: 'PR-05', group: 'Payroll and loans', repairClass: 'C',
    title: 'Run totals differ from the sum of the payslips',
    why: 'X-40: run totals are summed from unrounded values while payslips are stored rounded. amount = gross difference (net difference in detail).',
    sql: `
      SELECT r.id AS ref_id, r."totalGross" - COALESCE(SUM(s."grossSalary"), 0) AS amount,
             'net difference ' || (r."totalNet" - COALESCE(SUM(s."netSalary"), 0)) || ' payslips ' || COUNT(s.id) AS detail
      FROM payroll_runs r LEFT JOIN payslips s ON s."payrollRunId" = r.id
      GROUP BY r.id, r."totalGross", r."totalNet"
      HAVING ABS(r."totalGross" - COALESCE(SUM(s."grossSalary"), 0)) > 0.01
          OR ABS(r."totalNet" - COALESCE(SUM(s."netSalary"), 0)) > 0.01`,
  },
  {
    id: 'PR-06', group: 'Payroll and loans', repairClass: 'C',
    title: 'Loans whose balance, repaid total or amount are inconsistent',
    why: 'A1-F12/X-36: totalRepaid is incremented with no cap. amount = balance − (amount − totalRepaid).',
    sql: `
      SELECT l.id AS ref_id, l.balance - (l.amount - l."totalRepaid") AS amount,
             'amount ' || l.amount || ' repaid ' || l."totalRepaid" || ' balance ' || l.balance AS detail
      FROM staff_loans l
      WHERE ABS(l.balance - (l.amount - l."totalRepaid")) > 0.005 OR l."totalRepaid" > l.amount OR l.balance < 0`,
  },
  {
    id: 'PR-07', group: 'Payroll and loans', repairClass: 'C',
    title: 'Loan repaid total differs from the loan deductions on payslips (per staff member)',
    why: 'X-35/X-36/RA-6: repayments were applied at run completion and never reversed. ref_id is the staff profile id; amount = Σ totalRepaid − Σ payslip loan deductions.',
    sql: `
      SELECT l."staffId" AS ref_id, l.repaid - COALESCE(d.deducted, 0) AS amount,
             'loans repaid ' || l.repaid || ' payslip deductions ' || COALESCE(d.deducted, 0) || ' loan amount ' || l.principal AS detail
      FROM (SELECT "staffId", SUM("totalRepaid") AS repaid, SUM(amount) AS principal FROM staff_loans GROUP BY 1) l
      JOIN staff_profiles sp ON sp.id = l."staffId"
      LEFT JOIN (SELECT "staffUid", SUM("loanDeduction") AS deducted FROM payslips GROUP BY 1) d ON d."staffUid" = sp.uid
      WHERE ABS(l.repaid - COALESCE(d.deducted, 0)) > 0.005 OR COALESCE(d.deducted, 0) > l.principal`,
  },
  {
    id: 'PR-08', group: 'Payroll and loans', repairClass: 'B',
    title: 'Loans disbursed with no journal entry',
    why: 'A1-F12/RB-7: no loan movement is ever posted. Every disbursed loan is listed; amount = principal. Finance attests the historic disbursement.',
    sql: `
      SELECT l.id AS ref_id, l.amount AS amount, 'status ' || l.status AS detail
      FROM staff_loans l
      WHERE l."disbursedAt" IS NOT NULL OR l.status IN ('DISBURSED', 'REPAYING', 'SETTLED')`,
  },
  {
    id: 'PR-09', group: 'Payroll and loans', repairClass: 'C',
    title: 'More than one open loan for the same staff member',
    why: 'X-38/A1-OP-18: requestLoan is check-then-create. ref_id is the staff profile id; amount = total of the open loans.',
    sql: `
      SELECT l."staffId" AS ref_id, SUM(l.amount) AS amount, 'open loans ' || COUNT(*) AS detail
      FROM staff_loans l
      WHERE l.status IN ('PENDING', 'APPROVED', 'DISBURSED', 'REPAYING')
      GROUP BY l."staffId" HAVING COUNT(*) > 1`,
  },

  // ───────────────────────────── Orphan references ────────────────────────────
  {
    id: 'OR-01', group: 'Orphan references', repairClass: 'A',
    title: 'Student credits whose source payment no longer exists',
    why: 'RA-2: StudentCredit.sourcePaymentId is a plain string. amount = remaining credit.',
    sql: `
      SELECT c.id AS ref_id, c.amount AS amount, 'missing payment ' || c."sourcePaymentId" AS detail
      FROM student_credits c
      WHERE c."sourcePaymentId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = c."sourcePaymentId")`,
  },
  {
    id: 'OR-02', group: 'Orphan references', repairClass: 'C',
    title: 'Library fines whose student or staff borrower cannot be found',
    why: 'RA-8/V-08: LibraryFine.studentId and staffId are plain strings. A fine with neither is also listed. (staffId is tried against both staff profile id and uid.)',
    sql: `
      SELECT f.id AS ref_id, f.amount AS amount,
             CASE WHEN f."studentId" IS NULL AND f."staffId" IS NULL THEN 'no borrower recorded'
                  WHEN f."studentId" IS NOT NULL THEN 'student ' || f."studentId" || ' not found'
                  ELSE 'staff ' || f."staffId" || ' not found' END AS detail
      FROM library_fines f
      WHERE (f."studentId" IS NULL AND f."staffId" IS NULL)
         OR (f."studentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM students s WHERE s.id = f."studentId"))
         OR (f."staffId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.id = f."staffId" OR sp.uid = f."staffId"))`,
  },
]

/** Words that must never appear in a baseline query (P0-02 is read-only). */
export const FORBIDDEN_SQL_WORDS = [
  'insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'create', 'grant', 'revoke', 'copy', 'call', 'merge', 'vacuum',
] as const
