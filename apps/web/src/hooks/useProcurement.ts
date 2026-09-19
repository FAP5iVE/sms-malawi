'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

// [CHANGE TYPE]: FIX (R22) — supersedes the partner's draft, which used
// requisitionNo/poNo/receiptNo (no schema or artefact ever specifies those;
// the field is requisitionNumber/poNumber/receiptNumber everywhere) and had
// no create-quotation mutation at all despite the Quotations tab needing one.

export interface PurchaseRequisitionLine {
  id: string
  description: string
  classification: 'FIXED_ASSET' | 'INVENTORY' | 'CONSUMABLE' | 'SERVICE' | 'DIRECT_EXPENSE'
  assetCategory?: string | null
  quantity: number
  unitOfMeasure: string
  estimatedUnitCost: number
  estimatedTotal?: number
  category?: string | null
  preferredSpecification?: string | null
}
export interface PurchaseRequisition {
  id: string
  requisitionNumber: string
  departmentId: string
  budgetWindowId?: string | null
  budgetId?: string | null
  purpose: string
  justification?: string | null
  isEmergency: boolean
  status: string
  requestedByUid: string
  lines?: PurchaseRequisitionLine[]
}
export interface BudgetWindow {
  id: string
  academicYear: string
  term?: number | null
  type: string
  name: string
  submissionStart: string
  submissionEnd: string
  reviewStart?: string | null
  reviewEnd?: string | null
  approvalStart?: string | null
  approvalEnd?: string | null
  status: string
}
export interface Supplier {
  id: string
  supplierCode: string
  name: string
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
}
export interface RFQLineRow {
  id: string
  purchaseRequisitionLineId: string
  quantity: number
  purchaseRequisitionLine?: { description: string; quantity: number; unitOfMeasure: string } | null
}
export interface RFQRow {
  id: string
  rfqNumber: string
  status: string
  purchaseRequisitionId: string
  purchaseRequisition?: { requisitionNumber: string } | null
  lines?: RFQLineRow[]
}
export interface QuotationRow {
  id: string
  quotationNumber: string
  status: string
  total: number
  currency: string
  supplierId: string
  supplier?: { name: string } | null
  rfq?: { rfqNumber: string } | null
  lines?: Array<{
    id: string
    purchaseRequisitionLineId: string
    description: string
    quantity: number
    unitPrice: number
  }>
}
export interface PurchaseOrderLineRow {
  id: string
  description: string
  classification: string
  quantityOrdered: number
  quantityReceived: number
  quantityCancelled: number
  unitPrice: number
}
export interface PurchaseOrderRow {
  id: string
  poNumber: string
  status: string
  total: number
  supplierId: string
  purchaseRequisitionId: string
  supplier?: { name: string } | null
  purchaseRequisition?: { requisitionNumber: string } | null
  lines?: PurchaseOrderLineRow[]
}
export interface GoodsReceiptRow {
  id: string
  receiptNumber: string
  status: string
  purchaseOrder?: { poNumber: string } | null
}

const keys = {
  all: () => ['procurement'] as const,
  requisitions: () => ['procurement', 'requisitions'] as const,
  suppliers: () => ['procurement', 'suppliers'] as const,
  rfqs: () => ['procurement', 'rfqs'] as const,
  quotations: () => ['procurement', 'quotations'] as const,
  orders: () => ['procurement', 'orders'] as const,
  receipts: () => ['procurement', 'receipts'] as const,
  windows: () => ['procurement', 'budget-windows'] as const,
}

function useList<T>(path: string, key: readonly unknown[]) {
  return useQuery({ queryKey: key, queryFn: () => apiFetch<T[]>(path) })
}
export const useRequisitions = () =>
  useList<PurchaseRequisition>('/procurement/requisitions', keys.requisitions())
export const useSuppliers = () => useList<Supplier>('/procurement/suppliers', keys.suppliers())
export const useRFQs = (purchaseRequisitionId?: string) =>
  useList<RFQRow>(
    `/procurement/rfqs${purchaseRequisitionId ? `?purchaseRequisitionId=${encodeURIComponent(purchaseRequisitionId)}` : ''}`,
    [...keys.rfqs(), purchaseRequisitionId]
  )
export const useQuotations = (rfqId?: string) =>
  useList<QuotationRow>(
    `/procurement/quotations${rfqId ? `?rfqId=${encodeURIComponent(rfqId)}` : ''}`,
    [...keys.quotations(), rfqId]
  )
export const usePurchaseOrders = () =>
  useList<PurchaseOrderRow>('/procurement/purchase-orders', keys.orders())
export const useGoodsReceipts = (purchaseOrderId?: string) =>
  useList<GoodsReceiptRow>(
    `/procurement/goods-receipts${purchaseOrderId ? `?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}` : ''}`,
    [...keys.receipts(), purchaseOrderId]
  )
export const useBudgetWindows = () =>
  useList<BudgetWindow>('/finances/budget-windows', keys.windows())

function useMutationHelper(path: string, method: string, key: readonly unknown[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: unknown) =>
      apiFetch(path, {
        method,
        body: method === 'POST' || method === 'PATCH' ? JSON.stringify(data ?? {}) : undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
}

function useActionMutation(basePath: string, action: string, key: readonly unknown[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: unknown }) =>
      apiFetch(`${basePath}/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useCreateRequisition() {
  return useMutationHelper('/procurement/requisitions', 'POST', keys.requisitions())
}
export function useSubmitRequisition() {
  return useActionMutation('/procurement/requisitions', 'submit', keys.requisitions())
}
export function useApproveRequisition() {
  return useActionMutation('/procurement/requisitions', 'approve', keys.requisitions())
}
export function useReturnRequisition() {
  return useActionMutation('/procurement/requisitions', 'return', keys.requisitions())
}
export function useRejectRequisition() {
  return useActionMutation('/procurement/requisitions', 'reject', keys.requisitions())
}
export function useCancelRequisition() {
  return useActionMutation('/procurement/requisitions', 'cancel', keys.requisitions())
}

export function useCreateSupplier() {
  return useMutationHelper('/procurement/suppliers', 'POST', keys.suppliers())
}

export function useCreateRFQ() {
  return useMutationHelper('/procurement/rfqs', 'POST', keys.rfqs())
}
export function useCloseRFQ() {
  return useActionMutation('/procurement/rfqs', 'close', keys.rfqs())
}

// Was entirely missing — the Quotations tab had select/reject but no way to
// actually record a quotation a supplier sent back.
export function useCreateQuotation() {
  return useMutationHelper('/procurement/quotations', 'POST', keys.quotations())
}
export function useSelectQuotation() {
  return useActionMutation('/procurement/quotations', 'select', keys.quotations())
}
export function useRejectQuotation() {
  return useActionMutation('/procurement/quotations', 'reject', keys.quotations())
}

export function useCreatePurchaseOrder() {
  return useMutationHelper('/procurement/purchase-orders', 'POST', keys.orders())
}
export function useApprovePurchaseOrder() {
  return useActionMutation('/procurement/purchase-orders', 'approve', keys.orders())
}
export function useSendPurchaseOrder() {
  return useActionMutation('/procurement/purchase-orders', 'send', keys.orders())
}
export function useCancelPurchaseOrder() {
  return useActionMutation('/procurement/purchase-orders', 'cancel', keys.orders())
}

export function useCreateGoodsReceipt() {
  return useMutationHelper('/procurement/goods-receipts', 'POST', keys.receipts())
}
export function useCompleteGoodsReceipt() {
  return useActionMutation('/procurement/goods-receipts', 'complete', keys.receipts())
}

export function useCreateBudgetWindow() {
  return useMutationHelper('/finances/budget-windows', 'POST', keys.windows())
}
export function useOpenBudgetWindow() {
  return useActionMutation('/finances/budget-windows', 'open', keys.windows())
}
export function useCloseBudgetWindow() {
  return useActionMutation('/finances/budget-windows', 'close', keys.windows())
}
