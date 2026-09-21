// app/routes/apps.reviews.write.jsx — Shopify app proxy target
// (/apps/reviews/write on the storefront domain). A public, no-token
// "write a review" page/fragment for a shopper landing on it directly from
// the storefront (not via an emailed /r/:token link) — reached either as a
// full page (linked from anywhere) or fetched as an HTML fragment and
// injected inline by the "Write a review" theme block
// (extensions/theme-widget/assets/jm-write-review.js), same pattern
// apps.reviews.jsx/jm-widget.js use for the read-only list.
//
// Styling: see reviewWidget/sections/writeForm.ts's header comment for why
// this deliberately does NOT use the shop's saved WidgetTheme.css (that's
// the review-*list* widget's raw-HTML coder mode, a different template, and
// using it here would mean any shop that saved before this feature existed
// gets a completely unstyled form). Customizations still go through the
// exact same WidgetTheme.styleBlocks + compileStyleBlocks pipeline as
// everything else — just layered on top of this page's own always-fresh
// base CSS instead of on top of a potentially stale saved blob.
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { compileStyleBlocks } from "../reviewWidget/styleBlocks.server";
import { WRITE_FORM_DEFAULT_CSS } from "../reviewWidget/sections/writeForm";
import { invalidateReviewCache } from "../reviewWidget/reviewCache.server";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Wires up the star picker + fetch-based submit for the form fragment
// below. Kept as one string so both response modes can use it: a full-page
// response inlines it directly (executes normally, part of the initial
// document); the fragment response can't do that (a <script> injected via
// innerHTML never runs), so the theme block's own static asset
// (jm-write-review.js) carries an equivalent copy instead — see that file's
// header comment.
const WIRE_SCRIPT = `
(function () {
  // Not document.currentScript.closest(...) — the script tag is a sibling
  // of the form, not nested inside it (see pageHtml below), so that would
  // always miss. Only one write-review form ever exists per page.
  var root = document.querySelector('.jm-write-review');
  if (!root) return;
  var stars = root.querySelectorAll('.jm-write-review__star');
  var ratingInput = root.querySelector('[data-jm-write-rating]');
  var form = root.querySelector('[data-jm-write-form]');
  var errorEl = root.querySelector('[data-jm-write-error]');
  var doneEl = root.querySelector('[data-jm-write-done]');

  stars.forEach(function (star) {
    star.addEventListener('click', function () {
      var value = Number(star.getAttribute('data-value'));
      ratingInput.value = value;
      stars.forEach(function (s) {
        s.classList.toggle('is-selected', Number(s.getAttribute('data-value')) <= value);
      });
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!ratingInput.value) {
      if (errorEl) { errorEl.textContent = 'Please choose a star rating.'; errorEl.hidden = false; }
      return;
    }
    if (errorEl) errorEl.hidden = true;
    var submitBtn = form.querySelector('.jm-write-review__submit');
    if (submitBtn) submitBtn.disabled = true;
    fetch(window.location.pathname + window.location.search, { method: 'POST', body: new FormData(form) })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'Submit failed');
        form.hidden = true;
        if (doneEl) doneEl.hidden = false;
      })
      .catch(function (err) {
        if (errorEl) { errorEl.textContent = err.message || 'Something went wrong — please try again.'; errorEl.hidden = false; }
        if (submitBtn) submitBtn.disabled = false;
      });
  });
})();
`;

function formHtml({ productTitle, productImageUrl }) {
  return `<div class="jm-write-review jm-reviews">
  <div data-jm-write-done hidden class="jm-write-review__done">
    <h2>Thanks for your review!</h2>
    <p>It's been submitted${productTitle ? ` for ${escapeHtml(productTitle)}` : ""}.</p>
  </div>
  <form data-jm-write-form>
    <h1 class="jm-write-review__heading">How was${productTitle ? ` ${escapeHtml(productTitle)}` : " it"}?</h1>
    ${productImageUrl ? `<img src="${escapeHtml(productImageUrl)}" alt="${escapeHtml(productTitle || "")}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;margin-bottom:16px;">` : ""}
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
}

function pageHtml({ productTitle, productImageUrl, css }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Write a review${productTitle ? ` — ${escapeHtml(productTitle)}` : ""}</title>
<style>
  body { margin: 0; padding: 24px 16px 48px; font-family: -apple-system, system-ui, sans-serif; color: #1a1a1a; background: #fff; }
  ${css}
</style>
</head>
<body>
${formHtml({ productTitle, productImageUrl })}
<script>${WIRE_SCRIPT}</script>
</body>
</html>`;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const fragment = url.searchParams.get("fragment") === "1";

  const notFound = () =>
    fragment
      ? new Response(`<p class="jm-write-review__error">This product can't be reviewed here.</p>`, { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 404 })
      : new Response(pageHtml({ productTitle: null, productImageUrl: null, css: WRITE_FORM_DEFAULT_CSS }), { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 404 });

  if (!session || !productId) return notFound();

  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  const product = shop
    ? await db.product.findUnique({
        where: { shopId_shopifyId: { shopId: shop.id, shopifyId: `gid://shopify/Product/${productId}` } },
      })
    : null;
  if (!shop || !product) return notFound();

  const theme = shop ? await db.widgetTheme.findUnique({ where: { shopId: shop.id } }) : null;
  const css = [WRITE_FORM_DEFAULT_CSS, compileStyleBlocks(theme?.styleBlocks)].filter(Boolean).join("\n\n");

  if (fragment) {
    // A <style> tag (unlike <script>) applies its CSS fine even when set via
    // innerHTML, so the embedded theme-block path (jm-write-review.js) can
    // just inject this fragment as-is with no separate CSS-fetch step.
    const html = `<style>${css}</style>${formHtml({ productTitle: product.title, productImageUrl: product.imageUrl })}`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  return new Response(pageHtml({ productTitle: product.title, productImageUrl: product.imageUrl, css }), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

export const action = async ({ request }) => {
  if (request.method !== "POST") return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });

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

  // Anonymous, same as the inline {{rateWidget}} path (apps.reviews.jsx) —
  // no email is collected here either, so there's no customer to link and
  // no thank-you email to send (sendReviewThankYouEmail already no-ops
  // without one; skipping the enqueue entirely avoids a pointless job).
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

  if (autoPublish) await invalidateReviewCache(shop.id, product.id);

  return Response.json({ ok: true, published: autoPublish });
};
