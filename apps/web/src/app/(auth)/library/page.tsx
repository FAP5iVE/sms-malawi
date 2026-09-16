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

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { getAuth } from 'firebase/auth'
import { useSearchParams }   from 'next/navigation'
import { RoleGuard }         from '@/components/shared/RoleGuard'
import { PermissionGuard }   from '@/components/shared/PermissionGuard'
import { useAuthStore }      from '@/store/authStore'
import {
  useBooks,
  useBook,
  useLibraryStats,
  useBorrowings,
  useDigitalResources,
  useScanBarcode,
  useIssueBorrowing,
  useReturnBook,
  useMarkBookCondition,
  useRenewBorrowing,
  useRecommendations,
  useCreateRecommendation,
  useApproveRecommendation,
  useRejectRecommendation,
  useFineWaivers,
  useCreateFineWaiver,
  useApproveFineWaiver,
  useRejectFineWaiver,
  useUpdateBook,
  useArchiveBook,
  useCreateBook,
  useUploadDigitalResource,
  useApproveDigitalResource,
  useCatalogReportStats,
  useConditionReport,
  useFines,
  useClearFine,
  useAssessFine,
  useWaiveFineDirect,
  useOverdueByClass,
}                            from '@/hooks/useLibrary'
import { apiFetch }          from '@/lib/api-client'
import { usePermissions }    from '@/hooks/usePermissions'
import { DigitalResourceViewer } from '@/components/library/DigitalResourceViewer'
import {
  BookOpen, Scan, FileText, AlertTriangle, Eye, Check, X as XIcon, Undo2, Pencil, Archive,
  ArrowUpDown, Users2, Upload, Loader2, Repeat, Shield, Plus, Sparkles, LayoutGrid,
  List, Download, Printer, Search, ArrowUpRight, ShieldCheck, ClipboardList, BookMarked,
}                            from 'lucide-react'
import { ModuleTabs }        from '@/components/shared/ModuleTabs'
import { MALAWI_SUBJECTS, formatMWK } from '@shared/constants/malawi'
import type {
  ApiBook,
  ApiBorrowing,
  ApiDigitalResource,
  ApiLibraryStats,
  ApiLibraryConditionEntry,
}                            from '@shared/types/api'

/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Initialises the active tab from ?tab= (post-hydration) so
 *   LibraryDashboard's corrected quick actions can deep-link.
 */
type Tab = 'catalog' | 'borrowings' | 'digital' | 'recommendations' | 'reports'

const TABS = [
  { id: 'catalog'         as Tab, label: 'Book Catalog',      icon: BookOpen  },
  // [R21] Borrowings' tab icon was Scan — the same icon the catalog tab's
  // literal barcode-scan button uses, a direct visual conflict called out
  // when adopting the screenshot UI. Swapped for Repeat (a circulation/
  // cycle glyph — matches the screenshot's Borrowings icon), same icon
  // now shared with the "On Loan" stat tile and the "Active Borrowings"
  // sub-tab below. Every other tab icon is unchanged per instruction.
  { id: 'borrowings'      as Tab, label: 'Borrowings',        icon: Repeat    },
  { id: 'digital'         as Tab, label: 'Digital Library',   icon: FileText  },
  { id: 'recommendations' as Tab, label: 'Recommendations',   icon: Check     },
  // [PRODUCTION FIX 2026-07-28] Genuinely distinct librarian surface —
  // most-borrowed/most-read/category stats and fines management, gated
  // separately below (librarian/admin/high_rank only), not shown as just
  // another generic tab to every role.
  { id: 'reports'         as Tab, label: 'Reports & Fines',   icon: Users2    },
]

// [R21] Displayed status derived client-side from a live (unreturned)
// borrowing's real status + due date — "DUE SOON" isn't a stored
// BorrowStatus value, it's an ACTIVE loan within 3 days of its due date.
function borrowingDisplayStatus(b: ApiBorrowing): 'OVERDUE' | 'DUE_SOON' | 'ACTIVE' {
  if (b.status === 'OVERDUE') return 'OVERDUE'
  const daysLeft = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (b.status === 'ACTIVE' && daysLeft <= 3) return 'DUE_SOON'
  return 'ACTIVE'
}

function borrowingCountdownLabel(b: ApiBorrowing): string {
  const days = Math.round((new Date(b.dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
  if (days === 0) return 'Due today'
  return `Due in ${days} day${days === 1 ? '' : 's'}`
}

function borrowerLabel(b: ApiBorrowing): { name: string; sublabel: string } {
  if (b.student) return { name: `${b.student.firstName} ${b.student.lastName}`, sublabel: `${b.student.registrationNo}${b.student.class ? ` · ${b.student.class.name}` : ''}` }
  if (b.staff)   return { name: `${b.staff.firstName} ${b.staff.lastName}`,     sublabel: `${b.staff.employeeNo}${b.staff.department ? ` · ${b.staff.department}` : ''}` }
  return { name: 'Unknown borrower', sublabel: '—' }
}

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
          same convention as (public)/login/page.tsx and (auth)/exams/page.tsx.
          [PRODUCTION FIX 2026-07-28] fallback was `null` — same bug found
          and fixed in finances/page.tsx (a blank screen with no loading
          indicator during any suspension). */}
      <Suspense fallback={<div className="space-y-4"><div className="h-8 w-48 rounded-lg bg-surface animate-pulse" /><div className="h-64 rounded-xl bg-surface animate-pulse" /></div>}>
        <LibraryContent />
      </Suspense>
    </RoleGuard>
  )
}

// [PRODUCTION FIX 2026-07-28] Declared at module scope, not inside
// LibraryContent's render body — a component defined during render creates
// a fresh definition (and resets any internal state) on every render; same
// class of bug found and fixed for SortHeader in user-management/page.tsx
// earlier this session.
function BookRow({
  book: b, isLibStaff, onIssue, onEdit, onView,
}: {
  book: ApiBook
  isLibStaff: boolean
  onIssue: (bookId: string) => void
  onEdit: (book: ApiBook) => void
  /** [R21] Eye-icon "view" action — opens BookDetailModal. */
  onView: (bookId: string) => void
}) {
  return (
    <tr className="hover:bg-page">
      <td className="px-4 py-3 font-medium">
        {b.title}
        {/* [R21] Barcode + shelf sub-line, matching the screenshot's
            "MAT-2017-001 · Shelf M-02" under the title. */}
        {(b.barcode || b.shelf) && (
          <p className="text-xs font-mono text-muted mt-0.5">
            {b.barcode ?? '—'}{b.shelf ? ` · Shelf ${b.shelf}` : ''}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-muted">{b.author}</td>
      <td className="px-4 py-3">
        <span className="text-xs bg-base rounded px-2 py-0.5">{b.category}</span>
      </td>
      <td className="px-4 py-3 text-muted text-xs">{b.publisher ?? '—'}</td>
      <td className="px-4 py-3 text-muted text-xs">{b.publishedYear ?? '—'}</td>
      <td className="px-4 py-3 text-center">{b.totalCopies}</td>
      <td className="px-4 py-3 text-center">
        <span className={`font-semibold ${b.availableCopies === 0 ? 'text-brand-coral' : 'text-brand-teal'}`}>
          {b.availableCopies}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <PermissionGuard permission="library.issueBook">
            <button
              type="button"
              disabled={b.availableCopies === 0}
              onClick={() => onIssue(b.id)}
              className="text-xs font-semibold text-brand-teal underline disabled:opacity-40 min-h-11"
            >
              Issue
            </button>
          </PermissionGuard>
          <button type="button" onClick={() => onView(b.id)} aria-label={`View ${b.title}`} className="text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center">
            <Eye className="w-3.5 h-3.5" />
          </button>
          {isLibStaff && (
            <button type="button" onClick={() => onEdit(b)} aria-label={`Edit ${b.title}`} className="text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// [PRODUCTION FIX 2026-07-28] Catalog management had create + list only —
// no way to edit or archive an existing entry anywhere. One modal handles
// both create (book=null) and edit (book set), since the form fields are
// identical either way; Archive lives here as a confirm-gated "danger
// zone" action rather than a bare row button that could be clicked by
// accident.
function BookFormModal({
  book, onClose,
}: {
  book: ApiBook | null
  onClose: () => void
}) {
  const createBook  = useCreateBook()
  const updateBook  = useUpdateBook()
  const archiveBook = useArchiveBook()
  const [confirmArchive, setConfirmArchive] = useState(false)

  const [title, setTitle]     = useState(book?.title ?? '')
  const [author, setAuthor]   = useState(book?.author ?? '')
  const [isbn, setIsbn]       = useState(book?.isbn ?? '')
  const [category, setCategory] = useState(book?.category ?? 'TEXTBOOK')
  const [publisher, setPublisher] = useState(book?.publisher ?? '')
  const [publishedYear, setPublishedYear] = useState(book?.publishedYear?.toString() ?? '')
  const [totalCopies, setTotalCopies] = useState(book?.totalCopies?.toString() ?? '1')
  const [barcode, setBarcode] = useState(book?.barcode ?? '')
  const [shelf, setShelf] = useState(book?.shelf ?? '')

  const pending = createBook.isPending || updateBook.isPending || archiveBook.isPending
  const error = createBook.error ?? updateBook.error ?? archiveBook.error

  function handleSave() {
    if (!title.trim() || !author.trim()) return
    const data = {
      title: title.trim(),
      author: author.trim(),
      isbn: isbn.trim() || undefined,
      category: category as never,
      publisher: publisher.trim() || undefined,
      publishedYear: publishedYear ? Number(publishedYear) : undefined,
      totalCopies: Number(totalCopies) || 1,
      barcode: barcode.trim() || undefined,
      shelf: shelf.trim() || undefined,
    }
    if (book) {
      updateBook.mutate({ id: book.id, data }, { onSuccess: onClose })
    } else {
      createBook.mutate(data, { onSuccess: onClose })
    }
  }

  function handleArchive() {
    if (!book) return
    archiveBook.mutate(book.id, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">{book ? 'Edit Book' : 'Add Book'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="book-title" className="text-xs text-muted mb-1 block">Title</label>
              <input id="book-title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
            <div>
              <label htmlFor="book-author" className="text-xs text-muted mb-1 block">Author</label>
              <input id="book-author" value={author} onChange={(e) => setAuthor(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
            <div>
              <label htmlFor="book-isbn" className="text-xs text-muted mb-1 block">ISBN <span className="text-muted/70">(unique — best identifier for issue/return)</span></label>
              <input id="book-isbn" value={isbn} onChange={(e) => setIsbn(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
            <div>
              <label htmlFor="book-category" className="text-xs text-muted mb-1 block">Category</label>
              <select id="book-category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11">
                {['TEXTBOOK', 'REFERENCE', 'FICTION', 'NONFICTION', 'SCIENCE', 'MATHEMATICS', 'HUMANITIES', 'PAST_PAPER', 'OTHER'].map((c) => (
                  <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase().replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="book-publisher" className="text-xs text-muted mb-1 block">Publisher</label>
              <input id="book-publisher" value={publisher} onChange={(e) => setPublisher(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
            <div>
              <label htmlFor="book-year" className="text-xs text-muted mb-1 block">Published Year</label>
              <input id="book-year" type="number" value={publishedYear} onChange={(e) => setPublishedYear(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
            <div>
              <label htmlFor="book-copies" className="text-xs text-muted mb-1 block">Total Copies</label>
              <input id="book-copies" type="number" min="1" value={totalCopies} onChange={(e) => setTotalCopies(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
            <div>
              <label htmlFor="book-barcode" className="text-xs text-muted mb-1 block">Barcode <span className="text-muted/70">(optional)</span></label>
              <input id="book-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
            <div>
              <label htmlFor="book-shelf" className="text-xs text-muted mb-1 block">Shelf <span className="text-muted/70">(e.g. M-02)</span></label>
              <input id="book-shelf" value={shelf} onChange={(e) => setShelf(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !title.trim() || !author.trim()}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {pending ? 'Saving…' : book ? 'Save Changes' : 'Add to Catalog'}
          </button>
          {error && <p className="text-sm text-brand-coral">{error instanceof Error ? error.message : 'Something went wrong.'}</p>}

          {book && (
            <div className="pt-4 mt-2 border-t border-base">
              {confirmArchive ? (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted flex-1">Archive this book? It will be removed from the searchable catalog (copies set to 0).</p>
                  <button type="button" onClick={handleArchive} disabled={pending} className="text-xs font-semibold text-brand-coral hover:underline shrink-0">Confirm</button>
                  <button type="button" onClick={() => setConfirmArchive(false)} className="text-xs text-muted hover:underline shrink-0">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmArchive(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-coral hover:underline">
                  <Archive className="w-3.5 h-3.5" /> Archive this book
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function UploadDigitalResourceModal({ onClose }: { onClose: () => void }) {
  const upload = useUploadDigitalResource()

  const [title, setTitle]     = useState('')
  const [type, setType]       = useState('EBOOK')
  const [subject, setSubject] = useState('')
  const [form, setForm]       = useState('')
  const [file, setFile]       = useState<File | null>(null)

  function handleSubmit() {
    if (!title.trim() || !file) return
    upload.mutate(
      {
        title: title.trim(),
        type: type as 'EBOOK' | 'PAST_PAPER' | 'REFERENCE' | 'STUDY_GUIDE',
        subject: subject || undefined,
        form: form ? Number(form) : undefined,
        file,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Add Digital Resource</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <label htmlFor="dr-title" className="text-xs text-muted mb-1 block">Title</label>
            <input id="dr-title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="dr-type" className="text-xs text-muted mb-1 block">Type</label>
              <select id="dr-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11">
                <option value="EBOOK">eBook</option>
                <option value="PAST_PAPER">Past Paper</option>
                <option value="REFERENCE">Reference</option>
                <option value="STUDY_GUIDE">Study Guide</option>
              </select>
            </div>
            <div>
              <label htmlFor="dr-form" className="text-xs text-muted mb-1 block">Form <span className="text-muted/70">(optional)</span></label>
              <select id="dr-form" value={form} onChange={(e) => setForm(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11">
                <option value="">All forms</option>
                {[1, 2, 3, 4].map((f) => <option key={f} value={f}>Form {f}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="dr-subject" className="text-xs text-muted mb-1 block">Subject <span className="text-muted/70">(optional)</span></label>
              <select id="dr-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11">
                <option value="">All subjects</option>
                {MALAWI_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="dr-file" className="text-xs text-muted mb-1 block">File</label>
            <input
              id="dr-file"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand-teal/10 file:text-brand-teal file:text-xs file:font-semibold"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={upload.isPending || !title.trim() || !file}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
          {upload.error && (
            <p className="text-sm text-brand-coral">
              {upload.error instanceof Error ? upload.error.message : 'Something went wrong.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

interface BorrowerHit {
  id: string
  fullName: string
  sublabel: string
}

// Reuses the same /api/search/fallback endpoint GlobalSearch.tsx already
// calls — only students/staff are relevant here, so book hits are dropped.
async function searchBorrowers(query: string, type: 'student' | 'staff'): Promise<BorrowerHit[]> {
  try {
    const token = await getAuth().currentUser?.getIdToken()
    const res = await fetch(`/api/search/fallback?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
    if (!res.ok) return []
    const data = await res.json() as {
      students: { id: string; fullName: string; registrationNo: string; className: string | null }[]
      staff:    { id: string; fullName: string; role: string; department: string }[]
    }
    return type === 'student'
      ? data.students.map((s) => ({ id: s.id, fullName: s.fullName, sublabel: `${s.registrationNo}${s.className ? ` · ${s.className}` : ''}` }))
      : data.staff.map((s) => ({ id: s.id, fullName: s.fullName, sublabel: s.department }))
  } catch {
    return []
  }
}

function BorrowerPicker({
  type, value, onChange,
}: {
  type: 'student' | 'staff'
  value: BorrowerHit | null
  onChange: (hit: BorrowerHit | null) => void
}) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<BorrowerHit[]>([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((v: string) => {
    setQuery(v)
    onChange(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setResults(await searchBorrowers(v, type))
      setOpen(true)
      setLoading(false)
    }, 300)
  }, [type, onChange])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  return (
    <div className="relative">
      {/* [FIX] Previously collapsed to just `value.fullName` once picked —
          with same-name students/staff this made it impossible to tell
          which record was actually selected. Now shows the same
          distinguishing sublabel (registration no. / class, or
          department) the dropdown row showed, with a clear way to change
          the pick. */}
      {value ? (
        <div className="w-full border border-brand-teal/40 bg-brand-teal/5 rounded-lg px-3 py-2 flex items-center justify-between gap-2 min-h-11">
          <div>
            <p className="text-sm font-medium text-body">{value.fullName}</p>
            <p className="text-xs text-muted">{value.sublabel}</p>
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setQuery('') }}
            aria-label="Change selection"
            className="text-muted hover:text-body shrink-0"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={type === 'student' ? 'Search by name or registration number…' : 'Search by name…'}
          className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
          autoComplete="off"
        />
      )}
      {loading && <Loader2 className="w-4 h-4 animate-spin text-muted absolute right-3 top-1/2 -translate-y-1/2" />}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-base rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => { onChange(hit); setQuery(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-page text-sm"
            >
              <p className="font-medium text-body">{hit.fullName}</p>
              <p className="text-xs text-muted">{hit.sublabel}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// [R21] Standalone "+ Issue Book" entry point (Catalog toolbar and the
// Borrowings tab's sub-tab bar, per the screenshots) needs to pick a book
// FIRST — the per-row "Issue" link already has one via bookId. Debounces
// against the same GET /library the catalog tab itself uses.
function BookPicker({ value, onChange }: { value: ApiBook | null; onChange: (book: ApiBook | null) => void }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<ApiBook[]>([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((v: string) => {
    setQuery(v)
    onChange(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const hits = await apiFetch<ApiBook[]>(`/library?search=${encodeURIComponent(v)}&available=true`)
        setResults(hits)
        setOpen(true)
      } catch { setResults([]) }
      setLoading(false)
    }, 300)
  }, [onChange])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  return (
    <div className="relative">
      <input
        value={value ? value.title : query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search title, author, or barcode…"
        className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
        autoComplete="off"
      />
      {loading && <Loader2 className="w-4 h-4 animate-spin text-muted absolute right-3 top-1/2 -translate-y-1/2" />}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-base rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => { onChange(b); setQuery(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-page text-sm"
            >
              <p className="font-medium text-body">{b.title}</p>
              <p className="text-xs text-muted">{b.author} · {b.availableCopies} available</p>
            </button>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-base rounded-lg shadow-lg px-3 py-2 text-xs text-muted">
          No available copies match &ldquo;{query}&rdquo;.
        </div>
      )}
    </div>
  )
}

function IssueBookModal({
  bookId, onClose, onIssued,
}: {
  /** [R21] null when opened from the standalone "+ Issue Book" button —
   *  the modal then shows a book search step first instead of assuming
   *  one is already chosen. */
  bookId: string | null
  onClose: () => void
  /** Called once, only on a successful issue (not on cancel) — lets a
   *  caller react to the specific outcome, e.g. clearing a scan result. */
  onIssued?: () => void
}) {
  const issueBorrowing = useIssueBorrowing()
  const [pickedBook, setPickedBook] = useState<ApiBook | null>(null)
  const [borrowerType, setBorrowerType] = useState<'student' | 'staff'>('student')
  const [borrower, setBorrower] = useState<BorrowerHit | null>(null)
  const [dueDate, setDueDate] = useState('')

  const effectiveBookId = bookId ?? pickedBook?.id ?? null

  function handleSubmit() {
    if (!effectiveBookId || !borrower || !dueDate) return
    issueBorrowing.mutate({
      bookId: effectiveBookId,
      borrowerType: borrowerType === 'student' ? 'STUDENT' : 'STAFF',
      studentId: borrowerType === 'student' ? borrower.id : undefined,
      staffId: borrowerType === 'staff' ? borrower.id : undefined,
      dueDate,
    }, {
      onSuccess: () => {
        onIssued?.()
        onClose()
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Issue Book</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {!bookId && (
            <div>
              <label className="text-xs text-muted mb-1 block">Book</label>
              <BookPicker value={pickedBook} onChange={setPickedBook} />
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setBorrowerType('student'); setBorrower(null) }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${borrowerType === 'student' ? 'bg-brand-navy text-white border-brand-navy' : 'border-base text-body'}`}
            >
              Student
            </button>
            <button
              type="button"
              onClick={() => { setBorrowerType('staff'); setBorrower(null) }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${borrowerType === 'staff' ? 'bg-brand-navy text-white border-brand-navy' : 'border-base text-body'}`}
            >
              Staff
            </button>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">
              {borrowerType === 'student' ? 'Student' : 'Staff member'}
            </label>
            <BorrowerPicker type={borrowerType} value={borrower} onChange={setBorrower} />
          </div>

          <div>
            <label htmlFor="issue-due-date" className="text-xs text-muted mb-1 block">Due date</label>
            <input
              id="issue-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={issueBorrowing.isPending || !effectiveBookId || !borrower || !dueDate}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {issueBorrowing.isPending ? 'Issuing…' : 'Issue Book'}
          </button>
          {issueBorrowing.error && (
            <p className="text-sm text-brand-coral">
              {issueBorrowing.error instanceof Error ? issueBorrowing.error.message : 'Something went wrong.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// [R21] "marking a physical book condition is not wired any where" —
// ReturnBorrowingSchema already accepted condition/notes; the return
// button just always sent condition:'GOOD'. This modal is the actual
// condition picker, and — since returnBook() only ever fines overdue
// days, never damage/loss — chains a second, separate mutation (the same
// "+ Assess Fine" endpoint) when the librarian records a damage/loss fee,
// so a damaged/lost return finally has a real financial consequence.
function ReturnBookModal({
  borrowing, onClose,
}: {
  borrowing: ApiBorrowing
  onClose: () => void
}) {
  const returnBook  = useReturnBook()
  const assessFine  = useAssessFine()
  const [condition, setCondition] = useState<'GOOD' | 'DAMAGED' | 'LOST'>('GOOD')
  const [notes, setNotes]         = useState('')
  const [feeAmount, setFeeAmount] = useState('')

  const { name: borrowerName } = borrowerLabel(borrowing)
  const bookTitle = borrowing.book?.title ?? 'this book'
  const needsFee = condition !== 'GOOD'

  function handleSubmit() {
    returnBook.mutate({
      borrowingId: borrowing.id,
      data: { condition, notes: notes.trim() || undefined },
    }, {
      onSuccess: () => {
        const fee = Number(feeAmount)
        if (needsFee && fee > 0) {
          assessFine.mutate({
            studentId: borrowing.studentId,
            staffId: borrowing.staffId,
            bookTitle,
            amount: fee,
            reason: notes.trim() || `Book returned ${condition.toLowerCase()}.`,
          }, { onSuccess: onClose, onError: onClose })
        } else {
          onClose()
        }
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Return Book</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-body"><strong>{bookTitle}</strong> — {borrowerName}</p>

          <div>
            <label className="text-xs text-muted mb-1.5 block">Condition on return</label>
            <div className="grid grid-cols-3 gap-2">
              {(['GOOD', 'DAMAGED', 'LOST'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCondition(c)}
                  className={`py-2 rounded-lg text-sm font-semibold border ${
                    condition === c
                      ? c === 'GOOD' ? 'bg-brand-teal text-white border-brand-teal' : 'bg-brand-coral text-white border-brand-coral'
                      : 'border-base text-body'
                  }`}
                >
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {needsFee && (
            <>
              <div>
                <label htmlFor="return-notes" className="text-xs text-muted mb-1 block">
                  Describe the {condition === 'LOST' ? 'loss' : 'damage'}
                </label>
                <textarea
                  id="return-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={condition === 'LOST' ? 'e.g. Never returned; reported lost by borrower.' : 'e.g. Torn binding and water spill on chapters 3-4.'}
                  className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page"
                />
              </div>
              <div>
                <label htmlFor="return-fee" className="text-xs text-muted mb-1 block">Fine amount (MK) <span className="text-muted/70">(optional — leave blank to skip)</span></label>
                <input
                  id="return-fee"
                  type="number"
                  min="0"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={returnBook.isPending || assessFine.isPending}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {returnBook.isPending || assessFine.isPending ? 'Processing…' : 'Confirm Return'}
          </button>
          {returnBook.error && (
            <p className="text-sm text-brand-coral">
              {returnBook.error instanceof Error ? returnBook.error.message : 'Something went wrong.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// [R21] Eye-icon "view" action in the redesigned Catalog table — Book had
// no detail view anywhere; useBook(id) already returns active borrowings
// for the title (see GET /library/:id), just never had a caller.
function BookDetailModal({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const { data: book, isLoading } = useBook(bookId)
  const b = book as ApiBook | undefined
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Book Details</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {isLoading || !b ? (
            <div className="text-center py-10 text-muted text-sm animate-pulse">Loading…</div>
          ) : (
            <>
              <div>
                <p className="font-heading font-bold text-lg text-brand-navy">{b.title}</p>
                <p className="text-sm text-muted">{b.author}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted">Category</p><p className="font-medium">{b.category}</p></div>
                <div><p className="text-xs text-muted">Publisher</p><p className="font-medium">{b.publisher ?? '—'}</p></div>
                <div><p className="text-xs text-muted">Year</p><p className="font-medium">{b.publishedYear ?? '—'}</p></div>
                <div><p className="text-xs text-muted">ISBN</p><p className="font-medium">{b.isbn ?? '—'}</p></div>
                <div><p className="text-xs text-muted">Barcode</p><p className="font-medium">{b.barcode ?? '—'}</p></div>
                <div><p className="text-xs text-muted">Shelf</p><p className="font-medium">{b.shelf ?? '—'}</p></div>
                <div><p className="text-xs text-muted">Copies</p><p className="font-medium">{b.totalCopies}</p></div>
                <div><p className="text-xs text-muted">Available</p><p className={`font-semibold ${b.availableCopies === 0 ? 'text-brand-coral' : 'text-brand-teal'}`}>{b.availableCopies}</p></div>
              </div>
              <div>
                <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-2">Currently on loan</p>
                {!b.borrowings || b.borrowings.length === 0 ? (
                  <p className="text-sm text-muted">No copies currently checked out.</p>
                ) : (
                  <ul className="divide-y divide-base border border-base rounded-lg">
                    {b.borrowings.map((loan) => {
                      const { name } = borrowerLabel(loan)
                      return (
                        <li key={loan.id} className="px-3 py-2 text-sm flex items-center justify-between">
                          <span>{name}</span>
                          <span className="text-xs text-muted">Due {new Date(loan.dueDate).toLocaleDateString()}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* [R21.2] "no where to change [a book's] status" outside of
                  the return flow — marks a shelf copy damaged/lost right
                  from here, independent of any loan. Copies out on loan
                  are still marked via the Return flow (they have a real
                  borrower to attribute the condition to). */}
              <PermissionGuard any={['library.markDamaged', 'library.markLost']}>
                <MarkConditionSection book={b} onClose={onClose} />
              </PermissionGuard>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// [R21.2] The actual "change a book's status to lost/damaged" mechanism
// — lives inside BookDetailModal, gated to whichever of
// library.markDamaged / library.markLost the user actually holds (a role
// could plausibly have one but not the other). Only copies currently on
// the shelf (availableCopies) can be marked this way; a copy out with a
// borrower is marked via the Return flow instead, which already covers
// that case and correctly attributes it to a loan.
function MarkConditionSection({ book, onClose }: { book: ApiBook; onClose: () => void }) {
  const { can } = usePermissions()
  const markCondition = useMarkBookCondition()
  const [picking, setPicking] = useState<'DAMAGED' | 'LOST' | null>(null)
  const [copies, setCopies] = useState('1')
  const [notes, setNotes] = useState('')

  const canDamaged = can('library.markDamaged')
  const canLost = can('library.markLost')
  if (!canDamaged && !canLost) return null

  if (book.availableCopies === 0) {
    return (
      <div>
        <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-2">Book Condition</p>
        <p className="text-sm text-muted">
          No copies of this title are currently on the shelf to mark. A copy that&apos;s out on loan is marked
          damaged or lost when it&apos;s returned, from the Borrowings tab.
        </p>
      </div>
    )
  }

  function handleConfirm() {
    if (!picking) return
    const n = Math.min(Math.max(1, Number(copies) || 1), book.availableCopies)
    markCondition.mutate({ bookId: book.id, data: { condition: picking, copies: n, notes: notes.trim() || undefined } }, {
      onSuccess: onClose,
    })
  }

  return (
    <div>
      <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-2">Book Condition</p>
      {!picking ? (
        <div className="flex gap-2">
          {canDamaged && (
            <button type="button" onClick={() => setPicking('DAMAGED')}
              className="flex-1 py-2 rounded-lg text-sm font-semibold border border-brand-amber/40 text-brand-amber hover:bg-brand-amber/5">
              Mark a copy Damaged
            </button>
          )}
          {canLost && (
            <button type="button" onClick={() => setPicking('LOST')}
              className="flex-1 py-2 rounded-lg text-sm font-semibold border border-brand-coral/40 text-brand-coral hover:bg-brand-coral/5">
              Mark a copy Lost
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 border border-base rounded-lg p-3">
          <p className="text-sm font-medium text-body">
            Mark {picking === 'LOST' ? 'lost' : 'damaged'} — {book.title}
          </p>
          <div className="flex items-center gap-3">
            <label htmlFor="condition-copies" className="text-xs text-muted shrink-0">Copies</label>
            <input
              id="condition-copies"
              type="number"
              min={1}
              max={book.availableCopies}
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
              className="w-20 border border-base rounded-lg px-2 py-1.5 text-sm bg-page"
            />
            <span className="text-xs text-muted">of {book.availableCopies} on the shelf</span>
          </div>
          <div>
            <label htmlFor="condition-notes" className="text-xs text-muted mb-1 block">Notes <span className="text-muted/70">(optional)</span></label>
            <textarea
              id="condition-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={picking === 'LOST' ? 'e.g. Not found during annual stock take.' : 'e.g. Water damage discovered on the shelf.'}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page"
            />
          </div>
          {picking === 'LOST' && (
            <p className="text-xs text-muted">
              Marking a copy lost removes it from this title&apos;s total copy count. Marking it damaged only takes
              it off the shelf — it stays in the total count as repairable.
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setPicking(null); setNotes(''); setCopies('1') }}
              className="flex-1 py-2 rounded-lg text-sm font-semibold border border-base text-body">
              Cancel
            </button>
            <button type="button" onClick={handleConfirm} disabled={markCondition.isPending}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 ${picking === 'LOST' ? 'bg-brand-coral' : 'bg-brand-amber'}`}>
              {markCondition.isPending ? 'Saving…' : `Confirm ${picking === 'LOST' ? 'Lost' : 'Damaged'}`}
            </button>
          </div>
          {markCondition.error && (
            <p className="text-xs text-brand-coral">
              {markCondition.error instanceof Error ? markCondition.error.message : 'Something went wrong.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// [R21] "+ Assess Fine" in the Fines & Penalties Ledger — a manual fine
// (damage discovered after return, a lost-book charge, or any other
// penalty not tied to today's return flow) previously had a screenshot
// button and no UI at all. Posts straight to the same finance endpoint
// Return uses for damage/loss fees.
function AssessFineModal({ onClose }: { onClose: () => void }) {
  const assessFine = useAssessFine()
  const [borrowerType, setBorrowerType] = useState<'student' | 'staff'>('student')
  const [borrower, setBorrower] = useState<BorrowerHit | null>(null)
  const [bookTitle, setBookTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  function handleSubmit() {
    const amt = Number(amount)
    if (!borrower || !bookTitle.trim() || !reason.trim() || !(amt > 0)) return
    assessFine.mutate({
      studentId: borrowerType === 'student' ? borrower.id : undefined,
      staffId: borrowerType === 'staff' ? borrower.id : undefined,
      bookTitle: bookTitle.trim(),
      amount: amt,
      reason: reason.trim(),
    }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Assess Fine</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => { setBorrowerType('student'); setBorrower(null) }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${borrowerType === 'student' ? 'bg-brand-navy text-white border-brand-navy' : 'border-base text-body'}`}>
              Student
            </button>
            <button type="button" onClick={() => { setBorrowerType('staff'); setBorrower(null) }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${borrowerType === 'staff' ? 'bg-brand-navy text-white border-brand-navy' : 'border-base text-body'}`}>
              Staff
            </button>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">{borrowerType === 'student' ? 'Student' : 'Staff member'}</label>
            <BorrowerPicker type={borrowerType} value={borrower} onChange={setBorrower} />
          </div>
          <div>
            <label htmlFor="fine-book-title" className="text-xs text-muted mb-1 block">Book title</label>
            <input id="fine-book-title" value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
          </div>
          <div>
            <label htmlFor="fine-amount" className="text-xs text-muted mb-1 block">Amount (MK)</label>
            <input id="fine-amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
          </div>
          <div>
            <label htmlFor="fine-reason" className="text-xs text-muted mb-1 block">Reason</label>
            <textarea id="fine-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
              placeholder="e.g. Book returned damaged. Torn binding and water spill on chapters 3-4."
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page" />
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={assessFine.isPending || !borrower || !bookTitle.trim() || !reason.trim() || !(Number(amount) > 0)}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {assessFine.isPending ? 'Assessing…' : 'Assess Fine'}
          </button>
          {assessFine.error && (
            <p className="text-sm text-brand-coral">
              {assessFine.error instanceof Error ? assessFine.error.message : 'Something went wrong.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// [R21] "Student Library Clearance Audit — Open Clearance Checker" —
// built entirely from data already loaded elsewhere on this page
// (useBorrowings by studentId + the all-statuses fines list), so no new
// backend route was needed: an active/overdue loan or a pending fine
// both block clearance.
function ClearanceCheckerModal({ allFines, onClose }: {
  allFines: Array<{ id: string; studentId?: string | null; bookTitle: string; amount: number; status: string }>
  onClose: () => void
}) {
  const [borrower, setBorrower] = useState<BorrowerHit | null>(null)
  const { data: loans = [] } = useBorrowings({ studentId: borrower?.id, unreturned: true })
  const pendingFines = borrower ? allFines.filter((f) => f.studentId === borrower.id && f.status === 'PENDING') : []
  const outstandingLoans = loans as ApiBorrowing[]
  const isClear = !!borrower && outstandingLoans.length === 0 && pendingFines.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg min-h-[440px] max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Student Library Clearance Audit</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Student</label>
            <BorrowerPicker type="student" value={borrower} onChange={setBorrower} />
          </div>

          {borrower && (
            <div className={`rounded-xl p-4 border ${isClear ? 'bg-brand-teal/8 border-brand-teal/25' : 'bg-brand-coral/8 border-brand-coral/25'}`}>
              <p className={`font-heading font-semibold text-sm ${isClear ? 'text-brand-teal' : 'text-brand-coral'}`}>
                {isClear ? 'Cleared — no outstanding books or fines' : 'Not cleared'}
              </p>
              {!isClear && (
                <div className="mt-3 space-y-2">
                  {outstandingLoans.map((loan) => (
                    <p key={loan.id} className="text-sm text-body">
                      📕 {loan.book?.title ?? 'Untitled'} — {borrowingDisplayStatus(loan) === 'OVERDUE' ? borrowingCountdownLabel(loan) : `due ${new Date(loan.dueDate).toLocaleDateString()}`}
                    </p>
                  ))}
                  {pendingFines.map((f) => (
                    <p key={f.id} className="text-sm text-body">
                      💰 {f.bookTitle} — {formatMWK(f.amount)} pending
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
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
  // [PRODUCTION FIX 2026-07-27] category/available (catalog) and
  // type/form/subject (digital resources) all already worked server-side —
  // useBooks()/useDigitalResources() just never had callers passing them.
  const [categoryFilter, setCategoryFilter]   = useState('')
  const [availableOnly, setAvailableOnly]     = useState(false)
  // [PRODUCTION FIX 2026-07-28] Sort/publisher/year filters and group-by
  // all already worked server-side (or work purely client-side for
  // grouping) — the catalog tab only ever offered category + search +
  // available-only.
  const [publisherFilter, setPublisherFilter] = useState('')
  const [yearFilter, setYearFilter]           = useState('')
  const [sortBy, setSortBy]                   = useState<'title' | 'author' | 'publishedYear' | 'availableCopies'>('title')
  const [sortDir, setSortDir]                 = useState<'asc' | 'desc'>('asc')
  const [groupBy, setGroupBy]                 = useState<'' | 'category' | 'publisher'>('')
  const [editingBook, setEditingBook]         = useState<ApiBook | null>(null)
  const [showAddBook, setShowAddBook]         = useState(false)
  const [digitalTypeFilter, setDigitalTypeFilter] = useState('')
  const [digitalFormFilter, setDigitalFormFilter] = useState('')
  const [digitalSubjectFilter, setDigitalSubjectFilter] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanResult, setScanResult] = useState<ApiBook | null>(null)
  const [scanError, setScanError]   = useState<string | null>(null)
  const [viewingResource, setViewingResource] = useState<{ id: string; title: string } | null>(null)
  const [showUploadResource, setShowUploadResource] = useState(false)
  const [issuingBookId, setIssuingBookId] = useState<string | null>(null)
  // [R21] Standalone "+ Issue Book" button (no book preselected) — kept
  // separate from issuingBookId so per-row/scan-triggered issues (which
  // always have a real bookId) don't have to special-case a sentinel value.
  const [showStandaloneIssue, setShowStandaloneIssue] = useState(false)
  // [R21] Catalog Table/Grid toggle from the screenshot.
  const [catalogView, setCatalogView] = useState<'table' | 'grid'>('table')
  const [viewingBookId, setViewingBookId] = useState<string | null>(null)
  const [returningBorrowing, setReturningBorrowing] = useState<ApiBorrowing | null>(null)

  const [recTitle, setRecTitle]   = useState('')
  const [recAuthor, setRecAuthor] = useState('')
  const [recReason, setRecReason] = useState('')
  const [recRequesterName, setRecRequesterName] = useState('')
  const [recRequesterRole, setRecRequesterRole] = useState<'Student' | 'Staff' | 'Parent' | 'Other'>('Student')
  const [recRequesterClass, setRecRequesterClass] = useState('')
  const [waiverFineId, setWaiverFineId] = useState('')
  const [waiverReason, setWaiverReason] = useState('')
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null)

  // [R21] Borrowings tab sub-navigation — "Active Borrowings" / "Fine
  // Waiver Portal" match the screenshot; "Quick Check-in Desk" is
  // intentionally skipped per instruction.
  const [borrowingsSubTab, setBorrowingsSubTab] = useState<'active' | 'waivers'>('active')
  const [borrowingsSearch, setBorrowingsSearch] = useState('')
  const [borrowingsFilter, setBorrowingsFilter] = useState<'all' | 'active' | 'dueSoon' | 'overdue'>('all')

  // [R21] Reports & Fines sub-navigation — Fines & Penalties Ledger /
  // Circulation & Popularity Insights / Catalog Distribution / Clearance
  // & Audit Reports, matching the screenshot's black pill bar.
  const [reportsSubTab, setReportsSubTab] = useState<'fines' | 'circulation' | 'catalogDist' | 'clearance'>('fines')
  const [assessingFine, setAssessingFine] = useState(false)
  const [showClearanceChecker, setShowClearanceChecker] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const isLibStaff = ['admin', 'library'].includes(role ?? '')

  const { data: stats }             = useLibraryStats()
  const { data: books = [],  isLoading } = useBooks({
    search,
    category:  categoryFilter || undefined,
    available: availableOnly || undefined,
    publisher: publisherFilter || undefined,
    year:      yearFilter ? Number(yearFilter) : undefined,
    sortBy,
    sortDir,
  })
  const { data: catalogReport } = useCatalogReportStats()
  const { data: conditionReport = [] } = useConditionReport()
  // [R21] Fetches ALL fines once (unfiltered) so the ledger's three
  // summary cards (Total Outstanding / Collected Treasury / Total
  // Penalties Assessed), the Clearance Checker, and the Treasury CSV
  // export can all derive their numbers client-side from one dataset —
  // the visible list is then filtered from the same data, not a second
  // network round trip per status.
  const { data: allFines = [] } = useFines()
  const [fineStatusFilter, setFineStatusFilter] = useState<'' | 'PENDING' | 'PAID' | 'WAIVED'>('PENDING')
  const fines = fineStatusFilter ? allFines.filter((f) => f.status === fineStatusFilter) : allFines
  const clearFine = useClearFine()
  const waiveFine  = useWaiveFineDirect()
  const { data: overdueByClass = [] } = useOverdueByClass()

  // Client-side grouping — the backend already returns the right sort
  // order; grouping is purely a display concern on top of it.
  const groupedBooks = groupBy
    ? (() => {
        const map = new Map<string, ApiBook[]>()
        for (const b of books as ApiBook[]) {
          const key = groupBy === 'category' ? b.category : (b.publisher || 'Unknown Publisher')
          if (!map.has(key)) map.set(key, [])
          map.get(key)!.push(b)
        }
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
      })()
    : null

  // [R21] "All Loans" fetches every unreturned (ACTIVE+OVERDUE) borrowing
  // once, with the search box passed straight through to the server;
  // the All/Active/Due Soon/Overdue chips then filter this same set
  // client-side (DUE SOON isn't a stored status — see
  // borrowingDisplayStatus() above).
  const { data: activeLoans = [] } = useBorrowings({ unreturned: true, search: borrowingsSearch || undefined })
  const visibleLoans = (activeLoans as ApiBorrowing[]).filter((b) => {
    if (borrowingsFilter === 'all') return true
    const displayStatus = borrowingDisplayStatus(b)
    if (borrowingsFilter === 'overdue') return displayStatus === 'OVERDUE'
    if (borrowingsFilter === 'dueSoon') return displayStatus === 'DUE_SOON'
    return displayStatus === 'ACTIVE'
  })
  const { data: digitalResources = [] } = useDigitalResources({
    type:    digitalTypeFilter || undefined,
    form:    digitalFormFilter ? Number(digitalFormFilter) : undefined,
    subject: digitalSubjectFilter || undefined,
  })
  const { data: recommendations = [] }  = useRecommendations('PENDING')
  const { data: fineWaivers = [] }      = useFineWaivers('PENDING')

  const scanBarcode        = useScanBarcode()
  const renewBorrowing     = useRenewBorrowing()
  const createRecommendation  = useCreateRecommendation()
  const approveRecommendation = useApproveRecommendation()
  const rejectRecommendation  = useRejectRecommendation()
  const createFineWaiver      = useCreateFineWaiver()
  const approveFineWaiver     = useApproveFineWaiver()
  const rejectFineWaiver      = useRejectFineWaiver()
  const approveDigitalResource = useApproveDigitalResource()

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
    setIssuingBookId(bookId)
  }

  function handleRenew(borrowingId: string) {
    renewBorrowing.mutate(borrowingId)
  }

  function handleSubmitRecommendation() {
    if (!recTitle.trim() || !recReason.trim()) return
    createRecommendation.mutate(
      {
        title: recTitle,
        author: recAuthor.trim() || undefined,
        type: 'BOOK',
        reason: recReason,
        requesterName: recRequesterName.trim() || undefined,
        requesterRole: recRequesterRole,
        requesterClass: recRequesterClass.trim() || undefined,
      },
      {
        onSuccess: () => {
          setRecTitle(''); setRecAuthor(''); setRecReason('')
          setRecRequesterName(''); setRecRequesterClass('')
          setWorkflowMessage('Recommendation submitted for library staff review.')
        },
      },
    )
  }

  // [R21] Client-side CSV builders for the Clearance & Audit Reports
  // panel — "Treasury Settlement Report" and "Overdue Loans Defaulter
  // List" both work entirely off data already loaded on this page
  // (allFines, overdueByClass), so no new backend route was needed.
  function downloadTreasuryCsv() {
    const paid = allFines.filter((f) => f.status === 'PAID')
    const rows = [
      ['Borrower', 'Book', 'Reason', 'Amount (MK)', 'Paid At'],
      ...paid.map((f) => [f.borrowerName, f.bookTitle, f.reason, String(f.amount), f.paidAt ? new Date(f.paidAt).toLocaleDateString() : '']),
    ]
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `treasury-settlement-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printDefaultersNotice() {
    const cutoff = 14 * 24 * 60 * 60 * 1000
    const rows = overdueByClass.flatMap((c) =>
      c.students
        .filter((st) => Date.now() - new Date(st.dueDate).getTime() > cutoff)
        .map((st) => ({ className: c.className, ...st })),
    )
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html><head><title>Overdue Loans Defaulter List</title>
      <style>body{font-family:sans-serif;padding:24px} h1{font-size:18px} table{width:100%;border-collapse:collapse;margin-top:16px} th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}</style>
      </head><body>
      <h1>Overdue Loans Defaulter List — books overdue &gt; 14 days</h1>
      <table><thead><tr><th>Class</th><th>Student</th><th>Book</th><th>Due Date</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r.className}</td><td>${r.studentName}</td><td>${r.bookTitle}</td><td>${new Date(r.dueDate).toLocaleDateString()}</td></tr>`).join('')}
      </tbody></table>
      </body></html>
    `)
    win.document.close()
    win.focus()
    win.print()
  }

  function exportReportsCsv() {
    let rows: string[][] = []
    let filename = 'library-report.csv'
    if (reportsSubTab === 'fines') {
      rows = [['Borrower', 'Book', 'Reason', 'Amount (MK)', 'Status'], ...fines.map((f) => [f.borrowerName, f.bookTitle, f.reason, String(f.amount), f.status])]
      filename = 'fines-and-penalties-ledger.csv'
    } else if (reportsSubTab === 'catalogDist' && catalogReport) {
      rows = [['Category', 'Titles', 'Copies', 'Available'], ...catalogReport.byCategory.map((c) => [c.category, String(c.titleCount), String(c.copyCount), String(c.availableCount)])]
      filename = 'catalog-distribution.csv'
    } else if (reportsSubTab === 'circulation' && catalogReport) {
      rows = [['Most Borrowed Book', 'Author', 'Times Borrowed'], ...catalogReport.mostBorrowed.map((r) => [r.book?.title ?? '', r.book?.author ?? '', String(r.borrowCount)])]
      filename = 'circulation-insights.csv'
    }
    if (rows.length === 0) return
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
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

      {/* Summary stat tiles — [R21] added a 5th "Pending Fines" tile
          (MK amount, from the new pendingFinesAmount stat) matching the
          screenshot's 5-tile layout; On Loan now uses the same Repeat
          icon as the Borrowings tab. */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total Books',   value: String(s.totalBooks),                    sub: 'Cataloged & shelf-ready', icon: BookOpen, warn: false },
            { label: 'On Loan',       value: String(s.activeBorrowings),               sub: 'Circulation active',      icon: Repeat,   warn: false },
            { label: 'Overdue',       value: String(s.overdueBorrowings),              sub: 'Requires attention',      icon: AlertTriangle, warn: s.overdueBorrowings > 0 },
            { label: 'Digital Files', value: String(s.digitalCount),                   sub: 'Past papers & guides',    icon: FileText, warn: false },
            { label: 'Pending Fines', value: formatMWK(s.pendingFinesAmount),          sub: `${s.pendingFines} pending infraction${s.pendingFines === 1 ? '' : 's'}`, icon: AlertTriangle, warn: s.pendingFinesAmount > 0 },
          ].map(({ label, value, sub, icon: Icon, warn }) => (
            <div
              key={label}
              className={`bg-surface border rounded-xl p-4 ${
                warn ? 'border-brand-coral/30 bg-brand-coral/5' : 'border-base'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className={`text-xs font-heading font-semibold uppercase tracking-wider ${warn ? 'text-brand-coral' : 'text-muted'}`}>{label}</p>
                <Icon className={`w-4 h-4 ${warn ? 'text-brand-coral' : 'text-muted'}`} aria-hidden />
              </div>
              <p className={`text-2xl font-bold mt-1.5 ${warn ? 'text-brand-coral' : 'text-brand-navy'}`}>
                {value}
              </p>
              <p className={`text-xs mt-1 ${warn ? 'text-brand-coral' : 'text-muted'}`}>{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Mobile-scrollable tab navigation — C7 */}
      <ModuleTabs<Tab>
        tabs={TABS.filter((t) => t.id !== 'reports' || isLibStaff)}
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
            <div className="w-40">
              <label htmlFor="library-category" className="sr-only">Filter by category</label>
              <select
                id="library-category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="border border-base rounded-xl px-3 py-2.5 text-sm w-full bg-surface focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              >
                <option value="">All categories</option>
                {['TEXTBOOK', 'REFERENCE', 'FICTION', 'NONFICTION', 'SCIENCE', 'MATHEMATICS', 'HUMANITIES', 'PAST_PAPER', 'OTHER'].map((c) => (
                  <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase().replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-body px-1 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
                className="w-4 h-4 accent-brand-teal"
              />
              Available now
            </label>
            {/* [PRODUCTION FIX 2026-07-28] Publisher/year filters, sort
                control, and group-by — the catalog only ever offered
                category + search + available-only before this. */}
            <div className="w-36">
              <label htmlFor="library-publisher" className="sr-only">Filter by publisher</label>
              <input
                id="library-publisher"
                value={publisherFilter}
                onChange={(e) => setPublisherFilter(e.target.value)}
                placeholder="Publisher…"
                className="border border-base rounded-xl px-3 py-2.5 text-sm w-full bg-surface focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              />
            </div>
            <div className="w-28">
              <label htmlFor="library-year" className="sr-only">Filter by publication year</label>
              <input
                id="library-year"
                type="number"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                placeholder="Year…"
                className="border border-base rounded-xl px-3 py-2.5 text-sm w-full bg-surface focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="library-sort" className="sr-only">Sort by</label>
              <select
                id="library-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="border border-base rounded-xl px-3 py-2.5 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              >
                <option value="title">Sort: Title</option>
                <option value="author">Sort: Author</option>
                <option value="publishedYear">Sort: Year</option>
                <option value="availableCopies">Sort: Availability</option>
              </select>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                aria-label={`Sort direction: ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
                className="border border-base rounded-xl p-2.5 bg-surface hover:bg-page min-h-[44px]"
              >
                <ArrowUpDown className={`w-4 h-4 ${sortDir === 'desc' ? 'text-brand-teal' : 'text-muted'}`} />
              </button>
            </div>
            <div className="w-40">
              <label htmlFor="library-groupby" className="sr-only">Group by</label>
              <select
                id="library-groupby"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
                className="border border-base rounded-xl px-3 py-2.5 text-sm w-full bg-surface focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              >
                <option value="">No grouping</option>
                <option value="category">Group by category</option>
                <option value="publisher">Group by publisher</option>
              </select>
            </div>
          </div>

          {/* [R21] Scan barcode, Issue Book, Add Book, item count, and the
              Table/Grid toggle all on one row — previously "Issue Book" /
              "Add Book" sat alone on their own row, leaving an
              awkward mostly-empty line above this one. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {isLibStaff ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="library-barcode" className="sr-only">Scan or enter a barcode</label>
                  <div className="relative">
                    <Scan className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
                    <input
                      id="library-barcode"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="Scan barcode…"
                      className="border border-base rounded-xl pl-9 pr-3 py-2 text-sm w-44 bg-surface focus:outline-none"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleScan(barcodeInput) }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleScan(barcodeInput)}
                    aria-label="Look up barcode"
                    className="bg-brand-navy text-white px-3 py-2 rounded-xl text-sm min-h-11"
                  >
                    Look up
                  </button>
                </div>
              ) : <span />}

              <div className="flex items-center gap-2">
                <PermissionGuard permission="library.issueBook">
                  <button
                    type="button"
                    onClick={() => setShowStandaloneIssue(true)}
                    className="inline-flex items-center gap-1.5 bg-brand-navy text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-navy/90 min-h-[44px]"
                  >
                    <Check className="w-4 h-4" aria-hidden /> Issue Book
                  </button>
                </PermissionGuard>
                {isLibStaff && (
                  <button
                    type="button"
                    onClick={() => setShowAddBook(true)}
                    className="inline-flex items-center gap-1.5 bg-brand-teal text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-teal-light min-h-[44px]"
                  >
                    <Plus className="w-4 h-4" aria-hidden /> Add Book
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">Showing {(books as ApiBook[]).length} title{(books as ApiBook[]).length === 1 ? '' : 's'}</span>
                <div className="flex border border-base rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCatalogView('table')}
                    aria-label="Table view"
                    aria-pressed={catalogView === 'table'}
                    className={`p-2 min-h-11 ${catalogView === 'table' ? 'bg-brand-navy text-white' : 'bg-surface text-muted hover:bg-page'}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogView('grid')}
                    aria-label="Grid view"
                    aria-pressed={catalogView === 'grid'}
                    className={`p-2 min-h-11 ${catalogView === 'grid' ? 'bg-brand-navy text-white' : 'bg-surface text-muted hover:bg-page'}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
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

          {isLoading ? (
            <div className="text-center py-12 text-muted animate-pulse">
              Loading catalog…
            </div>
          ) : catalogView === 'grid' ? (
            /* [R21] Grid view — screenshot's Table/Grid toggle. Cards
               reuse the same book data as the table; no cover images
               exist in this system yet, so a BookOpen glyph stands in. */
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(books as ApiBook[]).length === 0 && (
                <div className="col-span-full text-center py-12 text-muted text-sm border border-base rounded-xl">No books found.</div>
              )}
              {(books as ApiBook[]).map((b) => (
                <div key={b.id} className="bg-surface border border-base rounded-xl p-4 flex flex-col gap-2">
                  <div className="w-full h-24 bg-page rounded-lg flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-muted/50" aria-hidden />
                  </div>
                  <div>
                    <p className="font-heading font-semibold text-sm text-body">{b.title}</p>
                    <p className="text-xs text-muted">{b.author}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {b.barcode ?? '—'}{b.shelf ? ` · Shelf ${b.shelf}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-base rounded px-2 py-0.5">{b.category}</span>
                    <span className={`text-xs font-semibold ${b.availableCopies === 0 ? 'text-brand-coral' : 'text-brand-teal'}`}>
                      {b.availableCopies}/{b.totalCopies} available
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-auto pt-1">
                    <PermissionGuard permission="library.issueBook">
                      <button type="button" disabled={b.availableCopies === 0} onClick={() => handleIssue(b.id)} className="text-xs font-semibold text-brand-teal underline disabled:opacity-40 min-h-11">Issue</button>
                    </PermissionGuard>
                    <button type="button" onClick={() => setViewingBookId(b.id)} aria-label={`View ${b.title}`} className="text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center"><Eye className="w-3.5 h-3.5" /></button>
                    {isLibStaff && (
                      <button type="button" onClick={() => setEditingBook(b)} aria-label={`Edit ${b.title}`} className="text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center"><Pencil className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-base rounded-xl overflow-hidden">
              {/* Mobile card list — books */}
              <div className="divide-y divide-base md:hidden">
                {(books as ApiBook[]).map((b) => (
                  <div key={b.id} className="px-4 py-3">
                    <p className="font-heading font-semibold text-sm text-body">{b.title}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {b.author}{b.shelf ? ` · Shelf ${b.shelf}` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs bg-base rounded px-2 py-0.5">{b.category}</span>
                      <span className="text-xs text-muted">{b.totalCopies} copies</span>
                      <span className={`text-xs font-semibold ${b.availableCopies === 0 ? 'text-brand-coral' : 'text-brand-teal'}`}>
                        {b.availableCopies} available
                      </span>
                      <button type="button" onClick={() => setViewingBookId(b.id)} aria-label={`View ${b.title}`} className="text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center"><Eye className="w-3.5 h-3.5" /></button>
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
                      {isLibStaff && (
                        <button type="button" onClick={() => setEditingBook(b)} aria-label={`Edit ${b.title}`} className="text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table — books. [R21] Title column now shows the
                  barcode + shelf sub-line (screenshot's "MAT-2017-001 ·
                  Shelf M-02"), and Actions gained an Eye "view" icon. */}
              <table className="w-full text-sm border-collapse hidden md:table">
                <thead>
                  <tr className="bg-page border-b border-base">
                    {['Title', 'Author', 'Category', 'Publisher', 'Year', 'Copies', 'Available', ''].map((h) => (
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
                {groupedBooks ? (
                  groupedBooks.map(([groupName, groupBooks]) => (
                    <tbody key={groupName} className="divide-y divide-base">
                      <tr className="bg-page/70">
                        <td colSpan={8} className="px-4 py-2 text-xs font-heading font-bold text-brand-teal uppercase tracking-wider">
                          {groupName} · {groupBooks.length}
                        </td>
                      </tr>
                      {groupBooks.map((b) => <BookRow key={b.id} book={b} isLibStaff={isLibStaff} onIssue={handleIssue} onEdit={setEditingBook} onView={setViewingBookId} />)}
                    </tbody>
                  ))
                ) : (
                  <tbody className="divide-y divide-base">
                    {(books as ApiBook[]).map((b) => <BookRow key={b.id} book={b} isLibStaff={isLibStaff} onIssue={handleIssue} onEdit={setEditingBook} onView={setViewingBookId} />)}
                  </tbody>
                )}
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
          {/* [R21] Sub-tab pill bar (Active Borrowings / Fine Waiver
              Portal — "Quick Check-in Desk" skipped per instruction) with
              the standalone "+ Issue Book" button trailing it, matching
              the screenshot's secondary toolbar. */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <ModuleTabs<'active' | 'waivers'>
              tabs={[
                { id: 'active',  label: 'Active Borrowings',  icon: Repeat, badge: (activeLoans as ApiBorrowing[]).length },
                { id: 'waivers', label: 'Fine Waiver Portal',  icon: Shield, badge: fineWaivers.length },
              ]}
              active={borrowingsSubTab}
              onChange={setBorrowingsSubTab}
              variant="pill"
              id="borrowings-subtabs"
            />
            <PermissionGuard permission="library.issueBook">
              <button
                type="button"
                onClick={() => setShowStandaloneIssue(true)}
                className="inline-flex items-center gap-1.5 bg-brand-teal text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-teal-light min-h-[44px] shrink-0"
              >
                <Plus className="w-4 h-4" aria-hidden /> Issue Book
              </button>
            </PermissionGuard>
          </div>

          {borrowingsSubTab === 'active' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-56 relative">
                  <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
                  <label htmlFor="borrowings-search" className="sr-only">Search borrower name, student ID, book title, or barcode</label>
                  <input
                    id="borrowings-search"
                    value={borrowingsSearch}
                    onChange={(e) => setBorrowingsSearch(e.target.value)}
                    placeholder="Search borrower name, student ID, book title, or barcode…"
                    className="w-full border border-base rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const code = window.prompt('Scan or type a barcode:')
                    if (code) handleScan(code)
                  }}
                  className="inline-flex items-center gap-1.5 border border-base rounded-xl px-3 py-2.5 text-sm text-body hover:bg-page min-h-[44px]"
                >
                  <Scan className="w-4 h-4" aria-hidden /> Scan Barcode
                </button>
                <div className="flex items-center gap-1.5 bg-page rounded-xl p-1">
                  {([
                    ['all', 'All Loans'],
                    ['active', 'Active'],
                    ['dueSoon', 'Due Soon'],
                    ['overdue', 'Overdue'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setBorrowingsFilter(id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${borrowingsFilter === id ? 'bg-brand-navy text-white' : 'text-muted hover:text-body'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {(scanError || scanResult) && (
                <div className={`text-xs rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${scanError ? 'bg-brand-coral/10 border border-brand-coral/25 text-brand-coral' : 'bg-brand-teal/10 border border-brand-teal/25'}`}>
                  {scanError ? <span>{scanError}</span> : (
                    <>
                      <span>Found: <strong>{scanResult?.title}</strong></span>
                      <PermissionGuard permission="library.issueBook">
                        <button type="button" onClick={() => handleIssue(scanResult!.id)} className="text-brand-teal font-semibold underline min-h-11">Issue this book</button>
                      </PermissionGuard>
                    </>
                  )}
                </div>
              )}

              <div className="border border-base rounded-xl overflow-hidden">
                {/* Mobile card list — borrowings */}
                <div className="divide-y divide-base md:hidden">
                  {visibleLoans.length === 0 && <div className="text-center py-10 text-muted text-sm">No matching loans.</div>}
                  {visibleLoans.map((b) => {
                    const displayStatus = borrowingDisplayStatus(b)
                    const { name, sublabel } = borrowerLabel(b)
                    return (
                      <div key={b.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-heading font-semibold text-sm text-body">{name}</p>
                            <p className="text-xs text-muted">{sublabel}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                            displayStatus === 'OVERDUE' ? 'bg-brand-coral/10 text-brand-coral'
                            : displayStatus === 'DUE_SOON' ? 'bg-brand-amber/10 text-brand-amber'
                            : 'bg-brand-teal/10 text-brand-teal'
                          }`}>
                            {displayStatus === 'DUE_SOON' ? 'DUE SOON' : displayStatus}
                          </span>
                        </div>
                        <p className="text-sm text-body mt-1">{b.book?.title ?? 'Untitled'}</p>
                        <p className="text-xs text-muted">{borrowingCountdownLabel(b)}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <PermissionGuard permission="library.issueBook">
                            <button type="button" onClick={() => handleRenew(b.id)} disabled={renewBorrowing.isPending} className="text-xs font-semibold text-brand-navy underline">Renew (+14d)</button>
                          </PermissionGuard>
                          <PermissionGuard permission="library.processReturn">
                            <button type="button" onClick={() => setReturningBorrowing(b)} className="text-xs font-semibold text-brand-teal underline">Return Book</button>
                          </PermissionGuard>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Desktop table — borrowings */}
                <table className="w-full text-sm border-collapse hidden md:table">
                  <thead>
                    <tr className="bg-page border-b border-base">
                      {['Borrower / Student', 'Book Title & Barcode', 'Issue Date', 'Due Date & Countdown', 'Status', 'Circulation Actions'].map((h) => (
                        <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base">
                    {visibleLoans.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-muted text-sm">No matching loans.</td></tr>
                    )}
                    {visibleLoans.map((b) => {
                      const displayStatus = borrowingDisplayStatus(b)
                      const { name, sublabel } = borrowerLabel(b)
                      return (
                        <tr key={b.id} className="hover:bg-page">
                          <td className="px-4 py-3">
                            <p className="font-medium text-body">{name}</p>
                            <p className="text-xs text-muted">{sublabel}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-body">{b.book?.title ?? 'Untitled'}</p>
                            <p className="text-xs font-mono text-muted">{b.book?.barcode ?? '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-muted text-xs">{new Date(b.issuedAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <p className="text-xs">{new Date(b.dueDate).toLocaleDateString()}</p>
                            <p className={`text-xs ${displayStatus === 'OVERDUE' ? 'text-brand-coral' : 'text-muted'}`}>{borrowingCountdownLabel(b)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              displayStatus === 'OVERDUE' ? 'bg-brand-coral/10 text-brand-coral'
                              : displayStatus === 'DUE_SOON' ? 'bg-brand-amber/10 text-brand-amber'
                              : 'bg-brand-teal/10 text-brand-teal'
                            }`}>
                              {displayStatus === 'DUE_SOON' ? 'DUE SOON' : displayStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <PermissionGuard permission="library.issueBook">
                                <button type="button" onClick={() => handleRenew(b.id)} disabled={renewBorrowing.isPending} className="text-xs font-semibold text-brand-navy underline disabled:opacity-50">
                                  Renew (+14d)
                                </button>
                              </PermissionGuard>
                              <PermissionGuard permission="library.processReturn">
                                <button type="button" onClick={() => setReturningBorrowing(b)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-teal underline">
                                  <Undo2 className="w-3 h-3" aria-hidden /> Return Book
                                </button>
                              </PermissionGuard>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {borrowingsSubTab === 'waivers' && (
            <div className="space-y-4">
              <div className="bg-surface border border-base rounded-xl p-4 space-y-3">
                <h3 className="font-heading font-semibold text-sm text-body">Request a Fine Waiver</h3>
                <p className="text-xs text-muted">
                  Have an outstanding library fine you&apos;d like reviewed? Submit the fine ID with your reason below.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="waiver-fine-id" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Fine ID</label>
                    <input id="waiver-fine-id" value={waiverFineId} onChange={(e) => setWaiverFineId(e.target.value)}
                      placeholder="e.g. FINE-101"
                      className="w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                  </div>
                  <div>
                    <label htmlFor="waiver-reason" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Reason</label>
                    <input id="waiver-reason" value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)}
                      placeholder="Explain circumstance (e.g. financial hardship, verified flood damage, medical leave)…"
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
        </div>
      )}

      {/* ── Digital library tab ────────────────────────────────────────────── */}
      {tab === 'digital' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap gap-2">
              <select
                value={digitalTypeFilter}
                onChange={(e) => setDigitalTypeFilter(e.target.value)}
                className="border border-base rounded-xl px-3 py-2 text-sm bg-surface min-h-[44px]"
                aria-label="Filter by resource type"
              >
                <option value="">All types</option>
                <option value="EBOOK">eBook</option>
                <option value="PAST_PAPER">Past Paper</option>
                <option value="REFERENCE">Reference</option>
                <option value="STUDY_GUIDE">Study Guide</option>
              </select>
              <select
                value={digitalFormFilter}
                onChange={(e) => setDigitalFormFilter(e.target.value)}
                className="border border-base rounded-xl px-3 py-2 text-sm bg-surface min-h-[44px]"
                aria-label="Filter by form"
              >
                <option value="">All forms</option>
                {[1, 2, 3, 4].map((f) => <option key={f} value={f}>Form {f}</option>)}
              </select>
              <select
                value={digitalSubjectFilter}
                onChange={(e) => setDigitalSubjectFilter(e.target.value)}
                className="border border-base rounded-xl px-3 py-2 text-sm bg-surface min-h-[44px]"
                aria-label="Filter by subject"
              >
                <option value="">All subjects</option>
                {MALAWI_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {isLibStaff && (
              <button
                type="button"
                onClick={() => setShowUploadResource(true)}
                className="shrink-0 inline-flex items-center gap-2 bg-brand-teal text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-teal-light min-h-11"
              >
                <Upload className="w-4 h-4" aria-hidden /> Add Resource
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(digitalResources as ApiDigitalResource[]).length === 0 && (
              <div className="col-span-full text-center py-16 text-muted text-sm border border-base rounded-xl">
                No digital resources match these filters.
              </div>
            )}
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
                    {/* [FIX] "library staff are the approval authority" —
                        library.approveDigitalResource was already granted
                        to the library role and PATCH /digital/:id/approve
                        already worked; this button (and the hook behind
                        it) is the only piece that was actually missing. */}
                    {!r.approved && (
                      <PermissionGuard permission="library.approveDigitalResource">
                        <button
                          type="button"
                          onClick={() => approveDigitalResource.mutate(r.id)}
                          disabled={approveDigitalResource.isPending}
                          className="block mt-1.5 text-xs font-semibold text-brand-teal underline disabled:opacity-50"
                        >
                          {approveDigitalResource.isPending ? 'Approving…' : 'Approve'}
                        </button>
                      </PermissionGuard>
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

      {showUploadResource && (
        <UploadDigitalResourceModal onClose={() => setShowUploadResource(false)} />
      )}

      {issuingBookId && (
        <IssueBookModal
          bookId={issuingBookId}
          onClose={() => setIssuingBookId(null)}
          onIssued={() => setScanResult(null)}
        />
      )}

      {/* [R21] Standalone "+ Issue Book" (Catalog toolbar + Borrowings
          sub-tab bar) — no book preselected, so bookId is null and the
          modal shows its own book-search step. */}
      {showStandaloneIssue && (
        <IssueBookModal
          bookId={null}
          onClose={() => setShowStandaloneIssue(false)}
        />
      )}

      {/* [R21] Eye-icon "view" action from the Catalog table/grid. */}
      {viewingBookId && (
        <BookDetailModal bookId={viewingBookId} onClose={() => setViewingBookId(null)} />
      )}

      {/* [R21] Return Book — real condition picker, opened from the
          Active Borrowings table's "Return Book" action. */}
      {returningBorrowing && (
        <ReturnBookModal borrowing={returningBorrowing} onClose={() => setReturningBorrowing(null)} />
      )}

      {/* [R21] "+ Assess Fine" — Fines & Penalties Ledger. */}
      {assessingFine && (
        <AssessFineModal onClose={() => setAssessingFine(false)} />
      )}

      {/* [R21] "Open Clearance Checker" — Clearance & Audit Reports. */}
      {showClearanceChecker && (
        <ClearanceCheckerModal allFines={allFines} onClose={() => setShowClearanceChecker(false)} />
      )}

      {/* ── Recommendations tab ──────────────────────────────────────────── */}
      {tab === 'recommendations' && (
        <div className="space-y-4">
          {/* [R21] Redesigned to match the screenshot's field set (Title,
              Author(s), Requester Name & Role, Class/Form/Department, Why
              acquire) — the underlying listing/review workflow below is
              unchanged, per instruction. */}
          <PermissionGuard permission="library.recommendResource">
            <div className="bg-surface border border-base rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-amber" aria-hidden />
                <h3 className="font-heading font-semibold text-sm text-body">Recommend a Resource</h3>
              </div>
              <p className="text-xs text-muted -mt-2">Suggest new books, textbooks, or syllabus guides for the school library acquisition budget.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="rec-title" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Title *</label>
                  <input id="rec-title" value={recTitle} onChange={(e) => setRecTitle(e.target.value)}
                    placeholder="Book title, edition, or journal name…"
                    className="w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                </div>
                <div>
                  <label htmlFor="rec-author" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Author(s)</label>
                  <input id="rec-author" value={recAuthor} onChange={(e) => setRecAuthor(e.target.value)}
                    placeholder="Author, editor, or publishing house…"
                    className="w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                </div>
                <div>
                  <label htmlFor="rec-requester-name" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Requester Name &amp; Role</label>
                  <div className="flex gap-2">
                    <input id="rec-requester-name" value={recRequesterName} onChange={(e) => setRecRequesterName(e.target.value)}
                      placeholder="Your Name…"
                      className="w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                    <select
                      value={recRequesterRole}
                      onChange={(e) => setRecRequesterRole(e.target.value as typeof recRequesterRole)}
                      aria-label="Requester role"
                      className="min-h-11 border border-base rounded-xl px-2 text-sm bg-page text-body"
                    >
                      <option value="Student">Student</option>
                      <option value="Staff">Staff</option>
                      <option value="Parent">Parent</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="rec-requester-class" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Class / Form / Department</label>
                  <input id="rec-requester-class" value={recRequesterClass} onChange={(e) => setRecRequesterClass(e.target.value)}
                    placeholder="e.g. Form 4 Science B or Department of Languages"
                    className="w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="rec-reason" className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Why should the library acquire this? *</label>
                  <textarea id="rec-reason" value={recReason} onChange={(e) => setRecReason(e.target.value)} rows={3}
                    placeholder="Explain academic relevance, exam syllabus support, or general literary value…"
                    className="w-full border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
                </div>
              </div>
              <button type="button" onClick={handleSubmitRecommendation} disabled={createRecommendation.isPending || !recTitle.trim() || !recReason.trim()}
                className="inline-flex items-center gap-1.5 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60">
                {createRecommendation.isPending ? 'Submitting…' : 'Submit Recommendation'}
              </button>
              {workflowMessage && <p className="text-sm text-brand-teal">{workflowMessage}</p>}
            </div>
          </PermissionGuard>

          {/* [R21] Listing/approve/reject workflow unchanged — only the
              row now also shows the requester fields when present. */}
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
                        <p className="font-medium">{r.title}{r.author ? ` — ${r.author}` : ''}</p>
                        <p className="text-xs text-muted">{r.reason}</p>
                        {(r.requesterName || r.requesterClass) && (
                          <p className="text-xs text-muted/80 mt-0.5">
                            {[r.requesterName, r.requesterRole, r.requesterClass].filter(Boolean).join(' · ')}
                          </p>
                        )}
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

      {/* ── Reports & Fines tab (library staff only) ────────────────────────
          [PRODUCTION FIX 2026-07-28] Most-borrowed/most-read/category
          breakdown and fines management both had zero UI anywhere — the
          former had no backend either until this pass; fines were created
          automatically but had no listing/clearing surface at all.
          [R21] Restructured into 4 sub-tabs (Fines & Penalties Ledger /
          Circulation & Popularity Insights / Catalog Distribution /
          Clearance & Audit Reports) matching the screenshot's pill bar,
          with Export CSV / Print trailing it instead of "+ Issue Book". */}
      {tab === 'reports' && isLibStaff && (() => {
        const totalOutstanding = allFines.filter((f) => f.status === 'PENDING').reduce((sum, f) => sum + f.amount, 0)
        const collectedTotal   = allFines.filter((f) => f.status === 'PAID').reduce((sum, f) => sum + f.amount, 0)
        const totalAssessed    = allFines.reduce((sum, f) => sum + f.amount, 0)
        const totalPhysicalCopies = catalogReport?.byCategory.reduce((sum, c) => sum + c.copyCount, 0) ?? 0
        const categoryBooks = selectedCategory ? (books as ApiBook[]).filter((b) => b.category === selectedCategory) : []

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <ModuleTabs<'fines' | 'circulation' | 'catalogDist' | 'clearance'>
                tabs={[
                  { id: 'fines',       label: 'Fines & Penalties Ledger',        icon: AlertTriangle,  badge: fines.length },
                  { id: 'circulation', label: 'Circulation & Popularity Insights', icon: ArrowUpRight },
                  { id: 'catalogDist', label: 'Catalog Distribution',            icon: BookMarked,     badge: catalogReport?.byCategory.length ?? 0 },
                  { id: 'clearance',   label: 'Clearance & Audit Reports',       icon: ClipboardList },
                ]}
                active={reportsSubTab}
                onChange={setReportsSubTab}
                variant="pill"
                id="reports-subtabs"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={exportReportsCsv} className="inline-flex items-center gap-1.5 border border-base rounded-xl px-3 py-2.5 text-sm text-body hover:bg-page min-h-[44px]">
                  <Download className="w-4 h-4" aria-hidden /> Export CSV
                </button>
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 border border-base rounded-xl px-3 py-2.5 text-sm text-body hover:bg-page min-h-[44px]">
                  <Printer className="w-4 h-4" aria-hidden /> Print
                </button>
              </div>
            </div>

            {/* ── Fines & Penalties Ledger ─────────────────────────────── */}
            {reportsSubTab === 'fines' && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="bg-surface border border-base rounded-xl p-4">
                    <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider">Total Outstanding (Pending)</p>
                    <p className="text-2xl font-bold text-brand-amber mt-1.5">{formatMWK(totalOutstanding)}</p>
                    <p className="text-xs text-brand-amber mt-1">{allFines.filter((f) => f.status === 'PENDING').length} uncollected fines</p>
                  </div>
                  <div className="bg-surface border border-base rounded-xl p-4">
                    <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider">Collected Treasury Total</p>
                    <p className="text-2xl font-bold text-brand-teal mt-1.5">{formatMWK(collectedTotal)}</p>
                    <p className="text-xs text-brand-teal mt-1">{allFines.filter((f) => f.status === 'PAID').length} settled receipts on record</p>
                  </div>
                  <div className="bg-surface border border-base rounded-xl p-4">
                    <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider">Total Penalties Assessed</p>
                    <p className="text-2xl font-bold text-brand-navy mt-1.5">{formatMWK(totalAssessed)}</p>
                    <p className="text-xs text-muted mt-1">Damaged books, lost copies &amp; late fees</p>
                  </div>
                </div>

                <div className="bg-surface border border-base rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <div>
                      <h3 className="font-heading font-semibold text-sm text-body">Library Fines &amp; Damages</h3>
                      <p className="text-xs text-muted">Manage book damages, lost copies, and overdue penalty settlements</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={fineStatusFilter}
                        onChange={(e) => setFineStatusFilter(e.target.value as typeof fineStatusFilter)}
                        className="border border-base rounded-lg px-3 py-1.5 text-sm bg-surface min-h-[36px]"
                        aria-label="Filter fines by status"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="PAID">Paid</option>
                        <option value="WAIVED">Waived</option>
                        <option value="">All statuses</option>
                      </select>
                      <PermissionGuard permission="library.applyFine">
                        <button type="button" onClick={() => setAssessingFine(true)} className="inline-flex items-center gap-1.5 bg-brand-navy text-white rounded-lg px-3 py-1.5 text-sm font-semibold min-h-[36px]">
                          <Plus className="w-3.5 h-3.5" aria-hidden /> Assess Fine
                        </button>
                      </PermissionGuard>
                    </div>
                  </div>

                  {fines.length === 0 ? (
                    <p className="text-sm text-muted">No {fineStatusFilter ? fineStatusFilter.toLowerCase() : ''} fines.</p>
                  ) : (
                    <div className="divide-y divide-base">
                      {fines.map((f) => (
                        <div key={f.id} className="flex items-center justify-between gap-3 px-1 py-3 text-sm">
                          <div>
                            <p className="font-medium text-body">
                              {f.borrowerName} — {f.bookTitle}
                              {f.status === 'PENDING' && <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-amber/10 text-brand-amber">PENDING</span>}
                            </p>
                            <p className="text-xs text-muted">{f.reason} · {formatMWK(f.amount)}</p>
                          </div>
                          {f.status === 'PENDING' ? (
                            <div className="flex items-center gap-3 shrink-0">
                              <PermissionGuard permission="library.clearFine">
                                <button type="button" onClick={() => clearFine.mutate(f.id)} disabled={clearFine.isPending} className="text-xs font-semibold text-brand-teal hover:underline disabled:opacity-50">Mark Paid</button>
                              </PermissionGuard>
                              <PermissionGuard permission="library.waiveFine">
                                <button type="button" onClick={() => waiveFine.mutate(f.id)} disabled={waiveFine.isPending} className="text-xs font-semibold text-muted hover:underline disabled:opacity-50">Waive</button>
                              </PermissionGuard>
                            </div>
                          ) : (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${f.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-brand-teal/10 text-brand-teal'}`}>
                              {f.status}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* [R21] "no where to see how many and what books are
                    lost, damaged" — libraryService.getConditionReport(). */}
                <div className="bg-surface border border-base rounded-xl p-4">
                  <h3 className="font-heading font-semibold text-sm text-body mb-1">Damaged &amp; Lost Books</h3>
                  <p className="text-xs text-muted mb-3">
                    {conditionReport.filter((c) => c.condition === 'DAMAGED').length} damaged · {conditionReport.filter((c) => c.condition === 'LOST').length} lost
                  </p>
                  {conditionReport.length === 0 ? (
                    <p className="text-sm text-muted">No damaged or lost copies recorded.</p>
                  ) : (
                    <ul className="divide-y divide-base">
                      {conditionReport.map((c: ApiLibraryConditionEntry) => (
                        <li key={c.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                          <div>
                            <p className="font-medium text-body">{c.bookTitle} — {c.borrowerName}</p>
                            {c.notes && <p className="text-xs text-muted">{c.notes}</p>}
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${c.condition === 'LOST' ? 'bg-brand-coral/10 text-brand-coral' : 'bg-brand-amber/10 text-brand-amber'}`}>
                            {c.condition}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* ── Circulation & Popularity Insights ────────────────────── */}
            {reportsSubTab === 'circulation' && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-surface border border-base rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-heading font-semibold text-sm text-body">Most Borrowed Books</h3>
                    <span className="text-xs bg-base rounded-full px-2 py-0.5 text-muted">Physical Catalog</span>
                  </div>
                  <p className="text-xs text-muted mb-2">Top 10 physical library titles by checkout frequency</p>
                  {!catalogReport || catalogReport.mostBorrowed.length === 0 ? (
                    <p className="text-sm text-muted">No borrowing history yet.</p>
                  ) : (
                    <div className="divide-y divide-base">
                      {catalogReport.mostBorrowed.map((r, i) => (
                        <div key={r.book?.id ?? i} className="flex items-center justify-between px-1 py-2.5 text-sm">
                          <div>
                            <span className="text-muted mr-2">{i + 1}.</span>
                            <span className="font-medium text-body">{r.book?.title}</span>
                            <span className="text-muted ml-1.5">— {r.book?.author}</span>
                          </div>
                          <span className="font-heading font-semibold text-brand-teal shrink-0">{r.borrowCount}×</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-surface border border-base rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-heading font-semibold text-sm text-body">Most Read (Digital)</h3>
                    <span className="text-xs bg-base rounded-full px-2 py-0.5 text-muted">Digital E-Library</span>
                  </div>
                  <p className="text-xs text-muted mb-2">Top digital resources accessed by students &amp; faculty</p>
                  {!catalogReport || catalogReport.mostRead.length === 0 ? (
                    <p className="text-sm text-muted">No digital resource views yet.</p>
                  ) : (
                    <div className="divide-y divide-base">
                      {catalogReport.mostRead.map((r, i) => (
                        <div key={r.resource?.id ?? i} className="flex items-center justify-between px-1 py-2.5 text-sm">
                          <div>
                            <span className="text-muted mr-2">{i + 1}.</span>
                            <span className="font-medium text-body">{r.resource?.title}</span>
                            <span className="text-muted ml-1.5">— {r.resource?.type}</span>
                          </div>
                          <span className="font-heading font-semibold text-brand-teal shrink-0">{r.viewCount} views</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Catalog Distribution ─────────────────────────────────── */}
            {reportsSubTab === 'catalogDist' && (
              <div className="bg-surface border border-base rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-heading font-semibold text-sm text-body">Catalog by Category</h3>
                    <p className="text-xs text-muted">Collection volume distribution, title count, physical copies, and active shelf utilization</p>
                  </div>
                  <p className="text-xs text-muted shrink-0">Total physical copies: <strong className="text-body">{totalPhysicalCopies}</strong></p>
                </div>
                {!catalogReport || catalogReport.byCategory.length === 0 ? (
                  <p className="text-sm text-muted">No books in the catalog yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {catalogReport.byCategory.map((c) => {
                      const pct = c.copyCount > 0 ? Math.round((c.availableCount / c.copyCount) * 100) : 0
                      return (
                        // [R21] "the card should be clickable then display
                        // books of that category" — toggles a book list
                        // below, filtered from the same catalog data.
                        <button
                          key={c.category}
                          type="button"
                          onClick={() => setSelectedCategory(selectedCategory === c.category ? null : c.category)}
                          className={`text-left bg-page border rounded-xl p-4 hover:border-brand-teal/40 transition-colors ${selectedCategory === c.category ? 'border-brand-teal ring-1 ring-brand-teal/30' : 'border-base'}`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-heading font-semibold text-xs text-body uppercase tracking-wide">{c.category}</p>
                            <ArrowUpRight className="w-3.5 h-3.5 text-muted" aria-hidden />
                          </div>
                          <p className="text-xs text-muted mt-1">{c.titleCount} title{c.titleCount === 1 ? '' : 's'} · {c.copyCount} copies</p>
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs text-muted mb-1">
                              <span>In-Shelf Available</span>
                              <span>{c.availableCount} / {c.copyCount}</span>
                            </div>
                            <div className="h-1.5 bg-base rounded-full overflow-hidden">
                              <div className="h-full bg-brand-navy rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {selectedCategory && (
                  <div className="mt-4 pt-4 border-t border-base">
                    <h4 className="font-heading font-semibold text-sm text-body mb-2">{selectedCategory} — {categoryBooks.length} title{categoryBooks.length === 1 ? '' : 's'}</h4>
                    {categoryBooks.length === 0 ? (
                      <p className="text-sm text-muted">No titles loaded for this category yet — try opening the Book Catalog tab first.</p>
                    ) : (
                      <ul className="divide-y divide-base">
                        {categoryBooks.map((b) => (
                          <li key={b.id} className="py-2 flex items-center justify-between text-sm">
                            <span>{b.title} <span className="text-muted">— {b.author}</span></span>
                            <span className={`text-xs font-semibold ${b.availableCopies === 0 ? 'text-brand-coral' : 'text-brand-teal'}`}>{b.availableCopies}/{b.totalCopies} available</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Clearance & Audit Reports ────────────────────────────── */}
            {reportsSubTab === 'clearance' && (
              <div className="space-y-4">
                <div className="bg-surface border border-base rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-heading font-semibold text-sm text-body">Student Library Clearance Audit</h3>
                    <p className="text-xs text-muted">Official verification system for examination admit cards and school leaving certificates.</p>
                  </div>
                  <button type="button" onClick={() => setShowClearanceChecker(true)} className="inline-flex items-center gap-1.5 bg-brand-teal text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-teal-light min-h-[44px] shrink-0">
                    <ShieldCheck className="w-4 h-4" aria-hidden /> Open Clearance Checker
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-surface border border-base rounded-xl p-4">
                    <h3 className="font-heading font-semibold text-sm text-body">Treasury Settlement Report</h3>
                    <p className="text-xs text-muted mt-1 mb-3">Summary of all fines collected in cash and school fee deductions this term.</p>
                    <button type="button" onClick={downloadTreasuryCsv} className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3 py-2 text-sm text-body hover:bg-page">
                      <Download className="w-3.5 h-3.5" aria-hidden /> Download Treasury Audit (CSV)
                    </button>
                  </div>
                  <div className="bg-surface border border-base rounded-xl p-4">
                    <h3 className="font-heading font-semibold text-sm text-body">Overdue Loans Defaulter List</h3>
                    <p className="text-xs text-muted mt-1 mb-3">Print notice letters for students with books overdue past 14 days.</p>
                    <button type="button" onClick={printDefaultersNotice} className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3 py-2 text-sm text-body hover:bg-page">
                      <Printer className="w-3.5 h-3.5" aria-hidden /> Print Defaulters Notice
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {(showAddBook || editingBook) && (
        <BookFormModal
          book={editingBook}
          onClose={() => { setShowAddBook(false); setEditingBook(null) }}
        />
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