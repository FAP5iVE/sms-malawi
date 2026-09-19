'use client'

import { useState } from 'react'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Loader2, PackagePlus, PackageMinus, ArrowRightLeft, Search, History, SlidersHorizontal, Plus, Pencil } from 'lucide-react'
import {
  useInventoryItems,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useInventoryTransactions,
  useReceiveInventory,
  useIssueInventory,
  useTransferInventory,
  useAdjustInventory,
  type InventoryItem,
} from '@/hooks/useAssetsInventory'

function n(value: number | string | null | undefined) { return Number(value ?? 0) }
function humanize(value: string) { return value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) }

export function InventoryOperationsTab() {
  const [search, setSearch] = useState('')
  const [lowStock, setLowStock] = useState(false)
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [operation, setOperation] = useState<'receive' | 'issue' | 'transfer' | 'adjust' | null>(null)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: items = [], isLoading } = useInventoryItems({ search: search || undefined, lowStock: lowStock || undefined })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-60">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input aria-label="Search inventory" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU or item…" className="w-full pl-9 border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm min-h-11 px-3 border border-base rounded-lg bg-page">
          <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} /> Low stock only
        </label>
        <PermissionGuard permission="inventory.manageItems">
          <button type="button" onClick={() => setShowCreate(true)} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" /> New item</button>
        </PermissionGuard>
      </div>

      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-base bg-page">
              <th className="text-left px-4 py-3">Item</th><th className="text-left px-4 py-3">Category</th><th className="text-right px-4 py-3">Balance</th><th className="text-right px-4 py-3">Reorder</th><th className="text-right px-4 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="p-8 text-center text-muted"><Loader2 className="inline w-5 h-5 animate-spin" /></td></tr>}
              {!isLoading && items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted">No inventory items found.</td></tr>}
              {items.map((item) => {
                const balance = n(item.currentBalance)
                const reorder = n(item.reorderLevel)
                const low = balance <= reorder
                return <tr key={item.id} className="border-b border-base last:border-0 hover:bg-page">
                  <td className="px-4 py-3"><p className="font-medium">{item.name}</p><p className="text-xs text-muted font-mono">{item.itemCode}</p></td>
                  <td className="px-4 py-3 text-xs">{humanize(item.category ?? 'Uncategorized')}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${low ? 'text-brand-coral' : ''}`}>{balance} {item.unitOfMeasure}</td>
                  <td className="px-4 py-3 text-right text-muted">{reorder}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1">
                    <PermissionGuard permission="inventory.receive"><button type="button" title="Receive stock" aria-label={`Receive ${item.name}`} onClick={() => { setSelected(item); setOperation('receive') }} className="min-h-11 min-w-11 flex items-center justify-center text-brand-teal"><PackagePlus className="w-4 h-4" /></button></PermissionGuard>
                    <PermissionGuard permission="inventory.issue"><button type="button" title="Issue stock" aria-label={`Issue ${item.name}`} onClick={() => { setSelected(item); setOperation('issue') }} className="min-h-11 min-w-11 flex items-center justify-center text-brand-coral"><PackageMinus className="w-4 h-4" /></button></PermissionGuard>
                    <PermissionGuard permission="inventory.transfer"><button type="button" title="Transfer stock" aria-label={`Transfer ${item.name}`} onClick={() => { setSelected(item); setOperation('transfer') }} className="min-h-11 min-w-11 flex items-center justify-center text-brand-navy"><ArrowRightLeft className="w-4 h-4" /></button></PermissionGuard>
                    <PermissionGuard permission="inventory.manageItems"><button type="button" title="Adjust stock" aria-label={`Adjust ${item.name}`} onClick={() => { setSelected(item); setOperation('adjust') }} className="min-h-11 min-w-11 flex items-center justify-center text-brand-navy"><SlidersHorizontal className="w-4 h-4" /></button></PermissionGuard>
                    <PermissionGuard permission="inventory.manageItems"><button type="button" title="Edit item" aria-label={`Edit ${item.name}`} onClick={() => setEditing(item)} className="min-h-11 min-w-11 flex items-center justify-center text-muted"><Pencil className="w-4 h-4" /></button></PermissionGuard>
                    <button type="button" title="View movement" aria-label={`View movement for ${item.name}`} onClick={() => setSelected(item)} className="min-h-11 min-w-11 flex items-center justify-center text-muted"><History className="w-4 h-4" /></button>
                  </div></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <InventoryItemForm onClose={() => setShowCreate(false)} />}
      {editing && <InventoryItemForm item={editing} onClose={() => setEditing(null)} />}
      {selected && operation && <InventoryOperationModal item={selected} operation={operation} onClose={() => { setOperation(null); setSelected(null) }} />}
      {selected && !operation && <InventoryHistoryModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// New item + edit share one form — item is undefined for create, passed in for edit.
// itemCode/unitOfMeasure aren't editable once set (itemCode is @unique and used
// elsewhere for lookups; unitOfMeasure changing after transactions exist would make
// historical quantities ambiguous) — inventoryService.updateItem doesn't accept either.
function InventoryItemForm({ item, onClose }: { item?: InventoryItem; onClose: () => void }) {
  const create = useCreateInventoryItem(); const update = useUpdateInventoryItem()
  const [itemCode, setItemCode] = useState(item?.itemCode ?? ''); const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState(item?.category ?? ''); const [unitOfMeasure, setUnitOfMeasure] = useState(item?.unitOfMeasure ?? 'each')
  const [reorderLevel, setReorderLevel] = useState(item?.reorderLevel != null ? String(item.reorderLevel) : '')
  const [reorderQuantity, setReorderQuantity] = useState(item?.reorderQuantity != null ? String(item.reorderQuantity) : '')
  const mutation = item ? update : create
  const error = mutation.error instanceof Error ? mutation.error.message : ''
  function submit() {
    const common = { name: name.trim(), category: category.trim() || undefined, reorderLevel: reorderLevel ? Number(reorderLevel) : undefined, reorderQuantity: reorderQuantity ? Number(reorderQuantity) : undefined }
    if (item) update.mutate({ id: item.id, ...common }, { onSuccess: onClose })
    else { if (!itemCode.trim() || !name.trim() || !unitOfMeasure.trim()) return; create.mutate({ itemCode: itemCode.trim(), unitOfMeasure: unitOfMeasure.trim(), ...common }, { onSuccess: onClose }) }
  }
  return <Modal title={item ? `Edit ${item.name}` : 'New inventory item'} onClose={onClose}>
    <div className="space-y-3">
      {!item && <Field label="Item code"><input value={itemCode} onChange={(e) => setItemCode(e.target.value)} className="input" placeholder="INV-001" /></Field>}
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
      <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} className="input" placeholder="Stationery, cleaning supplies…" /></Field>
      {!item && <Field label="Unit of measure"><input value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} className="input" placeholder="ream, litre, each…" /></Field>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reorder level"><input type="number" min="0" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} className="input" /></Field>
        <Field label="Reorder quantity"><input type="number" min="0" value={reorderQuantity} onChange={(e) => setReorderQuantity(e.target.value)} className="input" /></Field>
      </div>
      {error && <p className="text-sm text-brand-coral">{error}</p>}
      <button type="button" onClick={submit} disabled={mutation.isPending} className="w-full min-h-11 rounded-lg bg-brand-navy text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">{mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {item ? 'Save changes' : 'Create item'}</button>
    </div>
  </Modal>
}

function InventoryOperationModal({ item, operation, onClose }: { item: InventoryItem; operation: 'receive' | 'issue' | 'transfer' | 'adjust'; onClose: () => void }) {
  const receive = useReceiveInventory(); const issue = useIssueInventory(); const transfer = useTransferInventory(); const adjust = useAdjustInventory()
  const [quantity, setQuantity] = useState('1'); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [reason, setReason] = useState('')
  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>('INCREASE')
  const mutation = operation === 'receive' ? receive : operation === 'issue' ? issue : operation === 'transfer' ? transfer : adjust
  const error = mutation.error instanceof Error ? mutation.error.message : ''
  function submit() {
    const qty = Number(quantity); if (!Number.isFinite(qty) || qty <= 0) return
    if (operation === 'receive') receive.mutate({ inventoryItemId: item.id, quantity: qty, destinationRoomId: to || undefined }, { onSuccess: onClose })
    if (operation === 'issue') issue.mutate({ inventoryItemId: item.id, quantity: qty, sourceRoomId: from || undefined, reason: reason.trim() || undefined }, { onSuccess: onClose })
    if (operation === 'transfer') { if (!from || !to) return; transfer.mutate({ inventoryItemId: item.id, quantity: qty, sourceRoomId: from, destinationRoomId: to, reason: reason.trim() || undefined }, { onSuccess: onClose }) }
    if (operation === 'adjust') { if (!reason.trim()) return; adjust.mutate({ inventoryItemId: item.id, quantity: qty, direction, reason: reason.trim() }, { onSuccess: onClose }) }
  }
  return <Modal title={`${humanize(operation)} stock`} onClose={onClose}>
    <p className="text-sm text-muted mb-4">{item.name} · {item.itemCode}</p>
    <div className="space-y-3">
      {operation === 'adjust' && <Field label="Direction">
        <div className="flex gap-2">
          <button type="button" onClick={() => setDirection('INCREASE')} className={`flex-1 min-h-11 rounded-lg border text-sm ${direction === 'INCREASE' ? 'border-brand-teal bg-brand-teal/10 text-brand-teal font-semibold' : 'border-base'}`}>Increase</button>
          <button type="button" onClick={() => setDirection('DECREASE')} className={`flex-1 min-h-11 rounded-lg border text-sm ${direction === 'DECREASE' ? 'border-brand-coral bg-brand-coral/10 text-brand-coral font-semibold' : 'border-base'}`}>Decrease</button>
        </div>
      </Field>}
      <Field label="Quantity"><input type="number" min="0.01" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input" /></Field>
      {(operation === 'issue' || operation === 'transfer') && <Field label="From room / location"><input value={from} onChange={(e) => setFrom(e.target.value)} className="input" placeholder="Room ID" /></Field>}
      {(operation === 'receive' || operation === 'transfer') && <Field label="To room / location"><input value={to} onChange={(e) => setTo(e.target.value)} className="input" placeholder="Room ID" /></Field>}
      {(operation !== 'receive') && <Field label={operation === 'adjust' ? 'Reason (required)' : 'Reason'}><textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input" /></Field>}
      {error && <p className="text-sm text-brand-coral">{error}</p>}
      <button type="button" onClick={submit} disabled={mutation.isPending} className="w-full min-h-11 rounded-lg bg-brand-navy text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">{mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Confirm</button>
    </div>
  </Modal>
}

function InventoryHistoryModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { data = [], isLoading } = useInventoryTransactions(item.id)
  return <Modal title={`Movement · ${item.name}`} onClose={onClose}>
    {isLoading ? <div className="py-8 text-center"><Loader2 className="inline w-5 h-5 animate-spin" /></div> : data.length === 0 ? <p className="py-8 text-center text-sm text-muted">No movement recorded.</p> : <div className="space-y-2 max-h-96 overflow-y-auto">{data.map((row) => <div key={row.id} className="border border-base rounded-lg p-3"><div className="flex justify-between gap-3"><span className="font-medium">{humanize(row.transactionType)}</span><span className="tabular">{n(row.quantity)} {item.unitOfMeasure}</span></div><p className="text-xs text-muted mt-1">{new Date(row.createdAt).toLocaleString()} · {row.reason || 'No reason supplied'}</p></div>)}</div>}
  </Modal>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-xs text-muted block mb-1">{label}</span>{children}</label> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"><div className="absolute inset-0" onClick={onClose} /><div className="relative z-10 w-full max-w-lg bg-surface rounded-2xl shadow-xl p-6"><div className="flex justify-between items-center mb-5"><h2 className="font-heading font-bold text-brand-navy">{title}</h2><button type="button" onClick={onClose} className="text-muted">Close</button></div>{children}</div></div> }
