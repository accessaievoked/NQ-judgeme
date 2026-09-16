// app/routes/api.reviews.jsx — public, no Shopify auth. A storefront theme
// fetches this (CORS-open) to render reviews for a product.
import db from "../db.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId"); // numeric Shopify product id, e.g. {{ product.id }}

  if (!shopDomain || !productId) {
    return Response.json({ error: "shop and productId are required" }, { status: 400, headers: CORS_HEADERS });
  }

  const shop = await db.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) {
    return Response.json({ count: 0, average: null, reviews: [] }, { headers: CORS_HEADERS });
  }

  const product = await db.product.findUnique({
    where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
  });
  if (!product) {
    return Response.json({ count: 0, average: null, reviews: [] }, { headers: CORS_HEADERS });
  }

  const reviews = await db.review.findMany({
    where: { productId: product.id, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: { rating: true, title: true, body: true, authorName: true, verifiedBuyer: true, createdAt: true },
  });

  const average = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : null;

  return Response.json(
    { count: reviews.length, average, reviews },
    { headers: CORS_HEADERS },
  );
};
