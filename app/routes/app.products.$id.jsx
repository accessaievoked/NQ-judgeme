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
    include: { variants: { orderBy: { title: "asc" } } },
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
        <s-link href="/app/products">← Back to products</s-link>

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

      <s-section heading="Reviews">
        <s-paragraph>
          Reviews aren't collected yet. Once the review system ships, this
          section will show the review list, aggregate rating, and widget
          preview for this product.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
