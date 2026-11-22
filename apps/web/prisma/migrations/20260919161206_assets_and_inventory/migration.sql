/*
  Warnings:

  - A unique constraint covering the columns `[assetTag]` on the table `assets` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[barcodeValue]` on the table `assets` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[qrCodeValue]` on the table `assets` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BudgetWindowType" AS ENUM ('ANNUAL', 'TERM', 'QUARTERLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BudgetWindowStatus" AS ENUM ('DRAFT', 'OPEN', 'REVIEW', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BudgetCommitmentStatus" AS ENUM ('RESERVED', 'COMMITTED', 'CONSUMED', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetClassification" AS ENUM ('FIXED_ASSET', 'CONTROLLED_ITEM');

-- CreateEnum
CREATE TYPE "AssetSourceType" AS ENUM ('PROCUREMENT', 'OPENING_BALANCE', 'DONATION', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcurementSource" AS ENUM ('PROCUREMENT', 'DIRECT');

-- CreateEnum
CREATE TYPE "ProcurementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProcurementLineClassification" AS ENUM ('FIXED_ASSET', 'INVENTORY', 'CONSUMABLE', 'SERVICE', 'DIRECT_EXPENSE');

-- CreateEnum
CREATE TYPE "RFQStatus" AS ENUM ('DRAFT', 'ISSUED', 'RESPONSES_RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'SELECTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED', 'CLOSED', 'CLOSED_WITH_VARIANCE');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'RECEIVED', 'PARTIAL', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('OPENING_BALANCE', 'RECEIPT', 'ISSUE', 'RETURN', 'TRANSFER', 'ADJUSTMENT', 'DAMAGE', 'LOSS', 'DISPOSAL');

-- CreateEnum
CREATE TYPE "StocktakeStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VarianceType" AS ENUM ('SHORTAGE', 'SURPLUS');

-- CreateEnum
CREATE TYPE "VarianceStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "LegacyMappingType" AS ENUM ('DEPARTMENT', 'LOCATION');

-- CreateEnum
CREATE TYPE "LegacyMappingStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED');

-- DropForeignKey
ALTER TABLE "asset_assignments" DROP CONSTRAINT "asset_assignments_assetId_fkey";

-- DropForeignKey
ALTER TABLE "asset_assignments" DROP CONSTRAINT "asset_assignments_staffId_fkey";

-- AlterTable
ALTER TABLE "asset_assignments" ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "roomId" TEXT;

-- AlterTable
ALTER TABLE "asset_requests" ADD COLUMN     "budgetId" TEXT,
ADD COLUMN     "budgetWindowId" TEXT,
ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "assetTag" TEXT,
ADD COLUMN     "barcodeValue" TEXT,
ADD COLUMN     "classification" "AssetClassification",
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "goodsReceiptLineId" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "purchaseRequisitionId" TEXT,
ADD COLUMN     "qrCodeValue" TEXT,
ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "sourceType" "AssetSourceType";

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "budgetWindowId" TEXT,
ADD COLUMN     "departmentId" TEXT;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "goodsReceiptId" TEXT,
ADD COLUMN     "procurementSource" "ProcurementSource",
ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "supplierInvoiceNumber" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedByUid" TEXT;

-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomType" TEXT NOT NULL,
    "departmentId" TEXT,
    "custodianUid" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_windows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER,
    "type" "BudgetWindowType" NOT NULL,
    "status" "BudgetWindowStatus" NOT NULL DEFAULT 'DRAFT',
    "submissionStart" TIMESTAMP(3) NOT NULL,
    "submissionEnd" TIMESTAMP(3) NOT NULL,
    "reviewStart" TIMESTAMP(3),
    "reviewEnd" TIMESTAMP(3),
    "approvalStart" TIMESTAMP(3),
    "approvalEnd" TIMESTAMP(3),
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_commitments" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "budgetWindowId" TEXT,
    "purchaseRequisitionId" TEXT,
    "purchaseOrderId" TEXT,
    "expenseId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "BudgetCommitmentStatus" NOT NULL DEFAULT 'RESERVED',
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requisitions" (
    "id" TEXT NOT NULL,
    "requisitionNumber" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "budgetWindowId" TEXT,
    "budgetId" TEXT,
    "requestedByUid" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "justification" TEXT,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProcurementStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedByUid" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedByUid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByUid" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_requisition_lines" (
    "id" TEXT NOT NULL,
    "purchaseRequisitionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "classification" "ProcurementLineClassification" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "estimatedUnitCost" DECIMAL(12,2) NOT NULL,
    "estimatedTotal" DECIMAL(12,2) NOT NULL,
    "preferredSpecification" TEXT,
    "notes" TEXT,
    "budgetId" TEXT,
    "assetCategory" "AssetCategory",

    CONSTRAINT "purchase_requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "bankDetails" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfqs" (
    "id" TEXT NOT NULL,
    "rfqNumber" TEXT NOT NULL,
    "purchaseRequisitionId" TEXT NOT NULL,
    "status" "RFQStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3),
    "responseDeadline" TIMESTAMP(3),
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_lines" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "purchaseRequisitionLineId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "rfq_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "quotationDate" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'MWK',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'RECEIVED',
    "documentKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_lines" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "purchaseRequisitionLineId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2),
    "total" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "purchaseRequisitionId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quotationId" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3),
    "expectedDeliveryDate" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "approvedByUid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdByUid" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "purchaseRequisitionLineId" TEXT,
    "description" TEXT NOT NULL,
    "classification" "ProcurementLineClassification" NOT NULL,
    "quantityOrdered" DECIMAL(12,2) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2),
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "quantityReceived" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantityCancelled" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "assetCategory" "AssetCategory",

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByUid" TEXT NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
    "supplierDeliveryReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "quantityReceived" DECIMAL(12,2) NOT NULL,
    "quantityAccepted" DECIMAL(12,2) NOT NULL,
    "quantityRejected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "condition" TEXT,
    "notes" TEXT,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "unitOfMeasure" TEXT NOT NULL,
    "reorderLevel" DECIMAL(12,2),
    "reorderQuantity" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "transactionType" "InventoryTransactionType" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "departmentId" TEXT,
    "sourceRoomId" TEXT,
    "destinationRoomId" TEXT,
    "goodsReceiptLineId" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "performedByUid" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktakes" (
    "id" TEXT NOT NULL,
    "stocktakeNumber" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER,
    "departmentId" TEXT,
    "roomId" TEXT,
    "custodianUid" TEXT,
    "status" "StocktakeStatus" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "startedByUid" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedByUid" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocktakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocktake_lines" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "assetId" TEXT,
    "expectedQuantity" DECIMAL(12,2) NOT NULL,
    "actualQuantity" DECIMAL(12,2) NOT NULL,
    "condition" "AssetCondition",
    "notes" TEXT,

    CONSTRAINT "stocktake_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_variances" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "stocktakeLineId" TEXT NOT NULL,
    "varianceQuantity" DECIMAL(12,2) NOT NULL,
    "varianceType" "VarianceType" NOT NULL,
    "status" "VarianceStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "resolvedByUid" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_variances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_mappings" (
    "id" TEXT NOT NULL,
    "mappingType" "LegacyMappingType" NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "legacyValue" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "LegacyMappingStatus" NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,
    "reviewedByUid" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "recordsAffected" INTEGER,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legacy_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_code_key" ON "buildings"("code");

-- CreateIndex
CREATE INDEX "rooms_departmentId_idx" ON "rooms"("departmentId");

-- CreateIndex
CREATE INDEX "rooms_custodianUid_idx" ON "rooms"("custodianUid");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_buildingId_code_key" ON "rooms"("buildingId", "code");

-- CreateIndex
CREATE INDEX "budget_windows_academicYear_term_status_idx" ON "budget_windows"("academicYear", "term", "status");

-- CreateIndex
CREATE INDEX "budget_windows_departmentId_idx" ON "budget_windows"("departmentId");

-- CreateIndex
CREATE INDEX "budget_commitments_budgetId_status_idx" ON "budget_commitments"("budgetId", "status");

-- CreateIndex
CREATE INDEX "budget_commitments_purchaseRequisitionId_idx" ON "budget_commitments"("purchaseRequisitionId");

-- CreateIndex
CREATE INDEX "budget_commitments_purchaseOrderId_idx" ON "budget_commitments"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "budget_commitments_expenseId_idx" ON "budget_commitments"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requisitions_requisitionNumber_key" ON "purchase_requisitions"("requisitionNumber");

-- CreateIndex
CREATE INDEX "purchase_requisitions_departmentId_status_idx" ON "purchase_requisitions"("departmentId", "status");

-- CreateIndex
CREATE INDEX "purchase_requisitions_budgetWindowId_status_idx" ON "purchase_requisitions"("budgetWindowId", "status");

-- CreateIndex
CREATE INDEX "purchase_requisitions_requestedByUid_idx" ON "purchase_requisitions"("requestedByUid");

-- CreateIndex
CREATE INDEX "purchase_requisition_lines_purchaseRequisitionId_idx" ON "purchase_requisition_lines"("purchaseRequisitionId");

-- CreateIndex
CREATE INDEX "purchase_requisition_lines_budgetId_idx" ON "purchase_requisition_lines"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_supplierCode_key" ON "suppliers"("supplierCode");

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_rfqNumber_key" ON "rfqs"("rfqNumber");

-- CreateIndex
CREATE INDEX "rfqs_purchaseRequisitionId_idx" ON "rfqs"("purchaseRequisitionId");

-- CreateIndex
CREATE INDEX "rfqs_status_idx" ON "rfqs"("status");

-- CreateIndex
CREATE INDEX "rfq_lines_rfqId_idx" ON "rfq_lines"("rfqId");

-- CreateIndex
CREATE INDEX "rfq_lines_purchaseRequisitionLineId_idx" ON "rfq_lines"("purchaseRequisitionLineId");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quotationNumber_key" ON "quotations"("quotationNumber");

-- CreateIndex
CREATE INDEX "quotations_rfqId_idx" ON "quotations"("rfqId");

-- CreateIndex
CREATE INDEX "quotations_supplierId_status_idx" ON "quotations"("supplierId", "status");

-- CreateIndex
CREATE INDEX "quotation_lines_quotationId_idx" ON "quotation_lines"("quotationId");

-- CreateIndex
CREATE INDEX "quotation_lines_purchaseRequisitionLineId_idx" ON "quotation_lines"("purchaseRequisitionLineId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_purchaseRequisitionId_idx" ON "purchase_orders"("purchaseRequisitionId");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchaseOrderId_idx" ON "purchase_order_lines"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchaseRequisitionLineId_idx" ON "purchase_order_lines"("purchaseRequisitionLineId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_receiptNumber_key" ON "goods_receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "goods_receipts_receivedAt_idx" ON "goods_receipts"("receivedAt");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_goodsReceiptId_idx" ON "goods_receipt_lines"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchaseOrderLineId_idx" ON "goods_receipt_lines"("purchaseOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_itemCode_key" ON "inventory_items"("itemCode");

-- CreateIndex
CREATE INDEX "inventory_transactions_inventoryItemId_createdAt_idx" ON "inventory_transactions"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_transactions_departmentId_createdAt_idx" ON "inventory_transactions"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_transactions_sourceRoomId_idx" ON "inventory_transactions"("sourceRoomId");

-- CreateIndex
CREATE INDEX "inventory_transactions_destinationRoomId_idx" ON "inventory_transactions"("destinationRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "stocktakes_stocktakeNumber_key" ON "stocktakes"("stocktakeNumber");

-- CreateIndex
CREATE INDEX "stocktakes_departmentId_idx" ON "stocktakes"("departmentId");

-- CreateIndex
CREATE INDEX "stocktakes_roomId_idx" ON "stocktakes"("roomId");

-- CreateIndex
CREATE INDEX "stocktakes_status_idx" ON "stocktakes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stocktakes_academicYear_term_roomId_key" ON "stocktakes"("academicYear", "term", "roomId");

-- CreateIndex
CREATE INDEX "stocktake_lines_stocktakeId_idx" ON "stocktake_lines"("stocktakeId");

-- CreateIndex
CREATE INDEX "stocktake_lines_inventoryItemId_idx" ON "stocktake_lines"("inventoryItemId");

-- CreateIndex
CREATE INDEX "stocktake_lines_assetId_idx" ON "stocktake_lines"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_variances_stocktakeLineId_key" ON "inventory_variances"("stocktakeLineId");

-- CreateIndex
CREATE INDEX "inventory_variances_stocktakeId_status_idx" ON "inventory_variances"("stocktakeId", "status");

-- CreateIndex
CREATE INDEX "legacy_mappings_mappingType_status_idx" ON "legacy_mappings"("mappingType", "status");

-- CreateIndex
CREATE INDEX "legacy_mappings_targetType_targetId_idx" ON "legacy_mappings"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_mappings_mappingType_normalizedValue_key" ON "legacy_mappings"("mappingType", "normalizedValue");

-- CreateIndex
CREATE INDEX "asset_assignments_departmentId_idx" ON "asset_assignments"("departmentId");

-- CreateIndex
CREATE INDEX "asset_assignments_roomId_idx" ON "asset_assignments"("roomId");

-- CreateIndex
CREATE INDEX "asset_requests_departmentId_idx" ON "asset_requests"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_assetTag_key" ON "assets"("assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "assets_barcodeValue_key" ON "assets"("barcodeValue");

-- CreateIndex
CREATE UNIQUE INDEX "assets_qrCodeValue_key" ON "assets"("qrCodeValue");

-- CreateIndex
CREATE INDEX "assets_departmentId_idx" ON "assets"("departmentId");

-- CreateIndex
CREATE INDEX "assets_roomId_idx" ON "assets"("roomId");

-- CreateIndex
CREATE INDEX "budgets_departmentId_idx" ON "budgets"("departmentId");

-- CreateIndex
CREATE INDEX "budgets_budgetWindowId_idx" ON "budgets"("budgetWindowId");

-- CreateIndex
CREATE INDEX "expenses_supplierId_idx" ON "expenses"("supplierId");

-- CreateIndex
CREATE INDEX "expenses_purchaseOrderId_idx" ON "expenses"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "staff_profiles_departmentId_idx" ON "staff_profiles"("departmentId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_budgetWindowId_fkey" FOREIGN KEY ("budgetWindowId") REFERENCES "budget_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "goods_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_budgetWindowId_fkey" FOREIGN KEY ("budgetWindowId") REFERENCES "budget_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_custodianUid_fkey" FOREIGN KEY ("custodianUid") REFERENCES "staff_profiles"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_windows" ADD CONSTRAINT "budget_windows_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_budgetWindowId_fkey" FOREIGN KEY ("budgetWindowId") REFERENCES "budget_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_commitments" ADD CONSTRAINT "budget_commitments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_budgetWindowId_fkey" FOREIGN KEY ("budgetWindowId") REFERENCES "budget_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_lines" ADD CONSTRAINT "rfq_lines_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_lines" ADD CONSTRAINT "rfq_lines_purchaseRequisitionLineId_fkey" FOREIGN KEY ("purchaseRequisitionLineId") REFERENCES "purchase_requisition_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_purchaseRequisitionLineId_fkey" FOREIGN KEY ("purchaseRequisitionLineId") REFERENCES "purchase_requisition_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES "purchase_requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseRequisitionLineId_fkey" FOREIGN KEY ("purchaseRequisitionLineId") REFERENCES "purchase_requisition_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_sourceRoomId_fkey" FOREIGN KEY ("sourceRoomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_destinationRoomId_fkey" FOREIGN KEY ("destinationRoomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "goods_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "stocktakes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_variances" ADD CONSTRAINT "inventory_variances_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "stocktakes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_variances" ADD CONSTRAINT "inventory_variances_stocktakeLineId_fkey" FOREIGN KEY ("stocktakeLineId") REFERENCES "stocktake_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
