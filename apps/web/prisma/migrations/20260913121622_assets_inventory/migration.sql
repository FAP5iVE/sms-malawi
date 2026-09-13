-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('FURNITURE', 'IT_EQUIPMENT', 'LAB_EQUIPMENT', 'SPORTS_EQUIPMENT', 'KITCHEN_EQUIPMENT', 'VEHICLE', 'MAINTENANCE_TOOL', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_STORE', 'ALLOCATED', 'UNDER_REPAIR', 'DISPOSED', 'LOST');

-- CreateEnum
CREATE TYPE "AssetAssigneeType" AS ENUM ('STAFF', 'DEPARTMENT', 'ROOM');

-- CreateEnum
CREATE TYPE "AssetAssignmentStatus" AS ENUM ('ACTIVE', 'RETURNED');

-- CreateEnum
CREATE TYPE "AssetRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "AssetAdvanceStatus" AS ENUM ('PENDING', 'RECONCILED', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "description" TEXT,
    "serialNumber" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_STORE',
    "location" TEXT,
    "acquisitionDate" TIMESTAMP(3),
    "acquisitionCost" DECIMAL(12,2),
    "supplier" TEXT,
    "warrantyExpiry" TIMESTAMP(3),
    "photoKey" TEXT,
    "notes" TEXT,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_assignments" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assignedToType" "AssetAssigneeType" NOT NULL,
    "staffId" TEXT,
    "departmentOrRoom" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "assignedByUid" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "status" "AssetAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "conditionOnReturn" "AssetCondition",
    "notes" TEXT,

    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_requests" (
    "id" TEXT NOT NULL,
    "requestedByUid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "department" TEXT,
    "justification" TEXT,
    "status" "AssetRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUid" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "fulfilledAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_advances" (
    "id" TEXT NOT NULL,
    "assetRequestId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "advancedByUid" TEXT NOT NULL,
    "advancedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "AssetAdvanceStatus" NOT NULL DEFAULT 'PENDING',
    "reconciledByUid" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_advances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_serialNumber_key" ON "assets"("serialNumber");

-- CreateIndex
CREATE INDEX "assets_category_idx" ON "assets"("category");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_name_idx" ON "assets"("name");

-- CreateIndex
CREATE INDEX "asset_assignments_assetId_idx" ON "asset_assignments"("assetId");

-- CreateIndex
CREATE INDEX "asset_assignments_staffId_idx" ON "asset_assignments"("staffId");

-- CreateIndex
CREATE INDEX "asset_assignments_status_idx" ON "asset_assignments"("status");

-- CreateIndex
CREATE INDEX "asset_requests_status_idx" ON "asset_requests"("status");

-- CreateIndex
CREATE INDEX "asset_requests_requestedByUid_idx" ON "asset_requests"("requestedByUid");

-- CreateIndex
CREATE INDEX "asset_advances_assetRequestId_idx" ON "asset_advances"("assetRequestId");

-- CreateIndex
CREATE INDEX "asset_advances_status_idx" ON "asset_advances"("status");

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_requests" ADD CONSTRAINT "asset_requests_fulfilledAssetId_fkey" FOREIGN KEY ("fulfilledAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_advances" ADD CONSTRAINT "asset_advances_assetRequestId_fkey" FOREIGN KEY ("assetRequestId") REFERENCES "asset_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
