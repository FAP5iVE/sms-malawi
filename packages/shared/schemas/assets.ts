/*
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/schemas/assets.ts
 * [R-PHASE]: R20 — Assets & Inventory Management
 * [PURPOSE]: Request-body validation for the new assets domain
 *   (Asset / AssetAssignment / AssetRequest — prisma/schema.prisma, same
 *   phase). Follows the Create<Model>Schema/Update<Model>Schema pairing
 *   established in packages/shared/schemas/library.ts.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (AssetCategory/AssetCondition/
 *   AssetStatus/AssetAssigneeType/AssetRequestStatus enums — same phase,
 *   string literals below matched exactly)
 */
import { z } from 'zod'

export const AssetCategoryEnum = z.enum([
  'FURNITURE', 'IT_EQUIPMENT', 'LAB_EQUIPMENT', 'SPORTS_EQUIPMENT',
  'KITCHEN_EQUIPMENT', 'VEHICLE', 'MAINTENANCE_TOOL', 'OTHER',
])

export const AssetConditionEnum = z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'])

export const CreateAssetSchema = z.object({
  name:            z.string().min(1),
  category:        AssetCategoryEnum,
  description:     z.string().optional(),
  serialNumber:    z.string().optional(),
  quantity:        z.number().int().positive().default(1),
  condition:       AssetConditionEnum.default('GOOD'),
  location:        z.string().optional(),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  acquisitionCost: z.number().nonnegative().optional(),
  supplier:        z.string().optional(),
  warrantyExpiry:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:           z.string().optional(),
})

export const UpdateAssetSchema = CreateAssetSchema.partial()

// Only the fields a status-change action needs — separate from
// UpdateAssetSchema so the route can tell "editing details" apart from
// "changing status", which have different permission requirements
// (assets.manageRegister vs assets.markLost/.markDamaged/.dispose).
export const MarkAssetConditionSchema = z.object({
  condition: AssetConditionEnum,
  notes:     z.string().optional(),
})

export const DisposeAssetSchema = z.object({
  notes: z.string().optional(),
})

export const AllocateAssetSchema = z.object({
  assignedToType:   z.enum(['STAFF', 'DEPARTMENT', 'ROOM']),
  staffId:          z.string().min(1).optional(),
  departmentOrRoom: z.string().min(1).optional(),
  quantity:         z.number().int().positive().default(1),
  notes:            z.string().optional(),
}).refine(
  (data) => {
    if (data.assignedToType === 'STAFF') return !!data.staffId
    return !!data.departmentOrRoom
  },
  {
    message: 'staffId is required when assignedToType is STAFF; departmentOrRoom is required for DEPARTMENT or ROOM',
    path: ['assignedToType'],
  }
)

export const ReturnAssetSchema = z.object({
  conditionOnReturn: AssetConditionEnum.optional(),
  notes:             z.string().optional(),
})

export const CreateAssetRequestSchema = z.object({
  title:         z.string().min(1),
  category:      AssetCategoryEnum,
  quantity:      z.number().int().positive().default(1),
  department:    z.string().optional(),
  justification: z.string().optional(),
})

export const ReviewAssetRequestSchema = z.object({
  reviewNotes:      z.string().optional(),
  fulfilledAssetId: z.string().optional(), // set on approve to link an existing/newly-created Asset immediately; omit to approve without fulfilling yet
})

export const RejectAssetRequestSchema = z.object({
  reviewNotes: z.string().optional(),
})

// R21 — procurement advances (see prisma/schema.prisma's AssetAdvance for
// scope notes: tracking only, not GL-posting)
export const RecordAdvanceSchema = z.object({
  supplier: z.string().min(1),
  amount:   z.number().positive(),
  notes:    z.string().optional(),
})

export const ReconcileAdvanceSchema = z.object({
  notes: z.string().optional(),
})

export const WriteOffAdvanceSchema = z.object({
  notes: z.string().optional(),
})

export type CreateAssetInput         = z.infer<typeof CreateAssetSchema>
export type UpdateAssetInput         = z.infer<typeof UpdateAssetSchema>
export type MarkAssetConditionInput  = z.infer<typeof MarkAssetConditionSchema>
export type DisposeAssetInput        = z.infer<typeof DisposeAssetSchema>
export type AllocateAssetInput       = z.infer<typeof AllocateAssetSchema>
export type ReturnAssetInput         = z.infer<typeof ReturnAssetSchema>
export type CreateAssetRequestInput  = z.infer<typeof CreateAssetRequestSchema>
export type ReviewAssetRequestInput  = z.infer<typeof ReviewAssetRequestSchema>
export type RejectAssetRequestInput  = z.infer<typeof RejectAssetRequestSchema>
export type RecordAdvanceInput       = z.infer<typeof RecordAdvanceSchema>
export type ReconcileAdvanceInput    = z.infer<typeof ReconcileAdvanceSchema>
export type WriteOffAdvanceInput     = z.infer<typeof WriteOffAdvanceSchema>