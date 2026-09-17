-- CreateTable
CREATE TABLE "WidgetTheme" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "css" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WidgetTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WidgetTheme_shopId_key" ON "WidgetTheme"("shopId");

-- AddForeignKey
ALTER TABLE "WidgetTheme" ADD CONSTRAINT "WidgetTheme_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
