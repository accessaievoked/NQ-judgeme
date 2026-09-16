// app/routes/app.products.$id.jsx
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { domain: session.shop } });

  if (!shop) {
    throw new Response("Not found", { status: 404 });
  }

  const product = await db.product.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: {
      variants: { orderBy: { title: "asc" } },
      reviewRequests: {
        orderBy: { createdAt: "desc" },
        include: { order: { select: { name: true } }, customer: true },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { customer: true },
      },
    },
  });

  if (!product) {
    throw new Response("Not found", { status: 404 });
  }

  return { product };
};

export default function ProductDetail() {
  const { product } = useLoaderData();

  return (
    <s-page heading={product.title}>
      <s-section heading="Overview">
        <s-link href="/app/settings">← Back to product management</s-link>

        <s-stack direction="inline" gap="base">
          {product.imageUrl ? (
            <s-thumbnail src={product.imageUrl} alt={product.title} size="large" />
          ) : null}
          <s-stack direction="block" gap="tight">
            <s-text>Shopify product ID: {product.shopifyId}</s-text>
            <s-text>Status: {product.status ?? "—"}</s-text>
            <s-text>Vendor: {product.vendor ?? "—"}</s-text>
            <s-text>{product.variants.length} variants</s-text>
          </s-stack>
        </s-stack>
      </s-section>

      {product.variants.length > 0 ? (
        <s-section heading="Variants">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Variant</s-table-header>
              <s-table-header listSlot="secondary">SKU</s-table-header>
              <s-table-header listSlot="secondary" format="currency">Price</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {product.variants.map((variant) => (
                <s-table-row key={variant.id}>
                  <s-table-cell>{variant.title ?? "—"}</s-table-cell>
                  <s-table-cell>{variant.sku ?? "—"}</s-table-cell>
                  <s-table-cell>{variant.price ?? "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      ) : null}

      <s-section heading={`Reviews (${product.reviews.length})`}>
        {product.reviews.length === 0 ? (
          <s-paragraph>
            No reviews yet — customers see this product's review form after
            clicking their review-request email link.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {product.reviews.map((review) => (
              <s-box key={review.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-stack direction="inline" gap="tight">
                    <s-text>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</s-text>
                    <s-badge>{review.status}</s-badge>
                    {review.verifiedBuyer ? <s-badge tone="success">Verified buyer</s-badge> : null}
                  </s-stack>
                  {review.title ? <s-text type="strong">{review.title}</s-text> : null}
                  {review.body ? <s-paragraph>{review.body}</s-paragraph> : null}
                  <s-text>
                    {review.authorName || review.customer?.firstName || "Anonymous"} —{" "}
                    {new Date(review.createdAt).toLocaleDateString()}
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading={`Review requests (${product.reviewRequests.length})`}>
        <s-paragraph>
          One row per order — the database won't allow more than one request
          per order/product/channel, so this list is also how to confirm
          there's no duplicate spam for a given order.
        </s-paragraph>

        {product.reviewRequests.length === 0 ? (
          <s-paragraph>
            No review requests yet — these are created automatically when an
            order containing this product is fulfilled.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Order</s-table-header>
              <s-table-header listSlot="secondary">Customer</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header listSlot="secondary">Scheduled</s-table-header>
              <s-table-header listSlot="secondary">Sent</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {product.reviewRequests.map((request) => (
                <s-table-row key={request.id}>
                  <s-table-cell>{request.order?.name ?? "—"}</s-table-cell>
                  <s-table-cell>{request.customer?.email ?? "—"}</s-table-cell>
                  <s-table-cell>{request.status}</s-table-cell>
                  <s-table-cell>
                    {request.scheduledAt
                      ? new Date(request.scheduledAt).toLocaleString()
                      : "—"}
                  </s-table-cell>
                  <s-table-cell>
                    {request.sentAt
                      ? new Date(request.sentAt).toLocaleString()
                      : "—"}
                  </s-table-cell>
                </s-table-row>
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
