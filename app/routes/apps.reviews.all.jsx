// app/routes/apps.reviews.all.jsx — Shopify app proxy target
// (/apps/reviews/all on the storefront domain). Reached via the widget's
// {{moreUrl}} "Show all N reviews" link (see reviewWidget/renderTemplate.ts)
// once a product has more than apps.reviews.jsx's INLINE_REVIEW_LIMIT.
//
// Unlike apps.reviews.jsx (which returns { html, css } JSON for the
// storefront script to inject), this route returns a complete, self-styled
// HTML document — it's meant to be navigated to directly, not fetched. It
// reuses the shop's widget CSS classes (jm-reviews__item-*) so an item here
// looks like an item in the inline widget, and adds its own page chrome
// (search box, numbered pagination) on top.
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_WIDGET_CSS } from "../reviewWidget/defaults.server";

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

function pageHtml({ productTitle, reviews, page, totalPages, total, q, base }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reviews${productTitle ? ` — ${escapeHtml(productTitle)}` : ""}</title>
<style>
  body { margin: 0; padding: 24px 16px 48px; font-family: -apple-system, system-ui, sans-serif; color: #1a1a1a; background: #fff; }
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
  ${DEFAULT_WIDGET_CSS}
</style>
</head>
<body>
<div class="jm-reviews-page jm-reviews">
  <h1 class="jm-reviews-page__heading">Reviews${productTitle ? ` — ${escapeHtml(productTitle)}` : ""}</h1>
  <p class="jm-reviews-page__count">${total} ${total === 1 ? "review" : "reviews"}${q ? ` matching “${escapeHtml(q)}”` : ""}</p>
  <form class="jm-reviews-page__search" method="get">
    <input type="hidden" name="productId" value="${escapeHtml(base.searchParams.get("productId") || "")}">
    <input type="search" name="q" value="${escapeHtml(q || "")}" placeholder="Search reviews...">
    <button type="submit">Search</button>
  </form>
  ${reviews.length ? reviews.map(reviewItemHtml).join("") : `<p class="jm-reviews-page__empty">No reviews found.</p>`}
  ${paginationHtml(base, page, totalPages)}
</div>
</body>
</html>`;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);

  const html = (body) => new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });

  if (!session || !productId) {
    return html(pageHtml({ productTitle: null, reviews: [], page: 1, totalPages: 1, total: 0, q, base: url }));
  }

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  const product = shop
    ? await db.product.findUnique({
        where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
      })
    : null;

  if (!product) {
    return html(pageHtml({ productTitle: null, reviews: [], page: 1, totalPages: 1, total: 0, q, base: url }));
  }

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

  return html(pageHtml({ productTitle: product.title ?? null, reviews, page: currentPage, totalPages, total, q, base: url }));
};
