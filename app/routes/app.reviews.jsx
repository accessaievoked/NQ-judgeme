// app/routes/app.reviews.jsx
import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { invalidateReviewCache } from "../reviewWidget/reviewCache.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });

  if (!shop) return { reviews: [], products: [], totalReviews: 0 };

  const url = new URL(request.url);

  // Optional pagination controls
  const limitParam = Number(url.searchParams.get("limit"));
  const skipParam = Number(url.searchParams.get("skip"));

  // If no limit is supplied, keep the existing behaviour.
  const hasLimit = Number.isInteger(limitParam) && limitParam > 0;
  const limit = hasLimit ? Math.min(limitParam, 100) : undefined;
  const skip = Number.isInteger(skipParam) && skipParam >= 0 ? skipParam : 0;

  const reviewWhere = {
    shopId: shop.id,
  };

  const [reviews, products, totalReviews] = await Promise.all([
    db.review.findMany({
      where: reviewWhere,
      orderBy: { createdAt: "desc" },
      ...(limit !== undefined ? { take: limit } : {}),
      ...(skip > 0 ? { skip } : {}),
      include: {
        product: true,
        customer: true,
        images: { orderBy: { position: "asc" } },
      },
    }),

    db.product.findMany({
      where: { shopId: shop.id },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
      },
    }),

    db.review.count({
      where: reviewWhere,
    }),
  ]);

  return {
    reviews: reviews.map((r) => ({
      id: r.id,
      productTitle: r.product.title,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author:
        r.authorName ||
        r.customer?.firstName ||
        "Anonymous",
      status: r.status,
      createdAt: r.createdAt,
      images: r.images.map((i) => i.url),
      reply: r.reply,
      repliedAt: r.repliedAt,
    })),
    products,
    totalReviews,
    pagination: {
      limit: limit ?? totalReviews,
      skip,
      hasMore: limit !== undefined
        ? skip + reviews.length < totalReviews
        : false,
    },
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "setStatus");
  const validStatuses = ["PENDING", "PUBLISHED", "HIDDEN", "SPAM", "REJECTED"];

  if (intent === "create") {
    const productId = String(formData.get("productId") || "");
    const rating = Number(formData.get("rating"));
    const status = String(formData.get("status") || "PUBLISHED");

    if (!productId || !Number.isInteger(rating) || rating < 1 || rating > 5 || !validStatuses.includes(status)) {
      return { ok: false, intent, error: "Please pick a product and a 1–5 star rating." };
    }

    const product = await db.product.findUnique({ where: { id: productId, shopId: shop.id } });
    if (!product) return { ok: false, intent, error: "Product not found." };

    const title = String(formData.get("title") || "").trim().slice(0, 200) || null;
    const body = String(formData.get("body") || "").trim().slice(0, 5000) || null;
    const authorName = String(formData.get("authorName") || "").trim().slice(0, 100) || null;
    const verifiedBuyer = formData.get("verifiedBuyer") === "true";
    // One URL per line (or comma), same "paste a URL, up to a handful"
    // convention as Judge.me's own CSV import (its "Picture URLs" column) —
    // see app.import.jsx for the bulk path this mirrors.
    const images = parseImageUrls(String(formData.get("images") || ""));

    await db.review.create({
      data: {
        shopId: shop.id,
        productId,
        rating,
        title,
        body,
        authorName,
        verifiedBuyer,
        status,
        images: images.length ? { create: images.map((url, position) => ({ url, position })) } : undefined,
      },
    });

    if (status === "PUBLISHED") await invalidateReviewCache(shop.id, productId);

    return { ok: true, intent };
  }

  if (intent === "reply") {
    const reviewId = String(formData.get("reviewId") || "");
    const reply = String(formData.get("reply") || "").trim().slice(0, 5000);
    if (!reviewId) return { ok: false, intent, error: "Invalid request" };

    await db.review.update({
      where: { id: reviewId, shopId: shop.id },
      // Clearing the textarea and saving removes the reply (repliedAt reset
      // to null too) rather than persisting an empty string as "replied".
      data: { reply: reply || null, repliedAt: reply ? new Date() : null },
    });

    return { ok: true, intent, reviewId };
  }

  const reviewId = String(formData.get("reviewId") || "");
  const status = String(formData.get("status") || "");

  if (!reviewId || !validStatuses.includes(status)) {
    return { ok: false, error: "Invalid request" };
  }

  const review = await db.review.update({
    where: { id: reviewId, shopId: shop.id },
    data: { status },
  });

  // Either direction can matter to the cached published list: publishing
  // adds a row that should now show up, hiding/rejecting/spam-ing removes
  // one that was showing before.
  await invalidateReviewCache(shop.id, review.productId);

  return { ok: true, reviewId };
};

// Splits on newlines or commas, trims, drops blanks, caps at 5 — same limit
// Judge.me's own CSV import documents for its "Picture URLs" column.
function parseImageUrls(raw) {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
}

const STATUSES = ["PENDING", "PUBLISHED", "HIDDEN", "SPAM", "REJECTED"];

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function ReviewRow({ review }) {
  // s-button is a custom element — the browser doesn't reliably treat it as
  // the form's "submitter", so name/value on it never reaches the server.
  // Submit explicitly instead of relying on that.
  const fetcher = useFetcher();
  const replyFetcher = useFetcher();
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState(review.reply || "");

  const setStatus = (status) =>
    fetcher.submit({ reviewId: review.id, status }, { method: "POST" });

  const saveReply = () => {
    replyFetcher.submit({ intent: "reply", reviewId: review.id, reply: replyText }, { method: "POST" });
    setReplying(false);
  };

  return (
    <s-table-row>
        <s-table-cell>
          {review.images[0] ? (
            <img src={review.images[0]} alt="" className="jm-review-thumb" />
          ) : (
            <span className="jm-review-thumb jm-review-thumb--empty" aria-hidden="true">—</span>
          )}
          {review.images.length > 1 ? <div className="jm-review-thumb-count">+{review.images.length - 1}</div> : null}
        </s-table-cell>
        <s-table-cell>{review.productTitle}</s-table-cell>
        <s-table-cell>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</s-table-cell>
        <s-table-cell>{review.title || review.body?.slice(0, 60) || "—"}</s-table-cell>
        <s-table-cell>{review.author}</s-table-cell>
        <s-table-cell>{timeAgo(review.createdAt)}</s-table-cell>
        <s-table-cell>
          <select
            className="jm-status-select"
            value={review.status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={`Status for review by ${review.author}`}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </s-table-cell>
        <s-table-cell>
          {replying ? (
            // Kept inside this one cell (not a spanned extra row) since
            // s-table-cell's Polaris web component doesn't reliably honor a
            // plain HTML colSpan attribute — this avoids depending on that.
            <div className="jm-reply-box">
              <textarea
                className="jm-admin-field__input"
                rows={2}
                maxLength={5000}
                placeholder="Write a public reply…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              ></textarea>
              <s-stack direction="inline" gap="tight">
                <s-button variant="primary" onClick={saveReply}>Save</s-button>
                <s-button variant="tertiary" onClick={() => setReplying(false)}>Cancel</s-button>
              </s-stack>
            </div>
          ) : (
            <s-button variant={review.reply ? "primary" : "tertiary"} onClick={() => setReplying(true)}>
              {review.reply ? "Edit reply" : "Reply"}
            </s-button>
          )}
        </s-table-cell>
    </s-table-row>
  );
}

// Same field set apps.reviews.write.jsx's public form and r.$token.jsx's
// emailed form collect — this is the third way a review can be created, for
// when a merchant needs one on the record without a shopper submitting it
// themselves (imported from another platform, a seed review before launch,
// etc.). Plain native <select>/<input> for the same reason
// app.widget-editor.jsx's Field/NativeSelect use them over the Polaris web
// components: reliable controlled-value updates outside the real embedded
// admin runtime.
function AddReviewForm({ products }) {
  const fetcher = useFetcher();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [rating, setRating] = useState(5);
  const [status, setStatus] = useState("PUBLISHED");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [verifiedBuyer, setVerifiedBuyer] = useState(false);
  const [images, setImages] = useState("");

  const submitting = fetcher.state !== "idle";
  const error = fetcher.data?.intent === "create" && !fetcher.data.ok ? fetcher.data.error : null;

  // Only clear the free-text fields once the server actually confirms
  // success — clearing on click regardless would wipe out what the merchant
  // typed the moment a validation error came back, forcing them to retype it.
  const [lastResult, setLastResult] = useState(null);
  if (fetcher.data && fetcher.data.intent === "create" && fetcher.data !== lastResult) {
    setLastResult(fetcher.data);
    if (fetcher.data.ok) {
      setTitle("");
      setBody("");
      setAuthorName("");
      setVerifiedBuyer(false);
      setImages("");
    }
  }

  const submit = () => {
    fetcher.submit(
      { intent: "create", productId, rating: String(rating), status, title, body, authorName, verifiedBuyer: String(verifiedBuyer), images },
      { method: "POST" },
    );
  };

  return (
    <s-section heading="Add a review manually">
      {products.length === 0 ? (
        <s-paragraph>Sync at least one product before adding a review by hand.</s-paragraph>
      ) : (
        <s-stack direction="block" gap="base">
          {error ? <s-banner tone="critical">{error}</s-banner> : null}
          <s-stack direction="inline" gap="base">
            <label className="jm-admin-field">
              <span className="jm-admin-field__label">Product</span>
              <select className="jm-admin-field__input" value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
            <label className="jm-admin-field">
              <span className="jm-admin-field__label">Rating</span>
              <select className="jm-admin-field__input" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{"★".repeat(n)}{"☆".repeat(5 - n)}</option>
                ))}
              </select>
            </label>
            <label className="jm-admin-field">
              <span className="jm-admin-field__label">Status</span>
              <select className="jm-admin-field__input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {["PUBLISHED", "PENDING", "HIDDEN", "SPAM", "REJECTED"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </s-stack>

          <label className="jm-admin-field">
            <span className="jm-admin-field__label">Author name (optional)</span>
            <input className="jm-admin-field__input" type="text" maxLength={100} value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
          </label>
          <label className="jm-admin-field">
            <span className="jm-admin-field__label">Title (optional)</span>
            <input className="jm-admin-field__input" type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="jm-admin-field">
            <span className="jm-admin-field__label">Review text (optional)</span>
            <textarea className="jm-admin-field__input" rows={3} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)}></textarea>
          </label>
          <label className="jm-admin-field">
            <span className="jm-admin-field__label">Photo URLs (optional — one per line, up to 5)</span>
            <textarea
              className="jm-admin-field__input"
              rows={2}
              placeholder={"https://.../photo1.jpg\nhttps://.../photo2.jpg"}
              value={images}
              onChange={(e) => setImages(e.target.value)}
            ></textarea>
          </label>
          <label className="jm-admin-checkbox">
            <input type="checkbox" checked={verifiedBuyer} onChange={(e) => setVerifiedBuyer(e.target.checked)} />
            <span>Mark as a verified buyer</span>
          </label>

          <s-button variant="primary" disabled={submitting} onClick={submit}>
            {submitting ? "Adding…" : "Add review"}
          </s-button>
        </s-stack>
      )}
    </s-section>
  );
}

export default function Reviews() {
  const { reviews, products } = useLoaderData();

  return (
    <s-page heading="Reviews">
      <style>{`
        .jm-admin-field { display: block; min-width: 160px; flex: 1; }
        .jm-admin-field__label { display: block; font-size: 12px; color: #4a4a4a; margin-bottom: 4px; }
        .jm-admin-field__input {
          display: block; width: 100%; box-sizing: border-box; font: inherit; font-size: 13px;
          padding: 7px 10px; border: 1px solid #c9cccf; border-radius: 6px; background: #fff; color: #1a1a1a;
        }
        .jm-admin-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .jm-review-thumb {
          width: 36px; height: 36px; border-radius: 6px; object-fit: cover; display: block;
          background: #f1f1f1; border: 1px solid #e1e1e1;
        }
        .jm-review-thumb--empty {
          display: flex; align-items: center; justify-content: center; color: #999; font-size: 12px;
        }
        .jm-review-thumb-count {
          font-size: 11px; color: #666; margin-top: 2px; text-align: center;
        }
        .jm-status-select {
          font: inherit; font-size: 13px; padding: 6px 8px; border: 1px solid #c9cccf;
          border-radius: 6px; background: #fff; color: #1a1a1a; cursor: pointer;
        }
        .jm-reply-box { min-width: 220px; }
      `}</style>

      <AddReviewForm products={products} />

      <s-section heading={`${reviews.length} review${reviews.length === 1 ? "" : "s"}`}>
        <s-paragraph>
          Already have reviews on another platform? <s-link href="/app/import">Import them</s-link>.
        </s-paragraph>
        {reviews.length === 0 ? (
          <s-paragraph>No reviews submitted yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Photo</s-table-header>
              <s-table-header listSlot="secondary">Product</s-table-header>
              <s-table-header listSlot="secondary">Rating</s-table-header>
              <s-table-header listSlot="secondary">Review</s-table-header>
              <s-table-header listSlot="secondary">Author</s-table-header>
              <s-table-header listSlot="secondary">Created</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header listSlot="secondary">Reply</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {reviews.map((review) => (
                <ReviewRow key={review.id} review={review} />
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
