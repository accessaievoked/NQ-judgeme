// Template + renderer for the "star rating + review count" summary badge
// (RatingSummaryTheme) — the lightweight sibling of renderTemplate.ts's full
// review-list widget. No .server suffix on purpose: both the storefront
// renderer (routes/apps.reviews.summary.jsx) and the admin editor's
// client-side live preview (routes/app.rating-summary-editor.jsx) need it.
//
// Tokens available anywhere in the template: {{averageStars}} (plain ★☆
// string), {{averageValue}} ("4.5"), {{count}}, {{reviewWord}} ("review" or
// "reviews"), {{countText}} (the shop's configured count phrase, already
// token-filled — e.g. "(12 reviews)" or "" if the shop turned count display
// off). Filled/empty stars get their own class so "blocks" mode can color
// them independently (RatingSummaryTheme.starColor/emptyStarColor).
import { escapeHtml } from "./renderTemplate";

export type RatingSummaryData = { count: number; average: number | null };

export type RatingSummaryFields = {
  starColor: string;
  emptyStarColor: string;
  textColor: string;
  fontSize: number;
  align: "left" | "center" | "right";
  showCount: boolean;
  countText: string;
};

export const DEFAULT_RATING_SUMMARY_FIELDS: RatingSummaryFields = {
  starColor: "#f5a623",
  emptyStarColor: "#d9d9d9",
  textColor: "#6b6b6b",
  fontSize: 14,
  align: "left",
  showCount: true,
  countText: "({{count}} {{reviewWord}})",
};

function starSpansMarkup(rating: number): string {
  const rounded = Math.round(rating);
  let out = "";
  for (let i = 1; i <= 5; i++) {
    const filled = i <= rounded;
    out += `<span class="jm-rating-summary__star jm-rating-summary__star--${filled ? "filled" : "empty"}">${filled ? "★" : "☆"}</span>`;
  }
  return out;
}

export const DEFAULT_RATING_SUMMARY_HTML = `<div class="jm-rating-summary" data-jm-rating-summary>
  <span class="jm-rating-summary__stars">{{averageStars}}</span>
  <span class="jm-rating-summary__count">{{countText}}</span>
</div>`;

export function ratingSummaryCss(fields: RatingSummaryFields): string {
  const justify = fields.align === "center" ? "center" : fields.align === "right" ? "flex-end" : "flex-start";
  return `.jm-rating-summary {
  display: flex;
  align-items: center;
  justify-content: ${justify};
  gap: 6px;
  font-family: inherit;
  font-size: ${fields.fontSize}px;
}
.jm-rating-summary__stars { letter-spacing: 1px; }
.jm-rating-summary__star--filled { color: ${fields.starColor}; }
.jm-rating-summary__star--empty { color: ${fields.emptyStarColor}; }
.jm-rating-summary__count {
  color: ${fields.textColor};
  ${fields.showCount ? "" : "display: none;"}
}`;
}

// Blocks-mode "compile" — regenerates the stored html/css columns from the
// structured fields so the storefront renderer never has to know about
// modes at all, it just renders whatever's in html/css (see the model's
// header comment in schema.prisma).
export function compileRatingSummaryTheme(fields: RatingSummaryFields): { html: string; css: string } {
  return { html: DEFAULT_RATING_SUMMARY_HTML, css: ratingSummaryCss(fields) };
}

export function renderRatingSummaryHtml(template: string, data: RatingSummaryData, countTextTemplate = DEFAULT_RATING_SUMMARY_FIELDS.countText): string {
  const countText = countTextTemplate
    .replaceAll("{{count}}", String(data.count))
    .replaceAll("{{reviewWord}}", data.count === 1 ? "review" : "reviews")
    .replaceAll("{{averageValue}}", data.average != null ? data.average.toFixed(1) : "0.0");

  return template
    .replaceAll("{{averageStars}}", starSpansMarkup(data.average ?? 0))
    .replaceAll("{{averageValue}}", data.average != null ? data.average.toFixed(1) : "0.0")
    .replaceAll("{{count}}", String(data.count))
    .replaceAll("{{reviewWord}}", data.count === 1 ? "review" : "reviews")
    .replaceAll("{{countText}}", escapeHtml(countText));
}
