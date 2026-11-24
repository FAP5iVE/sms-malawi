# Invoice entry: "Students to bill" list (24 Nov 2026)

Owner request: under the student search bar on **Finances > Invoice entry and allocation** ("Bill to (select student)"),
show a list of all students. Only the standard number of rows per page, the rest on the next page. Filter by how much
they owe or how recently their invoice is due. Default: students who have been due for a very long time come first.
The search bar and its workflow stay exactly as they are.

## What was done

- A **Students to bill** list now sits under the search bar while no student is selected.
- Picking a row does exactly what picking a search result does (`selectStudent`), so the rest of the screen (ledger,
  payment, allocation, overpayment confirmation) is untouched.
- The search bar, its two character minimum and its dropdown are unchanged. The dropdown still opens over the list.
- Three controls above the list:
  - **Show:** All students (default), Overdue, Owing but not yet due, Not billed this term, Fully paid. Each shows a count.
  - **Order by:** Longest overdue first (default), Largest balance first, Newest due date first, Name A to Z.
  - **Class:** All classes (default) or one class.
- Paging uses the app's standard pager (`usePagedRows` + `ListPager`): 25 rows per page by default, with 10, 25 or 50
  on desktop, and "Show 20 more" on phones. It hides itself when there are 10 rows or fewer.
- Each row shows name, registration number, class, the total owed, the date the oldest invoice was due, and a status
  word ("Overdue 142 days", "Not yet due", "Not billed this term", "Fully paid").
- The three controls are held in the parent screen, so after paying one student and pressing **Change**, the cashier
  returns to the same filter, order and class instead of the defaults.

## Decisions (and the second check of each)

1. **Compute it on the server, across all terms and years.**
   *Alternative:* build it in the browser from `useInvoices` and `useStudents`. *Rejected:* `useInvoices` is scoped to one
   year and term, so arrears carried from an earlier term would be invisible, and those are exactly the students "due for
   a very long period". `useStudents` is search-first and paged, so it cannot list everyone. A small read-only endpoint
   (`GET /finances/billing-standing`) is the sound way.
   *Second check:* the endpoint only reads, uses the same role set as `GET /invoices`, and adds no writes.

2. **"Overdue" means a balance on an invoice whose due date has passed, not `status = OVERDUE`.**
   *Why:* the `OVERDUE` status is only set when the late penalty job runs, so an invoice a month late can still say
   `UNPAID` or `PARTIAL`. This matches the receivables aging report (`financeAging.ts`), so the two screens agree.
   An invoice due today is not overdue (same as the aging report).
   *Second check:* tested with sample data; the 400 day, 200 day and 30 day cases and the "due today" case all behave.

3. **Days overdue come from the oldest unpaid overdue invoice.** That is how long the family has really been behind.
   Total owed adds up every invoice with a balance, so a student with three small old balances is not hidden.

4. **Default order.** Four exclusive standings, in this order: overdue (longest first, then larger balance), owing but not
   yet due (soonest due first, because they are next in line), owes nothing but has no invoice this term (the cashier may
   need to bill them), fully paid. Names break every tie, so the order never jumps around between loads.

5. **"Not billed this term" is its own filter, not a standing.** A student who is overdue from last term and has no invoice
   this term matches it, so the cashier can find everyone still to be billed. In the default order that student stays in
   the overdue group.

6. **Newest due date first** sorts by the latest due date among invoices still owing. Students who owe nothing go last.
   This was the reading chosen for "how recent in their invoice due". See open questions.

7. **Client side filtering and paging on one payload.** The list is one row per active student (a few hundred bytes each),
   so sorting, filtering and paging in the browser is instant and follows the app's paging rule (client side on loaded
   rows). Server paging would need its own pager and would make the counts beside each filter wrong.

8. **Only ACTIVE students**, the same set the search already offers. The picker cannot bill a graduated or archived
   student anyway.

9. **Credits are not netted off.** Advance credit is applied to the next invoice when it is generated. The amounts in the
   list are the invoice balances the cashier sees after picking the student.

10. **The list hides as soon as a student is picked**, so the click visibly does something while the student loads.

## Files changed

| File | Change |
| --- | --- |
| `packages/shared/types/api.ts` | New `ApiStudentBillingStanding` and `ApiStudentBillingStandingResponse` types. |
| `apps/web/src/server/services/feeService.ts` | New `listStudentBillingStanding()` (read only). |
| `apps/web/src/server/routes/finances.ts` | New `GET /finances/billing-standing` (admin, high rank, finance). |
| `apps/web/src/lib/api-client.ts` | New query key `finances.billingStanding`. |
| `apps/web/src/hooks/useFinances.ts` | New `useStudentBillingStanding()`. Refreshes automatically after a payment or invoice, because it sits under the `finances` key. |
| `apps/web/src/components/finances/InvoicesTab.tsx` | Ranking and filter rules, `StudentBillingList`, and the three controls held in the parent. |
| `apps/web/docs/security/endpoint-inventory.md` | Added the new route and bumped the two totals (610 to 611 endpoints, 521 to 522 gated). `securityDocs.test.ts` fails CI if this generated file does not match the code. |
| `apps/web/docs/invoice-student-list.md` | This file. |

No database change, no migration, no new package, no new component file.

## How it was checked

- No dependencies can be installed in the build environment, so the project could not be type checked or run end to end.
- Every changed file was syntax checked with the TypeScript compiler.
- The endpoint inventory row was written by hand in the generator's exact format and sort position, because the
  generator needs project dependencies. Running `pnpm --filter web docs:security` will confirm it produces no change.
- `hills:ratchets` gives the same result with and without these changes (pills 0, legacy pairs 0, dead CSS 0, 41 AI
  tells). It already reports one breach on the untouched repo (the "abbreviation" rule, 8 against a limit of 1), which
  these changes do not affect.
- `hills:inventory:check` already reports drift in dozens of files on the untouched repo, `InvoicesTab.tsx` included.
  These changes add `useFinances.ts` to that list. That is expected: the new hook is a deliberate logic change.
  This file was not regenerated, so as not to hide the other pending drift.
- The ranking and filter functions were extracted and run against sample students (overdue by different amounts, same
  days with different balances, due soon, due later, not billed, fully paid): default order, all four sorts and all five
  filters gave the expected result.
- The server aggregation was run against a mocked database: totals, overdue amount, invoice count, oldest due date,
  days overdue, the "billed this term" flag and the due-today case were all correct.

## Please run before release

1. `pnpm typecheck` and `pnpm lint` (the build environment could not).
2. Open Finances > Invoice entry as finance, high rank and admin. Confirm the list loads and the default order puts the
   longest overdue first.
3. Search a name, pick a result: the screen must behave exactly as before.
4. Pick a row from the list, record a payment, press **Change**: the list should show the new balance and keep your filter.
5. Check a phone width: "Show 20 more" appears instead of page buttons.

## What remains / open questions

- **"How recent their invoice is due":** read as "newest due date first". If the intention was "most recently became
  overdue" (shortest overdue first), it is a one line change to the sort.
- **Graduated or archived students who still owe fees** are not in this list (the picker only handles active students).
  A separate debtors view for them would be a new request.
- **Very large schools:** at several thousand students the payload is still small, but if it grows the same endpoint can
  take page and filter parameters without changing the screen.
- **Class filter** matches on the class name text (for example "Form 2B"). Two classes that share a name would be merged
  in the dropdown; each student has one current class, so this is unlikely to matter.
- **Tests:** no automated test was added because the project's test runner could not be started here. The logic checks
  above are easy to turn into unit tests for `sortStandings` and `listStudentBillingStanding`.
