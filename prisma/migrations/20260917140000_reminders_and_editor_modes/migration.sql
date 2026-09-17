-- AlterEnum
ALTER TYPE "ReviewRequestStatus" ADD VALUE 'REMINDED_3';

-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "reminderDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "WidgetTheme" ADD COLUMN     "styleBlocks" JSONB;

-- AlterTable
ALTER TABLE "EmailTemplate" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'normal';

-- AlterTable
ALTER TABLE "ReviewRequest" ADD COLUMN     "thirdReminderAt" TIMESTAMP(3),
ADD COLUMN     "pendingReminderJobId" TEXT;

-- AlterTable: reviews submitted directly from the storefront's inline
-- {{rateWidget}} control have no ReviewRequest behind them.
ALTER TABLE "Review" ALTER COLUMN "reviewRequestId" DROP NOT NULL;
