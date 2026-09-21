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
  if (!shop) return { reviews: [], products: [] };

  const [reviews, products] = await Promise.all([
    db.review.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      include: { product: true, customer: true },
    }),
    // For the "Add a review" product picker below — a merchant filling one
    // in by hand (a review from another channel, a pre-launch seed review,
    // ...) needs to pick which product it's for, same as a real storefront
    // submission is tied to one.
    db.product.findMany({ where: { shopId: shop.id }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);

  return {
    reviews: reviews.map((r) => ({
      id: r.id,
      productTitle: r.product.title,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: r.authorName || r.customer?.firstName || "Anonymous",
      status: r.status,
      createdAt: r.createdAt,
    })),
    products,
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

    await db.review.create({
      data: { shopId: shop.id, productId, rating, title, body, authorName, verifiedBuyer, status },
    });

    if (status === "PUBLISHED") await invalidateReviewCache(shop.id, productId);

    return { ok: true, intent };
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

const STATUS_TONE = { PENDING: undefined, PUBLISHED: "success", HIDDEN: "warning", SPAM: "critical", REJECTED: "critical" };

function ReviewRow({ review }) {
  // s-button is a custom element — the browser doesn't reliably treat it as
  // the form's "submitter", so name/value on it never reaches the server.
  // Submit explicitly instead of relying on that.
  const fetcher = useFetcher();
  const setStatus = (status) =>
    fetcher.submit({ reviewId: review.id, status }, { method: "POST" });

  return (
    <s-table-row>
      <s-table-cell>{review.productTitle}</s-table-cell>
      <s-table-cell>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</s-table-cell>
      <s-table-cell>{review.title || review.body?.slice(0, 60) || "—"}</s-table-cell>
      <s-table-cell>{review.author}</s-table-cell>
      <s-table-cell>
        <s-badge tone={STATUS_TONE[review.status]}>{review.status}</s-badge>
      </s-table-cell>
      <s-table-cell>
        <s-stack direction="inline" gap="tight">
          <s-button onClick={() => setStatus("PUBLISHED")}>Publish</s-button>
          <s-button onClick={() => setStatus("HIDDEN")}>Hide</s-button>
        </s-stack>
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
    }
  }

  const submit = () => {
    fetcher.submit(
      { intent: "create", productId, rating: String(rating), status, title, body, authorName, verifiedBuyer: String(verifiedBuyer) },
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
      `}</style>

      <AddReviewForm products={products} />

      <s-section heading={`${reviews.length} review${reviews.length === 1 ? "" : "s"}`}>
        {reviews.length === 0 ? (
          <s-paragraph>No reviews submitted yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="secondary">Rating</s-table-header>
              <s-table-header listSlot="secondary">Review</s-table-header>
              <s-table-header listSlot="secondary">Author</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header listSlot="secondary">Actions</s-table-header>
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
