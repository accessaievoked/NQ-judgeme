-- CreateTable
CREATE TABLE "ReviewFormTheme" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "css" TEXT NOT NULL,
    "styleBlocks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewFormTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewFormTheme_shopId_key" ON "ReviewFormTheme"("shopId");

-- AddForeignKey
ALTER TABLE "ReviewFormTheme" ADD CONSTRAINT "ReviewFormTheme_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
