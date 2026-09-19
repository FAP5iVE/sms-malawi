/*
 * [CHANGE TYPE]: REWRITE (R22) — supersedes the partner's draft at this
 *   same path, which had 5 schemas covering a fraction of the domain
 *   (no RFQ/Quotation/PO/GoodsReceipt/BudgetWindow/Location coverage at
 *   all, and PurchaseRequisitionSchema's classification enum didn't match
 *   the corrected ProcurementLineClassification in the schema).
 * [FILE]: packages/shared/schemas/assetsInventoryProcurement.ts
 * [PURPOSE]: Request-body validation for the R22 domain — Department/
 *   Building/Room, BudgetWindow, PurchaseRequisition through GoodsReceipt,
 *   InventoryItem/Transaction, Stocktake/Variance, LegacyMapping.
 *   Follows the Create<Model>Schema/Update<Model>Schema pairing established
 *   in packages/shared/schemas/library.ts and assets.ts.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (R22 models/enums — string
 *   literals below matched exactly)
 */
import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}/) // accepts date or datetime-ish strings; services do new Date(...)

// ─── LOCATIONS ────────────────────────────────────────────

export const CreateDepartmentSchema = z.object({
  code: z.string().min(1), name: z.string().min(1), description: z.string().optional(),
})
export const UpdateDepartmentSchema = z.object({ name: z.string().min(1).optional(), description: z.string().optional(), isActive: z.boolean().optional() })

export const CreateBuildingSchema = z.object({
  code: z.string().min(1), name: z.string().min(1), description: z.string().optional(),
})
export const UpdateBuildingSchema = z.object({ name: z.string().min(1).optional(), description: z.string().optional(), isActive: z.boolean().optional() })

export const CreateRoomSchema = z.object({
  buildingId: z.string().min(1), code: z.string().min(1), name: z.string().min(1), roomType: z.string().min(1),
  departmentId: z.string().optional(), custodianUid: z.string().optional(),
})
export const UpdateRoomSchema = z.object({
  name: z.string().min(1).optional(), roomType: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(), custodianUid: z.string().nullable().optional(), isActive: z.boolean().optional(),
})

// ─── LEGACY MAPPING ───────────────────────────────────────

export const ReviewMappingSchema = z.object({ notes: z.string().optional() })

// ─── BUDGET WINDOWS ───────────────────────────────────────

export const CreateBudgetWindowSchema = z.object({
  name: z.string().min(1), academicYear: z.string().min(1), term: z.number().int().optional(),
  type: z.enum(['ANNUAL', 'TERM', 'QUARTERLY', 'MONTHLY', 'CUSTOM']),
  submissionStart: dateStr, submissionEnd: dateStr,
  reviewStart: dateStr.optional(), reviewEnd: dateStr.optional(),
  approvalStart: dateStr.optional(), approvalEnd: dateStr.optional(),
  departmentId: z.string().optional(),
})
export const SetBudgetWindowStatusSchema = z.object({ status: z.enum(['DRAFT', 'OPEN', 'REVIEW', 'CLOSED', 'ARCHIVED']) })

// ─── PROCUREMENT ──────────────────────────────────────────

export const ProcurementLineClassificationEnum = z.enum(['FIXED_ASSET', 'INVENTORY', 'CONSUMABLE', 'SERVICE', 'DIRECT_EXPENSE'])
export const AssetCategoryEnum = z.enum(['FURNITURE', 'IT_EQUIPMENT', 'LAB_EQUIPMENT', 'SPORTS_EQUIPMENT', 'KITCHEN_EQUIPMENT', 'VEHICLE', 'MAINTENANCE_TOOL', 'OTHER'])

const RequisitionLineSchema = z.object({
  description: z.string().min(1),
  category: z.string().optional(),
  classification: ProcurementLineClassificationEnum,
  assetCategory: AssetCategoryEnum.optional(),
  quantity: z.number().positive(),
  unitOfMeasure: z.string().min(1),
  estimatedUnitCost: z.number().nonnegative(),
  preferredSpecification: z.string().optional(),
  notes: z.string().optional(),
  budgetId: z.string().optional(),
}).refine(l => l.classification !== 'FIXED_ASSET' || !!l.assetCategory, { message: 'assetCategory is required for FIXED_ASSET lines', path: ['assetCategory'] })

export const CreatePurchaseRequisitionSchema = z.object({
  departmentId: z.string().min(1),
  budgetWindowId: z.string().optional(),
  budgetId: z.string().optional(),
  purpose: z.string().min(1),
  justification: z.string().optional(),
  isEmergency: z.boolean().default(false),
  lines: z.array(RequisitionLineSchema).min(1),
})

export const ReviewRequisitionSchema = z.object({ reviewNote: z.string().optional() })
export const RejectRequisitionSchema = z.object({ reviewNote: z.string().min(1) })

export const CreateSupplierSchema = z.object({
  supplierCode: z.string().min(1), name: z.string().min(1), contactPerson: z.string().optional(),
  phone: z.string().optional(), email: z.string().email().optional(), address: z.string().optional(),
  taxNumber: z.string().optional(), bankDetails: z.string().optional(),
})

export const CreateRFQSchema = z.object({
  purchaseRequisitionId: z.string().min(1), lineIds: z.array(z.string().min(1)).min(1), responseDeadline: dateStr.optional(),
})

export const RecordQuotationSchema = z.object({
  rfqId: z.string().min(1), supplierId: z.string().min(1), quotationNumber: z.string().min(1),
  quotationDate: dateStr, validUntil: dateStr.optional(), currency: z.string().optional(), documentKey: z.string().optional(),
  lines: z.array(z.object({
    purchaseRequisitionLineId: z.string().min(1), description: z.string().min(1),
    quantity: z.number().positive(), unitPrice: z.number().nonnegative(), tax: z.number().nonnegative().optional(), notes: z.string().optional(),
  })).min(1),
})

export const CreatePurchaseOrderSchema = z.object({
  purchaseRequisitionId: z.string().min(1), supplierId: z.string().min(1),
  quotationId: z.string().optional(), expectedDeliveryDate: dateStr.optional(),
  lines: z.array(z.object({
    purchaseRequisitionLineId: z.string().optional(), description: z.string().min(1),
    classification: ProcurementLineClassificationEnum, assetCategory: AssetCategoryEnum.optional(),
    quantityOrdered: z.number().positive(), unitOfMeasure: z.string().min(1),
    unitPrice: z.number().nonnegative(), tax: z.number().nonnegative().optional(),
  })).optional(),
})

export const CreateGoodsReceiptSchema = z.object({
  purchaseOrderId: z.string().min(1), receivedAt: dateStr.optional(),
  supplierDeliveryReference: z.string().optional(), notes: z.string().optional(),
  lines: z.array(z.object({
    purchaseOrderLineId: z.string().min(1), quantityReceived: z.number().positive(),
    quantityAccepted: z.number().nonnegative(), quantityRejected: z.number().nonnegative().optional(),
    condition: z.string().optional(), notes: z.string().optional(),
  })).min(1),
})

// ─── INVENTORY ────────────────────────────────────────────

export const CreateInventoryItemSchema = z.object({
  itemCode: z.string().min(1), name: z.string().min(1), category: z.string().optional(), description: z.string().optional(),
  unitOfMeasure: z.string().min(1), reorderLevel: z.number().nonnegative().optional(), reorderQuantity: z.number().nonnegative().optional(),
})
export const UpdateInventoryItemSchema = z.object({
  name: z.string().min(1).optional(), category: z.string().optional(), description: z.string().optional(),
  reorderLevel: z.number().nonnegative().optional(), reorderQuantity: z.number().nonnegative().optional(), isActive: z.boolean().optional(),
})

export const StockReceiptSchema = z.object({
  inventoryItemId: z.string().min(1), quantity: z.number().positive(),
  destinationRoomId: z.string().optional(), departmentId: z.string().optional(), reason: z.string().optional(),
})
export const StockIssueSchema = z.object({
  inventoryItemId: z.string().min(1), quantity: z.number().positive(),
  sourceRoomId: z.string().optional(), departmentId: z.string().optional(), reason: z.string().optional(),
})
export const StockTransferSchema = z.object({
  inventoryItemId: z.string().min(1), quantity: z.number().positive(),
  sourceRoomId: z.string().min(1), destinationRoomId: z.string().min(1), reason: z.string().optional(),
})
export const StockAdjustSchema = z.object({
  inventoryItemId: z.string().min(1), quantity: z.number().positive(),
  direction: z.enum(['INCREASE', 'DECREASE']), reason: z.string().min(1),
})

// ─── STOCKTAKE ────────────────────────────────────────────

export const CreateStocktakeSchema = z.object({
  academicYear: z.string().min(1), term: z.number().int().optional(),
  departmentId: z.string().optional(), roomId: z.string().optional(), notes: z.string().optional(),
}).refine(s => !!s.departmentId || !!s.roomId, { message: 'A stocktake needs either a department or a room scope', path: ['roomId'] })

export const RecordStocktakeLineSchema = z.object({
  lineId: z.string().min(1), actualQuantity: z.number().nonnegative(),
  condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']).optional(), notes: z.string().optional(),
})

export const ResolveVarianceSchema = z.object({
  resolution: z.enum(['RESOLVED', 'WRITTEN_OFF']), resolutionNote: z.string().optional(),
})
