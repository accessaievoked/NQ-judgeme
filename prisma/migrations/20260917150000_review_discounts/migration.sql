-- CreateEnum
CREATE TYPE "ReviewDiscountStatus" AS ENUM ('PENDING', 'CREATED', 'FAILED');

-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "reviewDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewDiscountPercentage" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "reviewDiscountExpiryDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "ReviewDiscount" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shopifyDiscountId" TEXT,
    "percentageOff" INTEGER NOT NULL,
    "status" "ReviewDiscountStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDiscount_reviewId_key" ON "ReviewDiscount"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewDiscount_code_key" ON "ReviewDiscount"("code");

-- CreateIndex
CREATE INDEX "ReviewDiscount_shopId_idx" ON "ReviewDiscount"("shopId");

-- CreateIndex
CREATE INDEX "ReviewDiscount_shopId_status_idx" ON "ReviewDiscount"("shopId", "status");

-- AddForeignKey
ALTER TABLE "ReviewDiscount" ADD CONSTRAINT "ReviewDiscount_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDiscount" ADD CONSTRAINT "ReviewDiscount_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
