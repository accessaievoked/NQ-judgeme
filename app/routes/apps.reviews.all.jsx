// app/routes/apps.reviews.all.jsx — Shopify app proxy target
// (/apps/reviews/all on the storefront domain). Reached two ways: (1) the
// widget's {{moreUrl}} "Show all N reviews" link (see
// reviewWidget/renderTemplate.ts) once a product has more than
// apps.reviews.jsx's INLINE_REVIEW_LIMIT — a full page navigation, `?fragment`
// absent; (2) the "All reviews" theme block
// (extensions/theme-widget/blocks/all-reviews.liquid +
// assets/jm-reviews-all.js), embedded directly on a themed page — fetched
// with `?fragment=1`, same fragment convention as apps.reviews.write.jsx,
// so pagination/search happen via fetch instead of leaving the themed page.
//
// Either way this reuses the shop's widget CSS classes (jm-reviews__item-*)
// so an item here looks like an item in the inline widget, and its own page
// chrome (heading, search box, numbered pagination, per-row wrapper) is its
// own template+styling, per-shop on AllReviewsTheme — edited from
// /app/review-all-editor (visual) or /app/review-all-style (raw HTML/CSS),
// exact same split as WidgetTheme/app.widget-editor.jsx/app.widget-style.jsx.
// No row = the hardcoded defaults in reviewWidget/allReviewsTemplate.ts.
// `inner` (the DB-derived, page-specific markup, rendered through the
// shop's saved template) is the one thing cached — shared by both the
// full-document and fragment response shapes below, which are otherwise
// both cheap to (re)compute from it on every request.
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_WIDGET_CSS } from "../reviewWidget/defaults.server";
import { compileStyleBlocks } from "../reviewWidget/styleBlocks.server";
import { getCachedAllPage, setCachedAllPage } from "../reviewWidget/reviewCache.server";
import { DEFAULT_ALL_REVIEWS_HTML, renderAllReviewsHtml, escapeHtml } from "../reviewWidget/allReviewsTemplate";
import { ALL_REVIEWS_DEFAULT_CSS } from "../reviewWidget/sections/allReviewsPage";
import { compileAllReviewsStyleBlocks } from "../reviewWidget/allReviewsStyleCompiler";

const PAGE_SIZE = 10;
const PAGE_WINDOW = 2; // numbered links shown on each side of the current page

function pageUrl(base, page) {
  const url = new URL(base);
  if (page <= 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function paginationHtml(base, page, totalPages) {
  if (totalPages <= 1) return "";
  const items = [];
  const add = (p, label, current) =>
    items.push(
      current
        ? `<span class="jm-reviews-page__num is-current">${label}</span>`
        : `<a class="jm-reviews-page__num" href="${escapeHtml(pageUrl(base, p))}">${label}</a>`,
    );

  if (page > 1) items.push(`<a class="jm-reviews-page__nav" href="${escapeHtml(pageUrl(base, page - 1))}">‹ Prev</a>`);

  const start = Math.max(1, page - PAGE_WINDOW);
  const end = Math.min(totalPages, page + PAGE_WINDOW);
  if (start > 1) {
    add(1, "1", page === 1);
    if (start > 2) items.push(`<span class="jm-reviews-page__ellipsis">…</span>`);
  }
  for (let p = start; p <= end; p++) add(p, String(p), p === page);
  if (end < totalPages) {
    if (end < totalPages - 1) items.push(`<span class="jm-reviews-page__ellipsis">…</span>`);
    add(totalPages, String(totalPages), page === totalPages);
  }

  if (page < totalPages) items.push(`<a class="jm-reviews-page__nav" href="${escapeHtml(pageUrl(base, page + 1))}">Next ›</a>`);

  return `<nav class="jm-reviews-page__pagination" aria-label="Reviews pages">${items.join("")}</nav>`;
}

function pageHtml({ productTitle, inner, css }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reviews${productTitle ? ` — ${escapeHtml(productTitle)}` : ""}</title>
<style>
  body { margin: 0; padding: 24px 16px 48px; font-family: -apple-system, system-ui, sans-serif; color: #1a1a1a; background: #fff; }
  ${css}
</style>
</head>
<body>
${inner}
</body>
</html>`;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const fragment = url.searchParams.get("fragment") === "1";

  const respond = (inner, css, productTitle) => {
    const body = fragment ? `<style>${css}</style>${inner}` : pageHtml({ productTitle, inner, css });
    return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  };

  const empty = () =>
    respond(
      renderAllReviewsHtml(DEFAULT_ALL_REVIEWS_HTML, { productTitle: null, reviews: [], count: 0, q, productId, paginationHtml: "" }),
      [ALL_REVIEWS_DEFAULT_CSS, DEFAULT_WIDGET_CSS].join("\n"),
      null,
    );

  if (!session || !productId) return empty();

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  const product = shop
    ? await db.product.findUnique({
        where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
      })
    : null;

  if (!product) return empty();

  // Same shape as apps.reviews.jsx's own theme-or-defaults fallback — a
  // shop that's never customized its widget/all-reviews page has no
  // WidgetTheme/AllReviewsTheme row at all. Both fetched unconditionally
  // (even on an `inner` cache hit below) since both the fragment and
  // full-document response shapes need them fresh, unlike the old
  // single-shape cache this route used to have.
  const [widgetTheme, allReviewsTheme] = await Promise.all([
    db.widgetTheme.findUnique({ where: { shopId: shop.id } }),
    db.allReviewsTheme.findUnique({ where: { shopId: shop.id } }),
  ]);
  const widgetCss = [widgetTheme?.css ?? DEFAULT_WIDGET_CSS, compileStyleBlocks(widgetTheme?.styleBlocks)].filter(Boolean).join("\n\n");
  const allReviewsHtml = allReviewsTheme?.html ?? DEFAULT_ALL_REVIEWS_HTML;
  const chromeCss = [allReviewsTheme?.css ?? ALL_REVIEWS_DEFAULT_CSS, compileAllReviewsStyleBlocks(allReviewsTheme?.styleBlocks)].filter(Boolean).join("\n\n");
  const css = [chromeCss, widgetCss].join("\n\n");

  // Cached as the built inner markup (page-specific, DB-derived, already
  // rendered through the shop's saved all-reviews template) — see
  // reviewCache.server.ts for why the cache key includes both `page` and
  // `q`, and how a new/changed review clears every page+query combo for
  // this product at once rather than trying to track which ones it
  // actually affects. Saving a new AllReviewsTheme (app.review-all-editor.jsx/
  // app.review-all-style.jsx) invalidates the whole shop's cache the same
  // way saving a WidgetTheme does, so a template change can't serve a page
  // rendered through the old template.
  const cachedInner = await getCachedAllPage(shop.id, product.id, page, q);
  if (cachedInner) return respond(cachedInner, css, product.title ?? null);

  const where = {
    productId: product.id,
    status: "PUBLISHED",
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const total = await db.review.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const reviews = await db.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
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

  const inner = renderAllReviewsHtml(allReviewsHtml, {
    productTitle: product.title ?? null,
    reviews,
    count: total,
    q,
    productId,
    paginationHtml: paginationHtml(url, currentPage, totalPages),
  });
  await setCachedAllPage(shop.id, product.id, page, q, inner);
  return respond(inner, css, product.title ?? null);
};
