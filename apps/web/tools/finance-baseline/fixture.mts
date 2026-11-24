/**
 * apps/web/tools/finance-baseline/fixture.mts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PLAN]: Finance Hardening Plan — P0-02 (verification of the baseline checks).
 * [PURPOSE]: A small, SYNTHETIC data set with known defects planted in it, and
 *   the exact number of rows each baseline check must report for it. It proves
 *   the checks detect what they claim to detect (and stay silent on clean
 *   records) before they are trusted on real data.
 *
 * ⚠ For a THROWAWAY database only. Never run against production or a copy of
 *   it: it inserts rows. (The baseline checks themselves never write.)
 *   Ids are alphanumeric so the "last 8 characters" journal references the
 *   code builds can be reproduced exactly. Nothing here is real personal data.
 */

const q = (v: string | number | null): string =>
  v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`

/** The journal reference the code derives from an id: upper-case last 8 characters. */
export const tail8 = (id: string): string => id.slice(-8).toUpperCase()

const S: string[] = []
let seq = 0
const uid = (p: string): string => `${p}${String(++seq).padStart(4, '0')}`

// ── reference data ──────────────────────────────────────────────────────────
const ACCOUNTS: Array<[code: string, type: string, name: string]> = [
  ['1000', 'ASSET', 'Cash / Bank'], ['1100', 'ASSET', 'Accounts Receivable'],
  ['2000', 'LIABILITY', 'Accounts Payable'], ['2100', 'LIABILITY', 'Salaries Payable'],
  ['4000', 'REVENUE', 'Tuition Fee Revenue'], ['4300', 'REVENUE', 'Library Fine Revenue'],
  ['5000', 'EXPENSE', 'Staff Salaries Expense'], ['5100', 'EXPENSE', 'Utilities Expense'],
  ['5900', 'EXPENSE', 'Miscellaneous Expense'],
]
for (const [code, type, name] of ACCOUNTS) {
  S.push(`INSERT INTO chart_of_accounts (id, code, name, type, "updatedAt") VALUES ('acc${code}', '${code}', ${q(name)}, '${type}', now())`)
}

type Line = [code: string, debit: number, credit: number]

/** One journal entry with its lines. */
function entry(reference: string, lines: Line[], opts: { posted?: boolean; ageDays?: number } = {}): void {
  const id = uid('je')
  const posted = opts.posted ?? true
  const created = opts.ageDays ? `now() - interval '${opts.ageDays} days'` : 'now()'
  S.push(
    `INSERT INTO journal_entries (id, reference, description, "entryDate", "isPosted", "postedAt", "createdAt") ` +
    `VALUES ('${id}', ${q(reference)}, 'fixture', now(), ${posted}, ${posted ? 'now()' : 'NULL'}, ${created})`,
  )
  lines.forEach(([code, debit, credit], i) => {
    S.push(
      `INSERT INTO journal_lines (id, "journalEntryId", "accountId", debit, credit) ` +
      `VALUES ('${id}l${i}', '${id}', 'acc${code}', ${debit}, ${credit})`,
    )
  })
}

function student(id: string): void {
  S.push(
    `INSERT INTO students (id, "registrationNo", "firstName", "lastName", "dateOfBirth", sex, district, "guardianName", "guardianPhone", "guardianRelation", "updatedAt") ` +
    `VALUES (${q(id)}, ${q('REG-' + id)}, 'Test', 'Student', '2010-01-01', 'MALE', 'Test', 'Test', '0', 'Parent', now())`,
  )
}

interface InvoiceSpec {
  id: string
  total: number
  paid: number
  balance: number
  /** line items: [feeName, amount, paidAmount, balance] */
  lines: Array<[string, number, number, number]>
  latePenalty?: number
}
function invoice(spec: InvoiceSpec): string {
  const studentId = `stu${spec.id}`
  student(studentId)
  S.push(
    `INSERT INTO invoices (id, "invoiceNumber", "studentId", "academicYear", term, subtotal, "totalAmount", "paidAmount", balance, "latePenalty", "dueDate", "updatedAt") ` +
    `VALUES (${q(spec.id)}, ${q('INV-' + spec.id)}, ${q(studentId)}, '2026', 1, ${spec.total}, ${spec.total}, ${spec.paid}, ${spec.balance}, ${spec.latePenalty ?? 0}, now(), now())`,
  )
  spec.lines.forEach(([name, amount, paid, balance], i) => {
    S.push(
      `INSERT INTO invoice_line_items (id, "invoiceId", "feeName", amount, "paidAmount", balance, "updatedAt") ` +
      `VALUES ('${spec.id}li${i}', ${q(spec.id)}, ${q(name)}, ${amount}, ${paid}, ${balance}, now())`,
    )
  })
  return studentId
}

function payment(id: string, invoiceId: string, amount: number, o: { method?: string; reference?: string; lineIdx?: number; allocated?: number; at?: string } = {}): void {
  S.push(
    `INSERT INTO payments (id, "invoiceId", amount, method, reference, "recordedByUid", "paidAt") ` +
    `VALUES (${q(id)}, ${q(invoiceId)}, ${amount}, '${o.method ?? 'CASH'}', ${q(o.reference ?? null)}, 'fixture', ${o.at ? q(o.at) : 'now()'})`,
  )
  S.push(
    `INSERT INTO payment_allocations (id, "paymentId", "lineItemId", amount) ` +
    `VALUES ('${id}al', ${q(id)}, '${invoiceId}li${o.lineIdx ?? 0}', ${o.allocated ?? amount})`,
  )
}

const payEntry = (invoiceId: string, amount: number): void =>
  entry(`PAY-${tail8(invoiceId)}`, [['1000', amount, 0], ['4000', 0, amount]])

/** A fully consistent, fully posted invoice with one payment. */
function cleanInvoice(id: string, amount = 1000, method = 'CASH', reference?: string): void {
  invoice({ id, total: amount, paid: amount, balance: 0, lines: [['Tuition', amount, amount, 0]] })
  payment(`pay${id}`, id, amount, { method, reference })
  payEntry(id, amount)
}

// ── receivables ─────────────────────────────────────────────────────────────
cleanInvoice('invok0001')
cleanInvoice('invok0002', 1000, 'TNM_MPAMBA', 'TNM123')            // RC-11 (pair with 0003)
cleanInvoice('invok0003', 700, 'TNM_MPAMBA', ' tnm123 ')           // RC-11
cleanInvoice('invmm0001', 400, 'MOBILE_MONEY')                     // RC-13

// RC-01: payment recorded, never posted
invoice({ id: 'invnojrn1', total: 500, paid: 500, balance: 0, lines: [['Tuition', 500, 500, 0]] })
payment('paynojrn1', 'invnojrn1', 500)

// RC-02: one payment, posted twice; plus a payment entry for an invoice that does not exist
invoice({ id: 'invdupe01', total: 400, paid: 400, balance: 0, lines: [['Tuition', 400, 400, 0]] })
payment('paydupe01', 'invdupe01', 400)
payEntry('invdupe01', 400); payEntry('invdupe01', 400)
entry('PAY-ZZZZ9999', [['1000', 60, 0], ['4000', 0, 60]])

// RC-03 + RC-08: overpayment. 1,200 received, line balance 1,000: 200 became a credit but all 1,200 hit revenue.
{
  const stu = invoice({ id: 'invover01', total: 1000, paid: 1000, balance: 0, lines: [['Tuition', 1000, 1000, 0]] })
  payment('payover01', 'invover01', 1200, { allocated: 1200 })
  S.push(`INSERT INTO student_credits (id, "studentId", amount, "originalAmount", "sourcePaymentId") VALUES ('crover01', ${q(stu)}, 200, 200, 'payover01')`)
  payEntry('invover01', 1200)
}

// RC-04 + RC-07: credit lowered the total but not the line
invoice({ id: 'invlines01', total: 800, paid: 0, balance: 800, lines: [['Tuition', 1000, 0, 1000]] })

// RC-05 + RC-08: invoice says 300 paid, payments total 500
invoice({ id: 'invdrift01', total: 1000, paid: 300, balance: 700, lines: [['Tuition', 1000, 300, 700]] })
payment('paydrift01', 'invdrift01', 500, { allocated: 500 })
payEntry('invdrift01', 500)

// RC-06 + RC-07: balance column wrong (900, should be 800)
invoice({ id: 'invbal0001', total: 1000, paid: 200, balance: 900, lines: [['Tuition', 1000, 200, 800]] })
payment('paybal0001', 'invbal0001', 200)
payEntry('invbal0001', 200)

// RC-10: two penalty lines, latePenalty records one
invoice({
  id: 'invpen0001', total: 1100, paid: 0, balance: 1100, latePenalty: 50,
  lines: [['Tuition', 1000, 0, 1000], ['Late Payment Penalty', 50, 0, 50], ['Late Payment Penalty', 50, 0, 50]],
})

// RC-12: the same payment submitted twice
invoice({ id: 'invdsub001', total: 500, paid: 200, balance: 300, lines: [['Tuition', 500, 200, 300]] })
payment('paydsub01a', 'invdsub001', 100, { at: '2026-03-01T10:00:00Z' })
payment('paydsub01b', 'invdsub001', 100, { at: '2026-03-01T10:00:20Z' })
payEntry('invdsub001', 100); payEntry('invdsub001', 100)

// RC-09 (negative credit) + OR-01 (credit whose source payment is gone)
{
  student('stucredit1')
  S.push(`INSERT INTO student_credits (id, "studentId", amount, "originalAmount") VALUES ('crneg0001', 'stucredit1', -10, 0)`)
  S.push(`INSERT INTO student_credits (id, "studentId", amount, "originalAmount", "sourcePaymentId") VALUES ('crorph001', 'stucredit1', 25, 25, 'paygone001')`)
}

// RC-14: scholarship above 100 percent, and two active ones for one student and year
S.push(`INSERT INTO scholarships (id, name, "studentId", "discountType", value, "academicYear", "isActive") VALUES ('schover001', 'Over', 'stuS2', 'PERCENTAGE', 150, '2026', true)`)
S.push(`INSERT INTO scholarships (id, name, "studentId", "discountType", value, "academicYear", "isActive") VALUES ('scha000001', 'A', 'stuS1', 'PERCENTAGE', 10, '2026', true)`)
S.push(`INSERT INTO scholarships (id, name, "studentId", "discountType", value, "academicYear", "isActive") VALUES ('schb000001', 'B', 'stuS1', 'PERCENTAGE', 10, '2026', true)`)

// ── expenses and budgets ────────────────────────────────────────────────────
function budget(id: string, year: string, category: string, allocated: number, spent: number, dept = 'General', term: number | null = null): void {
  S.push(
    `INSERT INTO budgets (id, "academicYear", term, department, category, allocated, spent, "createdByUid", "updatedAt") ` +
    `VALUES (${q(id)}, ${q(year)}, ${q(term)}, ${q(dept)}, '${category}', ${allocated}, ${spent}, 'fixture', now())`,
  )
}
function expense(id: string, category: string, amount: number, year = '2026', status = 'APPROVED'): void {
  S.push(
    `INSERT INTO expenses (id, category, description, amount, "academicYear", term, status, "recordedByUid", "incurredAt") ` +
    `VALUES (${q(id)}, '${category}', 'fixture', ${amount}, ${q(year)}, 1, '${status}', 'fixture', now())`,
  )
}
const expEntry = (id: string, debit: number): void =>
  entry(`EXP-${tail8(id)}`, [['5100', debit, 0], ['1000', 0, debit]])

budget('budutil001', '2026', 'UTILITIES', 1000, 100)
expense('expok0001', 'UTILITIES', 100); expEntry('expok0001', 100)

budget('budmaint01', '2026', 'MAINTENANCE', 1000, 200)
expense('expnojrn1', 'MAINTENANCE', 200)                                   // EX-01

budget('budproc001', '2026', 'PROCUREMENT', 1000, 300)
expense('expdiff001', 'PROCUREMENT', 300); expEntry('expdiff001', 250)      // EX-02

budget('budlib0001', '2026', 'LIBRARY', 1000, 150)
expense('expdpaid01', 'LIBRARY', 150); expEntry('expdpaid01', 150)          // EX-03: cash credited at approval…
entry(`EXP-PAY-${tail8('expdpaid01')}`, [['2000', 150, 0], ['1000', 0, 150]]) // …and again when marked paid

budget('budsal0001', '2026', 'SALARIES', 1000, 500)
expense('expsal0001', 'SALARIES', 500); expEntry('expsal0001', 500)         // EX-04

budget('buddup0001', '2025', 'TRANSPORT', 500, 90, 'Sci')                   // EX-05 (pair)
budget('buddup0002', '2025', 'TRANSPORT', 500, 90, 'Sci')
expense('expsmear01', 'TRANSPORT', 90, '2025'); expEntry('expsmear01', 90)  // EX-06: matches two budgets

expense('expnobud01', 'MISCELLANEOUS', 80, '2024'); expEntry('expnobud01', 80) // EX-06: matches none

budget('budover001', '2027', 'UTILITIES', 100, 150)                         // EX-07: overspent
expense('expover001', 'UTILITIES', 150, '2027'); expEntry('expover001', 150)

// ── procurement ─────────────────────────────────────────────────────────────
S.push(`INSERT INTO departments (id, code, name, "updatedAt") VALUES ('dept00001', 'GEN', 'General', now())`)
S.push(`INSERT INTO suppliers (id, "supplierCode", name, "updatedAt") VALUES ('sup000001', 'SUP1', 'Supplier', now())`)
budget('budpo00001', '2030', 'MISCELLANEOUS', 5000, 0)
for (const rq of ['rq1', 'rq2', 'rq3']) {
  S.push(`INSERT INTO purchase_requisitions (id, "requisitionNumber", "departmentId", "requestedByUid", purpose, "updatedAt") VALUES ('${rq}00000', 'REQ-${rq}', 'dept00001', 'fixture', 'fixture', now())`)
}
const po = (id: string, rq: string, status: string, total: number): void => {
  S.push(
    `INSERT INTO purchase_orders (id, "poNumber", "purchaseRequisitionId", "supplierId", status, subtotal, total, "createdByUid", "updatedAt") ` +
    `VALUES ('${id}', 'PO-${id}', '${rq}00000', 'sup000001', '${status}', ${total}, ${total}, 'fixture', now())`,
  )
}
po('po1a00000', 'rq1', 'APPROVED', 100)      // PO-01 (two live POs on rq1)
po('po1b00000', 'rq1', 'DRAFT', 50)          // PO-01
po('po200000', 'rq2', 'APPROVED', 120)       // PO-02 (no commitment)
po('po300000', 'rq3', 'CANCELLED', 90)
const commit = (id: string, status: string, o: { rq?: string; po?: string }): void => {
  S.push(
    `INSERT INTO budget_commitments (id, "budgetId", "purchaseRequisitionId", "purchaseOrderId", amount, status, "createdByUid", "updatedAt") ` +
    `VALUES ('${id}', 'budpo00001', ${o.rq ? `'${o.rq}00000'` : 'NULL'}, ${o.po ? `'${o.po}'` : 'NULL'}, 100, '${status}', 'fixture', now())`,
  )
}
commit('cm1a00000', 'RESERVED', { rq: 'rq1' })               // PO-03 (two active on rq1)
commit('cm1b00000', 'COMMITTED', { rq: 'rq1' })              // PO-03
commit('cm300000', 'RESERVED', { rq: 'rq3', po: 'po300000' }) // PO-03 (active on a CANCELLED PO)

// ── library fines ───────────────────────────────────────────────────────────
const fine = (id: string, status: string, o: { student?: string | null; staff?: string | null; paidAt?: boolean } = {}): void => {
  S.push(
    `INSERT INTO library_fines (id, "studentId", "staffId", "bookTitle", amount, reason, status, "markedByUid", "paidAt") ` +
    `VALUES (${q(id)}, ${q(o.student === undefined ? 'stuinvok0001' : o.student)}, ${q(o.staff ?? null)}, 'Book', 100, 'late', '${status}', 'fixture', ${o.paidAt ? 'now()' : 'NULL'})`,
  )
}
const fineEntry = (id: string): void => entry(`LIB-${tail8(id)}`, [['1000', 100, 0], ['4300', 0, 100]])
S.push(
  `INSERT INTO staff_profiles (id, uid, "employeeNo", "firstName", "lastName", email, role, department, "jobTitle", "dateJoined", "updatedAt") VALUES ` +
  `('spone00001', 'uidone', 'E1', 'S', 'One', 's1@example.invalid', 'lower_rank', 'Gen', 'T', now(), now()), ` +
  `('sptwo00001', 'uidtwo', 'E2', 'S', 'Two', 's2@example.invalid', 'lower_rank', 'Gen', 'T', now(), now()), ` +
  `('spthree001', 'uidthree', 'E3', 'S', 'Three', 's3@example.invalid', 'lower_rank', 'Gen', 'T', now(), now())`,
)
fine('fineok0001', 'PAID', { paidAt: true }); fineEntry('fineok0001')              // clean
fine('finestaff1', 'PENDING', { student: null, staff: 'spone00001' })              // clean (valid staff borrower)
fine('finenoj001', 'PAID', { paidAt: true })                                        // LF-01
fine('finewaive1', 'WAIVED'); fineEntry('finewaive1')                               // LF-02 (waived after cash)
fine('finedbl001', 'PAID', { paidAt: true }); fineEntry('finedbl001'); fineEntry('finedbl001') // LF-02 + JR-02
fine('finecontra1', 'WAIVED', { paidAt: true })                                     // LF-03
fine('fineorph01', 'PENDING', { student: 'nostudent' })                             // OR-02
fine('fineorph02', 'PENDING', { student: null })                                    // OR-02 (no borrower)

// ── payroll and loans ───────────────────────────────────────────────────────
const run = (id: string, month: number, status: string, gross: number, net: number): void => {
  S.push(`INSERT INTO payroll_runs (id, month, year, status, "totalGross", "totalNet", "runByUid") VALUES ('${id}', ${month}, 2026, '${status}', ${gross}, ${net}, 'fixture')`)
}
const slip = (id: string, runId: string, staffUid: string, gross: number, paye: number, pension: number, loan: number, net: number): void => {
  S.push(
    `INSERT INTO payslips (id, "payrollRunId", "staffUid", "staffName", "grossSalary", paye, pension, "loanDeduction", "netSalary") ` +
    `VALUES ('${id}', '${runId}', '${staffUid}', 'Fixture', ${gross}, ${paye}, ${pension}, ${loan}, ${net})`,
  )
}
const payrollEntry = (month: number, gross: number, net: number): void =>
  entry(`PAY-2026-${String(month).padStart(2, '0')}`, [['5000', gross, 0], ['2100', 0, net], ...(gross - net > 0 ? ([['2000', 0, gross - net]] as Line[]) : [])])

run('runok00001', 1, 'LOCKED', 1000, 800); slip('psok000001', 'runok00001', 'uidone', 1000, 100, 50, 50, 800); payrollEntry(1, 1000, 800)
run('runnojrn01', 2, 'LOCKED', 500, 500); slip('psnojrn001', 'runnojrn01', 'uidtwo', 500, 0, 0, 0, 500)            // PR-01
run('rundbl0001', 3, 'LOCKED', 300, 300); slip('psdbl00001', 'rundbl0001', 'uidtwo', 300, 0, 0, 0, 300)
payrollEntry(3, 300, 300); payrollEntry(3, 300, 300)                                                                // PR-02 + PR-03 + JR-02
run('runstate01', 4, 'APPROVED', 100, 100); slip('psstate001', 'runstate01', 'uidtwo', 100, 0, 0, 0, 100); payrollEntry(4, 100, 100) // PR-02 (posted, not locked)
run('runbad0001', 5, 'PENDING_APPROVAL', 200, 150); slip('psbad00001', 'runbad0001', 'uidone', 200, 20, 10, 0, 150)    // PR-04
run('runtot0001', 6, 'PROCESSING', 1000, 900); slip('pstot00001', 'runtot0001', 'uidtwo', 990, 0, 0, 0, 990)         // PR-05

const loan = (id: string, staffId: string, status: string, amount: number, repaid: number, balance: number, disbursed = false): void => {
  S.push(
    `INSERT INTO staff_loans (id, "staffId", amount, "monthlyDeduction", "totalRepaid", balance, reason, status, "disbursedAt", "updatedAt") ` +
    `VALUES ('${id}', '${staffId}', ${amount}, 50, ${repaid}, ${balance}, 'fixture', '${status}', ${disbursed ? 'now()' : 'NULL'}, now())`,
  )
}
loan('loanok0001', 'spone00001', 'REPAYING', 500, 50, 450, true)     // PR-08 (disbursed, no journal) — otherwise consistent
loan('loanbad001', 'sptwo00001', 'DISBURSED', 300, 400, -100, true)   // PR-06, PR-07, PR-08
loan('loanopen01', 'spthree001', 'PENDING', 100, 0, 100)              // PR-09 (pair)
loan('loanopen02', 'spthree001', 'APPROVED', 100, 0, 100)

// ── ledger integrity and references ─────────────────────────────────────────
entry('ADJ-UNB', [['5900', 100, 0], ['1000', 0, 90]])                 // LG-01
entry('ADJ-EMPTY', [])                                                // LG-02
entry('DRAFT-OLD', [['5900', 70, 0], ['1000', 0, 70]], { posted: false, ageDays: 2 })   // LG-03
entry('DRAFT-NEW', [['5900', 10, 0], ['1000', 0, 10]], { posted: false })               // not flagged (recent)
entry('ADJ-NEG', [['5900', 20, 0], ['1100', 0, 20]])                  // LG-05 (receivables below zero)
entry('ADJ-1', [['5900', 5, 0], ['1000', 0, 5]])                      // JR-01 (reversed twice)
entry('VOID-ADJ-1', [['1000', 5, 0], ['5900', 0, 5]])
entry('VOID-ADJ-1', [['1000', 5, 0], ['5900', 0, 5]])
entry('VOID-ADJ-2', [['1000', 5, 0], ['5900', 0, 5]])                 // JR-01 (reversal with no original)

// Make every cached account balance correct, then break one on purpose (LG-04).
S.push(
  `UPDATE chart_of_accounts ca SET balance = COALESCE((
     SELECT SUM(CASE WHEN ca.type IN ('ASSET', 'EXPENSE') THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END)
     FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalEntryId" AND je."isPosted" = true
     WHERE jl."accountId" = ca.id), 0)`,
)
S.push(`UPDATE chart_of_accounts SET balance = 999 WHERE code = '4300'`)

/** Statements to run, in order, against a throwaway database that has the repo's migrations applied. */
export const FIXTURE_STATEMENTS: readonly string[] = S

/** Rows each check must return for the fixture above. Checks not listed must return 0. */
export const EXPECTED_ROWS: Readonly<Record<string, number>> = {
  'LG-01': 1, 'LG-02': 1, 'LG-03': 1, 'LG-04': 1, 'LG-05': 1,
  'JR-01': 2, 'JR-02': 2,
  'RC-01': 1, 'RC-02': 2, 'RC-03': 1, 'RC-04': 1, 'RC-05': 1, 'RC-06': 1, 'RC-07': 2, 'RC-08': 2,
  'RC-09': 1, 'RC-10': 1, 'RC-11': 1, 'RC-12': 1, 'RC-13': 1, 'RC-14': 3,
  'EX-01': 1, 'EX-02': 1, 'EX-03': 1, 'EX-04': 1, 'EX-05': 2, 'EX-06': 2, 'EX-07': 1,
  'PO-01': 2, 'PO-02': 1, 'PO-03': 3,
  'LF-01': 1, 'LF-02': 2, 'LF-03': 1, 'LF-04': 0,
  'PR-01': 1, 'PR-02': 2, 'PR-03': 1, 'PR-04': 1, 'PR-05': 1, 'PR-06': 1, 'PR-07': 1, 'PR-08': 2, 'PR-09': 1,
  'OR-01': 1, 'OR-02': 2,
}
