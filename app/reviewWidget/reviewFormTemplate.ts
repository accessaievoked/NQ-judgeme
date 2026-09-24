// Turns a merchant's raw HTML template for the "write a review" page
// (routes/apps.reviews.write.jsx) plus the product it's for into the final
// markup that route serves — the write-form counterpart to
// renderTemplate.ts's renderWidgetHtml. No .server suffix on purpose: the
// storefront renderer and the review-form builder's client-side preview
// (app.review-form-editor.jsx) both need it.
//
// Not a general templating engine — same philosophy as renderTemplate.ts:
//
//   <!--IMAGE--> ... {{productImageUrl}} ... <!--/IMAGE-->
//
// renders only when a product image is available; {{productTitle}} (raw
// title, empty string if none), {{productTitleSuffix}} (" for X" or "", for
// the post-submit thank-you line), and {{productTitleHeadingSuffix}} (" X" or
// " it", for "How was X?") are available anywhere else in the template.
//
// The form's functional attributes — data-jm-write-form, data-jm-write-error,
// data-jm-write-done, data-jm-write-rating, the .jm-write-review__star
// buttons' data-value, and .jm-write-review__submit — are NOT tokens: the
// star-picker/submit wiring (apps.reviews.write.jsx's WIRE_SCRIPT and the
// theme block's jm-write-review.js, which duplicates it since an injected
// <script> never executes) finds the form by these fixed names. A merchant
// can restyle or rearrange everything else freely, but removing/renaming one
// of those breaks the form — the review-form builder's raw-editor UI calls
// this out.
export type ReviewFormData = {
  productTitle: string | null;
  productImageUrl: string | null;
};

export function escapeHtml(str: string | null | undefined): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractBlock(html: string, tag: string): { content: string; withoutMarkers: (keep: boolean) => string } {
  const re = new RegExp(`<!--${tag}-->([\\s\\S]*?)<!--\\/${tag}-->`);
  const match = html.match(re);
  return {
    content: match ? match[1] : "",
    withoutMarkers: (keep) => html.replace(re, keep ? match?.[1] ?? "" : ""),
  };
}

export function renderReviewFormHtml(template: string, data: ReviewFormData): string {
  const image = extractBlock(template, "IMAGE");
  const out = image.withoutMarkers(Boolean(data.productImageUrl));

  return out
    .replaceAll("{{productTitle}}", escapeHtml(data.productTitle))
    .replaceAll("{{productImageUrl}}", escapeHtml(data.productImageUrl))
    .replaceAll("{{productTitleSuffix}}", data.productTitle ? ` for ${escapeHtml(data.productTitle)}` : "")
    .replaceAll("{{productTitleHeadingSuffix}}", data.productTitle ? ` ${escapeHtml(data.productTitle)}` : " it");
}

export const DEFAULT_REVIEW_FORM_HTML = `<div class="jm-write-review jm-reviews">
  <div data-jm-write-done hidden class="jm-write-review__done">
    <h2>Thanks for your review!</h2>
    <p>It's been submitted{{productTitleSuffix}}.</p>
  </div>
  <form data-jm-write-form>
    <h1 class="jm-write-review__heading">How was{{productTitleHeadingSuffix}}?</h1>
    <!--IMAGE--><img src="{{productImageUrl}}" alt="{{productTitle}}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;margin-bottom:16px;"><!--/IMAGE-->
    <p data-jm-write-error hidden class="jm-write-review__error"></p>
    <div class="jm-write-review__field">
      <span class="jm-write-review__label">Your rating</span>
      <div class="jm-write-review__stars">
        <input type="hidden" name="rating" data-jm-write-rating>
        <button type="button" class="jm-write-review__star" data-value="1">★</button>
        <button type="button" class="jm-write-review__star" data-value="2">★</button>
        <button type="button" class="jm-write-review__star" data-value="3">★</button>
        <button type="button" class="jm-write-review__star" data-value="4">★</button>
        <button type="button" class="jm-write-review__star" data-value="5">★</button>
      </div>
    </div>
    <label class="jm-write-review__field">
      <span class="jm-write-review__label">Title (optional)</span>
      <input class="jm-write-review__input" type="text" name="title" maxlength="200">
    </label>
    <label class="jm-write-review__field">
      <span class="jm-write-review__label">Your review (optional)</span>
      <textarea class="jm-write-review__textarea" name="body" rows="4" maxlength="5000"></textarea>
    </label>
    <label class="jm-write-review__field">
      <span class="jm-write-review__label">Your name (optional)</span>
      <input class="jm-write-review__input" type="text" name="authorName" maxlength="100">
    </label>
    <button type="submit" class="jm-write-review__submit">Submit review</button>
  </form>
</div>`;
