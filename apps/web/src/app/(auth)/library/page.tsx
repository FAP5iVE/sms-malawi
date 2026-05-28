'use client'
import { useState } from 'react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { useAuthStore } from '@/store/authStore'
import { useBooks, useLibraryStats, useBorrowings, useDigitalResources, useDigitalResourceView, useScanBarcode, useIssueBorrowing, useReturnBook } from '@/hooks/useLibrary'
import { BookOpen, Scan, FileText, ArrowUpRight, AlertTriangle } from 'lucide-react'
import type { ApiBook, ApiBorrowing, ApiDigitalResource, ApiLibraryStats } from '@shared/types/api'
type Tab = 'catalog' | 'borrowings' | 'digital'

export default function LibraryPage() {
  return (
    <RoleGuard allowed={['admin','library','high_rank','academic','lower_rank','student','exam_officer']}>
      <LibraryContent />
    </RoleGuard>
  )
}

function LibraryContent() {
  const { role } = useAuthStore()
  const [tab, setTab] = useState<Tab>('catalog')
  const [search, setSearch] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')

  const isLibStaff = ['admin','library'].includes(role ?? '')
  const { data: stats } = useLibraryStats()
  const { data: books = [], isLoading } = useBooks({ search })
  const { data: overdue = [] } = useBorrowings({ overdue: true })
  const { data: digitalResources = [] } = useDigitalResources()
  const viewResource = useDigitalResourceView()
  const scanBarcode = useScanBarcode()
  const issueBorrowing = useIssueBorrowing()
  const returnBook = useReturnBook()

 const s = stats as ApiLibraryStats | undefined

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Library</h1>
          <p className="text-sm text-muted mt-0.5">Physical catalog, borrowing, and digital resources</p>
        </div>
      </div>

      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Books',   value: s.totalBooks,        },
            { label: 'On Loan',        value: s.activeBorrowings,  },
            { label: 'Overdue',        value: s.overdueBorrowings, warn: s.overdueBorrowings > 0 },
            { label: 'Digital Files', value: s.digitalCount,      },
          ].map(({ label, value, warn }) => (
            <div key={label} className={`bg-surface border rounded-xl p-4 text-center ${warn ? 'border-brand-coral/30 bg-brand-coral/5' : 'border-base'}`}>
              <p className={`text-2xl font-bold ${warn ? 'text-brand-coral' : 'text-brand-navy'}`}>{value}</p>
              <p className="text-xs text-muted mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-base">
        {([
          { id: 'catalog'    as const, label: 'Book Catalog',     icon: BookOpen  },
          { id: 'borrowings' as const, label: 'Borrowings',       icon: Scan      },
          { id: 'digital'    as const, label: 'Digital Library', icon: FileText  },
        ]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-brand-teal text-brand-teal' : 'border-transparent text-muted hover:text-body'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'catalog' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, author, ISBN…"
              className="border border-base rounded-xl px-4 py-2.5 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
            {isLibStaff && (
              <div className="flex gap-2">
                <input value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} placeholder="Scan barcode…"
                  className="border border-base rounded-xl px-3 py-2.5 text-sm w-36 focus:outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') { scanBarcode.mutate(barcodeInput); setBarcodeInput('') } }} />
               <button onClick={() => { scanBarcode.mutate(barcodeInput); setBarcodeInput('') }}
  aria-label="Scan barcode"
  className="bg-brand-navy text-white px-3 py-2 rounded-xl text-sm">
                  <Scan className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          {isLoading ? <div className="text-center py-12 text-muted animate-pulse">Loading catalog…</div> : (
            <div className="border border-base rounded-xl overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-page border-b border-base">
                  {['Title','Author','Category','Copies','Available'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-base">
                  {(books as ApiBook[]).map((b) => (
                    <tr key={b.id} className="hover:bg-page">
                      <td className="px-4 py-3 font-medium">{b.title}</td>
                      <td className="px-4 py-3 text-muted">{b.author}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-base rounded px-2 py-0.5">{b.category}</span></td>
                      <td className="px-4 py-3 text-center">{b.totalCopies}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${b.availableCopies === 0 ? 'text-brand-coral' : 'text-brand-teal'}`}>{b.availableCopies}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(books as ApiBook[]).length === 0 && <div className="text-center py-12 text-muted text-sm">No books found.</div>}
            </div>
          )}
        </div>
      )}

      {tab === 'borrowings' && (
        <div className="space-y-4">
          {(overdue as ApiBorrowing[]).length > 0 && (
            <div className="bg-brand-coral/8 border border-brand-coral/25 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-brand-coral shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-brand-coral">{(overdue as ApiBorrowing[]).length} overdue borrowing(s)</p>
                <p className="text-sm text-muted mt-0.5">Fines will be applied automatically. Contact borrowers to return books.</p>
              </div>
            </div>
          )}
          <p className="text-sm text-muted">Use the issue and return actions from the catalog or scanner above.</p>
        </div>
      )}

      {tab === 'digital' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(digitalResources as ApiDigitalResource[]).map((r) => (
              <div key={r.id} className="bg-surface border border-base rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-body">{r.title}</p>
                    <p className="text-xs text-muted mt-1">{r.type}{r.subject ? ` · ${r.subject}` : ''}{r.form ? ` · Form ${r.form}` : ''}</p>
                    {!r.approved && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Pending Approval</span>}
                  </div>
                  {(r.approved || isLibStaff) && (
                    <button onClick={() => viewResource.mutate(r.id, { onSuccess: (d: { url: string }) => window.open(d.url, '_blank') })}
  aria-label="View resource"
  className="p-2 hover:bg-page rounded-xl text-brand-teal shrink-0">
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {(digitalResources as ApiDigitalResource[]).length === 0 && (
              <div className="col-span-3 text-center py-16 text-muted text-sm border border-base rounded-xl">No digital resources yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}