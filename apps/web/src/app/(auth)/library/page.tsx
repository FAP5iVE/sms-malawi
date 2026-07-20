'use client'

/*
 * apps/web/src/app/(auth)/library/page.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE of the action-wiring and RoleGuard
 *   configuration (the catalog/search layout itself is unaffected)
 * [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
 * [PURPOSE]:
 *   1. RoleGuard.allowed: added 'finance' and 'hr' (both hold
 *      library.viewCatalog/.viewDigitalResources/.viewOwnBorrowings/
 *      .viewOwnFines per the permission matrix but were fully blocked
 *      from this page) and removed 'lower_rank' (explicitly `–` for
 *      library.viewCatalog in the same table, but was previously
 *      included).
 *   2. Wired the declared-but-unused useIssueBorrowing()/useReturnBook()
 *      instances' .mutate to real Issue/Return button click handlers —
 *      both hooks reach a fully live, now-corrected backend but nothing
 *      previously called them. Gated with PermissionGuard against
 *      library.issueBook/.processReturn specifically (library role only),
 *      not the page's old ad hoc admin+library isLibStaff check — these
 *      are new buttons as of this phase, so they are wired against the
 *      real permission from the start rather than perpetuating the
 *      admin-over-grant this same phase's library.ts fix removes
 *      server-side.
 *   3. Added real onSuccess/onError handling to scanBarcode.mutate() —
 *      previously fired and its result discarded. A match now shows the
 *      book and offers to proceed straight into the issue flow; a miss
 *      shows an inline error instead of silently doing nothing.
 *   4. Added a real entry point into DigitalResourceViewer.tsx per
 *      digital-resource row, replacing the old window.open(d.url) call —
 *      the viewer's enforcement layers (sandboxed iframe, no-download
 *      overlay) never actually ran when the raw URL was opened directly.
 *   5. Added <label>/aria-label associations to the search and barcode
 *      inputs — a deferred-to-R19 category in general, but the entry-point
 *      wiring above already requires touching this markup, so the minimal
 *      label fix is bundled here rather than reopening the file a second
 *      time.
 *   6. Added a Recommendations panel (submit — library.recommendResource;
 *      approve/reject — library.approveRecommendation) and a self-service
 *      Fine Waiver request form (any authenticated user, matching the
 *      route's own self-service gate) plus a staff review list
 *      (library.waiveFine) — the two libraryWorkflowService.ts workflows
 *      this phase repairs and wires into library.ts now have a real UI
 *      path end-to-end, not just a reachable API.
 * [DEPENDS ON]: apps/web/src/hooks/useLibrary.ts (recommendation/
 *   fine-waiver hooks — same phase), apps/web/src/components/library/
 *   DigitalResourceViewer.tsx (repointed — same phase),
 *   apps/web/src/server/routes/library.ts (permission gating — same
 *   phase)
 */

import { useState, Suspense } from 'react'
import { useSearchParams }   from 'next/navigation'
import { RoleGuard }         from '@/components/shared/RoleGuard'
import { PermissionGuard }   from '@/components/shared/PermissionGuard'
import { useAuthStore }      from '@/store/authStore'
import {
  useBooks,
  useLibraryStats,
  useBorrowings,
  useDigitalResources,
  useScanBarcode,
  useIssueBorrowing,
  useReturnBook,
  useRecommendations,
  useCreateRecommendation,
  useApproveRecommendation,
  useRejectRecommendation,
  useFineWaivers,
  useCreateFineWaiver,
  useApproveFineWaiver,
  useRejectFineWaiver,
}                            from '@/hooks/useLibrary'
import { DigitalResourceViewer } from '@/components/library/DigitalResourceViewer'
import { BookOpen, Scan, FileText, AlertTriangle, Eye, Check, X as XIcon, Undo2 } from 'lucide-react'
import { ModuleTabs }        from '@/components/shared/ModuleTabs'
import type {
  ApiBook,
  ApiBorrowing,
  ApiDigitalResource,
  ApiLibraryStats,
}                            from '@shared/types/api'

/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Initialises the active tab from ?tab= (post-hydration) so
 *   LibraryDashboard's corrected quick actions can deep-link.
 */
type Tab = 'catalog' | 'borrowings' | 'digital' | 'recommendations'

const TABS = [
  { id: 'catalog'         as Tab, label: 'Book Catalog',      icon: BookOpen  },
  { id: 'borrowings'      as Tab, label: 'Borrowings',        icon: Scan      },
  { id: 'digital'         as Tab, label: 'Digital Library',   icon: FileText  },
  { id: 'recommendations' as Tab, label: 'Recommendations',   icon: Check     },
]

export default function LibraryPage() {
  return (
    <RoleGuard
      allowed={[
        'admin',
        'library',
        'high_rank',
        'academic',
        'finance',
        'hr',
        'student',
        'exam_officer',
      ]}
    >
      {/* useSearchParams() requires a Suspense boundary or `next build` fails —
          same convention as (public)/login/page.tsx and (auth)/exams/page.tsx. */}
      <Suspense fallback={null}>
        <LibraryContent />
      </Suspense>
    </RoleGuard>
  )
}

function LibraryContent() {
  const { role }  = useAuthStore()

  // R19 — the active tab is derived from ?tab= during render via Next's
  // useSearchParams() (the codebase's established pattern — see
  // (public)/login/page.tsx, (auth)/exams/page.tsx, (auth)/finances/page.tsx,
  // (auth)/hr/page.tsx) instead of a useEffect that read
  // window.location.search and called setTab post-mount. useSearchParams()
  // is backed by the actual request URL on the server, so a deep-linked tab
  // (/library?tab=borrowings, ?tab=catalog from LibraryDashboard's quick
  // actions) now renders on first paint. Valid ids are read straight off
  // the module-level TABS list instead of duplicating them in a second array.
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const validTabIds = TABS.map((t) => t.id) as string[]
  const initialTab: Tab = tabParam && validTabIds.includes(tabParam) ? (tabParam as Tab) : 'catalog'

  const [tab, setTab]               = useState<Tab>(initialTab)
  const [search, setSearch]         = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanResult, setScanResult] = useState<ApiBook | null>(null)
  const [scanError, setScanError]   = useState<string | null>(null)
  const [viewingResource, setViewingResource] = useState<{ id: string; title: string } | null>(null)

  const [recTitle, setRecTitle]   = useState('')
  const [recReason, setRecReason] = useState('')
  const [waiverFineId, setWaiverFineId] = useState('')
  const [waiverReason, setWaiverReason] = useState('')
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null)

  const isLibStaff = ['admin', 'library'].includes(role ?? '')

  const { data: stats }             = useLibraryStats()
  const { data: books = [],  isLoading } = useBooks({ search })
  const { data: overdue = [] }      = useBorrowings({ overdue: true })
  const { data: digitalResources = [] } = useDigitalResources()
  const { data: recommendations = [] }  = useRecommendations('PENDING')
  const { data: fineWaivers = [] }      = useFineWaivers('PENDING')

  const scanBarcode        = useScanBarcode()
  const issueBorrowing     = useIssueBorrowing()
  const returnBook         = useReturnBook()
  const createRecommendation  = useCreateRecommendation()
  const approveRecommendation = useApproveRecommendation()
  const rejectRecommendation  = useRejectRecommendation()
  const createFineWaiver      = useCreateFineWaiver()
  const approveFineWaiver     = useApproveFineWaiver()
  const rejectFineWaiver      = useRejectFineWaiver()

  const s = stats as ApiLibraryStats | undefined

  function handleScan(barcode: string) {
    if (!barcode) return
    setScanError(null)
    setScanResult(null)
    scanBarcode.mutate(barcode, {
      onSuccess: (book) => setScanResult(book as ApiBook),
      onError:   (err) => setScanError(err instanceof Error ? err.message : 'No book found for that barcode.'),
    })
    setBarcodeInput('')
  }

  function handleIssue(bookId: string) {
    const studentId = window.prompt('Student ID to issue this book to (leave blank if issuing to staff):')?.trim()
    const staffId = studentId ? undefined : window.prompt('Staff ID to issue this book to:')?.trim()
    if (!studentId && !staffId) return
    const dueDate = window.prompt('Due date (YYYY-MM-DD):', '')?.trim()
    if (!dueDate) return
    issueBorrowing.mutate({
      bookId,
      borrowerType: studentId ? 'STUDENT' : 'STAFF',
      studentId: studentId || undefined,
      staffId: staffId || undefined,
      dueDate,
    }, {
      onSuccess: () => setScanResult(null),
    })
  }

  function handleReturn(borrowingId: string) {
    returnBook.mutate({ borrowingId, data: { condition: 'GOOD' } })
  }

  function handleSubmitRecommendation() {
    if (!recTitle.trim() || !recReason.trim()) return
    createRecommendation.mutate(
      { title: recTitle, type: 'BOOK', reason: recReason },
      {
        onSuccess: () => {
          setRecTitle(''); setRecReason('')
          setWorkflowMessage('Recommendation submitted for library staff review.')
        },
      },
    )
  }

  function handleSubmitFineWaiver() {
    if (!waiverFineId.trim() || !waiverReason.trim()) return
    createFineWaiver.mutate(
      { fineId: waiverFineId, reason: waiverReason },
      {
        onSuccess: () => {
          setWaiverFineId(''); setWaiverReason('')
          setWorkflowMessage('Fine waiver request submitted for review.')
        },
        onError: (err) => setWorkflowMessage(err instanceof Error ? err.message : 'Could not submit waiver request.'),
      },
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Library</h1>
          <p className="text-sm text-muted mt-0.5">
            Physical catalog, borrowing, and digital resources
          </p>
        </div>
      </div>

      {/* Summary stat tiles */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Books',   value: s.totalBooks,         warn: false                      },
            { label: 'On Loan',       value: s.activeBorrowings,   warn: false                      },
            { label: 'Overdue',       value: s.overdueBorrowings,  warn: s.overdueBorrowings > 0    },
            { label: 'Digital Files', value: s.digitalCount,       warn: false                      },
          ].map(({ label, value, warn }) => (
            <div
              key={label}
              className={`bg-surface border rounded-xl p-4 text-center ${
                warn ? 'border-brand-coral/30 bg-brand-coral/5' : 'border-base'
              }`}
            >
              <p className={`text-2xl font-bold ${warn ? 'text-brand-coral' : 'text-brand-navy'}`}>
                {value}
              </p>
              <p className="text-xs text-muted mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Mobile-scrollable tab navigation — C7 */}
      <ModuleTabs<Tab>
        tabs={TABS}
        active={tab}
        onChange={setTab}
        variant="underline"
        id="library-tabs"
      />

      {/* ── Catalog tab ───────────────────────────────────────────────────── */}
      {tab === 'catalog' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48">
              <label htmlFor="library-search" className="sr-only">Search title, author, or ISBN</label>
              <input
                id="library-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, author, ISBN…"
                className="border border-base rounded-xl px-4 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              />
            </div>
            {isLibStaff && (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <label htmlFor="library-barcode" className="sr-only">Scan or enter a barcode</label>
                  <input
                    id="library-barcode"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Scan barcode…"
                    className="border border-base rounded-xl px-3 py-2.5 text-sm w-36 focus:outline-none"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleScan(barcodeInput) }}
                  />
                  <button
                    type="button"
                    onClick={() => handleScan(barcodeInput)}
                    aria-label="Scan barcode"
                    className="bg-brand-navy text-white px-3 py-2 rounded-xl text-sm min-h-11"
                  >
                    <Scan className="w-4 h-4" aria-hidden />
                  </button>
                </div>
                {scanError && <p className="text-xs text-brand-coral">{scanError}</p>}
                {scanResult && (
                  <div className="text-xs bg-brand-teal/10 border border-brand-teal/25 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span>Found: <strong>{scanResult.title}</strong></span>
                    <PermissionGuard permission="library.issueBook">
                      <button
                        type="button"
                        onClick={() => handleIssue(scanResult.id)}
                        className="text-brand-teal font-semibold underline min-h-11"
                      >
                        Issue this book
                      </button>
                    </PermissionGuard>
                  </div>
                )}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted animate-pulse">
              Loading catalog…
            </div>
          ) : (
            <div className="border border-base rounded-xl overflow-hidden">
              {/* Mobile card list — books */}
              <div className="divide-y divide-base md:hidden">
                {(books as ApiBook[]).map((b) => (
                  <div key={b.id} className="px-4 py-3">
                    <p className="font-heading font-semibold text-sm text-body">{b.title}</p>
                    <p className="text-xs text-muted mt-0.5">{b.author}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs bg-base rounded px-2 py-0.5">{b.category}</span>
                      <span className="text-xs text-muted">{b.totalCopies} copies</span>
                      <span className={`text-xs font-semibold ${b.availableCopies === 0 ? 'text-brand-coral' : 'text-brand-teal'}`}>
                        {b.availableCopies} available
                      </span>
                      <PermissionGuard permission="library.issueBook">
                        <button
                          type="button"
                          disabled={b.availableCopies === 0}
                          onClick={() => handleIssue(b.id)}
                          className="ml-auto text-xs font-semibold text-brand-teal underline disabled:opacity-40 min-h-11"
                        >
                          Issue
                        </button>
                      </PermissionGuard>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table — books */}
              <table className="w-full text-sm border-collapse hidden md:table">
                <thead>
                  <tr className="bg-page border-b border-base">
                    {['Title', 'Author', 'Category', 'Copies', 'Available', ''].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-base">
                  {(books as ApiBook[]).map((b) => (
                    <tr key={b.id} className="hover:bg-page">
                      <td className="px-4 py-3 font-medium">{b.title}</td>
                      <td className="px-4 py-3 text-muted">{b.author}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-base rounded px-2 py-0.5">{b.category}</span>
                      </td>
                      <td className="px-4 py-3 text-center">{b.totalCopies}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`font-semibold ${
                            b.availableCopies === 0 ? 'text-brand-coral' : 'text-brand-teal'
                          }`}
                        >
                          {b.availableCopies}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PermissionGuard permission="library.issueBook">
                          <button
                            type="button"
                            disabled={b.availableCopies === 0}
                            onClick={() => handleIssue(b.id)}
                            className="text-xs font-semibold text-brand-teal underline disabled:opacity-40 min-h-11"
                          >
                            Issue
                          </button>
                        </PermissionGuard>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(books as ApiBook[]).length === 0 && (
                <div className="text-center py-12 text-muted text-sm">No books found.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Borrowings tab ────────────────────────────────────────────────── */}
      {tab === 'borrowings' && (
        <div className="space-y-4">
          {(overdue as ApiBorrowing[]).length > 0 && (
            <div role="status" aria-live="polite" className="bg-brand-coral/8 border border-brand-coral/25 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-brand-coral shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-semibold text-brand-coral">
                    {(overdue as ApiBorrowing[]).length} overdue borrowing(s)
                  </p>
                  <p className="text-sm text-muted mt-0.5">
                    Fines are applied automatically on return.
                  </p>
                </div>
              </div>
              <ul className="mt-3 divide-y divide-brand-coral/15">
                {(overdue as ApiBorrowing[]).map((b) => (
                  <li key={b.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <span>{b.book?.title ?? 'Untitled'} — due {new Date(b.dueDate).toLocaleDateString()}</span>
                    <PermissionGuard permission="library.processReturn">
                      <button
                        type="button"
                        onClick={() => handleReturn(b.id)}
                        className="flex items-center gap-1.5 text-brand-teal font-semibold underline min-h-11"
                      >
                        <Undo2 className="w-3.5 h-3.5" aria-hidden /> Mark returned
                      </button>
                    </PermissionGuard>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-surface border border-base rounded-xl p-4 space-y-3">
            <h3 className="font-heading font-semibold text-sm text-body">Request a Fine Waiver</h3>
            <p className="text-xs text-muted">
              Have an outstanding library fine you&apos;d like reviewed? Submit the fine ID with your reason below.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="waiver-fine-id" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Fine ID</label>
                <input id="waiver-fine-id" value={waiverFineId} onChange={(e) => setWaiverFineId(e.target.value)}
                  className="w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
              </div>
              <div>
                <label htmlFor="waiver-reason" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Reason</label>
                <input id="waiver-reason" value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)}
                  className="w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
              </div>
            </div>
            <button type="button" onClick={handleSubmitFineWaiver} disabled={createFineWaiver.isPending}
              className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60">
              {createFineWaiver.isPending ? 'Submitting…' : 'Submit Waiver Request'}
            </button>
            {workflowMessage && <p className="text-sm text-brand-teal">{workflowMessage}</p>}
          </div>

          <PermissionGuard permission="library.waiveFine">
            <div className="bg-surface border border-base rounded-xl p-4">
              <h3 className="font-heading font-semibold text-sm text-body mb-3">Pending Fine Waiver Requests</h3>
              {fineWaivers.length === 0 ? (
                <p className="text-sm text-muted">No pending waiver requests.</p>
              ) : (
                <ul className="divide-y divide-base">
                  {fineWaivers.map((w) => (
                    <li key={w.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span>{w.reason} — MWK {w.amount}</span>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => approveFineWaiver.mutate(w.id)} aria-label="Approve waiver" className="text-brand-teal min-h-11 min-w-11 flex items-center justify-center"><Check className="w-4 h-4" /></button>
                        <button type="button" onClick={() => {
                          const reason = window.prompt('Reason for rejecting this waiver request:')
                          if (reason) rejectFineWaiver.mutate({ id: w.id, reason })
                        }} aria-label="Reject waiver" className="text-brand-coral min-h-11 min-w-11 flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PermissionGuard>
        </div>
      )}

      {/* ── Digital library tab ────────────────────────────────────────────── */}
      {tab === 'digital' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(digitalResources as ApiDigitalResource[]).map((r) => (
              <div key={r.id} className="bg-surface border border-base rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-body">{r.title}</p>
                    <p className="text-xs text-muted mt-1">
                      {r.type}
                      {r.subject ? ` · ${r.subject}` : ''}
                      {r.form    ? ` · Form ${r.form}` : ''}
                    </p>
                    {!r.approved && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        Pending Approval
                      </span>
                    )}
                  </div>
                  {(r.approved || isLibStaff) && (
                    <button
                      type="button"
                      onClick={() => setViewingResource({ id: r.id, title: r.title })}
                      aria-label={`View ${r.title}`}
                      className="p-2 hover:bg-page rounded-xl text-brand-teal shrink-0 min-h-11 min-w-11 flex items-center justify-center"
                    >
                      <Eye className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {(digitalResources as ApiDigitalResource[]).length === 0 && (
              <div className="col-span-3 text-center py-16 text-muted text-sm border border-base rounded-xl">
                No digital resources yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Recommendations tab ──────────────────────────────────────────── */}
      {tab === 'recommendations' && (
        <div className="space-y-4">
          <PermissionGuard permission="library.recommendResource">
            <div className="bg-surface border border-base rounded-xl p-4 space-y-3">
              <h3 className="font-heading font-semibold text-sm text-body">Recommend a Resource</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="rec-title" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Title</label>
                  <input id="rec-title" value={recTitle} onChange={(e) => setRecTitle(e.target.value)}
                    className="w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                </div>
                <div>
                  <label htmlFor="rec-reason" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Why should the library acquire this?</label>
                  <input id="rec-reason" value={recReason} onChange={(e) => setRecReason(e.target.value)}
                    className="w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                </div>
              </div>
              <button type="button" onClick={handleSubmitRecommendation} disabled={createRecommendation.isPending}
                className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60">
                {createRecommendation.isPending ? 'Submitting…' : 'Submit Recommendation'}
              </button>
              {workflowMessage && <p className="text-sm text-brand-teal">{workflowMessage}</p>}
            </div>
          </PermissionGuard>

          <PermissionGuard permission="library.approveRecommendation">
            <div className="bg-surface border border-base rounded-xl p-4">
              <h3 className="font-heading font-semibold text-sm text-body mb-3">Pending Recommendations</h3>
              {recommendations.length === 0 ? (
                <p className="text-sm text-muted">No pending recommendations.</p>
              ) : (
                <ul className="divide-y divide-base">
                  {recommendations.map((r) => (
                    <li key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium">{r.title}</p>
                        <p className="text-xs text-muted">{r.reason}</p>
                      </div>
                      <div className="flex gap-3 shrink-0">
                        <button type="button" onClick={() => approveRecommendation.mutate({ id: r.id })} aria-label="Approve recommendation" className="text-brand-teal min-h-11 min-w-11 flex items-center justify-center"><Check className="w-4 h-4" /></button>
                        <button type="button" onClick={() => {
                          const reason = window.prompt('Reason for rejecting this recommendation:')
                          if (reason) rejectRecommendation.mutate({ id: r.id, reason })
                        }} aria-label="Reject recommendation" className="text-brand-coral min-h-11 min-w-11 flex items-center justify-center"><XIcon className="w-4 h-4" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PermissionGuard>
        </div>
      )}

      {viewingResource && (
        <DigitalResourceViewer
          resourceId={viewingResource.id}
          title={viewingResource.title}
          onClose={() => setViewingResource(null)}
        />
      )}
    </div>
  )
}