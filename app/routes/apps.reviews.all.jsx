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
// so an item here looks like an item in the inline widget, and adds its own
// page chrome (search box, numbered pagination) on top. `buildInner` is
// the one thing cached — the DB-derived, page-specific content — and is
// shared by both the full-document and fragment response shapes below,
// which are otherwise both cheap to (re)compute from it on every request.
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_WIDGET_CSS } from "../reviewWidget/defaults.server";
import { compileStyleBlocks } from "../reviewWidget/styleBlocks.server";
import { getCachedAllPage, setCachedAllPage } from "../reviewWidget/reviewCache.server";

const PAGE_SIZE = 10;
const PAGE_WINDOW = 2; // numbered links shown on each side of the current page

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function starsMarkup(rating) {
  const rounded = Math.round(rating);
  let s = "";
  for (let i = 1; i <= 5; i++) s += i <= rounded ? "★" : "☆";
  return s;
}

function authorFor(review) {
  const customerName = review.customer
    ? [review.customer.firstName, review.customer.lastName].filter(Boolean).join(" ")
    : "";
  return review.authorName || customerName || "Anonymous";
}

function initialsFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
}

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

function reviewItemHtml(review) {
  const name = authorFor(review);
  const date = new Date(review.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return `<div class="jm-reviews__item jm-reviews-page__item">
    <div class="jm-reviews-page__item-head">
      <span class="jm-reviews__item-avatar-initials jm-reviews-page__avatar">${escapeHtml(initialsFor(name))}</span>
      <div class="jm-reviews-page__item-meta">
        <div class="jm-reviews__item-author">${escapeHtml(name)}${review.verifiedBuyer ? ` <span class="jm-reviews__item-verified-badge">✓ Verified buyer</span>` : ""}</div>
        <div class="jm-reviews-page__date">${escapeHtml(date)}</div>
      </div>
    </div>
    <div class="jm-reviews__item-stars">${starsMarkup(review.rating)}</div>
    ${review.title ? `<div class="jm-reviews__item-title">${escapeHtml(review.title)}</div>` : ""}
    ${review.body ? `<div class="jm-reviews__item-body">${escapeHtml(review.body)}</div>` : ""}
  </div>`;
}

// Chrome CSS only — page-specific styling shared by both the fragment
// response (jm-reviews-all.js injects it alongside the fragment) and the
// full-document response (pageHtml below wraps it into <head>).
const PAGE_CHROME_CSS = `
  .jm-reviews-page { max-width: 720px; margin: 0 auto; }
  .jm-reviews-page__heading { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
  .jm-reviews-page__count { color: #666; margin: 0 0 20px; }
  .jm-reviews-page__search { display: flex; gap: 8px; margin-bottom: 24px; }
  .jm-reviews-page__search input { flex: 1; padding: 10px 12px; border: 1px solid #ccc; border-radius: 6px; font: inherit; }
  .jm-reviews-page__search button { padding: 10px 16px; border-radius: 6px; border: 0; background: #1a1a1a; color: #fff; font: inherit; cursor: pointer; }
  .jm-reviews-page__item { border-top: 1px solid #eee; padding: 16px 0; }
  .jm-reviews-page__item-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .jm-reviews-page__avatar { width: 32px; height: 32px; font-size: 13px; }
  .jm-reviews-page__date { color: #999; font-size: 12px; }
  .jm-reviews-page__empty { color: #666; padding: 24px 0; }
  .jm-reviews-page__pagination { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 24px; }
  .jm-reviews-page__num, .jm-reviews-page__nav { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 8px; border-radius: 6px; text-decoration: none; color: #1a1a1a; }
  .jm-reviews-page__num:hover, .jm-reviews-page__nav:hover { background: #f4f4f4; }
  .jm-reviews-page__num.is-current { background: #1a1a1a; color: #fff; }
  .jm-reviews-page__ellipsis { padding: 0 4px; color: #999; }
`;

// The DB-derived, page-specific markup — this is the one thing cached (see
// getCachedAllPage/setCachedAllPage below), reused as-is by both the
// fragment response (embedded theme block) and the full-document response
// (direct-link/no-JS fallback).
function buildInner({ productTitle, reviews, page, totalPages, total, q, base }) {
  return `<div class="jm-reviews-page jm-reviews">
  <h1 class="jm-reviews-page__heading">Reviews${productTitle ? ` — ${escapeHtml(productTitle)}` : ""}</h1>
  <p class="jm-reviews-page__count">${total} ${total === 1 ? "review" : "reviews"}${q ? ` matching “${escapeHtml(q)}”` : ""}</p>
  <form class="jm-reviews-page__search" method="get" data-jm-reviews-all-search>
    <input type="hidden" name="productId" value="${escapeHtml(base.searchParams.get("productId") || "")}">
    <input type="search" name="q" value="${escapeHtml(q || "")}" placeholder="Search reviews...">
    <button type="submit">Search</button>
  </form>
  ${reviews.length ? reviews.map(reviewItemHtml).join("") : `<p class="jm-reviews-page__empty">No reviews found.</p>`}
  ${paginationHtml(base, page, totalPages)}
</div>`;
}

function pageHtml({ productTitle, inner, widgetCss }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reviews${productTitle ? ` — ${escapeHtml(productTitle)}` : ""}</title>
<style>
  body { margin: 0; padding: 24px 16px 48px; font-family: -apple-system, system-ui, sans-serif; color: #1a1a1a; background: #fff; }
  ${PAGE_CHROME_CSS}
  ${widgetCss}
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

  const respond = (inner, widgetCss, productTitle) => {
    const body = fragment
      ? `<style>${PAGE_CHROME_CSS}\n${widgetCss}</style>${inner}`
      : pageHtml({ productTitle, inner, widgetCss });
    return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  };

  const empty = () => respond(buildInner({ productTitle: null, reviews: [], page: 1, totalPages: 1, total: 0, q, base: url }), DEFAULT_WIDGET_CSS, null);

  if (!session || !productId) return empty();

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  const product = shop
    ? await db.product.findUnique({
        where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
      })
    : null;

  if (!product) return empty();

  // Same shape as apps.reviews.jsx's own theme-or-defaults fallback — a
  // shop that's never customized its widget has no WidgetTheme row at all.
  // Fetched unconditionally (even on an `inner` cache hit below) since both
  // the fragment and full-document response shapes need it fresh, unlike
  // the old single-shape cache this route used to have.
  const theme = await db.widgetTheme.findUnique({ where: { shopId: shop.id } });
  const widgetCss = [theme?.css ?? DEFAULT_WIDGET_CSS, compileStyleBlocks(theme?.styleBlocks)].filter(Boolean).join("\n\n");

  // Cached as the built inner markup (page-specific, DB-derived) — see
  // reviewCache.server.ts for why the cache key includes both `page` and
  // `q`, and how a new/changed review clears every page+query combo for
  // this product at once rather than trying to track which ones it
  // actually affects.
  const cachedInner = await getCachedAllPage(shop.id, product.id, page, q);
  if (cachedInner) return respond(cachedInner, widgetCss, product.title ?? null);

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

  const inner = buildInner({ productTitle: product.title ?? null, reviews, page: currentPage, totalPages, total, q, base: url });
  await setCachedAllPage(shop.id, product.id, page, q, inner);
  return respond(inner, widgetCss, product.title ?? null);
};
