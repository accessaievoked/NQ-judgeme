// app/routes/app.reviews.jsx
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { reviews: [] };

  const reviews = await db.review.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    include: { product: true, customer: true },
  });

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
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const reviewId = String(formData.get("reviewId") || "");
  const status = String(formData.get("status") || "");
  const validStatuses = ["PENDING", "PUBLISHED", "HIDDEN", "SPAM", "REJECTED"];

  if (!reviewId || !validStatuses.includes(status)) {
    return { ok: false, error: "Invalid request" };
  }

  await db.review.update({
    where: { id: reviewId, shopId: shop.id },
    data: { status },
  });

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

export default function Reviews() {
  const { reviews } = useLoaderData();

  return (
    <s-page heading="Reviews">
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
