// app/routes/apps.reviews.jsx — Shopify app proxy target (/apps/reviews on
// the storefront domain). Shopify verifies the request signature for us via
// authenticate.public.appProxy, so this is same-origin from the shopper's
// browser and doesn't need CORS or an unverified shop param.
//
// GET renders the widget's markup server-side from the shop's WidgetTheme
// (or the hardcoded defaults) so the storefront script only has to inject
// { html, css } as-is — see reviewWidget/render.server.ts for the template
// syntax merchants edit in /app/widget-style.
//
// POST is the {{rateWidget}} inline "click a star, submit, no page nav"
// control's target — creates a Review directly (no email/token flow). It
// can't identify the shopper as a specific Shopify customer (that needs an
// Admin API round-trip we don't do inline here), so these reviews are always
// anonymous/typed-name, same as an unlinked authorName typed on the /r/:token
// form, just without a ReviewRequest behind them.
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_WIDGET_HTML, DEFAULT_WIDGET_CSS } from "../reviewWidget/defaults.server";
import { renderWidgetHtml } from "../reviewWidget/render.server";
import { compileStyleBlocks } from "../reviewWidget/styleBlocks.server";
import { getCachedWidget, setCachedWidget, invalidateReviewCache } from "../reviewWidget/reviewCache.server";

async function themeFor(shopId) {
  if (!shopId) return { html: DEFAULT_WIDGET_HTML, css: DEFAULT_WIDGET_CSS, styleBlocks: null };
  const theme = await db.widgetTheme.findUnique({ where: { shopId } });
  return theme ?? { html: DEFAULT_WIDGET_HTML, css: DEFAULT_WIDGET_CSS, styleBlocks: null };
}

// Only the first page's worth of reviews render inline in the widget; the
// rest are reachable via the {{moreUrl}} <!--MORE--> block (the "Show more
// button" section — see sections/moreLink.ts), which links to the full,
// paginated /apps/reviews/all page (see that route). Mandatory, not
// optional: renderWidgetHtml only ever omits the whole <!--MORE--> block
// when moreUrl is unset (i.e. there genuinely aren't more reviews than fit
// inline) — see render.server.ts's <!--MORE--> handling.
const INLINE_REVIEW_LIMIT = 5;

// A shop can point "Show more" at its own themed Shopify Page (built from
// the "All reviews" block — extensions/theme-widget/blocks/all-reviews.liquid
// — see app.settings.jsx's "All reviews page" section) instead of the
// built-in bare app-proxy page. Either way the product still has to be
// identified somehow: the built-in page reads productId from its own route
// param already; a merchant's own Page has no such thing, so it's always
// appended as a query param, joined with "&" if the configured URL already
// has one (e.g. "/pages/reviews?ref=footer").
function buildMoreUrl(allReviewsPageUrl, productId) {
  const base = allReviewsPageUrl?.trim() || "/apps/reviews/all";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}productId=${encodeURIComponent(productId)}`;
}

function buildPayload(theme, data) {
  const css = [theme.css, compileStyleBlocks(theme.styleBlocks)].filter(Boolean).join("\n\n");
  return { html: renderWidgetHtml(theme.html, data), css };
}

function respond(theme, data) {
  return Response.json(buildPayload(theme, data));
}

const EMPTY_DATA = { count: 0, average: null, reviews: [] };

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return respond(await themeFor(null), EMPTY_DATA);

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return Response.json({ error: "productId is required" }, { status: 400 });

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return respond(await themeFor(null), EMPTY_DATA);

  const product = await db.product.findUnique({
    where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
  });
  if (!product) return respond(await themeFor(shop.id), EMPTY_DATA);

  // Cache key covers shop + product only — theme edits already invalidate
  // implicitly next TTL cycle (5 min, see reviewCache.server.ts), and a
  // merchant tweaking styling isn't the hot path this cache is for. A new
  // review or a moderation status change DOES need to show up right away,
  // so those explicitly invalidate (see this route's action, r.$token.jsx,
  // apps.reviews.write.jsx, and app.reviews.jsx's admin status change).
  const cached = await getCachedWidget(shop.id, product.id);
  if (cached) return Response.json(cached);

  const [theme, settings] = await Promise.all([
    themeFor(shop.id),
    db.shopSettings.findUnique({ where: { shopId: shop.id }, select: { allReviewsPageUrl: true } }),
  ]);

  const reviews = await db.review.findMany({
    where: { productId: product.id, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: {
      rating: true,
      title: true,
      body: true,
      authorName: true,
      verifiedBuyer: true,
      createdAt: true,
      customer: { select: { firstName: true, lastName: true } },
    },
  });

  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;
  const moreUrl = reviews.length > INLINE_REVIEW_LIMIT ? buildMoreUrl(settings?.allReviewsPageUrl, productId) : null;

  const payload = buildPayload(theme, {
    count: reviews.length,
    average,
    reviews: reviews.slice(0, INLINE_REVIEW_LIMIT),
    moreUrl,
    productId,
  });
  await setCachedWidget(shop.id, product.id, payload);
  return Response.json(payload);
};

export const action = async ({ request }) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const { session } = await authenticate.public.appProxy(request);
  if (!session) return Response.json({ ok: false, error: "Not verified" }, { status: 401 });

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return Response.json({ ok: false, error: "productId is required" }, { status: 400 });

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return Response.json({ ok: false, error: "Shop not found" }, { status: 404 });

  const product = await db.product.findUnique({
    where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
  });
  if (!product) return Response.json({ ok: false, error: "Product not found" }, { status: 404 });

  const formData = await request.formData();
  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ ok: false, error: "Invalid rating" }, { status: 400 });
  }
  const title = String(formData.get("title") || "").trim().slice(0, 200) || null;
  const body = String(formData.get("body") || "").trim().slice(0, 5000) || null;
  const authorName = String(formData.get("authorName") || "").trim().slice(0, 100) || null;

  const settings = await db.shopSettings.findUnique({
    where: { shopId: shop.id },
    select: { autoPublishEnabled: true, autoPublishMinRating: true },
  });
  const autoPublish = Boolean(settings?.autoPublishEnabled) && rating >= (settings?.autoPublishMinRating ?? 4);

  await db.review.create({
    data: {
      shopId: shop.id,
      productId: product.id,
      rating,
      title,
      body,
      authorName,
      verifiedBuyer: false,
      status: autoPublish ? "PUBLISHED" : "PENDING",
    },
  });

  // Only matters if it actually landed PUBLISHED — a PENDING review isn't in
  // the cached published list yet, so there's nothing stale to clear until
  // an admin publishes it later (see app.reviews.jsx's status-change action).
  if (autoPublish) await invalidateReviewCache(shop.id, product.id);

  return Response.json({ ok: true, published: autoPublish });
};
