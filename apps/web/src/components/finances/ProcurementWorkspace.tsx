'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { formatMWK } from '@shared/constants/malawi'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import { useDepartments } from '@/hooks/useLocations'
import {
  useRequisitions, useRFQs, useQuotations, usePurchaseOrders, useGoodsReceipts, useBudgetWindows, useSuppliers,
  useCreateRequisition, useSubmitRequisition, useApproveRequisition, useReturnRequisition, useRejectRequisition, useCancelRequisition,
  useCreateRFQ, useCloseRFQ, useCreateQuotation, useSelectQuotation, useRejectQuotation,
  useCreatePurchaseOrder, useApprovePurchaseOrder, useSendPurchaseOrder, useCancelPurchaseOrder,
  useCreateGoodsReceipt, useCompleteGoodsReceipt, useCreateBudgetWindow, useOpenBudgetWindow, useCloseBudgetWindow, useCreateSupplier,
  type PurchaseRequisition, type RFQRow, type QuotationRow, type PurchaseOrderRow, type Supplier,
} from '@/hooks/useProcurement'
import { Loader2, Plus, Send, Check, X, RotateCcw, Ban, Truck } from 'lucide-react'

// [CHANGE TYPE]: REWORK (R22) — this supersedes the partner's draft, which had
// several forms that would always fail validation as written (RFQ creation
// sent no line selection at all against a schema requiring lineIds.min(1);
// goods receipts always sent lines:[] against a schema requiring
// lines.min(1); reject/return sent an empty body against a schema requiring
// a reviewNote) and one workflow — recording a quotation — with no UI at
// all. Field names (requisitionNo/poNo/receiptNo/totalAmount) and status
// values (PENDING_APPROVAL/COMPLETED, which aren't real ProcurementStatus/
// PurchaseOrderStatus values) are also corrected throughout.

type Tab = 'requisitions' | 'rfqs' | 'quotations' | 'orders' | 'receipts' | 'windows' | 'suppliers'
const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'requisitions', label: 'Requisitions' }, { id: 'rfqs', label: 'RFQs' }, { id: 'quotations', label: 'Quotations' },
  { id: 'orders', label: 'Purchase Orders' }, { id: 'receipts', label: 'Goods Receipts' }, { id: 'windows', label: 'Budget Windows' },
  { id: 'suppliers', label: 'Suppliers' },
]
function humanize(s: string) { return s.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) }
function money(v: number | undefined) { return formatMWK(Number(v ?? 0)) }
function errorMessage(err: unknown, fallback: string) { return err instanceof Error ? err.message : fallback }

export function ProcurementWorkspace() {
  const [tab, setTab] = useState<Tab>('requisitions')
  const { academicYear } = useCurrentAcademicPeriod()
  return <div className="space-y-5">
    <div className="flex gap-1 border-b border-base overflow-x-auto">
      {tabs.map(t => <button key={t.id} type="button" onClick={() => setTab(t.id)}
        className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-brand-navy text-brand-navy' : 'border-transparent text-muted hover:text-brand-navy'}`}>
        {t.label}
      </button>)}
    </div>
    {tab === 'requisitions' && <Requisitions />}
    {tab === 'rfqs' && <RFQs />}
    {tab === 'quotations' && <Quotations />}
    {tab === 'orders' && <PurchaseOrders />}
    {tab === 'receipts' && <GoodsReceipts />}
    {tab === 'windows' && <BudgetWindows academicYear={academicYear ?? ''} />}
    {tab === 'suppliers' && <Suppliers />}
  </div>
}

// ── REQUISITIONS ──

function Requisitions() {
  const { data = [], isLoading } = useRequisitions(); const [show, setShow] = useState(false)
  return <section className="space-y-4">
    <Header title="Purchase requisitions" subtitle="New procurement requests. Legacy AssetRequest records remain separate."
      action={<PermissionGuard permission="procurement.createRequisition"><button type="button" onClick={() => setShow(true)} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" /> New requisition</button></PermissionGuard>} />
    {show && <RequisitionForm onClose={() => setShow(false)} />}
    {isLoading ? <Loading /> : <DataTable headers={['Requisition', 'Department', 'Purpose', 'Status', 'Amount', 'Actions']}>{data.map((r) => <RequisitionRow key={r.id} row={r} />)}</DataTable>}
  </section>
}

function RequisitionRow({ row }: { row: PurchaseRequisition }) {
  const submit = useSubmitRequisition(); const approve = useApproveRequisition(); const ret = useReturnRequisition(); const reject = useRejectRequisition(); const cancel = useCancelRequisition()
  const amount = (row.lines ?? []).reduce((sum, l) => sum + Number(l.quantity) * Number(l.estimatedUnitCost), 0)
  const err = submit.error || approve.error || ret.error || reject.error || cancel.error
  // A submitted requisition can also sit at UNDER_REVIEW; both are the reviewable window.
  const reviewable = row.status === 'SUBMITTED' || row.status === 'UNDER_REVIEW'
  const closed = ['CLOSED', 'CANCELLED', 'REJECTED'].includes(row.status)
  function returnWithNote() { const note = window.prompt('What needs to change before this can be resubmitted?'); if (note?.trim()) ret.mutate({ id: row.id, data: { reviewNote: note.trim() } }) }
  function rejectWithNote() { const note = window.prompt('Reason for rejecting this requisition:'); if (note?.trim()) reject.mutate({ id: row.id, data: { reviewNote: note.trim() } }) }
  return <tr className="border-b border-base last:border-0">
    <td className="px-4 py-3 font-medium">{row.requisitionNumber}</td>
    <td className="px-4 py-3 text-xs font-mono">{row.departmentId}</td>
    <td className="px-4 py-3 max-w-xs">{row.purpose}</td>
    <td className="px-4 py-3"><span className="text-xs rounded px-2 py-1 bg-base">{humanize(row.status)}</span></td>
    <td className="px-4 py-3 text-right tabular">{money(amount)}</td>
    <td className="px-4 py-3">
      <div className="flex justify-end gap-1">
        {row.status === 'DRAFT' && <Action onClick={() => submit.mutate({ id: row.id })} label="Submit"><Send className="w-4 h-4" /></Action>}
        {reviewable && <>
          <Action onClick={() => approve.mutate({ id: row.id, data: {} })} label="Approve"><Check className="w-4 h-4" /></Action>
          <Action onClick={returnWithNote} label="Return"><RotateCcw className="w-4 h-4" /></Action>
          <Action onClick={rejectWithNote} label="Reject"><X className="w-4 h-4" /></Action>
        </>}
        {!closed && <Action onClick={() => cancel.mutate({ id: row.id })} label="Cancel"><Ban className="w-4 h-4" /></Action>}
      </div>
      {err && <p className="text-xs text-brand-coral mt-1">{errorMessage(err, 'Action failed.')}</p>}
    </td>
  </tr>
}

const ASSET_CATEGORIES = ['FURNITURE', 'IT_EQUIPMENT', 'LAB_EQUIPMENT', 'SPORTS_EQUIPMENT', 'KITCHEN_EQUIPMENT', 'VEHICLE', 'MAINTENANCE_TOOL', 'OTHER']
const LINE_CLASSIFICATIONS = ['FIXED_ASSET', 'INVENTORY', 'CONSUMABLE', 'SERVICE', 'DIRECT_EXPENSE']

function RequisitionForm({ onClose }: { onClose: () => void }) {
  const create = useCreateRequisition()
  const { data: departments = [] } = useDepartments()
  const [departmentId, setDepartmentId] = useState(''); const [budgetId, setBudgetId] = useState(''); const [budgetWindowId, setBudgetWindowId] = useState('')
  const [purpose, setPurpose] = useState(''); const [justification, setJustification] = useState(''); const [emergency, setEmergency] = useState(false)
  const [description, setDescription] = useState(''); const [qty, setQty] = useState('1'); const [unit, setUnit] = useState('each'); const [cost, setCost] = useState('0')
  const [classification, setClassification] = useState('FIXED_ASSET'); const [assetCategory, setAssetCategory] = useState('OTHER')
  const total = Number(qty || 0) * Number(cost || 0)
  function submit() {
    if (!departmentId || !purpose || !description) return
    // requisitionNumber is server-generated (procurementService.nextRequisitionNumber) — never sent by the client.
    create.mutate({
      departmentId, budgetId: budgetId || undefined, budgetWindowId: budgetWindowId || undefined,
      purpose, justification: justification || undefined, isEmergency: emergency,
      lines: [{
        description, classification, quantity: Number(qty), unitOfMeasure: unit, estimatedUnitCost: Number(cost),
        assetCategory: classification === 'FIXED_ASSET' ? assetCategory : undefined,
      }],
    }, { onSuccess: onClose })
  }
  return <div className="bg-surface border border-base rounded-xl p-5 space-y-4">
    <div className="flex justify-between"><h4 className="font-semibold text-brand-navy">New purchase requisition</h4><button type="button" onClick={onClose} className="text-muted">Close</button></div>
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="Department"><select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="input"><option value="">Select a department…</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Budget ID"><input value={budgetId} onChange={e => setBudgetId(e.target.value)} className="input" placeholder="Required before this can be approved" /></Field>
      <Field label="Budget Window ID"><input value={budgetWindowId} onChange={e => setBudgetWindowId(e.target.value)} className="input" placeholder="Optional" /></Field>
      <Field label="Purpose"><input value={purpose} onChange={e => setPurpose(e.target.value)} className="input" /></Field>
      <Field label="Item / service"><input value={description} onChange={e => setDescription(e.target.value)} className="input" /></Field>
      <Field label="Classification"><select value={classification} onChange={e => setClassification(e.target.value)} className="input">{LINE_CLASSIFICATIONS.map(c => <option key={c} value={c}>{humanize(c)}</option>)}</select></Field>
      {classification === 'FIXED_ASSET' && <Field label="Asset category"><select value={assetCategory} onChange={e => setAssetCategory(e.target.value)} className="input">{ASSET_CATEGORIES.map(c => <option key={c} value={c}>{humanize(c)}</option>)}</select></Field>}
      <Field label="Quantity"><input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="input" /></Field>
      <Field label="Unit"><input value={unit} onChange={e => setUnit(e.target.value)} className="input" /></Field>
      <Field label="Estimated unit cost (MWK)"><input type="number" min="0" value={cost} onChange={e => setCost(e.target.value)} className="input" /></Field>
    </div>
    <Field label="Justification"><textarea value={justification} onChange={e => setJustification(e.target.value)} rows={3} className="input" /></Field>
    <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={emergency} onChange={e => setEmergency(e.target.checked)} /> Emergency request</label>
    <div className="flex items-center justify-between border-t border-base pt-3">
      <span className="text-sm text-muted">Estimated total <strong className="text-brand-navy">{money(total)}</strong></span>
      <button type="button" onClick={submit} disabled={create.isPending} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold">{create.isPending ? 'Creating…' : 'Create draft'}</button>
    </div>
    {create.error && <p className="text-sm text-brand-coral">{errorMessage(create.error, 'Could not create requisition.')}</p>}
  </div>
}

// ── RFQ ── (rebuilt: the draft never collected which PR lines go out to RFQ, which CreateRFQSchema requires)

function RFQs() {
  const { data = [], isLoading } = useRFQs(); const close = useCloseRFQ(); const [show, setShow] = useState(false)
  return <section className="space-y-4">
    <Header title="Requests for quotation" action={<PermissionGuard permission="procurement.manageRFQ"><button type="button" onClick={() => setShow(true)} className="button-primary"><Plus className="w-4 h-4" /> Create RFQ</button></PermissionGuard>} />
    {show && <RFQForm onClose={() => setShow(false)} />}
    {isLoading ? <Loading /> : <DataTable headers={['RFQ', 'PR', 'Status', 'Actions']}>{data.map((r: RFQRow) => <tr key={r.id} className="border-b border-base">
      <td className="px-4 py-3 font-medium">{r.rfqNumber}</td>
      <td className="px-4 py-3">{r.purchaseRequisition?.requisitionNumber ?? '—'}</td>
      <td className="px-4 py-3">{humanize(r.status)}</td>
      <td className="px-4 py-3 text-right">{r.status !== 'CLOSED' && r.status !== 'CANCELLED' && <Action onClick={() => close.mutate({ id: r.id })} label="Close">Close</Action>}</td>
    </tr>)}</DataTable>}
  </section>
}

function RFQForm({ onClose }: { onClose: () => void }) {
  const { data: requisitions = [] } = useRequisitions()
  const create = useCreateRFQ()
  const approved = requisitions.filter(r => r.status === 'APPROVED')
  const [prId, setPrId] = useState(''); const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set()); const [deadline, setDeadline] = useState('')
  const pr = approved.find(r => r.id === prId)
  function toggleLine(id: string) { setSelectedLines(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next }) }
  function submit() {
    if (!prId || selectedLines.size === 0) return
    create.mutate({ purchaseRequisitionId: prId, lineIds: Array.from(selectedLines), responseDeadline: deadline || undefined }, { onSuccess: onClose })
  }
  return <div className="bg-surface border border-base rounded-xl p-5 space-y-4">
    <div className="flex justify-between"><h4 className="font-semibold text-brand-navy">New RFQ</h4><button type="button" onClick={onClose} className="text-muted">Close</button></div>
    <Field label="Approved requisition">
      <select value={prId} onChange={e => { setPrId(e.target.value); setSelectedLines(new Set()) }} className="input">
        <option value="">Select a requisition…</option>
        {approved.map(r => <option key={r.id} value={r.id}>{r.requisitionNumber} — {r.purpose}</option>)}
      </select>
    </Field>
    {approved.length === 0 && <p className="text-xs text-muted">No approved requisitions are waiting for an RFQ right now.</p>}
    {pr && <div className="space-y-2">
      <p className="text-xs text-muted">Select the lines to send out for quotation:</p>
      {(pr.lines ?? []).map(l => <label key={l.id} className="flex items-center gap-2 text-sm border border-base rounded-lg p-2">
        <input type="checkbox" checked={selectedLines.has(l.id)} onChange={() => toggleLine(l.id)} />
        <span className="flex-1">{l.description}</span><span className="text-muted text-xs">{l.quantity} {l.unitOfMeasure}</span>
      </label>)}
    </div>}
    <Field label="Response deadline (optional)"><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="input" /></Field>
    <button type="button" onClick={submit} disabled={create.isPending || !prId || selectedLines.size === 0} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60">{create.isPending ? 'Creating…' : 'Create RFQ'}</button>
    {create.error && <p className="text-sm text-brand-coral">{errorMessage(create.error, 'Could not create RFQ.')}</p>}
  </div>
}

// ── QUOTATIONS ── (the draft had no way to record a received quotation at all — added here)

function Quotations() {
  const { data = [], isLoading } = useQuotations(); const select = useSelectQuotation(); const reject = useRejectQuotation(); const [show, setShow] = useState(false)
  return <section className="space-y-4">
    <Header title="Quotation review" action={<PermissionGuard permission="procurement.manageRFQ"><button type="button" onClick={() => setShow(true)} className="button-primary"><Plus className="w-4 h-4" /> Record quotation</button></PermissionGuard>} />
    {show && <QuotationForm onClose={() => setShow(false)} />}
    <DataTable headers={['Quotation', 'Supplier', 'Status', 'Total', 'Actions']}>
      {isLoading ? <tr><td colSpan={5}><Loading /></td></tr> : data.map((r: QuotationRow) => <tr key={r.id} className="border-b border-base">
        <td className="px-4 py-3 font-medium">{r.quotationNumber}</td>
        <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
        <td className="px-4 py-3">{humanize(r.status)}</td>
        <td className="px-4 py-3 text-right">{money(r.total)}</td>
        <td className="px-4 py-3 text-right">
          {(r.status === 'RECEIVED' || r.status === 'UNDER_REVIEW') && <>
            <Action onClick={() => select.mutate({ id: r.id })} label="Select">Select</Action> <Action onClick={() => reject.mutate({ id: r.id })} label="Reject">Reject</Action>
          </>}
        </td>
      </tr>)}
    </DataTable>
  </section>
}

function QuotationForm({ onClose }: { onClose: () => void }) {
  const { data: rfqs = [] } = useRFQs(); const { data: suppliers = [] } = useSuppliers()
  const create = useCreateQuotation()
  const openRfqs = rfqs.filter(r => r.status === 'ISSUED' || r.status === 'RESPONSES_RECEIVED')
  const [rfqId, setRfqId] = useState(''); const [supplierId, setSupplierId] = useState('')
  const [quotationNumber, setQuotationNumber] = useState(''); const [quotationDate, setQuotationDate] = useState(new Date().toISOString().slice(0, 10))
  const rfq = openRfqs.find(r => r.id === rfqId)
  const [prices, setPrices] = useState<Record<string, string>>({})
  function setPrice(lineId: string, value: string) { setPrices(prev => ({ ...prev, [lineId]: value })) }
  const lines = (rfq?.lines ?? []).map(l => ({
    purchaseRequisitionLineId: l.purchaseRequisitionLineId,
    description: l.purchaseRequisitionLine?.description ?? l.purchaseRequisitionLineId,
    quantity: Number(l.quantity),
    unitPrice: Number(prices[l.purchaseRequisitionLineId] || 0),
  }))
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  function submit() {
    if (!rfqId || !supplierId || !quotationNumber || lines.length === 0 || lines.some(l => l.unitPrice <= 0)) return
    create.mutate({ rfqId, supplierId, quotationNumber, quotationDate, lines }, { onSuccess: onClose })
  }
  return <div className="bg-surface border border-base rounded-xl p-5 space-y-4">
    <div className="flex justify-between"><h4 className="font-semibold text-brand-navy">Record a received quotation</h4><button type="button" onClick={onClose} className="text-muted">Close</button></div>
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="RFQ">
        <select value={rfqId} onChange={e => setRfqId(e.target.value)} className="input">
          <option value="">Select an RFQ…</option>
          {openRfqs.map(r => <option key={r.id} value={r.id}>{r.rfqNumber} — {r.purchaseRequisition?.requisitionNumber}</option>)}
        </select>
      </Field>
      <Field label="Supplier">
        <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="input">
          <option value="">Select a supplier…</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Quotation reference"><input value={quotationNumber} onChange={e => setQuotationNumber(e.target.value)} className="input" placeholder="Supplier's own reference number" /></Field>
      <Field label="Quotation date"><input type="date" value={quotationDate} onChange={e => setQuotationDate(e.target.value)} className="input" /></Field>
    </div>
    {rfq && <div className="space-y-2">
      <p className="text-xs text-muted">Enter the unit price this supplier quoted for each line:</p>
      {lines.length === 0 && <p className="text-sm text-muted">This RFQ has no lines.</p>}
      {lines.map(l => <div key={l.purchaseRequisitionLineId} className="flex items-center gap-3 border border-base rounded-lg p-2">
        <span className="flex-1 text-sm">{l.description} <span className="text-muted text-xs">× {l.quantity}</span></span>
        <input type="number" min="0" step="0.01" value={prices[l.purchaseRequisitionLineId] ?? ''} onChange={e => setPrice(l.purchaseRequisitionLineId, e.target.value)} className="input w-32" placeholder="Unit price" />
      </div>)}
      {lines.length > 0 && <p className="text-sm text-right text-muted">Subtotal <strong className="text-brand-navy">{money(subtotal)}</strong></p>}
    </div>}
    <button type="button" onClick={submit} disabled={create.isPending} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60">{create.isPending ? 'Saving…' : 'Save quotation'}</button>
    {create.error && <p className="text-sm text-brand-coral">{errorMessage(create.error, 'Could not save quotation.')}</p>}
  </div>
}

// ── PURCHASE ORDERS ── (rebuilt: the draft imported useCreatePurchaseOrder but never called it)

function PurchaseOrders() {
  const { data = [], isLoading } = usePurchaseOrders(); const approve = useApprovePurchaseOrder(); const send = useSendPurchaseOrder(); const cancel = useCancelPurchaseOrder(); const [show, setShow] = useState(false)
  return <section className="space-y-4">
    <Header title="Purchase orders" action={<PermissionGuard permission="procurement.managePurchaseOrders"><button type="button" onClick={() => setShow(true)} className="button-primary"><Plus className="w-4 h-4" /> New PO</button></PermissionGuard>} />
    {show && <PurchaseOrderForm onClose={() => setShow(false)} />}
    <DataTable headers={['PO', 'Supplier', 'Status', 'Total', 'Actions']}>
      {isLoading ? <tr><td colSpan={5}><Loading /></td></tr> : data.map((r: PurchaseOrderRow) => <tr key={r.id} className="border-b border-base">
        <td className="px-4 py-3 font-medium">{r.poNumber}</td>
        <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
        <td className="px-4 py-3">{humanize(r.status)}</td>
        <td className="px-4 py-3 text-right">{money(r.total)}</td>
        <td className="px-4 py-3 text-right">
          {(r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL') && <Action onClick={() => approve.mutate({ id: r.id })} label="Approve">Approve</Action>}
          {r.status === 'APPROVED' && <Action onClick={() => send.mutate({ id: r.id })} label="Send">Send</Action>}
          {!['FULLY_RECEIVED', 'CLOSED', 'CANCELLED'].includes(r.status) && <Action onClick={() => cancel.mutate({ id: r.id })} label="Cancel">Cancel</Action>}
        </td>
      </tr>)}
    </DataTable>
  </section>
}

function PurchaseOrderForm({ onClose }: { onClose: () => void }) {
  const { data: requisitions = [] } = useRequisitions(); const { data: quotations = [] } = useQuotations()
  const create = useCreatePurchaseOrder()
  const approved = requisitions.filter(r => r.status === 'APPROVED')
  const [prId, setPrId] = useState(''); const [quotationId, setQuotationId] = useState(''); const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  // Only quotations already SELECTED for this requisition's RFQ chain are orderable — matches procurementService.createPurchaseOrder's check.
  const selectableQuotations = quotations.filter(q => q.status === 'SELECTED')
  function submit() {
    if (!prId || !quotationId) return
    const quotation = selectableQuotations.find(q => q.id === quotationId)
    if (!quotation) return
    create.mutate({ purchaseRequisitionId: prId, supplierId: quotation.supplierId, quotationId, expectedDeliveryDate: expectedDeliveryDate || undefined }, { onSuccess: onClose })
  }
  return <div className="bg-surface border border-base rounded-xl p-5 space-y-4">
    <div className="flex justify-between"><h4 className="font-semibold text-brand-navy">New purchase order</h4><button type="button" onClick={onClose} className="text-muted">Close</button></div>
    <p className="text-xs text-muted">Emergency/sole-source POs with manually-entered lines are not supported from this form yet — only ordering against a selected quotation.</p>
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="Approved requisition">
        <select value={prId} onChange={e => setPrId(e.target.value)} className="input">
          <option value="">Select a requisition…</option>
          {approved.map(r => <option key={r.id} value={r.id}>{r.requisitionNumber} — {r.purpose}</option>)}
        </select>
      </Field>
      <Field label="Selected quotation">
        <select value={quotationId} onChange={e => setQuotationId(e.target.value)} className="input">
          <option value="">Select a quotation…</option>
          {selectableQuotations.map(q => <option key={q.id} value={q.id}>{q.quotationNumber} — {q.supplier?.name} ({money(q.total)})</option>)}
        </select>
      </Field>
      <Field label="Expected delivery date"><input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} className="input" /></Field>
    </div>
    <button type="button" onClick={submit} disabled={create.isPending || !prId || !quotationId} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60">{create.isPending ? 'Creating…' : 'Create PO'}</button>
    {create.error && <p className="text-sm text-brand-coral">{errorMessage(create.error, 'Could not create purchase order.')}</p>}
  </div>
}

// ── GOODS RECEIPTS ── (rebuilt: the draft always sent lines:[], which CreateGoodsReceiptSchema always rejects)

function GoodsReceipts() {
  const { data = [], isLoading } = useGoodsReceipts(); const complete = useCompleteGoodsReceipt(); const [show, setShow] = useState(false)
  return <section className="space-y-4">
    <Header title="Goods receipts" action={<PermissionGuard permission="procurement.receiveGoods"><button type="button" onClick={() => setShow(true)} className="button-primary"><Truck className="w-4 h-4" /> New receipt</button></PermissionGuard>} />
    {show && <GoodsReceiptForm onClose={() => setShow(false)} />}
    <DataTable headers={['Receipt', 'PO', 'Status', 'Actions']}>
      {isLoading ? <tr><td colSpan={4}><Loading /></td></tr> : data.map(r => <tr key={r.id} className="border-b border-base">
        <td className="px-4 py-3 font-medium">{r.receiptNumber}</td>
        <td className="px-4 py-3">{r.purchaseOrder?.poNumber ?? '—'}</td>
        <td className="px-4 py-3">{humanize(r.status)}</td>
        <td className="px-4 py-3 text-right">{r.status !== 'COMPLETED' && <Action onClick={() => complete.mutate({ id: r.id })} label="Complete">Complete</Action>}</td>
      </tr>)}
    </DataTable>
  </section>
}

function GoodsReceiptForm({ onClose }: { onClose: () => void }) {
  const { data: orders = [] } = usePurchaseOrders()
  const create = useCreateGoodsReceipt()
  const receivable = orders.filter(o => ['SENT', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(o.status))
  const [poId, setPoId] = useState(''); const [supplierRef, setSupplierRef] = useState('')
  const po = receivable.find(o => o.id === poId)
  const [accepted, setAccepted] = useState<Record<string, string>>({}); const [rejected, setRejected] = useState<Record<string, string>>({})
  const outstandingLines = (po?.lines ?? []).filter(l => Number(l.quantityOrdered) - Number(l.quantityReceived) - Number(l.quantityCancelled) > 0)
  function submit() {
    if (!poId) return
    const lines = outstandingLines
      .map(l => ({ purchaseOrderLineId: l.id, quantityAccepted: Number(accepted[l.id] || 0), quantityRejected: Number(rejected[l.id] || 0) }))
      .filter(l => l.quantityAccepted > 0 || l.quantityRejected > 0)
      .map(l => ({ ...l, quantityReceived: l.quantityAccepted + l.quantityRejected }))
    if (lines.length === 0) return
    create.mutate({ purchaseOrderId: poId, supplierDeliveryReference: supplierRef || undefined, lines }, { onSuccess: onClose })
  }
  return <div className="bg-surface border border-base rounded-xl p-5 space-y-4">
    <div className="flex justify-between"><h4 className="font-semibold text-brand-navy">New goods receipt</h4><button type="button" onClick={onClose} className="text-muted">Close</button></div>
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="Purchase order">
        <select value={poId} onChange={e => setPoId(e.target.value)} className="input">
          <option value="">Select a PO…</option>
          {receivable.map(o => <option key={o.id} value={o.id}>{o.poNumber} — {o.supplier?.name}</option>)}
        </select>
      </Field>
      <Field label="Supplier delivery reference (optional)"><input value={supplierRef} onChange={e => setSupplierRef(e.target.value)} className="input" /></Field>
    </div>
    {po && <div className="space-y-2">
      <p className="text-xs text-muted">Enter what was received against each outstanding line:</p>
      {outstandingLines.length === 0 && <p className="text-sm text-muted">Nothing outstanding on this PO.</p>}
      {outstandingLines.map(l => {
        const outstanding = Number(l.quantityOrdered) - Number(l.quantityReceived) - Number(l.quantityCancelled)
        return <div key={l.id} className="border border-base rounded-lg p-2 space-y-1.5">
          <p className="text-sm">{l.description} <span className="text-muted text-xs">outstanding: {outstanding}</span></p>
          <div className="flex gap-2">
            <Field label="Accepted"><input type="number" min="0" max={outstanding} value={accepted[l.id] ?? ''} onChange={e => setAccepted(prev => ({ ...prev, [l.id]: e.target.value }))} className="input" /></Field>
            <Field label="Rejected"><input type="number" min="0" value={rejected[l.id] ?? ''} onChange={e => setRejected(prev => ({ ...prev, [l.id]: e.target.value }))} className="input" /></Field>
          </div>
        </div>
      })}
    </div>}
    <button type="button" onClick={submit} disabled={create.isPending || !poId} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60">{create.isPending ? 'Saving…' : 'Record receipt'}</button>
    {create.error && <p className="text-sm text-brand-coral">{errorMessage(create.error, 'Could not record goods receipt.')}</p>}
  </div>
}

// ── BUDGET WINDOWS ──

function BudgetWindows({ academicYear }: { academicYear: string }) {
  const { data = [], isLoading } = useBudgetWindows(); const create = useCreateBudgetWindow(); const open = useOpenBudgetWindow(); const close = useCloseBudgetWindow()
  const [name, setName] = useState(''); const [type, setType] = useState('TERM'); const [term, setTerm] = useState('1'); const [start, setStart] = useState(''); const [end, setEnd] = useState('')
  function make() { if (!name || !start || !end || !academicYear) return; create.mutate({ academicYear, term: Number(term), type, name, submissionStart: start, submissionEnd: end }, { onSuccess: () => setName('') }) }
  return <section className="space-y-4">
    <Header title="Budget windows" action={<PermissionGuard permission="finance.manageBudgetWindows"><div className="flex gap-2 flex-wrap">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Window name" className="input w-40" />
      <select value={type} onChange={e => setType(e.target.value)} className="input w-32"><option>ANNUAL</option><option>TERM</option><option>QUARTERLY</option><option>MONTHLY</option><option>CUSTOM</option></select>
      <input type="date" value={start} onChange={e => setStart(e.target.value)} className="input" />
      <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="input" />
      <button type="button" onClick={make} disabled={create.isPending} className="button-primary"><Plus className="w-4 h-4" /> Add</button>
    </div></PermissionGuard>} />
    <DataTable headers={['Window', 'Period', 'Dates', 'Status', 'Actions']}>
      {isLoading ? <tr><td colSpan={5}><Loading /></td></tr> : data.map(w => <tr key={w.id} className="border-b border-base">
        <td className="px-4 py-3 font-medium">{w.name}</td>
        <td className="px-4 py-3">{w.academicYear} · {w.term ? `Term ${w.term}` : 'Annual'}</td>
        <td className="px-4 py-3 text-xs">{new Date(w.submissionStart).toLocaleDateString()} – {new Date(w.submissionEnd).toLocaleDateString()}</td>
        <td className="px-4 py-3">{humanize(w.status)}</td>
        <td className="px-4 py-3 text-right">
          {w.status === 'DRAFT' && <Action onClick={() => open.mutate({ id: w.id })} label="Open">Open</Action>}
          {w.status === 'OPEN' && <Action onClick={() => close.mutate({ id: w.id })} label="Close">Close</Action>}
        </td>
      </tr>)}
    </DataTable>
  </section>
}

// ── SUPPLIERS ── (useCreateSupplier existed with no button calling it — the Quotation form could select a supplier but never create one)

function Suppliers() {
  const { data = [], isLoading } = useSuppliers()
  const create = useCreateSupplier()
  const [show, setShow] = useState(false)
  const [supplierCode, setSupplierCode] = useState(''); const [name, setName] = useState(''); const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState(''); const [email, setEmail] = useState('')
  function submit() {
    if (!supplierCode.trim() || !name.trim()) return
    create.mutate({ supplierCode: supplierCode.trim(), name: name.trim(), contactPerson: contactPerson.trim() || undefined, phone: phone.trim() || undefined, email: email.trim() || undefined },
      { onSuccess: () => { setSupplierCode(''); setName(''); setContactPerson(''); setPhone(''); setEmail(''); setShow(false) } })
  }
  return <section className="space-y-4">
    <Header title="Suppliers" subtitle="Bank details aren't shown here — access to them is separately restricted."
      action={<PermissionGuard permission="procurement.manageSuppliers"><button type="button" onClick={() => setShow(v => !v)} className="button-primary"><Plus className="w-4 h-4" /> New supplier</button></PermissionGuard>} />
    {show && <div className="bg-surface border border-base rounded-xl p-4 grid sm:grid-cols-2 gap-3">
      <Field label="Supplier code"><input value={supplierCode} onChange={e => setSupplierCode(e.target.value)} className="input" placeholder="SUP-001" /></Field>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} className="input" /></Field>
      <Field label="Contact person"><input value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="input" /></Field>
      <Field label="Phone"><input value={phone} onChange={e => setPhone(e.target.value)} className="input" /></Field>
      <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" /></Field>
      <div className="sm:col-span-2"><button type="button" onClick={submit} disabled={create.isPending} className="min-h-11 px-4 rounded-lg bg-brand-navy text-white text-sm font-semibold">{create.isPending ? 'Creating…' : 'Create'}</button>
        {create.error && <p className="text-sm text-brand-coral mt-2">{errorMessage(create.error, 'Could not create supplier.')}</p>}</div>
    </div>}
    {isLoading ? <Loading /> : <DataTable headers={['Code', 'Name', 'Contact', 'Phone', 'Email']}>{data.map((s: Supplier) => <tr key={s.id} className="border-b border-base last:border-0">
      <td className="px-4 py-3 font-mono text-xs">{s.supplierCode}</td><td className="px-4 py-3 font-medium">{s.name}</td>
      <td className="px-4 py-3">{s.contactPerson ?? '—'}</td><td className="px-4 py-3">{s.phone ?? '—'}</td><td className="px-4 py-3">{s.email ?? '—'}</td>
    </tr>)}</DataTable>}
  </section>
}

// ── SHARED ──

function Header({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) { return <div className="flex items-center justify-between gap-3 flex-wrap"><div><h3 className="font-heading font-semibold text-brand-navy">{title}</h3>{subtitle && <p className="text-sm text-muted">{subtitle}</p>}</div>{action}</div> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-xs text-muted block mb-1">{label}</span>{children}</label> }
function Action({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) { return <button type="button" title={label} aria-label={label} onClick={onClick} className="inline-flex items-center justify-center gap-1 min-h-10 px-2.5 rounded-lg border border-base text-xs font-medium hover:bg-page">{children}</button> }
// [PRODUCTION FIX] Was `bg-surface border border-base rounded-xl overflow-hidden`
// — this workspace now renders inside ModuleSurface's own bg-surface/
// border panel (finances/page.tsx), so the extra card here was a
// redundant second layer nested inside the first.
function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-base bg-page">{headers.map(h => <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide text-muted font-semibold">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div></div> }
function Loading() { return <div className="p-8 text-center text-muted"><Loader2 className="inline w-5 h-5 animate-spin" /></div> }
