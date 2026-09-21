// Turns a merchant's raw HTML/CSS template plus review data into the final
// markup the storefront widget injects as-is. No .server suffix on purpose:
// the storefront renderer (render.server.ts re-exports this) and the visual
// widget editor (app.widget-editor.jsx, client-side, for live preview) both
// need it. Not a general templating engine — just enough to let a raw-HTML
// editor express "repeat this block per review" and "show this when there
// are none", so the widget's look can be customized without touching app
// code:
//
//   <!--ITEM--> ... {{stars}} {{title}} {{body}} {{author}} {{avatar}} {{verified}} ... <!--/ITEM-->
//   <!--EMPTY--> ... <!--/EMPTY-->
//   <!--MORE--> ... {{moreUrl}} {{moreCount}} ... <!--/MORE-->
//
// Everything outside those marker blocks may use {{averageStars}},
// {{averageValue}}, {{count}}, {{reviewWord}}, and {{rateWidget}} — the
// click-a-star-to-review control. {{rateWidget}} isn't build-your-own markup
// like the rest (jm-widget.js hooks it up by fixed class names), but it can
// be placed anywhere in the template, including inside <!--EMPTY-->, so a
// shopper can rate a product with zero reviews without leaving the page.
//
// <!--MORE--> renders only when the caller passed fewer `reviews` than the
// real `count` (apps.reviews.jsx only sends the first page's worth inline)
// and set `moreUrl` — the link to the full, paginated /apps/reviews/all
// page. {{moreCount}} is how many aren't shown inline.

export type WidgetReview = {
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string | null;
  verifiedBuyer?: boolean;
  customer?: { firstName: string | null; lastName: string | null } | null;
};

export type WidgetData = {
  count: number;
  average: number | null;
  reviews: WidgetReview[];
  moreUrl?: string | null;
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function starsMarkup(rating: number): string {
  const rounded = Math.round(rating);
  let s = "";
  for (let i = 1; i <= 5; i++) s += i <= rounded ? "★" : "☆";
  return s;
}

function authorFor(review: WidgetReview): string {
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

function avatarMarkup(review: WidgetReview): string {
  return `<span class="jm-reviews__item-avatar-initials">${escapeHtml(initialsFor(authorFor(review)))}</span>`;
}

function verifiedMarkup(review: WidgetReview): string {
  return review.verifiedBuyer ? `<span class="jm-reviews__item-verified-badge">✓ Verified buyer</span>` : "";
}

// Fixed markup for the inline "click a star, fill in a couple fields,
// submit — no page navigation" control. jm-widget.js finds it by these
// class/data names, wires up the click + submit handlers, and POSTs to the
// same /apps/reviews endpoint the widget already fetches from.
const RATE_WIDGET_HTML = `<div class="jm-rate" data-jm-rate>
  <div class="jm-rate__stars" data-jm-rate-stars>
    <button type="button" class="jm-rate__star" data-value="1">★</button>
    <button type="button" class="jm-rate__star" data-value="2">★</button>
    <button type="button" class="jm-rate__star" data-value="3">★</button>
    <button type="button" class="jm-rate__star" data-value="4">★</button>
    <button type="button" class="jm-rate__star" data-value="5">★</button>
  </div>
  <form class="jm-rate__form" data-jm-rate-form hidden>
    <input type="hidden" name="rating" data-jm-rate-value>
    <input type="text" name="authorName" placeholder="Your name (optional)" maxlength="100">
    <input type="text" name="title" placeholder="Title (optional)" maxlength="200">
    <textarea name="body" placeholder="Your review (optional)" maxlength="5000"></textarea>
    <button type="submit">Submit review</button>
  </form>
  <p class="jm-rate__thanks" data-jm-rate-thanks hidden>Thanks for your review!</p>
</div>`;

function extractBlock(html: string, tag: string): { content: string; withoutMarkers: (keep: boolean, replacement: string) => string } {
  const re = new RegExp(`<!--${tag}-->([\\s\\S]*?)<!--\\/${tag}-->`);
  const match = html.match(re);
  return {
    content: match ? match[1] : "",
    withoutMarkers: (keep, replacement) => html.replace(re, keep ? replacement : ""),
  };
}

function renderItem(template: string, review: WidgetReview): string {
  return template
    .replaceAll("{{stars}}", starsMarkup(review.rating))
    .replaceAll("{{title}}", review.title ? escapeHtml(review.title) : "")
    .replaceAll("{{body}}", review.body ? escapeHtml(review.body) : "")
    .replaceAll("{{author}}", escapeHtml(authorFor(review)))
    .replaceAll("{{avatar}}", avatarMarkup(review))
    .replaceAll("{{verified}}", verifiedMarkup(review));
}

export function renderWidgetHtml(template: string, data: WidgetData): string {
  const empty = extractBlock(template, "EMPTY");
  let out = empty.withoutMarkers(data.count === 0, empty.content);

  const item = extractBlock(out, "ITEM");
  // Wrapped regardless of what's saved in `template` — a merchant's raw
  // HTML never has to know about this div — so the whole list's layout
  // (stacked vs. a grid of columns) is stylable via the "list" style-block
  // target (styleCatalog.ts TARGETS) independently of any one card's style.
  // A plain block-display wrapper is a no-op for the default stacked look,
  // so this doesn't change existing storefronts until a merchant styles it.
  const itemsHtml = data.reviews.map((r) => renderItem(item.content, r)).join("");
  const wrappedItemsHtml = `<div class="jm-reviews__list" data-jm-block="list" data-jm-block-type="list">${itemsHtml}</div>`;
  out = item.withoutMarkers(data.count > 0, wrappedItemsHtml);

  const moreCount = data.count - data.reviews.length;
  const more = extractBlock(out, "MORE");
  out = more.withoutMarkers(moreCount > 0 && Boolean(data.moreUrl), more.content);

  return out
    .replaceAll("{{averageStars}}", starsMarkup(data.average ?? 0))
    .replaceAll("{{averageValue}}", data.average != null ? data.average.toFixed(1) : "0.0")
    .replaceAll("{{count}}", String(data.count))
    .replaceAll("{{reviewWord}}", data.count === 1 ? "review" : "reviews")
    .replaceAll("{{moreUrl}}", data.moreUrl ? escapeHtml(data.moreUrl) : "#")
    .replaceAll("{{moreCount}}", String(Math.max(moreCount, 0)))
    .replaceAll("{{rateWidget}}", RATE_WIDGET_HTML);
}
