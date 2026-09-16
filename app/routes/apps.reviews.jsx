// app/routes/apps.reviews.jsx — Shopify app proxy target (/apps/reviews on
// the storefront domain). Shopify verifies the request signature for us via
// authenticate.public.appProxy, so this is same-origin from the shopper's
// browser and doesn't need CORS or an unverified shop param.
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return Response.json({ count: 0, average: null, reviews: [] });

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return Response.json({ error: "productId is required" }, { status: 400 });

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return Response.json({ count: 0, average: null, reviews: [] });

  const product = await db.product.findUnique({
    where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
  });
  if (!product) return Response.json({ count: 0, average: null, reviews: [] });

  const reviews = await db.review.findMany({
    where: { productId: product.id, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: { rating: true, title: true, body: true, authorName: true, verifiedBuyer: true, createdAt: true },
  });

  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  return Response.json({ count: reviews.length, average, reviews });
};
