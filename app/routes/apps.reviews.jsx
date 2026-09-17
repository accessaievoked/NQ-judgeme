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

async function themeFor(shopId) {
  if (!shopId) return { html: DEFAULT_WIDGET_HTML, css: DEFAULT_WIDGET_CSS, styleBlocks: null };
  const theme = await db.widgetTheme.findUnique({ where: { shopId } });
  return theme ?? { html: DEFAULT_WIDGET_HTML, css: DEFAULT_WIDGET_CSS, styleBlocks: null };
}

function respond(theme, data) {
  const css = [theme.css, compileStyleBlocks(theme.styleBlocks)].filter(Boolean).join("\n\n");
  return Response.json({ html: renderWidgetHtml(theme.html, data), css });
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

  const theme = await themeFor(shop.id);

  const product = await db.product.findUnique({
    where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
  });
  if (!product) return respond(theme, EMPTY_DATA);

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

  return respond(theme, { count: reviews.length, average, reviews });
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

  return Response.json({ ok: true, published: autoPublish });
};
