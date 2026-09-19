'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Loader2, Plus, Play, ClipboardCheck } from 'lucide-react'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import { useStocktakes, useCreateStocktake, useStartStocktake, useCompleteStocktake, useStocktake, useRecordStocktakeLine, useResolveInventoryVariance, type Stocktake, type StocktakeLine } from '@/hooks/useAssetsInventory'

function humanize(value: string) { return value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) }
function num(v: number | string | undefined) { return Number(v ?? 0) }

export function StocktakesTab() {
  const { academicYear, term } = useCurrentAcademicPeriod()
  const [showForm, setShowForm] = useState(false); const [roomId, setRoomId] = useState(''); const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: rows = [], isLoading } = useStocktakes({ academicYear, term })
  const create = useCreateStocktake()
  function createStocktake() { if (!academicYear || !term || !roomId.trim()) return; create.mutate({ academicYear, term, roomId: roomId.trim() }, { onSuccess: () => { setShowForm(false); setRoomId('') } }) }

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3 flex-wrap"><div><h2 className="font-heading font-semibold text-brand-navy">Termly Stocktakes</h2><p className="text-sm text-muted">Physical verification by room. Variances remain open until resolved.</p></div><PermissionGuard permission="inventory.performStocktake"><button type="button" onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold"><Plus className="w-4 h-4" /> Schedule stocktake</button></PermissionGuard></div>
    {showForm && <div className="bg-surface border border-base rounded-xl p-4 flex gap-3 flex-wrap"><input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Room ID" className="flex-1 min-w-60 border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" /><button type="button" onClick={createStocktake} disabled={create.isPending || !academicYear || !term || !roomId.trim()} className="min-h-11 px-4 rounded-lg bg-brand-teal text-white text-sm font-semibold disabled:opacity-60">{create.isPending ? 'Creating…' : 'Create'}</button></div>}
    <div className="bg-surface border border-base rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-base bg-page"><th className="text-left px-4 py-3">Room</th><th className="text-left px-4 py-3">Period</th><th className="text-left px-4 py-3">Status</th><th className="text-right px-4 py-3">Actions</th></tr></thead><tbody>{isLoading && <tr><td colSpan={4} className="p-8 text-center"><Loader2 className="inline w-5 h-5 animate-spin" /></td></tr>}{!isLoading && rows.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted">No stocktake scheduled for this term.</td></tr>}{rows.map((row) => <StocktakeRow key={row.id} row={row} onOpen={() => setSelectedId(row.id)} />)}</tbody></table></div></div>
    {selectedId && <StocktakeDetail id={selectedId} onClose={() => setSelectedId(null)} />}
  </div>
}

// DRAFT is the schema's actual pre-start status (was 'SCHEDULED' — not a real StocktakeStatus value).
function StocktakeRow({ row, onOpen }: { row: Stocktake; onOpen: () => void }) { const start = useStartStocktake(); return <tr className="border-b border-base last:border-0 hover:bg-page"><td className="px-4 py-3 font-medium">{row.roomId}</td><td className="px-4 py-3">{row.academicYear} · Term {row.term}</td><td className="px-4 py-3"><span className="text-xs rounded px-2 py-1 bg-base">{humanize(row.status)}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><PermissionGuard permission="inventory.performStocktake">{row.status === 'DRAFT' && <button type="button" onClick={() => start.mutate(row.id)} disabled={start.isPending} className="min-h-11 px-3 rounded-lg border border-base text-sm inline-flex items-center gap-1.5"><Play className="w-4 h-4" /> Start</button>}</PermissionGuard><button type="button" onClick={onOpen} className="min-h-11 px-3 rounded-lg bg-page text-brand-navy text-sm inline-flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4" /> Open</button></div></td></tr> }

function StocktakeDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useStocktake(id)
  const complete = useCompleteStocktake()
  if (isLoading || !data) return <Modal title="Stocktake" onClose={onClose}><div className="py-8 text-center"><Loader2 className="inline w-5 h-5 animate-spin" /></div></Modal>
  // Only IN_PROGRESS is countable/completable — DRAFT hasn't been started yet,
  // REVIEWED/COMPLETED/CANCELLED are already closed out.
  const canComplete = data.status === 'IN_PROGRESS'
  // No filtering needed here: variances only get created once completeStocktake()
  // runs, so every line is still open for counting while IN_PROGRESS.
  const lines = data.lines ?? []
  return <Modal title={`Stocktake · ${data.stocktakeNumber}`} onClose={onClose}>
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3"><Mini label="Status" value={humanize(data.status)} /><Mini label="Lines" value={String(data.lines?.length ?? 0)} /><Mini label="Open variances" value={String((data.variances ?? []).filter(v => v.status === 'OPEN' || v.status === 'INVESTIGATING').length)} /></div>

      {data.status === 'IN_PROGRESS' && (
        <div className="border border-base rounded-xl p-4">
          <p className="text-sm font-semibold mb-3">Record physical count</p>
          <p className="text-xs text-muted mb-3">Each line below was pre-populated from the system's current record when the count opened — enter what you actually find, you can't add new lines here.</p>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {lines.length === 0 && <p className="text-sm text-muted">No lines to count.</p>}
            {lines.map(l => <StocktakeLineRow key={l.id} stocktakeId={id} line={l} />)}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(data.variances ?? []).map((v) => (
          <VarianceRow key={v.id} stocktakeId={id} varianceId={v.id} varianceQuantity={v.varianceQuantity} varianceType={v.varianceType} status={v.status} />
        ))}
      </div>

      {canComplete && <PermissionGuard permission="inventory.performStocktake"><button type="button" onClick={() => complete.mutate(id, { onSuccess: onClose })} disabled={complete.isPending} className="w-full min-h-11 rounded-lg bg-brand-teal text-white text-sm font-semibold">{complete.isPending ? 'Completing…' : 'Complete stocktake'}</button></PermissionGuard>}
    </div>
  </Modal>
}

// One row per pre-populated StocktakeLine — expectedQuantity is read-only
// (it's the system's own record), only actualQuantity is editable.
function StocktakeLineRow({ stocktakeId, line }: { stocktakeId: string; line: StocktakeLine }) {
  const record = useRecordStocktakeLine()
  const [actual, setActual] = useState(String(num(line.actualQuantity)))
  const label = line.assetId ? `Asset ${line.assetId}` : line.inventoryItemId ? `Item ${line.inventoryItemId}` : line.id
  return <div className="flex items-center gap-3 border border-base rounded-lg p-2.5">
    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{label}</p><p className="text-xs text-muted">Expected: {num(line.expectedQuantity)}</p></div>
    <input type="number" min="0" step="1" value={actual} onChange={(e) => setActual(e.target.value)} className="input w-24" />
    <button type="button" disabled={record.isPending}
      onClick={() => record.mutate({ stocktakeId, lineId: line.id, actualQuantity: num(actual) })}
      className="min-h-11 px-3 rounded-lg bg-brand-navy text-white text-xs font-semibold disabled:opacity-60">
      {record.isPending ? '…' : 'Save'}
    </button>
  </div>
}

function VarianceRow({ stocktakeId, varianceId, varianceQuantity, varianceType, status }: { stocktakeId: string; varianceId: string; varianceQuantity: number | string; varianceType: string; status: string }) {
  const resolve = useResolveInventoryVariance()
  const [note, setNote] = useState('')
  const isOpen = status === 'OPEN' || status === 'INVESTIGATING'
  return <div className="border border-brand-coral/20 bg-brand-coral/5 rounded-lg p-3">
    <div className="flex justify-between">
      <span className="font-semibold">{humanize(varianceType)} of {Math.abs(num(varianceQuantity))}</span>
      <span className="text-xs text-muted">{humanize(status)}</span>
    </div>
    {isOpen && (
      <PermissionGuard permission="inventory.resolveVariance">
        <div className="flex gap-2 mt-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note (optional)" className="input flex-1" />
          <button type="button" disabled={resolve.isPending}
            onClick={() => resolve.mutate({ stocktakeId, varianceId, resolution: 'RESOLVED', resolutionNote: note.trim() || undefined }, { onSuccess: () => setNote('') })}
            className="min-h-11 px-3 rounded-lg bg-brand-navy text-white text-sm">Resolve</button>
          <button type="button" disabled={resolve.isPending}
            onClick={() => resolve.mutate({ stocktakeId, varianceId, resolution: 'WRITTEN_OFF', resolutionNote: note.trim() || undefined }, { onSuccess: () => setNote('') })}
            className="min-h-11 px-3 rounded-lg border border-base text-sm">Write off</button>
        </div>
      </PermissionGuard>
    )}
  </div>
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="bg-page border border-base rounded-lg p-3"><p className="text-xs text-muted">{label}</p><p className="font-semibold mt-1">{value}</p></div> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"><div className="absolute inset-0" onClick={onClose} /><div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl p-6"><div className="flex justify-between items-center mb-5"><h2 className="font-heading font-bold text-brand-navy">{title}</h2><button type="button" onClick={onClose} className="text-muted">Close</button></div>{children}</div></div> }
