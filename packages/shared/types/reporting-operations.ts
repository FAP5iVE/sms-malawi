/** Response types for /reporting/operations/* (procurement pipeline, stocktake variance). */

export type ProcurementStageKey =
  | 'requisitions'
  | 'approved'
  | 'rfq'
  | 'quotations'
  | 'purchaseOrders'
  | 'received'

export interface ApiProcurementStage {
  key: ProcurementStageKey
  label: string
  /** Distinct requisitions (or POs for the last two stages) that reached the stage. */
  count: number
  /** Money value at the stage; null when no value exists for it (e.g. no quotations yet). */
  value: number | null
}

export interface ApiProcurementPipeline {
  windowDays: number
  stages: ApiProcurementStage[]
  /** Open requisitions by current status (where work is sitting right now). */
  requisitionsByStatus: { status: string; count: number }[]
  /** Purchase orders by current status. */
  purchaseOrdersByStatus: { status: string; count: number; value: number }[]
  /** Mean days from submission to approval; null if no approved requisitions. */
  avgApprovalDays: number | null
  /** Mean days from PO order date to first goods receipt; null if none received. */
  avgDeliveryDays: number | null
  generatedAt: string
}

export interface ApiVarianceRoomRow {
  building: string
  room: string
  open: number
  resolved: number
  shortageQty: number
  surplusQty: number
}

export interface ApiVarianceItemRow {
  varianceId: string
  stocktakeNumber: string
  building: string
  room: string
  itemName: string
  varianceType: 'SHORTAGE' | 'SURPLUS'
  quantity: number
  status: string
  reason: string | null
}

export interface ApiStocktakeVariance {
  academicYear: string
  stocktakes: number
  totalVariances: number
  shortageCount: number
  surplusCount: number
  shortageQty: number
  surplusQty: number
  /** OPEN + INVESTIGATING. */
  unresolved: number
  /** RESOLVED + WRITTEN_OFF. */
  resolved: number
  /** Share of lines counted that had a variance; null when no lines. */
  varianceRate: number | null
  byRoom: ApiVarianceRoomRow[]
  /** Unresolved variances first, capped. */
  items: ApiVarianceItemRow[]
  generatedAt: string
}

// ─── Asset register (/reporting/operations/assets) ──────────────────────────

export type AssetFlag =
  | 'damaged'
  | 'under_repair'
  | 'lost'
  | 'warranty_expiring'
  | 'no_location'
  | 'no_custodian'
  | 'no_cost'

export interface ApiAssetFilters {
  category: string | null
  status: string | null
  condition: string | null
  departmentId: string | null
  buildingId: string | null
  roomId: string | null
  custodianUid: string | null
  /** Acquisition date range (inclusive), YYYY-MM-DD. */
  from: string | null
  to: string | null
}

export interface ApiAssetCountRow {
  key: string
  label: string
  /** Register rows. */
  count: number
  /** Units (bulk lines hold several). */
  units: number
}

export interface ApiAssetLocationRow {
  key: string
  label: string
  roomId: string | null
  department: string | null
  assets: number
  units: number
  recordedCost: number
  needsAttention: number
}

export interface ApiAssetCustodianRow {
  key: string
  /** Staff account id for a person; null for a department or room. */
  uid: string | null
  label: string
  kind: 'staff' | 'department' | 'room' | 'room-custodian'
  assets: number
  units: number
}

export interface ApiAssetRecord {
  id: string
  name: string
  assetTag: string | null
  category: string
  status: string
  condition: string
  quantity: number
  location: string
  custodian: string | null
  acquisitionCost: number | null
  warrantyExpiry: string | null
  flags: AssetFlag[]
}

export interface ApiAssetRegisterReport {
  generatedAt: string
  filters: ApiAssetFilters
  totals: {
    /** Register rows matching the filters. */
    assets: number
    units: number
    /** Recorded acquisition cost of rows that are not disposed — the register valuation. */
    recordedCost: number
    /** Non-disposed rows with no acquisition cost recorded (excluded from the valuation). */
    withoutCost: number
    /** Rows with at least one flag that needs someone to act (before the record list is capped). */
    needsAction: number
  }
  byStatus: ApiAssetCountRow[]
  byCondition: ApiAssetCountRow[]
  byCategory: ApiAssetCountRow[]
  attention: Record<AssetFlag, number>
  byLocation: ApiAssetLocationRow[]
  byCustodian: ApiAssetCustodianRow[]
  /** Rows needing attention first; capped. */
  records: ApiAssetRecord[]
  recordsTruncated: boolean
  /** True when the register is larger than the report reads in one pass. */
  rowsCapped: boolean
  requests: { pending: number; outstandingAdvances: number | null }
}

// ─── Stocktakes (/reporting/operations/stocktakes) ──────────────────────────

export interface ApiStocktakeRow {
  id: string
  stocktakeNumber: string
  building: string | null
  room: string | null
  department: string | null
  term: number | null
  status: string
  responsible: string | null
  startedAt: string | null
  completedAt: string | null
  /** Days since the count started (or was created) while it is still incomplete; null once finished. */
  openDays: number | null
  /** Incomplete for longer than the stale threshold. */
  stale: boolean
  lines: number
  expected: number
  counted: number
  /** counted − expected across the lines recorded so far. */
  netVariance: number
  varianceLines: number
  unresolved: number
}

export interface ApiStocktakeCoverage {
  activeRooms: number
  /** Rooms with a completed stocktake in the period. */
  counted: number
  /** Rooms whose stocktake exists but is not yet completed. */
  inProgress: number
  /** Rooms with no stocktake at all in the period. */
  notStarted: number
  /** counted ÷ activeRooms; null when there are no rooms. */
  coverageRate: number | null
  notStartedRooms: { id: string; label: string }[]
}

export interface ApiStocktakeReport {
  generatedAt: string
  academicYear: string
  term: number | null
  departmentId: string | null
  roomId: string | null
  /** Days an uncompleted stocktake may stay open before it is flagged. No due date is recorded, so age is used. */
  staleAfterDays: number
  totals: {
    stocktakes: number
    byStatus: { status: string; count: number }[]
    incomplete: number
    stale: number
    lines: number
    expected: number
    counted: number
    netVariance: number
    varianceLines: number
    varianceRate: number | null
    unresolvedVariances: number
    shortageQty: number
    surplusQty: number
  }
  coverage: ApiStocktakeCoverage
  rows: ApiStocktakeRow[]
}

// ─── Procurement value lifecycle (/reporting/operations/procurement-value) ──

export type ProcurementValueKey = 'requested' | 'approved' | 'ordered' | 'received' | 'expensed' | 'paid'

export interface ApiProcurementValueStage {
  key: ProcurementValueKey
  label: string
  /** What the figure measures, in words. */
  description: string
  count: number
  value: number | null
}

export interface ApiPurchaseOrderRow {
  id: string
  poNumber: string
  supplier: string
  status: string
  expectedDeliveryDate: string | null
  daysLate: number | null
  orderedValue: number
  receivedValue: number
  openValue: number
}

export interface ApiRequisitionValueRow {
  id: string
  requisitionNumber: string
  department: string
  status: string
  ageDays: number | null
  requested: number
  ordered: number
  received: number
  expensed: number
  paid: number
}

export interface ApiProcurementValueReport {
  generatedAt: string
  from: string
  to: string
  departmentId: string | null
  /** Requested → approved → ordered → received → expensed → paid, for requisitions raised in the window. */
  stages: ApiProcurementValueStage[]
  /** Ordered value split into where it is now. ordered = received + released + open. */
  orders: { ordered: number; received: number; released: number; open: number; reconciles: boolean }
  /** All open orders, regardless of window — the same figure as Finance's "Open commitments". */
  openNow: { orders: number; value: number }
  awaitingApproval: {
    requisitions: { count: number; value: number; oldestDays: number | null }
    purchaseOrders: { count: number; value: number }
  }
  expenses: {
    /** Approved expenses linked to the window's purchase orders. */
    approved: number
    paid: number
    /** Approved but not yet paid. */
    payable: number
    /** Recorded but not yet approved. */
    pendingApproval: number
    /** Received value with no approved expense yet (never negative). */
    receivedNotExpensed: number
    /** Approved expense above the value received so far (invoiced ahead of delivery). */
    expensedAheadOfDelivery: number
  }
  delayed: ApiPurchaseOrderRow[]
  partiallyDelivered: ApiPurchaseOrderRow[]
  requisitions: ApiRequisitionValueRow[]
  requisitionsTruncated: boolean
}

// ─── Inventory stock levels (/reporting/operations/inventory) ───────────────

export interface ApiLowStockRow {
  itemId: string
  itemCode: string
  name: string
  category: string | null
  unit: string
  balance: number
  reorderLevel: number
  reorderQuantity: number | null
  /** reorderLevel − balance when positive. */
  shortfall: number
  state: 'negative' | 'out' | 'low'
  receivedInWindow: number
  issuedInWindow: number
  /** Net effect of the window's movements on the total balance. */
  netChangeInWindow: number
  lastMovementAt: string | null
}

export interface ApiStockMovementRow {
  id: string
  at: string
  itemId: string
  itemCode: string
  itemName: string
  type: string
  quantity: number
  /** Effect on the item's total (0 for a transfer). */
  effect: number
  from: string | null
  to: string | null
  department: string | null
  reason: string | null
}

export interface ApiStockReport {
  generatedAt: string
  days: number
  from: string
  to: string
  filters: { category: string | null; departmentId: string | null; roomId: string | null }
  totals: {
    items: number
    belowReorder: number
    outOfStock: number
    negative: number
    /** Items with no reorder level — cannot be assessed. */
    withoutReorderLevel: number
    /** Items with no movement at all. */
    neverStocked: number
  }
  low: ApiLowStockRow[]
  movementsByType: { type: string; count: number; quantity: number }[]
  movementsByDay: { date: string; label: string; inbound: number; outbound: number }[]
  movements: ApiStockMovementRow[]
  movementsTruncated: boolean
}
