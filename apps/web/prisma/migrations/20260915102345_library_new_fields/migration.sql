-- AlterTable
ALTER TABLE "books" ADD COLUMN     "shelf" TEXT;

-- AlterTable
ALTER TABLE "resource_recommendations" ADD COLUMN     "requesterClass" TEXT,
ADD COLUMN     "requesterName" TEXT,
ADD COLUMN     "requesterRole" TEXT;
