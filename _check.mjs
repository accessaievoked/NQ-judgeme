import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const shop = await db.shop.findFirst({ where: { domain: "testing-dev-store-gkoyekcr.myshopify.com" } });
console.log("shop:", shop?.id);
if (shop) {
  const product = await db.product.findUnique({ where: { shopId_shopifyId: { shopId: shop.id, shopifyId: "gid://shopify/Product/8564446855353" } } });
  console.log("product:", product);
  const theme = await db.ratingSummaryTheme.findUnique({ where: { shopId: shop.id } });
  console.log("ratingSummaryTheme:", theme);
  if (product) {
    const agg = await db.review.aggregate({ where: { productId: product.id, status: "PUBLISHED" }, _count: { _all: true }, _avg: { rating: true } });
    console.log("review agg:", agg);
  }
}
await db.$disconnect();
