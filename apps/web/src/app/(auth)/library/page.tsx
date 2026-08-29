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
  useUpdateBook,
  useArchiveBook,
  useCreateBook,
  useUploadDigitalResource,
  useCatalogReportStats,
  useFines,
  useClearFine,
}                            from '@/hooks/useLibrary'
import { DigitalResourceViewer } from '@/components/library/DigitalResourceViewer'
import { BookOpen, Scan, FileText, AlertTriangle, Eye, Check, X as XIcon, Undo2, Pencil, Archive, ArrowUpDown, Users2, Upload, Loader2 } from 'lucide-react'
import { ModuleTabs }        from '@/components/shared/ModuleTabs'
import { MALAWI_SUBJECTS, formatMWK } from '@shared/constants/malawi'
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
type Tab = 'catalog' | 'borrowings' | 'digital' | 'recommendations' | 'reports'

const TABS = [
  { id: 'catalog'         as Tab, label: 'Book Catalog',      icon: BookOpen  },
  { id: 'borrowings'      as Tab, label: 'Borrowings',        icon: Scan      },
  { id: 'digital'         as Tab, label: 'Digital Library',   icon: FileText  },
  { id: 'recommendations' as Tab, label: 'Recommendations',   icon: Check     },
  // [PRODUCTION FIX 2026-07-28] Genuinely distinct librarian surface —
  // most-borrowed/most-read/category stats and fines management, gated
  // separately below (librarian/admin/high_rank only), not shown as just
  // another generic tab to every role.
  { id: 'reports'         as Tab, label: 'Reports & Fines',   icon: Users2    },
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
  book: b, isLibStaff, onIssue, onEdit,
}: {
  book: ApiBook
  isLibStaff: boolean
  onIssue: (bookId: string) => void
  onEdit: (book: ApiBook) => void
}) {
  return (
    <tr className="hover:bg-page">
      <td className="px-4 py-3 font-medium">{b.title}</td>
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
      <input
        value={value ? value.fullName : query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={type === 'student' ? 'Search student by name…' : 'Search staff by name…'}
        className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
        autoComplete="off"
      />
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

function IssueBookModal({
  bookId, onClose, onIssued,
}: {
  bookId: string
  onClose: () => void
  /** Called once, only on a successful issue (not on cancel) — lets a
   *  caller react to the specific outcome, e.g. clearing a scan result. */
  onIssued?: () => void
}) {
  const issueBorrowing = useIssueBorrowing()
  const [borrowerType, setBorrowerType] = useState<'student' | 'staff'>('student')
  const [borrower, setBorrower] = useState<BorrowerHit | null>(null)
  const [dueDate, setDueDate] = useState('')

  function handleSubmit() {
    if (!borrower || !dueDate) return
    issueBorrowing.mutate({
      bookId,
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
            disabled={issueBorrowing.isPending || !borrower || !dueDate}
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

  const [recTitle, setRecTitle]   = useState('')
  const [recReason, setRecReason] = useState('')
  const [waiverFineId, setWaiverFineId] = useState('')
  const [waiverReason, setWaiverReason] = useState('')
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null)

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
  const [fineStatusFilter, setFineStatusFilter] = useState<'' | 'PENDING' | 'PAID' | 'WAIVED'>('PENDING')
  const { data: fines = [] } = useFines(fineStatusFilter || undefined)
  const clearFine = useClearFine()

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

  const { data: overdue = [] }      = useBorrowings({ overdue: true })
  const { data: digitalResources = [] } = useDigitalResources({
    type:    digitalTypeFilter || undefined,
    form:    digitalFormFilter ? Number(digitalFormFilter) : undefined,
    subject: digitalSubjectFilter || undefined,
  })
  const { data: recommendations = [] }  = useRecommendations('PENDING')
  const { data: fineWaivers = [] }      = useFineWaivers('PENDING')

  const scanBarcode        = useScanBarcode()
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
    setIssuingBookId(bookId)
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
            {isLibStaff && (
              <button
                type="button"
                onClick={() => setShowAddBook(true)}
                className="inline-flex items-center gap-1.5 bg-brand-teal text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-teal-light min-h-[44px]"
              >
                <BookOpen className="w-4 h-4" aria-hidden /> Add Book
              </button>
            )}
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
                      {isLibStaff && (
                        <button type="button" onClick={() => setEditingBook(b)} aria-label={`Edit ${b.title}`} className="text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table — books */}
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
                      {groupBooks.map((b) => <BookRow key={b.id} book={b} isLibStaff={isLibStaff} onIssue={handleIssue} onEdit={setEditingBook} />)}
                    </tbody>
                  ))
                ) : (
                  <tbody className="divide-y divide-base">
                    {(books as ApiBook[]).map((b) => <BookRow key={b.id} book={b} isLibStaff={isLibStaff} onIssue={handleIssue} onEdit={setEditingBook} />)}
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

      {/* ── Reports & Fines tab (library staff only) ────────────────────────
          [PRODUCTION FIX 2026-07-28] Most-borrowed/most-read/category
          breakdown and fines management both had zero UI anywhere — the
          former had no backend either until this pass; fines were created
          automatically but had no listing/clearing surface at all. */}
      {tab === 'reports' && isLibStaff && (
        <div className="space-y-6">
          <div>
            <h2 className="font-heading font-semibold text-body mb-3">Most Borrowed Books</h2>
            {!catalogReport || catalogReport.mostBorrowed.length === 0 ? (
              <p className="text-sm text-muted">No borrowing history yet.</p>
            ) : (
              <div className="bg-surface rounded-xl divide-y divide-base">
                {catalogReport.mostBorrowed.map((r, i) => (
                  <div key={r.book?.id ?? i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="text-muted mr-2">{i + 1}.</span>
                      <span className="font-medium text-body">{r.book?.title}</span>
                      <span className="text-muted ml-1.5">— {r.book?.author}</span>
                    </div>
                    <span className="font-heading font-semibold text-brand-teal">{r.borrowCount}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="font-heading font-semibold text-body mb-3">Most Read (Digital)</h2>
            {!catalogReport || catalogReport.mostRead.length === 0 ? (
              <p className="text-sm text-muted">No digital resource views yet.</p>
            ) : (
              <div className="bg-surface rounded-xl divide-y divide-base">
                {catalogReport.mostRead.map((r, i) => (
                  <div key={r.resource?.id ?? i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <span className="text-muted mr-2">{i + 1}.</span>
                      <span className="font-medium text-body">{r.resource?.title}</span>
                      <span className="text-muted ml-1.5">— {r.resource?.type}</span>
                    </div>
                    <span className="font-heading font-semibold text-brand-teal">{r.viewCount} views</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="font-heading font-semibold text-body mb-3">Catalog by Category</h2>
            {!catalogReport || catalogReport.byCategory.length === 0 ? (
              <p className="text-sm text-muted">No books in the catalog yet.</p>
            ) : (
              <div className="grid sm:grid-cols-3 gap-3">
                {catalogReport.byCategory.map((c) => (
                  <div key={c.category} className="bg-surface rounded-xl p-4">
                    <p className="font-heading font-semibold text-sm text-body">{c.category}</p>
                    <p className="text-xs text-muted mt-1">{c.titleCount} titles · {c.copyCount} copies</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-semibold text-body">Library Fines</h2>
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
            </div>
            {fines.length === 0 ? (
              <p className="text-sm text-muted">No {fineStatusFilter ? fineStatusFilter.toLowerCase() : ''} fines.</p>
            ) : (
              <div className="bg-surface rounded-xl divide-y divide-base">
                {fines.map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-body">{f.borrowerName} — {f.bookTitle}</p>
                      <p className="text-xs text-muted">{f.reason} · {formatMWK(f.amount)}</p>
                    </div>
                    {f.status === 'PENDING' ? (
                      <PermissionGuard permission="library.clearFine">
                        <button
                          type="button"
                          onClick={() => clearFine.mutate(f.id)}
                          disabled={clearFine.isPending}
                          className="text-xs font-semibold text-brand-teal hover:underline disabled:opacity-50"
                        >
                          Mark Paid
                        </button>
                      </PermissionGuard>
                    ) : (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${f.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-brand-teal/10 text-brand-teal'}`}>
                        {f.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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