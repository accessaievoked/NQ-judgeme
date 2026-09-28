// Turns a merchant's raw HTML template for the paginated/searchable "all
// reviews" page (routes/apps.reviews.all.jsx) plus that page's data into the
// final markup the route serves — the all-reviews counterpart to
// renderTemplate.ts's renderWidgetHtml and reviewFormTemplate.ts's
// renderReviewFormHtml. No .server suffix on purpose: the storefront
// renderer and the all-reviews builder's client-side preview
// (app.review-all-editor.jsx) both need it.
//
// Same "just enough templating" philosophy as the other two:
//
//   <!--ITEM--> ... {{stars}} {{title}} {{body}} {{author}} {{avatar}} {{verified}} {{date}} ... <!--/ITEM-->
//   <!--EMPTY--> ... <!--/EMPTY-->
//
// Everything outside those marker blocks may use {{heading}}, {{count}},
// {{reviewWord}}, {{searchQuerySuffix}}, {{searchQuery}}, {{productId}}, and
// {{pagination}}. <!--EMPTY--> renders when there are no reviews to show
// (either the product has none, or none match the current search). Item
// markup intentionally reuses the exact jm-reviews__item-* class names the
// inline widget's <!--ITEM--> block uses (see renderTemplate.ts) so a
// review here looks like a review there and is styled by the SAME saved
// WidgetTheme CSS automatically — only this page's own chrome (heading,
// count, search box, the per-row wrapper/avatar/date, pagination) is
// customized from AllReviewsTheme/app.review-all-editor.jsx.
export type AllReviewsItem = {
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string | null;
  verifiedBuyer?: boolean;
  customer?: { firstName: string | null; lastName: string | null } | null;
  createdAt: string | Date;
  images?: string[];
};

export type AllReviewsData = {
  productTitle: string | null;
  reviews: AllReviewsItem[];
  count: number;
  q: string;
  productId: string | null;
  /** Pre-rendered pagination nav (or "" for a single page) — an opaque
   * fragment substituted as-is, same as renderTemplate.ts's {{rateWidget}},
   * since its numbered links depend on the current request's URL. Its
   * fixed class names (.jm-reviews-page__pagination etc.) are still
   * click-to-select/stylable in the visual editor either way. */
  paginationHtml: string;
};

export function escapeHtml(str: string | null | undefined): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function starsMarkup(rating: number): string {
  const rounded = Math.round(rating);
  let s = "";
  for (let i = 1; i <= 5; i++) s += i <= rounded ? "★" : "☆";
  return s;
}

function authorFor(review: AllReviewsItem): string {
  const customerName = review.customer
    ? [review.customer.firstName, review.customer.lastName].filter(Boolean).join(" ")
    : "";
  return review.authorName || customerName || "Anonymous";
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0].toUpperCase());
  return initials.join("") || "?";
}

function avatarMarkup(review: AllReviewsItem): string {
  return `<span class="jm-reviews__item-avatar-initials jm-reviews-page__avatar">${escapeHtml(initialsFor(authorFor(review)))}</span>`;
}

function verifiedMarkup(review: AllReviewsItem): string {
  return review.verifiedBuyer ? ` <span class="jm-reviews__item-verified-badge">✓ Verified buyer</span>` : "";
}

// Same jm-reviews__item-image* classes/markup renderTemplate.ts's
// imagesMarkup produces for the inline widget — intentional, so a photo
// looks identical in both places and is already styled by whatever's saved
// on WidgetTheme (see this file's header comment).
function imagesMarkup(review: AllReviewsItem): string {
  if (!review.images?.length) return "";
  const imgs = review.images
    .map((url) => `<img class="jm-reviews__item-image" src="${escapeHtml(url)}" alt="" loading="lazy">`)
    .join("");
  return `<div class="jm-reviews__item-images">${imgs}</div>`;
}

export function formatReviewDate(createdAt: string | Date): string {
  return new Date(createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function extractBlock(html: string, tag: string): { content: string; withoutMarkers: (keep: boolean, replacement: string) => string } {
  const re = new RegExp(`<!--${tag}-->([\\s\\S]*?)<!--\\/${tag}-->`);
  const match = html.match(re);
  return {
    content: match ? match[1] : "",
    withoutMarkers: (keep, replacement) => html.replace(re, keep ? replacement : ""),
  };
}

function renderItem(template: string, review: AllReviewsItem): string {
  return template
    .replaceAll("{{stars}}", starsMarkup(review.rating))
    .replaceAll("{{title}}", review.title ? escapeHtml(review.title) : "")
    .replaceAll("{{body}}", review.body ? escapeHtml(review.body) : "")
    .replaceAll("{{author}}", escapeHtml(authorFor(review)))
    .replaceAll("{{avatar}}", avatarMarkup(review))
    .replaceAll("{{verified}}", verifiedMarkup(review))
    .replaceAll("{{images}}", imagesMarkup(review))
    .replaceAll("{{date}}", escapeHtml(formatReviewDate(review.createdAt)));
}

export function renderAllReviewsHtml(template: string, data: AllReviewsData): string {
  const empty = extractBlock(template, "EMPTY");
  let out = empty.withoutMarkers(data.reviews.length === 0, empty.content);

  const item = extractBlock(out, "ITEM");
  const itemsHtml = data.reviews.map((r) => renderItem(item.content, r)).join("");
  out = item.withoutMarkers(data.reviews.length > 0, itemsHtml);

  const heading = `Reviews${data.productTitle ? ` — ${escapeHtml(data.productTitle)}` : ""}`;
  const searchQuerySuffix = data.q ? ` matching “${escapeHtml(data.q)}”` : "";

  return out
    .replaceAll("{{heading}}", heading)
    .replaceAll("{{count}}", String(data.count))
    .replaceAll("{{reviewWord}}", data.count === 1 ? "review" : "reviews")
    .replaceAll("{{searchQuerySuffix}}", searchQuerySuffix)
    .replaceAll("{{searchQuery}}", escapeHtml(data.q))
    .replaceAll("{{productId}}", escapeHtml(data.productId ?? ""))
    .replaceAll("{{pagination}}", data.paginationHtml || "");
}

export const DEFAULT_ALL_REVIEWS_HTML = `<div class="jm-reviews-page jm-reviews">
  <h1 class="jm-reviews-page__heading">{{heading}}</h1>
  <p class="jm-reviews-page__count">{{count}} {{reviewWord}}{{searchQuerySuffix}}</p>
  <form class="jm-reviews-page__search" method="get" data-jm-reviews-all-search>
    <input type="hidden" name="productId" value="{{productId}}">
    <input type="search" name="q" value="{{searchQuery}}" class="jm-reviews-page__search-input" placeholder="Search reviews...">
    <button type="submit" class="jm-reviews-page__search-button">Search</button>
  </form>
  <!--EMPTY--><p class="jm-reviews-page__empty">No reviews found.</p><!--/EMPTY-->
  <!--ITEM--><div class="jm-reviews__item jm-reviews-page__item">
    <div class="jm-reviews-page__item-head">
      {{avatar}}
      <div class="jm-reviews-page__item-meta">
        <div class="jm-reviews__item-author">{{author}}{{verified}}</div>
        <div class="jm-reviews-page__date">{{date}}</div>
      </div>
    </div>
    <div class="jm-reviews__item-stars">{{stars}}</div>
    <div class="jm-reviews__item-title">{{title}}</div>
    <div class="jm-reviews__item-body">{{body}}</div>
    {{images}}
  </div><!--/ITEM-->
  {{pagination}}
</div>`;
