-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "catalogSyncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "catalogSyncedAt" TIMESTAMP(3),
ADD COLUMN     "orderSyncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "orderSyncedAt" TIMESTAMP(3),
ADD COLUMN     "syncError" TEXT;

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN     "payload" JSONB;
