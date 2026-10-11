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
