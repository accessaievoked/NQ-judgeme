// app/routes/r.$token.jsx — public hosted review form, no Shopify auth. The
// primary "write a review" entry point (an emailed review-request link),
// unlike routes/apps.reviews.write.jsx (the no-token storefront/app-proxy
// fallback for a shopper landing directly from a theme block). Both now
// render the SAME per-shop template — ReviewFormTheme, edited from
// /app/review-form-editor — so a merchant's customization shows up
// everywhere a review can be submitted, not just one of the two entry
// points. The markup is injected raw (dangerouslySetInnerHTML, same
// {{token}}/<!--MARKER--> template as reviewFormTemplate.ts) and wired up
// client-side by fixed data-attributes/class names — same approach as
// apps.reviews.write.jsx's WIRE_SCRIPT/jm-write-review.js, just driven by a
// React effect + useFetcher instead of a plain <script>/fetch, so server
// validation errors and the submitted/already-submitted states still flow
// through React Router as before.
import { useEffect, useRef } from "react";
import { useFetcher, useLoaderData } from "react-router";
import db from "../db.server";
import { cancelReviewReminder, enqueueReviewThankYou } from "../queue.server";
import { invalidateReviewCache } from "../reviewWidget/reviewCache.server";
import { DEFAULT_REVIEW_FORM_HTML, renderReviewFormHtml } from "../reviewWidget/reviewFormTemplate";
import { WRITE_FORM_DEFAULT_CSS as DEFAULT_REVIEW_FORM_CSS } from "../reviewWidget/sections/writeForm";
import { compileReviewFormStyleBlocks } from "../reviewWidget/reviewFormStyleCompiler";

export const loader = async ({ params }) => {
  const reviewRequest = await db.reviewRequest.findUnique({
    where: { token: params.token },
    include: { product: true, shop: true, review: true },
  });

  if (!reviewRequest) {
    throw new Response("This review link is invalid or has expired.", { status: 404 });
  }

  const productTitle = reviewRequest.product?.title ?? "your order";
  const productImageUrl = reviewRequest.product?.imageUrl ?? null;
  const theme = await db.reviewFormTheme.findUnique({ where: { shopId: reviewRequest.shopId } });
  const formHtml = renderReviewFormHtml(theme?.html ?? DEFAULT_REVIEW_FORM_HTML, { productTitle, productImageUrl });
  const css = [theme?.css ?? DEFAULT_REVIEW_FORM_CSS, compileReviewFormStyleBlocks(theme?.styleBlocks)]
    .filter(Boolean)
    .join("\n\n");

  return {
    productTitle,
    shopName: reviewRequest.shop.domain,
    alreadySubmitted: Boolean(reviewRequest.review),
    formHtml,
    css,
  };
};

export const action = async ({ request, params }) => {
  const reviewRequest = await db.reviewRequest.findUnique({
    where: { token: params.token },
    include: { review: true, customer: true },
  });

  if (!reviewRequest) {
    throw new Response("This review link is invalid or has expired.", { status: 404 });
  }
  if (reviewRequest.review) {
    return { ok: true, alreadySubmitted: true };
  }

  const formData = await request.formData();
  const rating = Number(formData.get("rating"));
  const title = String(formData.get("title") || "").trim().slice(0, 200) || null;
  const body = String(formData.get("body") || "").trim().slice(0, 5000) || null;
  const typedName = String(formData.get("authorName") || "").trim().slice(0, 100) || null;
  const customerName = reviewRequest.customer
    ? [reviewRequest.customer.firstName, reviewRequest.customer.lastName].filter(Boolean).join(" ") || null
    : null;
  const authorName = customerName || typedName;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Please choose a star rating." };
  }
  if (!reviewRequest.productId) {
    return { ok: false, error: "This review link isn't tied to a product." };
  }

  const settings = await db.shopSettings.findUnique({
    where: { shopId: reviewRequest.shopId },
    select: { autoPublishEnabled: true, autoPublishMinRating: true },
  });
  const autoPublish = Boolean(settings?.autoPublishEnabled) && rating >= (settings?.autoPublishMinRating ?? 4);

  const review = await db.review.create({
    data: {
      shopId: reviewRequest.shopId,
      productId: reviewRequest.productId,
      reviewRequestId: reviewRequest.id,
      customerId: reviewRequest.customerId,
      rating,
      title,
      body,
      authorName,
      status: autoPublish ? "PUBLISHED" : "PENDING",
    },
  });

  if (autoPublish) await invalidateReviewCache(reviewRequest.shopId, reviewRequest.productId);

  await db.reviewRequest.update({
    where: { id: reviewRequest.id },
    data: { status: "COMPLETED", completedAt: new Date(), pendingReminderJobId: null },
  });

  // Best-effort — if this doesn't land (job already running, Redis blip),
  // processReviewReminder's own review/status check is the fallback that
  // stops the chain instead.
  if (reviewRequest.pendingReminderJobId) {
    await cancelReviewReminder(reviewRequest.pendingReminderJobId);
  }

  // Backgrounded: creates the vendor's thank-you discount (if that shop has
  // one turned on in /app/settings) and sends the thank-you email either
  // way. See reviewRequests/sendThankYou.server.ts.
  await enqueueReviewThankYou({ reviewId: review.id });

  return { ok: true, submitted: true };
};

const PAGE_STYLE = {
  fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif",
  maxWidth: 480,
  margin: "48px auto",
  padding: "0 20px",
  color: "#1a1a1a",
};

// Wires the injected template's star picker + submit — same fixed
// data-attributes/class names as apps.reviews.write.jsx's WIRE_SCRIPT (see
// reviewFormTemplate.ts's header comment for the full list) — but submits
// via the fetcher instead of a raw fetch, and shows the already-submitted
// state immediately on mount rather than only after a fresh POST.
function useWireReviewForm(containerRef, fetcher, alreadySubmitted) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    const form = root.querySelector("[data-jm-write-form]");
    const doneEl = root.querySelector("[data-jm-write-done]");
    if (!form) return undefined;

    if (alreadySubmitted) {
      form.hidden = true;
      if (doneEl) doneEl.hidden = false;
      return undefined;
    }

    const stars = root.querySelectorAll(".jm-write-review__star");
    const ratingInput = root.querySelector("[data-jm-write-rating]");
    const errorEl = root.querySelector("[data-jm-write-error]");

    function onStarClick(e) {
      const value = Number(e.currentTarget.getAttribute("data-value"));
      if (ratingInput) ratingInput.value = value;
      stars.forEach((s) => s.classList.toggle("is-selected", Number(s.getAttribute("data-value")) <= value));
    }
    stars.forEach((s) => s.addEventListener("click", onStarClick));

    function onSubmit(e) {
      e.preventDefault();
      if (!ratingInput?.value) {
        if (errorEl) {
          errorEl.textContent = "Please choose a star rating.";
          errorEl.hidden = false;
        }
        return;
      }
      if (errorEl) errorEl.hidden = true;
      const submitBtn = form.querySelector(".jm-write-review__submit");
      if (submitBtn) submitBtn.disabled = true;
      fetcher.submit(new FormData(form), { method: "POST" });
    }
    form.addEventListener("submit", onSubmit);

    return () => {
      stars.forEach((s) => s.removeEventListener("click", onStarClick));
      form.removeEventListener("submit", onSubmit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadySubmitted]);

  // Reflects the server action's result into the same injected elements —
  // hides the form and reveals the done block on success (including the
  // already-submitted race), or shows the error line otherwise.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !fetcher.data) return;
    const form = root.querySelector("[data-jm-write-form]");
    const doneEl = root.querySelector("[data-jm-write-done]");
    const errorEl = root.querySelector("[data-jm-write-error]");

    if (fetcher.data.ok) {
      if (form) form.hidden = true;
      if (doneEl) doneEl.hidden = false;
      return;
    }

    if (errorEl) {
      errorEl.textContent = fetcher.data.error || "Something went wrong — please try again.";
      errorEl.hidden = false;
    }
    const submitBtn = form?.querySelector(".jm-write-review__submit");
    if (submitBtn) submitBtn.disabled = false;
  }, [containerRef, fetcher.data]);
}

export default function ReviewForm() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const containerRef = useRef(null);
  useWireReviewForm(containerRef, fetcher, data.alreadySubmitted);

  return (
    <div style={PAGE_STYLE}>
      <p style={{ color: "#555", marginBottom: 16 }}>From {data.shopName}</p>
      <style>{data.css}</style>
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: data.formHtml }} />
    </div>
  );
}
