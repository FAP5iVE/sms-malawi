-- Digital signature images (phase 17). Additive only: one new table, nothing existing is touched.
-- Rollback: DROP TABLE "user_signatures";

-- CreateTable
CREATE TABLE "user_signatures" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_signatures_uid_key" ON "user_signatures"("uid");
