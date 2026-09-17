// Turns a merchant's raw HTML/CSS template plus review data into the final
// markup the storefront widget injects as-is. Not a general templating
// engine — just enough to let a raw-HTML editor express "repeat this block
// per review" and "show this when there are none", so the widget's look can
// be customized without touching app code:
//
//   <!--ITEM--> ... {{stars}} {{title}} {{body}} {{author}} ... <!--/ITEM-->
//   <!--EMPTY--> ... <!--/EMPTY-->
//
// Everything outside those marker blocks may use {{averageStars}},
// {{averageValue}}, {{count}}, {{reviewWord}}, and {{rateWidget}} — the
// click-a-star-to-review control. {{rateWidget}} isn't build-your-own markup
// like the rest (jm-widget.js hooks it up by fixed class names), but it can
// be placed anywhere in the template, including inside <!--EMPTY-->, so a
// shopper can rate a product with zero reviews without leaving the page.

export type WidgetReview = {
  rating: number;
  title: string | null;
  body: string | null;
  authorName: string | null;
  customer?: { firstName: string | null; lastName: string | null } | null;
};

export type WidgetData = {
  count: number;
  average: number | null;
  reviews: WidgetReview[];
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
    .replaceAll("{{author}}", escapeHtml(authorFor(review)));
}

export function renderWidgetHtml(template: string, data: WidgetData): string {
  const empty = extractBlock(template, "EMPTY");
  let out = empty.withoutMarkers(data.count === 0, empty.content);

  const item = extractBlock(out, "ITEM");
  const itemsHtml = data.reviews.map((r) => renderItem(item.content, r)).join("");
  out = item.withoutMarkers(data.count > 0, itemsHtml);

  return out
    .replaceAll("{{averageStars}}", starsMarkup(data.average ?? 0))
    .replaceAll("{{averageValue}}", data.average != null ? data.average.toFixed(1) : "0.0")
    .replaceAll("{{count}}", String(data.count))
    .replaceAll("{{reviewWord}}", data.count === 1 ? "review" : "reviews")
    .replaceAll("{{rateWidget}}", RATE_WIDGET_HTML);
}
