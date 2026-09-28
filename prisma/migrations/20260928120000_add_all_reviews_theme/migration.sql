-- CreateTable
CREATE TABLE "AllReviewsTheme" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "css" TEXT NOT NULL,
    "styleBlocks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllReviewsTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AllReviewsTheme_shopId_key" ON "AllReviewsTheme"("shopId");

-- AddForeignKey
ALTER TABLE "AllReviewsTheme" ADD CONSTRAINT "AllReviewsTheme_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
