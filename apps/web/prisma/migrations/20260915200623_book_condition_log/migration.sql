-- CreateTable
CREATE TABLE "book_condition_logs" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "recordedByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_condition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "book_condition_logs_bookId_idx" ON "book_condition_logs"("bookId");

-- AddForeignKey
ALTER TABLE "book_condition_logs" ADD CONSTRAINT "book_condition_logs_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
