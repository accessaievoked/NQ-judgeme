-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "autoPublishEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoPublishMinRating" INTEGER NOT NULL DEFAULT 4;
