-- CreateTable
-- [PRODUCTION FIX 2026-07-28] Real gallery storage for the public landing
-- page's "Life at our school" section. See schema.prisma's GalleryPhoto
-- model comment.
CREATE TABLE "gallery_photos" (
    "id" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "caption" TEXT,
    "category" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gallery_photos_fileKey_key" ON "gallery_photos"("fileKey");

-- CreateIndex
CREATE INDEX "gallery_photos_displayOrder_idx" ON "gallery_photos"("displayOrder");
