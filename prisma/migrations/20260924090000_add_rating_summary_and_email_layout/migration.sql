-- CreateTable
CREATE TABLE "RatingSummaryTheme" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'blocks',
    "starColor" TEXT NOT NULL DEFAULT '#f5a623',
    "emptyStarColor" TEXT NOT NULL DEFAULT '#d9d9d9',
    "textColor" TEXT NOT NULL DEFAULT '#6b6b6b',
    "fontSize" INTEGER NOT NULL DEFAULT 14,
    "align" TEXT NOT NULL DEFAULT 'left',
    "showCount" BOOLEAN NOT NULL DEFAULT true,
    "countText" TEXT NOT NULL DEFAULT '({{count}} {{reviewWord}})',
    "html" TEXT NOT NULL,
    "css" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatingSummaryTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLayout" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'canvas',
    "subject" TEXT NOT NULL,
    "elements" JSONB NOT NULL,
    "rawHtml" TEXT NOT NULL DEFAULT '',
    "canvasWidth" INTEGER NOT NULL DEFAULT 480,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RatingSummaryTheme_shopId_key" ON "RatingSummaryTheme"("shopId");

-- CreateIndex
CREATE INDEX "EmailLayout_shopId_idx" ON "EmailLayout"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLayout_shopId_triggerType_key" ON "EmailLayout"("shopId", "triggerType");

-- AddForeignKey
ALTER TABLE "RatingSummaryTheme" ADD CONSTRAINT "RatingSummaryTheme_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLayout" ADD CONSTRAINT "EmailLayout_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
