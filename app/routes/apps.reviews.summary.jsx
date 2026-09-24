// app/routes/apps.reviews.summary.jsx — Shopify app proxy target
// (/apps/reviews/summary on the storefront domain). Read-only: renders the
// "star rating + review count" badge (RatingSummaryTheme) for a product,
// same shape/caching pattern as apps.reviews.jsx's inline widget but far
// cheaper to compute (no review rows needed, just count + average).
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_RATING_SUMMARY_HTML, DEFAULT_RATING_SUMMARY_FIELDS, compileRatingSummaryTheme, renderRatingSummaryHtml } from "../reviewWidget/ratingSummaryTemplate";
import { getCachedSummary, setCachedSummary } from "../reviewWidget/reviewCache.server";

async function themeFor(shopId) {
  if (!shopId) return compileRatingSummaryTheme(DEFAULT_RATING_SUMMARY_FIELDS);
  const theme = await db.ratingSummaryTheme.findUnique({ where: { shopId } });
  if (!theme) return compileRatingSummaryTheme(DEFAULT_RATING_SUMMARY_FIELDS);
  return { html: theme.html || DEFAULT_RATING_SUMMARY_HTML, css: theme.css, countText: theme.countText };
}

function buildPayload(theme, data) {
  return { html: renderRatingSummaryHtml(theme.html, data, theme.countText), css: theme.css };
}

const EMPTY_DATA = { count: 0, average: null };

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return Response.json(buildPayload(await themeFor(null), EMPTY_DATA));

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return Response.json({ error: "productId is required" }, { status: 400 });

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return Response.json(buildPayload(await themeFor(null), EMPTY_DATA));

  const product = await db.product.findUnique({
    where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
  });
  if (!product) return Response.json(buildPayload(await themeFor(shop.id), EMPTY_DATA));

  const cached = await getCachedSummary(shop.id, product.id);
  if (cached) return Response.json(cached);

  const theme = await themeFor(shop.id);

  const agg = await db.review.aggregate({
    where: { productId: product.id, status: "PUBLISHED" },
    _count: { _all: true },
    _avg: { rating: true },
  });

  const payload = buildPayload(theme, { count: agg._count._all, average: agg._avg.rating });
  await setCachedSummary(shop.id, product.id, payload);
  return Response.json(payload);
};
